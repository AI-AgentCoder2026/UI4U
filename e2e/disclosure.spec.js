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

  await expect(page.locator('ui-disclosure').first()).toHaveAttribute(
    'data-variant',
    'solid'
  );
});

test('the Source panel is a ui-disclosure and opens on click', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(source.locator('[data-highlight]')).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
});