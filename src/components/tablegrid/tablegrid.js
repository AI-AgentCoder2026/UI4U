import { UI4UElement } from '../../core/base.js';
import { on } from '../../core/dom.js';

/**
 * @typedef {'asc' | 'desc' | 'none'} SortDirection
 *
 * @typedef {object} TableGridOptions
 * @property {boolean} [navigate] Make cells reachable with the arrow keys, which
 *   switches the table to `role="grid"`. Default `false` — a plain native table
 *   with a sortable header per column is the right default for reading a table.
 * @property {boolean} [striped] Zebra-stripe the body rows.
 * @property {boolean} [dense] Tighten the row padding.
 * @property {string|null} [sort] Key of the column to sort by, from `data-sort`.
 * @property {SortDirection} [direction] Initial sort direction. Default `'asc'`.
 */

/** Columns whose `data-sort` type coerces numbers before comparing. */
const NUMERIC = 'number';

/**
 * A browsable data table.
 *
 * The author writes a plain `<table>`; this component keeps it and adds
 * sorting, keyboard column navigation and sticky headers. Native table markup
 * is preserved rather than rebuilt, so it still works when rendered on a server.
 *
 * ```html
 * <ui-tablegrid navigate>
 *   <table>
 *     <thead>
 *       <tr>
 *         <th scope="col" data-sort="text" data-type="text">Version</th>
 *         <th scope="col" data-sort="number" data-type="number">Downloads</th>
 *         <th scope="col">Published</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>2026-08-01</td></tr>
 *     </tbody>
 *   </table>
 * </ui-tablegrid>
 * ```
 *
 * `data-sort` marks a column sortable; `data-type="number"` compares
 * numerically. A cell may carry `data-value` when its text is formatted.
 *
 * Listens for `ui4u:sort` — `detail: { column, direction, rows }`.
 */
export class TableGrid extends UI4UElement {
  static get observedAttributes() {
    return ['navigate', 'striped', 'dense', 'sort', 'direction'];
  }

  /** @type {HTMLTableElement|null} */
  #table = null;
  /** @type {HTMLTableSectionElement|null} */
  #body = null;
  /** @type {HTMLTableRowElement[]} rows in their authored order, kept so `resetSort()` can restore them */
  #authored = [];
  /** @type {HTMLTableRowElement[]} rows in their current (sorted) order */
  #rows = [];
  #built = false;
  /** @type {Array<() => void>} */
  #disposers = [];
  /** Roving focus position, as [row, cell]. @type {[number, number]} */
  #cursor = [0, 0];

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

