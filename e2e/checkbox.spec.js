import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-checkbox.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the component actually renders, upgrades, keeps
 * a genuine native control, is reachable and operable from the keyboard, and
 * behaves at real viewport sizes in a real browser.
 *
 * The demo page drives its own options with five more <ui-tabs>, so every
 * assertion below is scoped to `#demo` — the component under test.
 */

const MAIN = '#demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/checkbox.html');
});

test('renders a real native checkbox inside the field', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);

  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute('type', 'checkbox');
  await expect(native).toHaveAttribute('name', 'releases');
  await expect(native).toHaveJSProperty('checked', false);
});

test('the label is associated with the control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);
  const label = page.locator(`${MAIN} label.ui4u-checkbox__label`);
  const forId = await label.getAttribute('for');

  await expect(native).toHaveAttribute('id', forId);
  await expect(label).toHaveText('Email me about releases');

  // Clicking the visible label ticks the control and moves focus to it.
  await label.click();
  await expect(native).toBeFocused();
  await expect(native).toHaveJSProperty('checked', true);
});

test('the control is reachable by keyboard and toggles with Space', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);

  await native.focus();
  await expect(native).toBeFocused();

  await page.keyboard.press('Space');
  await expect(native).toHaveJSProperty('checked', true);

  await page.keyboard.press('Space');
  await expect(native).toHaveJSProperty('checked', false);
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);
  const hint = page.locator(`${MAIN} .ui4u-checkbox__hint`);

  await expect(hint).toHaveText('Roughly one message a month. Unsubscribe any time.');
  await expect(native).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
  await expect(native).toHaveAttribute('aria-required', 'true');
});

test('the error toggle wires the message and marks the field invalid', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);

  await expect(native).not.toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Toggle error' }).click();

  const error = page.locator(`${MAIN} .ui4u-checkbox__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('You have to tick this box.');
  await expect(native).toHaveAttribute('aria-invalid', 'true');

  // Both messages are chained, so either one is announced.
  const hintId = await page.locator(`${MAIN} .ui4u-checkbox__hint`).getAttribute('id');
  const errorId = await error.getAttribute('id');
  await expect(native).toHaveAttribute('aria-describedby', `${hintId} ${errorId}`);

  await page.getByRole('button', { name: 'Toggle error' }).click();
  await expect(error).toBeHidden();
  await expect(native).not.toHaveAttribute('aria-invalid', 'true');
});

test('ticking the box fires ui4u:change with the value and name', async ({ page }) => {
  await page.locator(`${MAIN} label.ui4u-checkbox__label`).click();

  await expect(page.locator('#log')).toHaveText('ui4u:change → releases = "on" (true)');
});

test('an unticked required box fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-checkbox__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});

test('a ticked required box passes validation', async ({ page }) => {
  await page.locator(`${MAIN} label.ui4u-checkbox__label`).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-checkbox__error`)).toBeHidden();
});

test('the select-all parent carries a real indeterminate state', async ({ page }) => {
  const parent = page.locator('#select-all input.ui4u-checkbox__native');
  const members = page.locator('[data-member] input.ui4u-checkbox__native');

  // One of three is ticked on load: genuinely mixed, not a painted dash.
  await expect(parent).toHaveJSProperty('indeterminate', true);
  await expect(members.first()).toHaveJSProperty('checked', true);

  await members.nth(1).click();
  await expect(parent).toHaveJSProperty('indeterminate', true);

  await parent.click();
  await expect(parent).toHaveJSProperty('indeterminate', false);
  await expect(parent).toHaveJSProperty('checked', true);
  await expect(page.locator('#log')).toHaveText('ui4u:change → select all = true');

  await parent.click();
  await expect(parent).toHaveJSProperty('checked', false);
});

test('the state toggles mirror onto the native control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-checkbox__native`);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeDisabled();

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeEnabled();

  await page.getByRole('button', { name: 'Toggle readonly' }).click();
  await expect(native).toHaveAttribute('aria-readonly', 'true');

  // Readonly means readonly: the click cannot change the state.
  await native.click();
  await expect(native).toHaveJSProperty('checked', false);
});

test('the option picker drives the checkbox through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-checked [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).toHaveJSProperty(
    'checked',
    true
  );

  await page.locator('#opt-indeterminate [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).toHaveJSProperty(
    'indeterminate',
    true
  );

  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).toHaveAttribute(
    'aria-required',
    'true'
  );

  // The tabs only report a real change, so switch back rather than clicking the
  // tab that is already selected.
  await page.locator('#opt-required [role="tab"]', { hasText: 'off' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).not.toHaveAttribute(
    'aria-required',
    'true'
  );
});

test('every row is a comfortable touch target', async ({ page }) => {
  const height = await page
    .locator(`${MAIN} .ui4u-checkbox__row`)
    .evaluate((node) => node.getBoundingClientRect().height);

  expect(height).toBeGreaterThanOrEqual(44);
});

test('applies design tokens from the linked stylesheet', async ({ page }) => {
  const accent = await page
    .locator(`${MAIN} input.ui4u-checkbox__native`)
    .evaluate((node) => getComputedStyle(node).accentColor);

  // --ui4u-primary is #38bdf8 in the dark theme the demo page ships with.
  expect(accent).toBe('rgb(56, 189, 248)');
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

  await page.goto('/demo/checkbox.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} input.ui4u-checkbox__native`)).toHaveCount(1);

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
  expect(await blocks.first().innerText()).toContain('<ui-checkbox');
});

test('the accessibility notes are available too', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');

  await expect(notes).toHaveCount(1);
  await notes.getByRole('button').click();
  await expect(notes.locator('.ui4u-disclosure__content')).toBeVisible();
});
