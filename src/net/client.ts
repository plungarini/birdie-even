import { config } from '../config';
import { AnalyzeError, type AnalyzeResponse, type Detection } from './types';

const TIMEOUT_MS = 15_000;

export async function analyze(wavBlob: Blob): Promise<Detection[]> {
  const form = new FormData();
  form.append('file', wavBlob, 'audio.wav');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${config.workerUrl}/analyze`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnalyzeError(`fetch failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 4xx: don't retry (bad request, auth error, etc.)
    throw new AnalyzeError(`HTTP ${res.status}`, res.status);
  }

  let body: AnalyzeResponse;
  try {
    body = (await res.json()) as AnalyzeResponse;
  } catch {
    throw new AnalyzeError('invalid JSON from worker');
  }

  if (body.error) {
    throw new AnalyzeError(body.error);
  }

  const detections = Array.isArray(body.detections) ? body.detections : [];

  return detections
    .filter((d) => d.confidence >= config.minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}
