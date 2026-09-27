/**
 * Русские строки карточки: склонение имён, согласование с полом, словари терминов в обе стороны.
 *
 * Правило (docs/UI-PROMPT.md, <principles> 1): имя ставится в косвенный падеж только функцией, которая умеет
 * его склонять. Если склонение ненадёжно (безымянное лицо, имя через дефис, строчное слово в имени),
 * функции возвращают null, и строка строится иначе: с именем в именительном падеже в начале.
 */
import type { Sex } from '../../data/types.ts';

export type Case = 'gen' | 'dat' | 'ins';

/** Форма по полу: «Царь» / «Царица», «назван» / «названа». */
export const bySex = <T>(sex: Sex, m: T, f: T): T => (sex === 'f' ? f : m);

export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const CONS = 'бвгджзклмнпрстфхцчшщ';
/** Основы с беглой гласной или особым склонением. */
const STEM: Record<string, string> = { Павел: 'Павл', Пётр: 'Петр', Петр: 'Петр', Христос: 'Христ', Египет: 'Египт' };
/** Отдельные падежные формы, которые не следуют общему правилу. */
const IRREG: Record<string, Partial<Record<Case, string>>> = {
  Навин: { ins: 'Навиным' }, // притяжательное: «Иисусом Навиным»
};

/** Одно слово имени в косвенном падеже; null — если слово не склоняется по надёжному правилу. */
function declineWord(w: string, sex: Sex, cs: Case): string | null {
  if (!/^[А-ЯЁ][а-яё]+$/.test(w)) return null;
  const irr = IRREG[w]?.[cs];
  if (irr) return irr;
  const last = w.slice(-1);
  const stem = w.slice(0, -1);
  const hushing = /[жшчщц]$/.test(stem);
  const velar = /[гкхжшчщ]$/.test(stem);
  if (/[аеёиоуыэюя]а$/.test(w)) return w; // Иешуа, Церуа: не склоняются
  if (/ия$/.test(w)) return stem + { gen: 'и', dat: 'и', ins: 'ей' }[cs]; // Мария, Илия, Иеремия
  if (last === 'а') return stem + { gen: velar ? 'и' : 'ы', dat: 'е', ins: hushing ? 'ей' : 'ой' }[cs]; // Иуда, Сарра, Мааха
  if (last === 'я') return stem + { gen: 'и', dat: 'е', ins: 'ей' }[cs];
  if (sex === 'f') {
    if (last === 'ь') return stem + { gen: 'и', dat: 'и', ins: 'ью' }[cs]; // Рахиль, Руфь, Есфирь
    if (CONS.includes(last)) return w; // Мириам: женские имена на согласный не склоняются
    if (/[оеиуюыэ]$/.test(w)) return w; // Ави: не склоняется
    return null;
  }
  if (last === 'й' || last === 'ь') return stem + { gen: 'я', dat: 'ю', ins: 'ем' }[cs]; // Илий, Моисей, Израиль
  if (CONS.includes(last)) {
    const s = STEM[w] ?? w;
    return s + { gen: 'а', dat: 'у', ins: /[жшчщц]$/.test(s) ? 'ем' : 'ом' }[cs]; // Амрам, Павел → Павлу
  }
  if (/[оеиуюыэ]$/.test(w)) return w; // несклоняемые
  return null;
}

/** Главные слова описательных имён безымянных лиц: «Жена Лота» → «жены Лота». */
const HEADS: Record<string, Record<Case, string>> = {
  жена: { gen: 'жены', dat: 'жене', ins: 'женой' },
  дочь: { gen: 'дочери', dat: 'дочери', ins: 'дочерью' },
  наложница: { gen: 'наложницы', dat: 'наложнице', ins: 'наложницей' },
  мать: { gen: 'матери', dat: 'матери', ins: 'матерью' },
  сестра: { gen: 'сестры', dat: 'сестре', ins: 'сестрой' },
  тёща: { gen: 'тёщи', dat: 'тёще', ins: 'тёщей' },
  сын: { gen: 'сына', dat: 'сыну', ins: 'сыном' },
  отец: { gen: 'отца', dat: 'отцу', ins: 'отцом' },
  фараон: { gen: 'фараона', dat: 'фараону', ins: 'фараоном' },
  пророчица: { gen: 'пророчицы', dat: 'пророчице', ins: 'пророчицей' },
};

