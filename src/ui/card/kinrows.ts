/**
 * Блок «Родство» карточки у звезды (этап 11, решение 77; STAGE11.md § 6): кем приходятся лицу ближайшие родные —
 * строками «Родители», «Жёны» (или «Муж»), «Мать сына» (или «Матери детей», «Отец сына»), «Сыновья» и «Дочери» (или
 * «Дети»), «Братья и сёстры», «Год».
 *
 * Полнота (этап 12, решение 92): видны все, от кого у лица есть дети, — жёны и наложницы («Жёны»); мать детей, которую
 * текст не называет женой («имя матери его Наама», 3 Цар 14:21; дочери Лота; Фамарь — Иуда), — своей строкой, словами
 * текста, без слова «жена»; неназванная жена, если текст её упоминает (запись § 9: «Жена не названа по имени…»), —
 * «имя в Писании не названо, Быт 4:17». Дети — по союзам: при двух союзах с детьми и больше — «от Лии — …; от Рахили — …».
 *
 * Всё — из данных со стихами: союзы происхождения и союзы лица (src/engine/unions.ts через src/ui/reveal.ts), связи
 * «отец», «мать», «жена», «наложница», утверждения иного рода («по закону», «по Луке», усыновление), родство словами
 * Писания («сестра», П-8). Каждое имя строки несёт ключ связи (src/engine/linkkey.ts): наведение и фокус подсвечивают
 * эту линию на небе (previewLinks), Enter открывает карточку связи (selectedLink).
 *
 * Правила слов:
 *  — неназванный супруг (решение 75): «Ной и его жена»; если у лица есть и названные супруги — «Давид (мать не названа)»;
 *  — вид утверждения — после имени в скобках: «Нирий (по Луке)», «Иосиф (по закону)», «дочь фараонова (приёмная мать)»;
 *  — родословие с пропуском поколений (fatherGap; DF1: Моисей — Шевуил) — «Предок», а у предка — «потомки», а не
 *    «отец» и «сын»: пропущенных звеньев текст не называет;
 *  — братья и сёстры одного союза — первыми, дальше «по отцу — …» и «по матери — …»: общий только один родитель;
 *  — народ во множественном числе (Быт 10: Лудим) — «Происходят от», у его родоначальника — «От него произошли».
 * Склонение не нужно: строки — с подписью и именами в именительном падеже.
 */
import { byId, graph, loadedCard, loadedChrono } from '../../data/atlas.ts';
import type { Card, Fact, Sex } from '../../data/types.ts';
import type { LinkKey } from '../../engine/linkkey.ts';
import { partnerIn, type Union } from '../../engine/unions.ts';
import { model } from '../../state.ts';
import { isClaimUnion, unionName } from '../linkwords.ts';
import { originOf, unionsOf } from '../reveal.ts';
import { bySex, childrenNoun, lowerFirst, nameCase, pluralPeopleName } from '../text/ru.ts';
import { compareKidGroups, kidsInBirthOrder, onLine } from './Union.tsx';


/**
 * Часть строки: текст или имя-ссылка с ключом своей связи. line — лицо на линии Мессии: «ещё N» строки его не прячет
 * (решение 104), значимость видна знаком лент у имени, а не местом в строке.
 */
export type KinPart = { t: 'text'; text: string } | { t: 'name'; id: string; key: LinkKey; line?: boolean };

export type KinRowKind = 'parents' | 'spouses' | 'coparents' | 'children' | 'siblings' | 'year';

export interface KinRow {
  kind: KinRowKind;
  label: string;
  parts: KinPart[];
  /** ключи всех связей строки: наведение на строку подсвечивает их все */
  keys: LinkKey[];
}

const nameOf = (id: string) => byId.get(id)?.name ?? id;
const sexOf = (id: string): Sex => byId.get(id)?.sex ?? 'm';
const isPeople = (id: string) => {
  const k = byId.get(id)?.kind;
  return k === 'people' || k === 'clan';
};
const pluralPeople = (id: string) => {
  const p = byId.get(id);
  return !!p && pluralPeopleName(p.name, p.kind);
};
const childKey = (u: Union, child: string): LinkKey => ({ kind: 'child', union: u.id, child });

