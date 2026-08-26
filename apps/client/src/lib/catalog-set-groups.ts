import { type CatalogSet } from '@/lib/api';

export type CatalogEdition = '' | 'Unlimited' | 'Shadowless' | 'First Edition';

export type CatalogSetView = {
  key: string;
  label: string;
  setId: string;
  edition: CatalogEdition;
  printingCount: number;
};

export type CatalogSetGroup = {
  key: string;
  label: string;
  cardCount: number;
  cardCountLabel: string;
  printingCount: number;
  symbolUrl: string | null;
  views: CatalogSetView[];
  defaultView: CatalogSetView;
};

const baseSetRuns = [
  {
    id: 'base-set-first-edition-pokemon',
    label: 'First Edition',
    key: 'base-set:first-edition',
  },
  {
    id: 'base-set-shadowless-pokemon',
    label: 'Shadowless',
    key: 'base-set:shadowless',
  },
  {
    id: 'base-set-pokemon',
    label: 'Unlimited',
    key: 'base-set:unlimited',
  },
] as const;

const editionOrder: CatalogEdition[] = ['First Edition', 'Shadowless', 'Unlimited'];

export function buildCatalogSetGroups(sets: CatalogSet[]): CatalogSetGroup[] {
  const setsById = new Map(sets.map((set) => [set.id, set]));
  const baseViews = baseSetRuns.flatMap<CatalogSetView>((run) => {
    const set = setsById.get(run.id);
    if (!set) return [];
    return [{
      key: run.key,
      label: run.label,
      setId: set.id,
      edition: '',
      printingCount: set.printingCount + set.sharedPrintingCount,
    }];
  });
  const groupedSetIDs = new Set<string>(baseSetRuns.map((run) => run.id));
  const groups: CatalogSetGroup[] = [];

  if (baseViews.length > 0) {
    const baseSets = baseSetRuns
      .map((run) => setsById.get(run.id))
      .filter((set): set is CatalogSet => set !== undefined);
    const cardCount = Math.max(
      ...baseSets.map((set) => set.declaredCardCount ?? set.cardCount),
    );
    const extraVariants = Math.max(
      0,
      ...baseSets.map(
        (set) =>
          set.cardCount + set.sharedCardCount - (set.declaredCardCount ?? set.cardCount),
      ),
    );
    groups.push({
      key: 'base-set',
      label: 'Base Set',
      cardCount,
      cardCountLabel: extraVariants > 0 ? `${cardCount}+${extraVariants}` : String(cardCount),
      printingCount: baseSets.reduce((sum, set) => sum + set.printingCount, 0),
      symbolUrl: baseSets.find((set) => set.symbolUrl)?.symbolUrl ?? null,
      views: baseViews,
      defaultView: baseViews[0],
    });
  }

  for (const set of sets) {
    if (groupedSetIDs.has(set.id)) continue;

    const editions = editionOrder.filter((edition) => set.editions.includes(edition));
    const editionViews = editions.map<CatalogSetView>((edition) => ({
      key: `${set.id}:${edition.toLocaleLowerCase().replaceAll(' ', '-')}`,
      label: edition,
      setId: set.id,
      edition,
      printingCount:
        set.editionPrintingCounts?.[edition] ?? set.cardCount + set.sharedPrintingCount,
    }));
    const allView: CatalogSetView = {
      key: `${set.id}:all`,
      label: 'All printings',
      setId: set.id,
      edition: '',
      printingCount: set.printingCount + set.sharedPrintingCount,
    };
    const views = editionViews.length > 1 ? [...editionViews, allView] : editionViews;
    if (views.length === 0) views.push(allView);

    const cardCount = set.declaredCardCount ?? set.cardCount;
    groups.push({
      key: set.id,
      label: set.name,
      cardCount,
      cardCountLabel: String(cardCount),
      printingCount: set.printingCount,
      symbolUrl: set.symbolUrl,
      views,
      defaultView: views.at(-1) ?? views[0],
    });
  }

  return groups;
}

export function selectedCatalogSetGroup(
  groups: CatalogSetGroup[],
  setId: string,
  edition: CatalogEdition,
): CatalogSetGroup | undefined {
  if (!setId) return undefined;
  return groups.find((group) =>
    group.views.some((view) => view.setId === setId && view.edition === edition),
  );
}

export function selectedCatalogSetView(
  group: CatalogSetGroup | undefined,
  setId: string,
  edition: CatalogEdition,
): CatalogSetView | undefined {
  return group?.views.find((view) => view.setId === setId && view.edition === edition);
}
