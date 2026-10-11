import { expect, test } from '@playwright/test';

// Clipboard access is denied by default, which would make the copy-button
// assertion fail for reasons that have nothing to do with the component.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * Browser smoke tests for ui-tabs.
 *
 * These complement the node:test unit specs: the unit tests assert behaviour
 * against jsdom, these assert the component actually renders, upgrades and
 * responds to real keyboard input in a real browser at real viewport sizes.
 *
 * The demo page drives its own options with three more <ui-tabs>, so every
 * assertion below is scoped to `#demo` — the component under test.
 */

const MAIN = '#demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/tabs.html');
});

test('renders one tab button per panel', async ({ page }) => {
  const tabs = page.locator(`${MAIN} [role="tab"]`);
  await expect(tabs).toHaveCount(3);
  await expect(tabs).toHaveText(['Overview', 'Activity', 'Settings']);
});

test('exposes the tab list with its accessible name', async ({ page }) => {
  await expect(page.locator(`${MAIN} [role="tablist"]`)).toHaveAttribute(
    'aria-label',
    'Project sections'
  );
});

test('shows only the active panel on load', async ({ page }) => {
  await expect(page.locator(`${MAIN} [role="tab"]`).first()).toHaveAttribute(
    'aria-selected',
    'true'
  );

  const panels = page.locator(`${MAIN} ui-tab`);
  await expect(panels).toHaveCount(3);
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();
  await expect(panels.nth(2)).toBeHidden();
});

test('activates a panel on click and emits ui4u:change', async ({ page }) => {
  await page.locator(`${MAIN} [role="tab"]`, { hasText: 'Settings' }).click();

  await expect(page.locator(`${MAIN} [role="tab"]`, { hasText: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#log')).toHaveText(/index 2 \("Settings"\)/);
});

test('moves between tabs with the arrow keys', async ({ page }) => {
  await page.locator(`${MAIN} [role="tab"]`, { hasText: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator(`${MAIN} [role="tab"]`, { hasText: 'Activity' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator(`${MAIN} ui-tab`).nth(1)).toBeVisible();

  await page.keyboard.press('End');
  await expect(page.locator(`${MAIN} [role="tab"]`, { hasText: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('applies design tokens from the linked stylesheet', async ({ page }) => {
  const radius = await page
    .locator(`${MAIN} .ui4u-tabs__list`)
    .evaluate((node) => getComputedStyle(node).borderTopLeftRadius);

  // --ui4u-radius-lg resolves to 16px in the default theme.
  expect(radius).toBe('16px');
});

test('the theme switcher updates data-theme', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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

  await page.goto('/demo/tabs.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} [role="tab"]`)).toHaveCount(3);

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(source.locator('.ui4u-disclosure__content')).toBeHidden();

  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(4);

  // Highlighting ran, and did not corrupt the sample text.
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-tabs');

  await source.locator('[data-copy]').first().click();
  await expect(source.locator('[data-copy]').first()).toHaveText('Copied');
});

test('the demo drives its options through UI4U components, not raw selects', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  // Each option group is a ui-tabs whose ui4u:change drives the real tabs.
  await page.locator('#opt-variant [role="tab"]', { hasText: 'underline' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-variant', 'underline');

  await page.locator('#opt-orientation [role="tab"]', { hasText: 'vertical' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-orientation', 'vertical');

  await page.locator('#opt-activation [role="tab"]', { hasText: 'manual' }).click();
  await expect(page.locator('#opt-activation [role="tab"][aria-selected="true"]')).toHaveText(
    'manual'
  );
});
