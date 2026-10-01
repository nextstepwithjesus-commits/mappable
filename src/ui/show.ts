/**
 * Модель показа (этап 11, § 5 и § 7; решения 77, 81, 82).
 *
 *   Показ = всё небо | линии Мессии | ключевые лица | созвездия {список; связи наружу} |
 *           род лица {лицо; предки, потомки или оба; поколений 1–3 или все; по отцам или по крови} | набор
 *   Фокус = лицо | союз | связь | ничего — поверх любого показа (src/state.ts selected, src/ui/linkstate.ts selectedLink)
 *
 * Здесь — всё, что из показа следует:
 *  — show, setShow — сам показ (сигнал живёт в src/ui/work.ts, чтобы reveal.ts читал его без круга импорта);
 *  — showContent — состав: лица, гости (жёны и матери вне показа, нужные для союзов), обрывки наружу, родоначальник,
 *    укладка ('map' — общая раскладка со свёрткой прочего; 'family' — семейная укладка «Г», src/engine/family.ts);
 *  — skyShow — то же для плана неба (src/render/rows.ts, SkyView.show): с виртуальными полосами семейной укладки;
 *  — showSummary — строка «На небе: …» у верхней кромки неба, части с командами;
 *  — groupSections() — разделы листа «Показ» с числами; countShow(s) — число лиц до применения.
 * Составы — src/engine/lineage.ts (род лица, созвездия, гости, обрывки).
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { byId, graph, groupById, groups, lineMembership, lines, models, persons } from '../data/atlas.ts';
import type { Group, GroupSection } from '../data/types.ts';
import { familyLayout, type FamilyData, type FamilyResult } from '../engine/family.ts';
import { packSpan } from '../engine/layout.ts';
import { groupsWith, inGroup, lineageWith, useKinData, type KinData, type LineageBy, type LineageDir, type LinksOut, type Stub } from '../engine/lineage.ts';
import type { ShowIn } from '../render/rows.ts';
import { linkKeyString, spanInner, type LinkKey } from '../engine/linkkey.ts';
import { linkRoles } from './linkwords.ts';
import { selectedLink } from './linkstate.ts';
import { walk } from '../render/rows.ts';
import { model, onlyLines, pins, selected, skyGroup } from '../state.ts';
import { KEY_IDS, LINE_IDS, LINES_TITLE, unionById, unions } from './reveal.ts';

export { LINES_TITLE };
import { lowerFirst, nameCase } from './text/ru.ts';
import { num } from './text/typo.ts';
import {
  foldDesc, foldDescOf, foldGroupOf, foldsHiding, parseShow, sameShow, setShowState, show, showAnchor, showKey, showLinksField, showOn, shownSet, WORK_URL_MAX,
  type Show,
} from './work.ts';

export { show, showKey, showLinksField, parseShow, sameShow };
export type { Show, LinksOut, LineageBy, LineageDir, Stub };
export type { ShowKind } from './work.ts';

// ---------- данные составов ----------

/** Данные атласа для составов (src/engine/lineage.ts). */
export const kinData: KinData = {
  graph,
  unions,
  person: (id) => {
    const p = byId.get(id);
    return p ? { name: p.name, sex: p.sex, group: p.group, unnamed: p.unnamed, alt: p.alt } : undefined;
  },
  group: (id) => groupById.get(id),
};
useKinData(kinData);

// ---------- состав показа ----------

export interface ShowContent {
  /** лица показа (у всего неба — все лица) */
  ids: ReadonlySet<string>;
  /** гости — лица вне показа, нужные для союзов: небо рисует их бледнее */
  guests: ReadonlySet<string>;
  /** обрывки наружу */
  stubs: readonly Stub[];
  /** родоначальник созвездия (у показа одного созвездия с его домами), если он задан в data/groups.json */
  founder?: string;
  /** 'map' — общая раскладка со свёрткой прочего; 'family' — семейная укладка «Г» */
  layout: 'map' | 'family';
  /** родоначальники созвездий показа, лежащие вне этих созвездий (полноправные лица показа с пометой) */
  founders: ReadonlySet<string>;
  /** дочь рода с потомками вне рода → сколько их («+N» у дочери; род лица по отцам) */
  plus: ReadonlyMap<string, number>;
}

/** Показ созвездий больше стольких лиц (с гостями) — картой со свёрткой прочего, а не семейной укладкой. */
export const FAMILY_MAX = 900;
const EMPTY: ReadonlySet<string> = new Set();
const ALL_IDS: ReadonlySet<string> = new Set(persons.map((p) => p.id));

/** Созвездия раздела листа, по порядку данных; вложенные дома — сразу за своим созвездием. */
function sectionGroups(sec: GroupSection): Group[] {
  const own = groups.filter((g) => g.section === sec);
  const top = own.filter((g) => !g.parent || !own.some((x) => x.id === g.parent));
  const out: Group[] = [];
  const add = (g: Group) => {
    out.push(g);
    for (const h of own) if (h.parent === g.id) add(h);
  };
  for (const g of top) add(g);
  return out;
}
/** Все колена Израилевы с домами: раздел «Колена Израилевы» целиком. */
export const TRIBES: readonly string[] = sectionGroups('tribes').map((g) => g.id);
/** Показ «все колена». */
export const allTribes = (links: LinksOut = 'stubs'): Show => ({ kind: 'groups', groups: TRIBES, links });
/** Созвездие и вложенные в него дома (Колено Иудино → и Дом Давидов). */
export function withHouses(id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const g of groups) if (g.parent === out[i] && !out.includes(g.id)) out.push(g.id);
  return out;
}
/** Выбран весь раздел: у показа созвездий — все созвездия раздела (например, «все колена»). */
function wholeSection(gs: readonly string[]): GroupSection | null {
  const set = new Set(gs);
  const secs = new Set(gs.map((g) => groupById.get(g)?.section));
  if (secs.size !== 1) return null;
  const sec = [...secs][0];
  if (!sec) return null;
  const all = groups.filter((g) => g.section === sec).map((g) => g.id);
  return all.length > 1 && all.every((g) => set.has(g)) ? sec : null;
}
/**
 * Созвездие из списков (Езд 2, Неем 7…): семейная укладка выше карты больше чем в LIST_RATIO раза — родства в нём мало,
 * а списки на общей карте уже собраны скоплениями. Такое созвездие показывается картой. Считается по модели
 * по умолчанию, чтобы укладка показа не зависела от выбранной модели.
 */
