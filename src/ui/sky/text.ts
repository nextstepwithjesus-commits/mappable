/** Строки неба: годы и место лица в подсказке и объявлении, строки подсказки звезды и ленты, строка выбора второго лица. */
import { byId, lines } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { formatSpan, formatYear, lifeSpanText, shownBirthRange, toAstro, toHist } from '../../engine/years.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Epoch } from '../../data/types.ts';
import { orderSource } from '../../render/trails.ts';
import { isPeople } from '../card/Masthead.tsx';
import { affiliation, birthRange, constellation } from '../card/shared.tsx';
import { nameCase } from '../text/ru.ts';
import { plural, refLabel } from '../common.tsx';
import { typo } from '../text/typo.ts';

/**
 * Годы жизни в подсказке, указателе и объявлении — те же округлённые годы, что в паспорте карточки.
 * У лица «время не установлено» — и откуда взято его время (MAP-52): «время не установлено; упомянут в Быт 14:13»,
 * «…; современник Авраама». when: false — без этого (узкие строки подсказок поиска и «Родства»).
 */
export function lifeText(id: string, { when = true }: { when?: boolean } = {}): string {
  const c = model.value.chrono.get(id);
  if (!c) return '';
  const years = lifeSpanText(c, { people: isPeople(id) });
  if (years) return years;
  const from = when && c.cls === 'epochal' && !isPeople(id) ? whenText(id) : null;
  return from ? `время не установлено; ${from.charAt(0).toLowerCase()}${from.slice(1)}` : 'время не установлено';
}

/**
 * Промежуток оценочного года рождения для подсказки звезды (G5): «Родился между 1020 и 990 гг. до Р. Х.».
 *
 * Почему промежуток словами, а не «ок. 1005 г. до Р. Х. (±15)»:
 *  — «±15» — знак погрешности измерения; читателю-непрофессионалу он незнаком и обещает симметричную ошибку,
 *    а промежуток из данных бывает несимметричным: его края подрезают границы из текста («не раньше Потопа»);
 *  — «между … и …» называет те же годы, что § 8 карточки («возможный промежуток — 1020–990 гг. до Р. Х.») и что
 *    пунктирное начало следа на небе, — читатель видит одни и те же числа везде.
 * Годы — те же, что в § 8: birthRange (границы из данных) и shownBirthRange (округление до 5 или 10 лет).
 * null — год не оценочный (точный, расчётный), лицо — народ или род, промежуток вырождается в точку.
 */
export function birthSpanText(id: string): string | null {
  const p = byId.get(id);
  const c = model.value.chrono.get(id);
  if (!p || !c || c.cls !== 'estimated' || isPeople(id)) return null;
  const [bLo, bHi] = birthRange(id, c, model.value.chrono);
  const [lo, hi] = shownBirthRange({ ...c, bLo, bHi });
  if (!(hi > lo)) return null;
  return typo(`${p.sex === 'f' ? 'Родилась' : 'Родился'} между ${betweenYears(lo, hi)}`);
}

/**
 * Строка лет подсказки звезды (MAP-53): рождение — одной строкой, с пометой расчёта и возможным промежутком:
 *  — «род. ок. 1780 г. до Р. Х. (расч.), между 1805 и 1755 гг.» — оценка без года смерти;
 *  — «ок. 1010–970 гг. до Р. Х. (расч.); род. между 1015 и 1005 гг.» — оценка с годом смерти;
 *  — «4174–3244 гг. до Р. Х. (расч.)», «ок. 1040–970 гг. до Р. Х. (расч.)» — год по модели хронологии (П-6: все годы — расчёт);
 *  — год, оценённый по порядку перечисления братьев (ChronoRow.byOrder), помечен «(выв.)», как в паспорте карточки;
 *    если подсказка объясняет порядок своей строкой (orderText), помета стоит там, а здесь её нет (mark: false);
 *  — лицо «время не установлено» и народ — как lifeText, без пометы.
 * Годы и промежуток — те же, что в паспорте и § 8 (lifeText, birthRange, shownBirthRange).
 */
