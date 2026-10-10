import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-input.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the component actually renders, upgrades, keeps
 * a genuine native control and responds to real typing in a real browser at
 * real viewport sizes.
 *
 * The demo page drives its own options with two more <ui-tabs>, so every
 * assertion below is scoped to `#demo` — the component under test.
 */

const MAIN = '#demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/input.html');
});

test('renders a real native input inside the field', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute('type', 'email');
  await expect(native).toHaveAttribute('name', 'email');
  await expect(native).toHaveJSProperty('readOnly', false);
});

test('the label is associated with the control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);
  const forId = await page.locator(`${MAIN} label.ui4u-input__label`).getAttribute('for');

  await expect(native).toHaveAttribute('id', forId);

  // Clicking the visible label focuses the native control.
  await page.locator(`${MAIN} label.ui4u-input__label`).click();
  await expect(native).toBeFocused();
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);
  const hint = page.locator(`${MAIN} .ui4u-input__hint`);

  await expect(hint).toHaveText('We never share it.');
  await expect(native).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
  await expect(native).toHaveAttribute('aria-required', 'true');
});

test('the error toggle wires the message and marks the field invalid', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await expect(native).not.toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Toggle error' }).click();

  const error = page.locator(`${MAIN} .ui4u-input__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('That address is already registered.');
  await expect(native).toHaveAttribute('aria-invalid', 'true');

  // Both messages are chained, so either one is announced.
  const hintId = await page.locator(`${MAIN} .ui4u-input__hint`).getAttribute('id');
  const errorId = await error.getAttribute('id');
  await expect(native).toHaveAttribute('aria-describedby', `${hintId} ${errorId}`);

  await page.getByRole('button', { name: 'Toggle error' }).click();
  await expect(error).toBeHidden();
  await expect(native).not.toHaveAttribute('aria-invalid', 'true');
  await expect(native).toHaveAttribute('aria-describedby', hintId);
});

test('typing fires ui4u:input with the value and name', async ({ page }) => {
  await page.locator(`${MAIN} input.ui4u-input__native`).fill('ada@example.com');

  await expect(page.locator('#log')).toHaveText('ui4u:input → email = "ada@example.com"');
});

test('committing fires ui4u:change', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await native.fill('ada@example.com');
  await native.blur();

  await expect(page.locator('#log')).toHaveText('ui4u:change → email = "ada@example.com"');
});

test('an empty required field fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-input__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveAttribute('aria-invalid', 'true');
});

test('a filled email passes validation', async ({ page }) => {
  await page.locator(`${MAIN} input.ui4u-input__native`).fill('ada@example.com');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-input__error`)).toBeHidden();
});

test('the size picker drives the field through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-size [role="tab"]', { hasText: 'lg' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-size', 'lg');

  await page.locator('#opt-type [role="tab"]', { hasText: 'password' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveAttribute('type', 'password');
});

test('the state toggles mirror onto the native control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await page.getByRole('button', { name: 'Toggle readonly' }).click();
  await expect(native).toHaveJSProperty('readOnly', true);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeDisabled();
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

  await page.goto('/demo/input.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-input');
});