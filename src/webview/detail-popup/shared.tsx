import type { RarityTier } from '../../net/detail-types';

export const RARITY_DOT_COLORS: Record<RarityTier, string> = {
	legendary: 'bg-indigo-500',
	rare: 'bg-amber-500',
	uncommon: 'bg-sky-500',
	common: 'bg-teal-500',
	very_common: 'bg-gray-500',
};

export const RARITY_DOT_BORDERS: Record<RarityTier, string> = {
	legendary: 'border-indigo-500',
	rare: 'border-amber-500',
	uncommon: 'border-sky-500',
	common: 'border-teal-500',
	very_common: 'border-gray-500',
};

export const RARITY_DOT_RINGS: Record<RarityTier, string> = {
	legendary: 'ring-indigo-500/30',
	rare: 'ring-amber-500/30',
	uncommon: 'ring-sky-500/30',
	common: 'ring-teal-500/30',
	very_common: 'ring-gray-500/30',
};

export function RarityDot({
	tier,
	className = '',
}: {
	tier: RarityTier;
	className?: string;
}) {
	return (
		<span
			className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${RARITY_DOT_COLORS[tier]} ${RARITY_DOT_RINGS[tier]} ${className}`}
			aria-label={`Rarity: ${tier}`}
		/>
	);
}

export function formatRarityLabel(tier: RarityTier): string {
	return tier.replace('_', ' ');
}

export function imgErrorHide(e: React.SyntheticEvent<HTMLImageElement>) {
	(e.currentTarget as HTMLImageElement).style.display = 'none';
}

export function pluralize(
	n: number,
	singular: string,
	plural?: string,
): string {
	return n === 1 ? singular : (plural ?? `${singular}s`);
}
