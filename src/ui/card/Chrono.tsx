/** § 8 (год и эпоха рождения) и § 13 (эпоха, относительная хронология, напряжения). */
import type { ComponentChildren } from 'preact';
import { byId, graph, loadedCard, loadedChrono } from '../../data/atlas.ts';
import type { Fact, Sex } from '../../data/types.ts';
import type { ParentEdge } from '../../engine/graph.ts';
import { normFor, type Tension } from '../../engine/chronology.ts';
import { Refs, VerseInsert, Mark, MarkNote, MARK_FULL, refLabel } from '../common.tsx';
import { formatSpan, shownYears, yearsWord, ESTIMATE_STEP } from '../../engine/years.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { birthLine, birthEpoch, birthRange, kinDegree, nameIn, Namesake, PersonIn, SeeSec } from './shared.tsx';
import { isPeople } from './Masthead.tsx';
import { typoTree } from '../text/typo.ts';
import { bySex, lowerFirst, pluralPeopleName } from '../text/ru.ts';
type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

/**
 * Помета года: «расч.» у всех лет, зависящих от хронологической модели; «выв.» у года, оценённого по порядку
 * перечисления братьев и сестёр (MAP-54; ChronoRow.byOrder). Одна и та же помета — в § 8 и в паспорте.
 */
export function YearMark({ cls, byOrder = false }: { cls: ChronoRow['cls']; byOrder?: boolean }) {
  if (cls === 'epochal') return null;
  if (byOrder) return <MarkNote label="выв." full={MARK_FULL.byOrder} />;
  if (cls === 'exact') return <MarkNote label="расч." full={MARK_FULL.exact} />;
  return <Mark calc />;
}

/**
 * § 8: год рождения (те же числа, что в паспорте) и эпоха рождения. Год, оценённый по порядку перечисления братьев
 * и сестёр (MAP-54; ChronoRow.byOrder), — с пометой «выв.»: на поле одна помета, и её пояснение говорит и о расчёте.
 */
export function BirthLine({ p, c, m }: { p: AtlasPerson; c: ChronoRow; m: ModelData }) {
  const ep = birthEpoch(p.id, c, m.epochs);
  return typoTree(
    <p class="fact">
      {birthLine(c, birthRange(p.id, c, m.chrono))}
      {ep ? `; эпоха — ${ep.name}` : ''}
      <YearMark cls={c.cls} byOrder={c.byOrder} />
    </p>,
  );
}

/**
 * Напряжение одной записью для § 13 (решение по CARD-61 и пределу 8 строк): цепочка имён, суть в числах
 * до первого пояснения и вывод-толкование («Вероятно, родословие называет не все поколения»); всё объяснение
 * со стихами — в § 24. Тексты напряжений строит решатель (engine/chronology.ts) по образцам:
 * «Цепочка: суть, в среднем…», «Цепочка: суть, а у супругов…», «Цепочка: суть: при принятых годах…»,
 * «Цепочка: суть. Так выходит…». Суть длиннее 160 знаков не выводится — остаются цепочка и вывод.
 */
export function tensionBrief(t: Tension): { chain: string; gist: string; interp: string | null } {
  const at = t.text.indexOf(':');
  const chain = at > 0 ? t.text.slice(0, at).trim() : '';
  const rest = at > 0 ? t.text.slice(at + 1).trim() : t.text.trim();
  // конец сути: двоеточие пояснения, «, а …», «, в среднем …» или конец предложения (не «г. до Р. Х.»)
  const end = /:\s|,\s(?:а|в среднем)\s|\.(?:\s+(?=[А-ЯЁ][а-яё])|$)/.exec(rest);
  let gist = (end ? rest.slice(0, end.index) : rest).trim();
  if (gist.length > 160) gist = '';
  const interp = /(?:^|\.\s+)(Вероятно,[^.]*\.)/.exec(t.text)?.[1] ?? null;
  return { chain, gist, interp };
}

