import { books, mentionsOf } from '../../data/atlas.ts';
import { Refs, VerseInsert, plural, refLabel } from '../common.tsx';

/** Число с неразрывным пробелом в разрядах: «1 012». */
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
/** «в 1 стихе», «в 12 стихах» */
const verses = (n: number) => `${num(n)}\u00a0${plural(n, 'стихе', 'стихах', 'стихах')}`;

/**
 * § 23: полоса 66 книг в синодальном порядке, тон клетки — число стихов, где лицо названо по имени
 * (счёт при сборке, tools/build-data.ts); первое упоминание и ключевые места.
 */
export function CanonStrip({ books: counts, first, keyRefs }: { books: Record<string, number>; first?: string; keyRefs?: string[] }) {
  const info = mentionsOf.get(counts);
  const total = info?.n ?? 0;
  const max = Math.max(1, ...Object.values(counts));
  const ot = books.filter((b) => b.t === 'ot');
  const nt = books.filter((b) => b.t === 'nt');
  const cell = (b: (typeof books)[number]) => {
    const n = counts[b.code] ?? 0;
    const a = n ? 0.25 + 0.75 * Math.sqrt(n / max) : 0;
    return <span key={b.code} title={`${b.name}${n ? `: ${num(n)}\u00a0${plural(n, 'стих', 'стиха', 'стихов')}` : ''}`} style={n ? { background: `color-mix(in srgb, var(--ink) ${Math.round(a * 100)}%, var(--sheet-2))` } : undefined} />;
  };
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <>
      {total > 0 && (
        <>
          <div class="canon" aria-label={`Названо по имени в ${verses(total)}; по книгам Писания`}>
            {ot.map(cell)}
            <span class="gapc" />
            {nt.map(cell)}
          </div>
          <p class="fact">
            Названо по имени в {verses(total)}
            {top.length > 1 ? `; больше всего\u00a0— ${top.map(([code, n]) => `${refLabel(code)} (${num(n)})`).join(', ')}` : top.length ? ` (${refLabel(top[0][0])})` : ''}.
          </p>
          <p class="muted">
            Ветхий Завет{'\u00a0'}— первые 39 клеток, Новый{'\u00a0'}— 27.
            {info?.scope === 'chapters' ? ' То же имя носят другие лица, колено, народ или место, поэтому стихи считаются только в главах, на которые ссылается карточка.' : ''}
          </p>
        </>
      )}
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
