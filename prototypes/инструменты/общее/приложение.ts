/**
 * Оболочка прототипа: маршрутизатор на настоящей истории браузера, сигнал текущего адреса, переходы по ссылкам, Esc,
 * снимки и фокус после перехода (08 § 6.5; 09 § 4.4.2). Служба прототипа — в продукт не переносится (09 § 10.1).
 */
import { signal } from '@preact/signals';
import { Router, type Change, type EntryState, type HistoryPort, type Snapshot } from './маршрутизатор.ts';
import { formatUrl, parseUrl, type Route } from './маршруты.ts';
import { снимки, закрытьВерхнее, объявить, фокус } from './службы.ts';

export const BASE = import.meta.env.BASE_URL;
export const маршрут = signal<Route>({ screen: 'glavnaya', params: {} });
/** Снимок экрана, на который вернулись (открытые части, блоки); экраны читают его при первом показе. */
export const снимок = signal<Snapshot | undefined>(undefined);
/** Номер показа экрана: растёт при каждом переходе уровня 1 — экран сбрасывает своё внутреннее состояние. */
export const показ = signal(0);
export const кнопкаНазад = signal<{ label: string; name: string } | null>(null);
export const шагОтмены = signal<{ undo: string | null; redo: string | null }>({ undo: null, redo: null });

let nameOf: (r: Route) => string = () => '';
export function задатьИмена(f: (r: Route) => string) {
  nameOf = f;
}

const port: HistoryPort = {
  get state() {
    return history.state;
  },
  push: (s: EntryState, url: string) => history.pushState(s, '', url),
  replace: (s: EntryState, url: string) => history.replaceState(s, '', url),
  go: (n: number) => history.go(n),
};

/** Снимок перед уходом: элемент в фокусе (по номеру), прокрутка, раскрытые части и блоки (`data-snap`). */
function snapshotNow(): Snapshot {
  const a = document.activeElement as HTMLElement | null;
  const open = [...document.querySelectorAll<HTMLElement>('[data-snap][aria-expanded="true"]')].map((x) => x.dataset.snap ?? '');
  return { focus: a && a !== document.body && a.id ? a.id : undefined, scroll: scrollY, open };
}

export const router = new Router(port, снимки, { base: BASE, nameOf: (r) => nameOf(r), snapshotNow });

function sync(c: Change) {
  const t = router.backTarget();
  кнопкаНазад.value = t ? { label: t.label, name: t.name } : null;
  шагОтмены.value = { undo: router.undoLabel, redo: router.redoLabel };
  if (c.cause === 'pop-other') снимок.value = c.snapshot;
  else if (c.cause === 'go' && c.level === 1) снимок.value = undefined;
  if (c.cause === 'start' || c.cause === 'pop-other' || (c.cause === 'go' && c.level === 1)) показ.value++;
  маршрут.value = c.route;
  document.title = `${nameOf(c.route)} — Библия наглядно`;
  if (c.cause === 'go' && c.level === 1) {
    scrollTo(0, 0);
    объявить(nameOf(c.route));
    фокус('h1');
  } else if (c.cause === 'pop-other') {
    const s = c.snapshot;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (s?.scroll !== undefined) scrollTo(0, s.scroll);
        фокус(s?.focus);
        объявить(nameOf(c.route));
      }),
    );
  } else if (c.cause === 'pop-same' || c.cause === 'clear') {
    объявить('Выбор снят, лист закрыт');
  }
}
router.onChange(sync);

export function начатьМаршруты() {
  history.scrollRestoration = 'manual';
  router.start(location.pathname + location.search + location.hash);
  addEventListener('popstate', (e) => router.popstate(e.state, location.pathname + location.search + location.hash));
  addEventListener('pagehide', () => router.pagehide());
  // ссылки приложения — переход маршрутизатором; Ctrl/Cmd/Shift и средняя кнопка — как у браузера
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !decodeURIComponent(u.pathname).startsWith(decodeURIComponent(BASE))) return;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return; // якорь на той же странице — браузеру
    const r = parseUrl(u.pathname + u.search + u.hash, BASE);
    if (!r) return;
    e.preventDefault();
    идти(r);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (закрытьВерхнее()) e.preventDefault();
  });
}

export function идти(r: Route, opts: { label?: string; level?: 1 | 2 | 3 } = {}) {
  router.go(r, opts);
}
export const href = (r: Route) => formatUrl(r, { base: BASE });
/** Заменить параметры вида текущего экрана. */
export function сВидом(patch: Record<string, string | undefined>, label?: string, hash?: string | null) {
  const r = маршрут.value;
  const params = { ...r.params };
  for (const [k, v] of Object.entries(patch)) if (v === undefined || v === '') delete params[k];
  else params[k] = v;
  delete params.v;
  router.go({ ...r, params, ...(hash !== undefined ? { hash: hash ?? undefined } : {}) }, { label });
}