/** § 13: напряжения лица одной записью (см. tensionBrief); стихи — всех напряжений, без повторов; «толк.» — если вывод толкование. */
// обычная функция, а не компонент: предел «8 строк» (Clamp) узнаёт запись напряжения по классу div.tension
function tensionBlock(tensions: Tension[]) {
  const briefs = tensions.map(tensionBrief);
  const interp = [...new Set(briefs.map((b) => b.interp).filter((x): x is string => !!x))];
  const refs = [...new Set(tensions.flatMap((t) => t.refs))];
  return (
    <div class="tension fact">
      <b>{tensions.length > 1 ? 'Хронологические напряжения.' : 'Хронологическое напряжение.'}</b>{' '}
      {briefs.map((b) => (b.chain ? `${b.chain}${b.gist ? `: ${b.gist}` : ''}. ` : '')).join('')}
      {interp.length ? `${interp.join(' ')} ` : ''}
      Подробнее{' '}
      <span class="nobr">
        <SeeSec n={24} />.
      </span>
      <Refs refs={refs} owner="t13" />
      {tensions.some((t) => t.cert === 'interpretation') ? <Mark cert="interpretation" /> : null}
      <VerseInsert owner="t13" refs={refs} />
    </div>
  );
}

const verbBorn = (sex: Sex) => (sex === 'f' ? 'Родилась' : 'Родился');

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
 * Правдоподобный промежуток между рождениями предка и потомка через steps поколений — по нормам поколения эпохи
 * предка. Больший промежуток — след сжатого родословия (Руф 4:18–22; Исх 6:16–20): решатель растягивает поколения,
 * и такое число в формуле читалось бы как утверждение («родила сына в 90 лет»). Его формула не называет.
 */
function plausible(parent: ChronoRow, kind: ParentEdge['kind'], years: number, steps = 1): boolean {
  const n = normFor(parent.epoch);
  const mother = kind === 'mother' && steps === 1;
  const max = mother && !LONG_LIVES.has(parent.epoch ?? '') ? Math.min(n.max, 60) : n.max;
  const min = mother ? 14 : n.min; // те же нижние пределы, что у решателя
  return years >= min * steps && years <= max * steps;
}

/** Прямой родитель или ребёнок: кровная связь, записанная Писанием или выведенная (не толкование, не «по закону»). */
const plainLink = (e: ParentEdge) => (e.kind === 'father' || e.kind === 'mother') && e.cert !== 'interpretation' && e.claim !== 'legal';

/** Год лица задан числами текста (возраст отца при рождении, год воцарения, явный год) — а не оценён по поколениям. */
const dated = (x: ChronoRow | undefined) => !!x && (x.cls === 'exact' || x.cls === 'calculated');

/** Самое дальнее поколение, в котором формула ищет опору среди предков и потомков. */
const ANCHOR_DEPTH = 6;

/** Родственник-опора формулы: лицо, число поколений, пропуск поколений на пути, вид первой связи и её стихи. */
export type Anchor = { id: string; steps: number; gap: boolean; kind: ParentEdge['kind']; g: { n: number; approx: boolean } | null; refs: string[] };

/**
 * Опоры формулы § 13 (CARD-86): ближайший предок и потомок, чей год не выведен из года лица, и сдвиг по числу текста
 * (born.offset). Правила — в описании RelativeChrono; отдельной функцией — для проверки по всем лицам.
 */
