import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, lines, persons, loadCard } from '../../data/atlas.ts';
import { batch } from '@preact/signals';
import { sectionFocus, selected, model, panel } from '../../state.ts';
import { P, Refs, VerseInsert, Mark, plural, roleText } from '../common.tsx';
import { SECTIONS, buildSections, sectionStates } from '../Folio.tsx';
import { affiliation, reignOverLine, reignSpan, type ReignLike } from '../card/shared.tsx';
import type { Card, Chrono } from '../../data/types.ts';
import { yearsWord } from '../../engine/years.ts';
import { lifeText } from '../sky/text.ts';
import { typo } from '../text/typo.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { Menu, Segmented } from '../controls.tsx';

// ---------- сквозной раздел (G4; ТЗ § 3.3; CARD-42) ----------

/** Царствования лица по порядку. */
const byReign = (a: { reign: { start: number }[] }, b: { reign: { start: number }[] }) => a.reign[0].start - b.reign[0].start;
/**
 * Три группы царей (этап 13, решение 110; X4 Д3) — одни имена в ярусах эпох, созвездиях и здесь; каждый царь — ровно
 * в одной группе:
 *  — «Цари единого царства» — Саул, Иевосфей, Давид, Соломон: царствование над (всем) Израилем или в Хевроне до
 *    разделения, не в созвездии северных царей;
 *  — «Цари Иудеи» — от Ровоама: царствование над Иудеей;
 *  — «Цари Израиля (северного)» — созвездие северных царей.
 * Авимелех, сын Гедеона («Сихем и Израиль», Суд 9:22), — не царь этих царств и ни в одну группу не входит.
 */
export const KING_SETS = {
  united: 'Цари единого царства',
  judah: 'Цари Иудеи',
  israel: 'Цари Израиля (северного)',
} as const;
const united = (over: string) => /^(весь )?Израиль$/.test(over) || /^Иудея \(в Хевроне\)$/.test(over);
export const SETS: { id: string; name: string; kings?: boolean; ids: () => string[] }[] = [
  {
    id: 'united',
    name: KING_SETS.united,
    kings: true,
    ids: () =>
      persons
        .filter((p) => p.group !== 'israel-kings' && p.reign.some((r) => united(r.over)))
        .sort(byReign)
        .map((p) => p.id),
  },
  {
    id: 'judah',
    name: KING_SETS.judah,
    kings: true,
    ids: () =>
      persons
        .filter((p) => p.reign.some((r) => r.over === 'Иудея'))
        .sort(byReign)
        .map((p) => p.id),
  },
  {
    id: 'israel',
    name: KING_SETS.israel,
    kings: true,
    ids: () =>
      persons
        .filter((p) => p.reign.some((r) => /Израил/.test(r.over)) && p.group === 'israel-kings')
        .sort(byReign)
        .map((p) => p.id),
  },
  { id: 'joseph', name: 'Линия Иосифа', ids: () => lines.joseph.persons.map((p) => p.id) },
  { id: 'mary', name: 'Линия по Луке', ids: () => lines.mary.persons.map((p) => p.id) },
  { id: 'judges', name: 'Судьи', ids: () => persons.filter((p) => p.roles.includes('judge')).map((p) => p.id) },
  { id: 'prophets', name: 'Пророки', ids: () => persons.filter((p) => p.roles.includes('prophet')).map((p) => p.id) },
  { id: 'patriarchs', name: 'Праотцы', ids: () => persons.filter((p) => p.roles.includes('patriarch')).map((p) => p.id) },
  { id: 'apostles', name: 'Апостолы', ids: () => persons.filter((p) => p.roles.includes('apostle')).map((p) => p.id) },
];

type Loaded = { card: Card; chrono: Chrono | null };

/**
 * «Этот раздел у группы…» — номер раздела в карточке (G4): открыть «Сквозной раздел» на разделе n; группа — та,
 * в которой есть лицо карточки (если запомненная его не содержит).
 */
export function openSection(n: number) {
  batch(() => {
    sectionFocus.value = n;
    panel.value = 'section';
  });
}

