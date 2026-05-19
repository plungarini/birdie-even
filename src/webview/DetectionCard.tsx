import { Badge, Card } from 'even-toolkit/web';
import React, { useEffect, useRef, useState } from 'react';
import type { TaxonomyInfo } from '../net/types';
import type { RarityTier } from '../net/detail-types';
import {
	buildBirdDetailsUrl,
	confidenceVariant,
	displayCommonName,
	formatShortRelative,
	pct,
} from './utils';

const RARITY_DOT_COLORS: Record<RarityTier, string> = {
	legendary: 'bg-indigo-500',
	rare: 'bg-amber-500',
	uncommon: 'bg-sky-500',
	common: 'bg-teal-500',
	very_common: 'bg-gray-500',
};

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.85'
			strokeLinecap='round'
			strokeLinejoin='round'
			{...props}
		>
			<circle cx='12' cy='12' r='8.5' />
			<path d='M3.9 9h16.2' />
			<path d='M3.9 15h16.2' />
			<path d='M12 3.5c2.5 2.2 4 5.2 4 8.5s-1.5 6.3-4 8.5c-2.5-2.2-4-5.2-4-8.5s1.5-6.3 4-8.5Z' />
		</svg>
	);
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			{...props}
		>
			<path d='m6.5 12.5 3.4 3.4 7.6-8.1' />
		</svg>
	);
}

export function NewBadge({ className = '' }: { className?: string }) {
	return (
		<Badge
			variant='positive'
			className={`birdie-chip ${className} bg-teal-500/20!`.trim()}
		>
			NEW
		</Badge>
	);
}

export interface DetectionCardData {
	scientific_name: string;
	common_name: string;
	localized_common_name?: string;
	image_url: string;
	taxonomy: TaxonomyInfo | null;
	bestConfidence: number;
	count: number;
	lastDetectedAt: number;
	rarity?: { tier: RarityTier; localCount90d: number } | null;
}

export function DetectionCard({
	detection,
	isBlimping = false,
	isNewToday = false,
	isLifeList = false,
	onCopyUrl,
	countLabel,
	onTap,
}: {
	detection: DetectionCardData;
	isBlimping?: boolean;
	isNewToday?: boolean;
	isLifeList?: boolean;
	onCopyUrl: (detection: DetectionCardData) => void;
	countLabel?: string;
	onTap?: (detection: DetectionCardData) => void;
}) {
	const [copied, setCopied] = useState(false);
	const copiedTimeoutRef = useRef<number | null>(null);
	const birdUrl = buildBirdDetailsUrl(detection);

	useEffect(() => {
		return () => {
			if (copiedTimeoutRef.current !== null) {
				window.clearTimeout(copiedTimeoutRef.current);
			}
		};
	}, []);

	function handleCopyClick() {
		if (!birdUrl) return;
		onCopyUrl(detection);
		setCopied(true);
		if (copiedTimeoutRef.current !== null) {
			window.clearTimeout(copiedTimeoutRef.current);
		}
		copiedTimeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			copiedTimeoutRef.current = null;
		}, 1800);
	}

	function handleCardClick() {
		if (onTap) onTap(detection);
	}

	function handleCopyClickWithStop(e: React.MouseEvent) {
		e.stopPropagation();
		handleCopyClick();
	}

	const cursorClass = onTap ? 'cursor-pointer' : '';

	return (
		<Card
			padding='none'
			className={`birdie-surface-card ${isBlimping ? 'birdie-card--blimp' : ''} ${cursorClass}`}
			onClick={handleCardClick}
		>
			<div className='birdie-card-body'>
				<div className='flex items-start justify-between gap-3'>
					{detection.image_url ?
						<img
							src={detection.image_url}
							alt=''
							className='h-16 w-16 flex-none rounded-[14px] object-cover bg-white/40'
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = 'none';
							}}
						/>
					:	null}
					<div className='min-w-0 flex-1'>
						<div className='flex items-center gap-2'>
							{isNewToday ?
								<NewBadge />
							:	null}
							<p className='text-normal-title text-text break-words'>
								{displayCommonName(detection)}
							</p>
							{detection.rarity && (
								<span
									className={`inline-block h-2 w-2 flex-none rounded-full ${RARITY_DOT_COLORS[detection.rarity.tier]}`}
									aria-label={`Rarity: ${detection.rarity.tier}`}
								/>
							)}
						</div>

						<p className='mt-1 text-detail italic text-text-dim break-words'>
							{detection.scientific_name}
						</p>
						<div className='mt-2 flex flex-wrap items-center gap-2'>
							{!isLifeList && (
								<Badge
									variant={confidenceVariant(detection.bestConfidence)}
									className='birdie-chip'
								>
									{pct(detection.bestConfidence)}
								</Badge>
							)}

							<Badge variant='neutral' className='birdie-chip'>
								{countLabel ?? `Heard ${detection.count}×`}
							</Badge>
							<Badge variant='neutral' className='birdie-chip'>
								{formatShortRelative(detection.lastDetectedAt)}
							</Badge>
						</div>
					</div>
					<button
						type='button'
						onClick={handleCopyClickWithStop}
						disabled={!birdUrl}
						aria-label={
							birdUrl ? 'Copy bird details URL' : 'Bird details URL unavailable'
						}
						title={
							birdUrl ? 'Copy bird details URL' : 'Bird details URL unavailable'
						}
						className={`birdie-copy-icon-button ${copied ? 'birdie-copy-icon-button--copied' : ''}`}
					>
						{copied ?
							<CheckIcon width={18} height={18} />
						:	<GlobeIcon width={18} height={18} />}
					</button>
				</div>
			</div>
		</Card>
	);
}
