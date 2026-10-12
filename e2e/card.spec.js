import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-card and ui-cards.
 *
 * These complement the node:test unit specs. What only a real engine can show
 * is the geometry: the whole point of `ui-cards` is how many cards land on a
 * row, and a green unit test in jsdom says nothing about that — jsdom has no
 * layout at all. It is also the only place the stretched link can be checked
 * against a real click, which is the hazard this pattern introduces.
 *
 * Every assertion is scoped to a known section id, because the page carries
 * five different card shapes side by side.
 */

const GRID = '#grid';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/card.html');
  // The grid gives its children list semantics on build; wait for it so the
  // assertions are not racing the custom element definition.
  await page.waitForSelector(`${GRID} ui-card[role='listitem']`);
});

test('renders cards inside a labelled list', async ({ page }) => {
  const grid = page.locator(GRID);
  const cards = grid.locator(':scope > ui-card');

  await expect(grid).toHaveAttribute('role', 'list');
  await expect(grid).toHaveAttribute('aria-label', 'UI4U components');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveAttribute('role', 'listitem');

  // The frame is component-built, not authored markup.
  await expect(cards.first().locator('.ui4u-card__frame')).toHaveCount(1);
});

test('a card with href is exactly one real link', async ({ page }) => {
  const card = page.locator(`${GRID} > ui-card`).first();

  await expect(card.locator('a.ui4u-card__link')).toHaveCount(1);
  await expect(card.locator('a')).toHaveCount(1);

  // The anchor wraps the heading, so its accessible name is the card's title.
  const link = card.locator('a.ui4u-card__link');
  await expect(link).toHaveAttribute('href', 'tabs.html');
  await expect(link.locator('.ui4u-card__title')).toHaveText('ui-tabs');
});

test('clicking a card with href navigates to that demo', async ({ page }) => {
  await page.locator(`${GRID} > ui-card`).first().locator('a.ui4u-card__link').click();

  await expect(page).toHaveURL(/\/demo\/tabs\.html$/);
});

test('the option tabs change the rendered card', async ({ page }) => {
  const hero = page.locator('#hero');

  await expect(hero).toHaveAttribute('data-variant', 'default');
  await expect(hero).toHaveAttribute('data-padding', 'md');

  await page.locator('#opt-variant [role="tab"]', { hasText: 'outline' }).click();
  await expect(hero).toHaveAttribute('data-variant', 'outline');

  await page.locator('#opt-variant [role="tab"]', { hasText: 'glass' }).click();
  await expect(hero).toHaveAttribute('data-variant', 'glass');

  await page.locator('#opt-padding [role="tab"]', { hasText: 'lg' }).click();
  await expect(hero).toHaveAttribute('data-padding', 'lg');

  await page.locator('#opt-padding [role="tab"]', { hasText: 'none' }).click();
  await expect(hero).toHaveAttribute('data-padding', 'none');
});

test('the grid lays out several cards per row on desktop and one on a phone', async ({
  page,
}, info) => {
  const cards = page.locator(`${GRID} > ui-card`);
  await expect(cards).toHaveCount(6);

  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: Math.round(rect.top), left: Math.round(rect.left) };
    })
  );

  const perRow = new Map();
  for (const box of boxes) perRow.set(box.top, (perRow.get(box.top) ?? 0) + 1);
  const widest = Math.max(...perRow.values());

  if (info.project.name === 'mobile') {
    // `auto-fill` from an 18rem minimum cannot fit two tracks in a phone width.
    expect(widest).toBe(1);
  } else {
    expect(widest).toBeGreaterThanOrEqual(3);
  }

  // Same rows either way: six cards, so the grid is genuinely multi-row.
  expect(perRow.size).toBeGreaterThanOrEqual(2);
});

