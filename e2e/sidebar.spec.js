import { expect, test } from '@playwright/test';

// Clipboard access is denied by default, which would make the copy-button
// assertion fail for reasons that have nothing to do with the component.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * Browser smoke tests for ui-sidebar.
 *
 * These complement the node:test unit specs: those assert behaviour against
 * jsdom, these assert the component renders, traps focus and responds to real
 * keyboard input at real viewport sizes. The demo drives its own options with
 * two more <ui-tabs>, so every assertion is scoped to `#demo`.
 */

const MAIN = '#demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/sidebar.html');
  await page.waitForSelector(`${MAIN} .ui4u-sidebar__panel`);
});

/**
 * Narrow viewports get an off-canvas drawer instead: closed on load, squared
 * corners, no rail. Everything about the expanded inline layout is skipped
 * there, and the drawer gets its own test below.
 */
const inlineLayoutOnly = (isMobile) =>
  test.skip(Boolean(isMobile), 'narrow viewports use the drawer, not the inline sidebar');

test('renders a navigation landmark with its accessible name', async ({ page }) => {
  const nav = page.locator(MAIN);
  await expect(nav).toHaveAttribute('role', 'navigation');
  await expect(nav).toHaveAttribute('aria-label', 'Demo sections');
});

test('renders one control per item and marks the active one', async ({ page }) => {
  const links = page.locator(`${MAIN} .ui4u-sidebar__link`);
  await expect(links).toHaveCount(5);

  // An href item is a real link; a destinationless item is a real button.
  await expect(links.nth(1)).toHaveJSProperty('tagName', 'A');
  await expect(links.nth(4)).toHaveJSProperty('tagName', 'BUTTON');

  await expect(links.nth(0)).toHaveAttribute('aria-current', 'page');
});

test('the toggle flips aria-expanded and announces the new action', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  const toggle = page.locator(`${MAIN} .ui4u-sidebar__toggle`);

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAccessibleName('Collapse navigation');

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAccessibleName('Expand navigation');
  await expect(page.locator(MAIN)).toHaveAttribute('data-rail', 'true');
});

test('moves focus between items with the arrow keys', async ({ page }) => {
  const links = page.locator(`${MAIN} .ui4u-sidebar__link`);

  await links.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(links.nth(1)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(links.nth(0)).toBeFocused();

  await page.keyboard.press('End');
  await expect(links.nth(4)).toBeFocused();

  await page.keyboard.press('Home');
  await expect(links.nth(0)).toBeFocused();
});

test('activates an item with Enter and emits ui4u:navigate', async ({ page }) => {
  const links = page.locator(`${MAIN} .ui4u-sidebar__link`);

  await links.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(links.nth(0)).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#log')).toHaveText(/index 1/);
});

test('only one item is in the tab order', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  const stops = page.locator(`${MAIN} .ui4u-sidebar__link[tabindex="0"]`);
  await expect(stops).toHaveCount(1);
  await expect(stops).toHaveText(/Overview/);
});

test('a collapsed rail is still keyboard reachable and expands on focus', async ({ page }) => {
  const viewport = page.viewportSize();
  // Below the breakpoint a collapsed sidebar is an off-canvas drawer, which is
  // covered by its own test; rail mode is the wide-viewport behaviour.
  test.skip(viewport.width < 768, 'rail mode only applies above the 48rem breakpoint');

  const nav = page.locator(MAIN);
  await page.locator(`${MAIN} .ui4u-sidebar__toggle`).click();

  await expect(nav).toHaveAttribute('data-rail', 'true');

  // Every item keeps its name, so the rail is never a strip of bare glyphs.
  await expect(page.locator(`${MAIN} .ui4u-sidebar__link`).first()).toHaveAttribute(
    'title',
    'Overview'
  );

  // Tabbing into the rail lands on the active item and expands it.
  await page.locator(`${MAIN} .ui4u-sidebar__toggle`).focus();
  await page.keyboard.press('Tab');

  await expect(nav).toHaveAttribute('data-expanded', 'true');
});

