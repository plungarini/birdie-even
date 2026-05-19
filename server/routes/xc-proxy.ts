import { Hono } from 'hono';
import type { Env } from '../types';

const xcProxy = new Hono<{ Bindings: Env }>();

const XC_BASE = 'https://xeno-canto.org';
const CACHE_VERSION = 'v4';
const THIRTY_DAYS = 2_592_000;

const workerCaches = caches as unknown as CacheStorage & { default: Cache };

function corsHeaders(): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
}

xcProxy.options('*', (c) => {
	c.status(204);
	return c.text('', corsHeaders());
});

xcProxy.get('/audio/:id', async (c) => {
	const id = c.req.param('id');

	if (!/^\d+$/.test(id)) {
		return c.text('Invalid params', 400);
	}

	const rangeHeader = c.req.header('range');

	const cache = workerCaches.default;
	const cacheKey = new Request(`${c.req.raw.url}?cv=${CACHE_VERSION}`);
	const cached = rangeHeader ? undefined : await cache.match(cacheKey);
	if (cached) {
		const ct = cached.headers.get('content-type') ?? '';
		console.log(
			`[birdie-proxy] xc audio ${id}: cache HIT content-type=${ct}`,
		);
		if (ct.startsWith('audio/')) return cached;
		console.log(`[birdie-proxy] xc audio ${id}: cache SKIP (${ct})`);
	}

	const upstreamUrl = `${XC_BASE}/${id}/download`;
	const upstream = await fetch(upstreamUrl, {
		headers: rangeHeader ? { Range: rangeHeader } : undefined,
	});
	const upstreamStatus = upstream.status;
	const upstreamContentType = upstream.headers.get('content-type') ?? '(none)';
	console.log(
		`[birdie-proxy] xc audio ${id}: upstream ${upstreamStatus} content-type=${upstreamContentType}`,
	);

	if (!upstream.ok && upstream.status !== 206) {
		return c.text('Upstream error', upstreamStatus === 404 ? 404 : 502);
	}

	// iOS WKWebView doesn't support WAV in <audio> elements.
	// Filter to MP3 only — anything else the browser can't decode.
	if (upstreamContentType !== 'audio/mpeg' && upstreamContentType !== 'audio/mp3') {
		return c.text('Unsupported format', 502);
	}

	const headers = new Headers();
	headers.set('content-type', upstreamContentType);
	const passthrough = ['content-length', 'content-range', 'accept-ranges'];
	for (const h of passthrough) {
		const v = upstream.headers.get(h);
		if (v) headers.set(h, v);
	}
	headers.set('cache-control', `public, max-age=${THIRTY_DAYS}, immutable`);
	headers.set('Access-Control-Allow-Origin', '*');

	const response = new Response(upstream.body, {
		status: upstream.status,
		headers,
	});

	if (!rangeHeader && upstream.ok) {
		console.log(
			`[birdie-proxy] xc audio ${id}: caching ${upstreamContentType}`,
		);
		c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
	}
	return response;
});

export { xcProxy };