test('the column control fixes the track count', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'the component forces one column below 30rem');

  const perRow = async () => {
    const boxes = await page
      .locator(`${GRID} > ui-card`)
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    const rows = new Map();
    for (const top of boxes) rows.set(top, (rows.get(top) ?? 0) + 1);
    return Math.max(...rows.values());
  };

  await expect(page.locator(GRID)).not.toHaveAttribute('data-columns', /.*/);
  expect(await perRow()).toBeGreaterThanOrEqual(3);

  await page.locator('#opt-columns [role="tab"]', { hasText: '2' }).click();
  await expect(page.locator(GRID)).toHaveAttribute('data-columns', '2');
  expect(await perRow()).toBe(2);
});

test('the author-supplied data-part markup survives into the right slots', async ({ page }) => {
  const card = page.locator('#parts');

  // The author's own element is the title — not a wrapper around it.
  const title = card.locator('.ui4u-card__title');
  await expect(title).toHaveCount(1);
  await expect(title).toHaveJSProperty('tagName', 'H3');
  await expect(title).toHaveText('The heading is your own element');

  await expect(card.locator('.ui4u-card__eyebrow')).toHaveText('Author-supplied');
  await expect(card.locator('.ui4u-card__body')).toContainText('real buttons');
  await expect(card.locator('.ui4u-card__actions')).toHaveCount(1);

  // An href wraps the title — including the author's own heading — in one link.
  await expect(card.locator('a.ui4u-card__link > .ui4u-card__title')).toHaveCount(1);
});

test('the actions row stays clickable under the stretched link', async ({ page }) => {
  const card = page.locator('#parts');

  await card.getByRole('button', { name: 'Log a press' }).click();

  // The log proves the button was the target; the URL proves the link
  // underneath it was not.
  await expect(page.locator('#log')).toContainText('the card did not navigate');
  await expect(page).toHaveURL(/\/demo\/card\.html$/);
});

test('a press binding vetoes the navigation', async ({ page }) => {
  await page.locator('#press a.ui4u-card__link').click();

  await expect(page.locator('#log')).toHaveText(/vetoed/);
  await expect(page).toHaveURL(/\/demo\/card\.html$/);
});

test('lifting the veto lets the card navigate', async ({ page }) => {
  await page.getByRole('button', { name: 'Allow the press' }).click();
  await expect(page.locator('#log')).toHaveText(/will navigate/);

  // The press is no longer vetoed, so the link does what a link does. The log
  // cannot be asserted afterwards: the document is gone by then, which is
  // exactly why the vetoed path above is the one worth logging.
  await page.locator('#press a.ui4u-card__link').click();
  await expect(page).toHaveURL(/\/demo\/checkbox\.html$/);
});

test('arrow keys move focus between cards', async ({ page }) => {
  const first = page.locator(`${GRID} > ui-card`).first().locator('a.ui4u-card__link');
  const second = page.locator(`${GRID} > ui-card`).nth(1).locator('a.ui4u-card__link');

  await first.focus();
  await expect(first).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
});

/**
 * Regression guard.
 *
 * `<script>` content is raw text: HTML entities are not decoded, so writing
 * `=&gt;` inside an inline module throws and silently stops every import below
 * it — the page looks fine but no component upgrades. Assert the absence of
 * script errors rather than trusting the rendered output.
 */
test('the demo page runs its scripts without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/card.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${GRID} ui-card[role='listitem']`)).toHaveCount(6);

  expect(errors).toEqual([]);
});

test('the demo drives its options with components, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.locator('.control-group ui-tabs')).toHaveCount(3);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  const blocks = source.locator('[data-highlight]');
  await expect(blocks).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
  expect(await blocks.first().innerText()).toContain('<ui-card');
});

test('the accessibility notes are available too', async ({ page }) => {
  const notes = page.locator('ui-disclosure[summary="Accessibility notes"]');

  await expect(notes).toHaveCount(1);
  await notes.getByRole('button').click();
  await expect(notes.locator('.ui4u-disclosure__content')).toBeVisible();
});
