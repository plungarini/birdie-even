import { parseCsv } from './csv';
import { resolveWorkerLocale } from './locales';
import type { TaxonomyInfo } from '../types';

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 1 week
const CACHE_NAMESPACE = 'https://cache.birdie.internal/taxonomy/';

function cacheKey(scientificName: string, locale: string): Request {
	return new Request(`${CACHE_NAMESPACE}${encodeURIComponent(locale)}/${encodeURIComponent(scientificName)}`);
}

function parseNumber(raw: string): number {
	const n = Number(raw);
	return Number.isFinite(n) ? n : 0;
}

function rowToTaxonomy(headers: string[], row: string[]): TaxonomyInfo {
	const get = (key: string): string => {
		const idx = headers.indexOf(key);
		return idx >= 0 ? row[idx] ?? '' : '';
	};
	const extinctRaw = get('EXTINCT').trim().toLowerCase();
	const extinctYearRaw = get('EXTINCT_YEAR').trim();
	return {
		scientific_name: get('SCIENTIFIC_NAME'),
		common_name: get('COMMON_NAME'),
		species_code: get('SPECIES_CODE'),
		category: get('CATEGORY'),
		taxon_order: parseNumber(get('TAXON_ORDER')),
		com_name_codes: get('COM_NAME_CODES'),
		sci_name_codes: get('SCI_NAME_CODES'),
		banding_codes: get('BANDING_CODES'),
		order: get('ORDER'),
		family_com_name: get('FAMILY_COM_NAME'),
		family_sci_name: get('FAMILY_SCI_NAME'),
		report_as: get('REPORT_AS'),
		extinct: extinctRaw === 'true' || extinctRaw === '1' || extinctRaw === 'yes',
		extinct_year: extinctYearRaw ? parseNumber(extinctYearRaw) : null,
		family_code: get('FAMILY_CODE'),
	};
}

async function fetchFromEbird(scientificName: string, token: string, locale: string): Promise<TaxonomyInfo | null> {
	const resolvedLocale = resolveWorkerLocale(locale);
	const url = `https://api.ebird.org/v2/ref/taxonomy/ebird?species=${encodeURIComponent(scientificName)}&version=2019&locale=${encodeURIComponent(resolvedLocale)}`;
	const res = await fetch(url, {
		headers: { 'X-eBirdApiToken': token },
	});
	if (!res.ok) {
		throw new Error(`ebird ${res.status}`);
	}
	const text = await res.text();
	const rows = parseCsv(text.trim());
	if (rows.length < 2) return null;
	return rowToTaxonomy(rows[0], rows[1]);
}

export async function fetchTaxonomyCached(scientificName: string, token: string, locale: string): Promise<TaxonomyInfo | null> {
	const resolvedLocale = resolveWorkerLocale(locale);
	const key = cacheKey(scientificName, resolvedLocale);
	const cache = (caches as unknown as { default: Cache }).default;
	const cached = await cache.match(key);
	if (cached) {
		try {
			return (await cached.json()) as TaxonomyInfo | null;
		} catch {
			// fall through to refetch
		}
	}
	const fresh = await fetchFromEbird(scientificName, token, resolvedLocale);
	const body = JSON.stringify(fresh);
	const response = new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
		},
	});
	await cache.put(key, response.clone());
	return fresh;
}
