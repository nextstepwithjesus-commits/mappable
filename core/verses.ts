/**
 * Стих из пакета текста книги (09 § 5.3): текст, отсутствие стиха (`null`: Дан 3:24–90 нет в синодальном файле), пустой стих
 * (`""`: Пс 114:9), отрезки скобок с их видом и пометки дефектов. Находка внутри скобок получает вид отрезка (09 § 3.5 п. 6;
 * 02 § 3.8): слова в скобках — не основание факта, кроме видов «пояснение» и «повреждение», признанных текстом. Ядро без DOM.
 */
import { BRACKET_KINDS, type BookTextPack, type BracketKind } from './types.ts';

export interface VerseView {
  /** Нет такого стиха в Синодальном тексте. */
  missing: boolean;
  /** Стих пуст в электронном тексте. */
  empty: boolean;
  text: string;
  brackets: { start: number; end: number; kind: BracketKind; isText: boolean }[];
  issues: string[];
}

export function verseOf(pack: BookTextPack, c: number, v: number): VerseView | undefined {
  const ch = pack.ch[c - 1];
  if (!ch || v < 1 || v > ch.length) return undefined;
  const t = ch[v - 1];
  return {
    missing: t === null,
    empty: t === '',
    text: t ?? '',
    brackets: pack.br.filter((b) => b[0] === c && b[1] === v).map((b) => ({ start: b[2], end: b[3], kind: BRACKET_KINDS[b[4]], isText: b[5] === 1 })),
    issues: pack.iss.filter((i) => i[0] === c && i[1] === v).map((i) => i[2]),
  };
}

/** Отрезок скобок, внутри которого стоит позиция находки; вне скобок — undefined. */
export function bracketAt(pack: BookTextPack, c: number, v: number, pos: number): { kind: BracketKind; isText: boolean } | undefined {
  const b = pack.br.find((x) => x[0] === c && x[1] === v && pos >= x[2] && pos < x[3]);
  return b ? { kind: BRACKET_KINDS[b[4]], isText: b[5] === 1 } : undefined;
}

/** Слова стиха, на которые можно опираться: вне скобок и внутри скобок, признанных текстом (знаки скобок снимаются). */
export function scriptureWords(view: VerseView): string {
  let out = '';
  let at = 0;
  for (const b of [...view.brackets].sort((x, y) => x.start - y.start)) {
    out += view.text.slice(at, b.start) + ' ' + (b.isText ? view.text.slice(b.start + 1, b.end - 1) : '') + ' ';
    at = b.end;
  }
  out += view.text.slice(at);
  return out.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

/**
 * Текст стиха для показа и копии (08 § 16.2, строка 81; рецензия интерфейса, № 21): дефис с пробелами по обе стороны
 * («человека - сеть», Притч 29:6) — тире «—». Длина строки не меняется, поэтому положения находок поиска остаются верными.
 * `synodal.tsv` не правится; буква «ё» не восстанавливается.
 */
export function showText(s: string): string {
  return s.replace(/ - /g, ' — ');
}
