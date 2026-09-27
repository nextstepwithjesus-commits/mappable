import { useEffect, useRef, useState } from 'preact/hooks';
import { Fragment, type ComponentChildren, type VNode } from 'preact';
import { byId, graph, loadCard, lineMembership, persons } from '../data/atlas.ts';
import type { Card, Chrono, Fact, Cert, Role, Reign } from '../data/types.ts';
import { selected, second, pickMode, panel, model, showSchema } from '../state.ts';
import { P, Refs, VerseInsert, Mark, roleText, skyRef, plural, CAN_PRINT } from './common.tsx';
import { siblings, type ParentEdge } from '../engine/graph.ts';
import { formatSpan, formatYear, yearsWord } from '../engine/years.ts';
import { contemporaries, type ChronoResult, type PersonChrono } from '../engine/chronology.ts';
import type { ModelData, ChronoRow } from '../data/atlas.ts';
import { deathLine, affiliation } from './card/shared.tsx';
import {
  bySex, capFirst, lowerFirst, nameCase, splitKinTerm, kinTermIns, kinTermReverse, ownSpouseDat, otherParentLabel, otherChildLabel,
  altKindLabel, reignTitle, MESSIAH_BIRTH,
} from './text/ru.ts';
import { Masthead } from './card/Masthead.tsx';
import { Events } from './card/Events.tsx';
import { CanonStrip } from './card/Canon.tsx';
import { BirthLine, RelativeChrono, YearMark } from './card/Chrono.tsx';

export { Masthead };

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

type State = 'content' | 'silent' | 'absent';


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
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === 'object' && (v as VNode).type === Fragment) return isEmpty((v as VNode<{ children?: unknown }>).props.children);
  return false;
}

/** Число лиц с каждым именем: одноимённых различает уточнение. */
const nameCount = (() => {
  const m = new Map<string, number>();
  for (const q of persons) m.set(q.name, (m.get(q.name) ?? 0) + 1);
  return m;
})();

/** Ссылка на лицо в строке после двоеточия или в перечне: безымянное («Дочь фараонова») — со строчной. */
function PT({ id }: { id: string }) {
  const q = byId.get(id);
  return <P id={id}>{q ? (q.unnamed ? lowerFirst(q.name) : q.name) : id}</P>;
}

