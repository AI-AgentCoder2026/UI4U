import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-input.
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
/** Shared by every date test, so the second block can reach it too. */
const DATE = '#date-demo';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/input.html');
});

test('renders a real native input inside the field', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute('type', 'email');
  await expect(native).toHaveAttribute('name', 'email');
  await expect(native).toHaveJSProperty('readOnly', false);
});

test('the label is associated with the control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);
  const forId = await page.locator(`${MAIN} label.ui4u-input__label`).getAttribute('for');

  await expect(native).toHaveAttribute('id', forId);

  // Clicking the visible label focuses the native control.
  await page.locator(`${MAIN} label.ui4u-input__label`).click();
  await expect(native).toBeFocused();
});

test('the hint is announced through aria-describedby', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);
  const hint = page.locator(`${MAIN} .ui4u-input__hint`);

  await expect(hint).toHaveText('We never share it.');
  await expect(native).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));
  await expect(native).toHaveAttribute('aria-required', 'true');
});

test('the error toggle wires the message and marks the field invalid', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await expect(native).not.toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Toggle error' }).click();

  const error = page.locator(`${MAIN} .ui4u-input__error`);
  await expect(error).toBeVisible();
  await expect(error).toHaveText('That address is already registered.');
  await expect(native).toHaveAttribute('aria-invalid', 'true');

  // Both messages are chained, so either one is announced.
  const hintId = await page.locator(`${MAIN} .ui4u-input__hint`).getAttribute('id');
  const errorId = await error.getAttribute('id');
  await expect(native).toHaveAttribute('aria-describedby', `${hintId} ${errorId}`);

  await page.getByRole('button', { name: 'Toggle error' }).click();
  await expect(error).toBeHidden();
  await expect(native).not.toHaveAttribute('aria-invalid', 'true');
  await expect(native).toHaveAttribute('aria-describedby', hintId);
});

test('typing fires ui4u:input with the value and name', async ({ page }) => {
  await page.locator(`${MAIN} input.ui4u-input__native`).fill('ada@example.com');

  await expect(page.locator('#log')).toHaveText('ui4u:input → email = "ada@example.com"');
});

test('committing fires ui4u:change', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await native.fill('ada@example.com');
  await native.blur();

  await expect(page.locator('#log')).toHaveText('ui4u:change → email = "ada@example.com"');
});

test('an empty required field fails validation and surfaces the message', async ({ page }) => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator(`${MAIN} .ui4u-input__error`)).toBeVisible();
  await expect(page.locator('#log')).toHaveText(/valid: false/);
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});

test('a filled email passes validation', async ({ page }) => {
  await page.locator(`${MAIN} input.ui4u-input__native`).fill('ada@example.com');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.locator('#log')).toHaveText(/valid: true/);
  await expect(page.locator(`${MAIN} .ui4u-input__error`)).toBeHidden();
});

test('the size picker drives the field through ui-tabs, not a select', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);

  await page.locator('#opt-size [role="tab"]', { hasText: 'lg' }).click();
  await expect(page.locator(MAIN)).toHaveAttribute('data-size', 'lg');

  await page.locator('#opt-type [role="tab"]', { hasText: 'password' }).click();
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveAttribute(
    'type',
    'password'
  );
});

