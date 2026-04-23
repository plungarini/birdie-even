import type { Detection } from '../net/types';
import type { HudRenderState, BirdieHudState } from './types';
import { LAYOUT } from './session';
import { alignRow, centerLine } from './utils';

const BODY_WIDTH = 544;

function nowClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function topDetections(detections: Detection[]): string[] {
  const [top, second, third] = detections;
  if (!top) return [centerLine('No detections yet', BODY_WIDTH)];

  const lines = [
    centerLine(top.common_name.slice(0, 28), BODY_WIDTH),
    centerLine(pct(top.confidence), BODY_WIDTH),
  ];

  if (second) {
    lines.push(alignRow(second.common_name.slice(0, 20), pct(second.confidence), BODY_WIDTH));
  }
  if (third) {
    lines.push(alignRow(third.common_name.slice(0, 20), pct(third.confidence), BODY_WIDTH));
  }

  return lines;
}

function bodyForState(state: BirdieHudState): string {
  switch (state.type) {
    case 'IDLE':
      return [
        '',
        centerLine('birdie', BODY_WIDTH),
        '',
        centerLine('Ready to listen', BODY_WIDTH),
        '',
        centerLine('Tap once to start capture', BODY_WIDTH),
      ].join('\n');
    case 'LISTENING':
      return [
        '',
        centerLine('[REC] Listening', BODY_WIDTH),
        '',
        centerLine('====================', BODY_WIDTH),
        '',
        centerLine('Hold still near birdsong', BODY_WIDTH),
      ].join('\n');
    case 'ANALYZING':
      return [
        '',
        centerLine('Analyzing latest clip', BODY_WIDTH),
        '',
        centerLine('BirdNET is scoring audio', BODY_WIDTH),
        '',
        centerLine('Please hold for a moment', BODY_WIDTH),
      ].join('\n');
    case 'DETECTED':
      return [''].concat(topDetections(state.detections)).join('\n');
    case 'NO_DETECTION':
      return [
        '',
        centerLine('No confident match yet', BODY_WIDTH),
        '',
        centerLine('Still listening for birds', BODY_WIDTH),
        '',
        centerLine('Try a quieter direction', BODY_WIDTH),
      ].join('\n');
    case 'ERROR':
      return [
        '',
        centerLine('Capture interrupted', BODY_WIDTH),
        '',
        centerLine(state.message.slice(0, 30), BODY_WIDTH),
        '',
        centerLine(
          state.retryCountdown > 0 ? `Retrying in ${state.retryCountdown}s` : 'Tap to try again',
          BODY_WIDTH,
        ),
      ].join('\n');
  }
}

function footerForState(state: BirdieHudState): string {
  switch (state.type) {
    case 'IDLE':
      return alignRow('tap to listen', 'birdie', BODY_WIDTH);
    case 'LISTENING':
      return alignRow('listening live', 'tap to stop', BODY_WIDTH);
    case 'ANALYZING':
      return alignRow('uploading clip', 'please wait', BODY_WIDTH);
    case 'DETECTED':
      return alignRow('top match shown', 'listening', BODY_WIDTH);
    case 'NO_DETECTION':
      return alignRow('no birds yet', 'listening', BODY_WIDTH);
    case 'ERROR':
      return alignRow('check diagnostics', state.retryCountdown > 0 ? 'auto retry' : 'tap again', BODY_WIDTH);
  }
}

export function renderHudContent(state: BirdieHudState): HudRenderState {
  return {
    layout: LAYOUT,
    textContents: {
      shield: ' ',
      header: alignRow(nowClock(), 'birdie', BODY_WIDTH),
      body: bodyForState(state),
      footer: footerForState(state),
    },
  };
}
