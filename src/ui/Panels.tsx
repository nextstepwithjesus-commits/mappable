import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { anchors, byId, epochs, graph, lines, modelInfo, persons, volumes, groupById, loadCard, builtAt } from '../data/atlas.ts';
import { panel, selected, second, pickMode, model, modelId, epochMode, layers, lineFlip, sectionFocus } from '../state.ts';
import { P, Refs, VerseInsert, refLabel, skyRef, plural, renderBrackets } from './common.tsx';
import { relate } from '../engine/kinship.ts';
import { formatSpan, toAstro } from '../engine/years.ts';
import { atlasCoord } from '../render/sky.ts';
import { drawGlyph } from '../render/glyphs.ts';
import { norm } from '../engine/text.ts';
import { SearchIndex } from '../engine/search.ts';
import { SECTIONS } from './Folio.tsx';
import { kinPath, lifeText } from './SkyView.tsx';
import { Spread } from './Spread.tsx';
import type { Card } from '../data/types.ts';

function Sheet({ title, lead, wide, children }: { title: string; lead?: string; wide?: boolean; children: ComponentChildren }) {
  return (
    <section class={wide ? 'sheet wide' : 'sheet'} aria-label={title}>
      <button class="close" onClick={() => (panel.value = null)}>
        закрыть
      </button>
      <h2>{title}</h2>
      {lead && <p class="lead">{lead}</p>}
      {children}
    </section>
  );
}

export function Panels() {
  switch (panel.value) {
    case 'epochs':
      return <EpochsPanel />;
    case 'spread':
      return <Spread />;
    case 'index':
      return <IndexPanel />;
    case 'kinship':
      return <KinshipPanel />;
    case 'synopsis':
      return <SynopsisPanel />;
    case 'chapter':
      return <ChapterPanel />;
    case 'section':
      return <SectionPanel />;
    case 'legend':
      return <LegendPanel />;
    case 'about':
      return <AboutPanel />;
    default:
      return null;
  }
}

const flyToYears = (a: number, b: number) => {
  const s = skyRef.current;
  if (!s) return;
  const xa = s.xOf(a);
  const xb = s.xOf(b);
  s.cam.flyTo((xa + xb) / 2, s.cam.wLane(s.cam.h / 2), Math.max(200, (xb - xa) * 1.08), skyRef.redraw);
};

// ---------- эпохи ----------
function EpochsPanel() {
  return (
    <Sheet title="Эпохи" lead="Карта эпох — режим того же неба: сверху ярусы эпох, судей, царей Иудеи и Израиля, пророков и событий. Жизнь выбранного лица проецируется столбцом через все ярусы.">
      <div class="opts">
        <button aria-pressed={epochMode.value} onClick={() => (epochMode.value = !epochMode.value)}>
          ярусы на небе
        </button>
      </div>
      {epochs.map((e) => (
        <div key={e.id}>
          <h3>
            <button class="person" onClick={() => flyToYears(toAstro(e.start), Math.min(toAstro(e.end), 110))}>
              {e.name}
            </button>
          </h3>
          <p class="muted" style={{ margin: 0 }}>
            {formatSpan(toAstro(e.start), toAstro(e.end), ['judges', 'conquest', 'intertestamental', 'apostolic', 'church'].includes(e.id))}
          </p>
          <p style={{ margin: '4px 0' }}>{e.summary}</p>
          <p class="muted" style={{ margin: '4px 0', fontSize: '14px' }}>
            Основание: {e.basis} <Refs refs={e.refs} owner={`ep-${e.id}`} />
          </p>
          <VerseInsert owner={`ep-${e.id}`} refs={e.refs} />
          {e.keyPersons.filter((k) => byId.has(k)).length ? (
            <p style={{ margin: '4px 0', fontSize: '14.5px' }}>
              Лица:{' '}
              {e.keyPersons
                .filter((k) => byId.has(k))
                .map((k, i) => (
                  <span key={k}>
                    {i ? ', ' : ''}
                    <P id={k} />
                  </span>
                ))}
            </p>
          ) : null}
          {e.books.length ? <p class="muted" style={{ margin: '4px 0', fontSize: '14px' }}>Книги: {e.books.join('; ')}</p> : null}
        </div>
      ))}
    </Sheet>
  );
}

