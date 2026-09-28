/** Строки неба: годы и место лица в подсказке и объявлении, строка выбора второго лица. */
import { byId } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { formatYear, lifeSpanText, shownBirthRange, toHist } from '../../engine/years.ts';
import type { ChronoRow } from '../../data/atlas.ts';
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
 * Строка режима выбора второго лица у верхней кромки неба (D6): что делать и как отменить.
 * Имя — в творительном падеже, если он выводится надёжно («Родство с Давидом», «с женой Лота»), иначе — в именительном после тире.
 */
export function pickBarText(mode: 'kinship' | 'spread', id: string): string {
  const p = byId.get(id)!;
  const what = mode === 'kinship' ? 'Родство' : 'Разворот';
  const ins = nameCase(p.name, p.sex, 'ins', p.unnamed);
  const lead = ins ? `${what} ${withPrep(ins)} ${ins}` : `${what}; первое лицо — ${p.name}`;
  // «выберите», а не «щёлкните»: на сенсорном экране не щёлкают; «Esc — отмена» — в PickBar, только при клавиатуре (MOB-21)
  return `${lead}: выберите второе лицо на небе или найдите его в поле «Найти»`;
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
