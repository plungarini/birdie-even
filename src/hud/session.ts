import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { HUD_CONTENT_CHAR_LIMIT, HUD_HEIGHT, HUD_WIDTH } from './constants';
import type { HudLayoutDescriptor, HudRenderState } from './types';

const LAYOUT: HudLayoutDescriptor = {
  key: 'birdie.v1',
  textDescriptors: [
    // Invisible full-screen event capture container.
    {
      containerID: 0,
      containerName: 'shield',
      xPosition: 0,
      yPosition: 0,
      width: HUD_WIDTH,
      height: HUD_HEIGHT,
      borderWidth: 0,
      paddingLength: 0,
      isEventCapture: 1,
    },
    // Main content container.
    {
      containerID: 1,
      containerName: 'main',
      xPosition: 12,
      yPosition: 12,
      width: HUD_WIDTH - 24,
      height: HUD_HEIGHT - 24,
      paddingLength: 12,
      borderWidth: 1,
      isEventCapture: 0,
    },
  ],
};

export { LAYOUT };

let pageCreated = false;
let activeLayoutKey: string | null = null;
let lastContents: Record<string, string> = {};

function truncate(s: string): string {
  return s.length <= HUD_CONTENT_CHAR_LIMIT ? s : s.slice(0, HUD_CONTENT_CHAR_LIMIT - 1) + '…';
}

function buildParams(layout: HudLayoutDescriptor, contents: Record<string, string>) {
  return {
    containerTotalNum: layout.textDescriptors.length,
    textObject: layout.textDescriptors.map(
      (d) =>
        new TextContainerProperty({
          ...d,
          content: truncate(contents[d.containerName] ?? ' '),
        }),
    ),
  };
}

export class HudSession {
  constructor(private readonly bridge: EvenAppBridge) {}

  async render(next: HudRenderState): Promise<void> {
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
      lastContents = {};
    }

    await this.applyUpgrades(next);
  }

  private async applyUpgrades(next: HudRenderState): Promise<void> {
    for (const d of next.layout.textDescriptors) {
      const content = next.textContents[d.containerName] ?? '';
      if (lastContents[d.containerName] === content) continue;
      const prevLen = lastContents[d.containerName]?.length ?? 0;
      try {
        const ok = await this.bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: d.containerID,
            containerName: d.containerName,
            contentOffset: 0,
            contentLength: Math.max(content.length, prevLen),
            content,
          }),
        );
        if (ok) lastContents[d.containerName] = content;
      } catch (err) {
        console.error('[HudSession] upgrade failed', d.containerName, err);
      }
    }
  }
}
