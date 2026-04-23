import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { birdieStore } from './store';
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
    raw = detections;
    console.log('[birdie] analyze success', { detections: detections.length });
    stateMachine.onDetections(detections, raw);
  } catch (err) {
    const msg = err instanceof AnalyzeError ? err.message : String(err);
    console.error('[birdie] analyze error', msg);
    // Don't retry on 4xx — likely a config problem.
    if (err instanceof AnalyzeError && err.status !== undefined && err.status >= 400 && err.status < 500) {
      stateMachine.onNetworkError(`Error ${err.status}`);
    } else {
      stateMachine.onNetworkError(msg);
    }
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
  initCapture(bridge, onWavReady, {
    onAudioChunk: (size) => {
      birdieStore.updateDiagnostics({
        lastAudioPacketAt: Date.now(),
        lastCaptureError: null,
      });
      if (!hasLoggedFirstAudioPacket) {
        console.log('[birdie] first audio packet received', { size });
        hasLoggedFirstAudioPacket = true;
      }
    },
    onCaptureState: (event, details) => {
      if (event === 'started') {
        hasLoggedFirstAudioPacket = false;
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
        console.log('[birdie] capture stopped');
        return;
      }
      if (event === 'capture-error') {
        const message = details instanceof Error ? details.message : String(details);
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
      void startCapture().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[birdie] startCapture failed', message);
        birdieStore.updateDiagnostics({
          lastCaptureError: message,
          lastAnalyzeStatus: `capture failed: ${message}`,
        });
        stateMachine.onCaptureError(message);
        scheduleRender();
      });
    } else if (s.type === 'IDLE' && lastHudStateType !== 'IDLE') {
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
      stateMachine.onForegroundEnter();
      return;
    }

    if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      console.log('[birdie] foreground exit / abnormal exit');
      void stopCapture();
      stateMachine.onForegroundExit();
      return;
    }

    // CLICK_EVENT = 0 may arrive as undefined, but only treat it as a tap
    // when the event is coming from the text/sys input channel.
    if (type === OsEventTypeList.CLICK_EVENT || (type === undefined && hasTapCandidate)) {
      console.log('[birdie] click event accepted');
      stateMachine.onClickEvent();
      return;
    }
  });

  // Kick off initial render — show IDLE on first load.
  stateMachine.onForegroundEnter();
  scheduleRender();

  console.log('[birdie] glasses layer ready');
}

main().catch((err) => console.error('[birdie] fatal error', err));
