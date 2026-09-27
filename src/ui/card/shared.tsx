/** Общие помощники карточки: ссылка на лицо в родительном падеже, строки года рождения и смерти. */
import { byId } from '../../data/atlas.ts';
import { P } from '../common.tsx';
import { genitive } from '../../engine/kinship.ts';
import { formatYear, formatSpan, yearsWord } from '../../engine/years.ts';

/** Ссылка на лицо с именем в родительном падеже («после рождения Иехонии»). */
export function PG({ id }: { id: string }) {
  const p = byId.get(id);
  return <P id={id}>{p ? genitive(p.name, p.sex) : id}</P>;
}

export function birthLine(b: number, lo: number, hi: number, cls: string): string {
  if (cls === 'exact') return `${formatYear(b)}`;
  if (cls === 'calculated') return `ок. ${formatYear(b).replace(/^ок\.\s/, '')}`;
  const span = Math.round(hi - lo);
  return `ок. ${formatYear(b)}; возможный промежуток — ${formatSpan(lo, hi)} (${yearsWord(span)})`;
}
export function deathLine(b: number, d: number, cls: string): string {
  const age = Math.round(d - b);
  return `${cls === 'exact' ? '' : 'ок. '}${formatYear(d)}, в возрасте ${yearsWord(age)}`;
}