test('the state toggles mirror onto the native control', async ({ page }) => {
  const native = page.locator(`${MAIN} input.ui4u-input__native`);

  await page.getByRole('button', { name: 'Toggle readonly' }).click();
  await expect(native).toHaveJSProperty('readOnly', true);

  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(native).toBeDisabled();
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

  await page.goto('/demo/input.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} input.ui4u-input__native`)).toHaveCount(1);

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
  expect(await blocks.first().innerText()).toContain('<ui-input');
});

/* --- amount mode ---------------------------------------------------------- */

test.describe('ui-input type="amount"', () => {
  const AMOUNT = '#amount-demo';

  test.beforeEach(async ({ page }) => {
    // The demo keeps these in collapsed disclosures, so open them first.
    await page.locator('#amount .ui4u-disclosure__summary').click();
    await page.waitForSelector(`${AMOUNT} .ui4u-input__native`);
  });

  test('parses a k shortcut as it is typed', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await input.fill('5k');
    await expect(input).toHaveValue('5,000');
    await expect(page.locator('#amount-log')).toContainText('is 5000');
  });

  test('parses m and b too', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await input.fill('2.5m');
    await expect(page.locator('#amount-log')).toContainText('is 2500000');

    await input.fill('1b');
    await expect(page.locator('#amount-log')).toContainText('is 1000000000');
  });

  test('keeps the caret at the end so typing continues', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await input.fill('');
    await input.type('5k', { delay: 30 });
    // The "k" was consumed by the formatter, so the next keystroke must land
    // after the last digit rather than in the middle of "5,000".
    await input.type('500');

    await expect(input).toHaveValue('5,000,500');
  });

  test('leaves a half-typed decimal alone', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await input.fill('12.');
    await expect(input).toHaveValue('12.');
  });

  test('applies a fixed decimal count from the picker', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await page.locator('#opt-decimals [role="tab"]', { hasText: '2' }).click();
    await input.fill('8421');

    await expect(input).toHaveValue('8,421.00');
  });

  test('reports out-of-range values instead of silently clamping', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    // Turn the bounds on first, then type a value under them. Clamping the
    // display instead would hide the problem the message exists to report.
    await page.locator('#opt-bounds [role="tab"]', { hasText: '1k' }).click();
    await input.fill('5');

    await expect(input).toHaveValue('5');
    const result = await page.evaluate(() =>
      document.getElementById('amount-demo').checkValidity()
    );
    expect(result.valid).toBe(false);
    expect(result.message).toContain('1,000');
  });

  test('rejects text that is not a number', async ({ page }) => {
    const input = page.locator(`${AMOUNT} .ui4u-input__native`);

    await input.fill('abc');
    const result = await page.evaluate(() => {
      const field = document.getElementById('amount-demo');
      return field.checkValidity();
    });
    expect(result.valid).toBe(false);
  });
});

/* --- date mode ------------------------------------------------------------ */

