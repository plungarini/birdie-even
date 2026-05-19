import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { readJSON, removeKey, setJournalBridge, writeJSON } from './storage';
import {
	EMPTY_JOURNAL_INDEX,
	JOURNAL_SCHEMA_VERSION,
	JOURNAL_STORAGE_KEYS,
	LIFE_LIST_SESSIONS_CAP,
	sessionStorageKey,
	type JournalIndex,
	type JournalLifeListEntry,
	type JournalSession,
	type JournalSessionDetection,
	type SessionId,
} from './types';

type Listener = () => void;

interface JournalState {
	hydrated: boolean;
	index: JournalIndex;
}

let state: JournalState = { hydrated: false, index: EMPTY_JOURNAL_INDEX };
const listeners = new Set<Listener>();
let hydratePromise: Promise<void> | null = null;

function notify(): void {
	for (const l of listeners) l();
}

function sanitizeIndex(raw: unknown): JournalIndex {
	if (!raw || typeof raw !== 'object') return { ...EMPTY_JOURNAL_INDEX, lifeList: {} };
	const obj = raw as Partial<JournalIndex>;
	return {
		schemaVersion: JOURNAL_SCHEMA_VERSION,
		sessionIds: Array.isArray(obj.sessionIds) ? obj.sessionIds.filter((id): id is string => typeof id === 'string') : [],
		lifeList:
			obj.lifeList && typeof obj.lifeList === 'object'
				? (obj.lifeList as Record<string, JournalLifeListEntry>)
				: {},
	};
}

export async function initJournalRepository(bridge: EvenAppBridge): Promise<void> {
	setJournalBridge(bridge);
	if (hydratePromise) return hydratePromise;
	hydratePromise = (async () => {
		const raw = await readJSON<JournalIndex>(JOURNAL_STORAGE_KEYS.index);
		state = { hydrated: true, index: sanitizeIndex(raw) };
		notify();
	})();
	return hydratePromise;
}

export function subscribeJournal(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getJournalState(): JournalState {
	return state;
}

export function getJournalIndex(): JournalIndex {
	return state.index;
}

async function persistIndex(next: JournalIndex): Promise<void> {
	state = { hydrated: true, index: next };
	notify();
	await writeJSON(JOURNAL_STORAGE_KEYS.index, next);
}

export async function loadSession(id: SessionId): Promise<JournalSession | null> {
	return readJSON<JournalSession>(sessionStorageKey(id));
}

// Merge a finalized session into the index + persist both records.
export async function commitSession(session: JournalSession): Promise<void> {
	const now = session.endedAt || Date.now();
	const prevIndex = state.index;
	const sessionIds = [session.id, ...prevIndex.sessionIds.filter((id) => id !== session.id)];

	const lifeList: Record<string, JournalLifeListEntry> = { ...prevIndex.lifeList };
	for (const detection of session.detections) {
		const key = detection.scientific_name;
		const existing = lifeList[key];
		if (existing) {
			const sessions = existing.sessions.includes(session.id)
				? existing.sessions
				: [session.id, ...existing.sessions].slice(0, LIFE_LIST_SESSIONS_CAP);
			lifeList[key] = {
				...existing,
				common_name: detection.common_name || existing.common_name,
				localized_common_name: detection.localized_common_name ?? existing.localized_common_name,
				image_url: detection.image_url || existing.image_url,
				taxonomy: detection.taxonomy ?? existing.taxonomy,
				lastDetectedAt: Math.max(existing.lastDetectedAt, detection.lastDetectedAt),
				detectionCount: existing.detectionCount + detection.count,
				bestConfidence: Math.max(existing.bestConfidence, detection.bestConfidence),
				sessions,
				rarity: detection.rarity ?? existing.rarity ?? null,
			};
		} else {
			lifeList[key] = {
				scientific_name: key,
				common_name: detection.common_name,
				localized_common_name: detection.localized_common_name,
				image_url: detection.image_url,
				taxonomy: detection.taxonomy,
				firstIdentifiedAt: detection.firstDetectedAt,
				lastDetectedAt: detection.lastDetectedAt,
				detectionCount: detection.count,
				bestConfidence: detection.bestConfidence,
				sessions: [session.id],
				rarity: detection.rarity ?? null,
			};
		}
	}

	const next: JournalIndex = {
		schemaVersion: JOURNAL_SCHEMA_VERSION,
		sessionIds,
		lifeList,
	};

	// Session record first, then index — if index write fails we re-attempt next time.
	await writeJSON(sessionStorageKey(session.id), session);
	await persistIndex(next);
	void now;
}

export async function deleteSession(id: SessionId): Promise<void> {
	const prev = state.index;
	const next: JournalIndex = {
		...prev,
		sessionIds: prev.sessionIds.filter((sid) => sid !== id),
	};
	await persistIndex(next);
	await removeKey(sessionStorageKey(id));
}

export async function clearJournal(): Promise<void> {
	const prev = state.index;
	for (const id of prev.sessionIds) {
		await removeKey(sessionStorageKey(id));
	}
	await persistIndex({ ...EMPTY_JOURNAL_INDEX, lifeList: {} });
}

// Pure aggregator extracted from store.ts so both the in-memory store and the journal
// session draft compute counts/timestamps identically.
export interface AggregateInput {
	scientific_name: string;
	common_name: string;
	localized_common_name?: string;
	image_url: string;
	taxonomy: import('../net/types').TaxonomyInfo | null;
	confidence: number;
	rarity?: { tier: import('../net/detail-types').RarityTier; localCount90d: number } | null;
}

export function aggregateSessionDetection(
	existing: JournalSessionDetection | undefined,
	incoming: AggregateInput,
	now: number,
): JournalSessionDetection {
	if (existing) {
		return {
			...existing,
			common_name: incoming.common_name || existing.common_name,
			localized_common_name: incoming.localized_common_name ?? existing.localized_common_name,
			image_url: incoming.image_url || existing.image_url,
			taxonomy: incoming.taxonomy ?? existing.taxonomy,
			count: existing.count + 1,
			lastDetectedAt: now,
			bestConfidence: Math.max(existing.bestConfidence, incoming.confidence),
			rarity: incoming.rarity ?? existing.rarity ?? null,
		};
	}
	return {
		scientific_name: incoming.scientific_name,
		common_name: incoming.common_name,
		localized_common_name: incoming.localized_common_name,
		image_url: incoming.image_url,
		taxonomy: incoming.taxonomy,
		count: 1,
		firstDetectedAt: now,
		lastDetectedAt: now,
		bestConfidence: incoming.confidence,
		rarity: incoming.rarity ?? null,
	};
}