export function tipYears(id: string, { mark = true }: { mark?: boolean } = {}): string {
  const p = byId.get(id);
  const c = model.value.chrono.get(id);
  const life = lifeText(id);
  if (!p || !c || c.cls === 'epochal' || isPeople(id) || c.named) return life;
  const note = !mark ? '' : c.byOrder ? ' (выв.)' : ' (расч.)';
  // знак у первого засвидетельствованного года (решение 38; MAP-69): точки рождения нет — промежуток и год свидетельства
  if (c.mark !== undefined) {
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    const [lo, hi] = shownBirthRange({ ...c, bLo, bHi });
    const born = hi > lo ? `род. между ${betweenYears(lo, hi)}` : `род. ${formatYear(lo, { approx: true })}`;
    const died = c.d !== null ? `; ум. ${formatYear(c.d, { approx: c.cls === 'estimated' })}` : '';
    return typo(`${born}; первое свидетельство — ${formatYear(c.mark)}${note}${died}`);
  }
  let span = '';
  if (c.cls === 'estimated') {
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    const [lo, hi] = shownBirthRange({ ...c, bLo, bHi });
    if (hi > lo) span = betweenShort(lo, hi);
  }
  if (!span) return typo(`${life}${note}`);
  return typo(life.startsWith('род.') ? `${life}${note}, между ${span}` : `${life}${note}; род. между ${span}`);
}

/** Концы промежутка рождения после «между» в строке, где эра уже названа: «1805 и 1755 гг.»; разные эры — полностью. */
function betweenShort(a: number, b: number): string {
  const ha = toHist(a);
  const hb = toHist(b);
  if (ha < 0 && hb < 0) return `${-ha} и ${-hb} гг.`;
  if (ha > 0 && hb > 0) return `${ha} и ${hb} гг.`;
  return betweenYears(a, b);
}

/**
 * Строка подсказки ребёнка, чей год оценён по порядку перечисления (UX-73; решение 41): «год оценён по порядку
 * перечисления (1 Пар 3:1–4), выв.». Ссылка — место, где Писание называет детей по порядку (orderSource,
 * src/render/trails.ts; у сыновей Иакова — рассказ о рождениях). null — год оценён не по порядку или места нет.
 */
export function orderText(id: string): string | null {
  const c = model.value.chrono.get(id);
  if (!c?.byOrder) return null;
  const src = orderSource(id, model.value);
  return src ? typo(`год оценён по порядку перечисления (${src}), выв.`) : null;
}

/**
 * Подсказка пометы порядка у детей на небе (UX-73; решение 41): «Годы рождения этих детей оценены по порядку, в котором
 * их называет 1 Пар 3:1–4, выв.». source — место перечисления (FamilyHit.source, src/render/trails.ts).
 */
export const orderNoteText = (source: string) => typo(`Годы рождения этих детей оценены по порядку, в котором их называет ${source}, выв.`);

/** Строка подсказки лица с разрывом следа «//» (MAP-51; решение 24; NodeRow.brk). */
export const BREAK_TEXT = 'родословие, вероятно, называет не все поколения (выв.)';

/**
 * Номер у бусины в режиме «только линии» (UX-69; решение 39): «Мф 17» — 17-й по счёту Мф 1:2–16, где Авраам — первый
 * (так считает Мф 1:17: «от Авраама до Давида четырнадцать родов»); «Лк 39» — 39-й по счёту Лк 3:23–38, где первый —
 * Иосиф: Лука идёт от Иисуса вверх («Сын Иосифов, Илиев…», Лк 3:23), до Адама — 75-го.
 */
export function countText(book: 'Мф' | 'Лк', n: number): string {
  return typo(book === 'Мф' ? `«Мф ${n}» — ${n}-й в родословии Мф 1:2–16, считая от Авраама` : `«Лк ${n}» — ${n}-й в родословии Лк 3:23–38, считая от Иосифа`);
}

