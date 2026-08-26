import { describe, expect, it } from 'vitest';

import { type CatalogSet } from './api';
import { buildMarketSetOptions, getMarketSetDisplayName } from './market-set-options';

function setFixture(overrides: Partial<CatalogSet> & Pick<CatalogSet, 'id' | 'name'>): CatalogSet {
  return {
    cardCount: 64,
    declaredCardCount: 64,
    editionPrintingCounts: {},
    editions: ['First Edition', 'Unlimited'],
    logoUrl: null,
    maximumPrice: null,
    minimumPrice: null,
    printingCount: 128,
    releaseDate: null,
    sharedCardCount: 0,
    sharedPrintingCount: 0,
    symbolUrl: null,
    variantCount: 640,
    ...overrides,
  };
}

describe('buildMarketSetOptions', () => {
  it('starts with an all-sets option and uses one option for ordinary sets', () => {
    const options = buildMarketSetOptions([
      setFixture({ id: 'jungle-pokemon', name: 'Jungle' }),
      setFixture({ id: 'fossil-pokemon', name: 'Fossil' }),
    ]);

    expect(options).toEqual([
      { label: 'All sets', value: '' },
      { label: 'Jungle', value: 'jungle-pokemon' },
      { label: 'Fossil', value: 'fossil-pokemon' },
    ]);
  });

  it('keeps the catalog Base Set printing split', () => {
    const options = buildMarketSetOptions([
      setFixture({
        editions: ['First Edition'],
        id: 'base-set-first-edition-pokemon',
        name: 'Base Set First Edition',
      }),
      setFixture({
        editions: ['Shadowless'],
        id: 'base-set-shadowless-pokemon',
        name: 'Base Set Shadowless',
      }),
      setFixture({
        editions: ['Unlimited'],
        id: 'base-set-pokemon',
        name: 'Base Set',
      }),
    ]);

    expect(options.slice(1)).toEqual([
      { label: 'Base Set — First Edition', value: 'base-set-first-edition-pokemon' },
      { label: 'Base Set — Shadowless', value: 'base-set-shadowless-pokemon' },
      { label: 'Base Set — Unlimited', value: 'base-set-pokemon' },
    ]);
  });
});

describe('getMarketSetDisplayName', () => {
  it('uses the catalog group name for split Base Set views', () => {
    expect(
      getMarketSetDisplayName('base-set-shadowless-pokemon', 'Base Set Shadowless', [
        { label: 'Base Set — Shadowless', value: 'base-set-shadowless-pokemon' },
      ]),
    ).toBe('Base Set');
  });

  it('keeps ordinary set names and falls back safely', () => {
    expect(
      getMarketSetDisplayName('jungle-pokemon', 'Jungle', [
        { label: 'Jungle', value: 'jungle-pokemon' },
      ]),
    ).toBe('Jungle');
    expect(getMarketSetDisplayName('missing', 'Unknown Set', [])).toBe('Unknown Set');
  });
});
