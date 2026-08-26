import { fetch as expoFetch } from 'expo/fetch';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

export { formatCurrency, formatPercent, formatSignedCurrency } from './formatters';

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
  editionPrintingCounts?: Record<string, number>;
  declaredCardCount: number | null;
  cardCount: number;
  printingCount: number;
  sharedCardCount: number;
  sharedPrintingCount: number;
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
  sourceProvider: string;
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

export type PriceQuality = {
  status: 'current' | 'historical' | 'unavailable';
  asOf: string | null;
  reason: 'missing_conditions' | 'condition_order' | null;
};

export type CatalogValuationReference = {
  id: string;
  kind: 'ungraded' | 'graded';
  label: string;
  grader: string | null;
  grade: string | null;
  amount: number | null;
  currency: string;
  sourceName: string;
  sourceUrl: string;
  printingVariant: string;
  isPrimary: boolean;
  checkedOn: string;
  note: string | null;
};

export type CatalogListing = {
  id: string;
  cardId: string;
  name: string;
  number: string | null;
  rarity: string | null;
  tcgplayerProductId: number | null;
  imageUrl: string | null;
  setId: string;
  setName: string;
  edition: string;
  finish: string;
  language: string;
  selectedVariantId: string | null;
  currentPrice: number | null;
  valuationKind: 'condition' | 'ungraded_reference' | null;
  priceQuality: PriceQuality;
  variants: CatalogVariant[];
  valuationReferences: CatalogValuationReference[];
};

export type CatalogListingPage = {
  listings: CatalogListing[];
  total: number;
  limit: number;
  offset: number;
  pricing: {
    currency: string;
    asOf: string | null;
  };
};

export type CatalogListingSort =
  | 'set_number'
  | 'price_desc'
  | 'price_asc'
  | 'name_asc'
  | 'name_desc';

export type MarketPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export type MarketMovementMode = 'amount' | 'percent';

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
  setLogoUrl: string | null;
  setSymbolUrl: string | null;
  imageUrl: string | null;
  edition: string;
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
  edition: string;
  logoUrl: string | null;
  symbolUrl: string | null;
  startValue: number;
  endValue: number;
  changeAmount: number;
  changePercent: number;
  variantCount: number;
};

export type MarketOverview = {
  period: MarketPeriod;
  condition: MarketCondition;
  rank: MarketMovementMode;
  summary: {
    asOf: string;
    evaluatedVariants: number;
    risingVariants: number;
    fallingVariants: number;
    unchangedVariants: number;
    medianChangeAmount: number;
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
  valuationKind: 'condition' | 'ungraded_reference' | null;
  priceQuality: PriceQuality | null;
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
    currentCards: number;
    historicalCards: number;
    estimatedCards: number;
    warningCards: number;
    unavailableCards: number;
    cardCount: number;
    complete: boolean;
  };
  cards: SetPriceCard[];
  points: PricePoint[];
};

export type WatchlistPriceMovement = {
  startPrice: number | null;
  endPrice: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  startDate: string | null;
  endDate: string | null;
  observationCount: number;
  signal: MarketSignal;
};

export type WatchedCard = WatchlistPriceMovement & {
  itemId: number;
  cardId: string;
  cardName: string;
  cardNumber: string | null;
  setId: string;
  setName: string;
  imageUrl: string | null;
  edition: string;
  finish: string;
  language: string;
  variantId: string | null;
  printing: string | null;
  condition: MarketCondition;
  currentPrice: number | null;
  valuationKind: 'condition' | 'ungraded_reference' | null;
  priceQuality: PriceQuality;
};

export type WatchedSet = WatchlistPriceMovement & {
  itemId: number;
  setId: string;
  setName: string;
  symbolUrl: string | null;
  edition: string;
  condition: MarketCondition;
  currentValue: number | null;
  cardCount: number;
  pricedCards: number;
  warningCards: number;
  estimatedCards: number;
};

