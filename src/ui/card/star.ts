/**
 * Строки карточки у звезды и у ромба союза (этап 11, решение 77; прежде — карточки древа, решение 73): годы, уточнение,
 * возраст при смерти, вид союза, команда детей союза, пустое место неназванного супруга (решение 75), «другие сыновья
 * и дочери» (Быт 5:4), знаки лент у имени. Всё — из данных со стихами; склонение — только функцией ru.ts.
 */
import { signal } from '@preact/signals';
import { byId, lineMembership, loadCard, loadedCard, loadedChrono } from '../../data/atlas.ts';
import type { Fact } from '../../data/types.ts';
import type { Union, Unions } from '../../engine/unions.ts';
import { yearsWord } from '../../engine/years.ts';
import { model } from '../../state.ts';
import { lifeText } from '../sky/text.ts';
import { isPeople } from './Masthead.tsx';
import { isClaimUnion } from '../linkwords.ts';
import { bySex, lowerFirst, nameCase, otherParentLabel } from '../text/ru.ts';
import { typo } from '../text/typo.ts';

const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : '');
const gen = (id: string) => {
  const p = byId.get(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
};

// ---------- строки лица ----------

/** Годы лица, как в паспорте карточки: «4174–3244 гг. до Р. Х.», «время не установлено». */
export function yearsLine(id: string): string {
  if (!byId.has(id)) return '';
  return typo(lifeText(id, { when: false }) || (isPeople(id) ? 'без года' : 'время не установлено'));
}

/** Уточнение одноимённого — коротко, одной строкой (скобки — через запятую). */
export const disLine = (id: string) => typo((byId.get(id)?.disambig ?? '').replace(/\s*\(([^)]*)\)/g, ', $1'));

/** На каких линиях Мессии лицо: знаки лент у имени (золотая точка — Мф 1, лазурная — Лк 3). */
export const onLines = (id: string) => ({ mt: lineMembership.joseph.has(id), lk: lineMembership.mary.has(id) });

// ---------- тела карточек: «другие дети» и возраст ----------

/** Растёт, когда пришёл том карточек: карточка у звезды перечитывает записи о детях и возраст. */
export const cardsTick = signal(0);
const asked = new Set<string>();
/** Подгрузить тома карточек лиц (записи § 10 о детях без имён, возраст при смерти, опоры года). */
export function askCards(ids: Iterable<string>) {
  const vols = new Map<string, string>();
  for (const id of ids) {
    const p = byId.get(id);
    if (!p || asked.has(p.volume) || loadedCard(id)) continue;
    vols.set(p.volume, id);
  }
  for (const [vol, id] of vols) {
    asked.add(vol);
    loadCard(id)
      .then(() => cardsTick.value++)
      .catch(() => asked.delete(vol));
  }
}

/** Возраст при смерти по числу текста (Быт 5:5 — 930 лет) или null. */
export function ageAtDeath(id: string): number | null {
  void cardsTick.value;
  const a = loadedChrono(id)?.died?.age;
  return typeof a === 'number' ? a : null;
}

/** Возраст при смерти по числу текста: «жил 930 лет» (Быт 5:5); нет числа — пустая строка. */
export function ageLine(id: string): string {
  const p = byId.get(id);
  const age = ageAtDeath(id);
  return p && age !== null ? typo(`${bySex(p.sex, 'жил', 'жила')} ${yearsWord(age)}`) : '';
}

/** Запись § 10 о детях без имён: «родил сынов и дочерей» (Быт 5:4, 11:11…) — у отца. */
const UNNAMED_KIDS = /(сынов|сыновей) и дочерей/;
export function othersNote(fatherCard: { childrenNote?: Fact[] } | null | undefined): Fact | null {
  return fatherCard?.childrenNote?.find((f) => UNNAMED_KIDS.test(f.text) && !/о матери/.test(f.text)) ?? null;
}

/**
 * Союз, у которого стоит строка «другие сыновья и дочери» отца: единственный союз отца с детьми, иначе его союз без
 * названной матери. Если союзов с детьми несколько и все с матерями — не ставится: текст не говорит, от какого союза дети.
 */
export function othersUnionOf(U: Unions, father: string): Union | null {
  const own = (U.of.get(father) ?? []).filter((u) => u.a === father && !u.claim && u.kids.length);
  if (own.length === 1) return own[0];
  return own.find((u) => !u.b) ?? null;
}

