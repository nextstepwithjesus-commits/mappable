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
 *   id через точку (длиннее — только режим, строка набора говорит об этом).
 *
 * Прежние адреса «#/david» и «#/moisey?v=…» работают: лицо выбирается, небо летит к нему.
 * Сдвиг неба и режимы пишутся через replaceState с задержкой, лицо, панель и пара — через pushState,
 * поэтому «назад» сначала закрывает панель, затем возвращает прежнее лицо вместе с его окном.
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
import { reduced, setStartLanes } from './sky/view.ts';
import { WORK_URL_MAX, skyMode, workSet, type WorkEntry } from './work.ts';

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
  /** в адресе есть поля вида: он описывает весь вид, а не только лицо */
  full: boolean;
}

const ID = /^[a-z0-9-]+$/;
const NUM = /^-?\d+(\.\d+)?$/;

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
    else if (k === 'n') {
      const ids = [...new Set(val.split('.'))].filter((x) => ID.test(x) && has(x)).slice(0, WORK_URL_MAX);
      if (ids.length) a.set = ids;
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

/** Поставить окно: сразу (первый показ) или перелётом («назад», «вперёд»); камера держит его в своих пределах. */
function applyView(v: View, fly: boolean) {
  const s = skyRef.current;
  const t = cameraFor(v);
  if (!s || !t) return;
  s.cam.flyTo(t.x, t.lane, (s.cam.vp.r - s.cam.vp.l) / t.kx, skyRef.redraw, !fly || reduced());
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
  return `${id ?? ''}|${panel.value ?? ''}|${b && a && a !== id ? a : ''}|${b ?? ''}`;
};

/** Вид атласа сейчас — в полях адреса. */
function snapshot(): Omit<Address, 'route' | 'full' | 'bad'> {
  const id = selected.peek();
  const b = second.peek();
  const a = first.peek();
  return {
    id,
    view: currentView() ?? undefined,
    panel: panel.peek() ?? undefined,
    first: b && a && a !== id ? a : undefined,
    second: b ?? undefined,
    scale: lambda.peek() === 0 ? 0 : 1,
    model: modelId.peek(),
    only: onlyLines.peek(),
    tiers: epochMode.peek(),
    lanes: skyRef.current?.cam.lanes,
    work: skyMode.peek() === 'work',
    set: [...workSet.peek().keys()],
  };
}

/**
 * Набор из адреса (решение 34): если он не тот, что в памяти браузера, — становится набором; лица, которые были в наборе
 * и остались, сохраняют свою помету (откуда взяты).
 */
function applySet(ids: string[]) {
  const cur = workSet.peek();
  if (ids.length === cur.size && ids.every((id) => cur.has(id))) return;
  const next = new Map<string, WorkEntry>();
  for (const id of ids) next.set(id, cur.get(id) ?? { via: 'self', of: id });
  workSet.value = next;
}

/** Режимы, модель, панель, пара и лицо из адреса; окно ставится отдельно, когда небо готово. */
function applyState(a: Address) {
  batch(() => {
    if (a.scale !== undefined) lambda.value = a.scale;
    if (a.model && modelInfo.some((m) => m.id === a.model)) modelId.value = a.model;
    if (a.full) {
      onlyLines.value = !!a.only;
      epochMode.value = !!a.tiers;
      // рабочий набор — раньше режима: небо сразу показывает набор ссылки
      if (a.work && a.set) applySet(a.set);
      skyMode.value = a.work ? 'work' : 'all';
    }
    // «назад» из панели закрывает её; в прежнем адресе без полей панель не трогается
    if (a.full || a.panel) panel.value = a.panel ?? null;
    if (a.id !== selected.peek()) selected.value = a.id;
    if (a.second && (a.first ?? a.id)) setPair((a.first ?? a.id)!, a.second, a.panel === 'kinship');
    else if (a.full && second.peek()) clearPair();
  });
  searchNotice.value = a.bad ? { text: `Лица с адресом «${a.bad}» в атласе нет. Найдите его по имени.`, ids: nearIds(a.bad) } : null;
}

// Прочитать адрес до первого показа: модель, масштаб, панель и лицо сразу в нужном виде, без перестройки неба.
const initial = typeof location !== 'undefined' ? parseAddress(location.hash, (id) => byId.has(id)) : null;
if (initial && initial.route === 'atlas') applyState(initial);
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

  const write = (mode: 'push' | 'replace') => {
    if (location.hash.startsWith('#/specimen')) return;
    const next = formatAddress(snapshot());
    lastPush = pushKey();
    if (location.hash === next) return;
    if (mode === 'push') history.pushState(null, '', next);
    else history.replaceState(history.state, '', next);
  };

  const apply = (initialLoad: boolean) => {
    const a = parseAddress(location.hash, (id) => byId.has(id));
    // переход на образец: выбор не сбрасывать, main.tsx сменит маршрут
    if (a.route === 'specimen') return;
    applying = true;
    if (!initialLoad) applyState(a);
    lastPush = pushKey();
    applying = false;
    // неверный адрес: открыт поиск с сообщением и похожими лицами (IX-44)
    if (a.bad) setTimeout(() => document.getElementById('find')?.focus(), 100);
    whenSkyReady(() => {
      if (!alive) return;
      // пропорция полос (J1) — до окна: высота полосы решает, где середина окна по вертикали
      if (a.lanes !== undefined || a.full) skyRef.current?.cam.setLanes(a.lanes ?? 1);
      // адрес называет лицо, но не окно (прежний «#/david»): небо летит к лицу
      if (a.view) applyView(a.view, !initialLoad);
      else if (a.id) skyRef.flyTo(a.id);
      // адрес дополняется окном
      write('replace');
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
    write('push');
  });
  // окно и режимы — та же запись, с задержкой 300 мс. Кадры неба идут и без движения камеры (ток света по ленте под
  // указателем, отклик звезды): таймер переставляется, только когда вид правда изменился, иначе запись не наступала бы
  let viewKey = '';
  let setSeen = workSet.peek();
  const offReplace = effect(() => {
    void viewTick.value;
    const c = skyRef.current?.cam;
    const key = [c?.x0, c?.kx, c?.laneTop, c?.lanes, c?.w, lambda.value, modelId.value, onlyLines.value, epochMode.value, skyMode.value].join(' ');
    const set = workSet.value;
    if (key === viewKey && set === setSeen) return;
    viewKey = key;
    setSeen = set;
    clearTimeout(replaceTimer);
    replaceTimer = window.setTimeout(() => write('replace'), 300);
  });
  return () => {
    alive = false;
    clearTimeout(replaceTimer);
    window.removeEventListener('popstate', onPop);
    offPush();
    offReplace();
  };
}
