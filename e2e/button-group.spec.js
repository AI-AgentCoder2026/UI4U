import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-button-group.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the segments actually render as radios, join into
 * one visual control, and behave the way a keyboard user needs them to in a real
 * browser at real viewport sizes.
 *
 * The demo page carries three groups, so every assertion below is scoped:
 * `#demo` for the main group, `nth(1)` for billing, `nth(2)` for the locked one.
 */

const MAIN = '#demo';
const SEGMENTS = `${MAIN} .ui4u-button__control`;
const VALIDATE = { name: 'Validate', exact: true };

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/button-group.html');
});

test('renders a radiogroup named by its label, of real buttons', async ({ page }) => {
  const group = page.locator(MAIN);

  await expect(group).toHaveAttribute('role', 'radiogroup');
  await expect(group.locator('.ui4u-button-group__label')).toHaveText('View');
  await expect(page.getByRole('radiogroup', { name: 'View' })).toHaveCount(1);
  await expect(page.locator(SEGMENTS)).toHaveCount(3);

  // Each segment is a real native button that now reports as a radio.
  expect(
    await page
      .locator(SEGMENTS)
      .evaluateAll((nodes) => nodes.map((node) => [node.localName, node.getAttribute('role')]))
  ).toEqual([
    ['button', 'radio'],
    ['button', 'radio'],
    ['button', 'radio'],
  ]);
});

