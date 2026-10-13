import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-switch.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the component actually renders, upgrades, keeps a
 * real button, is reachable and operable from the keyboard, and behaves at real
 * viewport sizes in a real browser.
 *
 * The demo page drives its own options with four more <ui-tabs>, so every
 * assertion below is scoped to `#demo` — the component under test.
 */

const MAIN = '#demo';
const CONTROL = `${MAIN} .ui4u-switch__control`;

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/switch.html');
});

test('renders a real button with the switch role', async ({ page }) => {
  const control = page.locator(CONTROL);

  await expect(control).toBeVisible();
  await expect(control).toHaveJSProperty('localName', 'button');
  await expect(control).toHaveAttribute('role', 'switch');
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator(`${MAIN} .ui4u-switch__knob`)).toHaveCount(1);
});

test('the label names the control and toggles it', async ({ page }) => {
  const control = page.locator(CONTROL);
  const label = page.locator(`${MAIN} .ui4u-switch__label`);

  await expect(label).toHaveText('Dark theme');
  await expect(control).toHaveAttribute('aria-labelledby', await label.getAttribute('id'));

  // The label sits beside the control, so it carries the click itself.
  await label.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(control).toBeFocused();
});

test('the control is reachable by keyboard and toggles with Enter and Space', async ({ page }) => {
  const control = page.locator(CONTROL);

  await control.focus();
  await expect(control).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-checked', 'false');

  // One key press is one toggle — the synthesised click is suppressed.
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#log')).toHaveText('ui4u:change → theme = true');
});

test('checked reflects onto the host attribute', async ({ page }) => {
  const host = page.locator(MAIN);

  await expect(host).not.toHaveAttribute('checked', '');
  await page.locator(`${MAIN} .ui4u-switch__label`).click();
  await expect(host).toHaveAttribute('checked', '');
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const control = page.locator(CONTROL);
  const hint = page.locator(`${MAIN} .ui4u-switch__hint`);

  await expect(hint).toHaveText('Takes effect immediately. The page remembers your choice.');
  await expect(control).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
  await expect(control).toHaveAttribute('aria-required', 'true');
});

test('the error toggle marks the control invalid', async ({ page }) => {
  const control = page.locator(CONTROL);

  await expect(control).not.toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Toggle error' }).click();

  const error = page.locator(`${MAIN} .ui4u-switch__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Turn this on to continue.');
  await expect(control).toHaveAttribute('aria-invalid', 'true');

  // Both messages are chained, so either one is announced.
  const hintId = await page.locator(`${MAIN} .ui4u-switch__hint`).getAttribute('id');
  const errorId = await error.getAttribute('id');
  await expect(control).toHaveAttribute('aria-describedby', `${hintId} ${errorId}`);

  await page.getByRole('button', { name: 'Toggle error' }).click();
  await expect(error).toBeHidden();
  await expect(control).not.toHaveAttribute('aria-invalid', 'true');
});

test('flipping the switch fires ui4u:change with the name and the state', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-switch__label`).click();

  await expect(page.locator('#log')).toHaveText('ui4u:change → theme = true');

  await page.locator(CONTROL).click();
  await expect(page.locator('#log')).toHaveText('ui4u:change → theme = false');
});

test('an off required switch fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-switch__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
  await expect(page.locator(CONTROL)).toHaveAttribute('aria-invalid', 'true');
});

test('an on required switch passes validation', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-switch__label`).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-switch__error`)).toBeHidden();
});

test('a vetoed change leaves the switch exactly as it was', async ({ page }) => {
  const control = page.locator(CONTROL);

  await page.getByRole('button', { name: 'Arm the veto' }).click();
  await expect(page.locator('#log')).toHaveText('Veto armed — every change is now refused');

  // Pointer, Enter and Space — all three are refused, and none of them emits.
  await page.locator(`${MAIN} .ui4u-switch__label`).click();
  await expect(control).toHaveAttribute('aria-checked', 'false');

  await control.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator(MAIN)).not.toHaveAttribute('checked', '');
  await expect(page.locator('#log')).toHaveText('Veto armed — every change is now refused');

  // Releasing it lets the next flip through, so the switch is not wedged.
  await page.getByRole('button', { name: 'Arm the veto' }).click();
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#log')).toHaveText('ui4u:change → theme = true');
});

