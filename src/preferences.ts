import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { AnalyzeRequestPreferences } from './net/types';

export interface BirdiePreferences {
	threshold: number;
	sensitivity: number;
	inferenceIntervalMs: number;
	micGain: number;
	overlap: number;
	week48: number;
	returnAllDetections: boolean;
	locationLat: number | null;
	locationLon: number | null;
}

export interface BirdiePreferencesState {
	values: BirdiePreferences;
	hydrated: boolean;
	storageReady: boolean;
}

type Listener = () => void;

const STORAGE_KEYS = {
	threshold: 'birdie.preferences.threshold',
	sensitivity: 'birdie.preferences.sensitivity',
	inferenceIntervalMs: 'birdie.preferences.inferenceIntervalMs',
	micGain: 'birdie.preferences.micGain',
	overlap: 'birdie.preferences.overlap',
	week48: 'birdie.preferences.week48',
	returnAllDetections: 'birdie.preferences.returnAllDetections',
	locationLat: 'birdie.preferences.locationLat',
	locationLon: 'birdie.preferences.locationLon',
} satisfies Record<keyof BirdiePreferences, string>;

export const preferenceRanges = Object.freeze({
	threshold: { min: 0.05, max: 0.95, step: 0.05 },
	sensitivity: { min: 0.5, max: 1.5, step: 0.05 },
	inferenceIntervalMs: { min: 4_000, max: 60_000, step: 1_000 },
	micGain: { min: 0.5, max: 10, step: 0.5 },
	overlap: { min: 0, max: 2, step: 0.1 },
	week48: { min: -1, max: 48, step: 1 },
});

export const defaultBirdiePreferences: BirdiePreferences = Object.freeze({
	threshold: 0.6,
	sensitivity: 1,
	inferenceIntervalMs: 10_000,
	micGain: 1,
	overlap: 0,
	week48: -1,
	returnAllDetections: false,
	locationLat: null,
	locationLon: null,
});

let bridge: EvenAppBridge | null = null;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
const dirtyKeys = new Set<keyof BirdiePreferences>();

let state: BirdiePreferencesState = {
	values: { ...defaultBirdiePreferences },
	hydrated: false,
	storageReady: false,
};

function notify(): void {
	for (const listener of listeners) listener();
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function sanitizePreferences(input: Partial<BirdiePreferences>): BirdiePreferences {
	return {
		threshold: round(
			clamp(
				Number(input.threshold ?? defaultBirdiePreferences.threshold),
				preferenceRanges.threshold.min,
				preferenceRanges.threshold.max,
			),
			2,
		),
		sensitivity: round(
			clamp(
				Number(input.sensitivity ?? defaultBirdiePreferences.sensitivity),
				preferenceRanges.sensitivity.min,
				preferenceRanges.sensitivity.max,
			),
			2,
		),
		inferenceIntervalMs:
			Math.round(
				clamp(
					Number(input.inferenceIntervalMs ?? defaultBirdiePreferences.inferenceIntervalMs),
					preferenceRanges.inferenceIntervalMs.min,
					preferenceRanges.inferenceIntervalMs.max,
				) / preferenceRanges.inferenceIntervalMs.step,
			) * preferenceRanges.inferenceIntervalMs.step,
		micGain: round(
			clamp(
				Number(input.micGain ?? defaultBirdiePreferences.micGain),
				preferenceRanges.micGain.min,
				preferenceRanges.micGain.max,
			),
			2,
		),
		overlap: round(
			clamp(
				Number(input.overlap ?? defaultBirdiePreferences.overlap),
				preferenceRanges.overlap.min,
				preferenceRanges.overlap.max,
			),
			2,
		),
		week48: Math.round(
			clamp(
				Number(input.week48 ?? defaultBirdiePreferences.week48),
				preferenceRanges.week48.min,
				preferenceRanges.week48.max,
			),
		),
		returnAllDetections: Boolean(input.returnAllDetections ?? defaultBirdiePreferences.returnAllDetections),
		locationLat:
			typeof input.locationLat === 'number' && Number.isFinite(input.locationLat)
				? round(clamp(input.locationLat, -90, 90), 6)
				: null,
		locationLon:
			typeof input.locationLon === 'number' && Number.isFinite(input.locationLon)
				? round(clamp(input.locationLon, -180, 180), 6)
				: null,
	};
}

function parseStoredValue<K extends keyof BirdiePreferences>(key: K, raw: string): BirdiePreferences[K] | undefined {
	if (!raw) return undefined;
	switch (key) {
		case 'returnAllDetections':
			return (raw === 'true') as BirdiePreferences[K];
		case 'locationLat':
		case 'locationLon': {
			const n = Number(raw);
			return (Number.isFinite(n) ? n : null) as BirdiePreferences[K];
		}
		default: {
			const n = Number(raw);
			return (Number.isFinite(n) ? n : undefined) as BirdiePreferences[K];
		}
	}
}

function serializeStoredValue(value: BirdiePreferences[keyof BirdiePreferences]): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	return String(value);
}

