/**
 * Словарь форм имён (09 § 3.5 п. 1): для каждого имени базы порождаются падежные формы по окончанию,
 * остаются только формы, которые есть в тексте. Формы разных имён, совпавшие в тексте, сливаются в одну группу
 * («Илия» — и Илия, и родительный падеж от «Илий»). Сборка, не устройство.
 *
 * Перенесено копией из пробы П-Т3 (`prototypes/П-Т3/core/`, 11 октября 2026) по 10 § 3.1 п. 4: тесты — `tests/core-search.test.ts`;
 * рецензия переноса по правилам продукта (данные и интерфейс) ещё не проведена — до неё код не меняет поведения пробы.
 */
import { norm } from './norm.ts';

/** Падежные формы по окончанию (без притяжательных «Ноев»). Правила — замер 09 (`поиск-формы.ts`). */
export function caseForms(name: string): string[] {
  const n = norm(name);
  const b = n.slice(0, -1);
  if (/й$/.test(n)) return [n, b + 'я', b + 'ю', b + 'е', b + 'ем'];
  if (/ия$/.test(n)) return [n, b + 'и', b + 'ю', b + 'ей', b + 'ею'];
  if (/я$/.test(n)) return [n, b + 'и', b + 'ю', b + 'е', b + 'ей', b + 'ею'];
  if (/а$/.test(n)) return [n, b + 'ы', b + 'и', b + 'е', b + 'у', b + 'ой', b + 'ою'];
  if (/ь$/.test(n)) return [n, b + 'и', b + 'ью'];
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(n)) return [n, n + 'а', n + 'у', n + 'ом', n + 'е'];
  return [n];
}

export interface NameSource {
  /** Номер лица (или другого предмета с именем). */
  id: string;
  /** Имена: основное и другие; берётся первое слово каждого, если оно с прописной. */
  names: string[];
}

export interface FormsDict {
  /** Имена: формы, которые есть в тексте, и номера лиц с этим именем. */
  names: { forms: string[]; ids: string[] }[];
}

/**
 * Собирает словарь форм. textWords — слова текста (нормализованные); capitalized — слова, которые в тексте хоть раз
 * написаны с прописной не в начале предложения: форма, которая встречается только строчной («аде» — от «ад»,
 * а не от «Ада»), в словарь имён не входит и ищется как обычное слово по основе.
 */
export function buildForms(sources: NameSource[], textWords: Set<string>, capitalized: Set<string>): FormsDict {
  const perName = new Map<string, { forms: string[]; ids: Set<string> }>();
  for (const s of sources) {
    for (const full of s.names) {
      const first = full.trim().split(/\s+/)[0];
      if (!/^[А-ЯЁ]/.test(first)) continue;
      const key = norm(first);
      let e = perName.get(key);
      if (!e) {
        e = { forms: [...new Set(caseForms(first))].filter((f) => textWords.has(f) && capitalized.has(f)), ids: new Set() };
        perName.set(key, e);
      }
      e.ids.add(s.id);
    }
  }
  const names = [...perName.values()].filter((e) => e.forms.length > 0).map((e) => ({ forms: e.forms, ids: [...e.ids] }));
  names.sort((a, b) => a.forms[0].localeCompare(b.forms[0], 'ru'));
  return { names };
}

/**
 * Слово запроса → формы для поиска: объединение форм всех имён, у которых есть такая форма (без цепочек).
 * «Ной» → формы Ноя; «Ное» — и Ной, и Ноа; «Илия» — и Илия, и Илий (09 § 3.5 п. 1; 11 § 3.6 (е)).
 */
export class NameForms {
  private byForm = new Map<string, number[]>();
  constructor(readonly names: { forms: string[]; ids: string[] }[]) {
    names.forEach((n, i) => n.forms.forEach((f) => (this.byForm.get(f) ?? this.byForm.set(f, []).get(f)!).push(i)));
  }
  has(w: string): boolean {
    return this.byForm.has(w);
  }
  forms(w: string): string[] | undefined {
    const ns = this.byForm.get(w);
    if (!ns) return undefined;
    return [...new Set(ns.flatMap((i) => this.names[i].forms))];
  }
  ids(w: string): string[] {
    return [...new Set((this.byForm.get(w) ?? []).flatMap((i) => this.names[i].ids))];
  }
  get formCount() {
    return this.byForm.size;
  }
}
