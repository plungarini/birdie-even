// Compose the home HUD's text contents from already-derived inputs. No
// store/journal/preference reads happen here — the orchestrator gathers
// the data and feeds it in.
import type { HudRenderState } from '../types';
import { HOME_LAYOUT } from './layout';
import { formatLocationLabel, type LocationInputs } from './location-label';
import {
	buildBottomRow,
	buildTopRow,
	formatLifeListBR,
	formatTimeHHMM,
} from './regions';

export interface HomeRenderInputs {
	now: Date;
	location: LocationInputs;
	lifeListCount: number;
	newTodayCount: number;
}

export function composeHomeContents(inputs: HomeRenderInputs): {
	homeTop: string;
	homeBottom: string;
} {
	const time = formatTimeHHMM(inputs.now);
	const bl = formatLocationLabel(inputs.location);
	const br = formatLifeListBR(inputs.lifeListCount, inputs.newTodayCount);

	return {
		homeTop: buildTopRow(time),
		homeBottom: buildBottomRow(bl, br),
	};
}

export function renderHomeHud(inputs: HomeRenderInputs): HudRenderState {
	const contents = composeHomeContents(inputs);
	return {
		layout: HOME_LAYOUT,
		textContents: {
			eventCapture: ' ',
			homeTop: contents.homeTop,
			homeBottom: contents.homeBottom,
		},
	};
}
