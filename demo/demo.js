/**
 * Shared behaviour for every UI4U demo page.
 *
 * Zero dependencies — a demo should not need a syntax highlighter library.
 * Add `data-highlight="html|js|css"` to a `<code>` element and its text is
 * tokenised in place. Add `data-copy` to a button to copy the nearest block.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/** Only these three characters can break out of a text node. */
const escapeHtml = (value) => value.replace(/[&<>]/g, (char) => ESCAPES[char]);

/**
 * Capture-group order maps to a token class. Group 1 is always a comment so
 * comments win over any other match starting at the same index.
 */
const PATTERNS = {
  html: /(\/\/[^\n]*|<!--[\s\S]*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(<\/?)([\w-]+)|([\w:.-]+)(?==)/g,
  js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|const|let|var|new|await|async|function|return|if|else|for|of|class|extends|null|undefined|true|false)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b/g,
  css: /(\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*')|(--[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(@[\w-]+)/g,
};

const CLASS_FOR_GROUP = {
  html: ['comment', 'string', 'punct', 'tag', 'attr'],
  js: ['comment', 'string', 'keyword', 'keyword', 'number'],
  css: ['comment', 'string', 'attr', 'number', 'keyword'],
};

/**
 * Tokenises source into HTML spans.
 *
 * Every piece is passed through `escapeHtml` *before* being wrapped, so the
 * output is safe to assign with `innerHTML` even for untrusted input.
 *
 * @param {string} source
 * @param {'html'|'js'|'css'} lang
 * @returns {string} HTML string
 */
function highlight(source, lang) {
  const pattern = PATTERNS[lang];
  if (!pattern) return escapeHtml(source);

  const classes = CLASS_FOR_GROUP[lang];
  let out = '';
  let cursor = 0;

  // `pattern` is a shared global regex; matchAll requires /g and resets lastIndex.
  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    out += escapeHtml(source.slice(cursor, match.index));

    let className = '';
    for (let group = 1; group < match.length; group += 1) {
      if (match[group] !== undefined) {
        className = classes[group] ?? '';
        break;
      }
    }

    out += className
      ? `<span class="tok-${className}">${escapeHtml(match[0])}</span>`
      : escapeHtml(match[0]);

    cursor = match.index + match[0].length;
  }

  out += escapeHtml(source.slice(cursor));
  return out;
}

/** Applies highlighting to every `[data-highlight]` block on the page. */
function highlightAll(root = document) {
  for (const code of root.querySelectorAll('[data-highlight]')) {
    code.innerHTML = highlight(code.textContent ?? '', code.dataset.highlight);
  }
}

/** Wires up every `[data-copy]` button to copy its owning block. */
function wireCopyButtons(root = document) {
  for (const button of root.querySelectorAll('[data-copy]')) {
    const block = button.closest('.demo-code')?.querySelector('code');
    if (!block) continue;

    button.addEventListener('click', async () => {
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(block.textContent ?? '');
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => {
        button.textContent = original;
      }, 1600);
    });
  }
}

/**
 * Where the chosen theme is remembered.
 *
 * The theme lives on `<html data-theme>`, which is per-document — without
 * storage, every demo page starts again from the default its markup declares
 * and a reader who picked light is thrown back into dark on the next click.
 */
const THEME_KEY = 'ui4u-theme';

/**
 * Cycles `data-theme` through the built-in themes and remembers the choice.
 *
 * @param {HTMLElement|null} [button]
 * @returns {void}
 */
function wireThemeToggle(button = document.querySelector('[data-theme-toggle]')) {
  if (!button) return;
  const order = ['dark', 'light', 'contrast'];

  button.addEventListener('click', () => {
    const root = document.documentElement;
    const current = order.indexOf(root.dataset.theme ?? 'dark');
    root.dataset.theme = order[(current + 1) % order.length];

    // Storage can throw — a sandboxed iframe or private mode — and a theme that
    // will not persist is still worth having for this page.
    try {
      localStorage.setItem(THEME_KEY, root.dataset.theme);
    } catch {
      /* not available; the choice lasts for this document only */
    }
  });
}

/** Where the project lives. One place to change if the repo ever moves. */
const REPO_URL = 'https://github.com/AI-AgentCoder2026/UI4U';

