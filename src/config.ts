function requireEnv(key: string): string {
  const v = import.meta.env[key];
  if (!v || typeof v !== 'string' || v.trim() === '') {
    throw new Error(`[birdie] Missing required env var: ${key}`);
  }
  return v.trim();
}

const workerUrl = requireEnv('VITE_WORKER_URL');
const normalizedWorkerUrl = workerUrl.replace(/\/+$/, '');
const useLocalAnalyzeProxy = import.meta.env.DEV;
const isProdPackMode = import.meta.env.MODE === 'prod';

if (isProdPackMode && /^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/|$)/i.test(normalizedWorkerUrl)) {
  throw new Error('[birdie] Refusing to package with local VITE_WORKER_URL. Create .env.prod with the deployed worker URL.');
}

const analyzeUrl = useLocalAnalyzeProxy ? '/analyze' : `${normalizedWorkerUrl}/analyze`;
const connectionLabel = useLocalAnalyzeProxy ? 'Local dev proxy (/analyze)' : normalizedWorkerUrl;
const connectionHint = useLocalAnalyzeProxy
  ? 'Vite forwards this same-origin request to Wrangler on port 3001 during local development.'
  : 'Update .env and rebuild to point Birdie at another worker.';

export const config = Object.freeze({
  workerUrl: normalizedWorkerUrl,
  analyzeUrl,
  useLocalAnalyzeProxy,
  connectionLabel,
  connectionHint,
  // G2 mic hardware constants — not configurable
  sampleRate: 16000 as const,
  channels: 1 as const,
  bitDepth: 16 as const,
});
