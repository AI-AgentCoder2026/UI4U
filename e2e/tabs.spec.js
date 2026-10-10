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
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/tabs.html');
});

test('renders one tab button per panel', async ({ page }) => {
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab')).toHaveText(['Overview', 'Activity', 'Settings']);
});

test('exposes the tab list with its accessible name', async ({ page }) => {
  const tablist = page.getByRole('tablist');
  await expect(tablist).toHaveAttribute('aria-label', 'Project sections');
});

test('shows only the active panel on load', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  // `ui-tab` panels are hidden with the `hidden` attribute, which removes them
  // from the accessibility tree — so locate them in the DOM, not by role.
  const panels = page.locator('ui-tab');
  await expect(panels).toHaveCount(3);
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();
  await expect(panels.nth(2)).toBeHidden();
});

test('activates a panel on click and emits ui4u:change', async ({ page }) => {
  await page.getByRole('tab', { name: 'Settings' }).click();

  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#log')).toHaveText(/index 2 \("Settings"\)/);
});

test('moves between tabs with the arrow keys', async ({ page }) => {
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('ui-tab').nth(1)).toBeVisible();

  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('applies design tokens from the linked stylesheet', async ({ page }) => {
  const radius = await page
    .locator('ui-tabs .ui4u-tabs__list')
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
  await expect(page.getByRole('tab')).toHaveCount(3);

  expect(errors).toEqual([]);
});

test('source samples are syntax highlighted and copyable', async ({ page }) => {
  const blocks = page.locator('[data-highlight]');
  await expect(blocks).toHaveCount(4);

  // Highlighting ran: every block contains at least one token span.
  for (const block of await blocks.all()) {
    expect(await block.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  }

  // Highlighting must not corrupt the sample text.
  const html = await blocks.first().innerText();
  expect(html).toContain('<ui-tabs');
  expect(html).toContain('</ui-tabs>');

  await page.locator('[data-copy]').first().click();
  await expect(page.locator('[data-copy]').first()).toHaveText('Copied');
});