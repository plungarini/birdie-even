import { WAVE_LINES } from './constants';

// Ring buffer sized to the number of wave lines. Index 0 = oldest (top),
// index WAVE_LINES-1 = newest (bottom).
export class WaveformBuffer {
  private readonly buf: number[] = Array.from({ length: WAVE_LINES }, () => 0);

  push(peak: number): void {
    const clamped = Math.max(0, Math.min(1, peak));
    this.buf.shift();
    this.buf.push(clamped);
  }

  reset(): void {
    for (let i = 0; i < this.buf.length; i++) this.buf[i] = 0;
  }

  toArrayTopToBottom(): number[] {
    return this.buf.slice();
  }
}
