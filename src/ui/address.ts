/**
 * Адрес страницы ↔ вид атласа (ТЗ § 3.7, глубокие ссылки; D8; IX-43, 44; UX-30).
 *
 * В адресе — лицо, окно неба (год середины, ширина в годах, полоса середины), панель, пара «Родства» или «Разворота»,
 * масштаб времени, модель хронологии, «только линии Мессии» и ярусы эпох. Опубликованная версия получает извне только
 * «простой» якорь из букв, цифр и «. _ ~ -», поэтому поля разделены «~», у каждого — буква-ключ:
 *
 *   #/david~y-1010~w240~l2.5~h1.5~pepochs~s0~mmt-long~o1~e1~k1~ndavid.iessey.ovid
 *
 *   y — год середины окна (исторический: −1010 = 1010 г. до Р. Х.), w — ширина окна в годах, l — полоса середины,
 *   h — пропорция полос (J1: множитель к обычной высоте полосы; нет поля — пропорции по умолчанию),
 *   p — панель, a и b — первое и второе лицо пары, s — масштаб времени (0 истинный, 1 по насыщенности),
 *   m — модель хронологии, o1 — только линии Мессии, e1 — ярусы эпох,
 *   k1 — небо показывает только рабочий набор (решение 34; IX-67), n — сам набор, если в нём не больше 12 лиц:
 *   id через точку (длиннее — только режим; об этом — подсказка строки набора),
 *   t1 — главная область показывает древо карточек, а не небо (решение 73); окна неба (y, w, l) у древа нет.
 *
 * Прежние адреса «#/david» и «#/moisey?v=…» работают: лицо выбирается, небо летит к нему.
 * Сдвиг неба и режимы пишутся через replaceState с задержкой, лицо, панель и пара — через pushState,
 * поэтому «назад» сначала закрывает панель, затем возвращает прежнее лицо вместе с его окном — переходом за 280 мс,
 * и адрес при этом остаётся адресом записи (решение 46; IX-74).
 *
 * Набор из чужой ссылки — временный просмотр (решение 45; IX-69): свой набор читателя не меняется. Записи истории
 * атласа помечены (HistoryMark): их «n» — свой набор в тот момент, и «назад» не выдаёт его за чужую ссылку.
 */
import { batch, effect } from '@preact/signals';
import { byId, models, modelInfo } from '../data/atlas.ts';
import {
  selected, panel, first, second, lambda, modelId, onlyLines, epochMode, searchNotice, setPair, clearPair, PANELS, type Panel,
} from '../state.ts';
import { damerau } from '../engine/search.ts';
import { toAstro, toHist } from '../engine/years.ts';
import { KX_MAX, KX_MIN, LANES_MAX, LANES_MIN } from '../render/camera.ts';
import { skyRef, viewTick } from './common.tsx';
import { HISTORY_MS, holdLinesRows, reduced, setStartLanes } from './sky/view.ts';
import { EMPTY_LINK_NOTICE, WORK_URL_MAX, linkSet, linkSetFor, shownSet, skyMode, workNotice, workSet } from './work.ts';
import { selectFromHistory } from './stack.ts';
import { atlasView, restoreReveal, selectedUnion, selectUnion } from './reveal.ts';

export interface View {
  /** год середины окна, исторический */
  year: number;
  /** ширина окна, лет */
  width: number;
  /** полоса середины окна */
  lane: number;
}

export interface Address {
  route: 'atlas' | 'specimen';
  id: string | null;
  /** адрес называет лицо, которого в атласе нет */
  bad?: string;
  view?: View;
  panel?: Exclude<Panel, null>;
  first?: string;
  second?: string;
  scale?: 0 | 1;
  model?: string;
  only?: boolean;
  tiers?: boolean;
  /** пропорция полос (J1): множитель к обычной высоте полосы */
  lanes?: number;
  /** небо показывает только рабочий набор (решение 34) */
  work?: boolean;
  /** рабочий набор — если в нём не больше WORK_URL_MAX лиц */
  set?: string[];
  /** карточка союза в листе (решение 71): id союза, src/engine/unions.ts */
  union?: string;
  /** главная область — древо карточек, а не небо (решение 73) */
  tree?: boolean;
  /** в адресе есть поля вида: он описывает весь вид, а не только лицо */
  full: boolean;
}

