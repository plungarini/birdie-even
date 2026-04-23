import { config } from '../config';

// At 16 kHz, mono, 16-bit: 1 second = 32,000 bytes.
const BYTES_PER_SECOND = (config.sampleRate * config.channels * config.bitDepth) / 8;
const MAX_BUFFER_BYTES = (config.maxChunkDurationMs / 1000) * BYTES_PER_SECOND;

const chunks: Uint8Array[] = [];
let totalBytes = 0;

export const pcmBuffer = {
  push(chunk: Uint8Array): void {
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
    // Drop oldest chunks if we exceed the memory cap.
    while (totalBytes > MAX_BUFFER_BYTES && chunks.length > 0) {
      totalBytes -= chunks.shift()!.byteLength;
    }
  },

  // Returns a single concatenated Uint8Array and clears the buffer.
  flush(): Uint8Array {
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    chunks.length = 0;
    totalBytes = 0;
    return out;
  },

  clear(): void {
    chunks.length = 0;
    totalBytes = 0;
  },

  get byteLength(): number {
    return totalBytes;
  },
};
