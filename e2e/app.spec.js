import { expect, test } from '@playwright/test';

/**
 * Beacon — the demo application.
 *
 * This page is the library's own end-to-end argument: a working console built
 * from nothing but UI4U. These tests are therefore about the *application*
 * behaviour — does switching views keep the shell alive, do the sidebar and the
 * segmented control agree, does the form refuse an empty submit — not about the
 * components, which `e2e/<component>.spec.js` already covers one at a time.
 */

const APP = '/demo/app.html';
const GRID = '#view-host [data-app-grid]';
/** The version cell of the first data row. */
const versionCell = (page) => page.locator(GRID).locator('tbody tr').first().locator('td').nth(1);

/**
 * Makes the inspector visible.
 *
 * It starts collapsed on a phone, so anything that reads it has to ask for it
 * first — which is the point: the app bar's own control has to be enough.
 */
async function openInspector(page) {
  const toggle = page.locator('[data-inspector-toggle]');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('#shell ui-panel[slot="right"]')).toBeVisible();
}

/** The same, for the navigation panel. */
async function openNav(page) {
  const toggle = page.locator('[data-nav-toggle]');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('#shell ui-panel[slot="left"]')).toBeVisible();
}

/** Picks a view through the segmented control in the app bar. */
async function gotoView(page, name) {
  await page.locator('#view-switch ui-button', { hasText: name }).click();
  await expect(page.locator(`#view-host [data-view="${name.toLowerCase()}"]`)).toBeVisible();
}

