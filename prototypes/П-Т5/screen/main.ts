// П-Т5: оболочка пробы — маршрутизатор на настоящей истории браузера, три экрана-заглушки (страница истории,
// Генеалогия, Время), службы фокуса и объявлений. Серый макет: проверяет только путь; облик — не по 08.
import { Router, type Change, type HistoryPort, type EntryState } from '../core/router.ts';
import { parseUrl, formatUrl, applyRedirects, isTool, type Route, type Redirects } from '../core/routes.ts';
import { Announcer, OverlayStack, sessionSnaps, withTransition } from './services.ts';

interface Actor {
  id: string;
  n: string;
  v: string;
  d?: string;
}
const [index, manifest] = await Promise.all([fetch('/index.json').then((r) => r.json()), fetch('/manifest.json').then((r) => r.json())]);
const PEOPLE: Actor[] = (index.actors as Actor[]).filter((a) => a.v === '01' || a.v === '02').slice(0, 60);
const NAME = new Map((index.actors as Actor[]).map((a) => [a.id, a.n]));
const REDIRECTS: Redirects = Object.fromEntries(index.redirects as [string, string[]][]);
const RELEASE = `probe-${manifest.commit}`;
// эскиз: каталога историй нет (11), одна история для входа
const STORIES: Record<string, { t: string; p: string }> = { 's-noy': { t: 'Ной и потоп', p: 'noy' } };
const TOOL_NAME: Record<string, string> = { genealogiya: 'Генеалогия', vremya: 'Время' };
const ROW = 40;

const $ = (id: string) => document.getElementById(id)!;
const main = $('main');
const bar = $('bar');
const crumbs = $('crumbs');
const announcer = new Announcer($('status'));
const overlays = new OverlayStack();
let layer: 'простой' | 'для изучающих' = 'простой'; // уровень 5: не в адресе, «Назад» не меняет
let notice = '';

const name = (id?: string) => (id ? (NAME.get(id) ?? id) : '');
function nameOf(r: Route): string {
  if (r.screen === 'istoriya') return STORIES[r.id!]?.t ?? 'История';
  if (r.screen === 'glavnaya') return 'Главная';
  const tool = TOOL_NAME[r.screen] ?? r.screen;
  const p = r.params.p?.split(',')[0];
  return p ? `${name(p)} — ${tool}` : tool;
}

const port: HistoryPort = {
  get state() {
    return history.state;
  },
  push: (s: EntryState, url: string) => history.pushState(s, '', url),
  replace: (s: EntryState, url: string) => history.replaceState(s, '', url),
  go: (n: number) => history.go(n),
};
history.scrollRestoration = 'manual';
const router = new Router(port, sessionSnaps, {
  nameOf,
  snapshotNow: () => {
    const win = main.querySelector<HTMLElement>('.window');
    const a = document.activeElement as HTMLElement | null;
    return { focus: a && a !== document.body ? a.id || undefined : undefined, scroll: win?.scrollTop ?? 0, pageY: scrollY };
  },
});

// ——— отрисовка ———
function h(tag: string, attrs: Record<string, string | boolean> = {}, ...kids: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== false) el.setAttribute(k, v === true ? '' : v);
  el.append(...kids);
  return el;
}
const link = (href: string, text: string, id?: string, cls = 'btn') => h('a', { href, 'data-nav': true, class: cls, ...(id ? { id } : {}) }, text);
const button = (id: string, text: string, on: () => void, extra: Record<string, string | boolean> = {}) => {
  const b = h('button', { type: 'button', id, ...extra }, text);
  b.addEventListener('click', on);
  return b;
};
const with_ = (r: Route, patch: Record<string, string | undefined>): Route => {
  const params = { ...r.params };
  for (const [k, v] of Object.entries(patch)) if (v === undefined || v === '') delete params[k];
  else params[k] = v;
  delete params.v;
  return { ...r, params };
};

