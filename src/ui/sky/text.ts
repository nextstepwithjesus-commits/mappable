/** Строки неба: годы и место лица в подсказке и объявлении, строки подсказки звезды и ленты, строка выбора второго лица. */
import { byId, graph, lines } from '../../data/atlas.ts';
import { kidEdges, type Union } from '../../engine/unions.ts';
import type { PartnerKind } from '../fold.ts';
import type { StepForward } from '../reveal.ts';
import { kidsCount, plateNames, plateSub, unionGen } from '../../render/plates.ts';
import { model } from '../../state.ts';
import { epochSpanText, formatYear, shownBirthRange, toHist } from '../../engine/years.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Epoch } from '../../data/types.ts';
import { personOrderNote } from '../../render/links.ts';
import { isPeople, passportYears } from '../card/Masthead.tsx';
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
  // годы паспорта (решение 96): словарь дат с границами текста (birthRange) — подсказка, указатель и диктор говорят
  // то же, что паспорт и карточка у звезды
  const years = passportYears(id, c, isPeople(id));
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
  // этап 13, решение 96: промежуток — тот же, что в паспорте (словарь дат engine/years.ts с границами текста); у оценки
  // не шире 10 лет паспорт пишет «ок.», и промежутка нет
  const years = passportYears(id, c, false).replace(/\u2060/g, '');
  const m = /род\.[\s\u00a0]+между[\s\u00a0]+(.+?)(?:,[\s\u00a0]+ум\.|;|$)/.exec(years);
  if (!m) return null;
  // «род. между 1580 и 1510, ум. между …» — эра стоит в конце строки паспорта: у промежутка рождения она своя
  let range = m[1].trim();
  if (!/Р\.[\s\u00a0]+Х\./.test(range)) range += /по[\s\u00a0]+Р\.[\s\u00a0]+Х\./.test(years) ? ' гг. по Р. Х.' : ' гг. до Р. Х.';
  return typo(`${p.sex === 'f' ? 'Родилась' : 'Родился'} между ${range}`);
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
  // решение 96: год вычислен от опоры или оценён — «расч.»; порядок перечисления даёт очерёдность, а не год, поэтому
  // «выв.» у года не ставится (его объясняет строка порядка, orderText)
  const note = mark ? ' (расч.)' : '';
  // знак у первого засвидетельствованного года (решение 38; MAP-69): точки рождения нет — промежуток и год свидетельства
  if (c.mark !== undefined) {
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    const [lo, hi] = shownBirthRange({ ...c, bLo, bHi });
    const born = hi > lo ? `род. между ${betweenYears(lo, hi)}` : `род. ${formatYear(lo, { approx: true })}`;
    const died = c.d !== null ? `; ум. ${formatYear(c.d, { approx: c.cls === 'estimated' })}` : '';
    return typo(`${born}; первое свидетельство — ${formatYear(c.mark)}${note}${died}`);
  }
  // годы — словами паспорта (решение 96): промежуток рождения шире 10 лет паспорт уже называет «род. между …»
  return typo(`${life}${note}`);
}


/**
 * Строка подсказки ребёнка, чей год оценён по порядку перечисления (UX-73; решение 41): «год оценён по порядку
 * перечисления (Быт 29:32–35; 30:17–21), выв.». Ссылка — та же, что в строке «Год» карточки у звезды (этап 11, Г9;
 * DG 2.3.6: стихи, где названы дети его союза, — personOrderNote, src/render/links.ts). null — год оценён не по порядку
 * или места нет.
 */
