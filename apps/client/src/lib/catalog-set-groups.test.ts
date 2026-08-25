import { describe, expect, it } from 'vitest';

import { type CatalogSet } from './api';
import {
  buildCatalogSetGroups,
  selectedCatalogSetGroup,
  selectedCatalogSetView,
} from './catalog-set-groups';

function setFixture(overrides: Partial<CatalogSet> & Pick<CatalogSet, 'id' | 'name'>): CatalogSet {
  return {
    releaseDate: null,
    logoUrl: null,
    symbolUrl: null,
    editions: [],
    declaredCardCount: null,
    cardCount: 64,
    printingCount: 64,
    sharedCardCount: 0,
    sharedPrintingCount: 0,
    variantCount: 64,
    minimumPrice: null,
    maximumPrice: null,
    ...overrides,
  };
}

describe('buildCatalogSetGroups', () => {
  it('combines the three Base Set print runs into one navigable group', () => {
    const groups = buildCatalogSetGroups([
      setFixture({ id: 'base-set-first-edition-pokemon', name: 'Base Set First Edition', declaredCardCount: 102 }),
      setFixture({ id: 'base-set-shadowless-pokemon', name: 'Base Set Shadowless', declaredCardCount: 102 }),
      setFixture({ id: 'base-set-pokemon', name: 'Base Set Unlimited', declaredCardCount: 102 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'base-set',
      label: 'Base Set',
      cardCount: 102,
      cardCountLabel: '102',
    });
    expect(groups[0].views.map((view) => view.label)).toEqual([
      'First Edition',
      'Shadowless',
      'Unlimited',
    ]);
  });

  it('orders edition views and defaults multi-edition sets to all printings', () => {
    const [group] = buildCatalogSetGroups([
      setFixture({
        id: 'jungle-pokemon',
        name: 'Jungle',
        editions: ['Unlimited', 'First Edition'],
      }),
    ]);

    expect(group.views.map((view) => view.label)).toEqual([
      'First Edition',
      'Unlimited',
      'All printings',
    ]);
    expect(group.defaultView.label).toBe('All printings');
  });

  it('finds the selected group and view', () => {
    const groups = buildCatalogSetGroups([
      setFixture({ id: 'fossil-pokemon', name: 'Fossil', editions: ['Unlimited'] }),
    ]);
    const group = selectedCatalogSetGroup(groups, 'fossil-pokemon', 'Unlimited');

    expect(group?.label).toBe('Fossil');
    expect(selectedCatalogSetView(group, 'fossil-pokemon', 'Unlimited')?.label).toBe('Unlimited');
  });
});
