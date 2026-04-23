import type { Detection } from '../net/types';
import type { HudRenderState, BirdieHudState } from './types';
import { LAYOUT } from './session';

const INNER_WIDTH = 544;

function alignRow(left: string, right: string, width: number): string {
  if (left.length + right.length >= width) return `${left} ${right}`.slice(0, width);
  return left + ' '.repeat(width - left.length - right.length) + right;
}

function centerLine(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function nowClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function topDetections(detections: Detection[]): string[] {
  const [top, second, third] = detections;
  if (!top) return [centerLine('No detections yet', INNER_WIDTH)];

  const lines = [
    centerLine(top.common_name.slice(0, 28), INNER_WIDTH),
    centerLine(pct(top.confidence), INNER_WIDTH),
  ];

  if (second) {
    lines.push('');
    lines.push(alignRow(second.common_name.slice(0, 22), pct(second.confidence), INNER_WIDTH));
  }
  if (third) {
    lines.push(alignRow(third.common_name.slice(0, 22), pct(third.confidence), INNER_WIDTH));
  }

  return lines;
}

function bodyForState(state: BirdieHudState): string {
  switch (state.type) {
    case 'IDLE':
      return [
        '',
        centerLine('birdie', INNER_WIDTH),
        '',
        centerLine('Ready to listen', INNER_WIDTH),
        '',
        centerLine('Tap once to start capture', INNER_WIDTH),
      ].join('\n');
    case 'LISTENING':
      return [
        '',
        centerLine('[REC] Listening', INNER_WIDTH),
        '',
        centerLine('====================', INNER_WIDTH),
        '',
        centerLine('Hold still near birdsong', INNER_WIDTH),
      ].join('\n');
    case 'ANALYZING':
      return [
        '',
        centerLine('Analyzing latest clip', INNER_WIDTH),
        '',
        centerLine('BirdNET is scoring audio', INNER_WIDTH),
        '',
        centerLine('Please hold for a moment', INNER_WIDTH),
      ].join('\n');
    case 'DETECTED':
      return ['', ...topDetections(state.detections)].join('\n');
    case 'NO_DETECTION':
      return [
        '',
        centerLine('No confident match yet', INNER_WIDTH),
        '',
        centerLine('Still listening for birds', INNER_WIDTH),
        '',
        centerLine('Try a quieter direction', INNER_WIDTH),
      ].join('\n');
    case 'ERROR':
      return [
        '',
        centerLine('Capture interrupted', INNER_WIDTH),
        '',
        centerLine(state.message.slice(0, 30), INNER_WIDTH),
        '',
        centerLine(
          state.retryCountdown > 0 ? `Retrying in ${state.retryCountdown}s` : 'Tap to try again',
          INNER_WIDTH,
        ),
      ].join('\n');
  }
}

function footerForState(state: BirdieHudState): string {
  switch (state.type) {
    case 'IDLE':
      return alignRow('tap to listen', 'birdie', INNER_WIDTH);
    case 'LISTENING':
      return alignRow('capturing ambient audio', 'tap to stop', INNER_WIDTH);
    case 'ANALYZING':
      return alignRow('uploading + identifying', 'please wait', INNER_WIDTH);
    case 'DETECTED':
      return alignRow('top match on screen', 'listening continues', INNER_WIDTH);
    case 'NO_DETECTION':
      return alignRow('no birds identified', 'listening continues', INNER_WIDTH);
    case 'ERROR':
      return alignRow('check diagnostics', state.retryCountdown > 0 ? 'auto retry' : 'tap again', INNER_WIDTH);
  }
}

export function renderHudContent(state: BirdieHudState): HudRenderState {
  return {
    layout: LAYOUT,
    textContents: {
      shield: ' ',
      header: alignRow(nowClock(), 'birdie', INNER_WIDTH),
      body: bodyForState(state),
      footer: footerForState(state),
    },
  };
}
