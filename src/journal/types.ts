import type { TaxonomyInfo } from '../net/types';

export type JournalSchemaVersion = 1;
export const JOURNAL_SCHEMA_VERSION: JournalSchemaVersion = 1;

export type SessionId = string;

export type LocationStatus = 'granted' | 'denied' | 'unavailable' | 'disabled' | 'pending';

export interface JournalLocation {
	lat: number;
	lon: number;
	accuracy?: number;
}

export interface JournalSessionDetection {
	scientific_name: string;
	common_name: string;
	localized_common_name?: string;
	image_url: string;
	taxonomy: TaxonomyInfo | null;
	bestConfidence: number;
	count: number;
	firstDetectedAt: number;
	lastDetectedAt: number;
}

export interface JournalSession {
	id: SessionId;
	startedAt: number;
	endedAt: number;
	location: JournalLocation | null;
	locationStatus: LocationStatus;
	detections: JournalSessionDetection[];
	schemaVersion: JournalSchemaVersion;
}

export interface JournalLifeListEntry {
	scientific_name: string;
	common_name: string;
	localized_common_name?: string;
	image_url: string;
	taxonomy: TaxonomyInfo | null;
	firstIdentifiedAt: number;
	lastDetectedAt: number;
	detectionCount: number;
	bestConfidence: number;
	sessions: SessionId[];
}

export interface JournalIndex {
	schemaVersion: JournalSchemaVersion;
	sessionIds: SessionId[];
	lifeList: Record<string, JournalLifeListEntry>;
}

export const EMPTY_JOURNAL_INDEX: JournalIndex = {
	schemaVersion: JOURNAL_SCHEMA_VERSION,
	sessionIds: [],
	lifeList: {},
};

export const JOURNAL_STORAGE_KEYS = {
	index: 'birdie.journal.index',
	sessionPrefix: 'birdie.journal.session.',
} as const;

export function sessionStorageKey(id: SessionId): string {
	return `${JOURNAL_STORAGE_KEYS.sessionPrefix}${id}`;
}

export const LIFE_LIST_SESSIONS_CAP = 100;
