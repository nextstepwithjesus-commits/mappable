/**
 * Маршрутизатор по пяти уровням 08 § 6.5 и 09 § 4.4.2 поверх History API. Основа — проба П-Т5 (`prototypes/П-Т5/core/router.ts`);
 * добавлено по 08 ред. 3.3: метка `over` у записи уровня 2, созданной в приложении поверх записи экрана, и снятие выбора
 * (второе Esc): с меткой — `history.back()` (пустой записи не остаётся), без метки — замена записью уровня 1.
 *  1 экран — новая запись; 2 выбор и лист — одна запись на экран; 3 вид — замена и журнал «Отменить шаг»; 4 и 5 — не пишутся.
 * Без DOM: история, снимки и имена экранов приходят снаружи (единичные тесты — на поддельной истории).
 */
import { formatUrl, keyLevel, parseUrl, sameScreen, transitionLevel, type Level, type Route } from './маршруты.ts';

export interface EntryState {
  app: 'bn';
  lvl: 1 | 2;
  /** Ключ снимка: один на запись уровня 1, общий с её записью уровня 2. */
  key: string;
  /** Имя экрана для кнопки «Назад: …»: «Ной и потоп», «Ной — Время». */
  name: string;
  /** Номер шага внутри приложения: 0 — вход по ссылке (кнопки «Назад: …» нет). */
  step: number;
  /** Запись уровня 2 создана в приложении поверх записи этого экрана (08 § 6.5, ред. 3.3: `надЭкраном`). */
  over?: boolean;
  /** Запись экрана под записью выбора сама уже несла выбор (экран открыт по ссылке с выбором): после back() его надо снять. */
  overSel?: boolean;
  prev?: { name: string; key: string };
}

export interface HistoryPort {
  readonly state: unknown;
  push(state: EntryState, url: string): void;
  replace(state: EntryState, url: string): void;
  go(n: number): void;
}

/** Снимок экрана при уходе: элемент в фокусе, прокрутка, раскрытия, которых нет в адресе. */
export interface Snapshot {
  focus?: string;
  scroll?: number;
  open?: string[];
  [k: string]: unknown;
}
export interface SnapStore {
  get(key: string): Snapshot | undefined;
  set(key: string, s: Snapshot): void;
}

export type Change =
  | { cause: 'start'; route: Route }
  | { cause: 'go'; route: Route; level: Level; from: Route }
  | { cause: 'pop-same'; route: Route; from: Route }
  | { cause: 'pop-other'; route: Route; snapshot?: Snapshot; from: Route }
  | { cause: 'undo' | 'redo'; route: Route; label: string }
  | { cause: 'clear'; route: Route; from: Route };

interface Step { before: Route; after: Route; label: string }

export interface RouterOptions {
  base?: string;
  nameOf: (r: Route) => string;
  snapshotNow?: () => Snapshot;
  newKey?: () => string;
}

let counter = 0;

export class Router {
  route!: Route;
  entry!: EntryState;
  private journal: Step[] = [];
  private послеНазад: Route | null = null;
  private redoStack: Step[] = [];
  private listeners: ((c: Change) => void)[] = [];
  private base: string;

  constructor(
    private h: HistoryPort,
    private snaps: SnapStore,
    private o: RouterOptions,
  ) {
    this.base = o.base ?? '/';
  }

  onChange(f: (c: Change) => void) {
    this.listeners.push(f);
  }
  private emit(c: Change) {
    for (const f of this.listeners) f(c);
    return c;
  }
  private key() {
    return this.o.newKey ? this.o.newKey() : `k${Date.now().toString(36)}${(counter++).toString(36)}`;
  }
  url(r: Route) {
    return formatUrl(r, { base: this.base });
  }

  start(url: string): Change {
    const r = parseUrl(url, this.base) ?? { screen: 'glavnaya', params: {} };
    const st = this.h.state as EntryState | null;
    this.route = r;
    if (st && st.app === 'bn') this.entry = st;
    else {
      this.entry = { app: 'bn', lvl: 1, key: this.key(), name: this.o.nameOf(r), step: 0 };
      this.h.replace(this.entry, this.url(r));
    }
    return this.emit({ cause: 'start', route: r });
  }

  go(next: Route, opts: { label?: string; level?: Level } = {}): Change | null {
    const from = this.route;
    const lvl = opts.level ?? transitionLevel(from, next);
    if (lvl === 0) return null;
    if (lvl === 1) {
      this.saveSnapshot();
      this.journal = [];
      this.redoStack = [];
      this.entry = { app: 'bn', lvl: 1, key: this.key(), name: this.o.nameOf(next), step: this.entry.step + 1, prev: { name: this.entry.name, key: this.entry.key } };
      this.route = next;
      this.h.push(this.entry, this.url(next));
    } else if (lvl === 2) {
      this.route = next;
      if (this.entry.lvl === 1) {
        const былВыбор = Object.keys(from.params).some((k) => keyLevel(from.screen, k) === 2);
        this.entry = { ...this.entry, lvl: 2, over: true, ...(былВыбор && { overSel: true }) };
        this.h.push(this.entry, this.url(next));
      } else this.h.replace(this.entry, this.url(next));
    } else {
      this.route = next;
      this.h.replace(this.entry, this.url(next));
      this.journal.push({ before: from, after: next, label: opts.label ?? 'шаг вида' });
      this.redoStack = [];
    }
    return this.emit({ cause: 'go', route: next, level: lvl, from });
  }

