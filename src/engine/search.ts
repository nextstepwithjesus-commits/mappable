/**
 * Поиск лиц (ТЗ § 3.7): по имени, иным формам, уточнению и ссылке на стих.
 * Нормализация: регистр, ё → е, раскладка (латиница, набранная вместо кириллицы), отбрасывание окончаний.
 */
import { norm } from './text.ts';
import { parseRef, verseId } from './books.ts';

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const LAYOUT = new Map([...EN].map((c, i) => [c, RU[i]]));

export function fixLayout(q: string): string {
  if (!/[a-z[\];',.`]/i.test(q) || /[а-яё]/i.test(q)) return q;
  return [...q.toLowerCase()].map((c) => LAYOUT.get(c) ?? c).join('');
}

const ENDINGS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ой', 'ей', 'ом', 'ем', 'ов', 'ев', 'ин', 'ах', 'ях', 'ам', 'ям', 'а', 'я', 'у', 'ю', 'е', 'ы', 'и', 'ь', 'й', 'о'];

export function stem(w: string): string {
  const s = norm(w);
  if (s.length <= 3) return s;
  for (const e of ENDINGS) if (s.endsWith(e) && s.length - e.length >= 3) return s.slice(0, -e.length);
  return s;
}

export interface SearchDoc {
  id: string;
  name: string;
  alt: string[];
  disambig: string;
  prominence: number;
  refs: string[]; // все ссылки лица (для поиска по стиху)
}

export interface SearchHit {
  id: string;
  score: number;
  matched: string; // по какой форме найдено
}

export class SearchIndex {
  private docs: SearchDoc[];
  private byVerse = new Map<string, Set<string>>();

  constructor(docs: SearchDoc[]) {
    this.docs = docs;
    for (const d of docs) {
      for (const r of d.refs) {
        const p = parseRef(r);
        if (!p) continue;
        for (const v of p.verses) {
          const k = verseId(v);
          const s = this.byVerse.get(k);
          if (s) s.add(d.id);
          else this.byVerse.set(k, new Set([d.id]));
        }
      }
    }
  }

  search(raw: string, limit = 30): SearchHit[] {
    const q0 = raw.trim();
    if (!q0) return [];
    // ссылка на стих: «Руф 4:21», «Лк 3:23-25»
    const ref = parseRef(q0.replace(/^(\d)\s+/, '$1'));
    if (ref && ref.verses.length) {
      const ids = new Set<string>();
      for (const v of ref.verses) for (const id of this.byVerse.get(verseId(v)) ?? []) ids.add(id);
      return [...ids].map((id) => ({ id, score: 100, matched: q0 })).slice(0, limit);
    }
    const q = norm(fixLayout(q0));
    const qs = stem(q);
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      let best = 0;
      let matched = '';
      const tryForm = (form: string, weight: number) => {
        const f = norm(form);
        let s = 0;
        if (f === q) s = 100;
        else if (f.startsWith(q)) s = 80;
        else if (stem(f) === qs) s = 75;
        else if (f.split(/[\s-]+/).some((w) => w.startsWith(q) || stem(w) === qs)) s = 60;
        else if (q.length >= 3 && f.includes(q)) s = 40;
        s *= weight;
        if (s > best) { best = s; matched = form; }
      };
      tryForm(d.name, 1);
      for (const a of d.alt) tryForm(a, 0.92);
      if (d.disambig) {
        const f = norm(d.disambig);
        if (q.length >= 3 && (f.includes(q) || f.split(/[\s,]+/).some((w) => stem(w) === qs))) {
          const s = 35;
          if (s > best) { best = s; matched = d.disambig; }
        }
      }
      if (best > 0) hits.push({ id: d.id, score: best + d.prominence * 2, matched });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