const ID = /^[a-z0-9-]+$/;
const NUM = /^-?\d+(\.\d+)?$/;

/**
 * Союз в адресе (решение 71) — поле «u» из букв, цифр и точек: «u:avraam+agar» ↔ «avraam.agar», «u:sif+» ↔ «sif.»,
 * «u:iakov+~adoptive» ↔ «iakov..adoptive». Знаки «:», «+» и «~» самого id в простой якорь не входят.
 */
export const unionField = (uid: string): string | null => {
  const m = /^u:([a-z0-9-]*)\+([a-z0-9-]*)(?:~([a-z-]+))?$/.exec(uid);
  return m && (m[1] || m[2]) ? [m[1], m[2], ...(m[3] ? [m[3]] : [])].join('.') : null;
};
export const unionFromField = (v: string): string | null => {
  const m = /^([a-z0-9-]*)\.([a-z0-9-]*)(?:\.([a-z-]+))?$/.exec(v);
  return m && (m[1] || m[2]) ? `u:${m[1]}+${m[2]}${m[3] ? `~${m[3]}` : ''}` : null;
};

/** Разбор адреса; has — есть ли лицо с таким id. Неизвестные и испорченные поля пропускаются. */
export function parseAddress(hash: string, has: (id: string) => boolean): Address {
  let h = hash.replace(/^#\/?/, '');
  try {
    h = decodeURIComponent(h);
  } catch {
    /* испорченная escape-последовательность: читаем как есть */
  }
  // прежний формат: «#/moisey?v=…» — после «?» ничего не читается
  const path = h.split('?')[0];
  if (path === 'specimen') return { route: 'specimen', id: null, full: false };
  const [head, ...fields] = path.split('~');
  const a: Address = { route: 'atlas', id: null, full: fields.length > 0 };
  const id = head.trim().toLowerCase();
  if (id && ID.test(id) && has(id)) a.id = id;
  else if (id) a.bad = id;
  const v: Partial<View> = {};
  for (const f of fields) {
    const k = f[0];
    const val = f.slice(1);
    if (k === 'y' && NUM.test(val)) v.year = Math.round(Number(val));
    else if (k === 'w' && NUM.test(val) && Number(val) > 0) v.width = Number(val);
    else if (k === 'l' && NUM.test(val)) v.lane = Number(val);
    else if (k === 'p' && (PANELS as readonly string[]).includes(val)) a.panel = val as Exclude<Panel, null>;
    else if (k === 'a' && ID.test(val) && has(val)) a.first = val;
    else if (k === 'b' && ID.test(val) && has(val)) a.second = val;
    else if (k === 's' && (val === '0' || val === '1')) a.scale = val === '0' ? 0 : 1;
    else if (k === 'm' && /^[a-z0-9-]+$/.test(val)) a.model = val;
    else if (k === 'o') a.only = val === '1';
    else if (k === 'e') a.tiers = val === '1';
    else if (k === 'h' && NUM.test(val) && Number(val) > 0) a.lanes = Math.max(LANES_MIN, Math.min(LANES_MAX, Number(val)));
    else if (k === 'k') a.work = val === '1';
    else if (k === 't') a.tree = val === '1';
    else if (k === 'n') {
      const ids = [...new Set(val.split('.'))].filter((x) => ID.test(x) && has(x)).slice(0, WORK_URL_MAX);
      if (ids.length) a.set = ids;
    } else if (k === 'u') {
      const uid = unionFromField(val);
      if (uid) a.union = uid;
    }
  }
  if (v.year !== undefined && v.width !== undefined && v.lane !== undefined && v.year !== 0) a.view = v as View;
  return a;
}

/** Адрес из вида: только буквы, цифры и «. _ ~ -» после «#/» (ограничение опубликованной версии). */
export function formatAddress(a: Omit<Address, 'route' | 'full' | 'bad'>): string {
  const f: string[] = [];
  if (a.view) f.push(`y${Math.round(a.view.year)}`, `w${Math.max(1, Math.round(a.view.width))}`, `l${(Math.round(a.view.lane * 10) / 10).toFixed(1)}`);
  // пропорция полос — два знака после точки, без лишних нулей: 1.5, 0.67, 13
  if (a.lanes !== undefined && Math.abs(a.lanes - 1) >= 0.005) f.push(`h${String(Math.round(a.lanes * 100) / 100)}`);
  if (a.panel) f.push(`p${a.panel}`);
  if (a.first) f.push(`a${a.first}`);
  if (a.second) f.push(`b${a.second}`);
  if (a.scale !== undefined) f.push(`s${a.scale}`);
  if (a.model) f.push(`m${a.model}`);
  if (a.only) f.push('o1');
  if (a.tiers) f.push('e1');
  if (a.work) f.push('k1');
  if (a.work && a.set?.length && a.set.length <= WORK_URL_MAX) f.push(`n${a.set.join('.')}`);
  if (a.tree) f.push('t1');
  // карточка союза открыта в листе выбранного лица (решение 71)
  const u = a.id && a.union ? unionField(a.union) : null;
  if (u) f.push(`u${u}`);
  return `#/${a.id ?? ''}${f.map((x) => `~${x}`).join('')}`;
}

// ---------- окно неба ----------

/** Окно неба сейчас: год середины, ширина видимой части неба в годах, полоса середины (без рамки, ярусов, листа). */
export function currentView(): View | null {
  const s = skyRef.current;
  if (!s || !s.model || !(s.cam.w > 0)) return null;
  const c = s.cam;
  const { l, r } = c.vp;
  const [cx, cy] = c.vpCenter();
  if (!(r > l)) return null;
  return { year: toHist(s.tOf(c.wx(cx))), width: s.tOf(c.wx(r)) - s.tOf(c.wx(l)), lane: s.laneOf(c.wLane(cy)) };
}

/**
 * Камера для окна: масштаб подбирается так, чтобы на ширине видимой части уместилось width лет вокруг года середины
 * (при масштабе «по насыщенности» годы по сторонам середины неравны, поэтому — делением пополам).
 */
export function cameraFor(v: View): { x: number; lane: number; kx: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const c = s.cam;
  const half = (c.vp.r - c.vp.l) / 2;
  const xc = s.xOf(toAstro(v.year));
  const span = (kx: number) => s.tOf(xc + half / kx) - s.tOf(xc - half / kx);
  let lo = Math.log(KX_MIN * 0.25);
  let hi = Math.log(KX_MAX);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (span(Math.exp(mid)) > v.width) lo = mid;
    else hi = mid;
  }
  // в адресе — полоса раскладки; на сжатом небе (J4, J5) камера ходит по строкам
  return { x: xc, lane: s.rowOf(v.lane), kx: Math.exp((lo + hi) / 2) };
}

