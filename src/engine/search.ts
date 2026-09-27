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
  /** величина звезды 0–6 (0 — ярче всех); без неё значимость берётся из prominence */
  magnitude?: number;
  refs: string[]; // все ссылки лица (для поиска по стиху)
}

export interface SearchHit {
  id: string;
  score: number;
  matched: string; // по какой форме найдено
}

/**
 * Классы совпадения, от лучшего к худшему. Порядок результатов — по классу, внутри класса — по значимости лица,
 * поэтому «Иисус» ставит Иисуса Христа (совпадение по первому слову имени) раньше одноимённых левитов.
 */
const EXACT = 0; // имя целиком или его первое слово: «Иисус» → «Иисус», «Иисус Христос», «Иисус Навин»
const PREFIX = 1; // начало имени: «Иос» → «Иосиф»
const STEM = 2; // косвенная форма имени или первого слова: «Давида», «Иисуса»
const WORD = 3; // слово внутри имени: «Навин» → «Иисус Навин»
const PART = 4; // часть имени: «сафат» → «Иосафат»
const BY_DISAMBIG = 5; // уточнение: «Искариот»
const NONE = 6;

function matchClass(f: string, q: string, qs: string): number {
  const words = f.split(/[\s-]+/);
  if (f === q || f.split(/\s+/)[0] === q) return EXACT;
  if (f.startsWith(q)) return PREFIX;
  if (stem(f) === qs || stem(words[0]) === qs) return STEM;
  if (words.some((w) => w.startsWith(q) || stem(w) === qs)) return WORD;
  if (q.length >= 3 && f.includes(q)) return PART;
  return NONE;
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
      // лучший класс по имени и иным формам; при равном классе имя важнее иной формы
      let cls = NONE;
      let alt = 1;
      let matched = '';
      const tryForm = (form: string, isAlt: number) => {
        const c = matchClass(norm(form), q, qs);
        if (c < cls || (c === cls && isAlt < alt)) {
          cls = c;
          alt = isAlt;
          matched = form;
        }
      };
      tryForm(d.name, 0);
      for (const a of d.alt) tryForm(a, 1);
      if (cls === NONE && d.disambig) {
        const f = norm(d.disambig);
        if (q.length >= 3 && (f.includes(q) || f.split(/[\s,]+/).some((w) => stem(w) === qs))) {
          cls = BY_DISAMBIG;
          alt = 0;
          matched = d.disambig;
        }
      }
      if (cls === NONE) continue;
      // значимость: ярче звезда — выше; величина 0–6, prominence 1–5 (5 — главные лица)
      const mag = d.magnitude ?? 6 - d.prominence;
      hits.push({ id: d.id, score: (NONE - cls) * 1000 + (1 - alt) * 100 + (6 - mag) * 10 + d.prominence, matched });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
