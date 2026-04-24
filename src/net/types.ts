// Field names match birdnetlib's recording.detections verbatim.
export interface Detection {
  common_name: string;
  scientific_name: string;
  confidence: number;
  start_time: number;
  end_time: number;
}

export interface AnalyzeResponse {
  detections: Detection[];
  error?: string;
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

export interface EnrichResponse {
  results: Record<string, EnrichedSpecies>;
  errors?: Record<string, string>;
}

export interface EnrichedDetection extends Detection {
  image_url: string;
  taxonomy: TaxonomyInfo | null;
}

export class AnalyzeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly phase?: 'fetch' | 'http' | 'invalid-json' | 'worker-error',
  ) {
    super(message);
    this.name = 'AnalyzeError';
  }
}
