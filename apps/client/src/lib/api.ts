export type Health = {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unavailable';
};

export type CatalogSet = {
  id: string;
  name: string;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  editions: string[];
  cardCount: number;
  variantCount: number;
  minimumPrice: number | null;
  maximumPrice: number | null;
};

export type CatalogVariant = {
  id: string;
  printing: string;
  edition: string;
  finish: string;
  condition: string;
  language: string;
  currentPrice: number | null;
};

export type CatalogCard = {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  tcgplayerProductId: number | null;
  imageUrl: string | null;
  setId: string;
  setName: string;
  variants: CatalogVariant[];
};

export type CatalogCardPage = {
  cards: CatalogCard[];
  total: number;
  limit: number;
  offset: number;
};

export type MarketPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export type MarketCondition =
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

export type MarketSignal = 'regular' | 'volatile' | 'limited';

export type MarketMover = {
  variantId: string;
  cardId: string;
  cardName: string;
  cardNumber: string | null;
  setId: string;
  setName: string;
  imageUrl: string | null;
  printing: string;
  condition: MarketCondition;
  startPrice: number;
  endPrice: number;
  changeAmount: number;
  changePercent: number;
  startDate: string;
  endDate: string;
  observationCount: number;
  signal: MarketSignal;
};

export type MarketSetMovement = {
  setId: string;
  setName: string;
  startValue: number;
  endValue: number;
  changeAmount: number;
  changePercent: number;
  variantCount: number;
};

export type MarketOverview = {
  period: MarketPeriod;
  condition: MarketCondition;
  summary: {
    asOf: string;
    evaluatedVariants: number;
    risingVariants: number;
    fallingVariants: number;
    unchangedVariants: number;
    medianChangePercent: number;
  };
  sets: MarketSetMovement[];
  gainers: MarketMover[];
  losers: MarketMover[];
};

export type PricePoint = {
  date: string;
  price: number;
};

export type VariantHistory = {
  variantId: string;
  cardId: string;
  cardName: string;
  cardNumber: string | null;
  setId: string;
  setName: string;
  imageUrl: string | null;
  printing: string;
  condition: MarketCondition;
  period: MarketPeriod;
  startPrice: number | null;
  endPrice: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  signal: MarketSignal;
  points: PricePoint[];
};

export type SetPriceCard = {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  imageUrl: string | null;
  variantId: string | null;
  printing: string | null;
  finish: string | null;
  currentPrice: number | null;
};

export type SetPricing = {
  set: CatalogSet;
  edition: string;
  condition: MarketCondition;
  period: MarketPeriod;
  summary: {
    totalValue: number;
    averagePrice: number;
    minimumPrice: number | null;
    maximumPrice: number | null;
    pricedCards: number;
    cardCount: number;
    complete: boolean;
  };
  cards: SetPriceCard[];
  points: PricePoint[];
};

export const apiURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(`${apiURL}/api/health`, { signal });
  if (!response.ok) {
    throw new Error(`BinderLedger API returned ${response.status}`);
  }
  return response.json() as Promise<Health>;
}

export async function getCatalogSets(signal?: AbortSignal): Promise<CatalogSet[]> {
  const response = await fetch(`${apiURL}/api/catalog/sets`, { signal });
  if (!response.ok) {
    throw new Error(`Catalog sets returned ${response.status}`);
  }
  const body = (await response.json()) as { sets: CatalogSet[] };
  return body.sets;
}

type CatalogCardRequest = {
  setId?: string;
  query?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export async function getCatalogCards({
  setId = '',
  query = '',
  limit = 24,
  offset = 0,
  signal,
}: CatalogCardRequest): Promise<CatalogCardPage> {
  const parameters = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (setId) parameters.set('set_id', setId);
  if (query) parameters.set('q', query);

  const response = await fetch(`${apiURL}/api/catalog/cards?${parameters}`, { signal });
  if (!response.ok) {
    throw new Error(`Catalog cards returned ${response.status}`);
  }
  return response.json() as Promise<CatalogCardPage>;
}

type SetPricingRequest = {
  setId: string;
  edition: string;
  condition: MarketCondition;
  period: MarketPeriod;
  signal?: AbortSignal;
};

export async function getSetPricing({
  setId,
  edition,
  condition,
  period,
  signal,
}: SetPricingRequest): Promise<SetPricing> {
  const parameters = new URLSearchParams({ edition, condition, period });
  const response = await fetch(
    `${apiURL}/api/catalog/sets/${encodeURIComponent(setId)}/pricing?${parameters}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Set pricing returned ${response.status}`);
  }
  return response.json() as Promise<SetPricing>;
}

type MarketOverviewRequest = {
  period: MarketPeriod;
  condition: MarketCondition;
  limit?: number;
  setId?: string;
  signal?: AbortSignal;
};

export async function getMarketOverview({
  period,
  condition,
  limit = 8,
  setId = '',
  signal,
}: MarketOverviewRequest): Promise<MarketOverview> {
  const parameters = new URLSearchParams({
    period,
    condition,
    limit: String(limit),
  });
  if (setId) parameters.set('set_id', setId);

  const response = await fetch(`${apiURL}/api/market/overview?${parameters}`, { signal });
  if (!response.ok) {
    throw new Error(`Market overview returned ${response.status}`);
  }
  return response.json() as Promise<MarketOverview>;
}

export async function getVariantHistory(
  variantId: string,
  period: MarketPeriod,
  signal?: AbortSignal,
): Promise<VariantHistory> {
  const parameters = new URLSearchParams({ period });
  const response = await fetch(
    `${apiURL}/api/market/variants/${encodeURIComponent(variantId)}/history?${parameters}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Variant history returned ${response.status}`);
  }
  return response.json() as Promise<VariantHistory>;
}

export function formatCurrency(value: number | null): string {
  if (value === null) return 'No price';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null, includePlus = true): string {
  if (value === null) return 'No change';
  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}
