import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-toolbar.
 *
 * The unit specs pin the keyboard logic against jsdom. What only a real engine
 * can show is whether focus actually moves — jsdom has no focus stack, so a
 * green unit test there says nothing about where the caret ends up.
 */

const BAR = '#demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/toolbar.html');
  await page.waitForSelector(`${BAR}[role="toolbar"]`);
});

test('carries the toolbar role and its accessible name', async ({ page }) => {
  await expect(page.locator(BAR)).toHaveAttribute('role', 'toolbar');
  await expect(page.locator(BAR)).toHaveAttribute('aria-label', 'Filters');
});

test('is a single tab stop across the whole bar', async ({ page }) => {
  await expect(page.locator(`${BAR} [tabindex="0"]`)).toHaveCount(1);
});

test('Tab enters and leaves the bar in a single press', async ({ page }) => {
  await page.locator(`${BAR} .ui4u-input__native`).focus();
  await expect(page.locator(`${BAR} [tabindex="0"]`)).toHaveCount(1);

  // Tabbing forward out of the bar must not stop at the second control.
  await page.keyboard.press('Tab');
  await expect(page.locator(`${BAR} .ui4u-dropdown__trigger`)).not.toBeFocused();
});

test('arrow keys move focus between the controls', async ({ page }) => {
  await page.locator(`${BAR} .ui4u-input__native`).focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${BAR} .ui4u-dropdown__trigger`)).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${BAR} button`, { hasText: 'Apply' })).toBeFocused();

  await expect(page.locator(`${BAR} [tabindex="0"]`)).toHaveCount(1);
});

test('clamps at the end rather than wrapping', async ({ page }) => {
  await page.locator(`${BAR} button`, { hasText: 'Apply' }).focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${BAR} button`, { hasText: 'Apply' })).toBeFocused();
});

test('emits ui4u:navigate when focus moves', async ({ page }) => {
  await page.locator(`${BAR} .ui4u-input__native`).focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#log')).toContainText('ui4u:navigate → 1');
});

test('follows its orientation', async ({ page }) => {
  await page.locator('#opt-orientation [role="tab"]', { hasText: 'vertical' }).click();
  await expect(page.locator(BAR)).toHaveAttribute('aria-orientation', 'vertical');

  await page.locator(`${BAR} .ui4u-input__native`).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`${BAR} .ui4u-dropdown__trigger`)).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${BAR} .ui4u-dropdown__trigger`)).toBeFocused();
});

test('the caption can be hidden without losing the name', async ({ page }) => {
  await page.locator('#opt-caption [role="tab"]', { hasText: 'screen-reader-only' }).click();
  await expect(page.locator(BAR)).toHaveAttribute('aria-label', 'Filters');
});

test('drops down from any layout region', async ({ page }) => {
  const bar = page.locator('ui-layout ui-toolbar');
  await expect(bar).toHaveCount(1);

  // A toolbar region is not a panel: it gets no splitter and cannot be resized.
  const resizable = await bar.evaluate((node) => node.hasAttribute('resizable'));
  expect(resizable).toBe(false);
});

test('becomes a table grid toolbar when written before the table', async ({ page }) => {
  const toolbar = page.locator('ui-tablegrid > ui-toolbar');
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar).toHaveAttribute('role', 'toolbar');

  // The grid claims it, and exposes it rather than moving it.
  const claimed = await page.evaluate(() => {
    const grid = document.querySelector('ui-tablegrid');
    return {
      same: grid.toolbar === grid.querySelector(':scope > ui-toolbar'),
      isFirst: grid.firstElementChild.localName === 'ui-toolbar',
    };
  });

  expect(claimed.same).toBe(true);
  expect(claimed.isFirst).toBe(true);
});

test('the grid toolbar still drives the grid', async ({ page }) => {
  const grid = page.locator('ui-tablegrid');
  await grid.locator('.ui4u-input__native').fill('staging');

  await expect(grid.locator('tbody tr:not([hidden])')).toHaveCount(1);
  await expect(grid.locator('tbody tr:not([hidden]) td').first()).toHaveText('worker');
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/toolbar.html', { waitUntil: 'networkidle' });
  await page.locator(`${BAR} .ui4u-input__native`).focus();
  await page.keyboard.press('ArrowRight');

  expect(errors).toEqual([]);
});
