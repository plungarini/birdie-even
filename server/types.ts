export type Env = {
	BIRDNET_API_KEY: string;
	BIRDNET_SERVER_URL: string;
	ALLOWED_ORIGIN: string;
	EBIRD_API_TOKEN: string;
	XENO_CANTO_API_KEY: string;
};

export type RarityTier = 'legendary' | 'rare' | 'uncommon' | 'common' | 'very_common';

export type IucnStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export interface BirdDetailRequest {
	scientificName: string;
	locale?: string;
	lat?: number;
	lng?: number;
}

export interface BirdDetailResponse {
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
		gallery: Array<{ url: string; attribution: string; license: string }>;
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
		spectrogramUrl: string | null;
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

export interface TaxonomyInfo {
	scientific_name: string;
	common_name: string;
	species_code: string;
	category: string;
	taxon_order: number;
	com_name_codes: string;
	sci_name_codes: string;
	banding_codes: string;
	order: string;
	family_com_name: string;
	family_sci_name: string;
	report_as: string;
	extinct: boolean;
	extinct_year: number | null;
	family_code: string;
}

export interface EnrichedSpecies {
	image_url: string;
	taxonomy: TaxonomyInfo | null;
}

export interface EnrichRequestBody {
	species?: unknown;
	locale?: unknown;
}

export interface EnrichResponse {
	locale?: string;
	results: Record<string, EnrichedSpecies>;
	errors?: Record<string, string>;
}
