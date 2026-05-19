import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import { buildGbifTileUrlTemplate, searchGbifTaxonKey } from '../lib/gbif';
import {
	computeDistanceKm,
	fetchInatObservations,
	fetchInatTaxon,
	searchInatTaxonId,
} from '../lib/inaturalist';
import { resolveWorkerLocale } from '../lib/locales';
import { computeRarityFromObservations } from '../lib/rarity';
import {
	fetchWikipediaExtracts,
	fetchWikipediaSummary,
} from '../lib/wikipedia';
import { fetchXenoCantoRecordings } from '../lib/xeno-canto';
import type { BirdDetailRequest, BirdDetailResponse, Env } from '../types';

function normalizeLocale(raw: string | null | undefined): string {
	return resolveWorkerLocale(raw);
}

export function registerBirdDetailRoute(app: Hono<{ Bindings: Env }>): void {
	app.options('/bird-detail', (c) => {
		return new Response(null, {
			status: 204,
			headers: corsHeaders(c.env.ALLOWED_ORIGIN),
		});
	});

	app.post('/bird-detail', async (c) => {
		// Use the client's Origin header for XC proxy URLs so the browser
		// resolves /xc/* correctly. Falls back to the Worker's own origin.
		//
		// ASSUMPTION (production topology): the client's origin must proxy
		// /xc/* to this Worker. In dev, Vite's proxy rule handles this. If
		// in production the client and Worker live on separate origins with
		// no shared reverse-proxy in front, audio URLs built from the client
		// origin will 404.
		const origin =
			c.req.header('Origin') ?? new URL(c.req.url).origin;
		const requestStartedAt = Date.now();

		let body: BirdDetailRequest;
		try {
			body = (await c.req.json()) as BirdDetailRequest;
		} catch {
			return c.json({ error: 'invalid json' }, 400, corsHeaders(origin));
		}

		const scientificName = body.scientificName?.trim();
		if (!scientificName) {
			return c.json(
				{ error: 'scientificName is required' },
				400,
				corsHeaders(origin),
			);
		}

		const locale = normalizeLocale(body.locale);
		const hasPosition =
			typeof body.lat === 'number' &&
			typeof body.lng === 'number' &&
			Number.isFinite(body.lat) &&
			Number.isFinite(body.lng);
		const lat = hasPosition ? body.lat! : null;
		const lng = hasPosition ? body.lng! : null;

		console.log('[birdie-proxy] POST /bird-detail', {
			scientificName,
			locale,
			hasPosition,
			originHeader: c.req.header('origin') ?? null,
		});

		const [inatTaxonId, gbifTaxonKey] = await Promise.all([
			searchInatTaxonId(scientificName),
			searchGbifTaxonKey(scientificName),
		]);

		if (!inatTaxonId) {
			console.warn(
				'[birdie-proxy] bird-detail: could not resolve inatTaxonId',
				{ scientificName },
			);
		}
		if (!gbifTaxonKey) {
			console.warn(
				'[birdie-proxy] bird-detail: could not resolve gbifTaxonKey',
				{ scientificName },
			);
		}

		const sources = await Promise.allSettled([
			inatTaxonId ? fetchInatTaxon(inatTaxonId, locale) : Promise.resolve(null),
			hasPosition && inatTaxonId ?
				fetchInatObservations(inatTaxonId, lat!, lng!)
			:	Promise.resolve(null),
			fetchWikipediaSummary(scientificName, locale),
			fetchWikipediaExtracts(scientificName, locale),
			fetchXenoCantoRecordings(
				scientificName,
				c.env.XENO_CANTO_API_KEY,
				origin,
			),
		]);

		const inatTaxon =
			sources[0].status === 'fulfilled' ? sources[0].value : null;
		const inatObs = sources[1].status === 'fulfilled' ? sources[1].value : null;
		const wikiSummary =
			sources[2].status === 'fulfilled' ? sources[2].value : null;
		const wikiExtracts =
			sources[3].status === 'fulfilled' ? sources[3].value : null;
		const xcResult =
			sources[4].status === 'fulfilled' ? sources[4].value : null;

		const commonName = inatTaxon?.preferred_common_name?.trim() || null;
		const family =
			inatTaxon?.ancestors?.find((a) => a.rank === 'family')?.name ?? null;
		const order =
			inatTaxon?.ancestors?.find((a) => a.rank === 'order')?.name ?? null;
		const classVal =
			inatTaxon?.ancestors?.find((a) => a.rank === 'class')?.name ?? null;

		const heroPhoto =
			inatTaxon?.default_photo ?
				{
					url:
						inatTaxon.default_photo.medium_url ||
						inatTaxon.default_photo.original_url,
					attribution: inatTaxon.default_photo.attribution,
					license: inatTaxon.default_photo.license_code,
				}
			:	null;

		const sizeSwap = (u: string, size: 'medium' | 'large') =>
			u.replace(/\/(square|small|medium|large)\.(jpe?g|png)(\?|$)/i, `/${size}.$2$3`);
		const gallery = (inatTaxon?.taxon_photos ?? [])
			.filter((tp) => tp.photo)
			.map((tp) => ({
				url: sizeSwap(tp.photo.url, 'medium'),
				largeUrl: sizeSwap(tp.photo.url, 'large'),
				attribution: tp.photo.attribution,
				license: tp.photo.license_code,
			}));

		const descriptionLong = wikiExtracts?.trim() || null;
		let descriptionIsFallback = false;
		let finalDescriptionLong = descriptionLong;
		if (!finalDescriptionLong && inatTaxon?.wikipedia_summary) {
			finalDescriptionLong = inatTaxon.wikipedia_summary;
			descriptionIsFallback = true;
		}

		const taglineShort = wikiSummary?.extract?.trim() || null;
		const wikipediaUrl = wikiSummary?.content_urls?.desktop?.page ?? null;

		const iucnStatusRaw =
			inatTaxon?.conservation_statuses
				?.filter((cs) => cs.place_id === null || cs.place_id === undefined)
				.map((cs) => cs.status)[0] ?? null;
		const iucnStatus = isValidIucn(iucnStatusRaw) ? iucnStatusRaw : null;

		const rarity =
			hasPosition && inatObs ?
				{
					...computeRarityFromObservations(inatObs)!,
					lastSeenNearby: buildLastSeenNearby(inatObs, lat!, lng!),
				}
			:	null;

		const nearbyPins = (inatObs?.results ?? [])
			.filter((r) => r.geojson?.coordinates)
			.map((r) => {
				const coords = r.geojson!.coordinates;
				return {
					lat: coords[1],
					lng: coords[0],
					date: r.observed_on || '',
					placeName: r.place_guess || null,
					photoUrl: r.photos?.[0]?.url ?? null,
				};
			});

		const globalTileUrlTemplate =
			gbifTaxonKey ? buildGbifTileUrlTemplate(gbifTaxonKey) : null;

		const response: BirdDetailResponse = {
			identity: {
				inatTaxonId: inatTaxonId ?? 0,
				gbifTaxonKey: gbifTaxonKey ?? 0,
				scientificName,
				commonName,
				family,
				order,
				class: classVal,
			},
			media: {
				heroPhoto,
				gallery,
			},
			description: {
				taglineShort,
				descriptionLong: finalDescriptionLong,
				descriptionIsFallback,
				wikipediaUrl,
			},
			conservation: {
				iucnStatus,
				native: inatTaxon?.native ?? null,
				introduced: inatTaxon?.introduced ?? null,
				endemic: inatTaxon?.endemic ?? null,
				threatened: inatTaxon?.threatened ?? null,
			},
			stats: {
				globalObservationsCount: inatTaxon?.observations_count ?? null,
				recordingsAvailable: xcResult?.numRecordings ?? null,
			},
			recordings: xcResult?.recordings ?? [],
			rarity,
			map:
				hasPosition ?
					{
						globalTileUrlTemplate: globalTileUrlTemplate ?? '',
						nearbyPins,
					}
				:	null,
		};

		if (hasPosition && !globalTileUrlTemplate) {
			response.map = null;
		}

		console.log('[birdie-proxy] POST /bird-detail success', {
			durationMs: Date.now() - requestStartedAt,
			scientificName,
			hasRarity: response.rarity !== null,
			hasMap: response.map !== null,
			recordings: response.recordings.length,
			gallery: response.media.gallery.length,
		});

		return c.json(response, 200, {
			...corsHeaders(origin),
			'Cache-Control': 'private, max-age=60',
		});
	});
}

function buildLastSeenNearby(
	obs: import('../lib/inaturalist').InatObservationsResult | null,
	lat: number,
	lng: number,
): { date: string; placeName: string | null; distanceKm: number } | null {
	if (!obs?.results?.length) return null;
	const first = obs.results[0];
	if (!first.observed_on) return null;
	const coords = first.geojson?.coordinates;
	if (!coords) return null;
	const distanceKm = computeDistanceKm(lat, lng, coords[1], coords[0]);
	return {
		date: first.observed_on,
		placeName: first.place_guess || null,
		distanceKm,
	};
}

const VALID_IUCN = new Set(['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD']);

function isValidIucn(raw: string | null): raw is import('../types').IucnStatus {
	return raw !== null && VALID_IUCN.has(raw);
}