/** Вид утверждения иного рода — после имени родителя: «(по Луке)», «(приёмный отец)». */
function claimNote(u: Union, parent: string): string {
  const f = sexOf(parent) === 'f';
  switch (u.claim) {
    case 'by-luke':
      return 'по Луке';
    case 'adoptive':
      return f ? 'приёмная мать' : 'приёмный отец';
    case 'levirate':
      return 'по закону ужичества';
    case 'alternative':
      return 'по другому месту Писания';
    case 'ancestor':
      return f ? 'прародительница' : 'предок';
    case 'legal':
      return 'по закону';
    default:
      return 'по иному указанию';
  }
}

/** Вид утверждения у ребёнка: «(приёмный)», «(по Луке)», «(по другому месту Писания)». */
function kidClaimNote(u: Union, kid: string): string {
  switch (u.claim) {
    case 'adoptive':
      return bySex(sexOf(kid), 'приёмный', 'приёмная');
    case 'by-luke':
      return 'по Луке';
    case 'levirate':
      return 'по закону ужичества';
    case 'alternative':
      return 'по другому месту Писания';
    case 'legal':
      return 'по закону';
    default:
      return 'по иному указанию';
  }
}

/** Связь ребёнка с отцом союза идёт с пропуском поколений (fatherGap). */
const gapKid = (u: Union, kid: string) => !!u.a && (graph.parentsOf.get(kid) ?? []).some((e) => e.parent === u.a && e.kind === 'father' && e.gap);

/** Имена через запятую, последнее — через «и» не ставится: строки коротки и режутся «ещё N» (DotCard.tsx). */
function names(ids: readonly { id: string; key: LinkKey; note?: string }[], sep = ', '): KinPart[] {
  const out: KinPart[] = [];
  ids.forEach((x, i) => {
    if (i) out.push({ t: 'text', text: sep });
    out.push(onLine(x.id) ? { t: 'name', id: x.id, key: x.key, line: true } : { t: 'name', id: x.id, key: x.key });
    if (x.note) out.push({ t: 'text', text: ` (${x.note})` });
  });
  return out;
}

const keysOf = (parts: readonly KinPart[]) => parts.flatMap((p) => (p.t === 'name' ? [p.key] : []));

// ---------- строки ----------

/** «Родители»: союз происхождения (оба родителя или «Ной и его жена»), затем утверждения иного рода. */
function parentsRow(id: string): KinRow | null {
  const os = originOf(id);
  if (!os.length) return null;
  const parts: KinPart[] = [];
  let onlyAncestors = true;
  let gap = false;
  for (const u of os) {
    if (parts.length) parts.push({ t: 'text', text: '; ' });
    if (isClaimUnion(u)) {
      const p = (u.a ?? u.b)!;
      parts.push({ t: 'name', id: p, key: childKey(u, id) });
      parts.push({ t: 'text', text: ` (${claimNote(u, p)})` });
      if (u.claim !== 'ancestor') onlyAncestors = false;
      continue;
    }
    onlyAncestors = false;
    const named = [u.a, u.b].filter((x): x is string => !!x);
    if (gapKid(u, id)) {
      // пропуск поколений: отец — предок, союза с матерью в таком родословии нет
      gap = true;
      parts.push({ t: 'name', id: u.a!, key: childKey(u, id) });
      continue;
    }
    named.forEach((p, i) => {
      if (i) parts.push({ t: 'text', text: ' и ' });
      parts.push({ t: 'name', id: p, key: childKey(u, id) });
      if (u.claim === 'legal' && p === u.a) parts.push({ t: 'text', text: ' (по закону)' });
    });
    if (named.length === 1 && !isPeople(named[0]) && !pluralPeople(id)) {
      // решение 75: «Ной и его жена»; есть и названные супруги — «Давид (мать не названа)»
      const n = unionName(u);
      const tail = n.startsWith(nameOf(named[0])) ? n.slice(nameOf(named[0]).length) : '';
      if (tail) parts.push({ t: 'text', text: tail });
    }
  }
  const label = pluralPeople(id) ? 'Происходят от' : onlyAncestors || (gap && os.length === 1) ? (os.length > 1 ? 'Предки' : 'Предок') : 'Родители';
  return { kind: 'parents', label, parts, keys: keysOf(parts) };
}