// ---------- строки союза ----------

/** Помета уровня достоверности (П-4). */
const CERT: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };
const marked = (s: string, cert?: string) => (cert && CERT[cert] ? `${s}, ${CERT[cert]}` : s);

/**
 * Вид союза одной строкой: «Ева — жена Адама», «Хеттура — наложница Авраама», «имя жены в Писании не названо»,
 * «Иосиф — законный отец», «отец по родословию Луки». Склонение — только функцией ru.ts, иначе без имени.
 */
export function unionKindLine(u: Union): string {
  if (isClaimUnion(u)) return marked(lowerFirst(otherParentLabel(u.claim!, u.a ? 'father' : 'mother')), u.kidsCert);
  if (u.claim === 'legal' && u.a) return marked(`${nameOf(u.a)} — законный отец`, u.kidsCert);
  const named = u.a ?? u.b;
  if (named && isPeople(named)) return '';
  if (!u.b) return marked('имя жены в Писании не названо', u.kidsCert);
  if (!u.a) return marked('имя мужа в Писании не названо', u.kidsCert);
  if (u.kind === 'wife' || u.kind === 'concubine') {
    const word = u.kind === 'concubine' ? 'наложница' : 'жена';
    const g = gen(u.a);
    return marked(g ? `${nameOf(u.b)} — ${word} ${g}` : `${word}: ${nameOf(u.b)}`, u.cert);
  }
  return marked('отец и мать детей', u.kidsCert);
}

/**
 * Команда раскрытия детей союза: подпись, имя для диктора и число. Часть детей уже на небе — «Раскрыть ещё (6)»: полное —
 * в имени и подсказке (видимая подпись — начало имени, WCAG 2.5.3).
 */
export function kidsCommand(u: Union, open: boolean, hidden: number): { text: string; label?: string; open: boolean } | null {
  if (open) return { text: 'Свернуть детей', open: true };
  if (!u.kids.length || hidden <= 0) return null;
  if (hidden === u.kids.length) return { text: `Раскрыть детей (${hidden})`, open: false };
  return { text: `Раскрыть ещё (${hidden})`, label: `Раскрыть ещё (${hidden}): остальных детей союза`, open: false };
}

/** Старший ребёнок союза по году рождения в текущей модели (у детей без года — по порядку данных). */
function eldest(u: Union): string | null {
  const ch = model.peek().chrono;
  const at = new Map(u.kids.map((k, i) => [k, i]));
  return [...u.kids].sort((x, y) => (ch.get(x)?.b ?? 1e9) - (ch.get(y)?.b ?? 1e9) || at.get(x)! - at.get(y)!)[0] ?? null;
}

/**
 * Пустое место союза (решение 75): кем приходится неназванное лицо — «Жена Сифа», строкой ниже — чья мать: «мать Еноса»;
 * детей несколько — «мать Ира и других детей» (всех не перечисляем). Для мужа — «Муж …», «отец …». Склонение — только
 * функцией ru.ts; если имя надёжно не склоняется — «Жена» и «муж — Сиф».
 */
export function unnamedLines(u: Union, role: 'a' | 'b'): { title: string; sub: string } {
  const wife = role === 'b';
  const other = wife ? u.a : u.b;
  const og = other ? gen(other) : null;
  const title = og ? `${wife ? 'Жена' : 'Муж'} ${og}` : wife ? 'Жена' : 'Муж';
  const k = eldest(u);
  const kg = k ? gen(k) : null;
  const parent = wife ? 'мать' : 'отец';
  let sub = '';
  if (k) sub = u.kids.length === 1 ? (kg ? `${parent} ${kg}` : `${parent}: ${nameOf(k)}`) : kg ? `${parent} ${kg} и других детей` : `${parent} детей: ${nameOf(k)} и другие`;
  else if (other && !og) sub = `${wife ? 'муж' : 'жена'} — ${nameOf(other)}`;
  return { title, sub };
}

/** Одной строкой (для диктора и подписи): «Жена Сифа (мать Еноса), имя в Писании не названо». */
export function unnamedText(u: Union, role: 'a' | 'b'): string {
  const { title, sub } = unnamedLines(u, role);
  return `${title}${sub ? ` (${sub})` : ''}, имя в Писании не названо`;
}
