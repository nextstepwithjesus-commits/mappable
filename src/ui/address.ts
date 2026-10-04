/**
 * Адрес страницы ↔ вид атласа (ТЗ § 3.7, глубокие ссылки; D8; IX-43, 44; UX-30).
 *
 * В адресе — лицо, окно неба (год середины, ширина в годах, полоса середины), панель, пара «Родства» или «Разворота»,
 * масштаб времени, модель хронологии, показ неба, выбранная связь и ярусы эпох. Опубликованная версия получает извне
 * только «простой» якорь из букв, цифр и «. _ ~ -», поэтому поля разделены «~», у каждого — буква-ключ:
 *
 *   #/david~y-1010~w240~l2.5~h1.5~pepochs~s0~mmt-long~e1~vs~ndavid.iessey.ovid~ck.iessey._._.david
 *
 *   y — год середины окна (исторический: −1010 = 1010 г. до Р. Х.), w — ширина окна в годах, l — полоса середины
 *   (в семейной укладке — её виртуальная полоса), h — пропорция полос (J1: множитель к обычной высоте полосы; нет поля —
 *   пропорции по умолчанию), p — панель, a и b — первое и второе лицо пары, s — масштаб времени (0 истинный, 1 по
 *   насыщенности), m — модель хронологии, e1 — ярусы эпох,
 *   v — показ неба (этап 11, решение 81; src/ui/work.ts, showKey): «vl» — линии Мессии, «vk» — ключевые лица, «vs» —
 *   набор, «vg.nahorites» — созвездия, «vr.iuda.d.0.f» — род лица; всё небо — без поля; x — связи наружу у созвездий
 *   (0 — без связей, 2 — с роднёй; обрывками — без поля); n — набор показа «набор», если в нём не больше 12 лиц: id через
 *   точку; c — выбранная связь (src/engine/linkkey.ts); g — временные гости выбранной связи или лица (решение 93, К3;
 *   src/ui/show.ts, showGuest): id через точку, пишется сразу за «c»; u — карточка союза в листе; j1 — Лк 3 понят как
 *   второе родословие Иосифа (решение 130; src/state.ts, lineFlip; без поля — родословие Марии); r — шаг рассказа с единицы
 *   (этап 16, решение 187; src/ui/story/story.ts), z — созвездие в фокусе (решение 185; src/ui/story/areas.ts), f — врезка
 *   «Семья созвездием» лица (решение 186; src/ui/sky/inset.ts).
 *
 * Прежние адреса работают: «#/david» и «#/moisey?v=…» выбирают лицо, небо летит к нему; «~o1» открывает линии Мессии,
 * «~k1» и «~t1» — набор (древа больше нет, решение 77).
 * Сдвиг неба, раскрытие и свёртка пишутся через replaceState с задержкой; лицо, панель, пара, показ и выбранная связь —
 * через pushState, поэтому «назад» сначала закрывает панель, затем возвращает прежнее лицо, показ и связь вместе
 * с окном — переходом за BACK_MS (200 мс; Я28 — не дольше 300 мс), и адрес при этом остаётся адресом записи (решение 46;
 * IX-74).
 *
 * Набор из чужой ссылки — временный просмотр (решение 45; IX-69): свой набор читателя не меняется. Записи истории
 * атласа помечены (HistoryMark): их «n» — свой набор в тот момент, и «назад» не выдаёт его за чужую ссылку.
 */
