function requireEnv(key: string): string {
  const v = import.meta.env[key];
  if (!v || typeof v !== 'string' || v.trim() === '') {
    throw new Error(`[birdie] Missing required env var: ${key}`);
  }
  return v.trim();
}

function requireNumber(key: string): number {
  const raw = requireEnv(key);
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`[birdie] ${key} must be a number, got: ${raw}`);
  }
  return n;
}

const workerUrl = requireEnv('VITE_WORKER_URL');
const minChunkDurationMs = requireNumber('VITE_MIN_CHUNK_DURATION_MS');
const maxChunkDurationMs = requireNumber('VITE_MAX_CHUNK_DURATION_MS');
const chunkDurationMs = requireNumber('VITE_CHUNK_DURATION_MS');
const minConfidence = requireNumber('VITE_MIN_CONFIDENCE');

if (minChunkDurationMs < 4000) {
  throw new Error(`[birdie] VITE_MIN_CHUNK_DURATION_MS must be >= 4000 (BirdNET floor), got ${minChunkDurationMs}`);
}
if (maxChunkDurationMs > 60000) {
  throw new Error(`[birdie] VITE_MAX_CHUNK_DURATION_MS must be <= 60000, got ${maxChunkDurationMs}`);
}
if (chunkDurationMs < minChunkDurationMs || chunkDurationMs > maxChunkDurationMs) {
  throw new Error(
    `[birdie] VITE_CHUNK_DURATION_MS (${chunkDurationMs}) must be in [${minChunkDurationMs}, ${maxChunkDurationMs}]`,
  );
}
if (minConfidence < 0 || minConfidence > 1) {
  throw new Error(`[birdie] VITE_MIN_CONFIDENCE must be in [0, 1], got ${minConfidence}`);
}

export const config = Object.freeze({
  workerUrl,
  chunkDurationMs,
  minChunkDurationMs,
  maxChunkDurationMs,
  minConfidence,
  // G2 mic hardware constants — not configurable
  sampleRate: 16000 as const,
  channels: 1 as const,
  bitDepth: 16 as const,
});
