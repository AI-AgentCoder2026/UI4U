import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-textarea.
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
const NATIVE = `${MAIN} textarea.ui4u-textarea__native`;
const GROW = '#grow-demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/textarea.html');
});

test('renders a real native textarea inside the field', async ({ page }) => {
  const native = page.locator(NATIVE);

  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute('name', 'notes');
  await expect(native).toHaveJSProperty('readOnly', false);
  // The control itself, not a div that looks like one.
  expect(await native.evaluate((node) => node.tagName)).toBe('TEXTAREA');
});

test('the label is associated with the control', async ({ page }) => {
  const native = page.locator(NATIVE);
  const label = page.locator(`${MAIN} label.ui4u-textarea__label`);
  const forId = await label.getAttribute('for');

  await expect(native).toHaveAttribute('id', forId);

  // Clicking the visible label focuses the native control.
  await label.click();
  await expect(native).toBeFocused();
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const native = page.locator(NATIVE);
  const hint = page.locator(`${MAIN} .ui4u-textarea__hint`);

  await expect(hint).toHaveText('Markdown is fine.');
  await expect(native).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
  await expect(native).toHaveAttribute('aria-required', 'true');
});

test('the error toggle wires the message and marks the field invalid', async ({ page }) => {
  const native = page.locator(NATIVE);

  await expect(native).not.toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Toggle error' }).click();

  const error = page.locator(`${MAIN} .ui4u-textarea__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Say something about this release.');
  await expect(native).toHaveAttribute('aria-invalid', 'true');

  // Both messages are chained, so either one is announced.
  const hintId = await page.locator(`${MAIN} .ui4u-textarea__hint`).getAttribute('id');
  const errorId = await error.getAttribute('id');
  await expect(native).toHaveAttribute('aria-describedby', `${hintId} ${errorId}`);

  await page.getByRole('button', { name: 'Toggle error' }).click();
  await expect(error).toBeHidden();
  await expect(native).not.toHaveAttribute('aria-invalid', 'true');
  await expect(native).toHaveAttribute('aria-describedby', hintId);
});

test('real typing updates the value and fires ui4u:input', async ({ page }) => {
  const native = page.locator(NATIVE);

  await native.click();
  await native.type('Fixed the login race');

  await expect(native).toHaveValue('Fixed the login race');
  await expect(page.locator('#log')).toHaveText('ui4u:input → notes = "Fixed the login race"');
});

test('a paragraph is not a hundred separate commits', async ({ page }) => {
  const native = page.locator(NATIVE);

  await native.click();
  await native.type('First line');
  await native.press('Enter');
  await native.type('Second line');
  await native.press('Enter');
  await native.type('Third line');

  // Still mid-thought: the log is showing keystrokes, not a commit.
  await expect(page.locator('#log')).toHaveText(/ui4u:input/);
  await expect(native).toHaveValue('First line\nSecond line\nThird line');
});

test('Tab commits the value and fires ui4u:change', async ({ page }) => {
  const native = page.locator(NATIVE);

  await native.click();
  await native.type('Fixed the login race');
  // A real blur, so the browser fires its own change event the way it would
  // for a reader who clicked away.
  await native.blur();

  await expect(page.locator('#log')).toHaveText(
    'ui4u:change → notes = "Fixed the login race" (20 chars)'
  );
});

test('Tab moves focus away, keyboard-only', async ({ page }) => {
  const native = page.locator(NATIVE);
  const first = page.locator(`${MAIN} .ui4u-textarea__native`);

  await first.click();
  await page.keyboard.type('Typed with the keyboard');
  await page.keyboard.press('Tab');

  // One tab stop out of the field, onto the next control — the field does not
  // trap focus the way a popup would.
  await expect(native).not.toBeFocused();
  await expect(page.locator('#log')).toHaveText(/ui4u:change/);
});

test('Ctrl+Enter commits without leaving the field', async ({ page }) => {
  const native = page.locator(NATIVE);

  await native.click();
  await native.type('Line one');
  await native.press('Control+Enter');

  // Still focused — the modifier is what commits, not a blur.
  await expect(native).toBeFocused();
  await expect(page.locator('#log')).toHaveText('ui4u:change → notes = "Line one" (8 chars)');

  // And the next keystroke is just another keystroke: no commit sneaks in
  // behind the reader.
  await native.type(' and two');
  await expect(page.locator('#log')).toHaveText(/ui4u:input → notes = "Line one and two"/);
});

test('an empty required field fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-textarea__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
  await expect(page.locator(NATIVE)).toHaveAttribute('aria-invalid', 'true');
});

test('a filled required field passes validation', async ({ page }) => {
  const native = page.locator(NATIVE);
  await native.click();
  await native.type('Shipped today.');
  await native.blur();

  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-textarea__error`)).toBeHidden();
});

test('the size and row pickers drive the field through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-size [role="tab"]', { hasText: 'lg' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-size', 'lg');

  await page.locator('#opt-rows [role="tab"]', { hasText: '8' }).click();
  await expect(page.locator(NATIVE)).toHaveJSProperty('rows', 8);
});

