import { config } from '../config';
import { birdieStore } from '../store';
import type { Detection } from '../net/types';
import type { BirdieHudState } from './types';

type Listener = (state: BirdieHudState) => void;

const ERROR_RETRY_SEC = 3;

class BirdieStateMachine {
  private state: BirdieHudState = { type: 'IDLE' };
  private readonly listeners = new Set<Listener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): BirdieHudState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onForegroundEnter(): void {
    this.transition({ type: 'IDLE' });
  }

  onForegroundExit(): void {
    this.cancelRetry();
    this.transition({ type: 'IDLE' });
  }

  onClickEvent(): void {
    const s = this.state;
    if (s.type === 'IDLE') {
      this.transition({ type: 'LISTENING' });
    } else {
      this.cancelRetry();
      this.transition({ type: 'IDLE' });
    }
  }

  onAnalysisStart(): void {
    if (this.state.type === 'LISTENING' || this.state.type === 'DETECTED' || this.state.type === 'NO_DETECTION') {
      this.transition({ type: 'ANALYZING' });
    }
  }

  onDetections(detections: Detection[], raw: unknown): void {
    birdieStore.setDetections(detections, raw);

    const filtered = detections
      .filter((d) => d.confidence >= config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    if (filtered.length > 0) {
      this.transition({ type: 'DETECTED', detections: filtered });
    } else {
      this.transition({ type: 'NO_DETECTION' });
    }
  }

  onNetworkError(message: string): void {
    birdieStore.setError(message);
    const wasListening = this.state.type !== 'IDLE';
    this.transition({ type: 'ERROR', message, retryCountdown: ERROR_RETRY_SEC });
    this.scheduleRetry(wasListening);
  }

  onCaptureError(message: string): void {
    this.cancelRetry();
    birdieStore.setError(message);
    this.transition({ type: 'ERROR', message, retryCountdown: 0 });
  }

  private scheduleRetry(wasListening: boolean): void {
    this.cancelRetry();
    let remaining = ERROR_RETRY_SEC;

    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        this.transition({ type: 'ERROR', message: (this.state as Extract<BirdieHudState, { type: 'ERROR' }>).message, retryCountdown: remaining });
        this.retryTimer = setTimeout(tick, 1000);
      } else {
        this.retryTimer = null;
        if (wasListening) {
          this.transition({ type: 'LISTENING' });
        } else {
          this.transition({ type: 'IDLE' });
        }
      }
    };

    this.retryTimer = setTimeout(tick, 1000);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private transition(next: BirdieHudState): void {
    this.state = next;
    for (const l of this.listeners) l(next);
  }
}

export const stateMachine = new BirdieStateMachine();
