import { config } from '../config';
import { birdieStore, selectOrderedDetections } from '../store';
import type { EnrichedDetection } from '../net/types';
import type { BirdieHudState } from './types';

type Listener = (state: BirdieHudState) => void;

const ERROR_RETRY_SEC = 3;

class BirdieStateMachine {
  private state: BirdieHudState = { type: 'IDLE' };
  private readonly listeners = new Set<Listener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryGeneration = 0;

  getState(): BirdieHudState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onForegroundEnter(): void {
    this.retryGeneration += 1;
    this.transition({ type: 'IDLE' });
  }

  onForegroundExit(): void {
    this.retryGeneration += 1;
    this.cancelRetry();
    this.transition({ type: 'IDLE' });
  }

  forceIdle(): void {
    this.retryGeneration += 1;
    this.cancelRetry();
    this.transition({ type: 'IDLE' });
  }

  onClickEvent(): void {
    const s = this.state;
    if (s.type === 'IDLE' || s.type === 'ERROR') {
      this.startListening();
    } else {
      this.stopListening();
    }
  }

  startListening(): void {
    if (this.state.type === 'LISTENING') return;
    this.retryGeneration += 1;
    this.cancelRetry();
    this.transition({ type: 'LISTENING' });
  }

  stopListening(): void {
    if (this.state.type === 'IDLE') return;
    this.retryGeneration += 1;
    this.cancelRetry();
    this.transition({ type: 'IDLE' });
  }

  onAnalysisStart(): void {
    if (this.state.type === 'LISTENING' || this.state.type === 'DETECTED' || this.state.type === 'NO_DETECTION') {
      this.transition({ type: 'ANALYZING' });
    }
  }

  onDetections(detections: EnrichedDetection[], raw: unknown): void {
    const filtered = detections
      .filter((d) => d.confidence >= config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    birdieStore.recordDetections(filtered, raw);

    if (filtered.length > 0) {
      const storeState = birdieStore.getState();
      const latestKey = storeState.latestBirdKey;
      const top = latestKey ? storeState.detectionsByKey[latestKey] : selectOrderedDetections(storeState)[0];
      if (top) {
        this.transition({ type: 'DETECTED', top });
        return;
      }
    }
    this.transition({ type: 'NO_DETECTION' });
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
    const generation = ++this.retryGeneration;
    let remaining = ERROR_RETRY_SEC;

    const tick = () => {
      if (generation !== this.retryGeneration) {
        this.retryTimer = null;
        return;
      }
      remaining -= 1;
      if (remaining > 0) {
        this.transition({ type: 'ERROR', message: (this.state as Extract<BirdieHudState, { type: 'ERROR' }>).message, retryCountdown: remaining });
        this.retryTimer = setTimeout(tick, 1000);
      } else {
        this.retryTimer = null;
        if (generation !== this.retryGeneration) {
          return;
        }
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
    this.retryGeneration += 1;
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
