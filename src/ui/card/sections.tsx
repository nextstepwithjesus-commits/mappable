/**
 * Содержимое разделов 1–24 карточки лица (ТЗ § 3.3): каждый раздел — абзацы и списки, собранные из данных.
 * Как разделы стоят на листе (заголовки в строку, предел 8 строк, пустые разделы) — src/ui/Folio.tsx, CardPage.
 *
 * Правила этапа 5 (docs/ui-review/README.md, F):
 * — раздел не повторяет шапку: § 1 говорит об одноимённых, § 5 — без строки ролей, § 7 — без строки колена (F5);
 * — пояснения, общие для нескольких записей, сводятся в одно; заметка составителя, которая повторяет строку,
 *   встаёт под эту строку, а пересказ строк целиком не выводится (F5; CARD-20);
 * — § 10 — внуки при родителях, значимые первыми; § 11 — единокровные группой; § 6 и § 12 — вычисляемая
 *   вторая степень родства с пометой «выв.» (F6);
 * — § 14 — имя лица встречи в самом тексте, § 15 — места по роли, § 16 — без повтора царствований (F7);
 * — имена лиц в тексте фактов — ссылки (F12).
 */
import { Fragment, type ComponentChildren, type VNode } from 'preact';
import { useState } from 'preact/hooks';
import { byId, graph, lineMembership, persons } from '../../data/atlas.ts';
import type { Card, Chrono, Fact, Cert, Role, Reign, Place } from '../../data/types.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { P, Refs, VerseInsert, Mark, MarkNote, MARK_FULL, plural } from '../common.tsx';
import { siblings, type ParentEdge } from '../../engine/graph.ts';
import { formatSpan, formatYear, shownYears, yearsWord } from '../../engine/years.ts';
import { contemporaries, type ChronoResult, type PersonChrono } from '../../engine/chronology.ts';
import { affiliation, deathLine } from './shared.tsx';
import {
  bySex, capFirst, lowerFirst, nameCase, splitKinTerm, kinTermIns, kinTermReverse, ownSpouseDat, otherParentLabel, otherChildLabel,
  altKindLabel, reignTitle, MESSIAH_BIRTH, pluralPeopleName, childrenNoun, unnamedParentLabel, descendantsNoun, peoplesLabel,
  countGen, halfSiblingsLabel, derivedKinLabel, placeRoleLabel, KIN_TERM_QUOTED,
} from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { CanonStrip } from './Canon.tsx';
import { BirthLine, RelativeChrono, YearMark } from './Chrono.tsx';
import { candidateFor, linkCandidates, linkNames, mentionsPerson, type LinkCand } from './links.tsx';

type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

export const SECTIONS: { n: number; part: number; title: string }[] = [
  { n: 1, part: 1, title: 'Имя' },
  { n: 2, part: 1, title: 'Имя в подлиннике' },
  { n: 3, part: 1, title: 'Значение имени' },
  { n: 4, part: 1, title: 'Другие имена' },
  { n: 5, part: 1, title: 'Роль и положение' },
  { n: 6, part: 2, title: 'Родители' },
  { n: 7, part: 2, title: 'Род, колено, народ' },
  { n: 8, part: 2, title: 'Рождение' },
  { n: 9, part: 3, title: 'Супруги' },
  { n: 10, part: 3, title: 'Дети' },
  { n: 11, part: 3, title: 'Братья и сёстры' },
  { n: 12, part: 3, title: 'Иное родство' },
  { n: 13, part: 4, title: 'Эпоха и относительная хронология' },
  { n: 14, part: 4, title: 'Современники' },
  { n: 15, part: 5, title: 'Места' },
  { n: 16, part: 5, title: 'Занятие и служение' },
  { n: 17, part: 5, title: 'Жизнеописание' },
  { n: 18, part: 5, title: 'Слова' },
  { n: 19, part: 5, title: 'Перед Богом' },
  { n: 20, part: 5, title: 'Смерть и погребение' },
  { n: 21, part: 6, title: 'В родословии Мессии' },
  { n: 22, part: 6, title: 'Упоминания в других книгах' },
  { n: 23, part: 6, title: 'Места Писания' },
  { n: 24, part: 6, title: 'Примечания' },
];
export const PARTS = ['', 'I. Личность', 'II. Происхождение', 'III. Семья', 'IV. Время', 'V. Жизнь', 'VI. Наследие'];

/** Термины Писания «брат», «сестра» (в т. ч. «брат по отцу»). */
const SIBLING_KIN = /^(брат|сестра)(?![а-яё])/i;

/** Модель ChronoResult поверх данных выбранной модели (для «современников»); одна на модель. */
const resultCache = new WeakMap<ModelData, ChronoResult>();
function asResult(m: ModelData): ChronoResult {
  const have = resultCache.get(m);
  if (have) return have;
  const personsMap = new Map<string, PersonChrono>();
  for (const [id, c] of m.chrono) personsMap.set(id, { b: c.b, bLo: c.bLo, bHi: c.bHi, d: c.d, dLo: null, dHi: null, lastAttested: c.last, dEst: c.dEst, cls: c.cls, epoch: c.epoch });
  const res: ChronoResult = { model: m.id as never, persons: personsMap, tensions: m.tensions };
  resultCache.set(m, res);
  return res;
}

/** Есть ли что показать: непустой список или истинное значение (не число: `a.length && …` даёт голый «0»). */
const has = (...xs: unknown[]) => xs.some((x) => (Array.isArray(x) ? x.length > 0 : typeof x === 'string' ? x.trim() !== '' : typeof x === 'number' ? false : !!x));

/** Пустое содержимое раздела: null, false, числа, пустые строки, пустые списки и фрагменты из пустого. */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === 'object' && (v as VNode).type === Fragment) return isEmpty((v as VNode<{ children?: unknown }>).props.children);
  return false;
}

/** Число лиц с каждым именем: одноимённых различает уточнение. */
const nameCount = (() => {
  const m = new Map<string, string[]>();
  for (const q of persons) m.set(q.name, [...(m.get(q.name) ?? []), q.id]);
  return m;
})();

/** Ссылка на лицо в строке после двоеточия или в перечне: безымянное («Дочь фараонова») — со строчной. */
function PT({ id }: { id: string }) {
  const q = byId.get(id);
  return <P id={id}>{q ? (q.unnamed ? lowerFirst(q.name) : q.name) : id}</P>;
}

/**
 * Знак препинания сразу за ссылкой на лицо держится за неё. Кнопка — строчный блок, и перед знаком браузер переносит
 * строку даже без пробела: в перечне «Шеломиф» / «, Маинан» запятая уходила в начало строки (B4, B5).
 */
function Glued({ after, children }: { after?: ComponentChildren; children: ComponentChildren }) {
  return after ? (
    <span class="nobr">
      {children}
      {after}
    </span>
  ) : (
    <>{children}</>
  );
}

/** Уточнение одноимённого в скобках: «Мария (Клеопова)»; скобки внутри уточнения — через запятую. */
const disambigText = (id: string) => typo(byId.get(id)!.disambig.replace(/\s*\(([^)]*)\)/g, ', $1'));

/**
 * Ссылка на лицо с уточнением: «Мария (Клеопова)». dis — показать уточнение (по умолчанию — если в атласе есть одноимённые).
 * after — знак препинания, который идёт следом («,» в перечне).
 */
function PN({ id, lower = false, dis, after }: { id: string; lower?: boolean; dis?: boolean; after?: string }) {
  const q = byId.get(id);
  const show = !!q?.disambig && (dis ?? (nameCount.get(q.name)?.length ?? 0) > 1);
  const link = lower ? <PT id={id} /> : <P id={id} />;
  if (!show) return <Glued after={after}>{link}</Glued>;
  return (
    <>
      {link}
      <span class="muted">
        {' '}({disambigText(id)}){after}
      </span>
    </>
  );
}

/**
 * Одноимённые в одном разделе (§ 9–12): лица, чьё имя совпадает с именем владельца карточки или другого лица раздела.
 * Их называют с уточнением, иначе «Мария — сестра» у Марии читается как «сестра самой себе».
 */
function namesakesIn(ownerId: string, ids: string[]): Set<string> {
  const owner = byId.get(ownerId)!.name;
  const count = new Map<string, number>();
  for (const x of new Set(ids)) {
    const n = byId.get(x)?.name;
    if (n) count.set(n, (count.get(n) ?? 0) + 1);
  }
  return new Set(
    ids.filter((x) => {
      const n = byId.get(x)?.name;
      return !!n && (n === owner || (count.get(n) ?? 0) > 1);
    }),
  );
}

/** Ссылка на лицо в косвенном падеже; null — если имя не склоняется надёжно (строку тогда строят иначе). */
function caseLink(id: string, cs: 'gen' | 'dat' | 'ins'): ComponentChildren | null {
  const q = byId.get(id);
  const f = q ? nameCase(q.name, q.sex, cs, q.unnamed) : null;
  return f ? <P id={id}>{f}</P> : null;
}

const direct = (e: ParentEdge) => e.kind === 'father' || e.kind === 'mother';
/** Прямая кровная связь, записанная Писанием или выведенная (не толкование и не «по закону»). */
const plainLink = (e: ParentEdge) => direct(e) && e.cert !== 'interpretation' && e.claim !== 'legal';
const kidsOf = (x: string) => [...new Set((graph.childrenOf.get(x) ?? []).filter(direct).map((e) => e.child))];
const sexesOf = (ids: string[]) => ids.map((x) => byId.get(x)!.sex);