test('the state toggles mirror onto the real button', async ({ page }) => {
  const control = page.locator(CONTROL);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(control).toBeDisabled();
  await expect(control).toHaveAttribute('aria-checked', 'false');

  // Disabled means disabled: the state cannot move, by pointer or by keyboard.
  // `click()` on a disabled control is a no-op per the HTML spec, so this is
  // exactly what a user's click does — and it cannot time out.
  const afterClick = await control.evaluate((node) => {
    node.click();
    return node.getAttribute('aria-checked');
  });
  expect(afterClick).toBe('false');

  const focusable = await control.evaluate((node) => {
    node.focus();
    return document.activeElement === node;
  });
  expect(focusable).toBe(false, 'a disabled switch is not focusable');

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(control).toBeEnabled();
});

test('the option picker drives the switch through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-checked [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(CONTROL)).toHaveAttribute('aria-checked', 'true');

  await page.locator('#opt-size [role="tab"]', { hasText: 'lg' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('size', 'lg');

  // The tabs only report a real change, so arm the option first and then
  // switch back rather than clicking the tab that is already selected.
  await page.locator('#opt-required [role="tab"]', { hasText: 'on' }).click();
  await expect(page.locator(CONTROL)).toHaveAttribute('aria-required', 'true');

  await page.locator('#opt-required [role="tab"]', { hasText: 'off' }).click();
  await expect(page.locator(CONTROL)).not.toHaveAttribute('aria-required', 'true');
});

test('the track is a comfortable touch target', async ({ page }) => {
  const track = await page
    .locator(`${MAIN} .ui4u-switch__track`)
    .evaluate((node) => node.getBoundingClientRect().height);

  // 2.75rem at the default size — the mobile minimum.
  expect(track).toBeGreaterThanOrEqual(44);
});

test('every control is at least 44px tall, whatever the size', async ({ page }) => {
  for (const size of ['sm', 'lg']) {
    await page.locator(`#opt-size [role="tab"]`, { hasText: size }).click();
    const height = await page
      .locator(`${MAIN} .ui4u-switch__control`)
      .evaluate((node) => node.getBoundingClientRect().height);

    // The track scales with `size`; the touch target never does.
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

test('applies design tokens from the linked stylesheet', async ({ page }) => {
  const applied = await page.locator(`${MAIN} .ui4u-switch__track`).evaluate((node) => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue('--ui4u-primary')
      .trim();

    /*
     * The token is authored as hex; the browser reports it as rgb(). A
     * throwaway probe lets the browser normalise it, so the two sides can be
     * compared without either one being written out by hand.
     */
    const probe = document.createElement('div');
    probe.style.backgroundColor = token;
    document.body.appendChild(probe);
    const normalised = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return {
      on: getComputedStyle(node).backgroundColor,
      normalised,
      token,
      duration: getComputedStyle(node).transitionDuration,
    };
  });

  // Read the token rather than a literal hex: the whole point of the token
  // layer is that the palette can change without a test going stale.
  expect(applied.token).not.toBe('');
  expect(applied.normalised).not.toBe('');

  await page.locator(`${MAIN} .ui4u-switch__label`).click();
  await expect(page.locator(CONTROL)).toHaveAttribute('aria-checked', 'true');

  // The track colour is transitioned, so it is polled rather than read once:
  // a sample taken mid-transition would be the colour it is leaving.
  const trackColour = () =>
    page
      .locator(`${MAIN} .ui4u-switch__track`)
      .evaluate((node) => getComputedStyle(node).backgroundColor);
  await expect.poll(trackColour).toBe(applied.normalised);

  // Motion is expressed through --ui4u-duration-*, never a literal.
  expect(applied.duration).not.toBe('');
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

  await page.goto('/demo/switch.html', { waitUntil: 'networkidle' });
  await expect(page.locator(CONTROL)).toHaveCount(1);
  await expect(page.locator('select')).toHaveCount(0);

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
  expect(await blocks.first().innerText()).toContain('<ui-switch');
});

test('the accessibility notes are available too', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');

  await expect(notes).toHaveCount(1);
  await notes.getByRole('button').click();
  await expect(notes.locator('.ui4u-disclosure__content')).toBeVisible();
});
