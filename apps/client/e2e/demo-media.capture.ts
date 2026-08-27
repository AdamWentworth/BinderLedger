/// <reference types="node" />

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

type DemoViewport = {
  height: number;
  isMobile: boolean;
  key: 'desktop' | 'mobile';
  width: number;
};

type CapturedMedia = {
  name: string;
  path: string;
  viewport: DemoViewport['key'];
};

const outputRoot = resolve(
  process.env.BINDERLEDGER_DEMO_MEDIA_OUT ?? '.artifacts/demo-media/binderledger',
);
const screenshotsDirectory = resolve(outputRoot, 'screenshots');
const videosDirectory = resolve(outputRoot, 'videos');
const manifestPath = resolve(outputRoot, 'manifest.json');
const captureKinds = selectedValues(
  process.env.BINDERLEDGER_DEMO_MEDIA_KINDS,
  ['screenshots', 'videos'] as const,
);
const selectedViewportKeys = selectedValues(
  process.env.BINDERLEDGER_DEMO_MEDIA_VIEWPORTS,
  ['desktop', 'mobile'] as const,
);
const availableViewports = [
  { height: 1000, isMobile: false, key: 'desktop', width: 1440 },
  { height: 844, isMobile: true, key: 'mobile', width: 390 },
] satisfies DemoViewport[];
const viewports = availableViewports.filter((viewport) =>
  selectedViewportKeys.has(viewport.key),
);
const captured: { generatedAt: string; screenshots: CapturedMedia[]; videos: CapturedMedia[] } = {
  generatedAt: new Date().toISOString(),
  screenshots: [],
  videos: [],
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  rmSync(outputRoot, { force: true, recursive: true });
  mkdirSync(screenshotsDirectory, { recursive: true });
  mkdirSync(videosDirectory, { recursive: true });
});

