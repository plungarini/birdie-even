import type { Hono } from 'hono';
import { corsHeaders } from '../lib/cors';
import { buildBirdImageUrl } from '../lib/bird-image';
import { fetchTaxonomyCached } from '../lib/taxonomy';
import type { EnrichResponse, EnrichedSpecies, Env, TaxonomyInfo } from '../types';

interface EnrichRequestBody {
	species?: unknown;
}

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
		console.log('[birdie-proxy] POST /enrich', { count: species.length });

		if (species.length === 0) {
			return c.json({ results: {} } satisfies EnrichResponse, 200, corsHeaders(origin));
		}

		const token = c.env.EBIRD_API_TOKEN;
		const results: Record<string, EnrichedSpecies> = {};
		const errors: Record<string, string> = {};

		const settled = await Promise.all(
			species.map(async (sci) => {
				try {
					const taxonomy = await fetchTaxonomyCached(sci, token);
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

		const payload: EnrichResponse = Object.keys(errors).length > 0 ? { results, errors } : { results };
		return c.json(payload, 200, corsHeaders(origin));
	});
}
