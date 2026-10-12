import { clear, el, on, setText } from '../../core/dom.js';
import {
  addDays,
  addMonths,
  buildDecade,
  buildMonthGrid,
  buildYear,
  clampToBounds,
  fromISO,
  isSameDay,
  isWithinBounds,
  makeDate,
  monthLabel,
  toISO,
  weekdayLabels,
} from './date.js';

/**
 * @typedef {'day' | 'month' | 'year'} CalendarView
 *
 * @typedef {object} CalendarBounds
 * @property {string} [min] inclusive ISO `YYYY-MM-DD`
 * @property {string} [max] inclusive ISO `YYYY-MM-DD`
 *
 * @typedef {object} CalendarConfig
 * @property {CalendarView} [view] Which level the panel opens at.
 * @property {boolean} [range] Two clicks make a range instead of one date.
 * @property {string} [locale] BCP-47 tag for month and weekday names.
 * @property {number} [firstDayOfWeek] `0` for Sunday, `1` for Monday.
 * @property {CalendarBounds} [bounds] Earliest and latest pickable dates.
 * @property {string} [value] current ISO date, or `from/to` when `range`.
 *
 * @typedef {object} CalendarSelection
 * @property {string} from ISO start, `''` when nothing is chosen
 * @property {string} to ISO end, `''` when only one end is chosen
 */

/**
 * The calendar surface behind `ui-input type="date"`.
 *
 * A panel rather than a component: it is portalled to `<body>` and positioned
 * by the host, so it has no custom element and no lifecycle beyond
 * `open()` / `close()` / `destroy()`. Day, month and year are the same panel at
 * three levels, which is what makes drilling up and back down possible.
 *
 * All listeners are bound once, in the constructor, and everything else is
 * delegated from the body. Binding per render would leak a listener every time
 * the grid is redrawn.
 */
export class CalendarPanel {
  /** @type {HTMLElement|null} */
  #root = null;
  /** @type {HTMLElement|null} */
  #body = null;
  /** @type {HTMLElement|null} */
  #title = null;

  /** @type {CalendarConfig} */
  #config = { view: 'day', range: false, locale: 'en-GB', firstDayOfWeek: 1 };
  /** The month or year the panel is looking at. @type {Date} */
  #cursor = makeDate(new Date().getFullYear(), new Date().getMonth(), 1);
  /** @type {CalendarSelection} */
  #selection = { from: '', to: '' };
  /** Which end of a range the next click completes. */
  #pending = /** @type {'from' | 'to'} */ ('from');
  /** Roving focus identity — an ISO date, `"YYYY-M"` or a year. @type {string} */
  #focused = '';
  /** @type {Array<() => void>} */
  #disposers = [];

