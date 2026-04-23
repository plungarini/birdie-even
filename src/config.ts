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

const MIN_CHUNK_DURATION_MS = 4000;
const MAX_CHUNK_DURATION_MS = 60000;

const workerUrl = requireEnv('VITE_WORKER_URL');
const chunkDurationMs = requireNumber('VITE_CHUNK_DURATION_MS');
const minConfidence = requireNumber('VITE_MIN_CONFIDENCE');
const normalizedWorkerUrl = workerUrl.replace(/\/+$/, '');
const useLocalAnalyzeProxy = import.meta.env.DEV;
const analyzeUrl = useLocalAnalyzeProxy ? '/analyze' : `${normalizedWorkerUrl}/analyze`;
const connectionLabel = useLocalAnalyzeProxy ? 'Local dev proxy (/analyze)' : normalizedWorkerUrl;
const connectionHint = useLocalAnalyzeProxy
  ? 'Vite forwards this same-origin request to Wrangler on port 3001 during local development.'
  : 'Update .env and rebuild to point Birdie at another worker.';

if (chunkDurationMs < MIN_CHUNK_DURATION_MS || chunkDurationMs > MAX_CHUNK_DURATION_MS) {
  throw new Error(
    `[birdie] VITE_CHUNK_DURATION_MS (${chunkDurationMs}) must be in [${MIN_CHUNK_DURATION_MS}, ${MAX_CHUNK_DURATION_MS}]`,
  );
}
if (minConfidence < 0 || minConfidence > 1) {
  throw new Error(`[birdie] VITE_MIN_CONFIDENCE must be in [0, 1], got ${minConfidence}`);
}

export const config = Object.freeze({
  workerUrl: normalizedWorkerUrl,
  analyzeUrl,
  useLocalAnalyzeProxy,
  connectionLabel,
  connectionHint,
  chunkDurationMs,
  minChunkDurationMs: MIN_CHUNK_DURATION_MS,
  maxChunkDurationMs: MAX_CHUNK_DURATION_MS,
  minConfidence,
  // G2 mic hardware constants — not configurable
  sampleRate: 16000 as const,
  channels: 1 as const,
  bitDepth: 16 as const,
});