/**
 * Поставить окно: сразу (первый показ) или переходом за 280 мс без «отдалить — приблизить» («назад», «вперёд»; решение 46,
 * IX-74), при ослабленном движении — сразу; камера держит его в своих пределах.
 */
function applyView(v: View, animate: boolean) {
  const s = skyRef.current;
  const t = cameraFor(v);
  if (!s || !t) return;
  const c = s.cam;
  const [cx, cy] = c.vpCenter();
  const to = c.constrain({ x0: t.x - cx / t.kx, kx: t.kx, laneTop: t.lane + cy / c.kyFor(t.kx) });
  if (animate && !reduced()) c.zoomTo(to, HISTORY_MS, skyRef.redraw);
  else {
    c.stop();
    c.set(to);
  }
  skyRef.redraw();
}

// ---------- состояние ↔ адрес ----------

/** Лица с похожим адресом — для подсказки к неверному (IX-44). */
export function nearIds(bad: string, n = 5): string[] {
  const out: { id: string; d: number }[] = [];
  for (const id of byId.keys()) {
    const d = damerau(bad, id, 2);
    if (d <= 2) out.push({ id, d });
  }
  return out
    .sort((x, y) => x.d - y.d || (byId.get(x.id)!.magnitude - byId.get(y.id)!.magnitude))
    .slice(0, n)
    .map((x) => x.id);
}

