import { OsEventTypeList, waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { initCapture, startCapture, stopCapture } from './audio/capture';
import { config } from './config';
import { registerCaptureControlHandler } from './control';
import { generateBlackImageData, loadBirdImageData } from './hud/bird-image';
import { ANIM_FRAME_MS, IMG_H, IMG_W } from './hud/constants';
import { buildPopupText, buildWaveContent, renderInitialListeningHud, renderStaticHud } from './hud/render';
import { HudSession, LAYOUTS } from './hud/session';
import { stateMachine } from './hud/state-machine';
import { WaveformBuffer } from './hud/waveform-buffer';
import { analyze } from './net/client';
import { AnalyzeError } from './net/types';
import {
	getAnalyzeRequestPreferences,
	getPreferencesState,
	initPreferences,
	subscribePreferences,
} from './preferences';
import { birdieStore } from './store';

let hudSession: HudSession | null = null;
let analysisInFlight = false;
let lastHudStateType: string | null = null;
let hasLoggedFirstAudioPacket = false;
let lastAudioDiagnosticsAt = 0;
let captureSessionToken = 0;
let shouldKeepListening = false;

// Listening-mode loops & state.
const waveBuffer = new WaveformBuffer();
let animTick = 0;
let animTimer: ReturnType<typeof setInterval> | null = null;
let popupSpeciesKey: string | null = null;
let popupTextContent = '';
let imageContainerClear = true;

function handleCaptureIntent(intent: 'start' | 'stop' | 'toggle' = 'toggle') {
	const currentType = stateMachine.getState().type;
	const wantsStart = intent === 'start' || (intent === 'toggle' && (currentType === 'IDLE' || currentType === 'ERROR'));

	if (wantsStart) {
		shouldKeepListening = true;
		stateMachine.startListening();
		return;
	}

	shouldKeepListening = false;
	captureSessionToken += 1;
	analysisInFlight = false;
	stateMachine.stopListening();
}

function getAnalyzeErrorDetails(err: unknown) {
	if (err instanceof AnalyzeError) {
		return {
			message: err.message,
			status: err.status ?? null,
			phase: err.phase ?? 'unknown',
			endpoint: config.analyzeUrl,
		};
	}
	return {
		message: err instanceof Error ? err.message : String(err),
		status: null,
		phase: 'unknown',
		endpoint: config.analyzeUrl,
	};
}

function isListeningLayoutActive(): boolean {
	return hudSession?.getActiveLayoutKey() === LAYOUTS.listening.key;
}

async function renderStatic(): Promise<void> {
	if (!hudSession) return;
	const state = stateMachine.getState();
	await hudSession.render(renderStaticHud(state));
}

async function renderListeningInitial(): Promise<void> {
	if (!hudSession) return;
	await hudSession.render(renderInitialListeningHud());
	// Per SDK docs, image container starts as an invisible placeholder — no initial send needed.
	popupSpeciesKey = null;
	popupTextContent = '';
	imageContainerClear = true;
}

function startAnimLoop(): void {
	if (animTimer) return;
	animTimer = setInterval(() => {
		if (!hudSession || !isListeningLayoutActive()) return;
		animTick += 1;
		const wave = buildWaveContent(animTick, waveBuffer.toArrayTopToBottom());
		hudSession.upgradeText('wave', wave);
	}, ANIM_FRAME_MS);
}

function stopAnimLoop(): void {
	if (animTimer) {
		clearInterval(animTimer);
		animTimer = null;
	}
}

function renderListeningIfCaptureIsActive(): void {
	if (isListeningLayoutActive()) {
		startAnimLoop();
		return;
	}
	if (!isListeningState(stateMachine.getState().type)) return;
	renderListeningInitial()
		.then(() => {
			if (isListeningState(stateMachine.getState().type)) {
				startAnimLoop();
			}
		})
		.catch((err) => console.error('[birdie] renderListeningInitial failed', err));
}

async function dismissPopup(): Promise<void> {
	popupSpeciesKey = null;
	popupTextContent = '';
	if (!hudSession || !isListeningLayoutActive()) return;
	hudSession.upgradeText('birdInfo', ' ');
	if (!imageContainerClear) {
		const black = await generateBlackImageData(IMG_W, IMG_H);
		hudSession.upgradeImage('birdImage', black);
		imageContainerClear = true;
	}
}

function upgradePopupText(content: string): void {
	if (!hudSession || !isListeningLayoutActive()) return;
	if (popupTextContent === content) return;
	hudSession.upgradeText('birdInfo', content);
	popupTextContent = content;
}

async function showOrRefreshPopupForKey(key: string): Promise<void> {
	if (!hudSession || !isListeningLayoutActive()) return;
	const detection = birdieStore.getState().detectionsByKey[key];
	if (!detection) return;

	const nextText = buildPopupText(detection);
	if (popupSpeciesKey === key) {
		// Same bird: only refresh the text content so the heard count/confidence can change.
		upgradePopupText(nextText);
		return;
	}

	popupSpeciesKey = key;
	// Text goes first in the serial queue so it lands before the image.
	upgradePopupText(nextText);

	if (detection.image_url) {
		const imageData = await loadBirdImageData(detection.image_url);
		if (imageData && popupSpeciesKey === key && isListeningLayoutActive()) {
			hudSession.upgradeImage('birdImage', imageData);
			imageContainerClear = false;
		}
	}
}

async function onWavReady(wav: Blob) {
	if (analysisInFlight) {
		console.warn('[birdie] dropping audio flush while analysis is already in flight');
		return;
	}

	const requestToken = captureSessionToken;
	analysisInFlight = true;
	birdieStore.updateDiagnostics({
		lastAnalyzeStatus: `analyzing ${wav.size}B clip`,
		lastAnalyzeAt: Date.now(),
	});
	stateMachine.onAnalysisStart();

	try {
		console.log('[birdie] analyze start', { wavBytes: wav.size });
		const detections = await analyze(wav, getAnalyzeRequestPreferences());
		if (requestToken !== captureSessionToken || stateMachine.getState().type === 'IDLE') {
			console.log('[birdie] stale analyze result ignored');
			return;
		}
		console.log('[birdie] analyze success', { detections: detections.length });
		stateMachine.onDetections(detections, detections);
	} catch (err) {
		const details = getAnalyzeErrorDetails(err);
		if (requestToken !== captureSessionToken || stateMachine.getState().type === 'IDLE') {
			console.log('[birdie] stale analyze error ignored', details);
			return;
		}
		console.error('[birdie] analyze failed', details);
		stateMachine.onNetworkError(details.message);
	} finally {
		analysisInFlight = false;
	}
}

async function main() {
	console.log('[birdie] glasses layer starting');

	let bridge: EvenAppBridge;
	try {
		bridge = await waitForEvenAppBridge();
		console.log('[birdie] bridge acquired');
	} catch (err) {
		console.error('[birdie] bridge unavailable', err);
		return;
	}

	hudSession = new HudSession(bridge);
	await initPreferences(bridge);
	birdieStore.setPreferences(getPreferencesState().values);
	subscribePreferences(() => {
		birdieStore.setPreferences(getPreferencesState().values);
	});
	registerCaptureControlHandler(handleCaptureIntent);
	birdieStore.setCaptureActive(false);
	initCapture(bridge, onWavReady, {
		onAudioChunk: (size) => {
			const now = Date.now();
			if (!hasLoggedFirstAudioPacket) {
				birdieStore.updateDiagnostics({ lastAudioPacketAt: now, lastCaptureError: null });
				console.log('[birdie] first audio packet received', { size });
				hasLoggedFirstAudioPacket = true;
				lastAudioDiagnosticsAt = now;
				return;
			}
			if (now - lastAudioDiagnosticsAt >= 3000) {
				birdieStore.updateDiagnostics({ lastAudioPacketAt: now });
				lastAudioDiagnosticsAt = now;
			}
		},
		onWaveformPeak: (peak) => {
			birdieStore.pushWaveformPeak(peak);
			waveBuffer.push(peak);
		},
		onCaptureState: (event, details) => {
			if (event === 'started') {
				hasLoggedFirstAudioPacket = false;
				lastAudioDiagnosticsAt = 0;
				birdieStore.setCaptureActive(true);
				birdieStore.resetWaveform();
				waveBuffer.reset();
				renderListeningIfCaptureIsActive();
				birdieStore.updateDiagnostics({
					lastCaptureStartedAt: Date.now(),
					lastCaptureError: null,
					lastAnalyzeStatus: 'capture started',
				});
				return;
			}
			if (event === 'flushed') {
				const byteLength =
					typeof details === 'object' && details !== null && 'byteLength' in details
						? Number((details as { byteLength: unknown }).byteLength) || 0
						: 0;
				birdieStore.updateDiagnostics({
					lastFlushBytes: byteLength,
					lastAnalyzeStatus: `flushed ${byteLength}B clip`,
				});
				return;
			}
			if (event === 'stopped') {
				hasLoggedFirstAudioPacket = false;
				lastAudioDiagnosticsAt = 0;
				birdieStore.setCaptureActive(false);
				birdieStore.resetWaveform();
				waveBuffer.reset();
				return;
			}
			if (event === 'capture-error') {
				const message = details instanceof Error ? details.message : String(details);
				birdieStore.setCaptureActive(false);
				birdieStore.updateDiagnostics({
					lastCaptureError: message,
					lastAnalyzeStatus: `capture error: ${message}`,
				});
			}
		},
	});

	// Respond to HUD state changes.
	stateMachine.subscribe(() => {
		const s = stateMachine.getState();
		console.log('[birdie] state transition', { from: lastHudStateType, to: s.type });
		birdieStore.setHudState(s);

		const entersListeningLayout =
			s.type === 'LISTENING' || s.type === 'ANALYZING' || s.type === 'DETECTED' || s.type === 'NO_DETECTION';

		if (entersListeningLayout && (!lastHudStateType || !isListeningState(lastHudStateType))) {
			// Draw listening UI only after capture reports that the microphone started.
			if (birdieStore.getState().isCaptureActive) {
				renderListeningIfCaptureIsActive();
			}
		} else if (!entersListeningLayout && lastHudStateType && isListeningState(lastHudStateType)) {
			stopAnimLoop();
			popupSpeciesKey = null;
			popupTextContent = '';
			imageContainerClear = true;
			renderStatic().catch((err) => console.error('[birdie] renderStatic failed', err));
		} else if (!entersListeningLayout) {
			renderStatic().catch((err) => console.error('[birdie] renderStatic failed', err));
		}

		// Start/stop audio capture based on state.
		if (s.type === 'LISTENING' && lastHudStateType !== 'LISTENING') {
			if (!shouldKeepListening) {
				console.log('[birdie] ignoring retry to LISTENING because capture was stopped by user');
				stateMachine.forceIdle();
				return;
			}
			captureSessionToken += 1;
			void startCapture().catch((err) => {
				const message = err instanceof Error ? err.message : String(err);
				birdieStore.setCaptureActive(false);
				console.error('[birdie] startCapture failed', message);
				birdieStore.updateDiagnostics({
					lastCaptureError: message,
					lastAnalyzeStatus: `capture failed: ${message}`,
				});
				stateMachine.onCaptureError(message);
			});
		} else if (s.type === 'IDLE' && lastHudStateType !== 'IDLE') {
			captureSessionToken += 1;
			birdieStore.setCaptureActive(false);
			void stopCapture();
		}

		// If DETECTED: surface popup for current top.
		if (s.type === 'DETECTED') {
			const key = s.top.scientific_name;
			showOrRefreshPopupForKey(key).catch((err) => console.error('[birdie] showOrRefreshPopupForKey failed', err));
		} else if (s.type === 'NO_DETECTION' && popupSpeciesKey !== null) {
			dismissPopup().catch((err) => console.error('[birdie] dismissPopup failed', err));
		}

		lastHudStateType = s.type;
	});

	bridge.onEvenHubEvent((event) => {
		// Ignore audio frames — capture.ts has its own listener for them.
		if ((event as { audioEvent?: unknown }).audioEvent !== undefined) return;

		// Per docs/input-events.md, clicks can arrive on textEvent, sysEvent
		// (simulator) or listEvent, so we coalesce across all three.
		const type =
			event.textEvent?.eventType ??
			event.sysEvent?.eventType ??
			event.listEvent?.eventType;
		const hasInteractionEvent =
			event.textEvent !== undefined ||
			event.sysEvent !== undefined ||
			event.listEvent !== undefined;

		if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
			console.log('[birdie] foreground enter');
			return;
		}

		if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
			console.log('[birdie] foreground exit');
			return;
		}

		if (type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
			console.log('[birdie] abnormal exit');
			return;
		}

		// Even Hub submission requirement: root-page double-tap must invoke the
		// host's exit dialogue via shutDownPageContainer(1). Birdie is a single
		// root page, so this applies whether listening or idle — stop capture
		// first so we don't leave the mic hot on exit.
		if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
			shouldKeepListening = false;
			captureSessionToken += 1;
			analysisInFlight = false;
			birdieStore.setCaptureActive(false);
			void stopCapture();
			void bridge.shutDownPageContainer(1).catch((err) => console.error('[birdie] shutDownPageContainer failed', err));
			return;
		}

		// CLICK_EVENT = 0 is normalized to undefined by the SDK's fromJson
		// (docs/input-events.md §"Event quirks"). Match both forms, but only
		// when an interaction event object is actually present so we don't
		// fire on unrelated payloads.
		if (type === OsEventTypeList.CLICK_EVENT || (type === undefined && hasInteractionEvent)) {
			console.log('CLICK EVENT');
			handleCaptureIntent('toggle');
			return;
		}
	});

	stateMachine.onForegroundEnter();
	await renderStatic();

	console.log('[birdie] glasses layer ready');
}

function isListeningState(t: string): boolean {
	return t === 'LISTENING' || t === 'ANALYZING' || t === 'DETECTED' || t === 'NO_DETECTION';
}

main().catch((err) => console.error('[birdie] fatal error', err));
