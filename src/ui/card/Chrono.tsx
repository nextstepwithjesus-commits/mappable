/** § 8 (год и эпоха рождения) и § 13 (эпоха, относительная хронология, напряжения). */
import { cloneElement, isValidElement, type ComponentChildren, type VNode } from 'preact';
import { anchors, byId, graph, loadedCard, loadedChrono, modelDependent, modelInfo, modelInfoOf, models } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import type { Epoch, Fact, Sex } from '../../data/types.ts';
import type { ParentEdge } from '../../engine/graph.ts';
import { normFor, type Tension } from '../../engine/chronology.ts';
import { Refs, VerseInsert, Mark, MarkNote, MARK_FULL, refLabel } from '../common.tsx';
import { dateText, epochSpanText, markTitle, modelYearsText, shownYears, yearsWord, ESTIMATE_STEP } from '../../engine/years.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { birthLine, birthEpoch, birthRange, datesOf, kinDegree, lifeEpoch, nameIn, Namesake, PersonIn, SeeSec } from './shared.tsx';
import { isPeople } from './Masthead.tsx';
import { typoTree } from '../text/typo.ts';
import { bySex, capFirst, lowerFirst, pluralPeopleName } from '../text/ru.ts';
type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

/**
 * Помета года «расч.» (решение 96): у каждого года, вычисленного атласом, — по числам текста, реконструкции или оценке.
 * Пояснение своё у каждого лица (markTitle): откуда год и зависит ли он от модели хронологии. «выв.» у года, оценённого
 * по порядку перечисления, больше не ставится: из порядка выводится очерёдность, а не год (о порядке — в пояснении).
 * Одна и та же помета — в паспорте, § 8, § 20 и в карточке союза.
 */
export function YearMark({ id, c, m = model.value }: { id: string; c: ChronoRow; m?: ModelData }) {
  if (c.cls === 'epochal') return null;
  return <MarkNote label="расч." full={markTitle(c, { dep: modelDependent(id), model: modelInfoOf(m.id).short })} />;
}

/**
 * § 8: год рождения словами словаря дат (решение 96) — тот же, что в паспорте, — и эпоха рождения (решение 98: так она
 * называется только в § 8 и § 13).
 */
