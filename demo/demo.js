/**
 * Shared behaviour for every UI4U demo page.
 *
 * Zero dependencies — a demo should not need a syntax highlighter library.
 * Add `data-highlight="html|js|css"` to a `<code>` element and its text is
 * tokenised in place. Add `data-copy` to a button to copy the nearest block.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * Builds one node.
 *
 * `data-*` props become attributes and everything else does too; `text` is a
 * text node. Never `innerHTML` — the nav carries demo labels, and a text node
 * cannot be talked into running markup.
 *
 * @param {string} tag
 * @param {Record<string, string>} [props]
 * @param {Node[]} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

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
const ACCENT_KEY = 'ui4u-accent';
const GROUND_KEY = 'ui4u-ground';

/**
 * Every accent the token layer offers, in the order they are presented.
 *
 * Kept here rather than read out of the stylesheet because this is the demo's
 * affordance, not the library's contract — a consumer picks their own by
 * writing `data-accent` on `<html>`.
 */
const ACCENTS = ['ice', 'mint', 'violet', 'rose', 'graphite'];

/** @param {string} key @param {string|null} value */
function remember(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable; the choice lasts for this document only */
  }
}

/** @param {string} key */
function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Restores the accent and ground chosen on any other page.
 *
 * The theme restore script in each page's `<head>` handles `data-theme`
 * because it must run before the stylesheet. These two cannot — they are
 * chrome, not layout — so they are applied here, and deliberately not on the
 * first paint if that would flash. The demo pages already start from the
 * library defaults, so applying after load is invisible in practice.
 */
function wireAppearance() {
  const root = document.documentElement;

  const accent = recall(ACCENT_KEY);
  if (accent && ACCENTS.includes(accent)) root.dataset.accent = accent;

  const ground = recall(GROUND_KEY);
  if (ground) root.dataset.ground = ground;

  for (const swatch of document.querySelectorAll('[data-accent-option]')) {
    swatch.setAttribute(
      'aria-pressed',
      String(swatch.dataset.accentOption === root.dataset.accent)
    );
    swatch.addEventListener('click', () => {
      const next = swatch.dataset.accentOption;
      root.dataset.accent = next;
      remember(ACCENT_KEY, next);
      for (const other of document.querySelectorAll('[data-accent-option]')) {
        other.setAttribute('aria-pressed', String(other === swatch));
      }
    });
  }

  for (const toggle of document.querySelectorAll('[data-ground-option]')) {
    toggle.setAttribute(
      'aria-pressed',
      String(toggle.dataset.groundOption === root.dataset.ground)
    );
    toggle.addEventListener('click', () => {
      const next =
        toggle.dataset.groundOption === root.dataset.ground ? null : toggle.dataset.groundOption;
      if (next) root.dataset.ground = next;
      else delete root.dataset.ground;
      remember(GROUND_KEY, next);
      for (const other of document.querySelectorAll('[data-ground-option]')) {
        other.setAttribute('aria-pressed', String(other === toggle && next !== null));
      }
    });
  }
}

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
    remember(THEME_KEY, root.dataset.theme);
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
  { file: 'app.html', label: 'Beacon app' },
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
  { file: 'switch.html', label: 'ui-switch' },
  { file: 'textarea.html', label: 'ui-textarea' },
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

  // Nav first, then the appearance bar beneath it: the bar is a
  // control strip for the page below, not a peer of the navigation, and
  // `prepend` puts each new node at the very top.
  page.prepend(appearanceBar());
  page.prepend(nav);
}

/**
 * The accent and ground controls, in the bar rather than on every page.
 *
 * Swatches rather than a dropdown: the point of offering five accents is being
 * able to see them, and a menu hides exactly what it is offering.
 *
 * @returns {HTMLElement}
 */
function appearanceBar() {
  const bar = el('div', { class: 'demo-appearance', role: 'group', 'aria-label': 'Appearance' });

  const swatches = el('span', { class: 'demo-appearance__swatches' });
  for (const name of ACCENTS) {
    const swatch = el('button', {
      type: 'button',
      class: 'demo-appearance__swatch',
      'data-accent-option': name,
      'data-accent': name,
      'aria-pressed': 'false',
      'aria-label': `${name} accent`,
      title: `${name} accent`,
    });
    swatches.appendChild(swatch);
  }

  const ground = el('button', {
    type: 'button',
    variant: 'ghost',
    size: 'sm',
    class: 'demo-appearance__ground',
    'data-ground-option': 'tinted',
    'aria-pressed': 'false',
    text: 'Tinted ground',
  });

  bar.append(swatches, ground);
  return bar;
}

highlightAll();
wireCopyButtons();
wireThemeToggle();
// Nav first: it is what creates the appearance bar these handlers attach to.
wireDemoNav();
wireAppearance();