/**
 * Every demo page, in reading order.
 *
 * One list, so the index cards and the prev/next nav cannot drift apart: the
 * index is generated from this same array. Links are plain relative filenames,
 * which resolve identically under `/demo/` in dev and flattened on Pages.
 */
const DEMOS = [
  { file: 'index.html', label: 'Home' },
  { file: 'tabs.html', label: 'ui-tabs' },
  { file: 'disclosure.html', label: 'ui-disclosure' },
  { file: 'button.html', label: 'ui-button' },
  { file: 'tooltip.html', label: 'ui-tooltip' },
  { file: 'popup.html', label: 'ui-popup' },
  { file: 'input.html', label: 'ui-input' },
  { file: 'checkbox.html', label: 'ui-checkbox' },
  { file: 'radio.html', label: 'ui-radio' },
  { file: 'dropdown.html', label: 'ui-dropdown' },
  { file: 'form.html', label: 'ui-form' },
  { file: 'sidebar.html', label: 'ui-sidebar' },
  { file: 'layout.html', label: 'ui-layout' },
  { file: 'tablegrid.html', label: 'ui-tablegrid' },
  { file: 'toolbar.html', label: 'ui-toolbar' },
  { file: 'button-group.html', label: 'ui-button-group' },
  { file: 'card.html', label: 'ui-card' },
];

/**
 * Builds one navigation button.
 *
 * A `ui-button` with `href` renders a real `<a>`, so these stay links: middle
 * click, "open in new tab" and the status bar all keep working, which a
 * click-handler `<div>` would have quietly broken.
 *
 * @param {string} href
 * @param {string} text
 * @param {{ variant?: string, disabled?: boolean, external?: boolean, end?: boolean }} [options]
 * @returns {HTMLElement}
 */
function navButton(href, text, options = {}) {
  const { variant = 'ghost', disabled = false, external = false, end = false } = options;

  const button = document.createElement('ui-button');
  button.setAttribute('variant', variant);
  button.setAttribute('size', 'sm');

  if (href) button.setAttribute('href', href);
  if (disabled) button.setAttribute('disabled', '');
  if (end) button.setAttribute('data-toolbar-end', '');
  if (external) {
    button.setAttribute('target', '_blank');
    // A `target="_blank"` link without this hands the opened page a reference to
    // this one. Copied onto the anchor by the component.
    button.setAttribute('rel', 'noopener noreferrer');
  }

  // `textContent`, never innerHTML — a label is still text.
  button.textContent = text;
  return button;
}

/**
 * Prepends a prev / home / next bar and a repository link to every demo page.
 *
 * At the **top** of the page, not the bottom: the chrome scrolls away on a long
 * demo, and a reader who has to scroll to the end to find their way around has
 * no way back to the rest of the library.
 *
 * Built from `ui-toolbar` and `ui-button` rather than bespoke markup — the demo
 * site should be a demonstration of the library, not a separate implementation
 * of it. As a toolbar the whole bar is also a single tab stop, so reaching the
 * next demo costs one Tab rather than four.
 *
 * @returns {void}
 */
function wireDemoNav() {
  const page = document.querySelector('.page');
  if (!page) return;

  const current = location.pathname.split('/').pop() || 'index.html';
  const index = DEMOS.findIndex((demo) => demo.file === current);
  if (index === -1) return;

  /** @type {HTMLElement} */
  const nav = document.createElement('ui-toolbar');
  nav.className = 'demo-nav';
  nav.setAttribute('label', 'Demo navigation');
  nav.setAttribute('sr-only', '');

  const previous = DEMOS[index - 1];
  const next = DEMOS[index + 1];

  // A disabled placeholder rather than a hidden slot, so the bar keeps its shape
  // at the ends of the list instead of visibly shifting sideways.
  if (previous) nav.appendChild(navButton(previous.file, `← ${previous.label}`));
  else nav.appendChild(navButton('', '← Previous', { disabled: true }));

  nav.appendChild(
    navButton('index.html', 'All demos', {
      variant: current === 'index.html' ? 'primary' : 'ghost',
      disabled: current === 'index.html',
    })
  );

  if (next) nav.appendChild(navButton(next.file, `${next.label} →`));
  else nav.appendChild(navButton('', 'Next →', { disabled: true }));

  nav.appendChild(navButton(REPO_URL, 'GitHub', { external: true, end: true }));

  page.prepend(nav);
}

highlightAll();
wireCopyButtons();
wireThemeToggle();
wireDemoNav();
