import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-dropdown.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the panel really is portalled, really is placed
 * under the trigger, and that the whole interaction works with real key events
 * at real viewport sizes — mobile and desktop.
 *
 * The demo page drives its own options with <ui-tabs>, so every assertion is
 * scoped to `#demo` — the component under test — except where the panel itself
 * is the subject, which lives under <body> and cannot be scoped that way.
 */

const MAIN = '#demo';
const PANEL = 'body > .ui4u-dropdown__panel';

/** @param {import('@playwright/test').Page} page */
const triggerOf = (page) => page.locator(`${MAIN} button.ui4u-dropdown__trigger`);

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/dropdown.html');
  await expect(triggerOf(page)).toBeVisible();
});

test('renders a real button trigger, never a select', async ({ page }) => {
  await expect(triggerOf(page)).toBeVisible();
  await expect(triggerOf(page)).toHaveAttribute('type', 'button');
  await expect(page.locator('select')).toHaveCount(0);
});

test('the trigger wires up the listbox it controls', async ({ page }) => {
  const trigger = triggerOf(page);

  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const controls = await trigger.getAttribute('aria-controls');
  await trigger.click();

  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'listbox');
  await expect(panel).toHaveAttribute('id', controls);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('portals the panel to body and places it under the trigger', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.click();

  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();

  // Portalled: the panel is a child of <body>, not of the host. Otherwise an
  // ancestor with a transform would become its containing block. The check runs
  // in the page and returns a boolean — a DOM node cannot be compared across
  // the test/JS boundary by value.
  const isPortalled = await page.evaluate(
    () => document.querySelector('.ui4u-dropdown__panel')?.parentElement === document.body
  );
  expect(isPortalled).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document
          .getElementById('demo')
          ?.contains(document.querySelector('.ui4u-dropdown__panel')) ?? true
    )
  ).toBe(false);

  // Placed under the trigger, and no wider than the viewport.
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();

  expect(triggerBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox.y).toBeGreaterThanOrEqual(triggerBox.y);
  expect(panelBox.width).toBeLessThanOrEqual(viewport.width);
  expect(await panel.evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
});

test('gives every option a role and an accessible selection state', async ({ page }) => {
  await triggerOf(page).click();

  const options = page.locator(`${PANEL} [role="option"]`);
  await expect(options).toHaveCount(5);
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');

  await page.locator(`${PANEL} [data-value="my"]`).click();
  await triggerOf(page).click();

  await expect(page.locator(`${PANEL} [data-value="my"]`)).toHaveAttribute('aria-selected', 'true');
});

test('marks a disabled option and refuses to commit it', async ({ page }) => {
  await triggerOf(page).click();

  const disabled = page.locator(`${PANEL} [data-value="th"]`);
  await expect(disabled).toHaveAttribute('aria-disabled', 'true');
  await expect(disabled).toBeDisabled();

  // `force` skips Playwright's own guard, which rightly refuses to click an
  // aria-disabled element. The point is that the component ignores the click
  // even when the browser delivers it.
  await disabled.click({ force: true });

  await expect(triggerOf(page)).toHaveText('Choose a country');
  await expect(page.locator(PANEL)).toBeVisible();
});

test('opens with the keyboard and navigates with the arrows', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');

  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const activeId = await trigger.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  await expect(trigger).not.toHaveAttribute('aria-activedescendant', activeId);

  await page.keyboard.press('Home');
  await expect(trigger).toHaveAttribute('aria-activedescendant', activeId);
});

test('commits with Enter and announces the value on the trigger', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(trigger).toHaveText('Singapore');
  await expect(page.locator('#log')).toHaveText('ui4u:change → country = "sg"');
});

test('commits with a click', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.click();
  await page.locator(`${PANEL} [data-value="vn"]`).click();

  await expect(trigger).toHaveText('Vietnam');
  await expect(page.locator('#log')).toHaveText('ui4u:change → country = "vn"');
});

test('Escape closes and returns focus to the trigger', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('Tab closes the list without swallowing the key', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');

  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('type-ahead jumps to the option whose label starts with what was typed', async ({ page }) => {
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('v');

  const activeId = await trigger.getAttribute('aria-activedescendant');
  await expect(page.locator(PANEL).locator(`#${activeId}`)).toHaveAttribute('data-value', 'vn');
});

test('clicking outside closes the list', async ({ page }) => {
  await triggerOf(page).click();
  await expect(page.locator(PANEL)).toBeVisible();

  await page.locator('h1').click();

  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('the panel never outlives the element', async ({ page }) => {
  await triggerOf(page).click();
  await expect(page.locator(PANEL)).toBeVisible();

  await page.evaluate(() => document.getElementById('demo').remove());

  await expect(page.locator(PANEL)).toHaveCount(0);
});

test('an empty required field fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-dropdown__error`)).toBeVisible();
  // `aria-invalid` lives on the listbox, not the trigger: the trigger is a
  // `<button>` and ARIA in HTML allows neither attribute on that role.
  await expect(triggerOf(page)).not.toHaveAttribute('aria-invalid');
  await expect(triggerOf(page)).toHaveAttribute('aria-describedby', /ui4u-dropdown-\d+-error/);
  await expect(page.locator('#log')).toHaveText(/valid: false/);

  await triggerOf(page).click();
  await expect(page.locator('.ui4u-dropdown__panel')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.ui4u-dropdown__panel')).toHaveAttribute('aria-required', 'true');
});

test('a chosen value passes validation', async ({ page }) => {
  await triggerOf(page).click();
  await page.locator(`${PANEL} [data-value="my"]`).click();

  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-dropdown__error`)).toBeHidden();
});

test('the state toggles drive the real trigger', async ({ page }) => {
  const trigger = triggerOf(page);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(trigger).toBeDisabled();

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(trigger).toBeEnabled();

  await page.getByRole('button', { name: 'Toggle required' }).click();
  await expect(trigger).not.toHaveAttribute('aria-required', 'true');
});

test('the selection mode tabs drive the dropdown, not a select', async ({ page }) => {
  await page.locator('#opt-mode [role="tab"]', { hasText: 'multiple' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-multiple', 'true');

  await triggerOf(page).click();
  await expect(page.locator(PANEL)).toHaveAttribute('aria-multiselectable', 'true');
});

test('multiple selection toggles with Space and stays open', async ({ page }) => {
  const regions = page.locator('#regions');
  const regionsTrigger = regions.locator('button.ui4u-dropdown__trigger');

  await regionsTrigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  await expect(page.locator(PANEL)).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');

  await expect(regionsTrigger).toHaveText('Europe, Asia Pacific');
  await expect(page.locator('#log')).toHaveText('regions = "eu, ap"');
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

  await page.goto('/demo/dropdown.html', { waitUntil: 'networkidle' });
  await expect(triggerOf(page)).toHaveCount(1);

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
  expect(await blocks.first().innerText()).toContain('<ui-dropdown');
});

test('the Accessibility notes are published in a ui-disclosure', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');
  await notes.getByRole('button').click();

  await expect(notes).toHaveText(/aria-activedescendant/);
  await expect(notes).toHaveText(/aria-multiselectable/);
});
