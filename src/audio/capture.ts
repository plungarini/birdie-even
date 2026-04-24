import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { config } from '../config';
import { getBirdiePreferences } from '../preferences';
import { pcmBuffer } from './buffer';
import { buildWav } from './wav';

type FlushCallback = (wav: Blob) => void;
type AudioChunkCallback = (size: number) => void;
type CaptureStateCallback = (event: 'started' | 'stopped' | 'capture-error' | 'flushed', details?: unknown) => void;
type WaveformCallback = (peak: number) => void;

type AudioEventShape = {
  data?: Uint8Array | number[];
  pcm?: Uint8Array | number[];
  audioPcm?: Uint8Array | number[];
  jsonData?: {
    audioPcm?: Uint8Array | number[];
    data?: Uint8Array | number[];
    pcm?: Uint8Array | number[];
  };
};

let bridge: EvenAppBridge | null = null;
let active = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let onFlush: FlushCallback | null = null;
let onAudioChunk: AudioChunkCallback | null = null;
let onCaptureState: CaptureStateCallback | null = null;
let onWaveformPeak: WaveformCallback | null = null;
let firstAudioEventLogged = false;
let pendingWaveformPeak = 0;
let lastWaveformEmitAt = 0;

const WAVEFORM_EMIT_INTERVAL_MS = 84;

function applyMicGain(pcm: Uint8Array, gain: number): Uint8Array {
  if (gain <= 1.0001) return pcm;

  const out = new Uint8Array(pcm.byteLength);
  for (let i = 0; i < pcm.byteLength - 1; i += 2) {
    let sample = pcm[i] | (pcm[i + 1] << 8);
    if (sample & 0x8000) sample -= 0x10000;
    const boosted = Math.max(-32768, Math.min(32767, Math.round(sample * gain)));
    out[i] = boosted & 0xff;
    out[i + 1] = (boosted >> 8) & 0xff;
  }
  return out;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .map((item) => Math.max(0, Math.min(255, item)));
    return normalized.length > 0 ? Uint8Array.from(normalized) : null;
  }
  return null;
}

function extractChunk(audioEvent: AudioEventShape | undefined): Uint8Array | null {
  if (!audioEvent) return null;
  return (
    toUint8Array(audioEvent.data) ??
    toUint8Array(audioEvent.pcm) ??
    toUint8Array(audioEvent.audioPcm) ??
    toUint8Array(audioEvent.jsonData?.data) ??
    toUint8Array(audioEvent.jsonData?.pcm) ??
    toUint8Array(audioEvent.jsonData?.audioPcm)
  );
}

function computeChunkPeak(chunk: Uint8Array): number {
  if (chunk.byteLength < 2) return 0;

  let peak = 0;
  const step = 4;
  for (let i = 0; i < chunk.byteLength - 1; i += step) {
    let sample = chunk[i] | (chunk[i + 1] << 8);
    if (sample & 0x8000) sample -= 0x10000;
    const normalized = Math.abs(sample) / 32768;
    if (normalized > peak) peak = normalized;
  }

  // Perceptual boost: quiet birdsong often sits around 0.01-0.05 linear peak.
  // pow(0.33) lifts those into the 0.22-0.40 band so they actually show up
  // on the waveform while keeping true silence (~0.001) near the floor.
  return Math.min(1, Math.pow(peak, 0.33));
}

export function initCapture(
  b: EvenAppBridge,
  flushCb: FlushCallback,
  hooks?: {
    onAudioChunk?: AudioChunkCallback;
    onCaptureState?: CaptureStateCallback;
    onWaveformPeak?: WaveformCallback;
  },
): void {
  bridge = b;
  onFlush = flushCb;
  onAudioChunk = hooks?.onAudioChunk ?? null;
  onCaptureState = hooks?.onCaptureState ?? null;
  onWaveformPeak = hooks?.onWaveformPeak ?? null;

  b.onEvenHubEvent((event) => {
    // Log the first raw audio event once to confirm field layout at runtime.
    if (!firstAudioEventLogged && (event as { audioEvent?: unknown }).audioEvent !== undefined) {
      console.log(
        '[capture] first audioEvent shape:',
        JSON.stringify(Object.keys((event as { audioEvent: Record<string, unknown> }).audioEvent)),
      );
      firstAudioEventLogged = true;
    }

    if (!active) return;

    const audioEvent = (event as { audioEvent?: AudioEventShape }).audioEvent;
    if (!audioEvent) return;

    const chunk = extractChunk(audioEvent);
    if (chunk && chunk.byteLength > 0) {
      pcmBuffer.push(chunk);
      onAudioChunk?.(chunk.byteLength);

      const now = Date.now();
      pendingWaveformPeak = Math.max(pendingWaveformPeak, computeChunkPeak(chunk));
      if (now - lastWaveformEmitAt >= WAVEFORM_EMIT_INTERVAL_MS) {
        onWaveformPeak?.(pendingWaveformPeak);
        pendingWaveformPeak = 0;
        lastWaveformEmitAt = now;
      }
    }
  });
}

export async function startCapture(): Promise<void> {
  if (!bridge || active) return;
  active = true;
  pendingWaveformPeak = 0;
  lastWaveformEmitAt = 0;
  pcmBuffer.clear();
  const flushIntervalMs = getBirdiePreferences().inferenceIntervalMs;

  try {
    await (bridge as unknown as { audioControl: (v: boolean) => Promise<void> }).audioControl(true);
    onCaptureState?.('started');
  } catch (err) {
    console.error('[capture] audioControl(true) failed', err);
    active = false;
    onCaptureState?.('capture-error', err);
    throw err;
  }

  flushTimer = setInterval(() => {
    if (!active || !onFlush) return;
    const pcm = pcmBuffer.flush();
    if (pcm.byteLength === 0) return;
    const { micGain } = getBirdiePreferences();
    const preparedPcm = applyMicGain(pcm, micGain);
    onCaptureState?.('flushed', { byteLength: pcm.byteLength });
    const wav = buildWav(preparedPcm, config.sampleRate, config.channels, config.bitDepth);
    onFlush(wav);
  }, flushIntervalMs);
}

export async function stopCapture(): Promise<void> {
  if (!bridge) return;
  if (!active && flushTimer === null) {
    pcmBuffer.clear();
    return;
  }
  active = false;
  pendingWaveformPeak = 0;
  lastWaveformEmitAt = 0;

  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  pcmBuffer.clear();

  try {
    await (bridge as unknown as { audioControl: (v: boolean) => Promise<void> }).audioControl(false);
    onCaptureState?.('stopped');
  } catch (err) {
    console.error('[capture] audioControl(false) failed', err);
  }
}
