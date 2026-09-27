/** § 8 (год и эпоха рождения) и § 13 (эпоха, относительная хронология, напряжения). */
import type { ComponentChildren } from 'preact';
import { byId, graph, loadedCard } from '../../data/atlas.ts';
import type { Fact, Sex } from '../../data/types.ts';
import type { ParentEdge } from '../../engine/graph.ts';
import { normFor } from '../../engine/chronology.ts';
import { Refs, VerseInsert, Mark, MarkNote, MARK_FULL, refLabel } from '../common.tsx';
import { formatSpan, shownYears, yearsWord, ESTIMATE_STEP } from '../../engine/years.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { birthLine, birthEpoch, birthRange, kinDegree, nameIn, Namesake, PersonIn } from './shared.tsx';
import { isPeople } from './Masthead.tsx';
import { typoTree } from '../text/typo.ts';
type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

/** Помета года: «расч.» у всех лет, зависящих от хронологической модели. */
export function YearMark({ cls }: { cls: ChronoRow['cls'] }) {
  if (cls === 'epochal') return null;
  if (cls === 'exact') return <MarkNote label="расч." full={MARK_FULL.exact} />;
  return <Mark calc />;
}

/** § 8: год рождения (те же числа, что в паспорте) и эпоха рождения. */
export function BirthLine({ p, c, m }: { p: AtlasPerson; c: ChronoRow; m: ModelData }) {
  const ep = birthEpoch(p.id, c, m.epochs);
  return typoTree(
    <p class="fact">
      {birthLine(c, birthRange(p.id, c, m.chrono))}
      {ep ? `; эпоха — ${ep.name}` : ''}
      <YearMark cls={c.cls} />
    </p>,
  );
}

const verbBorn = (sex: Sex, people: boolean) => (people ? (sex === 'f' ? 'Названа в родословии' : 'Назван в родословии') : sex === 'f' ? 'Родилась' : 'Родился');

/** Разница лет между двумя лицами для формулы: у оценок — до 5 лет и со словом «примерно». */
function gap(a: ChronoRow, b: ChronoRow): { n: number; approx: boolean } | null {
  const ya = shownYears(a);
  const yb = shownYears(b);
  if (!ya || !yb) return null;
  const est = a.cls === 'estimated' || b.cls === 'estimated';
  const raw = Math.abs(ya.b - yb.b);
  const n = est ? Math.round(raw / ESTIMATE_STEP) * ESTIMATE_STEP : raw;
  return n > 0 ? { n, approx: a.cls !== 'exact' || b.cls !== 'exact' } : null;
}

/** Эпохи долгих жизней (Быт 5; 11): там и матери рождают детей позже 60 лет. */
const LONG_LIVES = new Set(['antediluvian', 'postdiluvian']);

/**
 * Правдоподобный промежуток между рождениями родителя и ребёнка — по нормам поколения эпохи родителя.
 * Больший промежуток — след сжатого родословия (Руф 4:18–22; Исх 6:16–20): решатель растягивает поколения,
 * и такое число в формуле читалось бы как утверждение («родила сына в 90 лет»). Его формула не называет.
 */
function plausible(parent: ChronoRow, kind: ParentEdge['kind'], years: number): boolean {
  const n = normFor(parent.epoch);
  const mother = kind === 'mother';
  const max = mother && !LONG_LIVES.has(parent.epoch ?? '') ? Math.min(n.max, 60) : n.max;
  const min = mother ? 14 : n.min; // те же нижние пределы, что у решателя
  return years >= min && years <= max;
}

/** Прямой родитель или ребёнок: кровная связь, записанная Писанием или выведенная (не толкование, не «по закону»). */
const plainLink = (e: ParentEdge) => (e.kind === 'father' || e.kind === 'mother') && e.cert !== 'interpretation' && e.claim !== 'legal';

/**
 * § 13. Формула относительной хронологии по ближайшим родственникам с названием родства:
 * «Родился примерно через 25 лет после отца, Зоровавеля, и примерно за 55 лет до сына, Елиакима; застал деда, …» — расч.
 * Оценка словом, а не знаком «~»: знак — не русская типографика и не читается программами экранного доступа.
 */