/** Ссылка на лицо с уточнением, если в атласе есть одноимённые: «Мария (Клеопова)». */
function PN({ id, lower = false }: { id: string; lower?: boolean }) {
  const q = byId.get(id);
  const dup = q && q.disambig && (nameCount.get(q.name) ?? 0) > 1;
  return (
    <>
      {lower ? <PT id={id} /> : <P id={id} />}
      {dup ? <span class="muted"> ({q!.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')})</span> : null}
    </>
  );
}

/** Ссылка на лицо в косвенном падеже; null — если имя не склоняется надёжно (строку тогда строят иначе). */
function caseLink(id: string, cs: 'gen' | 'dat' | 'ins'): ComponentChildren | null {
  const q = byId.get(id);
  const f = q ? nameCase(q.name, q.sex, cs, q.unnamed) : null;
  return f ? <P id={id}>{f}</P> : null;
}

/** Лица, названные в семейных разделах карточки (§ 6, 9–12): их не повторяют «Современники». */
export function familyIds(id: string): Set<string> {
  const out = new Set<string>();
  for (const e of graph.parentsOf.get(id) ?? []) out.add(e.parent);
  for (const s of graph.spousesOf.get(id) ?? []) out.add(s.a === id ? s.b : s.a);
  const kidsOf = (x: string) => (graph.childrenOf.get(x) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
  for (const e of graph.childrenOf.get(id) ?? []) out.add(e.child);
  const grand = [...new Set(kidsOf(id).flatMap(kidsOf))];
  for (const g of grand) {
    out.add(g);
    for (const gg of kidsOf(g)) out.add(gg);
  }
  for (const s of siblings(graph, id)) out.add(s.id);
  for (const k of graph.kinOf.get(id) ?? []) out.add(k.from === id ? k.to : k.from);
  out.delete(id);
  return out;
}

/**
 * Родня в пределах четырёх шагов по связям «родитель — ребёнок»: деды, дяди, двоюродные, внучатые.
 * Брак — только первым шагом (родня супруга: тесть, шурин) или последним (супруги родни: невестка, зять);
 * поэтому другие жёны мужа и родня свойственников в родню не попадают.
 */
function nearKin(id: string, depth = 4): Set<string> {
  const direct = (e: ParentEdge) => e.kind === 'father' || e.kind === 'mother';
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

/** Перечень лиц через запятую, не больше max, затем «и ещё N». */
function list(ids: string[], max = 16, item: (id: string) => ComponentChildren = (x) => <PT id={x} />) {
  return (
    <>
      {ids.slice(0, max).map((k, i) => (
        <span key={k}>
          {i ? ', ' : ''}
          {item(k)}
        </span>
      ))}
      {ids.length > max ? <span class="muted"> и ещё {ids.length - max}</span> : null}
    </>
  );
}

export function Folio() {
  const id = selected.value;
  const [data, setData] = useState<{ id: string; card: Card; chrono: Chrono | null } | null>(null);
  const [current, setCurrent] = useState(1);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setData(null);
    loadCard(id).then((d) => alive && setData({ id, card: d?.card ?? {}, chrono: d?.chrono ?? null }));
    inner.current?.parentElement?.scrollTo({ top: 0 });
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    const el = inner.current?.parentElement;
    if (!el) return;
    const onScroll = () => {
      const secs = [...el.querySelectorAll<HTMLElement>('.sec[data-n]')];
      let cur = 1;
      for (const s of secs) if (s.offsetTop - el.scrollTop < 80) cur = Number(s.dataset.n);
      setCurrent(cur);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });

  if (!id) return <aside class="folio" hidden />;
  const p = byId.get(id);
  if (!p) return <aside class="folio" hidden />;
  const card = data && data.id === id ? data.card : null;
  const m = model.value;
  const c = m.chrono.get(id);

  const out = buildSections(id, p, card, m, c, '', data && data.id === id ? data.chrono : null);
  const silent = new Set(p.silent);

  const stateOf = (n: number): State => (out.has(n) ? 'content' : silent.has(n) ? 'silent' : 'absent');
  const loading = !card;

  // ---------- вывод ----------
  const blocks: ComponentChildren[] = [];
  let lastPart = 0;
  let run: number[] = [];
  const flushRun = () => {
    if (!run.length) return;
    const st = stateOf(run[0]);
    const label = run.length === 1 ? `${run[0]}` : `${run[0]}–${run[run.length - 1]}`;
    blocks.push(
      <div class={`sec ${st}`} key={`run${run[0]}`} data-n={run[0]} id={`sec-${run[0]}`}>
        <span class="no">{label}</span>
        {run.map((n) => SECTIONS[n - 1].title).join(', ')} — {st === 'silent' ? 'в Писании не сообщается' : 'раздел не составлен'}
      </div>,
    );
    run = [];
  };
  for (const s of SECTIONS) {
    const st = stateOf(s.n);
    if (st !== 'content' && !showSchema.value) continue;
    if (s.part !== lastPart) {
      flushRun();
      const partHas = SECTIONS.filter((x) => x.part === s.part).some((x) => stateOf(x.n) === 'content') || showSchema.value;
      if (partHas) blocks.push(<div class="part" key={`p${s.part}`}>{PARTS[s.part]}</div>);
      lastPart = s.part;
    }
    if (st !== 'content') {
      if (run.length && stateOf(run[0]) !== st) flushRun();
      run.push(s.n);
      continue;
    }
    flushRun();
    const body = out.get(s.n);
    const long = [10, 17, 23, 24, 13, 14].includes(s.n);
    blocks.push(
      <section class={`sec ${long ? 'long' : ''}`} key={s.n} data-n={s.n} id={`sec-${s.n}`} aria-labelledby={`h-${s.n}`}>
        <span class="no" aria-hidden="true">
          {s.n}
        </span>
        <h3 id={`h-${s.n}`}>{s.title}</h3>
        {long ? body : <div class="runin">{body}</div>}
      </section>,
    );
  }
  flushRun();

  const filledCount = SECTIONS.filter((s) => stateOf(s.n) === 'content').length;
  const silentCount = SECTIONS.filter((s) => stateOf(s.n) === 'silent').length;

  return (
    <aside class="folio" aria-label={`Карточка: ${p.name}`}>
      <div class="grab" aria-hidden="true" onClick={(e) => {
        const f = (e.currentTarget as HTMLElement).parentElement!;
        const cur = f.style.getPropertyValue('--sheet-h');
        f.style.setProperty('--sheet-h', cur === '104px' ? '55vh' : cur === '100vh' ? '104px' : '100vh');
      }}>
        <span />
      </div>
      <div class="folio-inner" ref={inner}>
        <nav class="rail" aria-label="Разделы карточки">
          {SECTIONS.map((s, i) => (
            <>
              {i > 0 && SECTIONS[i - 1].part !== s.part ? <span class="gap" key={`g${s.n}`} /> : null}
              <button
                key={s.n}
                class={`${stateOf(s.n)} ${current === s.n ? 'current' : ''}`}
                title={`${s.n}. ${s.title}: ${stateOf(s.n) === 'content' ? 'есть сведения' : stateOf(s.n) === 'silent' ? 'в Писании не сообщается' : 'не составлен'}`}
                aria-label={`${s.n}. ${s.title}`}
                onClick={() => {
                  if (stateOf(s.n) !== 'content') showSchema.value = true;
                  requestAnimationFrame(() => document.getElementById(`sec-${s.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                }}
              />
            </>
          ))}
        </nav>
        <Masthead id={id} />
        <div class="actions">
          <button onClick={() => skyRef.flyTo(id)}>Показать на небе</button>
          <button aria-pressed={pickMode.value === 'kinship'} onClick={() => { pickMode.value = pickMode.value === 'kinship' ? null : 'kinship'; second.value = null; }}>
            {pickMode.value === 'kinship' ? 'Выберите второе лицо…' : 'Родство с…'}
          </button>
          <button aria-pressed={pickMode.value === 'spread'} onClick={() => { pickMode.value = pickMode.value === 'spread' ? null : 'spread'; second.value = null; }}>
            {pickMode.value === 'spread' ? 'Выберите второе лицо…' : 'Разворот с…'}
          </button>
          <button aria-pressed={showSchema.value} onClick={() => (showSchema.value = !showSchema.value)}>
            Вся схема разделов
          </button>
          {CAN_PRINT && <button onClick={() => window.print()}>Печать</button>}
          <button onClick={() => { selected.value = null; panel.value = null; }}>Закрыть</button>
        </div>
        <div class="mast"><div class="rule" /></div>
        {loading ? <p class="muted">Загрузка карточки…</p> : blocks}
        <p class="colophon">
          Составлено разделов: {filledCount} из 24{silentCount ? `; о ${silentCount} ${plural(silentCount, 'разделе', 'разделах', 'разделах')} Писание не сообщает` : ''}. Все ссылки сверены с Синодальным
          текстом. Даты — по модели «{modelNames[model.value.id] ?? ''}».
        </p>
      </div>
    </aside>
  );
}


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
    if (!isEmpty(v)) out.set(n, v as ComponentChildren);
  };
  const facts = (fs: Fact[] | undefined, owner: string) =>
    fs && fs.length ? (
      <ul>
        {fs.map((f, i) => (
          <li class="fact" key={i}>
            {f.text}
            <Refs refs={f.refs} owner={ns + `${owner}.${i}`} />
            <Mark cert={f.cert} />
            <VerseInsert owner={ns + `${owner}.${i}`} refs={f.refs} />
          </li>
        ))}
      </ul>
    ) : null;

  // 1
  put(
    1,
    <p>
      {p.name}
      {p.disambig ? <span class="muted">, {p.disambig}</span> : null}
      {p.unnamed ? <span class="muted"> — в Писании имя не названо</span> : null}
      {p.kind === 'people' && <span class="muted"> — в тексте это имя народа или рода</span>}
      {p.kind === 'founder' && (
        <span class="muted">
          {' — '}
          {bySex(p.sex, 'назван «отцом» города, то есть родоначальником', 'названа «матерью» города, то есть родоначальницей')} его жителей
        </span>
      )}
    </p>,
  );
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
          <abbr class="mark" title="справочный слой: не текст Синодального перевода">справ.</abbr>
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
          {!mn.refs?.length ? <abbr class="mark" title="этимология — справочный слой">справ.</abbr> : <Mark cert={mn.cert} />}
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
              <li key={i}>
                {a.name} <span class="muted">— {noteLeads ? a.note : label}</span>
                {a.note && !noteLeads ? <span class="muted">. {capFirst(a.note)}</span> : null}
                <Refs refs={a.refs} owner={ns + `a4.${i}`} />
                <VerseInsert owner={ns + `a4.${i}`} refs={a.refs} />
              </li>
            );
          })}
        </ul>
      ) : null,
    );
  }
  put(
    5,
    has(p.roles, card?.status) && (
      <>
        {p.roles.length ? <p>{capFirst(roleText(p.roles, p.sex))}</p> : null}
        {facts(card?.status, 's5')}
      </>
    ),
  );
  // 6 — родители
  {
    const rows: ComponentChildren[] = [];
    const pc: Cert = p.parentCert;
    if (p.father) rows.push(<li class="fact" key="f">{p.fatherKind === 'legal' ? 'Законный отец' : 'Отец'}: <PT id={p.father} /><Refs refs={p.parentRefs} owner={ns + 'p6f'} /><Mark cert={pc} /><VerseInsert owner={ns + 'p6f'} refs={p.parentRefs} />{p.fatherGap && <span class="muted"> — родословие здесь может пропускать поколения</span>}</li>);
    if (p.mother) rows.push(<li class="fact" key="m">Мать: <PT id={p.mother} /><Refs refs={p.parentRefs} owner={ns + 'p6m'} /><Mark cert={p.motherCert} /><VerseInsert owner={ns + 'p6m'} refs={p.parentRefs} /></li>);
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
    put(6, has(rows, card?.parentsNote) && (<>{rows.length ? <ul>{rows}</ul> : null}{facts(card?.parentsNote, 'n6')}</>));
  }
  {
    const aff = affiliation(id)?.text;
    put(7, has(card?.lineage, aff) && (<>{aff ? <p>{aff}</p> : null}{facts(card?.lineage, 'l7')}</>));
  }
  // 8 — рождение
  if (c) {
    put(
      8,
      <>
        <BirthLine p={p} c={c} m={m} />
        {card?.birth?.place ? <p>Место: {card.birth.place}</p> : null}
        {facts(card?.birth?.facts, 'b8')}
      </>,
    );
  }
  // 9 — супруги
  {
    const sp = (graph.spousesOf.get(id) ?? []).map((s) => ({ other: s.a === id ? s.b : s.a, s }));
    // подпись — кем второе лицо приходится владельцу карточки: у мужчины «Мааха — наложница», у женщины «Халев — муж»
    const spouseLabel = (s: (typeof sp)[number]['s']) =>
      p.sex === 'm' ? (s.kind === 'concubine' ? 'наложница' : 'жена') : s.kind === 'concubine' ? 'муж; она названа его наложницей' : 'муж';
    put(
      9,
      has(sp, card?.spousesNote) && (
        <>
          {sp.length ? (
            <ul>
              {sp.map(({ other, s }, i) => (
                <li class="fact" key={other}>
                  <P id={other} />
                  <span class="muted"> — {spouseLabel(s)}</span>
                  <Refs refs={s.refs} owner={ns + `s9.${i}`} />
                  <Mark cert={s.cert} />
                  {s.note ? <div class="note">{s.note}</div> : null}
                  <VerseInsert owner={ns + `s9.${i}`} refs={s.refs} />
                </li>
              ))}
            </ul>
          ) : null}
          {facts(card?.spousesNote, 'n9')}
        </>
      ),
    );
  }
  // 10 — дети по матерям
  {
    const kids = (graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother');
    const order = (a: string, b: string) => (byId.get(a)!.order ?? 99) - (byId.get(b)!.order ?? 99);
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
            {bySex(k.sex, 'Законный сын', 'Законная дочь')}: <P id={kid} />
            {k.mother ? (mother ? <>, {bySex(k.sex, 'рождённый', 'рождённая')} {mother}</> : <>; мать — <PT id={k.mother} /></>) : null}
            <Refs refs={refs} owner={ns + `c10l${i}`} />
            <VerseInsert owner={ns + `c10l${i}`} refs={refs} />
          </li>
        );
      }
      // у матери: «Сын: Иисус Христос — зачат от Духа Святаго (Мф 1:18, 20; Лк 1:35)»
      const refs = messiah ? MESSIAH_BIRTH.mother.refs : k.parentRefs;
      return (
        <li class="fact" key={`l${kid}`}>
          {bySex(k.sex, 'Сын', 'Дочь')}: <P id={kid} />
          {messiah ? <> — {MESSIAH_BIRTH.mother.text}</> : <>; законный отец — <PT id={k.father!} /></>}
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
    // внуки и правнуки — по прямым связям отец/мать (переход к Давиду из карточки Руфи — «правнук»)
    const kidIds = (x: string) => (graph.childrenOf.get(x) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
    const nextGen = (ids: string[]) => [...new Set(ids.flatMap(kidIds))];
    const grand = nextGen([...new Set(kids.map((e) => e.child))]);
    const great = nextGen(grand);
    const genRow = (label: string, ids: string[]) =>
      ids.length ? (
        <p key={label}>
          <span class="muted">{label}: </span>
          {list(ids)}
        </p>
      ) : null;
    // «от Лии:», если имя склоняется; иначе «мать — наложница Манассии:»
    const fromLabel = (other: string) => {
      const g = caseLink(other, 'gen');
      if (g) return <><span class="muted">от </span>{g}: </>;
      return <><span class="muted">{byId.get(other)?.sex === 'f' ? 'мать' : 'отец'} — </span><PT id={other} />: </>;
    };
    put(
      10,
      has(kids, byClaim.size > 0, card?.childrenNote) && (
        <>
          {legal.length ? <ul>{legal.map(legalRow)}</ul> : null}
          {[...byMother].map(([other, ids]) => (
            <p key={other}>
              {other ? fromLabel(other) : null}
              {list(ids.sort(order), 99)}
            </p>
          ))}
          {[...byClaim].map(([claim, es], i) => {
            const ids = es.map((e) => e.child);
            // стихи — при небольшой группе; у большой они в § 6 каждого потомка
            const refs = es.length <= 3 ? [...new Set(es.flatMap((e) => e.refs))] : [];
            return (
              <p class="fact" key={`c${claim}`}>
                <span class="muted">{otherChildLabel(claim, ids.map((x) => byId.get(x)!.sex))}: </span>
                {list(ids, 16, (x) => <PN id={x} lower />)}
                <Refs refs={refs} owner={ns + `c10o${i}`} />
                <Mark cert={es.every((e) => e.cert === es[0].cert) ? es[0].cert : undefined} />
                <VerseInsert owner={ns + `c10o${i}`} refs={refs} />
              </p>
            );
          })}
          {genRow(grand.length > 1 ? 'Внуки' : byId.get(grand[0] ?? '')?.sex === 'f' ? 'Внучка' : 'Внук', grand)}
          {genRow(great.length > 1 ? 'Правнуки' : byId.get(great[0] ?? '')?.sex === 'f' ? 'Правнучка' : 'Правнук', great)}
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
    put(
      11,
      has(sib, kinSib, card?.siblingsNote) && (
        <>
          {kinSib.length ? (
            <ul>
              {kinSib.map(({ other, k }, i) => (
                <li class="fact" key={other}>
                  <P id={other} />
                  {/* термин записан у того, кого он описывает: «Саруия — сестра Давида»; обратное — по полу */}
                  <span class="muted"> — {k.from === other ? k.rel : byId.get(other)!.sex === 'f' ? 'сестра' : 'брат'}</span>
                  <Refs refs={k.refs} owner={ns + `ks11.${i}`} />
                  <Mark cert={k.cert} />
                  <VerseInsert owner={ns + `ks11.${i}`} refs={k.refs} />
                </li>
              ))}
            </ul>
          ) : null}
          {sib.length ? (
            <p>
              {sib.map((s, i) => (
                <span key={s.id}>
                  {i ? ', ' : ''}
                  <P id={s.id} />
                  {(s.kind === 'paternal' || s.kind === 'maternal') && <span class="muted"> ({s.kind === 'paternal' ? 'единокровн.' : 'единоутробн.'})</span>}
                </span>
              ))}
            </p>
          ) : null}
          {facts(card?.siblingsNote, 'n11')}
        </>
      ),
    );
  }
  // 12 — иное родство
  {
    const kin = (graph.kinOf.get(id) ?? []).filter((k) => !SIBLING_KIN.test(k.rel)); // братья и сёстры — в § 11
    const spouses = new Set((graph.spousesOf.get(id) ?? []).map((s) => (s.a === id ? s.b : s.a)));
    /**
     * Термин записан у того, кого он описывает (`kin` у Иохаведы: Амрам, «тётка» — она тётка Амрама).
     * Термин второго лица о владельце: «Иохаведа — тётка» (в карточке Амрама).
     * Термин владельца о втором лице: «Приходится тёткой Амраму, своему мужу» — термин Писания сохраняется (П-8).
     */
    const kinLine = (k: (typeof kin)[number]) => {
      if (k.from !== id) {
        return (
          <>
            <P id={k.from} /> — {k.rel}
          </>
        );
      }
      const o = byId.get(k.to)!;
      const { term, tail } = splitKinTerm(k.rel);
      const ins = kinTermIns(term);
      const dat = caseLink(k.to, 'dat');
      if (ins && dat) {
        return (
          <>
            Приходится {ins} {dat}
            {spouses.has(k.to) ? `, ${ownSpouseDat(o.sex)}` : ''}
            {tail ? ` ${tail}` : ''}
          </>
        );
      }
      // склонение ненадёжно — имя второго лица в начале строки, термин от его лица, если он есть в словаре
      const rev = kinTermReverse(term, o.sex);
      return rev ? (
        <>
          <P id={k.to} /> — {rev}
          {tail ? ` ${tail}` : ''}
        </>
      ) : (
        <>
          <P id={k.to} /> — связь по Писанию: «{k.rel}»
        </>
      );
    };
    put(
      12,
      has(kin, card?.kinNote) && (
        <>
          {kin.length ? (
            <ul>
              {kin.map((k, i) => (
                <li class="fact" key={i}>
                  {kinLine(k)}
                  <Refs refs={k.refs} owner={ns + `k12.${i}`} />
                  <Mark cert={k.cert} />
                  <VerseInsert owner={ns + `k12.${i}`} refs={k.refs} />
                </li>
              ))}
            </ul>
          ) : null}
          {facts(card?.kinNote, 'n12')}
        </>
      ),
    );
  }
  // 13 — эпоха и относительная хронология
  if (c) put(13, <RelativeChrono id={id} m={m} note={card?.chronoNote} />);
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
              <p class="muted">Встречи, о которых говорит Писание</p>
              <ul>
                {met.map((mt, i) => (
                  // имя — в именительном падеже в начале строки: «Самуил — помазан Самуилом; бежал к нему в Раму»
                  <li class="fact" key={i}>
                    <PN id={mt.id} />
                    {mt.text ? ` — ${mt.text}` : ''}
                    <Refs refs={mt.refs} owner={ns + `m14.${i}`} />
                    <VerseInsert owner={ns + `m14.${i}`} refs={mt.refs} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {[true, false].map((sure) => {
            const gs = groups.filter((g) => g.sure === sure);
            if (!gs.length) return null;
            return (
              <Fragment key={String(sure)}>
                <p class="muted fact">
                  {sure ? 'По расчёту жили в одно время' : 'Вероятно, жили в одно время'}
                  <abbr class="mark" title="по годам, рассчитанным хронологическим движком">расч.</abbr>
                </p>
                {gs.map((g) => (
                  <p key={g.label}>
                    <span class="muted">{g.label}: </span>
                    {list(g.ids, 16, (x) => <PN id={x} lower />)}
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
    put(
      15,
      has(card.places, card.birth?.place, card.death?.place) && (
        <ul>
          {card.birth?.place && <li>{card.birth.place} <span class="muted">— место рождения, см. 8</span></li>}
          {card.places?.map((pl, i) => (
            <li class="fact" key={i}>
              {pl.name} <span class="muted">— {PLACE_ROLE[pl.role]}</span>
              {pl.note ? <span class="muted">. {capFirst(pl.note)}</span> : null}
              <Refs refs={pl.refs} owner={ns + `p15.${i}`} />
              <VerseInsert owner={ns + `p15.${i}`} refs={pl.refs} />
            </li>
          ))}
          {card.death?.place && <li>{card.death.place} <span class="muted">— место смерти, см. 20</span></li>}
        </ul>
      ),
    );
    // 16 — царствование: «Царь Иудеи, в Хевроне: воцарился в 30 лет; по тексту — семь лет и шесть месяцев (2 Цар 5:4–5); 1010–1003 гг. до Р. Х. — расч.»
    const reigns: (Omit<Reign, 'years' | 'refs'> & { years?: number | null; refs: string[] })[] =
      chrono?.reign ?? p.reign.map((r) => ({ ...r, refs: [] as string[] }));
    const astro = (y: number) => (y <= 0 ? y + 1 : y); // в данных годы исторические, форматёр ждёт астрономические
    put(
      16,
      has(card.offices, reigns) && (
        <ul>
          {reigns.map((r, i) => {
            const title = reignTitle(r.over, p.sex) ?? `${bySex(p.sex, 'Царь', 'Царица')}; царство — ${r.over}`;
            // число лет по тексту; пояснение «по тексту — …» точнее круглого числа и заменяет его
            const noteIsText = !!r.note && /^по тексту/.test(r.note);
            const parts = [
              r.ageAtStart !== undefined ? `${bySex(p.sex, 'воцарился', 'воцарилась')} в ${yearsWord(r.ageAtStart)}` : null,
              noteIsText ? r.note : r.years ? `${yearsWord(r.years)} по тексту` : null,
            ].filter(Boolean);
            // U+2060 после тире: диапазон лет не разрывается в конце строки
            const span = r.start === r.end ? formatYear(astro(r.start)) : formatSpan(astro(r.start), astro(r.end), false).replace('–', '–\u2060');
            return (
              <li class="fact" key={`r${i}`}>
                {title}: {parts.length ? parts.join('; ') : span}
                <Refs refs={r.refs} owner={ns + `r16.${i}`} />
                {parts.length ? `; ${span}` : ''}
                <abbr class="mark" title="годы по реконструкции Тиле — Янга; числа текста — отдельно">расч.</abbr>
                {r.note && !noteIsText ? <div class="note">{capFirst(r.note)}</div> : null}
                <VerseInsert owner={ns + `r16.${i}`} refs={r.refs} />
              </li>
            );
          })}
          {card.offices?.map((o, i) => (
            <li class="fact" key={i}>
              {o.title}
              {o.note ? <span class="muted">; {o.note}</span> : null}
              <Refs refs={o.refs} owner={ns + `o16.${i}`} />
              <VerseInsert owner={ns + `o16.${i}`} refs={o.refs} />
            </li>
          ))}
        </ul>
      ),
    );
    put(17, card.events?.length ? <Events events={card.events} /> : null);
    put(
      18,
      card.sayings?.length ? (
        <ul>
          {card.sayings.map((s, i) => (
            <li class="fact quote" key={i}>
              «{s.quote}»
              <Refs refs={[s.ref]} owner={ns + `q18.${i}`} />
              {s.context ? <div class="muted">{s.context}</div> : null}
              <VerseInsert owner={ns + `q18.${i}`} refs={[s.ref]} />
            </li>
          ))}
        </ul>
      ) : null,
    );
    put(19, facts(card.withGod, 'g19'));
  }
  // 20 — смерть
  {
    const bits: ComponentChildren[] = [];
    if (c?.d !== null && c?.d !== undefined && c.cls !== 'epochal') bits.push(<p class="fact" key="y">{deathLine(c.b, c.d, c.cls)}<YearMark cls={c.cls} /></p>);
    if (card?.death?.place) bits.push(<p key="pl">Место: {card.death.place}</p>);
    put(20, has(bits, card?.death?.facts, card?.death?.burial) && (<>{bits}{facts(card?.death?.facts, 'd20')}{card?.death?.burial?.length ? <><p class="muted">Погребение:</p>{facts(card.death.burial, 'u20')}</> : null}</>));
  }
  // 21 — линии Мессии
  {
    const j = lineMembership.joseph.get(id);
    const mm = lineMembership.mary.get(id);
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
  if (card) put(22, facts(card.laterMentions, 'l22'));
  put(23, Object.keys(p.books).length || card?.scripture?.first || card?.scripture?.key?.length ? <CanonStrip books={p.books} first={card?.scripture?.first} keyRefs={card?.scripture?.key} /> : null);
  if (card)
    put(
      24,
      card.notes?.length ? (
        <ul>
          {card.notes.map((n, i) => (
            <li class="fact" key={i}>
              <span class="muted">{NOTE_KIND[n.kind]}. </span>
              {n.text}
              <Refs refs={n.refs} owner={ns + `n24.${i}`} />
              <VerseInsert owner={ns + `n24.${i}`} refs={n.refs} />
            </li>
          ))}
        </ul>
      ) : null,
    );

  return out;
}

const modelNames: Record<string, string> = {
  'mt-long': 'масоретские числа, 430 лет в Египте',
  'mt-short': 'краткое пребывание, 215 лет',
  lxx: 'числа в скобках Быт 5 и 11',
  terah70: 'Фарре 70 лет',
};

const PLACE_ROLE: Record<string, string> = { birth: 'рождение', residence: 'жительство', travel: 'путь', death: 'смерть', burial: 'погребение', other: 'связано с лицом' };
const NOTE_KIND: Record<string, string> = { textual: 'Текст', interpretation: 'Толкование', identification: 'Отождествление', chronology: 'Хронология', bracket: 'Скобки Синодального текста' };

