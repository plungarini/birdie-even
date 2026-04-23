type CaptureControlHandler = (intent?: 'start' | 'stop' | 'toggle') => void;

let captureControlHandler: CaptureControlHandler | null = null;

export function registerCaptureControlHandler(handler: CaptureControlHandler | null) {
  captureControlHandler = handler;
}

export function requestCaptureControl(intent: 'start' | 'stop' | 'toggle' = 'toggle') {
  captureControlHandler?.(intent);
}
