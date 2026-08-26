import { expect, test } from '@playwright/test';

const listing = {
  cardId: 'base-charizard',
  currentPrice: 699.99,
  edition: 'First Edition',
  finish: 'Holofoil',
  id: 'base-charizard:first-edition:holofoil:english',
  imageUrl: null,
  language: 'English',
  name: 'Charizard',
  number: '4/102',
  priceQuality: { asOf: '2026-08-26', reason: null, status: 'current' },
  rarity: 'Rare Holo',
  selectedVariantId: 'base-charizard-nm',
  setId: 'base-set',
  setName: 'Base Set',
  tcgplayerProductId: null,
  valuationKind: 'condition',
  valuationReferences: [],
  variants: [
    {
      condition: 'Near Mint',
      currentPrice: 699.99,
      edition: 'First Edition',
      finish: 'Holofoil',
      id: 'base-charizard-nm',
      language: 'English',
      printing: 'First Edition Holofoil',
      sourceProvider: 'CI fixture',
    },
  ],
};

test('browses the catalog and opens the shared card detail overlay', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;

    if (path === '/api/catalog/sets') {
      body = {
        sets: [
          {
            cardCount: 1,
            declaredCardCount: 102,
            editions: ['First Edition'],
            id: 'base-set',
            logoUrl: null,
            maximumPrice: 699.99,
            minimumPrice: 699.99,
            name: 'Base Set',
            printingCount: 1,
            releaseDate: '1999-01-09',
            sharedCardCount: 0,
            sharedPrintingCount: 0,
            symbolUrl: null,
            variantCount: 1,
          },
        ],
      };
    } else if (path === '/api/catalog/listings') {
      body = {
        limit: 24,
        listings: [listing],
        offset: 0,
        pricing: { asOf: '2026-08-26', currency: 'USD' },
        total: 1,
      };
    } else if (path === '/api/watchlists/default/items') {
      body = { cards: [], id: 'default', sets: [] };
    } else if (path === '/api/market/variants/base-charizard-nm/history') {
      body = {
        cardId: 'base-charizard',
        cardName: 'Charizard',
        cardNumber: '4/102',
        changeAmount: 13.99,
        changePercent: 2.04,
        condition: 'Near Mint',
        endPrice: 699.99,
        imageUrl: null,
        period: '1m',
        points: [
          { date: '2026-07-26', price: 686 },
          { date: '2026-08-26', price: 699.99 },
        ],
        printing: 'First Edition Holofoil',
        setId: 'base-set',
        setName: 'Base Set',
        signal: 'regular',
        startPrice: 686,
        variantId: 'base-charizard-nm',
      };
    } else {
      body = {};
    }

    await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json' });
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Catalog · BinderLedger');
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute(
    'href',
    '/favicon.ico?v=20260826-brand-2',
  );
  await expect(page.getByText('Card catalog')).toBeVisible();
  await expect(page.getByText('1-1 of 1 printings')).toBeVisible();

  const card = page.getByRole('button', { name: /Open Charizard/ });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('catalog-card-image-frame')).toHaveCSS(
    'background-color',
    'rgb(8, 33, 63)',
  );
  await card.click();

  await expect(page.getByText('Base Set / 4/102 / Rare Holo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close card details' })).toBeVisible();
});