export function formulaAnchors(id: string, m: ModelData): { up: Anchor | null; down: Anchor | null; offWord: string | null; byOffset: boolean } {
  const c = m.chrono.get(id);
  if (!c) return { up: null, down: null, offWord: null, byOffset: false };
  const people = isPeople(id);
  const tensions = m.tensions.filter((t) => t.persons.includes(id));
  // пара, о которой уже говорит напряжение, в формулу не идёт: её числа противоречат друг другу
  const tense = (x: string) => tensions.some((t) => t.persons.includes(x));
  const own = loadedChrono(id);
  const ownDated = dated(c);
  /** Своя опора времени: год по числам текста, годы служения или царствования. */
  const anchoredSelf = (x: string) => {
    const q = byId.get(x);
    return dated(m.chrono.get(x)) || !!q?.active || !!q?.reign.length;
  };
  const usable = (x: string) => {
    const cc = m.chrono.get(x);
    if (!cc || cc.cls === 'epochal' || tense(x) || nameIn(x, 'gen') === null) return null;
    return (ownDated ? dated(cc) : anchoredSelf(x)) ? cc : null;
  };
  /** Стихи числа текста, связывающего ребёнка с родителем: возраст отца или матери при рождении ребёнка. */
  const linkRefs = (child: string, kind: ParentEdge['kind']): string[] => {
    const b = loadedChrono(child)?.born;
    if (!b) return [];
    return (kind === 'father' ? b.fatherAge : kind === 'mother' ? b.motherAge : undefined) !== undefined ? (b.refs ?? []) : [];
  };

  // ближайшая опора вверх (предки) и вниз (потомки): сначала первое поколение, затем следующие — до ANCHOR_DEPTH
  const search = (dir: 'up' | 'down'): Anchor | null => {
    if (people) return null;
    const seen = new Set<string>([id]);
    let front: { id: string; gap: boolean; kind: ParentEdge['kind'] | null }[] = [{ id, gap: false, kind: null }];
    // у лица с годом по числам текста опора — только в первом поколении: дальше связь не одно число текста
    const depth = ownDated ? 1 : ANCHOR_DEPTH;
    for (let steps = 1; steps <= depth && front.length; steps++) {
      const next: typeof front = [];
      for (const n of front) {
        const edges = dir === 'up' ? (graph.parentsOf.get(n.id) ?? []).filter(plainLink) : (graph.childrenOf.get(n.id) ?? []).filter(plainLink);
        // родитель: отец, затем мать; ребёнок: с годом по числам текста, затем первенец по порядку, затем старший по расчёту
        const sorted =
          dir === 'up'
            ? [...edges].sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'))
            : [...edges].sort(
                (a, b) =>
                  Number(!dated(m.chrono.get(a.child))) - Number(!dated(m.chrono.get(b.child))) ||
                  (byId.get(a.child)!.order ?? 99) - (byId.get(b.child)!.order ?? 99) ||
                  (m.chrono.get(a.child)?.b ?? 0) - (m.chrono.get(b.child)?.b ?? 0),
              );
        for (const e of sorted) {
          const x = dir === 'up' ? e.parent : e.child;
          if (seen.has(x)) continue;
          seen.add(x);
          const kind = n.kind ?? e.kind;
          const hop = { id: x, gap: n.gap || e.gap, kind };
          next.push(hop);
          const xc = usable(x);
          if (!xc || (dir === 'up' ? xc.b >= c.b : xc.b <= c.b)) continue;
          const older = dir === 'up' ? xc : c;
          const g = dir === 'up' ? gap(c, xc) : gap(xc, c);
          if (!g || !plausible(older, dir === 'up' ? e.kind : kind, g.n, steps)) continue;
          // стих числа текста — у связи с родителем в первом поколении (возраст отца или матери при рождении)
          const refs = steps === 1 && ownDated ? (dir === 'up' ? linkRefs(id, e.kind) : linkRefs(x, e.kind)) : [];
          return { id: x, steps, gap: hop.gap, kind, g, refs };
        }
      }
      front = next;
    }
    return null;
  };
  // свой сдвиг от другого лица по числу текста (Сарра — на 10 лет моложе Авраама, Быт 17:17) — опора надёжнее
  // цепочки через родителя
  const off = own?.born?.offset;
  const offAnchor: Anchor | null =
    ownDated && off && off.years > 0 && usable(off.from)
      ? { id: off.from, steps: 1, gap: false, kind: 'father', g: { n: off.years, approx: false }, refs: own?.born?.refs ?? [] }
      : null;
  const offWord = offAnchor && (graph.spousesOf.get(id) ?? []).some((e) => e.a === off!.from || e.b === off!.from) ? bySex(byId.get(off!.from)!.sex, 'мужа', 'жены') : null;
  const up = offAnchor ?? search('up');
  const down = search('down');
  return { up, down, offWord, byOffset: !!offAnchor && up === offAnchor };
}

