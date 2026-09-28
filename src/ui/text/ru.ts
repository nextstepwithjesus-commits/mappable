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

/**
 * Слово имени на гласную + «а» («Далуиа», «Иешуа») само не склоняется. Если в тексте у того же лица есть форма на «-ия»
 * («Далуия», 1 Пар 3:1), косвенные падежи строятся от неё: «Далуии», как «Марии» (CARD-86). forms — другие формы имени
 * лица из данных (alt).
 */
export function declinableForm(w: string, forms: readonly string[]): string {
  if (!/[аеёиоуыэюя]а$/.test(w) || !forms.length) return w;
  const ia = `${w.slice(0, -1)}я`;
  return /ия$/.test(ia) && forms.some((f) => f.split(' ').includes(ia)) ? ia : w;
}

/** Имя лица в косвенном падеже или null, если склонение ненадёжно. Безымянные — со строчной. forms — другие формы имени. */
export function nameCase(name: string, sex: Sex, cs: Case, unnamed = false, forms: readonly string[] = []): string | null {
  if (unnamed) return describedCase(name, cs);
  const words = name.split(' ');
  const out: string[] = [];
  for (const w of words) {
    const d = declineWord(declinableForm(w, forms), sex, cs);
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

/**
 * Название царства в творительном падеже после «над»: «Иудея (в Хевроне)» → «Иудеей, в Хевроне»;
 * «весь Израиль» → «всем Израилем» (2 Цар 5:5: «царствовал… над всем Израилем и Иудою»). null — если не склоняется.
 */
export function realmInstrumental(over: string): string | null {
  const m = /^(.*?)\s*\((.+)\)$/.exec(over);
  const base = m ? m[1] : over;
  const parts = base.split(' и ').map((part) => {
    const ws = part.split(' ');
    const lead = ws[0] === 'весь' ? 'всем' : ws[0] === 'вся' ? 'всей' : null;
    const rest = lead ? ws.slice(1) : ws;
    const sex: Sex = /[ая]$/.test(rest[rest.length - 1] ?? '') ? 'f' : 'm';
    const d = nameCase(rest.join(' '), sex, 'ins');
    return d === null ? null : (lead ? `${lead} ` : '') + d;
  });
  if (parts.some((x) => x === null)) return null;
  return parts.join(' и ') + (m ? `, ${m[2]}` : '');
}

// ---------- числа ----------

const NB = ' ';

/**
 * Возраст после «в возрасте» — родительный падеж (CARD-50): «в возрасте 1 года», «21 года», «34 лет», «120 лет».
 * Именительный («34 года») здесь — ошибка: yearsWord из src/engine/years.ts — только для «N лет» без предлога.
 */
export function yearsGen(n: number): string {
  const a = Math.abs(n) % 100;
  return `${n}${NB}${a % 10 === 1 && a !== 11 ? 'года' : 'лет'}`;
}

/** Числительные словами (все падежи): начало основы → значение. Длинные основы — раньше коротких. */
const NUM_WORDS: [RegExp, number][] = [
  [/^одиннадцат/, 11], [/^двенадцат/, 12], [/^тринадцат/, 13], [/^четырнадцат/, 14], [/^пятнадцат/, 15],
  [/^шестнадцат/, 16], [/^семнадцат/, 17], [/^восемнадцат/, 18], [/^девятнадцат/, 19],
  [/^двадцат/, 20], [/^тридцат/, 30], [/^сорок/, 40], [/^пят[ьи]десят/, 50], [/^шест[ьи]десят/, 60],
  [/^сем[ьи]десят/, 70], [/^(восем[ьи]|восьми)десят/, 80], [/^девяност/, 90],
  [/^(двест|двухсот)/, 200], [/^(трист|тр[её]хсот)/, 300], [/^(четырест|четыр[её]хсот)/, 400],
  [/^пят(ьсот|исот)/, 500], [/^шест(ьсот|исот)/, 600], [/^сем(ьсот|исот)/, 700], [/^восем(ьсот|исот)|^восьмисот/, 800],
  [/^девят(ьсот|исот)/, 900], [/^(сто|ста|стам)$/, 100], [/^десят/, 10],
  [/^(один|одна|одно|одного|одному|одним|одной)$/, 1], [/^(два|две|двух|двум|двумя)$/, 2], [/^(три|тр[её]х|тр[её]м|тремя)$/, 3],
  [/^(четыре|четыр[её]х|четыр[её]м|четырьмя)$/, 4], [/^(пять|пяти|пятью)$/, 5], [/^(шесть|шести|шестью)$/, 6],
  [/^(семь|семи|семью)$/, 7], [/^(восемь|восьми|восемью)$/, 8], [/^(девять|девяти|девятью)$/, 9],
];
const numWord = (w: string): number | null => NUM_WORDS.find(([re]) => re.test(w))?.[1] ?? null;

/**
 * Первое число в начале текста — цифрами или словами, в любом падеже: «Двенадцати лет остался в храме» → 12,
 * «В сорок лет взял в жёны…» → 40, «30 лет. …» → 30. Ищется в первых пяти словах; null — числа там нет.
 * Нужно, чтобы возраст на полях события не повторял возраст, названный словами в самом тексте (CARD-68).
 */
export function leadingNumber(text: string): number | null {
  const words = text.toLowerCase().replace(/ё/g, 'е').split(/[^а-я0-9]+/).filter(Boolean).slice(0, 5);
  for (let i = 0; i < words.length; i++) {
    if (/^\d+$/.test(words[i])) return Number(words[i]);
    let v = numWord(words[i]);
    if (v === null) continue;
    for (let k = i + 1; k < words.length; k++) {
      const x = numWord(words[k]);
      if (x === null || x >= v) break;
      v += x;
    }
    return v;
  }
  return null;
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
  // «дочь дяди своего» (Есф 2:7): в строке владельца — «Приходится двоюродной сестрой Мардохею: дочь его дяди Абихаила»
  'дочь дяди': { ins: 'двоюродной сестрой', rev: ['двоюродный брат', 'двоюродная сестра'] },
  'сын дяди': { ins: 'двоюродным братом', rev: ['двоюродный брат', 'двоюродная сестра'] },
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

/** Термины, которые в строке владельца пересказаны другим словом, — с термином Писания после двоеточия (П-8). */
export const KIN_TERM_QUOTED = new Set(['дочь дяди', 'сын дяди']);

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

// ---------- § 10: подписи групп детей и потомков ----------

/**
 * Имя народа во множественном числе (Быт 10: «От Мицраима произошли Лудим, Анамим…», Быт 10:13–14):
 * «Лудим», «Кафторим», «Филистимляне». Народы с именем в единственном числе («Иевусей», «Аморрей») Писание называет
 * сыновьями («Ханаан родил… Иевусея», Быт 10:15–16), и подпись «Сын», «Внук» к ним подходит.
 */
export const pluralPeopleName = (name: string, kind: string) => (kind === 'people' || kind === 'clan') && /(им|[ая]не)$/.test(name);

/** «Сын», «Дочь», «Сыновья», «Дочери», «Дети» — по полу и числу детей группы. */
export function childrenNoun(sexes: Sex[]): string {
  if (sexes.length === 1) return bySex(sexes[0], 'Сын', 'Дочь');
  if (sexes.every((s) => s === 'm')) return 'Сыновья';
  if (sexes.every((s) => s === 'f')) return 'Дочери';
  return 'Дети';
}

/** «Сыновья, мать которых не названа», «Дочь, отец которой не назван» — у детей, второй родитель которых в Писании не назван. */
export function unnamedParentLabel(sexes: Sex[], ownerSex: Sex): string {
  const which = sexes.length === 1 ? bySex(sexes[0], 'которого', 'которой') : 'которых';
  return `${childrenNoun(sexes)}, ${ownerSex === 'f' ? `отец ${which} не назван` : `мать ${which} не названа`}`;
}

/** «Внук», «Внучки», «Правнуки»: gen — 2 (внуки) или 3 (правнуки); по полу и числу. */
export function descendantsNoun(gen: 2 | 3, sexes: Sex[]): string {
  const [m, f, pm, pf] = gen === 2 ? ['Внук', 'Внучка', 'Внуки', 'Внучки'] : ['Правнук', 'Правнучка', 'Правнуки', 'Правнучки'];
  if (sexes.length === 1) return bySex(sexes[0], m, f);
  return sexes.every((s) => s === 'f') ? pf : pm;
}

/**
 * Подпись для народов с именем во множественном числе — без рода и числа лица: у детей — «От него произошли»
 * (у народа-владельца — «От них произошли», как «от которых вышли Филистимляне», Быт 10:14), дальше —
 * «Потомки во втором поколении», «Потомки в третьем поколении».
 */
export function peoplesLabel(gen: 1 | 2 | 3, owner: { sex: Sex; plural: boolean }): string {
  if (gen === 1) return `От ${owner.plural ? 'них' : bySex(owner.sex, 'него', 'неё')} произошли`;
  return `Потомки ${gen === 2 ? 'во втором' : 'в третьем'} поколении`;
}

// ---------- этап 5: карточка как статья ----------

/** «двух», «трёх»…: родительный падеж числительного для «Каждая из трёх»; больше десяти — цифрами. */
export function countGen(n: number): string {
  return ['', 'одного', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти', 'десяти'][n] ?? String(n);
}

/** «Единокровные братья», «Единоутробная сестра», «Единокровные братья и сёстры» — по полу и числу (§ 11; CARD-28). */
export function halfSiblingsLabel(kind: 'paternal' | 'maternal', sexes: Sex[]): string {
  const adj = kind === 'paternal' ? 'Единокровн' : 'Единоутробн';
  if (sexes.length === 1) return sexes[0] === 'f' ? `${adj}ая сестра` : `${adj}ый брат`;
  if (sexes.every((s) => s === 'm')) return `${adj}ые братья`;
  if (sexes.every((s) => s === 'f')) return `${adj}ые сёстры`;
  return `${adj}ые братья и сёстры`;
}

export type DerivedRole =
  | 'grandfather' | 'grandmother' | 'uncle'
  | 'father-in-law' | 'mother-in-law' | 'father-in-law-f' | 'mother-in-law-f' | 'daughter-in-law' | 'son-in-law';

/**
 * Подпись вычисляемого родства (F6; CARD-29): «Дед по отцу», «Дяди и тётки по матери», «Тесть», «Свекровь».
 * -f — свойственники жены: родители мужа — свёкор и свекровь.
 */
export function derivedKinLabel(role: DerivedRole, side: string, count: number, sexes: Sex[] = []): string {
  const sd = side ? ` ${side}` : '';
  switch (role) {
    case 'grandfather':
      return `Дед${sd}`;
    case 'grandmother':
      return `Бабка${sd}`;
    case 'uncle': {
      const allM = sexes.every((s) => s === 'm');
      const allF = sexes.every((s) => s === 'f');
      if (count === 1) return `${allF ? 'Тётка' : 'Дядя'}${sd}`;
      return `${allM ? 'Дяди' : allF ? 'Тётки' : 'Дяди и тётки'}${sd}`;
    }
    case 'father-in-law':
      return 'Тесть';
    case 'mother-in-law':
      return 'Тёща';
    case 'father-in-law-f':
      return 'Свёкор';
    case 'mother-in-law-f':
      return 'Свекровь';
    case 'daughter-in-law':
      return count > 1 ? 'Невестки' : 'Невестка';
    case 'son-in-law':
      return count > 1 ? 'Зятья' : 'Зять';
  }
}

/** Подпись строки мест § 15 по роли места (F7; CARD-30): «Родился», «Жила», «Бывал», «События»; у народа — без глагола лица. */
export function placeRoleLabel(role: string, sex: Sex, people = false): string {
  if (people) return ({ birth: 'Происхождение', residence: 'Жили', travel: 'Бывали', other: 'События', death: 'Гибель', burial: 'Погребение' } as Record<string, string>)[role] ?? 'Места';
  const f = sex === 'f';
  switch (role) {
    case 'birth':
      return f ? 'Родилась' : 'Родился';
    case 'residence':
      return f ? 'Жила' : 'Жил';
    case 'travel':
      return f ? 'Бывала' : 'Бывал';
    case 'death':
      return f ? 'Умерла' : 'Умер';
    case 'burial':
      return f ? 'Погребена' : 'Погребён';
    default:
      return 'События';
  }
}
