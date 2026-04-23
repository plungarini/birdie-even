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
