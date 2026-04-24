import type { AggregatedDetection } from '../store';

export type BirdieHudState =
  | { type: 'IDLE' }
  | { type: 'LISTENING' }
  | { type: 'ANALYZING' }
  | { type: 'DETECTED'; top: AggregatedDetection }
  | { type: 'NO_DETECTION' }
  | { type: 'ERROR'; message: string; retryCountdown: number };

export interface HudTextDescriptor {
  containerID: number;
  containerName: string;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  paddingLength?: number;
  borderWidth?: number;
  borderColor?: number;
  borderRadius?: number;
  isEventCapture?: number;
}

export interface HudImageDescriptor {
  containerID: number;
  containerName: string;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
}

export interface HudLayoutDescriptor {
  key: string;
  textDescriptors: HudTextDescriptor[];
  imageDescriptors?: HudImageDescriptor[];
}

export interface HudRenderState {
  layout: HudLayoutDescriptor;
  textContents: Record<string, string>;
}
