import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import { buildBirdImageUrl } from '../lib/bird-image';
import { resolveWorkerLocale, SUPPORTED_LOCALES } from '../lib/locales';
import { fetchTaxonomyCached } from '../lib/taxonomy';
import type { EnrichRequestBody, EnrichResponse, EnrichedSpecies, Env, TaxonomyInfo } from '../types';

function normaliseSpeciesList(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of raw) {
		if (typeof item !== 'string') continue;
		const trimmed = item.trim();
		if (!trimmed) continue;
		if (seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

export function registerEnrichRoute(app: Hono<{ Bindings: Env }>): void {
	app.options('/enrich', (c) =>
		new Response(null, { status: 204, headers: corsHeaders(c.env.ALLOWED_ORIGIN) }),
	);

	app.post('/enrich', async (c) => {
		const origin = c.env.ALLOWED_ORIGIN;
		let body: EnrichRequestBody;
		try {
			body = (await c.req.json()) as EnrichRequestBody;
		} catch {
			return c.json({ results: {}, errors: { _root: 'invalid json' } } satisfies EnrichResponse, 400, corsHeaders(origin));
		}

		const species = normaliseSpeciesList(body.species);
		const locale = resolveWorkerLocale(typeof body.locale === 'string' ? body.locale : undefined);
		console.log('[birdie-proxy] POST /enrich', { count: species.length, locale });

		if (species.length === 0) {
			return c.json({ locale, results: {} } satisfies EnrichResponse, 200, corsHeaders(origin));
		}

		const token = c.env.EBIRD_API_TOKEN;
		const results: Record<string, EnrichedSpecies> = {};
		const errors: Record<string, string> = {};

		const settled = await Promise.all(
			species.map(async (sci) => {
				try {
					const taxonomy = await fetchTaxonomyCached(sci, token, locale);
					return { sci, taxonomy, err: null as string | null };
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return { sci, taxonomy: null as TaxonomyInfo | null, err: msg };
				}
			}),
		);

		for (const row of settled) {
			results[row.sci] = {
				image_url: buildBirdImageUrl(row.sci),
				taxonomy: row.taxonomy,
			};
			if (row.err) errors[row.sci] = row.err;
		}

		const payload: EnrichResponse = Object.keys(errors).length > 0 ? { locale, results, errors } : { locale, results };
		return c.json(payload, 200, corsHeaders(origin));
	});

	app.get('/i18n/langs', (c) => {
		return c.json({ langs: [...SUPPORTED_LOCALES] }, 200, corsHeaders(c.env.ALLOWED_ORIGIN));
	});
}