import { batch, effect, signal } from '@preact/signals';
import { byId, graph, groupById, lineMembership, models, modelInfo } from '../data/atlas.ts';
import { linkKeyString, parseLinkKey, spanInner, type LinkKey } from '../engine/linkkey.ts';
import {
  selected, panel, first, second, lambda, modelId, epochMode, lineFlip, searchNotice, setPair, clearPair, PANELS, type Panel,
} from '../state.ts';
import { damerau } from '../engine/search.ts';
import { toAstro, toHist } from '../engine/years.ts';
import { KX_MAX, KX_MIN, LANES_MAX, LANES_MIN } from '../render/camera.ts';
import { skyRef, viewTick } from './common.tsx';
import { HISTORY_MS, holdLinesRows, inView, keepInView, linesSettling, reduced, setStartLanes, takeJump, windowHold, windowJump } from './sky/view.ts';
import {
  EMPTY_LINK_NOTICE, WORK_URL_MAX, linkSet, linkSetFor, parseShow, setShowState, show, showHistory, showKey, showLinksField, shownSet, workNotice,
  workSet, type Show,
} from './work.ts';
import { selectFromHistory } from './stack.ts';
import { restoreReveal, selectedUnion, selectUnion, unionById } from './reveal.ts';
import { selectedLink } from './linkstate.ts';
import { linkGuests, setGuestsFromAddress, windowHooks } from './show.ts';
import { storyStep, groupFocus } from './story/state.ts';
import { storyFromAddress } from './story/story.ts';
import { groupFocusFromAddress } from './story/areas.ts';
import { familyInset } from './sky/inset.ts';

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
  tiers?: boolean;
  /** пропорция полос (J1): множитель к обычной высоте полосы */
  lanes?: number;
  /** показ неба (этап 11; поле «v» с «x», прежние «o1», «k1», «t1»); нет — адрес показа не называет */
  show?: Show;
  /** набор показа «набор» — если в нём не больше WORK_URL_MAX лиц */
  set?: string[];
  /** карточка союза в листе (решение 71): id союза, src/engine/unions.ts */
  union?: string;
  /** выбранная связь (этап 11, решение 83; поле «c») */
  link?: LinkKey;
  /** временные гости (решение 93, К3; поле «g»): лица вне показа, показанные до снятия выбора */
  guests?: string[];
  /** Лк 3 — второе родословие Иосифа (решение 130; поле «j1»); нет — родословие Марии */
  luke?: boolean;
  /** шаг рассказа (этап 16, решение 187; поле «r» — номер шага с единицы), здесь — с нуля */
  story?: number;
  /** созвездие в фокусе (решение 185; поле «z») */
  area?: string;
  /** врезка «Семья созвездием» (решение 186; поле «f»): чья семья */
  inset?: string;
  /** прежние поля до этапа 11 — только разбор: «o1» (только линии Мессии), «k1» (набор), «t1» (древо) */
  only?: boolean;
  work?: boolean;
  tree?: boolean;
  /** в адресе есть поля вида: он описывает весь вид, а не только лицо */
  full: boolean;
}

const ID = /^[a-z0-9-]+$/;
/** Временных гостей в адресе — не больше стольких. */
const GUESTS_MAX = 8;
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
  let showField: string | null = null;
  let linksField: string | null = null;
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
    else if (k === 'v') showField = val;
    else if (k === 'x') linksField = val;
    else if (k === 'n') {
      const ids = [...new Set(val.split('.'))].filter((x) => ID.test(x) && has(x)).slice(0, WORK_URL_MAX);
      if (ids.length) a.set = ids;
    } else if (k === 'u') {
      const uid = unionFromField(val);
      if (uid) a.union = uid;
    } else if (k === 'c') {
      const key = parseLinkKey(val);
      if (key && linkExists(key, has)) a.link = key;
    } else if (k === 'j') a.luke = val === '1';
    else if (k === 'r' && /^\d{1,2}$/.test(val) && Number(val) >= 1) a.story = Number(val) - 1;
    else if (k === 'z' && ID.test(val) && groupById.has(val)) a.area = val;
    else if (k === 'f' && ID.test(val) && has(val)) a.inset = val;
    else if (k === 'g') {
      const ids = [...new Set(val.split('.'))].filter((x) => ID.test(x) && has(x)).slice(0, GUESTS_MAX);
      if (ids.length) a.guests = ids;
    }
  }
  if (v.year !== undefined && v.width !== undefined && v.lane !== undefined && v.year !== 0) a.view = v as View;
  // показ: поле «v»; прежние адреса — «o1» (только линии Мессии), «k1» и «t1» (набор; древа больше нет)
  const sh = showField !== null ? parseShow(showField, linksField) : null;
  if (sh && (sh.kind !== 'lineage' || has(sh.id))) a.show = sh;
  else if (a.only) a.show = { kind: 'lines' };
  else if (a.work || a.tree) a.show = { kind: 'set' };
  return a;
}