/**
 * Строка царствования (CARD-51) — те же слова, что § 16 карточки (shared.tsx): «семь лет и шесть месяцев над Иудеей,
 * в Хевроне (2 Цар 5:4–5); 1010–1003 гг. до Р. Х. — расч.». Срок и царство — по тексту, годы — по реконструкции.
 */
function ReignLine({ r, owner, brief = false }: { r: ReignLike; owner: string; brief?: boolean }) {
  const refs = brief ? [] : (r.refs ?? []);
  return (
    <span class="line">
      {typo(reignOverLine(r))}
      {refs.length ? <Refs refs={refs} owner={owner} tail=";" /> : null}
      {refs.length ? ' ' : '; '}
      {typo(reignSpan(r))}
      <Mark calc />
    </span>
  );
}

/**
 * Возраст при смерти для § 20: названный в данных (с его уровнем достоверности) или сложенный из возраста при воцарении
 * и лет царствования (вывод из стихов этих чисел). Иначе — null: возраст не выдумывается.
 */
export function deathAge(ch: Chrono | null): { age: number; cert: 'scripture' | 'inference'; refs: string[]; basis: string } | null {
  if (!ch) return null;
  if (ch.died?.age)
    return {
      age: ch.died.age,
      cert: ch.died.cert === 'inference' ? 'inference' : 'scripture',
      refs: ch.died.refs ?? [],
      basis: ch.died.cert === 'inference' ? 'возраст при смерти — вывод из стихов' : 'возраст при смерти назван в Писании',
    };
  const rs = ch.reign ?? [];
  if (!rs.length || rs[0].ageAtStart === undefined || rs.some((r) => !r.years)) return null;
  const years = rs.reduce((s, r) => s + (r.years ?? 0), 0);
  return {
    age: rs[0].ageAtStart + years,
    cert: 'inference',
    refs: rs.flatMap((r) => r.refs),
    // основание сложения (решение 125): «при воцарении 25 лет, царствовал 29 лет»
    basis: `при воцарении ${yearsWord(rs[0].ageAtStart)}, царствовал${rs.length > 1 ? ' всего' : ''} ${yearsWord(years)}`,
  };
}

/**
 * Пустая ячейка таблицы (этап 13, решение 112; X4 Д11) — три разных знака вместо одного прочерка: раздел составлен,
 * а сведения нет — «не сообщается» (Писание молчит, решение 6); раздел не составлен — «не составлено» (решение 64);
 * число не вычислено — «—». Пояснение — строкой под таблицей.
 */
function Empty({ why }: { why: 'silent' | 'draft' | 'none' }) {
  if (why === 'silent') return <span class="none">не сообщается</span>;
  if (why === 'draft') return <span class="none draft">не составлено</span>;
  return (
    <span class="none" title="не вычислено">
      —
    </span>
  );
}

/** «5 стихов», «1 стих»: надпись раскрытия основания в строке таблицы. */
const versesN = (n: number) => `${n} ${plural(n, 'стих', 'стиха', 'стихов')}`;

/**
 * Таблица § 20 «Смерть и погребение» по группе (CARD-42): годы, возраст при смерти, место, погребение, стихи.
 * Два уровня чтения (этап 13, решение 125; UI-19): в строке — краткое сравнимое значение (срок и годы правления, возраст,
 * место, погребение); основание — стихи царствования, как сложен возраст, стихи смерти и погребения — раскрывается
 * в самой строке командой «N стихов» в столбце «Стихи».
 */
