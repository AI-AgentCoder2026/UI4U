import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-radio and ui-radio-group.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the components actually render, upgrade, keep
 * genuine native radios, and behave the way a keyboard user needs them to in a
 * real browser at real viewport sizes.
 *
 * The demo page drives its own options with four more <ui-tabs>, so every
 * assertion below is scoped to `#demo` — the group under test.
 */

const MAIN = '#demo';
const OPTIONS = `${MAIN} input.ui4u-radio__native`;

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/radio.html');
});

test('renders a fieldset with a legend and a real radio per option', async ({ page }) => {
  const group = page.locator(MAIN);
  const fieldset = group.locator('fieldset.ui4u-radio-group__field');

  await expect(fieldset).toHaveAttribute('role', 'radiogroup');
  await expect(fieldset.locator('legend')).toHaveText('Plan');
  await expect(page.locator(OPTIONS)).toHaveCount(3);

  // Every option is a native radio sharing one name.
  expect(
    await page.locator(OPTIONS).evaluateAll((nodes) => nodes.map((node) => [node.type, node.name]))
  ).toEqual([
    ['radio', 'plan'],
    ['radio', 'plan'],
    ['radio', 'plan'],
  ]);
});

test('the option text is its visible label', async ({ page }) => {
  const label = page.locator(`${MAIN} label.ui4u-radio__label`).first();
  const forId = await label.getAttribute('for');

  await expect(label).toHaveText('Free — one project');
  await expect(page.locator(`${MAIN} input.ui4u-radio__native`).first()).toHaveAttribute(
    'id',
    forId
  );

  // Clicking the label selects the option and moves focus to it.
  await label.click();
  await expect(page.locator(OPTIONS).first()).toBeFocused();
  await expect(page.locator(OPTIONS).first()).toHaveJSProperty('checked', true);
});

test('the group holds exactly one tab stop, and it is the selected option', async ({ page }) => {
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(1);
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveJSProperty('checked', true);

  await page.locator(`${MAIN} label.ui4u-radio__label`).first().click();

  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(1);
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`).first()).toHaveJSProperty('checked', true);
});

test('the arrow keys move and check inside the group', async ({ page }) => {
  const inputs = page.locator(OPTIONS);

  await inputs.nth(0).focus();
  await expect(inputs.nth(0)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(inputs.nth(1)).toBeFocused();
  await expect(inputs.nth(1)).toHaveJSProperty('checked', true);
  await expect(inputs.nth(0)).toHaveJSProperty('checked', false);

  await page.keyboard.press('ArrowRight');
  await expect(inputs.nth(2)).toHaveJSProperty('checked', true);

  await page.keyboard.press('ArrowUp');
  await expect(inputs.nth(1)).toHaveJSProperty('checked', true);

  await page.keyboard.press('ArrowLeft');
  await expect(inputs.nth(0)).toHaveJSProperty('checked', true);

  await expect(page.locator('#log')).toHaveText('ui4u:change → plan = "free"');
});

test('Home and End jump to the ends and check them', async ({ page }) => {
  const inputs = page.locator(OPTIONS);

  await inputs.nth(1).focus();
  await expect(inputs.nth(1)).toBeFocused();

  await page.keyboard.press('End');
  await expect(inputs.nth(2)).toHaveJSProperty('checked', true);

  await page.keyboard.press('Home');
  await expect(inputs.nth(0)).toHaveJSProperty('checked', true);
});

test('Tab leaves the group entirely', async ({ page }) => {
  const inputs = page.locator(OPTIONS);

  // Start from the group's single tab stop — the selected option.
  await inputs.nth(1).focus();
  await expect(inputs.nth(1)).toBeFocused();

  await page.keyboard.press('Tab');

  // The next tab stop in document order — the demo's own buttons — proves the
  // group did not swallow the key and did not move between its own options.
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeFocused();
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(1);
  await expect(inputs.nth(1)).toHaveJSProperty('checked', true);
});

test('Shift+Tab enters the group from the far side', async ({ page }) => {
  const inputs = page.locator(OPTIONS);

  // `Validate` is the first control after the group in document order, so a
  // backwards Tab has to land on the group's single tab stop.
  await page.getByRole('button', { name: 'Validate', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');

  // One stop, and it is the selected option.
  await expect(inputs.nth(1)).toBeFocused();
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(1);
});

test('selecting one option clears its siblings and reflects the value', async ({ page }) => {
  const group = page.locator(MAIN);
  const inputs = page.locator(OPTIONS);

  await page.locator(`${MAIN} label.ui4u-radio__label`).nth(1).click();

  expect(await inputs.evaluateAll((nodes) => nodes.map((n) => n.checked))).toEqual([
    false,
    true,
    false,
  ]);
  await expect(group).toHaveAttribute('value', 'pro');
});

test('a disabled option is skipped and can never hold the tab stop', async ({ page }) => {
  // The second group has a disabled third option.
  const second = page.locator('ui-radio-group').nth(1);
  const inputs = second.locator('input.ui4u-radio__native');

  await expect(inputs.nth(2)).toBeDisabled();

  await inputs.nth(0).focus();
  await expect(inputs.nth(0)).toBeFocused();

  await inputs.nth(0).press('ArrowDown');
  await expect(inputs.nth(1)).toHaveJSProperty('checked', true);

  await inputs.nth(1).press('ArrowDown');
  await expect(inputs.nth(1)).toHaveJSProperty('checked', true);
  await expect(inputs.nth(2)).toHaveJSProperty('checked', false);
});

test('disabling the group takes the whole tab stop away', async ({ page }) => {
  await page.locator('#opt-disabled [role="tab"]', { hasText: 'on' }).click();

  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(0);
  await expect(page.locator(OPTIONS).first()).toBeDisabled();

  await page.locator('#opt-disabled [role="tab"]', { hasText: 'off' }).click();
  await expect(page.locator(`${OPTIONS}[tabindex="0"]`)).toHaveCount(1);
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const fieldset = page.locator(`${MAIN} fieldset`);
  const hint = page.locator(`${MAIN} .ui4u-radio-group__hint`);

  await expect(hint).toHaveText('You can change plan whenever you like.');
  await expect(fieldset).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
});

test('the error toggle wires the message and marks the group invalid', async ({ page }) => {
  const fieldset = page.locator(`${MAIN} fieldset`);

  await expect(fieldset).not.toHaveAttribute('aria-invalid', 'true');

  await page.locator('#opt-error [role="tab"]', { hasText: 'on' }).click();

  const error = page.locator(`${MAIN} .ui4u-radio-group__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Pick a plan before you continue.');
  await expect(fieldset).toHaveAttribute('aria-invalid', 'true');

  const hintId = await page.locator(`${MAIN} .ui4u-radio-group__hint`).getAttribute('id');
  await expect(fieldset).toHaveAttribute(
    'aria-describedby',
    `${hintId} ${await error.getAttribute('id')}`
  );

  await page.locator('#opt-error [role="tab"]', { hasText: 'off' }).click();
  await expect(error).toBeHidden();
  await expect(fieldset).not.toHaveAttribute('aria-invalid', 'true');
});

