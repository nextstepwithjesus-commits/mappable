/**
 * Данные поиска прототипа (11 § 3.6; рецензия архитектуры пакета 1, № 1–2). Без DOM: тест — `тесты/поиск.test.ts`.
 *  - По адресу: ядро поиска (`core/search`) получает **все рассказы** истории (роль «рассказ») и места других видов с ролью:
 *    «упоминание», «пересказ в речи», «похоже, вспоминает». Раньше шёл только первый рассказ — «Мк 2:3» не находил историю.
 *  - По словам названий: каждое слово запроса — начало слова названия (простое, полное, привычные названия) по основе.
 *    Основа здесь — простое отсечение окончаний; в продукте — таблица основ Snowball (09 § 3.5 п. 2, проба П-Т3).
 *  - Для лица — истории, где лицо названо участником; для пары — истории, где названы оба.
 */
import type { Story } from '../общее/типы.ts';
import { книгаСсылки } from '../общее/адреса.ts';
import { norm, words } from '../../../core/search/norm.ts';

export interface СтрокаПоиска { id: string; t: string; main: string; roles: Record<string, string[]>; common?: string[] }

export const РОЛЬ: Record<string, string> = { mention: 'упоминание', retelling: 'пересказ в речи', allusion: 'похоже, вспоминает' };

/** Записи историй для ядра поиска: все рассказы — `main`, остальные места — по ролям. */
export function строкиПоиска(stories: Iterable<Story>): СтрокаПоиска[] {
  const out: СтрокаПоиска[] = [];
  for (const s of stories) {
    if (s.level !== 'story') continue;
    const roles: Record<string, string[]> = {};
    for (const l of s.links ?? []) {
      const r = l.kind === 'retelling' && !l.teller ? 'пересказ' : РОЛЬ[l.kind];
      if (!r) continue;
      (roles[r] ??= []).push(...l.refs);
    }
    out.push({ id: s.id, t: s.title.short, main: s.accounts.flatMap((a) => a.refs).join('; '), roles, common: s.title.common });
  }
  return out;
}

const ОКОНЧАНИЯ = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ых|их|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ам|ям|ах|ях|ом|ем|ов|ев|ью|ы|и|а|я|о|е|у|ю|ь)$/;
/** Простая основа: окончание отсекается, если остаётся не меньше трёх букв. */
export function основа(w: string): string {
  const n = norm(w);
  const m = ОКОНЧАНИЯ.exec(n);
  return m && n.length - m[1].length >= 3 ? n.slice(0, n.length - m[1].length) : n;
}
const СЛУЖЕБНЫЕ = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'да', 'о', 'об', 'у', 'к', 'ко', 'по', 'из', 'за', 'от', 'до', 'не']);

/** Истории, в названии которых есть все слова запроса (по основе; начало слова). */
export function историиПоСловам(stories: Iterable<Story>, q: string): Story[] {
  const термы = words(q).filter((w) => !СЛУЖЕБНЫЕ.has(w)).map(основа);
  if (!термы.length) return [];
  const out: { s: Story; n: number }[] = [];
  for (const s of stories) {
    if (s.level !== 'story') continue;
    const назв = [s.title.short, s.title.full ?? '', ...(s.title.common ?? [])];
    const слова = назв.flatMap((t) => words(t)).map(основа);
    if (термы.every((т) => слова.some((с) => с.startsWith(т) || т.startsWith(с) && с.length >= 4))) out.push({ s, n: words(s.title.short).length });
  }
  return out.sort((a, b) => a.n - b.n).map((x) => x.s);
}

/** Истории, где лицо названо участником. */
export const историиЛица = (stories: Iterable<Story>, id: string) => [...stories].filter((s) => s.level === 'story' && s.actors.some((a) => a.actor === id));

/** Рассказ истории в книге найденного адреса: параметр `rasskaz` нужен, если книга — не первая по канону. */
export function рассказВКниге(s: Story, книга: string): boolean {
  return s.accounts.some((a) => книгаСсылки(a.refs[0] ?? '') === книга);
}