function DeathTable({ ids, cards, kings }: { ids: string[]; cards: Record<string, Loaded>; kings: boolean }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])));
  // «Место смерти» — из § 20 (death.place); если его нет ни у кого в группе, столбец не обещает сведений (CARD-51)
  const place = ids.some((id) => !!cards[id]?.card.death?.place);
  const cols = place ? 6 : 5;
  // в группе есть царица (Гофолия) — столбец «Царь, царица»
  const queen = kings && ids.some((id) => byId.get(id)?.sex === 'f');
  return (
    <div class="xwrap">
      <table class="xtable">
        <thead>
          <tr>
            <th scope="col">{kings ? (queen ? 'Царь, царица' : 'Царь') : 'Лицо'}</th>
            <th scope="col">{kings ? 'Годы правления' : 'Годы жизни'}</th>
            <th scope="col">Возраст при смерти</th>
            {place && <th scope="col">Место смерти</th>}
            <th scope="col">Погребение</th>
            <th scope="col">Стихи</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const p = byId.get(id)!;
            const d = cards[id];
            const death = d?.card.death;
            const own = `x20${id}`;
            const age = deathAge(d?.chrono ?? null);
            // стихи смерти, погребения и чисел возраста (возраст при воцарении, годы царствования)
            const refs = [...new Set([...(death?.facts ?? []).flatMap((f) => f.refs ?? []), ...(death?.burial ?? []).flatMap((f) => f.refs ?? []), ...(age?.refs ?? [])])];
            const silent = p.silent.includes(20);
            // § 20 составлен (есть запись о смерти) — чего в нём нет, о том Писание не сообщает; иначе — не составлено
            const miss: 'silent' | 'draft' = death ? 'silent' : 'draft';
            const reigns = d?.chrono?.reign?.length ? d.chrono.reign : p.reign;
            const byReign = kings && reigns.length > 0;
            const row: ComponentChildren[] = [
              <th scope="row" key="n">
                <P id={id} />
                {p.disambig ? <span class="ds">{typo(p.disambig)}</span> : null}
              </th>,
            ];
            if (!d) {
              row.push(
                <td key="l" colspan={cols - 1} class="muted">
                  …
                </td>,
              );
            } else if (silent && !death) {
              row.push(
                <td key="s" colspan={cols - 1} class="none" data-label="">
                  в Писании не сообщается
                </td>,
              );
            } else {
              row.push(
                <td key="y" data-label={kings ? 'Годы правления' : 'Годы жизни'}>
                  <div class="v">
                    {byReign ? (
                      reigns.map((r, i) => <ReignLine key={i} r={r} owner={`${own}r${i}`} brief />)
                    ) : (
                      <span class="line">{typo(lifeText(id))}</span>
                    )}
                  </div>
                </td>,
                <td key="a" data-label="Возраст при смерти" class="num">
                  <div class="v">
                    {age ? (
                      <>
                        {typo(yearsWord(age.age))}
                        <Mark cert={age.cert} />
                      </>
                    ) : (
                      <Empty why="none" />
                    )}
                  </div>
                </td>,
                place && (
                  <td key="p" data-label="Место смерти">
                    <div class="v">{death?.place ? typo(death.place) : <Empty why={miss} />}</div>
                  </td>
                ),
                <td key="b" data-label="Погребение">
                  <div class="v">
                    {death?.burial?.length ? (
                      death.burial.map((f, i) => (
                        <span class="line" key={i}>
                          {typo(f.text)}
                        </span>
                      ))
                    ) : (
                      <Empty why={miss} />
                    )}
                  </div>
                </td>,
                <td key="r" data-label="Стихи">
                  <div class="v">
                    {refs.length ? (
                      <button type="button" class="why xopen" aria-expanded={open.has(id)} aria-controls={`${own}-basis`} onClick={() => toggle(id)}>
                        {versesN(refs.length)}
                      </button>
                    ) : (
                      <Empty why="none" />
                    )}
                  </div>
                </td>,
              );
            }
            const shown = open.has(id) && !!d;
            const deathRefs = [...new Set([...(death?.facts ?? []).flatMap((f) => f.refs ?? []), ...(death?.burial ?? []).flatMap((f) => f.refs ?? [])])];
            return [
              <tr key={id} class={shown ? 'open' : undefined}>
                {row}
              </tr>,
              // основание строки (решение 125): стихи царствования, как сложен возраст, стихи смерти и погребения
              shown ? (
                <tr key={`${id}-b`} class="basis-row" id={`${own}-basis`}>
                  <td colspan={cols}>
                    {byReign &&
                      reigns.map((r, i) => (
                        <p key={i} class="xbasis">
                          <span class="k">{i === 0 ? 'Царствование: ' : ''}</span>
                          <ReignLine r={r} owner={`${own}r${i}`} />
                        </p>
                      ))}
                    {age ? (
                      <p class="xbasis">
                        <span class="k">Возраст при смерти: </span>
                        {typo(`${yearsWord(age.age)} — ${age.basis}`)}
                        <Mark cert={age.cert} />
                        <Refs refs={age.refs} owner={`${own}a`} />
                      </p>
                    ) : null}
                    {deathRefs.length ? (
                      <p class="xbasis">
                        <span class="k">Смерть и погребение: </span>
                        <Refs refs={deathRefs} owner={own} />
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null,
              <tr key={`${id}-v`} class="verse-row">
                <td colspan={cols}>
                  <VerseInsert owner={own} refs={deathRefs} />
                  <VerseInsert owner={`${own}a`} refs={age?.refs ?? []} />
                  {byReign && d ? reigns.map((r, i) => <VerseInsert key={i} owner={`${own}r${i}`} refs={(r as ReignLike).refs ?? []} />) : null}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <p class="muted xlegend">
        {typo('«не сообщается» — в Писании об этом не сказано; «не составлено» — раздел карточки ещё не составлен; «—» — не вычислено. «N стихов» раскрывает основание строки: стихи и как получен возраст.')}
      </p>
    </div>
  );
}

export function SectionPanel() {
  // раздел и группа помнятся (D11); раздел из карточки («этот раздел у группы…» у своего номера) важнее запомненного
  const [savedN, saveN] = useRemembered('section:n', 20);
  const focus = sectionFocus.value;
  const n = focus ?? savedN;
  const setN = (v: number) => {
    sectionFocus.value = null;
    saveN(v);
  };
  const [setId, setSetId] = useRemembered('section:set', 'judah');
  // открыто из карточки: раздел запоминается, группа — та, в которой есть лицо карточки (если запомненная его не содержит)
  useEffect(() => {
    if (focus === null) return;
    saveN(focus);
    sectionFocus.value = null;
    const id = selected.peek();
    if (!id || SETS.find((s) => s.id === setId)?.ids().includes(id)) return;
    const own = SETS.find((s) => s.ids().includes(id));
    if (own) setSetId(own.id);
  }, [focus]);
  const set = SETS.find((s) => s.id === setId) ?? SETS[0];
  const ids = set.ids().filter((id) => byId.has(id));
  const [cards, setCards] = useState<Record<string, Loaded>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => loadCard(id).then((d) => [id, { card: d?.card ?? {}, chrono: d?.chrono ?? null }] as const))).then((all) => alive && setCards(Object.fromEntries(all)));
    return () => {
      alive = false;
    };
  }, [setId]);
  const sec = SECTIONS[n - 1];
  return (
    <Sheet title="Сквозной раздел" lead="Один раздел карточки у группы лиц: например, «20. Смерть и погребение» у всех царей Иудеи.">
      {/* выбор раздела — тем же списком Menu, что модель хронологии в листе «Вид» (VIS-49): 24 пункта в две колонки,
          части I–VI разделены чертой */}
      <div class="field xpick">
        <span class="k" id="xsec-n-l">Раздел:</span>
        <Menu
          class="model xsec"
          label={typo(`${sec.n}. ${sec.title}`)}
          title="Раздел карточки"
          radio
          items={SECTIONS.map((x, i) => ({
            key: String(x.n),
            label: typo(`${x.n}. ${x.title}`),
            checked: x.n === n,
            sep: i > 0 && SECTIONS[i - 1].part !== x.part && x.n !== 13,
            onSelect: () => setN(x.n),
          }))}
        />
      </div>
      <Segmented label="Группа лиц" options={SETS.map((s) => ({ value: s.id, label: s.name }))} value={setId} onChange={setSetId} />
      <h3 class="xhead">
        {typo(`${sec.n}. ${sec.title}`)} <span class="muted">{typo(`— ${set.name}, ${ids.length} ${plural(ids.length, 'лицо', 'лица', 'лиц')}`)}</span>
      </h3>
      {n === 20 ? <DeathTable ids={ids} cards={cards} kings={!!set.kings} /> : <SectionList ids={ids} n={n} cards={cards} />}
    </Sheet>
  );
}

