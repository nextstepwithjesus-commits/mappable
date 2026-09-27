/** Строки неба: годы и место лица в подсказке и объявлении, строка выбора второго лица. */
import { byId } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { formatYear, lifeSpanText } from '../../engine/years.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import { isPeople } from '../card/Masthead.tsx';
import { affiliation, constellation } from '../card/shared.tsx';
import { nameCase } from '../text/ru.ts';
import { plural } from '../common.tsx';

/** Годы жизни в подсказке, указателе и объявлении — те же округлённые годы, что в паспорте карточки. */
export function lifeText(id: string): string {
  const c = model.value.chrono.get(id);
  if (!c) return '';
  return lifeSpanText(c, { people: isPeople(id) }) || 'время не установлено';
}

/** Созвездие или колено для подсказки и объявления: служебная группа «Прочие лица» не называется. */
export function placeText(id: string): string {
  const p = byId.get(id);
  return (p && constellation(p.group)) ?? affiliation(id)?.text ?? '';
}


/** «с» или «со»: «со Стефаном», но «с Саррой». */
const withPrep = (w: string) => (/^[сзшжщ][^аеёиоуыэюяь]/i.test(w) ? 'со' : 'с');

/**
 * Строка режима выбора второго лица у верхней кромки неба (D6): что делать и как отменить.
 * Имя — в творительном падеже, если он выводится надёжно («Родство с Давидом», «с женой Лота»), иначе — в именительном после тире.
 */
export function pickBarText(mode: 'kinship' | 'spread', id: string): string {
  const p = byId.get(id)!;
  const what = mode === 'kinship' ? 'Родство' : 'Разворот';
  const ins = nameCase(p.name, p.sex, 'ins', p.unnamed);
  const lead = ins ? `${what} ${withPrep(ins)} ${ins}` : `${what}; первое лицо — ${p.name}`;
  return `${lead}: щёлкните второе лицо на небе или найдите его в поле «Найти». Esc — отмена`;
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
 * Флажок меридиана у линейки неба: «990 г. до Р. Х.: живы 186, наверняка 41» (D13; MAP-07).
 * Сказуемое согласуется с числом: «жив 21», «живы 186»; никого — «живых лиц Писания нет».
 */
export function meridianText(t: number, alive: number, sure: number): string {
  const year = formatYear(t);
  if (alive <= 0) return `${year}: живых лиц Писания нет`;
  const verb = alive % 10 === 1 && alive % 100 !== 11 ? 'жив' : 'живы';
  if (sure <= 0) return `${year}: ${verb}\u00A0${alive}, ${alive === 1 ? 'вероятно' : 'все\u00A0— вероятно'}`;
  return `${year}: ${verb}\u00A0${alive}, наверняка\u00A0${sure}`;
}

/**
 * Строка отметок поиска (E10; IX-19): «Отмечено 11 лиц по запросу «Иосиф»»; подсказку «Esc — снять» строка добавляет
 * только там, где есть клавиатура (sky.css). «Отмечено» — безличное: согласуется с любым числом («Отмечено 1 лицо»).
 */
export function pinBarText(n: number, query: string): string {
  const q = query.trim();
  return `Отмечено ${n} ${plural(n, 'лицо', 'лица', 'лиц')}${q ? ` по запросу «${q}»` : ''}`;
}
