export type Health = {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unavailable';
};

export type CatalogSet = {
  id: string;
  name: string;
  releaseDate: string | null;
  cardCount: number;
  variantCount: number;
  minimumPrice: number | null;
  maximumPrice: number | null;
};

export type CatalogVariant = {
  id: string;
  printing: string;
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

export function formatCurrency(value: number | null): string {
  if (value === null) return 'No price';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}