export function BirthLine({ p, c, m }: { p: AtlasPerson; c: ChronoRow; m: ModelData }) {
  // у лица без годов года рождения нет — и эпоха названа эпохой жизни (решение 98)
  const ep = c.cls === 'epochal' ? lifeEpoch(p.id, c, m.epochs) : birthEpoch(p.id, c, m.epochs);
  return typoTree(
    <p class="fact">
      {birthLine(c, birthRange(p.id, c, m.chrono))}
      {ep ? `; ${c.cls === 'epochal' ? 'эпоха' : 'эпоха рождения'} — ${ep.name}` : ''}
      <YearMark id={p.id} c={c} m={m} />
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
export function tensionBrief(t: Tension, id?: string): { chain: string; gist: string; interp: string | null } {
  // цепочка — имена через тире до «: »; запись, которая начинается фразой («Пребывание в Египте — 430 лет
  // (Исх 12:40), а родословия называют…»), цепочки не имеет: её суть — первое предложение целиком
  const head = /^([^:.()\d]+?):\s/.exec(t.text);
  const chain = head && /\s—\s/.test(head[1]) ? head[1].trim() : '';
  const rest = chain ? t.text.slice(head![0].length).trim() : t.text.trim();
  // конец сути: двоеточие пояснения, «, а …», «, в среднем …» или конец предложения (не «г. до Р. Х.»); «, а по принятым
  // годам …» и «, а по числам текста …» — сама суть («Кис назван прежде, а по принятым годам Нир старше»), не пояснение
  const end = chain ? /:\s|,\s(?:а(?!\sпо\s)|в среднем)\s|\.(?:\s+(?=[А-ЯЁ][а-яё])|$)/.exec(rest) : /\.(?:\s+(?=[А-ЯЁ][а-яё])|$)/.exec(rest);
  let gist = (end ? rest.slice(0, end.index) : rest).trim();
  if (gist.length > 160) gist = '';
  // запись без цепочки в начале (430 лет) держит внутри звенья «Кааф — Амрам — Моисей: …»: в карточке лица — те, где оно
  // названо, списком после сути (у Моисея — «Кааф — Амрам — Моисей; Левий — Иохаведа — Моисей»)
  const name = id ? byId.get(id)?.name : undefined;
  if (!chain && gist && name) {
    const links = [...t.text.matchAll(/(?:^|[.;]\s+)([А-ЯЁ][^:.;()\d]*?\s—\s[^:.;()\d]*?)\s*:\s/g)]
      .map((x) => x[1].replace(/\s+/g, ' ').trim())
      .filter((x) => x.split(' — ').includes(name));
    if (links.length) gist = `${gist.replace(/\.$/, '')}: ${[...new Set(links)].join('; ')}`;
  }
  // вывод-толкование: «Вероятно, …» с начала предложения или после «;» («…; вероятно, перечень называет братьев не по
  // старшинству»), либо «Поэтому …» (запись «Фарра — Аврам» модели «Фарре 70»)
  const found = /(?:^|\.\s+|;\s+)((?:[Вв]ероятно,|Поэтому\s)[^.]*\.)/.exec(t.text)?.[1] ?? null;
  const interp = found ? found[0].toUpperCase() + found.slice(1) : null;
  return { chain, gist, interp };
}

/** Точка в конце фразы — одна: суть может кончаться сокращением («730 г. до Р. Х.»). */
const endDot = (t: string) => (t.endsWith('.') ? t : `${t}.`);

/**
 * Подпись строки § 13 («Откуда годы», «Эпоха», «Среди родни», «Модель») — в начале первой записи строки (решение 100):
 * запись остаётся записью для предела «8 строк» (Clamp), подпись не уходит от неё переносом.
 */
function headed(label: string, rows: ComponentChildren): ComponentChildren {
  const list = (Array.isArray(rows) ? rows : [rows]).filter((x) => x !== null && x !== undefined && x !== false);
  if (!list.length || !isValidElement(list[0])) return rows;
  const first = list[0] as VNode<{ children?: ComponentChildren }>;
  return [
    cloneElement(
      first,
      {},
      <span class="row-h" key="h">
        {label}
      </span>,
      ' ',
      first.props.children,
    ),
    ...list.slice(1),
  ];
}

/** § 13: напряжения лица одной записью (см. tensionBrief); стихи — всех напряжений, без повторов; «толк.» — если вывод толкование. */
// обычная функция, а не компонент: предел «8 строк» (Clamp) узнаёт запись напряжения по классу div.tension
function tensionBlock(tensions: Tension[], id: string, kin = false) {
  const briefs = tensions.map((t) => tensionBrief(t, id));
  // вывод — одной фразой: вторая половина («— или 430 лет считаются с прихода Авраама…») — в § 24
  const interp = [...new Set(briefs.map((b) => b.interp?.replace(/[\s\u00a0]—\s(?:или|либо)\s[^.]*\.$/, '.')).filter((x): x is string => !!x))];
  const refs = [...new Set(tensions.flatMap((t) => t.refs))];
  return (
    <div class={kin ? 'tension kin fact' : 'tension fact'}>
      {/* подзаголовок записи — в длинном разделе отдельной строкой (решение 121; folio.css, .lead) */}
      <span class="lead">{tensions.length > 1 ? 'Хронологические напряжения.' : 'Хронологическое напряжение.'}</span>{' '}
      {briefs.map((b) => (b.chain ? `${endDot(b.chain + (b.gist ? `: ${b.gist}` : ''))} ` : b.gist ? `${endDot(b.gist)} ` : '')).join('')}
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

/** «Застал»: самый дальний предок (от деда) с годом смерти по числам текста, умерший заведомо после рождения лица. */
export function sawOf(id: string, m: ModelData): { id: string; steps: number; gap: boolean } | null {
  const c = m.chrono.get(id);
  if (!c || isPeople(id) || c.cls === 'epochal') return null;
  let saw: { id: string; steps: number; gap: boolean } | null = null;
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
  return saw;
}

/** Лица, которых называет формула § 13: опоры, «застал», родоначальник народа — для уточнения тёзок (решение 106). */
export function formulaPeople(id: string, m: ModelData): string[] {
  const { up, down } = formulaAnchors(id, m);
  const saw = sawOf(id, m);
  const origin = isPeople(id) ? (graph.parentsOf.get(id) ?? []).filter(plainLink).map((e) => e.parent) : [];
  return [up?.id, down?.id, saw?.id, ...origin].filter((x): x is string => !!x);
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
export function RelativeChrono({ id, m, note, twins }: { id: string; m: ModelData; note?: Fact[]; twins?: Set<string> }) {
  // тёзки карточки (решение 106): уточнение при каждом упоминании
  const tw = (x: string) => !!twins?.has(x);
  const p = byId.get(id)!;
  const c = m.chrono.get(id)!;
  const ep = birthEpoch(id, c, m.epochs);
  const people = isPeople(id);
  const own = loadedChrono(id);
  const ownDated = dated(c);
  const tensions = m.tensions.filter((t) => t.persons.includes(id));
  const { up, down, offWord, byOffset } = formulaAnchors(id, m);
  const saw = sawOf(id, m);

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
        <PersonIn id={up.id} cs="gen" after={down ? ',' : saw ? ';' : '.'} dis={tw(up.id)} />
      </>,
    );
  if (down)
    clauses.push(
      <>
        {up ? ' и ' : ''}
        {amount('за', down.g)}до {kinOf(down.id, 'down', 'gen', down.steps, down.gap)}, <PersonIn id={down.id} cs="gen" after={saw ? ';' : '.'} dis={tw(down.id)} />
      </>,
    );
  const sawNode = saw ? (
    <>
      {clauses.length ? ' ' : ''}
      {clauses.length ? (p.sex === 'f' ? 'застала' : 'застал') : p.sex === 'f' ? 'Застала' : 'Застал'} {kinOf(saw.id, 'up', 'acc', saw.steps, saw.gap)}, <PersonIn id={saw.id} cs="acc" after="." dis={tw(saw.id)} />
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

  // «Среди родни»: формула; если её нет, а цепочка поколений растянута (сжатое родословие, Мф 1:13–16), — это напряжение
  // вместо формулы (решение 100); остальные напряжения — последней строкой
  // «сжатое родословие» (Зоровавель — … — Иосиф, Мф 1:13–16) заменяет формулу всегда: поколения там растянуты, и
  // формула «через N лет после отца» читалась бы как утверждение; без формулы здесь же — цепочка поколений
  // (430 лет: «Иаков — … — Моисей»), одной записью со всеми трудностями (CARD-61)
  const compressed = people ? [] : tensions.filter((t) => t.kind === 'compressed');
  const formula = !compressed.length && (clauses.length > 0 || !!sawNode);
  const GEN_KINDS = new Set<Tension['kind']>(['chain', 'pair', 'compressed']);
  const kinT = people ? [] : compressed.length ? compressed : !formula ? tensions.filter((t) => GEN_KINDS.has(t.kind)) : [];
  const restT = tensions.filter((t) => !kinT.includes(t));

  // «Эпоха»: эпоха жизни и, если другая, эпоха рождения (решение 98) — с годами эпохи по одному правилу «ок.» (решение 99)
  const life = lifeEpoch(id, c, m.epochs);
  const born = c.cls !== 'epochal' && !people ? ep : null;
  const epochWords = (e: Epoch) => `${e.name} (${epochSpanText(e)})`;

  // «Модель»: одинаково во всех моделях или годы в других моделях (решения 96, 102)
  const dep = modelDependent(id);
  const others = dep ? modelLines(id, m) : [];

  const why = whyYears({ id, p, c, m, own, ownDated, basis, notes: note ?? [], noteAt, gapParent: !!gapParent, tw });

  // строки § 13 в постоянном порядке (решение 100) — подпись строки в строку перед её первой записью, как поле паспорта:
  // отдельные строки подписей удлиняли § 13 сверх предела 8 строк (F5), а напряжение в нём не прячется под «ещё N»
  const whence: ComponentChildren[] = people
    ? [
        origin ? (
          <p class="fact" key="o">
            {plural ? 'Названы' : bySex(p.sex, 'Назван', 'Названа')} в родословии после <PersonIn id={origin.parent} cs="gen" after="," dis={tw(origin.parent)} /> от{' '}
            {byId.get(origin.parent)!.sex === 'f' ? 'которой' : 'которого'} {plural ? 'произошли' : bySex(p.sex, 'произошёл', 'произошла')}
            {origin.refs.length ? <Refs refs={origin.refs} owner="o13" tail="." /> : '.'}
            {origin.refs.length ? null : <MarkNote label="выв." full={MARK_FULL.order} />}
            <VerseInsert owner="o13" refs={origin.refs} />
          </p>
        ) : (
          <p key="o">Народ или род: место в родословии, а не год рождения.</p>
        ),
      ]
    : c.cls === 'epochal'
      ? [
          <p key="e">Время жизни не установлено: Писание не даёт опор для расчёта года.</p>,
          ...met.map((x, i) => (
            <p class="fact" key={`met${i}`}>
              {p.sex === 'f' ? 'Современница' : 'Современник'} <PersonIn id={x.id} cs="gen" />
              <Namesake id={x.id} />
              <Refs refs={x.refs} owner={`met13.${i}`} />
              <VerseInsert owner={`met13.${i}`} refs={x.refs} />
            </p>
          )),
        ]
      : ([] as ComponentChildren[]).concat(why);

  return typoTree(
    <>
      {headed('Откуда годы', whence)}
      {headed(
        'Эпоха',
        <p key="ep">
          {life ? epochWords(life) : '—'}
          {born && life && born.id !== life.id ? `; ${bySex(p.sex, 'родился', 'родилась')} в эпоху «${born.name}» (${epochSpanText(born)})` : ''}.
        </p>,
      )}
      {formula &&
        headed(
          'Среди родни',
          <p class="fact" key="f">
            {clauses.length ? `${verbBorn(p.sex)} ` : ''}
            {clauses}
            {sawNode}
            <Refs refs={formulaRefs} owner="f13" />
            <Mark calc />
            <VerseInsert owner="f13" refs={formulaRefs} />
          </p>,
        )}
      {kinT.length > 0 && headed('Среди родни', tensionBlock(kinT, id, true))}
      {!people && (c.cls !== 'epochal' || dep)
        ? headed(
            'Модель',
            dep ? (
              <p class="fact" key="md">
                {dot(`Годы зависят от модели хронологии; здесь — «${modelInfoOf(m.id).short}». ${capFirst(others.join('; '))}`)}
              </p>
            ) : (
              <p key="md">Годы одинаковы во всех моделях хронологии.</p>
            ),
          )
        : null}
      {/* напряжения — одной записью: у каждого цепочка и суть, вывод-толкование один раз, объяснение и все стихи —
          в § 24 («Подробнее см. § 24»); так § 13 держит предел 8 строк и у Моисея с двумя напряжениями */}
      {restT.length > 0 && tensionBlock(restT, id)}
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

/** Годы лица в других моделях хронологии (решения 96, 102): «в модели «Краткое пребывание» — 1951–1776 гг. до Р. Х.». */
function modelLines(id: string, m: ModelData): string[] {
  const p = byId.get(id)!;
  const out: string[] = [];
  const base = models[0];
  for (const info of modelInfo) {
    if (info.id === m.id) continue;
    const row = info.id === base.id ? base.chrono.get(id) : (p.modelDep[info.id as keyof typeof p.modelDep] ?? base.chrono.get(id));
    if (!row) continue;
    const t = modelYearsText(info.id === base.id ? datesOf(id, row as ChronoRow, base.chrono) : row, info.short);
    if (t) out.push(t);
  }
  return out;
}

/** Точка в конце предложения — одна: «967 г. до Р. Х.» уже кончается точкой сокращения. */
const dot = (t: string) => (/[.…!?]$/.test(t) ? t : `${t}.`);

/** Опора основания года: событие и год из data/anchors.json («4-й год Соломона, закладка храма — 967 г. до Р. Х.»). */
function anchorWords(key: string | undefined): { text: string; refs: string[] } | null {
  const a = anchors.find((x) => x.id === (key ?? 'solomon-4'));
  return a ? { text: `${lowerFirst(a.event)} — ${dateText({ t: a.value < 0 ? a.value + 1 : a.value })}`, refs: a.verse ? [a.verse] : [] } : null;
}

/**
 * «Откуда годы» (решение 100; X2 § 2.3): конкретное основание года из ChronoRow.basis — числа текста от опоры, царствование,
 * явный год, поколения до ближайших датированных родственников, порядок перечисления, служение, встреча, эпоха главы,
 * границы текста, толкование. Общая фраза о предках и потомках — только если такие опоры названы (basis.ids).
 */
function whyYears(o: {
  id: string; p: AtlasPerson; c: ChronoRow; m: ModelData; own: ReturnType<typeof loadedChrono>; ownDated: boolean;
  basis: { text: ComponentChildren; refs: string[]; cert?: Fact['cert'] } | null; notes: Fact[]; noteAt: number; gapParent: boolean; tw: (x: string) => boolean;
}): ComponentChildren {
  const { id, p, c, m, own, basis } = o;
  const b = c.basis ?? { kind: c.cls === 'exact' ? 'numbers' : c.cls === 'calculated' ? 'reign' : c.byOrder ? 'order' : 'kin' };
  const mark = <YearMark id={id} c={c} m={m} />;
  const him = bySex(p.sex, 'нём', 'ней');
  const line = (key: string, text: ComponentChildren, refs: string[], mk: ComponentChildren = mark) => (
    <p class="fact" key={key}>
      {text}
      <Refs refs={refs} owner={`w13${key}`} />
      {mk}
      <VerseInsert owner={`w13${key}`} refs={refs} />
    </p>
  );
  const out: ComponentChildren[] = [];
  const bornRefs = own?.born?.refs ?? [];
  if (b.kind === 'numbers' || b.kind === 'reign' || b.kind === 'year') {
    // собственное число текста или основание года — формулой («Родился за 30 лет до воцарения», 2 Цар 5:4)
    if (basis) out.push(line('b', basis.text, basis.refs, basis.cert && basis.cert !== 'scripture' ? <Mark cert={basis.cert} /> : mark));
    const a = anchorWords(b.anchor);
    const lead =
      b.kind === 'numbers'
        ? 'Год вычислен по числам текста'
        : b.kind === 'reign'
          ? 'Год — по реконструкции царствований Тиле — Янга; числа текста о царях — отдельно'
          : 'Год отсчитан от датированного события';
    // есть своё основание («Родился за 30 лет до воцарения») — опора года названа в пояснении пометы «расч.» (паспорт,
    // § 8) и в «О хронологии»: § 13 не повторяет её отдельной записью и держит предел 8 строк (F5)
    if (!basis) out.push(line('a', dot(`${lead}${a ? `; опора — ${a.text}` : ''}`), [...bornRefs, ...(a?.refs ?? [])]));
    return out;
  }
  // знак после имени — в after: он не отрывается от имени переносом (.nobr, B5)
  const kinName = (x: string, dir: 'up' | 'down', steps: number, after: string) => (
    <>
      {kinDegree(steps, dir, byId.get(x)!.sex, 'gen', o.gapParent && dir === 'up')}, <PersonIn id={x} cs="gen" after={after} dis={o.tw(x)} />
    </>
  );
  switch (b.kind) {
    case 'kin': {
      const ids = b.ids ?? [];
      const [upN, downN] = b.gens ?? [0, 0];
      const upId = upN > 0 ? ids[0] : undefined;
      const downId = downN > 0 ? ids[upN > 0 ? 1 : 0] : undefined;
      const usable = (x: string | undefined) => !!x && byId.has(x) && nameIn(x, 'gen') !== null;
      const end = o.gapParent ? ';' : '.';
      if (usable(upId) || usable(downId))
        out.push(
          line(
            'k',
            <>
              {`Чисел о ${him} Писание не называет; год рождения (см. § 8) — оценка по обычной разнице поколений `}
              {usable(upId) ? <>от {kinName(upId!, 'up', upN, usable(downId) ? ',' : end)}</> : null}
              {usable(upId) && usable(downId) ? ' и ' : ''}
              {usable(downId) ? <>до {kinName(downId!, 'down', downN, end)}</> : null}
              {o.gapParent ? ' родословие здесь может пропускать поколения.' : ''}
            </>,
            [],
          ),
        );
      else out.push(line('k', `Чисел о ${him} Писание не называет; год рождения (см. § 8) — оценка по обычной разнице поколений своей эпохи${o.gapParent ? '; родословие здесь может пропускать поколения' : ''}.`, []));
      break;
    }
    case 'order': {
      const x = b.ids?.[0];
      out.push(
        line(
          'o',
          x && nameIn(x, 'gen') ? (
            <>
              Год — оценка по порядку перечисления: после {bySex(byId.get(x)!.sex, 'брата', 'сестры')}, <PersonIn id={x} cs="gen" after=";" dis={o.tw(x)} /> из порядка следует очерёдность, а не год.
            </>
          ) : (
            'Год — оценка по порядку перечисления братьев и сестёр; из порядка следует очерёдность, а не год.'
          ),
          [],
        ),
      );
      break;
    }
    case 'active': {
      const act = own?.active;
      out.push(line('ac', `Чисел о рождении Писание не называет; год — оценка по засвидетельствованным годам деятельности${act?.note ? `: ${lowerFirst(act.note.replace(/\.$/, ''))}` : ''}.`, act?.refs ?? []));
      break;
    }
    case 'met': {
      const x = b.ids?.[0];
      const q = x ? byId.get(x) : null;
      const metRow = x ? loadedCard(id)?.met?.find((y) => y.id === x) : undefined;
      out.push(line('m', q ? <>Год — оценка по встрече с лицом, чьи годы известны: <PersonIn id={x!} cs="gen" dis={o.tw(x!)} /> — см. § 14.</> : 'Год — оценка по встрече с лицом, чьи годы известны (см. § 14).', metRow?.refs ?? []));
      break;
    }
    case 'mention':
      out.push(line('mn', 'Год — оценка по эпохе книги и главы, где лицо названо впервые.', b.ref ? [b.ref] : []));
      break;
    case 'epoch':
      out.push(line('e', 'Год — оценка по эпохе, к которой лицо отнесено по тексту (см. «Эпоха»).', []));
      break;
    case 'bounds':
      out.push(line('bd', `Год — оценка в границах текста: «не раньше» и «не позже»${c.pin === 'hi' ? '; год стоит на верхней границе' : c.pin === 'lo' ? '; год стоит на нижней границе' : ''}.`, bornRefs));
      break;
    case 'group':
      out.push(line('g', 'Год — оценка по годам датированных лиц того же рода.', []));
      break;
    case 'interp':
      out.push(line('i', 'Год — оценка по числу, понимаемому по толкованию (см. § 24).', bornRefs, <Mark cert="interpretation" />));
      break;
    default:
      out.push(line('x', `Чисел о ${him} Писание не называет; год рождения (см. § 8) — оценка.`, []));
  }
  if (basis) out.push(line('b', basis.text, basis.refs, basis.cert && basis.cert !== 'scripture' ? <Mark cert={basis.cert} /> : mark));
  return out;
}

/** Примечание после двоеточия: «Ок. 6–4 гг.» → «ок. 6–4 гг.»; имена собственные остаются с прописной. */
function lowerFirstWord(s: string): string {
  return /^Ок\./.test(s) ? `о${s.slice(1)}` : s;
}

export { refLabel };
