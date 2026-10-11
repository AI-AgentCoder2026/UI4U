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

/** Cycles `data-theme` through the built-in themes. */
function wireThemeToggle(button = document.querySelector('[data-theme-toggle]')) {
  if (!button) return;
  const order = ['dark', 'light', 'contrast'];

  button.addEventListener('click', () => {
    const root = document.documentElement;
    const current = order.indexOf(root.dataset.theme ?? 'dark');
    root.dataset.theme = order[(current + 1) % order.length];
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
];

/**
 * @param {string} href
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLAnchorElement}
 */
function navLink(href, text, className = '') {
  const link = document.createElement('a');
  link.href = href;
  link.className = className;
  // `textContent`, never innerHTML — a label is still text.
  link.textContent = text;
  return link;
}

/**
 * Appends a prev / home / next bar and a repository link to every demo page.
 *
 * Generated rather than authored into thirteen files, so a new demo cannot ship
 * without navigation and none of them can drift apart.
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
  const nav = document.createElement('nav');
  nav.className = 'demo-nav';
  nav.setAttribute('aria-label', 'Demo navigation');

  const previous = DEMOS[index - 1];
  const next = DEMOS[index + 1];

  // `aria-disabled` rather than `aria-hidden`, so the slot keeps its place in
  // the tab order at the ends of the list instead of vanishing.
  if (previous) nav.appendChild(navLink(previous.file, `← ${previous.label}`, 'demo-nav__link'));
  else nav.appendChild(navLink('#', '← Previous', 'demo-nav__link demo-nav__link--off'));

  nav.appendChild(navLink('index.html', 'All demos', 'demo-nav__link demo-nav__link--home'));

  if (next) nav.appendChild(navLink(next.file, `${next.label} →`, 'demo-nav__link'));
  else nav.appendChild(navLink('#', 'Next →', 'demo-nav__link demo-nav__link--off'));

  const repo = navLink(REPO_URL, 'GitHub', 'demo-nav__link demo-nav__link--repo');
  repo.rel = 'noopener noreferrer';
  repo.target = '_blank';
  nav.appendChild(repo);

  page.appendChild(nav);
}

highlightAll();
wireCopyButtons();
wireThemeToggle();
wireDemoNav();
