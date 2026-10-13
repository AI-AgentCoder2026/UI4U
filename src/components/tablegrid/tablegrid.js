import { UI4UElement } from '../../core/base.js';
import { append, el, on, setText } from '../../core/dom.js';

/**
 * @typedef {'asc' | 'desc' | 'none'} SortDirection
 *
 * @typedef {'contains' | 'not-contains' | 'equals' | 'not-equals' | 'starts-with'
 *   | 'ends-with' | 'gt' | 'gte' | 'lt' | 'lte'} FilterOperator
 *
 * @typedef {object} TableFilter
 * @property {string} field A `data-sort` key, or `'*'` for any column.
 * @property {FilterOperator} operator How to compare. Default `'contains'`.
 * @property {string} value The value to compare against.
 *
 * @typedef {object} TableGridOptions
 * @property {boolean} [navigate] Make cells reachable with the arrow keys, which
 *   switches the table to `role="grid"`. Default `false` — a plain native table
 *   with a sortable header per column is the right default for reading a table.
 * @property {boolean} [striped] Zebra-stripe the body rows.
 * @property {boolean} [dense] Tighten the row padding.
 * @property {boolean} [searchable] Render a search field above the table.
 * @property {boolean} [advancedSearch] Render the field/operator/value filter
 *   builder. Implies a rebuild when toggled.
 * @property {boolean} [selectable] Render a checkbox column and let rows be
 *   selected. Implies a rebuild when toggled.
 * @property {boolean} [multi] Allow more than one selected row. Only meaningful
 *   with `selectable`.
 * @property {boolean} [selectAllHeader] Show the header checkbox that selects or
 *   clears every matched row. Only meaningful with `selectable`.
 * @property {boolean} [copyable] Render a button that copies the selected rows
 *   to the clipboard as tab-separated text.
 * @property {number|null} [perPage] Rows per page. `null` disables paging.
 * @property {string|null} [search] Initial search query.
 * @property {TableFilter[]|null} [filters] Advanced search criteria.
 * @property {string|null} [sort] Key of the column to sort by, from `data-sort`.
 * @property {SortDirection} [direction] Initial sort direction. Default `'asc'`.
 * @property {Record<string, Function>} [bindings] Event handlers keyed by name —
 *   `sort`, `search`, `page`, `select`, `copy`. A handler receives
 *   `(detail, event)` and can veto the component's own behaviour by returning
 *   `false` or calling `event.preventDefault()`.
 */

/** Operators offered by the advanced search UI, in display order. */
const OPERATORS = /** @type {const} */ ([
  'contains',
  'not-contains',
  'equals',
  'not-equals',
  'starts-with',
  'ends-with',
  'gt',
  'gte',
  'lt',
  'lte',
]);

