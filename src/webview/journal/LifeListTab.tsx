import { allIcons } from 'even-toolkit/web';
import type { JSX, SVGProps } from 'react';
import { useMemo, useState } from 'react';
import { getJournalIndex, isNewToday, orderedLifeList } from '../../journal';
import type { TaxonomyInfo } from '../../net/types';
import type { PersonalStats } from '../../net/detail-types';
import { DetectionCard, type DetectionCardData } from '../DetectionCard';
import { BirdDetailPopup } from '../BirdDetailPopup';
import { buildBirdDetailsUrl, copyTextWithExecCommand } from '../utils';

type SvgIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element;
const SearchIcon = allIcons['guide-search'] as unknown as SvgIcon;
const ClearIcon = allIcons['edit-cross-small'] as unknown as SvgIcon;

function normalizeQuery(query: string) {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function entryMatchesQuery(
	entry: {
		scientific_name: string;
		common_name: string;
		localized_common_name?: string;
		taxonomy: TaxonomyInfo | null;
	},
	tokens: string[],
) {
	if (tokens.length === 0) return true;

	const textParts = [
		entry.scientific_name,
		entry.common_name,
		entry.localized_common_name ?? '',
	];

	if (entry.taxonomy) {
		textParts.push(
			...Object.values(entry.taxonomy)
				.filter(
					(value): value is string | number | boolean =>
						value !== null &&
						value !== undefined &&
						(typeof value === 'string' ||
							typeof value === 'number' ||
							typeof value === 'boolean'),
				)
				.map((value) => String(value)),
		);
	}

	const haystack = textParts.join(' ').toLowerCase();
	return tokens.every((token) => haystack.includes(token));
}

export function LifeListTab({ onToast }: { onToast: (msg: string) => void }) {
	const [query, setQuery] = useState('');
	const [popupSpecies, setPopupSpecies] = useState<{
		scientificName: string;
		personalStats: PersonalStats;
	} | null>(null);
	const entries = orderedLifeList(getJournalIndex());
	const tokens = useMemo(() => normalizeQuery(query), [query]);
	const filteredEntries = useMemo(
		() => entries.filter((entry) => entryMatchesQuery(entry, tokens)),
		[entries, tokens],
	);

	function handleCopy(detection: DetectionCardData) {
		const url = buildBirdDetailsUrl(detection);
		if (!url) {
			onToast('Bird details URL unavailable');
			return;
		}
		const ok = copyTextWithExecCommand(url);
		onToast(ok ? 'Copied bird details URL' : 'Copy failed');
	}

	function handleTapDetection(detection: DetectionCardData) {
		const entry = entries.find((e) => e.scientific_name === detection.scientific_name);
		setPopupSpecies({
			scientificName: detection.scientific_name,
			personalStats: entry
				? {
						firstIdentifiedAt: entry.firstIdentifiedAt,
						lastDetectedAt: entry.lastDetectedAt,
						detectionCount: entry.detectionCount,
					}
				: { firstIdentifiedAt: 0, lastDetectedAt: 0, detectionCount: 0 },
		});
	}

	if (entries.length === 0) {
		return (
			<div className='rounded-[18px] border border-dashed border-border bg-white px-4 py-6'>
				<p className='text-normal-title text-text'>Your life list is empty</p>
				<p className='mt-1 text-normal-body text-text-dim'>
					Birds you identify will appear here, deduped across all sessions, with
					the most recent on top.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className='flex flex-col gap-3'>
				<label className='birdie-field'>
					<span className='birdie-setting-label'>Search life list</span>
					<div className='birdie-input-with-icon'>
						<SearchIcon width={18} height={18} className='birdie-search-icon' />
						<input
							type='search'
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className='birdie-input birdie-input-with-icon__input'
							placeholder='Search species or family'
						/>
						{query ?
							<button
								type='button'
								className='birdie-input-icon-button'
								onClick={() => setQuery('')}
								aria-label='Clear search'
							>
								<ClearIcon width={14} height={14} />
							</button>
						:	null}
					</div>
				</label>
				<p className='text-detail text-text-dim'>
					{filteredEntries.length} species in your life list
				</p>
				{filteredEntries.map((entry) => {
					const card: DetectionCardData = {
						scientific_name: entry.scientific_name,
						common_name: entry.common_name,
						localized_common_name: entry.localized_common_name,
						image_url: entry.image_url,
						taxonomy: entry.taxonomy,
						bestConfidence: entry.bestConfidence,
						count: entry.detectionCount,
						lastDetectedAt: entry.lastDetectedAt,
					};
					return (
						<DetectionCard
							key={entry.scientific_name}
							detection={card}
							isNewToday={isNewToday(entry.firstIdentifiedAt)}
							isLifeList={true}
							onCopyUrl={handleCopy}
							onTap={handleTapDetection}
						/>
					);
				})}
			</div>

			{popupSpecies && (
				<BirdDetailPopup
					scientificName={popupSpecies.scientificName}
					onClose={() => setPopupSpecies(null)}
					personalStats={popupSpecies.personalStats}
				/>
			)}
		</>
	);
}
