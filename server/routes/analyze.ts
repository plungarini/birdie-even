import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import type { Env } from '../types';

export function registerAnalyzeRoute(app: Hono<{ Bindings: Env }>): void {
	app.options('/analyze', (c) => {
		console.log('[birdie-proxy] OPTIONS /analyze', {
			origin: c.req.header('origin') ?? null,
			userAgent: c.req.header('user-agent') ?? null,
		});
		return new Response(null, { status: 204, headers: corsHeaders(c.env.ALLOWED_ORIGIN) });
	});

	app.post('/analyze', async (c) => {
		const origin = c.env.ALLOWED_ORIGIN;
		const requestStartedAt = Date.now();
		console.log('[birdie-proxy] POST /analyze start', {
			originHeader: c.req.header('origin') ?? null,
			userAgent: c.req.header('user-agent') ?? null,
			contentType: c.req.header('content-type') ?? null,
		});

		let formData: FormData;
		try {
			formData = await c.req.raw.formData();
		} catch {
			console.error('[birdie-proxy] invalid multipart body');
			return c.json({ detections: [], error: 'invalid multipart body' }, 400, corsHeaders(origin));
		}

		const file = formData.get('file');
		console.log('[birdie-proxy] multipart parsed', {
			hasFile: file instanceof File,
			fileName: file instanceof File ? file.name : null,
			fileType: file instanceof File ? file.type : null,
			fileSize: file instanceof File ? file.size : null,
		});

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 20_000);

		let upstream: Response;
		try {
			console.log('[birdie-proxy] forwarding upstream', {
				url: `${c.env.BIRDNET_SERVER_URL}/analyze`,
			});
			upstream = await fetch(`${c.env.BIRDNET_SERVER_URL}/analyze`, {
				method: 'POST',
				headers: { 'X-API-Key': c.env.BIRDNET_API_KEY },
				body: formData,
				signal: controller.signal,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error('[birdie-proxy] upstream fetch failed', { error: msg });
			return c.json({ detections: [], error: `upstream error: ${msg}` }, 502, corsHeaders(origin));
		} finally {
			clearTimeout(timeout);
		}

		if (!upstream.ok) {
			let text = '';
			try {
				text = await upstream.text();
			} catch {
				/* ignore */
			}
			console.error('[birdie-proxy] upstream non-2xx', { status: upstream.status, body: text });
			return c.json({ detections: [], error: `upstream ${upstream.status}: ${text}` }, 502, corsHeaders(origin));
		}

		let json: unknown;
		try {
			json = await upstream.json();
		} catch {
			console.error('[birdie-proxy] upstream returned invalid JSON');
			return c.json({ detections: [], error: 'upstream returned invalid JSON' }, 502, corsHeaders(origin));
		}

		console.log('[birdie-proxy] POST /analyze success', {
			durationMs: Date.now() - requestStartedAt,
			detections:
				typeof json === 'object' && json !== null && Array.isArray((json as { detections?: unknown[] }).detections)
					? (json as { detections: unknown[] }).detections.length
					: null,
			hasErrorField: typeof json === 'object' && json !== null && 'error' in json,
		});

		return c.json(json, 200, corsHeaders(origin));
	});
}