/** Лица, названные в семейных разделах карточки (§ 6, 9–12): их не повторяют «Современники». */
export function familyIds(id: string): Set<string> {
  const out = new Set<string>();
  for (const e of graph.parentsOf.get(id) ?? []) out.add(e.parent);
  for (const s of graph.spousesOf.get(id) ?? []) out.add(s.a === id ? s.b : s.a);
  for (const e of graph.childrenOf.get(id) ?? []) out.add(e.child);
  const grand = [...new Set(kidsOf(id).flatMap(kidsOf))];
  for (const g of grand) {
    out.add(g);
    for (const gg of kidsOf(g)) out.add(gg);
  }
  for (const s of siblings(graph, id)) out.add(s.id);
  for (const k of graph.kinOf.get(id) ?? []) out.add(k.from === id ? k.to : k.from);
  for (const r of derivedKin(id)) for (const x of r.ids) out.add(x);
  out.delete(id);
  return out;
}

/**
 * Родня в пределах четырёх шагов по связям «родитель — ребёнок»: деды, дяди, двоюродные, внучатые.
 * Брак — только первым шагом (родня супруга: тесть, шурин) или последним (супруги родни: невестка, зять);
 * поэтому другие жёны мужа и родня свойственников в родню не попадают.
 */
function nearKin(id: string, depth = 4): Set<string> {
  const up = (x: string) => (graph.parentsOf.get(x) ?? []).filter(direct).map((e) => e.parent);
  const down = (x: string) => (graph.childrenOf.get(x) ?? []).filter(direct).map((e) => e.child);
  const wed = (x: string) => (graph.spousesOf.get(x) ?? []).map((s) => (s.a === x ? s.b : s.a));
  // кровный путь идёт вверх к общему предку, затем вниз (вверх после спуска — это уже другой родитель ребёнка, не родня);
  // фаза: 0 — только кровные шаги; 1 — путь начался с брака; 2 — закончился браком
  type St = { x: string; ph: number; down: boolean };
  const seen = new Set<string>();
  const out = new Set<string>();
  let front: St[] = [{ x: id, ph: 0, down: false }];
  for (let d = 0; d < depth; d++) {
    const next: St[] = [];
    const step = (s: St) => {
      const key = `${s.x}|${s.ph}|${s.down}`;
      if (s.x === id || seen.has(key)) return;
      seen.add(key);
      out.add(s.x);
      if (s.ph !== 2) next.push(s);
    };
    for (const s of front) {
      if (!s.down) for (const y of up(s.x)) step({ x: y, ph: s.ph, down: false });
      for (const y of down(s.x)) step({ x: y, ph: s.ph, down: true });
      if (s.ph === 0) for (const y of wed(s.x)) step({ x: y, ph: d === 0 ? 1 : 2, down: s.down });
    }
    front = next;
  }
  return out;
}

const RULERS = new Set<Role>(['king', 'queen', 'queen-mother', 'foreign-ruler', 'judge', 'tribal-leader']);
const CLERGY = new Set<Role>(['high-priest', 'priest', 'prophet']);
const CON_GROUPS = ['Правители', 'Священники и пророки', 'Родня', 'Другие'] as const;

/**
 * «Современники» (§ 14) по группам: сначала те, кто по расчёту жил в то же время наверняка, затем «вероятно».
 * Без семьи из § 6, 9–12 и без тех, о встрече с кем говорит Писание: они названы выше.
 */
export function contemporaryGroups(id: string, m: ModelData, family: Set<string>, met: Set<string>, limit = 16): { sure: boolean; label: string; ids: string[] }[] {
  const kin = nearKin(id);
  const con = contemporaries(asResult(m), id, 120)
    .filter((x) => !family.has(x.id) && !met.has(x.id) && byId.get(x.id)!.magnitude <= 4)
    .slice(0, limit);
  const groupOf = (x: string): (typeof CON_GROUPS)[number] => {
    if (kin.has(x)) return 'Родня';
    const r = byId.get(x)!.roles;
    if (r.some((k) => RULERS.has(k))) return 'Правители';
    if (r.some((k) => CLERGY.has(k))) return 'Священники и пророки';
    return 'Другие';
  };
  const out: { sure: boolean; label: string; ids: string[] }[] = [];
  for (const sure of [true, false])
    for (const label of CON_GROUPS) {
      const ids = con.filter((x) => x.sure === sure && groupOf(x.id) === label).map((x) => x.id);
      if (ids.length) out.push({ sure, label, ids });
    }
  return out;
}

// ---------- перечни с «ещё N» ----------

type Item = (id: string, after?: string) => ComponentChildren;
const lowItem: Item = (x, after) => <PN id={x} lower dis={false} after={after} />;
const personsWord = (n: number) => plural(n, 'лицо', 'лица', 'лиц');

/**
 * Перечень лиц через запятую, не больше max, затем команда «ещё N лиц» (F5). Запятая — за своим именем (after),
 * чтобы перенос не ставил её в начало строки.
 */
function InlineList({ ids, max = 16, item = lowItem, tail, sep = ',' }: { ids: string[]; max?: number; item?: Item; tail?: string; sep?: string }) {
  const sig = ids.join('|');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cut = openFor !== sig && ids.length > max + 1;
  const shown = cut ? ids.slice(0, max) : ids;
  const more = ids.length - shown.length;
  return (
    <>
      {shown.map((k, i) => (
        <Fragment key={k}>
          {i ? ' ' : ''}
          {item(k, i < shown.length - 1 ? sep : more ? (sep === ',' ? undefined : sep) : tail)}
        </Fragment>
      ))}
      {more > 0 ? (
        <>
          {' '}
          <Glued after={tail}>
            <button type="button" class="more" onClick={() => setOpenFor(sig)}>
              ещё{' '}{more}{' '}{personsWord(more)}
            </button>
          </Glued>
        </>
      ) : null}
    </>
  );
}

/** Группа перечня: «от Соломона — Ровоам». head — подпись группы; null — без подписи (последней). */
type Group = { head: ComponentChildren | null; key: string; ids: string[] };

/** Перечень групп через «;»: «от Соломона — Ровоам; от Нафана — Маттафа»; больше max лиц — «ещё N лиц». */
function GroupList({ groups, max = 12, item = lowItem }: { groups: Group[]; max?: number; item?: Item }) {
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const sig = groups.map((g) => `${g.key}:${g.ids.join(',')}`).join('|');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const limit = openFor !== sig && total > max + 1 ? max : total;
  const out: ComponentChildren[] = [];
  let left = limit;
  const vis = groups.map((g) => {
    const ids = g.ids.slice(0, Math.max(0, left));
    left -= ids.length;
    return { ...g, ids };
  }).filter((g) => g.ids.length);
  vis.forEach((g, gi) => {
    const lastGroup = gi === vis.length - 1;
    out.push(
      <Fragment key={g.key}>
        {gi ? ' ' : ''}
        {g.head ? <>{g.head}{' '}— </> : null}
        {g.ids.map((x, i) => (
          <Fragment key={x}>
            {i ? ' ' : ''}
            {item(x, i < g.ids.length - 1 ? ',' : lastGroup ? undefined : ';')}
          </Fragment>
        ))}
      </Fragment>,
    );
  });
  const more = total - limit;
  return (
    <>
      {out}
      {more > 0 ? (
        <>
          {' '}
          <button type="button" class="more" onClick={() => setOpenFor(sig)}>
            ещё{' '}{more}{' '}{personsWord(more)}
          </button>
        </>
      ) : null}
    </>
  );
}

