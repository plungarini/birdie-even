import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import { resolveWorkerLocale } from '../lib/locales';
import { fetchCityForCoords } from '../lib/reverse-geocode';
import type { Env } from '../types';

interface ReverseGeocodeRequest {
	lat?: number;
	lng?: number;
	locale?: string;
}

interface ReverseGeocodeResponseBody {
	city: string | null;
}

export function registerReverseGeocodeRoute(app: Hono<{ Bindings: Env }>): void {
	app.options('/reverse-geocode', (c) => {
		return new Response(null, {
			status: 204,
			headers: corsHeaders(c.env.ALLOWED_ORIGIN),
		});
	});

	app.post('/reverse-geocode', async (c) => {
		const origin = c.req.header('Origin') ?? new URL(c.req.url).origin;

		let body: ReverseGeocodeRequest;
		try {
			body = (await c.req.json()) as ReverseGeocodeRequest;
		} catch {
			return c.json({ error: 'invalid json' }, 400, corsHeaders(origin));
		}

		const lat = Number(body.lat);
		const lng = Number(body.lng);
		if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
			return c.json({ error: 'lat/lng required and must be valid coordinates' }, 400, corsHeaders(origin));
		}

		const locale = resolveWorkerLocale(body.locale);
		const result = await fetchCityForCoords(lat, lng, locale);
		const response: ReverseGeocodeResponseBody = { city: result.city };
		return c.json(response, 200, {
			...corsHeaders(origin),
			'Cache-Control': 'private, max-age=3600',
		});
	});
}