const LIST_RATIO = 1.5;
function listLike(S: ReadonlySet<string>): boolean {
  if (S.size < 60) return false;
  const m = models[0];
  const lanes = new Set<number>();
  for (const id of S) {
    const n = m.nodeByPerson.get(id);
    if (n) lanes.add(n.lane);
  }
  return familyLayout(S, familyData(m)).count > LIST_RATIO * lanes.size;
}

/** Родоначальник показа созвездий: у одного созвездия (с его домами) — его founder. */
function soleFounder(gs: readonly string[]): string | undefined {
  const tops = gs.filter((g) => !gs.includes(groupById.get(g)?.parent ?? ''));
  if (tops.length !== 1) return undefined;
  const f = groupById.get(tops[0])?.founder;
  return f && byId.has(f) ? f : undefined;
}

const CONTENT_CACHE = 128;
const contentCache = new Map<string, ShowContent>();
/**
 * Состав показа s. У набора — набор неба сейчас (src/ui/work.ts, shownSet); остальные составы зависят только от данных
 * и запоминаются.
 */
export function contentOf(s: Show, set: ReadonlyMap<string, unknown> = shownSet.peek()): ShowContent {
  if (s.kind === 'set') return { ids: new Set(set.keys()), guests: EMPTY, stubs: [], layout: 'family', founders: EMPTY, plus: new Map() };
  const key = `${showKey(s)}|${showLinksField(s) ?? ''}`;
  const hit = contentCache.get(key);
  if (hit) return hit;
  let c: ShowContent;
  switch (s.kind) {
    case 'all':
      c = { ids: ALL_IDS, guests: EMPTY, stubs: [], layout: 'map', founders: EMPTY, plus: new Map() };
      break;
    case 'lines':
      c = { ids: new Set(LINE_IDS), guests: EMPTY, stubs: [], layout: 'family', founders: EMPTY, plus: new Map() };
      break;
    case 'key':
      c = { ids: new Set(KEY_IDS), guests: EMPTY, stubs: [], layout: 'map', founders: EMPTY, plus: new Map() };
      break;
    case 'groups': {
      const r = groupsWith(kinData, byId.keys(), s.groups, s.links);
      const all = new Set([...r.ids, ...r.guests]);
      const map = all.size > FAMILY_MAX || wholeSection(s.groups) === 'tribes' || listLike(all);
      c = { ids: r.ids, guests: r.guests, stubs: r.stubs, layout: map ? 'map' : 'family', founders: r.founders, plus: r.plus, founder: soleFounder(s.groups) };
      break;
    }
    case 'lineage': {
      const r = lineageWith(kinData, s.id, s.dir, s.gen, s.by);
      c = { ids: r.ids, guests: r.guests, stubs: r.stubs, layout: 'family', founders: EMPTY, plus: r.plus };
      break;
    }
  }
  // запоминаются недавние составы (лист «Показ» считает числа на каждый флажок)
  if (contentCache.size >= CONTENT_CACHE) contentCache.delete(contentCache.keys().next().value!);
  contentCache.set(key, c);
  return c;
}

// ---------- временные гости (решение 93, К3; контракт 3 этапа 13) ----------

/**
 * Временные гости: лица вне показа, которых читатель попросил показать — строкой «вне показа — показать» карточки
 * связи или щелчком по призраку конца на небе. Гость стоит на небе, как гости созвездий (45 %, подпись «в «…»»), пока
 * не снят выбор, к которому он относится: выбранная связь (link), а без неё — выбранное лицо (person). Смена показа
 * тоже его убирает. Адрес пишет гостей полем «~g» рядом с «~c» (src/ui/address.ts): ссылка воспроизводит вид, «назад»
 * убирает гостя.
 */
export interface GuestState {
  ids: readonly string[];
  /** ключ показа, в котором гость показан (showKey и поле «~x») */
  show: string;
  /** выбранная связь (запись linkKeyString), к которой относится гость; null — гость относится к лицу */
  link: string | null;
  /** выбранное лицо, к которому относится гость, если связь не выбрана */
  person: string | null;
}
export const guestState = signal<GuestState | null>(null);

const showField = (s: Show) => `${showKey(s)}|${showLinksField(s) ?? ''}`;
const linkField = () => {
  const k = selectedLink.value;
  return k ? linkKeyString(k) : null;
};
/** Гость ещё в силе: тот же показ и тот же выбор. */
function guestValid(g: GuestState | null): g is GuestState {
  if (!g || !g.ids.length || g.show !== showField(show.value)) return false;
  return g.link !== null ? linkField() === g.link : selected.value === g.person;
}
/** Временные гости сейчас (пусто — нет или выбор снят). */
export const linkGuests = computed<readonly string[]>(() => {
  const g = guestState.value;
  return guestValid(g) ? g.ids : [];
});
// выбор снят или показ сменился — гость уходит и из состояния (адрес его больше не пишет)
effect(() => {
  const g = guestState.value;
  if (g && !guestValid(g)) guestState.value = null;
});

/**
 * Показать лицо id временным гостем (контракт 3): лицо вне показа встаёт на небо до снятия выбора. Лицо, спрятанное
 * свёрткой («свёрнут»), показывается разворотом того, что его прячет, — как при выборе лица. Возвращает, что сделано:
 * 'guest' — стал гостем; 'unfold' — развёрнуто; 'shown' — лицо уже на небе; null — такого лица нет.
 */
export function showGuest(id: string): 'guest' | 'unfold' | 'shown' | null {
  if (!byId.has(id)) return null;
  const f = foldsHiding(id);
  const unfold = f.desc.length > 0 || f.groups.length > 0;
  const s = show.peek();
  const c = contentOf(s);
  const cur = guestState.peek();
  const live = guestValid(cur) ? cur.ids : [];
  const inside = s.kind === 'all' || c.ids.has(id) || c.guests.has(id) || live.includes(id);
  batch(() => {
    for (const r of f.desc) foldDescOf(r, false);
    for (const g of f.groups) foldGroupOf(g, false);
    if (inside) return;
    const k = selectedLink.peek();
    guestState.value = { ids: [...live, id], show: showField(s), link: k ? linkKeyString(k) : null, person: k ? null : selected.peek() };
  });
  return !inside ? 'guest' : unfold ? 'unfold' : 'shown';
}
/** Лицо id — временный гость сейчас. */
export const isLinkGuest = (id: string) => linkGuests.value.includes(id);
/** Убрать временных гостей. */
export function clearGuests() {
  guestState.value = null;
}