/**
 * Описательное имя безымянного лица в косвенном падеже, со строчной: «Жена Лота» → «жены Лота»,
 * «Мать сыновей Зеведеевых» → «матери сыновей Зеведеевых». Склоняется только главное слово; если за ним стоит
 * согласуемое прилагательное («Дочь фараонова») или впереди числительное («Семь сынов Скевы»), — null.
 */
function describedCase(name: string, cs: Case): string | null {
  const [head, ...rest] = name.split(' ');
  const h = HEADS[head.toLowerCase()];
  if (!h) return null;
  if (rest.some((w) => /^[а-яё]+(ов|ев|ин)[аоы]?$/.test(w))) return null; // притяжательное прилагательное
  return [h[cs], ...rest].join(' ');
}

/** Имя лица в косвенном падеже или null, если склонение ненадёжно. Безымянные — со строчной. */
export function nameCase(name: string, sex: Sex, cs: Case, unnamed = false): string | null {
  if (unnamed) return describedCase(name, cs);
  const words = name.split(' ');
  const out: string[] = [];
  for (const w of words) {
    const d = declineWord(w, sex, cs);
    if (d === null) return null;
    out.push(d);
  }
  return out.join(' ');
}

/** Название царства в родительном падеже: «Иудея (в Хевроне)» → «Иудеи, в Хевроне»; «весь Израиль» → «всего Израиля». */
export function realmGenitive(over: string): string | null {
  const m = /^(.*?)\s*\((.+)\)$/.exec(over);
  const base = m ? m[1] : over;
  const parts = base.split(' и ').map((part) => {
    const ws = part.split(' ');
    const lead = ws[0] === 'весь' ? 'всего' : ws[0] === 'вся' ? 'всей' : null;
    const rest = lead ? ws.slice(1) : ws;
    // у мест на -ь род мужской (Израиль); на -а, -я, -ия — женский
    const sex: Sex = /[ая]$/.test(rest[rest.length - 1] ?? '') ? 'f' : 'm';
    const d = nameCase(rest.join(' '), sex, 'gen');
    return d === null ? null : (lead ? `${lead} ` : '') + d;
  });
  if (parts.some((x) => x === null)) return null;
  return parts.join(' и ') + (m ? `, ${m[2]}` : '');
}

// ---------- родство ----------

/**
 * Термины родства из данных (`kin[].rel`) с творительным падежом и обратным термином.
 * Термин записан у того, кого он описывает: у Иохаведы `{ id: amram, rel: 'тётка' }` — Иохаведа тётка Амрама.
 * `ins` — для строки в карточке самого описанного лица: «Приходится тёткой Амраму».
 * `rev` — термин для второго лица по его полу: Амрам — племянник Иохаведы (для справки и проверок).
 */