/** Перекрёстная ссылка «см. § 8» — команда: переходит к разделу (CARD-31). */
function SeeSec({ n }: { n: number }) {
  return (
    <button type="button" class="see" onClick={() => document.getElementById(`sec-${n}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
      см.{' '}§{' '}{n}
    </button>
  );
}

// ---------- повторы (F5; CARD-20) ----------

/** Ссылка без пробелов — для сравнения «1Цар 18:27» и «1 Цар 18:27». */
const refKey = (r: string) => r.replace(/\s+/g, '');
/** Глава ссылки: «1Пар 3:19-20» → «1Пар3». */
const chapterOf = (r: string) => refKey(r).replace(/:.*$/, '');

/** Слова, которые в заметке-перечне ничего не добавляют к строкам: термины родства, союзы. */
const FILLER = /^(и|а|также|—|–|-|сёстры|сестры|сестра|братья|брат|сыновья|сын|дочери|дочь|жёны|жены|жена|мужья|муж|дети|их|его|её|ее)$/;

type RowRef = { id: string; refs: string[] };
type NoteFate = { keep: Fact[]; attach: Map<string, Fact[]> };

/**
 * Заметки составителя (*Note) рядом со строками раздела, собранными из графа (§ 9, 11, 12):
 * — заметка-перечень, которая называет только лиц строк и стоит на тех же стихах, не выводится («Сёстры — Саруия
 *   и Авигея» при строках «Саруия — сестра», «Авигея — сестра»);
 * — заметка об одном лице строки, со стихом этой строки, встаёт под неё («Ионафан, „дядя Давидов“, — советник…»);
 * — остальные — отдельными абзацами, как были.
 */
function placeNotes(notes: Fact[] | undefined, rows: RowRef[]): NoteFate {
  const keep: Fact[] = [];
  const attach = new Map<string, Fact[]>();
  for (const f of notes ?? []) {
    const named = rows.filter((r) => mentionsPerson(f.text, r.id));
    const rowRefs = new Set(named.flatMap((r) => r.refs.map(refKey)));
    const covered = f.refs.length > 0 && f.refs.every((r) => rowRefs.has(refKey(r)));
    if (named.length >= 2 && covered) {
      let rest = f.text;
      for (const r of named) for (const w of byId.get(r.id)!.name.split(' ')) rest = rest.replace(new RegExp(`${w.slice(0, Math.max(3, w.length - 2))}[а-яё]*`, 'g'), ' ');
      const words = rest.split(/[\s,.;:«»()]+/).filter((w) => w && !FILLER.test(w.toLowerCase()));
      if (words.length <= 1) continue;
    }
    if (named.length === 1 && f.refs.some((r) => named[0].refs.some((q) => chapterOf(q) === chapterOf(r)))) {
      attach.set(named[0].id, [...(attach.get(named[0].id) ?? []), f]);
      continue;
    }
    keep.push(f);
  }
  return { keep, attach };
}

/** Короткое пояснение строки повторяет подробную заметку под ней: большая часть его слов есть в заметке. */
function noteRepeats(short: string, long: string): boolean {
  const stems = (s: string) => s.toLowerCase().split(/[^а-яё]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
  const a = stems(short);
  const b = new Set(stems(long));
  return a.length > 0 && a.filter((w) => b.has(w)).length / a.length >= 0.6;
}

/**
 * Одинаковые части пояснений у соседних записей (§ 9 Давида: «прямо „женой“ не названа, но сыновья её…» трижды)
 * сводятся в одно: у записей остаётся своё («мать Авессалома»), общее — одной строкой после группы:
 * «Каждая из трёх: прямо „женой“ не названа…». Части — по «;».
 */
function sharedClauses(notes: (string | undefined)[], sexes: ('m' | 'f')[]): { own: (string | undefined)[]; shared: Map<number, string> } {
  const parts = notes.map((n) => (n ? n.split(/;\s+/) : []));
  const count = new Map<string, number[]>();
  parts.forEach((ps, i) => ps.forEach((c) => count.set(c, [...(count.get(c) ?? []), i])));
  const own = parts.map((ps, i) => {
    const rest = ps.filter((c) => (count.get(c)?.length ?? 0) < 2);
    return rest.length ? rest.join('; ') : notes[i] && ps.length ? undefined : notes[i];
  });
  const shared = new Map<number, string>();
  for (const [c, at] of count) {
    if (at.length < 2) continue;
    const last = Math.max(...at);
    const allF = at.every((i) => sexes[i] === 'f');
    const lead = `${allF ? 'Каждая' : 'Каждый'} из ${countGen(at.length)}`;
    shared.set(last, `${lead}: ${c}`);
  }
  return { own, shared };
}

// ---------- вычисляемая вторая степень родства (F6; CARD-29) ----------

export type DerivedRow = { section: 6 | 12; label: string; ids: string[]; via?: { ids: string[]; word: string }; refs: string[] };

/**
 * Родня второй степени, которой нет среди связей Писания: деды и бабки (§ 6); дяди и тётки, тесть и тёща
 * (у женщины — свёкор и свекровь), невестки и зятья (§ 12). Вычисляется по связям «родитель — ребёнок» и брака
 * и по терминам Писания «брат», «сестра» у родителя (Давид — дядя Иоава по матери: Саруия — сестра Давида,
 * 1 Пар 2:16). Всё это — вывод («выв.»): однозначно следует из сопоставления стихов (ТЗ П-4).
 */
export function derivedKin(id: string): DerivedRow[] {
  const p = byId.get(id);
  if (!p || p.kind === 'people' || p.kind === 'clan') return [];
  const out: DerivedRow[] = [];
  const explicit = new Set<string>([id]);
  for (const k of graph.kinOf.get(id) ?? []) explicit.add(k.from === id ? k.to : k.from);
  for (const e of graph.parentsOf.get(id) ?? []) explicit.add(e.parent);
  for (const e of graph.childrenOf.get(id) ?? []) explicit.add(e.child);
  for (const s of graph.spousesOf.get(id) ?? []) explicit.add(s.a === id ? s.b : s.a);
  for (const s of siblings(graph, id)) explicit.add(s.id);
  const taken = new Set(explicit);
  const parents = (graph.parentsOf.get(id) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'));
  // деды и бабки — § 6
  for (const e of parents) {
    const side = e.kind === 'father' ? 'по отцу' : 'по матери';
    for (const g of (graph.parentsOf.get(e.parent) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'))) {
      if (taken.has(g.parent)) continue;
      taken.add(g.parent);
      out.push({ section: 6, label: derivedKinLabel(g.kind === 'father' ? 'grandfather' : 'grandmother', side, 1), ids: [g.parent], refs: g.refs });
    }
  }
  // дяди и тётки — братья и сёстры родителей: по графу и по терминам Писания у родителя
  for (const e of parents) {
    const side = e.kind === 'father' ? 'по отцу' : 'по матери';
    const sibs = siblings(graph, e.parent).map((s) => s.id).filter((x) => !taken.has(x));
    const viaKin = (graph.kinOf.get(e.parent) ?? [])
      .filter((k) => SIBLING_KIN.test(k.rel))
      .map((k) => ({ other: k.from === e.parent ? k.to : k.from, refs: k.refs }))
      .filter((x, i, a) => !taken.has(x.other) && !sibs.includes(x.other) && a.findIndex((y) => y.other === x.other) === i);
    for (const x of sibs) taken.add(x);
    if (sibs.length) out.push({ section: 12, label: derivedKinLabel('uncle', side, sibs.length, sibs.map((x) => byId.get(x)!.sex)), ids: sibs, refs: [] });
    for (const x of viaKin) {
      taken.add(x.other);
      const q = byId.get(x.other)!;
      out.push({ section: 12, label: derivedKinLabel('uncle', side, 1, [q.sex]), ids: [x.other], via: { ids: [e.parent], word: bySex(q.sex, 'брат', 'сестра') }, refs: x.refs });
    }
  }
  // свойственники: родители супругов; супруги детей
  const inlaw = new Map<string, { via: string[]; kind: 'parent' | 'child' }>();
  for (const s of graph.spousesOf.get(id) ?? []) {
    const sp = s.a === id ? s.b : s.a;
    for (const g of (graph.parentsOf.get(sp) ?? []).filter(plainLink)) {
      if (taken.has(g.parent)) continue;
      const v = inlaw.get(g.parent) ?? { via: [], kind: 'parent' as const };
      if (!v.via.includes(sp)) v.via.push(sp);
      inlaw.set(g.parent, v);
    }
  }
  for (const k of kidsOf(id)) {
    for (const s of graph.spousesOf.get(k) ?? []) {
      const sp = s.a === k ? s.b : s.a;
      if (taken.has(sp) || sp === id) continue;
      const v = inlaw.get(sp) ?? { via: [], kind: 'child' as const };
      if (!v.via.includes(k)) v.via.push(k);
      inlaw.set(sp, v);
    }
  }
  // невестки и зятья — по детям: «Невестки: Лия, Рахиль, Валла, Зелфа, жёны Иакова»
  const byChild = new Map<string, string[]>();
  for (const [x, v] of inlaw) {
    taken.add(x);
    const q = byId.get(x)!;
    if (v.kind === 'child') {
      const key = `${v.via.join('+')}|${q.sex}`;
      byChild.set(key, [...(byChild.get(key) ?? []), x]);
      continue;
    }
    const role = p.sex === 'f' ? (q.sex === 'f' ? 'mother-in-law-f' : 'father-in-law-f') : q.sex === 'f' ? 'mother-in-law' : 'father-in-law';
    // «Свекровь: Ноеминь, мать Махлона»
    out.push({ section: 12, label: derivedKinLabel(role, '', 1), ids: [x], via: { ids: v.via, word: bySex(q.sex, 'отец', 'мать') }, refs: [] });
  }
  for (const [key, xs] of byChild) {
    const [via, sex] = key.split('|') as [string, 'm' | 'f'];
    const many = xs.length > 1;
    const role = sex === 'f' ? 'daughter-in-law' : 'son-in-law';
    const word = sex === 'f' ? (many ? 'жёны' : 'жена') : many ? 'мужья' : 'муж';
    out.push({ section: 12, label: derivedKinLabel(role, '', xs.length), ids: xs, via: { ids: via.split('+'), word }, refs: [] });
  }
  return out;
}

// ---------- § 15: места по роли ----------

const LEAD_PREP = /^(При|У|В|Во|На|Близ|Около|Между|Из|От|До|Под|Над|За|Перед)(?=\s)/;
/** Название места в перечне: «При дворе Саула» → «при дворе Саула»; имена собственные — как есть. */
const placeName = (s: string) => (LEAD_PREP.test(s) ? lowerFirst(s) : s);

/**
 * Места одной роли (§ 15): «Вифлеем 1 Цар 16:4; при дворе Саула 1 Цар 16:21–22; …» — не больше четырёх,
 * затем «ещё 5 мест» (F5): строка роли короткая, и предел раздела в 8 строк оставляет место другим ролям.
 */
function PlaceList({ places, owner, link, max = 4 }: { places: { name: string; note?: string; refs: string[] }[]; owner: string; link: (t: string) => ComponentChildren; max?: number }) {
  const sig = `${owner}|${places.map((x) => x.name).join('|')}`;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cut = openFor !== sig && places.length > max + 1;
  const shown = cut ? places.slice(0, max) : places;
  const more = places.length - shown.length;
  return (
    <>
      {shown.map((x, i) => {
        // «;» между местами — за ссылками на стихи или за последним словом: перенос не ставит его в начало строки
        const sep = i < shown.length - 1 || more ? ';' : '';
        const bare = !x.refs.length;
        return (
          <Fragment key={i}>
            {i ? ' ' : ''}
            {/* строки собраны здесь, внутри компонента: typoTree раздела до них не доходит — typo на месте */}
            {typo(x.note ? placeName(x.name) : placeName(x.name) + (bare ? sep : ''))}
            {x.note ? <> — {typoTree(link(lowerFirst(x.note) + (bare ? sep : '')))}</> : null}
            <Refs refs={x.refs} owner={`${owner}.${i}`} tail={bare ? undefined : sep || undefined} />
          </Fragment>
        );
      })}
      {more > 0 ? (
        <>
          {' '}
          <button type="button" class="more" onClick={() => setOpenFor(sig)}>
            ещё{'\u00a0'}{more}{'\u00a0'}{plural(more, 'место', 'места', 'мест')}
          </button>
        </>
      ) : null}
      {places.map((x, i) => (
        <VerseInsert key={`v${i}`} owner={`${owner}.${i}`} refs={x.refs} />
      ))}
    </>
  );
}

// ---------- разделы ----------

/**
 * Содержимое разделов 1–24 одного лица; ns — приставка ключей вставок стихов (две карточки в развороте).
 * chrono — хронологические входы из тома карточки (царствования со стихами, § 16); без них — годы из индекса.
 */
export function buildSections(
  id: string, p: AtlasPerson, card: Card | null, m: ModelData, c: ChronoRow | undefined, ns = '', chrono: Chrono | null = null,
): Map<number, ComponentChildren> {
  const out = new Map<number, ComponentChildren>();
  // раздел без сведений не выводится и не считается составленным: ни «0», ни пустой строки, ни пустого фрагмента
  const put = (n: number, v: unknown) => {
    // одна функция русской типографики для всех строк раздела (B5): неразрывные пробелы, «–» с U+2060, без «;» в начале
    if (!isEmpty(v)) out.set(n, typoTree(v as ComponentChildren));
  };
  // имена лиц окружения в тексте фактов — ссылки (F12)
  const cands: LinkCand[] = linkCandidates(id, (card?.met ?? []).map((x) => x.id));
  const L = (t: string) => linkText(t, cands);
  const fact = (f: Fact, key: string, i: number, extra?: ComponentChildren) => (
    <li class="fact" key={i}>
      {L(f.text)}
      <Refs refs={f.refs} owner={ns + `${key}.${i}`} />
      <Mark cert={f.cert} />
      {extra}
      <VerseInsert owner={ns + `${key}.${i}`} refs={f.refs} />
    </li>
  );
  const facts = (fs: Fact[] | undefined, key: string) => (fs && fs.length ? <ul>{fs.map((f, i) => fact(f, key, i))}</ul> : null);
  /** Заметки под строкой: текст и стихи, которых у строки нет. */
  const subNotes = (fs: Fact[] | undefined, rowRefs: string[], key: string) =>
    fs?.map((f, i) => {
      const own = f.refs.filter((r) => !rowRefs.some((q) => refKey(q) === refKey(r)));
      return (
        <div class="note fact" key={`${key}${i}`}>
          {L(f.text)}
          <Refs refs={own} owner={ns + `${key}.${i}`} />
          <Mark cert={f.cert} />
          <VerseInsert owner={ns + `${key}.${i}`} refs={own} />
        </div>
      );
    });
  const derived = derivedKin(id);

  // 1 — имя: шапка его уже называет; раздел говорит об одноимённых и о том, что это за имя
  {
    const same = (nameCount.get(p.name) ?? []).filter((x) => x !== id);
    put(
      1,
      (
        <>
          {p.unnamed ? <p>{typo('В Писании имя не названо; в атласе лицо названо описательно.')}</p> : null}
          {p.kind === 'people' ? <p>В тексте это имя народа или рода.</p> : null}
          {p.kind === 'founder' ? <p>{bySex(p.sex, 'Назван «отцом» города, то есть родоначальником', 'Названа «матерью» города, то есть родоначальницей')} его жителей.</p> : null}
          {!same.length && !p.unnamed ? <p>{`Других лиц с именем ${p.name} в атласе нет.`}</p> : null}
          {same.length && !p.unnamed ? (
            <p>
              {`В атласе ещё ${same.length} ${plural(same.length, 'лицо', 'лица', 'лиц')} с именем ${p.name}: `}
              <InlineList
                ids={same}
                max={8}
                tail="."
                sep=";"
                item={(x, after) => <PN id={x} dis after={after} />}
              />
            </p>
          ) : null}
        </>
      ),
    );
  }
  if (card) {
    const o = card.original;
    put(
      2,
      o && (
        <p class="fact">
          <bdi lang={o.lang === 'gr' ? 'el' : 'he'} dir={o.lang === 'gr' ? 'ltr' : 'rtl'} class={o.lang === 'gr' ? '' : 'he'}>
            {o.script}
          </bdi>{' '}
          <i>{o.translit}</i>
          {o.note ? <span class="muted">; {o.note}</span> : null}
          <MarkNote label="справ." full={MARK_FULL.ref} />
        </p>
      ),
    );
    const mn = card.meaning;
    put(
      3,
      mn && (
        <p class="fact">
          {mn.text}
          <Refs refs={mn.refs} owner={ns + 'm3'} />
          {!mn.refs?.length ? <MarkNote label="справ." full={MARK_FULL.etym} /> : <Mark cert={mn.cert} />}
          <VerseInsert owner={ns + 'm3'} refs={mn.refs} />
        </p>
      ),
    );
    put(
      4,
      card.altNames?.length ? (
        <ul>
          {card.altNames.map((a, i) => {
            // «Аврам — прежнее имя», «Израиль — новое имя»; пояснение, которое само начинается с подписи, заменяет её
            const label = altKindLabel(a.kind, a.note, p.name);
            const noteLeads = !!a.note && a.note.toLowerCase().startsWith(label);
            return (
              <li class="fact" key={i}>
                {a.name} <span class="muted">— {noteLeads ? a.note : label}</span>
                {a.note && !noteLeads ? <span class="muted">. {L(capFirst(a.note))}</span> : null}
                <Refs refs={a.refs} owner={ns + `a4.${i}`} />
                <VerseInsert owner={ns + `a4.${i}`} refs={a.refs} />
              </li>
            );
          })}
        </ul>
      ) : null,
    );
  }
  // 5 — роль и положение: роли уже в паспорте (F5); здесь — записи составителя
  put(5, facts(card?.status, 's5'));
  // 6 — родители и деды
  {
    const rows: ComponentChildren[] = [];
    const pc: Cert = p.parentCert;
    // у отца и у матери свои стихи (CARD-32): при сборке общий список parentRefs разделён по тому, кто назван в стихе
    const by = card?.parentRefsBy;
    const fRefs = by?.father ?? p.parentRefs;
    const mRefs = by?.mother ?? p.parentRefs;
    if (p.father) rows.push(<li class="fact" key="f">{p.fatherKind === 'legal' ? 'Законный отец' : 'Отец'}: <PT id={p.father} /><Refs refs={fRefs} owner={ns + 'p6f'} /><Mark cert={pc} /><VerseInsert owner={ns + 'p6f'} refs={fRefs} />{p.fatherGap && <span class="muted"> — родословие здесь может пропускать поколения</span>}</li>);
    if (p.mother) rows.push(<li class="fact" key="m">Мать: <PT id={p.mother} /><Refs refs={mRefs} owner={ns + 'p6m'} /><Mark cert={p.motherCert} /><VerseInsert owner={ns + 'p6m'} refs={mRefs} /></li>);
    p.otherParents.forEach((o, i) =>
      rows.push(
        // «Приёмная мать: дочь фараонова», «Приёмный отец: Мардохей» — вид и роль одним словосочетанием, согласованным по роду
        <li class="fact" key={`o${i}`}>
          {otherParentLabel(o.kind, o.role)}: <PT id={o.id} />
          <Refs refs={o.refs} owner={ns + `p6o${i}`} />
          <Mark cert={o.cert} />
          <VerseInsert owner={ns + `p6o${i}`} refs={o.refs} />
        </li>,
      ),
    );
    derived.filter((r) => r.section === 6).forEach((r, i) =>
      rows.push(
        <li class="fact" key={`g${i}`}>
          {r.label}: <PT id={r.ids[0]} />
          <MarkNote label="выв." full="вывод: родитель родителя — по двум связям, записанным в Писании" />
        </li>,
      ),
    );
    put(6, has(rows, card?.parentsNote) && (<>{rows.length ? <ul>{rows}</ul> : null}{facts(card?.parentsNote, 'n6')}</>));
  }
  // 7 — род, колено, народ: колено по предкам (как в паспорте) и записи составителя
  {
    const aff = affiliation(id)?.text;
    put(7, has(card?.lineage, aff) && (<>{aff ? <p>{aff}</p> : null}{facts(card?.lineage, 'l7')}</>));
  }
  // 8 — рождение; место, с которого начинается запись («Вифлеем — „город Давидов“»), не повторяется отдельной строкой
  if (c) {
    const place = card?.birth?.place;
    const bf = card?.birth?.facts ?? [];
    const lead = place ? bf.findIndex((f) => f.text.startsWith(place)) : -1;
    put(
      8,
      <>
        {BirthLine({ p, c, m })}
        {place && lead < 0 ? <p>Место: {place}</p> : null}
        {bf.length ? <ul>{bf.map((f, i) => (i === lead ? fact({ ...f, text: `Место: ${f.text}` }, 'b8', i) : fact(f, 'b8', i)))}</ul> : null}
      </>,
    );
  }
  // 9 — супруги
  {
    const sp = (graph.spousesOf.get(id) ?? []).map((s) => ({ other: s.a === id ? s.b : s.a, s }));
    // подпись — кем второе лицо приходится владельцу карточки: у мужчины «Мааха — наложница», у женщины «Халев — муж»
    const spouseLabel = (s: (typeof sp)[number]['s']) =>
      p.sex === 'm' ? (s.kind === 'concubine' ? 'наложница' : 'жена') : s.kind === 'concubine' ? 'муж; она названа его наложницей' : 'муж';
    // описательное имя уже называет родство («Жена-Ефиоплянка Моисея»): подпись «— жена» была бы тавтологией
    const saysItself = (other: string, s: (typeof sp)[number]['s']) => byId.get(other)!.name.toLowerCase().startsWith(spouseLabel(s).split(';')[0]);
    const same9 = namesakesIn(id, sp.map((x) => x.other));
    const fate = placeNotes(card?.spousesNote, sp.map((x) => ({ id: x.other, refs: x.s.refs })));
    // пояснения: подробная заметка под строкой заменяет короткое; общее у нескольких жён — одной строкой после группы
    const shortNotes = sp.map((x) => (x.s.note && !(fate.attach.get(x.other) ?? []).some((f) => noteRepeats(x.s.note!, f.text)) ? x.s.note : undefined));
    const { own, shared } = sharedClauses(shortNotes, sp.map((x) => byId.get(x.other)!.sex));
    put(
      9,
      has(sp, card?.spousesNote) && (
        <>
          {sp.length ? (
            <ul>
              {sp.map(({ other, s }, i) => (
                <Fragment key={other}>
                  <li class="fact">
                    <PN id={other} dis={same9.has(other)} />
                    {saysItself(other, s) ? null : <span class="muted"> — {spouseLabel(s)}</span>}
                    <Refs refs={s.refs} owner={ns + `s9.${i}`} />
                    <Mark cert={s.cert} />
                    {own[i] ? <div class="note">{L(own[i]!)}</div> : null}
                    {subNotes(fate.attach.get(other), s.refs, `s9n${i}.`)}
                    <VerseInsert owner={ns + `s9.${i}`} refs={s.refs} />
                  </li>
                  {shared.has(i) ? <li class="note">{L(shared.get(i)!)}</li> : null}
                </Fragment>
              ))}
            </ul>
          ) : null}
          {facts(fate.keep, 'n9')}
        </>
      ),
    );
  }
  // 10 — дети по матерям; внуки и правнуки при родителях
  {
    const kids = (graph.childrenOf.get(id) ?? []).filter(direct);
    // в группе — по порядку рождения; безымянный без номера (первый сын от Вирсавии, 2 Цар 12:15–18) — первым
    const rank = (x: string) => byId.get(x)!.order ?? (byId.get(x)!.unnamed ? 0 : 99);
    const order = (a: string, b: string) => rank(a) - rank(b);
    // законное отцовство (Иосиф — Иисус Христос, Мф 1:16): группа «от …» не строится ни у отца, ни у матери
    const legal: string[] = [];
    const byMother = new Map<string, string[]>();
    for (const e of kids) {
      const k = byId.get(e.child)!;
      if (k.fatherKind === 'legal' && k.father) {
        if (!legal.includes(e.child)) legal.push(e.child);
        continue;
      }
      const other = p.sex === 'm' ? k.mother ?? '' : k.father ?? '';
      const a = byMother.get(other) ?? [];
      if (!a.includes(e.child)) a.push(e.child);
      byMother.set(other, a);
    }
    const legalRow = (kid: string, i: number) => {
      const k = byId.get(kid)!;
      const messiah = k.roles.includes('messiah');
      if (k.father === id) {
        // «Законный сын: Иисус Христос, рождённый Марией (Мф 1:16)»
        const mother = k.mother ? caseLink(k.mother, 'ins') : null;
        const refs = messiah ? MESSIAH_BIRTH.fatherRefs : k.parentRefs;
        return (
          <li class="fact" key={`l${kid}`}>
            {bySex(k.sex, 'Законный сын', 'Законная дочь')}: <Glued after={k.mother ? (mother ? ',' : ';') : undefined}><P id={kid} /></Glued>
            {k.mother ? (mother ? <> {bySex(k.sex, 'рождённый', 'рождённая')} {mother}</> : <> мать — <PT id={k.mother} /></>) : null}
            <Refs refs={refs} owner={ns + `c10l${i}`} />
            <VerseInsert owner={ns + `c10l${i}`} refs={refs} />
          </li>
        );
      }
      // у матери: «Сын: Иисус Христос — зачат от Духа Святаго (Мф 1:18, 20; Лк 1:35)»
      const refs = messiah ? MESSIAH_BIRTH.mother.refs : k.parentRefs;
      return (
        <li class="fact" key={`l${kid}`}>
          {bySex(k.sex, 'Сын', 'Дочь')}: <Glued after={messiah ? undefined : ';'}><P id={kid} /></Glued>
          {messiah ? <> — {MESSIAH_BIRTH.mother.text}</> : <> законный отец — <PT id={k.father!} /></>}
          <Refs refs={refs} owner={ns + `c10l${i}`} />
          <VerseInsert owner={ns + `c10l${i}`} refs={refs} />
        </li>
      );
    };
    // дети по иным указаниям — подписью от лица родителя: «Потомок, названный без промежуточных звеньев: Исмаил»
    const byClaim = new Map<string, ParentEdge[]>();
    for (const e of graph.childrenOf.get(id) ?? []) {
      if (!e.kind.startsWith('other')) continue;
      const a = byClaim.get(e.claim) ?? [];
      if (!a.some((x) => x.child === e.child)) a.push(e);
      byClaim.set(e.claim, a);
    }
    const childIds = [...new Set(kids.map((e) => e.child))];
    const grand = [...new Set(childIds.flatMap(kidsOf))];
    const great = [...new Set(grand.flatMap(kidsOf))];
    // одноимённые в разделе (Фамарь — дочь и Фамарь — внучка Давида) — с уточнением; безымянные — всегда
    const same10 = namesakesIn(id, [...childIds, ...[...byClaim.values()].flat().map((e) => e.child), ...grand, ...great]);
    const showDis = (x: string) => same10.has(x) || (byId.get(x)!.unnamed && !!byId.get(x)!.disambig);
    const item: Item = (x, after) => <PN id={x} lower dis={showDis(x)} after={after} />;
    const sexes = (ids: string[]) => ids.map((x) => byId.get(x)!.sex);
    // народ с именем во множественном числе («Лудим», «Филистимляне») не называется «сыном» или «внуком» (Быт 10:13–14)
    const isPlural = (x: string) => pluralPeopleName(byId.get(x)!.name, byId.get(x)!.kind);
    const owner = { sex: p.sex, plural: pluralPeopleName(p.name, p.kind) };
    const onLine = (x: string) => lineMembership.joseph.has(x) || lineMembership.mary.has(x);
    // значимые первыми: на линиях Мессии, затем по яркости звезды, затем по порядку рождения (UX-37, CARD-27)
    const weight = (x: string) => (onLine(x) ? -10 : 0) + (byId.get(x)!.magnitude ?? 6);
    const bySignificance = (a: string, b: string) => weight(a) - weight(b) || rank(a) - rank(b);
    /** «Внуки: от Соломона — Ровоам; от Нафана — Маттафа…» — при родителях; родитель без надёжного падежа — последней группой. */
    const genRow = (gen: 2 | 3, ids: string[], from: string[]) => {
      const people = ids.filter(isPlural);
      const rest = new Set(ids.filter((x) => !isPlural(x)));
      const groups: Group[] = [];
      const loose: string[] = [];
      const seen = new Set<string>();
      for (const par of [...from].sort(bySignificance)) {
        const g = kidsOf(par).filter((x) => rest.has(x) && !seen.has(x)).sort(bySignificance);
        if (!g.length) continue;
        g.forEach((x) => seen.add(x));
        const head = caseLink(par, 'gen');
        if (head) groups.push({ head: <>от {head}</>, key: par, ids: g });
        else loose.push(...g);
      }
      if (loose.length) groups.push({ head: null, key: '~', ids: loose });
      // все внуки — от одного ребёнка: подпись «от Овида» ничего не различает
      if (groups.length === 1) groups[0] = { ...groups[0], head: null };
      const all = groups.flatMap((g) => g.ids);
      return (
        <>
          {all.length ? (
            <p key={`g${gen}`}>
              <span class="muted">{descendantsNoun(gen, sexes(all))}: </span>
              <GroupList groups={groups} item={item} />
            </p>
          ) : null}
          {people.length ? (
            <p key={`g${gen}p`}>
              <span class="muted">{peoplesLabel(gen, owner)}: </span>
              <InlineList ids={people} item={item} />
            </p>
          ) : null}
        </>
      );
    };
    /**
     * Группы детей по второму родителю — одной схемой: «Сын от Вооза: Овид», «Сыновья от Вирсавии: …»;
     * если имя не склоняется — «Сын: Махир; мать — наложница-Арамеянка»; дети, второй родитель которых не назван, —
     * последней группой: «Дети, мать которых не названа: …» (если у других детей мать названа) или просто «Сыновья: …».
     */
    const groups = [...byMother].sort((a, b) => Number(!a[0]) - Number(!b[0]));
    const anyNamed = groups.some(([other]) => !!other);
    const row = (key: string, label: ComponentChildren, ids: string[]) => (
      <p key={key}>
        <span class="muted">{label}: </span>
        <InlineList ids={ids} item={item} />
      </p>
    );
    const childRows = groups.map(([other, all]) => {
      const ids = all.filter((x) => !isPlural(x)).sort(order);
      const people = all.filter(isPlural).sort(order);
      const peopleRow = people.length ? row(`p${other}`, peoplesLabel(1, owner), people) : null;
      if (!ids.length) return <Fragment key={`p${other}`}>{peopleRow}</Fragment>;
      const noun = childrenNoun(sexes(ids));
      if (!other) return <Fragment key="u">{row(`u`, anyNamed ? unnamedParentLabel(sexes(ids), p.sex) : noun, ids)}{peopleRow}</Fragment>;
      const g = caseLink(other, 'gen');
      if (g)
        return (
          <Fragment key={other}>
            <p key={`m${other}`}>
              <span class="muted">{noun} от </span>
              <Glued after={<span class="muted">:</span>}>{g}</Glued>{' '}
              <InlineList ids={ids} item={item} />
            </p>
            {peopleRow}
          </Fragment>
        );
      // имя второго родителя не склоняется — оно в именительном падеже после перечня
      return (
        <Fragment key={other}>
          <p key={`m${other}`}>
            <span class="muted">{noun}: </span>
            <InlineList ids={ids} item={item} tail=";" />
            <span class="muted"> {byId.get(other)?.sex === 'f' ? 'мать' : 'отец'} — </span>
            <PT id={other} />
          </p>
          {peopleRow}
        </Fragment>
      );
    });
    put(
      10,
      has(kids, byClaim.size > 0, card?.childrenNote) && (
        <>
          {legal.length ? <ul>{legal.map(legalRow)}</ul> : null}
          {childRows}
          {[...byClaim].map(([claim, es], i) => {
            const ids = es.map((e) => e.child);
            // стихи — при небольшой группе; у большой они в § 6 каждого потомка
            const refs = es.length <= 3 ? [...new Set(es.flatMap((e) => e.refs))] : [];
            return (
              <p class="fact" key={`c${claim}`}>
                <span class="muted">{otherChildLabel(claim, sexes(ids))}: </span>
                <InlineList ids={ids} item={(x, after) => <PN id={x} lower dis={same10.has(x) || undefined} after={after} />} />
                <Refs refs={refs} owner={ns + `c10o${i}`} />
                <Mark cert={es.every((e) => e.cert === es[0].cert) ? es[0].cert : undefined} />
                <VerseInsert owner={ns + `c10o${i}`} refs={refs} />
              </p>
            );
          })}
          {genRow(2, grand, childIds)}
          {genRow(3, great, grand)}
          {facts(card?.childrenNote, 'n10')}
        </>
      ),
    );
  }
  // 11 — братья и сёстры
  {
    const sib = siblings(graph, id);
    // брат или сестра, названные так в Писании без общих родителей в данных (Саруия — сестра Давида, 1 Пар 2:16)
    const kinSib = (graph.kinOf.get(id) ?? [])
      .filter((k) => SIBLING_KIN.test(k.rel))
      .map((k) => ({ other: k.from === id ? k.to : k.from, k }))
      .filter((x, i, a) => !sib.some((s) => s.id === x.other) && a.findIndex((y) => y.other === x.other) === i);
    const same11 = namesakesIn(id, [...kinSib.map((x) => x.other), ...sib.map((x) => x.id)]);
    const item: Item = (x, after) => <PN id={x} dis={same11.has(x)} after={after} />;
    // братья по родителю, названному в другом месте Писания (Авиуд — Мф 1:13, братья — 1 Пар 3:19–20): вывод
    const myChapters = new Set(p.parentRefs.map(chapterOf));
    const attested = (x: string) => byId.get(x)!.parentRefs.some((r) => myChapters.has(chapterOf(r)));
    const plain = sib.filter((s) => s.kind === 'full' || s.kind === 'unknown');
    const half = sib.filter((s) => s.kind === 'paternal' || s.kind === 'maternal');
    const rows: ComponentChildren[] = [];
    const plainSure = plain.filter((s) => attested(s.id)).map((s) => s.id);
    const plainInf = plain.filter((s) => !attested(s.id)).map((s) => s.id);
    const inferMark = <MarkNote label="выв." full="вывод: общий родитель назван в разных местах Писания и отождествлён" />;
    if (plainSure.length) rows.push(<p key="s"><InlineList ids={plainSure} item={item} /></p>);
    if (plainInf.length) rows.push(<p class="fact" key="i"><InlineList ids={plainInf} item={item} />{inferMark}</p>);
    // единокровные и единоутробные — группой, по второму родителю: «Единокровные братья: Измаил — от Агари; …»
    for (const kind of ['paternal', 'maternal'] as const) {
      const ids = half.filter((s) => s.kind === kind).map((s) => s.id);
      if (!ids.length) continue;
      const by = new Map<string, string[]>();
      for (const x of ids) {
        const q = byId.get(x)!;
        const other = (kind === 'paternal' ? q.mother : q.father) ?? '';
        by.set(other, [...(by.get(other) ?? []), x]);
      }
      rows.push(
        <p class="fact" key={kind}>
          <span class="muted">{halfSiblingsLabel(kind, sexesOf(ids))}: </span>
          {[...by].map(([other, xs], gi) => {
            const g = other ? caseLink(other, 'gen') : null;
            const last = gi === by.size - 1;
            return (
              <Fragment key={other || '~'}>
                {gi ? ' ' : ''}
                <InlineList ids={xs} item={item} tail={g || last ? undefined : ';'} />
                {g ? <> — от <Glued after={last ? undefined : ';'}>{g}</Glued></> : null}
              </Fragment>
            );
          })}
          {ids.some((x) => !attested(x)) ? inferMark : null}
        </p>,
      );
    }
    const fate = placeNotes(card?.siblingsNote, kinSib.map((x) => ({ id: x.other, refs: x.k.refs })));
    put(
      11,
      has(sib, kinSib, card?.siblingsNote) && (
        <>
          {kinSib.length ? (
            <ul>
              {kinSib.map(({ other, k }, i) => (
                <li class="fact" key={other}>
                  <PN id={other} dis={same11.has(other)} />
                  {/* термин записан у того, кого он описывает: «Саруия — сестра Давида»; обратное — по полу */}
                  <span class="muted"> — {k.from === other ? k.rel : byId.get(other)!.sex === 'f' ? 'сестра' : 'брат'}</span>
                  <Refs refs={k.refs} owner={ns + `ks11.${i}`} />
                  <Mark cert={k.cert} />
                  {subNotes(fate.attach.get(other), k.refs, `ks11n${i}.`)}
                  <VerseInsert owner={ns + `ks11.${i}`} refs={k.refs} />
                </li>
              ))}
            </ul>
          ) : null}
          {rows}
          {facts(fate.keep, 'n11')}
        </>
      ),
    );
  }
  // 12 — иное родство: термины Писания, затем вычисляемая вторая степень
  {
    const kin = (graph.kinOf.get(id) ?? []).filter((k) => !SIBLING_KIN.test(k.rel)); // братья и сёстры — в § 11
    const spouses = new Set((graph.spousesOf.get(id) ?? []).map((s) => (s.a === id ? s.b : s.a)));
    const same12 = namesakesIn(id, kin.map((k) => (k.from === id ? k.to : k.from)));
    const dis12 = (x: string) => (same12.has(x) ? <span class="muted"> ({disambigText(x)})</span> : null);
    /**
     * Термин записан у того, кого он описывает (`kin` у Иохаведы: Амрам, «тётка» — она тётка Амрама).
     * Термин второго лица о владельце: «Иохаведа — тётка» (в карточке Амрама).
     * Термин владельца о втором лице: «Приходится тёткой Амраму, своему мужу» — термин Писания сохраняется (П-8).
     */
    const kinLine = (k: (typeof kin)[number]) => {
      if (k.from !== id) {
        return (
          <>
            <PN id={k.from} dis={same12.has(k.from)} /> — {k.rel}
          </>
        );
      }
      const o = byId.get(k.to)!;
      const { term, tail } = splitKinTerm(k.rel);
      const ins = kinTermIns(term);
      const dat = caseLink(k.to, 'dat');
      if (ins && dat) {
        // термин Писания, пересказанный другим словом, — после двоеточия: «двоюродной сестрой Мардохею: дочь его дяди Абихаила»
        const quoted = KIN_TERM_QUOTED.has(term.toLowerCase());
        const myFather = quoted && p.father && p.fatherKind !== 'legal' ? caseLink(p.father, 'gen') : null;
        const after = quoted ? ':' : spouses.has(k.to) ? ',' : undefined;
        return (
          <>
            Приходится {ins}{' '}
            {same12.has(k.to) ? dat : <Glued after={after}>{dat}</Glued>}
            {dis12(k.to)}
            {same12.has(k.to) && quoted ? ':' : ''}
            {quoted ? (
              <>
                {' '}
                {term.split(' ')[0]} {bySex(o.sex, 'его', 'её')} {term.split(' ').slice(1).join(' ')}
                {myFather ? <> {myFather}</> : null}
              </>
            ) : null}
            {spouses.has(k.to) ? `${same12.has(k.to) ? ',' : ''} ${ownSpouseDat(o.sex)}` : ''}
            {tail ? ` ${tail}` : ''}
          </>
        );
      }
      // склонение ненадёжно — имя второго лица в начале строки, термин от его лица, если он есть в словаре
      const rev = kinTermReverse(term, o.sex);
      return rev ? (
        <>
          <PN id={k.to} dis={same12.has(k.to)} /> — {rev}
          {tail ? ` ${tail}` : ''}
        </>
      ) : (
        <>
          <PN id={k.to} dis={same12.has(k.to)} /> — связь по Писанию: «{k.rel}»
        </>
      );
    };
    const fate = placeNotes(card?.kinNote, kin.map((k) => ({ id: k.from === id ? k.to : k.from, refs: k.refs })));
    // вычисляемое родство — если о лице не говорит ни термин Писания, ни заметка составителя («Сноха Ноемини»)
    const dRows = derived.filter((r) => r.section === 12 && !(card?.kinNote ?? []).some((f) => r.ids.some((x) => mentionsPerson(f.text, x))));
    put(
      12,
      has(kin, card?.kinNote, dRows) && (
        <>
          {kin.length ? (
            <ul>
              {kin.map((k, i) => {
                const other = k.from === id ? k.to : k.from;
                return (
                  <li class="fact" key={i}>
                    {kinLine(k)}
                    <Refs refs={k.refs} owner={ns + `k12.${i}`} />
                    <Mark cert={k.cert} />
                    {subNotes(fate.attach.get(other), k.refs, `k12n${i}.`)}
                    <VerseInsert owner={ns + `k12.${i}`} refs={k.refs} />
                  </li>
                );
              })}
            </ul>
          ) : null}
          {dRows.length ? (
            <ul>
              {dRows.map((r, i) => {
                // «Дядя по матери: Давид, брат Саруии»; «Свекровь: Ноеминь, мать Махлона» — если все имена склоняются
                const via = r.via ? r.via.ids.map((x) => caseLink(x, 'gen')) : [];
                const viaOk = !!r.via && via.length > 0 && via.every((x) => x !== null);
                return (
                  <li class="fact" key={`d${i}`}>
                    {r.label}: <InlineList ids={r.ids} item={(x, after) => <PN id={x} lower dis={r.via ? false : undefined} after={after} />} tail={viaOk ? ',' : undefined} />
                    {viaOk ? (
                      <>
                        {' '}
                        {r.via!.word}{' '}
                        {via.map((v, k) => (
                          <Fragment key={k}>
                            {k ? (k === via.length - 1 ? ' и ' : ', ') : ''}
                            {v}
                          </Fragment>
                        ))}
                      </>
                    ) : null}
                    <Refs refs={r.refs} owner={ns + `d12.${i}`} />
                    <MarkNote label="выв." full="вывод: родство второй степени по связям, записанным в Писании" />
                    <VerseInsert owner={ns + `d12.${i}`} refs={r.refs} />
                  </li>
                );
              })}
            </ul>
          ) : null}
          {facts(fate.keep, 'n12')}
        </>
      ),
    );
  }
  // 13 — эпоха и относительная хронология
  if (c) put(13, RelativeChrono({ id, m, note: card?.chronoNote }));
  // 14 — встречи и современники
  {
    // встречи — и у лиц без дат: у Мелхиседека встреча с Аврамом — единственная опора времени
    const met = card?.met ?? [];
    const metIds = new Set(met.map((x) => x.id));
    const groups = c && c.cls !== 'epochal' ? contemporaryGroups(id, m, familyIds(id), metIds) : [];
    put(
      14,
      has(met, groups) && (
        <>
          {met.length ? (
            <>
              <p class="sub">Встречи, о которых говорит Писание</p>
              <ul>
                {met.map((mt, i) => {
                  // имя лица встречи — в самом тексте: «Помазан Самуилом; бежал к нему в Раму», «Встретил Аврама…» (F7);
                  // если его там нет — в начале строки: «Саул — служил при нём»
                  const q = byId.get(mt.id);
                  const dis = q?.disambig && (nameCount.get(q.name)?.length ?? 0) > 1 ? <span class="muted">({disambigText(mt.id)})</span> : null;
                  const inText = mt.text ? linkNames(capFirst(mt.text), [candidateFor(mt.id)], dis ? () => dis : undefined) : null;
                  const linked = Array.isArray(inText);
                  return (
                    <li class="fact" key={i}>
                      {linked ? L2(inText as ComponentChildren[], cands) : <>
                        <PN id={mt.id} />
                        {mt.text ? <> — {L(mt.text)}</> : null}
                      </>}
                      <Refs refs={mt.refs} owner={ns + `m14.${i}`} />
                      <VerseInsert owner={ns + `m14.${i}`} refs={mt.refs} />
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {[true, false].map((sure) => {
            const gs = groups.filter((g) => g.sure === sure);
            if (!gs.length) return null;
            return (
              <Fragment key={String(sure)}>
                <p class="sub fact">
                  {sure ? 'По расчёту жили в одно время' : 'Вероятно, жили в одно время'}
                  <MarkNote label="расч." full="по годам, рассчитанным хронологическим движком" />
                </p>
                {gs.map((g) => (
                  <p key={g.label}>
                    <span class="muted">{g.label}: </span>
                    <InlineList ids={g.ids} item={(x, after) => <PN id={x} lower after={after} />} />
                  </p>
                ))}
              </Fragment>
            );
          })}
        </>
      ),
    );
  }
  if (card) {
    // 15 — места по роли: «Родился: Вифлеем (см. § 8). Жил: …; Бывал: …; События: …» (F7; CARD-30)
    const people = p.kind === 'people' || p.kind === 'clan';
    const byRole = new Map<Place['role'], { name: string; note?: string; refs: string[] }[]>();
    const add = (role: Place['role'], x: { name: string; note?: string; refs: string[] }) => byRole.set(role, [...(byRole.get(role) ?? []), x]);
    for (const pl of card.places ?? []) add(pl.role, pl);
    const roleRow = (role: Place['role'], see?: number) => {
      const xs = byRole.get(role) ?? [];
      const extra = role === 'birth' ? card.birth?.place : role === 'death' ? card.death?.place : undefined;
      const listed = extra && !xs.some((x) => x.name === extra) ? [{ name: extra, refs: [] as string[] }, ...xs] : xs;
      if (!listed.length) return null;
      return (
        <li class="fact" key={role}>
          <span class="muted">{placeRoleLabel(role, p.sex, people)}: </span>
          <PlaceList places={listed} owner={ns + `p15.${role}`} link={L} />
          {see ? (
            <>
              {' '}
              <span class="nobr">
                (<SeeSec n={see} />)
              </span>
            </>
          ) : null}
        </li>
      );
    };
    put(
      15,
      has(card.places, card.birth?.place, card.death?.place) && (
        <ul>
          {roleRow('birth', card.birth?.place ? 8 : undefined)}
          {roleRow('residence')}
          {roleRow('travel')}
          {roleRow('other')}
          {roleRow('death', card.death?.place ? 20 : undefined)}
          {roleRow('burial')}
        </ul>
      ),
    );
    // 16 — царствование: «Царь Иудеи, в Хевроне: воцарился в 30 лет; по тексту — семь лет и шесть месяцев (2 Цар 5:4–5); 1010–1003 гг. до Р. Х. — расч.»
    const reigns: (Omit<Reign, 'years' | 'refs'> & { years?: number | null; refs: string[] })[] =
      chrono?.reign ?? p.reign.map((r) => ({ ...r, refs: [] as string[] }));
    // должность «Царь над домом Иудиным в Хевроне» повторяет царствование со стихом той же главы: её стихи — к царствованию
    const offices = card.offices ?? [];
    const mergedInto = new Map<number, number>();
    offices.forEach((o, i) => {
      if (!/^Цар/.test(o.title)) return;
      const r = reigns.findIndex((x) => x.refs.some((q) => o.refs.some((w) => chapterOf(q) === chapterOf(w))) && (o.from === undefined || o.from === x.start));
      if (r >= 0) mergedInto.set(i, r);
    });
    const astro = (y: number) => (y <= 0 ? y + 1 : y); // в данных годы исторические, форматёр ждёт астрономические
    put(
      16,
      has(offices, reigns) && (
        <ul>
          {reigns.map((r, i) => {
            const title = reignTitle(r.over, p.sex) ?? `${bySex(p.sex, 'Царь', 'Царица')}; царство — ${r.over}`;
            // число лет по тексту; пояснение «по тексту — …» точнее круглого числа и заменяет его
            const noteIsText = !!r.note && /^по тексту/.test(r.note);
            const parts = [
              r.ageAtStart !== undefined ? `${bySex(p.sex, 'воцарился', 'воцарилась')} в ${yearsWord(r.ageAtStart)}` : null,
              noteIsText ? r.note : r.years ? `${yearsWord(r.years)} по тексту` : null,
            ].filter(Boolean);
            const refs = [...r.refs];
            for (const [oi, ri] of mergedInto) if (ri === i) for (const x of offices[oi].refs) if (!refs.some((q) => refKey(q) === refKey(x))) refs.push(x);
            // формат годов уже с U+2060 после «–»: диапазон не разрывается в конце строки
            const span = r.start === r.end ? formatYear(astro(r.start)) : formatSpan(astro(r.start), astro(r.end), false);
            return (
              <li class="fact" key={`r${i}`}>
                {title}: {parts.length ? parts.join('; ') : span}
                {/* «;» после стихов держится за последнюю ссылку, иначе перенос ставит его в начало строки */}
                <Refs refs={refs} owner={ns + `r16.${i}`} tail={parts.length ? ';' : undefined} />
                {parts.length ? ` ${span}` : ''}
                <MarkNote label="расч." full={MARK_FULL.reign} />
                {r.note && !noteIsText ? <div class="note">{capFirst(r.note)}</div> : null}
                <VerseInsert owner={ns + `r16.${i}`} refs={refs} />
              </li>
            );
          })}
          {offices.map((o, i) =>
            mergedInto.has(i) ? null : (
              <li class="fact" key={i}>
                {L(o.note ? `${o.title};` : o.title)}
                {o.note ? <span class="muted"> {L(o.note)}</span> : null}
                <Refs refs={o.refs} owner={ns + `o16.${i}`} />
                <VerseInsert owner={ns + `o16.${i}`} refs={o.refs} />
              </li>
            ),
          )}
        </ul>
      ),
    );
    // 17 — жизнеописание; длинное — с подзаголовками по книгам, в которых оно рассказано (F5; CARD-21)
    {
      const ev = card.events ?? [];
      const bookOf = (e: (typeof ev)[number]) => (e.refs[0] ? refKey(e.refs[0]).replace(/\d+(:.*)?$/, '') : '');
      const runs: { book: string; from: number; to: number; chapters: number[] }[] = [];
      ev.forEach((e, i) => {
        const b = bookOf(e);
        const ch = Number(/(\d+)(?::|$)/.exec(refKey(e.refs[0] ?? ''))?.[1] ?? NaN);
        const last = runs[runs.length - 1];
        if (last && last.book === b) {
          last.to = i;
          if (Number.isFinite(ch)) last.chapters.push(ch);
        } else runs.push({ book: b, from: i, to: i, chapters: Number.isFinite(ch) ? [ch] : [] });
      });
      // подзаголовки — если рассказ идёт по книгам крупными частями (2–6 частей, в каждой не меньше двух событий)
      const heads = ev.length > 8 && runs.length >= 2 && runs.length <= 6 && runs.every((r) => r.book && r.to > r.from);
      const head = (r: (typeof runs)[number]) => {
        const lo = Math.min(...r.chapters);
        const hi = Math.max(...r.chapters);
        return `${r.book.replace(/^(\d)/, '$1 ')} ${lo === hi ? lo : `${lo}–${hi}`}`;
      };
      put(
        17,
        ev.length ? (
          <ul>
            {ev.map((e, i) => {
              const run = heads ? runs.find((r) => r.from === i) : undefined;
              return (
                <Fragment key={i}>
                  {run ? <li class="sub">{head(run)}</li> : null}
                  <li class="fact">
                    {e.age !== undefined ? <span class="muted">{yearsWord(e.age)}. </span> : e.year !== undefined ? <span class="muted">{withPeriodYear(e.year)} </span> : null}
                    {L(e.text)}
                    <Refs refs={e.refs} owner={ns + `e17.${i}`} />
                    <Mark cert={e.cert} />
                    <VerseInsert owner={ns + `e17.${i}`} refs={e.refs} />
                  </li>
                </Fragment>
              );
            })}
          </ul>
        ) : null,
      );
    }
    put(
      18,
      card.sayings?.length ? (
        <ul>
          {card.sayings.map((s, i) => (
            <li class="fact quote" key={i}>
              «{s.quote}»
              <Refs refs={[s.ref]} owner={ns + `q18.${i}`} />
              {s.context ? <div class="muted">{L(s.context)}</div> : null}
              <VerseInsert owner={ns + `q18.${i}`} refs={[s.ref]} />
            </li>
          ))}
        </ul>
      ) : null,
    );
    put(19, facts(card.withGod, 'g19'));
  }
  // 20 — смерть; возраст не повторяется, если запись составителя его уже называет («Прожил около 70 лет…»)
  {
    const bits: ComponentChildren[] = [];
    if (c?.d !== null && c?.d !== undefined && c.cls !== 'epochal') {
      const y = shownYears(c);
      const age = Math.round(c.d - c.b);
      const said = (card?.death?.facts ?? []).some((f) => new RegExp(`(^|\\D)${age}\\s+(лет|год)`).test(f.text));
      const line = said && y && y.d !== null ? formatYear(y.d, { approx: y.approx }) : deathLine(c.b, c.d, c.cls);
      bits.push(<p class="fact" key="y">{line}<YearMark cls={c.cls} /></p>);
    }
    if (card?.death?.place) bits.push(<p key="pl">Место: {card.death.place}</p>);
    put(20, has(bits, card?.death?.facts, card?.death?.burial) && (<>{bits}{facts(card?.death?.facts, 'd20')}{card?.death?.burial?.length ? <><p class="sub">Погребение</p>{facts(card.death.burial, 'u20')}</> : null}</>));
  }
  // 21 — линии Мессии
  const j = lineMembership.joseph.get(id);
  const mm = lineMembership.mary.get(id);
  {
    put(
      21,
      has(j, mm, card?.messiahNote) && (
        <>
          {j && (
            <p>
              <span class="swatch gold" />
              Линия Иосифа{j.mt ? `: ${j.mt}-е имя у Матфея, ${['', 'первая', 'вторая', 'третья'][j.mtGroup ?? 0]} четырнадцатица (Мф 1:17)` : ''}
              {j.flag === 'omitted-by-mt' ? ' — у Матфея опущен (Мф 1:8), в цепи по 4 Цар и 1 Пар 3' : ''}
              {j.flag === 'before-matthew' ? ' — участок до Авраама по Быт 5; 11 (Матфей начинает с Авраама)' : ''}
              {j.flag === 'legal' ? ' — законный сын Иосифа' : ''}
            </p>
          )}
          {mm && (
            <p>
              <span class="swatch azure" />
              Линия по Луке{mm.lk ? `: ${mm.lk}-е имя у Луки` : ''}
              {mm.flag === 'luke-only' ? ' — только у Луки (Лк 3:36)' : ''}
              {mm.flag === 'interpretation' ? ' — по толкованию Лк 3:23 как родословия Марии' : ''}
            </p>
          )}
          {facts(card?.messiahNote, 'n21')}
        </>
      ),
    );
  }
  // 22 — упоминания в других книгах; запись на тех же стихах, что § 21, — повтор (у Руфи «В родословии… Мф 1:5»)
  if (card) {
    const used = new Set([...(card.messiahNote ?? []).flatMap((f) => f.refs), ...(j?.refs ?? []), ...(mm?.refs ?? [])].map(refKey));
    const later = (card.laterMentions ?? []).filter((f) => !(f.refs.length && f.refs.every((r) => used.has(refKey(r)))));
    put(22, facts(later, 'l22'));
  }
  put(23, Object.keys(p.books).length || card?.scripture?.first || card?.scripture?.key?.length ? CanonStrip({ books: p.books, first: card?.scripture?.first, keyRefs: card?.scripture?.key }) : null);
  if (card)
    put(
      24,
      card.notes?.length ? (
        <ul>
          {card.notes.map((n, i) => (
            <li class="fact" key={i}>
              <span class="muted">{NOTE_KIND[n.kind]}. </span>
              {L(n.text)}
              <Refs refs={n.refs} owner={ns + `n24.${i}`} />
              <VerseInsert owner={ns + `n24.${i}`} refs={n.refs} />
            </li>
          ))}
        </ul>
      ) : null,
    );

  return out;
}

/**
 * Текст факта: имена лиц — ссылки (F12), перекрёстная ссылка «см. § 24» — команда перехода к разделу (CARD-31).
 * Знак сразу за командой держится за неё (.nobr).
 */
function linkText(t: string, cands: LinkCand[]): ComponentChildren {
  if (!/см\.\s*§\s*\d/.test(t)) return linkNames(t, cands);
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const m of t.matchAll(/см\.\s*§\s*(\d+)([),.;:]*)/g)) {
    if (m.index! > at) out.push(linkNames(t.slice(at, m.index), cands));
    out.push(
      <span class="nobr" key={m.index}>
        <SeeSec n={Number(m[1])} />
        {m[2]}
      </span>,
    );
    at = m.index! + m[0].length;
  }
  if (at < t.length) out.push(linkNames(t.slice(at), cands));
  return out;
}

/** Остальные имена в тексте встречи — тоже ссылки: к уже связанному имени лица встречи добавить ссылки окружения. */
function L2(parts: ComponentChildren[], cands: LinkCand[]): ComponentChildren {
  return parts.map((x) => (typeof x === 'string' ? linkNames(x, cands) : x));
}

/** «ок. 6 г. до Р. Х.» на поле строки события; год оканчивается точкой сокращения — вторую не ставить (CARD-26). */
function withPeriodYear(y: number): string {
  const s = formatYear(y <= 0 ? y + 1 : y, { approx: true });
  return /[.…]$/.test(s) ? s : `${s}.`;
}

const NOTE_KIND: Record<string, string> = { textual: 'Текст', interpretation: 'Толкование', identification: 'Отождествление', chronology: 'Хронология', bracket: 'Скобки Синодального текста' };