/**
 * § 13. Формула относительной хронологии по ближайшим родственникам-опорам с названием родства:
 * «Родился примерно через 25 лет после отца, Зоровавеля, и примерно за 55 лет до сына, Елиакима; застал деда, …» — расч.
 * Оценка словом, а не знаком «~»: знак — не русская типографика и не читается программами экранного доступа.
 *
 * Опора — только родственник, чей год не выведен из года владельца (CARD-86):
 *  — у лица с годом по числам текста (exact, calculated) — только родственник с годом по числам текста: связь между
 *    ними — тоже число текста (Быт 5:3: «Адам жил сто тридцать лет и родил»), и формула называет его стих;
 *    если такого родственника нет — формула от собственного числа текста: «Родился за 30 лет до воцарения (2 Цар 5:4)»
 *    или основание года рождения из данных со стихами («во дни царя Ирода», Мф 2:1);
 *  — у лица с оценкой — ближайший предок или потомок со своей опорой: годом по числам текста, годами служения или
 *    царствования. Оценка соседа по поколению — не опора: её год выведен из той же длины поколения, что и год владельца
 *    (Мария — из года Сына, Амнон — из года Давида).
 * У народа и рода (решение 23) годов нет: «Названы в родословии после Мицраима, от которого произошли (Быт 10:13)».
 */
