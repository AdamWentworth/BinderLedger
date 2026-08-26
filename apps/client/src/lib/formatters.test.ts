import { describe, expect, it } from 'vitest';

import { formatCurrency, formatPercent, formatSignedCurrency } from './formatters';

describe('formatCurrency', () => {
  it('formats US dollar values', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('labels missing prices', () => {
    expect(formatCurrency(null)).toBe('No price');
  });
});

describe('formatPercent', () => {
  it('adds a plus sign only when requested for positive changes', () => {
    expect(formatPercent(2.345)).toBe('+2.35%');
    expect(formatPercent(2.345, false)).toBe('2.35%');
    expect(formatPercent(-2.345)).toBe('-2.35%');
  });

  it('labels missing changes', () => {
    expect(formatPercent(null)).toBe('No change');
  });

  it('formats signed currency changes without losing direction', () => {
    expect(formatSignedCurrency(12.5)).toBe('+$12.50');
    expect(formatSignedCurrency(-12.5)).toBe('-$12.50');
    expect(formatSignedCurrency(0)).toBe('$0.00');
    expect(formatSignedCurrency(null)).toBe('No change');
  });
});