test.afterAll(() => {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(captured, null, 2)}\n`);
});

test('captures BinderLedger feature screenshots', async ({ browser }) => {
  test.skip(!captureKinds.has('screenshots'), 'Screenshot capture was not selected.');

  for (const viewport of viewports) {
    const context = await browser.newContext(contextOptions(viewport));
    const page = await context.newPage();

    await captureScreenshot(page, viewport, 'catalog', async () => {
      await openCatalog(page);
    });

    await captureScreenshot(page, viewport, 'catalog-card-details', async () => {
      await clickWithPointer(page, viewport, catalogCard(page));
      await expect(page.getByRole('button', { name: 'Close card details' })).toBeVisible();
    });

    await clickWithPointer(page, viewport, page.getByRole('button', { name: 'Close card details' }));
    await captureScreenshot(page, viewport, 'catalog-sets', async () => {
      await clickWithPointer(page, viewport, page.getByRole('tab', { name: 'Sets', exact: true }));
      await expect(page.getByText(/\d+ print runs/)).toBeVisible();
    });

    await captureScreenshot(page, viewport, 'market-overview', async () => {
      await openMarket(page);
    });

    await captureScreenshot(page, viewport, 'market-set-rankings', async () => {
      await clickWithPointer(page, viewport, marketCategory(page, 'Sets'));
      await expect(page.getByText('Set rankings')).toBeVisible();
    });

    await captureScreenshot(page, viewport, 'market-card-movers', async () => {
      await clickWithPointer(page, viewport, marketCategory(page, 'Cards'));
      await expect(page.getByText('Card movement', { exact: true })).toBeVisible();
      const mover = marketMover(page).first();
      await expect(mover).toBeVisible();
      await clickWithPointer(page, viewport, mover);
      await expect(page.getByText('Price history')).toBeVisible();
    });

    await context.close();
  }
});

test('records BinderLedger walkthrough videos', async ({ browser }) => {
  test.skip(!captureKinds.has('videos'), 'Video capture was not selected.');

  for (const viewport of viewports) {
    await recordVideo(browser, viewport, 'catalog-exploration', async (page) => {
      await openCatalog(page);
      await pause(page, 650);
      await clickWithPointer(
        page,
        viewport,
        page.getByRole('tab', { name: 'Compact card size' }),
        600,
      );
      await smoothScrollBy(page, viewport.isMobile ? 420 : 520, 900);
      await smoothScrollToTop(page, 750);
      await clickWithPointer(page, viewport, catalogCard(page), 900);
      await expect(page.getByRole('button', { name: 'Close card details' })).toBeVisible();
      await pause(page, 1_000);
      await clickWithPointer(page, viewport, page.getByRole('button', { name: 'Close card details' }), 650);
      await clickWithPointer(page, viewport, page.getByRole('tab', { name: 'Sets', exact: true }), 750);
      await expect(page.getByText(/\d+ print runs/)).toBeVisible();
      await smoothScrollBy(page, viewport.isMobile ? 360 : 460, 1_000);
    });

    await recordVideo(browser, viewport, 'market-exploration', async (page) => {
      await openMarket(page);
      await pause(page, 650);
      await smoothScrollBy(page, viewport.isMobile ? 360 : 440, 900);
      await smoothScrollToTop(page, 700);
      await clickWithPointer(page, viewport, marketCategory(page, 'Sets'), 750);
      await expect(page.getByText('Set rankings')).toBeVisible();
      await smoothScrollBy(page, viewport.isMobile ? 420 : 520, 900);
      await smoothScrollToTop(page, 700);
      await clickWithPointer(page, viewport, marketCategory(page, 'Cards'), 800);
      await expect(page.getByText('Card movement', { exact: true })).toBeVisible();
      const mover = marketMover(page).first();
      await clickWithPointer(page, viewport, mover, 800);
      await expect(page.getByText('Price history')).toBeVisible();
      await pause(page, 1_000);
      const detailsButton = page.getByRole('button', { name: /^Open .* card details$/ }).first();
      if (await detailsButton.isVisible().catch(() => false)) {
        await clickWithPointer(page, viewport, detailsButton, 900);
        await expect(page.getByRole('button', { name: 'Close card details' })).toBeVisible();
        await pause(page, 900);
      }
    });
  }
});

async function captureScreenshot(
  page: Page,
  viewport: DemoViewport,
  name: string,
  prepare: () => Promise<void>,
) {
  await prepare();
  await waitForVisualReady(page);
  await hidePointer(page);
  const filename = `binderledger-${name}-${viewport.key}.png`;
  const outputPath = resolve(screenshotsDirectory, filename);
  await page.screenshot({ fullPage: false, path: outputPath });
  captured.screenshots.push({ name, path: artifactPath(outputPath), viewport: viewport.key });
}

async function recordVideo(
  browser: Browser,
  viewport: DemoViewport,
  name: string,
  flow: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({
    ...contextOptions(viewport),
    recordVideo: {
      dir: videosDirectory,
      size: { height: viewport.height, width: viewport.width },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  if (!video) throw new Error('Playwright did not initialize video recording.');

  await flow(page);
  await waitForVisualReady(page);
  await page.close();
  await context.close();

  const filename = `binderledger-${name}-${viewport.key}.webm`;
  const outputPath = resolve(videosDirectory, filename);
  const originalPath = await video.path();
  await video.saveAs(outputPath);
  if (resolve(originalPath) !== outputPath) rmSync(originalPath, { force: true });
  captured.videos.push({ name, path: artifactPath(outputPath), viewport: viewport.key });
}

async function openCatalog(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Card catalog')).toBeVisible();
  await expect(catalogCard(page)).toBeVisible();
  await waitForVisualReady(page);
}

async function openMarket(page: Page) {
  await page.goto('/market', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Edition scope')).toBeVisible();
  await expect(page.getByText('Top gainers')).toBeVisible();
  await waitForVisualReady(page);
}

function marketCategory(page: Page, label: 'Cards' | 'Sets') {
  return page.getByRole('tab', { name: new RegExp(`^${label}\\.`) });
}

function marketMover(page: Page) {
  return page.getByRole('button', { name: /current price\. Change/ });
}

function catalogCard(page: Page) {
  return page.getByRole('button', { name: /^Open (?!catalog filters)/ }).first();
}

function contextOptions(viewport: DemoViewport) {
  return {
    deviceScaleFactor: 1,
    hasTouch: viewport.isMobile,
    isMobile: viewport.isMobile,
    viewport: { height: viewport.height, width: viewport.width },
  };
}

async function waitForVisualReady(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((image) => {
            const bounds = image.getBoundingClientRect();
            return (
              bounds.width > 8 &&
              bounds.height > 8 &&
              bounds.bottom > 0 &&
              bounds.right > 0 &&
              bounds.top < window.innerHeight &&
              bounds.left < window.innerWidth
            );
          })
          .every((image) => image.complete && image.naturalWidth > 0),
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await pause(page, 350);
}

async function clickWithPointer(
  page: Page,
  viewport: DemoViewport,
  locator: Locator,
  pauseMilliseconds = 450,
) {
  const target = locator.first();
  await target.scrollIntoViewIfNeeded({ timeout: 15_000 }).catch(() => undefined);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error('Could not measure a demo interaction target.');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await showPointer(page, viewport, point.x, point.y);
  if (!viewport.isMobile) await page.mouse.move(point.x, point.y, { steps: 8 });
  await target.click({ timeout: 15_000 });
  await pulsePointer(page);
  await waitForVisualReady(page);
  await pause(page, pauseMilliseconds);
}

async function showPointer(page: Page, viewport: DemoViewport, x: number, y: number) {
  await installPointer(page, viewport);
  await page.evaluate(
    ({ isMobile, x, y }) => {
      const pointer = document.querySelector<HTMLElement>('[data-demo-pointer]');
      if (!pointer) return;
      const left = isMobile ? x - 17 : x - 2;
      const top = isMobile ? y - 17 : y - 2;
      pointer.style.opacity = '1';
      pointer.style.transform = `translate(${left}px, ${top}px)`;
    },
    { isMobile: viewport.isMobile, x, y },
  );
  await pause(page, 180);
}

async function pulsePointer(page: Page) {
  await page.evaluate(() => {
    const pointer = document.querySelector<HTMLElement>('[data-demo-pointer]');
    if (!pointer) return;
    pointer.classList.remove('demo-pointer-tap');
    void pointer.getBoundingClientRect();
    pointer.classList.add('demo-pointer-tap');
    window.setTimeout(() => pointer.classList.remove('demo-pointer-tap'), 420);
  });
}

async function hidePointer(page: Page) {
  await page.evaluate(() => {
    const pointer = document.querySelector<HTMLElement>('[data-demo-pointer]');
    if (pointer) pointer.style.opacity = '0';
  });
  await pause(page, 180);
}

async function installPointer(page: Page, viewport: DemoViewport) {
  await page.evaluate((isMobile) => {
    if (!document.querySelector('[data-demo-pointer-style]')) {
      const style = document.createElement('style');
      style.dataset.demoPointerStyle = 'true';
      style.textContent = `
        [data-demo-pointer] {
          position: fixed;
          inset: 0 auto auto 0;
          z-index: 2147483647;
          pointer-events: none;
          opacity: 0;
          transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease;
        }
        [data-demo-pointer].desktop {
          width: 24px;
          height: 28px;
          filter: drop-shadow(0 2px 2px rgba(0,0,0,.72));
        }
        [data-demo-pointer].mobile {
          width: 34px;
          height: 34px;
          border: 2px solid rgba(255,255,255,.96);
          border-radius: 999px;
          background: rgba(34,211,238,.25);
          box-shadow: 0 0 0 4px rgba(3,16,34,.38), 0 8px 24px rgba(0,0,0,.3);
        }
        [data-demo-pointer].demo-pointer-tap::after {
          content: '';
          position: absolute;
          inset: -7px;
          border: 2px solid rgba(255,255,255,.8);
          border-radius: 999px;
          animation: binderledger-demo-pointer-pulse 420ms ease-out;
        }
        @keyframes binderledger-demo-pointer-pulse {
          from { opacity: .95; transform: scale(.45); }
          to { opacity: 0; transform: scale(1.7); }
        }
      `;
      document.head.append(style);
    }

    let pointer = document.querySelector<HTMLElement>('[data-demo-pointer]');
    if (!pointer) {
      pointer = document.createElement('div');
      pointer.dataset.demoPointer = 'true';
      pointer.setAttribute('aria-hidden', 'true');
      document.body.append(pointer);
    }
    pointer.className = isMobile ? 'mobile' : 'desktop';
    pointer.innerHTML = isMobile
      ? ''
      : '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 2.75v19.2l5.58-5.23 3 7.17 3.18-1.34-2.88-6.9h7.87L3 2.75Z" fill="#fff" stroke="#050505" stroke-width="1.65" stroke-linejoin="round"/></svg>';
  }, viewport.isMobile);
}

async function smoothScrollBy(page: Page, top: number, pauseMilliseconds: number) {
  await page.evaluate((distance) => window.scrollBy({ behavior: 'smooth', top: distance }), top);
  await pause(page, pauseMilliseconds);
}

async function smoothScrollToTop(page: Page, pauseMilliseconds: number) {
  await page.evaluate(() => window.scrollTo({ behavior: 'smooth', top: 0 }));
  await pause(page, pauseMilliseconds);
}

async function pause(page: Page, milliseconds: number) {
  await page.waitForTimeout(milliseconds);
}

function artifactPath(path: string) {
  return relative(outputRoot, path).replaceAll('\\', '/');
}

function selectedValues<const Value extends string>(
  raw: string | undefined,
  allowed: readonly Value[],
) {
  const selected = new Set(
    (raw ?? allowed.join(','))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const invalid = [...selected].filter((value) => !allowed.includes(value as Value));
  if (invalid.length > 0 || selected.size === 0) {
    throw new Error(
      `Expected one or more of ${allowed.join(', ')}; received ${raw ?? 'an empty value'}.`,
    );
  }
  return selected as Set<Value>;
}
