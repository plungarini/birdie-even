export const SUPPORTED_BIRDIE_LOCALES = [
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

export type SupportedBirdieLocale = (typeof SUPPORTED_BIRDIE_LOCALES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_BIRDIE_LOCALES);

function normalizeCandidate(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, '_');
}

export function resolveSupportedLocale(raw: string | null | undefined): SupportedBirdieLocale {
  if (!raw) return 'en_us';
  const normalized = normalizeCandidate(raw);

  if (SUPPORTED_SET.has(normalized)) {
    return normalized as SupportedBirdieLocale;
  }

  if (normalized === 'en' || normalized === 'en_us') return 'en_us';
  if (normalized === 'en_gb' || normalized === 'en_uk') {
    return (SUPPORTED_SET.has('en_uk') ? 'en_uk' : 'en_us') as SupportedBirdieLocale;
  }

  const [language, region] = normalized.split('_');
  if (language === 'en') {
    if (region === 'gb' && SUPPORTED_SET.has('en_uk')) return 'en_uk';
    return 'en_us';
  }

  if (language && SUPPORTED_SET.has(language)) {
    return language as SupportedBirdieLocale;
  }

  return 'en_us';
}

export function detectBrowserLocale(): SupportedBirdieLocale {
  if (typeof navigator === 'undefined') {
    return 'en_us';
  }

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    return resolveSupportedLocale(candidate);
  }

  return 'en_us';
}

export function getLocaleLabel(locale: string, displayLocale = 'en'): string {
  try {
    const formatter = new Intl.DisplayNames([displayLocale], { type: 'language' });
    const value =
      locale === 'en_us' ? 'en-US' :
      locale === 'en_uk' ? 'en-GB' :
      locale.replace(/_/g, '-');
    return formatter.of(value) ?? locale;
  } catch {
    return locale.replace(/_/g, '-');
  }
}
