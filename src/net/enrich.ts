import { config } from '../config';
import type { Detection, EnrichResponse, EnrichedDetection } from './types';

const TIMEOUT_MS = 15_000;

function enrichUrl(): string {
  return config.useLocalAnalyzeProxy ? '/enrich' : `${config.workerUrl}/enrich`;
}

export async function enrichSpecies(scientificNames: string[]): Promise<EnrichResponse> {
  const unique = Array.from(new Set(scientificNames.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) return { results: {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(enrichUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ species: unique }),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[birdie] enrich fetch failed', msg);
    return { results: {} };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.warn('[birdie] enrich http', res.status);
    return { results: {} };
  }

  try {
    return (await res.json()) as EnrichResponse;
  } catch {
    return { results: {} };
  }
}

export function mergeEnrichment(detections: Detection[], response: EnrichResponse): EnrichedDetection[] {
  return detections.map((d) => {
    const meta = response.results[d.scientific_name];
    return {
      ...d,
      image_url: meta?.image_url ?? '',
      taxonomy: meta?.taxonomy ?? null,
    };
  });
}
