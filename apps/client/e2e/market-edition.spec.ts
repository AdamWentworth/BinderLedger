import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

const mover = {
  cardId: 'jungle-flareon',
  cardName: 'Flareon',
  cardNumber: '19/64',
  changeAmount: 18,
  changePercent: 12,
  condition: 'Near Mint',
  edition: 'First Edition',
  endDate: '2026-08-26',
  endPrice: 168,
  imageUrl: null,
  observationCount: 30,
  printing: 'First Edition Holofoil',
  setId: 'jungle-pokemon',
  setLogoUrl: null,
  setName: 'Jungle',
  setSymbolUrl: null,
  signal: 'regular',
  startDate: '2026-07-26',
  startPrice: 150,
  variantId: 'jungle-flareon-first-edition-nm',
};

test('edition scope refreshes the complete market overview', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;

    if (url.pathname === '/api/health') {
      body = { buildSha: 'e2e', status: 'ok' };
    } else if (url.pathname === '/api/catalog/sets') {
      body = {
        sets: [
          {
            cardCount: 64,
            declaredCardCount: 64,
            editionPrintingCounts: { 'First Edition': 64, Unlimited: 64 },
            editions: ['First Edition', 'Unlimited'],
            id: 'jungle-pokemon',
            logoUrl: null,
            maximumPrice: 168,
            minimumPrice: 1,
            name: 'Jungle',
            printingCount: 128,
            releaseDate: '1999-06-16',
            sharedCardCount: 0,
            sharedPrintingCount: 0,
            symbolUrl: null,
            variantCount: 128,
          },
        ],
      };
    } else if (url.pathname === '/api/market/overview') {
      const firstEdition = url.searchParams.get('edition') === 'First Edition';
      body = {
        condition: 'Near Mint',
        gainers: [mover],
        losers: [],
        period: '1m',
        rank: 'amount',
        sets: [
          {
            changeAmount: 18,
            changePercent: 12,
            edition: 'First Edition',
            endValue: 168,
            logoUrl: null,
            setId: 'jungle-pokemon',
            setName: 'Jungle',
            startValue: 150,
            symbolUrl: null,
            variantCount: firstEdition ? 1 : 2,
          },
        ],
        summary: {
          asOf: '2026-08-26',
          evaluatedVariants: firstEdition ? 1 : 2,
          fallingVariants: 0,
          medianChangeAmount: 18,
          medianChangePercent: 12,
          risingVariants: firstEdition ? 1 : 2,
          unchangedVariants: 0,
        },
      };
    } else if (url.pathname === '/api/market/movements') {
      body = {
        condition: 'Near Mint',
        direction: 'all',
        limit: 24,
        movements: [mover],
        offset: 0,
        period: '1m',
        rank: 'amount',
        total: 1,
      };
    } else if (url.pathname.includes('/api/market/variants/')) {
      body = {
        ...mover,
        points: [
          { date: '2026-07-26', price: 150 },
          { date: '2026-08-26', price: 168 },
        ],
        period: '1m',
      };
    } else {
      body = {};
    }

    await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json' });
  });

  await page.goto('/market');
  await expect(page.getByText('Edition scope')).toBeVisible();
  await expect(page.getByText('2 fresh variants / All editions')).toBeVisible();

  const firstEditionRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/market/overview' &&
      url.searchParams.get('edition') === 'First Edition'
    );
  });
  await page.getByRole('tab', { name: 'First Edition only' }).click();
  await firstEditionRequest;

  await expect(page.getByText('1 fresh variant / First Edition')).toBeVisible();

  await page.getByRole('tab', { name: /^Sets\./ }).click();
  await expect(page.getByText(/First Edition \/ Near Mint \/ Past month/)).toBeVisible();

  const cardMovementRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/market/movements' &&
      url.searchParams.get('edition') === 'First Edition'
    );
  });
  await page.getByRole('tab', { name: /^Cards\./ }).click();
  await cardMovementRequest;
  await expect(
    page.getByText('1 of 1 printings / First Edition / All sets'),
  ).toBeVisible();
});
