import { expect, test } from '@playwright/test';

/**
 * Smoke tests for the demo index.
 *
 * The catalogue is a `ui-cards` grid under a `ui-toolbar`, so the index
 * demonstrates the library rather than sitting outside it. These assert the
 * pieces a reader actually uses: every demo reachable, filterable, and — the
 * reason the catalogue is cards at all — several per row.
 */

const CATALOGUE = 'ui-cards#catalogue';
const BAR = '#catalogue-bar';

/** Every component, in catalogue order. */
const DEMOS = [
  'ui-tabs',
  'ui-disclosure',
  'ui-button',
  'ui-button-group',
  'ui-tooltip',
  'ui-layout',
  'ui-sidebar',
  'ui-toolbar',
  'ui-popup',
  'ui-input',
  'ui-checkbox',
  'ui-radio',
  'ui-dropdown',
  'ui-form',
  'ui-tablegrid',
  'ui-card',
  'ui-cards',
  'ui-switch',
  'ui-textarea',
  'Beacon app',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForSelector(`${CATALOGUE} ui-card`);
});

test('every catalogue card links to a page that responds', async ({ page }) => {
  const broken = await page.locator(`${CATALOGUE} a`).evaluateAll(async (links) => {
    /** @type {Array<{ href: string, status: number }>} */
    const results = [];

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      // The repository link leaves the site; fetch() cannot follow it cross-origin.
      if (!href || href === '#' || href.startsWith('http')) continue;

      const response = await fetch(new URL(href, location.href));
      results.push({ href, status: response.status });
    }

    return results.filter((r) => r.status !== 200);
  });

  expect(broken).toEqual([]);
});

test('the catalogue is built from UI4U components', async ({ page }) => {
  // The point of the exercise: the demo site is a demonstration of the library.
  await expect(page.locator(CATALOGUE)).toHaveJSProperty('localName', 'ui-cards');
  await expect(page.locator(BAR)).toHaveJSProperty('localName', 'ui-toolbar');
  await expect(page.locator(`${BAR} ui-input`)).toHaveCount(1);
  await expect(page.locator(`${BAR} ui-dropdown`)).toHaveCount(1);

  const themeToggle = page.locator('ui-button[data-theme-toggle]');
  await expect(themeToggle).toHaveCount(1);
  await expect(themeToggle).toBeVisible();
});

test('lists every component as a card with a name and a link', async ({ page }) => {
  const cards = page.locator(`${CATALOGUE} ui-card`);
  await expect(cards).toHaveCount(DEMOS.length);

  const names = await page
    .locator(`${CATALOGUE} ui-card .ui4u-card__title`)
    .evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));

  expect([...names].sort()).toEqual([...DEMOS].sort());

  // Each card is a list item, and one real anchor named by its own title.
  await expect(page.locator(`${CATALOGUE} ui-card[role="listitem"]`)).toHaveCount(DEMOS.length);
  await expect(page.locator(`${CATALOGUE} ui-card > .ui4u-card__frame > a`)).toHaveCount(
    DEMOS.length
  );
});

test('lays out several cards per row on desktop and one on a phone', async ({ page, isMobile }) => {
  const perRow = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#catalogue > ui-card')];
    if (cards.length === 0) return 0;
    const firstTop = Math.round(cards[0].getBoundingClientRect().top);
    return cards.filter((c) => Math.round(c.getBoundingClientRect().top) === firstTop).length;
  });

  // The whole reason the catalogue is cards: a table would give one per row at
  // every width. The grid fills the space on a desktop and drops to a single
  // column below a phone width, which is what `ui-cards` does on its own.
  if (isMobile) expect(perRow).toBe(1);
  else expect(perRow).toBeGreaterThan(1);
});

test('a card actually navigates', async ({ page }) => {
  await page
    .locator(`${CATALOGUE} ui-card`, { hasText: 'ui-checkbox' })
    .locator('a')
    .first()
    .click();

  await expect(page).toHaveURL(/checkbox\.html$/);
  await expect(page.locator('h1 code')).toHaveText('ui-checkbox');
});

test('filters cards from the toolbar field', async ({ page }) => {
  await page.locator(`${BAR} ui-input .ui4u-input__native`).fill('table');

  const shown = page.locator(`${CATALOGUE} ui-card:not([hidden])`);
  await expect(shown).toHaveCount(2, { message: 'ui-tablegrid, and ui-toolbar mentioning it' });
  await expect(page.locator('#catalogue-log')).toContainText(`of ${DEMOS.length} components`);
});

test('filters cards by kind from the toolbar dropdown', async ({ page }) => {
  await page.locator(`${BAR} ui-dropdown .ui4u-dropdown__trigger`).click();
  await page.locator('.ui4u-dropdown__panel [role="option"]', { hasText: 'Data' }).click();

  await expect(page.locator(`${CATALOGUE} ui-card:not([hidden])`)).toHaveCount(1);
  await expect(page.locator(`${CATALOGUE} ui-card:not([hidden])`)).toContainText('ui-tablegrid');
});

test('the two filters combine', async ({ page }) => {
  await page.locator(`${BAR} ui-dropdown .ui4u-dropdown__trigger`).click();
  await page.locator('.ui4u-dropdown__panel [role="option"]', { hasText: 'Layout' }).click();

  await page.locator(`${BAR} ui-input .ui4u-input__native`).fill('card');

  const shown = page.locator(`${CATALOGUE} ui-card:not([hidden])`);
  // Both card components are filed under Layout, and both names contain
  // "card"; nothing else in that kind does.
  await expect(shown).toHaveCount(2);

  const headings = await shown
    .locator('.ui4u-card__title')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
  expect(headings.sort()).toEqual(['ui-card', 'ui-cards']);
});

test('the clear button puts every card back', async ({ page }) => {
  await page.locator(`${BAR} ui-input .ui4u-input__native`).fill('zzz');
  await expect(page.locator(`${CATALOGUE} ui-card:not([hidden])`)).toHaveCount(0);

  await page.locator(`${BAR} ui-button#reset`).click();
  await expect(page.locator(`${CATALOGUE} ui-card:not([hidden])`)).toHaveCount(DEMOS.length);
});

test('arrow keys move between cards', async ({ page }) => {
  const cards = page.locator(`${CATALOGUE} ui-card`);
  await cards.first().locator('a').first().focus();

  await page.keyboard.press('ArrowRight');

  const active = await page.evaluate(() =>
    document.querySelector('#catalogue > ui-card:nth-child(2)')?.contains(document.activeElement)
  );
  expect(active).toBe(true);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/index.html', { waitUntil: 'networkidle' });
  await page.locator(`${BAR} ui-input .ui4u-input__native`).fill('form');

  expect(errors).toEqual([]);
});
