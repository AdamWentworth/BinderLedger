import { describe, expect, it } from 'vitest';

import {
  isCameraLifecycleCancellation,
  isCardAligned,
  isStableCard,
} from './card-camera';

describe('card auto-capture state', () => {
  it('accepts a centered upright trading card', () => {
    expect(isCardAligned({ height: 0.69, width: 0.66, x: 0.17, y: 0.105 })).toBe(true);
  });

  it('rejects a card that is too small or off center', () => {
    expect(isCardAligned({ height: 0.5, width: 0.35, x: 0.05, y: 0.1 })).toBe(false);
  });

  it('requires five closely grouped observations', () => {
    const stable = [
      { height: 0.7, width: 0.5, x: 0.25, y: 0.1 },
      { height: 0.703, width: 0.501, x: 0.249, y: 0.102 },
      { height: 0.698, width: 0.499, x: 0.251, y: 0.101 },
      { height: 0.701, width: 0.502, x: 0.248, y: 0.099 },
      { height: 0.699, width: 0.5, x: 0.25, y: 0.1 },
    ];
    expect(isStableCard(stable.slice(0, 4))).toBe(false);
    expect(isStableCard(stable)).toBe(true);
    expect(isStableCard([...stable.slice(0, 4), { height: 0.7, width: 0.5, x: 0.32, y: 0.1 }])).toBe(
      false,
    );
  });
});

describe('camera lifecycle errors', () => {
  it('recognizes Android torch cancellation while a camera session is stopping', () => {
    expect(
      isCameraLifecycleCancellation(
        'androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.',
      ),
    ).toBe(true);
    expect(isCameraLifecycleCancellation('Camera device disconnected unexpectedly.')).toBe(false);
  });
});
