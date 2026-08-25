import { describe, expect, it } from 'vitest';

import { formatCatalogDate, getCatalogColumnCount } from './catalog-layout';

describe('getCatalogColumnCount', () => {
  it('never returns fewer than one column', () => {
    expect(getCatalogColumnCount(0, 'compact', 12)).toBe(1);
  });

  it('caps each density at its intended maximum', () => {
    expect(getCatalogColumnCount(2400, 'large', 12)).toBe(2);
    expect(getCatalogColumnCount(2400, 'standard', 12)).toBe(3);
    expect(getCatalogColumnCount(2400, 'compact', 12)).toBe(4);
  });

  it('fits columns using both tile width and gap', () => {
    expect(getCatalogColumnCount(640, 'standard', 12)).toBe(3);
    expect(getCatalogColumnCount(420, 'standard', 12)).toBe(1);
  });
});

describe('formatCatalogDate', () => {
  it('formats catalog dates without shifting the calendar day', () => {
    expect(formatCatalogDate('2026-08-25')).toBe('Aug 25');
  });
});
