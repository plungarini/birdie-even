import type { Detection } from './net/types';

export interface BirdieStoreState {
  isListening: boolean;
  lastDetections: Detection[];
  lastError: string | null;
  lastRawResponse: unknown;
}

type Listener = () => void;

const initialState: BirdieStoreState = {
  isListening: false,
  lastDetections: [],
  lastError: null,
  lastRawResponse: null,
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

  setListening: (v: boolean) => {
    state = { ...state, isListening: v };
    notify();
  },

  setDetections: (detections: Detection[], raw: unknown) => {
    state = { ...state, lastDetections: detections, lastRawResponse: raw, lastError: null };
    notify();
  },

  setError: (message: string) => {
    state = { ...state, lastError: message };
    notify();
  },
};
