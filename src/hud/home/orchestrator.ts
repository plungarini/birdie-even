// Home HUD orchestrator. The single place that wires together the clock,
// journal, preferences, and reverse-geocode lookup. Everything else in
// `hud/home/` is a pure function — this file is where the IO lives.
import { getJournalIndex, subscribeJournal } from '../../journal';
import { fetchCity } from '../../net/reverse-geocode';
import { getPreferencesState, subscribePreferences } from '../../preferences';
import type { HudSession } from '../session';
import { onMinuteChange } from './clock';
import { composeHomeContents, renderHomeHud } from './render';
import { countLifeList, countNewToday } from './stats';

interface HomeOrchestratorState {
	active: boolean;
	now: Date;
	cityByCoord: Map<string, string>;
	pendingCoord: string | null;
}

const COORD_GRID_DEG = 0.1;

function coordKey(lat: number | null, lon: number | null): string | null {
	if (typeof lat !== 'number' || typeof lon !== 'number') return null;
	const latQ = (Math.round(lat / COORD_GRID_DEG) * COORD_GRID_DEG).toFixed(2);
	const lonQ = (Math.round(lon / COORD_GRID_DEG) * COORD_GRID_DEG).toFixed(2);
	return `${latQ}|${lonQ}`;
}

export interface HomeOrchestrator {
	initialRender: () => ReturnType<typeof renderHomeHud>;
	onEnterHome: () => void;
	onExitHome: () => void;
	dispose: () => void;
}

export function createHomeOrchestrator(hudSession: HudSession): HomeOrchestrator {
	const state: HomeOrchestratorState = {
		active: false,
		now: new Date(),
		cityByCoord: new Map(),
		pendingCoord: null,
	};

	let stopClock: (() => void) | null = null;
	const unsubs: Array<() => void> = [];

	function currentInputs() {
		const prefs = getPreferencesState().values;
		const journal = getJournalIndex();
		const key = coordKey(prefs.locationLat, prefs.locationLon);
		const city = key ? state.cityByCoord.get(key) ?? null : null;
		return {
			now: state.now,
			location: {
				city,
				lat: prefs.locationLat,
				lon: prefs.locationLon,
			},
			lifeListCount: countLifeList(journal),
			newTodayCount: countNewToday(journal, state.now.getTime()),
		};
	}

	function pushAll(): void {
		if (!state.active) return;
		const contents = composeHomeContents(currentInputs());
		hudSession.upgradeText('homeTop', contents.homeTop);
		hudSession.upgradeText('homeBottom', contents.homeBottom);
	}

	function maybeFetchCity(): void {
		const prefs = getPreferencesState().values;
		const key = coordKey(prefs.locationLat, prefs.locationLon);
		if (!key) return;
		if (state.cityByCoord.has(key)) return;
		if (state.pendingCoord === key) return;
		state.pendingCoord = key;
		const lat = prefs.locationLat as number;
		const lon = prefs.locationLon as number;
		const locale = prefs.locale;
		void fetchCity(lat, lon, locale).then((city) => {
			if (state.pendingCoord === key) state.pendingCoord = null;
			if (!city) return;
			state.cityByCoord.set(key, city);
			pushAll();
		});
	}

	function startClock(): void {
		if (stopClock) return;
		stopClock = onMinuteChange(() => {
			state.now = new Date();
			pushAll();
		});
	}

	function stopClockTick(): void {
		if (stopClock) {
			stopClock();
			stopClock = null;
		}
	}

	// Subscriptions stay attached for the lifetime of the orchestrator —
	// when home is inactive `pushAll()` short-circuits and the underlying
	// HudSession will drop upgrades for inactive containers anyway. Cheap
	// enough to not need fine-grained attach/detach.
	unsubs.push(
		subscribeJournal(() => {
			pushAll();
		}),
	);
	unsubs.push(
		subscribePreferences(() => {
			maybeFetchCity();
			pushAll();
		}),
	);

	return {
		initialRender: () => {
			state.now = new Date();
			maybeFetchCity();
			return renderHomeHud(currentInputs());
		},
		onEnterHome: () => {
			state.active = true;
			state.now = new Date();
			maybeFetchCity();
			startClock();
			pushAll();
		},
		onExitHome: () => {
			state.active = false;
			stopClockTick();
		},
		dispose: () => {
			state.active = false;
			stopClockTick();
			for (const u of unsubs) u();
			unsubs.length = 0;
		},
	};
}
