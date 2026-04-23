import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { config } from './config';
import { birdieStore } from './store';
import { registerCaptureControlHandler } from './control';
import { HudSession } from './hud/session';
import { stateMachine } from './hud/state-machine';
import { renderHudContent } from './hud/render';
import { initCapture, startCapture, stopCapture } from './audio/capture';
import { analyze } from './net/client';
import { AnalyzeError } from './net/types';

let hudSession: HudSession | null = null;
let renderQueued = false;
let isRendering = false;
let analysisInFlight = false;
let lastHudStateType: string | null = null;
let hasLoggedFirstAudioPacket = false;
let lastAudioDiagnosticsAt = 0;
let captureSessionToken = 0;
let shouldKeepListening = false;

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
      hint:
        err.phase === 'fetch'
          ? 'Check the local Wrangler server, Vite proxy, and device reachability.'
          : err.phase === 'http'
            ? 'Inspect the worker response body and upstream BirdNET availability.'
            : err.phase === 'invalid-json'
              ? 'The worker responded, but not with valid JSON.'
              : 'The worker returned an explicit error payload.',
    };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    status: null,
    phase: 'unknown',
    endpoint: config.analyzeUrl,
    hint: 'Check Birdie capture, the local server, and network reachability.',
  };
}

function scheduleRender() {
  if (!hudSession) return;
  if (isRendering) { renderQueued = true; return; }
  isRendering = true;
  void doRender()
    .catch((err) => console.error('[birdie] render error', err))
    .finally(() => {
      isRendering = false;
      if (renderQueued) { renderQueued = false; scheduleRender(); }
    });
}

async function doRender() {
  if (!hudSession) return;
  const state = stateMachine.getState();
  const renderState = renderHudContent(state);
  await hudSession.render(renderState);
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
  scheduleRender();

  let raw: unknown;
  try {
    console.log('[birdie] analyze start', { wavBytes: wav.size });
    const detections = await analyze(wav);
    if (requestToken !== captureSessionToken || stateMachine.getState().type === 'IDLE') {
      console.log('[birdie] stale analyze result ignored', { requestToken, captureSessionToken });
      return;
    }
    raw = detections;
    console.log('[birdie] analyze success', { detections: detections.length });
    stateMachine.onDetections(detections, raw);
  } catch (err) {
    const details = getAnalyzeErrorDetails(err);
    const msg = details.message;
    if (requestToken !== captureSessionToken || stateMachine.getState().type === 'IDLE') {
      console.log('[birdie] stale analyze error ignored', { requestToken, captureSessionToken, message: msg });
      return;
    }
    console.error('[birdie] analyze failed', details);
    stateMachine.onNetworkError(msg);
  } finally {
    analysisInFlight = false;
  }
  scheduleRender();
}

async function main() {
  console.log('[birdie] glasses layer starting');

  let bridge;
  try {
    bridge = await waitForEvenAppBridge();
    console.log('[birdie] bridge acquired');
  } catch (err) {
    console.error('[birdie] bridge unavailable', err);
    return;
  }

  hudSession = new HudSession(bridge);
  registerCaptureControlHandler(handleCaptureIntent);
  birdieStore.setCaptureActive(false);
  initCapture(bridge, onWavReady, {
    onAudioChunk: (size) => {
      const now = Date.now();
      if (!hasLoggedFirstAudioPacket) {
        birdieStore.updateDiagnostics({
          lastAudioPacketAt: now,
          lastCaptureError: null,
        });
        console.log('[birdie] first audio packet received', { size });
        hasLoggedFirstAudioPacket = true;
        lastAudioDiagnosticsAt = now;
        return;
      }
      if (now - lastAudioDiagnosticsAt >= 3000) {
        birdieStore.updateDiagnostics({
          lastAudioPacketAt: now,
        });
        lastAudioDiagnosticsAt = now;
      }
    },
    onWaveformPeak: (peak) => {
      birdieStore.pushWaveformPeak(peak);
    },
    onCaptureState: (event, details) => {
      if (event === 'started') {
        hasLoggedFirstAudioPacket = false;
        lastAudioDiagnosticsAt = 0;
        birdieStore.setCaptureActive(true);
        birdieStore.resetWaveform();
        birdieStore.updateDiagnostics({
          lastCaptureStartedAt: Date.now(),
          lastCaptureError: null,
          lastAnalyzeStatus: 'capture started',
        });
        console.log('[birdie] capture started');
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
        console.log('[birdie] capture flushed', { byteLength });
        return;
      }
      if (event === 'stopped') {
        hasLoggedFirstAudioPacket = false;
        lastAudioDiagnosticsAt = 0;
        birdieStore.setCaptureActive(false);
        birdieStore.resetWaveform();
        console.log('[birdie] capture stopped');
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

  stateMachine.subscribe(() => {
    const s = stateMachine.getState();
    console.log('[birdie] state transition', { from: lastHudStateType, to: s.type });
    birdieStore.setHudState(s);
    scheduleRender();

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
        scheduleRender();
      });
    } else if (s.type === 'IDLE' && lastHudStateType !== 'IDLE') {
      captureSessionToken += 1;
      birdieStore.setCaptureActive(false);
      void stopCapture();
    }
    lastHudStateType = s.type;
  });

  bridge.onEvenHubEvent((event) => {
    if ((event as { audioEvent?: unknown }).audioEvent !== undefined) {
      return;
    }

    const type = event.textEvent?.eventType ?? event.sysEvent?.eventType;
    const hasTapCandidate = event.textEvent !== undefined || event.sysEvent !== undefined;

    if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      console.log('[birdie] foreground enter');
      shouldKeepListening = false;
      birdieStore.setCaptureActive(false);
      stateMachine.onForegroundEnter();
      return;
    }

    if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      console.log('[birdie] foreground exit / abnormal exit');
      shouldKeepListening = false;
      birdieStore.setCaptureActive(false);
      void stopCapture();
      stateMachine.onForegroundExit();
      return;
    }

    // CLICK_EVENT = 0 may arrive as undefined, but only treat it as a tap
    // when the event is coming from the text/sys input channel.
    if (type === OsEventTypeList.CLICK_EVENT || (type === undefined && hasTapCandidate)) {
      handleCaptureIntent('toggle');
      return;
    }
  });

  // Kick off initial render — show IDLE on first load.
  stateMachine.onForegroundEnter();
  scheduleRender();

  console.log('[birdie] glasses layer ready');
}

main().catch((err) => console.error('[birdie] fatal error', err));
