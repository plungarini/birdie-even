export const CACHE_TTL = {
	inatTaxa: 60 * 60 * 24 * 7,
	inatObservations: 60 * 60,
	wikipediaSummary: 60 * 60 * 24,
	wikipediaExtracts: 60 * 60 * 24,
	xenoCanto: 60 * 60 * 24 * 7,
	negative: 60 * 60,
	upstreamError: 60,
} as const;

const CACHE_NAMESPACE = 'https://cache.birdie.internal/v10/';

function namespaceKey(...parts: string[]): Request {
	return new Request(`${CACHE_NAMESPACE}${parts.map(encodeURIComponent).join('/')}`);
}

export function cacheKey(...parts: string[]): Request {
	return namespaceKey(...parts);
}

export async function cacheGet<T>(key: Request): Promise<T | null> {
	const cache = (caches as unknown as { default: Cache }).default;
	const cached = await cache.match(key);
	if (!cached) return null;
	try {
		return (await cached.json()) as T;
	} catch {
		return null;
	}
}

export async function cacheSet(key: Request, value: unknown, ttlSeconds: number): Promise<void> {
	const cache = (caches as unknown as { default: Cache }).default;
	const body = JSON.stringify(value);
	const response = new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
		},
	});
	await cache.put(key, response.clone());
}

export function coordinatesQuantized(lat: number, lng: number, gridDeg = 0.1): { latQ: number; lngQ: number } {
	return {
		latQ: Math.round(lat / gridDeg) * gridDeg,
		lngQ: Math.round(lng / gridDeg) * gridDeg,
	};
}

export function dateBucket(ttlSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const bucket = Math.floor(now / ttlSeconds) * ttlSeconds;
	return String(bucket);
}
