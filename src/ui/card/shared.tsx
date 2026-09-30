/**
 * Общие помощники карточки: годы для показа, имя лица в косвенном падеже, степени родства,
 * колено или народ по предкам, эпоха засвидетельствованной деятельности.
 *
 * Правило (docs/UI-PROMPT.md, <principles> 1): имя ставится в косвенный падеж только функцией склонения
 * (src/ui/text/ru.ts). Если она не справляется (безымянное лицо, составное имя), строка строится без этого лица.
 */
import { byId, graph, groupById, persons, loadedChrono, loadedCard, modelDependent, modelInfoOf } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Cert, Epoch, Sex } from '../../data/types.ts';
import { P, ROLE_NAMES } from '../common.tsx';
import { declinableForm, nameCase, realmInstrumental } from '../text/ru.ts';
import { typo } from '../text/typo.ts';
import { yearsWord, dateText, lifeDates, spanText, toAstro, toHist, type LifeDates } from '../../engine/years.ts';

/**
 * Строка колофона о модели хронологии (решение 96): только у лица, чьи годы действительно меняются между моделями
 * (IdxPerson.modelDep); название — из сводки моделей сборки (modelInfo, решение 102).
 */
export function modelColophon(ids: string[], modelId: string): string {
  if (!ids.some(modelDependent)) return '';
  return ` Годы — по модели хронологии «${modelInfoOf(modelId).name}»; в других моделях они иные (см. § 13 и «О хронологии»).`;
}

