import { Hono } from 'hono';

type Env = {
  BIRDNET_API_KEY: string;
  BIRDNET_SERVER_URL: string;
  ALLOWED_ORIGIN: string;
};

const app = new Hono<{ Bindings: Env }>();

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

app.options('/analyze', (c) => {
  return new Response(null, { status: 204, headers: corsHeaders(c.env.ALLOWED_ORIGIN) });
});

app.post('/analyze', async (c) => {
  const origin = c.env.ALLOWED_ORIGIN;

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ detections: [], error: 'invalid multipart body' }, 400, corsHeaders(origin));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let upstream: Response;
  try {
    upstream = await fetch(`${c.env.BIRDNET_SERVER_URL}/analyze`, {
      method: 'POST',
      headers: { 'X-API-Key': c.env.BIRDNET_API_KEY },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ detections: [], error: `upstream error: ${msg}` }, 502, corsHeaders(origin));
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch { /* ignore */ }
    return c.json({ detections: [], error: `upstream ${upstream.status}: ${text}` }, 502, corsHeaders(origin));
  }

  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return c.json({ detections: [], error: 'upstream returned invalid JSON' }, 502, corsHeaders(origin));
  }

  return c.json(json, 200, corsHeaders(origin));
});

export default app;
