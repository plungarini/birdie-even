// Home / IDLE HUD — corner-anchored field-research layout.
//
// Four regions: TL bird icon (image), TR clock, BL location, BR life-list
// count. Each text region is its own container so the per-region updates
// (minute tick, journal change, geocode resolve) push through the text
// queue independently rather than re-rendering one big string on every
// event.
import { HUD_HEIGHT, HUD_WIDTH } from '../constants';
import { HOME_IMG_H, HOME_IMG_W } from '../home-image';
import type { HudLayoutDescriptor } from '../types';

export const HOME_IMAGE_X = 0;
export const HOME_IMAGE_Y = 0;
export const HOME_LINE_HEIGHT = 27; // pretext font line height (see font_measure.js)
export const HOME_ROW_HEIGHT = HOME_LINE_HEIGHT;

// Top row shares a line with the icon — the image overlaps the left side,
// the clock sits on the right. Container height matches one text line so
// the clock baseline lands on the same row as the icon.
export const HOME_TOP_Y = 0;
export const HOME_TOP_H = Math.max(HOME_IMG_H, HOME_ROW_HEIGHT);

// Bottom row hugs the bottom edge.
export const HOME_BOTTOM_H = HOME_ROW_HEIGHT + 4;
export const HOME_BOTTOM_Y = HUD_HEIGHT - HOME_BOTTOM_H;

const SHADOW_CAPTURE = {
	containerID: 0,
	containerName: 'eventCapture',
	xPosition: 0,
	yPosition: 0,
	width: HUD_WIDTH,
	height: HUD_HEIGHT,
	paddingLength: 0,
	borderWidth: 0,
	isEventCapture: 1,
} as const;

export const HOME_LAYOUT: HudLayoutDescriptor = {
	key: 'birdie.home.v3',
	textDescriptors: [
		SHADOW_CAPTURE,
		{
			containerID: 20,
			containerName: 'homeTop',
			xPosition: 0,
			yPosition: HOME_TOP_Y,
			width: HUD_WIDTH,
			height: HOME_TOP_H,
			paddingLength: 0,
			borderWidth: 0,
			isEventCapture: 0,
		},
		{
			containerID: 22,
			containerName: 'homeBottom',
			xPosition: 0,
			yPosition: HOME_BOTTOM_Y,
			width: HUD_WIDTH,
			height: HOME_BOTTOM_H,
			paddingLength: 0,
			borderWidth: 0,
			isEventCapture: 0,
		},
	],
	imageDescriptors: [
		{
			containerID: 23,
			containerName: 'homeImage',
			xPosition: HOME_IMAGE_X,
			yPosition: HOME_IMAGE_Y,
			width: HOME_IMG_W,
			height: HOME_IMG_H,
		},
	],
};