/**
 * Поставить гостей из адреса (src/ui/address.ts): после того как показ, лицо и связь адреса уже стоят. Пустой список —
 * гостей нет.
 */
export function setGuestsFromAddress(ids: readonly string[]) {
  const ok = ids.filter((id) => byId.has(id));
  if (!ok.length) {
    guestState.value = null;
    return;
  }
  const k = selectedLink.peek();
  guestState.value = { ids: ok, show: showField(show.peek()), link: k ? linkKeyString(k) : null, person: k ? null : selected.peek() };
}

// ---------- найденное всегда видно (решение 113) ----------

/**
 * Откуда результаты, показанные гостями: поиск (имя, стих, «Все N на небе»), участок Синопсиса, глава. Слово — для
 * строки показа: «Результаты поиска вне показа: 2 — снять».
 */
export type ResultSource = 'search' | 'synopsis' | 'chapter';
export const RESULT_WORD: Record<ResultSource, string> = {
  search: 'Результаты поиска вне показа',
  synopsis: 'Лица участка Синопсиса вне показа',
  chapter: 'Лица главы вне показа',
};
/**
 * Результаты, обещанные на небе, но стоящие вне показа (решение 113; UI-01): они встают временными гостями — тем же
 * механизмом, что концы связи (решение 93). Живут, пока тот же показ, до «снять» в строке показа или до того, как
 * снято то, что их показало (отметки поиска, участок Синопсиса, глава). ids — только гости (лица вне показа).
 */
export interface ResultGuests {
  ids: readonly string[];
  show: string;
  source: ResultSource;
  /**
   * До чего живут: 'pins' — пока стоят отметки поиска («Все N на небе»); 'group' — пока подсвечена глава или участок
   * Синопсиса (skyGroup); 'selected' — пока выбрано найденное лицо person.
   */
  until: 'pins' | 'group' | 'selected';
  person?: string;
}
export const resultGuests = signal<ResultGuests | null>(null);
/** Гости результатов сейчас (пусто — нет или показ сменился). */
export const resultIds = computed<readonly string[]>(() => {
  const r = resultGuests.value;
  return r && r.show === showField(show.value) ? r.ids : [];
});
// показ сменился или снято то, что показало результаты (отметки, глава, участок, выбор лица) — гости уходят
effect(() => {
  const r = resultGuests.value;
  if (!r) return;
  const gone =
    r.show !== showField(show.value) ||
    (r.until === 'pins' && !pins.value.length) ||
    (r.until === 'group' && !skyGroup.value) ||
    (r.until === 'selected' && selected.value !== r.person);
  if (gone) resultGuests.value = null;
});

/**
 * Показать на небе результаты ids (решение 113): те, кто вне показа, встают гостями; спрятанные свёрткой —
 * разворачиваются. Возвращает, сколько лиц стало гостями (0 — все и так на небе).
 */
export function showResults(ids: readonly string[], source: ResultSource, until: ResultGuests['until'] = 'pins', person?: string): number {
  const s = show.peek();
  const c = contentOf(s);
  const ok = ids.filter((id) => byId.has(id));
  batch(() => {
    for (const id of ok) {
      const f = foldsHiding(id);
      for (const r of f.desc) foldDescOf(r, false);
      for (const g of f.groups) foldGroupOf(g, false);
    }
  });
  const out = s.kind === 'all' ? [] : ok.filter((id) => !c.ids.has(id) && !c.guests.has(id));
  resultGuests.value = out.length
    ? { ids: out, show: showField(s), source, until, ...(person ? { person } : {}) }
    : resultGuests.peek()?.source === source
      ? null
      : resultGuests.peek();
  return out.length;
}
/** Снять гостей результатов; source — только своего источника (снятые отметки поиска не трогают участок Синопсиса). */
export function clearResults(source?: ResultSource) {
  const r = resultGuests.peek();
  if (r && (!source || r.source === source)) resultGuests.value = null;
}

/** Состав нынешнего показа: с временными гостями — концами связи (решение 93) и результатами (решение 113). */
export const showContent = computed<ShowContent>(() => {
  const c = contentOf(show.value, shownSet.value);
  const extra = [...new Set([...linkGuests.value, ...resultIds.value])].filter((id) => !c.ids.has(id) && !c.guests.has(id));
  return extra.length ? { ...c, guests: new Set([...c.guests, ...extra]) } : c;
});

/**
 * Число лиц показа s до применения (лист «Показ»): все, кто будет на небе, — лица показа и гости. Это же число стоит
 * в строке «На небе: …» («Дом Нахора» — 17 лиц: 15 лиц созвездия, основатель Нахор и гостья Милка).
 */
export function countShow(s: Show): number {
  const c = contentOf(s);
  return c.ids.size + c.guests.size;
}
/** Числа показа s: лица, гости, обрывки. */
export function showCounts(s: Show): { ids: number; guests: number; stubs: number } {
  const c = contentOf(s);
  return { ids: c.ids.size, guests: c.guests.size, stubs: c.stubs.length };
}

// ---------- смена показа ----------

/**
 * Сменить показ. anchor — лицо-опора перехода (§ 10; по умолчанию — выбранное лицо); history — как записать смену
 * в историю: 'push' (по умолчанию) — новой записью, «назад» вернёт прежний показ; 'replace' — в ту же запись.
 * Несуществующие созвездия и лица отбрасываются; показ без созвездий или без лица — всё небо.
 */
export function setShow(s: Show, o: { anchor?: string | null; history?: 'push' | 'replace' } = {}) {
  let next: Show = s;
  if (s.kind === 'groups') {
    const gs = [...new Set(s.groups)].filter((g) => groupById.has(g));
    next = gs.length ? { kind: 'groups', groups: gs, links: s.links } : { kind: 'all' };
  } else if (s.kind === 'lineage' && !byId.has(s.id)) next = { kind: 'all' };
  const anchor = o.anchor === undefined ? selected.peek() : o.anchor;
  setShowState(next, { anchor, history: o.history });
}

// ---------- выбор лица и выбранная связь (этап 14, решение 161) ----------

/**
 * Лица выбранной связи: её концы с ролями (src/ui/linkwords.ts), у союза — и его дети (решение 137), у цепочки ленты —
 * и скрытые звенья между концами.
 */