test('the state picker switches between expanded and rail', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  const nav = page.locator(MAIN);

  await page.locator('#opt-state [role="tab"]', { hasText: 'rail' }).click();
  await expect(nav).toHaveAttribute('data-rail', 'true');
  await expect(nav).toHaveAttribute('data-expanded', 'false');

  await page.locator('#opt-state [role="tab"]', { hasText: 'expanded' }).click();
  await expect(nav).toHaveAttribute('data-expanded', 'true');
  await expect(nav).toHaveAttribute('data-rail', 'false');
});

test('the side picker moves the sidebar to the right edge', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  await page.locator('#opt-side [role="tab"]', { hasText: 'right' }).click();

  await expect(page.locator(MAIN)).toHaveAttribute('data-side', 'right');
  const box = await page.locator(MAIN).boundingBox();
  const shell = await page.locator('.demo-shell').boundingBox();

  // `right` means the right edge of the container, not of the viewport.
  expect(Math.abs(shell.x + shell.width - (box.x + box.width))).toBeLessThan(2);
  expect(box.x).toBeGreaterThan(shell.x + shell.width / 2);
});

test('applies design tokens from the linked stylesheet', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  const radii = await page.locator(`${MAIN} .ui4u-sidebar__panel`).evaluate((node) => ({
    rendered: getComputedStyle(node).borderTopLeftRadius,
    root: getComputedStyle(document.documentElement).getPropertyValue('--ui4u-radius-lg').trim(),
  }));

  // Compared against the token rather than a literal px, so the assertion tests
  // the contract — the component reads `--ui4u-radius-lg` — and survives the
  // palette being restyled.
  expect(radii.rendered).toBe(radii.root);
  expect(radii.root).not.toBe('');
});

test('the theme switcher updates data-theme', async ({ page, isMobile }) => {
  inlineLayoutOnly(isMobile);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

/**
 * Below 48rem the sidebar becomes an off-canvas drawer and the trap has to hold.
 * The mobile project (Pixel 7) is the only one below the breakpoint, so the
 * desktop run asserts the desktop layout instead of skipping.
 */
test('the narrow drawer opens, traps focus and restores it on close', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport.width >= 768, 'drawer only exists below the 48rem breakpoint');

  const toggle = page.locator(`${MAIN} .ui4u-sidebar__toggle`);
  await expect(page.locator(MAIN)).toHaveAttribute('data-drawer', 'true');

  // An off-canvas drawer never auto-opens on load, even when the author wrote
  // `expanded` — it would cover the page the moment it renders.
  await expect(page.locator(MAIN)).toHaveAttribute('data-expanded', 'false');

  await toggle.click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-expanded', 'true');
  await expect(page.locator('.ui4u-sidebar__backdrop')).toBeVisible();

  // Focus is inside the drawer and cannot walk out behind it.
  await expect(page.locator(`${MAIN} .ui4u-sidebar__link`).first()).toBeFocused();

  // Try to focus something behind the drawer. The trap must pull focus back
  // inside — to the first control, not necessarily the container itself.
  await page.evaluate(() => {
    const heading = document.querySelector('h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  });

  const focusIsInside = await page.evaluate(
    () => document.activeElement?.closest('.ui4u-sidebar__panel') !== null
  );
  expect(focusIsInside).toBe(true);

  // Escape dismisses it and hands focus back to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(page.locator(MAIN)).toHaveAttribute('data-expanded', 'false');
  await expect(toggle).toBeFocused();

  // Reopening moves focus back into the drawer.
  await toggle.click();
  await expect(page.locator(`${MAIN} .ui4u-sidebar__link`).first()).toBeFocused();
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

  await page.goto('/demo/sidebar.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} .ui4u-sidebar__link`)).toHaveCount(5);

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(4);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-sidebar');
});

test('the demo drives its options through UI4U components, not raw selects', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);
});
