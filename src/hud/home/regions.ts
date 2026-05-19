// Pure formatters for each corner-anchored region. No subscriptions, no IO —
// just take the already-derived inputs and return the display string.
import { HUD_WIDTH } from '../constants';
import { alignRow } from '../utils';

export function buildTopRow(time: string): string {
	// TL slot is covered by the bird icon image — leave the left side empty
	// and right-align the clock to the HUD edge.
	return alignRow('', time, HUD_WIDTH);
}

export function buildBottomRow(left: string, right: string): string {
	return alignRow(left, right, HUD_WIDTH);
}

export function formatTimeHHMM(now: Date): string {
	return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function formatLifeListBR(
	speciesCount: number,
	newToday: number,
): string {
	const noun = speciesCount === 1 ? 'species' : 'species';
	const base = `${speciesCount} ${noun}`;
	return newToday > 0 ? `(+${newToday}) ${base}` : base;
}
