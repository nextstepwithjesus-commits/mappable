/**
 * Маршрутизатор по пяти уровням 08 § 6.5 и 09 § 4.4.2 поверх History API. Ядро без DOM: история браузера,
 * хранилище снимков и имена экранов приходят снаружи — так модель проверяется в Node поддельной историей.
 *  1 экран — новая запись; 2 выбор и лист — одна запись на экран (первая — новая, следующие — замена);
 *  3 вид — замена и журнал «Отменить шаг»; 4 поверх и 5 настройка — не пишутся.
 */
import { formatUrl, parseUrl, transitionLevel, sameScreen, keyLevel, type Level, type Route } from './routes.ts';

export interface EntryState {
  app: 'bn';
  lvl: 1 | 2;
  /** Ключ снимка: один на запись уровня 1 (экран), общий с её записью уровня 2. */
  key: string;
  /** Имя экрана для кнопки «Назад: …» (08 § 6.5): «Давид — Генеалогия», «Ной и потоп». */
  name: string;
  /** Номер шага внутри приложения: 0 — вход по ссылке (кнопки «Назад: …» нет). */
  step: number;
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
  | { cause: 'undo' | 'redo'; route: Route; label: string };

interface Step {
  before: Route;
  after: Route;
  label: string;
}

export interface RouterOptions {
  base?: string;
  /** Имя экрана по состоянию (для кнопки «Назад: …» и объявления). */
  nameOf: (r: Route) => string;
  /** Снимок текущего экрана перед уходом с него (09 § 4.4.2: при уходе и при pagehide, не на каждом шаге). */
  snapshotNow?: () => Snapshot;
  newKey?: () => string;
}

let counter = 0;

export class Router {
  route!: Route;
  entry!: EntryState;
  private journal: Step[] = [];
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

  /** Первый показ: запись из истории (перезагрузка, возврат из другого сайта) или новая — шаг 0. */
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

  /** Переход к состоянию; уровень считается по изменившимся параметрам (routes.transitionLevel). */
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
        this.entry = { ...this.entry, lvl: 2 };
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

  /** Кнопка «Назад: …» (08 § 7.14): нет, если прежнего экрана в приложении нет; go(-2), если текущая запись — уровня 2. */
  backTarget(): { label: string; delta: -1 | -2 } | null {
    if (this.entry.step === 0 || !this.entry.prev) return null;
    return { label: `Назад: ${this.entry.prev.name}`, delta: this.entry.lvl === 2 ? -2 : -1 };
  }
  back() {
    const t = this.backTarget();
    if (t) this.h.go(t.delta);
  }

  /** popstate: внутри экрана — только уровни 1–2, окно как есть, адрес сразу заменяется текущим окном. */
  popstate(state: unknown, url: string): Change {
    const from = this.route;
    const r = parseUrl(url, this.base) ?? { screen: 'glavnaya', params: {} };
    const st = state as EntryState | null;
    if (!st || st.app !== 'bn') {
      this.saveSnapshot();
      this.entry = { app: 'bn', lvl: 1, key: this.key(), name: this.o.nameOf(r), step: 0 };
      this.route = r;
      this.h.replace(this.entry, this.url(r));
      return this.emit({ cause: 'pop-other', route: r, from });
    }
    if (st.key === this.entry.key && sameScreen(r, from)) {
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
  /** pagehide: снимок текущего экрана (перезагрузка, уход из приложения). */
  pagehide() {
    this.saveSnapshot();
  }
  snapshotOf(key: string) {
    return this.snaps.get(key);
  }

  get undoLabel(): string | null {
    return this.journal.length ? this.journal[this.journal.length - 1].label : null;
  }
  get redoLabel(): string | null {
    return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null;
  }

  /** «Отменить шаг» (08 § 7.22): возвращает параметры вида, выбор и лист не трогает; запись заменяется. */
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
