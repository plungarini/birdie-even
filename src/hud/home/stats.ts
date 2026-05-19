// Selectors over the journal index used by the home HUD.
// Kept here (not in journal/selectors.ts) because they're presentation
// concerns — the journal layer already exposes isNewToday() and lifeList.
import { isNewToday } from '../../journal';
import type { JournalIndex } from '../../journal/types';

export function countLifeList(index: JournalIndex): number {
	return Object.keys(index.lifeList).length;
}

export function countNewToday(index: JournalIndex, now: number = Date.now()): number {
	let n = 0;
	for (const entry of Object.values(index.lifeList)) {
		if (isNewToday(entry.firstIdentifiedAt, now)) n += 1;
	}
	return n;
}
