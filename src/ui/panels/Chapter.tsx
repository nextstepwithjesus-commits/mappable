import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId } from '../../data/atlas.ts';
import { P, refLabel, renderBrackets } from '../common.tsx';
import { norm } from '../../engine/text.ts';
import { Sheet } from './Sheet.tsx';

// ---------- чтение глав ----------
const CHAPTERS = ['Быт 4', 'Быт 5', 'Быт 10', 'Быт 11', 'Быт 25', 'Быт 36', 'Быт 46', 'Исх 6', 'Руф 4', '1Пар 1', '1Пар 2', '1Пар 3', '1Пар 4', '1Пар 5', '1Пар 6', '1Пар 7', '1Пар 8', '1Пар 9', 'Мф 1', 'Лк 3'];
export function ChapterPanel() {
  const [ch, setCh] = useState('Мф 1');
  const [text, setText] = useState<{ n: number; t: string; ids: string[] }[] | null>(null);
  useEffect(() => {
    setText(null);
    import('../../generated/chapters.json').then((m) => {
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
      // знак препинания после имени не отрывается от ссылки на новую строку
      const tail = /^[,;:.!?»)]+/.exec(rest.slice(best.i + best.len))?.[0] ?? '';
      parts.push(
        <span class="nobr">
          <P id={best.id}>{rest.slice(best.i, best.i + best.len)}</P>
          {tail}
        </span>,
      );
      rest = rest.slice(best.i + best.len + tail.length);
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
