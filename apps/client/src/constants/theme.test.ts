import { describe, expect, it } from 'vitest';

import { colors } from './theme';

const foundationNames = [
  'canvas',
  'navigation',
  'surface',
  'surfaceRaised',
  'surfaceQuiet',
  'border',
  'brand',
  'brandPressed',
] as const;

const contentBackgrounds = [
  'canvas',
  'navigation',
  'surface',
  'surfaceRaised',
  'surfaceQuiet',
] as const;

describe('theme palette', () => {
  it('uses valid opaque hex values for every solid color token', () => {
    for (const [name, value] of Object.entries(colors)) {
      if (name === 'overlay') continue;
      expect(value, name).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('keeps primary and muted text WCAG AA readable across content surfaces', () => {
    for (const background of contentBackgrounds) {
      expect(contrastRatio(colors.text, colors[background]), `text on ${background}`).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors.textMuted, colors[background]),
        `muted text on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps interactive and market accents readable on their common surfaces', () => {
    const pairs = [
      [colors.brand, colors.navigation, 'brand on navigation'],
      [colors.brand, colors.surface, 'brand on surface'],
      [colors.brass, colors.surface, 'gold on surface'],
      [colors.positive, colors.surface, 'positive on surface'],
      [colors.negative, colors.surface, 'negative on surface'],
    ] as const;

    for (const [foreground, background, label] of pairs) {
      expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the card-back foundation in the blue-to-cyan hue range', () => {
    for (const name of foundationNames) {
      const hue = hueDegrees(colors[name]);
      expect(hue, name).toBeGreaterThanOrEqual(195);
      expect(hue, name).toBeLessThanOrEqual(218);
    }
  });
});

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = rgbChannels(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hueDegrees(hex: string): number {
  const [red, green, blue] = rgbChannels(hex).map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;

  let hue: number;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  const degrees = hue * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

function rgbChannels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}
