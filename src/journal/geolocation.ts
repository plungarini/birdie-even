import type { JournalLocation, LocationStatus } from './types';

export interface LocationResult {
	location: JournalLocation | null;
	status: LocationStatus;
}

export function requestCurrentLocation(timeoutMs = 10_000): Promise<LocationResult> {
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		return Promise.resolve({ location: null, status: 'unavailable' });
	}
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve({
					location: {
						lat: position.coords.latitude,
						lon: position.coords.longitude,
						accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
					},
					status: 'granted',
				});
			},
			(error) => {
				const status: LocationStatus =
					error.code === error.PERMISSION_DENIED
						? 'denied'
						: error.code === error.POSITION_UNAVAILABLE
							? 'unavailable'
							: 'unavailable';
				resolve({ location: null, status });
			},
			{ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
		);
	});
}
