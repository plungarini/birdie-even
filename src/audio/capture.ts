import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { config } from '../config';
import { pcmBuffer } from './buffer';
import { buildWav } from './wav';

type FlushCallback = (wav: Blob) => void;

let bridge: EvenAppBridge | null = null;
let active = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let onFlush: FlushCallback | null = null;
let firstAudioEventLogged = false;

export function initCapture(b: EvenAppBridge, flushCb: FlushCallback): void {
  bridge = b;
  onFlush = flushCb;

  b.onEvenHubEvent((event) => {
    // Log the first raw audio event once to confirm field layout at runtime.
    if (!firstAudioEventLogged && (event as { audioEvent?: unknown }).audioEvent !== undefined) {
      console.log('[capture] first audioEvent shape:', JSON.stringify(Object.keys((event as { audioEvent: Record<string, unknown> }).audioEvent)));
      firstAudioEventLogged = true;
    }

    if (!active) return;

    const audioEvent = (event as { audioEvent?: { data?: Uint8Array; pcm?: Uint8Array } }).audioEvent;
    if (!audioEvent) return;

    // Accommodate both field names (data vs pcm) until confirmed at runtime.
    const chunk = audioEvent.data ?? audioEvent.pcm;
    if (chunk instanceof Uint8Array && chunk.byteLength > 0) {
      pcmBuffer.push(chunk);
    }
  });
}

export async function startCapture(): Promise<void> {
  if (!bridge || active) return;
  active = true;
  pcmBuffer.clear();

  try {
    await (bridge as unknown as { audioControl: (v: boolean) => Promise<void> }).audioControl(true);
  } catch (err) {
    console.error('[capture] audioControl(true) failed', err);
    active = false;
    return;
  }

  flushTimer = setInterval(() => {
    if (!active || !onFlush) return;
    const pcm = pcmBuffer.flush();
    if (pcm.byteLength === 0) return;
    const wav = buildWav(pcm, config.sampleRate, config.channels, config.bitDepth);
    onFlush(wav);
  }, config.chunkDurationMs);
}

export async function stopCapture(): Promise<void> {
  if (!bridge || !active) return;
  active = false;

  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  pcmBuffer.clear();

  try {
    await (bridge as unknown as { audioControl: (v: boolean) => Promise<void> }).audioControl(false);
  } catch (err) {
    console.error('[capture] audioControl(false) failed', err);
  }
}