function renderBar(r: Route) {
  bar.replaceChildren();
  const back = router.backTarget();
  if (back) {
    const b = button('back', '', () => router.back());
    b.append(h('span', { 'aria-hidden': 'true' }, '← '), back.label);
    bar.append(b);
  }
  if (isTool(r.screen)) {
    const u = router.undoLabel;
    const rd = router.redoLabel;
    bar.append(
      button('undo', 'Отменить шаг', () => router.undo(), { 'aria-label': u ? `Отменить шаг: ${u}` : 'Отменить шаг', class: u ? '' : 'hidden-keep', ...(u ? {} : { 'aria-hidden': 'true', tabindex: '-1' }) }),
      button('redo', 'Вернуть шаг', () => router.redo(), { 'aria-label': rd ? `Вернуть шаг: ${rd}` : 'Вернуть шаг', class: rd ? '' : 'hidden-keep', ...(rd ? {} : { 'aria-hidden': 'true', tabindex: '-1' }) }),
    );
  }
  const help = button('help-open', 'Справка', () => {
    const d = $('help') as HTMLDialogElement;
    const close = () => d.close();
    overlays.open(close, help);
    d.addEventListener('close', () => overlays.closed(close), { once: true });
    d.showModal();
  });
  bar.append(help);
  bar.append(
    button('layer', `Слой: ${layer}`, () => {
      layer = layer === 'простой' ? 'для изучающих' : 'простой';
      ($('layer') as HTMLButtonElement).textContent = `Слой: ${layer}`;
      announcer.say(`Слой: ${layer}`);
    }),
  );
  const out = h('input', { id: 'link-out', readonly: true, 'aria-label': 'Ссылка на этот вид', size: '40' }) as HTMLInputElement;
  bar.append(
    button('link', 'Ссылка на этот вид', () => {
      out.value = location.origin + formatUrl({ ...router.route, params: { ...router.route.params, v: RELEASE } }, { version: true });
      out.hidden = false;
      out.select();
      announcer.say('Ссылка на этот вид готова');
    }),
    out,
  );
  out.hidden = true;
  // путь вверх — хлебные крошки (08 § 6.5: «Назад» и «вверх» различаются)
  const ol = h('ol');
  ol.append(h('li', {}, link('/', 'Главная', undefined, '')));
  if (r.screen !== 'glavnaya') ol.append(h('li', { 'aria-current': 'page' }, r.screen === 'istoriya' ? nameOf(r) : TOOL_NAME[r.screen] ?? r.screen));
  crumbs.replaceChildren(ol);
}

function marksWindow(r: Route, prefix: string): HTMLElement {
  const sel = r.params.sel;
  const win = h('div', { class: 'window', id: `${prefix}-window`, role: 'group', 'aria-label': prefix === 'g' ? 'Лица (окно рисунка)' : 'Полосы жизни (окно шкалы)' });
  const rows = h('div', { class: 'rows', style: `height:${PEOPLE.length * ROW}px` });
  win.append(rows);
  // в DOM — только метки в окне (как кнопки над рисунком П-Т1): метка вне окна не существует, пока к ней не прокрутят
  const draw = () => {
    const first = Math.max(0, Math.floor(win.scrollTop / ROW) - 2);
    const last = Math.min(PEOPLE.length - 1, Math.ceil((win.scrollTop + (win.clientHeight || 320)) / ROW) + 2);
    const keep = document.activeElement && rows.contains(document.activeElement) ? document.activeElement.id : null;
    rows.replaceChildren();
    for (let i = first; i <= last; i++) {
      const a = PEOPLE[i];
      const b = button(`${prefix}-m-${a.id}`, a.n + (a.d ? `, ${a.d}` : ''), () => select(a.id), { class: 'mark', 'aria-pressed': String(a.id === sel), style: `top:${i * ROW + 2}px` });
      rows.append(b);
    }
    if (keep) document.getElementById(keep)?.focus({ preventScroll: true });
  };
  win.addEventListener('scroll', draw, { passive: true });
  (win as HTMLElement & { draw: () => void }).draw = draw;
  return win;
}

function sheet(r: Route): HTMLElement | null {
  if (!r.params.sel || !r.params.list) return null;
  const other = r.screen === 'genealogiya' ? 'vremya' : 'genealogiya';
  return h(
    'aside',
    { class: 'sheet', 'aria-labelledby': 'sheet-h' },
    h('h2', { id: 'sheet-h' }, `Лист: ${name(r.params.sel)}`),
    h('p', {}, button('sheet-close', 'Закрыть лист', () => router.go(with_(router.route, { list: undefined })))),
    h('p', {}, link(`/${other}?p=${r.params.sel}`, `${other === 'vremya' ? 'Во Время' : 'В Генеалогию'}: ${name(r.params.sel)}`, 'sheet-go')),
  );
}

