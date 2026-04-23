import type { BirdieHudState } from './hud/types';
import type { Detection } from './net/types';

const WAVEFORM_HISTORY_LENGTH = 56;

export interface BirdieDiagnostics {
  lastCaptureStartedAt: number | null;
  lastAudioPacketAt: number | null;
  lastFlushBytes: number | null;
  lastAnalyzeStatus: string | null;
  lastAnalyzeAt: number | null;
  lastCaptureError: string | null;
}

export interface BirdieStoreState {
  hudStateType: BirdieHudState['type'];
  isListening: boolean;
  isCaptureActive: boolean;
  lastDetections: Detection[];
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
  lastDetections: [],
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

  setDetections: (detections: Detection[], raw: unknown) => {
    state = {
      ...state,
      lastDetections: detections,
      lastDetectionsUpdatedAt: Date.now(),
      lastRawResponse: raw,
      lastError: null,
      diagnostics: {
        ...state.diagnostics,
        lastAnalyzeStatus: detections.length > 0 ? 'detections received' : 'no detections returned',
        lastAnalyzeAt: Date.now(),
      },
    };
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
    state = {
      ...state,
      diagnostics: {
        ...state.diagnostics,
        ...patch,
      },
    };
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
