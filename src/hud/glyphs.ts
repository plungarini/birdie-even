// Loader animation — one glyph per tick, cycles forever.
export const ANIM_FRAMES = ['◤', '◥', '◢', '◣', '█', '▣', '□', '■', '█'] as const;

export function animGlyph(tick: number): string {
	return ANIM_FRAMES[((tick % ANIM_FRAMES.length) + ANIM_FRAMES.length) % ANIM_FRAMES.length];
}

// Vertical waveform: map a 0..1 peak to a single left-block glyph.
// Silence/low-signal always renders as ▏ (never empty), so the wave column
// stays visually present. Higher steps need a louder peak to trigger.
const WAVE_THRESHOLDS: Array<[number, string]> = [
	[0.15, '▏'],
	[0.25, '▎'],
	[0.38, '▍'],
	[0.52, '▌'],
	[0.65, '▋'],
	[0.78, '▊'],
	[0.90, '▉'],
	[1.01, '█'],
];

export function peakToGlyph(peak: number): string {
	const p = Math.max(0, Math.min(1, peak));
	for (const [limit, glyph] of WAVE_THRESHOLDS) {
		if (p < limit) return glyph;
	}
	return '█';
}