function renderTool(r: Route) {
  const p = r.params.p?.split(',') ?? [];
  const isG = r.screen === 'genealogiya';
  const tool = h('section', { class: 'tool', 'aria-labelledby': 'h1' });
  tool.append(h('h1', { id: 'h1', tabindex: '-1' }, `${TOOL_NAME[r.screen]}: ${p.map(name).join(', ') || '—'}`));
  const acts = h('p', {});
  if (r.params.sel && !r.params.list) acts.append(button('open-sheet', 'Открыть лист', () => router.go(with_(router.route, { list: '1' }))), ' ');
  if (isG) {
    const open = r.params.open ? r.params.open.split(',') : [];
    acts.append(
      button('expand', 'Раскрыть следующий союз', () => router.go(with_(router.route, { open: [...open, `u${open.length + 1}`].join(',') }), { label: `раскрыть союз ${open.length + 1}` })),
      ' ',
      button('collapse', 'Свернуть все', () => router.go(with_(router.route, { open: undefined }), { label: 'свернуть все' })),
      h('span', { class: 'note', id: 'view-state' }, ` раскрыто союзов: ${open.length}`),
    );
  } else {
    const next = PEOPLE.find((a) => !p.includes(a.id));
    const view = r.params.view ?? 'zhizni';
    acts.append(
      button('view', `Вид: ${view === 'zhizni' ? 'Жизни' : 'События'}`, () => router.go(with_(router.route, { view: view === 'zhizni' ? 'sobytiya' : 'zhizni' }), { label: 'сменить вид' })),
      ' ',
      button('later', 'Позже', () => router.go(with_(router.route, { c: String(+(router.route.params.c ?? -2000) + 50) }), { label: 'позже' })),
      ' ',
      next ? button('add', `Добавить лицо сравнения: ${next.n}`, () => router.go(with_(router.route, { p: [...p, next.id].join(',') }), { label: `добавить ${next.n}` })) : '',
      h('span', { class: 'note', id: 'view-state' }, ` вид: ${view}; центр: ${r.params.c ?? -2000}`),
    );
  }
  if (innerWidth >= 1280 && !r.params.ryadom) acts.append(' ', button('ryadom-open', `Открыть рядом: ${isG ? 'Время' : 'Генеалогия'}`, () => router.go(with_(router.route, { ryadom: isG ? 'vremya' : 'genealogiya', 'r.p': p[0] }))));
  tool.append(acts, marksWindow(r, isG ? 'g' : 'v'));
  const lay = h('div', { class: 'layout' }, tool);
  const s = sheet(r);
  if (s) lay.append(s);
  if (r.params.ryadom) {
    lay.append(
      h(
        'section',
        { class: 'neighbor', 'aria-labelledby': 'nb-h' },
        h('h2', { id: 'nb-h' }, `Рядом: ${TOOL_NAME[r.params.ryadom]} — ${name(r.params['r.p'])}`),
        button('ryadom-close', 'Закрыть соседа', () => router.go(with_(router.route, { ryadom: undefined, 'r.p': undefined }))),
      ),
    );
  }
  main.replaceChildren(lay);
}

function renderStory(r: Route) {
  const s = STORIES[r.id!];
  main.replaceChildren(
    h('h1', { id: 'h1', tabindex: '-1' }, s ? s.t : 'История'),
    h('p', { class: 'note' }, 'Эскиз: каталога историй ещё нет (11).'),
    h('p', {}, link(`/genealogiya?p=${s?.p ?? 'noy'}`, `Образ: ${s?.t} — открыть в Генеалогии (заглушка)`, 'obraz', 'btn figure')),
    h('p', {}, link(`/vremya?p=${s?.p ?? 'noy'}`, `Открыть во Времени: ${name(s?.p)}`, 'story-time')),
    h('p', { style: 'height: 900px' }, 'Текст истории (заглушка).'),
  );
}

function renderHome() {
  main.replaceChildren(
    h('h1', { id: 'h1', tabindex: '-1' }, 'Главная'),
    h('p', {}, link('/istoriya/s-noy', 'Ной и потоп', 'home-story')),
    h('p', {}, link('/genealogiya?p=noy', 'Генеалогия: Ной', 'home-gen')),
    h('p', {}, link('/vremya?p=noy', 'Время: Ной', 'home-time')),
  );
}

function render(r: Route, keepScroll?: number) {
  const prevWin = main.querySelector<HTMLElement>('.window');
  const scroll = keepScroll ?? prevWin?.scrollTop ?? 0;
  const active = (document.activeElement as HTMLElement | null)?.id;
  renderBar(r);
  if (isTool(r.screen)) renderTool(r);
  else if (r.screen === 'istoriya') renderStory(r);
  else renderHome();
  if (notice) main.prepend(h('p', { class: 'note', id: 'notice' }, notice));
  const win = main.querySelector<HTMLElement & { draw?: () => void }>('.window');
  if (win) {
    win.scrollTop = scroll;
    win.draw?.();
  }
  return active;
}

