import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, graph, groupById, loadCard, lineMembership, books } from '../data/atlas.ts';
import type { Card, Chrono, Fact, Cert } from '../data/types.ts';
import { selected, second, pickMode, panel, model, showSchema } from '../state.ts';
import { P, Refs, VerseInsert, Mark, roleText, refLabel, skyRef, plural } from './common.tsx';
import { siblings } from '../engine/graph.ts';
import { formatYear, formatSpan, yearsWord, toHist } from '../engine/years.ts';
import { contemporaries, type ChronoResult, type PersonChrono } from '../engine/chronology.ts';
import { lifeText } from './SkyView.tsx';
import type { ModelData, ChronoRow } from '../data/atlas.ts';

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

/** Модель ChronoResult поверх данных выбранной модели (для «современников»). */
function asResult(m: ModelData): ChronoResult {
  const personsMap = new Map<string, PersonChrono>();
  for (const [id, c] of m.chrono) personsMap.set(id, { b: c.b, bLo: c.bLo, bHi: c.bHi, d: c.d, dLo: null, dHi: null, lastAttested: c.last, dEst: c.dEst, cls: c.cls, epoch: c.epoch });
  return { model: m.id as never, persons: personsMap, tensions: m.tensions };
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

  const out = buildSections(id, p, card, m, c);
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
          <button onClick={() => window.print()}>Печать</button>
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


/** Содержимое разделов 1–24 одного лица; ns — приставка ключей вставок стихов (две карточки в развороте). */
export function buildSections(id: string, p: AtlasPerson, card: Card | null, m: ModelData, c: ChronoRow | undefined, ns = ''): Map<number, ComponentChildren> {
  const out = new Map<number, ComponentChildren>();
  const put = (n: number, v: ComponentChildren | null | false | undefined) => {
    if (v !== null && v !== false && v !== undefined && !(Array.isArray(v) && v.filter(Boolean).length === 0)) out.set(n, v);
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
      {p.kind === 'founder' && <span class="muted"> — назван «отцом» города, то есть родоначальником его жителей</span>}
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
          {o.note ? <span class="muted">. {o.note}</span> : null}
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
          {card.altNames.map((a, i) => (
            <li key={i}>
              {a.name} <span class="muted">— {ALT_KIND[a.kind] ?? a.kind}</span>
              <Refs refs={a.refs} owner={ns + `a4.${i}`} />
              {a.note ? <span class="muted">. {a.note}</span> : null}
              <VerseInsert owner={ns + `a4.${i}`} refs={a.refs} />
            </li>
          ))}
        </ul>
      ) : null,
    );
  }
  put(
    5,
    (p.roles.length || card?.status?.length) && (
      <>
        {p.roles.length ? <p>{roleText(p.roles, p.sex)}</p> : null}
        {facts(card?.status, 's5')}
      </>
    ),
  );
  // 6 — родители
  {
    const rows: ComponentChildren[] = [];
    const pc: Cert = p.parentCert;
    if (p.father) rows.push(<li class="fact" key="f">{p.fatherKind === 'legal' ? 'Законный отец' : 'Отец'}: <P id={p.father} /><Refs refs={p.parentRefs} owner={ns + 'p6f'} /><Mark cert={pc} /><VerseInsert owner={ns + 'p6f'} refs={p.parentRefs} />{p.fatherGap && <span class="muted"> — родословие здесь может пропускать поколения</span>}</li>);
    if (p.mother) rows.push(<li class="fact" key="m">Мать: <P id={p.mother} /><Refs refs={p.parentRefs} owner={ns + 'p6m'} /><Mark cert={p.motherCert} /><VerseInsert owner={ns + 'p6m'} refs={p.parentRefs} /></li>);
    p.otherParents.forEach((o, i) =>
      rows.push(
        <li class="fact" key={`o${i}`}>
          {OTHER_KIND[o.kind] ?? 'Иное указание'}: {o.role === 'father' ? 'отец' : 'мать'} <P id={o.id} />
          <Refs refs={o.refs} owner={ns + `p6o${i}`} />
          <Mark cert={o.cert} />
          <VerseInsert owner={ns + `p6o${i}`} refs={o.refs} />
        </li>,
      ),
    );
    put(6, (rows.length || card?.parentsNote?.length) && (<>{rows.length ? <ul>{rows}</ul> : null}{facts(card?.parentsNote, 'n6')}</>));
  }
  put(7, (card?.lineage?.length || p.group) && (<><p>{groupById.get(p.group)?.name}</p>{facts(card?.lineage, 'l7')}</>));
  // 8 — рождение
  if (c) {
    put(
      8,
      <>
        <p class="fact">
          {c.cls === 'epochal' ? `Год не установлен; эпоха — ${m.epochs.find((e) => e.id === (p.epoch ?? c.epoch))?.name ?? '—'}` : birthLine(c.b, c.bLo, c.bHi, c.cls)}
          <Mark calc={c.cls !== 'exact' && c.cls !== 'epochal'} />
        </p>
        {card?.birth?.place ? <p>Место: {card.birth.place}</p> : null}
        {facts(card?.birth?.facts, 'b8')}
      </>,
    );
  }
  // 9 — супруги
  {
    const sp = (graph.spousesOf.get(id) ?? []).map((s) => ({ other: s.a === id ? s.b : s.a, s }));
    put(
      9,
      (sp.length || card?.spousesNote?.length) && (
        <>
          {sp.length ? (
            <ul>
              {sp.map(({ other, s }, i) => (
                <li class="fact" key={other}>
                  <P id={other} />
                  <span class="muted"> — {s.kind === 'concubine' ? 'наложница' : p.sex === 'm' ? 'жена' : 'муж'}</span>
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
    const byMother = new Map<string, string[]>();
    for (const e of kids) {
      const k = byId.get(e.child)!;
      const other = p.sex === 'm' ? k.mother ?? '' : k.father ?? '';
      const a = byMother.get(other) ?? [];
      if (!a.includes(e.child)) a.push(e.child);
      byMother.set(other, a);
    }
    const others = (graph.childrenOf.get(id) ?? []).filter((e) => e.kind.startsWith('other'));
    // внуки и правнуки — по прямым связям отец/мать (переход к Давиду из карточки Руфи — «правнук»)
    const kidIds = (x: string) => (graph.childrenOf.get(x) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
    const nextGen = (ids: string[]) => [...new Set(ids.flatMap(kidIds))];
    const grand = nextGen([...new Set(kids.map((e) => e.child))]);
    const great = nextGen(grand);
    const genRow = (label: string, ids: string[]) =>
      ids.length ? (
        <p key={label}>
          <span class="muted">{label}: </span>
          {ids.slice(0, 16).map((k, i) => (
            <span key={k}>
              {i ? ', ' : ''}
              <P id={k} />
            </span>
          ))}
          {ids.length > 16 ? <span class="muted"> и ещё {ids.length - 16}</span> : null}
        </p>
      ) : null;
    put(
      10,
      (kids.length || others.length || card?.childrenNote?.length) && (
        <>
          {[...byMother].map(([other, list]) => (
            <p key={other}>
              {other ? (
                <>
                  <span class="muted">{p.sex === 'm' ? 'от ' : 'от '}</span>
                  <P id={other} />:{' '}
                </>
              ) : null}
              {list
                .sort((a, b) => (byId.get(a)!.order ?? 99) - (byId.get(b)!.order ?? 99))
                .map((k, i) => (
                  <span key={k}>
                    {i ? ', ' : ''}
                    <P id={k} />
                  </span>
                ))}
            </p>
          ))}
          {others.length ? (
            <p class="muted">
              По иному указанию:{' '}
              {others.map((e, i) => (
                <span key={e.child}>
                  {i ? ', ' : ''}
                  <P id={e.child} /> ({OTHER_KIND[e.claim]?.toLowerCase() ?? e.claim})
                </span>
              ))}
            </p>
          ) : null}
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
    put(
      11,
      (sib.length || card?.siblingsNote?.length) && (
        <>
          {sib.length ? (
            <p>
              {sib.map((s, i) => (
                <span key={s.id}>
                  {i ? ', ' : ''}
                  <P id={s.id} />
                  {s.kind !== 'full' && <span class="muted"> ({s.kind === 'paternal' ? 'единокровн.' : 'единоутробн.'})</span>}
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
    const kin = graph.kinOf.get(id) ?? [];
    put(
      12,
      (kin.length || card?.kinNote?.length) && (
        <>
          <ul>
            {kin.map((k, i) => (
              <li class="fact" key={i}>
                {k.from === id ? (
                  <>
                    {cap(k.rel)}: <P id={k.to} />
                  </>
                ) : (
                  <>
                    <P id={k.from} /> — {k.rel}
                  </>
                )}
                <Refs refs={k.refs} owner={ns + `k12.${i}`} />
                <Mark cert={k.cert} />
                <VerseInsert owner={ns + `k12.${i}`} refs={k.refs} />
              </li>
            ))}
          </ul>
          {facts(card?.kinNote, 'n12')}
        </>
      ),
    );
  }
  // 13 — эпоха и относительная хронология
  if (c) put(13, <RelativeChrono id={id} m={m} note={card?.chronoNote} />);
  // 14 — современники
  if (c && c.cls !== 'epochal') {
    const res = asResult(m);
    const con = contemporaries(res, id, 16).filter((x) => byId.get(x.id)!.magnitude <= 4);
    put(
      14,
      (con.length || card?.met?.length) && (
        <>
          {card?.met?.length ? (
            <ul>
              {card.met.map((mt, i) => (
                <li class="fact" key={i}>
                  Встреча с <P id={mt.id} />
                  {mt.text ? `: ${mt.text}` : ''}
                  <Refs refs={mt.refs} owner={ns + `m14.${i}`} />
                  <VerseInsert owner={ns + `m14.${i}`} refs={mt.refs} />
                </li>
              ))}
            </ul>
          ) : null}
          {con.length ? (
            <p>
              <span class="muted">По расчёту жили в одно время: </span>
              {con.map((x, i) => (
                <span key={x.id}>
                  {i ? ', ' : ''}
                  <P id={x.id} />
                  {!x.sure && <span class="muted"> (вероятно)</span>}
                </span>
              ))}
              <abbr class="mark" title="по годам, рассчитанным хронологическим движком">расч.</abbr>
            </p>
          ) : null}
        </>
      ),
    );
  }
  if (card) {
    put(
      15,
      (card.places?.length || card.birth?.place || card.death?.place) && (
        <ul>
          {card.birth?.place && <li>{card.birth.place} <span class="muted">— место рождения, см. 8</span></li>}
          {card.places?.map((pl, i) => (
            <li class="fact" key={i}>
              {pl.name} <span class="muted">— {PLACE_ROLE[pl.role]}</span>
              {pl.note ? <span class="muted">. {pl.note}</span> : null}
              <Refs refs={pl.refs} owner={ns + `p15.${i}`} />
              <VerseInsert owner={ns + `p15.${i}`} refs={pl.refs} />
            </li>
          ))}
          {card.death?.place && <li>{card.death.place} <span class="muted">— место смерти, см. 20</span></li>}
        </ul>
      ),
    );
    put(
      16,
      (card.offices?.length || p.reign.length) && (
        <ul>
          {p.reign.map((r, i) => (
            <li class="fact" key={`r${i}`}>
              Царствовал над {r.over}: {formatSpan(r.start <= 0 ? r.start + 1 : r.start, r.end <= 0 ? r.end + 1 : r.end, false)}
              {r.years ? `, ${yearsWord(r.years)} по тексту` : ''}
              <abbr class="mark" title="годы по реконструкции Тиле — Янга; числа текста — отдельно">расч.</abbr>
            </li>
          ))}
          {card.offices?.map((o, i) => (
            <li class="fact" key={i}>
              {o.title}
              {o.note ? <span class="muted">. {o.note}</span> : null}
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
    if (c?.d !== null && c?.d !== undefined && c.cls !== 'epochal') bits.push(<p class="fact" key="y">{deathLine(c.b, c.d, c.cls)}<Mark calc={c.cls !== 'exact'} /></p>);
    if (card?.death?.place) bits.push(<p key="pl">Место: {card.death.place}</p>);
    put(20, (bits.length || card?.death?.facts?.length || card?.death?.burial?.length) && (<>{bits}{facts(card?.death?.facts, 'd20')}{card?.death?.burial?.length ? <><p class="muted">Погребение:</p>{facts(card.death.burial, 'u20')}</> : null}</>));
  }
  // 21 — линии Мессии
  {
    const j = lineMembership.joseph.get(id);
    const mm = lineMembership.mary.get(id);
    put(
      21,
      (j || mm || card?.messiahNote?.length) && (
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
  put(23, Object.keys(p.books).length ? <CanonStrip books={p.books} first={card?.scripture?.first} keyRefs={card?.scripture?.key} /> : null);
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

const ALT_KIND: Record<string, string> = { variant: 'иная форма', renamed: 'новое имя', title: 'титул', epithet: 'прозвание', foreign: 'иноязычное имя', patronymic: 'по отцу' };
const OTHER_KIND: Record<string, string> = {
  legal: 'Законный', adoptive: 'Приёмный', 'by-luke': 'По Луке', ancestor: 'Предок', levirate: 'По закону ужичества', alternative: 'По другому месту Писания',
};
const PLACE_ROLE: Record<string, string> = { birth: 'рождение', residence: 'жительство', travel: 'путь', death: 'смерть', burial: 'погребение', other: 'связано с лицом' };
const NOTE_KIND: Record<string, string> = { textual: 'Текст', interpretation: 'Толкование', identification: 'Отождествление', chronology: 'Хронология', bracket: 'Скобки Синодального текста' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function birthLine(b: number, lo: number, hi: number, cls: string): string {
  if (cls === 'exact') return `${formatYear(b)}`;
  if (cls === 'calculated') return `ок. ${formatYear(b).replace(/^ок\.\s/, '')}`;
  const span = Math.round(hi - lo);
  return `ок. ${formatYear(b)}; возможный промежуток — ${formatSpan(lo, hi)} (${yearsWord(span)})`;
}
function deathLine(b: number, d: number, cls: string): string {
  const age = Math.round(d - b);
  return `${cls === 'exact' ? '' : 'ок. '}${formatYear(d)}, в возрасте ${yearsWord(age)}`;
}

export function Masthead({ id }: { id: string }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const ep = c ? model.value.epochs.find((e) => e.id === (p.epoch ?? c.epoch)) : null;
  const j = lineMembership.joseph.has(id);
  const mm = lineMembership.mary.has(id);
  return (
    <header class="mast">
      <h2 id={`title-${id}`} tabIndex={-1}>{p.name}</h2>
      {p.disambig ? <div class="dis">{p.disambig}</div> : <div class="dis">&nbsp;</div>}
      <dl class="passport">
        {p.roles.length ? (
          <>
            <dt>Роль</dt>
            <dd>{roleText(p.roles, p.sex)}</dd>
          </>
        ) : null}
        <dt>Род</dt>
        <dd>{groupById.get(p.group)?.name}</dd>
        <dt>Эпоха</dt>
        <dd>{ep?.name ?? '—'}</dd>
        <dt>Годы</dt>
        <dd>{lifeText(id) || '—'}</dd>
      </dl>
      <LifeBar id={id} />
      {(j || mm) && (
        <div class="lines">
          {j && (
            <span>
              <span class="swatch gold" />
              линия Иосифа{' '}
            </span>
          )}
          {mm && (
            <span>
              <span class="swatch azure" />
              линия по Луке
            </span>
          )}
        </div>
      )}
    </header>
  );
}

/** Мини-шкала жизни на фоне эпохи: ядро — надёжная часть, края — неопределённость. */
function LifeBar({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const c = model.value.chrono.get(id);
    if (!cv || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = 52;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const col = (n: string) => cs.getPropertyValue(n).trim();
    const sans = cs.getPropertyValue('--sans').trim() || 'sans-serif';
    const end = c.d ?? c.dEst;
    const span = Math.max(80, end - c.bLo);
    const t0 = c.bLo - span * 0.3;
    const t1 = end + span * 0.3;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
    // эпохи — полосой с названиями
    ctx.font = `400 11px ${sans}`;
    ctx.textBaseline = 'alphabetic';
    model.value.epochs.forEach((e, i) => {
      const a = Math.max(0, x(toAstroYear(e.start)));
      const b = Math.min(w, x(toAstroYear(e.end)));
      if (b <= a) return;
      ctx.fillStyle = i % 2 ? col('--sky-band') : col('--sheet-2');
      ctx.fillRect(a, 0, b - a, 16);
      const tw = ctx.measureText(e.name).width;
      if (b - a > tw + 10) {
        ctx.fillStyle = col('--ink-3');
        ctx.fillText(e.name, a + 5, 12);
      }
    });
    // жизнь: размытое начало, сплошная часть, предполагаемый конец пунктиром
    const ink = col('--ink');
    const g = ctx.createLinearGradient(x(c.bLo), 0, x(c.bHi), 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, ink);
    ctx.fillStyle = c.cls === 'exact' ? ink : g;
    ctx.fillRect(x(c.bLo), 21, Math.max(2, x(c.bHi) - x(c.bLo)), 4);
    ctx.fillStyle = ink;
    const solidEnd = c.d ?? c.last ?? c.bHi;
    ctx.fillRect(x(c.bHi), 21, Math.max(2, x(solidEnd) - x(c.bHi)), 4);
    if (c.d === null) {
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(solidEnd), 23);
      ctx.lineTo(x(c.dEst), 23);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // рождения родителей (полые) и детей (сплошные) — риски под полосой
    const p = byId.get(id)!;
    ctx.strokeStyle = col('--ink-3');
    ctx.lineWidth = 1;
    for (const par of [p.father, p.mother]) {
      const pc = par ? model.value.chrono.get(par) : null;
      if (!pc) continue;
      ctx.beginPath();
      ctx.arc(x(pc.b), 31, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col('--ink-2');
    for (const e of graph.childrenOf.get(id) ?? []) {
      const kc = model.value.chrono.get(e.child);
      if (kc) ctx.fillRect(x(kc.b) - 0.5, 28, 1, 6);
    }
    // годы на концах
    ctx.font = `400 11.5px ${sans}`;
    ctx.fillStyle = col('--ink-2');
    const hb = toHist(c.b);
    const he = toHist(end);
    const era = he < 0 ? ' до Р. Х.' : hb < 0 ? ' по Р. Х.' : '';
    const left = `${c.cls === 'exact' ? '' : 'ок. '}${Math.abs(hb)}${hb < 0 && he > 0 ? ' до Р. Х.' : ''}`;
    const right = `${c.d === null ? 'ок. ' : ''}${Math.abs(he)}${era}`;
    const lw = ctx.measureText(left).width;
    const rw = ctx.measureText(right).width;
    const lx = Math.max(0, Math.min(w - lw, x(c.b) - lw / 2));
    const rx = Math.max(0, Math.min(w - rw, x(end) - rw / 2));
    if (lx + lw + 8 < rx) ctx.fillText(left, lx, 48);
    ctx.fillText(right, rx, 48);
  }, [id, model.value]);
  return <canvas class="lifebar" ref={ref} style={{ width: '100%', height: '52px' }} aria-hidden="true" />;
}

/** Годы эпох в данных исторические; шкала полосы — астрономическая. */
const toAstroYear = (hist: number) => (hist < 0 ? hist + 1 : hist);

function Events({ events }: { events: NonNullable<Card['events']> }) {
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, 8);
  return (
    <>
      <ul>
        {shown.map((e, i) => (
          <li class="fact" key={i}>
            {e.age !== undefined ? <span class="muted">{yearsWord(e.age)}. </span> : e.year !== undefined ? <span class="muted">{formatYear(e.year <= 0 ? e.year + 1 : e.year, { approx: true })}. </span> : null}
            {e.text}
            <Refs refs={e.refs} owner={`e17.${i}`} />
            <Mark cert={e.cert} />
            <VerseInsert owner={`e17.${i}`} refs={e.refs} />
          </li>
        ))}
      </ul>
      {!all && events.length > 8 && (
        <button class="more" onClick={() => setAll(true)}>
          ещё {events.length - 8} {plural(events.length - 8, 'событие', 'события', 'событий')}
        </button>
      )}
    </>
  );
}

/** Полоса 66 книг в синодальном порядке, тон — число упоминаний лица. */
function CanonStrip({ books: counts, first, keyRefs }: { books: Record<string, number>; first?: string; keyRefs?: string[] }) {
  const max = Math.max(1, ...Object.values(counts));
  const ot = books.filter((b) => b.t === 'ot');
  const nt = books.filter((b) => b.t === 'nt');
  const cell = (b: (typeof books)[number]) => {
    const n = counts[b.code] ?? 0;
    const a = n ? 0.25 + 0.75 * Math.sqrt(n / max) : 0;
    return <span key={b.code} title={`${b.name}${n ? `: ${n}` : ''}`} style={n ? { background: `color-mix(in srgb, var(--ink) ${Math.round(a * 100)}%, var(--sheet-2))` } : undefined} />;
  };
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <>
      <div class="canon" aria-label="Упоминания по книгам Писания">
        {ot.map(cell)}
        <span class="gapc" />
        {nt.map(cell)}
      </div>
      <p class="muted" style={{ fontSize: '13px' }}>
        Ветхий Завет — первые 39 клеток, Новый — 27.{' '}
        {top.map(([code, n], i) => `${i ? '; ' : 'Чаще всего: '}${books.find((b) => b.code === code)?.name} (${n})`).join('')}
      </p>
      {first && (
        <p class="fact">
          Первое упоминание: <Refs refs={[first]} owner="f23" />
          <VerseInsert owner="f23" refs={[first]} />
        </p>
      )}
      {keyRefs?.length ? (
        <p class="fact">
          Ключевые места: <Refs refs={keyRefs} owner="k23" />
          <VerseInsert owner="k23" refs={keyRefs} />
        </p>
      ) : null}
    </>
  );
}

/** § 13: эпоха, словесная формула относительной хронологии, напряжения. */
function RelativeChrono({ id, m, note }: { id: string; m: ModelData; note?: Fact[] }) {
  const p = byId.get(id)!;
  const c = m.chrono.get(id)!;
  const ep = model.value.epochs.find((e) => e.id === (p.epoch ?? c.epoch));
  const dated = (x: string) => {
    const cc = m.chrono.get(x);
    return !!cc && (cc.cls === 'exact' || cc.cls === 'calculated');
  };
  // ближайшие надёжно датированные родственники (до 3 шагов по родству)
  const near = new Set<string>();
  const frontier = [id];
  for (let depth = 0; depth < 3; depth++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const e of graph.parentsOf.get(x) ?? []) next.push(e.parent);
      for (const e of graph.childrenOf.get(x) ?? []) next.push(e.child);
      for (const s of graph.spousesOf.get(x) ?? []) next.push(s.a === x ? s.b : s.a);
    }
    for (const n of next) if (n !== id && !near.has(n)) near.add(n);
    frontier.splice(0, frontier.length, ...next);
  }
  const datedNear = [...near].filter(dated);
  const bornAfter = datedNear.filter((x) => m.chrono.get(x)!.b < c.bLo).sort((a, b) => m.chrono.get(b)!.b - m.chrono.get(a)!.b)[0];
  const bornBefore = datedNear.filter((x) => m.chrono.get(x)!.b > c.bHi).sort((a, b) => m.chrono.get(a)!.b - m.chrono.get(b)!.b)[0];
  const aliveDuring = datedNear.filter((x) => {
    const o = m.chrono.get(x)!;
    const oe = o.d ?? o.last;
    return oe !== null && o.b < c.bLo && oe > (c.last ?? c.bHi);
  })[0];
  const tensions = m.tensions.filter((t) => t.persons.includes(id));
  // если надёжно датированных родственников нет — порядок по прямому родству: родитель раньше, ребёнок позже
  const kinOrder = !bornAfter && !bornBefore;
  const parentLink = kinOrder ? (graph.parentsOf.get(id) ?? []).find((e) => e.kind === 'father' || e.kind === 'mother') : undefined;
  const childLink = kinOrder
    ? [...(graph.childrenOf.get(id) ?? [])].filter((e) => e.kind === 'father' || e.kind === 'mother').sort((a, b) => (byId.get(a.child)!.order ?? 99) - (byId.get(b.child)!.order ?? 99))[0]
    : undefined;
  const kinWord = (x: string, up: boolean) => {
    const f = byId.get(x)!.sex === 'f';
    return up ? (f ? 'мать' : 'отец') : f ? 'дочь' : 'сын';
  };
  return (
    <>
      <p>
        Эпоха: {ep?.name ?? '—'}
        {ep ? <span class="muted"> ({formatSpan(ep.start < 0 ? ep.start + 1 : ep.start, ep.end < 0 ? ep.end + 1 : ep.end, ep.id === 'judges')})</span> : null}.
      </p>
      {(bornAfter || bornBefore || aliveDuring) && (
        <p>
          {bornAfter && (
            <>
              Родился после рождения <P id={bornAfter} />
            </>
          )}
          {bornAfter && bornBefore ? ' и ' : ''}
          {bornBefore && (
            <>
              {bornAfter ? 'до' : 'Родился до'} рождения <P id={bornBefore} />
            </>
          )}
          {aliveDuring && (
            <>
              {bornAfter || bornBefore ? '; ' : ''}жил при жизни <P id={aliveDuring} />
            </>
          )}
          .
          <abbr class="mark" title="по годам, рассчитанным хронологическим движком">расч.</abbr>
        </p>
      )}
      {(parentLink || childLink) && (
        <p>
          По родству:{' '}
          {parentLink && (
            <>
              после <P id={parentLink.parent} /> ({kinWord(parentLink.parent, true)})
            </>
          )}
          {parentLink && childLink ? ', ' : ''}
          {childLink && (
            <>
              до <P id={childLink.child} /> ({kinWord(childLink.child, false)})
            </>
          )}
          .
          <Refs refs={[...(parentLink?.refs ?? []), ...(childLink?.refs ?? [])].filter((r, i, a) => a.indexOf(r) === i).slice(0, 3)} owner="kin13" />
          <abbr class="mark" title="вывод: родитель рождается раньше ребёнка">выв.</abbr>
        </p>
      )}
      {c.cls === 'estimated' && <p class="muted">Год оценён по родству: в среднем по длине поколения своей эпохи между надёжно датированными предками и потомками.</p>}
      {c.cls === 'epochal' && <p class="muted">Писание не даёт опор для расчёта года: известна только эпоха.</p>}
      {tensions.map((t, i) => (
        <div class="tension" key={i}>
          <b>Хронологическое напряжение.</b> {t.text}
          <Refs refs={t.refs.slice(0, 4)} owner={`t13.${i}`} />
          <VerseInsert owner={`t13.${i}`} refs={t.refs.slice(0, 4)} />
        </div>
      ))}
      {note?.map((f, i) => (
        <p class="fact" key={`n${i}`}>
          {f.text}
          <Refs refs={f.refs} owner={`c13.${i}`} />
          <VerseInsert owner={`c13.${i}`} refs={f.refs} />
        </p>
      ))}
      <p class="muted" style={{ fontSize: '13px' }}>
        Рождение: {toHist(c.b) < 0 ? `${-toHist(c.b)} г. до Р. Х.` : `${toHist(c.b)} г. по Р. Х.`} ({c.cls === 'exact' ? 'по числам Писания' : c.cls === 'calculated' ? 'по реконструкции' : c.cls === 'estimated' ? 'оценка' : 'эпоха'}).
      </p>
    </>
  );
}

export { refLabel };