export const KIN_TERMS: Record<string, { ins: string; rev: [string | null, string | null] }> = {
  зять: { ins: 'зятем', rev: ['тесть', 'тёща'] },
  тесть: { ins: 'тестем', rev: ['зять', null] },
  тёща: { ins: 'тёщей', rev: ['зять', null] },
  невестка: { ins: 'невесткой', rev: ['свёкор', 'свекровь'] },
  тётка: { ins: 'тёткой', rev: ['племянник', 'племянница'] },
  дядя: { ins: 'дядей', rev: ['племянник', 'племянница'] },
  племянник: { ins: 'племянником', rev: ['дядя', 'тётка'] },
  племянница: { ins: 'племянницей', rev: ['дядя', 'тётка'] },
  бабка: { ins: 'бабкой', rev: ['внук', 'внучка'] },
  мать: { ins: 'матерью', rev: ['сын', 'дочь'] },
  'дочь дяди': { ins: 'дочерью дяди', rev: ['двоюродный брат', 'двоюродная сестра'] },
  'сын дяди': { ins: 'сыном дяди', rev: ['двоюродный брат', 'двоюродная сестра'] },
  'двоюродный брат': { ins: 'двоюродным братом', rev: ['двоюродный брат', 'двоюродная сестра'] },
  'младший брат': { ins: 'младшим братом', rev: ['старший брат', 'старшая сестра'] },
  родственник: { ins: 'родственником', rev: ['родственник', 'родственница'] },
  родственница: { ins: 'родственницей', rev: ['родственник', 'родственница'] },
  'близкий родственник': { ins: 'близким родственником', rev: ['близкий родственник', 'близкая родственница'] },
  сродник: { ins: 'сродником', rev: ['сродник', 'сродница'] },
  сродница: { ins: 'сродницей', rev: ['сродник', 'сродница'] },
  'сын царя': { ins: 'сыном царя', rev: [null, null] },
  возлюбленная: { ins: 'возлюбленной', rev: [null, null] },
  совоспитанник: { ins: 'совоспитанником', rev: ['совоспитанник', null] },
};

/** «зять (по толкованию Лк 3:23)» → термин «зять» и пояснение «(по толкованию Лк 3:23)». */
export function splitKinTerm(rel: string): { term: string; tail: string } {
  const m = /^(.*?)\s*(\(.+\))$/.exec(rel.trim());
  return m ? { term: m[1], tail: m[2] } : { term: rel.trim(), tail: '' };
}

/** Творительный падеж термина родства или null, если термина нет в словаре. */
export function kinTermIns(rel: string): string | null {
  const { term, tail } = splitKinTerm(rel);
  const t = KIN_TERMS[term.toLowerCase()];
  return t ? t.ins + (tail ? ` ${tail}` : '') : null;
}

/** Обратный термин: кем второе лицо приходится описанному; null — если в словаре его нет. */
export function kinTermReverse(rel: string, otherSex: Sex): string | null {
  const t = KIN_TERMS[splitKinTerm(rel).term.toLowerCase()];
  return t ? t.rev[otherSex === 'f' ? 1 : 0] : null;
}

/** «своему мужу» / «своей жене» — дательный падеж приложения при имени супруга. */
export const ownSpouseDat = (spouseSex: Sex) => bySex(spouseSex, 'своему мужу', 'своей жене');

// ---------- родители и дети по иным указаниям ----------

/** Вид «иного» родителя (`otherParents[].kind`) в карточке ребёнка, § 6: «Приёмная мать», «Приёмный отец». */
const OTHER_PARENT: Record<string, [string, string]> = {
  legal: ['Законный отец', 'Законная мать'],
  adoptive: ['Приёмный отец', 'Приёмная мать'],
  'by-luke': ['Отец по родословию Луки', 'Мать по родословию Луки'],
  ancestor: ['Предок', 'Прародительница'],
  levirate: ['Отец по закону ужичества', 'Мать по закону ужичества'],
  alternative: ['Отец по другому месту Писания', 'Мать по другому месту Писания'],
};

export function otherParentLabel(kind: string, role: 'father' | 'mother'): string {
  const f = OTHER_PARENT[kind];
  return f ? f[role === 'mother' ? 1 : 0] : role === 'mother' ? 'Мать по иному указанию' : 'Отец по иному указанию';
}

/**
 * Обратная подпись — в карточке родителя, § 10: «Приёмные сыновья», «Потомки, названные без промежуточных звеньев».
 * Род и число — по детям группы.
 */
