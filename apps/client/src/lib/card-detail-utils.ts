import {
  type CatalogListing,
  type CatalogValuationReference,
} from '@/lib/api';

export type ValuationGroup = {
  key: string;
  variant: string;
  sourceName: string;
  sourceUrl: string;
  checkedOn: string;
  ungraded?: CatalogValuationReference;
  graded: CatalogValuationReference[];
};

export function groupValuationReferences(
  references: CatalogValuationReference[],
): ValuationGroup[] {
  const groups = new Map<string, ValuationGroup>();

  for (const reference of references) {
    const key = `${reference.printingVariant}:${reference.sourceUrl}`;
    const group = groups.get(key) ?? {
      key,
      variant: reference.printingVariant,
      sourceName: reference.sourceName,
      sourceUrl: reference.sourceUrl,
      checkedOn: reference.checkedOn,
      graded: [],
    };

    if (reference.kind === 'ungraded') {
      group.ungraded = reference;
    } else {
      group.graded.push(reference);
    }
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.graded.length > 0);
}

export function priceQualityMessage(
  listing: Pick<CatalogListing, 'valuationKind' | 'priceQuality'>,
): string {
  if (listing.valuationKind === 'ungraded_reference') {
    return 'The separate ungraded benchmark is the displayed catalog value. Provider condition prices remain visible as reported.';
  }
  if (listing.priceQuality.status === 'historical' && listing.priceQuality.asOf) {
    return `Current provider prices fail condition-order validation. Showing the latest valid five-condition snapshot from ${formatQualityDate(listing.priceQuality.asOf)}.`;
  }
  if (listing.priceQuality.reason === 'missing_conditions') {
    return 'The provider is missing one or more condition prices. Available current values remain visible as reported.';
  }
  return 'Provider prices conflict with the expected DMG < HP < MP < LP < NM order. Current values remain visible as reported.';
}

export function formatQualityDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}