test.describe('Beacon app', () => {
  test.beforeEach(async ({ page }) => {
    // Theme is persisted per browser context; the app reads it on load.
    await page.goto(APP);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#status-event')).toHaveText('overview loaded');
  });

  /* ------------------------------------------------------------- the shell */

  test('the app is built from UI4U components and nothing else', async ({ page }) => {
    const tags = await page.evaluate(() => {
      /** @type {Set<string>} */
      const seen = new Set();
      for (const node of document.querySelectorAll(
        'ui-layout, ui-toolbar, ui-panel, ui-sidebar, ui-sidebar-item, ui-cards, ui-card, ui-tabs, ui-tab, ui-disclosure, ui-tablegrid, ui-button, ui-button-group, ui-input, ui-dropdown, ui-checkbox, ui-radio, ui-radio-group, ui-form, ui-popup, ui-tooltip'
      )) {
        seen.add(node.localName);
      }
      return [...seen].sort();
    });

    // A demo that quietly reached for a hand-rolled <select> would be the whole
    // argument against, so assert the real set rather than a sample of it.
    expect(tags).toEqual([
      'ui-button',
      'ui-button-group',
      'ui-card',
      'ui-cards',
      'ui-disclosure',
      'ui-input',
      'ui-layout',
      'ui-panel',
      'ui-popup',
      'ui-sidebar',
      'ui-sidebar-item',
      'ui-tab',
      'ui-tablegrid',
      'ui-tabs',
      'ui-toolbar',
      'ui-tooltip',
    ]);

    await expect(page.locator('#shell')).toHaveJSProperty('localName', 'ui-layout');
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('the shell survives a view change — only the centre region swaps', async ({ page }) => {
    // A handle captured before the swap, compared after. If the whole app were
    // re-rendered this would resolve to a different element.
    const handle = await page.evaluateHandle(() => document.getElementById('shell'));

    await gotoView(page, 'Releases');

    expect(await page.evaluate((node) => node === document.getElementById('shell'), handle)).toBe(
      true
    );
    await expect(page.locator('#nav ui-sidebar-item')).toHaveCount(4);
    await expect(page.locator('.status')).toBeVisible();
  });

  test('the status bar reports what just happened', async ({ page }) => {
    await gotoView(page, 'Releases');
    await page.locator(`${GRID} th[data-sort="downloads"] .ui4u-tablegrid__sort`).click();

    await expect(page.locator('#status-event')).toContainText('Sorted by downloads');
    await expect(page.locator('#status-selection')).toHaveText('0 selected');
  });

  test('the app bar is a toolbar, so it is one tab stop', async ({ page }) => {
    await expect(page.locator('ui-toolbar.app-bar [tabindex="0"]')).toHaveCount(1);
  });

  /* -------------------------------------------------- navigation, two ways */

  test('the sidebar and the segmented control are two views of one state', async ({ page }) => {
    // On a phone the navigation panel is collapsed, so the app bar's own control
    // is the only way in — which is exactly what has to work.
    await openNav(page);
    await expect(page.locator('#shell ui-panel[slot="left"]')).toBeVisible();

    // The panel being open is not the same as the drawer being open: below the
    // breakpoint the sidebar keeps its own off-canvas sheet, opened through its
    // own floating toggle.
    await page.locator('#nav .ui4u-sidebar__toggle').click();

    // The sidebar drives the control…
    await page.locator('#nav ui-sidebar-item[data-view="settings"] .ui4u-sidebar__link').click();
    await expect(page.locator('#view-host [data-view="settings"]')).toBeVisible();
    await expect(
      page.locator('#view-switch .ui4u-button__control[aria-checked="true"]')
    ).toHaveText('Settings');

    // …and the control drives the sidebar.
    await gotoView(page, 'Incidents');
    expect(
      await page.evaluate(() =>
        document.getElementById('nav').activeItem?.getAttribute('data-view')
      )
    ).toBe('incidents');
  });

  /* ------------------------------------------------------------- releases */

  test('the releases grid sorts, pages and searches', async ({ page }) => {
    await gotoView(page, 'Releases');
    const grid = page.locator(GRID);

    // Authored order to begin with.
    await expect(versionCell(page)).toHaveText('1.0.0');

    const sort = grid.locator('th[data-sort="downloads"] .ui4u-tablegrid__sort');

    await sort.click();
    await expect(grid.locator('th[data-sort="downloads"]')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    await expect(versionCell(page)).toHaveText('1.3.0-rc.1');

    await sort.click();
    await expect(grid.locator('th[data-sort="downloads"]')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    await expect(versionCell(page)).toHaveText('1.3.0');

    // Six rows at five per page: the pager must actually page.
    await expect(grid.locator('.ui4u-tablegrid__page-status')).toHaveText('Page 1 of 2 · 6 rows');
    await grid.locator('.ui4u-tablegrid__page-btn', { hasText: 'Next' }).click();
    await expect(grid.locator('.ui4u-tablegrid__page-status')).toHaveText('Page 2 of 2 · 6 rows');

    await grid.locator('.ui4u-tablegrid__search-input').fill('beta');
    await expect(grid.locator('tbody tr:not([hidden])')).toHaveCount(1);
  });

  test('row selection is reported, capped, and copyable', async ({ page }) => {
    await gotoView(page, 'Releases');
    const grid = page.locator(GRID);
    const boxes = grid.locator('.ui4u-tablegrid__select-cell input[type="checkbox"]');

    await boxes.nth(0).check();
    await expect(page.locator('#status-selection')).toHaveText('1 selected');
    await expect(grid.locator('.ui4u-tablegrid__copy')).toBeEnabled();

    // A binding that refuses the fourth row — and refuses it *before* the grid
    // changes, so the selection is left exactly as it was.
    await boxes.nth(1).check();
    await boxes.nth(2).check();
    await boxes.nth(3).check();

    await expect(page.locator('#status-selection')).toHaveText('3 selected');
    await expect(page.locator('#status-event')).toContainText('At most 3 releases');
  });

  test('the channel dropdown filters the grid it sits above', async ({ page }) => {
    await gotoView(page, 'Releases');
    const grid = page.locator(GRID);

    await grid.locator('[data-channel-filter] .ui4u-dropdown__trigger').click();
    await page.locator('.ui4u-dropdown__panel [role="option"]', { hasText: 'beta' }).click();

    await expect(grid.locator('tbody tr:not([hidden])')).toHaveCount(1);
    await expect(page.locator('#status-event')).toContainText('Filtered to the beta channel');

    await grid.locator('[data-clear-filters]').click();
    await expect(grid.locator('tbody tr:not([hidden])')).toHaveCount(5);
  });

  test('opening a release fills the inspector and unlocks the destructive action', async ({
    page,
  }) => {
    await gotoView(page, 'Releases');
    await openInspector(page);
    const yank = page.locator('[data-yank]');

    // Nothing inspected, nothing to destroy.
    await expect(yank).toHaveAttribute('disabled', '');

    await page.locator(`${GRID} tbody tr`).first().dblclick();
    await expect(page.locator('#inspector ui-card')).toBeVisible();
    await expect(page.locator('#inspector .ui4u-card__title')).toHaveText('1.0.0');
    await expect(yank).not.toHaveAttribute('disabled', '');

    await page.locator('#inspector ui-button', { hasText: 'Close' }).click();
    await expect(page.locator('#inspector ui-card')).toHaveCount(0);
    await expect(yank).toHaveAttribute('disabled', '');
  });

  test('the app bar search reaches the grid and the sidebar', async ({ page }) => {
    await gotoView(page, 'Releases');

    await page.locator('#global-search .ui4u-input__native').fill('beta');
    await expect(page.locator(`${GRID} tbody tr:not([hidden])`)).toHaveCount(1);
    // Nothing in the navigation matches "beta", so every entry steps aside.
    await expect(page.locator('#nav ui-sidebar-item[hidden]')).toHaveCount(4);

    await page.locator('#global-search .ui4u-input__native').fill('');
    await expect(page.locator('#nav ui-sidebar-item[hidden]')).toHaveCount(0);
    await expect(page.locator(`${GRID} tbody tr:not([hidden])`)).toHaveCount(5);
  });

  /* ------------------------------------------------------------ incidents */

  test('the form refuses an empty submit and explains why', async ({ page }) => {
    await gotoView(page, 'Incidents');

    await page.locator('[data-incident-form] ui-button', { hasText: 'Save incident' }).click();

    await expect(page.locator('#status-event')).toContainText('2 field(s) need attention');
    // Invalid styling is driven by aria-invalid, never a bespoke class — and it
    // lands on the control assistive tech actually announces.
    await expect(page.locator('ui-input[name="title"] .ui4u-input__native')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    // A dropdown's `aria-invalid` goes on its listbox, not its `<button>`
    // trigger, so the closed field is checked through its error message and the
    // open one through the panel.
    await expect(page.locator('ui-dropdown[name="severity"] .ui4u-dropdown__error')).toHaveText(
      /.+/,
      { timeout: 5000 }
    );
    await page.locator('ui-dropdown[name="severity"] .ui4u-dropdown__trigger').click();
    await expect(page.locator('.ui4u-dropdown__panel')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');

    // …while the message itself is the host's `error`, so it can be themed.
    await expect(page.locator('ui-input[name="title"]')).toHaveAttribute('error', /.+/);
  });

  test('a completed submit reports back', async ({ page }) => {
    await gotoView(page, 'Incidents');

    await page.locator('[name="title"] .ui4u-input__native').fill('Checkout latency above p95');
    await page.locator('[name="severity"] .ui4u-dropdown__trigger').click();
    await page.locator('.ui4u-dropdown__panel [role="option"]', { hasText: 'high' }).click();
    await page.locator('[name="budget"] .ui4u-input__native').fill('45k');

    await page.locator('[data-incident-form] ui-button', { hasText: 'Save incident' }).click();
    await expect(page.locator('#status-event')).toContainText('Saved Checkout latency above p95');
  });

  test('the amount field parses a k suffix for the reader', async ({ page }) => {
    await gotoView(page, 'Incidents');
    const field = page.locator('[name="budget"] .ui4u-input__native');

    // The parse runs live: 45k is rewritten as 45,000 before the field is
    // touched again, and the field is left valid.
    await field.fill('45k');
    await expect(field).toHaveValue('45,000');
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('Reset clears the fields and drops the error state', async ({ page }) => {
    await gotoView(page, 'Incidents');

    await page.locator('[data-incident-form] ui-button', { hasText: 'Save incident' }).click();
    await expect(page.locator('ui-input[name="title"] .ui4u-input__native')).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    await page.locator('[data-incident-form] [data-reset]').click();

    // The attribute is removed rather than set to "false": a field with nothing
    // wrong with it should not be announcing that it was once wrong.
    await expect(page.locator('ui-input[name="title"] .ui4u-input__native')).not.toHaveAttribute(
      'aria-invalid'
    );
    await expect(page.locator('ui-input[name="title"]')).not.toHaveAttribute('error', /.+/);
    await expect(page.locator('[name="title"] .ui4u-input__native')).toHaveValue('');
  });

  /* ------------------------------------------------------------- settings */

  test('settings re-theme the app through tokens, not through CSS', async ({ page }) => {
    await gotoView(page, 'Settings');

    await page.locator('#settings-theme ui-button', { hasText: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Survives a reload, which is the point of persisting it.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the theme control reflects the theme already in force', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('ui4u-theme', 'contrast'));
    await page.reload();
    await gotoView(page, 'Settings');

    await expect(
      page.locator('#settings-theme .ui4u-button__control[aria-checked="true"]')
    ).toHaveText('Contrast');
  });

  test('density is a preference: it outlives the view it was set in', async ({ page }) => {
    await gotoView(page, 'Releases');
    await expect(page.locator(`${GRID} table`)).not.toHaveClass(/ui4u-tablegrid__dense/);

    await gotoView(page, 'Settings');
    await page.locator('#settings-density ui-button', { hasText: 'Compact' }).click();
    await expect(page.locator('#status-event')).toContainText('Tables are compact');

    // Leaving and coming back must not silently drop it.
    await gotoView(page, 'Releases');
    await expect(page.locator(`${GRID} table`)).toHaveClass(/ui4u-tablegrid__dense/);
  });

  test('the error colour is a token anyone can override', async ({ page }) => {
    await gotoView(page, 'Settings');
    const danger = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui4u-danger').trim()
      );

    const before = await danger();
    await page.locator('[name="custom-danger"] .ui4u-checkbox__native').check();
    await expect(page.locator('#status-event')).toContainText('Errors are amber');

    const after = await danger();
    expect(after).not.toBe(before);

    await page.locator('[name="custom-danger"] .ui4u-checkbox__native').uncheck();
    expect(await danger()).toBe(before);
  });

  /* --------------------------------------------------------------- popups */

  test('a destructive action is trapped behind a confirm, and can be declined', async ({
    page,
  }) => {
    await gotoView(page, 'Releases');
    await openInspector(page);
    await page.locator(`${GRID} tbody tr`).first().dblclick();

    await page.locator('[data-yank]').click();

    const popup = page.locator('#confirm');
    await expect(popup).toHaveAttribute('open', '');
    await expect(page.locator('#confirm-title')).toHaveText('Yank 1.0.0?');

    await page.locator('#confirm-cancel').click();
    await expect(popup).not.toHaveAttribute('open', '');
    // Declining must leave the world as it was.
    await expect(page.locator('#inspector ui-card')).toBeVisible();
  });

  test('confirming the action reports it and empties the inspector', async ({ page }) => {
    await gotoView(page, 'Releases');
    await openInspector(page);
    await page.locator(`${GRID} tbody tr`).first().dblclick();
    await page.locator('[data-yank]').click();
    await page.locator('#confirm-ok').click();

    await expect(page.locator('#confirm')).not.toHaveAttribute('open', '');
    await expect(page.locator('#status-event')).toHaveText('Yanked 1.0.0');
    await expect(page.locator('#inspector ui-card')).toHaveCount(0);
  });

  test('the modal traps focus while it is open', async ({ page }) => {
    await gotoView(page, 'Releases');
    await openInspector(page);
    await page.locator(`${GRID} tbody tr`).first().dblclick();
    await page.locator('[data-yank]').click();

    // The popup is portalled to `<body>`, so the trap is asserted against the
    // portal — not against the `<ui-popup>` element, which is now empty.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-open="true"]'))
      );
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#confirm')).not.toHaveAttribute('open', '');
  });

  /* ------------------------------------------------------ overall coverage */

  test('every component in the library appears somewhere in the app', async ({ page }) => {
    const views = ['overview', 'releases', 'incidents', 'settings'];
    /** @type {Set<string>} */
    const seen = new Set();

    for (const view of views) {
      await gotoView(page, view.charAt(0).toUpperCase() + view.slice(1));
      // The inspector's tooltip only exists once a release is open, so the
      // sweep has to do the same thing a reader would.
      if (view === 'releases') {
        await openInspector(page);
        await page.locator(`${GRID} tbody tr`).first().dblclick();
      }
      const tags = await page.evaluate(() =>
        [...document.querySelectorAll('*')]
          .map((n) => n.localName)
          .filter((name) => name.startsWith('ui-'))
      );
      for (const tag of tags) seen.add(tag);
    }

    expect([...seen].sort()).toEqual([
      'ui-button',
      'ui-button-group',
      'ui-card',
      'ui-cards',
      'ui-checkbox',
      'ui-disclosure',
      'ui-dropdown',
      'ui-dropdown-option',
      'ui-form',
      'ui-input',
      'ui-layout',
      'ui-panel',
      'ui-popup',
      'ui-radio',
      'ui-radio-group',
      'ui-sidebar',
      'ui-sidebar-item',
      'ui-tab',
      'ui-tablegrid',
      'ui-tabs',
      'ui-toolbar',
      'ui-tooltip',
    ]);
  });

  test('the app raises no script errors on any view', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

    await page.goto(APP);
    for (const name of ['Releases', 'Incidents', 'Settings', 'Overview']) {
      await gotoView(page, name);
    }
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  /* --------------------------------------------------------- responsiveness */

  test('on a narrow screen the side regions collapse out of the way', async ({
    page,
    isMobile,
  }) => {
    // `isMobile` rather than `test.skip()`: a skip outside a describe is a
    // Playwright error, not a skip.
    test.skip(!isMobile, 'Only meaningful on the mobile project.');

    await expect(page.locator('#shell ui-panel[slot="right"]')).toBeHidden();
    await expect(page.locator('#shell ui-panel[slot="left"]')).toBeHidden();

    // The centre region — the app itself — is untouched.
    await expect(page.locator('#view-host [data-view="overview"]')).toBeVisible();
  });
});