export function linkPersons(k: LinkKey): Set<string> {
  const out = new Set(linkRoles(k).map((e) => e.id));
  if (k.kind === 'union' || k.kind === 'child' || k.kind === 'spouse') {
    const u = unionById(k.union);
    if (u) for (const id of [u.a, u.b, ...(k.kind === 'union' ? u.kids : [])]) if (id) out.add(id);
  }
  if (k.kind === 'span') {
    out.add(k.from);
    out.add(k.to);
    for (const id of spanInner([...lineMembership[k.line].keys()], k) ?? []) out.add(id);
  }
  return out;
}
/**
 * Выбор лица — поиском, указателем у края, ссылкой, адресом, клавишей — снимает выбранную связь, если лицо не стоит на
 * ней (R1-02: после поиска «Давид» связь «Иаков и Рахиль → Вениамин» оставалась в адресе и указателях). Так же, как
 * щелчок по звезде. Снятие выбора связь не трогает (её снимает Escape по своей очереди).
 */
let selSeen = selected.peek();
let linkSeen = selectedLink.peek();
effect(() => {
  const id = selected.value;
  const k = selectedLink.value;
  // лицо и связь сменились вместе (адрес, «назад») — это одно состояние, связь остаётся
  const together = k !== linkSeen;
  linkSeen = k;
  if (id === selSeen) return;
  selSeen = id;
  if (!id || !k || together) return;
  if (!linkPersons(k).has(id)) linkSeen = selectedLink.value = null;
});

// ---------- «Ближайшая родня» (этап 14, решение 145; контракт 3) ----------

/**
 * «Ближайшая родня» лица id: показ «предки и потомки, 1 поколение» по крови — родители, дети и (гостями) матери детей,
 * в семейной укладке «Г»: дети каждой матери стоят группой под своим ромбом (U1).
 */
export const nearestShow = (id: string): Show => ({ kind: 'lineage', id, dir: 'both', gen: 1, by: 'blood' });
/** Показ s — «Ближайшая родня» (предки и потомки, 1 поколение, по крови). */
export const isNearest = (s: Show): s is Extract<Show, { kind: 'lineage' }> => s.kind === 'lineage' && s.dir === 'both' && s.gen === 1 && s.by === 'blood';
/** Число лиц «Ближайшей родни» лица id — для пункта «Ближайшая родня — 31». */
export const nearestCount = (id: string): number => countShow(nearestShow(id));

/**
 * Окно неба для возврата (src/ui/address.ts подключает свои currentView и постановку окна: show.ts не импортирует адрес,
 * у адреса — свой импорт show.ts). now — окно сейчас; put — поставить окно переходом, когда небо перестроилось.
 */
export const windowHooks: { now: () => unknown; put: (v: unknown) => void; seq: () => number; back: () => void } = {
  now: () => null,
  put: () => {},
  seq: () => -1,
  back: () => {},
};

/**
 * Откуда пришли в «Ближайшую родню»: прежний показ, окно и выбранное лицо в тот момент; seq — номер записи истории
 * «Ближайшей родни» (src/ui/address.ts): пока читатель на ней, возврат — это «назад». null — возвращаться некуда.
 */
export interface FamilyBack {
  show: Show;
  view: unknown;
  id: string | null;
  seq: number;
}
export const familyBack = signal<FamilyBack | null>(null);
/** Есть куда вернуться одним действием: небо показывает «Ближайшую родню», вход в неё запомнен. */
export const canReturn = computed(() => !!familyBack.value && isNearest(show.value));
// ушли из «Ближайшей родни» иначе (лист «Показ», строка показа, «назад» дальше) — возврата больше нет; переход между
// родными внутри неё (родня другого лица) прежний показ не теряет
effect(() => {
  if (familyBack.value && !isNearest(show.value)) familyBack.value = null;
});

/**
 * «Ближайшая родня» (решение 145): показ «предки и потомки лица id, 1 поколение» с семейной укладкой. Переход — по
 * вертикали, лицо-опора неподвижно (решение 85); показ пишется новой записью истории — «назад» возвращает прежний показ
 * и окно. Прежний показ, окно и лицо запоминаются для «вернуть прежний показ» и Escape (returnFromFamily). Лицо
 * выбирается, если оно не выбрано. Возвращает, сменился ли показ.
 */
export function nearestFamily(id: string): boolean {
  if (!byId.has(id)) return false;
  const next = nearestShow(id);
  const cur = show.peek();
  if (sameShow(cur, next)) return false;
  // из «Ближайшей родни» одного лица в родню другого — возврат по-прежнему к показу, с которого начали
  const from = familyBack.peek() && isNearest(cur) ? familyBack.peek()! : { show: cur, view: windowHooks.now(), id: selected.peek(), seq: -1 };
  batch(() => {
    if (selected.peek() !== id) selected.value = id;
    setShow(next, { anchor: id });
  });
  // номер новой записи истории — после того, как адрес её записал (эффект адреса — в том же batch)
  familyBack.value = { ...from, seq: windowHooks.seq() };
  return true;
}

/**
 * Вернуть прежний показ и окно одним действием (решение 145): «вернуть прежний показ» в строке показа, Escape. Если
 * читатель стоит на записи «Ближайшей родни» — это «назад» (то же лицо, показ, окно и путь); если он уже шагнул внутри
 * неё — прежний показ новой записью, с опорой на выбранное лицо, и прежнее окно, если выбрано то же лицо. Было ли что
 * возвращать.
 */
export function returnFromFamily(): boolean {
  const b = familyBack.peek();
  if (!b || !isNearest(show.peek())) return false;
  if (b.seq >= 0 && windowHooks.seq() === b.seq) {
    windowHooks.back();
    return true;
  }
  const id = selected.peek();
  familyBack.value = null;
  setShow(b.show, { anchor: id });
  if (b.view && id === b.id) windowHooks.put(b.view);
  return true;
}

// ---------- план неба: укладка ----------

/** Клетки скоплений общей раскладки по модели (списки без родства, E2): лицо → скопление, строка сетки, годы сетки. */
const cellsByModel = new WeakMap<object, Map<string, { key: string; row: number; rows: number; t0: number; t1: number }>>();
function clusterCells(m: (typeof models)[number]) {
  let out = cellsByModel.get(m);
  if (!out) {
    out = new Map();
    for (const b of m.blocks) if (b.cluster) for (const c of b.cluster.cells) out.set(c.id, { key: String(b.id), row: c.row, rows: b.cluster.rows, t0: b.cluster.t0, t1: b.cluster.t1 });
    cellsByModel.set(m, out);
  }
  return out;
}