/**
 * Раздел у каждого лица группы — так же, как в карточке (buildSections). Лица, о которых Писание здесь молчит, —
 * одной бледной строкой (решение владельца 6); несоставленные разделы не показываются.
 */
function SectionList({ ids, n, cards }: { ids: string[]; n: number; cards: Record<string, Loaded> }) {
  const m = model.value;
  const silent: string[] = [];
  const na: string[] = [];
  let blank = 0;
  const blocks = ids.map((id) => {
    const p = byId.get(id)!;
    const d = cards[id];
    if (!d)
      return (
        <div key={id} class="xsec muted">
          <P id={id} /> …
        </div>
      );
    const out = buildSections(id, p, d.card, m, m.chrono.get(id), `x${id}:`, d.chrono);
    const st = sectionStates(id, out, d.card)[n];
    // сведения, которые карточка держит в шапке (роль, колено), в сквозном разделе показываются строкой
    const head = st === 'header' ? headerText(id, n) : null;
    const body = out.get(n) ?? (head ? <p>{typo(head)}</p> : null);
    if (!body) {
      if (st === 'silent') silent.push(id);
      else if (st === 'na') na.push(id);
      else blank++;
      return null;
    }
    return (
      <section key={id} class="xsec" aria-label={p.name}>
        <div class="xname">
          <P id={id} />
          {p.disambig ? <span class="muted">{typo(`, ${p.disambig}`)}</span> : null}
        </div>
        <BriefBody>{body}</BriefBody>
      </section>
    );
  });
  const line = (label: string, list: string[]) =>
    list.length > 0 && (
      <p class="none xsilent">
        {label}:{' '}
        {list.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <P id={id} />
          </span>
        ))}
        .
      </p>
    );
  return (
    <>
      {blocks}
      {line('В Писании не сообщается', silent)}
      {line('Не относится: лица нет в родословиях Мессии', na)}
      {blank > 0 && <p class="muted">{typo(`Ещё у ${blank} ${plural(blank, 'лица', 'лиц', 'лиц')} раздел пока не составлен.`)}</p>}
    </>
  );
}

