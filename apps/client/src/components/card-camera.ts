export type CardBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type CardCameraStatus = 'searching' | 'align' | 'hold-steady' | 'ready';

export type CardCameraCapture = {
  format: 'jpg';
  height: number;
  uri: string;
  width: number;
};

export type CardCameraHandle = {
  capture: () => Promise<CardCameraCapture>;
};

export type CardCameraProps = {
  active: boolean;
  disabled: boolean;
  onAutoCapture: () => void;
  onBoundsChange: (bounds: CardBounds | null) => void;
  onError: (message: string) => void;
  onReady: () => void;
  onStatusChange: (status: CardCameraStatus) => void;
  resetKey: string;
  torch: boolean;
};

export function isCameraLifecycleCancellation(message: string): boolean {
  return (
    message.includes('CameraControl$OperationCanceledException') ||
    message.includes('CameraControlOperationCanceledException') ||
    message.includes('Camera is not active')
  );
}

const TARGET = { height: 0.69, width: 0.66, x: 0.17, y: 0.105 };

export function isCardAligned(bounds: CardBounds): boolean {
  // Bounds are normalized to a 3:4 portrait analysis frame, so account for
  // the frame's unequal axes before comparing the physical card ratio.
  const aspect = (bounds.width / bounds.height) * (3 / 4);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const targetCenterX = TARGET.x + TARGET.width / 2;
  const targetCenterY = TARGET.y + TARGET.height / 2;
  return (
    aspect >= 0.60 &&
    aspect <= 0.82 &&
    bounds.width >= 0.52 &&
    bounds.width <= 0.82 &&
    bounds.height >= 0.60 &&
    bounds.height <= 0.90 &&
    Math.abs(centerX - targetCenterX) <= 0.09 &&
    Math.abs(centerY - targetCenterY) <= 0.10
  );
}

export function isStableCard(history: CardBounds[]): boolean {
  if (history.length < 5) return false;
  const recent = history.slice(-5);
  const average = recent.reduce(
    (value, bounds) => ({
      height: value.height + bounds.height / recent.length,
      width: value.width + bounds.width / recent.length,
      x: value.x + bounds.x / recent.length,
      y: value.y + bounds.y / recent.length,
    }),
    { height: 0, width: 0, x: 0, y: 0 },
  );
  return recent.every(
    (bounds) =>
      Math.abs(bounds.x - average.x) <= 0.018 &&
      Math.abs(bounds.y - average.y) <= 0.018 &&
      Math.abs(bounds.width - average.width) <= 0.022 &&
      Math.abs(bounds.height - average.height) <= 0.022,
  );
}
