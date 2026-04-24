export function buildBirdImageUrl(scientificName: string): string {
	return `https://birdnet.cornell.edu/api2/bird/${encodeURIComponent(scientificName)}.webp`;
}
