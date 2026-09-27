import { useEffect, useState } from 'preact/hooks';
import { byId, lines, persons, loadCard } from '../../data/atlas.ts';
import { sectionFocus } from '../../state.ts';
import { P, Refs, VerseInsert } from '../common.tsx';
import { SECTIONS } from '../Folio.tsx';
import type { Card } from '../../data/types.ts';
import { Sheet } from './Sheet.tsx';
import { Segmented } from '../controls.tsx';

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
export function SectionPanel() {
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
      <Segmented label="Раздел карточки" options={SECTIONS.filter((s) => SECTION_FIELD[s.n]).map((s) => ({ value: s.n, label: `${s.n}. ${s.title}` }))} value={n} onChange={setN} />
      <Segmented label="Группа лиц" options={SETS.map((s) => ({ value: s.id, label: s.name }))} value={setId} onChange={setSetId} />
      {ids.map((id) => {
        const c = cards[id];
        const items = c && field ? field(c) : null;
        return (
          <div key={id} class="xsec">
            <P id={id} />
            {byId.get(id)!.disambig ? <span class="muted">, {byId.get(id)!.disambig}</span> : null}
            {!c ? (
              <div class="muted">…</div>
            ) : items && items.length ? (
              <ul>
                {items.slice(0, 6).map((it, i) => (
                  <li key={i}>
                    {it.text} <Refs refs={it.refs} owner={`x${id}${i}`} />
                    <VerseInsert owner={`x${id}${i}`} refs={it.refs} />
                  </li>
                ))}
              </ul>
            ) : (
              <div class="muted">
                {byId.get(id)!.silent.includes(n) ? 'в Писании не сообщается' : 'раздел не составлен'}
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}