/** Ослабленное движение (prefers-reduced-motion): переходы без плавной прокрутки (MOB-40). */
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Раздел n внутри карточки root: свой блок (#sec-n) или сведённая строка «9–12», в которую он входит.
 */
export function sectionEl(n: number, root: ParentNode = document): HTMLElement | null {
  const own = root.querySelector<HTMLElement>(`[id="sec-${n}"]`);
  if (own) return own;
  for (const r of root.querySelectorAll<HTMLElement>('.sec[data-to]')) {
    if (n >= Number(r.dataset.n) && n <= Number(r.dataset.to)) return r;
  }
  return null;
}

/**
 * Перейти к разделу n (решение 115; UI-03): прокрутка к нему — без плавности при ослабленном движении — и фокус на его
 * заголовок (tabindex −1), чтобы следующий Tab продолжал чтение там, а не с «см. §».
 */
export function goToSection(n: number, root: ParentNode = document): boolean {
  const el = sectionEl(n, root);
  if (!el) return false;
  el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  const h = el.querySelector<HTMLElement>(`[id="h-${n}"]`) ?? el;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  h.focus({ preventScroll: true });
  return true;
}

/**
 * Перекрёстная ссылка «см. § 8» — команда: переходит к разделу и переносит на его заголовок фокус (CARD-31; решение 115).
 * Сначала спрашивает карточку (событие seesec): свёрнутую малую карточку она раскрывает и переходит сама; вне карточки —
 * переход здесь же.
 */
export function SeeSec({ n }: { n: number }) {
  return (
    <button
      type="button"
      class="see"
      onClick={(e) => {
        const from = e.currentTarget as HTMLElement;
        const ev = new CustomEvent<number>('seesec', { detail: n, bubbles: true, cancelable: true });
        if (from.dispatchEvent(ev)) goToSection(n, from.closest('.folio') ?? document);
      }}
    >
      см.{' '}§{' '}{n}
    </button>
  );
}

// ---------- годы ----------


/**
 * Возможный промежуток года рождения с учётом границ из данных: «не раньше чем через 601 год после рождения Ноя»
 * (Мицраим родился после Потопа), «не позже…», допустимый интервал. Решатель считает промежуток симметричным,
 * и без этих границ карточка называла бы годы, которые данные исключают.
 */
export function birthRange(id: string, c: ChronoRow, chrono: Map<string, ChronoRow>): [number, number] {
  const born = loadedChrono(id)?.born;
  let lo = c.bLo;
  let hi = c.bHi;
  const from = (x: { from: string; years: number } | undefined) => {
    const f = x ? chrono.get(x.from) : undefined;
    return x && f && f.cls !== 'epochal' ? f.b + x.years : null;
  };
  const nb = from(born?.notBefore);
  const na = from(born?.notAfter);
  if (nb !== null) lo = Math.max(lo, nb);
  if (na !== null) hi = Math.min(hi, na);
  if (born?.range) {
    lo = Math.max(lo, toAstro(born.range[0]));
    hi = Math.min(hi, toAstro(born.range[1]));
  }
  if (lo > hi) return [c.bLo, c.bHi]; // границы противоречат расчёту — показать расчёт как есть
  return [Math.min(lo, c.b), Math.max(hi, c.b)];
}

/**
 * Годы лица для словаря дат (решение 96) с границами текста (birthRange): одни и те же в паспорте, § 8, § 20 и на
 * мини-шкале. c — строка модели, chrono — все строки этой модели.
 */
export function datesOf(id: string, c: ChronoRow, chrono: Map<string, ChronoRow>): ChronoRow {
  const [bLo, bHi] = birthRange(id, c, chrono);
  return { ...c, bLo, bHi };
}

/**
 * § 8: год рождения словами словаря (решение 96): «1446 г. до Р. Х.», «ок. 1330 г. до Р. Х.», «между 45 и 20 гг. до
 * Р. Х.», «не позже 1876 г. до Р. Х.»; у лиц без опор (epochal) годов нет.
 */
export function birthLine(c: LifeDates, range?: [number, number]): string {
  const ld = lifeDates(range ? { ...c, bLo: range[0], bHi: range[1] } : c);
  return ld ? dateText(ld.birth) : 'Время не установлено';
}

// ---------- царствование: § 16 карточки и «Сквозной раздел» говорят одними словами (CARD-51) ----------

/** Царствование из данных: и из тома карточки (со стихами), и из индекса. */
export type ReignLike = { over: string; start: number; end: number; years?: number | null; ageAtStart?: number; note?: string; refs?: string[] };

const TEXT_NOTE = /^по тексту\s*—\s*/;
/** Пояснение «по тексту — семь лет и шесть месяцев» точнее круглого числа лет и заменяет его. */
export const reignNoteIsText = (r: ReignLike) => !!r.note && TEXT_NOTE.test(r.note);

/** Срок царствования по тексту: «семь лет и шесть месяцев» (из пояснения) или «33 года»; null — текст срока не даёт. */
export function reignLength(r: ReignLike): string | null {
  if (reignNoteIsText(r)) return r.note!.replace(TEXT_NOTE, '');
  return r.years ? yearsWord(r.years) : null;
}

/** Годы царствования по реконструкции (расч.): «1010–1003 гг. до Р. Х.»; годы в данных — исторические. */
export function reignSpan(r: ReignLike): string {
  return spanText({ t: toAstro(r.start) }, { t: toAstro(r.end) });
}

/**
 * Строка царствования для перечня: «семь лет и шесть месяцев над Иудеей, в Хевроне»; «33 года над всем Израилем».
 * Без срока — «над Иудеей»; царство не склоняется — «царство — …» (имя не ставится в падеж без склонения).
 */
export function reignOverLine(r: ReignLike): string {
  const len = reignLength(r);
  const ins = realmInstrumental(r.over);
  const where = ins ? `над ${ins}` : `царство — ${r.over}`;
  return len ? `${len} ${where}` : capFirstRu(where);
}
const capFirstRu = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Строка о царствовании со стихами: основная или пояснение (соправление, синхронизм, возраст при воцарении). */
export type ReignWord = { text: string; refs: string[] };

/**
 * Соправления словами (решения 97, 103; X2 Д9): «792–767 — вместе с отцом, Амасией; один — с 767, в 27-й год
 * Иеровоама (4 Цар 15:1)»; «750–740 — вместе с сыном, Иоафамом». Перекрытие — с царствованием отца или сына над той же
 * землёй; «один — с …» — по reign.sole данных; синхронизм текста — числом Писания со стихом, без пометы.
 * reigns — царствования со стихами (том карточки) или из индекса.
 */
/** Промежуток без эры, если она одна (строка под годами, где эра уже названа): «792–767». */
const spanNoEra = (a: number, b: number) => {
  const t = spanText({ t: a }, { t: b });
  return (t.match(/Р\.\u00a0Х\./g) ?? []).length === 1 ? t.replace(/\u00a0гг?\.\u00a0(до|по)\u00a0Р\.\u00a0Х\.$/, '') : t;
};

export function reignWords(id: string, reigns: (ReignLike & { sole?: number; sync?: { with: string; year: number; refs: string[] }[] })[]): ReignWord[] {
  const p = byId.get(id);
  if (!p) return [];
  const out: ReignWord[] = [];
  const kinOf = (who: string) => {
    const q = byId.get(who);
    return q ? nameCase(q.name, q.sex, 'ins', q.unnamed, q.alt) : null;
  };
  const withWord = (role: 'отцом' | 'матерью' | 'сыном' | 'дочерью', who: string) => {
    const ins = kinOf(who);
    return ins ? `вместе с ${role}, ${ins}` : `вместе с ${role} (${byId.get(who)?.name ?? who})`;
  };
  const syncText = (sy: { with: string; year: number }) => {
    const g = nameIn(sy.with, 'gen');
    return g ? `в ${sy.year}-й год ${g}` : null;
  };
  const idxReign = (r: ReignLike) => p.reign.find((q) => q.over === r.over && q.start === r.start);
  const sons = (graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
  for (const r of reigns) {
    const sole = (r as { sole?: number }).sole ?? idxReign(r)?.sole;
    const syncs = (r as { sync?: { with: string; year: number; refs: string[] }[] }).sync ?? idxReign(r)?.sync ?? [];
    const a0 = toAstro(r.start);
    const b0 = toAstro(r.end);
    // с отцом или матерью (в начале царствования), с сыном (в конце): перекрытие царствований одной земли
    const parents = [p.father, p.mother].filter((x): x is string => !!x);
    for (const par of parents)
      for (const q of byId.get(par)?.reign ?? []) {
        if (q.over !== r.over) continue;
        const a = Math.max(a0, toAstro(q.start));
        const b = Math.min(b0, toAstro(q.end));
        if (b <= a) continue;
        const sy = sole !== undefined ? syncs[0] : undefined;
        const alone = sole !== undefined ? `; один — с ${Math.abs(toHist(toAstro(sole)))}${sy && syncText(sy) ? `, ${syncText(sy)}` : ''}` : '';
        out.push({ text: `${spanNoEra(a, b)} — ${withWord(byId.get(par)!.sex === 'f' ? 'матерью' : 'отцом', par)}${alone}`, refs: sy && alone.includes('-й год') ? sy.refs : [] });
      }
    for (const son of sons)
      for (const q of byId.get(son)?.reign ?? []) {
        if (q.over !== r.over || toAstro(q.start) <= a0) continue;
        const a = Math.max(a0, toAstro(q.start));
        const b = Math.min(b0, toAstro(q.end));
        if (b <= a) continue;
        out.push({ text: `${spanNoEra(a, b)} — ${withWord(byId.get(son)!.sex === 'f' ? 'дочерью' : 'сыном', son)}`, refs: [] });
      }
  }
  return out;
}

// ---------- имена в косвенных падежах ----------

const WORD = /^[А-ЯЁ][а-яё]+$/;

/** Винительный падеж имени: у одушевлённых мужского рода на согласный он равен родительному. */
function accusative(name: string, sex: Sex, forms: readonly string[] = []): string | null {
  const out: string[] = [];
  for (const word of name.split(' ')) {
    const w = declinableForm(word, forms);
    if (!WORD.test(w) || /[аеёиоуыэюя]а$/.test(w)) return null;
    let r: string | null;
    if (/ия$/.test(w)) r = `${w.slice(0, -1)}ю`; // Илия → Илию, Мария → Марию
    else if (/а$/.test(w)) r = `${w.slice(0, -1)}у`; // Иуда → Иуду, Сарра → Сарру
    else if (/я$/.test(w)) r = `${w.slice(0, -1)}ю`;
    else if (sex === 'f') r = /[ьбвгджзклмнпрстфхцчшщ]$/.test(w) ? w : null; // Руфь, Мариам
    else r = nameCase(w, 'm', 'gen'); // Ной → Ноя, Авраам → Авраама
    if (r === null) return null;
    out.push(r);
  }
  return out.join(' ');
}

/** Имя лица в родительном или винительном падеже; null — если надёжно просклонять нельзя. */
export function nameIn(id: string, cs: 'gen' | 'acc'): string | null {
  const p = byId.get(id);
  if (!p || p.unnamed) return null;
  // «Далуиа» склоняется по форме текста «Далуия» (1 Пар 3:1): «до сына, Далуии» (CARD-86)
  return cs === 'gen' ? nameCase(p.name, p.sex, 'gen', false, p.alt) : accusative(p.name, p.sex, p.alt);
}

/**
 * Ссылка на лицо в косвенном падеже; вызывающий заранее проверяет nameIn.
 * after — знак препинания сразу за именем: он держится за ссылку (кнопка — строчный блок, перед знаком возможен перенос).
 */
export function PersonIn({ id, cs, after, dis = false }: { id: string; cs: 'gen' | 'acc'; after?: string; dis?: boolean }) {
  const name = <P id={id}>{nameIn(id, cs) ?? byId.get(id)?.name ?? id}</P>;
  // dis — тёзка в карточке (решение 106): уточнение сразу за именем, до знака препинания
  const q = byId.get(id);
  const link =
    dis && q?.disambig ? (
      <>
        {name}
        <span class="muted"> ({typo(q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1'))})</span>
      </>
    ) : (
      name
    );
  return after ? (
    <span class="nobr">
      {link}
      {after}
    </span>
  ) : (
    link
  );
}

/** Сколько лиц атласа носят имя: одноимённых различает уточнение. */
const nameCount = new Map<string, number>();
for (const q of persons) nameCount.set(q.name, (nameCount.get(q.name) ?? 0) + 1);

/** Уточнение для одноимённого: «Иоанна (называемый Марком)»; у единственного носителя имени — ничего. */
export function Namesake({ id }: { id: string }) {
  const p = byId.get(id);
  return p && p.disambig && (nameCount.get(p.name) ?? 0) > 1 ? <span class="muted"> ({typo(p.disambig)})</span> : null;
}

/** Ссылка на лицо с именем в родительном падеже («после рождения Иехонии»); без склонения — именительный. */
export function PG({ id }: { id: string }) {
  return <PersonIn id={id} cs="gen" />;
}

// ---------- степени родства по прямой линии ----------

const UP: [string, string, string][] = [
  // [мужской род. = вин., женский род., женский вин.]
  ['отца', 'матери', 'мать'],
  ['деда', 'бабушки', 'бабушку'],
  ['прадеда', 'прабабушки', 'прабабушку'],
  ['прапрадеда', 'прапрабабушки', 'прапрабабушку'],
];
const DOWN: [string, string, string][] = [
  ['сына', 'дочери', 'дочь'],
  ['внука', 'внучки', 'внучку'],
  ['правнука', 'правнучки', 'правнучку'],
  ['праправнука', 'праправнучки', 'праправнучку'],
];

/**
 * Степень родства по прямой линии в родительном или винительном падеже: «отца», «прабабушку», «предка в 10-м поколении».
 * gap — на пути есть связь, пропускающая поколения (Мф 1:8): тогда число поколений не называется.
 */
export function kinDegree(steps: number, dir: 'up' | 'down', sex: Sex, cs: 'gen' | 'acc', gap = false): string {
  const table = dir === 'up' ? UP : DOWN;
  if (steps >= 1 && steps <= table.length && (steps === 1 || !gap)) {
    const row = table[steps - 1];
    return sex === 'f' ? row[cs === 'gen' ? 1 : 2] : row[0];
  }
  const noun = dir === 'up' ? (sex === 'f' ? (cs === 'gen' ? 'прародительницы' : 'прародительницу') : 'предка') : 'потомка';
  return gap ? noun : `${noun} в ${steps}-м поколении`;
}

// ---------- колено и народ по предкам ----------

/** Сыновья Иакова и Иосифа — родоначальники колен: [именительный, родительный, предложный]. */
const TRIBES: Record<string, [string, string, string]> = {
  ruvim: ['колено Рувимово', 'колена Рувимова', 'колене Рувимовом'],
  simeon: ['колено Симеоново', 'колена Симеонова', 'колене Симеоновом'],
  leviy: ['колено Левиино', 'колена Левиина', 'колене Левиином'],
  iuda: ['колено Иудино', 'колена Иудина', 'колене Иудином'],
  dan: ['колено Даново', 'колена Данова', 'колене Дановом'],
  neffalim: ['колено Неффалимово', 'колена Неффалимова', 'колене Неффалимовом'],
  gad: ['колено Гадово', 'колена Гадова', 'колене Гадовом'],
  asir: ['колено Асирово', 'колена Асирова', 'колене Асировом'],
  issakhar: ['колено Иссахарово', 'колена Иссахарова', 'колене Иссахаровом'],
  zavulon: ['колено Завулоново', 'колена Завулонова', 'колене Завулоновом'],
  veniamin: ['колено Вениаминово', 'колена Вениаминова', 'колене Вениаминовом'],
  efrem: ['колено Ефремово', 'колена Ефремова', 'колене Ефремовом'],
  manassiya: ['колено Манассиино', 'колена Манассиина', 'колене Манассиином'],
};
/** Дома внутри колена (2 Цар 3:1; Пс 113:18). */
const HOUSES: Record<string, string> = { david: 'дом Давидов', aaron: 'дом Ааронов', saul: 'дом Саулов' };
/** Родоначальники народов: родительный падеж множественного числа (Быт 19:37–38; 36:9; 37:25, 36). */
const NATIONS: Record<string, string> = { isav: 'идумеев', moav: 'моавитян', 'ben-ammi': 'аммонитян', izmail: 'измаильтян', madian: 'мадианитян' };
/** Прозвания по колену в уточнении имени: «Бани Гадитянин» (2 Цар 23:36). */
const TRIBE_GENTILIC: [RegExp, string][] = [
  [/(^|[^а-яё])вениамитян(ин|ка)/i, 'veniamin'],
  [/(^|[^а-яё])гадитян(ин|ка)/i, 'gad'],
  [/(^|[^а-яё])завулонян(ин|ка)/i, 'zavulon'],
  [/(^|[^а-яё])рувимлян(ин|ка)/i, 'ruvim'],
  [/(^|[^а-яё])ефремлян(ин|ка)/i, 'efrem'],
];
/** Прозвания по народу в уточнении имени: «Моавитянка», «Урия Хеттеянин». */
const NATION_GENTILIC =
  /(^|[^а-яё])((моавитян|аммонитян|идумеян|хеттеян|хананеян|египтян|мадианитян|аморреян|евеян|хорреян|иевусеян|филистимлян|ефиоплян|арамеян|измаильтян|кенеян|амаликитян|мидян|сидонян)(ин|ка))(?![а-яё])/i;

export interface Affiliation {
  /** одной строкой — для строк вне паспорта (небо, «Сквозной раздел»): «моавитянка; в колене Иудином по браку» */
  text: string;
  /** колено, к которому лицо принадлежит по предкам (для «по браку» у жены) */
  tribe: string | null;
  /**
   * Происхождение (решение 97; X4 § 2.5): строка паспорта «Колено / народ» без пометы в тексте — «колено Иудино, дом
   * Давидов»; cert — уровень, помета «толк.» или «выв.» стоит на поле. null — колено по происхождению не вычисляется.
   */
  own: { text: string; cert: Cert; fromText?: boolean } | null;
  /** Строка «По браку»: «колено Иудино (жена Вооза)»; null — брак колена не меняет или колено мужа неизвестно. */
  marriage: string | null;
}

type Qual = '' | 'legal' | 'interpretation' | 'inference';
const QUAL_RANK: Record<Qual, number> = { '': 0, inference: 1, legal: 1, interpretation: 2 };
const QUAL_TEXT: Record<Qual, string> = { '': '', inference: '', legal: '\u00a0— по законному отцу', interpretation: '\u00a0— по толкованию' };

/** Колено, названное в записи § 7: «Из колена Вениаминова» (Флп 3:5), «От колена Асирова» (Лк 2:36). */
const TRIBE_IN_TEXT = /(?:^|[\s«,;:—(])(?:из|от)\s+колена\s+([А-ЯЁ][а-яё]+)/i;
function tribeInLineage(id: string): { tribe: string; cert: Cert } | null {
  for (const f of loadedCard(id)?.lineage ?? []) {
    const m = TRIBE_IN_TEXT.exec(f.text);
    if (!m) continue;
    const t = Object.keys(TRIBES).find((k) => TRIBES[k][1].split(' ')[1] === m[1]);
    if (t) return { tribe: t, cert: f.cert ?? 'scripture' };
  }
  return null;
}

/** Ближайший родоначальник колена или народа по линии отцов и матерей (без связей «по иному указанию»). */
function byAncestry(id: string, noLegal = false): { founder: string; house: string | null; qual: Qual; self: boolean } | null {
  if (TRIBES[id] || NATIONS[id]) return { founder: id, house: null, qual: '', self: true };
  type Node = { id: string; depth: number; qual: Qual; house: string | null };
  const best = new Map<string, Node>();
  const queue: Node[] = [{ id, depth: 0, qual: '', house: null }];
  let hit: Node | null = null;
  while (queue.length) {
    const n = queue.shift()!;
    if (n.depth > 90) continue;
    for (const e of graph.parentsOf.get(n.id) ?? []) {
      if (e.kind !== 'father' && e.kind !== 'mother') continue;
      if (noLegal && e.claim === 'legal') continue;
      const q: Qual = e.cert === 'interpretation' || n.qual === 'interpretation' ? 'interpretation' : e.claim === 'legal' || n.qual === 'legal' ? 'legal' : '';
      const house = n.house ?? (HOUSES[e.parent] ? e.parent : null);
      const next: Node = { id: e.parent, depth: n.depth + 1, qual: q, house };
      if (TRIBES[e.parent] || NATIONS[e.parent]) {
        if (!hit || QUAL_RANK[q] < QUAL_RANK[hit.qual] || (QUAL_RANK[q] === QUAL_RANK[hit.qual] && next.depth < hit.depth)) hit = next;
        continue;
      }
      const seen = best.get(e.parent);
      if (seen && QUAL_RANK[seen.qual] <= QUAL_RANK[q]) continue;
      best.set(e.parent, next);
      queue.push(next);
    }
  }
  if (!hit) return null;
  // законная линия и линия по толкованию ведут к одному колену и дому — колено названо без пометы
  // (Иисус Христос: Мф 1:16 и Лк 3:23; «из колена Иудина» прямо сказано в Евр 7:14)
  const other = hit.qual === 'legal' && !noLegal ? byAncestry(id, true) : null;
  const agreed = !!other && other.founder === hit.id && other.house === hit.house;
  return { founder: hit.id, house: hit.house, qual: agreed ? '' : hit.qual, self: false };
}

/** Колено или народ без учёта брака: по предкам, по прозванию в уточнении, по служению левита, по записи § 7. */
function ownAffiliation(id: string, lineage = true): { text: string; tribe: string | null; qual: Qual } | null {
  const p = byId.get(id);
  if (!p) return null;
  const a = byAncestry(id);
  if (a) {
    const t = TRIBES[a.founder];
    if (a.self) return t ? { text: `родоначальник ${t[1]}`, tribe: a.founder, qual: '' } : { text: `родоначальник ${NATIONS[a.founder]}`, tribe: null, qual: '' };
    if (t) return { text: `${t[0]}${a.house ? `, ${HOUSES[a.house]}` : ''}${QUAL_TEXT[a.qual]}`, tribe: a.founder, qual: a.qual };
    return { text: `из ${NATIONS[a.founder]}${QUAL_TEXT[a.qual]}`, tribe: null, qual: a.qual };
  }
  const dis = p.disambig ?? '';
  for (const [re, tribe] of TRIBE_GENTILIC) if (re.test(dis)) return { text: TRIBES[tribe][0], tribe, qual: '' };
  const g = NATION_GENTILIC.exec(dis);
  if (g) return { text: g[2].toLowerCase(), tribe: null, qual: '' };
  if (p.roles.includes('levite')) return { text: TRIBES.leviy[0], tribe: 'leviy', qual: '' };
  // колено названо только в § 7 (решение 97; D9): Павел — «из колена Вениаминова» (Флп 3:5), Анна — Асирова (Лк 2:36)
  const said = lineage ? tribeInLineage(id) : null;
  if (said) return { text: TRIBES[said.tribe][0], tribe: said.tribe, qual: said.cert === 'interpretation' ? 'interpretation' : said.cert === 'inference' ? 'inference' : '' };
  return null;
}

/**
 * Строка паспорта «Колено / народ»: «колено Иудино, дом Давидов»; «моавитянка; в колене Иудином по браку».
 * null — если по данным колено или народ не вычисляется.
 */
export function affiliation(id: string): Affiliation | null {
  const p = byId.get(id);
  if (!p) return null;
  const own = ownAffiliation(id);
  // жена входит в колено мужа: «в колене Иудином по браку» (если своё колено другое, неизвестно или по толкованию)
  let marriage: string | null = null;
  let married: string | null = null;
  if (p.sex === 'f') {
    const tribes = new Map<string, string[]>();
    for (const s of graph.spousesOf.get(id) ?? []) {
      if (s.b !== id) continue;
      // колено мужа — только по графу: запись § 7 его тома может быть ещё не загружена
      const h = ownAffiliation(s.a, false);
      if (h?.tribe && h.qual === '') tribes.set(h.tribe, [...(tribes.get(h.tribe) ?? []), s.a]);
    }
    if (tribes.size === 1) {
      const [t, men] = [...tribes][0];
      if (!own || own.tribe !== t || own.qual !== '') {
        marriage = `в ${TRIBES[t][2]} по браку`;
        // «колено Иудино (жена Вооза)»; имя не склоняется или мужей несколько — «(муж — Вооз)», «(мужья — …)»
        const gen = men.length === 1 ? nameIn(men[0], 'gen') : null;
        const who = gen ? `жена ${gen}` : `${men.length > 1 ? 'мужья' : 'муж'} — ${men.map((x) => byId.get(x)?.name ?? x).join(', ')}`;
        married = `${TRIBES[t][0]} (${who})`;
      }
    }
  }
  if (!own && !marriage) return null;
  const cert: Cert = own?.qual === 'interpretation' ? 'interpretation' : own?.qual === 'inference' ? 'inference' : 'scripture';
  // помета толкования — на поле (Mark), а не хвостом строки; «по законному отцу» — слова, не уровень
  const ownText = own ? own.text.replace(QUAL_TEXT.interpretation, '') : null;
  const fromText = !!own && !byAncestry(id) && !!tribeInLineage(id) && own.tribe === tribeInLineage(id)!.tribe;
  return { text: [own?.text, marriage].filter(Boolean).join('; '), tribe: own?.tribe ?? null, own: ownText ? { text: ownText, cert, fromText } : null, marriage: married };
}

/**
 * Колено или народ для строки «Кратко» (F3): «из колена Иудина», «из дома Давидова», «из моавитян», «моавитянка».
 * Только своё (по предкам, прозванию, служению), без «по браку» и без пометы «по толкованию»; null — если не вычисляется.
 * founder — родоначальник колена или народа: у его детей строка «сын Рувима из колена Рувимова» была бы повтором.
 */
export function affiliationFrom(id: string): { text: string; founder: string | null } | null {
  const p = byId.get(id);
  if (!p) return null;
  const a = byAncestry(id);
  if (a) {
    if (a.self || a.qual !== '') return null;
    const t = TRIBES[a.founder];
    if (a.house) return { text: `из ${HOUSES_GEN[a.house]}`, founder: a.house };
    return t ? { text: `из ${t[1]}`, founder: a.founder } : { text: `из ${NATIONS[a.founder]}`, founder: a.founder };
  }
  const dis = p.disambig ?? '';
  for (const [re, tribe] of TRIBE_GENTILIC) if (re.test(dis)) return { text: `из ${TRIBES[tribe][1]}`, founder: null };
  const g = NATION_GENTILIC.exec(dis);
  if (g) return { text: g[2].toLowerCase(), founder: null };
  return null;
}
const HOUSES_GEN: Record<string, string> = { david: 'дома Давидова', aaron: 'дома Ааронова', saul: 'дома Саулова' };

/** Созвездие на небе; служебная группа «Прочие лица» созвездием не называется. */
export function constellation(groupId: string): string | null {
  const g = groupById.get(groupId);
  return g && g.kind !== 'other' ? g.name : null;
}

// ---------- эпохи ----------

/**
 * Эпоха рождения (CARD-78): у лица с годом рождения — по этому году в текущей модели (c.b), с теми же границами эпох,
 * что в строке «Эпоха рождения: … (1050–931 гг. до Р. Х.)»; эпоха из данных — только у лиц без годов (epochal)
 * и у народа или рода: их строка подписана «Эпоха:», а не «Эпоха рождения:».
 */
export function birthEpoch(id: string, c: ChronoRow | undefined, epochs: Epoch[]): Epoch | null {
  const p = byId.get(id);
  const people = p?.kind === 'people' || p?.kind === 'clan';
  // сборка этапа 13 (контракт 1): эпоха года рождения в этой модели — ChronoRow.birthEpoch (есть, когда есть lifeEpoch)
  if (c && c.cls !== 'epochal' && !people && c.lifeEpoch && c.birthEpoch) return epochs.find((e) => e.id === c.birthEpoch) ?? epochAtYear(epochs, c.b);
  if (c && c.cls !== 'epochal' && !people && epochs.length) return epochAtYear(epochs, c.b);
  const eid = p?.epoch ?? c?.epoch ?? null;
  return epochs.find((e) => e.id === eid) ?? null;
}

/** Эпоха, в границы которой попадает астрономический год t: начало включено, конец — нет; за краями — крайняя эпоха. */
export function epochAtYear(epochs: Epoch[], t: number): Epoch {
  for (const e of epochs) if (t >= toAstro(e.start) && t < toAstro(e.end)) return e;
  return t < toAstro(epochs[0].start) ? epochs[0] : epochs[epochs.length - 1];
}

/**
 * Эпохи засвидетельствованной деятельности (для паспорта): годы царствования, годы засвидетельствованной жизни,
 * у лиц с датами по числам текста — от рождения до смерти или последнего события. Иначе — эпоха рождения.
 */
export function activityEpochs(id: string, c: ChronoRow | undefined, epochs: Epoch[]): Epoch[] {
  const p = byId.get(id);
  if (!p) return [];
  let span: [number, number] | null = null;
  if (p.reign.length) span = [toAstro(Math.min(...p.reign.map((r) => r.start))), toAstro(Math.max(...p.reign.map((r) => r.end)))];
  else if (p.active) span = [toAstro(p.active[0]), toAstro(p.active[1])];
  else if (c && (c.cls === 'exact' || c.cls === 'calculated') && (c.d ?? c.last) !== null) span = [c.b, (c.d ?? c.last)!];
  if (span) {
    const [a, b] = span;
    const hit = epochs.filter((e) => {
      const s = toAstro(e.start);
      const t = toAstro(e.end);
      return b > a ? Math.min(b, t) - Math.max(a, s) > 0 : a >= s && a < t;
    });
    if (hit.length) return hit;
  }
  const be = birthEpoch(id, c, epochs);
  return be ? [be] : [];
}

/**
 * Эпоха жизни (решение 98; X1 Х1): по засвидетельствованной жизни — первое найденное из
 *  1. служения или царствования (эпоха, на которую приходится большая часть срока);
 *  2. событий с годом (§ 17);
 *  3. поля epoch данных — «эпоха жизни»;
 *  4. года рождения.
 * Паспорт, мини-шкала, диктор и § 13 называют одну и ту же эпоху. У народа и рода — эпоха места в родословии.
 * До контракта 1 (ChronoRow.lifeEpoch от T3) эпоха считается здесь; потом берётся из сборки.
 */
export function lifeEpoch(id: string, c: ChronoRow | undefined, epochs: Epoch[]): Epoch | null {
  const p = byId.get(id);
  if (!p || !epochs.length) return null;
  const built = (c as (ChronoRow & { lifeEpoch?: string | null }) | undefined)?.lifeEpoch;
  if (built) return epochs.find((e) => e.id === built) ?? null;
  if (p.kind === 'people' || p.kind === 'clan') return birthEpoch(id, c, epochs);
  let span: [number, number] | null = null;
  if (p.reign.length) span = [toAstro(Math.min(...p.reign.map((r) => r.start))), toAstro(Math.max(...p.reign.map((r) => r.end)))];
  else if (p.active) span = [toAstro(p.active[0]), toAstro(p.active[1])];
  if (span) {
    const [a, b] = span;
    let best: Epoch | null = null;
    let most = -1;
    for (const e of epochs) {
      const s = toAstro(e.start);
      const t = toAstro(e.end);
      const over = b > a ? Math.min(b, t) - Math.max(a, s) : a >= s && a < t ? 1 : -1;
      if (over > most) (best = e), (most = over);
    }
    if (best && most > 0) return best;
  }
  const dated = (loadedCard(id)?.events ?? []).find((e) => e.year !== undefined);
  if (dated) return epochAtYear(epochs, toAstro(dated.year!));
  const eid = p.epoch ?? null;
  const own = eid ? epochs.find((e) => e.id === eid) : null;
  if (own) return own;
  return birthEpoch(id, c, epochs);
}

// ---------- роль словами Писания ----------

/**
 * Ремесло словами Писания вместо общего «мастер» (роль craftsman): Иосиф — «плотник» («не плотников ли Он сын?»,
 * Мф 13:55), Хирам — «медник» (3 Цар 7:14), Акила — «делатель палаток» (Деян 18:3). Слово берётся из уточнения
 * и текстов карточки лица; если его там нет — «мастер».
 */
const CRAFTS: [RegExp, string, string][] = [
  [/плотник/i, 'плотник', 'плотник'],
  [/медник/i, 'медник', 'медник'],
  [/серебряник/i, 'серебряник', 'серебряник'],
  [/делател[ья] палаток|делани[ея] палаток/i, 'делатель палаток', 'делательница палаток'],
  [/ковач/i, 'ковач', 'ковач'],
];

/** Роли лица строкой для паспорта и «Кратко»: «царь, пастух, певец»; ремесло — словом Писания. */
export function roleLabel(id: string): string {
  const p = byId.get(id);
  if (!p) return '';
  const f = p.sex === 'f' ? 1 : 0;
  let craft: string | null = null;
  if (p.roles.includes('craftsman')) {
    const texts = `${p.disambig} ${JSON.stringify(loadedCard(id) ?? {})}`;
    const hit = CRAFTS.find(([re]) => re.test(texts));
    craft = hit ? (f ? hit[2] : hit[1]) : null;
  }
  return p.roles.map((r) => (r === 'craftsman' && craft ? craft : (ROLE_NAMES[r]?.[f] ?? r))).join(', ');
}

/** Название одной роли по полу — с тем же словом ремесла, что в паспорте. */
export function roleNoun(id: string, role: string): string {
  const p = byId.get(id)!;
  if (role === 'craftsman') return roleLabel(id).split(', ')[p.roles.indexOf('craftsman')];
  return ROLE_NAMES[role as keyof typeof ROLE_NAMES]?.[p.sex === 'f' ? 1 : 0] ?? role;
}
