import type { Detection } from '../net/types';

export type BirdieHudState =
  | { type: 'IDLE' }
  | { type: 'LISTENING' }
  | { type: 'ANALYZING' }
  | { type: 'DETECTED'; detections: Detection[] }
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
  borderRadius?: number;
  isEventCapture?: number;
}

export interface HudLayoutDescriptor {
  key: string;
  textDescriptors: HudTextDescriptor[];
}

export interface HudRenderState {
  layout: HudLayoutDescriptor;
  textContents: Record<string, string>;
}