// ---------- указатель ----------
function IndexPanel() {
  const [letter, setLetter] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const m = model.value;
  const groups = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const p of persons) {
      if (p.unnamed) continue;
      const k = p.name;
      const a = byName.get(k) ?? [];
      a.push(p.id);
      byName.set(k, a);
    }
    return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, []);
  const letters = [...new Set(groups.map(([n]) => n[0]))];
  const f = norm(filter);
  const shown = groups.filter(([n]) => (letter ? n[0] === letter : true) && (!f || norm(n).includes(f)));
  const coord = (id: string) => {
    const n = m.nodeByPerson.get(id);
    const c = m.chrono.get(id);
    return n && c ? atlasCoord(c.b, n.lane, m.laneMax) : '';
  };
  let lastLetter = '';
  return (
    <Sheet title="Указатель" lead={`Все лица атласа (${persons.length}) по алфавиту. Число — век от начала шкалы, буква — полоса на левой кромке карты.`}>
      <div class="opts">
        <button aria-pressed={!letter} onClick={() => setLetter(null)}>
          все
        </button>
        {letters.map((l) => (
          <button key={l} aria-pressed={letter === l} onClick={() => setLetter(l)}>
            {l}
          </button>
        ))}
      </div>
      <div class="search" style={{ margin: '0 0 12px' }}>
        <label>Отобрать:</label>
        <input value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="idx">
        {shown.slice(0, letter || f ? 5000 : 900).map(([name, ids]) => {
          const head = name[0] !== lastLetter;
          lastLetter = name[0];
          return (
            <div key={name}>
              {head && <div class="head">{name[0]}</div>}
              {ids.length === 1 ? (
                <button class="row" onClick={() => { selected.value = ids[0]; skyRef.flyTo(ids[0]); }}>
                  <span>{name}</span>
                  <span class="lead-dots" />
                  <span class="coord">{coord(ids[0])}</span>
                </button>
              ) : (
                <>
                  <div class="row">
                    <span>{name}</span>
                  </div>
                  {ids.map((id) => (
                    <button class="row sub" key={id} onClick={() => { selected.value = id; skyRef.flyTo(id); }}>
                      <span>{byId.get(id)!.disambig || lifeText(id)}</span>
                      <span class="lead-dots" />
                      <span class="coord">{coord(id)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
      {!letter && !f && shown.length > 900 && <p class="muted">Показаны первые 900 имён; выберите букву, чтобы увидеть остальные.</p>}
    </Sheet>
  );
}

// ---------- родство ----------
function KinshipPanel() {
  const a = selected.value;
  const b = second.value;
  const [q, setQ] = useState('');
  const index = useMemo(() => new SearchIndex(persons.map((p) => ({ id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, refs: [] }))), []);
  const rels = a && b ? relate(graph, a, b, 6) : [];
  useEffect(() => {
    kinPath.current = rels[0] ? [...new Set(rels[0].steps.flatMap((s) => [s.from, s.to]))] : null;
    skyRef.redraw();
  }, [a, b]);
  const hits = q.trim() ? index.search(q, 8) : [];
  return (
    <Sheet title="Родство" lead="Выберите два лица: первое — в карточке или на небе, второе — здесь или щелчком по небу. Показываются все пути родства до кратчайшего + 2, с названием степени и термином Писания.">
      <p>
        Первое лицо: {a ? <P id={a} /> : <span class="muted">не выбрано</span>}
        <br />
        Второе лицо: {b ? <P id={b} /> : <span class="muted">не выбрано</span>}
      </p>
      <div class="opts">
        <button aria-pressed={pickMode.value === 'kinship'} disabled={!a} onClick={() => (pickMode.value = pickMode.value ? null : 'kinship')}>
          выбрать второе на небе
        </button>
        {b && (
          <button onClick={() => { second.value = null; kinPath.current = null; }}>
            сбросить второе
          </button>
        )}
        {a && b && <button onClick={() => (panel.value = 'spread')}>открыть разворот двух карточек</button>}
      </div>
      <div class="search" style={{ margin: '0 0 10px' }}>
        <label>Второе:</label>
        <input value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="имя" />
      </div>
      {hits.length > 0 && (
        <ul style={{ padding: 0, margin: '0 0 12px' }}>
          {hits.map((h) => (
            <li key={h.id} style={{ listStyle: 'none', margin: '2px 0' }}>
              <button class="person" onClick={() => { second.value = h.id; setQ(''); }}>
                {byId.get(h.id)!.name}
              </button>{' '}
              <span class="muted">{byId.get(h.id)!.disambig}</span>
            </li>
          ))}
        </ul>
      )}
      {a && b && !rels.length && <p class="muted">Родственной связи в данных атласа не найдено.</p>}
      {rels.map((r, i) => (
        <div class="relation" key={i}>
          <div class="sent">{r.sentence}{r.interpretive ? <span class="muted"> — по толкованию</span> : null}</div>
          {r.scriptureTerm && <div class="muted">Так в Писании: «{r.scriptureTerm}»</div>}
          {r.ancestor && <div class="muted">Общий предок: <P id={r.ancestor} />; поколений вверх — {r.up}, вниз — {r.down}</div>}
          <ul class="chain">
            {[...new Set(r.steps.flatMap((s) => [s.from, s.to]))].map((id) => (
              <li key={id}>
                <P id={id} /> <span class="muted">{lifeText(id)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}

// ---------- синопсис родословий ----------
const GEN = new Set(['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam', 'isaak', 'iakov', 'iuda', 'fares', 'esrom']);
const RUTH = new Set(['fares', 'esrom', 'aram', 'aminadav', 'naasson', 'salmon', 'vooz', 'ovid', 'iessey', 'david']);
const CHR = new Set([
  'adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam', 'isaak', 'iakov',
  'iuda', 'fares', 'esrom', 'aram', 'aminadav', 'naasson', 'salmon', 'vooz', 'ovid', 'iessey', 'david', 'solomon', 'nafan-syn-davida', 'rovoam', 'aviya', 'asa', 'iosafat', 'ioram-syn-iosafata',
  'okhoziya-syn-iorama', 'ioas-syn-okhozii', 'amasiya', 'oziya', 'ioafam', 'akhaz', 'ezekiya', 'manassiya-tsar', 'amon-tsar', 'iosiya', 'ioakim-tsar', 'iekhoniya', 'salafiil', 'fedaiya-syn-iekhonii', 'zorovavel',
]);
function SynopsisPanel() {
  const rows = useMemo(() => {
    const ids: string[] = [];
    const add = (id: string) => !ids.includes(id) && ids.push(id);
    const j = lines.joseph.persons.map((p) => p.id);
    const m = lines.mary.persons.map((p) => p.id);
    let a = 0;
    let b = 0;
    while (a < j.length || b < m.length) {
      if (a < j.length && b < m.length && j[a] === m[b]) { add(j[a]); a++; b++; continue; }
      const ta = a < j.length ? model.value.chrono.get(j[a])?.b ?? Infinity : Infinity;
      const tb = b < m.length ? model.value.chrono.get(m[b])?.b ?? Infinity : Infinity;
      if (ta <= tb) { add(j[a]); a++; } else { add(m[b]); b++; }
      if (j[a - 1] === 'iekhoniya' && !ids.includes('fedaiya-syn-iekhonii')) add('fedaiya-syn-iekhonii');
    }
    return ids;
  }, []);
  const jm = new Map(lines.joseph.persons.map((p) => [p.id, p]));
  const mm = new Map(lines.mary.persons.map((p) => [p.id, p]));
  const cell = (ok: boolean, text: string, cls = '') => <td class={ok ? cls : 'no'}>{ok ? text : '—'}</td>;
  return (
    <Sheet wide title="Синопсис родословий" lead="Параллельные столбцы: Быт 5; 11 | Руф 4 | 1 Пар 1–3 | Мф 1 | Лк 3. Видны пропуски у Матфея, Каинан у Луки, Федаия в 1 Пар 3:19 и то, что Авиуда и Рисая нет среди сыновей Зоровавеля в 1 Пар 3:19–20.">
      <table class="synopsis">
        <thead>
          <tr>
            <th>Лицо</th>
            <th>Быт</th>
            <th>Руф</th>
            <th>1 Пар</th>
            <th>Мф 1</th>
            <th>Лк 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((id) => byId.has(id)).map((id) => {
            const js = jm.get(id);
            const ms = mm.get(id);
            return (
              <tr key={id}>
                <td>
                  <P id={id} />
                </td>
                {id === 'kainan-syn-arfaksada' ? <td>[11:12]</td> : cell(GEN.has(id), '●')}
                {cell(RUTH.has(id), '●')}
                {cell(CHR.has(id), id === 'fedaiya-syn-iekhonii' ? 'отец Зоровавеля, 3:19' : '●')}
                {js?.flag === 'omitted-by-mt' ? <td>опущен</td> : cell(!!js?.mt, js?.mt ? `${js.mt}` : '')}
                {cell(!!ms?.lk, ms?.lk ? `${ms.lk}` : '')}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted" style={{ fontSize: '13.5px' }}>
        Числа в столбцах Мф и Лк — порядковые номера имён: у Матфея от Авраама (1) до Иисуса (42), у Луки от Иосифа (1) до Адама (75). Скобки — чтение в квадратных скобках
        Синодального текста.
      </p>
    </Sheet>
  );
}

// ---------- чтение глав ----------
const CHAPTERS = ['Быт 4', 'Быт 5', 'Быт 10', 'Быт 11', 'Быт 25', 'Быт 36', 'Быт 46', 'Исх 6', 'Руф 4', '1Пар 1', '1Пар 2', '1Пар 3', '1Пар 4', '1Пар 5', '1Пар 6', '1Пар 7', '1Пар 8', '1Пар 9', 'Мф 1', 'Лк 3'];
function ChapterPanel() {
  const [ch, setCh] = useState('Мф 1');
  const [text, setText] = useState<{ n: number; t: string; ids: string[] }[] | null>(null);
  useEffect(() => {
    setText(null);
    import('../generated/chapters.json').then((m) => {
      const all = (m as unknown as { default: Record<string, { n: number; t: string; ids: string[] }[]> }).default;
      setText(all[ch] ?? []);
    });
  }, [ch]);
  const link = (t: string, ids: string[]) => {
    const forms = ids.map((id) => ({ id, re: new RegExp(`(^|[^а-яё])(${norm(byId.get(id)?.name ?? '').slice(0, Math.max(3, (byId.get(id)?.name.length ?? 4) - 1))}[а-яё]*)`, 'i') }));
    const parts: ComponentChildren[] = [];
    let rest = t;
    let guard = 0;
    while (rest && guard++ < 60) {
      let best: { i: number; len: number; id: string } | null = null;
      for (const f of forms) {
        const m = f.re.exec(norm(rest));
        if (m) {
          const i = m.index + m[1].length;
          if (!best || i < best.i) best = { i, len: m[2].length, id: f.id };
        }
      }
      if (!best) break;
      parts.push(renderBrackets(rest.slice(0, best.i)));
      parts.push(<P id={best.id}>{rest.slice(best.i, best.i + best.len)}</P>);
      rest = rest.slice(best.i + best.len);
    }
    parts.push(renderBrackets(rest));
    return parts;
  };
  return (
    <Sheet title="Чтение глав" lead="Родословные главы в Синодальном переводе. Имена, внесённые в атлас, — ссылки на карточки.">
      <div class="opts">
        {CHAPTERS.map((c) => (
          <button key={c} aria-pressed={c === ch} onClick={() => setCh(c)}>
            {refLabel(c)}
          </button>
        ))}
      </div>
      <div class="chapter">
        {!text ? (
          <p class="muted">…</p>
        ) : (
          text.map((v) => (
            <p key={v.n}>
              <sup>{v.n}</sup>
              {link(v.t, v.ids)}
            </p>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ---------- сквозной раздел ----------
const SETS: { id: string; name: string; ids: () => string[] }[] = [
  { id: 'joseph', name: 'Линия Иосифа', ids: () => lines.joseph.persons.map((p) => p.id) },
  { id: 'mary', name: 'Линия по Луке', ids: () => lines.mary.persons.map((p) => p.id) },
  { id: 'judah', name: 'Цари Иудеи', ids: () => persons.filter((p) => p.reign.some((r) => /Иуд/.test(r.over))).sort((a, b) => a.reign[0].start - b.reign[0].start).map((p) => p.id) },
  { id: 'israel', name: 'Цари Израиля', ids: () => persons.filter((p) => p.reign.some((r) => /Израил/.test(r.over)) && p.group === 'israel-kings').sort((a, b) => a.reign[0].start - b.reign[0].start).map((p) => p.id) },
  { id: 'judges', name: 'Судьи', ids: () => persons.filter((p) => p.roles.includes('judge')).map((p) => p.id) },
  { id: 'prophets', name: 'Пророки', ids: () => persons.filter((p) => p.roles.includes('prophet')).map((p) => p.id) },
  { id: 'patriarchs', name: 'Праотцы', ids: () => persons.filter((p) => p.roles.includes('patriarch')).map((p) => p.id) },
  { id: 'apostles', name: 'Апостолы', ids: () => persons.filter((p) => p.roles.includes('apostle')).map((p) => p.id) },
];
const SECTION_FIELD: Record<number, (c: Card) => { text: string; refs?: string[] }[]> = {
  2: (c) => (c.original ? [{ text: `${c.original.script} — ${c.original.translit}` }] : []),
  3: (c) => (c.meaning ? [{ text: c.meaning.text, refs: c.meaning.refs }] : []),
  4: (c) => (c.altNames ?? []).map((a) => ({ text: a.name, refs: a.refs })),
  5: (c) => (c.status ?? []).map((f) => ({ text: f.text, refs: f.refs })),
  7: (c) => (c.lineage ?? []).map((f) => ({ text: f.text, refs: f.refs })),
  8: (c) => [...(c.birth?.place ? [{ text: `Место: ${c.birth.place}` }] : []), ...(c.birth?.facts ?? []).map((f) => ({ text: f.text, refs: f.refs }))],
  13: (c) => (c.chronoNote ?? []).map((f) => ({ text: f.text, refs: f.refs })),
  15: (c) => (c.places ?? []).map((p) => ({ text: p.name, refs: p.refs })),
  16: (c) => (c.offices ?? []).map((o) => ({ text: o.title, refs: o.refs })),
  17: (c) => (c.events ?? []).map((e) => ({ text: e.text, refs: e.refs })),
  18: (c) => (c.sayings ?? []).map((s) => ({ text: `«${s.quote}»`, refs: [s.ref] })),
  19: (c) => (c.withGod ?? []).map((f) => ({ text: f.text, refs: f.refs })),
  20: (c) => [...(c.death?.place ? [{ text: `Место: ${c.death.place}` }] : []), ...(c.death?.facts ?? []).map((f) => ({ text: f.text, refs: f.refs })), ...(c.death?.burial ?? []).map((f) => ({ text: f.text, refs: f.refs }))],
  22: (c) => (c.laterMentions ?? []).map((f) => ({ text: f.text, refs: f.refs })),
  24: (c) => (c.notes ?? []).map((n) => ({ text: n.text, refs: n.refs })),
};
function SectionPanel() {
  const [n, setN] = useState(sectionFocus.value ?? 20);
  const [setId, setSetId] = useState('judah');
  const [cards, setCards] = useState<Record<string, Card>>({});
  const ids = (SETS.find((s) => s.id === setId)?.ids() ?? []).filter((id) => byId.has(id));
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => loadCard(id).then((d) => [id, d?.card ?? {}] as const))).then((all) => alive && setCards(Object.fromEntries(all)));
    return () => {
      alive = false;
    };
  }, [setId]);
  const field = SECTION_FIELD[n];
  return (
    <Sheet title="Сквозной раздел" lead="Один раздел карточки по группе лиц — благодаря неизменной схеме из 24 разделов. Например, «20. Смерть и погребение» у всех царей Иудеи.">
      <div class="opts">
        {SECTIONS.filter((s) => SECTION_FIELD[s.n]).map((s) => (
          <button key={s.n} aria-pressed={s.n === n} onClick={() => setN(s.n)}>
            {s.n}. {s.title}
          </button>
        ))}
      </div>
      <div class="opts">
        {SETS.map((s) => (
          <button key={s.id} aria-pressed={s.id === setId} onClick={() => setSetId(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      {ids.map((id) => {
        const c = cards[id];
        const items = c && field ? field(c) : null;
        return (
          <div key={id} style={{ margin: '10px 0' }}>
            <P id={id} /> <span class="muted">{byId.get(id)!.disambig}</span>
            {!c ? (
              <div class="muted">…</div>
            ) : items && items.length ? (
              <ul style={{ margin: '2px 0 0', paddingLeft: '16px' }}>
                {items.slice(0, 6).map((it, i) => (
                  <li key={i} style={{ fontSize: '14.5px' }}>
                    {it.text} <Refs refs={it.refs} owner={`x${id}${i}`} />
                    <VerseInsert owner={`x${id}${i}`} refs={it.refs} />
                  </li>
                ))}
              </ul>
            ) : (
              <div class="muted" style={{ fontSize: '14px' }}>
                {byId.get(id)!.silent.includes(n) ? 'в Писании не сообщается' : 'раздел не составлен'}
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

// ---------- условные знаки ----------
function Glyph({ o, w = 60, h = 26 }: { o: Parameters<typeof drawGlyph>[3]; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cs.getPropertyValue('--ink-2');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();
    drawGlyph(ctx, w / 2, h / 2, { ...o, color: cs.getPropertyValue('--ink').trim(), halo: cs.getPropertyValue('--sheet').trim() });
  }, []);
  return <canvas ref={ref} style={{ width: `${w}px`, height: `${h}px` }} aria-hidden="true" />;
}
function LegendPanel() {
  const base = { sex: 'm' as const, kind: 'person', magnitude: 2, color: '', halo: '' };
  return (
    <Sheet title="Условные знаки" lead="Как читать звёздную карту.">
      <h3>Звёзды — лица</h3>
      <div class="legend-row"><Glyph o={{ ...base, magnitude: 0 }} /><span>величина звезды — значимость лица в повествовании (от 0 до 6)</span></div>
      <div class="legend-row"><Glyph o={base} /><span>мужчина</span></div>
      <div class="legend-row"><Glyph o={{ ...base, sex: 'f' }} /><span>женщина</span></div>
      <div class="legend-row"><Glyph o={{ ...base, kind: 'people' }} /><span>народ или род, названный «сыном» в таблице народов</span></div>
      <div class="legend-row"><Glyph o={{ ...base, king: true }} /><span>царь или царица — черта над знаком</span></div>
      <div class="legend-row"><Glyph o={{ ...base, hollow: true }} /><span>год рождения по реконструкции (не прямо из чисел Писания)</span></div>
      <div class="legend-row"><Glyph o={{ ...base, ghost: true }} /><span>«призрак»: женщина, стоящая рядом с мужем, отмечена и в родной семье</span></div>
      <div class="legend-row"><Glyph o={{ ...base, messiah: true, magnitude: 0 }} /><span>Иисус Христос — «звезда светлая и утренняя» (Откр 22:16)</span></div>
      <h3>Линии</h3>
      <p>Горизонтальный след — время жизни. Сплошной — годы известны; пунктирный конец — год смерти не установлен. Вертикальный отвод — родство «родитель — ребёнок», квадратик на отводе — мать. Двойная черта — брак. Знак разрыва «//» — хронологическое напряжение: вероятно, родословие здесь сокращено.</p>
      <p><span class="swatch gold" />Линия Иосифа — законная, царская (Мф 1). <span class="swatch azure" />Линия по Луке — традиционно родословие Марии (Лк 3). Разреженная нить — звено по толкованию.</p>
      <h3>Созвездия</h3>
      <p>Штриховой контур — род, колено или дом Израиля; точечный — народ вне Израиля. Полосы на левой кромке обозначены буквами, века — числами: так строятся координаты указателя.</p>
      <h3>Клавиши</h3>
      <p>
        <kbd>/</kbd> (<kbd>.</kbd> на русской раскладке) — поиск · <kbd>+</kbd> <kbd>−</kbd> — масштаб · стрелки — сдвиг · <kbd>[</kbd> <kbd>]</kbd> (<kbd>х</kbd> <kbd>ъ</kbd>) — к родителю и к ребёнку ·{' '}
        <kbd>,</kbd> <kbd>.</kbd> (<kbd>б</kbd> <kbd>ю</kbd>) — к брату или сестре · <kbd>E</kbd> (<kbd>У</kbd>) — эпохи · <kbd>L</kbd> (<kbd>Д</kbd>) — условные знаки · <kbd>Esc</kbd> — закрыть
      </p>
      <h3>Слои</h3>
      <div class="opts">
        {Object.entries({ lifelines: 'следы жизни', connectors: 'связи', constellations: 'созвездия', epochs: 'эпохи', ribbons: 'линии Мессии', tensions: 'напряжения', ghosts: 'призраки', labels: 'подписи' }).map(([k, v]) => (
          <button key={k} aria-pressed={layers.value[k]} onClick={() => (layers.value = { ...layers.value, [k]: !layers.value[k] })}>
            {v}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- о карте ----------
function AboutPanel() {
  const m = model.value;
  return (
    <Sheet title="О карте" lead="Метод атласа, хронология, уровни достоверности и известные трудности текста.">
      <h3>Источник</h3>
      <p>Только 66 канонических книг в Синодальном переводе (1876), в синодальной нумерации стихов. Неканонические книги и добавления (Пс 151, Дан 3:24–90, Дан 13–14, добавления к Есфири) не используются. Слова и числа в квадратных скобках Синодального текста — вставки по греческому переводу — не служат основанием фактов; они показаны в примечаниях и в модели «числа в скобках».</p>
      <h3>Уровни достоверности</h3>
      <p>Без пометы — прямо сказано в Писании. «выв.» — вывод из сопоставления стихов. «толк.» — толкование, распространённое, но не единственное. «расч.» — год, рассчитанный движком по выбранной модели. «справ.» — справочный слой (подлинник, этимология).</p>
      <h3>Модель хронологии</h3>
      <div class="opts">
        {modelInfo.map((mi) => (
          <button key={mi.id} aria-pressed={modelId.value === mi.id} onClick={() => (modelId.value = mi.id)}>
            {mi.name}
          </button>
        ))}
      </div>
      <p>{modelInfo.find((x) => x.id === modelId.value)?.description}</p>
      <p class="muted">Шкала «лет от сотворения» здесь — расчёт атласа по масоретским числам Быт 5 и 11 (сотворение — 4174 г. до Р. Х. в модели по умолчанию). Это не византийская эра «от сотворения мира» (5508 г. до Р. Х.), принятая в России до 1700 г.</p>
      <div class="opts">
        <button aria-pressed={lineFlip.value} onClick={() => (lineFlip.value = !lineFlip.value)}>
          показывать Лк 3 как второе родословие Иосифа
        </button>
      </div>
      <h3>Внебиблейские якоря</h3>
      <table>
        <thead>
          <tr>
            <th>Событие</th>
            <th>Год</th>
            <th>Источник</th>
          </tr>
        </thead>
        <tbody>
          {anchors.map((a) => (
            <tr key={a.id}>
              <td>
                {a.event} <Refs refs={[a.verse]} owner={`an${a.id}`} />
              </td>
              <td>{a.value < 0 ? `${-a.value} до Р. Х.` : `${a.value} по Р. Х.`}{a.alternatives.length ? <div class="muted">или {a.alternatives.join('; ')}</div> : null}</td>
              <td class="muted">{a.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Хронологические напряжения ({m.tensions.length})</h3>
      <p class="muted">Места, где числа текста не сходятся между собой. Атлас их не сглаживает.</p>
      <ul style={{ paddingLeft: '18px' }}>
        {m.tensions.slice(0, 80).map((t, i) => (
          <li key={i} style={{ fontSize: '14.5px', margin: '4px 0' }}>
            {t.text} <Refs refs={t.refs.slice(0, 3)} owner={`tn${i}`} />
            <VerseInsert owner={`tn${i}`} refs={t.refs.slice(0, 3)} />
          </li>
        ))}
      </ul>
      <h3>Тома данных</h3>
      <table>
        <tbody>
          {volumes.map((v) => (
            <tr key={v.volume}>
              <td>{v.volume}</td>
              <td>{v.title}</td>
              <td>
                {v.count} {plural(v.count, 'лицо', 'лица', 'лиц')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted">Раскладка: {Object.entries(m.metrics).map(([k, v]) => `${k} ${v}`).join('; ')}. Сборка: {new Date(builtAt).toLocaleString('ru-RU')}.</p>
      <p class="muted">Родословия на небе — по метке группы: {groupById.size} созвездий. Названия эпох и их основания — в разделе «Эпохи».</p>
      <p class="muted">{modelInfo.length} модели хронологии рассчитаны заранее; модель по умолчанию входит в индекс неба, остальные загружаются при выборе.</p>
    </Sheet>
  );
}
