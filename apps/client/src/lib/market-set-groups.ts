import {
  buildCatalogSetGroups,
  type CatalogSetGroup,
  type CatalogSetView,
} from './catalog-set-groups';
import {
  type CatalogSet,
  type MarketEdition,
  type MarketMovementMode,
  type MarketSetMovement,
} from './api';

export type MarketSetBasket = MarketSetMovement & {
  expectedPrintingCount: number;
  hasMovement: boolean;
  key: string;
  queryEdition: string;
};

export type MarketSetMovementGroup = {
  baskets: MarketSetBasket[];
  changeAmount: number;
  changePercent: number;
  endValue: number;
  expectedPrintingCount: number;
  hasMovement: boolean;
  key: string;
  logoUrl: string | null;
  name: string;
  startValue: number;
  symbolUrl: string | null;
  variantCount: number;
};

type BasketAccumulator = MarketSetBasket & {
  view: CatalogSetView | null;
};

const editionOrder = new Map([
  ['First Edition', 1],
  ['Shadowless', 2],
  ['Unlimited', 3],
  ['All printings', 4],
]);

export function buildMarketSetMovementGroups(
  movements: MarketSetMovement[],
  sets: CatalogSet[],
  edition: MarketEdition,
  rank: MarketMovementMode,
): MarketSetMovementGroup[] {
  const catalogGroups = buildCatalogSetGroups(sets);
  const groups = new Map<string, MarketSetMovementGroup>();
  const baskets = new Map<string, BasketAccumulator>();

  for (const catalogGroup of catalogGroups) {
    const views = marketViews(catalogGroup).filter(
      (view) => !edition || catalogEdition(catalogGroup, view) === edition,
    );
    if (views.length === 0) continue;

    const group = emptyGroup(catalogGroup);
    groups.set(group.key, group);
    for (const view of views) {
      const viewEdition = catalogEdition(catalogGroup, view);
      const key = basketKey(group.key, viewEdition);
      const basket: BasketAccumulator = {
        changeAmount: 0,
        changePercent: 0,
        edition: viewEdition,
        endValue: 0,
        expectedPrintingCount: view.printingCount,
        hasMovement: false,
        key,
        logoUrl: null,
        queryEdition: view.edition,
        setId: view.setId,
        setName: catalogGroup.label,
        startValue: 0,
        symbolUrl: catalogGroup.symbolUrl,
        variantCount: 0,
        view,
      };
      baskets.set(key, basket);
      group.baskets.push(basket);
    }
  }

  for (const movement of movements) {
    const catalogGroup = catalogGroups.find((group) =>
      group.views.some((view) => view.setId === movement.setId),
    );
    const view = catalogGroup ? movementView(catalogGroup, movement) : null;
    const groupKey = catalogGroup?.key ?? movement.setId;
    const movementEdition = view && catalogGroup
      ? catalogEdition(catalogGroup, view)
      : movement.edition || 'All printings';
    if (edition && movementEdition !== edition) continue;

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        baskets: [],
        changeAmount: 0,
        changePercent: 0,
        endValue: 0,
        expectedPrintingCount: 0,
        hasMovement: false,
        key: groupKey,
        logoUrl: movement.logoUrl,
        name: catalogGroup?.label ?? movement.setName,
        startValue: 0,
        symbolUrl: movement.symbolUrl,
        variantCount: 0,
      };
      groups.set(groupKey, group);
    }

    const key = basketKey(groupKey, movementEdition);
    let basket = baskets.get(key);
    if (!basket) {
      basket = {
        ...movement,
        changeAmount: 0,
        changePercent: 0,
        edition: movementEdition,
        endValue: 0,
        expectedPrintingCount: movement.variantCount,
        hasMovement: false,
        key,
        queryEdition: view?.edition ?? movement.edition,
        setId: view?.setId ?? movement.setId,
        setName: catalogGroup?.label ?? movement.setName,
        startValue: 0,
        variantCount: 0,
        view,
      };
      baskets.set(key, basket);
      group.baskets.push(basket);
    }

    basket.startValue += movement.startValue;
    basket.endValue += movement.endValue;
    basket.variantCount += movement.variantCount;
    basket.hasMovement = true;
    basket.logoUrl ??= movement.logoUrl;
    basket.symbolUrl ??= movement.symbolUrl;
  }

  for (const group of groups.values()) {
    group.baskets.sort(
      (left, right) =>
        (editionOrder.get(left.edition) ?? 99) -
        (editionOrder.get(right.edition) ?? 99),
    );
    for (const basket of group.baskets) {
      basket.startValue = roundMoney(basket.startValue);
      basket.endValue = roundMoney(basket.endValue);
      basket.changeAmount = roundMoney(basket.endValue - basket.startValue);
      basket.changePercent = basket.startValue > 0
        ? roundPercent(basket.changeAmount / basket.startValue * 100)
        : 0;
      group.startValue += basket.startValue;
      group.endValue += basket.endValue;
      group.variantCount += basket.variantCount;
      group.expectedPrintingCount += basket.expectedPrintingCount;
      group.hasMovement ||= basket.hasMovement;
      group.logoUrl ??= basket.logoUrl;
      group.symbolUrl ??= basket.symbolUrl;
    }
    group.startValue = roundMoney(group.startValue);
    group.endValue = roundMoney(group.endValue);
    group.changeAmount = roundMoney(group.endValue - group.startValue);
    group.changePercent = group.startValue > 0
      ? roundPercent(group.changeAmount / group.startValue * 100)
      : 0;
  }

  return [...groups.values()].sort((left, right) => {
    const leftMovement = rank === 'amount'
      ? Math.abs(left.changeAmount)
      : Math.abs(left.changePercent);
    const rightMovement = rank === 'amount'
      ? Math.abs(right.changeAmount)
      : Math.abs(right.changePercent);
    if (leftMovement !== rightMovement) return rightMovement - leftMovement;
    return left.name.localeCompare(right.name);
  });
}

function emptyGroup(group: CatalogSetGroup): MarketSetMovementGroup {
  return {
    baskets: [],
    changeAmount: 0,
    changePercent: 0,
    endValue: 0,
    expectedPrintingCount: 0,
    hasMovement: false,
    key: group.key,
    logoUrl: null,
    name: group.label,
    startValue: 0,
    symbolUrl: group.symbolUrl,
    variantCount: 0,
  };
}

function marketViews(group: CatalogSetGroup): CatalogSetView[] {
  const editionViews = group.views.filter((view) => view.label !== 'All printings');
  return editionViews.length > 0 ? editionViews : group.views;
}

function movementView(
  group: CatalogSetGroup,
  movement: MarketSetMovement,
): CatalogSetView | null {
  const candidates = marketViews(group).filter((view) => view.setId === movement.setId);
  return (
    candidates.find((view) => view.edition === movement.edition) ??
    candidates.find((view) => view.label === movement.edition) ??
    (candidates.length === 1 ? candidates[0] : null)
  );
}

function catalogEdition(group: CatalogSetGroup, view: CatalogSetView): string {
  if (view.edition) return view.edition;
  if (group.key === 'base-set') return view.label;
  return view.label === 'All printings' ? 'All printings' : view.label;
}

function basketKey(groupKey: string, edition: string): string {
  return `${groupKey}\u0000${edition}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