/** Данные семейной укладки по модели хронологии: годы знаков и места лиц — те же, что у всего неба. */
export function familyData(m: (typeof models)[number] = model.value): FamilyData {
  const spine = new Set(LINE_IDS);
  const cells = clusterCells(m);
  return {
    cluster: (id) => cells.get(id) ?? null,
    graph,
    unions,
    t0: (id) => m.nodeByPerson.get(id)?.t0 ?? m.chrono.get(id)?.b ?? 0,
    span: (id) => {
      const c = m.chrono.get(id);
      const t = m.nodeByPerson.get(id)?.t0 ?? c?.b ?? 0;
      if (!c) return [t, t + 8];
      return packSpan({ b: c.b, d: c.d, lastAttested: c.last, cls: c.cls, bLo: c.bLo, bHi: c.bHi, when: c.when, mark: spine.has(id) ? undefined : c.mark });
    },
    lines: { joseph: lines.joseph.persons.map((x) => x.id).filter((id) => byId.has(id)), mary: lines.mary.persons.map((x) => x.id).filter((id) => byId.has(id)) },
  };
}

/**
 * Выбранное лицо вне показа (не у всего неба): строка показа называет его («Руфь — вне показа»). Состав показа выбор
 * не меняет (Я21): на небе такого лица нет, пока читатель не сменит показ.
 */
export function outsideOf(s: Show, c: ShowContent, sel: string | null): string | null {
  return s.kind !== 'all' && sel && byId.has(sel) && !c.ids.has(sel) && !c.guests.has(sel) ? sel : null;
}

/** Прежняя семейная укладка — априорное условие следующей (устойчивость, § 4.2 п. 6) и опора виртуальных полос. */
let lastFamily: { res: FamilyResult; lanes: Map<string, number> } | null = null;

/** Лица, свёрнутые у лиц foldDesc (J5): их потомки, кроме лиц линий Мессии. */
function foldedOf(S: ReadonlySet<string>, roots: readonly string[]): Set<string> {
  const out = new Set<string>();
  const spine = new Set(LINE_IDS);
  for (const r of roots) {
    if (!S.has(r)) continue;
    for (const x of walk(graph, r, 'down', null, { other: true }).keys()) if (!spine.has(x)) out.add(x);
  }
  return out;
}

/** Укладки недавних показов: показ и состав → строки (не больше FAMILY_CACHE). */
const FAMILY_CACHE = 12;
const familyCache = new Map<string, { res: FamilyResult; lanes: Map<string, number> }>();
const hashIds = (S: ReadonlySet<string>) => {
  let x = 2166136261;
  for (const id of [...S].sort()) {
    for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
    x = Math.imul(x ^ 44, 16777619);
  }
  return `${S.size}.${(x >>> 0).toString(36)}`;
};

const hashLanes = (lanes: ReadonlyMap<string, number>) => {
  let x = 2166136261;
  for (const [id, l] of lanes) {
    for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
    x = Math.imul(x ^ (l + 1000), 16777619);
  }
  return (x >>> 0).toString(36);
};

/**
 * Семейная укладка лиц S: строки → виртуальные полосы. Опора (anchor) остаётся на своей прежней полосе, если она была
 * в прежней укладке, иначе встаёт на свою полосу общей раскладки; без опоры коридор — у оси.
 */
export function familyLanes(S: ReadonlySet<string>, o: { focus?: string | null; anchor?: string | null } = {}): { lanes: Map<string, number>; res: FamilyResult } {
  const res = familyLayout(S, familyData(), { prior: lastFamily?.res.prior ?? null, focus: o.focus ?? null });
  const m = model.peek();
  let off: number;
  const a = o.anchor && res.rows.has(o.anchor) ? o.anchor : null;
  const prev = a ? lastFamily?.lanes.get(a) : undefined;
  if (a && prev !== undefined) off = prev - res.rows.get(a)!;
  else if (a && m.nodeByPerson.get(a)) off = m.nodeByPerson.get(a)!.lane - res.rows.get(a)!;
  else {
    const sp = [...res.spine].map((id) => res.rows.get(id)!).sort((x, y) => x - y);
    off = sp.length ? -sp[sp.length >> 1] : -Math.floor((res.count - 1) / 2);
  }
  const lanes = new Map<string, number>();
  for (const [id, r] of res.rows) lanes.set(id, r + off);
  lastFamily = { res, lanes };
  return { lanes, res };
}

/**
 * Показ для плана неба (src/render/rows.ts, ShowIn): небо передаёт его в SkyView.show. В семейной укладке — виртуальные
 * полосы лиц показа и гостей; свёрнутые потомки (J5) в укладку не входят.
 */
export const skyShow = computed<ShowIn>(() => {
  const s = show.value;
  const c = showContent.value;
  const anchor = showAnchor.value ?? selected.peek();
  const k = `${showKey(s)}|${showLinksField(s) ?? ''}`;
  if (c.layout === 'map') {
    // временные гости (контракт 3) меняют состав карты — ключ с ними
    const g = [...linkGuests.value, ...resultIds.value];
    return { key: `m|${k}|${s.kind === 'set' ? c.ids.size : ''}${g.length ? `|g.${g.join('.')}` : ''}`, layout: 'map', ids: s.kind === 'all' ? null : c.ids, guests: c.guests, stubs: c.stubs, lanes: null, anchor, units: null };
  }
  void model.value;
  const S0 = new Set([...c.ids, ...c.guests]);
  const folded = foldedOf(S0, foldDesc.value);
  const S = folded.size ? new Set([...S0].filter((x) => !folded.has(x))) : S0;
  const focus = s.kind === 'lineage' && s.dir === 'both' ? s.id : null;
  // тот же показ того же состава уже укладывали (например, «назад» к нему): те же строки — окно записи истории встаёт
  // туда же, где было
  const ck = `${k}|${model.value.id}|${hashIds(S)}|${focus ?? ''}`;
  let hit = familyCache.get(ck);
  if (hit) {
    familyCache.delete(ck);
    lastFamily = hit;
  } else {
    hit = familyLanes(S, { focus, anchor });
    if (familyCache.size >= FAMILY_CACHE) familyCache.delete(familyCache.keys().next().value!);
  }
  familyCache.set(ck, hit);
  const { lanes, res } = hit;
  const guests = folded.size ? new Set([...c.guests].filter((x) => S.has(x))) : c.guests;
  const stubs = folded.size ? c.stubs.filter((x) => S.has(x.from)) : c.stubs;
  return { key: `f|${k}|${hashLanes(lanes)}`, layout: 'family', ids: c.ids, guests, stubs, lanes, anchor, units: res.units };
});