/** Что пишется новой записью истории: лицо, панель, пара. Первое лицо пары — только если оно не выбранное. */
const pushKey = () => {
  const id = selected.value;
  const b = second.value;
  const a = first.value;
  // карточка союза — своя запись истории: «назад» возвращает карточку лица (решение 71)
  // небо и древо — разные записи: «назад» и «вперёд» переходят между ними (решение 73)
  return `${id ?? ''}|${panel.value ?? ''}|${b && a && a !== id ? a : ''}|${b ?? ''}|${selectedUnion.value ?? ''}|${atlasView.value}`;
};

/** Вид атласа сейчас — в полях адреса. */
function snapshot(): Omit<Address, 'route' | 'full' | 'bad'> {
  const id = selected.peek();
  const b = second.peek();
  const a = first.peek();
  return {
    id,
    // у древа нет окна неба (решение 73); небо, которое только что ушло с экрана, окна в адрес не пишет
    view: atlasView.peek() === 'tree' ? undefined : (currentView() ?? undefined),
    panel: panel.peek() ?? undefined,
    first: b && a && a !== id ? a : undefined,
    second: b ?? undefined,
    scale: lambda.peek() === 0 ? 0 : 1,
    model: modelId.peek(),
    only: onlyLines.peek(),
    tiers: epochMode.peek(),
    // своя пропорция читателя, а не временное сжатие строк вписыванием группы (IX-70)
    lanes: skyRef.current?.cam.ownLanes,
    work: skyMode.peek() === 'work',
    // набор, который показывает небо: из ссылки, пока его смотрят, — ссылка остаётся той же (IX-69)
    set: [...shownSet.peek().keys()],
    union: selectedUnion.peek() ?? undefined,
    tree: atlasView.peek() === 'tree',
  };
}

/**
 * Запись истории, сделанная атласом: её набор (n) — свой набор читателя в тот момент (link = false) или набор из ссылки,
 * который он смотрел (link = true). Адрес без такой отметки пришёл извне — открыт по ссылке или вставлен в строку адреса.
 */
export type HistoryMark = { toledot: 1; link: boolean };
export const markOf = (state: unknown): HistoryMark | null =>
  state && typeof state === 'object' && (state as { toledot?: unknown }).toledot === 1 ? { toledot: 1, link: !!(state as { link?: unknown }).link } : null;

/**
 * Набор и режим неба из адреса (решения 34 и 45; IX-69, UX-79). own — запись истории атласа со своим набором: её «n» —
 * прежний свой набор, он не показывается вместо нынешнего. Иначе «n» — набор из ссылки: временный просмотр, если он
 * не совпадает со своим; свой набор и память браузера не меняются. «k1» без «n» при пустом своём наборе — все лица
 * и строка-пояснение, а не пустая карта.
 */
export function applyWork(a: Pick<Address, 'work' | 'set'>, own: boolean) {
  const mine = workSet.peek();
  if (!a.work) {
    linkSet.value = null;
    skyMode.value = 'all';
    return;
  }
  const l = !own && a.set ? linkSetFor(a.set, mine) : null;
  linkSet.value = l;
  if (!l && !a.set && !mine.size) {
    skyMode.value = 'all';
    // строка — только для ссылки извне; своя запись истории просто показывает все лица
    if (!own) workNotice.value = EMPTY_LINK_NOTICE;
    return;
  }
  // ссылка на пустой набор своим уже не станет: пустой свой — все лица
  skyMode.value = l || mine.size ? 'work' : 'all';
}

