import { config } from '../config';
import { AnalyzeError, type AnalyzeRequestPreferences, type AnalyzeResponse, type Detection } from './types';

const TIMEOUT_MS = 15_000;

export async function analyze(wavBlob: Blob, preferences: AnalyzeRequestPreferences): Promise<Detection[]> {
  const form = new FormData();
  form.append('file', wavBlob, 'audio.wav');
  form.append('settings', JSON.stringify(preferences));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(config.analyzeUrl, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === 'AbortError'
        ? `request timed out after ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new AnalyzeError(
      `fetch to ${config.analyzeUrl} failed: ${msg}. Check the local server, Vite proxy, network access, or CORS.`,
      undefined,
      'fetch',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    const clone = res.clone();
    try {
      const maybeJson = (await clone.json()) as Partial<AnalyzeResponse> & { error?: string };
      if (maybeJson.error) message = maybeJson.error;
    } catch {
      try {
        const text = await res.text();
        if (text.trim()) message = `${message}: ${text.trim()}`;
      } catch {
        // ignore
      }
    }
    throw new AnalyzeError(message, res.status, 'http');
  }

  let body: AnalyzeResponse;
  try {
    body = (await res.json()) as AnalyzeResponse;
  } catch {
    throw new AnalyzeError('invalid JSON from worker', res.status, 'invalid-json');
  }

  if (body.error) throw new AnalyzeError(body.error, res.status, 'worker-error');

  const detections = Array.isArray(body.detections) ? body.detections : [];
  return detections
    .filter((d) => d.confidence >= preferences.min_conf)
    .sort((a, b) => b.confidence - a.confidence);
}
