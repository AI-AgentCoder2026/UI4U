import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-tooltip.
 *
 * These complement the node:test unit specs. The unit suite runs against jsdom,
 * which reports zero-size rects, so it asserts behaviour only — ARIA wiring,
 * visibility, events, teardown. Everything geometric (real flipping, real
 * placement against a real viewport) is asserted here, in real Chromium, on both
 * the mobile and desktop Playwright projects.
 *
 * The demo page drives its own options with <ui-tabs>, so every assertion below
 * is scoped to the component triggers rather than the page chrome.
 */

const MAIN = 'ui-tooltip';

/**
 * The surface is portalled to `<body>` so an ancestor with `transform` or
 * `backdrop-filter` cannot become the containing block for its
 * `position: fixed` coordinates. That means it is no longer a child of the
 * tooltip, so it is resolved through the trigger's `aria-describedby` — the
 * link that survives the portal.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id id of the demo `ui-tooltip`
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function surfaceOf(page, id) {
  const owner = page.locator(`#${id} [aria-describedby], #${id}[aria-describedby]`).first();
  const describedBy = await owner.getAttribute('aria-describedby');
  return page.locator(`#${describedBy}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/tooltip.html');
});

test('renders a hidden surface with role="tooltip" per trigger', async ({ page }) => {
  await expect(page.locator(MAIN)).not.toHaveCount(0);

  const surface = await surfaceOf(page, 'rebuild');
  await expect(surface).toHaveAttribute('role', 'tooltip');
  await expect(surface).toHaveText('Rebuild the index — Ctrl+Shift+R');
  await expect(surface).toBeHidden();
});

test('the authored trigger stays the light DOM child', async ({ page }) => {
  const trigger = page.locator('#rebuild button');

  await expect(trigger).toHaveText('Rebuild');

  // The component appends a surface; it never re-parents what the author wrote.
  const parentTag = await trigger.evaluate((node) => node.parentElement.localName);
  expect(parentTag).toBe('ui-tooltip');
});

test('sets aria-describedby on the trigger while connected', async ({ page }) => {
  const trigger = page.locator('#rebuild button');
  const surface = await surfaceOf(page, 'rebuild');

  const describedBy = await trigger.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  expect(await surface.getAttribute('id')).toBe(describedBy);
});

test('shows the tooltip on hover', async ({ page }) => {
  await page.locator('#rebuild button').hover();

  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/ui4u:show/);
});

test('hides the tooltip again when the pointer leaves', async ({ page }) => {
  const trigger = page.locator('#rebuild button');
  await trigger.hover();
  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();

  await page.locator('h1').hover();
  await expect(await surfaceOf(page, 'rebuild')).toBeHidden();
});

test('shows the tooltip on keyboard focus', async ({ page }) => {
  const trigger = page.locator('#deploy button');
  await trigger.focus();

  await expect(trigger).toBeFocused();
  await expect(await surfaceOf(page, 'deploy')).toBeVisible();
});

test('hides the tooltip on blur', async ({ page }) => {
  const trigger = page.locator('#deploy button');
  await trigger.focus();
  await expect(await surfaceOf(page, 'deploy')).toBeVisible();

  await page.locator('h1').click();
  await expect(await surfaceOf(page, 'deploy')).toBeHidden();
});

test('hides the tooltip on Escape', async ({ page }) => {
  const trigger = page.locator('#rebuild button');
  await trigger.focus();
  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(await surfaceOf(page, 'rebuild')).toBeHidden();
  await expect(page.locator('#log')).toHaveText(/ui4u:hide/);
});

test('a non-focusable trigger still gets a tab stop', async ({ page }) => {
  const tooltip = page.locator('#token');

  await expect(tooltip).toHaveAttribute('tabindex', '0');
  await tooltip.focus();

  await expect(await surfaceOf(page, 'token')).toBeVisible();
});

test('the surface is out of the accessibility tree while hidden', async ({ page }) => {
  const surface = await surfaceOf(page, 'rebuild');
  await expect(surface).toBeHidden();

  // `hidden` removes it from the tree entirely — a screen reader never walks in.
  await expect(surface).toHaveAttribute('hidden', '');
});

test('never traps focus inside the surface', async ({ page }) => {
  const trigger = page.locator('#rebuild button');
  await trigger.focus();
  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.locator('#deploy button')).toBeFocused();
});

test('respects the requested placement above the trigger', async ({ page, isMobile }) => {
  await page.locator('#rebuild button').hover();
  const surface = await surfaceOf(page, 'rebuild');
  await expect(surface).toHaveAttribute('data-placement', 'top');

  const trigger = await page.locator('#rebuild button').boundingBox();
  const box = await surface.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(trigger.y + 2);

  // Always inside the viewport, even when the trigger is near an edge.
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  // Centred only when there is room for it; a narrow viewport clamps instead.
  if (!isMobile) {
    const centre = box.x + box.width / 2;
    expect(Math.abs(centre - (trigger.x + trigger.width / 2))).toBeLessThan(4);
  }
});

test('flips to the opposite side when the preferred side overflows', async ({ page }) => {
  // Move the host out of `.controls` before pinning it: that panel has a
  // `backdrop-filter`, which makes it the containing block for any
  // `position: fixed` descendant, so `top: 0` would not mean the viewport top.
  await page.locator('#edge-left').evaluate((node) => {
    document.body.appendChild(node);
    node.style.position = 'fixed';
    node.style.top = '0';
    node.style.left = '0';
    node.setAttribute('placement', 'top');
  });

  // Dispatch rather than a real hover: pinned at the origin the host sits under
  // the page header, so a hit-tested hover never lands on it. What is under test
  // is the placement maths, not hit-testing.
  await page.locator('#edge-left button').dispatchEvent('pointerover');

  const surface = await surfaceOf(page, 'edge-left');
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute('data-placement', 'bottom');

  const trigger = await page.locator('#edge-left button').boundingBox();
  const box = await surface.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(trigger.y + trigger.height);
});

test('keeps a right-hand placement inside the viewport when it fits', async ({ page }) => {
  await page.locator('#edge-right button').hover();

  const surface = await surfaceOf(page, 'edge-right');
  await expect(surface).toBeVisible();

  const viewport = page.viewportSize();
  const box = await surface.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.x).toBeGreaterThanOrEqual(0);
});

test('the placement picker restyles the demo triggers', async ({ page }) => {
  await page.locator('#opt-placement [role="tab"]', { hasText: 'bottom' }).click();

  await expect(page.locator('#rebuild')).toHaveAttribute('placement', 'bottom');
  await expect(page.locator('#deploy')).toHaveAttribute('placement', 'bottom');
});

test('the delay picker is applied to the demo triggers', async ({ page }) => {
  await page.locator('#opt-delay [role="tab"]', { hasText: '300' }).click();

  await expect(page.locator('#rebuild')).toHaveAttribute('delay', '300');
});

test('the disable switch suppresses showing without unmounting', async ({ page }) => {
  await page.getByRole('button', { name: 'Disable tooltips' }).click();

  await expect(page.locator('#rebuild')).toHaveAttribute('disabled', '');
  await page.locator('#rebuild button').hover();
  await expect(await surfaceOf(page, 'rebuild')).toBeHidden();

  await page.getByRole('button', { name: 'Enable tooltips' }).click();
  await page.locator('#rebuild button').hover();
  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();
});

test('the Show and Hide buttons drive the surface imperatively', async ({ page }) => {
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(await surfaceOf(page, 'rebuild')).toBeVisible();
  await expect(await surfaceOf(page, 'deploy')).toBeVisible();

  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(await surfaceOf(page, 'rebuild')).toBeHidden();
});

test('the demo drives its options through UI4U components, not raw selects', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.locator('#opt-placement')).toHaveAttribute('data-orientation', 'horizontal');
});

/**
 * Regression guard.
 *
 * `<script>` content is raw text: HTML entities are not decoded, so writing
 * `=&gt;` inside an inline module throws `Unexpected token '&'` and silently
 * stops every import below it — the page looks fine but the component never
 * upgrades. Assert the absence of script errors rather than trusting the
 * rendered output.
 */
test('the demo page runs its scripts without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/tooltip.html', { waitUntil: 'networkidle' });
  await expect(page.locator(MAIN).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  await expect(source.locator('[data-highlight]')).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await source.locator('[data-highlight]').first().innerText()).toContain('<ui-tooltip');
});