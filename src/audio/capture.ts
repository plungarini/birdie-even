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

type LegacyNavigator = Navigator & {
	getUserMedia?: (
		constraints: MediaStreamConstraints,
		successCallback: (stream: MediaStream) => void,
		errorCallback?: (error: unknown) => void,
	) => void;
	webkitGetUserMedia?: (
		constraints: MediaStreamConstraints,
		successCallback: (stream: MediaStream) => void,
		errorCallback?: (error: unknown) => void,
	) => void;
};

let bridge: EvenAppBridge | null = null;
let active = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let onFlush: FlushCallback | null = null;
let onAudioChunk: AudioChunkCallback | null = null;
let onCaptureState: CaptureStateCallback | null = null;
let onWaveformPeak: WaveformCallback | null = null;
let unsubscribeEvenHubEvent: (() => void) | null = null;
let firstAudioEventLogged = false;
let pendingWaveformPeak = 0;
let lastWaveformEmitAt = 0;
let activeSource: 'g2' | 'phone' | null = null;
let phoneStream: MediaStream | null = null;
let phoneAudioContext: AudioContext | null = null;
let phoneMediaSource: MediaStreamAudioSourceNode | null = null;
let phoneProcessor: ScriptProcessorNode | null = null;
let phoneResampleBuffer = new Float32Array(0);

const WAVEFORM_EMIT_INTERVAL_MS = 84;
const PHONE_PROCESSOR_BUFFER_SIZE = 4096;

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
	unsubscribeEvenHubEvent?.();
	bridge = b;
	onFlush = flushCb;
	onAudioChunk = hooks?.onAudioChunk ?? null;
	onCaptureState = hooks?.onCaptureState ?? null;
	onWaveformPeak = hooks?.onWaveformPeak ?? null;

	unsubscribeEvenHubEvent = b.onEvenHubEvent((event) => {
		// Log the first raw audio event once to confirm field layout at runtime.
		if (!firstAudioEventLogged && (event as { audioEvent?: unknown }).audioEvent !== undefined) {
			console.log(
				'[capture] first audioEvent shape:',
				JSON.stringify(Object.keys((event as { audioEvent: Record<string, unknown> }).audioEvent)),
			);
			firstAudioEventLogged = true;
		}

		if (!active || activeSource !== 'g2') return;

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
	activeSource = getBirdiePreferences().microphoneSource;
	pendingWaveformPeak = 0;
	lastWaveformEmitAt = 0;
	phoneResampleBuffer = new Float32Array(0);
	pcmBuffer.clear();
	const flushIntervalMs = getBirdiePreferences().inferenceIntervalMs;

	try {
		if (activeSource === 'phone') {
			await startPhoneCapture();
		} else {
			await bridge!.audioControl(true);
		}
		onCaptureState?.('started');
	} catch (err) {
		console.error('[capture] startCapture failed', { source: activeSource, err });
		active = false;
		activeSource = null;
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
	const sourceToStop = activeSource;
	active = false;
	activeSource = null;
	pendingWaveformPeak = 0;
	lastWaveformEmitAt = 0;
	phoneResampleBuffer = new Float32Array(0);

	if (flushTimer !== null) {
		clearInterval(flushTimer);
		flushTimer = null;
	}
	pcmBuffer.clear();

	try {
		if (sourceToStop === 'phone') {
			await stopPhoneCapture();
		} else {
			await bridge!.audioControl(false);
		}
		onCaptureState?.('stopped');
	} catch (err) {
		console.error('[capture] stopCapture failed', { source: sourceToStop, err });
	}
}

async function startPhoneCapture(): Promise<void> {
	const stream = await requestPhoneMicrophoneStream({
		audio: {
			channelCount: 1,
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
		},
		video: false,
	});

	const AudioContextCtor =
		window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AudioContextCtor) {
		stream.getTracks().forEach((track) => track.stop());
		throw new Error('Web Audio is not available in this webview.');
	}

	const context = new AudioContextCtor();
	if (context.state === 'suspended') {
		await context.resume();
	}

	const sourceNode = context.createMediaStreamSource(stream);
	const processor = context.createScriptProcessor(PHONE_PROCESSOR_BUFFER_SIZE, 1, 1);
	processor.onaudioprocess = (event) => {
		if (!active || activeSource !== 'phone') return;
		const input = event.inputBuffer.getChannelData(0);
		const chunk = float32ToPcm16(input, event.inputBuffer.sampleRate, config.sampleRate);
		if (!chunk || chunk.byteLength === 0) return;

		pcmBuffer.push(chunk);
		onAudioChunk?.(chunk.byteLength);

		const now = Date.now();
		pendingWaveformPeak = Math.max(pendingWaveformPeak, computeChunkPeak(chunk));
		if (now - lastWaveformEmitAt >= WAVEFORM_EMIT_INTERVAL_MS) {
			onWaveformPeak?.(pendingWaveformPeak);
			pendingWaveformPeak = 0;
			lastWaveformEmitAt = now;
		}
	};

	sourceNode.connect(processor);
	processor.connect(context.destination);

	phoneStream = stream;
	phoneAudioContext = context;
	phoneMediaSource = sourceNode;
	phoneProcessor = processor;
}

async function requestPhoneMicrophoneStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
	if (navigator.mediaDevices?.getUserMedia) {
		try {
			return await navigator.mediaDevices.getUserMedia(constraints);
		} catch (err) {
			throw new Error(describePhoneMicError(err));
		}
	}

	const legacy = navigator as LegacyNavigator;
	const legacyGetUserMedia = legacy.getUserMedia ?? legacy.webkitGetUserMedia;
	if (legacyGetUserMedia) {
		return await new Promise<MediaStream>((resolve, reject) => {
			legacyGetUserMedia.call(
				legacy,
				constraints,
				(stream) => resolve(stream),
				(err) => reject(new Error(describePhoneMicError(err))),
			);
		});
	}

	const secureHint = window.isSecureContext
		? 'This Even webview does not expose a phone microphone API.'
		: 'Phone microphone usually requires a secure context (HTTPS/webview support).';
	throw new Error(`Phone microphone is not available in this webview. ${secureHint}`);
}

