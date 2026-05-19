import {
	CreateStartUpPageContainer,
	ImageContainerProperty,
	ImageRawDataUpdate,
	ImageRawDataUpdateResult,
	RebuildPageContainer,
	StartUpPageCreateResult,
	TextContainerProperty,
	TextContainerUpgrade,
	type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import {
	HUD_CONTENT_CHAR_LIMIT,
	HUD_HEIGHT,
	HUD_WIDTH,
	IMG_H,
	IMG_W,
	INFO_BODY_GAP,
	INFO_FOOTER_H,
	INFO_GAP,
	INFO_HEADER_H,
	LISTEN_SLIM_W,
} from './constants';
import { HOME_LAYOUT } from './home/layout';
import type { HudLayoutDescriptor, HudRenderState } from './types';

// Invisible full-size shadow event-capture container. Declared first so it
// sits below the visible content (containerID 0). The Even Hub host requires
// exactly one container with isEventCapture: 1; by keeping it empty and
// borderless it doesn't draw anything on the HUD.
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

// Default (IDLE / non-listening) layout — shadow capture + header + body.
const STATIC_LAYOUT: HudLayoutDescriptor = {
	key: 'birdie.static.v1',
	textDescriptors: [
		SHADOW_CAPTURE,
		{
			containerID: 1,
			containerName: 'header',
			xPosition: 12,
			yPosition: 0,
			width: HUD_WIDTH - 24,
			height: 40,
			paddingLength: 4,
			isEventCapture: 0,
		},
		{
			containerID: 2,
			containerName: 'body',
			xPosition: 0,
			yPosition: 38,
			width: HUD_WIDTH,
			height: HUD_HEIGHT - 40,
			paddingLength: 15,
			borderWidth: 1,
			borderColor: 13,
			borderRadius: 12,
			isEventCapture: 0,
		},
	],
};

// Listening layout — shadow capture + wave column + 3 info rows + image.
// The middle column is split into header/body/footer text containers so the
// bird's identity, summary, and badges can update independently.
const INFO_X = LISTEN_SLIM_W + INFO_GAP;
const INFO_W = HUD_WIDTH - LISTEN_SLIM_W - INFO_GAP - IMG_W;
const INFO_HEADER_Y = 0;
const INFO_BODY_Y = INFO_HEADER_Y + INFO_HEADER_H + INFO_BODY_GAP;
const INFO_FOOTER_Y = HUD_HEIGHT - INFO_FOOTER_H;
const INFO_BODY_H = INFO_FOOTER_Y - INFO_BODY_Y - INFO_BODY_GAP;

const LISTENING_LAYOUT: HudLayoutDescriptor = {
	key: 'birdie.listening.v2',
	textDescriptors: [
		SHADOW_CAPTURE,
		{
			containerID: 10,
			containerName: 'wave',
			xPosition: 0,
			yPosition: 0,
			width: LISTEN_SLIM_W,
			height: HUD_HEIGHT,
			paddingLength: 2,
			borderWidth: 0,
			isEventCapture: 0,
		},
		{
			containerID: 11,
			containerName: 'birdHeader',
			xPosition: INFO_X,
			yPosition: INFO_HEADER_Y,
			width: INFO_W,
			height: INFO_HEADER_H,
			paddingLength: 4,
			borderWidth: 0,
			isEventCapture: 0,
		},
		{
			containerID: 12,
			containerName: 'birdBody',
			xPosition: INFO_X,
			yPosition: INFO_BODY_Y,
			width: INFO_W,
			height: INFO_BODY_H,
			paddingLength: 4,
			borderWidth: 0,
			isEventCapture: 0,
		},
		{
			containerID: 13,
			containerName: 'birdFooter',
			xPosition: INFO_X,
			yPosition: INFO_FOOTER_Y,
			width: INFO_W,
			height: INFO_FOOTER_H,
			paddingLength: 4,
			borderWidth: 0,
			isEventCapture: 0,
		},
	],
	imageDescriptors: [
		{
			containerID: 14,
			containerName: 'birdImage',
			xPosition: HUD_WIDTH - IMG_W,
			yPosition: Math.floor((HUD_HEIGHT - IMG_H) / 2),
			width: IMG_W,
			height: IMG_H,
		},
	],
};

// Home / IDLE layout is owned by `hud/home/layout.ts` (corner-anchored
// field-research HUD: wordmark TL, time TR, ● ready centre, location BL,
// life-list BR). Re-exported via LAYOUTS for the renderer.

export const LAYOUT = STATIC_LAYOUT; // backwards-compat named export
export const LAYOUTS = { static: STATIC_LAYOUT, listening: LISTENING_LAYOUT, home: HOME_LAYOUT };

let pageCreated = false;
let activeLayoutKey: string | null = null;
let lastContents: Record<string, string> = {};

function truncate(s: string): string {
	return s.length <= HUD_CONTENT_CHAR_LIMIT ? s : s.slice(0, HUD_CONTENT_CHAR_LIMIT - 1) + '…';
}

function buildParams(layout: HudLayoutDescriptor, contents: Record<string, string>) {
	const params: {
		containerTotalNum: number;
		textObject: TextContainerProperty[];
		imageObject?: ImageContainerProperty[];
	} = {
		containerTotalNum: layout.textDescriptors.length + (layout.imageDescriptors?.length ?? 0),
		textObject: layout.textDescriptors.map(
			(d) =>
				new TextContainerProperty({
					...d,
					content: truncate(contents[d.containerName] ?? ' '),
				}),
		),
	};
	if (layout.imageDescriptors && layout.imageDescriptors.length > 0) {
		params.imageObject = layout.imageDescriptors.map((d) => new ImageContainerProperty({ ...d }));
	}
	return params;
}

// Two independent serial pipelines — one for text, one for images. Inside
// each pipeline there is at most one in-flight SDK call; pending values for
// the same container coalesce (latest wins, position preserved). Text and
// image pipelines run in parallel so a stream of wave text upgrades never
// starves image updates (and vice versa), but within each kind ordering is
// strictly serialized so the firmware doesn't see races on a single channel.
type TextOp = { containerName: string; content: string };
type ImageOp = { containerName: string; imageData: number[] | string | Uint8Array | ArrayBuffer };
const IMAGE_SEND_RETRY_MS = 120;

export class HudSession {
	private readonly textPending = new Map<string, TextOp>();
	private textDraining = false;
	private textTail: Promise<void> = Promise.resolve();

	private readonly imagePending = new Map<string, ImageOp>();
	private imageDraining = false;
	private imageTail: Promise<void> = Promise.resolve();

	constructor(private readonly bridge: EvenAppBridge) {}

	async render(next: HudRenderState): Promise<void> {
		// Flush queued ops before a full rebuild so we don't fight the new layout.
		await Promise.all([this.textTail, this.imageTail]);

		const params = buildParams(next.layout, next.textContents);

		if (!pageCreated) {
			let created: StartUpPageCreateResult;
			try {
				created = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(params));
			} catch {
				return;
			}
			if (created === StartUpPageCreateResult.success) {
				pageCreated = true;
				activeLayoutKey = next.layout.key;
				lastContents = { ...next.textContents };
				return;
			}
			const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(params));
			if (ok) {
				pageCreated = true;
				activeLayoutKey = next.layout.key;
				lastContents = { ...next.textContents };
			}
			return;
		}

		if (activeLayoutKey !== next.layout.key) {
			const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(params));
			if (!ok) return;
			activeLayoutKey = next.layout.key;
			lastContents = { ...next.textContents };
			this.textPending.clear();
			this.imagePending.clear();
			return;
		}

		// Same layout — enqueue per-container upgrades through the serial pipeline.
		for (const d of next.layout.textDescriptors) {
			const content = next.textContents[d.containerName] ?? '';
			this.upgradeText(d.containerName, content);
		}
	}

	upgradeText(containerName: string, content: string): void {
		if (lastContents[containerName] === content) return;
		this.textPending.set(containerName, { containerName, content });
		this.kickTextDrain();
	}

	upgradeImage(containerName: string, imageData: number[] | string | Uint8Array | ArrayBuffer): void {
		this.imagePending.set(containerName, { containerName, imageData });
		this.kickImageDrain();
	}

	getActiveLayoutKey(): string | null {
		return activeLayoutKey;
	}

	private currentLayout(): HudLayoutDescriptor | null {
		if (activeLayoutKey === LAYOUTS.listening.key) return LAYOUTS.listening;
		if (activeLayoutKey === LAYOUTS.static.key) return LAYOUTS.static;
		if (activeLayoutKey === LAYOUTS.home.key) return LAYOUTS.home;
		return null;
	}

	private kickTextDrain(): void {
		if (this.textDraining) return;
		this.textDraining = true;
		this.textTail = this.textTail.then(() => this.drainText());
	}

	private async drainText(): Promise<void> {
		try {
			while (this.textPending.size > 0) {
				const firstKey = this.textPending.keys().next().value as string;
				const op = this.textPending.get(firstKey)!;
				this.textPending.delete(firstKey);
				await this.sendText(op.containerName, op.content);
			}
		} finally {
			this.textDraining = false;
		}
	}

	private kickImageDrain(): void {
		if (this.imageDraining) return;
		this.imageDraining = true;
		this.imageTail = this.imageTail.then(() => this.drainImage());
	}

	private async drainImage(): Promise<void> {
		try {
			while (this.imagePending.size > 0) {
				const firstKey = this.imagePending.keys().next().value as string;
				const op = this.imagePending.get(firstKey)!;
				this.imagePending.delete(firstKey);
				await this.sendImage(op.containerName, op.imageData);
			}
		} finally {
			this.imageDraining = false;
		}
	}

	private async sendText(containerName: string, content: string): Promise<void> {
		const layout = this.currentLayout();
		if (!layout) return;
		const d = layout.textDescriptors.find((x) => x.containerName === containerName);
		if (!d) return;
		// Re-check after coalescing — another op may have already set this value.
		if (lastContents[containerName] === content) return;
		try {
			const ok = await this.bridge.textContainerUpgrade(
				new TextContainerUpgrade({
					containerID: d.containerID,
					containerName: d.containerName,
					contentOffset: 0,
					contentLength: HUD_CONTENT_CHAR_LIMIT,
					content: truncate(content),
				}),
			);
			if (ok) lastContents[containerName] = content;
		} catch (err) {
			console.error('[HudSession] upgradeText failed', containerName, err);
		}
	}

	private async sendImage(
		containerName: string,
		imageData: number[] | string | Uint8Array | ArrayBuffer,
	): Promise<void> {
		const layout = this.currentLayout();
		if (!layout) return;
		const d = layout.imageDescriptors?.find((x) => x.containerName === containerName);
		if (!d) return;
		try {
			let result = await this.bridge.updateImageRawData(
				new ImageRawDataUpdate({
					containerID: d.containerID,
					containerName: d.containerName,
					imageData,
				}),
			);

			if (ImageRawDataUpdateResult.isSuccess(result)) {
				return;
			}

			if (ImageRawDataUpdateResult.isSendFailed(result)) {
				await sleep(IMAGE_SEND_RETRY_MS);
				result = await this.bridge.updateImageRawData(
					new ImageRawDataUpdate({
						containerID: d.containerID,
						containerName: d.containerName,
						imageData,
					}),
				);
				if (ImageRawDataUpdateResult.isSuccess(result)) {
					return;
				}
			}

			console.error('[HudSession] upgradeImage rejected', {
				containerName,
				result,
				imageLength: getImageLength(imageData),
			});
		} catch (err) {
			console.error('[HudSession] upgradeImage failed', containerName, err);
		}
	}
}

function getImageLength(imageData: number[] | string | Uint8Array | ArrayBuffer): number {
	if (typeof imageData === 'string') return imageData.length;
	if (Array.isArray(imageData) || imageData instanceof Uint8Array) return imageData.length;
	return imageData.byteLength;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