/** Режимы, модель, панель, пара и лицо из адреса; окно ставится отдельно, когда небо готово. history — это «назад» или «вперёд». */
function applyState(a: Address, history = false, init = false) {
  const mark = markOf(typeof window !== 'undefined' ? window.history.state : null);
  batch(() => {
    if (a.scale !== undefined) lambda.value = a.scale;
    if (a.model && modelInfo.some((m) => m.id === a.model)) modelId.value = a.model;
    if (a.full) {
      onlyLines.value = !!a.only;
      epochMode.value = !!a.tiers;
      // адрес с полями вида описывает и главную область: «t1» — древо, без него — небо (решение 73)
      atlasView.value = a.tree ? 'tree' : 'sky';
      // рабочий набор — раньше режима: небо сразу показывает набор ссылки. Новый сеанс по адресу без «k1» после
      // раскрытия — небо «набор», как в прошлый раз (решение 68; src/ui/reveal.ts)
      if (!(init && !a.work && restoreReveal)) applyWork(a, !!mark && !mark.link);
    } else if (linkSet.peek()) {
      // ушли на адрес без набора («#/», «#/david»): набор из ссылки в адресе не остаётся (IX-69)
      linkSet.value = null;
    }
    // «назад» из панели закрывает её; в прежнем адресе без полей панель не трогается
    if (a.full || a.panel) panel.value = a.panel ?? null;
    // «назад» и «вперёд» по записям атласа переключают только активную карточку, состав стопки не меняется (решение 50;
    // UX-74). Новый адрес — набранный, закладка, ссылка извне (запись без отметки атласа) — открывает карточку как обычно
    if (a.id !== selected.peek()) {
      if (history && mark) selectFromHistory(a.id);
      else selected.value = a.id;
    }
    if (a.second && (a.first ?? a.id)) setPair((a.first ?? a.id)!, a.second, a.panel === 'kinship');
    else if (a.full && second.peek()) clearPair();
  });
  // карточка союза (решение 71) — после выбора лица: выбор лица закрывает её (src/ui/reveal.ts), поэтому не в том же batch
  selectUnion(a.id && a.union ? a.union : null);
  searchNotice.value = a.bad ? { text: `Лица с адресом «${a.bad}» в атласе нет. Найдите его по имени.`, ids: nearIds(a.bad) } : null;
}

// Прочитать адрес до первого показа: модель, масштаб, панель и лицо сразу в нужном виде, без перестройки неба.
const initial = typeof location !== 'undefined' ? parseAddress(location.hash, (id) => byId.has(id)) : null;
if (initial && initial.route === 'atlas') applyState(initial, false, true);
// пропорция полос адреса — небу до первой раскладки (SkyView); адрес с полями вида без «h» — пропорции по умолчанию
if (initial && initial.route === 'atlas' && (initial.lanes !== undefined || initial.full)) setStartLanes(initial.lanes ?? 1);

/** Небо готово принять окно: модель и масштаб адреса уже в нём, размер холста устоялся. */
function whenSkyReady(then: () => void, tries = 0) {
  const s = skyRef.current;
  const ready = s && s.model && s.model.id === modelId.peek() && models.some((m) => m.id === modelId.peek()) && s.lambda === lambda.peek();
  if (ready || tries > 180) {
    // ещё два кадра: сетка раскладки (панель, карточка) меняет ширину холста
    requestAnimationFrame(() => requestAnimationFrame(then));
    return;
  }
  requestAnimationFrame(() => whenSkyReady(then, tries + 1));
}

