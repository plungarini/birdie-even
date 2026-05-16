import type { EnrichedDetection } from '../net/types';
import { getBirdiePreferences } from '../preferences';
import { requestCurrentLocation } from './geolocation';
import {
	aggregateSessionDetection,
	commitSession,
	getJournalIndex,
} from './repository';
import {
	JOURNAL_SCHEMA_VERSION,
	type JournalLocation,
	type JournalSession,
	type JournalSessionDetection,
	type LocationStatus,
	type SessionId,
} from './types';

interface SessionDraft {
	id: SessionId;
	startedAt: number;
	location: JournalLocation | null;
	locationStatus: LocationStatus;
	detectionsByKey: Map<string, JournalSessionDetection>;
}

let draft: SessionDraft | null = null;
let newlyAddedKeys = new Set<string>();

function newSessionId(): SessionId {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function beginSession(): SessionId {
	const id = newSessionId();
	draft = {
		id,
		startedAt: Date.now(),
		location: null,
		locationStatus: 'pending',
		detectionsByKey: new Map(),
	};
	newlyAddedKeys = new Set();

	// Non-blocking location fix.
	void requestCurrentLocation().then((result) => {
		if (!draft || draft.id !== id) return;
		draft.location = result.location;
		draft.locationStatus = result.status;
	});

	return id;
}

export function isSessionActive(): boolean {
	return draft !== null;
}

export interface RecordResult {
	newSpeciesKeys: string[]; // species seen for the first time in lifetime by this batch
}

export function recordDetections(detections: EnrichedDetection[]): RecordResult {
	if (!draft) return { newSpeciesKeys: [] };
	const now = Date.now();
	const lifeList = getJournalIndex().lifeList;
	const newKeys: string[] = [];

	// Dedupe per-clip by best confidence (mirrors store.ts logic).
	const perClip = new Map<string, EnrichedDetection>();
	for (const d of detections) {
		const prev = perClip.get(d.scientific_name);
		if (!prev || d.confidence > prev.confidence) perClip.set(d.scientific_name, d);
	}

	for (const d of perClip.values()) {
		const key = d.scientific_name;
		const existingDraft = draft.detectionsByKey.get(key);
		const merged = aggregateSessionDetection(existingDraft, d, now);
		draft.detectionsByKey.set(key, merged);

		const seenInLifeList = Boolean(lifeList[key]);
		const seenAlreadyInDraft = existingDraft !== undefined;
		const lifetimeNew = !seenInLifeList && !seenAlreadyInDraft && !newlyAddedKeys.has(key);
		if (lifetimeNew) {
			newKeys.push(key);
			newlyAddedKeys.add(key);
		}
	}

	return { newSpeciesKeys: newKeys };
}

export async function endSession(): Promise<JournalSession | null> {
	if (!draft) return null;
	const active = draft;
	draft = null;
	const endedAt = Date.now();

	const detections = Array.from(active.detectionsByKey.values()).sort(
		(a, b) => b.lastDetectedAt - a.lastDetectedAt,
	);

	const keepEmpty = getBirdiePreferences().keepEmptySessions;
	if (detections.length === 0 && !keepEmpty) {
		return null;
	}

	const session: JournalSession = {
		id: active.id,
		startedAt: active.startedAt,
		endedAt,
		location: active.location,
		locationStatus: active.locationStatus,
		detections,
		schemaVersion: JOURNAL_SCHEMA_VERSION,
	};

	await commitSession(session);
	return session;
}

// For previews/diagnostics: peek at draft without committing.
export function peekDraftDetectionCount(): number {
	return draft ? draft.detectionsByKey.size : 0;
}