export type WatchlistOverview = {
  id: string;
  name: string;
  period: MarketPeriod;
  condition: MarketCondition;
  summary: {
    asOf: string;
    cardCount: number;
    setCount: number;
    pricedCardCount: number;
    currentCardValue: number;
    risingItems: number;
    fallingItems: number;
    unchangedItems: number;
  };
  cards: WatchedCard[];
  sets: WatchedSet[];
};

export type WatchlistCardTarget = {
  cardId: string;
  edition: string;
  finish: string;
  language: string;
};

export type WatchlistCardMembership = WatchlistCardTarget & {
  itemId: number;
};

export type WatchlistSetTarget = {
  setId: string;
  edition: string;
};

export type WatchlistSetMembership = WatchlistSetTarget & {
  itemId: number;
};

export type WatchlistMemberships = {
  id: string;
  cards: WatchlistCardMembership[];
  sets: WatchlistSetMembership[];
};

export type ScanCapture = {
  format: 'jpg' | 'png';
  height: number;
  uri: string;
  width: number;
};

export type ScanImage = {
  id: number;
  side: 'front' | 'back';
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

export type ScanCandidate = {
  rank: number;
  cardId: string;
  cardName: string;
  number: string | null;
  setId: string;
  setName: string;
  edition: string;
  finish: string;
  language: string;
  imageUrl: string;
  score: number;
  signals: Record<string, unknown>;
};

export type ScanConfirmation = {
  decision: 'confirmed' | 'rejected';
  candidateRank: number | null;
  cardId: string | null;
  edition: string | null;
  finish: string | null;
  language: string | null;
  confirmedAt: string;
};

export type ScanSession = {
  id: string;
  status: 'captured' | 'processing' | 'complete' | 'failed';
  purpose: 'identify' | 'condition';
  clientPlatform: 'android' | 'ios' | 'web' | 'unknown';
  recognizerVersion: string | null;
  failureReason: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: ScanImage[];
  candidates: ScanCandidate[];
  confirmation: ScanConfirmation | null;
};

export const defaultWatchlistID = 'default';

const configuredAPIURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4001';

// Web uses the same origin so the development Metro proxy and production
// nginx proxy can forward API requests without browser CORS exceptions.
export const apiURL = Platform.OS === 'web' ? '' : configuredAPIURL;

export function resolveImageURL(value: string | null): string | null {
  if (!value || !value.startsWith('/')) return value;
  return `${apiURL}${value}`;
}

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

type CatalogListingRequest = {
  setId?: string;
  query?: string;
  edition?: string;
  finish?: string;
  gradedOnly?: boolean;
  condition: MarketCondition;
  sort?: CatalogListingSort;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export async function getCatalogListings({
  setId = '',
  query = '',
  edition = '',
  finish = '',
  gradedOnly = false,
  condition,
  sort = 'set_number',
  limit = 24,
  offset = 0,
  signal,
}: CatalogListingRequest): Promise<CatalogListingPage> {
  const parameters = new URLSearchParams({
    condition,
    limit: String(limit),
    offset: String(offset),
    sort,
  });
  if (setId) parameters.set('set_id', setId);
  if (query) parameters.set('q', query);
  if (edition) parameters.set('edition', edition);
  if (finish) parameters.set('finish', finish);
  if (gradedOnly) parameters.set('graded_only', 'true');

  const response = await fetch(`${apiURL}/api/catalog/listings?${parameters}`, { signal });
  if (!response.ok) {
    throw new Error(`Catalog listings returned ${response.status}`);
  }
  return response.json() as Promise<CatalogListingPage>;
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
  rank?: MarketMovementMode;
  limit?: number;
  setId?: string;
  signal?: AbortSignal;
};

export async function getMarketOverview({
  period,
  condition,
  rank = 'amount',
  limit = 8,
  setId = '',
  signal,
}: MarketOverviewRequest): Promise<MarketOverview> {
  const parameters = new URLSearchParams({
    period,
    condition,
    rank,
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

export async function getWatchlistMemberships(
  watchlistId = defaultWatchlistID,
  signal?: AbortSignal,
): Promise<WatchlistMemberships> {
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}/items`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Watchlist items returned ${response.status}`);
  }
  return response.json() as Promise<WatchlistMemberships>;
}

export async function getWatchlistOverview({
  watchlistId = defaultWatchlistID,
  condition,
  period,
  signal,
}: {
  watchlistId?: string;
  condition: MarketCondition;
  period: MarketPeriod;
  signal?: AbortSignal;
}): Promise<WatchlistOverview> {
  const parameters = new URLSearchParams({ condition, period });
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}?${parameters}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Watchlist returned ${response.status}`);
  }
  return response.json() as Promise<WatchlistOverview>;
}

export async function addWatchlistCard(
  target: WatchlistCardTarget,
  watchlistId = defaultWatchlistID,
): Promise<WatchlistCardMembership> {
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}/cards`,
    {
      body: JSON.stringify(target),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  if (!response.ok) {
    throw new Error(`Watchlist card returned ${response.status}`);
  }
  return response.json() as Promise<WatchlistCardMembership>;
}

export async function removeWatchlistCard(
  itemId: number,
  watchlistId = defaultWatchlistID,
): Promise<void> {
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}/cards/${itemId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Watchlist card removal returned ${response.status}`);
  }
}

export async function addWatchlistSet(
  target: WatchlistSetTarget,
  watchlistId = defaultWatchlistID,
): Promise<WatchlistSetMembership> {
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}/sets`,
    {
      body: JSON.stringify(target),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  if (!response.ok) {
    throw new Error(`Watchlist set returned ${response.status}`);
  }
  return response.json() as Promise<WatchlistSetMembership>;
}

export async function removeWatchlistSet(
  itemId: number,
  watchlistId = defaultWatchlistID,
): Promise<void> {
  const response = await fetch(
    `${apiURL}/api/watchlists/${encodeURIComponent(watchlistId)}/sets/${itemId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Watchlist set removal returned ${response.status}`);
  }
}

export async function createScanSession(
  front: ScanCapture,
  back: ScanCapture | undefined,
  platform: string,
  purpose: 'identify' | 'condition',
): Promise<ScanSession> {
  const formData = new FormData();
  formData.append('platform', platform);
  formData.append('purpose', purpose);
  await appendScanCapture(formData, 'front', front);
  if (back) await appendScanCapture(formData, 'back', back);

  const response = await expoFetch(`${apiURL}/api/scans`, {
    body: formData,
    method: 'POST',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Scan upload returned ${response.status}`);
  }
  return response.json() as Promise<ScanSession>;
}

export async function getScanSession(scanId: string): Promise<ScanSession> {
  const response = await fetch(`${apiURL}/api/scans/${encodeURIComponent(scanId)}`);
  if (!response.ok) {
    throw new Error(`Scan status returned ${response.status}`);
  }
  return response.json() as Promise<ScanSession>;
}

export async function confirmScanSession(
  scanId: string,
  candidateRank: number | null,
): Promise<ScanSession> {
  const response = await fetch(
    `${apiURL}/api/scans/${encodeURIComponent(scanId)}/confirmation`,
    {
      body: JSON.stringify(
        candidateRank === null
          ? { decision: 'rejected' }
          : { candidateRank, decision: 'confirmed' },
      ),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Scan confirmation returned ${response.status}`);
  }
  return response.json() as Promise<ScanSession>;
}

async function appendScanCapture(
  formData: FormData,
  side: 'front' | 'back',
  capture: ScanCapture,
): Promise<void> {
  const filename = `${side}.${capture.format}`;
  if (capture.uri.startsWith('data:') || capture.uri.startsWith('blob:')) {
    const response = await fetch(capture.uri);
    formData.append(side, await response.blob(), filename);
    return;
  }
  formData.append(side, new ExpoFile(capture.uri), filename);
}
