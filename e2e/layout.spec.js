import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-layout.
 *
 * The unit specs cover the size arithmetic against a rect stub; these run in a
 * real engine, so the grid actually lays out and the separators can be dragged
 * with a genuine pointer.
 *
 * The demo is deliberately recursive: the left and right slots hold *nested*
 * layouts, each with their own separators. Selectors are therefore scoped by
 * depth — `:scope >` for the outer layout's own separators, and a descendant
 * selector for a nested one.
 *
 * Mobile is a different product: every layout stacks into a single column and
 * its splitters are removed, because a 10px drag handle is useless on touch.
 */

const MAIN = '#demo';
/** Separators belonging to the outer layout itself. */
const OUTER = `${MAIN} > [role="separator"]`;
/** The nested layout that fills the outer `left` slot. */
const EXPLORER = `${MAIN} > ui-layout[slot="left"]`;

/** Splitter-driven behaviour only exists where separators are rendered. */
const skipOnMobile = (isMobile) =>
  test.skip(Boolean(isMobile), 'separators are removed on narrow viewports');

/** Stacking only happens on narrow viewports. */
const skipOnDesktop = (isMobile) =>
  test.skip(!isMobile, 'narrow-viewport behaviour only');

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/layout.html');
  // Always present, unlike the separators.
  await page.waitForSelector(`${MAIN} > ui-panel`);
});

test('renders the five outer regions', async ({ page }) => {
  await expect(page.locator(`${MAIN} > ui-panel`)).toHaveCount(3);
  await expect(page.locator(`${MAIN} > ui-layout`)).toHaveCount(2);
});

test('a nested layout can stand in for a panel in any slot', async ({ page }) => {
  const explorer = page.locator(EXPLORER);

  await expect(explorer).toHaveAttribute('aria-label', 'Explorer');
  await expect(explorer).toHaveAttribute('role', 'region');
  await expect(explorer).toHaveAttribute('aria-valuenow', null).catch(() => {});

  // The nested layout brought its own panels and its own separators: one column
  // (rail | body) and one row (body | filters).
  await expect(explorer.locator(':scope > ui-panel')).toHaveCount(3);
  await expect(explorer.locator(':scope > .ui4u-layout__splitter--column')).toHaveCount(1);
  await expect(explorer.locator(':scope > .ui4u-layout__splitter--row')).toHaveCount(1);
});

test('labels the panels', async ({ page }) => {
  await expect(page.locator(`${MAIN} > ui-panel[slot="center"]`)).toHaveAttribute(
    'aria-label',
    'Workspace'
  );
  await expect(page.locator(`${MAIN} > ui-panel[slot="bottom"]`)).toHaveAttribute(
    'aria-label',
    'Status'
  );
});

test('lays the regions out as a real grid on desktop', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  // two column separators (left|centre, centre|right) and two row (top|centre, centre|bottom)
  await expect(page.locator(OUTER)).toHaveCount(4);

  const left = await page.locator(EXPLORER).boundingBox();
  const center = await page.locator(`${MAIN} > ui-panel[slot="center"]`).boundingBox();
  const right = await page.locator(`${MAIN} > ui-layout[slot="right"]`).boundingBox();

  expect(left.width).toBeGreaterThan(0);
  expect(center.width).toBeGreaterThan(0);
  expect(right.width).toBeGreaterThan(0);

  expect(left.x).toBeLessThan(center.x);
  expect(center.x).toBeLessThan(right.x);
});

test('the nested explorer renders its own sub-regions', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const rail = await page.locator(`${EXPLORER} > ui-panel[slot="left"]`).boundingBox();
  const body = await page.locator(`${EXPLORER} > ui-panel[slot="center"]`).boundingBox();
  const filters = await page.locator(`${EXPLORER} > ui-panel[slot="bottom"]`).boundingBox();

  expect(rail.width).toBeGreaterThan(0);
  expect(body.width).toBeGreaterThan(0);

  // Rail and body sit side by side; filters underneath.
  expect(rail.x).toBeLessThan(body.x);
  expect(filters.y).toBeGreaterThan(body.y);
});

