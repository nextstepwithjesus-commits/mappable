/**
 * Малый образ Времени (04 § 7.5; 08 § 7.5.1; 11 § 4.6): указатель эпох одной строкой — 16 равных клеток не в масштабе,
 * клетка 16 за знаком разрыва; эпохи истории залиты; подписаны крайние и залитая. Картинка `aria-hidden`; смысл — в подписи.
 */
import { Д } from '../общее/данные.ts';
import { отрезки } from '../общее/адреса.ts';
import type { Epoch } from '../общее/типы.ts';

/** Эпохи по главам книги из таблицы эпох (`books`: «Быт 1–7»). Это правило прототипа, а не время истории по сети (Д6). */
export function эпохиСсылки(ref: string): Epoch[] {
  const sp = отрезки(ref);
  if (!sp.length) return [];
  const out: Epoch[] = [];
  for (const e of Д.epochs) {
    for (const b of e.books ?? []) {
      const m = /^([1-4]?[А-Яа-яЁё]+)(?:\s+(\d+)(?:–(\d+))?)?/.exec(b);
      if (!m) continue;
      const from = m[2] ? +m[2] : 1;
      const to = m[3] ? +m[3] : m[2] ? +m[2] : 999;
      if (sp.some((s) => s.book === m[1] && s.c1 <= to && s.c2 >= from)) {
        out.push(e);
        break;
      }
    }
  }
  // книга целиком в двух эпохах (Ис, Мих): оставляем все — образ честно показывает промежуток
  return out;
}

export function ОбразЭпох({ залитые, ширина = 352 }: { залитые: string[]; ширина?: number }) {
  const ep = Д.epochs;
  const n = ep.length;
  const h = 16;
  const разрыв = 10;
  const кл = (ширина - разрыв) / n;
  const x = (i: number) => i * кл + (i === n - 1 ? разрыв : 0);
  const имя = ep.filter((e) => залитые.includes(e.id)).map((e) => e.short);
  return (
    <span class="образ-время">
      <svg viewBox={`0 0 ${ширина} ${h}`} aria-hidden="true">
        <rect x={0.5} y={0.5} width={(n - 1) * кл - 1} height={h - 1} fill="none" stroke="currentColor" stroke-width={1} class="клетка-пустая" />
        <rect x={(n - 1) * кл + разрыв + 0.5} y={0.5} width={кл - 1} height={h - 1} fill="none" stroke="currentColor" stroke-width={1} class="клетка-пустая" />
        {ep.slice(1, n - 1).map((_, i) => (
          <path d={`M${((i + 1) * кл).toFixed(1)} 0V${h}`} stroke="currentColor" stroke-width={1} class="клетка-пустая" />
        ))}
        {ep.map((e, i) => (залитые.includes(e.id) ? <rect x={x(i)} y={0} width={кл} height={h} fill="currentColor" /> : null))}
        <path d={`M${(n - 1) * кл + 1} ${h - 2}l3 -${h - 4}M${(n - 1) * кл + 5} ${h - 2}l3 -${h - 4}`} stroke="currentColor" stroke-width={1.5} class="клетка-пустая" />
      </svg>
      <span class="образ-время__края т-адрес">
        <span>{ep[0].short}</span>
        <span class="образ-время__имя">{имя.join(' — ')}</span>
        <span>{ep[n - 1].short}</span>
      </span>
      <span class="т-адрес образ-время__масштаб">не в масштабе</span>
    </span>
  );
}
