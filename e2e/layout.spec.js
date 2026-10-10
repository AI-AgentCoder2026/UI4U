import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-layout.
 *
 * The unit specs cover the size arithmetic against a rect stub; these run in a
 * real engine, so the grid actually lays out and the separators can be dragged
 * with a genuine pointer.
 *
 * Mobile is a different product: the layout stacks into a single column and the
 * splitters are removed entirely, because a 10px drag handle is useless on
 * touch. Separator tests therefore take the `isMobile` fixture and skip with a
 * boolean — `test.skip(fn)` is only legal inside a `describe` block.
 */

const MAIN = '#demo';

/** Splitter-driven behaviour only exists where separators are rendered. */
const skipOnMobile = (isMobile) =>
  test.skip(Boolean(isMobile), 'splitters are removed on narrow viewports');

/** Stacking only happens on narrow viewports. */
const skipOnDesktop = (isMobile) =>
  test.skip(!isMobile, 'narrow-viewport behaviour only');

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/layout.html');
  // Always present, unlike the splitters.
  await page.waitForSelector(`${MAIN} ui-panel`);
});

test('renders all five panels', async ({ page }) => {
  await expect(page.locator(`${MAIN} ui-panel`)).toHaveCount(5);
});

test('labels every panel', async ({ page }) => {
  await expect(page.locator(`${MAIN} ui-panel[slot="left"]`)).toHaveAttribute(
    'aria-label',
    'Sidebar'
  );
  await expect(page.locator(`${MAIN} ui-panel[slot="center"]`)).toHaveAttribute(
    'aria-label',
    'Workspace'
  );
});

test('lays the panels out as a real grid on desktop', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  await expect(page.locator(`${MAIN} [role="separator"]`)).toHaveCount(2);

  const left = await page.locator(`${MAIN} ui-panel[slot="left"]`).boundingBox();
  const center = await page.locator(`${MAIN} ui-panel[slot="center"]`).boundingBox();
  const right = await page.locator(`${MAIN} ui-panel[slot="right"]`).boundingBox();

  expect(left.width).toBeGreaterThan(0);
  expect(center.width).toBeGreaterThan(0);
  expect(right.width).toBeGreaterThan(0);

  // Side by side, in slot order.
  expect(left.x).toBeLessThan(center.x);
  expect(center.x).toBeLessThan(right.x);
});

test('stacks the panels and drops the splitters on mobile', async ({ page, isMobile }) => {
  skipOnDesktop(isMobile);

  const separators = page.locator(`${MAIN} [role="separator"]`);
  await expect(separators).toHaveCount(2);
  await expect(separators.first()).toBeHidden();
  await expect(separators.last()).toBeHidden();

  const top = await page.locator(`${MAIN} ui-panel[slot="top"]`).boundingBox();
  const left = await page.locator(`${MAIN} ui-panel[slot="left"]`).boundingBox();
  const center = await page.locator(`${MAIN} ui-panel[slot="center"]`).boundingBox();

  // Stacked vertically, one after another.
  expect(left.y).toBeGreaterThan(top.y + top.height - 1);
  expect(center.y).toBeGreaterThan(left.y + left.height - 1);

  // Each panel spans the full width.
  expect(left.width).toBeGreaterThan(top.width * 0.9);
});

test('gives each separator a full set of ARIA values', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();

  await expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
  await expect(splitter).toHaveAttribute('aria-valuemin', /\d+/);
  await expect(splitter).toHaveAttribute('aria-valuemax', /\d+/);
  await expect(splitter).toHaveAttribute('aria-valuenow', /\d+/);
});

test('resizes the left panel with the keyboard', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const before = (await page.locator(`${MAIN} ui-panel[slot="left"]`).boundingBox()).width;

  await splitter.focus();
  await page.keyboard.press('ArrowRight');

  expect((await page.locator(`${MAIN} ui-panel[slot="left"]`).boundingBox()).width).toBeGreaterThan(
    before
  );
});

test('clamps the left panel at its maximum', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const max = Number(await splitter.getAttribute('aria-valuemax'));

  await splitter.focus();
  for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowRight');

  const width = (await page.locator(`${MAIN} ui-panel[slot="left"]`).boundingBox()).width;
  expect(width).toBeLessThanOrEqual(max + 1);
});

test('End expands and Home shrinks to the declared limits', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const panel = page.locator(`${MAIN} ui-panel[slot="left"]`);
  const min = Number(await splitter.getAttribute('aria-valuemin'));
  const max = Number(await splitter.getAttribute('aria-valuemax'));

  await splitter.focus();
  await page.keyboard.press('End');
  expect((await panel.boundingBox()).width).toBeLessThanOrEqual(max + 1);

  await page.keyboard.press('Home');
  expect((await panel.boundingBox()).width).toBeGreaterThanOrEqual(min - 1);
});

test('collapses and restores with Enter', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const panel = page.locator(`${MAIN} ui-panel[slot="left"]`);

  await splitter.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();

  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
});

test('resizes by dragging the separator', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const panel = page.locator(`${MAIN} ui-panel[slot="left"]`);

  const before = (await panel.boundingBox()).width;
  const handle = await splitter.boundingBox();

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2, { steps: 10 });
  await page.mouse.up();

  expect((await panel.boundingBox()).width).toBeGreaterThan(before + 40);
});

test('emits ui4u:resize while resizing', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  await page.getByRole('button', { name: 'Reset all' }).click();
  const splitter = page.locator(`${MAIN} [role="separator"]`).first();

  await splitter.focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#log')).toHaveText(/ui4u:resize → left is now \d+px/);
});

test('changing the step changes how far a keypress moves', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${MAIN} [role="separator"]`).first();
  const panel = page.locator(`${MAIN} ui-panel[slot="left"]`);

  await page.locator('#opt-step [role="tab"]', { hasText: '40' }).click();
  await page.getByRole('button', { name: 'Reset all' }).click();

  const before = (await panel.boundingBox()).width;
  await splitter.focus();
  await page.keyboard.press('ArrowRight');

  expect((await panel.boundingBox()).width - before).toBeGreaterThanOrEqual(36);
});

test('the collapse buttons work', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const panel = page.locator(`${MAIN} ui-panel[slot="left"]`);

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: 'Restore sidebar' }).click();
  await expect(panel).toBeVisible();
});

test('the Source samples live in a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  await expect(source.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

  await source.getByRole('button').click();
  await expect(source.locator('[data-highlight]')).toHaveCount(3);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/layout.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} ui-panel`)).toHaveCount(5);

  expect(errors).toEqual([]);
});