/**
 * Есть ли связь в данных: союз и его ребёнок или супруг, шаг линии Мессии, цепочка ленты, родство словами Писания. has — есть ли лицо
 * (адрес разбирается и без данных атласа в тестах, но союзы и линии берутся из атласа).
 */
export function linkExists(k: LinkKey, has: (id: string) => boolean = (id) => byId.has(id)): boolean {
  switch (k.kind) {
    case 'child':
      return has(k.child) && !!unionById(k.union)?.kids.includes(k.child);
    case 'spouse': {
      const u = unionById(k.union);
      return has(k.person) && !!u && (u.a === k.person || u.b === k.person);
    }
    case 'union':
      return !!unionById(k.union);
    case 'step':
      return has(k.child) && lineMembership[k.line].has(k.child);
    case 'kin':
      return has(k.a) && has(k.b) && (graph.kinOf.get(k.a) ?? []).some((e) => (e.from === k.a && e.to === k.b) || (e.from === k.b && e.to === k.a));
    case 'span':
      // цепочка ленты (решение 93, К4): оба конца — лица линии, старший раньше младшего
      return has(k.from) && has(k.to) && spanInner([...lineMembership[k.line].keys()], k) !== null;
  }
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
  if (a.tiers) f.push('e1');
  // понимание Лк 3 (решение 130): вместе с моделью — годы и ленты читаются по нему
  if (a.luke) f.push('j1');
  // показ (этап 11): всё небо — без поля; прежние флажки «только линии» и «набор» пишутся показом
  const sh: Show | undefined = a.show ?? (a.only ? { kind: 'lines' } : a.work || a.tree ? { kind: 'set' } : undefined);
  if (sh && sh.kind !== 'all') {
    f.push(`v${showKey(sh)}`);
    const x = showLinksField(sh);
    if (x) f.push(`x${x}`);
  }
  if (sh?.kind === 'set' && a.set?.length && a.set.length <= WORK_URL_MAX) f.push(`n${a.set.join('.')}`);
  // карточка союза открыта в листе выбранного лица (решение 71)
  const u = a.id && a.union ? unionField(a.union) : null;
  if (u) f.push(`u${u}`);
  // выбранная связь (решение 83)
  const c = a.link ? linkKeyString(a.link) : null;
  if (c) f.push(`c${c}`);
  // временные гости (решение 93, К3) — за связью
  if (a.guests?.length) f.push(`g${a.guests.slice(0, GUESTS_MAX).join('.')}`);
  // рассказ, фокус созвездия, врезка семьи (этап 16, решения 185–187)
  if (a.story !== undefined && a.story >= 0) f.push(`r${a.story + 1}`);
  if (a.area) f.push(`z${a.area}`);
  if (a.inset) f.push(`f${a.inset}`);
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
 * Переход окна при «назад» и «вперёд», мс. Я28 (этап 11): прежний показ и окно возвращаются за ≤ 300 мс вместе с кадром
 * смены плана (смена показа — до 50 мс на построение неба) и кадром отклика, поэтому сам переход короче общего
 * HISTORY_MS (src/ui/sky/view.ts) — без «отдалить — приблизить», как по решению 46 (IX-74).
 */
export const BACK_MS = Math.min(HISTORY_MS, 200);

/**
 * Поставить окно: сразу (первый показ) или переходом за BACK_MS без «отдалить — приблизить» («назад», «вперёд»;
 * решение 46, IX-74), при ослабленном движении — сразу; камера держит его в своих пределах.
 */
function applyView(v: View, animate: boolean) {
  const s = skyRef.current;
  const t = cameraFor(v);
  if (!s || !t) return;
  const c = s.cam;
  const [cx, cy] = c.vpCenter();
  const to = c.constrain({ x0: t.x - cx / t.kx, kx: t.kx, laneTop: t.lane + cy / c.kyFor(t.kx) });
  if (animate && !reduced()) c.zoomTo(to, BACK_MS, skyRef.redraw);
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

/**
 * Что пишется новой записью истории: лицо, панель, пара, карточка союза, показ и выбранная связь. Первое лицо пары —
 * только если оно не выбранное. Состав набора в ключ не входит: раскрытие и свёртка пишутся в ту же запись.
 */
const pushKey = () => {
  const id = selected.value;
  const b = second.value;
  const a = first.value;
  const sh = show.value;
  const c = selectedLink.value;
  // карточка союза — своя запись истории: «назад» возвращает карточку лица (решение 71); показ и связь — тоже (этап 11)
  // шаг рассказа, фокус созвездия и врезка семьи (этап 16) — тоже: каждый шаг рассказа — своя запись (решение 187)
  return `${id ?? ''}|${panel.value ?? ''}|${b && a && a !== id ? a : ''}|${b ?? ''}|${selectedUnion.value ?? ''}|${showKey(sh)}${showLinksField(sh) ?? ''}|${c ? linkKeyString(c) : ''}|${linkGuests.value.join('.')}|${lineFlip.value ? 'j' : ''}|${storyStep.value ?? ''}|${groupFocus.value ?? ''}|${familyInset.value?.id ?? ''}`;
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
    tiers: epochMode.peek(),
    luke: lineFlip.peek() || undefined,
    // своя пропорция читателя, а не временное сжатие строк вписыванием группы (IX-70)
    lanes: skyRef.current?.cam.ownLanes,
    show: show.peek(),
    // набор, который показывает небо: из ссылки, пока его смотрят, — ссылка остаётся той же (IX-69)
    set: [...shownSet.peek().keys()],
    union: selectedUnion.peek() ?? undefined,
    link: selectedLink.peek() ?? undefined,
    guests: linkGuests.peek().length ? [...linkGuests.peek()] : undefined,
    story: storyStep.peek() ?? undefined,
    area: groupFocus.peek() ?? undefined,
    inset: familyInset.peek()?.id,
  };
}

/**
 * Запись истории, сделанная атласом: её набор (n) — свой набор читателя в тот момент (link = false) или набор из ссылки,
 * который он смотрел (link = true). Адрес без такой отметки пришёл извне — открыт по ссылке или вставлен в строку адреса.
 * Сверх адреса запись хранит (этап 14, контракт 3): seq — номер записи в сеансе, path — путь исследования (решение 148),
 * sheet — положение нижнего листа на телефоне (решение 150; пишет src/ui/sheet.ts через historyFields).
 */
export type HistoryMark = { toledot: 1; link: boolean; seq?: number; path?: string[]; sheet?: string };
export const markOf = (state: unknown): HistoryMark | null => {
  if (!state || typeof state !== 'object' || (state as { toledot?: unknown }).toledot !== 1) return null;
  const s = state as { link?: unknown; seq?: unknown; path?: unknown; sheet?: unknown };
  const m: HistoryMark = { toledot: 1, link: !!s.link };
  if (typeof s.seq === 'number') m.seq = s.seq;
  if (Array.isArray(s.path)) m.path = s.path.filter((x): x is string => typeof x === 'string' && byId.has(x)).slice(-PATH_MAX);
  if (typeof s.sheet === 'string') m.sheet = s.sheet;
  return m;
};

// ---------- поля записи сверх адреса (этап 14, контракт 3) ----------

/** Те же поля записи: путь и положение листа (номер записи сравнивается отдельно). */
const sameFields = (a: HistoryMark, b: HistoryMark) => (a.path ?? []).join(' ') === (b.path ?? []).join(' ') && (a.sheet ?? '') === (b.sheet ?? '');

/** Поля записи истории, которые пишет не адрес, а их владелец: положение нижнего листа (решение 150). */
export interface HistoryFields {
  sheet?: string;
}
let fieldsOf: () => HistoryFields = () => ({});
/**
 * Подключить поставщика полей записи (src/ui/sheet.ts: положение листа): они пишутся в каждую запись истории — новую
 * (pushState) и ту же (replaceState).
 */
export function historyFields(fn: () => HistoryFields) {
  fieldsOf = fn;
}
/**
 * Запись истории, которая сейчас применяется («назад», «вперёд»): её поля. Ставится до смены лица и показа записи (в том
 * же кадре), снимается, когда небо встало, или новой записью. null — запись не применяется: смена лица — новый выбор.
 */
export const historyApplying = signal<HistoryFields | null>(null);
/** Дописать нынешние поля (положение листа) в текущую запись истории, без новой записи и без смены адреса. */
export function patchHistory() {
  if (typeof window === 'undefined' || !patcher) return;
  patcher();
}
let patcher: (() => void) | null = null;

/**
 * История исследования (решения 148, 168; в строке показа — «История: Руфь › Давид»): лица последних выборов по
 * порядку, не больше PATH_MAX; последнее — выбранное. Новый выбор дописывается в конец; выбор лица, уже стоящего в
 * истории, обрезает её до него; выбор из поиска начинает новую. Снятие выбора её не стирает. «Назад» и «вперёд»
 * возвращают историю своей записи.
 */
export const PATH_MAX = 5;
export const explorePath = signal<readonly string[]>([]);
/**
 * Выбор сделан из поиска (решение 168): событие, во время которого выбрано лицо, пришло из поля «Найти» или его списка.
 */
export function fromSearch(): boolean {
  const e = typeof window !== 'undefined' ? window.event : undefined;
  const t = e?.target;
  return typeof Element !== 'undefined' && t instanceof Element && !!t.closest('#find, [id^="find-"], header.top .search');
}
/** История после выбора id: дописать или обрезать до него. */
export function pathAfter(path: readonly string[], id: string | null): readonly string[] {
  if (!id) return path;
  const i = path.indexOf(id);
  if (i >= 0) return i === path.length - 1 ? path : path.slice(0, i + 1);
  return [...path, id].slice(-PATH_MAX);
}

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
    setShowState({ kind: 'all' });
    return;
  }
  const l = !own && a.set ? linkSetFor(a.set, mine) : null;
  linkSet.value = l;
  if (!l && !a.set && !mine.size) {
    setShowState({ kind: 'all' });
    // строка — только для ссылки извне; своя запись истории просто показывает все лица
    if (!own) workNotice.value = EMPTY_LINK_NOTICE;
    return;
  }
  // ссылка на пустой набор своим уже не станет: пустой свой — все лица
  setShowState(l || mine.size ? { kind: 'set' } : { kind: 'all' });
}

