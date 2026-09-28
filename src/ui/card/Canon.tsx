import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { books, byId, groups, mentionsOf, persons } from '../../data/atlas.ts';
import { Refs, VerseInsert, plural, refLabel } from '../common.tsx';
import { num, typoTree } from '../text/typo.ts';
/** «в 1 стихе», «в 12 стихах» */
const verses = (n: number) => `${num(n)} ${plural(n, 'стихе', 'стихах', 'стихах')}`;

/**
 * Группы книг в синодальном порядке (F9; VIS-09, VIS-43, VIS-80): первая книга группы, название для подсказки и подпись
 * под полосой — всегда полным словом, без сокращений («Зак.», «Уч.» читателю непонятны).
 */
const GROUPS: { from: string; name: string; label: string }[] = [
  { from: 'Быт', name: 'Закон', label: 'Закон' },
  { from: 'Нав', name: 'Исторические книги', label: 'Исторические' },
  { from: 'Иов', name: 'Учительные книги', label: 'Учительные' },
  { from: 'Ис', name: 'Пророки', label: 'Пророки' },
  { from: 'Мф', name: 'Евангелия', label: 'Евангелия' },
  { from: 'Деян', name: 'Деяния', label: 'Деяния' },
  { from: 'Иак', name: 'Послания', label: 'Послания' },
  { from: 'Откр', name: 'Откровение', label: 'Откровение' },
];

/** Подпись группы под полосой: от своей первой клетки, в ряду row (0 — первый). */
export type GroupPlace = { x: number; w: number; row: number } | null;
/** Одноклеточные группы («Деяния», «Откровение») подписываются, только если помещаются в первые ряды. */
const LABEL_ROWS = 3;

/**
 * Раскладка подписей групп по рядам (VIS-80): подпись — полным словом, начинается над первой клеткой своей группы
 * (или правее, но в пределах группы) и не задевает соседнюю подпись своего ряда (зазор gap). Обычно хватает двух рядов,
 * на узком листе телефона — трёх. Нет места ни в одном ряду — группа без подписи, её название — в подсказке клеток.
 * cells — левый и правый края групп, px; widths — ширины подписей, px; width — ширина полосы, px.
 */
export function placeGroupLabels(cells: { a: number; b: number }[], widths: number[], width: number, gap = 8): GroupPlace[] {
  const end = Array.from({ length: LABEL_ROWS }, () => -Infinity);
  return cells.map((c, i) => {
    const w = widths[i];
    // одноклеточная группа — не дальше второго ряда: подпись в третьем ряду под чужими клетками читалась бы как чужая
    const rows = c.b - c.a < w / 2 ? 2 : LABEL_ROWS;
    for (let row = 0; row < rows; row++) {
      const x = Math.max(c.a, end[row] + gap);
      // подпись начинается над своей группой (у́же группы — целиком над ней) и не выходит за правый край полосы
      if (x > Math.max(c.a, c.b - Math.min(w, c.b - c.a)) || x + w > width) continue;
      end[row] = x + w;
      return { x, w, row };
    }
    return null;
  });
}

/**
 * Подписи восьми групп под полосой (VIS-43, VIS-80): полными словами, в два ряда — каждая начинается над первой клеткой
 * своей группы. Места измеряются в браузере после раскладки и при смене ширины; при отрисовке в строку (тесты) —
 * все восемь названий в один ряд. Подпись — из data-label, как у заветов: подпись к рисунку, не текст раздела.
 */
function GroupLabels({ sizes }: { sizes: { code: string; n: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  // места подписей — по настоящим клеткам полосы: на узком листе клетки не у́же 3 px, и доли по числу книг расходятся
  // с группами
  const [geo, setGeo] = useState<GroupPlace[] | null>(null);
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
      const cells = sizes.map((_, i) => {
        const r = cg[i]?.getBoundingClientRect();
        return r ? { a: Math.round(r.left - x0), b: Math.round(r.right - x0) } : { a: 0, b: 0 };
      });
      const widths = sizes.map((g) => Math.ceil(ctx.measureText(GROUPS.find((x) => x.from === g.code)?.label ?? '').width));
      const next = placeGroupLabels(cells, widths, Math.round(el.getBoundingClientRect().width));
      setGeo((was) => (was && JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [sizes.map((g) => g.code).join()]);
  const rows = geo ? 1 + Math.max(0, ...geo.map((g) => g?.row ?? 0)) : 1;
  return (
    <div class={geo ? 'canon-g at' : 'canon-g'} ref={box} aria-hidden="true" data-rows={geo ? rows : undefined}>
      {sizes.map((g, i) => {
        const d = GROUPS.find((x) => x.from === g.code);
        const at = geo?.[i];
        return (
          <span
            key={g.code}
            class={[g.code === 'Мф' ? 'nt' : '', at?.row ? `r${at.row + 1}` : ''].filter(Boolean).join(' ') || undefined}
            style={at ? { left: `${at.x}px`, width: `${at.w}px` } : { '--n': g.n }}
            data-label={d && (at || !geo) ? d.label : ''}
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
 * — то же имя у других лиц: «То же имя носят ещё 3 лица», «То же имя носит ещё одно лицо»;
 * — сходное имя (одно — начало другого: Руфь и Руф, Рим 16:13): «Сходное имя — Руф»;
 * — имя народа или рода; имя совпадает с названием колена или народа на небе.
 */
export function scopeReason(id: string): string {
  const p = byId.get(id);
  if (!p) return 'имя встречается и в других значениях';
  if (p.kind === 'people' || p.kind === 'clan') return 'это имя народа или рода, и в тексте оно встречается и в других значениях';
  const lo = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const same = persons.filter((q) => q.id !== id && q.name === p.name && !q.unnamed).length;
  // число согласовано с глаголом (CARD-90): «носит ещё одно лицо», «носят ещё 3 лица», «носит ещё 21 лицо»
  if (same) {
    const noun = plural(same, 'лицо', 'лица', 'лиц');
    return `то же имя ${noun === 'лицо' ? 'носит' : 'носят'} ещё ${same === 1 ? 'одно' : num(same)} ${noun}`;
  }
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
          <div class="canon" role="img" aria-label={`Имя названо в ${verses(total)}; по книгам Писания`}>
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
            {/* у фразы есть подлежащее (CARD-90); число стихов неотрывно от своей книги: «3 Цар (74)» (VIS-74) */}
            Имя названо в {verses(total)}
            {top.length > 1 ? `; больше всего — ${top.map(([code, n]) => `${refLabel(code)}\u00a0(${num(n)})`).join(', ')}` : top.length ? ` (${refLabel(top[0][0])})` : ''}.
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
