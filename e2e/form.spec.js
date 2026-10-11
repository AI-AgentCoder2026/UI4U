import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-form.
 *
 * The unit specs assert the behaviour against jsdom; these assert the parts
 * only a real browser can answer: that a real `<form>` takes part in submission,
 * that focus genuinely moves, and that the `role="alert"` summary appears and
 * disappears. Runs on the mobile and desktop projects, as every other spec.
 */

const MAIN = '#demo';

/** Fills every field the demo sign-up form asks for. */
async function fillValidForm(page) {
  await page.locator(`${MAIN} input[name="fullName"]`).fill('Ada Lovelace');
  await page.locator(`${MAIN} input[name="email"]`).fill('ada@example.com');
  await page.locator(`${MAIN} input[name="password"]`).fill('correct horse');
  await page.locator(`${MAIN} input[name="confirmPassword"]`).fill('correct horse');
  await page.locator(`${MAIN} input[name="team"]`).fill('Analytical Engines');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/form.html');
});

test('wraps the author markup in a real form element', async ({ page }) => {
  const form = page.locator(`${MAIN} > form.ui4u-form__native`);

  await expect(form).toHaveCount(1);
  await expect(form.locator('ui-input[name="email"]')).toHaveCount(1);

  // UI4U reports the failures itself, so native validation must not swallow the
  // submit event before the component ever sees it.
  await expect(form).toHaveJSProperty('noValidate', true);
});

test('the error summary starts hidden', async ({ page }) => {
  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeHidden();
});

test('submitting an empty form is blocked and focus lands in the first invalid field', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Create account' }).click();

  const summary = page.locator(`${MAIN} .ui4u-form__summary`);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('role', 'alert');

  // Focus is in the real control of the first failing field.
  await expect(page.locator(`${MAIN} input[name="fullName"]`)).toBeFocused();
  await expect(page.locator(`${MAIN} ui-input[name="fullName"] input`)).toHaveAttribute(
    'aria-invalid',
    'true'
  );

  await expect(page.locator('#log')).toContainText('ui4u:invalid');
});

test('the summary lists every failure and each entry jumps to its field', async ({ page }) => {
  await page.getByRole('button', { name: 'Create account' }).click();

  const entries = page.locator(`${MAIN} .ui4u-form__summary-link`);
  await expect(entries).toHaveCount(5);
  await expect(entries.first()).toContainText('Full name:');

  // The last entry is the one we activate: it must move focus to its own field.
  await entries.last().click();
  await expect(page.locator(`${MAIN} input[name="team"]`)).toBeFocused();
});

test('a valid form submits and the summary disappears', async ({ page }) => {
  await fillValidForm(page);

  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('#log')).toContainText('ui4u:submit');
  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeHidden();
  await expect(page.locator(`${MAIN} .ui4u-input__error:visible`)).toHaveCount(0);
});

test('a mismatched confirmation blocks the submit', async ({ page }) => {
  await fillValidForm(page);
  await page.locator(`${MAIN} input[name="confirmPassword"]`).fill('something else');

  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('#log')).toContainText('ui4u:invalid');
  await expect(page.locator(`${MAIN} .ui4u-form__summary-link`)).toHaveCount(1);
  await expect(page.locator(`${MAIN} .ui4u-form__summary-link`)).toContainText(
    'The two passwords do not match.'
  );
});

test('the summary goes live once a submit has been attempted', async ({ page }) => {
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeVisible();

  await fillValidForm(page);

  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeHidden();
});

test('resetValidity clears the errors without touching the values', async ({ page }) => {
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeVisible();

  await page.getByRole('button', { name: 'Reset validity' }).click();

  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeHidden();
  await expect(page.locator(`${MAIN} .ui4u-input__error:visible`)).toHaveCount(0);
  await expect(page.locator(`${MAIN} input[name="email"]`)).toHaveValue('');
});

test('noValidate lets an invalid form through', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle no-validate' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('#log')).toContainText('ui4u:submit');
  await expect(page.locator(`${MAIN} .ui4u-form__summary`)).toBeHidden();
});

test('the validateOn picker drives the form through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-validate-on [role="tab"]', { hasText: 'change' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-validate-on', 'change');

  // Live: typing a bad address reports it before any submit.
  await page.locator(`${MAIN} input[name="email"]`).fill('nope');
  // `fill()` fires `input` but not `change`, so blur to commit the value.
  await page.locator(`${MAIN} input[name="email"]`).blur();
  await expect(page.locator(`${MAIN} ui-input[name="email"] input`)).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});

/**
 * Regression guard.
 *
 * `<script>` content is raw text: HTML entities are not decoded, so writing
 * `=&gt;` inside an inline module throws `Unexpected token '&'` and silently
 * stops every import below it — the page looks fine but the component never
 * upgrades.
 */
test('the demo page runs its scripts without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/form.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} > form`)).toHaveCount(1);

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
  expect(await blocks.first().innerText()).toContain('<ui-form');
});
