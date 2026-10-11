import { UI4UElement } from '../../core/base.js';
import { append, el, on, setText } from '../../core/dom.js';

/**
 * @typedef {'asc' | 'desc' | 'none'} SortDirection
 *
 * @typedef {object} TableGridOptions
 * @property {boolean} [navigate] Make cells reachable with the arrow keys, which
 *   switches the table to `role="grid"`. Default `false` — a plain native table
 *   with a sortable header per column is the right default for reading a table.
 * @property {boolean} [striped] Zebra-stripe the body rows.
 * @property {boolean} [dense] Tighten the row padding.
 * @property {boolean} [searchable] Render a search field above the table.
 * @property {number|null} [perPage] Rows per page. `null` disables paging.
 * @property {string|null} [search] Initial search query.
 * @property {string|null} [sort] Key of the column to sort by, from `data-sort`.
 * @property {SortDirection} [direction] Initial sort direction. Default `'asc'`.
 */

const NUMERIC = 'number';

/**
 * A browsable data table.
 *
 * The author writes a plain `<table>`; this component keeps it and adds
 * column groups, sorting, search, pagination and keyboard navigation.
 *
 * ```html
 * <ui-tablegrid label="Releases" searchable per-page="4" navigate>
 *   <table>
 *     <thead>
 *       <!-- Optional group row; only the LAST row carries the columns. -->
 *       <tr>
 *         <th scope="colgroup" colspan="2">Release</th>
 *         <th scope="col" rowspan="2">Channel</th>
 *       </tr>
 *       <tr>
 *         <th scope="col" data-sort="version" data-type="text">Version</th>
 *         <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr>
 *         <td>1.2.0</td>
 *         <td data-value="8421">8,421</td>
 *         <td>stable</td>
 *       </tr>
 *     </tbody>
 *   </table>
 * </ui-tablegrid>
 * ```
 *
 * `data-sort` marks a column sortable; `data-type="number"` compares
 * numerically, and a formatted cell can carry `data-value` for the real number.
 *
 * Search, sorting and paging compose: a query filters first, then the sort is
 * applied to what survives, and paging slices that.
 *
 * Events: `ui4u:sort`, `ui4u:search`, `ui4u:page`.
 */
export class TableGrid extends UI4UElement {
  static get observedAttributes() {
    return [
      'navigate',
      'striped',
      'dense',
      'searchable',
      'per-page',
      'search',
      'sort',
      'direction',
    ];
  }

  /** @type {HTMLTableElement|null} */
  #table = null;
  /** The header row that actually carries the columns (the last one). */
  #headRow = null;
  /**
   * For each cell of `#headRow`, the column it occupies in a body row.
   *
   * Normally this is the identity map, but a `scope="colgroup"` header with
   * `rowspan="2"` shifts every column after it, so `headRow.cells[2]` would
   * otherwise be read as `row.cells[2]` and sort the wrong data.
   *
   * @type {number[]}
   */
  #columnMap = [];
  /** @type {HTMLTableSectionElement|null} */
  #body = null;
  /** @type {HTMLTableRowElement[]} authored order, kept so `resetSort()` can restore it */
  #authored = [];
  /** @type {HTMLTableRowElement[]} authored order after search filtering */
  #matched = [];
  /** @type {HTMLTableRowElement[]} rows in their current (sorted) order */
  #rows = [];
  #built = false;
  /** @type {Array<() => void>} */
  #disposers = [];
  /** Roving focus position, as [row, cell]. @type {[number, number]} */
  #cursor = [0, 0];
  /** @type {HTMLElement|null} */
  #searchInput = null;
  /** @type {HTMLElement|null} */
  #pager = null;
  /** @type {number} */
  #page = 1;

  /* ------------------------------------------------------------------ api */

  /** @returns {boolean} */
  get navigate() {
    return this.getBoolean('navigate', false);
  }

  /** @returns {boolean} */
  get striped() {
    return this.getBoolean('striped', false);
  }

  /** @returns {boolean} */
  get dense() {
    return this.getBoolean('dense', false);
  }

  /** @returns {boolean} */
  get searchable() {
    return this.getBoolean('searchable', false);
  }

  /** Rows per page, or `0` when paging is off. @returns {number} */
  get perPage() {
    return Math.max(0, Math.trunc(this.getNumber('per-page', 0)));
  }

  /** @returns {string} the active search query */
  get query() {
    return this.getString('search', '');
  }