/** Союз брака: жена или наложница по тексту (не «названы только как родители детей»). */
const isMarriage = (u: Union) => u.kind === 'wife' || u.kind === 'concubine';

/**
 * Запись § 9 (spousesNote) о супруге, которого текст упоминает, но не называет по имени (решение 92): часть записи
 * начинается словами «Жена не названа…», «Жена по имени не названа», «Имя жены не названо», «Жёны не названы…», «Муж не
 * назван…» — или запись начинается с «Муж её — …» и говорит «имя его не названо» (Евника, Деян 16:1). Запись о царе
 * «Жена не названа; мать его сына … — …» — не упоминание жены, а указание, что названа только мать: её здесь нет.
 * Кроме того, у лица должен быть союз с детьми без второго родителя или ни одного названного супруга: иначе жена уже
 * названа (Лот — «Жена Лота»).
 */
const UNNAMED_CLAUSE = /^(?:жена|жёны|жены|имя жены|имена жён|муж|имя мужа|первая|другая)(?:\s+[а-яё]+)?(?:\s+по имени)?\s+не назван/i;
const UNNAMED_LEAD = /^(?:муж|жена)(?:\s[^;.]*)?;\s*имя (?:его|её|ее) не назван/i;
const ONLY_MOTHER = /мат(?:ь|ери) (?:его|её) (?:сын|доч|дет)/i;
export function unnamedSpouseNote(id: string, card: Card | null = loadedCard(id)): { fact: Fact; many: boolean } | null {
  const facts = card?.spousesNote ?? [];
  if (!facts.length) return null;
  const us = unionsOf(id).filter((u) => !isClaimUnion(u));
  const missing = us.some((u) => u.kids.length > 0 && !partnerIn(u, id) && (u.a === id || u.b === id));
  const named = us.some((u) => !!partnerIn(u, id));
  if (!missing && named) return null;
  // безымянная жена уже заведена лицом («Жена Лота», «Жена Иеровоама»): запись говорит о ней
  if (us.some((u) => isMarriage(u) && byId.get(partnerIn(u, id) ?? '')?.unnamed)) return null;
  for (const f of facts) {
    if (ONLY_MOTHER.test(f.text)) continue;
    const clauses = f.text.split(/[;.:]\s+/).map((c) => c.trim());
    const hit = clauses.find((c) => UNNAMED_CLAUSE.test(c)) ?? (UNNAMED_LEAD.test(f.text) ? f.text : null);
    if (!hit) continue;
    return { fact: f, many: /^(?:жёны|жены|имена жён)/i.test(hit) };
  }
  return null;
}

/** Ссылки коротко, через «; »: «Быт 4:17», «1 Пар 2:26». */
const refsText = (refs: readonly string[]) => refs.slice(0, 2).map((r) => r.replace(/^([1-4])(\S)/, '$1 $2').replace(/-/g, '–')).join('; ');

/**
 * «Жена», «Жёны», «Наложница», «Муж», «Мужья»: названные супруги по порядку браков; затем — неназванный супруг, если
 * текст его упоминает: «имя в Писании не названо, Быт 4:17» (решение 92).
 */
