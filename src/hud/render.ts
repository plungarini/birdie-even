import type { RarityTier } from '../net/detail-types';
import type { AggregatedDetection } from '../store';
import { animGlyph, peakToGlyph } from './glyphs';
import { LAYOUTS } from './session';
import type { BirdieHudState, HudRenderState } from './types';
import { alignRow, centerLine } from './utils';

const BODY_WIDTH = 544;
// Approximate inner width (px) of the middle-column info containers on the
// listening layout. Used to centre the header/footer rows visually.
const BODY_TEXT_CHAR_LIMIT = 290;

function nowClock(): string {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function pct(confidence: number): string {
	return `${Math.round(confidence * 100)}%`;
}

function displayCommonName(detection: AggregatedDetection): string {
	return detection.localized_common_name?.trim() || detection.common_name;
}

function bodyForState(state: BirdieHudState): string {
	switch (state.type) {
		case 'IDLE':
			return [
				'',
				'',
				'',
				centerLine('------•    READY    •------', BODY_WIDTH),
				centerLine('Tap once to start capture', BODY_WIDTH),
			].join('\n');
		case 'ERROR':
			return [
				'',
				centerLine('------•    ERROR    •------', BODY_WIDTH),
				centerLine(state.message, BODY_WIDTH),
				'',
				centerLine(
					state.retryCountdown > 0 ?
						`Retrying in ${state.retryCountdown}s`
					:	'Tap to try again',
					BODY_WIDTH,
				),
			].join('\n');
	}

	return [' '].join('\n');
}

export function renderStaticHud(state: BirdieHudState): HudRenderState {
	return {
		layout: LAYOUTS.static,
		textContents: {
			eventCapture: ' ',
			header: alignRow(nowClock(), 'birdie', BODY_WIDTH),
			body: bodyForState(state),
		},
	};
}

// Initial contents for the listening layout — wave column and empty info rows.
export function initialListeningContents(): Record<string, string> {
	return {
		eventCapture: ' ',
		wave: buildWaveContent(
			0,
			Array.from({ length: 8 }, () => 0),
		),
		birdHeader: ' ',
		birdBody: ' ',
		birdFooter: ' ',
	};
}

export function renderInitialListeningHud(): HudRenderState {
	return {
		layout: LAYOUTS.listening,
		textContents: initialListeningContents(),
	};
}

// Build the wave column content. Line 0 = anim glyph, line 1 = blank gap,
// lines 2..N = waveform glyphs (oldest → newest, top to bottom).
export function buildWaveContent(
	tick: number,
	peaksTopToBottom: number[],
): string {
	const lines: string[] = [animGlyph(tick), ''];
	for (const p of peaksTopToBottom) lines.push(peakToGlyph(p));
	return lines.join('\n');
}

export function buildHeaderText(detection: AggregatedDetection): string {
	const common = displayCommonName(detection);
	const sci = detection.scientific_name;
	return truncateToParagraph([common, sci].join(' · '), 50);
}

export function buildBodyText(detection: AggregatedDetection): string {
	const tagline = detection.taglineShort?.trim();
	if (!tagline) return ' ';
	return truncateToParagraph(tagline, BODY_TEXT_CHAR_LIMIT);
}

const RARITY_LABELS: Record<RarityTier, string> = {
	legendary: 'LEGENDARY',
	rare: 'RARE',
	uncommon: 'UNCOMMON',
	common: 'COMMON',
	very_common: 'V.COMMON',
};

export function buildFooterText(
	detection: AggregatedDetection,
	isNew: boolean,
): string {
	const parts: string[] = [];
	let newStr = isNew ? '[NEW]  ' : '';
	if (detection.rarity) parts.push(RARITY_LABELS[detection.rarity.tier]);
	parts.push(pct(detection.bestConfidence), `${detection.count}×`);
	return `${newStr}${parts.join('  ·  ')}`;
}

function truncateToParagraph(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const slice = text.slice(0, maxChars);
	const lastBoundary = Math.max(
		slice.lastIndexOf('. '),
		slice.lastIndexOf('? '),
		slice.lastIndexOf('! '),
	);
	const cutAt =
		lastBoundary > maxChars * 0.5 ? lastBoundary + 1 : slice.lastIndexOf(' ');
	const trimmed = cutAt > 0 ? slice.slice(0, cutAt) : slice + '…';
	return `${trimmed.trimEnd()}`;
}
