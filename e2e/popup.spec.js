import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-popup.
 *
 * The unit specs cover wiring against jsdom; these prove the parts jsdom
 * cannot: that focus genuinely cannot escape the dialog, and that it genuinely
 * returns to the trigger afterwards.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/popup.html');
});

const surface = (page) => page.locator('body > .ui4u-popup__surface');

test('starts closed', async ({ page }) => {
  await expect(surface(page)).toBeHidden();
});

test('opens from the button and closes again', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();

  await expect(surface(page)).toBeVisible();
  await expect(surface(page)).toHaveAttribute('aria-modal', 'true');

  // While a modal is open the page behind it is inert, so the dialog's own
  // close button is the way out — not the control bar underneath it.
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(surface(page)).toBeHidden();
});

test('moves focus into the dialog when it opens', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();

  const focused = await page.evaluate(
    () => document.activeElement?.closest('.ui4u-popup__surface') !== null
  );
  expect(focused).toBe(true);
});

test('traps Tab inside the modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();

  // Cycle well past the number of focusable things inside the dialog.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('.ui4u-popup__surface') !== null
    );
    expect(inside, `focus escaped after ${i + 1} tabs`).toBe(true);
  }
});

test('traps Shift+Tab inside the modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();

  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('.ui4u-popup__surface') !== null
    );
    expect(inside, `focus escaped backwards after ${i + 1} shift-tabs`).toBe(true);
  }
});

test('returns focus to the trigger on close', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open popup' });

  await trigger.click();
  await page.keyboard.press('Escape');

  await expect(trigger).toBeFocused();
});

test('closes on Escape and logs the cancel first', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();
  await page.keyboard.press('Escape');

  await expect(surface(page)).toBeHidden();
  await expect(page.locator('#log')).toHaveText(/ui4u:cancel .*ui4u:close/);
});

test('ignores Escape when not dismissible', async ({ page }) => {
  await page.locator('#opt-dismissible [role="tab"]', { hasText: 'false' }).click();
  await page.getByRole('button', { name: 'Open popup' }).click();
  await page.keyboard.press('Escape');

  await expect(surface(page)).toBeVisible();
});

test('closes when the backdrop is clicked', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();
  await expect(surface(page)).toBeVisible();

  // Click the backdrop by viewport coordinate: element-level click would fight
  // the surface for the hit test, and what matters is that clicking the dimmed
  // area outside the dialog dismisses it.
  await page.mouse.click(8, 8);

  await expect(surface(page)).toBeHidden();
});

test('the close button closes the dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await expect(surface(page)).toBeHidden();
});

test('popover mode does not trap focus', async ({ page }) => {
  await page.locator('#opt-mode [role="tab"]', { hasText: 'popover' }).click();
  await page.getByRole('button', { name: 'Open popup' }).click();

  await expect(surface(page)).toHaveAttribute('aria-modal', 'false');

  await page.keyboard.press('Tab');
  const inside = await page.evaluate(
    () => document.activeElement?.closest('.ui4u-popup__surface') !== null
  );
  expect(inside).toBe(false);
});

test('the mode picker switches the surface treatment', async ({ page }) => {
  const popup = page.locator('ui-popup');

  await page.locator('#opt-mode [role="tab"]', { hasText: /^drawer$/ }).click();
  await expect(popup).toHaveAttribute('data-mode', 'drawer');

  // `right` contains `left`, so the label has to be matched exactly.
  await page.locator('#opt-side [role="tab"]', { hasText: /^left$/ }).click();
  await expect(popup).toHaveAttribute('data-side', 'left');

  // A drawer is pinned to the viewport edge.
  await page.getByRole('button', { name: 'Open popup' }).click();
  await expect(surface(page)).toBeVisible();
  const box = await surface(page).boundingBox();
  expect(Math.round(box.x)).toBe(0);
});

test('the dialog is a portalled child of body, not of the host', async ({ page }) => {
  await page.getByRole('button', { name: 'Open popup' }).click();

  const parentIsBody = await page.evaluate(() => {
    const s = document.querySelector('.ui4u-popup__surface');
    return s?.parentElement === document.body;
  });
  expect(parentIsBody).toBe(true);
});

test('the dialog is centred in the viewport', async ({ page, isMobile }) => {
  // Narrow viewports get a bottom sheet by design, not a centred card.
  test.skip(Boolean(isMobile), 'the modal becomes a bottom sheet on narrow viewports');

  await page.getByRole('button', { name: 'Open popup' }).click();
  await expect(surface(page)).toBeVisible();

  // The surface scales up as it opens, so poll rather than sampling once and
  // measuring mid-transition.
  const viewport = page.viewportSize();
  await expect
    .poll(async () => {
      const box = await surface(page).boundingBox();
      if (!box) return Infinity;
      return Math.max(
        Math.abs(box.x + box.width / 2 - viewport.width / 2),
        Math.abs(box.y + box.height / 2 - viewport.height / 2)
      );
    })
    .toBeLessThan(4);
});

test('the mobile sheet sits inside the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'bottom-sheet behaviour only applies on narrow viewports');

  await page.getByRole('button', { name: 'Open popup' }).click();
  await expect(surface(page)).toBeVisible();

  const box = await surface(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual((page.viewportSize().width ?? 0) + 1);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/popup.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open popup' }).click();
  await expect(surface(page)).toBeVisible();

  expect(errors).toEqual([]);
});