/**
 * Подсказка шага ленты (E6; MAP-28; решение 54): родство словами, без стрелки и без подстановки имени в падеж — каждое
 * имя стоит в именительном со своим словом: «Давид, отец; Соломон, сын (Мф 1:6)». Стих — ссылка шага в своей линии
 * (Мф у линии Иосифа, Лк у линии по Луке), иначе первая ссылка шага. Пометы шага: «по закону» (Иосиф — Иисус, Мф 1:16),
 * «толк.» (Илий — Мария), «у Мф опущен» (Охозия, Иоас, Амасия; Мф 1:8), «только у Лк» (Каинан, Лк 3:36).
 * flip — лазурная линия показана как второе родословие Иосифа (Лк 3:23): шаг «Илий — Иосиф» — прямо по тексту.
 */
export function ribbonStepText(line: 'joseph' | 'mary', from: string, to: string, flip = false): string {
  const a = byId.get(from);
  const b = byId.get(to);
  if (!a || !b) return '';
  const flipped = flip && line === 'mary' && to === 'iosif-muzh-marii';
  const st = lines[line].persons.find((x) => x.id === (flipped ? 'mariya' : to));
  const flag = flipped ? 'in-text' : (st?.flag ?? 'in-text');
  const book = line === 'joseph' ? 'Мф' : 'Лк';
  const ref = st?.refs.find((r) => r.startsWith(`${book} `)) ?? st?.refs[0];
  const parent = a.sex === 'f' ? 'мать' : 'отец';
  const child = b.sex === 'f' ? 'дочь' : 'сын';
  const rel = flag === 'legal' ? `${a.name}, ${parent} по закону; ${b.name}, ${child}` : `${a.name}, ${parent}; ${b.name}, ${child}`;
  const tail = { interpretation: ', толк.', 'omitted-by-mt': '; у Мф опущен', 'luke-only': '; только у Лк' }[flag] ?? '';
  return typo(`${rel}${ref ? ` (${refLabel(ref)})` : ''}${tail}`);
}

/** Подсказка названия эпохи в служебной строке неба (UX-65): «Эпоха «Судьи»: ок. 1375–1050 гг. до Р. Х.; щёлкните — …». */
export function epochGoText(e: Pick<Epoch, 'id' | 'name' | 'start' | 'end'>): string {
  // оценочные границы — у судей и завоевания, как у отрезков ярусов эпох (render/tiers.ts)
  const soft = e.id === 'judges' || e.id === 'conquest';
  return typo(`Эпоха «${e.name}»: ${formatSpan(toAstro(e.start), toAstro(e.end), soft)}; щёлкните — небо покажет эпоху`);
}

/** «1020 и 990 гг. до Р. Х.», «5 г. до Р. Х. и 10 г. по Р. Х.»: концы промежутка (астр.) после «между». */
export function betweenYears(a: number, b: number): string {
  const ha = toHist(a);
  const hb = toHist(b);
  if (ha < 0 && hb < 0) return `${-ha} и ${-hb} гг. до Р. Х.`;
  if (ha > 0 && hb > 0) return `${ha} и ${hb} гг. по Р. Х.`;
  return `${formatYear(a)} и ${formatYear(b)}`;
}

/** Созвездие или колено для подсказки и объявления: служебная группа «Прочие лица» не называется. */
export function placeText(id: string): string {
  const p = byId.get(id);
  return (p && constellation(p.group)) ?? affiliation(id)?.text ?? '';
}


/** «с» или «со»: «со Стефаном», но «с Саррой». */
const withPrep = (w: string) => (/^[сзшжщ][^аеёиоуыэюяь]/i.test(w) ? 'со' : 'с');

/**
 * Откуда время лица «время не установлено» (MAP-52; ChronoRow.when) — строкой подсказки звезды под «время не
 * установлено»: «Упомянут в Быт 14:13» (эпоха главы первого упоминания), «Современник Авраама» (встреча по тексту),
 * «Одного поколения с Беэрой» (брат или сестра, названные Писанием). null — время взято из эпохи, границ данных или
 * годов созвездия, или имя не склоняется надёжно: тогда строки нет, падеж не подставляется наугад.
 */
