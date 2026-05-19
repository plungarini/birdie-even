import { cacheGet, cacheKey, cacheSet, CACHE_TTL, coordinatesQuantized, dateBucket } from './cache';

const INAT_BASE = 'https://api.inaturalist.org/v1';

function localeForInat(raw: string | null | undefined): string {
	if (!raw) return 'en';
	return raw.replace(/_/g, '-').split('-')[0] || 'en';
}

export interface InatConservationStatus {
	place_id: number | null;
	status: string;
	authority?: string;
	iucn?: number;
	url?: string;
}

export interface InatEstablishmentMeans {
	establishment_means: 'native' | 'introduced' | 'endemic' | string;
	place?: { id: number; name?: string };
}

export interface InatTaxonResult {
	id: number;
	name: string;
	preferred_common_name: string | null;
	default_photo: { medium_url: string; original_url: string; attribution: string; license_code: string } | null;
	taxon_photos: Array<{ photo: { url: string; attribution: string; license_code: string } }>;
	observations_count: number;
	wikipedia_summary: string | null;
	ancestors: Array<{ rank: string; name: string }>;
	conservation_status: InatConservationStatus | null;
	conservation_statuses: InatConservationStatus[] | null;
	establishment_means: InatEstablishmentMeans | null;
}

async function fetchJson<T>(url: string, abortSignal?: AbortSignal): Promise<T> {
	const res = await fetch(url, { signal: abortSignal });
	if (!res.ok) {
		throw new Error(`iNat ${res.status}: ${res.statusText}`);
	}
	return (await res.json()) as T;
}

export async function searchInatTaxonId(
	scientificName: string,
	abortSignal?: AbortSignal,
): Promise<number | null> {
	const key = cacheKey('inaturalist', 'taxon-search', scientificName);
	const cached = await cacheGet<{ id: number }>(key);
	if (cached) return cached.id;

	const url = `${INAT_BASE}/taxa?q=${encodeURIComponent(scientificName)}&rank=species&per_page=1`;
	try {
		const data = await fetchJson<{ results: Array<{ id: number; name: string }> }>(url, abortSignal);
		const match = data.results.find(
			(r) => r.name.toLowerCase() === scientificName.toLowerCase(),
		);
		if (!match) {
			await cacheSet(key, null, CACHE_TTL.negative);
			return null;
		}
		await cacheSet(key, { id: match.id }, CACHE_TTL.inatTaxa);
		return match.id;
	} catch {
		return null;
	}
}

export async function fetchInatPlaceId(
	lat: number,
	lng: number,
	abortSignal?: AbortSignal,
): Promise<number | null> {
	const { latQ, lngQ } = coordinatesQuantized(lat, lng, 1.0);
	const key = cacheKey('inaturalist', 'place', String(latQ), String(lngQ));
	const cached = await cacheGet<{ id: number }>(key);
	if (cached) return cached.id;

	const buf = 0.5;
	const url =
		`${INAT_BASE}/places/nearby` +
		`?nelat=${lat + buf}&nelng=${lng + buf}&swlat=${lat - buf}&swlng=${lng - buf}`;
	try {
		const data = await fetchJson<{ results: { standard: Array<{ id: number; bbox_area: number }> } }>(
			url,
			abortSignal,
		);
		const standard = data.results?.standard ?? [];
		if (!standard.length) return null;
		// Pick the smallest standard place that contains the point (most specific)
		const place = standard.slice().sort((a, b) => a.bbox_area - b.bbox_area)[0];
		await cacheSet(key, { id: place.id }, CACHE_TTL.inatTaxa);
		return place.id;
	} catch {
		return null;
	}
}

export async function fetchInatTaxon(
	inatTaxonId: number,
	locale: string | null | undefined,
	placeId: number | null,
	abortSignal?: AbortSignal,
): Promise<InatTaxonResult | null> {
	const resolvedLocale = localeForInat(locale);
	const key = cacheKey('inaturalist', 'taxa', String(inatTaxonId), resolvedLocale, String(placeId ?? 'global'));
	const cached = await cacheGet<InatTaxonResult>(key);
	if (cached) return cached;

	let url =
		`${INAT_BASE}/taxa/${inatTaxonId}` +
		`?locale=${encodeURIComponent(resolvedLocale)}`;
	if (placeId !== null) url += `&place_id=${placeId}`;

	try {
		const data = await fetchJson<{ results: InatTaxonResult[] }>(url, abortSignal);
		const result = data.results[0] ?? null;
		await cacheSet(key, result, CACHE_TTL.inatTaxa);
		return result;
	} catch {
		return null;
	}
}

export interface InatObservation {
	id: number;
	geojson: { coordinates: [number, number] } | null;
	observed_on: string | null;
	place_guess: string | null;
	photos: Array<{ url: string }>;
}

export interface InatObservationsResult {
	results: InatObservation[];
	total_results: number;
}

export async function fetchInatObservations(
	inatTaxonId: number,
	lat: number,
	lng: number,
	abortSignal?: AbortSignal,
): Promise<InatObservationsResult | null> {
	const { latQ, lngQ } = coordinatesQuantized(lat, lng);
	const bucket = dateBucket(CACHE_TTL.inatObservations);
	const key = cacheKey('inaturalist', 'observations', String(inatTaxonId), String(latQ), String(lngQ), bucket);

	const cached = await cacheGet<InatObservationsResult>(key);
	if (cached) return cached;

	const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	const url =
		`${INAT_BASE}/observations?taxon_id=${inatTaxonId}` +
		`&lat=${lat}&lng=${lng}&radius=50` +
		`&d1=${d90}&per_page=50&order=desc&order_by=observed_on`;

	try {
		const data = await fetchJson<InatObservationsResult>(url, abortSignal);
		await cacheSet(key, data, CACHE_TTL.inatObservations);
		return data;
	} catch {
		return null;
	}
}

export function computeDistanceKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return Math.round(R * c * 10) / 10;
}