export function RelativeChrono({ id, m, note }: { id: string; m: ModelData; note?: Fact[] }) {
  const p = byId.get(id)!;
  const c = m.chrono.get(id)!;
  const ep = birthEpoch(id, c, m.epochs);
  const people = isPeople(id);
  const tensions = m.tensions.filter((t) => t.persons.includes(id));
  // пара, о которой уже говорит напряжение, в формулу не идёт: её числа противоречат друг другу
  const tense = (x: string) => tensions.some((t) => t.persons.includes(x));
  const usable = (x: string) => {
    const cc = m.chrono.get(x);
    return cc && cc.cls !== 'epochal' && !tense(x) && nameIn(x, 'gen') !== null ? cc : null;
  };

  // родитель: отец, затем мать
  const parentEdges = (graph.parentsOf.get(id) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'));
  let up: { id: string; g: { n: number; approx: boolean } | null } | null = null;
  for (const e of parentEdges) {
    const pc = usable(e.parent);
    if (!pc || pc.b >= c.b) continue;
    const g = people ? null : gap(c, pc);
    if (people || (g && plausible(pc, e.kind, g.n))) {
      up = { id: e.parent, g };
      break;
    }
  }
  // ребёнок: сначала с годом по числам текста (он надёжнее как опора), затем первенец по порядку, затем старший по расчёту
  const datedRank = (x: string) => (['exact', 'calculated'].includes(m.chrono.get(x)?.cls ?? '') ? 0 : 1);
  const kidEdges = [...(graph.childrenOf.get(id) ?? [])]
    .filter(plainLink)
    .sort(
      (a, b) =>
        datedRank(a.child) - datedRank(b.child) ||
        (byId.get(a.child)!.order ?? 99) - (byId.get(b.child)!.order ?? 99) ||
        (m.chrono.get(a.child)?.b ?? 0) - (m.chrono.get(b.child)?.b ?? 0),
    );
  let down: { id: string; g: { n: number; approx: boolean } | null } | null = null;
  for (const e of kidEdges) {
    const kc = usable(e.child);
    if (!kc || kc.b <= c.b) continue;
    const g = people ? null : gap(kc, c);
    if (people || (g && plausible(c, e.kind, g.n))) {
      down = { id: e.child, g };
      break;
    }
  }
  // застал: самый дальний предок (от деда) с годом смерти по числам текста, умерший заведомо после рождения лица
  let saw: { id: string; steps: number; gap: boolean } | null = null;
  if (!people && c.cls !== 'epochal') {
    const seen = new Set<string>([id]);
    let front: { id: string; steps: number; gap: boolean }[] = [{ id, steps: 0, gap: false }];
    for (let depth = 1; depth <= 12 && front.length; depth++) {
      const next: typeof front = [];
      for (const n of front) {
        for (const e of graph.parentsOf.get(n.id) ?? []) {
          if (!plainLink(e) || seen.has(e.parent)) continue;
          seen.add(e.parent);
          const a = { id: e.parent, steps: depth, gap: n.gap || e.gap };
          next.push(a);
          const ac = m.chrono.get(e.parent);
          if (depth >= 2 && ac && (ac.cls === 'exact' || ac.cls === 'calculated') && ac.d !== null && ac.d > c.bHi && nameIn(e.parent, 'acc') !== null) {
            if (!saw || depth > saw.steps) saw = a;
          }
        }
      }
      front = next;
    }
  }

  const kinOf = (x: string, dir: 'up' | 'down', cs: 'gen' | 'acc', steps = 1, gp = false) => {
    const word = kinDegree(steps, dir, byId.get(x)!.sex, cs, gp);
    // Сын Марии — с прописной, как в Синодальном тексте (Мф 1:21; Лк 2:7)
    return x === 'iisus' && dir === 'down' ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  };
  // «примерно через 25 лет после…», «за 55 лет до…»: оценка — наречием перед предлогом
  const amount = (prep: 'через' | 'за', g: { n: number; approx: boolean } | null) => (g ? `${g.approx ? 'примерно ' : ''}${prep} ${yearsWord(g.n)} ` : '');
  // знак после имени (запятая, точка с запятой, точка) держится за ссылку на лицо — PersonIn after
  const clauses: ComponentChildren[] = [];
  if (up)
    clauses.push(
      <>
        {amount('через', up.g)}после {kinOf(up.id, 'up', 'gen')}, <PersonIn id={up.id} cs="gen" after={down ? ',' : saw ? ';' : '.'} />
      </>,
    );
  if (down)
    clauses.push(
      <>
        {up ? ' и ' : ''}
        {amount('за', down.g)}до {kinOf(down.id, 'down', 'gen')}, <PersonIn id={down.id} cs="gen" after={saw ? ';' : '.'} />
      </>,
    );
  const sawNode = saw ? (
    <>
      {clauses.length ? ' ' : ''}
      {clauses.length ? (p.sex === 'f' ? 'застала' : 'застал') : p.sex === 'f' ? 'Застала' : 'Застал'} {kinOf(saw.id, 'up', 'acc', saw.steps, saw.gap)}, <PersonIn id={saw.id} cs="acc" after="." />
    </>
  ) : null;
  const years = !people && (up?.g || down?.g || saw);

  // встречи — опора времени для лица без дат (Мелхиседек — современник Авраама, Быт 14:17–20)
  const met = c.cls === 'epochal' ? (loadedCard(id)?.met ?? []).filter((x) => nameIn(x.id, 'gen') !== null).slice(0, 3) : [];
  const gapParent = (graph.parentsOf.get(id) ?? []).find((e) => e.kind === 'father' && e.gap);

  return typoTree(
    <>
      <p>
        {c.cls === 'epochal' || people ? 'Эпоха' : 'Эпоха рождения'}: {ep?.name ?? '—'}
        {ep ? <span class="muted"> ({formatSpan(ep.start < 0 ? ep.start + 1 : ep.start, ep.end < 0 ? ep.end + 1 : ep.end, ep.id === 'judges')})</span> : null}.
      </p>
      {c.cls === 'epochal' && <p>Время жизни не установлено: Писание не даёт опор для расчёта года.</p>}
      {met.map((x, i) => (
        <p class="fact" key={`met${i}`}>
          {p.sex === 'f' ? 'Современница' : 'Современник'} <PersonIn id={x.id} cs="gen" />
          <Namesake id={x.id} />
          <Refs refs={x.refs} owner={`met13.${i}`} />
          <VerseInsert owner={`met13.${i}`} refs={x.refs} />
        </p>
      ))}
      {(clauses.length > 0 || sawNode) && (
        <p class="fact">
          {clauses.length ? `${verbBorn(p.sex, people)} ` : ''}
          {clauses}
          {sawNode}
          {years ? <Mark calc /> : <MarkNote label="выв." full={MARK_FULL.order} />}
        </p>
      )}
      {tensions.map((t, i) => (
        <div class="tension" key={i}>
          <b>Хронологическое напряжение.</b> {t.text}
          <Refs refs={t.refs} owner={`t13.${i}`} />
          <VerseInsert owner={`t13.${i}`} refs={t.refs} />
        </div>
      ))}
      {c.cls === 'estimated' && !people && (
        <p class="muted">
          Год оценён по родству: по длине поколения своей эпохи между ближайшими предками и потомками с известными годами.
          {gapParent ? ' Родословие здесь может пропускать поколения, поэтому оценка приблизительна.' : ''}
        </p>
      )}
      {note?.map((f, i) => (
        <p class="fact" key={`n${i}`}>
          {f.text}
          <Refs refs={f.refs} owner={`c13.${i}`} />
          <VerseInsert owner={`c13.${i}`} refs={f.refs} />
        </p>
      ))}
    </>,
  );
}

export { refLabel };
