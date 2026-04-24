export const SUPPORTED_LOCALES = [
	'en_us',
	'en_uk',
	'af',
	'ar',
	'cs',
	'da',
	'de',
	'es',
	'fi',
	'fr',
	'hu',
	'it',
	'ja',
	'ko',
	'nl',
	'no',
	'pl',
	'pt',
	'ro',
	'ru',
	'sk',
	'sl',
	'sv',
	'th',
	'tr',
	'uk',
	'zh',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

function normalizeCandidate(raw: string): string {
	return raw.trim().toLowerCase().replace(/-/g, '_');
}

export function resolveWorkerLocale(raw: string | null | undefined): SupportedLocale {
	if (!raw) return 'en_us';
	const normalized = normalizeCandidate(raw);

	if (SUPPORTED_SET.has(normalized)) {
		return normalized as SupportedLocale;
	}

	if (normalized === 'en' || normalized === 'en_us') return 'en_us';
	if (normalized === 'en_gb' || normalized === 'en_uk') {
		return (SUPPORTED_SET.has('en_uk') ? 'en_uk' : 'en_us') as SupportedLocale;
	}

	const [language, region] = normalized.split('_');
	if (language === 'en') {
		if (region === 'gb' && SUPPORTED_SET.has('en_uk')) return 'en_uk';
		return 'en_us';
	}

	if (language && SUPPORTED_SET.has(language)) {
		return language as SupportedLocale;
	}

	return 'en_us';
}
