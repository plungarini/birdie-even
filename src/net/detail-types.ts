export type RarityTier = 'legendary' | 'rare' | 'uncommon' | 'common' | 'very_common';
export type IucnStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export interface BirdDetail {
	identity: {
		inatTaxonId: number;
		gbifTaxonKey: number;
		scientificName: string;
		commonName: string | null;
		family: string | null;
		order: string | null;
		class: string | null;
	};

	media: {
		heroPhoto: {
			url: string;
			attribution: string;
			license: string;
		} | null;
		gallery: Array<{ url: string; largeUrl: string; attribution: string; license: string }>;
	};

	description: {
		taglineShort: string | null;
		descriptionLong: string | null;
		descriptionIsFallback: boolean;
		wikipediaUrl: string | null;
	};

	conservation: {
		iucnStatus: IucnStatus | null;
		native: boolean | null;
		introduced: boolean | null;
		endemic: boolean | null;
		threatened: boolean | null;
	};

	stats: {
		globalObservationsCount: number | null;
		recordingsAvailable: number | null;
	};

	recordings: Array<{
		id: string;
		audioUrl: string;
		types: string[];
		lengthSeconds: number | null;
		country: string | null;
		location: string | null;
		recordist: string;
		license: string;
		date: string | null;
	}>;

	rarity: {
		tier: RarityTier;
		localCount90d: number;
		lastSeenNearby: {
			date: string;
			placeName: string | null;
			distanceKm: number;
		} | null;
	} | null;

	map: {
		globalTileUrlTemplate: string;
		nearbyPins: Array<{
			lat: number;
			lng: number;
			date: string;
			placeName: string | null;
			photoUrl: string | null;
		}>;
	} | null;
}

export interface BirdDetailRequest {
	scientificName: string;
	locale?: string;
	lat?: number;
	lng?: number;
}

export interface PersonalStats {
	firstIdentifiedAt: number;
	lastDetectedAt: number;
	detectionCount: number;
}
