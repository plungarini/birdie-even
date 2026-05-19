import { cacheGet, cacheKey, cacheSet, CACHE_TTL } from './cache';
import { fetchWikipediaSummary } from './wikipedia';

export type IucnCode = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export const IUCN_SEVERITY_ORDER: IucnCode[] = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD'];

// Canonical English Wikipedia article titles per IUCN code. These are stable starting points
// used to resolve the article's localized title via Wikipedia's langlinks API at runtime.
const ENGLISH_TITLES: Record<IucnCode, string> = {
	LC: 'Least-concern species',
	NT: 'Near-threatened species',
	VU: 'Vulnerable species',
	EN: 'Endangered species',
	CR: 'Critically endangered',
	EW: 'Extinct in the wild',
	EX: 'Extinction',
	DD: 'Data deficient',
};

const SEVERITY_INDEX: Record<IucnCode, number> = {
	LC: 0,
	NT: 1,
	VU: 2,
	EN: 3,
	CR: 4,
	EW: 5,
	EX: 6,
	DD: 7,
};

const USER_AGENT = 'BirdieEven/1.0 (bird-watcher-app; mailto:app@example.com)';

function shortLocale(raw: string | null | undefined): string {
	if (!raw) return 'en';
	return raw.replace(/_/g, '-').split('-')[0]?.toLowerCase() || 'en';
}

interface LangLinkResponse {
	query?: {
		pages?: Record<
			string,
			{
				langlinks?: Array<{ lang: string; '*': string }>;
			}
		>;
	};
}

// Resolve the localized Wikipedia article title for an English title via langlinks.
// Returns null if no article exists in the requested language.
async function resolveLocalizedTitle(
	englishTitle: string,
	locale: string,
	abortSignal?: AbortSignal,
): Promise<string | null> {
	if (locale === 'en') return englishTitle;
	const key = cacheKey('wikipedia', 'langlink', englishTitle, locale);
	const cached = await cacheGet<{ title: string | null }>(key);
	if (cached) return cached.title;

	const params = new URLSearchParams({
		action: 'query',
		titles: englishTitle,
		prop: 'langlinks',
		lllang: locale,
		format: 'json',
		redirects: '1',
	});
	const url = `https://en.wikipedia.org/w/api.php?${params}`;
	try {
		const res = await fetch(url, {
			signal: abortSignal,
			headers: { 'User-Agent': USER_AGENT },
		});
		if (!res.ok) throw new Error(`wiki ${res.status}`);
		const data = (await res.json()) as LangLinkResponse;
		const pages = data.query?.pages ?? {};
		const first = Object.values(pages)[0];
		const title = first?.langlinks?.[0]?.['*'] ?? null;
		await cacheSet(key, { title }, CACHE_TTL.wikipediaSummary);
		return title;
	} catch {
		return null;
	}
}

export interface IucnInfo {
	code: IucnCode;
	severityIndex: number;
	label: string;
	blurb: string | null;
	redListUrl: string | null;
}

export async function fetchIucnInfo(
	code: IucnCode,
	locale: string | null | undefined,
	redListUrl: string | null,
	abortSignal?: AbortSignal,
): Promise<IucnInfo> {
	const enTitle = ENGLISH_TITLES[code];
	const loc = shortLocale(locale);
	const severityIndex = SEVERITY_INDEX[code];

	const key = cacheKey('iucn', 'info', code, loc);
	const cached = await cacheGet<{ label: string; blurb: string | null }>(key);
	if (cached) {
		return {
			code,
			severityIndex,
			label: cached.label,
			blurb: cached.blurb,
			redListUrl,
		};
	}

	let label = enTitle;
	let blurb: string | null = null;

	const localizedTitle =
		loc === 'en' ? enTitle : await resolveLocalizedTitle(enTitle, loc, abortSignal);

	if (localizedTitle) {
		const summary = await fetchWikipediaSummary(localizedTitle, loc, abortSignal);
		if (summary) {
			label = summary.title || localizedTitle;
			if (summary.extract) blurb = summary.extract;
		}
	}

	// If we got nothing in the user's locale, fall back to English.
	if (!blurb && loc !== 'en') {
		const enSummary = await fetchWikipediaSummary(enTitle, 'en', abortSignal);
		if (enSummary) {
			if (!localizedTitle) label = enSummary.title || enTitle;
			if (enSummary.extract) blurb = enSummary.extract;
		}
	}

	await cacheSet(key, { label, blurb }, CACHE_TTL.wikipediaSummary);

	return {
		code,
		severityIndex,
		label,
		blurb,
		redListUrl,
	};
}
