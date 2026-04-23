import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { birdieStore } from './store';
import { HudSession, LAYOUT } from './hud/session';
import { stateMachine } from './hud/state-machine';
import { renderHudContent } from './hud/render';
import { initCapture, startCapture, stopCapture } from './audio/capture';
import { analyze } from './net/client';
import { AnalyzeError } from './net/types';

let hudSession: HudSession | null = null;
let renderQueued = false;
let isRendering = false;

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
  const content = renderHudContent(state);
  await hudSession.render({
    layout: LAYOUT,
    textContents: { shield: ' ', main: content },
  });
}

async function onWavReady(wav: Blob) {
  stateMachine.onAnalysisStart();
  scheduleRender();

  let raw: unknown;
  try {
    const detections = await analyze(wav);
    raw = detections;
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
  initCapture(bridge, onWavReady);

  stateMachine.subscribe(() => {
    const s = stateMachine.getState();
    birdieStore.setListening(s.type === 'LISTENING' || s.type === 'ANALYZING' || s.type === 'DETECTED' || s.type === 'NO_DETECTION');
    scheduleRender();

    // Start/stop audio capture based on state.
    if (s.type === 'LISTENING') {
      void startCapture();
    } else if (s.type === 'IDLE') {
      void stopCapture();
    }
  });

  bridge.onEvenHubEvent((event) => {
    const type = event.textEvent?.eventType ?? event.sysEvent?.eventType;

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

    // CLICK_EVENT = 0 may arrive as undefined — check both.
    if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
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