export function orderText(id: string): string | null {
  const c = model.value.chrono.get(id);
  if (!c?.byOrder) return null;
  const note = personOrderNote(id, model.value);
  const src = note ? note.replace(/^по порядку перечисления, /, '').replace(/, выв\.$/, '') : null;
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

/** Лица линии строго между from и to (по порядку data/lines): скрытые в разрыве ленты (К4). */
export function lineBetween(line: 'joseph' | 'mary', from: string, to: string): string[] {
  const ids = lines[line].persons.map((x) => x.id);
  const i = ids.indexOf(from);
  const j = ids.indexOf(to);
  return i >= 0 && j > i ? ids.slice(i + 1, j) : [];
}

/**
 * Подсказка знака «+N» в разрыве ленты (этап 13, решение 93, К4): «скрыто 40 поколений по Лк 3: Нафан … Илий —
 * щёлкните, чтобы показать». Имена — в именительном, без подстановки в падеж.
 */
export function gapTipText(g: { lines: readonly ('joseph' | 'mary')[]; from: string; to: string; n: number }, flip = false): string {
  const hid = lineBetween(g.lines[0], g.from, g.to);
  // источник — по самим скрытым лицам (рецензия этапа 21): линия Иосифа до Авраама — по Быт 5; 11 (Матфей начинает
  // с Авраама, Мф 1:2), от Авраама — по Мф 1; линия по Луке — Лк 3
  const src = g.lines.map((l) => {
    if (l === 'mary') return 'Лк 3';
    const pre = lines.joseph.persons.findIndex((x) => x.id === 'avraam');
    const at = (id: string) => lines.joseph.persons.findIndex((x) => x.id === id);
    const before = hid.some((id) => at(id) >= 0 && at(id) < pre);
    const after = hid.some((id) => at(id) >= pre);
    return before && after ? 'Быт 5; 11 и Мф 1' : before ? 'Быт 5; 11' : 'Мф 1';
  });
  // Лк 3:23 называет Иосифа; Мария на этом месте — по толкованию (переключатель «Лк 3» — второе родословие Иосифа)
  const nameOf = (id: string) => (id === 'mariya' && g.lines.includes('mary') ? (flip ? byId.get('iosif-muzh-marii')?.name : `${byId.get(id)?.name} (по толкованию)`) : byId.get(id)?.name);
  const first = nameOf(hid[0] ?? '');
  const last = nameOf(hid[hid.length - 1] ?? '');
  const who = first ? (hid.length > 1 && last ? `${first} … ${last}` : first) : '';
  return typo(`В этом показе скрыто ${g.n} ${plural(g.n, 'поколение', 'поколения', 'поколений')} по ${src.join(' и ')}${who ? `: ${who}` : ''} — щёлкните, чтобы показать`);
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

/**
 * Подсказка названия эпохи в служебной строке неба (UX-65): «Эпоха «Судьи»: ок. 1375–1050 гг. до Р. Х.; щёлкните — …».
 * Годы границ — словарём дат (решения 96, 99; engine/years.ts, epochSpanText): «ок.» — только у оценочной границы
 * (Epoch.startEst, endEst), как у отрезков ярусов эпох и в листе «Эпохи».
 */
export function epochGoText(e: Epoch): string {
  return typo(`Эпоха «${e.name}»: ${epochSpanText(e)}; щёлкните — небо покажет эпоху`);
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
    // ранний край известной смерти (этап 19, Х-02), но не раньше последнего засвидетельствованного события
    const certainEnd = c.d !== null ? Math.max(c.dLo ?? c.d, c.last ?? -Infinity) : c.last;
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

// ---------- союзы на небе «набор» (решения 70, 76; src/render/plates.ts) ----------

/**
 * «Союз Авраама и Агари» — имена в родительном падеже через склонение (ru.ts); если склонение ненадёжно — без падежа:
 * «Союз: Авраам и Агарь».
 */
export function unionTitle(u: Union): string {
  const gen = unionGen(u);
  return gen ? `Союз ${gen}` : `Союз: ${plateNames(u)}`;
}

/**
 * Дети союза для подсказки — в порядке, в котором их называют данные (порядок текста): до трёх — по имени со стихом
 * («сын Измаил (Быт 16:15)», «сыновья Каин (Быт 4:1), Авель (Быт 4:2) и Сиф (Быт 4:25)»; один стих у всех — один раз),
 * больше — числом и первыми именами («6 сыновей: Зимран, Иокшан, Медан и ещё 3 (Быт 25:2)»). Потомки, названные без
 * промежуточных звеньев, — «потомки», а не «сыновья». Стих — связь ребёнка с родителем союза (engine/unions.ts, kidEdges).
 */
export function unionKidsText(u: Union): string {
  if (!u.kids.length) return kidsCount(u);
  const kids = u.kids;
  const ref = (k: string) => kidEdges(graph, u, k).flatMap((e) => e.refs)[0] ?? null;
  const name = (k: string) => byId.get(k)?.name ?? k;
  const sexes = kids.map((k) => byId.get(k)?.sex ?? 'm');
  const far = u.claim === 'ancestor';
  const noun = far
    ? kids.length === 1
      ? 'потомок'
      : 'потомки'
    : sexes.length === 1
      ? sexes[0] === 'f'
        ? 'дочь'
        : 'сын'
      : sexes.every((s) => s === 'f')
        ? 'дочери'
        : sexes.every((s) => s !== 'f')
          ? 'сыновья'
          : 'дети';
  const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);
  if (kids.length <= 3) {
    const refs = kids.map(ref);
    const one = refs.every((r) => r === refs[0]);
    const list = one ? and(kids.map(name)) : and(kids.map((k, i) => (refs[i] ? `${name(k)} (${refLabel(refs[i]!)})` : name(k))));
    return `${noun} ${list}${one && refs[0] ? ` (${refLabel(refs[0])})` : ''}`;
  }
  const first = ref(kids[0]);
  const count = far ? `${kids.length} ${plural(kids.length, 'потомок', 'потомка', 'потомков')}` : kidsCount(u);
  return `${count}: ${kids.slice(0, 3).map(name).join(', ')} и ещё ${kids.length - 3}${first ? ` (${refLabel(first)})` : ''}`;
}

/** Второе лицо союза не названо: «мать не названа в Писании», «отец не назван в Писании»; оба названы — пусто. */
const missingText = (u: Union) => (u.claim || !u.kids.length || (u.a && u.b) ? '' : u.a ? 'мать не названа в Писании' : 'отец не назван в Писании');

/**
 * Подробная подсказка союза: «Союз Авраама и Агари: сын Измаил (Быт 16:15) — щёлкните, чтобы раскрыть». Брак без детей —
 * вид связи со стихом: «Союз Давида и Мелхолы: жена (1 Цар 18:27); детей не названо — щёлкните, чтобы раскрыть».
 * Нужна там, где щелчок по точке союза раскрывает союз сразу, — при выборе второго лица «Родства», когда карточки у точки
 * нет (src/ui/sky/input.ts); на небе «набор» — однострочная dotTipText.
 */
export function plateTipText(u: Union, open: boolean): string {
  const what = u.kids.length ? [unionKidsText(u), missingText(u)].filter(Boolean).join('; ') : [u.refs[0] ? `${plateSub(u).split('; ')[0]} (${refLabel(u.refs[0])})` : '', kidsCount(u)].filter(Boolean).join('; ');
  // без склонения — имена в именительном после «Союз:», дальше — через точку с запятой
  return typo(`${unionTitle(u)}${unionGen(u) ? ':' : ';'} ${what} — щёлкните, чтобы ${open ? 'свернуть' : 'раскрыть'}`);
}

/**
 * Пункт списка неба для клавиатуры и диктора: «Союз Авраама и Агари; жена; сын; дети скрыты». Состояние детей союза
 * называется только в показе «набор», где союз раскрывают и скрывают (этап 13, X4 Д13; словарь 109: на небе — «скрыть»
 * и «показать»); в прочих показах дети союза на небе и так.
 */
export function plateItemText(u: Union, open: boolean, inSet = true): string {
  return typo(`${unionTitle(u)}; ${plateSub(u)}${inSet ? `; ${open ? 'дети показаны' : 'дети скрыты'}` : ''}`);
}

/**
 * Объявление живой области после раскрытия и свёртки союза: «Раскрыт союз Авраама и Агари: 1 лицо», «Свёрнут союз
 * Адама и Евы: скрыто 4 лица». n — сколько лиц добавилось на небо или ушло с него.
 */
export function plateSayText(u: Union, opened: boolean, n: number): string {
  const gen = unionGen(u);
  const head = `${opened ? 'Раскрыт' : 'Свёрнут'} союз${gen ? ` ${gen}` : `: ${plateNames(u)}`}`;
  const tail = opened
    ? n > 0
      ? `${n} ${plural(n, 'лицо', 'лица', 'лиц')}`
      : 'все лица уже на небе'
    : n > 0
      ? `скрыто ${n} ${plural(n, 'лицо', 'лица', 'лиц')}`
      : '';
  return typo(tail ? `${head}${gen ? ':' : ';'} ${tail}` : head);
}

/** Строка для диктора у звезды лица с нераскрытыми союзами (решение 70): «есть нераскрытые союзы». */
export const REVEAL_TEXT = 'есть нераскрытые союзы';

// ---------- союз-точка и карточка у точки (решение 76; src/ui/sky/DotCard.tsx) ----------

/**
 * Дети союза числом со склонением: «сын», «3 сына», «6 сыновей и дочь», «детей не названо»; у потомков, названных без
 * промежуточных звеньев, — «потомок», «2 потомка».
 */
export function kidsText(u: Union): string {
  const n = u.kids.length;
  if (u.claim === 'ancestor' && n) return n === 1 ? 'потомок' : `${n} ${plural(n, 'потомок', 'потомка', 'потомков')}`;
  return kidsCount(u);
}

/**
 * Подсказка точки союза на небе «набор» — одна строка (решение 76): «Союз Адама и Евы: 3 сына — щёлкните». Имена —
 * в родительном падеже через склонение (ru.ts); если оно ненадёжно — «Союз: Авраам и дочь Шуи; 3 сына — щёлкните».
 * Подробности (вид связи, стих, команды) — в карточке у точки, которую открывает щелчок.
 */
export function dotTipText(u: Union): string {
  return typo(`${unionTitle(u)}${unionGen(u) ? ':' : ';'} ${kidsText(u)} — щёлкните`);
}

// ---------- шаги и свёртки карты (этап 21, решения 197–199) ----------

/**
 * Слова супругов шага (рецензия этапа 21): кем приходится супруг по тексту — жена (муж), наложница или только мать (отец)
 * детей, когда брак Писание не называет (Иуда и Фамарь, мать царя, «другая женщина» Галаада). Формы: [ед., мн.] в
 * именительном и винительном падежах.
 */
type Forms = { nom: [string, string]; acc: [string, string] };
const PARTNER_WORDS: Record<'m' | 'f', Record<PartnerKind, Forms>> = {
  m: {
    wife: { nom: ['жена', 'жёны'], acc: ['жену', 'жён'] },
    concubine: { nom: ['наложница', 'наложницы'], acc: ['наложницу', 'наложниц'] },
    parent: { nom: ['мать детей', 'матери детей'], acc: ['мать детей', 'матерей детей'] },
  },
  f: {
    wife: { nom: ['муж', 'мужья'], acc: ['мужа', 'мужей'] },
    concubine: { nom: ['отец детей', 'отцы детей'], acc: ['отца детей', 'отцов детей'] },
    parent: { nom: ['отец детей', 'отцы детей'], acc: ['отца детей', 'отцов детей'] },
  },
};
const sexOf = (id: string): 'm' | 'f' => (byId.get(id)?.sex === 'f' ? 'f' : 'm');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);

/** Супруги шага одной фразой: «жена и матери детей», «жёны и наложницы»; c — падеж. Отцы детей у женщины — одной группой. */
function partnersPhrase(id: string, kinds: readonly PartnerKind[], c: 'nom' | 'acc'): string {
  const w = PARTNER_WORDS[sexOf(id)];
  const groups = new Map<string, number>();
  for (const k of kinds) {
    const f = w[k];
    groups.set(f.nom[0], (groups.get(f.nom[0]) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const k of ['wife', 'concubine', 'parent'] as const) {
    const f = w[k];
    const n = groups.get(f.nom[0]);
    if (!n) continue;
    groups.delete(f.nom[0]);
    parts.push(f[c][n > 1 ? 1 : 0]);
  }
  return joinAnd(parts);
}

/** Один союз: супруг и дети — «жена и дети», «наложница и дети»; брак не назван — «дети и их мать» («дети и их отец»). */
function unionPhrase(id: string, k: PartnerKind, kids: boolean, c: 'nom' | 'acc'): string {
  const f = PARTNER_WORDS[sexOf(id)][k];
  const one = f[c][0];
  if (!kids) return one;
  const children = c === 'nom' ? 'дети' : 'детей';
  if (k === 'parent' || (k === 'concubine' && sexOf(id) === 'f')) {
    const their = sexOf(id) === 'f' ? (c === 'nom' ? 'их отец' : 'их отца') : 'их мать';
    return `${children} и ${their}`;
  }
  return `${one} и ${children}`;
}

/**
 * Надпись команды шага вперёд (решение 197): один союз — «Жена и дети», «Наложница и дети», «Дети и их мать» (брак не
 * назван), у женщины — «Муж и дети»; несколько союзов — сначала супруги: «Жёны (4)», «Жена и матери детей (3)»; супруг
 * не назван — «Дети»; супруги уже на карте — «Все дети (13)». Надпись называет только то, что раскроет щелчок.
 */
export function forwardLabel(id: string, f: StepForward): string {
  if (f.kind === 'kids') return `Все дети (${f.kids})`;
  if (!f.spouses) return f.kids ? 'Дети' : '';
  if (f.kind === 'spouses') return cap(partnersPhrase(id, f.kinds, 'nom')) + (f.spouses > 1 ? ` (${f.spouses})` : '');
  return cap(unionPhrase(id, f.kinds[0] ?? 'wife', f.kids > 0, 'nom'));
}
/** Для диктора у звезды: «можно раскрыть жену и детей», «можно раскрыть родителей». */
export function stepsSayText(id: string, c: { forward: StepForward | null; back: number }): string {
  const out: string[] = [];
  if (c.forward) {
    const f = c.forward;
    const what =
      f.kind === 'kids'
        ? 'всех детей'
        : !f.spouses
          ? 'детей'
          : f.kind === 'spouses'
            ? partnersPhrase(id, f.kinds, 'acc') + (f.spouses > 1 ? ` (${f.spouses})` : '')
            : unionPhrase(id, f.kinds[0] ?? 'wife', f.kids > 0, 'acc');
    out.push(`можно раскрыть ${what}`);
  }
  if (c.back) out.push('можно раскрыть родителей');
  return out.join('; ');
}

/** Имена списком: до шести, дальше — «и ещё N». */
function namesList(ids: readonly string[]): string {
  const names = ids.map((x) => byId.get(x)?.name ?? x);
  return names.length <= 6 ? names.join(', ') : `${names.slice(0, 6).join(', ')} и ещё ${names.length - 6}`;
}
const personsN = (n: number) => `${n} ${plural(n, 'лицо', 'лица', 'лиц')}`;

/**
 * Что сделал шаг или свёртка карты — вслух и в строке показа (решения 197–199). Имя — в начале, в именительном падеже:
 * «Адам: на карте жена и дети — Ева, Каин, Авель, Сиф», «Иаков: на карте жёны — Лия, Рахиль, Валла, Зелфа; у каждой — ромб
 * с детьми», «Сиф: потомки свёрнуты, скрыто 12 лиц», «Сиф: на карте только это лицо».
 */
export function mapSayText(m: { kind: string; id: string; added: readonly string[]; removed: number; kinds?: readonly PartnerKind[] }, size: number): string {
  const name = byId.get(m.id)?.name ?? m.id;
  const total = `на карте ${personsN(size)}`;
  switch (m.kind) {
    case 'union': {
      const k = m.kinds?.[0];
      const what = k ? unionPhrase(m.id, k, m.added.length > 1, 'nom') : 'дети';
      return typo(`${name}: раскрыты ${what} — ${namesList(m.added)}; ${total}`);
    }
    case 'spouses':
      return typo(`${name}: раскрыты ${partnersPhrase(m.id, m.kinds ?? m.added.map(() => 'wife' as const), 'nom')} — ${namesList(m.added)}; у каждого союза — ромб с числом детей; ${total}`);
    case 'kids':
      return typo(`${name}: раскрыты все дети — ${namesList(m.added)}; ${total}`);
    case 'parents':
      return typo(`${name}: раскрыты родители, братья и сёстры — ${namesList(m.added)}; ${total}`);
    case 'fold-desc':
      return typo(`${name}: потомки свёрнуты${m.removed ? `, скрыто ${personsN(m.removed)}` : ''}; ${total}`);
    case 'fold-anc':
      return typo(`${name}: предки свёрнуты${m.removed ? `, скрыто ${personsN(m.removed)}` : ''}; ${total}`);
    case 'only':
      return typo(`${name}: на карте только это лицо; дальше — командами карточки «Жена и дети», «Родители» или знаком ⊕ у звезды`);
    case 'restart':
      return typo(`Карта снова с начала: Адам и Иисус Христос${m.removed ? `, скрыто ${personsN(m.removed)}` : ''}; вернуть прежнюю — «Отменить шаг», Ctrl+Z`);
    default:
      return '';
  }
}
