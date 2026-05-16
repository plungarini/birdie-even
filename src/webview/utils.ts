export type BadgeVariant = 'positive' | 'negative' | 'accent' | 'neutral';

export function pct(confidence: number): string {
	return `${Math.round(confidence * 100)}%`;
}

export function confidenceVariant(confidence: number): BadgeVariant {
	if (confidence >= 0.78) return 'positive';
	if (confidence >= 0.55) return 'accent';
	return 'neutral';
}

export function formatShortRelative(ts: number | null | undefined): string {
	if (!ts) return '—';
	const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
	if (diffSeconds < 10) return 'just now';
	if (diffSeconds < 60) return `${diffSeconds}s ago`;
	const diffMinutes = Math.round(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.round(diffHours / 24);
	return `${diffDays}d ago`;
}

interface CommonNameSource {
	common_name: string;
	localized_common_name?: string;
}

export function displayCommonName(detection: CommonNameSource): string {
	return detection.localized_common_name?.trim() || detection.common_name;
}

interface TaxonomySource {
	taxonomy: { species_code?: string } | null;
}

export function buildBirdDetailsUrl(detection: TaxonomySource): string | null {
	const speciesCode = detection.taxonomy?.species_code?.trim();
	if (!speciesCode) return null;
	return `https://ebird.org/species/${encodeURIComponent(speciesCode)}`;
}

export function copyTextWithExecCommand(text: string): boolean {
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	textarea.style.pointerEvents = 'none';
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);
	const successful = document.execCommand('copy');
	document.body.removeChild(textarea);
	return successful;
}

export function formatLocalizedDateTime(ts: number): string {
	try {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
	} catch {
		return new Date(ts).toLocaleString();
	}
}
