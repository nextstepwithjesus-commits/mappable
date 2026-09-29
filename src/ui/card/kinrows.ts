/**
 * Блок «Родство» карточки у звезды (этап 11, решение 77; STAGE11.md § 6): кем приходятся лицу ближайшие родные —
 * строками «Родители», «Жёны» (или «Муж»), «Сыновья» и «Дочери» (или «Дети»), «Братья и сёстры», «Год».
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
import { byId, graph, loadedChrono } from '../../data/atlas.ts';
import type { Sex } from '../../data/types.ts';
import type { LinkKey } from '../../engine/linkkey.ts';
import { partnerIn, type Union } from '../../engine/unions.ts';
import { model } from '../../state.ts';
import { isClaimUnion, unionName } from '../linkwords.ts';
import { originOf, unionsOf } from '../reveal.ts';
import { bySex, childrenNoun, pluralPeopleName } from '../text/ru.ts';
import { kidsInBirthOrder } from './Union.tsx';


/** Часть строки: текст или имя-ссылка с ключом своей связи. */
export type KinPart = { t: 'text'; text: string } | { t: 'name'; id: string; key: LinkKey };

export type KinRowKind = 'parents' | 'spouses' | 'children' | 'siblings' | 'year';

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
    out.push({ t: 'name', id: x.id, key: x.key });
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

/** «Жена», «Жёны», «Наложница», «Муж», «Мужья»: названные супруги по порядку браков. */
function spousesRow(id: string): KinRow | null {
  const us = unionsOf(id).filter((u) => !isClaimUnion(u) && partnerIn(u, id));
  if (!us.length) return null;
  const f = sexOf(id) === 'f';
  const many = us.length > 1;
  const label = f ? (many ? 'Мужья' : 'Муж') : many ? 'Жёны' : us[0].kind === 'concubine' ? 'Наложница' : 'Жена';
  const parts = names(
    us.map((u) => {
      const p = partnerIn(u, id)!;
      // у мужа: наложница в строке «Жёны» — с пометой; у жены-наложницы строка «Муж» пометы не требует
      return { id: p, key: { kind: 'spouse', union: u.id, person: p } as LinkKey, note: !f && many && u.kind === 'concubine' ? 'наложница' : undefined };
    }),
  );
  return { kind: 'spouses', label, parts, keys: keysOf(parts) };
}

/**
 * «Сыновья», «Дочери», «Дети»: дети союзов лица — по союзам, в каждом по году рождения; утверждения иного рода — с пометой
 * («приёмный»), потомки через пропуск поколений — после «; потомки — …». Потомки, названные без промежуточных звеньев
 * (claim ancestor, «из сынов Иудиных»), — не дети: их здесь нет.
 */
function childrenRow(id: string): KinRow | null {
  const us = unionsOf(id).filter((u) => u.kids.length && u.claim !== 'ancestor');
  const seen = new Set<string>();
  const direct: { id: string; key: LinkKey; note?: string }[] = [];
  const far: { id: string; key: LinkKey }[] = [];
  // сначала кровные союзы, затем союзы иного рода (усыновление, по Луке)
  for (const u of [...us.filter((x) => !isClaimUnion(x)), ...us.filter(isClaimUnion)])
    for (const k of kidsInBirthOrder(u)) {
      if (seen.has(k) || k === id) continue;
      seen.add(k);
      if (!isClaimUnion(u) && gapKid(u, k)) far.push({ id: k, key: childKey(u, k) });
      else direct.push({ id: k, key: childKey(u, k), note: isClaimUnion(u) ? kidClaimNote(u, k) : undefined });
    }
  if (!direct.length && !far.length) return null;
  const parts = names(direct);
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
  const seen = new Set<string>([id]);
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

/** Строки блока «Родство» лица; year — «как получен год» (yearHow), null — без строки «Год». */
export function kinRows(id: string, year: string | null = yearHow(id)): KinRow[] {
  if (!byId.has(id)) return [];
  const rows = [parentsRow(id), spousesRow(id), childrenRow(id), siblingsRow(id)].filter((r): r is KinRow => !!r);
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