function spousesRow(id: string, card: Card | null): KinRow | null {
  const us = unionsOf(id).filter((u) => !isClaimUnion(u) && isMarriage(u) && partnerIn(u, id));
  const un = unnamedSpouseNote(id, card);
  if (!us.length && !un) return null;
  const f = sexOf(id) === 'f';
  const many = us.length + (un ? 1 : 0) > 1 || !!un?.many;
  const label = f ? (many ? 'Мужья' : 'Муж') : many ? 'Жёны' : us[0]?.kind === 'concubine' ? 'Наложница' : 'Жена';
  const parts = names(
    us.map((u) => {
      const p = partnerIn(u, id)!;
      // у мужа: наложница в строке «Жёны» — с пометой; у жены-наложницы строка «Муж» пометы не требует
      return { id: p, key: { kind: 'spouse', union: u.id, person: p } as LinkKey, note: !f && many && u.kind === 'concubine' ? 'наложница' : undefined };
    }),
  );
  if (un) {
    const who = f ? 'муж' : un.many ? 'жёны' : 'жена';
    const what = un.many ? 'имена в Писании не названы' : 'имя в Писании не названо';
    const refs = refsText(un.fact.refs);
    parts.push({ t: 'text', text: `${parts.length ? `; ${who}, ` : ''}${what}${refs ? `, ${refs}` : ''}` });
  }
  const keys = keysOf(parts);
  // строку с неназванным супругом наведение связывает с союзом без второго родителя (ромб «Каин и его жена»)
  if (un) for (const u of unionsOf(id)) if (!isClaimUnion(u) && u.kids.length && !partnerIn(u, id)) keys.push({ kind: 'union', union: u.id });
  return { kind: 'spouses', label, parts, keys };
}

/** «Ровоама», «Фареса и Зары» — дети союза в родительном падеже; не склоняется хоть одно имя — null. */
function kidsGen(u: Union): string | null {
  const ks = kidsInBirthOrder(u);
  if (!ks.length || ks.length > 2) return null;
  const gs = ks.map(genName);
  return gs.every((g): g is string => !!g) ? gs.join(' и ') : null;
}

/** «сына», «сыновей», «дочери», «дочерей», «детей» — дети союза одним словом в родительном падеже. */
function kidsNounGen(u: Union): string {
  const sx = u.kids.map(sexOf);
  if (sx.length === 1) return bySex(sx[0], 'сына', 'дочери');
  if (sx.every((x) => x === 'm')) return 'сыновей';
  if (sx.every((x) => x === 'f')) return 'дочерей';
  return 'детей';
}

/** Второй родитель детей, которого текст не называет супругом (решение 92): союз, лицо, дети, роль словами и стихи. */
export interface Coparent {
  union: Union;
  other: string;
  kids: string[];
  /** «мать Ровоама», «отец Фареса и Зары», «мать сыновей»; описательное имя само называет родство («Мать Иеффая») — '' */
  role: string;
  /** стихи, где назван этот родитель детей (parentRefsBy из тома ребёнка, если он загружен; иначе — стихи родителей) */
  refs: string[];
  /** уточнение матери без слов о материнстве: «Аммонитянка» у Наамы, «невестка Иуды» у Фамари; у отца — null */
  dis: string | null;
}

/** Союзы лица, где второй родитель назван, а супругом текст его не называет: «имя матери его Наама» (3 Цар 14:21). */
export function coparents(id: string): Coparent[] {
  const f = sexOf(id) === 'f';
  return unionsOf(id)
    .filter((u) => !isClaimUnion(u) && u.kind === 'parents' && partnerIn(u, id) && u.kids.length)
    .map((u) => {
      const other = partnerIn(u, id)!;
      const kids = kidsInBirthOrder(u);
      const word = f ? 'отец' : 'мать';
      const says = nameOf(other).toLowerCase().startsWith(`${word} `);
      const refs: string[] = [];
      for (const k of kids) {
        const by = loadedCard(k)?.parentRefsBy?.[f ? 'father' : 'mother'];
        const edge = (graph.parentsOf.get(k) ?? []).find((e) => e.parent === other && (e.kind === 'father' || e.kind === 'mother'));
        for (const r of by && by.length ? by : (edge?.refs ?? [])) if (!refs.includes(r)) refs.push(r);
      }
      // уточнение — только у матери, словами текста («имя матери его Наама Аммонитянка»); у отца оно лишнее: он и так
      // назван строкой родства («Соломон — отец Ровоама»)
      const dis = f
        ? ''
        : (byId.get(other)?.disambig ?? '')
            .split(/,\s*/)
            .filter((c) => c && !/(^|\s)(мать|отец)(\s|$)/i.test(c))
            .join(', ');
      return { union: u, other, kids, role: says ? '' : `${word} ${kidsGen(u) ?? kidsNounGen(u)}`, refs, dis: dis || null };
    });
}