/** Подключить адрес: прочитать его сейчас и при «назад»/«вперёд», записывать при смене вида. Возвращает отписку. */
export function bindAddress(): () => void {
  let lastPush = '';
  let applying = false;
  let replaceTimer = 0;
  let alive = true;
  /** запись истории применяется («назад», «вперёд», первый показ): адрес не пишется, пока небо не встанет (IX-74) */
  let quiet = false;
  let settleRaf = 0;

  const mark = (): HistoryMark => ({ toledot: 1, link: !!linkSet.peek() });
  const write = (mode: 'push' | 'replace') => {
    if (location.hash.startsWith('#/specimen')) return;
    const next = formatAddress(snapshot());
    lastPush = pushKey();
    const m = mark();
    const cur = markOf(history.state);
    if (location.hash === next && cur && cur.link === m.link) return;
    if (mode === 'push') history.pushState(m, '', next);
    else history.replaceState(m, '', next);
  };

  /** Ждать, пока камера не встанет (переход записи, перелёт к лицу), и ещё кадр — затем then. */
  const whenStill = (then: () => void) => {
    cancelAnimationFrame(settleRaf);
    const tick = (n: number) => {
      if (!alive) return;
      if (skyRef.current?.cam.moving && n < 600) settleRaf = requestAnimationFrame(() => tick(n + 1));
      else settleRaf = requestAnimationFrame(then);
    };
    settleRaf = requestAnimationFrame(() => tick(0));
  };

  const apply = (initialLoad: boolean) => {
    const a = parseAddress(location.hash, (id) => byId.has(id));
    // переход на образец: выбор не сбрасывать, main.tsx сменит маршрут
    if (a.route === 'specimen') return;
    // запись, отложенная до «назад», относилась к прежней записи: в новую она не пишется (IX-74)
    clearTimeout(replaceTimer);
    quiet = true;
    applying = true;
    if (!initialLoad) applyState(a, true);
    lastPush = pushKey();
    applying = false;
    // неверный адрес: открыт поиск с сообщением и похожими лицами (IX-44)
    if (a.bad) setTimeout(() => document.getElementById('find')?.focus(), 100);
    // древо (решение 73): неба нет — ждать нечего, адрес пишется сразу; окно неба древу не нужно
    const settle = (then: () => void) => (atlasView.peek() === 'tree' ? requestAnimationFrame(then) : whenSkyReady(then));
    settle(() => {
      if (!alive) return;
      if (atlasView.peek() === 'tree') {
        quiet = false;
        if (initialLoad || !a.view) write('replace');
        return;
      }
      // пропорция полос (J1) — до окна: высота полосы решает, где середина окна по вертикали
      if (a.lanes !== undefined || a.full) skyRef.current?.cam.setLanes(a.lanes ?? 1);
      // в режиме «только линии» строки временно по высоте коридора (MAP-70): своя пропорция — в адресе и памяти
      holdLinesRows();
      // окно записи — сразу при первом показе, переходом за 280 мс при «назад» и «вперёд»; адрес называет лицо, но не
      // окно (прежний «#/david»): небо летит к лицу
      if (a.view) applyView(a.view, !initialLoad);
      else if (a.id) skyRef.flyTo(a.id);
      // адрес пишется, когда небо встало: окно самой записи, а не кадр перехода. Запись истории с окном остаётся какой
      // была; первый показ и адрес без окна дополняются окном
      whenStill(() => {
        quiet = false;
        if (initialLoad || !a.view) write('replace');
      });
    });
  };
  apply(true);
  const onPop = () => apply(false);
  window.addEventListener('popstate', onPop);

  // лицо, панель, пара — новая запись истории
  const offPush = effect(() => {
    const key = pushKey();
    if (applying || key === lastPush) return;
    clearTimeout(replaceTimer);
    // читатель перешёл дальше, не дождавшись конца перехода: новая запись пишет своё окно как обычно
    quiet = false;
    cancelAnimationFrame(settleRaf);
    write('push');
  });
  // окно и режимы — та же запись, с задержкой 300 мс. Кадры неба идут и без движения камеры (ток света по ленте под
  // указателем, отклик звезды): таймер переставляется, только когда вид правда изменился, иначе запись не наступала бы
  let viewKey = '';
  let setSeen = shownSet.peek();
  const offReplace = effect(() => {
    void viewTick.value;
    const c = skyRef.current?.cam;
    const key = [c?.x0, c?.kx, c?.laneTop, c?.ownLanes, c?.w, lambda.value, modelId.value, onlyLines.value, epochMode.value, skyMode.value].join(' ');
    const set = shownSet.value;
    if (key === viewKey && set === setSeen) return;
    viewKey = key;
    setSeen = set;
    // запись истории ещё применяется: кадры перехода в адрес не идут
    if (quiet) return;
    clearTimeout(replaceTimer);
    replaceTimer = window.setTimeout(() => write('replace'), 300);
  });
  return () => {
    alive = false;
    clearTimeout(replaceTimer);
    cancelAnimationFrame(settleRaf);
    window.removeEventListener('popstate', onPop);
    offPush();
    offReplace();
  };
}