function describePhoneMicError(err: unknown): string {
	if (err && typeof err === 'object') {
		const record = err as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name : '';
		const message = typeof record.message === 'string' ? record.message : '';

		if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
			return 'Phone microphone permission was denied in this webview.';
		}
		if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
			return 'No phone microphone was found on this device.';
		}
		if (name === 'NotReadableError' || name === 'TrackStartError') {
			return 'Phone microphone is already in use or could not be started.';
		}
		if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
			return 'This webview could not satisfy the requested phone microphone constraints.';
		}
		if (message) {
			return `Phone microphone failed: ${message}`;
		}
	}

	return err instanceof Error ? `Phone microphone failed: ${err.message}` : 'Phone microphone failed in this webview.';
}

async function stopPhoneCapture(): Promise<void> {
	if (phoneProcessor) {
		phoneProcessor.disconnect();
		phoneProcessor.onaudioprocess = null;
		phoneProcessor = null;
	}
	if (phoneMediaSource) {
		phoneMediaSource.disconnect();
		phoneMediaSource = null;
	}
	if (phoneStream) {
		phoneStream.getTracks().forEach((track) => track.stop());
		phoneStream = null;
	}
	if (phoneAudioContext) {
		const context = phoneAudioContext;
		phoneAudioContext = null;
		await context.close().catch(() => {});
	}
}

function float32ToPcm16(input: Float32Array, inputSampleRate: number, targetSampleRate: number): Uint8Array {
	const merged = concatFloat32(phoneResampleBuffer, input);
	if (merged.length === 0) return new Uint8Array(0);

	const ratio = inputSampleRate / targetSampleRate;
	if (!Number.isFinite(ratio) || ratio <= 0) return new Uint8Array(0);

	const outputLength = Math.floor(merged.length / ratio);
	if (outputLength <= 0) {
		phoneResampleBuffer = merged as unknown as any;
		return new Uint8Array(0);
	}

	const output = new Uint8Array(outputLength * 2);
	for (let i = 0; i < outputLength; i += 1) {
		const position = i * ratio;
		const index = Math.floor(position);
		const frac = position - index;
		const a = merged[index] ?? 0;
		const b = merged[Math.min(index + 1, merged.length - 1)] ?? a;
		const sample = a + (b - a) * frac;
		const clamped = Math.max(-1, Math.min(1, sample));
		const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
		const byteIndex = i * 2;
		output[byteIndex] = int16 & 0xff;
		output[byteIndex + 1] = (int16 >> 8) & 0xff;
	}

	const consumedSamples = Math.min(merged.length, Math.max(0, Math.floor(outputLength * ratio)));
	phoneResampleBuffer = consumedSamples < merged.length ? merged.slice(consumedSamples) : new Float32Array(0);

	return output;
}

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
	if (a.length === 0) return new Float32Array(b);
	const out = new Float32Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}