  /**
   * Снять выбор и лист (второе Esc, 08 § 6.5 ред. 3.3): запись уровня 2 с меткой — `back()`; без метки (экран открыт по ссылке
   * с выбором) — замена той же записи уровнем 1, иначе `back()` увёл бы с сайта.
   */
  clearLevel2(next: Route): Change | null {
    const from = this.route;
    if (this.entry.lvl === 2 && this.entry.over) {
      // под записью выбора — запись экрана; если и она несла выбор, после back() снимаем его заменой (08 § 6.5: второе Esc)
      if (this.entry.overSel) this.послеНазад = next;
      this.h.go(-1);
      return null; // придёт popstate
    }
    // запись экрана, открытого по ссылке или переходом уже с выбором: замена той же записи без выбора
    this.entry = { ...this.entry, lvl: 1, over: undefined };
    this.route = next;
    this.h.replace(this.entry, this.url(next));
    return this.emit({ cause: 'clear', route: next, from });
  }

  /** Кнопка «Назад: …» (08 § 7.14): нет, если прежнего экрана в приложении нет; go(-2) с записи уровня 2 с меткой. */
  backTarget(): { label: string; name: string; delta: -1 | -2 } | null {
    if (this.entry.step === 0 || !this.entry.prev) return null;
    return { label: `Назад: ${this.entry.prev.name}`, name: this.entry.prev.name, delta: this.entry.lvl === 2 && this.entry.over ? -2 : -1 };
  }
  back() {
    const t = this.backTarget();
    if (t) this.h.go(t.delta);
  }

  popstate(state: unknown, url: string): Change {
    const from = this.route;
    const r = parseUrl(url, this.base) ?? { screen: 'glavnaya', params: {} };
    const st = state as EntryState | null;
    if (st?.app !== 'bn') {
      this.saveSnapshot();
      this.entry = { app: 'bn', lvl: 1, key: this.key(), name: this.o.nameOf(r), step: 0 };
      this.route = r;
      this.h.replace(this.entry, this.url(r));
      return this.emit({ cause: 'pop-other', route: r, from });
    }
    if (this.послеНазад && st.key === this.entry.key && sameScreen(r, from)) {
      const next = this.послеНазад;
      this.послеНазад = null;
      this.entry = { ...st, lvl: 1, over: undefined, overSel: undefined };
      this.route = next;
      this.h.replace(this.entry, this.url(next));
      return this.emit({ cause: 'clear', route: next, from });
    }
    if (st.key === this.entry.key && sameScreen(r, from)) {
      // внутри экрана применяются только уровни 1–2; вид остаётся как есть, адрес сразу заменяется текущим видом
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(from.params)) if (keyLevel(from.screen, k) === 3 || keyLevel(from.screen, k) === 'mixed') params[k] = v;
      for (const [k, v] of Object.entries(r.params)) {
        const l = keyLevel(r.screen, k);
        if (l === 1 || l === 2) params[k] = v;
      }
      const next: Route = { ...from, params };
      this.entry = st;
      this.route = next;
      this.h.replace(st, this.url(next));
      return this.emit({ cause: 'pop-same', route: next, from });
    }
    this.saveSnapshot();
    this.journal = [];
    this.redoStack = [];
    this.entry = st;
    this.route = r;
    return this.emit({ cause: 'pop-other', route: r, snapshot: this.snaps.get(st.key), from });
  }

  private saveSnapshot() {
    if (this.o.snapshotNow && this.entry) this.snaps.set(this.entry.key, this.o.snapshotNow());
  }
  pagehide() {
    this.saveSnapshot();
  }

  get undoLabel(): string | null {
    return this.journal.length ? this.journal[this.journal.length - 1].label : null;
  }
  get redoLabel(): string | null {
    return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null;
  }
  undo(): Change | null {
    const s = this.journal.pop();
    if (!s) return null;
    this.redoStack.push(s);
    this.route = this.withView(this.route, s.before);
    this.h.replace(this.entry, this.url(this.route));
    return this.emit({ cause: 'undo', route: this.route, label: s.label });
  }
  redo(): Change | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.journal.push(s);
    this.route = this.withView(this.route, s.after);
    this.h.replace(this.entry, this.url(this.route));
    return this.emit({ cause: 'redo', route: this.route, label: s.label });
  }
  private withView(cur: Route, src: Route): Route {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(cur.params)) {
      const l = keyLevel(cur.screen, k);
      if (l === 1 || l === 2) params[k] = v;
    }
    for (const [k, v] of Object.entries(src.params)) {
      const l = keyLevel(src.screen, k);
      if (l === 3 || l === 'mixed') params[k] = v;
    }
    return { ...cur, params, hash: src.hash };
  }
}