async function flushDirtyKeys(): Promise<void> {
	if (!bridge || dirtyKeys.size === 0) return;
	const keys = Array.from(dirtyKeys);
	dirtyKeys.clear();
	await Promise.all(
		keys.map(async (key) => {
			const value = serializeStoredValue(state.values[key]);
			try {
				await bridge!.setLocalStorage(STORAGE_KEYS[key], value);
			} catch (err) {
				console.warn('[birdie] preference persist failed', { key, err });
				dirtyKeys.add(key);
			}
		}),
	);
}

export async function initPreferences(nextBridge: EvenAppBridge): Promise<void> {
	bridge = nextBridge;
	if (hydratePromise) {
		await hydratePromise;
		await flushDirtyKeys();
		return;
	}

	hydratePromise = (async () => {
		const loaded = await Promise.all(
			(Object.keys(STORAGE_KEYS) as Array<keyof BirdiePreferences>).map(async (key) => {
				try {
					const raw = await nextBridge.getLocalStorage(STORAGE_KEYS[key]);
					return [key, parseStoredValue(key, raw)] as const;
				} catch (err) {
					console.warn('[birdie] preference load failed', { key, err });
					return [key, undefined] as const;
				}
			}),
		);

		const partial: Partial<BirdiePreferences> = {};
		for (const [key, value] of loaded) {
			if (value !== undefined) {
				(partial as Record<keyof BirdiePreferences, BirdiePreferences[keyof BirdiePreferences]>)[key] = value;
			}
		}

		state = {
			values: sanitizePreferences({ ...state.values, ...partial }),
			hydrated: true,
			storageReady: true,
		};
		notify();
	})();

	await hydratePromise;
	await flushDirtyKeys();
}

export function subscribePreferences(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getPreferencesState(): BirdiePreferencesState {
	return state;
}

export function getBirdiePreferences(): BirdiePreferences {
	return state.values;
}

export function updateBirdiePreferences(patch: Partial<BirdiePreferences>): void {
	const previous = state.values;
	const next = sanitizePreferences({ ...previous, ...patch });
	const changedKeys = (Object.keys(STORAGE_KEYS) as Array<keyof BirdiePreferences>).filter(
		(key) => previous[key] !== next[key],
	);
	if (changedKeys.length === 0) return;

	state = { ...state, values: next };
	for (const key of changedKeys) dirtyKeys.add(key);
	notify();
	void flushDirtyKeys();
}

export function clearBirdieLocation(): void {
	updateBirdiePreferences({ locationLat: null, locationLon: null });
}

export function getAnalyzeRequestPreferences(): AnalyzeRequestPreferences {
	const values = getBirdiePreferences();
	return {
		min_conf: values.threshold,
		sensitivity: values.sensitivity,
		overlap: values.overlap,
		week_48: values.week48,
		return_all_detections: values.returnAllDetections,
		lat: values.locationLat,
		lon: values.locationLon,
	};
}
