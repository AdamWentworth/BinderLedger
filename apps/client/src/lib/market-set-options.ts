import { type CatalogSet } from './api';
import { buildCatalogSetGroups } from './catalog-set-groups';

export type MarketSetOption = {
  label: string;
  value: string;
};

export function buildMarketSetOptions(sets: CatalogSet[]): MarketSetOption[] {
  const groups = buildCatalogSetGroups(sets);

  return [
    { label: 'All sets', value: '' },
    ...groups.flatMap<MarketSetOption>((group) => {
      if (group.key === 'base-set') {
        return group.views.map((view) => ({
          label: `${group.label} — ${view.label}`,
          value: view.setId,
        }));
      }

      return [{ label: group.label, value: group.defaultView.setId }];
    }),
  ];
}

export function getMarketSetDisplayName(
  setId: string,
  fallback: string,
  options: MarketSetOption[],
): string {
  const label = options.find((option) => option.value === setId)?.label;
  return label?.split(/\s+\u2014\s+/)[0] ?? fallback;
}