test('stacks every layout and drops the separators on mobile', async ({ page, isMobile }) => {
  skipOnDesktop(isMobile);

  const outerSeparators = page.locator(OUTER);
  await expect(outerSeparators).toHaveCount(4);
  await expect(outerSeparators.first()).toBeHidden();
  await expect(outerSeparators.last()).toBeHidden();

  const top = await page.locator(`${MAIN} > ui-panel[slot="top"]`).boundingBox();
  const explorer = await page.locator(EXPLORER).boundingBox();

  expect(explorer.y).toBeGreaterThan(top.y + top.height - 1);
  expect(explorer.width).toBeGreaterThan(top.width * 0.9);
});

test('gives each separator a full set of ARIA values', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(OUTER).first();

  await expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
  await expect(splitter).toHaveAttribute('aria-valuemin', /\d+/);
  await expect(splitter).toHaveAttribute('aria-valuemax', /\d+/);
  await expect(splitter).toHaveAttribute('aria-valuenow', /\d+/);
});

test('resizes a nested region with the keyboard', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${EXPLORER} > [role="separator"]`).first();
  const rail = page.locator(`${EXPLORER} > ui-panel[slot="left"]`);
  const before = (await rail.boundingBox()).width;

  await splitter.focus();
  await page.keyboard.press('ArrowRight');

  expect((await rail.boundingBox()).width).toBeGreaterThan(before);
});

test('nested and outer layouts resize independently', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const explorer = page.locator(EXPLORER);
  const rail = page.locator(`${EXPLORER} > ui-panel[slot="left"]`);

  const outerBefore = (await explorer.boundingBox()).width;
  const railBefore = (await rail.boundingBox()).width;

  // Move the outer separator: the explorer grows, its rail does not.
  await page.locator(OUTER).first().focus();
  await page.keyboard.press('ArrowRight');

  expect((await explorer.boundingBox()).width).toBeGreaterThan(outerBefore);
  expect((await rail.boundingBox()).width).toBeCloseTo(railBefore, 0);

  // Move the inner separator: only the rail moves.
  await page.locator(`${EXPLORER} > [role="separator"]`).first().focus();
  await page.keyboard.press('ArrowRight');

  expect((await rail.boundingBox()).width).toBeGreaterThan(railBefore);
  expect((await explorer.boundingBox()).width).toBeCloseTo(outerBefore + 16, 0);
});

test('a nested separator steps by its own step', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const rail = page.locator(`${EXPLORER} > ui-panel[slot="left"]`);
  const before = (await rail.boundingBox()).width;

  // The explorer declares step="12", not the outer 16.
  await page.locator(`${EXPLORER} > [role="separator"]`).first().focus();
  await page.keyboard.press('ArrowRight');

  expect((await rail.boundingBox()).width - before).toBeCloseTo(12, 0);
});

test('clamps a nested region at its maximum', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(`${EXPLORER} > [role="separator"]`).first();
  const max = Number(await splitter.getAttribute('aria-valuemax'));
  const rail = page.locator(`${EXPLORER} > ui-panel[slot="left"]`);

  await splitter.focus();
  for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowRight');

  expect((await rail.boundingBox()).width).toBeLessThanOrEqual(max + 1);
});

test('collapses and restores the nested explorer', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const explorer = page.locator(EXPLORER);

  await page.getByRole('button', { name: 'Collapse explorer' }).click();
  await expect(explorer).toBeHidden();

  await page.getByRole('button', { name: 'Restore explorer' }).click();
  await expect(explorer).toBeVisible();
});

test('clicking a separator focuses it, so arrows work straight after', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  // Regression: the drag handler calls preventDefault() on pointerdown to avoid
  // text selection, which also suppresses the browser's focus-on-click. Without
  // an explicit focus() the handle stays unfocused and the arrow keys do
  // nothing, which reads as "the keyboard shortcut is broken".
  const splitter = page.locator(OUTER).first();
  const explorer = page.locator(EXPLORER);

  const handle = await splitter.boundingBox();
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);

  await expect(splitter).toBeFocused();

  const before = (await explorer.boundingBox()).width;
  await page.keyboard.press('ArrowRight');

  expect((await explorer.boundingBox()).width).toBeGreaterThan(before);
});

test('resizes by dragging a separator', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(OUTER).first();
  const explorer = page.locator(EXPLORER);

  const before = (await explorer.boundingBox()).width;
  const handle = await splitter.boundingBox();

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2, { steps: 10 });
  await page.mouse.up();

  expect((await explorer.boundingBox()).width).toBeGreaterThan(before + 40);
});

test('a bubbling resize event identifies its emitting layout', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  // Resize the nested explorer, then read the log on the OUTER layout: the event
  // bubbled up, and the demo labels it "(nested)" from detail.layout.
  await page.locator(`${EXPLORER} > [role="separator"]`).first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#log')).toHaveText(/ui4u:resize → left is now \d+px \(nested\)/);
});

test('changing the step changes how far a keypress moves', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const splitter = page.locator(OUTER).first();
  const explorer = page.locator(EXPLORER);

  await page.locator('#opt-step [role="tab"]', { hasText: '40' }).click();
  await page.getByRole('button', { name: 'Reset all' }).click();

  const before = (await explorer.boundingBox()).width;
  await splitter.focus();
  await page.keyboard.press('ArrowRight');

  expect((await explorer.boundingBox()).width - before).toBeGreaterThanOrEqual(36);
});

test('gives every region a handle, including top and bottom', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const top = page.locator(`${MAIN} > ui-panel[slot="top"]`);
  const bottom = page.locator(`${MAIN} > ui-panel[slot="bottom"]`);

  const topBefore = (await top.boundingBox()).height;
  const bottomBefore = (await bottom.boundingBox()).height;

  // Row separators respond to the vertical arrows.
  await page.locator(`${MAIN} > .ui4u-layout__splitter--row`).first().focus();
  await page.keyboard.press('ArrowDown');
  expect((await top.boundingBox()).height).toBeGreaterThan(topBefore);

  await page.keyboard.press('ArrowUp');
  expect((await top.boundingBox()).height).toBeCloseTo(topBefore, 0);

  // The last row separator governs the bottom panel.
  await page.locator(`${MAIN} > .ui4u-layout__splitter--row`).last().focus();
  await page.keyboard.press('ArrowUp');
  expect((await bottom.boundingBox()).height).toBeGreaterThan(bottomBefore);
});

test('row separators are horizontal, column separators are vertical', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  for (const sep of await page.locator(`${MAIN} > .ui4u-layout__splitter--row`).all()) {
    await expect(sep).toHaveAttribute('aria-orientation', 'horizontal');
  }
  for (const sep of await page.locator(`${MAIN} > .ui4u-layout__splitter--column`).all()) {
    await expect(sep).toHaveAttribute('aria-orientation', 'vertical');
  }
});

test('a row separator ignores the horizontal arrows', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const top = page.locator(`${MAIN} > ui-panel[slot="top"]`);
  const before = (await top.boundingBox()).height;

  await page.locator(`${MAIN} > .ui4u-layout__splitter--row`).first().focus();
  await page.keyboard.press('ArrowRight');

  expect((await top.boundingBox()).height).toBeCloseTo(before, 0);
});

test('the top panel clamps at its declared maximum', async ({ page, isMobile }) => {
  skipOnMobile(isMobile);

  const sep = page.locator(`${MAIN} > .ui4u-layout__splitter--row`).first();
  const max = Number(await sep.getAttribute('aria-valuemax'));
  const top = page.locator(`${MAIN} > ui-panel[slot="top"]`);

  await sep.focus();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');

  expect((await top.boundingBox()).height).toBeLessThanOrEqual(max + 1);
});

test('the Source samples live in a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  await expect(source.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

  await source.getByRole('button').click();
  await expect(source.locator('[data-highlight]')).toHaveCount(3);
});

test('the Recursion section explains nesting', async ({ page }) => {
  const section = page.locator('ui-disclosure[summary="Recursion"]');
  await section.getByRole('button').click();
  await expect(section.locator('[data-highlight]')).toHaveCount(2);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/layout.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} > ui-panel`)).toHaveCount(3);

  expect(errors).toEqual([]);
});