import type { JournalIndex, JournalLifeListEntry } from './types';

export function isNewToday(firstIdentifiedAt: number | null | undefined, now: number = Date.now()): boolean {
	if (!firstIdentifiedAt) return false;
	const a = new Date(firstIdentifiedAt);
	const b = new Date(now);
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function orderedLifeList(index: JournalIndex): JournalLifeListEntry[] {
	return Object.values(index.lifeList).sort((a, b) => b.lastDetectedAt - a.lastDetectedAt);
}

export function selectLifeListEntry(
	index: JournalIndex,
	scientificName: string,
): JournalLifeListEntry | undefined {
	return index.lifeList[scientificName];
}
