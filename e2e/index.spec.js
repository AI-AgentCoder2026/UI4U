import { expect, test } from '@playwright/test';

/**
 * Smoke tests for the demo index page.
 *
 * The index is a grid of cards, one per component. A card whose `href` names a
 * page that no longer exists renders fine and only fails once someone clicks it
 * — which is exactly how a renamed demo reaches production as a 404. These
 * tests walk every card instead.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForSelector('.demo-card');
});

test('every demo card links to a page that actually responds', async ({ page }) => {
  const broken = await page.locator('.demo-card').evaluateAll(async (cards) => {
    /** @type {Array<{ href: string, status: number }>} */
    const results = [];

    for (const card of cards) {
      const href = card.getAttribute('href') ?? '';
      const response = await fetch(href, { method: 'GET' });
      results.push({ href, status: response.status });
    }
    return results.filter((r) => r.status !== 200);
  });

  expect(broken).toEqual([]);
});

test('every component has a card and every card has a name', async ({ page }) => {
  const cards = await page
    .locator('.demo-card')
    .evaluateAll((nodes) => nodes.map((n) => n.querySelector('code')?.textContent ?? ''));

  expect(cards.length).toBe(10);
  expect(cards.filter((name) => !name)).toEqual([]);
  expect(new Set(cards).size).toBe(cards.length, 'no duplicate component names');
});

test('the cards lay out as a grid rather than one long column', async ({ page, isMobile }) => {
  // Mobile-first: a single stacked column is the intended small-screen layout,
  // so the multi-column grid is only asserted on desktop.
  test.skip(Boolean(isMobile), 'a single column is the mobile-first layout');

  const columns = await page
    .locator('.demo-cards')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

  // Ten cards at four per row need at least three columns to avoid a single
  // stacked column on a desktop viewport.
  expect(columns).toBeGreaterThanOrEqual(3);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/index.html', { waitUntil: 'networkidle' });
  expect(errors).toEqual([]);
});