/**
 * «Мать сына: Наама», «Матери детей: Хамуталь (мать Иоахаза и Седекии), Зебудда (мать Иоакима)», у женщины — «Отец сына:
 * Соломон» (решение 92): второй родитель детей, которого текст не называет супругом. Слово «жена» здесь не ставится
 * (дочери Лота, Фамарь — Иуда). Описательное имя, которое само называет родство («Мать Иеффая»), пометы не получает.
 */
function coparentsRow(id: string): KinRow | null {
  const us = unionsOf(id).filter((u) => !isClaimUnion(u) && u.kind === 'parents' && partnerIn(u, id) && u.kids.length);
  if (!us.length) return null;
  const f = sexOf(id) === 'f';
  const role = f ? 'отец' : 'мать';
  const one = us.length === 1;
  const parts = names(
    us.map((u) => {
      const p = partnerIn(u, id)!;
      const g = kidsGen(u);
      const says = nameOf(p).toLowerCase().startsWith(`${role} `);
      return { id: p, key: { kind: 'union', union: u.id } as LinkKey, note: one || says ? undefined : `${role} ${g ?? kidsNounGen(u)}` };
    }),
  );
  const label = one ? `${f ? 'Отец' : 'Мать'} ${kidsNounGen(us[0])}` : f ? 'Отцы детей' : 'Матери детей';
  return { kind: 'coparents', label, parts, keys: keysOf(parts) };
}

/**
 * Имя лица в родительном падеже (ru.ts, nameCase) или null. Сверх nameCase — два надёжных случая: описание с согласуемым
 * прилагательным «Старшая дочь Лота» — «старшей дочери Лота» (Быт 19:31–38) и имя через дефис на гласную, которое не
 * склоняется: «Бен-Амми».
 */
export function genName(id: string): string | null {
  const q = byId.get(id);
  if (!q) return null;
  const g = nameCase(q.name, q.sex, 'gen', q.unnamed, q.alt);
  if (g) return q.unnamed ? lowerFirst(g) : g;
  const m = /^(Старшая|Младшая) дочь ([А-ЯЁ][а-яё]+)$/.exec(q.name);
  if (q.unnamed && m) return `${m[1] === 'Старшая' ? 'старшей' : 'младшей'} дочери ${m[2]}`;
  if (/^[А-ЯЁ][а-яё]*(?:-[А-ЯЁ][а-яё]*)+$/.test(q.name) && /[иоуеэы]$/.test(q.name)) return q.name;
  return null;
}

/** «от Лии», «от жены Лота» — второй родитель союза в родительном падеже с «от»; не склоняется — null. */
function fromWhom(u: Union, id: string): string | null {
  const p = partnerIn(u, id);
  const g = p ? genName(p) : null;
  return g ? `от ${g}` : null;
}

/**
 * «Сыновья», «Дочери», «Дети»: дети союзов лица — по союзам, в каждом по году рождения (решение 92: «все дети по
 * союзам»). При двух кровных союзах с детьми и больше — группы «от Лии — Рувим, Симеон; от Рахили — Иосиф…»; второй
 * родитель не назван — «мать не названа — …»; имя не склоняется — «Старшая дочь Лота: Моав». Утверждения иного рода —
 * с пометой («приёмный»), потомки через пропуск поколений — после «; потомки — …». Потомки, названные без промежуточных
 * звеньев (claim ancestor, «из сынов Иудиных»), — не дети: их здесь нет.
 */