// ---------- строка показа ----------

/** Команда части строки показа. */
export type ShowCmd =
  /** открыть лист «Показ» («изменить»); lineage — на поле рода лица person */
  | { kind: 'sheet'; lineage?: string }
  /** перейти к показу («всё небо», «добавить созвездие «Патриархи»») */
  | { kind: 'show'; show: Show }
  /** меню поля рода лица: предки/потомки/оба, поколения, по отцам/по крови */
  | { kind: 'menu'; field: 'dir' | 'gen' | 'by'; options: readonly { label: string; show: Show; current: boolean }[] }
  /** «показать на всём небе» (решение 111): выбранное лицо вне показа — всё небо и перелёт к нему */
  | { kind: 'reveal'; id: string }
  /** «вернуть прежний показ» (решение 145): из «Ближайшей родни» — к показу и окну, с которых в неё пришли */
  | { kind: 'return' };

/** Часть строки показа: текст или изменяемая часть (команда). */
export interface SummaryPart {
  text: string;
  cmd?: ShowCmd;
}
/**
 * Строка показа: text — предложение «На небе: …» (изменяемые части — с командами), cmds — команды после него.
 * Узкое небо (строка не помещается в одну строку, ShowBar.tsx): mid — то же предложение без подробностей (основатель,
 * связи наружу, уточнение имени); short — одна строка «Дом Нахора» — 17 лиц» с одной командой «изменить», подробности —
 * в листе «Показ».
 */
export interface ShowSummary {
  text: readonly SummaryPart[];
  cmds: readonly SummaryPart[];
  /** вся строка без команд — для диктора и подписи */
  label: string;
  mid: readonly SummaryPart[];
  short: readonly SummaryPart[];
  shortCmds: readonly SummaryPart[];
}

