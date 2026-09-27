import { books } from '../../data/atlas.ts';
import { Refs, VerseInsert } from '../common.tsx';

export function CanonStrip({ books: counts, first, keyRefs }: { books: Record<string, number>; first?: string; keyRefs?: string[] }) {
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
