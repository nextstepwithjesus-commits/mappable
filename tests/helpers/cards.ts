/**
 * Карточки лиц в виде текста — так, как их собирает интерфейс (buildSections из Folio.tsx).
 * Нужны для проверок «по всем лицам»: грамматика, голые числа, родство от лица владельца.
 * Перед тестами должна быть свежая сборка данных: npm run -s data.
 */
import { renderToString } from 'preact-render-to-string';
import type { ComponentChildren, VNode } from 'preact';
import { h } from 'preact';
import { persons, models, byId, loadCard } from '../../src/data/atlas.ts';
import { buildSections } from '../../src/ui/Folio.tsx';

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t\n]+/g, ' ')
    .trim();

/** Текст каждого непустого раздела карточки: номер → строка. */
export async function cardSections(id: string): Promise<Map<number, string>> {
  const p = byId.get(id)!;
  const data = await loadCard(id);
  const m = models[0];
  const secs = buildSections(id, p, data?.card ?? null, m, m.chrono.get(id));
  const out = new Map<number, string>();
  for (const [n, v] of secs) out.set(n, decode(renderToString(h('div', null, v as ComponentChildren) as VNode)));
  return out;
}

export const allIds = persons.map((p) => p.id);
export { byId };
