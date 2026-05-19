import type { RarityTier } from '../types';
import type { InatObservationsResult } from './inaturalist';

export const RARITY_THRESHOLDS = {
	legendary: 0,
	rare: 5,
	uncommon: 30,
	common: 150,
} as const;

export interface RarityResult {
	tier: RarityTier;
	localCount90d: number;
}

export function computeRarityFromObservations(
	observations: InatObservationsResult | null,
): RarityResult | null {
	if (!observations) return null;
	const count = observations.total_results;
	const tier = tierFromCount(count);
	return { tier, localCount90d: count };
}

function tierFromCount(count: number): RarityTier {
	if (count <= RARITY_THRESHOLDS.legendary) return 'legendary';
	if (count <= RARITY_THRESHOLDS.rare) return 'rare';
	if (count <= RARITY_THRESHOLDS.uncommon) return 'uncommon';
	if (count <= RARITY_THRESHOLDS.common) return 'common';
	return 'very_common';
}
