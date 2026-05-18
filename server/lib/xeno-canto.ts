import { cacheGet, cacheKey, cacheSet, CACHE_TTL } from './cache';

const XC_BASE = 'https://xeno-canto.org/api/3';

interface XenoCantoRecording {
	id: string;
	file: string;
	sono: { med: string } | null;
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

const TYPE_PRIORITY: Record<string, number> = {
	song: 0,
	call: 1,
	'flight call': 2,
	'alarm call': 3,
	'begging call': 4,
};

function parseTypePriority(types: string[]): number {
	for (const t of types) {
		const key = t.toLowerCase().trim();
		if (key in TYPE_PRIORITY) return TYPE_PRIORITY[key];
	}
	return 999;
}

function parseLengthSeconds(raw: string): number | null {
	const parts = raw.split(':');
	if (parts.length === 2) {
		const m = parseInt(parts[0], 10);
		const s = parseInt(parts[1], 10);
		if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
	}
	return null;
}

export interface NormalizedRecording {
	id: string;
	audioUrl: string;
	spectrogramUrl: string | null;
	types: string[];
	lengthSeconds: number | null;
	country: string | null;
	location: string | null;
	recordist: string;
	license: string;
	date: string | null;
}

export async function fetchXenoCantoRecordings(
	scientificName: string,
	apiKey: string,
	abortSignal?: AbortSignal,
): Promise<{ recordings: NormalizedRecording[]; numRecordings: number } | null> {
	const key = cacheKey('xeno-canto', 'recordings', scientificName);
	const cached = await cacheGet<{ recordings: NormalizedRecording[]; numRecordings: number }>(key);
	if (cached) return cached;

	const url = `${XC_BASE}/recordings?query=sp:"${encodeURIComponent(scientificName)}"+q:A&per_page=50&key=${apiKey}`;
	try {
		const res = await fetch(url, { signal: abortSignal });
		if (!res.ok) {
			if (res.status === 404) {
				await cacheSet(key, { recordings: [], numRecordings: 0 }, CACHE_TTL.negative);
				return { recordings: [], numRecordings: 0 };
			}
			if (res.status === 401 || res.status === 403 || res.status === 429) return null;
			if (res.status >= 500) {
				await cacheSet(key, null, CACHE_TTL.upstreamError);
				return null;
			}
			return null;
		}
		const data = (await res.json()) as XenoCantoResponse;
		const total = parseInt(data.numRecordings, 10) || 0;

		const seen = new Set<string>();
		const scored = data.recordings
			.filter((r) => {
				if (seen.has(r.id)) return false;
				seen.add(r.id);
				return true;
			})
			.map((r) => {
				const types = r.type.split(',').map((s) => s.trim()).filter(Boolean);
				return { r, types, priority: parseTypePriority(types) };
			})
			.sort((a, b) => a.priority - b.priority);

		const selected = scored.slice(0, 10);
		const normalized: NormalizedRecording[] = selected.map(({ r, types }) => ({
			id: r.id,
			audioUrl: r.file,
			spectrogramUrl: r.sono?.med ?? null,
			types,
			lengthSeconds: parseLengthSeconds(r.length),
			country: r.cnt || null,
			location: r.loc || null,
			recordist: r.rec,
			license: r.lic,
			date: r.date || null,
		}));

		const result = { recordings: normalized, numRecordings: total };
		await cacheSet(key, result, CACHE_TTL.xenoCanto);
		return result;
	} catch {
		return null;
	}
}
