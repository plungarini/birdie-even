import type { BirdieHudState } from './hud/types';
import type { EnrichedDetection } from './net/types';

const WAVEFORM_HISTORY_LENGTH = 56;

export interface BirdieDiagnostics {
  lastCaptureStartedAt: number | null;
  lastAudioPacketAt: number | null;
  lastFlushBytes: number | null;
  lastAnalyzeStatus: string | null;
  lastAnalyzeAt: number | null;
  lastCaptureError: string | null;
}

export interface AggregatedDetection extends EnrichedDetection {
  count: number;
  firstDetectedAt: number;
  lastDetectedAt: number;
  bestConfidence: number;
}

export interface BirdieStoreState {
  hudStateType: BirdieHudState['type'];
  isListening: boolean;
  isCaptureActive: boolean;
  detectionsByKey: Record<string, AggregatedDetection>;
  detectionOrder: string[]; // MRU first
  latestBirdKey: string | null;       // top confidence bird in the last clip (for HUD)
  latestBirdKeys: string[];           // all birds in the last clip (for webview blimp)
  latestBirdUpdatedAt: number | null;
  lastDetectionsUpdatedAt: number | null;
  lastError: string | null;
  lastRawResponse: unknown;
  waveformPeaks: number[];
  diagnostics: BirdieDiagnostics;
}

type Listener = () => void;

const initialState: BirdieStoreState = {
  hudStateType: 'IDLE',
  isListening: false,
  isCaptureActive: false,
  detectionsByKey: {},
  detectionOrder: [],
  latestBirdKey: null,
  latestBirdKeys: [],
  latestBirdUpdatedAt: null,
  lastDetectionsUpdatedAt: null,
  lastError: null,
  lastRawResponse: null,
  waveformPeaks: Array.from({ length: WAVEFORM_HISTORY_LENGTH }, () => 0),
  diagnostics: {
    lastCaptureStartedAt: null,
    lastAudioPacketAt: null,
    lastFlushBytes: null,
    lastAnalyzeStatus: null,
    lastAnalyzeAt: null,
    lastCaptureError: null,
  },
};

let state: BirdieStoreState = { ...initialState };
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function keyOf(d: { scientific_name: string }): string {
  return d.scientific_name;
}

export const birdieStore = {
  getState: () => state,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setHudState: (hudState: BirdieHudState) => {
    const isListening =
      hudState.type === 'LISTENING' ||
      hudState.type === 'ANALYZING' ||
      hudState.type === 'DETECTED' ||
      hudState.type === 'NO_DETECTION';
    state = { ...state, hudStateType: hudState.type, isListening };
    notify();
  },

  setCaptureActive: (isCaptureActive: boolean) => {
    state = { ...state, isCaptureActive };
    notify();
  },

  recordDetections: (detections: EnrichedDetection[], raw: unknown) => {
    const now = Date.now();

    // Dedupe by scientific_name within this clip, keeping highest confidence.
    const perClip = new Map<string, EnrichedDetection>();
    for (const d of detections) {
      const k = keyOf(d);
      const prev = perClip.get(k);
      if (!prev || d.confidence > prev.confidence) perClip.set(k, d);
    }

    const byKey = { ...state.detectionsByKey };
    const orderSet = new Set(state.detectionOrder);

    // Most-recent-first: start from MRU birds of this clip (sorted by conf desc).
    const clipBirds = Array.from(perClip.values()).sort((a, b) => b.confidence - a.confidence);

    let topKey: string | null = null;
    let topConf = -1;

    for (const d of clipBirds) {
      const k = keyOf(d);
      const existing = byKey[k];
      const merged: AggregatedDetection = existing
        ? {
            ...existing,
            ...d,
            count: existing.count + 1,
            firstDetectedAt: existing.firstDetectedAt,
            lastDetectedAt: now,
            bestConfidence: Math.max(existing.bestConfidence, d.confidence),
          }
        : {
            ...d,
            count: 1,
            firstDetectedAt: now,
            lastDetectedAt: now,
            bestConfidence: d.confidence,
          };
      byKey[k] = merged;
      if (d.confidence > topConf) {
        topConf = d.confidence;
        topKey = k;
      }
    }

    // Build new order: clip birds (highest conf first) at the top, then prior order.
    const newOrder: string[] = [];
    const seen = new Set<string>();
    for (const d of clipBirds) {
      const k = keyOf(d);
      if (!seen.has(k)) {
        newOrder.push(k);
        seen.add(k);
      }
    }
    for (const k of state.detectionOrder) {
      if (!seen.has(k) && orderSet.has(k) === false) continue;
      if (!seen.has(k)) {
        newOrder.push(k);
        seen.add(k);
      }
    }

    state = {
      ...state,
      detectionsByKey: byKey,
      detectionOrder: newOrder,
      latestBirdKey: topKey,
      latestBirdKeys: clipBirds.map((d) => keyOf(d)),
      latestBirdUpdatedAt: topKey ? now : state.latestBirdUpdatedAt,
      lastDetectionsUpdatedAt: now,
      lastRawResponse: raw,
      lastError: null,
      diagnostics: {
        ...state.diagnostics,
        lastAnalyzeStatus: clipBirds.length > 0 ? 'detections received' : 'no detections returned',
        lastAnalyzeAt: now,
      },
    };
    notify();
  },

  dismissLatestBird: () => {
    state = { ...state, latestBirdKey: null };
    notify();
  },

  setError: (message: string) => {
    state = {
      ...state,
      lastError: message,
      diagnostics: {
        ...state.diagnostics,
        lastAnalyzeStatus: `error: ${message}`,
        lastAnalyzeAt: Date.now(),
      },
    };
    notify();
  },

  updateDiagnostics: (patch: Partial<BirdieDiagnostics>) => {
    state = { ...state, diagnostics: { ...state.diagnostics, ...patch } };
    notify();
  },

  pushWaveformPeak: (peak: number) => {
    const clamped = Math.max(0, Math.min(1, peak));
    state = {
      ...state,
      waveformPeaks: [...state.waveformPeaks.slice(-(WAVEFORM_HISTORY_LENGTH - 1)), clamped],
    };
    notify();
  },

  resetWaveform: () => {
    state = {
      ...state,
      waveformPeaks: Array.from({ length: WAVEFORM_HISTORY_LENGTH }, () => 0),
    };
    notify();
  },
};

export function selectOrderedDetections(s: BirdieStoreState): AggregatedDetection[] {
  return s.detectionOrder.map((k) => s.detectionsByKey[k]).filter(Boolean);
}
