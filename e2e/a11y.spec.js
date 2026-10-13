import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility gate.
 *
 * Every other check in this suite asks "does the component do what it says".
 * This one asks whether the result is *usable* — whether a control has an
 * accessible name, whether a screen reader would be told it is invalid, whether
 * the text is legible against what is behind it.
 *
 * Those are the failures nobody sees in a screenshot, and they are the reason a
 * design system exists at all: a component that looks right and is unusable is
 * worse than no component, because it looks finished.
 *
 * Every demo page is scanned, in every theme, on both viewport projects. The
 * theme loop is not ceremony: two of the three defects this gate caught were
 * palette failures that existed in one theme and not the others.
 */

/** Every page the demo site serves. */
const PAGES = [
  'index.html',
  'app.html',
  'tabs.html',
  'disclosure.html',
  'button.html',
  'button-group.html',
  'tooltip.html',
  'popup.html',
  'input.html',
  'checkbox.html',
  'radio.html',
  'dropdown.html',
  'form.html',
  'sidebar.html',
  'layout.html',
  'tablegrid.html',
  'toolbar.html',
  'card.html',
  'switch.html',
  'textarea.html',
];

const THEMES = ['dark', 'light', 'contrast'];

/** The tags the gate holds itself to. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Formats violations so a failure names the element, not just the rule.
 *
 * @param {import('@axe-core/playwright').AxeResults} results
 * @returns {string}
 */
function describe(results) {
  return results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes
          .slice(0, 4)
          .map(
            (node) =>
              `    ${node.target.join(' ')}\n      ${node.html.slice(0, 160)}\n` +
              node.any
                .concat(node.all ?? [])
                .slice(0, 1)
                .map((check) => `      → ${check.message.slice(0, 200)}`)
                .join('\n')
          )
          .join('\n')
    )
    .join('\n\n');
}

for (const theme of THEMES) {
  test.describe(`a11y · ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      // The theme is persisted per context; set it before the page reads it.
      await page.goto('/demo/index.html');
      await page.evaluate((value) => localStorage.setItem('ui4u-theme', value), theme);
    });

    for (const name of PAGES) {
      test(name, async ({ page }) => {
        await page.goto(`/demo/${name}`);
        // Custom elements upgrade asynchronously; scanning mid-upgrade reports
        // the un-upgraded markup, which is a false positive about a state no
        // reader will ever see.
        await page.waitForTimeout(150);

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(describe(results)).toBe('');
      });
    }
  });
}