export function RelativeChrono({ id, m, note }: { id: string; m: ModelData; note?: Fact[] }) {
  const p = byId.get(id)!;
  const c = m.chrono.get(id)!;
  const ep = birthEpoch(id, c, m.epochs);
  const people = isPeople(id);
  const own = loadedChrono(id);
  const ownDated = dated(c);
  const tensions = m.tensions.filter((t) => t.persons.includes(id));
  const { up, down, offWord, byOffset } = formulaAnchors(id, m);

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

  // формула от собственного числа текста — у лица с годом по числам текста, если опоры-родственника нет:
  // возраст при воцарении («Родился за 30 лет до воцарения», 2 Цар 5:4) или основание года рождения из данных. Если
  // запись § 13 составителя уже приводит этот стих («Моисей был восьмидесяти… лет», Исх 7:7), она и становится
  // формулой — первой записью раздела, без пересказа рядом
  const reignAt = own?.reign?.find((r) => r.ageAtStart !== undefined && r.ageAtStart > 0);
  const bare = (r: string) => r.replace(/\s/g, '');
  const bornRefs = own?.born?.refs ?? [];
  const noteAt = people || !ownDated || up || down || reignAt || !bornRefs.length ? -1 : (note ?? []).findIndex((f) => (f.refs ?? []).some((r) => bare(r) === bare(bornRefs[0])));
  const basis: { text: ComponentChildren; refs: string[]; cert?: Fact['cert'] } | null =
    people || !ownDated || up || down
      ? null
      : reignAt
        ? { text: `${verbBorn(p.sex)} за ${yearsWord(reignAt.ageAtStart!)} до воцарения`, refs: reignAt.refs }
        : noteAt >= 0
          ? { text: `Основание года рождения: ${lowerFirst(note![noteAt].text)}`, refs: note![noteAt].refs ?? [], cert: own?.born?.cert }
          : own?.born?.note && bornRefs.length
            ? { text: `Основание года рождения: ${lowerFirstWord(own.born.note.replace(/\.$/, ''))}`, refs: bornRefs, cert: own.born.cert }
            : null;
  const notes = (note ?? []).filter((_, i) => i !== noteAt);

  // знак после имени (запятая, точка с запятой, точка) держится за ссылку на лицо — PersonIn after
  const clauses: ComponentChildren[] = [];
  if (up)
    clauses.push(
      <>
        {amount('через', up.g)}после {byOffset ? (offWord ? `${offWord}, ` : '') : `${kinOf(up.id, 'up', 'gen', up.steps, up.gap)}, `}
        <PersonIn id={up.id} cs="gen" after={down ? ',' : saw ? ';' : '.'} />
      </>,
    );
  if (down)
    clauses.push(
      <>
        {up ? ' и ' : ''}
        {amount('за', down.g)}до {kinOf(down.id, 'down', 'gen', down.steps, down.gap)}, <PersonIn id={down.id} cs="gen" after={saw ? ';' : '.'} />
      </>,
    );
  const sawNode = saw ? (
    <>
      {clauses.length ? ' ' : ''}
      {clauses.length ? (p.sex === 'f' ? 'застала' : 'застал') : p.sex === 'f' ? 'Застала' : 'Застал'} {kinOf(saw.id, 'up', 'acc', saw.steps, saw.gap)}, <PersonIn id={saw.id} cs="acc" after="." />
    </>
  ) : null;
  // стихи чисел текста, на которых стоит формула: возраст отца при рождении (Быт 5:3) и у ребёнка (Быт 5:6)
  const formulaRefs = [...new Set([...(up?.refs ?? []), ...(down?.refs ?? [])])];

  // народ или род: «Названы в родословии после Мицраима, от которого произошли (Быт 10:13)» — без годов и поколений
  const origin = people ? (graph.parentsOf.get(id) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother')).find((e) => nameIn(e.parent, 'gen') !== null) : undefined;
  const plural = pluralPeopleName(p.name, p.kind ?? '');

  // встречи — опора времени для лица без дат (Мелхиседек — современник Авраама, Быт 14:17–20)
  const met = c.cls === 'epochal' ? (loadedCard(id)?.met ?? []).filter((x) => nameIn(x.id, 'gen') !== null).slice(0, 3) : [];
  const gapParent = (graph.parentsOf.get(id) ?? []).find((e) => e.kind === 'father' && e.gap);

  return typoTree(
    <>
      <p>
        {c.cls === 'epochal' || people ? 'Эпоха' : 'Эпоха рождения'}: {ep?.name ?? '—'}
        {ep ? <span class="muted"> ({formatSpan(ep.start < 0 ? ep.start + 1 : ep.start, ep.end < 0 ? ep.end + 1 : ep.end, ep.id === 'judges')})</span> : null}.
      </p>
      {c.cls === 'epochal' && !people && <p>Время жизни не установлено: Писание не даёт опор для расчёта года.</p>}
      {met.map((x, i) => (
        <p class="fact" key={`met${i}`}>
          {p.sex === 'f' ? 'Современница' : 'Современник'} <PersonIn id={x.id} cs="gen" />
          <Namesake id={x.id} />
          <Refs refs={x.refs} owner={`met13.${i}`} />
          <VerseInsert owner={`met13.${i}`} refs={x.refs} />
        </p>
      ))}
      {origin && (
        <p class="fact">
          {plural ? 'Названы' : bySex(p.sex, 'Назван', 'Названа')} в родословии после <PersonIn id={origin.parent} cs="gen" after="," /> от{' '}
          {byId.get(origin.parent)!.sex === 'f' ? 'которой' : 'которого'} {plural ? 'произошли' : bySex(p.sex, 'произошёл', 'произошла')}
          {origin.refs.length ? <Refs refs={origin.refs} owner="o13" tail="." /> : '.'}
          {origin.refs.length ? null : <MarkNote label="выв." full={MARK_FULL.order} />}
          <VerseInsert owner="o13" refs={origin.refs} />
        </p>
      )}
      {(clauses.length > 0 || sawNode) && (
        <p class="fact">
          {clauses.length ? `${verbBorn(p.sex)} ` : ''}
          {clauses}
          {sawNode}
          <Refs refs={formulaRefs} owner="f13" />
          <Mark calc />
          <VerseInsert owner="f13" refs={formulaRefs} />
        </p>
      )}
      {basis && (
        <p class="fact">
          {basis.text}
          <Refs refs={basis.refs} owner="b13" />
          {basis.cert && basis.cert !== 'scripture' ? <Mark cert={basis.cert} /> : <Mark calc />}
          <VerseInsert owner="b13" refs={basis.refs} />
        </p>
      )}
      {/* напряжения — одной записью: у каждого цепочка и суть, вывод-толкование один раз, объяснение и все стихи —
          в § 24 («Подробнее см. § 24»); так § 13 держит предел 8 строк и у Моисея с двумя напряжениями */}
      {tensions.length > 0 && tensionBlock(tensions)}
      {c.cls === 'estimated' && !people && (
        <p class="muted">
          Год оценён по родству: по длине поколения своей эпохи между ближайшими предками и потомками с известными годами.
          {gapParent ? ' Родословие здесь может пропускать поколения, поэтому оценка приблизительна.' : ''}
        </p>
      )}
      {notes.map((f, i) => (
        <p class="fact" key={`n${i}`}>
          {f.text}
          <Refs refs={f.refs} owner={`c13.${i}`} />
          <VerseInsert owner={`c13.${i}`} refs={f.refs} />
        </p>
      ))}
    </>,
  );
}

/** Примечание после двоеточия: «Ок. 6–4 гг.» → «ок. 6–4 гг.»; имена собственные остаются с прописной. */
function lowerFirstWord(s: string): string {
  return /^Ок\./.test(s) ? `о${s.slice(1)}` : s;
}

export { refLabel };
