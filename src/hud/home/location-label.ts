// Pure formatter for the BL location label. Takes already-resolved inputs
// (city, coords) and falls back gracefully.
//
// Fallback chain: city → coords (lat/lng) → em-dash placeholder.

const PREFIX = '※  ';
const PLACEHOLDER = '—';

export interface LocationInputs {
	city: string | null;
	lat: number | null;
	lon: number | null;
}

export function formatLocationLabel({
	city,
	lat,
	lon,
}: LocationInputs): string {
	const trimmed = city?.trim();
	if (trimmed) return `${PREFIX}${trimmed}`;
	if (typeof lat === 'number' && typeof lon === 'number') {
		return `${PREFIX}${formatCoord(lat, 'N', 'S')}, ${formatCoord(lon, 'E', 'W')}`;
	}
	return `${PREFIX}${PLACEHOLDER}`;
}

function formatCoord(value: number, pos: string, neg: string): string {
	const hemi = value >= 0 ? pos : neg;
	return `${Math.abs(value).toFixed(2)}°${hemi}`;
}