test('a required group with no selection fails validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();

  await expect(page.locator(`${MAIN} fieldset`)).toHaveAttribute('aria-required', 'true');

  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-radio-group__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
});

test('selecting an option clears the error state', async ({ page }) => {
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.locator(`${MAIN} .ui4u-radio-group__error`)).toBeVisible();

  await page.locator(OPTIONS).nth(0).click();

  await expect(page.locator(`${MAIN} .ui4u-radio-group__error`)).toBeHidden();
  await expect(page.locator(`${MAIN} fieldset`)).not.toHaveAttribute('aria-invalid', 'true');
});

test('a screen-reader-only legend is still the accessible name', async ({ page }) => {
  const legend = page.locator(`${MAIN} legend`);

  await page.locator('#opt-sr-only [role="tab"]', { hasText: 'on' }).click();

  await expect(legend).toHaveClass(/ui4u-sr-only/);
  await expect(legend).toHaveText('Plan');
  await expect(page.getByRole('radiogroup', { name: 'Plan' })).toHaveCount(1);
});

test('the demo drives its options through UI4U components, not raw selects', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(`${MAIN} fieldset`)).toHaveAttribute('aria-required', 'true');

  await page.locator('#opt-sr-only [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(`${MAIN} legend`)).toHaveClass(/ui4u-sr-only/);
});

test('every option is a comfortable touch target', async ({ page }) => {
  const height = await page
    .locator(`${MAIN} .ui4u-radio__row`)
    .first()
    .evaluate((node) => node.getBoundingClientRect().height);

  expect(height).toBeGreaterThanOrEqual(44);
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

  await page.goto('/demo/radio.html', { waitUntil: 'networkidle' });
  await expect(page.locator(OPTIONS)).toHaveCount(3);

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
  expect(await blocks.first().innerText()).toContain('<ui-radio-group');
});

test('the accessibility notes are available too', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');

  await expect(notes).toHaveCount(1);
  await notes.getByRole('button').click();
  await expect(notes.locator('.ui4u-disclosure__content')).toBeVisible();
});