  /** @returns {SortDirection} */
  get direction() {
    const value = this.getString('direction', 'asc');
    return value === 'desc' || value === 'none' ? value : 'asc';
  }

  /** @returns {string|null} sort key of the active column */
  get sort() {
    return this.getAttribute('sort') ?? null;
  }

  /** @returns {string} the accessible name applied to the table */
  get label() {
    return this.getString('label', '');
  }

  /** @returns {number} 1-based current page */
  get page() {
    return this.#page;
  }

  /** @returns {number} */
  get pageCount() {
    if (!this.perPage) return 1;
    return Math.max(1, Math.ceil(this.#matched.length / this.perPage));
  }

  /**
   * Every row that survives the search query, in its current sort order.
   *
   * This reflects the sort — it is what the table is actually showing, in
   * order. Use `visibleRows` when you also care about paging.
   *
   * @returns {HTMLTableRowElement[]}
   */
  get rows() {
    return [...this.#rows];
  }

  /** Rows that survive the search query, in sort order. @returns {HTMLTableRowElement[]} */
  get visibleRows() {
    return [...this.#rows];
  }

  /** The slice of `visibleRows` shown on the current page. @returns {HTMLTableRowElement[]} */
  get pageRows() {
    if (!this.perPage) return [...this.#rows];
    const start = (this.#page - 1) * this.perPage;
    return this.#rows.slice(start, start + this.perPage);
  }

  /**
   * The table's data, one object per row, keyed by `data-sort`.
   * @returns {Array<Record<string, string>>}
   */
  get data() {
    const keys = this.#sortableKeys();
    return this.#rows.map((row) => {
      /** @type {Record<string, string>} */
      const record = {};
      const cells = [...row.cells];
      keys.forEach((key, index) => {
        if (key === null) return;
        const cell = cells[this.#columnOf(index)];
        if (cell) record[key] = cell.getAttribute('data-value') ?? (cell.textContent ?? '').trim();
      });
      return record;
    });
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {TableGridOptions} [options]
   * @returns {this}
   *
   * @example
   * grid.configure({ searchable: true, perPage: 10, sort: 'downloads', direction: 'desc' });
   */
  configure(options = {}) {
    const { navigate, striped, dense, searchable, perPage, search, sort, direction } = options;

    if (navigate !== undefined) this.setAttribute('navigate', String(navigate));
    if (striped !== undefined) this.setAttribute('striped', String(striped));
    if (dense !== undefined) this.setAttribute('dense', String(dense));
    if (searchable !== undefined) this.setAttribute('searchable', String(searchable));
    if (direction !== undefined) this.setAttribute('direction', direction);

    if (perPage !== undefined) {
      if (perPage === null) this.removeAttribute('per-page');
      else this.setAttribute('per-page', String(perPage));
    }
    if (search !== undefined) {
      if (search === null) this.removeAttribute('search');
      else this.setAttribute('search', search);
    }
    if (sort !== undefined) {
      if (sort === null) this.removeAttribute('sort');
      else this.setAttribute('sort', sort);
    }

    return this;
  }

  /**
   * Sorts by a column key.
   *
   * @param {string} key value of a `data-sort` attribute
   * @param {SortDirection} [direction] omit to toggle the current column
   * @returns {this}
   *
   * @example
   * grid.sortBy('downloads', 'desc');
   */
  sortBy(key, direction) {
    const index = this.#sortableKeys().indexOf(key);
    if (index === -1) return this;

    const next = direction ?? (this.sort === key && this.direction === 'asc' ? 'desc' : 'asc');
    if (direction === undefined) this.setAttribute('direction', next);
    else this.setAttribute('direction', direction);

    if (this.sort === key) this.removeAttribute('sort');
    else this.setAttribute('sort', key);

    this.#applySort(index, next);
    this.emit('ui4u:sort', { column: key, direction: next, rows: this.data });
    return this;
  }

  /** @returns {this} */
  resetSort() {
    this.removeAttribute('sort');
    this.setAttribute('direction', 'asc');
    this.#applySort(-1, 'none');
    this.emit('ui4u:sort', { column: null, direction: 'none', rows: this.data });
    return this;
  }

  /**
   * Filters rows by a substring of any cell text.
   *
   * @param {string} query empty string clears the filter
   * @returns {this}
   *
   * @example
   * grid.search('beta');
   */
  search(query) {
    const next = query ?? '';
    if (next === this.query) return this;

    // Setting the attribute is what actually refilters; the attribute callback
    // owns the refilter, page reset and field sync so there is one path.
    this.setAttribute('search', next);
    this.emit('ui4u:search', { query: next, rows: this.data });
    return this;
  }

  /** @returns {this} */
  clearSearch() {
    return this.search('');
  }

  /**
   * @param {number} page 1-based; clamped into range
   * @returns {this}
   */
  goToPage(page) {
    const next = Math.min(Math.max(1, Math.trunc(page) || 1), this.pageCount);
    if (next === this.#page) return this;

    this.#page = next;
    this.#applyView();
    this.emit('ui4u:page', { page: next, pageCount: this.pageCount, rows: this.data });
    return this;
  }

  /** @returns {this} */
  nextPage() {
    return this.goToPage(this.#page + 1);
  }

  /** @returns {this} */
  prevPage() {
    return this.goToPage(this.#page - 1);
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#teardown();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built) return;

    if (name === 'striped' || name === 'dense') {
      this.#applyDecorations();
    } else if (name === 'label') {
      this.#applyLabel();
    } else if (name === 'searchable' || name === 'per-page') {
      this.#teardown();
      this.#build();
    } else if (name === 'search') {
      this.#refilter();
      this.#page = 1;
      this.#applyView();
      if (this.#searchInput && this.#searchInput.value !== this.query) {
        this.#searchInput.value = this.query;
      }
    } else if (name === 'navigate') {
      // Grid roles and the roving tab stop are baked in at build time, so
      // switching mode has to rebuild. The author's <table> is never moved,
      // so this is safe to repeat.
      this.#teardown();
      this.#build();
    }
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const table = /** @type {HTMLTableElement|null} */ (this.querySelector('table'));
    if (!table) return;

    const head = table.tHead;
    const body = table.tBodies[0] ?? table.createTBody();
    if (!head || head.rows.length === 0) return;

    /*
     * A <thead> may open with group headers that span several columns via
     * `colspan`. Only the LAST header row describes actual columns, so that is
     * the one the sort keys, aria-sort and navigation all read from.
     */
    const headRow = head.rows[head.rows.length - 1] ?? null;
    if (!headRow) return;

    this.#table = table;
    this.#headRow = headRow;
    this.#body = body;
    this.#built = true;
    this.#columnMap = this.#measureColumns(headRow);
    // Captured once, from the untouched markup. Sorting, searching and paging
    // all move rows afterwards, so this is the only snapshot of author order.
    this.#authored = [...body.rows];

    this.#applyLabel();
    this.#applyDecorations();

    for (const cell of [...headRow.cells]) {
      const key = cell.getAttribute('data-sort');
      if (!key) {
        cell.setAttribute('role', 'columnheader');
        continue;
      }

      const button = /** @type {HTMLButtonElement} */ (cell.ownerDocument.createElement('button'));
      button.type = 'button';
      button.className = 'ui4u-tablegrid__sort';
      button.textContent = (cell.textContent ?? '').trim();
      cell.replaceChildren(button);
      this.#disposers.push(on(button, 'click', () => this.sortBy(key)));
    }

    this.#disposers.push(
      on(this, 'keydown', (event) => this.#onKeydown(/** @type {KeyboardEvent} */ (event)))
    );

    this.#buildSearch();
    this.#buildPager();

    // Rows must be collected before navigation, which walks them to apply the
    // grid roles.
    this.#refilter();

    if (this.navigate) this.#enableNavigation(headRow);

    this.#applySort(
      this.sort ? this.#sortIndexOf(this.sort) : -1,
      this.sort ? this.direction : 'none'
    );
    this.#applyView();
  }

  /**
   * Releases listeners, undoes the DOM changes this component made, and
   * forgets the wired-up state. The author's `<table>` is never moved, so this
   * is safe to repeat when an attribute forces a rebuild.
   */
  #teardown() {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];

    if (this.#table) {
      this.#table.removeAttribute('role');
      for (const cell of this.#table.querySelectorAll('[role="gridcell"],[role="columnheader"]')) {
        cell.removeAttribute('role');
        cell.removeAttribute('tabindex');
      }
      for (const row of this.#table.querySelectorAll('[role="row"]')) row.removeAttribute('role');
    }

    this.#searchInput?.remove();
    this.#pager?.remove();
    this.#searchInput = null;
    this.#pager = null;
    this.#page = 1;
    this.#table = null;
    this.#headRow = null;
    this.#body = null;
    this.#authored = [];
    this.#matched = [];
    this.#rows = [];
    this.#built = false;
  }

  /* --------------------------------------------------------------- chrome */

  #buildSearch() {
    if (!this.searchable || !this.#table) return;

    const doc = this.ownerDocument;
    const input = /** @type {HTMLInputElement} */ (doc.createElement('input'));
    input.type = 'search';
    input.className = 'ui4u-tablegrid__search-input';
    input.placeholder = 'Filter rows';
    input.value = this.query;
    input.setAttribute('aria-label', this.label ? `Filter ${this.label}` : 'Filter rows');

    this.#disposers.push(
      on(input, 'input', () => this.search(input.value)),
      on(input, 'search', () => this.search(input.value))
    );

    const toolbar = el('div', { class: 'ui4u-tablegrid__toolbar' }, [input]);
    this.#searchInput = input;
    this.insertBefore(toolbar, this.#table);
  }

  #buildPager() {
    if (!this.perPage || !this.#table) return;

    /** @type {HTMLElement} */
    const pager = el('div', { class: 'ui4u-tablegrid__pager' });

    /** @type {HTMLButtonElement} */
    const prev = /** @type {HTMLButtonElement} */ (this.ownerDocument.createElement('button'));
    prev.type = 'button';
    prev.className = 'ui4u-tablegrid__page-btn';
    prev.textContent = 'Previous';
    prev.setAttribute('aria-label', 'Previous page');

    /** @type {HTMLElement} */
    const status = el('span', { class: 'ui4u-tablegrid__page-status', role: 'status' });

    /** @type {HTMLButtonElement} */
    const next = /** @type {HTMLButtonElement} */ (this.ownerDocument.createElement('button'));
    next.type = 'button';
    next.className = 'ui4u-tablegrid__page-btn';
    next.textContent = 'Next';
    next.setAttribute('aria-label', 'Next page');

    this.#disposers.push(
      on(prev, 'click', () => this.prevPage()),
      on(next, 'click', () => this.nextPage())
    );

    append(pager, [prev, status, next]);
    this.#pager = pager;
    this.appendChild(pager);
    this.#updatePager();
  }

  #updatePager() {
    if (!this.#pager) return;
    const status = this.#pager.querySelector('.ui4u-tablegrid__page-status');
    if (status)
      setText(status, `Page ${this.#page} of ${this.pageCount} · ${this.#matched.length} rows`);

    const buttons = this.#pager.querySelectorAll('.ui4u-tablegrid__page-btn');
    const [prev, next] = buttons;
    if (prev) prev.toggleAttribute('disabled', this.#page <= 1);
    if (next) next.toggleAttribute('disabled', this.#page >= this.pageCount);
  }

  /* ----------------------------------------------------------- behaviour */

  #applyLabel() {
    if (!this.#table) return;
    const label = this.label;
    if (label) this.#table.setAttribute('aria-label', label);
    else this.#table.removeAttribute('aria-label');
  }

  #applyDecorations() {
    if (!this.#table) return;
    this.#table.classList.toggle('ui4u-tablegrid__striped', this.striped);
    this.#table.classList.toggle('ui4u-tablegrid__dense', this.dense);
  }

  /** @returns {Array<string|null>} `data-sort` keys, one per column, in column order */
  #sortableKeys() {
    if (!this.#headRow) return [];
    return [...this.#headRow.cells].map((cell) => cell.getAttribute('data-sort'));
  }

  /**
   * Reads a `colspan` / `rowspan` value, defaulting when it is absent or junk.
   *
   * @param {HTMLTableCellElement} cell
   * @param {string} attribute
   * @param {number} fallback
   * @returns {number}
   */
  #span(cell, attribute, fallback) {
    const raw = Number.parseInt(cell.getAttribute(attribute) ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  /**
   * Works out which body column each cell of `headRow` lines up with.
   *
   * Earlier header rows are walked first to find the columns their `rowspan`
   * cells spill into; those columns are skipped when the real column row is
   * measured, so a group header spanning two rows shifts everything after it.
   *
   * @param {HTMLTableRowElement} headRow
   * @returns {number[]}
   */
  #measureColumns(headRow) {
    const head = /** @type {HTMLTableSectionElement|null} */ (headRow.closest('thead'));
    const rows = head ? [...head.rows] : [headRow];
    const lastIndex = rows.length - 1;

    /** Columns still occupied by an earlier row's `rowspan` cell. @type {Set<number>} */
    const spill = new Set();
    for (let r = 0; r < lastIndex; r += 1) {
      const row = rows[r];
      if (!row) continue;
      let col = 0;
      for (const cell of row.cells) {
        const colspan = this.#span(cell, 'colspan', 1);
        if (r + this.#span(cell, 'rowspan', 1) > lastIndex) {
          for (let dc = 0; dc < colspan; dc += 1) spill.add(col + dc);
        }
        col += colspan;
      }
    }

    /** @type {number[]} */
    const map = [];
    let col = 0;
    for (const cell of headRow.cells) {
      while (spill.has(col)) col += 1;
      map.push(col);
      col += this.#span(cell, 'colspan', 1);
    }
    return map;
  }

  /**
   * Maps a position in `#headRow.cells` to the column of a body row.
   *
   * @param {number} headIndex
   * @returns {number}
   */
  #columnOf(headIndex) {
    return this.#columnMap[headIndex] ?? headIndex;
  }

  /** @param {string} key @returns {number} column index, or `-1` */
  #sortIndexOf(key) {
    return this.#sortableKeys().indexOf(key);
  }

  /**
   * Recomputes which rows survive the search query and re-applies the current
   * sort to them, so changing the query never leaves the row order stale.
   *
   * `#authored` is deliberately *not* re-read here: sorting and paging move rows
   * in the DOM, so re-reading would capture a shuffled order and
   * `resetSort()` / `clearSearch()` would no longer restore the markup order.
   */
  #refilter() {
    const query = this.query.trim().toLowerCase();
    this.#matched = query
      ? this.#authored.filter((row) =>
          [...row.cells].some((cell) =>
            (cell.getAttribute('data-value') ?? cell.textContent ?? '')
              .toLowerCase()
              .includes(query)
          )
        )
      : [...this.#authored];

    const index = this.sort ? this.#sortIndexOf(this.sort) : -1;
    this.#applySort(index, index >= 0 ? this.direction : 'none');
  }

  /**
   * Reorders the matched rows. A stable comparator falls back to the authored
   * order for equal keys, so repeated sorts do not shuffle.
   *
   * @param {number} index column index, or `-1` to restore the authored order
   * @param {SortDirection} direction
   */
  #applySort(index, direction) {
    if (!this.#body) return;

    const key = index >= 0 ? this.#sortableKeys()[index] : null;
    const type = key ? (this.#headRow?.cells[index]?.getAttribute('data-type') ?? 'text') : 'text';

    const original = new Map(this.#authored.map((row, i) => [row, i]));
    // A group header with `rowspan` shifts the columns, so the head position is
    // translated before it is used to read a body cell.
    const column = index >= 0 ? this.#columnOf(index) : -1;
    const valueAt = (row) => {
      const cell = column >= 0 ? row.cells[column] : undefined;
      if (!cell) return '';
      return cell.getAttribute('data-value') ?? (cell.textContent ?? '').trim();
    };

    // Sorting must not lose the authored order, which `resetSort()` restores,
    // and must operate on the searched subset, not every row.
    const sorted = [...this.#matched];
    if (key && direction !== 'none') {
      const sign = direction === 'desc' ? -1 : 1;
      sorted.sort((a, b) => {
        const left = valueAt(a);
        const right = valueAt(b);
        const result =
          type === NUMERIC
            ? (Number.parseFloat(left) || 0) - (Number.parseFloat(right) || 0)
            : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
        return result !== 0 ? result * sign : (original.get(a) ?? 0) - (original.get(b) ?? 0);
      });
    }

    for (const row of sorted) this.#body.appendChild(row);
    this.#rows = sorted;

    /*
     * `aria-sort` belongs on exactly one header. Leaving `aria-sort="none"` on
     * every sortable column would announce three unsorted columns for what is
     * really one sorted column, so the rest have the attribute removed.
     */
    if (this.#headRow) {
      [...this.#headRow.cells].forEach((cell, i) => {
        if (i !== index) {
          cell.removeAttribute('aria-sort');
          return;
        }
        cell.setAttribute(
          'aria-sort',
          direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
        );
      });
    }
  }

  /** Shows only the current page's rows and refreshes the pager. */
  #applyView() {
    if (!this.#body) return;

    const shown = new Set(this.pageRows);
    for (const row of this.#authored) row.hidden = !shown.has(row);
    this.#updatePager();
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (!this.navigate || event.key !== 'Escape') return;
    if (this.sort) this.resetSort();
  }

  /**
   * Grid semantics plus roving focus over the cells.
   *
   * Only `navigate` opts in: a plain `<table>` is already navigable by screen
   * readers, and turning every cell into a tab stop would be a downgrade.
   *
   * @param {HTMLTableRowElement} headRow the row that carries the columns
   */
  #enableNavigation(headRow) {
    if (!this.#table) return;

    this.#table.setAttribute('role', 'grid');

    /*
     * A `role="grid"` row may not be left without a role, so *every* header
     * row gets one — including group rows, whose cells are columnheaders too.
     * The roving cursor only walks the column row and the body: a group header
     * is `scope="colgroup"` scaffolding, not a cell you arrow into.
     */
    const head = /** @type {HTMLTableSectionElement|null} */ (this.#table.tHead);
    const headRows = head ? [...head.rows] : [headRow];
    /** @type {Array<HTMLTableRowElement>} */
    const allRows = [...headRows, ...this.#authored];

    for (const row of allRows) {
      row.setAttribute('role', 'row');
      for (const cell of row.cells) {
        cell.setAttribute('role', cell.tagName === 'TH' ? 'columnheader' : 'gridcell');
        cell.tabIndex = -1;
      }
    }

    // Cursor rows: the row that carries the columns, then the body.
    const cursorRows = [headRow, ...this.#authored];

    const focusCell = (rowIndex, cellIndex) => {
      const cell = cursorRows[rowIndex]?.cells[cellIndex];
      if (!cell) return;
      for (const other of this.#table.querySelectorAll('[role="gridcell"],[role="columnheader"]')) {
        other.tabIndex = -1;
      }
      cell.tabIndex = 0;
      cell.focus({ preventScroll: true });
      this.#cursor = [rowIndex, cellIndex];
    };

    // Roving focus has to follow reality: if the user clicks a cell directly,
    // the arrow keys must continue from there rather than from wherever the
    // last keypress left the cursor.
    this.#disposers.push(
      on(this.#table, 'focusin', (event) => {
        const cell = /** @type {HTMLElement|null} */ (event.target);
        if (!cell?.matches('[role="gridcell"],[role="columnheader"]')) return;
        const rowIndex = cursorRows.indexOf(
          /** @type {HTMLTableRowElement} */ (cell.parentElement)
        );
        if (rowIndex !== -1) this.#cursor = [rowIndex, cell.cellIndex];
      })
    );

    const total = cursorRows.length;
    const width = headRow.cells.length;
    const rowHidden = (index) => index >= 0 && index < total && cursorRows[index].hidden === true;

    /**
     * Steps to the next row that is actually on screen.
     *
     * Search and paging hide rows with the `hidden` property but leave them in
     * the markup, so a plain `r + 1` would move the cursor onto a cell the user
     * cannot see. At either end the cursor simply stays put.
     *
     * @param {number} from 0-based cursor row
     * @param {number} step `+1` downwards, `-1` upwards
     * @returns {number} the row to land on
     */
    const stepRow = (from, step) => {
      for (let i = from + step; i >= 0 && i < total; i += step) {
        if (!rowHidden(i)) return i;
      }
      return from;
    };

    this.#disposers.push(
      on(this, 'keydown', (event) => {
        const { key, ctrlKey } = /** @type {KeyboardEvent} */ (event);
        const [r, c] = this.#cursor;
        /** @type {[number, number]|null} */
        let next = null;

        if (key === 'ArrowRight') next = [r, Math.min(c + 1, width - 1)];
        else if (key === 'ArrowLeft') next = [r, Math.max(c - 1, 0)];
        else if (key === 'ArrowDown') next = [stepRow(r, 1), c];
        else if (key === 'ArrowUp') next = [stepRow(r, -1), c];
        else if (key === 'Home') next = ctrlKey ? [0, 0] : [r, 0];
        else if (key === 'End') {
          next = ctrlKey ? [stepRow(total - 1, -1), width - 1] : [r, width - 1];
        } else return;

        event.preventDefault();
        focusCell(next[0], next[1]);
      })
    );

    focusCell(0, 0);
  }
}

export default TableGrid;