test('the field does not overflow a narrow viewport', async ({ page }) => {
  const native = page.locator(NATIVE);

  // A long unbreakable token — a pasted URL — is the thing that would otherwise
  // push the field past the edge of a phone.
  await native.fill('https://example.com/a/very/long/path/that/never/wraps/anywhere');

  const box = await native.evaluate((node) => ({
    right: node.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
    // The content scrolls inside the box; it never widens it.
    contained: node.scrollWidth <= node.clientWidth + 1,
  }));

  expect(box.right).toBeLessThanOrEqual(box.viewport);
  expect(box.contained).toBe(true);
});

test('the state toggles mirror onto the native control', async ({ page }) => {
  const native = page.locator(NATIVE);

  await page.getByRole('button', { name: 'Toggle readonly' }).click();
  await expect(native).toHaveJSProperty('readOnly', true);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeDisabled();
});

test('a disabled field cannot be typed into', async ({ page }) => {
  const native = page.locator(NATIVE);
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeDisabled();

  // `fill()` refuses a disabled control outright, so typing is checked the way
  // a reader would do it: keystrokes going to the document, not the field.
  await page.locator('h1').click();
  await page.keyboard.type('should not land');

  await expect(native).toHaveValue('');
  expect(await native.evaluate((node) => node.ownerDocument.activeElement === node)).toBe(false);
});

/* --- auto-grow ------------------------------------------------------------ */

test.describe('ui-textarea grow', () => {
  test.beforeEach(async ({ page }) => {
    // The demo keeps this in a collapsed disclosure, so open it first.
    await page.locator('#grow .ui4u-disclosure__summary').click();
    await page.waitForSelector(`${GROW} textarea.ui4u-textarea__native`);
  });

  test('grows to fit the content as it is typed', async ({ page }) => {
    const native = page.locator(`${GROW} textarea.ui4u-textarea__native`);
    await page.locator('#opt-grow [role="tab"]', { hasText: 'on' }).click();

    const before = await native.evaluate((node) => node.getBoundingClientRect().height);

    await native.click();
    await native.type('Yesterday we shipped the fix.\nToday we are writing tests.\n');

    const after = await native.evaluate((node) => node.getBoundingClientRect().height);
    expect(after).toBeGreaterThan(before);
  });

  test('does not shrink under a reader who deletes text', async ({ page }) => {
    const native = page.locator(`${GROW} textarea.ui4u-textarea__native`);
    await page.locator('#opt-grow [role="tab"]', { hasText: 'on' }).click();

    await native.click();
    await native.type('a line\nanother line\nand a third\n');
    const grown = await native.evaluate((node) => node.getBoundingClientRect().height);

    await native.press('Control+a');
    await native.press('Backspace');

    // Still focused, so the box must not follow the text down.
    await expect(native).toBeFocused();
    expect(await native.evaluate((node) => node.getBoundingClientRect().height)).toBe(grown);
  });

  test('tightens back up on blur, and leaves the value alone', async ({ page }) => {
    const native = page.locator(`${GROW} textarea.ui4u-textarea__native`);
    await page.locator('#opt-grow [role="tab"]', { hasText: 'on' }).click();

    await native.click();
    await native.type('a line\nanother line\nand a third\n');
    const grown = await native.evaluate((node) => node.getBoundingClientRect().height);

    // `fill()` refocuses, so the field is still in its grow-only phase here —
    // the shrink can only happen once focus is genuinely gone.
    await native.fill('short');
    await native.blur();

    const shrunk = await native.evaluate((node) => node.getBoundingClientRect().height);
    expect(shrunk).toBeLessThan(grown);
    // Growing changes the rendered height and nothing else.
    await expect(native).toHaveValue('short');
  });

  test('stays inside the grow cap on a long entry', async ({ page }) => {
    const native = page.locator(`${GROW} textarea.ui4u-textarea__native`);
    await page.locator('#opt-grow [role="tab"]', { hasText: 'on' }).click();

    await native.click();
    await native.fill(Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`).join('\n'));

    const capped = await native.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      maxHeight: parseFloat(getComputedStyle(node).maxHeight),
      scrolls: node.scrollHeight > node.clientHeight,
    }));

    expect(capped.height).toBeLessThanOrEqual(capped.maxHeight + 1);
    expect(capped.scrolls).toBe(true);
  });
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

  await page.goto('/demo/textarea.html', { waitUntil: 'networkidle' });
  await expect(page.locator(NATIVE)).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('the demo drives itself with UI4U components and no select elements', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  // The chrome and the option pickers are components, not hand-rolled markup.
  await expect(page.locator('ui-button').first()).toBeVisible();
  await expect(page.locator('ui-tabs#opt-size')).toBeVisible();
  await expect(page.locator('ui-tabs#opt-rows')).toBeVisible();
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-textarea');
});
