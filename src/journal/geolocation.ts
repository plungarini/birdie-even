import { AppLocationAccuracy, type AppLocationOptions } from '@evenrealities/even_hub_sdk';
import { getJournalBridge } from './storage';
import type { JournalLocation, LocationStatus } from './types';

export interface LocationResult {
	location: JournalLocation | null;
	status: LocationStatus;
}

export async function requestCurrentLocation(timeoutMs = 10_000): Promise<LocationResult> {
	const bridge = getJournalBridge();
	if (!bridge) {
		return { location: null, status: 'unavailable' };
	}

	const options: AppLocationOptions = {
		accuracy: AppLocationAccuracy.Medium,
		timeoutMs,
	};

	try {
		const result = await bridge.getAppLocation(options);
		if (!result) {
			return { location: null, status: 'unavailable' };
		}
		return {
			location: {
				lat: result.latitude,
				lon: result.longitude,
				accuracy: result.accuracy,
			},
			status: 'granted',
		};
	} catch (err) {
		console.warn('[birdie] location request failed', err);
		return { location: null, status: 'unavailable' };
	}
}