/** Фокус на метку, даже если она вне окна (её нет в DOM): прокрутить окно, нарисовать, перевести фокус. */
function focusMark(id: string): boolean {
  const win = main.querySelector<HTMLElement & { draw?: () => void }>('.window');
  const i = PEOPLE.findIndex((a) => a.id === id);
  if (!win || i < 0) return false;
  const prefix = win.id[0];
  const top = i * ROW;
  if (top < win.scrollTop || top + ROW > win.scrollTop + win.clientHeight) win.scrollTop = Math.max(0, top - win.clientHeight / 2 + ROW / 2);
  win.draw?.();
  const el = document.getElementById(`${prefix}-m-${id}`);
  el?.focus();
  return !!el;
}
const focusId = (id?: string) => {
  if (!id) return false;
  const m = /^[gv]-m-(.+)$/.exec(id);
  if (m) return focusMark(m[1]);
  const el = document.getElementById(id);
  el?.focus();
  return !!el;
};
const focusH1 = () => (document.getElementById('h1') as HTMLElement | null)?.focus();

function select(id: string) {
  const r = router.route;
  if (r.params.sel === id) return;
  router.go(with_(r, { sel: id }));
}

// ——— реакция на переходы ———
router.onChange(async (c: Change) => {
  (window as any).__probe.changes.push({ cause: c.cause, url: location.pathname + location.search, len: history.length });
  if (c.cause === 'start') {
    render(c.route);
    return;
  }
  if (c.cause === 'go' && c.level === 1) {
    notice = '';
    await withTransition(() => render(c.route, 0));
    focusH1();
    announcer.say(nameOf(c.route).replace(' — ', ', '));
  } else if (c.cause === 'go') {
    const active = render(c.route);
    if (c.level === 2 && c.route.params.sel !== c.from.params.sel && c.route.params.sel) {
      focusMark(c.route.params.sel);
      announcer.say(`Выбрано: ${name(c.route.params.sel)}`);
    } else if (c.level === 2 && c.route.params.list && !c.from.params.list) {
      ($('sheet-close') as HTMLElement | null)?.focus();
      announcer.say(`Лист открыт: ${name(c.route.params.sel)}`);
    } else if (c.level === 2 && !c.route.params.list && c.from.params.list) {
      if (c.route.params.sel) focusMark(c.route.params.sel);
      announcer.say('Лист закрыт');
    } else if (c.level === 2 && !c.route.params.sel && c.from.params.sel) {
      focusMark(c.from.params.sel);
      announcer.say('Выбор снят');
    } else focusId(active);
  } else if (c.cause === 'pop-same') {
    render(c.route);
    const was = c.from.params.sel;
    if (was && !c.route.params.sel) {
      focusMark(was);
      announcer.say('Выбор снят, лист закрыт');
    } else if (c.route.params.sel) {
      focusMark(c.route.params.sel);
      announcer.say(`Выбрано: ${name(c.route.params.sel)}`);
    }
  } else if (c.cause === 'pop-other') {
    await withTransition(() => render(c.route, (c.snapshot?.scroll as number) ?? 0));
    if (!focusId(c.snapshot?.focus)) focusH1();
    announcer.say(nameOf(c.route).replace(' — ', ', '));
  } else if (c.cause === 'undo' || c.cause === 'redo') {
    const active = render(c.route);
    // кнопка, которой больше нечего делать, скрыта (08 § 7.22): фокус не теряется — на соседнюю
    const want = active === 'undo' && !router.undoLabel ? 'redo' : active === 'redo' && !router.redoLabel ? 'undo' : active;
    focusId(want);
    announcer.say(`${c.cause === 'undo' ? 'Отменено' : 'Возвращено'}: ${c.label}`);
  }
});

addEventListener('popstate', (e) => router.popstate(e.state, location.href));
addEventListener('pagehide', () => router.pagehide());
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-nav]') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const r = parseUrl(a.getAttribute('href')!);
  if (!r) return;
  e.preventDefault();
  router.go(r);
});
// Esc: закрыть последнее открытое → лист → снять выбор; с экрана не уводит никогда (08 § 6.5)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (($('help') as HTMLDialogElement).open) return; // модальный dialog закрывается сам, фокус вернёт OverlayStack
  if (overlays.closeTop()) return;
  const r = router.route;
  if (r.params.list) router.go(with_(r, { list: undefined }));
  else if (r.params.sel) router.go(with_(r, { sel: undefined }));
});
$('help-close').addEventListener('click', () => ($('help') as HTMLDialogElement).close());

// ——— первый показ: переадресация номеров и номер выпуска в ссылке ———
(window as any).__probe = { router, announcer, changes: [] as unknown[], release: RELEASE };
const first = parseUrl(location.pathname + location.search + location.hash);
if (first) {
  const red = applyRedirects(first, REDIRECTS);
  const notes = [...red.notes];
  if (first.params.v && first.params.v !== RELEASE) notes.push(`Ссылка сделана на выпуске данных ${first.params.v}; сейчас — ${RELEASE}`);
  notice = notes.join('. ');
  if (red.notes.length || first.params.v) history.replaceState(history.state, '', formatUrl(red.route));
}
router.start(location.pathname + location.search + location.hash);
if (notice) announcer.say(notice);