  /**
   * @param {{ onSelect: (selection: CalendarSelection, isFinal: boolean) => void,
   *           onViewChange?: (view: CalendarView) => void,
   *           onClose?: () => void }} handlers
   */
  constructor(handlers) {
    this.handlers = handlers;

    /** @type {HTMLElement} */
    const root = el('div', { class: 'ui4u-calendar', role: 'dialog' });
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-label', 'Choose a date');

    /** @type {HTMLElement} */
    const header = el('div', { class: 'ui4u-calendar__header' });
    const prev = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
    prev.className = 'ui4u-calendar__nav';
    prev.setAttribute('aria-label', 'Previous');
    prev.dataset.direction = 'prev';
    const title = el('div', { class: 'ui4u-calendar__title', role: 'button', tabindex: '0' });
    const next = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
    next.className = 'ui4u-calendar__nav';
    next.setAttribute('aria-label', 'Next');
    next.dataset.direction = 'next';
    appendAll(header, [prev, title, next]);

    /** @type {HTMLElement} */
    const body = el('div', { class: 'ui4u-calendar__body' });

    /** @type {HTMLElement} */
    const footer = el('div', { class: 'ui4u-calendar__footer' });
    const today = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
    today.className = 'ui4u-calendar__today';
    today.textContent = 'Today';
    const clear = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
    clear.className = 'ui4u-calendar__clear';
    clear.textContent = 'Clear';
    const done = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
    done.className = 'ui4u-calendar__done';
    done.textContent = 'Done';
    appendAll(footer, [today, clear, done]);

    appendAll(root, [header, body, footer]);

    this.#root = root;
    this.#title = title;
    this.#body = body;

    this.#disposers.push(
      on(prev, 'click', () => this.#step(-1)),
      on(next, 'click', () => this.#step(1)),
      on(title, 'click', () => this.#drillUp()),
      on(title, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') this.#drillUp();
      }),
      on(body, 'click', (event) => this.#onClick(/** @type {MouseEvent} */ (event))),
      on(body, 'keydown', (event) => this.#onKeydown(/** @type {KeyboardEvent} */ (event))),
      // Roving focus has to follow where the user actually landed, including a
      // Tab into the middle of the grid.
      on(body, 'focusin', (event) => {
        const button = /** @type {HTMLElement|null} */ (event.target)?.closest('button');
        const id = this.#identify(button);
        if (id) this.#focused = id;
      }),
      on(today, 'click', () => this.#choose(toISO(new Date()), true)),
      on(clear, 'click', () => this.#clearAll()),
      on(done, 'click', () => this.handlers.onClose?.())
    );
  }

  /** @returns {HTMLElement} */
  get element() {
    return /** @type {HTMLElement} */ (this.#root);
  }

  /** @returns {boolean} */
  get isOpen() {
    return Boolean(this.#root?.isConnected);
  }

  /** @returns {CalendarView} */
  get view() {
    return this.#config.view ?? 'day';
  }

  /** @param {CalendarConfig} config */
  setConfig(config) {
    this.#config = { ...this.#config, ...config };
    this.#seed();
    this.#render();
  }

  /**
   * Mounts on `<body>` and places itself under `anchor`.
   *
   * The panel is made invisible for the one frame between being attached and
   * being positioned. A `position: fixed` element with no `left`/`top` renders
   * at the origin, so appending it visible makes it flash in the top-left
   * corner before `position()` has measured it — and if that measurement bails
   * out early (no layout, a zero-size anchor) the flash is all the user ever
   * sees.
   *
   * @param {HTMLElement} anchor
   * @param {(anchor: HTMLElement, surface: HTMLElement) => void} place
   */
  open(anchor, place) {
    const root = this.element;

    root.style.visibility = 'hidden';
    if (!root.isConnected) root.ownerDocument.body.appendChild(root);

    place(anchor, root);

    // Revealed only once it has a position, whatever `place` decided.
    root.style.visibility = '';

    this.#focusStop();
  }

  close() {
    this.#root?.remove();
  }

  destroy() {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
    this.close();
    this.#root = null;
    this.#body = null;
  }

  /* ------------------------------------------------------------- internals */

  /** Loads the incoming value, and centres the cursor on it. */
  #seed() {
    const value = this.#config.value ?? '';

    if (this.#config.range && value.includes('/')) {
      const [from = '', to = ''] = value.split('/');
      this.#selection = { from, to };
    } else {
      this.#selection = { from: value, to: this.#config.range ? '' : value };
    }

    // A range restored with only a start is half-finished, so the next click
    // completes it rather than silently throwing the start away. Resuming here
    // rather than assuming `'from'` is what stops a saved partial range from
    // being replaced by a one-click range.
    this.#pending = this.#selection.from && !this.#selection.to ? 'to' : 'from';

    const anchor = fromISO(this.#selection.from);
    this.#cursor = anchor
      ? makeDate(anchor.getFullYear(), anchor.getMonth(), 1)
      : makeDate(new Date().getFullYear(), new Date().getMonth(), 1);

    // Start the roving focus on what is already chosen, not on the first cell of
    // the grid — otherwise opening the panel on a saved date would land the
    // caret three weeks away from it.
    this.#focused = this.#selection.from;
  }

  /** @returns {CalendarBounds} */
  get #bounds() {
    return this.#config.bounds ?? {};
  }

  /** @param {CalendarView} view */
  #setView(view) {
    this.#config.view = view;
    this.handlers.onViewChange?.(view);
    this.#focused = '';
    this.#render();
  }

  /** @param {HTMLElement|null} button @returns {string} */
  #identify(button) {
    if (!(button instanceof HTMLElement)) return '';
    if (button.dataset.date) return button.dataset.date;
    if (button.dataset.month !== undefined) {
      return `${button.dataset.year}-${button.dataset.month}`;
    }
    return button.dataset.year ?? '';
  }

  #render() {
    const title = this.#title;
    const body = this.#body;
    if (!title || !body) return;

    const view = this.view;
    title.setAttribute('aria-label', view === 'day' ? 'Choose month and year' : 'Choose year');

    if (view === 'month') setText(title, String(this.#cursor.getFullYear()));
    else if (view === 'year') {
      const years = buildDecade(this.#cursor.getFullYear());
      setText(title, `${years[0]} – ${years[years.length - 1]}`);
    } else setText(title, monthLabel(this.#cursor, this.#config.locale));

    clear(body);
    if (view === 'month') this.#renderMonths(body);
    else if (view === 'year') this.#renderYears(body);
    else this.#renderDays(body);
  }

  /** @param {HTMLElement} body */
  #renderMonths(body) {
    const locale = this.#config.locale ?? 'en-GB';
    const short = new Intl.DateTimeFormat(locale, { month: 'short' });
    const grid = el('div', { class: 'ui4u-calendar__grid ui4u-calendar__grid--months' });
    const chosen = fromISO(this.#selection.from);

    for (const month of buildYear(this.#cursor.getFullYear())) {
      const id = `${month.getFullYear()}-${month.getMonth()}`;
      const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
      button.className = 'ui4u-calendar__month';
      button.textContent = short.format(month);
      button.setAttribute('aria-label', monthLabel(month, locale));
      button.dataset.month = String(month.getMonth());
      button.dataset.year = String(month.getFullYear());
      button.setAttribute('aria-pressed', String(Boolean(chosen && isSameDay(month, chosen))));
      if (
        month.getFullYear() === new Date().getFullYear() &&
        month.getMonth() === new Date().getMonth()
      ) {
        button.dataset.today = '';
      }
      grid.appendChild(this.#withRoving(button, id));
    }

    body.appendChild(grid);
  }

  /** @param {HTMLElement} body */
  #renderYears(body) {
    const currentYear = new Date().getFullYear();
    const grid = el('div', { class: 'ui4u-calendar__grid ui4u-calendar__grid--years' });

    for (const year of buildDecade(this.#cursor.getFullYear())) {
      const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }));
      button.className = 'ui4u-calendar__year';
      button.textContent = String(year);
      button.dataset.year = String(year);
      button.setAttribute('aria-pressed', String(year === currentYear));
      if (year === currentYear) button.dataset.today = '';
      grid.appendChild(this.#withRoving(button, String(year)));
    }

    body.appendChild(grid);
  }

  /** @param {HTMLElement} body */
  #renderDays(body) {
    const locale = this.#config.locale ?? 'en-GB';
    const weeks = buildMonthGrid(this.#cursor, this.#config.firstDayOfWeek ?? 1);

    /** @type {HTMLTableElement} */
    const table = el('table', { class: 'ui4u-calendar__table', role: 'grid' });

    /** @type {HTMLTableSectionElement} */
    const head = /** @type {HTMLTableSectionElement} */ (
      /** @type {unknown} */ (document.createElement('thead'))
    );
    /** @type {HTMLTableRowElement} */
    const headRow = /** @type {HTMLTableRowElement} */ (
      /** @type {unknown} */ (document.createElement('tr'))
    );
    headRow.setAttribute('role', 'row');

    for (const label of weekdayLabels(locale, this.#config.firstDayOfWeek ?? 1)) {
      const th = /** @type {HTMLTableCellElement} */ (
        /** @type {unknown} */ (document.createElement('th'))
      );
      th.setAttribute('role', 'columnheader');
      th.setAttribute('scope', 'col');
      th.setAttribute('aria-label', label);
      setText(th, label);
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    table.appendChild(head);

    /** @type {HTMLTableSectionElement} */
    const tbody = /** @type {HTMLTableSectionElement} */ (
      /** @type {unknown} */ (document.createElement('tbody'))
    );
    const start = fromISO(this.#selection.from);
    const end = this.#selection.to ? fromISO(this.#selection.to) : null;
    const today = new Date();

    for (const week of weeks) {
      /** @type {HTMLTableRowElement} */
      const row = /** @type {HTMLTableRowElement} */ (
        /** @type {unknown} */ (document.createElement('tr'))
      );
      row.setAttribute('role', 'row');

      for (const day of week) {
        const iso = toISO(day);
        const outside = day.getMonth() !== this.#cursor.getMonth();
        const blocked = !isWithinBounds(day, this.#bounds);
        const isStart = Boolean(start && isSameDay(day, start));
        const isEnd = Boolean(end && isSameDay(day, end));

        /** @type {HTMLTableCellElement} */
        const td = /** @type {HTMLTableCellElement} */ (
          /** @type {unknown} */ (document.createElement('td'))
        );
        td.setAttribute('role', 'gridcell');

        const button = /** @type {HTMLButtonElement} */ (document.createElement('button'));
        button.type = 'button';
        button.className = 'ui4u-calendar__day';
        button.textContent = String(day.getDate());
        button.dataset.date = iso;
        button.disabled = blocked;

        if (start && end) {
          if (day > start && day < end) button.dataset.inRange = '';
          if (isStart) button.dataset.rangeStart = '';
          if (isEnd) button.dataset.rangeEnd = '';
        }
        if (isStart || isEnd || (!this.#config.range && end && isSameDay(day, end))) {
          button.dataset.selected = '';
        }
        if (isSameDay(day, today)) button.dataset.today = '';
        if (outside) button.dataset.outside = '';
        if (blocked) button.dataset.blocked = '';

        const label = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(day);
        button.setAttribute('aria-label', blocked ? `${label}, unavailable` : label);
        button.setAttribute('aria-selected', String(isStart || isEnd));
        if (blocked) button.setAttribute('aria-disabled', 'true');

        td.appendChild(this.#withRoving(button, iso));
        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    body.appendChild(table);

    // Only a range can be meaningfully cleared.
    if (this.#config.range) {
      const status = el('p', { class: 'ui4u-calendar__status', role: 'status' });
      setText(
        status,
        this.#selection.from
          ? `${this.#selection.from} → ${this.#selection.to || 'pick an end date'}`
          : 'Pick a start date'
      );
      body.appendChild(status);
    }
  }

  /**
   * Applies the roving tab stop: exactly one cell keeps `tabindex="0"`, and
   * following it with Tab would otherwise jump back to the top of the grid.
   *
   * @param {HTMLButtonElement} button
   * @param {string} id
   * @returns {HTMLButtonElement}
   */
  #withRoving(button, id) {
    if (!this.#focused) this.#focused = id;
    button.tabIndex = this.#focused === id ? 0 : -1;
    return button;
  }

  #focusStop() {
    const stop = /** @type {HTMLElement|null} */ (this.#body?.querySelector('[tabindex="0"]'));
    stop?.focus({ preventScroll: true });
  }

  /**
   * Re-applies the tab stop after a redraw and moves focus with it.
   *
   * @param {string} id
   */
  #moveFocusTo(id) {
    this.#focused = id;
    for (const node of this.#body?.querySelectorAll('button') ?? []) {
      const button = /** @type {HTMLButtonElement} */ (node);
      if (!button.dataset.date) continue;
      button.tabIndex = button.dataset.date === id ? 0 : -1;
    }

    const target = /** @type {HTMLElement|null} */ (
      this.#body?.querySelector(`[data-date="${id}"][tabindex="0"]`)
    );
    target?.focus({ preventScroll: true });
  }

  /** @param {MouseEvent} event */
  #onClick(event) {
    const target = /** @type {HTMLElement|null} */ (event.target);
    const button = asButton(target?.closest('button'));
    if (!button || button.disabled) return;

    const id = this.#identify(button);
    if (id) this.#focused = id;

    // A month or a year cell drills *down* rather than choosing.
    if (button.dataset.date) {
      this.#choose(button.dataset.date);
      this.#render();
      this.#focusStop();
      return;
    }
    if (button.dataset.month !== undefined) {
      this.#cursor = makeDate(Number(button.dataset.year), Number(button.dataset.month), 1);
      this.#setView('day');
      this.#focusStop();
      return;
    }
    if (button.dataset.year) {
      this.#cursor = makeDate(Number(button.dataset.year), 0, 1);
      this.#setView('month');
      this.#focusStop();
    }
  }

  /**
   * @param {string} iso
   * @param {boolean} [force] pick one date even in range mode
   */
  #choose(iso, force = false) {
    const date = fromISO(iso);
    if (!date || !isWithinBounds(date, this.#bounds)) return;

    if (!this.#config.range || force) {
      this.#selection = { from: iso, to: iso };
      this.#pending = 'from';
      this.handlers.onSelect({ ...this.#selection }, true);
      this.handlers.onClose?.();
      return;
    }

    if (this.#pending === 'from' || this.#selection.to) {
      // Clicking past a finished range starts a new one rather than extending.
      this.#selection = { from: iso, to: '' };
      this.#pending = 'to';
      this.handlers.onSelect({ ...this.#selection }, false);
      return;
    }

    const start = fromISO(this.#selection.from);
    if (start && date < start) {
      // Clicking backwards swaps the ends rather than making a negative range.
      this.#selection = { from: iso, to: this.#selection.from };
    } else {
      this.#selection = { from: this.#selection.from, to: iso };
    }

    this.#pending = 'from';
    this.handlers.onSelect({ ...this.#selection }, true);
  }

  #clearAll() {
    this.#selection = { from: '', to: '' };
    this.#pending = 'from';
    this.handlers.onSelect({ from: '', to: '' }, true);
    this.#render();
  }

  /** @param {number} direction `-1` backwards, `1` forwards */
  #step(direction) {
    if (this.view === 'month') this.#cursor = addMonths(this.#cursor, direction * 12);
    else if (this.view === 'year') {
      this.#cursor = makeDate(this.#cursor.getFullYear() + direction * 10, 0, 1);
    } else this.#cursor = addMonths(this.#cursor, direction);

    this.#focused = '';
    this.#render();
    this.#focusStop();
  }

  #drillUp() {
    if (this.view === 'day') this.#setView('month');
    else if (this.view === 'month') this.#setView('year');
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handlers.onClose?.();
      return;
    }

    const keys = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    if (this.view === 'day') this.#navigateDays(event);
    else this.#navigateCoarse(event);
  }

  /** @param {KeyboardEvent} event */
  #navigateDays(event) {
    const current = fromISO(this.#focused) ?? this.#cursor;
    const first = this.#config.firstDayOfWeek ?? 1;
    let next = current;

    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = addDays(current, -((current.getDay() - first + 7) % 7));
        break;
      case 'End':
        next = addDays(current, 6 - ((current.getDay() - first + 7) % 7));
        break;
      case 'PageUp':
        next = addMonths(current, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(current, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }

    next = clampToBounds(next, this.#bounds);
    const id = toISO(next);

    // Paging across a month boundary has to move the cursor too, or the grid
    // would redraw on the old month and the focused cell would not exist.
    if (
      next.getMonth() !== this.#cursor.getMonth() ||
      next.getFullYear() !== this.#cursor.getFullYear()
    ) {
      this.#cursor = makeDate(next.getFullYear(), next.getMonth(), 1);
      this.#render();
    }

    this.#moveFocusTo(id);
  }

  /** @param {KeyboardEvent} event */
  #navigateCoarse(event) {
    if (event.key === 'PageUp') return this.#step(-1);
    if (event.key === 'PageDown') return this.#step(1);

    const years = buildDecade(this.#cursor.getFullYear());
    const span = this.view === 'month' ? 12 : years.length;
    const step = this.view === 'month' ? 1 : 4;

    let index =
      this.view === 'month' ? this.#cursor.getMonth() : years.indexOf(this.#cursor.getFullYear());
    if (index === -1) index = 0;

    switch (event.key) {
      case 'ArrowLeft':
        index -= 1;
        break;
      case 'ArrowRight':
        index += 1;
        break;
      case 'ArrowUp':
        index -= step;
        break;
      case 'ArrowDown':
        index += step;
        break;
      case 'Home':
        index = 0;
        break;
      case 'End':
        index = span - 1;
        break;
      default:
        return;
    }

    index = Math.min(Math.max(index, 0), span - 1);
    this.#cursor =
      this.view === 'month'
        ? makeDate(this.#cursor.getFullYear(), index, 1)
        : makeDate(years[index] ?? this.#cursor.getFullYear(), 0, 1);

    this.#render();
    this.#focusStop();
  }
}

/**
 * Narrows an event target to a button without `instanceof HTMLButtonElement`.
 *
 * Depending on that global would break anywhere it is not published on the
 * global object — including this repo's own jsdom harness, where it is absent.
 * A tag check needs nothing.
 *
 * @param {unknown} node
 * @returns {HTMLButtonElement|null}
 */
function asButton(node) {
  return node instanceof HTMLElement && node.tagName === 'BUTTON'
    ? /** @type {HTMLButtonElement} */ (node)
    : null;
}

/**
 * Appends children without importing `append` for one call site — it keeps the
 * panel's construction readable top to bottom.
 *
 * @param {HTMLElement} parent
 * @param {Array<HTMLElement>} children
 */
function appendAll(parent, children) {
  for (const child of children) parent.appendChild(child);
}
