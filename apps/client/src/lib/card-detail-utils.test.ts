import { describe, expect, it } from 'vitest';

import { type CatalogValuationReference } from './api';
import {
  formatQualityDate,
  groupValuationReferences,
  priceQualityMessage,
} from './card-detail-utils';

function referenceFixture(
  overrides: Partial<CatalogValuationReference> = {},
): CatalogValuationReference {
  return {
    id: 'reference-1',
    kind: 'graded',
    label: 'PSA 9',
    grader: 'PSA',
    grade: '9',
    amount: 100,
    currency: 'USD',
    sourceName: 'PriceCharting',
    sourceUrl: 'https://example.com/card',
    printingVariant: 'Unlimited Holo',
    isPrimary: true,
    checkedOn: '2026-08-25',
    note: null,
    ...overrides,
  };
}

describe('groupValuationReferences', () => {
  it('groups ungraded and graded references by printing and source', () => {
    const groups = groupValuationReferences([
      referenceFixture({ id: 'raw', kind: 'ungraded', label: 'Ungraded', grader: null, grade: null }),
      referenceFixture({ id: 'psa-9' }),
      referenceFixture({ id: 'psa-10', label: 'PSA 10', grade: '10', amount: 250 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].ungraded?.id).toBe('raw');
    expect(groups[0].graded.map((reference) => reference.id)).toEqual(['psa-9', 'psa-10']);
  });

  it('omits groups that have no graded reference', () => {
    expect(groupValuationReferences([
      referenceFixture({ kind: 'ungraded', grader: null, grade: null }),
    ])).toEqual([]);
  });
});

describe('priceQualityMessage', () => {
  it('describes a historical condition snapshot with its date', () => {
    expect(priceQualityMessage({
      valuationKind: 'condition',
      priceQuality: { status: 'historical', asOf: '2026-08-25', reason: 'condition_order' },
    })).toContain('August 25, 2026');
  });

  it('distinguishes missing conditions from ordering conflicts', () => {
    expect(priceQualityMessage({
      valuationKind: 'condition',
      priceQuality: { status: 'current', asOf: null, reason: 'missing_conditions' },
    })).toContain('missing one or more condition prices');
  });
});

describe('formatQualityDate', () => {
  it('formats a full date without shifting the calendar day', () => {
    expect(formatQualityDate('2026-08-25')).toBe('August 25, 2026');
  });
});