export function whenText(id: string): string | null {
  const p = byId.get(id);
  const c = model.value.chrono.get(id);
  const w = c?.cls === 'epochal' ? c.when : undefined;
  if (!p || !w) return null;
  const f = p.sex === 'f';
  if (w.by === 'mention' && w.ref) return typo(`${f ? 'Упомянута' : 'Упомянут'} в ${refLabel(w.ref)}`);
  const o = w.id ? byId.get(w.id) : undefined;
  if (!o || o.unnamed) return null;
  if (w.by === 'met') {
    const g = nameCase(o.name, o.sex, 'gen');
    return g ? typo(`${f ? 'Современница' : 'Современник'} ${g}`) : null;
  }
  if (w.by === 'kin') {
    const i = nameCase(o.name, o.sex, 'ins');
    return i ? typo(`Одного поколения ${withPrep(i)} ${i}`) : null;
  }
  return null;
}

/**
 * Строка режима выбора второго лица у верхней кромки неба (D6): что делать и как отменить. Вместе с «— отменить (Esc)»
 * она помещается в 560 px (IX-81): на небе 1024 px с карточкой не обрезается.
 * Имя — в творительном падеже, если он выводится надёжно («Родство с Давидом», «с женой Лота»); иначе строка без имени
 * («Родство: выберите…»): первое лицо и так в карточке, а имя в именительном после «Родство» читалось бы как падеж.
 */
export function pickBarText(mode: 'kinship' | 'spread', id: string): string {
  const p = byId.get(id)!;
  const what = mode === 'kinship' ? 'Родство' : 'Разворот';
  const ins = nameCase(p.name, p.sex, 'ins', p.unnamed);
  const lead = ins ? `${what} ${withPrep(ins)} ${ins}` : what;
  // «выберите», а не «щёлкните»: на сенсорном экране не щёлкают; «Esc — отмена» — в PickBar, только при клавиатуре (MOB-21)
  return `${lead}: выберите второе лицо на небе или через поиск`;
}

/**
 * Кто жив в год t (астр.) — для меридиана (D13; MAP-33). «Наверняка» — год внутри надёжной части жизни: не раньше
 * позднего края рождения и не позже известной смерти или последнего засвидетельствованного события. «Вероятно» — год
 * между оценкой рождения и смерти (или оценкой смерти). Лица, у которых известна только эпоха, не считаются.
 */
export function aliveAt(chrono: Map<string, ChronoRow>, t: number): Map<string, 'sure' | 'likely'> {
  const out = new Map<string, 'sure' | 'likely'>();
  for (const [id, c] of chrono) {
    if (c.cls === 'epochal') continue;
    const end = c.d ?? c.dEst;
    if (t < c.b || t > end) continue;
    const certainEnd = c.d ?? c.last;
    out.set(id, t >= c.bHi && certainEnd !== null && t <= certainEnd ? 'sure' : 'likely');
  }
  return out;
}

/**
 * Флажок меридиана у линейки неба (D13; MAP-07; UX-59): «951 г. до Р. Х.: живы около 291 лица, наверняка — 7».
 * Число — с существительным: «около» — потому что годы большинства лиц оценочные; после «около» — родительный падеж
 * («около 291 лица», «около 186 лиц»). Один — «жив один человек — наверняка»; никого — «живых лиц Писания нет».
 */
export function meridianText(t: number, alive: number, sure: number): string {
  const year = formatYear(t);
  if (alive <= 0) return `${year}: живых лиц Писания нет`;
  if (alive === 1) return `${year}: жив один человек\u00A0— ${sure > 0 ? 'наверняка' : 'вероятно'}`;
  const who = `около\u00A0${alive}\u00A0${alive % 10 === 1 && alive % 100 !== 11 ? 'лица' : 'лиц'}`;
  if (sure <= 0) return `${year}: живы ${who}, все\u00A0— вероятно`;
  return `${year}: живы ${who}, наверняка\u00A0— ${sure}`;
}

/**
 * Строка отметок поиска (E10; IX-19): «Отмечено 11 лиц по запросу «Иосиф»»; подсказку «Esc — снять» строка добавляет
 * только там, где есть клавиатура (sky.css). «Отмечено» — безличное: согласуется с любым числом («Отмечено 1 лицо»).
 */
export function pinBarText(n: number, query: string): string {
  const q = query.trim();
  return `Отмечено ${n} ${plural(n, 'лицо', 'лица', 'лиц')}${q ? ` по запросу «${q}»` : ''}`;
}
