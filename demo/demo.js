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

highlightAll();
wireCopyButtons();
wireThemeToggle();
