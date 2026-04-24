import type { AggregatedDetection } from '../store';
import { animGlyph, peakToGlyph } from './glyphs';
import { LAYOUTS } from './session';
import type { BirdieHudState, HudRenderState } from './types';
import { alignRow, centerLine } from './utils';

const BODY_WIDTH = 544;

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
				centerLine(state.retryCountdown > 0 ? `Retrying in ${state.retryCountdown}s` : 'Tap to try again', BODY_WIDTH),
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

// Initial contents for the listening layout — wave column and empty popup.
export function initialListeningContents(): Record<string, string> {
	return {
		eventCapture: ' ',
		wave: buildWaveContent(
			0,
			Array.from({ length: 8 }, () => 0),
		),
		birdInfo: '',
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
export function buildWaveContent(tick: number, peaksTopToBottom: number[]): string {
	const lines: string[] = [animGlyph(tick), ''];
	for (const p of peaksTopToBottom) lines.push(peakToGlyph(p));
	return lines.join('\n');
}

export function buildPopupText(detection: AggregatedDetection): string {
	const common = displayCommonName(detection).slice(0, 40);
	const sci = `- ${detection.scientific_name}`.slice(0, 42);
	const meta = `${pct(detection.bestConfidence)} · ${detection.count}x`;
	return ['\n\n', common, sci, '', meta].join('\n');
}
