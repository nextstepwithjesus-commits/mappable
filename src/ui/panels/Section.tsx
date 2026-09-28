import { useEffect, useState } from 'preact/hooks';
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
export const SETS: { id: string; name: string; kings?: boolean; ids: () => string[] }[] = [
  {
    id: 'judah',
    name: 'Цари Иудеи',
    kings: true,
    ids: () =>
      persons
        .filter((p) => p.reign.some((r) => /Иуд/.test(r.over)))
        .sort((a, b) => a.reign[0].start - b.reign[0].start)
        .map((p) => p.id),
  },
  {
    id: 'israel',
    name: 'Цари Израиля',
    kings: true,
    ids: () =>
      persons
        .filter((p) => p.reign.some((r) => /Израил/.test(r.over)) && p.group === 'israel-kings')
        .sort((a, b) => a.reign[0].start - b.reign[0].start)
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
function ReignLine({ r, owner }: { r: ReignLike; owner: string }) {
  const refs = r.refs ?? [];
  return (
    <span class="line">
      {typo(reignOverLine(r))}
      <Refs refs={refs} owner={owner} tail=";" />
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
export function deathAge(ch: Chrono | null): { age: number; cert: 'scripture' | 'inference'; refs: string[] } | null {
  if (!ch) return null;
  if (ch.died?.age) return { age: ch.died.age, cert: ch.died.cert === 'inference' ? 'inference' : 'scripture', refs: ch.died.refs ?? [] };
  const rs = ch.reign ?? [];
  if (!rs.length || rs[0].ageAtStart === undefined || rs.some((r) => !r.years)) return null;
  return { age: rs[0].ageAtStart + rs.reduce((s, r) => s + (r.years ?? 0), 0), cert: 'inference', refs: rs.flatMap((r) => r.refs) };
}

/** Таблица § 20 «Смерть и погребение» по группе (CARD-42): годы, возраст при смерти, место, погребение, стихи. */
function DeathTable({ ids, cards, kings }: { ids: string[]; cards: Record<string, Loaded>; kings: boolean }) {
  // «Место смерти» — из § 20 (death.place); если его нет ни у кого в группе, столбец не обещает сведений (CARD-51)
  const place = ids.some((id) => !!cards[id]?.card.death?.place);
  const cols = place ? 6 : 5;
  return (
    <div class="xwrap">
      <table class="xtable">
        <thead>
          <tr>
            <th scope="col">{kings ? 'Царь' : 'Лицо'}</th>
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
                      reigns.map((r, i) => <ReignLine key={i} r={r} owner={`${own}r${i}`} />)
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
                      <span class="none">—</span>
                    )}
                  </div>
                </td>,
                place && (
                  <td key="p" data-label="Место смерти">
                    <div class="v">{death?.place ? typo(death.place) : <span class="none">—</span>}</div>
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
                      <span class="none">—</span>
                    )}
                  </div>
                </td>,
                <td key="r" data-label="Стихи">
                  <div class="v">{refs.length ? <Refs refs={refs} owner={own} /> : <span class="none">—</span>}</div>
                </td>,
              );
            }
            return [
              <tr key={id}>{row}</tr>,
              <tr key={`${id}-v`} class="verse-row">
                <td colspan={cols}>
                  <VerseInsert owner={own} refs={refs} />
                  {byReign && d ? reigns.map((r, i) => <VerseInsert key={i} owner={`${own}r${i}`} refs={(r as ReignLike).refs ?? []} />) : null}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
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
        <div class="xbody">{body}</div>
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

/** Сведения раздела, стоящие в шапке карточки: § 1 — имя, § 5 — роль, § 7 — колено или народ. */
function headerText(id: string, n: number): string | null {
  const p = byId.get(id)!;
  if (n === 1) return p.disambig ? `${p.name}, ${p.disambig}` : p.name;
  if (n === 5) return p.roles.length ? capFirst(roleText(p.roles, p.sex)) : null;
  if (n === 7) return affiliation(id)?.text ?? null;
  return null;
}
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