const NUMERIC = 'number';
/** Matches every column rather than one field. */
const ANY_FIELD = '*';

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
      'advanced-search',
      'selectable',
      'multi',
      'select-all',
      'copyable',
      'per-page',
      'search',
      'filters',
      'sort',
      'direction',
      'search-placeholder',
      'loading',
      'error',
      'loading-label',
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
  #searchToolbar = null;
  /** @type {HTMLElement|null} */
  #searchInput = null;
  /** @type {HTMLElement|null} */
  #pager = null;
  /** @type {number} */
  #page = 1;
  /** Rows the user has selected. @type {Set<HTMLTableRowElement>} */
  #selected = new Set();
  /** Where a Shift-range starts. @type {HTMLTableRowElement|null} */
  #anchor = null;
  /** Cells this component inserted for the selection column, so it can undo them. @type {HTMLElement[]} */
  #selectionCells = [];
  /** @type {HTMLInputElement|null} */
  #selectAllBox = null;
  /** @type {HTMLElement|null} */
  #copyButton = null;
  /** @type {HTMLElement|null} */
  #toolbar = null;
  /** The one status row shown in place of data, or `null`. @type {HTMLTableRowElement|null} */
  #status = null;
  /** Watches the body for rows added or removed after connect. @type {MutationObserver|null} */
  #observer = null;
  /** @type {HTMLElement|null} */
  #filterBar = null;
  /** Advanced search criteria. @type {TableFilter[]} */
  #filters = [];

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

  /** @returns {boolean} */
  get advancedSearch() {
    return this.getBoolean('advanced-search', false);
  }

  /** @returns {boolean} */
  get selectable() {
    return this.getBoolean('selectable', false);
  }

  /** @returns {boolean} */
  get multi() {
    return this.getBoolean('multi', false);
  }

  /** @returns {boolean} */
  get selectAllHeader() {
    return this.getBoolean('select-all', true);
  }

  /** @returns {boolean} */
  get copyable() {
    return this.getBoolean('copyable', false);
  }

  /** @returns {string} */
  get searchPlaceholder() {
    return this.getString('search-placeholder', 'Filter rows');
  }

  /** @returns {string} */
  get selectAllLabel() {
    return this.label ? `Select every row in ${this.label}` : 'Select every row';
  }

  /** @returns {string} */
  get copyLabel() {
    return this.getString('copy-label', 'Copy');
  }

  /** Rows currently selected, in their current sort order. @returns {HTMLTableRowElement[]} */
  get selectedRows() {
    return this.#rows.filter((row) => this.#selected.has(row));
  }

  /** @returns {boolean} */
  get hasSelection() {
    return this.#selected.size > 0;
  }

  /**
   * The selected rows as records, keyed by `data-sort` — the same shape as
   * `data`, so the two can be handed to the same consumer.
   *
   * @returns {Array<Record<string, string>>}
   */
  get selectedData() {
    return this.selectedRows.map((row) => this.#record(row));
  }

  /**
   * The selected rows as tab-separated text, with a header row of column
   * labels. This is what `copySelected()` puts on the clipboard, and it pastes
   * cleanly into a spreadsheet.
   *
   * @returns {string} empty when nothing is selected
   */
  get selectedText() {
    if (this.#selected.size === 0) return '';
    const columns = this.#columnDefs();
    const lines = [columns.map((c) => c.label).join('\t')];
    for (const row of this.selectedRows) {
      lines.push(columns.map((c) => this.#cellText(row, c.column)).join('\t'));
    }
    return lines.join('\n');
  }

  /**
   * The active advanced search criteria.
   *
   * @returns {TableFilter[]}
   */
  get filters() {
    return this.#filters.map((f) => ({ ...f }));
  }

  /**
   * Replaces the advanced search criteria and refilters.
   *
   * @param {TableFilter[]} filters
   * @returns {this}
   *
   * @example
   * grid.filters = [{ field: 'downloads', operator: 'gt', value: '5000' }];
   */
  set filters(filters) {
    this.setFilters(filters);
  }

  /** Rows per page, or `0` when paging is off. @returns {number} */
  get perPage() {
    return Math.max(0, Math.trunc(this.getNumber('per-page', 0)));
  }

  /**
   * Whether the rows are being fetched.
   *
   * While this is set the grid shows a status row instead of data, marks the
   * table `aria-busy`, and disables its toolbar — sorting a table whose rows
   * have not arrived yet is a lie about what is on screen.
   *
   * @returns {boolean}
   */
  get loading() {
    return this.hasAttribute('loading');
  }

  set loading(next) {
    this.toggleAttribute('loading', Boolean(next));
  }

  /**
   * The reason the rows could not be fetched, or `''` when there is none.
   *
   * An error is a message, not a flag: "the sync failed" tells a reader nothing
   * they can act on, and an empty `error` attribute would have to be read as
   * success, which is exactly backwards.
   *
   * @returns {string}
   */
  get error() {
    return this.getString('error', '');
  }

  set error(next) {
    if (next === '' || next === null || next === undefined) this.removeAttribute('error');
    else this.setAttribute('error', String(next));
  }

  /** @returns {string} the message shown while `loading` */
  get loadingLabel() {
    return this.getString('loading-label', 'Loading');
  }

  /**
   * Whether the grid has rows to show right now.
   *
   * Derived, never authored. An `empty` attribute would have to be set by hand
   * and would be forgotten on exactly the pages that need it — the ones where
   * a search just returned nothing.
   *
   * @returns {boolean}
   */
  get isEmpty() {
    return this.#matched.length === 0;
  }

  /**
   * Whether rows exist but none of them match the active search and filters.
   *
   * Distinct from an empty grid, because the message has to be distinct: "no
   * rows yet" is an invitation to create one, "nothing matches what you typed"
   * is an invitation to change what you typed.
   *
   * @returns {boolean}
   */
  get isFilteredEmpty() {
    return this.#matched.length === 0 && this.#authored.length > 0;
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
   * The author's `<ui-toolbar>` acting as this grid's toolbar, or `null` when
   * the grid has none.
   *
   * @returns {HTMLElement|null}
   */
  get toolbar() {
    return this.#toolbar;
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
    return this.#rows.map((row) => this.#record(row));
  }

  /**
   * Applies options and returns `this`.
   *
   * Every visual and behavioural feature is opt-in through this object, which
   * also mirrors the attributes one-for-one: `advancedSearch` ↔
   * `advanced-search`, `selectAllHeader` ↔ `select-all`, `perPage` ↔
   * `per-page`.
   *
   * @param {TableGridOptions} [options]
   * @returns {this}
   *
   * @example
   * grid.configure({
   *   searchable: true,
   *   perPage: 10,
   *   selectable: true,
   *   multi: true,
   *   copyable: true,
   *   sort: 'downloads',
   *   direction: 'desc',
   * });
   */
  configure(options = {}) {
    const {
      navigate,
      striped,
      dense,
      searchable,
      advancedSearch,
      selectable,
      multi,
      selectAllHeader,
      copyable,
      perPage,
      search,
      filters,
      sort,
      direction,
      searchPlaceholder,
      bindings,
    } = options;

    if (navigate !== undefined) this.setAttribute('navigate', String(navigate));
    if (striped !== undefined) this.setAttribute('striped', String(striped));
    if (dense !== undefined) this.setAttribute('dense', String(dense));
    if (searchable !== undefined) this.setAttribute('searchable', String(searchable));
    if (advancedSearch !== undefined) this.setAttribute('advanced-search', String(advancedSearch));
    if (selectable !== undefined) this.setAttribute('selectable', String(selectable));
    if (multi !== undefined) this.setAttribute('multi', String(multi));
    if (selectAllHeader !== undefined) this.setAttribute('select-all', String(selectAllHeader));
    if (copyable !== undefined) this.setAttribute('copyable', String(copyable));
    if (direction !== undefined) this.setAttribute('direction', direction);
    if (searchPlaceholder !== undefined) {
      this.setAttribute('search-placeholder', searchPlaceholder);
    }

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
    if (filters !== undefined) this.setFilters(filters ?? []);
    if (bindings !== undefined) this.bindAll(bindings);

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

    // Guarded before any attribute is written, so a veto leaves the previous
    // sort, the direction and the row order exactly as they were.
    if (!this.runBinding('sort', { column: key, direction: next })) return this;

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

    // Guarded before the attribute is written, so a veto leaves the previous
    // query, the visible rows and the page untouched.
    if (!this.runBinding('search', { query: next })) return this;

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

    // Guarded before the page moves, so a veto keeps the current slice on screen.
    if (!this.runBinding('page', { page: next, pageCount: this.pageCount })) return this;

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

  /* ---------------------------------------------------------- selection */

  /**
   * Selects a row.
   *
   * Without `multi`, any existing selection is replaced. With it, `additive`
   * adds to the selection and `range` extends from the last anchor — the same
   * rules as Shift and Ctrl-click in a file list.
   *
   * @param {HTMLTableRowElement} row
   * @param {{ additive?: boolean, range?: boolean }} [options]
   * @returns {this}
   *
   * @example
   * grid.selectRow(row, { range: true });
   */
  selectRow(row, options = {}) {
    if (!this.selectable || !row) return this;
    const { additive = false, range = false } = options;

    // Guarded before the set is touched. Selection is not a single scalar, so
    // a veto that arrived afterwards could not be undone cleanly.
    if (!this.runBinding('select', { row, additive, range })) return this;

    if (!this.multi && !additive && !range) this.#selected.clear();

    if (range && this.multi && this.#anchor) {
      const rows = this.#rows;
      const from = rows.indexOf(this.#anchor);
      const to = rows.indexOf(row);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        // A range replaces the selection rather than piling onto it, matching
        // how Shift-click behaves in every file list.
        this.#selected.clear();
        for (let i = lo; i <= hi; i += 1) {
          const candidate = rows[i];
          if (candidate) this.#selected.add(candidate);
        }
      }
    } else if (!this.#selected.has(row)) {
      this.#selected.add(row);
    }

    this.#anchor = row;
    this.#syncSelection(true);
    return this;
  }

  /**
   * Flips a row's selected state.
   *
   * @param {HTMLTableRowElement} row
   * @param {boolean} [additive] keep the other selected rows
   * @returns {this}
   */
  toggleRow(row, additive = false) {
    if (!this.selectable || !row) return this;

    // Guarded before the set is touched, for the same reason as `selectRow`.
    if (!this.runBinding('select', { row, additive })) return this;

    // Whether the row is about to be added or removed has to be decided from
    // the state *before* the clear — otherwise a plain click on an already
    // selected row clears it and then immediately re-adds it.
    const wasSelected = this.#selected.has(row);
    if (wasSelected) this.#selected.delete(row);
    else this.#selected.add(row);

    // A plain click always replaces the selection, even with `multi` on —
    // holding Ctrl is what makes it additive.
    if (!additive) {
      this.#selected.clear();
      if (!wasSelected) this.#selected.add(row);
    }

    this.#anchor = row;
    this.#syncSelection(true);
    return this;
  }

  /** @param {HTMLTableRowElement} row @returns {boolean} */
  isSelected(row) {
    return this.#selected.has(row);
  }

  /**
   * Selects every row that survives the current search.
   *
   * @param {boolean} [selected] `false` clears instead of selecting
   * @returns {this}
   */
  selectAll(selected = true) {
    if (!this.selectable) return this;
    if (!this.runBinding('select', { all: selected })) return this;

    this.#selected.clear();
    if (selected) for (const row of this.#matched) this.#selected.add(row);
    this.#syncSelection(true);
    return this;
  }

  /** @returns {this} */
  clearSelection() {
    this.#selected.clear();
    this.#anchor = null;
    this.#syncSelection(true);
    return this;
  }

  /* ------------------------------------------------------------- copying */

  /**
   * Copies the selected rows to the clipboard as tab-separated text.
   *
   * Emits `ui4u:copy` either way, so a host can show its own confirmation.
   * Returns `false` when nothing is selected or the browser refused.
   *
   * @returns {Promise<boolean>}
   *
   * @example
   * await grid.copySelected();
   */
  async copySelected() {
    const text = this.selectedText;
    if (!text) {
      this.emit('ui4u:copy', { text: '', rows: [], copied: false });
      return false;
    }

    // Guarded before the clipboard is touched. Copying is not undoable, so a
    // veto has to arrive first rather than racing an already-written clipboard.
    if (!this.runBinding('copy', { text, rows: this.selectedData })) return false;

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    // A non-secure context has no async clipboard API, so fall back to the
    // synchronous one rather than silently failing.
    if (!copied) copied = this.#legacyCopy(text);

    this.emit('ui4u:copy', { text, rows: this.selectedData, copied });
    return copied;
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  #legacyCopy(text) {
    const doc = this.ownerDocument;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    doc.body.appendChild(area);

    let ok = false;
    try {
      area.select();
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    } finally {
      area.remove();
    }
    return ok;
  }

  /* ------------------------------------------------------- advanced search */

  /**
   * Replaces the advanced search criteria and refilters.
   *
   * @param {TableFilter[]} filters
   * @returns {this}
   *
   * @example
   * grid.setFilters([{ field: 'channel', operator: 'equals', value: 'stable' }]);
   */
  setFilters(filters) {
    this.#filters = (Array.isArray(filters) ? filters : []).map((f) => ({
      field: typeof f?.field === 'string' ? f.field : ANY_FIELD,
      operator: /** @type {FilterOperator} */ (
        OPERATORS.includes(f?.operator) ? f.operator : 'contains'
      ),
      value: typeof f?.value === 'string' ? f.value : '',
    }));

    if (this.#built) this.#renderFilters();
    this.#page = 1;
    this.#refilter();
    this.#applyView();
    return this;
  }

  /**
   * Adds one criterion. Criteria combine with AND.
   *
   * @param {TableFilter} filter
   * @returns {this}
   */
  addFilter(filter) {
    return this.setFilters([...this.#filters, filter]);
  }

  /**
   * @param {number} index position in `filters`
   * @returns {this}
   */
  removeFilter(index) {
    const next = this.#filters.filter((_, i) => i !== index);
    return this.setFilters(next);
  }

  /** @returns {this} */
  clearFilters() {
    return this.setFilters([]);
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
    } else if (name === 'search-placeholder') {
      if (this.#searchInput) this.#searchInput.placeholder = this.searchPlaceholder;
    } else if (
      name === 'searchable' ||
      name === 'per-page' ||
      name === 'advanced-search' ||
      name === 'selectable' ||
      name === 'copyable'
    ) {
      // These change which chrome exists, or how many columns the table has.
      // `selectable` in particular adds and removes a whole column, so the
      // column map has to be measured again.
      this.#teardown();
      this.#build();
    } else if (name === 'search') {
      this.#refilter();
      this.#page = 1;
      this.#applyView();
      if (this.#searchInput && this.#searchInput.value !== this.query) {
        this.#searchInput.value = this.query;
      }
    } else if (name === 'filters') {
      this.setFilters(this.#parseFilters(newValue));
    } else if (name === 'multi' || name === 'select-all') {
      // Neither adds DOM, but `multi` changes what a click means, so anything
      // already selected may no longer be valid.
      if (!this.multi) {
        const [first] = this.selectedRows;
        this.#selected.clear();
        if (first) this.#selected.add(first);
      }
      this.#syncSelection();
    } else if (name === 'navigate') {
      // Grid roles and the roving tab stop are baked in at build time, so
      // switching mode has to rebuild. The author's <table> is never moved,
      // so this is safe to repeat.
      this.#teardown();
      this.#build();
    } else if (name === 'loading' || name === 'error' || name === 'loading-label') {
      // None of these change the data, only whether any of it is shown — so a
      // full rebuild would be wasteful, but the view does have to be repainted.
      this.#applyView();
    }
  }

  /**
   * Reads the `filters` attribute, which carries a JSON array.
   *
   * @param {string|null} raw
   * @returns {TableFilter[]}
   */
  #parseFilters(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // A malformed attribute should not take the whole table down.
      return [];
    }
  }

  /**
   * Keeps `#authored` in step with the rows actually in the `<tbody>`.
   *
   * Rows are captured once at connect, which is fine for a server-rendered
   * table and useless for one built in JavaScript — the very common case, and
   * this demo's own. Without this, rows appended after the grid upgraded are
   * invisible to sorting, search and paging alike.
   *
   * New rows are appended to `#authored` rather than merged by DOM position,
   * because a live sort has already moved the existing ones around and the
   * markup order is what `resetSort()` has to be able to restore.
   */
  #watchBody(body) {
    if (typeof MutationObserver !== 'function') return;
    this.#observer?.disconnect();

    const observer = new MutationObserver(() => {
      /*
       * The status row lives in the body but is not data. Without this it
       * would be read as an added row, become part of `#authored`, and end up
       * sortable, selectable and copied along with the real rows.
       */
      const present = new Set([...body.rows].filter((row) => row !== this.#status));
      const known = new Set(this.#authored);

      const added = [...present].filter((row) => !known.has(row));
      const removed = this.#authored.filter((row) => !present.has(row));

      /*
       * Re-sorting and paging re-append rows, which is itself a `childList`
       * mutation. Returning when the *set* of rows is unchanged breaks what
       * would otherwise be an infinite loop, and skips a refilter that has
       * nothing to do anyway.
       */
      if (added.length === 0 && removed.length === 0) return;

      // New rows go on the end rather than merged by DOM position, because a
      // live sort has already moved the existing ones around and the markup
      // order is what `resetSort()` has to be able to restore.
      this.#authored = [...this.#authored.filter((row) => present.has(row)), ...added];

      this.#refilter();
      this.#applyView();
    });

    observer.observe(body, { childList: true });
    this.#observer = observer;
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const table = /** @type {HTMLTableElement|null} */ (this.querySelector('table'));
    if (!table) return;

    /*
     * A `ui-toolbar` written before the `<table>` becomes the grid's own
     * toolbar — the row of search, filters and bulk actions that belongs to the
     * table rather than to the page around it. It is left exactly where the
     * author put it; the grid only claims it so it can label and expose it.
     */
    const authoredToolbar = /** @type {HTMLElement|null} */ (
      this.querySelector(':scope > ui-toolbar')
    );
    if (authoredToolbar) {
      authoredToolbar.setAttribute('data-toolbar', 'grid');
      authoredToolbar.setAttribute('role', 'toolbar');
      if (!authoredToolbar.hasAttribute('aria-label') && !authoredToolbar.hasAttribute('label')) {
        authoredToolbar.setAttribute('aria-label', 'Table actions');
      }
      this.#toolbar = authoredToolbar;
    }

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
    this.#filters = this.#parseFilters(this.getAttribute('filters'));

    this.#applyLabel();
    this.#applyDecorations();

    // The selection column is inserted before the header cells are read, so it
    // lands at index 0 and everything after it shifts by one — which
    // `#columnOf` accounts for.
    this.#buildSelection();

    for (const cell of this.#dataCells()) {
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
    this.#buildCopy();
    this.#buildFilters();
    this.#buildPager();
    this.#watchBody(body);

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
    this.#observer?.disconnect();
    this.#observer = null;
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

    /*
     * The selection column is DOM this component added, so it has to come off
     * with everything else. Leaving it behind would stack another column on
     * every rebuild — and shift every column index with it.
     */
    for (const cell of this.#selectionCells) cell.remove();
    this.#selectionCells = [];

    /*
     * The toolbar wrapper has to go too, not just the input inside it. Removing
     * only the input leaves an empty `.ui4u-tablegrid__toolbar` behind, and every
     * rebuild would stack another one — silently pushing the table further down
     * the page each time `navigate` (or any rebuild trigger) is toggled.
     */
    this.#searchToolbar?.remove();
    this.#copyButton?.remove();
    this.#filterBar?.remove();
    this.#pager?.remove();
    this.#searchToolbar = null;
    this.#searchInput = null;
    this.#copyButton = null;
    this.#filterBar = null;
    this.#pager = null;
    this.#selectAllBox = null;
    // An author-supplied toolbar is theirs, not ours: it is re-claimed on the
    // next build, never removed here.
    this.#toolbar = null;
    this.#status?.remove();
    this.#status = null;
    this.#page = 1;
    // The user's selection belongs to their data, not to one rendering of it,
    // so it deliberately survives a rebuild — but not a disconnect.
    this.#anchor = null;
    this.#table = null;
    this.#headRow = null;
    this.#body = null;
    this.#authored = [];
    this.#matched = [];
    this.#rows = [];
    this.#built = false;
  }

  /* --------------------------------------------------------------- chrome */

  /**
   * Inserts the leading checkbox column and wires row selection.
   *
   * A real `<input type="checkbox">` per row is used rather than a styled row,
   * because it is the only version that a screen reader announces as selected
   * and that keyboard and touch both reach without extra handlers.
   */
  #buildSelection() {
    if (!this.selectable || !this.#table || !this.#body) return;

    const doc = this.ownerDocument;
    const head = /** @type {HTMLTableSectionElement|null} */ (this.#table.tHead);
    const headRows = head ? [...head.rows] : [];

    /*
     * The header checkbox spans every header row so it lines up with the group
     * headers instead of squeezing into the column row on its own.
     */
    const master = /** @type {HTMLInputElement} */ (doc.createElement('input'));
    master.type = 'checkbox';
    master.className = 'ui4u-tablegrid__check';
    master.setAttribute('aria-label', this.selectAllLabel);

    const headCell = /** @type {HTMLTableCellElement} */ (doc.createElement('th'));
    headCell.scope = 'col';
    headCell.rowSpan = Math.max(1, headRows.length);
    headCell.className = 'ui4u-tablegrid__select-head';
    headCell.appendChild(master);

    const anchorRow = headRows[0] ?? this.#headRow;
    anchorRow.insertBefore(headCell, anchorRow.firstChild);
    this.#selectionCells.push(headCell);

    for (const row of this.#authored) {
      const box = /** @type {HTMLInputElement} */ (doc.createElement('input'));
      box.type = 'checkbox';
      box.className = 'ui4u-tablegrid__check';
      box.setAttribute('aria-label', `Select row ${this.#rowLabel(row, 0)}`);

      const cell = /** @type {HTMLTableCellElement} */ (doc.createElement('td'));
      cell.className = 'ui4u-tablegrid__select-cell';
      cell.appendChild(box);
      row.insertBefore(cell, row.firstChild);
      this.#selectionCells.push(cell);
    }

    this.#selectAllBox = master;

    this.#disposers.push(
      on(master, 'change', () => {
        this.selectAll(master.checked);
        // The row checkboxes are driven by #syncSelection, but the master has
        // to agree with itself for the indeterminate state.
        master.indeterminate = false;
      }),
      on(/** @type {HTMLElement} */ (this.#body), 'change', (event) => {
        const box = /** @type {HTMLInputElement|null} */ (event.target);
        if (!box?.matches('.ui4u-tablegrid__check')) return;
        const row = /** @type {HTMLTableRowElement|null} */ (box.closest('tr'));
        if (!row) return;

        if (box.checked) this.selectRow(row, { additive: this.multi });
        else {
          this.#selected.delete(row);
          this.#anchor = row;
          this.#syncSelection(true);
        }
      }),
      on(/** @type {HTMLElement} */ (this.#body), 'click', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        // The checkbox has its own change handler; clicking it must not also
        // count as a row click or the row would toggle twice.
        if (target.closest('.ui4u-tablegrid__select-cell')) return;

        const row = /** @type {HTMLTableRowElement|null} */ (target.closest('tbody tr'));
        if (!row || !this.#authored.includes(row)) return;

        const { shiftKey, ctrlKey, metaKey } = /** @type {MouseEvent} */ (event);

        // Shift extends the range from the anchor. It has to be handled
        // before the toggle, or the anchor would move onto the row being
        // shifted to and the "range" would collapse to a single row.
        if (this.multi && shiftKey) {
          this.selectRow(row, { range: true });
          return;
        }

        this.toggleRow(row, this.multi && (ctrlKey || metaKey));
      })
    );

    this.#syncSelection();
  }

  /** Pushes the selection state onto the checkboxes and the header box. */
  #syncSelection(emit = false) {
    for (const cell of this.#selectionCells) {
      const box = /** @type {HTMLInputElement|null} */ (cell.firstElementChild);
      const row = /** @type {HTMLTableRowElement|null} */ (cell.closest('tr'));
      if (!box || !row) continue;
      const checked = this.#selected.has(row);
      if (box.checked !== checked) box.checked = checked;
      row.setAttribute('aria-selected', String(checked));
    }

    const master = this.#selectAllBox;
    if (this.#copyButton) {
      this.#copyButton.disabled = this.#selected.size === 0;
    }
    if (!master) return;
    const matched = this.#matched.length;
    const chosen = this.#matched.filter((row) => this.#selected.has(row)).length;
    master.checked = matched > 0 && chosen === matched;
    // "Some but not all" is the one state a checkbox cannot express alone.
    master.indeterminate = chosen > 0 && chosen < matched;
    if (!this.selectAllHeader) master.closest('th')?.setAttribute('hidden', '');

    if (emit) {
      this.emit('ui4u:select', {
        rows: this.selectedRows,
        data: this.selectedData,
        count: this.#selected.size,
      });
    }
  }

  /** Builds the quick filter field, when `searchable` is set. */
  #buildSearch() {
    if (!this.searchable || !this.#table) return;

    const doc = this.ownerDocument;
    const input = /** @type {HTMLInputElement} */ (doc.createElement('input'));
    input.type = 'search';
    input.className = 'ui4u-tablegrid__search-input';
    input.placeholder = this.searchPlaceholder;
    input.value = this.query;
    input.setAttribute('aria-label', this.label ? `Filter ${this.label}` : 'Filter rows');

    this.#disposers.push(
      on(input, 'input', () => this.search(input.value)),
      on(input, 'search', () => this.search(input.value))
    );

    const toolbar = el('div', { class: 'ui4u-tablegrid__toolbar' }, [input]);
    this.#searchInput = input;
    this.#searchToolbar = toolbar;
    this.insertBefore(toolbar, this.#table);
  }

  /**
   * Builds the "Copy" button. It sits with the other chrome rather than inside
   * the toolbar, because it is meaningful on its own — and stays useful when
   * `searchable` is off.
   */
  #buildCopy() {
    if (!this.copyable || !this.#table) return;

    /** @type {HTMLButtonElement} */
    const button = /** @type {HTMLButtonElement} */ (this.ownerDocument.createElement('button'));
    button.type = 'button';
    button.className = 'ui4u-tablegrid__copy';
    button.textContent = this.copyLabel;
    button.disabled = true;

    this.#disposers.push(
      on(button, 'click', () => {
        // `copySelected()` emits `ui4u:copy` itself, with the real payload.
        // The button only reflects the outcome back at the user.
        void this.copySelected().then((copied) => {
          button.textContent = copied ? 'Copied' : 'Nothing to copy';
          this.ownerDocument.defaultView?.setTimeout(() => {
            button.textContent = this.copyLabel;
          }, 1500);
        });
      })
    );

    this.#copyButton = button;
    this.insertBefore(button, this.#table);
  }

  /** Builds the field/operator/value filter builder, when advanced search is on. */
  #buildFilters() {
    if (!this.advancedSearch || !this.#table) return;

    /** @type {HTMLElement} */
    const bar = el('div', { class: 'ui4u-tablegrid__filters' });

    const add = /** @type {HTMLButtonElement} */ (this.ownerDocument.createElement('button'));
    add.type = 'button';
    add.className = 'ui4u-tablegrid__filter-add';
    add.textContent = 'Add filter';
    this.#disposers.push(
      on(add, 'click', () => {
        this.addFilter({ field: ANY_FIELD, operator: 'contains', value: '' });
      })
    );

    bar.appendChild(add);
    this.#filterBar = bar;
    this.insertBefore(bar, this.#table);
    this.#renderFilters();
  }

  /**
   * Redraws the filter rows. Rebuilding from `#filters` rather than mutating
   * keeps the DOM a pure function of the state.
   */
  #renderFilters() {
    const bar = this.#filterBar;
    if (!bar) return;

    const add = bar.querySelector('.ui4u-tablegrid__filter-add');
    for (const node of [...bar.children]) {
      if (node !== add) node.remove();
    }

    const doc = this.ownerDocument;
    this.#filters.forEach((filter, index) => {
      /** @type {HTMLElement} */
      const row = el('div', { class: 'ui4u-tablegrid__filter' });

      /** @type {HTMLSelectElement} */
      const field = /** @type {HTMLSelectElement} */ (doc.createElement('select'));
      field.className = 'ui4u-tablegrid__filter-field';
      field.setAttribute('aria-label', `Filter ${index + 1} field`);
      append(field, [this.#option(ANY_FIELD, 'Any column')]);
      for (const def of this.#columnDefs()) {
        if (!def.key) continue;
        append(field, [this.#option(def.key, def.label)]);
      }
      field.value = filter.field;

      /** @type {HTMLSelectElement} */
      const operator = /** @type {HTMLSelectElement} */ (doc.createElement('select'));
      operator.className = 'ui4u-tablegrid__filter-op';
      operator.setAttribute('aria-label', `Filter ${index + 1} operator`);
      for (const op of OPERATORS) append(operator, [this.#option(op, op)]);
      operator.value = filter.operator;

      /** @type {HTMLInputElement} */
      const value = /** @type {HTMLInputElement} */ (doc.createElement('input'));
      value.type = 'text';
      value.className = 'ui4u-tablegrid__filter-value';
      value.value = filter.value;
      value.placeholder = 'Value';
      value.setAttribute('aria-label', `Filter ${index + 1} value`);

      /** @type {HTMLButtonElement} */
      const remove = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
      remove.type = 'button';
      remove.className = 'ui4u-tablegrid__filter-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove filter ${index + 1}`);

      const commit = () => {
        this.setFilters([
          ...this.#filters.slice(0, index),
          {
            field: field.value,
            operator: /** @type {FilterOperator} */ (operator.value),
            value: value.value,
          },
          ...this.#filters.slice(index + 1),
        ]);
      };

      this.#disposers.push(
        on(field, 'change', commit),
        on(operator, 'change', commit),
        on(value, 'input', commit),
        on(remove, 'click', () => this.removeFilter(index))
      );

      append(row, [field, operator, value, remove]);
      bar.insertBefore(row, add);
    });
  }

  /**
   * @param {string} value
   * @param {string} text
   * @returns {HTMLOptionElement}
   */
  #option(value, text) {
    /** @type {HTMLOptionElement} */
    const option = /** @type {HTMLOptionElement} */ (this.ownerDocument.createElement('option'));
    option.value = value;
    option.textContent = text;
    return option;
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
    return this.#dataCells().map((cell) => cell.getAttribute('data-sort'));
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
   * Every column a body row actually has, including ones with no header cell.
   *
   * A `rowspan` group header lifts a column out of the column row — `Channel` in
   * the demo lives entirely in the group row — so `#columnDefs()` misses it. It
   * is still a visible, searchable column, and the quick filter and "Any column"
   * both have to reach it.
   *
   * @returns {number[]}
   */
  #allBodyColumns() {
    const row = this.#authored[0] ?? this.#body?.rows[0];
    if (!row) return [];

    // Skip the selection checkbox, which is not data.
    const count = row.cells.length - (this.selectable ? 1 : 0);
    return Array.from({ length: count }, (_, i) => i);
  }

  /**
   * The text of one column of a row, for matching rather than for export.
   *
   * @param {HTMLTableRowElement} row
   * @param {number} column
   * @returns {string}
   */
  #matchText(row, column) {
    const cell = row.cells[column];
    if (!cell) return '';
    return cell.getAttribute('data-value') ?? (cell.textContent ?? '').trim();
  }

  /**
   * Maps a position in `#headRow.cells` to the column of a body row.
   *
   * Two things shift the answer: a `rowspan` group header, and the checkbox
   * column this component prepends when `selectable` is on.
   *
   * @param {number} headIndex
   * @returns {number}
   */
  #columnOf(headIndex) {
    const base = this.#columnMap[headIndex] ?? headIndex;
    return this.selectable ? base + 1 : base;
  }

  /**
   * The header cells that describe real columns — everything except the
   * checkbox cell this component may have prepended.
   *
   * `#columnOf` adds the selection offset, so anything that walks header cells
   * has to skip the injected one or every column is shifted twice.
   *
   * @returns {HTMLTableCellElement[]}
   */
  #dataCells() {
    if (!this.#headRow) return [];
    return [...this.#headRow.cells].filter(
      (cell) => !cell.classList.contains('ui4u-tablegrid__select-head')
    );
  }

  /**
   * The table's columns, as the header row describes them.
   *
   * @returns {Array<{ key: string|null, label: string, type: string, column: number }>}
   */
  #columnDefs() {
    return this.#dataCells().map((cell, index) => ({
      key: cell.getAttribute('data-sort'),
      label: (cell.textContent ?? '').trim(),
      type: cell.getAttribute('data-type') ?? 'text',
      column: this.#columnOf(index),
    }));
  }

  /**
   * A row's text for one column, preferring the real value behind a formatted
   * cell so "8,421" copies as "8421".
   *
   * @param {HTMLTableRowElement} row
   * @param {number} column
   * @returns {string}
   */
  #cellText(row, column) {
    const cell = row.cells[column];
    if (!cell) return '';
    return cell.getAttribute('data-value') ?? (cell.textContent ?? '').trim();
  }

  /** @param {HTMLTableRowElement} row @returns {string} a short identifier for a row */
  #rowLabel(row, column) {
    return this.#cellText(row, column) || `row ${this.#authored.indexOf(row) + 1}`;
  }

  /** @param {HTMLTableRowElement} row @returns {Record<string, string>} */
  #record(row) {
    /** @type {Record<string, string>} */
    const record = {};
    for (const def of this.#columnDefs()) {
      if (!def.key) continue;
      record[def.key] = this.#cellText(row, def.column);
    }
    return record;
  }

  /**
   * Tests one criterion against one row.
   *
   * @param {HTMLTableRowElement} row
   * @param {TableFilter} filter
   * @returns {boolean}
   */
  #matchFilter(row, filter) {
    // A criterion with no value is a draft row the user has started but not
    // finished. It must not filter anything out, or "Add filter" would empty
    // the table the instant it was pressed.
    if (filter.value === '') return true;

    const defs = this.#columnDefs();
    const byColumn = new Map(defs.map((d) => [d.column, d]));
    const targets =
      filter.field === ANY_FIELD
        ? // Any column has to reach the ones with no header cell too, so a
          // column under a `rowspan` group header is still filterable.
          this.#allBodyColumns().map(
            (column) =>
              /** @type {{key?: string|null, label?: string, type: string, column: number}} */ (
                byColumn.get(column) ?? { column, type: 'text' }
              )
          )
        : defs.filter((d) => d.key === filter.field);

    if (targets.length === 0) return true;

    const needle = filter.value.trim().toLowerCase();

    return targets.some((def) => {
      const cell = row.cells[def.column];
      const raw = cell?.getAttribute('data-value') ?? (cell?.textContent ?? '').trim();
      const hay = raw.toLowerCase();
      const left = Number.parseFloat(raw);
      const right = Number.parseFloat(filter.value);
      // Compare as numbers only when both sides really are numbers; otherwise
      // "10" would sort against "9abc" or an empty cell as 0.
      const numeric = def.type === NUMERIC && Number.isFinite(left) && Number.isFinite(right);

      switch (filter.operator) {
        case 'contains':
          return hay.includes(needle);
        case 'not-contains':
          return !hay.includes(needle);
        case 'equals':
          return hay === needle;
        case 'not-equals':
          return hay !== needle;
        case 'starts-with':
          return hay.startsWith(needle);
        case 'ends-with':
          return hay.endsWith(needle);
        case 'gt':
          return numeric ? left > right : hay > needle;
        case 'gte':
          return numeric ? left >= right : hay >= needle;
        case 'lt':
          return numeric ? left < right : hay < needle;
        case 'lte':
          return numeric ? left <= right : hay <= needle;
        default:
          return hay.includes(needle);
      }
    });
  }

  /** @param {string} key @returns {number} column index, or `-1` */
  #sortIndexOf(key) {
    return this.#sortableKeys().indexOf(key);
  }

  /**
   * Recomputes which rows survive the query and the advanced criteria, then
   * re-applies the current sort to them, so changing a filter never leaves the
   * row order stale.
   *
   * `#authored` is deliberately *not* re-read here: sorting and paging move rows
   * in the DOM, so re-reading would capture a shuffled order and
   * `resetSort()` / `clearSearch()` would no longer restore the markup order.
   */
  #refilter() {
    const query = this.query.trim().toLowerCase();
    const columns = this.#allBodyColumns();
    const filters = this.#filters;

    const passes = (row) => {
      if (query) {
        // Every column, not just the ones with a header cell: a column under a
        // `rowspan` group header has no header of its own and would otherwise
        // be unsearchable.
        const hit = columns.some((column) =>
          this.#matchText(row, column).toLowerCase().includes(query)
        );
        if (!hit) return false;
      }
      // Criteria combine with AND.
      return filters.every((filter) => this.#matchFilter(row, filter));
    };

    this.#matched = this.#authored.filter(passes);

    const index = this.sort ? this.#sortIndexOf(this.sort) : -1;
    this.#applySort(index, index >= 0 ? this.direction : 'none');
    this.#syncSelection();
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
    // A group header with `rowspan`, or the selection column, shifts the
    // columns, so the head position is translated before it reads a body cell.
    const column = index >= 0 ? this.#columnOf(index) : -1;
    const valueAt = (row) => (column >= 0 ? this.#cellText(row, column) : '');

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
      this.#dataCells().forEach((cell, i) => {
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

    this.#renderStatus();

    const shown = new Set(this.pageRows);
    for (const row of this.#authored) row.hidden = !shown.has(row) || this.#status !== null;
    this.#updatePager();
  }

  /**
   * Renders the one-row status message, or removes it.
   *
   * Loading and error are authored; empty is derived. A grid whose rows have
   * not arrived yet, whose fetch failed, and whose search matched nothing are
   * three different things a reader has to act on differently, so they get
   * three different messages — and only the first two are the author's to set.
   *
   * @returns {void}
   */
  #renderStatus() {
    const busy = this.loading;
    const failed = this.error !== '';
    const empty = !busy && !failed && this.isEmpty;

    // `toggleAttribute` would write an empty value, and `aria-busy=""` is not
    // the same thing as `aria-busy="true"` to a screen reader.
    if (busy) this.#table?.setAttribute('aria-busy', 'true');
    else this.#table?.removeAttribute('aria-busy');
    this.#syncStatusControls();

    if (!busy && !failed && !empty) {
      this.#status?.remove();
      this.#status = null;
      return;
    }

    const message = busy
      ? this.loadingLabel
      : failed
        ? this.error
        : this.isFilteredEmpty
          ? 'Nothing matches the current search or filters'
          : 'No rows';

    if (!this.#status) {
      const row = /** @type {HTMLTableRowElement|null} */ (
        this.#body?.ownerDocument.createElement('tr')
      );
      if (!row || !this.#body) return;
      row.className = 'ui4u-tablegrid__status';
      this.#status = row;
      this.#body.appendChild(row);
    }

    this.#status.dataset.state = busy ? 'loading' : failed ? 'error' : 'empty';
    // `role="status"` is a polite live region, so arriving data announces
    // itself. An error has to interrupt, so it is an alert instead.
    this.#status.setAttribute('role', failed ? 'alert' : 'status');
    this.#status.setAttribute('aria-live', failed ? 'assertive' : 'polite');

    const cell = /** @type {HTMLTableCellElement|null} */ (
      this.#body.ownerDocument.createElement('td')
    );
    if (!cell) return;
    cell.colSpan = Math.max(1, this.#dataCells().length);
    setText(cell, message);
    this.#status.replaceChildren(cell);
  }

  /**
   * Disables the toolbar while there is nothing to act on.
   *
   * Sorting or paging a table whose rows have not arrived is a lie about what
   * is on screen, and a disabled control says so before it is clicked.
   *
   * @returns {void}
   */
  #syncStatusControls() {
    const inert = this.loading || this.error !== '';
    this.toggleAttribute('data-inert', inert);

    // The header sort buttons as well as the toolbar: both act on the rows,
    // and sorting rows that have not arrived is a lie about what is on screen.
    for (const button of this.querySelectorAll('.ui4u-tablegrid__sort')) {
      button.toggleAttribute('disabled', inert);
    }

    if (!this.#toolbar) return;
    this.#toolbar.toggleAttribute('aria-disabled', inert);
    for (const control of this.#toolbar.querySelectorAll('button, input, ui-dropdown')) {
      control.toggleAttribute('disabled', inert);
    }
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
        const { key, ctrlKey, metaKey, shiftKey } = /** @type {KeyboardEvent} */ (event);
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
        } else if (this.selectable && (key === ' ' || key === 'Spacebar')) {
          // Space toggles the row under the cursor, mirroring a file list.
          // A checkbox cell already handles Space itself, so leave that alone.
          const cell = cursorRows[r]?.cells[c];
          if (
            !cell ||
            cell.contains(this.#selectAllBox) ||
            cell.matches('.ui4u-tablegrid__select-cell')
          ) {
            return;
          }
          const row = cursorRows[r];
          event.preventDefault();
          if (shiftKey && this.multi) this.selectRow(row, { range: true });
          else this.toggleRow(row, this.multi && (ctrlKey || metaKey));
          return;
        } else if (this.selectable && (key === 'a' || key === 'A') && (ctrlKey || metaKey)) {
          event.preventDefault();
          this.selectAll(true);
          return;
        } else return;

        event.preventDefault();
        focusCell(next[0], next[1]);
      })
    );

    focusCell(0, 0);
  }
}

export default TableGrid;
