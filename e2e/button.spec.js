import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-button.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the component actually renders a native control
 * and responds to real pointer and keyboard input in a real browser at real
 * viewport sizes (mobile and desktop).
 *
 * The demo page drives its own options with ui-tabs, so every assertion is
 * scoped to `#demo` — the button under test — and to ids that belong to it.
 */

const MAIN = '#demo';
const CONTROL = `${MAIN} > .ui4u-button__control`;

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/button.html');
});

test('renders a native button, not a div', async ({ page }) => {
  const control = page.locator(CONTROL);

  await expect(control).toBeVisible();
  expect(await control.evaluate((node) => node.localName)).toBe('button');
  await expect(control).toHaveText('Save changes');
});

test('href renders a real anchor', async ({ page }) => {
  const control = page.locator('#link-button > .ui4u-button__control');

  expect(await control.evaluate((node) => node.localName)).toBe('a');
  await expect(control).toHaveAttribute('href', '#source');
});

test('a disabled anchor carries aria-disabled instead of disabled', async ({ page }) => {
  const control = page.locator('.controls ui-button[disabled] > .ui4u-button__control').first();

  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(control).not.toHaveAttribute('disabled', /.*/);
});

test('the accessible name is the visible label', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'A real link' })).toHaveCount(1);
});

test('emits ui4u:press on click and logs it', async ({ page }) => {
  await page.locator(CONTROL).click();

  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');
});

test('activates with Enter and Space from the keyboard', async ({ page }) => {
  await page.locator(CONTROL).focus();
  await expect(page.locator(CONTROL)).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');

  await page.keyboard.press('Space');
  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');
});

test('click() activates programmatically', async ({ page }) => {
  await page.getByRole('button', { name: 'Press programmatically' }).click();

  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');
});

test('disabled blocks activation', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(page.locator(CONTROL)).toBeDisabled();

  // `force` gets past Playwright's actionability wait; a disabled control
  // still fires no click, so the log must not move.
  await page.locator(CONTROL).click({ force: true });
  await expect(page.locator('#log')).toHaveText('Waiting for a press…');

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await page.locator(CONTROL).click();
  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');
});

test('loading marks the control busy, announces it and blocks activation', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle loading' }).click();

  await expect(page.locator(CONTROL)).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator(`${MAIN} > .ui4u-button__status`)).toHaveText('Working…');

  await page.locator(CONTROL).click({ force: true });
  await expect(page.locator('#log')).toHaveText('Waiting for a press…');

  await page.getByRole('button', { name: 'Toggle loading' }).click();
  await expect(page.locator(CONTROL)).not.toHaveAttribute('aria-busy', 'true');
  await page.locator(CONTROL).click();
  await expect(page.locator('#log')).toHaveText('ui4u:press → primary / md');
});

test('the variant and size pickers restyle the button', async ({ page }) => {
  await page.locator('#opt-variant [role="tab"]', { hasText: 'danger' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-variant', 'danger');

  await page.locator('#opt-size [role="tab"]', { hasText: 'lg' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-size', 'lg');

  await page.locator('#opt-variant [role="tab"]', { hasText: 'secondary' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-variant', 'secondary');
  await expect(page.locator(MAIN)).toHaveAttribute('data-size', 'lg', {
    message: 'changing one option must not reset the other',
  });
});

test('every variant renders with its own background colour', async ({ page }) => {
  const backgrounds = await page
    .locator('ui-button > .ui4u-button__control')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));

  // primary, secondary, ghost, danger, subtle, primary(lg), link, disabled link, loading
  expect(new Set(backgrounds).size).toBeGreaterThan(3);
});

test('applies design tokens from the linked stylesheet', async ({ page }) => {
  const radius = await page
    .locator(CONTROL)
    .evaluate((node) => getComputedStyle(node).borderTopLeftRadius);

  // --ui4u-button-radius defaults to --ui4u-radius-md, which is 10px.
  expect(radius).toBe('10px');
});

test('the demo drives its options through UI4U components, not raw selects', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);
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

  await page.goto('/demo/button.html', { waitUntil: 'networkidle' });
  await expect(page.locator(CONTROL)).toBeVisible();

  expect(errors).toEqual([]);
});

test('the Source samples live inside a ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-button');
});
