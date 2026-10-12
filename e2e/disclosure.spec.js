import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/disclosure.html');
});

test('renders one button trigger per panel', async ({ page }) => {
  await expect(page.locator('ui-disclosure').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'First panel' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

test('starts collapsed unless the open attribute is present', async ({ page }) => {
  const second = page.locator('ui-disclosure').nth(1);
  await expect(second.getByRole('button', { name: 'Second panel' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  // `>` selects this panel's own region, not a nested one's.
  await expect(second.locator('> .ui4u-disclosure__content')).toBeHidden();
});

test('clicking the trigger toggles the region', async ({ page }) => {
  const panel = page.locator('ui-disclosure').first();
  const trigger = panel.getByRole('button');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.locator('> .ui4u-disclosure__content')).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('> .ui4u-disclosure__content')).toBeVisible();
});

test('the trigger is keyboard reachable and activates with Enter', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Second panel' });

  await trigger.focus();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('emits ui4u:change when opened', async ({ page }) => {
  await page.getByRole('button', { name: 'Second panel' }).click();
  await expect(page.locator('#log')).toHaveText(/open: true/);
});

test('expand all opens every panel, collapse all closes them', async ({ page }) => {
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('button', { name: 'Second panel' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );

  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('button', { name: 'Second panel' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

test('nested disclosures keep independent state', async ({ page }) => {
  const outer = page.locator('ui-disclosure').nth(1);
  await outer.getByRole('button').click();

  const nested = outer.locator('ui-disclosure');
  await expect(nested).toHaveCount(1);

  const nestedTrigger = nested.getByRole('button');
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'false');

  await nestedTrigger.click();
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'true');
});

test('the variant picker restyles the top-level panels only', async ({ page }) => {
  await page.locator('#opt-variant [role="tab"]', { hasText: 'solid' }).click();

  await expect(page.locator('ui-disclosure').first()).toHaveAttribute('data-variant', 'solid');
});

test('the Source panel is a ui-disclosure and opens on click', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(source.locator('[data-highlight]')).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
});

/* --- nested panels ------------------------------------------------------- */

/**
 * The chevron transform of a disclosure's own trigger.
 *
 * Compared as a matrix rather than a boolean: two chevrons at the same angle
 * mean the same state, so the assertion is "do these two agree, and should
 * they?".
 *
 * Only meaningful while both chevrons are *rendered*. A closed disclosure sets
 * `hidden` on its region, and anything inside a `display: none` subtree reports
 * `transform: none` — so every case below opens the outer panel first.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ outerOpen: boolean, innerOpen: boolean, same: boolean }>}
 */
async function chevrons(page) {
  // Long enough for the 200ms transform transition to settle.
  await page.waitForTimeout(450);

  return page.evaluate(() => {
    const outer = document.querySelectorAll('ui-disclosure')[1];
    const inner = outer.querySelector('ui-disclosure');

    const transform = (element) =>
      element ? getComputedStyle(element, '::after').transform : /** @type {never} */ (undefined);

    const outerTrigger = outer.querySelector(':scope > .ui4u-disclosure__summary');
    const innerTrigger = inner.querySelector(':scope > .ui4u-disclosure__summary');

    return {
      outerOpen: outer.hasAttribute('open'),
      innerOpen: inner.hasAttribute('open'),
      same: transform(outerTrigger) === transform(innerTrigger),
    };
  });
}

test('a nested panel shows its own arrow state, not its parent', async ({ page }) => {
  // The bug: `ui-disclosure[open] .ui4u-disclosure__summary` is a descendant
  // selector, so opening the outer panel rotated the inner chevron too — and
  // the inner panel was still closed.
  await page.getByRole('button', { name: 'Second panel' }).click();

  const open = await chevrons(page);
  expect(open.outerOpen).toBe(true);
  expect(open.innerOpen).toBe(false);
  expect(open.same).toBe(false);

  // Opening the inner one then puts them in the same state, so they agree again.
  await page.getByRole('button', { name: 'Nested panel' }).click();

  const both = await chevrons(page);
  expect(both.outerOpen).toBe(true);
  expect(both.innerOpen).toBe(true);
  expect(both.same).toBe(true);
});

test('closing a nested panel rotates only its own arrow back', async ({ page }) => {
  await page.getByRole('button', { name: 'Second panel' }).click();
  await page.getByRole('button', { name: 'Nested panel' }).click();
  expect((await chevrons(page)).same).toBe(true);

  await page.getByRole('button', { name: 'Nested panel' }).click();

  const after = await chevrons(page);
  expect(after.outerOpen).toBe(true);
  expect(after.innerOpen).toBe(false);
  expect(after.same).toBe(false);
});

test('a nested panel keeps its state when its parent closes', async ({ page }) => {
  await page.getByRole('button', { name: 'Second panel' }).click();
  await page.getByRole('button', { name: 'Nested panel' }).click();
  await page.getByRole('button', { name: 'Second panel' }).click();

  // The inner trigger now sits inside a hidden region, so it is out of the
  // accessibility tree and cannot be reached by role. Read the DOM directly:
  // what matters is that closing the parent did not reset the child.
  const expanded = await page.evaluate(() => {
    const outer = document.querySelectorAll('ui-disclosure')[1];
    const inner = outer.querySelector('ui-disclosure');
    const trigger = inner.querySelector(':scope > .ui4u-disclosure__summary');
    return trigger ? trigger.getAttribute('aria-expanded') : null;
  });

  expect(expanded).toBe('true');
});
