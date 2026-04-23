import type { Detection } from '../net/types';
import type { BirdieHudState } from './types';

function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function detectionLines(detections: Detection[]): string {
  const top = detections[0];
  if (!top) return '';
  const lines: string[] = [`${top.common_name}`, pct(top.confidence)];
  if (detections.length > 1) {
    lines.push('─────────────');
    for (const d of detections.slice(1, 4)) {
      lines.push(`${d.common_name}  ${pct(d.confidence)}`);
    }
  }
  return lines.join('\n');
}

// Pure functions: (state) => string. No SDK, no side effects — trivially testable.

export function renderHudContent(state: BirdieHudState): string {
  switch (state.type) {
    case 'IDLE':
      return 'BirdLens\nPress to start';

    case 'LISTENING':
      return '◉ Listening...\n━━━━━━━━━━';

    case 'ANALYZING':
      return '◉ Analyzing...';

    case 'DETECTED':
      return detectionLines(state.detections);

    case 'NO_DETECTION':
      return '◉ No birds yet\nStill listening...';

    case 'ERROR':
      return `⚠ Offline\nRetrying in ${state.retryCountdown}s`;
  }
}
