import { describe, expect, it } from 'vitest';

import { type CatalogSet, type MarketSetMovement } from './api';
import { buildMarketSetMovementGroups } from './market-set-groups';

function setFixture(
  overrides: Partial<CatalogSet> & Pick<CatalogSet, 'id' | 'name'>,
): CatalogSet {
  return {
    cardCount: 64,
    declaredCardCount: 64,
    editionPrintingCounts: { 'First Edition': 64, Unlimited: 64 },
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

function movementFixture(overrides: Partial<MarketSetMovement>): MarketSetMovement {
  return {
    changeAmount: 10,
    changePercent: 10,
    edition: 'Unlimited',
    endValue: 110,
    logoUrl: null,
    setId: 'jungle-pokemon',
    setName: 'Jungle',
    startValue: 100,
    symbolUrl: null,
    variantCount: 64,
    ...overrides,
  };
}

describe('buildMarketSetMovementGroups', () => {
  it('keeps edition baskets inside one catalog set family', () => {
    const groups = buildMarketSetMovementGroups(
      [
        movementFixture({ edition: 'First Edition', variantCount: 62 }),
        movementFixture({ edition: 'Unlimited', variantCount: 64 }),
      ],
      [setFixture({ id: 'jungle-pokemon', name: 'Jungle' })],
      '',
      'amount',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      expectedPrintingCount: 128,
      name: 'Jungle',
      variantCount: 126,
    });
    expect(groups[0].baskets.map((basket) => basket.edition)).toEqual([
      'First Edition',
      'Unlimited',
    ]);
  });

  it('uses catalog Base Set runs instead of the physical Machamp stamp', () => {
    const sets = [
      setFixture({
        editionPrintingCounts: { 'First Edition': 103 },
        editions: ['First Edition'],
        id: 'base-set-first-edition-pokemon',
        name: 'Base Set First Edition',
        printingCount: 103,
      }),
      setFixture({
        editionPrintingCounts: { Shadowless: 103 },
        editions: ['Shadowless'],
        id: 'base-set-shadowless-pokemon',
        name: 'Base Set Shadowless',
        printingCount: 103,
      }),
      setFixture({
        cardCount: 102,
        declaredCardCount: 102,
        editionPrintingCounts: { 'First Edition': 1, Unlimited: 101 },
        id: 'base-set-pokemon',
        name: 'Base Set',
        printingCount: 102,
      }),
    ];
    const groups = buildMarketSetMovementGroups(
      [
        movementFixture({
          edition: 'First Edition',
          setId: 'base-set-first-edition-pokemon',
          setName: 'Base Set First Edition',
          variantCount: 92,
        }),
        movementFixture({
          edition: 'First Edition',
          endValue: 25,
          setId: 'base-set-pokemon',
          setName: 'Base Set',
          startValue: 25,
          variantCount: 1,
        }),
        movementFixture({
          edition: 'Unlimited',
          setId: 'base-set-pokemon',
          setName: 'Base Set',
          variantCount: 101,
        }),
      ],
      sets,
      '',
      'amount',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Base Set');
    expect(groups[0].baskets.map((basket) => [
      basket.edition,
      basket.variantCount,
      basket.expectedPrintingCount,
    ])).toEqual([
      ['First Edition', 92, 103],
      ['Shadowless', 0, 103],
      ['Unlimited', 102, 102],
    ]);
    expect(groups[0].baskets[2].queryEdition).toBe('');
  });

  it('filters set runs by their catalog edition and retains empty catalog families', () => {
    const groups = buildMarketSetMovementGroups(
      [],
      [
        setFixture({ id: 'jungle-pokemon', name: 'Jungle' }),
        setFixture({ id: 'fossil-pokemon', name: 'Fossil' }),
      ],
      'First Edition',
      'amount',
    );

    expect(groups.map((group) => group.name)).toEqual(['Fossil', 'Jungle']);
    expect(groups.every((group) => group.baskets.length === 1)).toBe(true);
    expect(groups.every((group) => group.baskets[0].edition === 'First Edition')).toBe(true);
  });
});
