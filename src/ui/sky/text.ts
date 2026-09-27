/** Строки неба: годы и место лица в подсказке и объявлении, строка выбора второго лица. */
import { byId } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { lifeSpanText } from '../../engine/years.ts';
import { isPeople } from '../card/Masthead.tsx';
import { affiliation, constellation } from '../card/shared.tsx';
import { nameCase } from '../text/ru.ts';

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