export function otherChildLabel(kind: string, sexes: Sex[]): string {
  const one = sexes.length === 1;
  const allM = sexes.every((s) => s === 'm');
  const allF = sexes.every((s) => s === 'f');
  const noun = one ? bySex(sexes[0], 'сын', 'дочь') : allM ? 'сыновья' : allF ? 'дочери' : 'дети';
  const adj = (m: string, f: string, pl: string) => (one ? bySex(sexes[0], m, f) : pl);
  switch (kind) {
    case 'ancestor':
      return one ? 'Потомок, названный без промежуточных звеньев' : 'Потомки, названные без промежуточных звеньев';
    case 'legal':
      return `${adj('Законный', 'Законная', 'Законные')} ${noun}`;
    case 'adoptive':
      return `${adj('Приёмный', 'Приёмная', 'Приёмные')} ${noun}`;
    case 'by-luke':
      return `${capFirst(noun)} по родословию Луки`;
    case 'levirate':
      return `${capFirst(noun)} по закону ужичества`;
    case 'alternative':
      return `${capFirst(noun)} по другому месту Писания`;
    default:
      return `${capFirst(noun)} по иному указанию`;
  }
}

/**
 * Иисус Христос — единственное в данных лицо, у которого отец только законный (`fatherKind: 'legal'`) и кровного отца нет:
 * у Иосифа — «Законный сын: Иисус Христос, рождённый Марией (Мф 1:16)», у Марии — «Сын: Иисус Христос — зачат от Духа Святаго».
 * Стихи сверены с Синодальным текстом (npm run -s verse): Мф 1:16 «Иосифа, мужа Марии, от Которой родился Иисус»;
 * Мф 1:18 «имеет во чреве от Духа Святаго»; Мф 1:20 «родившееся в Ней есть от Духа Святаго»; Лк 1:35 «Дух Святый найдет на Тебя».
 */
export const MESSIAH_BIRTH = {
  fatherRefs: ['Мф 1:16'],
  mother: { text: 'зачат от Духа Святаго', refs: ['Мф 1:18', 'Мф 1:20', 'Лк 1:35'] },
};

// ---------- иные имена ----------

/**
 * Направление переименования (`altNames[].kind === 'renamed'`): иное имя — прежнее или новое.
 * В данных направление записано словами пояснения: «прежнее имя», «имя до…», или цитатой, где главное имя
 * стоит после глагола наречения («переменил имя его на Иоакима», «отец назвал его Вениамином»).
 * Если таких слов нет — иное имя новое (Израиль, Мара, Валтасар).
 */
export function renamedDirection(note: string | undefined, mainName: string): 'former' | 'new' {
  const n = (note ?? '').toLowerCase().replace(/ё/g, 'е');
  if (/прежн|имя до(?![а-я])|до наречения|до завета/.test(n)) return 'former';
  // основа главного имени без окончания: «Сарра» → «сарр», «Варнава» → «варнав», «Вениамин» → «вениамин»
  const stem = mainName.split(' ')[0].toLowerCase().replace(/ё/g, 'е').replace(/[аяйьеоы]$/, '');
  // глагол наречения, за которым в том же предложении (не дальше 4 слов) стоит главное имя
  const naming = /назвала?\s+(?:его|ее)|нарек(?:ши|ла)?\s+(?:ему|ей)\s+имя|прозванн[а-я]*|переменил\s+имя\s+(?:его|ее)\s+на|да будет имя\s+(?:ему|ей)/g;
  for (const m of n.matchAll(naming)) {
    const clause = n.slice(m.index + m[0].length).split(/[;.]/)[0];
    if (clause.split(/[^а-я]+/).filter(Boolean).slice(0, 4).some((w) => w.startsWith(stem))) return 'former';
  }
  return 'new';
}

export const ALT_KIND: Record<string, string> = {
  variant: 'иная форма', title: 'титул', epithet: 'прозвание', foreign: 'иноязычное имя', patronymic: 'по отцу',
};

/** Подпись иного имени в § 4. */
export function altKindLabel(kind: string, note: string | undefined, mainName: string): string {
  if (kind === 'renamed') return renamedDirection(note, mainName) === 'former' ? 'прежнее имя' : 'новое имя';
  return ALT_KIND[kind] ?? kind;
}

// ---------- царствование ----------

/** «Царь Иудеи, в Хевроне» / «Царица Иудеи»; null — если название царства не склоняется надёжно. */
export function reignTitle(over: string, sex: Sex): string | null {
  const g = realmGenitive(over);
  return g === null ? null : `${bySex(sex, 'Царь', 'Царица')} ${g}`;
}
