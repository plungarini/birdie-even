import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import { buildBirdImageUrl } from '../lib/bird-image';
import { resolveWorkerLocale } from '../lib/locales';
import { fetchTaxonomyCached } from '../lib/taxonomy';
import { searchInatTaxonId, fetchInatObservations } from '../lib/inaturalist';
import { computeRarityFromObservations } from '../lib/rarity';
import { fetchWikipediaSummary } from '../lib/wikipedia';
import type { Env, RarityTier, TaxonomyInfo } from '../types';

interface UpstreamDetection {
	common_name?: unknown;
	scientific_name?: unknown;
	confidence?: unknown;
	start_time?: unknown;
	end_time?: unknown;
}

interface EnrichedDetectionPayload {
	common_name: string;
	scientific_name: string;
	confidence: number;
	start_time: number;
	end_time: number;
	localized_common_name: string;
	image_url: string;
	taxonomy: TaxonomyInfo | null;
	rarity: { tier: RarityTier; localCount90d: number } | null;
	taglineShort: string | null;
}

function extractLocaleFromSettings(raw: FormDataEntryValue | null): string | undefined {
	if (typeof raw !== 'string' || !raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as { locale?: unknown };
		return typeof parsed.locale === 'string' ? parsed.locale : undefined;
	} catch {
		return undefined;
	}
}

function extractPositionFromSettings(raw: FormDataEntryValue | null): { lat: number; lng: number } | null {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		const parsed = JSON.parse(raw) as { lat?: unknown; lon?: unknown };
		const lat = typeof parsed.lat === 'number' && Number.isFinite(parsed.lat) ? parsed.lat : null;
		const lng = typeof parsed.lon === 'number' && Number.isFinite(parsed.lon) ? parsed.lon : null;
		if (lat !== null && lng !== null) return { lat, lng };
		return null;
	} catch {
		return null;
	}
}

function toDetection(raw: UpstreamDetection): EnrichedDetectionPayload | null {
	const scientific = typeof raw.scientific_name === 'string' ? raw.scientific_name.trim() : '';
	if (!scientific) return null;
	const common = typeof raw.common_name === 'string' ? raw.common_name : '';
	const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
	const startTime = typeof raw.start_time === 'number' ? raw.start_time : Number(raw.start_time);
	const endTime = typeof raw.end_time === 'number' ? raw.end_time : Number(raw.end_time);
	return {
		common_name: common,
		scientific_name: scientific,
		confidence: Number.isFinite(confidence) ? confidence : 0,
		start_time: Number.isFinite(startTime) ? startTime : 0,
		end_time: Number.isFinite(endTime) ? endTime : 0,
		localized_common_name: common,
		image_url: '',
		taxonomy: null,
		rarity: null,
		taglineShort: null,
	};
}

async function enrichDetections(
	detections: EnrichedDetectionPayload[],
	token: string,
	locale: string,
): Promise<void> {
	// Dedupe by scientific_name so each species hits taxonomy (and the cache) once.
	const uniqueNames = Array.from(new Set(detections.map((d) => d.scientific_name)));
	const byName = new Map<string, TaxonomyInfo | null>();

	await Promise.all(
		uniqueNames.map(async (sci) => {
			try {
				const taxonomy = await fetchTaxonomyCached(sci, token, locale);
				byName.set(sci, taxonomy);
			} catch (err) {
				console.warn('[birdie-proxy] taxonomy lookup failed', {
					scientific_name: sci,
					locale,
					error: err instanceof Error ? err.message : String(err),
				});
				byName.set(sci, null);
			}
		}),
	);

	for (const d of detections) {
		const taxonomy = byName.get(d.scientific_name) ?? null;
		d.taxonomy = taxonomy;
		d.image_url = buildBirdImageUrl(d.scientific_name);
		const localized = taxonomy?.common_name?.trim();
		if (localized) d.localized_common_name = localized;
	}
}