/**
 * Показ из адреса (этап 11): набор — через applyWork (набор ссылки, пустой свой набор); остальные показы — как есть,
 * набор ссылки при этом уходит (IX-69).
 */
export function applyShow(sh: Show, a: Pick<Address, 'set'>, own: boolean) {
  if (sh.kind === 'set') {
    applyWork({ work: true, set: a.set }, own);
    return;
  }
  linkSet.value = null;
  setShowState(sh);
}

/** Режимы, модель, панель, пара и лицо из адреса; окно ставится отдельно, когда небо готово. history — это «назад» или «вперёд». */
function applyState(a: Address, history = false, init = false) {
  const mark = markOf(typeof window !== 'undefined' ? window.history.state : null);
  batch(() => {
    if (a.scale !== undefined) lambda.value = a.scale;
    if (a.model && modelInfo.some((m) => m.id === a.model)) modelId.value = a.model;
    if (a.full) {
      epochMode.value = !!a.tiers;
      // понимание Лк 3 (решение 130): запись истории и ссылка его воспроизводят
      lineFlip.value = !!a.luke;
      // показ: адрес с полями вида описывает и его; без поля показа — всё небо. Новый сеанс по такому адресу после
      // выбранного начала — показ как в прошлый раз (решение 68; src/ui/work.ts, firstShow)
      if (a.show || !(init && restoreReveal)) applyShow(a.show ?? { kind: 'all' }, a, !!mark && !mark.link);
      // выбранная связь (решение 83): «назад» её возвращает, запись без неё — снимает
      selectedLink.value = a.link ?? null;
    } else if (linkSet.peek()) {
      // ушли на адрес без набора («#/», «#/david»): набор из ссылки в адресе не остаётся (IX-69)
      linkSet.value = null;
    }
    // «назад» из панели закрывает её; в прежнем адресе без полей панель не трогается
    if (a.full || a.panel) panel.value = a.panel ?? null;
    // «назад» и «вперёд» по записям атласа переключают только активную карточку, закреплённые вкладки не меняются (решения 50, 91;
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
  // временные гости (решение 93, К3) — когда показ, лицо и связь адреса уже стоят; запись без них гостей снимает
  if (a.full) setGuestsFromAddress(a.guests ?? []);
  // рассказ, фокус созвездия, врезка семьи (этап 16): запись их воспроизводит, запись без них — снимает; окно — адреса
  if (a.full) {
    // адрес без окна (ссылка «#/iakov~r3») — небо к кадру шага, а не к лицу
    storyFromAddress(a.story ?? null, !a.view);
    groupFocusFromAddress(a.area ?? null);
    const fi = familyInset.peek();
    if (a.inset && (!fi || fi.id !== a.inset)) familyInset.value = { id: a.inset, from: 'address' };
    else if (!a.inset && fi) familyInset.value = null;
  }
  searchNotice.value = a.bad ? { text: `Лица с адресом «${a.bad}» в атласе нет. Найдите его по имени.`, ids: nearIds(a.bad) } : null;
}

// Прочитать адрес до первого показа: модель, масштаб, панель и лицо сразу в нужном виде, без перестройки неба.
const initial = typeof location !== 'undefined' ? parseAddress(location.hash, (id) => byId.has(id)) : null;
if (initial && initial.route === 'atlas') applyState(initial, false, true);
// пропорция полос адреса — небу до первой раскладки (SkyView); адрес с полями вида без «h» — пропорции по умолчанию
if (initial && initial.route === 'atlas' && (initial.lanes !== undefined || initial.full)) setStartLanes(initial.lanes ?? 1);

/**
 * Небо готово принять окно: модель и масштаб адреса уже в нём, размер холста устоялся. settle — ждать ещё два кадра:
 * сетка раскладки (панель, карточка) меняет ширину холста. Без смены сетки небо готово сразу («назад» к другому показу
 * с той же панелью и карточкой: окно едет без задержки, Я28).
 */
function whenSkyReady(then: () => void, tries = 0, settle = true) {
  const s = skyRef.current;
  const model = s && s.model && s.model.id === modelId.peek() && models.some((m) => m.id === modelId.peek()) && s.lambda === lambda.peek();
  // первый показ и смена сетки: окно или перелёт — после перехода строк к укладке показа (§ 10), иначе цель перелёта
  // берётся с середины перехода и лицо остаётся за краем (род Иуды по адресу)
  // и после вписывания коридора «только линии», если показ сменился на линии Мессии (view.ts, linesSettling)
  const ready = model && !(settle && s.transitioning) && !linesSettling();
  if (ready && !settle && tries === 0) {
    then();
    return;
  }
  if (ready || tries > 180) {
    requestAnimationFrame(() => requestAnimationFrame(then));
    return;
  }
  requestAnimationFrame(() => whenSkyReady(then, tries + 1, settle));
}

/** Пропорция полос в нынешнем адресе (поле «h»; без него — 1). */
const lanesInAddress = (): number => {
  const m = /~h(\d+(?:\.\d+)?)(?=~|$)/.exec(location.hash);
  return m ? Number(m[1]) : 1;
};

/** Подключить адрес: прочитать его сейчас и при «назад»/«вперёд», записывать при смене вида. Возвращает отписку. */
export function bindAddress(): () => void {
  let lastPush = '';
  let applying = false;
  let replaceTimer = 0;
  let alive = true;
  /** запись истории применяется («назад», «вперёд», первый показ): адрес не пишется, пока небо не встанет (IX-74) */
  let quiet = false;
  let settleRaf = 0;

  /** номер последней записи сеанса (контракт 3): новая запись — следующий номер, та же запись свой номер сохраняет */
  let seqTop = markOf(history.state)?.seq ?? 0;
  const mark = (seq: number): HistoryMark => {
    const f = fieldsOf();
    return { toledot: 1, link: !!linkSet.peek(), seq, path: [...explorePath.peek()], ...(f.sheet ? { sheet: f.sheet } : {}) };
  };
  /** когда адрес записан в последний раз (performance.now) */
  let lastWrite = -Infinity;
  const write = (mode: 'push' | 'replace') => {
    // смена показа, записанная как «в ту же запись» (раскрытие, свёртка: src/ui/work.ts, setShowState)
    if (showHistory.mode === 'replace') mode = 'replace';
    showHistory.mode = 'push';
    if (location.hash.startsWith('#/specimen')) return;
    const next = formatAddress(snapshot());
    lastPush = pushKey();
    const cur = markOf(history.state);
    const m = mark(mode === 'push' || cur?.seq === undefined ? ++seqTop : cur.seq);
    if (location.hash === next && cur && cur.link === m.link && cur.seq !== undefined && sameFields(cur, m)) return;
    if (mode === 'push' && !(location.hash === next && cur && cur.link === m.link)) {
      history.pushState(m, '', next);
      windowJump.lastPush = performance.now();
    } else history.replaceState(m, '', next);
    lastWrite = performance.now();
  };
  // поля записи (положение листа) — в текущую запись, без новой: только когда запись не применяется и новой не ждёт
  patcher = () => {
    if (applying || quiet || pushKey() !== lastPush || location.hash.startsWith('#/specimen')) return;
    const cur = markOf(history.state);
    if (!cur) return;
    const m = mark(cur.seq ?? ++seqTop);
    if (sameFields(cur, m) && cur.seq !== undefined) return;
    history.replaceState(m, '', location.href);
  };
  // возврат из «Ближайшей родни» (решение 145): окно сейчас, окно записи, номер записи и «назад»
  windowHooks.now = () => currentView();
  windowHooks.put = (v) => whenSkyReady(() => alive && applyView(v as View, true), 0, true);
  windowHooks.seq = () => markOf(history.state)?.seq ?? -1;
  windowHooks.back = () => history.back();

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
    // поля записи сверх адреса (контракт 3): путь исследования — свой у записи; положение листа — его владельцу
    const hm = markOf(history.state);
    historyApplying.value = hm ? { ...(hm.sheet ? { sheet: hm.sheet } : {}) } : {};
    explorePath.value = hm?.path?.length ? hm.path : a.id ? [a.id] : [];
    // сетка раскладки меняется, если меняется панель или карточка появляется либо уходит: тогда окно ставится через два кадра
    const panel0 = panel.peek();
    const card0 = !!selected.peek();
    if (!initialLoad) applyState(a, true);
    // запись включила показ «линии Мессии» (не первый показ): окно — у fitLines, ±10 поколений вокруг выбранного (IX-73);
    // перелёт к лицу его не перебивает
    const linesFit = !initialLoad && linesSettling();
    const grid = initialLoad || panel.peek() !== panel0 || !!selected.peek() !== card0;
    lastPush = pushKey();
    applying = false;
    // неверный адрес: открыт поиск с сообщением и похожими лицами (IX-44)
    if (a.bad) setTimeout(() => document.getElementById('find')?.focus(), 100);
    whenSkyReady(() => {
      if (!alive) return;
      // пропорция полос (J1) — до окна: высота полосы решает, где середина окна по вертикали. Ссылка на шаг рассказа без
      // окна («#/iakov~r3») — пропорцию ставит кадр шага (сжатые строки: на небе этапа 14 сыновья Иакова — в своих коленах)
      if ((a.lanes !== undefined || a.full) && !(a.story !== undefined && a.story !== null && !a.view)) skyRef.current?.cam.setLanes(a.lanes ?? 1);
      // в режиме «только линии» строки временно по высоте коридора (MAP-70): своя пропорция — в адресе и памяти
      holdLinesRows();
      // окно записи — сразу при первом показе, переходом за BACK_MS при «назад» и «вперёд»; адрес называет лицо, но не
      // окно (прежний «#/david»): небо летит к лицу
      if (a.view) applyView(a.view, !initialLoad);
      else if (a.id && !linesFit && a.story === undefined) skyRef.flyTo(a.id);
      // адрес пишется, когда небо встало: окно самой записи, а не кадр перехода. Запись истории с окном остаётся какой
      // была; первый показ и адрес без окна дополняются окном
      whenStill(() => {
        // адрес называет лицо без окна, а перелёт оставил его за краем (семейная укладка: окно не мельче строк показа, а
        // перелёт рассчитан на жизнь лица, у Хама — 900 лет оценки) — небо сдвигается к лицу, масштаб прежний
        if (!a.view && a.id && a.id === selected.peek() && !inView(a.id)) {
          keepInView(a.id);
          whenStill(() => {
            quiet = false;
            historyApplying.value = null;
            write('replace');
          });
          return;
        }
        quiet = false;
        historyApplying.value = null;
        if (initialLoad || !a.view) write('replace');
      });
    }, 0, grid);
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
    historyApplying.value = null;
    cancelAnimationFrame(settleRaf);
    // путь исследования (решение 148): новый выбор лица — в конец пути; выбор из поиска начинает новую историю (решение
    // 168; прежняя — «назад» браузера)
    const sel = selected.peek();
    explorePath.value = sel && sel !== explorePath.peek().at(-1) && fromSearch() ? [sel] : pathAfter(explorePath.peek(), sel);
    // прыжок окна, начатый до новой записи, в неё и попадёт: своей записи ему не нужно
    takeJump();
    write('push');
  });
  // окно и режимы — та же запись, с задержкой 300 мс. Кадры неба идут и без движения камеры (ток света по ленте под
  // указателем, отклик звезды): таймер переставляется, только когда вид правда изменился, иначе запись не наступала бы
  let viewKey = '';
  let setSeen = shownSet.peek();
  const offReplace = effect(() => {
    void viewTick.value;
    const c = skyRef.current?.cam;
    const key = [c?.x0, c?.kx, c?.laneTop, c?.ownLanes, c?.w, lambda.value, modelId.value, epochMode.value].join(' ');
    const set = shownSet.value;
    // лист «Показ» открыт (решение 147): окно, сдвинутое из-под листа, — не шаг читателя; запишется, когда лист закроют
    if (windowHold.value) {
      clearTimeout(replaceTimer);
      return;
    }
    if (key === viewKey && set === setSeen) return;
    viewKey = key;
    setSeen = set;
    // запись истории ещё применяется: кадры перехода в адрес не идут
    if (quiet) return;
    clearTimeout(replaceTimer);
    // пропорция полос устоялась (шаг «полосы ±», «Пропорции по умолчанию»; J1), а в адресе прежняя: адрес пишется в том
    // же кадре, что и память браузера (SkyView), — не ждать 300 мс после кадра, который сам бывает долгим. Не чаще раза
    // в 350 мс: частые записи истории браузер ограничивает (протяжка по буквам полос)
    if (c && !c.moving && Math.abs(lanesInAddress() - Math.round(c.ownLanes * 100) / 100) >= 0.005) {
      replaceTimer = window.setTimeout(() => write('replace'), Math.max(0, lastWrite + 350 - performance.now()));
      return;
    }
    // окно встало: прыжок по эпохе (решение 147) — новой записью, иначе — в ту же
    replaceTimer = window.setTimeout(() => write(takeJump() ? 'push' : 'replace'), 300);
  });
  return () => {
    alive = false;
    patcher = null;
    clearTimeout(replaceTimer);
    cancelAnimationFrame(settleRaf);
    window.removeEventListener('popstate', onPop);
    offPush();
    offReplace();
  };
}
