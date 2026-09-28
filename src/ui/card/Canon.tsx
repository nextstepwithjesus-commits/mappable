import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { books, byId, groups, mentionsOf, persons } from '../../data/atlas.ts';
import { Refs, VerseInsert, plural, refLabel } from '../common.tsx';
import { num, typoTree } from '../text/typo.ts';
/** «в 1 стихе», «в 12 стихах» */
const verses = (n: number) => `${num(n)} ${plural(n, 'стихе', 'стихах', 'стихах')}`;

/**
 * Группы книг в синодальном порядке (F9; VIS-09, VIS-43): первая книга группы, название для подсказки, подпись под
 * полосой и её сокращение. Подпись, которой нет места над своими клетками, заменяется сокращением; нет места и ему —
 * группа не подписывается (Деяния и Откровение — по одной клетке), название остаётся в подсказке клеток.
 */
const GROUPS: { from: string; name: string; label: string; short: string }[] = [
  { from: 'Быт', name: 'Закон', label: 'Закон', short: 'Зак.' },
  { from: 'Нав', name: 'Исторические книги', label: 'Исторические', short: 'Ист.' },
  { from: 'Иов', name: 'Учительные книги', label: 'Учительные', short: 'Уч.' },
  { from: 'Ис', name: 'Пророки', label: 'Пророки', short: 'Прор.' },
  { from: 'Мф', name: 'Евангелия', label: 'Евангелия', short: 'Ев.' },
  { from: 'Деян', name: 'Деяния', label: 'Деяния', short: 'Деян' },
  { from: 'Иак', name: 'Послания', label: 'Послания', short: 'Посл.' },
  { from: 'Откр', name: 'Откровение', label: 'Откровение', short: 'Откр' },
];

/**
 * Подписи восьми групп под полосой (VIS-43): каждая — под своими клетками, той же ширины, что группа. Что помещается —
 * полное название, сокращение или ничего — измеряется в браузере после раскладки и при смене ширины; при отрисовке
 * в строку (тесты) — полные названия. Подпись — из data-label, как у заветов: подпись к рисунку, не текст раздела.
 */
function GroupLabels({ sizes }: { sizes: { code: string; n: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  // место каждой подписи — по настоящим клеткам полосы: на узком листе клетки не у́же 3 px, и доли по числу книг
  // расходятся с группами; что помещается: f — название, s — сокращение, n — ничего
  const [geo, setGeo] = useState<{ x: number; w: number; k: string }[] | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const prev = el?.previousElementSibling as HTMLElement | null | undefined;
    const strip = prev?.classList.contains('canon') ? prev : null;
    if (!el || !strip) return;
    const measure = () => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const x0 = el.getBoundingClientRect().left;
      const cg = Array.from(strip.children) as HTMLElement[];
      const next = sizes.map((g, i) => {
        const r = cg[i]?.getBoundingClientRect();
        const d = GROUPS.find((x) => x.from === g.code);
        const w = r ? r.width : 0;
        const k = !d ? 'n' : ctx.measureText(d.label).width <= w ? 'f' : ctx.measureText(d.short).width <= w ? 's' : 'n';
        return { x: r ? Math.round(r.left - x0) : 0, w: Math.round(w), k };
      });
      setGeo((was) => (was && JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [sizes.map((g) => g.code).join()]);
  return (
    <div class={geo ? 'canon-g at' : 'canon-g'} ref={box} aria-hidden="true">
      {sizes.map((g, i) => {
        const d = GROUPS.find((x) => x.from === g.code);
        const at = geo?.[i];
        const k = at?.k ?? 'f';
        return (
          <span
            key={g.code}
            class={g.code === 'Мф' ? 'nt' : undefined}
            style={at ? { left: `${at.x}px`, width: `${at.w}px` } : { '--n': g.n }}
            data-label={d && k !== 'n' ? (k === 's' ? d.short : d.label) : ''}
          />
        );
      })}
    </div>
  );
}

/** Ступень светлоты клетки (1–4) по доле стихов от самой частой книги лица; 0 — имени в книге нет. */
export const canonLevel = (n: number, max: number) => (n <= 0 ? 0 : Math.min(4, 1 + Math.floor(Math.sqrt(n / Math.max(1, max)) * 3.999)));

/**
 * § 23: полоса 66 книг одной строкой (F9; CARD-37, VIS-09) — группы книг через зазор, заветы через больший зазор;
 * тон клетки — четыре ступени по числу стихов, где лицо названо по имени (счёт при сборке, tools/build-data.ts);
 * подписи — синодальными сокращениями; первое упоминание и ключевые места.
 */
/**
 * Почему стихи считаются только в главах карточки (CARD-72): называется настоящая причина, а не все возможные.
 * — то же имя у других лиц: «То же имя носят ещё 3 лица»;
 * — сходное имя (одно — начало другого: Руфь и Руф, Рим 16:13): «Сходное имя — Руф»;
 * — имя народа или рода; имя совпадает с названием колена или народа на небе.
 */
export function scopeReason(id: string): string {
  const p = byId.get(id);
  if (!p) return 'имя встречается и в других значениях';
  if (p.kind === 'people' || p.kind === 'clan') return 'это имя народа или рода, и в тексте оно встречается и в других значениях';
  const lo = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const same = persons.filter((q) => q.id !== id && q.name === p.name && !q.unnamed).length;
  if (same) return `то же имя носят ещё ${same} ${plural(same, 'лицо', 'лица', 'лиц')}`;
  const first = lo(p.name.split(' ')[0]);
  const similar = [...new Set(persons.filter((q) => q.id !== id && !q.unnamed).map((q) => q.name.split(' ')[0]).filter((n) => {
    const w = lo(n);
    return w !== first && Math.min(w.length, first.length) >= 3 && (w.startsWith(first) || first.startsWith(w)) && Math.abs(w.length - first.length) <= 1;
  }))];
  if (similar.length) return `сходное имя — ${similar.slice(0, 3).join(', ')}`;
  const tribe = groups.find((g) => (g.kind === 'tribe' || g.kind === 'nation') && lo(g.name).includes(first.slice(0, Math.max(3, first.length - 1))));
  if (tribe) return `имя совпадает с названием на небе: ${tribe.name}`;
  return 'имя встречается и в других значениях';
}

export function CanonStrip({ books: counts, first, keyRefs, id }: { books: Record<string, number>; first?: string; keyRefs?: string[]; id?: string }) {
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
          <GroupLabels sizes={groups.map((g) => ({ code: g[0].code, n: g.length }))} />
          <div class="canon-t" aria-hidden="true">
            <span class="ot" data-label="Ветхий Завет" />
            <span class="nt" data-label="Новый Завет" />
          </div>
          <p class="fact">
            Названо по имени в {verses(total)}
            {top.length > 1 ? `; больше всего — ${top.map(([code, n]) => `${refLabel(code)} (${num(n)})`).join(', ')}` : top.length ? ` (${refLabel(top[0][0])})` : ''}.
            {info?.scope === 'chapters' ? ` Стихи считаются только в главах, на которые ссылается карточка: ${id ? scopeReason(id) : 'имя встречается и в других значениях'}.` : ''}
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