async function attachRarityToDetections(
	detections: EnrichedDetectionPayload[],
	lat: number,
	lng: number,
): Promise<void> {
	const uniqueNames = Array.from(new Set(detections.map((d) => d.scientific_name)));
	const rarityByName = new Map<string, { tier: RarityTier; localCount90d: number }>();

	await Promise.all(
		uniqueNames.map(async (sci) => {
			try {
				const inatTaxonId = await searchInatTaxonId(sci);
				if (inatTaxonId === null) return;
				const observations = await fetchInatObservations(inatTaxonId, lat, lng);
				const rarity = computeRarityFromObservations(observations);
				if (rarity) rarityByName.set(sci, rarity);
			} catch (err) {
				console.warn('[birdie-proxy] rarity computation failed', {
					scientific_name: sci,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}),
	);

	for (const d of detections) {
		const r = rarityByName.get(d.scientific_name);
		if (r) d.rarity = r;
	}
}

async function attachTaglinesToDetections(
	detections: EnrichedDetectionPayload[],
	locale: string,
): Promise<void> {
	const uniqueNames = Array.from(new Set(detections.map((d) => d.scientific_name)));
	const taglineByName = new Map<string, string>();

	await Promise.all(
		uniqueNames.map(async (sci) => {
			try {
				const summary = await fetchWikipediaSummary(sci, locale);
				const extract = summary?.extract?.trim();
				if (extract) taglineByName.set(sci, extract);
			} catch (err) {
				console.warn('[birdie-proxy] wikipedia summary lookup failed', {
					scientific_name: sci,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}),
	);

	for (const d of detections) {
		const t = taglineByName.get(d.scientific_name);
		if (t) d.taglineShort = t;
	}
}

export function registerAnalyzeRoute(app: Hono<{ Bindings: Env }>): void {
	app.options('/analyze', (c) => {
		console.log('[birdie-proxy] OPTIONS /analyze', {
			origin: c.req.header('origin') ?? null,
			userAgent: c.req.header('user-agent') ?? null,
		});
		return new Response(null, { status: 204, headers: corsHeaders(c.env.ALLOWED_ORIGIN) });
	});

	app.post('/analyze', async (c) => {
		const origin = c.env.ALLOWED_ORIGIN;
		const requestStartedAt = Date.now();
		console.log('[birdie-proxy] POST /analyze start', {
			originHeader: c.req.header('origin') ?? null,
			userAgent: c.req.header('user-agent') ?? null,
			contentType: c.req.header('content-type') ?? null,
		});

		let formData: FormData;
		try {
			formData = await c.req.raw.formData();
		} catch {
			console.error('[birdie-proxy] invalid multipart body');
			return c.json({ detections: [], error: 'invalid multipart body' }, 400, corsHeaders(origin));
		}

		const file = formData.get('file');
		const settings = formData.get('settings');
		const locale = resolveWorkerLocale(extractLocaleFromSettings(settings));
		console.log('[birdie-proxy] multipart parsed', {
			hasFile: file instanceof File,
			fileName: file instanceof File ? file.name : null,
			fileType: file instanceof File ? file.type : null,
			fileSize: file instanceof File ? file.size : null,
			hasSettings: typeof settings === 'string' && settings.length > 0,
			locale,
		});

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 20_000);

		let upstream: Response;
		try {
			console.log('[birdie-proxy] forwarding upstream', {
				url: `${c.env.BIRDNET_SERVER_URL}/analyze`,
			});
			upstream = await fetch(`${c.env.BIRDNET_SERVER_URL}/analyze`, {
				method: 'POST',
				headers: { 'X-API-Key': c.env.BIRDNET_API_KEY },
				body: formData,
				signal: controller.signal,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error('[birdie-proxy] upstream fetch failed', { error: msg });
			return c.json({ detections: [], error: `upstream error: ${msg}` }, 502, corsHeaders(origin));
		} finally {
			clearTimeout(timeout);
		}

		if (!upstream.ok) {
			let text = '';
			try {
				text = await upstream.text();
			} catch {
				/* ignore */
			}
			console.error('[birdie-proxy] upstream non-2xx', { status: upstream.status, body: text });
			return c.json({ detections: [], error: `upstream ${upstream.status}: ${text}` }, 502, corsHeaders(origin));
		}

		let json: unknown;
		try {
			json = await upstream.json();
		} catch {
			console.error('[birdie-proxy] upstream returned invalid JSON');
			return c.json({ detections: [], error: 'upstream returned invalid JSON' }, 502, corsHeaders(origin));
		}

		const rawDetections =
			typeof json === 'object' && json !== null && Array.isArray((json as { detections?: unknown[] }).detections)
				? ((json as { detections: UpstreamDetection[] }).detections)
				: [];

		const detections = rawDetections
			.map(toDetection)
			.filter((d): d is EnrichedDetectionPayload => d !== null);

		try {
			await enrichDetections(detections, c.env.EBIRD_API_TOKEN, locale);
		} catch (err) {
			console.warn('[birdie-proxy] enrichment batch failed (continuing with base detections)', {
				error: err instanceof Error ? err.message : String(err),
			});
		}

		const position = extractPositionFromSettings(settings);
		try {
			await Promise.all([
				position ? attachRarityToDetections(detections, position.lat, position.lng) : Promise.resolve(),
				attachTaglinesToDetections(detections, locale),
			]);
		} catch (err) {
			console.warn('[birdie-proxy] post-enrichment batch failed (continuing)', {
				error: err instanceof Error ? err.message : String(err),
			});
		}

		const responseBody = {
			...(typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}),
			detections,
			locale,
		};

		console.log('[birdie-proxy] POST /analyze success', {
			durationMs: Date.now() - requestStartedAt,
			detections: detections.length,
			locale,
			enrichedCount: detections.filter((d) => d.taxonomy !== null).length,
			hasErrorField: typeof json === 'object' && json !== null && 'error' in json,
		});

		return c.json(responseBody, 200, corsHeaders(origin));
	});
}