test.describe('ui-input type="date"', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('#date .ui4u-disclosure__summary').click();
    await page.waitForSelector(`${DATE} .ui4u-input__native`);
  });

  test('shows the chosen format but keeps the ISO value', async ({ page }) => {
    const input = page.locator(`${DATE} .ui4u-input__native`);

    await page.locator('#opt-format [role="tab"]', { hasText: 'dd/MM/yyyy' }).click();

    await expect(input).toHaveValue('14/08/2026');
    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-08-14');
  });

  test('portals the panel to the body rather than inside the field', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();

    const inside = await page.evaluate(() =>
      document.getElementById('date-demo').contains(document.querySelector('.ui4u-calendar'))
    );
    expect(inside).toBe(false);

    await expect(page.locator('body > .ui4u-calendar')).toBeVisible();
  });

  test('opens with a single roving tab stop', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();
    // One stop inside the grid. The header title is a separate control — it
    // drills up a level — so it legitimately has one of its own.
    await expect(page.locator('.ui4u-calendar__day[tabindex="0"]')).toHaveCount(1);
  });

  test('picks a date and writes back the ISO value', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();
    await page.locator('.ui4u-calendar__day[data-date="2026-08-20"]').click();

    await expect(page.locator('body > .ui4u-calendar')).toHaveCount(0);
    await expect(page.locator('#date-log')).toContainText('2026-08-20');
  });

  test('opens at the month view and drills down', async ({ page }) => {
    await page.locator('#opt-view [role="tab"]', { hasText: 'month' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    await expect(page.locator('.ui4u-calendar__month')).toHaveCount(12);

    await page.locator('.ui4u-calendar__month[data-month="7"]').click();
    await expect(page.locator('.ui4u-calendar__day[data-date="2026-08-01"]')).toBeVisible();
  });

  test('opens at the year view and drills down twice', async ({ page }) => {
    await page.locator('#opt-view [role="tab"]', { hasText: 'year' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    await expect(page.locator('.ui4u-calendar__year')).toHaveCount(12);

    await page.locator('.ui4u-calendar__year[data-year="2026"]').click();
    await expect(page.locator('.ui4u-calendar__month')).toHaveCount(12);

    await page.locator('.ui4u-calendar__month[data-month="7"]').click();
    await expect(page.locator('.ui4u-calendar__day')).not.toHaveCount(0);
  });

  test('arrow keys move the focused day', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();

    const focused = page.locator('.ui4u-calendar__day[tabindex="0"]');
    await expect(focused).toHaveAttribute('data-date', '2026-08-14');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.ui4u-calendar__day[tabindex="0"]')).toHaveAttribute(
      'data-date',
      '2026-08-15'
    );

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ui4u-calendar__day[tabindex="0"]')).toHaveAttribute(
      'data-date',
      '2026-08-22'
    );

    await expect(page.locator('.ui4u-calendar__day[tabindex="0"]')).toHaveCount(1);
  });

  test('completes a range and highlights the days between', async ({ page }) => {
    await page.locator('#opt-range [role="tab"]', { hasText: 'range' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    // The field starts on 14 Aug with no end, so this click completes it.
    await page.locator('.ui4u-calendar__day[data-date="2026-08-10"]').click();

    await expect(page.locator('.ui4u-calendar__day[data-date="2026-08-10"]')).toHaveAttribute(
      'data-range-start',
      ''
    );
    await expect(page.locator('.ui4u-calendar__day[data-date="2026-08-12"]')).toHaveAttribute(
      'data-in-range',
      ''
    );
    await expect(page.locator('.ui4u-calendar__day[data-date="2026-08-14"]')).toHaveAttribute(
      'data-range-end',
      ''
    );

    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-08-10/2026-08-14');
  });

  test('starts a fresh range after a complete one', async ({ page }) => {
    await page.locator('#opt-range [role="tab"]', { hasText: 'range' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    await page.locator('.ui4u-calendar__day[data-date="2026-08-10"]').click();
    await page.locator('.ui4u-calendar__day[data-date="2026-08-20"]').click();

    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-08-20/', 'the new start replaces the finished range');
  });

  test('swaps the ends when the second click is earlier', async ({ page }) => {
    await page.locator('#opt-range [role="tab"]', { hasText: 'range' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    await page.locator('.ui4u-calendar__day[data-date="2026-08-05"]').click();

    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-08-05/2026-08-14');
  });

  test('closes on Escape and on a click outside', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('body > .ui4u-calendar')).toHaveCount(0);

    await page.locator(`${DATE} .ui4u-input__native`).click();
    await expect(page.locator('body > .ui4u-calendar')).toBeVisible();
    await page.locator('h1').click();
    await expect(page.locator('body > .ui4u-calendar')).toHaveCount(0);
  });

  test('disables days outside its bounds', async ({ page }) => {
    await page.locator('#date-bounded .ui4u-input__native').click();

    // The field opens on the current month, so page forward to January 2027 —
    // past the end of the allowed year — to see the days lock up.
    for (let i = 0; i < 3; i += 1) {
      await page.locator('.ui4u-calendar__nav[aria-label="Next"]').click();
    }

    await expect(page.locator('.ui4u-calendar__day[data-date="2027-01-05"]')).toBeDisabled();
    await expect(page.locator('.ui4u-calendar__day[data-date="2027-01-05"]')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('changes the first day of the week', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();

    await page.locator('#opt-week [role="tab"]', { hasText: 'Sun' }).click();
    await page.locator(`${DATE} .ui4u-input__native`).click();

    const first = await page.locator('.ui4u-calendar__day').first().getAttribute('data-date');
    expect(new Date(`${first}T00:00:00`).getDay()).toBe(0);
  });

  test('the page runs without script errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/demo/input.html', { waitUntil: 'networkidle' });
    await page.locator('#date .ui4u-disclosure__summary').click();
    await page.locator(`${DATE} .ui4u-input__native`).click();
    await page.locator('.ui4u-calendar__day[data-date="2026-08-20"]').click();

    expect(errors).toEqual([]);
  });
});

/* --- picker placement, typing and formats -------------------------------- */

test.describe('date picker placement and input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/input.html');
    await page.locator('#date .ui4u-disclosure__summary').click();
    await page.waitForSelector(`${DATE} .ui4u-input__native`);
  });

  test('opens next to the field, never in the corner', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();
    await expect(page.locator('body > .ui4u-calendar')).toBeVisible();

    const placed = await page.evaluate(() => {
      const panel = document.querySelector('.ui4u-calendar');
      const field = document.querySelector('#date-demo .ui4u-input__native');
      const p = panel.getBoundingClientRect();
      const f = field.getBoundingClientRect();
      return {
        // Overlaps the field horizontally, and sits either directly under it or
        // directly above it — never parked at the origin.
        aligned: p.right > f.left && p.left < f.right,
        adjacent: p.top >= f.bottom - 2 || p.bottom <= f.top + 2,
        inViewport: p.top >= 0 && p.bottom <= window.innerHeight + 1,
      };
    });

    expect(placed.aligned).toBe(true);
    expect(placed.adjacent).toBe(true);
    expect(placed.inViewport).toBe(true);
  });

  test('repositions when the page scrolls', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();
    await expect(page.locator('body > .ui4u-calendar')).toBeVisible();

    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(150);

    const stillOnField = await page.evaluate(() => {
      const panel = document.querySelector('.ui4u-calendar');
      const field = document.querySelector('#date-demo .ui4u-input__native');
      const p = panel.getBoundingClientRect();
      const f = field.getBoundingClientRect();
      return p.top >= f.bottom - 2 || p.bottom <= f.top + 2;
    });

    expect(stillOnField).toBe(true);
  });

  test('draws the prev/next chevrons as arrows, not squares', async ({ page }) => {
    await page.locator(`${DATE} .ui4u-input__native`).click();

    const nav = await page.evaluate(() => {
      const read = (direction) => {
        const el = document.querySelector(`.ui4u-calendar__nav[data-direction="${direction}"]`);
        const cs = getComputedStyle(el, '::before');
        return {
          borders: [
            cs.borderTopWidth,
            cs.borderRightWidth,
            cs.borderBottomWidth,
            cs.borderLeftWidth,
          ],
          rotated: cs.transform !== 'none',
        };
      };
      return { prev: read('prev'), next: read('next') };
    });

    for (const side of [nav.prev, nav.next]) {
      // Exactly two adjacent borders. Four would draw a tiny filled square.
      expect(side.borders.filter((b) => b !== '0px')).toHaveLength(2);
      expect(side.rotated).toBe(true);
    }
  });

  test('accepts a hand-typed date', async ({ page }) => {
    // The field reads and writes in the chosen format, so switch to the one the
    // typed text below is actually in.
    await page.locator('#opt-format [role="tab"]', { hasText: 'dd/MM/yyyy' }).click();

    const field = page.locator(`${DATE} .ui4u-input__native`);
    await expect(field).not.toHaveAttribute('readonly', '');

    await field.fill('14/08/2026');
    await expect(field).toHaveValue('14/08/2026');

    // The committed value is ISO, whatever the reader typed.
    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-08-14');
  });

  test('leaves a half-typed date alone', async ({ page }) => {
    await page.locator('#opt-format [role="tab"]', { hasText: 'dd/MM/yyyy' }).click();

    const field = page.locator(`${DATE} .ui4u-input__native`);
    await field.fill('14/0');
    await expect(field).toHaveValue('14/0');

    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('');
  });

  test('shows and accepts the chosen format', async ({ page }) => {
    const field = page.locator(`${DATE} .ui4u-input__native`);

    await page.locator('#opt-format [role="tab"]', { hasText: 'yyyy/MM/dd' }).click();
    await expect(field).toHaveValue('2026/08/14');
    await expect(field).toHaveAttribute('placeholder', 'yyyy/MM/dd');

    await field.fill('2026/09/02');
    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('2026-09-02');
  });

  test('rejects text in the wrong order rather than guessing', async ({ page }) => {
    await page.locator('#opt-format [role="tab"]', { hasText: 'yyyy/MM/dd' }).click();

    const field = page.locator(`${DATE} .ui4u-input__native`);
    await field.fill('14/08/2026');

    const value = await page.evaluate(() => document.getElementById('date-demo').value);
    expect(value).toBe('', '14/08/2026 is not yyyy/MM/dd');
  });
});
