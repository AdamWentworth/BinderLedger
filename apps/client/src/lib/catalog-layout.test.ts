import { describe, expect, it } from 'vitest';

import {
  formatCatalogDate,
  getCatalogColumnCount,
  getCatalogItemWidth,
} from './catalog-layout';

describe('getCatalogColumnCount', () => {
  it('never returns fewer than one column', () => {
    expect(getCatalogColumnCount(0, 'compact', 12)).toBe(1);
  });

  it('caps each density at its intended maximum', () => {
    expect(getCatalogColumnCount(2400, 'large', 12)).toBe(3);
    expect(getCatalogColumnCount(2400, 'standard', 12)).toBe(4);
    expect(getCatalogColumnCount(2400, 'compact', 12)).toBe(6);
  });

  it('creates meaningfully different phone densities', () => {
    expect(getCatalogColumnCount(358, 'large', 16)).toBe(1);
    expect(getCatalogColumnCount(358, 'standard', 16)).toBe(2);
    expect(getCatalogColumnCount(358, 'compact', 8)).toBe(3);
  });

  it('scales compact browsing through tablet and desktop widths', () => {
    expect(getCatalogColumnCount(288, 'compact', 8)).toBe(2);
    expect(getCatalogColumnCount(448, 'compact', 8)).toBe(4);
    expect(getCatalogColumnCount(704, 'compact', 8)).toBe(6);
  });
});

describe('getCatalogItemWidth', () => {
  it('subtracts the exact inter-column gaps', () => {
    expect(getCatalogItemWidth(358, 3, 8)).toBe(114);
    expect(getCatalogItemWidth(704, 6, 8)).toBeCloseTo(110.67, 2);
  });

  it('returns zero until layout width is available', () => {
    expect(getCatalogItemWidth(0, 1, 8)).toBe(0);
  });
});

describe('formatCatalogDate', () => {
  it('formats catalog dates without shifting the calendar day', () => {
    expect(formatCatalogDate('2026-08-25')).toBe('Aug 25');
  });
});
