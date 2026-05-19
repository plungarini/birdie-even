import { CACHE_TTL, cacheGet, cacheKey, cacheSet } from './cache';

const XC_BASE = 'https://xeno-canto.org/api/3';
const CACHE_VERSION = 7;
const TARGET_COUNT = 10;
const PER_PAGE = 50;

const PRIORITY_TYPES = [
	'song',
	'call',
	'flight call',
	'alarm call',
	'begging call',
] as const;

interface XenoCantoRecording {
	id: string;
	file: string;
	'file-name'?: string;
	type: string;
	length: string;
	cnt: string;
	loc: string;
	rec: string;
	lic: string;
	date: string;
}

interface XenoCantoResponse {
	numRecordings: string;
	recordings: XenoCantoRecording[];
}

export interface NormalizedRecording {
	id: string;
	audioUrl: string;
	types: string[];
	lengthSeconds: number | null;
	country: string | null;
	location: string | null;
	recordist: string;
	license: string;
	date: string | null;
}

function parseLengthSeconds(raw: string): number | null {
	const parts = raw.split(':').map((p) => parseInt(p, 10));
	if (parts.some((n) => !Number.isFinite(n))) return null;
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	return null;
}

function primaryType(raw: string): string {
	return raw.split(',')[0]?.trim().toLowerCase() ?? '';
}

function fileExtension(r: XenoCantoRecording): string | null {
	const name = r['file-name'];
	if (name) {
		const m = name.match(/\.(\w+)$/);
		if (m) return m[1].toLowerCase();
	}
	const m = r.file.match(/\.(\w+)(?:\?|$)/);
	return m ? m[1].toLowerCase() : null;
}

function bucketByPrimaryType(
	recordings: XenoCantoRecording[],
): Map<string, XenoCantoRecording[]> {
	const buckets = new Map<string, XenoCantoRecording[]>();
	const seen = new Set<string>();

	for (const r of recordings) {
		if (seen.has(r.id)) continue;
		seen.add(r.id);

		const ext = fileExtension(r);
		if (ext !== 'mp3') {
			console.log(
				`[birdie-proxy] FILTERED id=${r.id} ext=${ext ?? '(unknown)'}`,
			);
			continue;
		}

		const key = primaryType(r.type);
		if (!key) continue;
		const list = buckets.get(key);
		if (list) list.push(r);
		else buckets.set(key, [r]);
	}

	return buckets;
}

function selectWithSpread(
	buckets: Map<string, XenoCantoRecording[]>,
): XenoCantoRecording[] {
	const priorityOrder = PRIORITY_TYPES.filter((p) => buckets.has(p));
	const otherOrder = [...buckets.keys()]
		.filter((k) => !(PRIORITY_TYPES as readonly string[]).includes(k))
		.sort();
	const bucketOrder = [...priorityOrder, ...otherOrder];

	const selected: XenoCantoRecording[] = [];
	while (selected.length < TARGET_COUNT) {
		let pickedThisPass = false;
		for (const key of bucketOrder) {
			if (selected.length >= TARGET_COUNT) break;
			const next = buckets.get(key)?.shift();
			if (next) {
				selected.push(next);
				pickedThisPass = true;
			}
		}
		if (!pickedThisPass) break;
	}
	return selected;
}

/** Build audio URL for the client through the Worker proxy. */
function buildAudioUrl(r: XenoCantoRecording, origin: string): string {
	return `${origin}/xc/audio/${r.id}`;
}

function normalize(r: XenoCantoRecording, origin: string): NormalizedRecording {
	const audioUrl = buildAudioUrl(r, origin);
	return {
		id: r.id,
		audioUrl,
		types: r.type
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		lengthSeconds: parseLengthSeconds(r.length),
		country: r.cnt || null,
		location: r.loc || null,
		recordist: r.rec,
		license: r.lic,
		date: r.date || null,
	};
}

/**
 * Fetch quality-A recordings for a species, bucket by primary type, and
 * round-robin select up to 10 for maximum variety. Returned URLs point to
 * the Worker's own /xc/* proxy routes, not directly to xeno-canto.
 */
export async function fetchXenoCantoRecordings(
	scientificName: string,
	apiKey: string,
	origin: string,
	abortSignal?: AbortSignal,
): Promise<{
	recordings: NormalizedRecording[];
	numRecordings: number;
} | null> {
	// Include CACHE_VERSION so code changes (format filtering, URL format) force
	// a fresh fetch instead of serving stale cached responses.
	const key = cacheKey(
		'xeno-canto',
		'recordings',
		String(CACHE_VERSION),
		origin,
		scientificName,
	);
	const cached = await cacheGet<{
		recordings: NormalizedRecording[];
		numRecordings: number;
	}>(key);
		if (cached) {
		console.log(
			`[birdie-proxy] XC recordings cache HIT for ${scientificName}, ${cached.recordings.length} recordings`,
		);
		return cached;
	}

	const url =
		`${XC_BASE}/recordings` +
		`?query=sp:"${encodeURIComponent(scientificName)}"+q:A` +
		`&per_page=${PER_PAGE}` +
		`&key=${apiKey}`;

	try {
		const res = await fetch(url, { signal: abortSignal });

		if (!res.ok) {
			if (res.status === 404) {
				const empty = { recordings: [], numRecordings: 0 };
				await cacheSet(key, empty, CACHE_TTL.negative);
				return empty;
			}
			if (res.status === 401 || res.status === 403 || res.status === 429) {
				return null;
			}
			if (res.status >= 500) {
				await cacheSet(key, null, CACHE_TTL.upstreamError);
				return null;
			}
			return null;
		}

		const data = (await res.json()) as XenoCantoResponse;
		const total = parseInt(data.numRecordings, 10) || 0;

		const buckets = bucketByPrimaryType(data.recordings ?? []);
		const selected = selectWithSpread(buckets);
		const recordings = selected.map((r) => normalize(r, origin));

		const result = { recordings, numRecordings: total };
		await cacheSet(key, result, CACHE_TTL.xenoCanto);
		return result;
	} catch {
		return null;
	}
}
