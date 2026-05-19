import { config } from '../config';

const TIMEOUT_MS = 8_000;
const COORD_GRID_DEG = 0.1;

interface ReverseGeocodeResponseBody {
	city: string | null;
}

function endpoint(): string {
	return config.useLocalAnalyzeProxy ? '/reverse-geocode' : `${config.workerUrl}/reverse-geocode`;
}

function quantize(value: number): number {
	return Math.round(value / COORD_GRID_DEG) * COORD_GRID_DEG;
}

// Session-level memoize keyed on quantised coords + locale. Survives until
// the WebView is reloaded. The server has its own 30-day cache; this just
// prevents an N-deep duplicate fetch when prefs flap.
const sessionCache = new Map<string, Promise<string | null>>();

export function fetchCity(
	lat: number,
	lon: number,
	locale: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const latQ = quantize(lat).toFixed(2);
	const lonQ = quantize(lon).toFixed(2);
	const key = `${latQ}|${lonQ}|${locale}`;
	const cached = sessionCache.get(key);
	if (cached) return cached;

	const promise = (async () => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		const combinedSignal = signal ? combineSignals(signal, controller.signal) : controller.signal;
		try {
			const res = await fetch(endpoint(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lat, lng: lon, locale }),
				signal: combinedSignal,
			});
			if (!res.ok) return null;
			const data = (await res.json()) as ReverseGeocodeResponseBody;
			return data.city?.trim() || null;
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	})();

	// If the lookup fails, drop the cached null so a later request can retry
	// rather than being stuck with a permanent in-memory miss for this session.
	void promise.then((value) => {
		if (value === null) sessionCache.delete(key);
	});

	sessionCache.set(key, promise);
	return promise;
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
	const controller = new AbortController();
	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			return controller.signal;
		}
		signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
	}
	return controller.signal;
}