  /**
   * The row elements in their current (sorted) order.
   *
   * @returns {HTMLTableRowElement[]}
   */
  get rows() {
    return [...this.#rows];
  }

  /**
   * The table's data, one object per row, keyed by `data-sort`.
   *
   * @returns {Array<Record<string, string>>}
   */
  get data() {
    const keys = this.#sortableKeys();
    return this.#rows.map((row) => {
      /** @type {Record<string, string>} */
      const record = {};
      const cells = [...row.children];
      keys.forEach((key, index) => {
        // Columns without `data-sort` are not part of the data shape.
        if (key === null) return;
        const cell = cells[index];
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
   * grid.configure({ navigate: true, striped: true, sort: 'downloads', direction: 'desc' });
   */
  configure(options = {}) {
    const { navigate, striped, dense, sort, direction } = options;
    if (navigate !== undefined) this.setAttribute('navigate', String(navigate));
    if (striped !== undefined) this.setAttribute('striped', String(striped));
    if (dense !== undefined) this.setAttribute('dense', String(dense));
    if (direction !== undefined) this.setAttribute('direction', direction);
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
   * @param {SortDirection} [direction]
   * @returns {this}
   *
   * @example
   * grid.sortBy('downloads', 'desc');
   */
  sortBy(key, direction) {
    const keys = this.#sortableKeys();
    const index = keys.indexOf(key);
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

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#teardown();
  }

  /**
   * Releases listeners, undoes the DOM changes this component made, and
   * forgets the wired-up state. The author's `<table>` is never moved, so this
   * is safe to repeat when `navigate` toggles and the wiring must be rebuilt.
   */
  #teardown() {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];

    // Rebuilding without undoing these would leave stale grid semantics behind
    // when `navigate` switches off.
    if (this.#table) {
      this.#table.removeAttribute('role');
      for (const cell of this.#table.querySelectorAll('[role="gridcell"],[role="columnheader"]')) {
        cell.removeAttribute('role');
        cell.removeAttribute('tabindex');
      }
      for (const row of this.#table.querySelectorAll('[role="row"]')) row.removeAttribute('role');
    }

    this.#table = null;
    this.#body = null;
    this.#authored = [];
    this.#rows = [];
    this.#built = false;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built) return;
    if (name === 'striped' || name === 'dense') {
      this.#applyDecorations();
    } else if (name === 'label') {
      this.#applyLabel();
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

    this.#table = table;
    this.#body = body;
    this.#authored = [...body.rows];
    this.#rows = [...body.rows];
    this.#built = true;

    this.#applyLabel();
    this.#applyDecorations();

    /* Every sortable header gets a real <button>, so sorting is reachable by
       keyboard without re-implementing button semantics. */
    const headings = [...head.rows[0].cells];
    headings.forEach((cell) => {
      const key = cell.getAttribute('data-sort');
      if (!key) {
        cell.setAttribute('role', 'columnheader');
        return cell;
      }

      const button = /** @type {HTMLButtonElement} */ (cell.ownerDocument.createElement('button'));
      button.type = 'button';
      button.className = 'ui4u-tablegrid__sort';
      button.textContent = (cell.textContent ?? '').trim();
      cell.replaceChildren(button);
      this.#disposers.push(on(button, 'click', () => this.sortBy(key)));
    });

    this.#disposers.push(
      on(this, 'keydown', (event) => this.#onKeydown(/** @type {KeyboardEvent} */ (event)))
    );

    if (this.navigate) this.#enableNavigation(head.rows[0] ?? null);
    if (this.sort) this.#applySort(this.#sortableKeys().indexOf(this.sort), this.direction);
    else this.#applySort(-1, 'none');
  }

  /** @param {string} direction @param {HTMLElement[]} headings */
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

  /**
   * `data-sort` keys in column order. Columns without `data-sort` are omitted
   * rather than mapped to an empty key, so `data` never grows a blank field.
   *
   * @returns {Array<string|null>}
   */
  #sortableKeys() {
    if (!this.#table?.tHead?.rows[0]) return [];
    return [...this.#table.tHead.rows[0].cells].map((cell) => cell.getAttribute('data-sort'));
  }

  /**
   * Reorders the body rows. A stable comparator keeps the authored order for
   * equal keys, so repeated sorts of the same column do not shuffle.
   *
   * @param {number} index column index, or `-1` to restore the authored order
   * @param {SortDirection} direction
   */
  #applySort(index, direction) {
    if (!this.#body) return;

    const keys = this.#sortableKeys();
    const key = index >= 0 ? keys[index] : null;
    const type = key
      ? (this.#table?.tHead?.rows[0].cells[index]?.getAttribute('data-type') ?? 'text')
      : 'text';

    const original = new Map(this.#authored.map((row, i) => [row, i]));
    const valueAt = (row) => {
      const cell = row.cells[index];
      if (!cell) return '';
      return cell.getAttribute('data-value') ?? (cell.textContent ?? '').trim();
    };

    // Sorting in place would destroy the authored order, which is what
    // `resetSort()` needs to restore.
    const sorted = [...this.#authored];
    if (key && direction !== 'none') {
      const sign = direction === 'desc' ? -1 : 1;
      sorted.sort((a, b) => {
        const left = valueAt(a);
        const right = valueAt(b);
        const result =
          type === NUMERIC
            ? (Number.parseFloat(left) || 0) - (Number.parseFloat(right) || 0)
            : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
        // Fall back to the authored order so the sort is stable.
        return result !== 0 ? result * sign : (original.get(a) ?? 0) - (original.get(b) ?? 0);
      });
    }

    for (const row of sorted) this.#body.appendChild(row);
    this.#rows = sorted;

    // `aria-sort` belongs on exactly one header. Leaving `aria-sort="none"` on
    // every sortable column would announce three unsorted columns for what is
    // really one sorted column, so the rest have the attribute removed.
    const head = this.#table?.tHead?.rows[0];
    if (head) {
      [...head.cells].forEach((cell, i) => {
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

  /**
   * Grid semantics plus roving focus over the cells.
   *
   * Only `navigate` opts in: a plain `<table>` is already navigable by screen
   * readers, and turning every cell into a tab stop would be a downgrade.
   *
   * @param {HTMLTableRowElement|null} headRow the header row
   */
  #enableNavigation(headRow) {
    if (!this.#table || !headRow) return;

    this.#table.setAttribute('role', 'grid');

    /** @type {Array<HTMLTableRowElement>} header row first, then the body */
    const allRows = [headRow, ...this.#rows];

    for (const row of allRows) {
      row.setAttribute('role', 'row');
      for (const cell of row.cells) {
        cell.setAttribute('role', cell.tagName === 'TH' ? 'columnheader' : 'gridcell');
        cell.tabIndex = -1;
      }
    }

    const focusCell = (rowIndex, cellIndex) => {
      const cell = allRows[rowIndex]?.cells[cellIndex];
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
        const rowIndex = allRows.indexOf(/** @type {HTMLTableRowElement} */ (cell.parentElement));
        if (rowIndex !== -1) this.#cursor = [rowIndex, cell.cellIndex];
      })
    );

    const total = allRows.length;
    const width = headRow.cells.length;

    this.#disposers.push(
      on(this, 'keydown', (event) => {
        const { key, ctrlKey } = /** @type {KeyboardEvent} */ (event);
        const [r, c] = this.#cursor;
        /** @type {[number, number]|null} */
        let next = null;

        if (key === 'ArrowRight') next = [r, Math.min(c + 1, width - 1)];
        else if (key === 'ArrowLeft') next = [r, Math.max(c - 1, 0)];
        else if (key === 'ArrowDown') next = [Math.min(r + 1, total - 1), c];
        else if (key === 'ArrowUp') next = [Math.max(r - 1, 0), c];
        else if (key === 'Home') next = ctrlKey ? [0, 0] : [r, 0];
        else if (key === 'End') next = ctrlKey ? [total - 1, width - 1] : [r, width - 1];
        else return;

        event.preventDefault();
        focusCell(next[0], next[1]);
      })
    );

    focusCell(0, 0);
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (!this.navigate || event.key !== 'Escape') return;
    if (this.sort) this.resetSort();
  }
}

export default TableGrid;