test('exactly one segment is checked, and it is the single tab stop', async ({ page }) => {
  await expect(page.locator(`${SEGMENTS}[aria-checked="true"]`)).toHaveCount(1);
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(1);
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`).first()).toHaveText('Grid');
});

test('clicking a segment selects it and reflects the value', async ({ page }) => {
  const group = page.locator(MAIN);

  await page.getByRole('radio', { name: 'Table' }).click();

  await expect(group).toHaveAttribute('value', 'table');
  await expect(page.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#log')).toHaveText('ui4u:change → view = "table"');
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(1);
});

test('clicking the selected segment keeps it selected, it is not a toggle', async ({ page }) => {
  const table = page.getByRole('radio', { name: 'Table' });

  await table.click();
  await table.click();

  await expect(table).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#log')).toHaveText('ui4u:change → view = "table"');
});

test('the arrow keys move and check inside the group', async ({ page }) => {
  const segments = page.locator(SEGMENTS);

  await segments.nth(0).focus();
  await expect(segments.nth(0)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(segments.nth(1)).toBeFocused();
  await expect(segments.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'false');

  await page.keyboard.press('ArrowRight');
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('ArrowUp');
  await expect(segments.nth(1)).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('ArrowLeft');
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'true');

  await expect(page.locator('#log')).toHaveText('ui4u:change → view = "grid"');
});

test('movement clamps at the ends instead of wrapping', async ({ page }) => {
  const segments = page.locator(SEGMENTS);

  await segments.nth(0).focus();
  await page.keyboard.press('ArrowUp');

  // Chromium's own handling of the arrows wraps around at the end of a
  // segmented control. The component prevents the key before its clamp check,
  // so the selection must not have moved.
  await expect(segments.nth(0)).toBeFocused();
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'false');

  await segments.nth(2).click();
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'true');

  await segments.nth(2).focus();
  await page.keyboard.press('ArrowDown');

  await expect(segments.nth(2)).toBeFocused();
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'false');
});

test('Home and End jump to the ends and check them', async ({ page }) => {
  const segments = page.locator(SEGMENTS);

  await segments.nth(1).focus();

  await page.keyboard.press('End');
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(segments.nth(2)).toBeFocused();

  await page.keyboard.press('Home');
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(segments.nth(0)).toBeFocused();
});

test('Tab leaves the group entirely', async ({ page }) => {
  const segments = page.locator(SEGMENTS);

  await segments.nth(0).focus();
  await expect(segments.nth(0)).toBeFocused();

  await page.keyboard.press('Tab');

  // The next tab stop in document order, the demo's own buttons, proves the
  // group neither swallowed the key nor moved between its own segments.
  await expect(page.getByRole('button', VALIDATE)).toBeFocused();
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(1);
  await expect(segments.nth(0)).toHaveAttribute('aria-checked', 'true');
});

test('Shift+Tab enters the group from the far side', async ({ page }) => {
  await page.getByRole('radio', { name: 'Table' }).click();
  await page.getByRole('button', VALIDATE).focus();

  await page.keyboard.press('Shift+Tab');

  // One stop, and it is the selected segment.
  await expect(page.getByRole('radio', { name: 'Table' })).toBeFocused();
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(1);
});

test('the segments are joined into one control, with no gaps between them', async ({ page }) => {
  const boxes = await page.locator(SEGMENTS).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width, height: rect.height };
    })
  );

  // Touching, not merely near: a row of loose buttons would leave a gap here.
  expect(Math.abs(boxes[0].x + boxes[0].width - boxes[1].x)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[1].x + boxes[1].width - boxes[2].x)).toBeLessThanOrEqual(1);
  expect(boxes[0].height).toBeGreaterThanOrEqual(44);
});

test('a disabled segment is skipped and can never hold the tab stop', async ({ page }) => {
  const billing = page.locator('ui-button-group').nth(1);
  const segments = billing.locator('.ui4u-button__control');

  await expect(segments.nth(2)).toBeDisabled();

  await segments.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(segments.nth(1)).toHaveAttribute('aria-checked', 'true');

  // The arrow keys cannot land on a disabled segment, so the last one holds.
  await expect(segments.nth(1)).toBeFocused();

  // And a click on it changes nothing.
  await segments.nth(2).click({ force: true });
  await expect(segments.nth(2)).toHaveAttribute('aria-checked', 'false');
  await expect(billing).not.toHaveAttribute('value', 'lifetime');
});

test('disabling the whole group takes the tab stop away', async ({ page }) => {
  await page.locator('#opt-disabled [role="tab"]', { hasText: 'on' }).click();

  await expect(page.locator(MAIN)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(0);
  await expect(page.locator(SEGMENTS).first()).toBeDisabled();

  await page.locator('#opt-disabled [role="tab"]', { hasText: 'off' }).click();
  await expect(page.locator(`${SEGMENTS}[tabindex="0"]`)).toHaveCount(1);
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const hint = page.locator(`${MAIN} .ui4u-button-group__hint`);

  await expect(hint).toHaveText('How the workspace is laid out.');
  await expect(page.locator(MAIN)).toHaveAttribute(
    'aria-describedby',
    await hint.getAttribute('id')
  );
});

test('a required group with no selection fails validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();

  await expect(page.locator(MAIN)).toHaveAttribute('aria-required', 'true');

  await page.getByRole('button', VALIDATE).click();

  await expect(page.locator(`${MAIN} .ui4u-button-group__error`)).toBeVisible();
  await expect(page.locator(MAIN)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#log')).toHaveText(/valid: false/);
});

test('selecting a segment clears the error state', async ({ page }) => {
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await page.getByRole('button', VALIDATE).click();
  await expect(page.locator(`${MAIN} .ui4u-button-group__error`)).toBeVisible();

  await page.getByRole('radio', { name: 'List' }).click();

  await expect(page.locator(`${MAIN} .ui4u-button-group__error`)).toBeHidden();
  await expect(page.locator(MAIN)).not.toHaveAttribute('aria-invalid', 'true');
});

test('a screen-reader-only label is still the accessible name', async ({ page }) => {
  const billing = page.locator('ui-button-group').nth(1);

  await page.locator('#opt-sr-only [role="tab"]', { hasText: 'on' }).click();

  await expect(page.locator(`${MAIN} .ui4u-button-group__label`)).toHaveClass(/ui4u-sr-only/);
  await expect(page.getByRole('radiogroup', { name: 'Billing cycle' })).toHaveCount(1);
  await expect(billing.locator('.ui4u-button-group__label')).toHaveClass(/ui4u-sr-only/);
});

test('a change binding that vetoes leaves the group exactly as it was', async ({ page }) => {
  const locked = page.locator('ui-button-group').nth(2);

  await page.getByRole('radio', { name: 'Compact' }).click();

  await expect(locked).toHaveAttribute('value', 'cosy');
  await expect(page.getByRole('radio', { name: 'Cosy' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Compact' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(page.locator('#lock-log')).toHaveText(/vetoed "compact"/);

  // The same veto applies to the keyboard: a refused selection must not move
  // focus either.
  await page.getByRole('radio', { name: 'Cosy' }).focus();
  await page.keyboard.press('ArrowRight');

  await expect(locked).toHaveAttribute('value', 'cosy');
  await expect(page.getByRole('radio', { name: 'Cosy' })).toBeFocused();
});

test('the demo drives its own options through UI4U components, not raw selects', async ({
  page,
}) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('aria-required', 'true');
});

/**
 * Regression guard.
 *
 * `<script>` content is raw text: HTML entities are not decoded, so writing
 * `=&gt;` inside an inline module throws `Unexpected token '&'` and silently
 * stops every import below it. The page looks fine but the component never
 * upgrades. Assert the absence of script errors rather than trusting the
 * rendered output.
 */
test('the demo page runs its scripts without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/button-group.html', { waitUntil: 'networkidle' });
  await expect(page.locator(SEGMENTS)).toHaveCount(3);

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  // Dispatched rather than clicked. These two disclosures sit far down a demo
  // page, so a hit-tested click depends on where the page happens to have
  // scrolled — which depends on the platform's font metrics. On a CI runner
  // with taller text the click point landed on a control-group's hint instead
  // of the trigger, and the test failed for a reason that has nothing to do
  // with ui-disclosure. Same rationale as the hover in `tooltip.spec.js`: what
  // is under test is the component's behaviour, not the pointer's coordinates.
  await trigger.dispatchEvent('click');

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-button-group');
});

test('the accessibility notes are available too', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');

  await expect(notes).toHaveCount(1);
  // Dispatched, for the same reason as the Source samples above.
  await notes.getByRole('button').dispatchEvent('click');
  await expect(notes.locator('.ui4u-disclosure__content')).toBeVisible();
});