function childrenRow(id: string): KinRow | null {
  const us = unionsOf(id).filter((u) => u.kids.length && u.claim !== 'ancestor');
  const seen = new Set<string>();
  const groups: { u: Union; kids: { id: string; key: LinkKey; note?: string }[] }[] = [];
  const far: { id: string; key: LinkKey }[] = [];
  // кровные союзы — в порядке групп § 10 (compareKidGroups: союз с ребёнком линии — первым, затем в порядке браков,
  // второй родитель не назван — последним); последними — союзы иного рода (усыновление, по Луке)
  const all = unionsOf(id);
  const blood = us
    .filter((x) => !isClaimUnion(x))
    .map((u) => ({ u, named: !!partnerIn(u, id), kids: kidsInBirthOrder(u).filter((k) => k !== id), rank: all.indexOf(u) }))
    .sort(compareKidGroups)
    .map((x) => x.u);
  for (const u of [...blood, ...us.filter(isClaimUnion)]) {
    const g: { id: string; key: LinkKey; note?: string }[] = [];
    for (const k of kidsInBirthOrder(u)) {
      if (seen.has(k) || k === id) continue;
      seen.add(k);
      if (!isClaimUnion(u) && gapKid(u, k)) far.push({ id: k, key: childKey(u, k) });
      else g.push({ id: k, key: childKey(u, k), note: isClaimUnion(u) ? kidClaimNote(u, k) : undefined });
    }
    if (g.length) groups.push({ u, kids: g });
  }
  const direct = groups.flatMap((g) => g.kids);
  if (!direct.length && !far.length) return null;
  // группы — только если у лица два кровных союза с детьми и больше, а дети не народы таблицы Быт 10
  const bloodGroups = groups.filter((g) => !isClaimUnion(g.u));
  const grouped = bloodGroups.length > 1 && !direct.every((x) => pluralPeople(x.id)) && !isPeople(id);
  const parts: KinPart[] = [];
  if (!grouped) parts.push(...names(direct));
  else
    for (const g of groups) {
      if (parts.length) parts.push({ t: 'text', text: '; ' });
      if (isClaimUnion(g.u)) {
        parts.push(...names(g.kids));
        continue;
      }
      const from = fromWhom(g.u, id);
      const other = partnerIn(g.u, id);
      if (from) parts.push({ t: 'text', text: `${from} — ` });
      else if (!other) parts.push({ t: 'text', text: `${sexOf(id) === 'f' ? 'отец не назван' : 'мать не названа'} — ` });
      else parts.push({ t: 'name', id: other, key: { kind: 'union', union: g.u.id } }, { t: 'text', text: ': ' });
      parts.push(...names(g.kids));
    }
  if (far.length) {
    if (parts.length) parts.push({ t: 'text', text: '; потомки — ' });
    parts.push(...names(far));
  }
  const kids = direct.map((x) => x.id);
  const label = !kids.length
    ? 'Потомки'
    : kids.every(pluralPeople)
      ? isPeople(id)
        ? 'От них произошли'
        : bySex(sexOf(id), 'От него произошли', 'От неё произошли')
      : childrenNoun(kids.map(sexOf));
  return { kind: 'children', label, parts, keys: keysOf(parts) };
}

/**
 * «Братья и сёстры»: дети того же союза — первыми; дети другого союза того же отца — «по отцу — …», той же матери —
 * «по матери — …»; родство словами Писания («сестра», «брат», П-8) — после «; » с ключом этого родства.
 */
