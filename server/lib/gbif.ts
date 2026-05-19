import { cacheGet, cacheKey, cacheSet, CACHE_TTL } from './cache';

interface GbifSpeciesMatchResult {
	speciesKey: number;
	scientificName: string;
	rank: string;
	status: string;
}

export async function searchGbifTaxonKey(
	scientificName: string,
	abortSignal?: AbortSignal,
): Promise<number | null> {
	const key = cacheKey('gbif', 'species-match', scientificName);
	const cached = await cacheGet<{ gbifKey: number }>(key);
	if (cached) return cached.gbifKey;

	const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}&rank=SPECIES`;
	try {
		const res = await fetch(url, { signal: abortSignal });
		if (!res.ok) {
			if (res.status === 404) {
				await cacheSet(key, null, CACHE_TTL.negative);
				return null;
			}
			return null;
		}
		const data = (await res.json()) as GbifSpeciesMatchResult;
		if (!data.speciesKey) {
			await cacheSet(key, null, CACHE_TTL.negative);
			return null;
		}
		await cacheSet(key, { gbifKey: data.speciesKey }, CACHE_TTL.inatTaxa);
		return data.speciesKey;
	} catch {
		return null;
	}
}

export function buildGbifTileUrlTemplate(gbifTaxonKey: number): string {
	return `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}?taxonKey=${gbifTaxonKey}&style=purpleHeat.point`;
}
