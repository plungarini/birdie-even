import { config } from '../config';
import type { BirdDetail, BirdDetailRequest } from './detail-types';

const TIMEOUT_MS = 15_000;

function detailUrl(): string {
	return config.useLocalAnalyzeProxy ? '/bird-detail' : `${config.workerUrl}/bird-detail`;
}

export async function fetchBirdDetail(
	request: BirdDetailRequest,
	signal?: AbortSignal,
): Promise<BirdDetail> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	const combinedSignal = signal
		? combineSignals(signal, controller.signal)
		: controller.signal;

	try {
		const res = await fetch(detailUrl(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
			signal: combinedSignal,
		});

		if (!res.ok) {
			throw new Error(`bird-detail HTTP ${res.status}`);
		}

		return (await res.json()) as BirdDetail;
	} finally {
		clearTimeout(timer);
	}
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
