import { byId, graph } from '../../data/atlas.ts';
import type { Fact } from '../../data/types.ts';
import { model } from '../../state.ts';
import { Refs, VerseInsert, Mark, refLabel } from '../common.tsx';
import { formatSpan, toHist } from '../../engine/years.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { PG, birthLine } from './shared.tsx';
type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

/** § 8: строка года рождения (расчёт, оценка или эпоха). */
export function BirthLine({ p, c, m }: { p: AtlasPerson; c: ChronoRow; m: ModelData }) {
  return (
    <p class="fact">
      {c.cls === 'epochal' ? `Год не установлен; эпоха — ${m.epochs.find((e) => e.id === (p.epoch ?? c.epoch))?.name ?? '—'}` : birthLine(c.b, c.bLo, c.bHi, c.cls)}
      <Mark calc={c.cls !== 'exact' && c.cls !== 'epochal'} />
    </p>
  );
}

export function RelativeChrono({ id, m, note }: { id: string; m: ModelData; note?: Fact[] }) {
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
  // порядок по прямому родству: родитель раньше, ребёнок позже (если они ещё не названы выше как датированные опоры)
  const parentLink = (graph.parentsOf.get(id) ?? []).find((e) => (e.kind === 'father' || e.kind === 'mother') && e.parent !== bornAfter);
  const childLink = [...(graph.childrenOf.get(id) ?? [])]
    .filter((e) => (e.kind === 'father' || e.kind === 'mother') && e.child !== bornBefore)
    .sort((a, b) => (byId.get(a.child)!.order ?? 99) - (byId.get(b.child)!.order ?? 99))[0];
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
              Родился после рождения <PG id={bornAfter} />
            </>
          )}
          {bornAfter && bornBefore ? ' и ' : ''}
          {bornBefore && (
            <>
              {bornAfter ? 'до' : 'Родился до'} рождения <PG id={bornBefore} />
            </>
          )}
          {aliveDuring && (
            <>
              {bornAfter || bornBefore ? '; ' : ''}жил при жизни <PG id={aliveDuring} />
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
              после <PG id={parentLink.parent} /> ({kinWord(parentLink.parent, true)})
            </>
          )}
          {parentLink && childLink ? ', ' : ''}
          {childLink && (
            <>
              до <PG id={childLink.child} /> ({kinWord(childLink.child, false)})
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
