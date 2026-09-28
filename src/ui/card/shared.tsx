/**
 * Общие помощники карточки: годы для показа, имя лица в косвенном падеже, степени родства,
 * колено или народ по предкам, эпоха засвидетельствованной деятельности.
 *
 * Правило (docs/UI-PROMPT.md, <principles> 1): имя ставится в косвенный падеж только функцией склонения
 * (src/ui/text/ru.ts). Если она не справляется (безымянное лицо, составное имя), строка строится без этого лица.
 */
import { byId, graph, groupById, persons, loadedChrono, loadedCard } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Epoch, Sex } from '../../data/types.ts';
import { P, ROLE_NAMES } from '../common.tsx';
import { nameCase, realmInstrumental, yearsGen } from '../text/ru.ts';
import { typo } from '../text/typo.ts';
import { formatYear, formatSpan, yearsWord, shownYears, shownBirthRange, toAstro, type LifeDates } from '../../engine/years.ts';

/** Перекрёстная ссылка «см. § 8» — команда: переходит к разделу (CARD-31). */
export function SeeSec({ n }: { n: number }) {
  return (
    <button type="button" class="see" onClick={() => document.getElementById(`sec-${n}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
      см.{' '}§{' '}{n}
    </button>
  );
}

// ---------- годы ----------

const NB = '\u00a0'; // неразрывный пробел перед тире

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

/** § 8: год рождения. Оценка — с возможным промежутком; у лиц без опор (epochal) годов нет. */
export function birthLine(c: LifeDates, range?: [number, number]): string {
  const y = shownYears(c);
  if (!y) return 'Время не установлено';
  if (c.cls !== 'estimated') return formatYear(y.b, { approx: y.approx });
  const [lo, hi] = shownBirthRange(range ? { ...c, bLo: range[0], bHi: range[1] } : c);
  return `${formatYear(y.b, { approx: true })}; возможный промежуток${NB}— ${formatSpan(lo, hi)}`;
}

/** § 20: год смерти и возраст — те же числа, что в паспорте. */
export function deathLine(b: number, d: number, cls: string, bLo = b, bHi = b): string {
  const y = shownYears({ b, bLo, bHi, d, cls: cls as LifeDates['cls'] });
  if (!y || y.d === null) return '';
  // «умер младенец» (2 Цар 12:18): возраст меньше года — словом, а не «в возрасте 0 лет»;
  // после «в возрасте» — родительный падеж: «34 лет», «21 года» (CARD-50)
  const age = Math.round(d - b);
  return `${formatYear(y.d, { approx: y.approx })}, ${age < 1 ? 'младенцем' : `в возрасте ${yearsGen(age)}`}`;
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
  return r.start === r.end ? formatYear(toAstro(r.start)) : formatSpan(toAstro(r.start), toAstro(r.end));
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

// ---------- имена в косвенных падежах ----------

const WORD = /^[А-ЯЁ][а-яё]+$/;

/** Винительный падеж имени: у одушевлённых мужского рода на согласный он равен родительному. */
function accusative(name: string, sex: Sex): string | null {
  const out: string[] = [];
  for (const w of name.split(' ')) {
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
  return cs === 'gen' ? nameCase(p.name, p.sex, 'gen') : accusative(p.name, p.sex);
}

/**
 * Ссылка на лицо в косвенном падеже; вызывающий заранее проверяет nameIn.
 * after — знак препинания сразу за именем: он держится за ссылку (кнопка — строчный блок, перед знаком возможен перенос).
 */
export function PersonIn({ id, cs, after }: { id: string; cs: 'gen' | 'acc'; after?: string }) {
  const link = <P id={id}>{nameIn(id, cs) ?? byId.get(id)?.name ?? id}</P>;
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
  /** строка паспорта «Колено / народ» */
  text: string;
  /** колено, к которому лицо принадлежит по предкам (для «по браку» у жены) */
  tribe: string | null;
}

type Qual = '' | 'legal' | 'interpretation';
const QUAL_RANK: Record<Qual, number> = { '': 0, legal: 1, interpretation: 2 };
const QUAL_TEXT: Record<Qual, string> = { '': '', legal: '\u00a0— по законному отцу', interpretation: '\u00a0— по толкованию' };

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

/** Колено или народ без учёта брака: по предкам, по прозванию в уточнении, по служению левита. */
function ownAffiliation(id: string): { text: string; tribe: string | null; qual: Qual } | null {
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
  if (p.sex === 'f') {
    const tribes = new Set<string>();
    for (const s of graph.spousesOf.get(id) ?? []) {
      if (s.b !== id) continue;
      const h = ownAffiliation(s.a);
      if (h?.tribe && h.qual === '') tribes.add(h.tribe);
    }
    if (tribes.size === 1) {
      const t = [...tribes][0];
      if (!own || own.tribe !== t || own.qual !== '') marriage = `в ${TRIBES[t][2]} по браку`;
    }
  }
  if (!own && !marriage) return null;
  return { text: [own?.text, marriage].filter(Boolean).join('; '), tribe: own?.tribe ?? null };
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

/** Эпоха рождения: названная в данных или по расчётному году. */
export function birthEpoch(id: string, c: ChronoRow | undefined, epochs: Epoch[]): Epoch | null {
  const p = byId.get(id);
  const eid = p?.epoch ?? c?.epoch ?? null;
  return epochs.find((e) => e.id === eid) ?? null;
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
