import { allIcons, Badge } from 'even-toolkit/web';
import { useEffect, useState } from 'react';
import type { JournalSession } from '../../journal';
import { getBirdiePreferences } from '../../preferences';
import { fetchCity } from '../../net/reverse-geocode';
import { formatLocalizedDateTime } from '../utils';

const IcChevronUp = allIcons['guide-chevron-small-drill-up'];

function formatLocationLabel(session: JournalSession, city?: string | null): string {
	if (session.location) {
		if (city) return `📍 ${city}`;
		return `📍 ${session.location.lat.toFixed(2)}°, ${session.location.lon.toFixed(2)}°`;
	}
	switch (session.locationStatus) {
		case 'denied':
			return 'Location off';
		case 'unavailable':
			return 'No location';
		case 'pending':
			return 'Location pending';
		default:
			return 'No location';
	}
}

const formatDuration = (seconds: number): string => {
	// seconds
	if (seconds < 60) {
		return `${seconds}s`;
	}

	// minutes
	if (seconds < 3600) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}m${secs > 0 ? ` ${secs}s` : ''}`;
	}

	// hours
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const hoursPart = `${hours}h`;
	const minsPart = mins > 0 ? ` ${mins}m` : '';
	return hoursPart + minsPart;
};

export function SessionHeader({
	session,
	expanded,
	showCity = false,
}: {
	session: JournalSession;
	expanded: boolean;
	showCity?: boolean;
}) {
	const [city, setCity] = useState<string | null>(null);

	useEffect(() => {
		if (!showCity || !session.location) return;
		let cancelled = false;
		const { locale } = getBirdiePreferences();
		void fetchCity(session.location.lat, session.location.lon, locale).then((resolved) => {
			if (!cancelled) setCity(resolved);
		});
		return () => { cancelled = true; };
	}, [showCity, session.location]);

	const count = session.detections.length;
	const duration =
		session.startedAt && session.endedAt ?
			Math.round((session.endedAt - session.startedAt) / 1000)
		:	0;
	const formattedDuration = formatDuration(duration);

	return (
		<div className='flex w-full items-end justify-between gap-3 relative'>
			<div className='min-w-0 flex-1'>
				<div className='flex flex-row gap-2 items-center justify-between'>
					<p className='text-normal-title text-text'>
						{formatLocalizedDateTime(session.startedAt)}
					</p>

					<p className='text-normal-title text-text-muted'>
						{formattedDuration}
					</p>
				</div>
				<div className='mt-1 flex flex-wrap items-center gap-2'>
					<Badge variant='neutral' className='birdie-chip'>
						{formatLocationLabel(session, showCity ? city : null)}
					</Badge>
					<Badge
						variant={count > 0 ? 'positive' : 'neutral'}
						className='birdie-chip'
					>
						{count === 0 ?
							'No birds'
						:	`${count} bird${count === 1 ? '' : 's'}`}
					</Badge>
				</div>
			</div>
			<span
				aria-hidden
				className={`mt-1 absolute bottom-0 right-0 text-text transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-90'}`}
			>
				<IcChevronUp width={16} height={16} />
			</span>
		</div>
	);
}
