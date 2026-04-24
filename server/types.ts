export type Env = {
	BIRDNET_API_KEY: string;
	BIRDNET_SERVER_URL: string;
	ALLOWED_ORIGIN: string;
	EBIRD_API_TOKEN: string;
};

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
