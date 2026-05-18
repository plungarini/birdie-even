import { cacheGet, cacheKey, cacheSet, CACHE_TTL } from './cache';

const USER_AGENT = 'BirdieEven/1.0 (bird-watcher-app; mailto:app@example.com)';

function wikipediaLocale(raw: string | null | undefined): string {
	if (!raw) return 'en';
	return raw.replace(/_/g, '-').split('-')[0] || 'en';
}

async function fetchJson<T>(url: string, abortSignal?: AbortSignal): Promise<T> {
	const res = await fetch(url, {
		signal: abortSignal,
		headers: { 'User-Agent': USER_AGENT },
	});
	if (!res.ok) {
		throw new Error(`Wikipedia ${res.status}: ${res.statusText}`);
	}
	return (await res.json()) as T;
}

export interface WikipediaSummary {
	title: string;
	extract: string;
	content_urls: { desktop: { page: string } };
}

export async function fetchWikipediaSummary(
	title: string,
	locale: string | null | undefined,
	abortSignal?: AbortSignal,
): Promise<WikipediaSummary | null> {
	const resolvedLocale = wikipediaLocale(locale);
	const key = cacheKey('wikipedia', 'summary', resolvedLocale, title);
	const cached = await cacheGet<WikipediaSummary>(key);
	if (cached) return cached;

	const url = `https://${resolvedLocale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
	try {
		const data = await fetchJson<WikipediaSummary>(url, abortSignal);
		await cacheSet(key, data, CACHE_TTL.wikipediaSummary);
		return data;
	} catch {
		if (resolvedLocale !== 'en') {
			const fallbackKey = cacheKey('wikipedia', 'summary', 'en', title);
			const fallbackCached = await cacheGet<WikipediaSummary>(fallbackKey);
			if (fallbackCached) return fallbackCached;

			const fallbackUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
			try {
				const data = await fetchJson<WikipediaSummary>(fallbackUrl, abortSignal);
				await cacheSet(fallbackKey, data, CACHE_TTL.wikipediaSummary);
				return data;
			} catch {
				return null;
			}
		}
		return null;
	}
}

export interface WikipediaExtractsResult {
	query: {
		pages: Record<string, { extract?: string }>;
	};
}

export async function fetchWikipediaExtracts(
	title: string,
	locale: string | null | undefined,
	abortSignal?: AbortSignal,
): Promise<string | null> {
	const resolvedLocale = wikipediaLocale(locale);
	const key = cacheKey('wikipedia', 'extracts', resolvedLocale, title);
	const cached = await cacheGet<string>(key);
	if (cached) return cached;

	const params = new URLSearchParams({
		action: 'query',
		titles: title,
		prop: 'extracts',
		exintro: '1',
		explaintext: '1',
		format: 'json',
	});
	const url = `https://${resolvedLocale}.wikipedia.org/w/api.php?${params}`;
	try {
		const data = await fetchJson<WikipediaExtractsResult>(url, abortSignal);
		const pages = data.query?.pages;
		if (!pages) return null;
		const pageId = Object.keys(pages)[0];
		const extract = pages[pageId]?.extract;
		if (extract) {
			await cacheSet(key, extract, CACHE_TTL.wikipediaExtracts);
			return extract;
		}
	} catch {
		// fall through to fallback
	}

	if (resolvedLocale !== 'en') {
		const fallbackKey = cacheKey('wikipedia', 'extracts', 'en', title);
		const fallbackCached = await cacheGet<string>(fallbackKey);
		if (fallbackCached) return fallbackCached;

		const fallbackParams = new URLSearchParams({
			action: 'query',
			titles: title,
			prop: 'extracts',
			exintro: '1',
			explaintext: '1',
			format: 'json',
		});
		const fallbackUrl = `https://en.wikipedia.org/w/api.php?${fallbackParams}`;
		try {
			const data = await fetchJson<WikipediaExtractsResult>(fallbackUrl, abortSignal);
			const pages = data.query?.pages;
			if (!pages) return null;
			const pageId = Object.keys(pages)[0];
			const extract = pages[pageId]?.extract ?? null;
			if (extract) await cacheSet(fallbackKey, extract, CACHE_TTL.wikipediaExtracts);
			return extract;
		} catch {
			return null;
		}
	}
	return null;
}