const plural = (n: number, one: string, few: string, many: string) =>
  `${num(n)} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
export const personsN = (n: number) => plural(n, 'лицо', 'лица', 'лиц');
const linksN = (n: number) => plural(n, 'связь', 'связи', 'связей');
/** «5 поколений»; null — все. */
const genWord = (g: 1 | 2 | 3 | null) => (g === null ? 'все поколения' : g === 1 ? '1 поколение' : `${g} поколения`);
const DIR_WORD: Record<LineageDir, string> = { down: 'потомки', up: 'предки', both: 'предки и потомки' };
const BY_WORD: Record<LineageBy, string> = { father: 'по отцам', blood: 'по крови' };

/** Имя с уточнением в родительном падеже: «Иуды (сын Иакова)»; null — имя не склоняется надёжно. */
function nameGen(id: string): string | null {
  const p = byId.get(id);
  if (!p) return null;
  const g = nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt);
  return g ? `${g}${p.disambig ? ` (${p.disambig})` : ''}` : null;
}
const fullName = (id: string) => {
  const p = byId.get(id);
  return p ? `${p.name}${p.disambig ? ` (${p.disambig})` : ''}` : id;
};

/** Созвездие, куда ведёт больше всего обрывков (чтобы предложить «добавить созвездие …»). */
function stubTarget(s: Show, c: ShowContent): string | null {
  if (s.kind !== 'groups' || !c.stubs.length) return null;
  const n = new Map<string, number>();
  for (const x of c.stubs) {
    const g = byId.get(x.to)?.group;
    if (g && !s.groups.includes(g)) n.set(g, (n.get(g) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [g, k] of n) if (!best || k > n.get(best)!) best = g;
  return best;
}

/** Строка показа s. */
export function summaryOf(s: Show, c: ShowContent = contentOf(s)): ShowSummary {
  const text: SummaryPart[] = [{ text: 'На небе: ' }];
  const change: SummaryPart = { text: 'изменить', cmd: { kind: 'sheet' } };
  const cmds: SummaryPart[] = [change];
  const toAll: SummaryPart = { text: 'всё небо', cmd: { kind: 'show', show: { kind: 'all' } } };
  const n = c.ids.size;
  /** без подробностей (mid) и одной строкой (short); null — как text */
  let mid: SummaryPart[] | null = null;
  let short = '';
  let shortCmd: SummaryPart = change;
  switch (s.kind) {
    case 'all':
      text.push({ text: 'всё небо' });
      short = 'всё небо';
      break;
    case 'lines':
      // одно имя показа и начала (решение 110): «Родословие Иисуса Христа (Мф 1, Лк 3)»
      text.push({ text: (short = `${lowerFirst(LINES_TITLE)} — ${personsN(n)}`) });
      cmds.push(toAll);
      break;
    case 'key':
      text.push({ text: (short = `ключевые лица — ${personsN(n)}`) });
      cmds.push(toAll);
      break;
    case 'set':
      // пустой набор (решение 111): строка говорит, что делать, а не «набор — 0 лиц»
      if (!n) {
        text.push({ text: EMPTY_SET_TEXT });
        mid = [text[0], { text: 'набор пуст' }];
        short = 'набор пуст';
      } else text.push({ text: (short = `набор — ${personsN(n)}`) });
      cmds.push(toAll);
      break;
    case 'groups': {
      const sec = wholeSection(s.groups);
      const names = s.groups.map((g) => `«${groupById.get(g)?.name ?? g}»`);
      const what = sec === 'tribes' ? 'все колена' : `${s.groups.length > 1 ? 'созвездия' : 'созвездие'} ${names.join(', ')}`;
      text.push({ text: what });
      const bits = [personsN(n + c.guests.size)];
      if (c.founder) bits.push(`основатель ${byId.get(c.founder)?.name ?? c.founder}`);
      if (s.links === 'stubs') bits.push(c.stubs.length ? `${linksN(c.stubs.length)} наружу` : 'связей наружу нет');
      else if (s.links === 'none') bits.push('без связей наружу');
      else bits.push('с роднёй вне созвездия');
      text.push({ text: ` — ${bits.join('; ')}` });
      mid = [text[0], { text: `${what} — ${bits[0]}` }];
      // одной строкой: «Дом Нахора» — 17 лиц»; два созвездия — оба имени; больше — числом
      const shortWhat = sec === 'tribes' ? 'все колена' : s.groups.length <= 2 ? names.join(', ') : plural(s.groups.length, 'созвездие', 'созвездия', 'созвездий');
      short = `${shortWhat} — ${bits[0]}`;
      const t = stubTarget(s, c);
      if (t) cmds.push({ text: `добавить созвездие «${groupById.get(t)?.name}»`, cmd: { kind: 'show', show: { ...s, groups: [...s.groups, t] } } });
      cmds.push(toAll);
      break;
    }
    case 'lineage': {
      // «Ближайшая родня» (решение 145) — одним именем: «ближайшая родня Давида — 31 лицо»; поля рода меняет лист «Показ»
      // (без сужения типа: дальше в этой ветви — прочие показы рода)
      if (s.dir === 'both' && s.gen === 1 && s.by === 'blood') {
        const bareN = nameCaseBare(s.id);
        const g = nameGen(s.id);
        const all = personsN(n + c.guests.size);
        text.push({ text: g ? `ближайшая родня ${g} — ${all}` : `ближайшая родня: ${fullName(s.id)} — ${all}` });
        mid = [text[0], { text: bareN ? `ближайшая родня ${bareN} — ${all}` : `ближайшая родня: ${byId.get(s.id)?.name ?? s.id} — ${all}` }];
        short = bareN ? `ближайшая родня ${bareN} — ${all}` : `ближайшая родня — ${all}`;
        cmds.splice(0, cmds.length, { text: 'изменить', cmd: { kind: 'sheet', lineage: s.id } }, toAll);
        shortCmd = { text: 'изменить', cmd: { kind: 'sheet', lineage: s.id } };
        break;
      }
      const opt = <T,>(field: 'dir' | 'gen' | 'by', vals: readonly T[], label: (v: T) => string, set: (v: T) => Show, cur: T): SummaryPart => ({
        text: label(cur),
        cmd: { kind: 'menu', field, options: vals.map((v) => ({ label: label(v), show: set(v), current: v === cur })) },
      });
      const dir = opt<LineageDir>('dir', ['down', 'up', 'both'], (v) => DIR_WORD[v], (v) => ({ ...s, dir: v }), s.dir);
      text.push(dir);
      const g = nameGen(s.id);
      const bare = nameCaseBare(s.id);
      text.push({ text: g ? ` ${g} — ` : `: ${fullName(s.id)} — ` });
      const rest = [
        opt<1 | 2 | 3 | null>('gen', [1, 2, 3, null], genWord, (v) => ({ ...s, gen: v }), s.gen),
        { text: '; ' },
        opt<LineageBy>('by', ['father', 'blood'], (v) => BY_WORD[v], (v) => ({ ...s, by: v }), s.by),
        { text: ` — ${personsN(n + c.guests.size)}` },
      ];
      text.push(...rest);
      // без уточнения имени: «потомки ▾ Иакова — 1 поколение ▾; по отцам ▾ — 18 лиц»
      mid = [text[0], dir, { text: bare ? ` ${bare} — ` : `: ${byId.get(s.id)?.name ?? s.id} — ` }, ...rest];
      short = bare ? `${DIR_WORD[s.dir]} ${bare} — ${personsN(n + c.guests.size)}` : `род: ${byId.get(s.id)?.name ?? s.id} — ${personsN(n + c.guests.size)}`;
      shortCmd = { text: 'изменить', cmd: { kind: 'sheet', lineage: s.id } };
      cmds.shift();
      cmds.push(toAll);
      break;
    }
  }
  return { text, cmds, label: text.map((p) => p.text).join(''), mid: mid ?? text, short: [{ text: short }], shortCmds: [shortCmd] };
}

/**
 * Имя показа для строк «нет в показе «…»» (решения 93, 105, 111): «ключевые лица», «Родословие Иисуса Христа», «набор»,
 * «Дом Нахора», «потомки: Иуда». Всё небо — «всё небо».
 */
export function showTitle(s: Show): string {
  switch (s.kind) {
    case 'all':
      return 'всё небо';
    case 'lines':
      return LINES_TITLE;
    case 'key':
      return 'ключевые лица';
    case 'set':
      return 'набор';
    case 'groups':
      return wholeSection(s.groups) === 'tribes' ? 'все колена' : s.groups.map((g) => groupById.get(g)?.name ?? g).join(', ');
    case 'lineage':
      // «Ближайшая родня» (решение 145) — своим именем: «нет в показе «ближайшая родня: Иаков»»
      if (s.dir === 'both' && s.gen === 1 && s.by === 'blood') return `ближайшая родня: ${byId.get(s.id)?.name ?? s.id}`;
      return `${DIR_WORD[s.dir]}: ${byId.get(s.id)?.name ?? s.id}`;
  }
}

/** Имя без уточнения в родительном падеже: «Иакова»; null — имя не склоняется надёжно. */
function nameCaseBare(id: string): string | null {
  const p = byId.get(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
}

/**
 * Оговорка о ссылке у показа «набор» (решение 58; MOB-73): набор до 12 лиц передаётся ссылкой списком (решение 34),
 * длиннее — только показ. Не в самой строке, а в её подсказке (ShowBar.tsx).
 */
export function setLinkNote(n: number): string {
  return n > WORK_URL_MAX
    ? `Ссылкой передаётся показ «набор»; сам набор — только если в нём не больше ${WORK_URL_MAX} лиц`
    : `Ссылка на этот вид передаёт и сам набор: в нём не больше ${WORK_URL_MAX} лиц`;
}

/** Пустой показ «набор» (решение 111): что делать, чтобы набор появился. */
export const EMPTY_SET_TEXT = 'набор пуст — добавьте лиц командой «Добавить в набор» в карточке или начните «С Адама»';

/**
 * Строка показа сейчас; выбранное лицо вне показа — в конце строки: «Давид — вне показа», и первой командой —
 * «показать на всём небе» (решение 111): всё небо и перелёт к лицу.
 */
export const showSummary = computed<ShowSummary>(() => {
  const s = show.value;
  const c = showContent.value;
  const sm0 = summaryOf(s, c);
  // из «Ближайшей родни» — «вернуть прежний показ» первой командой (решение 145), и в краткой строке тоже
  const back: SummaryPart = { text: 'вернуть прежний показ', cmd: { kind: 'return' } };
  const sm = canReturn.value ? { ...sm0, cmds: [back, ...sm0.cmds], shortCmds: [back, ...sm0.shortCmds] } : sm0;
  const out = outsideOf(s, c, selected.value);
  if (!out) return sm;
  const part = { text: `; ${fullName(out)} — вне показа` };
  // «всё небо» остаётся: оно возвращает прежнее окно (IX-73); «показать на всём небе» ещё и летит к лицу
  const reveal: SummaryPart = { text: 'показать на всём небе', cmd: { kind: 'reveal', id: out } };
  const cmds = [...sm.cmds, reveal];
  // «вне показа — показать» не пропадает и в краткой строке (решение 118; UI-06): лицо — первым и без уточнения
  // («Елиав — вне показа; ключевые лица — 59 лиц»), при нехватке места обрезается конец строки, а не лицо
  const brief = { text: `${byId.get(out)?.name ?? out} — вне показа; ` };
  return {
    ...sm,
    text: [...sm.text, part],
    // без подробностей — и лицо без уточнения: «; Адам — вне показа»
    mid: [...sm.mid, { text: `; ${byId.get(out)?.name ?? out} — вне показа` }],
    short: [brief, ...sm.short],
    // и в краткой строке «всё небо» остаётся рядом с «показать на всём небе»: оно возвращает прежнее окно (IX-73)
    shortCmds: [...sm.shortCmds, ...sm.cmds.filter((c) => c.cmd?.kind === 'show' && c.cmd.show.kind === 'all'), reveal],
    cmds,
    label: sm.label + part.text,
  };
});

// ---------- лист «Показ»: разделы созвездий ----------

/** Заголовки разделов листа «Показ» (§ 7), по порядку. */
export const SECTIONS: readonly { id: GroupSection; name: string }[] = [
  { id: 'origins', name: 'От Адама до Авраама' },
  { id: 'patriarchs', name: 'Патриархи и соседние народы' },
  { id: 'tribes', name: 'Колена Израилевы' },
  { id: 'kingdoms', name: 'Царства, плен и возвращение' },
  { id: 'nt', name: 'Новый Завет' },
  { id: 'other', name: 'Прочие лица' },
];

export interface GroupRow {
  id: string;
  name: string;
  kind: Group['kind'];
  /** 0 — созвездие раздела, 1 — дом внутри колена или созвездия */
  depth: number;
  parent?: string;
  /** родоначальник (data/groups.json) */
  founder?: string;
  /** лиц в самом созвездии */
  count: number;
  /** лиц вместе с вложенными домами */
  total: number;
}
export interface GroupSectionInfo {
  id: GroupSection;
  name: string;
  /** лиц в разделе */
  count: number;
  groups: readonly GroupRow[];
}

let sectionsCache: GroupSectionInfo[] | null = null;
/** Разделы листа «Показ» с числами лиц: созвездия по порядку данных, вложенные дома — сразу за своим. */
export function groupSections(): readonly GroupSectionInfo[] {
  if (sectionsCache) return sectionsCache;
  const own = new Map<string, number>();
  for (const p of persons) own.set(p.group, (own.get(p.group) ?? 0) + 1);
  const depthOf = (g: Group) => {
    let d = 0;
    for (let x = g.parent; x && d < 8; x = groupById.get(x)?.parent) d++;
    return d;
  };
  sectionsCache = SECTIONS.map((sec) => {
    const gs = sectionGroups(sec.id);
    const rows: GroupRow[] = gs.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      depth: depthOf(g),
      ...(g.parent ? { parent: g.parent } : {}),
      ...(g.founder ? { founder: g.founder } : {}),
      count: own.get(g.id) ?? 0,
      total: withHouses(g.id).reduce((a, x) => a + (own.get(x) ?? 0), 0),
    }));
    return { id: sec.id, name: sec.name, count: rows.reduce((a, r) => a + r.count, 0), groups: rows };
  });
  return sectionsCache;
}

// ---------- связь с прежними сигналами и наблюдаемость ----------

// флажок «только линии Мессии» (src/state.ts, onlyLines) — производный от показа: показ «линии Мессии» — флажок стоит.
// Прежние органы неба ещё пишут в него (src/ui/sky/Controls.tsx): запись меняет показ
effect(() => {
  const on = show.value.kind === 'lines';
  if (onlyLines.peek() !== on) onlyLines.value = on;
});
let linesFrom: Show | null = null;
effect(() => {
  const on = onlyLines.value;
  const cur = show.peek();
  if (on && cur.kind !== 'lines') {
    linesFrom = cur;
    setShow({ kind: 'lines' });
  } else if (!on && cur.kind === 'lines') {
    const back = linesFrom ?? { kind: 'all' };
    linesFrom = null;
    setShow(back);
  }
});
// лица показа с гостями — прежнему небу (src/ui/work.ts, shownIds), пока оно не читает skyShow
effect(() => {
  const s = show.value;
  const c = showContent.value;
  const on = s.kind === 'all' || s.kind === 'set' ? null : c.guests.size ? new Set([...c.ids, ...c.guests]) : c.ids;
  batch(() => {
    if (showOn.peek() !== on) showOn.value = on;
  });
});
// показ на корне документа — для сценариев приёмки и отладки: data-show, число лиц, гостей и обрывков, укладка
if (typeof document !== 'undefined')
  effect(() => {
    const s = show.value;
    const c = showContent.value;
    const d = document.documentElement.dataset;
    d.show = showKey(s) + (showLinksField(s) ? `~x${showLinksField(s)}` : '');
    d.showIds = String(c.ids.size);
    d.showGuests = String(c.guests.size);
    d.showStubs = String(c.stubs.length);
    d.showLayout = c.layout;
    // временные гости (контракт 3)
    const g = linkGuests.value;
    if (g.length) d.linkGuests = g.join(' ');
    else delete d.linkGuests;
    // гости результатов (решение 113)
    const r = resultIds.value;
    if (r.length) d.resultGuests = r.join(' ');
    else delete d.resultGuests;
  });
// выбранная связь — там же (запись src/engine/linkkey.ts): сценарии видят её, не читая холст
if (typeof document !== 'undefined')
  effect(() => {
    const k = selectedLink.value;
    const d = document.documentElement.dataset;
    const v = k ? linkKeyString(k) : null;
    if (v) d.link = v;
    else delete d.link;
  });

/** Где лицо id: «в «Патриархах»» (для подписей гостей: «в «Доме Фарры»»). */
export const whereOf = (id: string): string => inGroup(kinData, byId.get(id)?.group ?? '');
