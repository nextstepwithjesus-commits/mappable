import { books, mentionsOf } from '../../data/atlas.ts';
import { Refs, VerseInsert, plural, refLabel } from '../common.tsx';
import { num, typoTree } from '../text/typo.ts';
/** «в 1 стихе», «в 12 стихах» */
const verses = (n: number) => `${num(n)} ${plural(n, 'стихе', 'стихах', 'стихах')}`;

/** Группы книг в синодальном порядке (F9; VIS-09): первая книга группы и название для подсказки. */
const GROUPS: { from: string; name: string }[] = [
  { from: 'Быт', name: 'Закон' },
  { from: 'Нав', name: 'Исторические книги' },
  { from: 'Иов', name: 'Учительные книги' },
  { from: 'Ис', name: 'Пророки' },
  { from: 'Мф', name: 'Евангелия' },
  { from: 'Деян', name: 'Деяния' },
  { from: 'Иак', name: 'Послания' },
  { from: 'Откр', name: 'Откровение' },
];

/** Ступень светлоты клетки (1–4) по доле стихов от самой частой книги лица; 0 — имени в книге нет. */
export const canonLevel = (n: number, max: number) => (n <= 0 ? 0 : Math.min(4, 1 + Math.floor(Math.sqrt(n / Math.max(1, max)) * 3.999)));

/**
 * § 23: полоса 66 книг одной строкой (F9; CARD-37, VIS-09) — группы книг через зазор, заветы через больший зазор;
 * тон клетки — четыре ступени по числу стихов, где лицо названо по имени (счёт при сборке, tools/build-data.ts);
 * подписи — синодальными сокращениями; первое упоминание и ключевые места.
 */
export function CanonStrip({ books: counts, first, keyRefs }: { books: Record<string, number>; first?: string; keyRefs?: string[] }) {
  const info = mentionsOf.get(counts);
  const total = info?.n ?? 0;
  const max = Math.max(1, ...Object.values(counts));
  const groups: (typeof books)[] = [];
  for (const b of books) {
    const g = GROUPS.findIndex((x) => x.from === b.code);
    if (g >= 0 || !groups.length) groups.push([]);
    groups[groups.length - 1].push(b);
  }
  const cell = (b: (typeof books)[number]) => {
    const n = counts[b.code] ?? 0;
    const abbr = refLabel(b.code);
    return <span key={b.code} class={`l${canonLevel(n, max)}`} title={`${abbr}${n ? `: ${num(n)} ${plural(n, 'стих', 'стиха', 'стихов')}` : ''}`} />;
  };
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return typoTree(
    <>
      {total > 0 && (
        <>
          <div class="canon" role="img" aria-label={`Названо по имени в ${verses(total)}; по книгам Писания`}>
            {groups.map((g, i) => (
              <span class={`cg${g[0].code === 'Мф' ? ' nt' : ''}`} key={g[0].code} style={{ '--n': g.length }} title={GROUPS[i]?.name}>
                {g.map(cell)}
              </span>
            ))}
          </div>
          <div class="canon-t" aria-hidden="true">
            <span class="ot" data-label="Ветхий Завет" />
            <span class="nt" data-label="Новый Завет" />
          </div>
          <p class="fact">
            Названо по имени в {verses(total)}
            {top.length > 1 ? `; больше всего — ${top.map(([code, n]) => `${refLabel(code)} (${num(n)})`).join(', ')}` : top.length ? ` (${refLabel(top[0][0])})` : ''}.
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
    </>,
  );
}
