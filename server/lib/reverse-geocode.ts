// Reverse geocoding via Photon (Komoot's OSM-backed search service).
//
// Why not Nominatim directly: Cloudflare Workers replace/strip the
// User-Agent header on outbound fetches, and Nominatim's TOS gates on UA —
// requests come back as 403. Photon serves the same OSM data without that
// requirement and has no key. Free, public, no per-request identifier.
//
// We quantise the request coordinate to ~11 km (0.1°) and cache hits for
// 30 days. Misses get a short negative cache so transient upstream hiccups
// don't pin BL to em-dash.
import { CACHE_TTL, cacheGet, cacheKey, cacheSet, coordinatesQuantized } from './cache';

const REVERSE_GEOCODE_TTL = 60 * 60 * 24 * 30; // 30 days for hits

interface PhotonFeature {
	properties?: {
		name?: string;
		city?: string;
		town?: string;
		village?: string;
		district?: string;
		locality?: string;
		county?: string;
		state?: string;
		country?: string;
		type?: string;
	};
}

interface PhotonResponse {
	features?: PhotonFeature[];
}

export interface ReverseGeocodeResult {
	city: string | null;
}

// Photon only accepts `lang` ∈ {en, de, fr, default}; anything else 400s.
// For everything outside that set we omit `lang` and let Photon return the
// place's local-language OSM name — which is what most users actually want
// to see for their own region anyway.
function photonLang(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const base = raw.replace(/_/g, '-').toLowerCase().split('-')[0];
	return base === 'en' || base === 'de' || base === 'fr' ? base : null;
}

function pickCity(json: PhotonResponse): string | null {
	const feature = json.features?.[0];
	const p = feature?.properties;
	if (!p) return null;
	return (
		p.city?.trim() ||
		p.town?.trim() ||
		p.village?.trim() ||
		p.locality?.trim() ||
		p.district?.trim() ||
		p.county?.trim() ||
		// `name` is the place's own name — only useful when the feature is
		// itself a settlement (type=place), not when it's a road or POI.
		(p.type === 'place' ? p.name?.trim() : undefined) ||
		p.state?.trim() ||
		null
	);
}

export async function fetchCityForCoords(
	lat: number,
	lng: number,
	locale: string | null | undefined,
	abortSignal?: AbortSignal,
): Promise<ReverseGeocodeResult> {
	const { latQ, lngQ } = coordinatesQuantized(lat, lng, 0.1);
	const lang = photonLang(locale);
	// `photon-v2` retires the v1 entries that cached null because of the
	// rejected-`lang` 400s.
	const key = cacheKey('reverse-geocode', 'photon-v2', lang ?? 'default', latQ.toFixed(2), lngQ.toFixed(2));

	const cached = await cacheGet<ReverseGeocodeResult>(key);
	if (cached) return cached;

	const params = new URLSearchParams({
		lat: latQ.toFixed(2),
		lon: lngQ.toFixed(2),
	});
	if (lang) params.set('lang', lang);
	const url = `https://photon.komoot.io/reverse?${params}`;

	try {
		const res = await fetch(url, {
			signal: abortSignal,
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.warn('[birdie-proxy] photon non-ok', {
				status: res.status,
				lat: latQ,
				lng: lngQ,
				body: body.slice(0, 200),
			});
			await cacheSet(key, { city: null }, CACHE_TTL.upstreamError);
			return { city: null };
		}
		const json = (await res.json()) as PhotonResponse;
		const city = pickCity(json);
		const result: ReverseGeocodeResult = { city };
		if (city) {
			await cacheSet(key, result, REVERSE_GEOCODE_TTL);
		} else {
			console.warn('[birdie-proxy] photon no city in response', {
				lat: latQ,
				lng: lngQ,
				properties: json.features?.[0]?.properties ?? null,
			});
			await cacheSet(key, result, CACHE_TTL.negative);
		}
		return result;
	} catch (err) {
		console.warn('[birdie-proxy] photon fetch failed', { err: String(err) });
		return { city: null };
	}
}