function siblingsRow(id: string): KinRow | null {
  const os = originOf(id).filter((u) => !isClaimUnion(u));
  const own = os[0];
  // свои дети — не братья и сёстры, даже если у них тот же отец (дочери Лота и их сыновья, Быт 19:36–38)
  const seen = new Set<string>([id, ...unionsOf(id).flatMap((u) => u.kids)]);
  const full: { id: string; key: LinkKey }[] = [];
  const byFather: { id: string; key: LinkKey }[] = [];
  const byMother: { id: string; key: LinkKey }[] = [];
  // пропуск поколений (fatherGap; DF1): «из сыновей Гирсама» Шевуил — потомок Гирсама, а не сын, поэтому сыновья
  // Гирсама ему не братья; так же и потомки отца среди его детей — не братья лицу
  if (own && !gapKid(own, id)) {
    for (const k of kidsInBirthOrder(own)) if (!seen.has(k) && !gapKid(own, k)) (seen.add(k), full.push({ id: k, key: childKey(own, k) }));
    for (const [par, list] of [
      [own.a, byFather],
      [own.b, byMother],
    ] as const) {
      if (!par) continue;
      for (const u of unionsOf(par)) {
        if (u === own || isClaimUnion(u)) continue;
        for (const k of kidsInBirthOrder(u)) if (!seen.has(k) && !gapKid(u, k)) (seen.add(k), list.push({ id: k, key: childKey(u, k) }));
      }
    }
  }
  // родство словами Писания: «брат», «сестра», «младший брат» — без выведения родителей (П-8)
  const words: { id: string; key: LinkKey }[] = [];
  for (const e of graph.kinOf.get(id) ?? []) {
    const other = e.from === id ? e.to : e.from;
    if (seen.has(other) || !/^(младший\s+)?(брат|сестра)$/.test(e.rel)) continue;
    seen.add(other);
    words.push({ id: other, key: { kind: 'kin', a: e.from, b: e.to } });
  }
  if (!full.length && !byFather.length && !byMother.length && !words.length) return null;
  const parts: KinPart[] = names([...full, ...words]);
  for (const [lbl, list] of [
    ['по отцу', byFather],
    ['по матери', byMother],
  ] as const) {
    if (!list.length) continue;
    if (parts.length) parts.push({ t: 'text', text: `; ${lbl} — ` });
    else parts.push({ t: 'text', text: `${lbl[0].toUpperCase()}${lbl.slice(1)} — ` });
    parts.push(...names(list));
  }
  const all = [...full, ...words, ...byFather, ...byMother].map((x) => sexOf(x.id));
  const one = all.length === 1;
  const label = one ? bySex(all[0], 'Брат', 'Сестра') : all.every((s) => s !== 'f') ? 'Братья' : all.every((s) => s === 'f') ? 'Сёстры' : 'Братья и сёстры';
  return { kind: 'siblings', label, parts, keys: keysOf(parts) };
}

/**
 * «Год» — как получен год рождения (STAGE11.md § 6): «по числам Писания, Быт 5:3», «по годам, названным в Писании»,
 * «по порядку перечисления, выв.», «оценка по поколениям», «время не установлено». order — помета порядка с верным
 * диапазоном стихов (personOrderNote из src/render/links.ts, стык 5): «по порядку перечисления, Быт 4:19–22, выв.».
 * У народа и рода года нет (решение 23) — строки нет.
 */
export function yearHow(id: string, order?: string | null): string | null {
  const c = model.value.chrono.get(id);
  if (!c || isPeople(id) || c.named) return null;
  if (c.byOrder) return order ?? 'по порядку перечисления братьев и сестёр, выв.';
  if (c.cls === 'epochal') return 'время не установлено';
  const born = loadedChrono(id)?.born;
  const ref = born?.refs?.[0];
  if (c.cls === 'exact') return ref ? `по числам Писания, ${ref.replace(/^([1-4])(\S)/, '$1 $2')}, расч.` : 'по числам Писания, расч.';
  if (c.cls === 'calculated') return ref ? `по годам, названным в Писании, ${ref.replace(/^([1-4])(\S)/, '$1 $2')}, расч.` : 'по годам, названным в Писании, расч.';
  const gap = (graph.parentsOf.get(id) ?? []).some((e) => e.kind === 'father' && e.gap);
  return gap ? 'оценка по поколениям; родословие может пропускать поколения' : 'оценка по поколениям, расч.';
}

/**
 * Строки блока «Родство» лица; year — «как получен год» (yearHow), null — без строки «Год»; card — тело карточки лица
 * (записи § 9 о неназванном супруге), по умолчанию — загруженное.
 */
export function kinRows(id: string, year: string | null = yearHow(id), card: Card | null = loadedCard(id)): KinRow[] {
  if (!byId.has(id)) return [];
  const rows = [parentsRow(id), spousesRow(id, card), coparentsRow(id), childrenRow(id), siblingsRow(id)].filter((r): r is KinRow => !!r);
  if (year) rows.push({ kind: 'year', label: 'Год', parts: [{ t: 'text', text: year }], keys: [] });
  return rows;
}

/** Лица семьи первого поколения: родители, супруги, дети, братья и сёстры — их звёзды и подписи карточка не закрывает. */
export function familyOf(id: string): string[] {
  const out = new Set<string>();
  for (const r of kinRows(id, null)) for (const p of r.parts) if (p.t === 'name') out.add(p.id);
  out.delete(id);
  return [...out];
}