/**
 * Раздел лица в сквозном разделе — два уровня чтения (решение 125; UI-19): сначала три строки, чтобы лица сравнивались
 * рядом; «полностью» раскрывает раздел целиком в самой строке. Короткий раздел — сразу целиком, без команды.
 */
function BriefBody({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  // высота краткого вида — до низа третьей строки-абзаца раздела (строки не режутся посередине); null — раздел короткий
  const [cut, setCut] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || full) return;
    const top = el.getBoundingClientRect().top;
    const lines = [...el.querySelectorAll<HTMLElement>('p, li')].filter((x) => !x.querySelector('p, li'));
    const third = lines[2];
    const h = third ? Math.ceil(third.getBoundingClientRect().bottom - top) : null;
    const next = h !== null && el.scrollHeight > h + 4 ? h : null;
    if (next !== cut) setCut(next);
  });
  const long = cut !== null;
  return (
    <>
      {/* фокус внутри свёрнутого раздела раскрывает его: скрытых остановок Tab нет (решение 116) */}
      <div class={full || !long ? 'xbody' : 'xbody brief'} ref={ref} style={!full && long ? { '--brief-h': `${cut}px` } : undefined} onFocusIn={() => long && !full && setFull(true)}>
        {children}
      </div>
      {(long || full) && (
        <button type="button" class="why xmore" aria-expanded={full} onClick={() => setFull(!full)}>
          {full ? 'кратко' : 'полностью'}
        </button>
      )}
    </>
  );
}

/** Сведения раздела, стоящие в шапке карточки: § 1 — имя, § 5 — роль, § 7 — колено или народ. */
function headerText(id: string, n: number): string | null {
  const p = byId.get(id)!;
  if (n === 1) return p.disambig ? `${p.name}, ${p.disambig}` : p.name;
  if (n === 5) return p.roles.length ? capFirst(roleText(p.roles, p.sex)) : null;
  if (n === 7) return affiliation(id)?.text ?? null;
  return null;
}
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
