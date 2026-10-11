/**
 * Д6 для сцен пакета 1 (10 § 4.2.0, § 4.2.2, В5; 04 § 3.2, § 3.8, § 9, § 16.1; 02 § 3.15). Все стихи прочитаны по
 * `scriptureText` (слова вне скобок); слова каждого числа берутся из стиха программой (tools/base/numwords.ts), а не пишутся
 * руками. Новых толкований шаги не вносят. Отчёт — docs/app/reviews/время-пакет-1-отчёт.md.
 *
 * D6-1 (02 § 3.15.2–3.15.3): модели `m-dolgoe` (по умолчанию), `m-kratkoe`, `m-farra70`, `m-skobki` и схемы царей
 *      `s-mcfall-young` (по умолчанию, В-23), `s-thiele` (справка), `s-galil` (вторая очередь) — файл base/models.json.
 *      Таблиц McFall — Young со страницами нет: у `s-mcfall-young` таблица пуста (риск 10 § 4.2.2). У `s-thiele` в таблице —
 *      годы прежних данных атласа (04 § 3.8: «по Тиле в данных, не таблица Тиле»), без страницы, с пометкой «справка».
 * D6-2 (02 § 3.15.4; 04 § 3.8, § 9 п. 6, 19): опоры сцен — 4-й год Соломона, Каркар, дань Ииуя, Самария, Сеннахирим: труды
 *      с изданием и местом, где они известны; Самария по схеме по умолчанию — 723 (722 — альтернатива по Тиле); подпись
 *      «Тиле — Янга» у опоры 967 исправлена, цепочка «как получено» — словами.
 * D6-3 (02 § 3.15.1; 04 § 3.2; Д-11): эпохи 1–5 по образцу PeriodO — начало и конец событием со стихом, граница, без
 *      готовых годов; граница 2–3 — выход Аврама из Харрана (Быт 12:4).
 * D6-4 (02 § 3.15.5; 04 § 9 п. 1–2, 6, 15, 18): хронологические записи 75 лиц сцен 1.14–1.16 — окончательного вида: только
 *      числа текста и отношения со стихами, ссылка `calc` на модель или схему; годы, оценки атласа («семь лет», «год
 *      приблизителен») и примечания о реконструкции сняты; эпоха лица — со стихом, иначе остаётся прежней строкой.
 */
import type { Step } from './corrections.ts';
import type { ChronoD6, ChronoModel, Cite, KingScheme, Kingdom, PersonEpoch, TimeInput } from './types.ts';
import { scriptureTexts } from './brackets.ts';
import { wordsOf } from './numwords.ts';

const touch = { by: 'исправление D6' };
const agent = (work: string, page: string, weight: Cite['weight'] = 'approx'): Cite => ({ work, page, weight, checkedBy: 'agent' });

/** Слова числа `n` в стихе (вне скобок); нет — ошибка сборки: число не из текста. */
function W(n: number, ref: string): string {
  const w = wordsOf(n, scriptureTexts(ref).join(' '));
  if (!w) throw new Error(`D6: числа ${n} нет словами в ${ref} (вне скобок)`);
  return w;
}
/** Число текста: цифра и слова стиха. */
const N = (n: number, ref: string) => ({ number: n, words: W(n, ref) });
/** Слагаемое вывода. */
const P = (n: number, ref: string) => ({ number: n, words: W(n, ref), ref });

type Calc = 'm' | 's' | '-';
const DATED = new Set(['age-at-birth', 'age-at-death', 'reign', 'age-at-accession', 'synchronism', 'succeeded', 'age-at-event', 'years-after']);

// ---------------------------------------------------------------- лица сцен (опись 10-составитель, сцены 1.14–1.16)

const P14 = ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'kham', 'iafet', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam'];
const P15 = ['khanaan', 'filistimlyane', 'iosif', 'iair-syn-seguva', 'kaaf', 'amram', 'iokhaveda', 'aaron', 'moisey', 'mariam'];
const P16 = [
  'maday', 'asaf', 'beera-syn-vaala', 'iofam-syn-gedeona', 'david', 'amasiya', 'iekholiya', 'oziya', 'ierusha-doch-sadoka', 'ioafam', 'akhaz',
  'maaseya-syn-akhaza', 'ezekiya-syn-shalluma', 'avi-doch-zakharii', 'eliakim-syn-khelkii', 'ioakh-syn-asafa', 'ezekiya', 'razon', 'navat', 'ieroboam',
  'ila-syn-vaasy', 'iiuy', 'ieroboam-vtoroy', 'zakhariya-syn-ieroboama', 'iavis-otets-selluma', 'sellum-syn-iavisa', 'gadiy', 'menaim', 'fakiya',
  'remaliya', 'fakey', 'ila-otets-osii', 'osiya-syn-ily', 'ful', 'feglaffellasar', 'salmanassar', 'sinnakherim', 'adramelekh',
  'zakhariya-syn-varakhii-is8', 'osiya-prorok', 'uriya-syn-shemaii', 'kir', 'eliakim-syn-aviuda',
];
export const D6_ACTORS = [...P14, ...P15, ...P16].map((x) => `p-${x}`);

/** Какой расчёт даёт год лица: модель (до царей разделённого царства; Давид — по модели, Д-р1), схема царей, нет модели (Д-р2). */
const CALC_OF = (id: string): Calc => {
  const x = id.slice(2);
  if (x === 'kir') return '-';
  if ([...P14, ...P15, 'maday', 'david', 'asaf', 'iofam-syn-gedeona', 'razon', 'navat'].includes(x)) return 'm';
  return 's';
};

// ---------------------------------------------------------------- Быт 5 и 11: по числам прежней записи

const G5 = ['sif', 'enos', 'kainan', 'maleleil', 'iared', 'mafusal', 'lamekh'];
const G11 = ['arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra'];
const R = (kind: TimeInput['kind'], refs: string[], cert: TimeInput['cert'], extra: Partial<TimeInput> = {}): TimeInput => ({ kind, ...extra, refs, cert });

const EVENT_EXODUS = { text: 'исшествие сынов Израилевых из земли Египетской', refs: ['Исх 12:41'] };
const EVENT_PHARAOH = { text: 'Моисей и Аарон стали говорить к фараону', refs: ['Исх 7:7'] };

/** Записи, составленные по стихам вручную (числа — словами стиха через N и P). */
const MANUAL: Record<string, () => ChronoD6> = {
  'p-adam': () => ({ inputs: [R('age-at-death', ['Быт 5:5'], 'scripture', N(930, 'Быт 5:5'))] }),
  'p-enokh': () => ({
    inputs: [
      R('age-at-birth', ['Быт 5:18'], 'scripture', { other: 'p-iared', ...N(162, 'Быт 5:18') }),
      R('age-at-death', ['Быт 5:23', 'Быт 5:24'], 'scripture', {
        ...N(365, 'Быт 5:23'),
        note: 'Писание не говорит «умер»: «и не стало его, потому что Бог взял его» (Быт 5:24); число — всех дней Еноха (Быт 5:23)',
      }),
    ],
  }),
  'p-noy': () => ({
    inputs: [
      R('age-at-birth', ['Быт 5:28-29'], 'scripture', { other: 'p-lamekh', ...N(182, 'Быт 5:28'), numberBracket: 188 }),
      R('age-at-death', ['Быт 9:29'], 'scripture', N(950, 'Быт 9:29')),
    ],
  }),
  'p-sim': () => ({
    inputs: [
      R('age-at-birth', ['Быт 5:32', 'Быт 7:6', 'Быт 11:10'], 'inference', {
        other: 'p-noy', number: 502, parts: [P(600, 'Быт 7:6'), P(2, 'Быт 11:10'), P(100, 'Быт 11:10')],
        note: 'Сим был ста лет «чрез два года после потопа» (Быт 11:10), потоп — когда Ною было шестьсот лет (Быт 7:6): 600 + 2 − 100. Слова «Ною было пятьсот лет и родил…» (Быт 5:32) — начало рождения сыновей (04 § 3.8, Н8)',
      }),
      R('age-at-death', ['Быт 11:10-11'], 'inference', {
        number: 600, parts: [P(100, 'Быт 11:10'), P(500, 'Быт 11:11')],
        note: 'сумма чисел текста: сто лет до рождения Арфаксада и пятьсот после; слов «и умер» вне скобок в Быт 11:11 нет',
      }),
    ],
  }),
  'p-kham': () => ({ inputs: [], epochs: SONS_OF_NOAH }),
  'p-iafet': () => ({ inputs: [], epochs: SONS_OF_NOAH }),
  'p-avraam': () => ({
    inputs: [
      R('not-before', ['Быт 11:26'], 'scripture', {
        of: 'birth', other: 'p-farra', ...N(70, 'Быт 11:26'),
        note: '«Фарра жил семьдесят лет и родил Аврама, Нахора и Арана»: кто из троих родился в семьдесят лет, стих не говорит (04 § 3.8)',
      }),
      R('not-before', ['Быт 11:32', 'Быт 12:4', 'Деян 7:4'], 'inference', {
        of: 'birth', other: 'p-farra', number: 130, parts: [P(205, 'Быт 11:32'), P(75, 'Быт 12:4')],
        note: 'Фарра умер двухсот пяти лет (Быт 11:32), Аврам вышел из Харрана семидесяти пяти лет (Быт 12:4) «по смерти отца его» (Деян 7:4 — слова Стефана, Деян 7:2): Фарре при рождении Аврама не меньше 130 лет — вывод при прямом понимании Деян 7:4; «ровно 130» — выбор модели m-dolgoe (04 § 3.8)',
      }),
      R('age-at-death', ['Быт 25:7'], 'scripture', N(175, 'Быт 25:7')),
    ],
  }),
  'p-khanaan': () => ({
    inputs: [AFTER_FLOOD()],
    epochs: [{ era: 'era-postdiluvian', refs: ['Быт 10:1', 'Быт 10:6'], cert: 'inference', note: 'сын Хама (Быт 10:6); «после потопа родились у них дети» (Быт 10:1)' }],
  }),
  'p-maday': () => ({
    inputs: [AFTER_FLOOD()],
    epochs: [{ era: 'era-postdiluvian', refs: ['Быт 10:1', 'Быт 10:2'], cert: 'inference', note: 'сын Иафета (Быт 10:2); «после потопа родились у них дети» (Быт 10:1)' }],
  }),
  'p-filistimlyane': () => ({
    inputs: [],
    epochs: [{ era: 'era-postdiluvian', refs: ['Быт 10:1', 'Быт 10:14'], cert: 'inference', note: '«откуда вышли Филистимляне» — в родословии сынов Ноевых (Быт 10:14), а дети у них родились после потопа (Быт 10:1)' }],
  }),
  'p-iosif': () => ({
    inputs: [
      R('age-at-birth', ['Быт 41:46', 'Быт 41:53-54', 'Быт 45:6', 'Быт 47:9'], 'inference', {
        other: 'p-iakov', number: 91, parts: [P(30, 'Быт 41:46'), P(7, 'Быт 41:53'), P(2, 'Быт 45:6'), P(130, 'Быт 47:9')],
        note: 'Иосифу было тридцать лет, когда он предстал пред фараоном (Быт 41:46); прошли семь лет изобилия и два года голода (Быт 41:53–54; 45:6), когда пришёл Иаков, которому было сто тридцать лет (Быт 47:9): 130 − (30 + 7 + 2)',
      }),
      R('age-at-death', ['Быт 50:26', 'Быт 50:22'], 'scripture', N(110, 'Быт 50:26')),
    ],
  }),
  'p-iair-syn-seguva': () => ({
    inputs: [
      R('years-after', ['Чис 32:41', 'Чис 33:38', 'Втор 1:3', 'Втор 3:14'], 'inference', {
        of: 'life', event: EVENT_EXODUS, ...N(40, 'Чис 33:38'),
        note: 'взял селения в Галааде в сороковой год странствия: после смерти Аарона (Чис 33:38) и прежде речи Моисея в сороковой год (Втор 1:3), где это названо прошедшим (Втор 3:14)',
      }),
    ],
    epochs: [{ era: 'era-exodus', refs: ['Чис 32:41', 'Втор 3:14'], cert: 'inference', note: 'взял селения при Моисее, до перехода через Иордан' }],
  }),
  'p-kaaf': () => ({
    inputs: [
      R('not-after', ['Быт 46:11', 'Быт 47:9'], 'inference', { of: 'birth', other: 'p-iakov', ...N(130, 'Быт 47:9'), note: 'пришёл в Египет с Иаковом (Быт 46:8, 11), которому тогда было сто тридцать лет (Быт 47:9)' }),
      R('age-at-death', ['Исх 6:18'], 'scripture', N(133, 'Исх 6:18')),
    ],
    epochs: [{ era: 'era-egypt', refs: ['Быт 46:8', 'Быт 46:11'], cert: 'inference', note: 'в числе «пришедших в Египет» (Быт 46:8, 11)' }],
  }),
  'p-amram': () => ({
    inputs: [R('age-at-death', ['Исх 6:20'], 'scripture', N(137, 'Исх 6:20'))],
    epochs: [{ era: 'era-egypt', refs: ['Чис 26:59', 'Исх 6:20'], cert: 'inference', note: 'жена его родилась в Египте и родила ему Аарона, Моисея и Мариам (Чис 26:59)' }],
  }),
  'p-iokhaveda': () => ({
    inputs: [R('not-before', ['Чис 26:59', 'Быт 47:9'], 'inference', { of: 'birth', other: 'p-iakov', ...N(130, 'Быт 47:9'), note: '«которую родила жена Левиина в Египте» — после прихода Иакова в Египет (Быт 47:9)' })],
    epochs: [{ era: 'era-egypt', refs: ['Чис 26:59', 'Быт 47:9'], cert: 'inference', note: '«которую родила жена Левиина в Египте» (Чис 26:59)' }],
  }),
  'p-aaron': () => ({
    inputs: [
      R('age-at-event', ['Исх 7:7'], 'scripture', { event: EVENT_PHARAOH, ...N(83, 'Исх 7:7') }),
      R('age-at-death', ['Чис 33:39'], 'scripture', N(123, 'Чис 33:39')),
      R('years-after', ['Чис 33:38'], 'scripture', { of: 'death', event: EVENT_EXODUS, ...N(40, 'Чис 33:38'), note: '«в пятый месяц, в первый день месяца»' }),
    ],
    epochs: [{ era: 'era-exodus', refs: ['Исх 7:7', 'Чис 33:38'], cert: 'inference' }],
  }),
  'p-moisey': () => ({
    inputs: [
      R('age-at-event', ['Исх 7:7'], 'scripture', { event: EVENT_PHARAOH, ...N(80, 'Исх 7:7') }),
      R('age-at-death', ['Втор 34:7', 'Втор 31:2'], 'scripture', N(120, 'Втор 34:7')),
    ],
    epochs: [{ era: 'era-exodus', refs: ['Исх 12:41', 'Исх 12:50-51'], cert: 'inference', note: 'вывел народ из Египта' }],
  }),
  'p-mariam': () => ({
    inputs: [
      R('not-after', ['Исх 2:4', 'Исх 2:7-8', 'Чис 26:59', '1Пар 6:3'], 'inference', {
        of: 'birth', other: 'p-moisey',
        note: 'старше Моисея: сестра младенца сама стерегла его у реки и говорила с дочерью фараоновой (Исх 2:4, 7–8), а Мариам — единственная названная сестра Аарона и Моисея (Чис 26:59; 1 Пар 6:3). На сколько старше, текст не говорит',
      }),
      R('years-after', ['Чис 20:1', 'Чис 20:22-28', 'Чис 33:38'], 'inference', {
        of: 'death', event: EVENT_EXODUS, ...N(40, 'Чис 33:38'),
        note: 'умерла в Кадесе в первый месяц (Чис 20:1) того года, в пятый месяц которого — сороковой по исшествии — умер Аарон (Чис 20:22–28; 33:38)',
      }),
    ],
    epochs: [
      { era: 'era-egypt', refs: ['Исх 2:4', 'Чис 26:59'], cert: 'inference', note: 'сестра младенца Моисея в Египте' },
      { era: 'era-exodus', refs: ['Исх 15:20', 'Чис 20:1'], cert: 'inference', note: 'от песни у Чермного моря до смерти в Кадесе' },
    ],
  }),
  // ---- Давид: по модели (Д-р1)
  'p-david': () => ({
    inputs: [
      R('age-at-accession', ['2Цар 5:4'], 'scripture', N(30, '2Цар 5:4')),
      R('reign', ['2Цар 5:4', '3Цар 2:11', '1Пар 29:27'], 'scripture', N(40, '2Цар 5:4')),
      R('reign', ['2Цар 5:5', '2Цар 2:11'], 'scripture', { number: 7, words: 'семь лет и шесть месяцев', plusMonths: 6, kingdom: 'judah-hebron' }),
      R('reign', ['2Цар 5:5', '3Цар 2:11', '1Пар 29:27'], 'scripture', { ...N(33, '2Цар 5:5'), kingdom: 'israel-united' }),
      R('age-at-death', ['2Цар 5:4', '3Цар 2:10-11'], 'inference', {
        number: 70, parts: [P(30, '2Цар 5:4'), P(40, '2Цар 5:4')],
        note: 'почил по окончании сорока лет царствования (3 Цар 2:10–11), воцарившись тридцати лет (2 Цар 5:4)',
      }),
    ],
  }),
  // ---- цари Иудеи
  'p-amasiya': () => ({
    inputs: [
      R('age-at-accession', ['4Цар 14:2', '2Пар 25:1'], 'scripture', N(25, '4Цар 14:2')),
      R('reign', ['4Цар 14:2', '2Пар 25:1'], 'scripture', { ...N(29, '4Цар 14:2'), kingdom: 'judah' }),
      R('synchronism', ['4Цар 14:1'], 'scripture', { other: 'p-ioas-syn-ioakhaza', ...N(2, '4Цар 14:1') }),
    ],
  }),
  'p-oziya': () => ({
    inputs: [
      R('age-at-accession', ['4Цар 15:2', '2Пар 26:3'], 'scripture', N(16, '4Цар 15:2')),
      R('reign', ['4Цар 15:2', '2Пар 26:3'], 'scripture', { ...N(52, '4Цар 15:2'), kingdom: 'judah' }),
      R('synchronism', ['4Цар 15:1'], 'scripture', { other: 'p-ieroboam-vtoroy', ...N(27, '4Цар 15:1') }),
      R('succeeded', ['4Цар 14:21'], 'scripture', { other: 'p-amasiya', words: 'воцарили его вместо отца его Амасии' }),
    ],
  }),
  'p-ioafam': () => ({
    inputs: [
      R('age-at-accession', ['4Цар 15:33', '2Пар 27:1'], 'scripture', N(25, '4Цар 15:33')),
      R('reign', ['4Цар 15:33', '2Пар 27:1'], 'scripture', { ...N(16, '4Цар 15:33'), kingdom: 'judah' }),
      R('synchronism', ['4Цар 15:32'], 'scripture', { other: 'p-fakey', ...N(2, '4Цар 15:32') }),
      R('succeeded', ['4Цар 15:7', '2Пар 26:23'], 'scripture', { other: 'p-oziya', words: 'И воцарился Иофам, сын его, вместо него' }),
      R('under-king', ['4Цар 15:5'], 'scripture', {
        of: 'life', other: 'p-oziya', words: 'Иофам, сын царя, начальствовал над дворцом и управлял народом земли',
        note: 'слова стиха — запись «Писание»; слово «соправление» — понятие схемы, а не текста (02 § 3.15.3)',
      }),
    ],
  }),
  'p-akhaz': () => ({
    inputs: [
      R('age-at-accession', ['4Цар 16:2', '2Пар 28:1'], 'scripture', N(20, '4Цар 16:2')),
      R('reign', ['4Цар 16:2', '2Пар 28:1'], 'scripture', { ...N(16, '4Цар 16:2'), kingdom: 'judah' }),
      R('synchronism', ['4Цар 16:1'], 'scripture', { other: 'p-fakey', ...N(17, '4Цар 16:1') }),
      R('succeeded', ['4Цар 15:38'], 'scripture', { other: 'p-ioafam', words: 'И воцарился Ахаз, сын его, вместо него' }),
    ],
  }),
  'p-ezekiya': () => ({
    inputs: [
      R('age-at-accession', ['4Цар 18:2', '2Пар 29:1'], 'scripture', N(25, '4Цар 18:2')),
      R('reign', ['4Цар 18:2', '2Пар 29:1'], 'scripture', { ...N(29, '4Цар 18:2'), kingdom: 'judah' }),
      R('synchronism', ['4Цар 18:1'], 'scripture', { other: 'p-osiya-syn-ily', ...N(3, '4Цар 18:1') }),
      R('synchronism', ['4Цар 18:9'], 'scripture', { other: 'p-osiya-syn-ily', ...N(7, '4Цар 18:9'), atYear: { number: 4, words: W(4, '4Цар 18:9') }, note: 'Салманассар пошёл на Самарию' }),
      R('synchronism', ['4Цар 18:10'], 'scripture', { other: 'p-osiya-syn-ily', ...N(9, '4Цар 18:10'), atYear: { number: 6, words: W(6, '4Цар 18:10') }, note: 'взята Самария' }),
      R('succeeded', ['4Цар 16:20', '2Пар 28:27'], 'scripture', { other: 'p-akhaz', words: 'И воцарился Езекия, сын его, вместо него' }),
    ],
  }),
  // ---- цари Израиля
  'p-ieroboam': () => ({ inputs: [R('reign', ['3Цар 14:20'], 'scripture', { ...N(22, '3Цар 14:20'), kingdom: 'israel-north' })] }),
  'p-ila-syn-vaasy': () => ({
    inputs: [
      R('reign', ['3Цар 16:8'], 'scripture', { ...N(2, '3Цар 16:8'), kingdom: 'israel-north' }),
      R('synchronism', ['3Цар 16:8'], 'scripture', { other: 'p-asa', ...N(26, '3Цар 16:8') }),
      R('synchronism', ['3Цар 16:10'], 'scripture', { of: 'death', other: 'p-asa', ...N(27, '3Цар 16:10'), note: 'Замврий поразил его и умертвил' }),
    ],
  }),
  'p-iiuy': () => ({ inputs: [R('reign', ['4Цар 10:36'], 'scripture', { ...N(28, '4Цар 10:36'), kingdom: 'israel-north' })] }),
  'p-ieroboam-vtoroy': () => ({
    inputs: [
      R('reign', ['4Цар 14:23'], 'scripture', { ...N(41, '4Цар 14:23'), kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 14:23'], 'scripture', { other: 'p-amasiya', ...N(15, '4Цар 14:23') }),
    ],
  }),
  'p-zakhariya-syn-ieroboama': () => ({
    inputs: [
      R('reign', ['4Цар 15:8'], 'scripture', { ...N(6, '4Цар 15:8'), unit: 'month', kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 15:8'], 'scripture', { other: 'p-oziya', ...N(38, '4Цар 15:8') }),
      R('succeeded', ['4Цар 14:29'], 'scripture', { other: 'p-ieroboam-vtoroy', words: 'И воцарился Захария, сын его, вместо него' }),
    ],
  }),
  'p-sellum-syn-iavisa': () => ({
    inputs: [
      R('reign', ['4Цар 15:13'], 'scripture', { ...N(1, '4Цар 15:13'), unit: 'month', kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 15:13'], 'scripture', { other: 'p-oziya', ...N(39, '4Цар 15:13') }),
      R('succeeded', ['4Цар 15:10'], 'scripture', { other: 'p-zakhariya-syn-ieroboama', words: 'и воцарился вместо него' }),
    ],
  }),
  'p-menaim': () => ({
    inputs: [
      R('reign', ['4Цар 15:17'], 'scripture', { ...N(10, '4Цар 15:17'), kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 15:17'], 'scripture', { other: 'p-oziya', ...N(39, '4Цар 15:17') }),
      R('succeeded', ['4Цар 15:14'], 'scripture', { other: 'p-sellum-syn-iavisa', words: 'и воцарился вместо него' }),
    ],
  }),
  'p-fakiya': () => ({
    inputs: [
      R('reign', ['4Цар 15:23'], 'scripture', { ...N(2, '4Цар 15:23'), kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 15:23'], 'scripture', { other: 'p-oziya', ...N(50, '4Цар 15:23') }),
      R('succeeded', ['4Цар 15:22'], 'scripture', { other: 'p-menaim', words: 'И воцарился Факия, сын его, вместо него' }),
    ],
  }),
  'p-fakey': () => ({
    inputs: [
      R('reign', ['4Цар 15:27'], 'scripture', { ...N(20, '4Цар 15:27'), kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 15:27'], 'scripture', { other: 'p-oziya', ...N(52, '4Цар 15:27') }),
      R('succeeded', ['4Цар 15:25'], 'scripture', { other: 'p-fakiya', words: 'и воцарился вместо него' }),
    ],
  }),
  'p-osiya-syn-ily': () => ({
    inputs: [
      R('reign', ['4Цар 17:1'], 'scripture', { ...N(9, '4Цар 17:1'), kingdom: 'israel-north' }),
      R('synchronism', ['4Цар 17:1'], 'scripture', { other: 'p-akhaz', ...N(12, '4Цар 17:1') }),
      R('synchronism', ['4Цар 15:30'], 'scripture', { other: 'p-ioafam', ...N(20, '4Цар 15:30'), note: 'по 4 Цар 15:33 Иоафам царствовал шестнадцать лет; двадцатый год назван в самом тексте (04 § 3.8, Н11)' }),
      R('succeeded', ['4Цар 15:30'], 'scripture', { other: 'p-fakey', words: 'и воцарился вместо него' }),
    ],
  }),
  // ---- современники царей: «во дни…» со стихом вместо готовых лет
  'p-asaf': () => ({
    inputs: [R('under-king', ['1Пар 25:1-2'], 'scripture', { of: 'life', other: 'p-david', note: '«под руководством Асафа, игравшего по наставлению царя» — отделил Давид (1 Пар 25:1–2)' })],
    epochs: [{ era: 'era-united', refs: ['1Пар 25:1-2'], cert: 'inference', note: 'при Давиде' }],
  }),
  'p-beera-syn-vaala': () => ({
    inputs: [R('under-king', ['1Пар 5:6', '4Цар 15:29'], 'inference', { of: 'life', other: 'p-fakey', note: 'уведён в плен Феглафелласаром (1 Пар 5:6); Галаад взят Феглаффелласаром «во дни Факея, царя Израильского» (4 Цар 15:29)' })],
    epochs: [{ era: 'era-divided', refs: ['1Пар 5:6', '4Цар 15:29'], cert: 'inference' }],
  }),
  'p-iofam-syn-gedeona': () => ({
    inputs: [],
    epochs: [{ era: 'era-judges', refs: ['Суд 8:32', 'Суд 9:5'], cert: 'inference', note: 'спасся, когда после смерти Гедеона (Суд 8:32) Авимелех убил братьев (Суд 9:5)' }],
  }),
  'p-maaseya-syn-akhaza': () => ({
    inputs: [R('under-king', ['2Пар 28:6-7'], 'inference', { of: 'death', other: 'p-fakey', note: 'убит Зихрием, когда «избил Факей, сын Ремалиин, Иудеев» (2 Пар 28:6–7)' })],
    epochs: [{ era: 'era-divided', refs: ['2Пар 28:6-7'], cert: 'inference' }],
  }),
  'p-ezekiya-syn-shalluma': () => ({
    inputs: [R('under-king', ['2Пар 28:1', '2Пар 28:5-12'], 'inference', { of: 'life', other: 'p-akhaz', note: 'среди начальников Ефремовых, встретивших войско с пленными Иудеями, при Ахазе (2 Пар 28:1, 5–12)' })],
    epochs: [{ era: 'era-divided', refs: ['2Пар 28:1', '2Пар 28:5-12'], cert: 'inference' }],
  }),
  'p-eliakim-syn-khelkii': () => ({
    inputs: [R('under-king', ['4Цар 18:13', '4Цар 18:18'], 'inference', { of: 'life', other: 'p-ezekiya', ...N(14, '4Цар 18:13'), note: 'вышел к послам Сеннахирима в четырнадцатый год Езекии (4 Цар 18:13, 18)' })],
    epochs: [{ era: 'era-judah-alone', refs: ['4Цар 18:13', '4Цар 18:18'], cert: 'inference' }],
  }),
  'p-ioakh-syn-asafa': () => ({
    inputs: [R('under-king', ['4Цар 18:13', '4Цар 18:18'], 'inference', { of: 'life', other: 'p-ezekiya', ...N(14, '4Цар 18:13'), note: 'вышел к послам Сеннахирима в четырнадцатый год Езекии (4 Цар 18:13, 18)' })],
    epochs: [{ era: 'era-judah-alone', refs: ['4Цар 18:13', '4Цар 18:18'], cert: 'inference' }],
  }),
  'p-razon': () => ({ inputs: [R('under-king', ['3Цар 11:25'], 'scripture', { of: 'life', other: 'p-solomon', words: 'во все дни Соломона' })] }),
  'p-ful': () => ({ inputs: [R('under-king', ['4Цар 15:19'], 'scripture', { of: 'life', other: 'p-menaim' })] }),
  'p-feglaffellasar': () => ({
    inputs: [
      R('under-king', ['4Цар 15:29'], 'scripture', { of: 'life', other: 'p-fakey', words: 'Во дни Факея, царя Израильского' }),
      R('under-king', ['4Цар 16:7-9'], 'scripture', { of: 'life', other: 'p-akhaz' }),
    ],
  }),
  'p-salmanassar': () => ({
    inputs: [
      R('under-king', ['4Цар 17:3'], 'scripture', { of: 'life', other: 'p-osiya-syn-ily' }),
      R('under-king', ['4Цар 18:9'], 'scripture', { of: 'life', other: 'p-ezekiya', ...N(4, '4Цар 18:9') }),
    ],
  }),
  'p-sinnakherim': () => ({ inputs: [R('under-king', ['4Цар 18:13'], 'scripture', { of: 'life', other: 'p-ezekiya', ...N(14, '4Цар 18:13') })] }),
  'p-osiya-prorok': () => ({
    inputs: ['p-oziya', 'p-ioafam', 'p-akhaz', 'p-ezekiya', 'p-ieroboam-vtoroy'].map((k) => R('under-king', ['Ос 1:1'], 'scripture', { of: 'life', other: k })),
  }),
  'p-uriya-syn-shemaii': () => ({
    inputs: [
      R('under-king', ['Иер 26:20-21'], 'scripture', { of: 'life', other: 'p-ioakim-tsar' }),
      R('under-king', ['Иер 26:23'], 'scripture', { of: 'death', other: 'p-ioakim-tsar', words: 'он умертвил его мечом' }),
    ],
    epochs: [{ era: 'era-judah-alone', refs: ['Иер 26:21', 'Иер 26:23'], cert: 'inference', note: 'при царе Иоакиме' }],
  }),
  'p-kir': () => ({
    inputs: [],
    epochs: [{ era: 'era-return', refs: ['2Пар 36:22', 'Езд 1:1'], cert: 'inference', note: '«в первый год Кира, царя Персидского» — повеление, с которого начинается эпоха (04 § 3.2); год — опора an-cyrus-decree, модели для этого времени в 04 нет (Д-р2)' }],
  }),
};

const SONS_OF_NOAH: PersonEpoch[] = [
  { era: 'era-antediluvian', refs: ['Быт 5:32', 'Быт 7:6'], cert: 'inference', note: 'родился у Ноя после пятисот его лет (Быт 5:32), до потопа в шестисотый год (Быт 7:6)' },
  { era: 'era-postdiluvian', refs: ['Быт 9:18'], cert: 'scripture', note: '«Сыновья Ноя, вышедшие из ковчега»' },
];
const AFTER_FLOOD = (): TimeInput =>
  R('not-before', ['Быт 7:6', 'Быт 8:13-14', 'Быт 10:1', '1Пет 3:20'], 'inference', {
    of: 'birth', other: 'p-noy', number: 601, parts: [P(600, 'Быт 7:6'), P(601, 'Быт 8:13')],
    note: 'родился после потопа: «после потопа родились у них дети» (Быт 10:1), а в ковчеге спаслись восемь душ (1 Пет 3:20); земля высохла в шестьсот первом году жизни Ноя (Быт 8:13–14)',
  });

/** Быт 5 и 11 — по числам прежней записи: возраст отца при рождении и (Быт 5) возраст при смерти; (Быт 11) смерть — сумма. */
function fromGenealogy(id: string, ch: any, father: string | undefined, g11: boolean): ChronoD6 {
  const inputs: TimeInput[] = [];
  const b = ch.born;
  if (b?.fatherAge !== undefined) {
    const ref = b.refs[0];
    inputs.push(R('age-at-birth', [ref], 'scripture', {
      other: father, ...N(b.fatherAge, ref), ...(b.fatherAgeBracket !== undefined && { numberBracket: b.fatherAgeBracket }),
      ...(id === 'p-sala' && {
        reading: { set: 'r-father-sala', in: 'gen' },
        note: 'в скобках Быт 11:12–13 между Арфаксадом и Салой стоит Каинан: [135] лет Арфаксада при рождении Каинана и [130] лет Каинана при рождении Салы; число в скобках здесь — их сумма, для модели m-skobki (не основание)',
      }),
    }));
  }
  const d = ch.died;
  if (d?.age !== undefined) {
    if (g11 && d.cert === 'inference') {
      // «жил N лет и родил…» + «по рождении … жил M лет» — смерть словами в скобках, число — сумма (вывод)
      const [r1, r2] = d.refs[0].split('-');
      const v2 = `${r1.split(':')[0]}:${r2}`;
      const sp1 = wordsAfter(scriptureTexts(r1).join(' '));
      const sp2 = wordsAfter(scriptureTexts(v2).join(' '));
      if (sp1 + sp2 !== d.age) throw new Error(`D6: ${id}: ${sp1} + ${sp2} ≠ ${d.age}`);
      inputs.push(R('age-at-death', [d.refs[0]], 'inference', {
        number: d.age, parts: [P(sp1, r1), P(sp2, v2)], ...(d.ageBracket !== undefined && { numberBracket: d.ageBracket }),
        note: 'сумма чисел текста: лет до рождения сына и лет после; слов «и умер» вне скобок нет',
      }));
    } else {
      inputs.push(R('age-at-death', [d.refs[0]], 'scripture', { ...N(d.age, d.refs[0]), ...(d.ageBracket !== undefined && { numberBracket: d.ageBracket }) }));
    }
  }
  return { inputs };
}
/** Первое число стиха (Быт 11: «Арфаксад жил тридцать пять лет…», «По рождении Салы Арфаксад жил четыреста три года…»). */
function wordsAfter(text: string): number {
  const m = /жил\s+([а-яё ]+?)\s+(лет|года|год)/i.exec(text);
  if (!m) throw new Error(`D6: нет «жил N лет» в «${text}»`);
  for (let n = 1; n < 1000; n++) if (wordsOf(n, m[1]) === m[1]) return n;
  throw new Error(`D6: не число «${m[1]}»`);
}

/** Ссылка на расчёт у входа с датируемым событием (02 § 3.10.2): событие — первый стих входа. */
function withCalc(t: TimeInput, k: Calc): TimeInput {
  if (!DATED.has(t.kind) && !(t.kind === 'under-king' && t.number !== undefined)) return t;
  return { ...t, calc: { event: t.refs[0], ...(k === 'm' ? { model: 'm-dolgoe' } : k === 's' ? { scheme: 's-mcfall-young' } : {}) } };
}

// ---------------------------------------------------------------- модели и схемы (D6-1)

const KINGDOM: Record<string, Kingdom> = { 'Иудея': 'judah', 'Израиль': 'israel-north' };
const NOT_SCHEME = new Set(['p-saul', 'p-ievosfey', 'p-avimelekh-syn-gedeona', 'p-david', 'p-solomon', 'p-navukhodonosor']);

const LOG = [{ release: 'до первого выпуска', what: 'запись модели заведена (Д6 для сцен пакета 1)' }];

function models(): ChronoModel[] {
  return [
    {
      id: 'm-dolgoe', type: 'model', name: 'Долгое пребывание', default: true, basis: 'text',
      label: 'Модель по умолчанию: числа Быт 5 и 11 вне скобок; 430 лет в Египте (Исх 12:40); 479 лет от Исхода до 4-го года Соломона (3 Цар 6:1)',
      readings: [{ set: 'r-father-sala', in: 'gen' }],
      choices: [
        { what: 'Фарре при рождении Аврама ровно 130 лет (текст даёт «не меньше 130» — вывод из Быт 11:32; 12:4; Деян 7:4)', refs: ['Быт 11:32', 'Быт 12:4', 'Деян 7:4'], cert: 'calc', number: 130 },
        { what: '430 лет Исх 12:40 — пребывание в Египте от прихода Иакова до Исхода', refs: ['Исх 12:40-41', 'Быт 47:9'], cert: 'calc', number: 430 },
        { what: 'от Исхода до начала храма прошло 479 лет: храм заложен «в четыреста восьмидесятом году»', refs: ['3Цар 6:1'], cert: 'calc', number: 479 },
        { what: 'речь Моисея и Аарона к фараону (Исх 7:7) — в год Исхода', refs: ['Исх 7:7', 'Исх 12:41'], cert: 'calc' },
      ],
      scheme: 's-mcfall-young', anchors: ['an-solomon-4'], log: LOG,
    },
    {
      id: 'm-kratkoe', type: 'model', name: 'Краткое пребывание', basis: 'interpretation', needsSources: true,
      label: 'По одному из пониманий Гал 3:17 (толк.): 430 лет считаются от обетования Аврааму; слова «в Египте» Исх 12:40 эта модель понимает иначе, чем они звучат вне скобок',
      readings: [{ set: 'r-father-sala', in: 'gen' }],
      choices: [
        { what: '430 лет (Исх 12:40; Гал 3:17) — от выхода Аврама из Харрана до Исхода', refs: ['Исх 12:40', 'Гал 3:17', 'Быт 12:4'], cert: 'calc', number: 430 },
        { what: 'Фарре при рождении Аврама ровно 130 лет', refs: ['Быт 11:32', 'Быт 12:4', 'Деян 7:4'], cert: 'calc', number: 130 },
        { what: 'от Исхода до начала храма прошло 479 лет', refs: ['3Цар 6:1'], cert: 'calc', number: 479 },
      ],
      scheme: 's-mcfall-young', anchors: ['an-solomon-4'], log: LOG,
    },
    {
      id: 'm-farra70', type: 'model', name: 'Фарре 70 лет', basis: 'interpretation', needsSources: true,
      label: 'Понимание Быт 11:26: Аврам — первый из трёх сыновей (толк.); стих не говорит, кто из троих родился в семьдесят лет',
      readings: [{ set: 'r-father-sala', in: 'gen' }],
      choices: [
        { what: 'Фарре при рождении Аврама ровно 70 лет', refs: ['Быт 11:26'], cert: 'calc', number: 70 },
        { what: '430 лет — пребывание в Египте', refs: ['Исх 12:40-41'], cert: 'calc', number: 430 },
        { what: 'от Исхода до начала храма прошло 479 лет', refs: ['3Цар 6:1'], cert: 'calc', number: 479 },
      ],
      scheme: 's-mcfall-young', anchors: ['an-solomon-4'], log: LOG,
    },
    {
      id: 'm-skobki', type: 'model', name: 'Числа в скобках', basis: 'not-basis',
      label: 'По словам в скобках Синодального издания; это не основание факта (02 § 3.8.3 п. 5)',
      readings: [{ set: 'r-father-sala', in: 'lk' }],
      choices: [
        { what: 'где в стихе Быт 5 и 11 есть число в скобках — берётся оно; Каинан между Арфаксадом и Салой — по словам в скобках Быт 11:12–13', refs: ['Быт 5:3', 'Быт 11:12-13'], cert: 'calc' },
        { what: 'Фарре при рождении Аврама ровно 130 лет', refs: ['Быт 11:32', 'Быт 12:4', 'Деян 7:4'], cert: 'calc', number: 130 },
        { what: '430 лет — пребывание в Египте; 479 лет от Исхода до храма', refs: ['Исх 12:40-41', '3Цар 6:1'], cert: 'calc' },
      ],
      scheme: 's-mcfall-young', anchors: ['an-solomon-4'], log: LOG,
    },
  ];
}

function schemes(chrono: { actor: string; chrono: any }[]): KingScheme[] {
  const thiele: KingScheme['table'] = [];
  for (const c of chrono) {
    if (NOT_SCHEME.has(c.actor)) continue;
    for (const r of c.chrono.reign ?? []) {
      const kingdom = KINGDOM[r.over];
      if (!kingdom || typeof r.start !== 'number' || typeof r.end !== 'number') throw new Error(`D6-1: царствование ${c.actor} «${r.over}» без лет или царства`);
      thiele.push({
        king: c.actor, kingdom, ...(typeof r.sole === 'number' ? { coregencyStart: r.start, soleStart: r.sole } : { soleStart: r.start }), end: r.end,
        source: 'годы прежних данных атласа (data/, перенос Д1), близкие к Тиле; не таблица автора, страницы нет — справка',
      });
    }
  }
  return [
    {
      id: 's-mcfall-young', type: 'scheme', name: 'Цари: McFall — Young', role: 'default',
      works: [agent('w-mcfall-1991', 'с. 3–45'), agent('w-young-2003', 'с. 589–603'), agent('w-young-2004', 'с. 577–595')],
      table: [],
      params: [
        { what: 'счёт лет Ахаза — от соправления с Иоафамом (4 Цар 17:1 при 4 Цар 16:2)', refs: ['4Цар 17:1', '4Цар 16:2'] },
        { what: 'счёт лет Иоафама идёт дальше его шестнадцати лет царствования (4 Цар 15:30 при 4 Цар 15:33)', refs: ['4Цар 15:30', '4Цар 15:33'] },
        { what: 'годы Езекии в одной главе — от двух начал: 4 Цар 18:1, 9–10 — от соправления с Ахазом; 4 Цар 18:2, 13 — от единоличного царствования', refs: ['4Цар 18:1', '4Цар 18:2', '4Цар 18:9-10', '4Цар 18:13'] },
        { what: '«в тридцать шестой год царствования Асы» — как его читает схема', refs: ['2Пар 16:1'] },
        { what: 'возраст при воцарении (4 Цар 16:2; 18:2) отнесён к началу счёта', refs: ['4Цар 16:2', '4Цар 18:2'] },
      ],
      rejects: [], anchors: ['an-samaria', 'an-qarqar', 'an-jehu-tribute', 'an-sennacherib'],
      note: 'Схема по умолчанию (В-23): не объявляет ошибкой ни одного синхронизма 4 Цар 15–18, но вводит допущения, которых текст не называет. Таблиц авторов со страницами для каждого царя в базе ещё нет: год по этой схеме не показан (04 § 16.1); страницы допущений — задача 04-3',
      log: LOG,
    },
    {
      id: 's-thiele', type: 'scheme', name: 'Цари: Тиле (справка)', role: 'reference',
      works: [agent('w-thiele-1983', 'таблица царей — страница не сверена'), agent('w-payne-1969', 'страница не сверена')],
      table: thiele, params: [],
      rejects: [{ ref: '4Цар 17:1' }, { ref: '4Цар 18:1' }, { ref: '4Цар 18:9-10' }],
      anchors: ['an-qarqar', 'an-jehu-tribute', 'an-sennacherib'],
      note: 'Справка: синхронизмы 4 Цар 17:1; 18:1, 9–10 Тиле признал ошибкой (Payne, 1969) — это отмена чисел текста. В таблице — годы прежних данных атласа, близкие к Тиле (04 § 3.8: «по Тиле в данных, не таблица Тиле»); страницы 3-го издания нет — в выпуск не идёт, в пробе показывается с пометкой «справка» (10 § 4.2.2). Опора Самарии этой схемы — 722 (альтернатива опоры an-samaria)',
      log: LOG,
    },
    {
      id: 's-galil', type: 'scheme', name: 'Цари: Галиль (вторая очередь)', role: 'second-turn',
      works: [agent('w-galil-1996', 'страница не сверена')], table: [], params: [], rejects: [], anchors: [],
      note: 'Вторая очередь (04 § 3.8, § 16.1): переключатель царских схем; таблицы нет', log: LOG,
    },
  ];
}

// ---------------------------------------------------------------- опоры (D6-2)

const ANCHORS: Record<string, (a: any) => any> = {
  'an-solomon-4': (a) => ({
    ...a,
    source: 'Счёт назад по годам царей Израиля от двух ассирийских опор — битва при Каркаре (853) и дань Ииуя (841) — до смерти Соломона и его 4-го года, по схеме McFall — Young (Young, 2003). Подпись «Тиле — Янга» снята: такой схемы нет (04 § 3.8)',
    works: [agent('w-young-2003', 'с. 589–603')],
    chain: [
      { step: 'Ахав при Каркаре — 853 г. до Р. Х.', cert: 'reference', anchor: 'an-qarqar' },
      { step: 'дань Ииуя — 841 г. до Р. Х.', cert: 'reference', anchor: 'an-jehu-tribute' },
      { step: 'годы царей Израиля назад до разделения царства — по схеме s-mcfall-young (страница — задача 04-3)', cert: 'calc', refs: ['3Цар 14:20', '3Цар 22:52', '4Цар 10:36'] },
      { step: 'Соломон царствовал сорок лет; храм заложен в четвёртый год его царствования', cert: 'scripture', refs: ['3Цар 11:42', '3Цар 6:1'] },
    ],
    alternatives: [{ value: -966, words: '966 (Тиле)', works: [agent('w-thiele-1983', 'страница не сверена')] }],
  }),
  'an-qarqar': (a) => ({
    ...a,
    source: 'Курхский монолит Салманасара III (кол. ii): Ахав среди противников при Каркаре в 6-й год Салманасара',
    works: [agent('w-rima-3', 'A.0.102.2 (Курхский монолит), кол. ii')],
  }),
  'an-jehu-tribute': (a) => ({
    ...a,
    source: 'Чёрный обелиск Салманасара III: надпись над рельефом «дань Ииуя», 18-й год Салманасара',
    works: [agent('w-rima-3', 'с. 149, A.0.102.88'), agent('w-anet-1969', 'с. 281')],
  }),
  'an-samaria': (a) => ({
    ...a, value: -723,
    source: 'По схеме по умолчанию McFall — Young: Самария взята в 723 г. до Р. Х. (Young, 2004); при этой опоре скрипт находит 0 нарушений из 7 сверок 4 Цар 15–18 (04 § 3.8)',
    works: [agent('w-young-2004', 'с. 577–595')],
    alternatives: [{ value: -722, words: '722 (Тиле)', works: [agent('w-thiele-1983', 'страница не сверена')] }],
  }),
  'an-sennacherib': (a) => ({
    ...a,
    source: 'Анналы Сеннахирима, третий поход: осада городов Иудеи и Иерусалима при Езекии',
    works: [agent('w-rinap-3-1', 'Sennacherib 22 (призма), третий поход')],
  }),
};

// ---------------------------------------------------------------- эпохи 1–5 (D6-3)

const DEF = 'Библия наглядно, выпуск 1 (до первого выпуска — проба)';
const EPOCHS: Record<string, (e: any) => any> = {
  'era-antediluvian': (e) => ({
    id: e.id, name: e.name, short: e.short, definition: DEF,
    start: {
      event: 'сотворение Адама', refs: ['Быт 1:27', 'Быт 5:1-2'], words: 'сотворил Бог человека… мужчину и женщину сотворил их', rule: { person: 'p-adam' },
      note: 'Быт 1:1 – 2:3 стоит в начале шкалы без года: года текст не называет; счёт лет — от сотворения Адама (04 § 3.2)',
    },
    end: { event: 'потоп', refs: ['Быт 7:6', 'Быт 7:11'], words: 'Ной же был шестисот лет, как потоп водный пришел на землю', rule: { person: 'p-noy', years: 600 } },
    boundary: 'exact',
    scope: { words: 'весь мир до потопа' },
    basis: 'Сумма возрастов отцов при рождении сыновей в Быт 5 — от сотворения Адама до потопа; потоп — в шестисотый год жизни Ноя (Быт 7:6, 11). Годы считает модель.',
    refs: e.refs, summary: e.summary, books: e.books, keyPersons: e.keyPersons,
    events: e.events.map(({ year: _y, ...x }: any) => x),
  }),
  'era-postdiluvian': (e) => ({
    id: e.id, name: e.name, short: e.short, definition: DEF,
    start: { event: 'потоп', refs: ['Быт 7:6', 'Быт 7:11'], words: 'Ной же был шестисот лет, как потоп водный пришел на землю', rule: { person: 'p-noy', years: 600 } },
    end: { event: 'Аврам выходит из Харрана', refs: ['Быт 12:4'], words: 'Аврам был семидесяти пяти лет, когда вышел из Харрана', rule: { person: 'p-avraam', years: 75 } },
    boundary: 'exact',
    scope: { words: 'потомки Ноя до выхода Аврама из Харрана' },
    basis: 'Возраст отцов при рождении сыновей в Быт 11:10–26 и возраст Фарры при рождении Аврама — по модели (04 § 3.8): «не меньше 130» — вывод из Быт 11:32; 12:4 и Деян 7:4, «ровно 130» — выбор модели; «Фарра жил семьдесят лет и родил Аврама, Нахора и Арана» (Быт 11:26) — модель «Фарре 70 лет» (толк.). Граница — выход Аврама из Харрана (Быт 12:4): Аврам стоит в обеих эпохах.',
    refs: ['Быт 11:10-26', 'Быт 11:32', 'Быт 12:4', 'Деян 7:4'], summary: e.summary, books: e.books, keyPersons: e.keyPersons,
    events: e.events.map(({ year: _y, ...x }: any) => x),
  }),
  'era-patriarchs': (e) => ({
    id: e.id, name: e.name, short: e.short, definition: DEF,
    start: { event: 'Аврам выходит из Харрана', refs: ['Быт 12:4'], words: 'Аврам был семидесяти пяти лет, когда вышел из Харрана', rule: { person: 'p-avraam', years: 75 } },
    end: { event: 'Иаков с родом приходит в Египет', refs: ['Быт 46:6', 'Быт 47:9'], words: 'пришли в Египет, — Иаков и весь род его с ним', rule: { person: 'p-iakov', years: 130 } },
    boundary: 'exact',
    scope: { words: 'Авраам, Исаак, Иаков и его сыновья — в Ханаане и Месопотамии' },
    basis: 'Аврам семидесяти пяти лет при выходе из Харрана (Быт 12:4), ста лет при рождении Исаака (Быт 21:5); Исаак шестидесяти при рождении Иакова (Быт 25:26); Иаков ста тридцати при приходе в Египет (Быт 47:9). Годы считает модель.',
    refs: ['Быт 12:4', 'Быт 21:5', 'Быт 25:26', 'Быт 47:9'], summary: e.summary, books: e.books, keyPersons: e.keyPersons,
    events: e.events.map(({ year: _y, ...x }: any) => x),
  }),
  'era-egypt': (e) => ({
    id: e.id, name: e.name, short: e.short, definition: DEF,
    start: { event: 'Иаков с родом приходит в Египет', refs: ['Быт 46:6', 'Быт 47:9'], words: 'пришли в Египет, — Иаков и весь род его с ним', rule: { person: 'p-iakov', years: 130 } },
    end: { event: 'Исход', refs: ['Исх 12:40-41'], words: 'По прошествии четырехсот тридцати лет, в этот самый день вышло все ополчение Господне из земли Египетской', rule: { anchor: 'an-solomon-4', yearsBefore: 479, refs: ['3Цар 6:1'] } },
    boundary: 'exact',
    scope: { words: 'дом Иакова в Египте' },
    basis: '«Времени же, в которое сыны Израилевы обитали в Египте, было четыреста тридцать лет» (Исх 12:40, слова вне скобок) — модель по умолчанию. Модель «Краткое пребывание» по одному из пониманий Гал 3:17 (толк.) считает 430 лет от обетования Аврааму и понимает слова «в Египте» иначе, чем они звучат вне скобок (04 § 3.8, § 6.1).',
    refs: e.refs, summary: e.summary, books: e.books, keyPersons: e.keyPersons,
    events: e.events.map(({ year: _y, ...x }: any) => x),
  }),
  'era-exodus': (e) => ({
    id: e.id, name: e.name, short: e.short, definition: DEF,
    start: { event: 'Исход', refs: ['Исх 12:40-41'], words: 'вышло все ополчение Господне из земли Египетской', rule: { anchor: 'an-solomon-4', yearsBefore: 479, refs: ['3Цар 6:1'] } },
    end: { event: 'переход через Иордан', refs: ['Нав 3:17'], words: 'Все Израилевы переходили по суше, доколе весь народ не перешел чрез Иордан', rule: { anchor: 'an-solomon-4', yearsBefore: 479, plus: 40, refs: ['3Цар 6:1', 'Чис 14:33', 'Втор 1:3'] } },
    boundary: 'exact',
    scope: { words: 'Израиль в пустыне, от Египта до Иордана' },
    basis: 'Храм заложен «в четыреста восьмидесятом году по исшествии сынов Израилевых из земли Египетской», в четвёртый год Соломона (3 Цар 6:1): от Исхода до опоры прошло 479 лет. Сорок лет в пустыне (Чис 14:33–34; Втор 1:3). Годы считает модель от опоры an-solomon-4.',
    refs: ['3Цар 6:1', 'Чис 14:33-34', 'Втор 1:3', 'Нав 3:17'], summary: e.summary, books: e.books, keyPersons: e.keyPersons,
    events: e.events.map(({ year: _y, ...x }: any) => x),
  }),
};

// ---------------------------------------------------------------- шаги

export const STEPS_D6: Step[] = [
  {
    id: 'D6-1',
    scope: ['model:m-', 'model:s-'],
    run: ({ base }) => {
      if (base.models.length) throw new Error('D6-1: моделей уже есть');
      base.models = [...models(), ...schemes(base.chrono as any)];
      const th = base.models.find((m) => m.id === 's-thiele') as KingScheme;
      return {
        what: `Д6: модели m-dolgoe, m-kratkoe, m-farra70, m-skobki и схемы s-mcfall-young (по умолчанию, таблицы авторов нет), s-thiele (справка: ${th.table.length} строк — годы прежних данных, без страницы), s-galil (вторая очередь) — base/models.json`,
        why: '02 § 3.15.2–3.15.3; 04 § 3.8, § 9 п. 17, 20, 21, § 16.1; 10 § 4.2.2 — годы Тиле с пометкой «справка», пока таблиц McFall — Young нет',
        refs: ['3Цар 6:1', 'Исх 12:40', 'Быт 11:26', 'Гал 3:17'],
        actors: [],
        other: ['models'],
      };
    },
  },
  {
    id: 'D6-2',
    scope: ['anchors'],
    run: ({ base }) => {
      for (const [id, f] of Object.entries(ANCHORS)) {
        const i = base.anchors.anchors.findIndex((a: any) => a.id === id);
        if (i < 0) throw new Error(`D6-2: нет опоры ${id}`);
        base.anchors.anchors[i] = { ...f(base.anchors.anchors[i]), prov: touch };
      }
      return {
        what: 'Д6: опоры сцен пакета 1 (an-solomon-4, an-qarqar, an-jehu-tribute, an-samaria, an-sennacherib) — труды с изданием и местом, альтернативы с трудом; Самария по схеме по умолчанию — 723, 722 — альтернатива по Тиле; у опоры 967 — цепочка «как получено», подпись «Тиле — Янга» снята',
        why: '02 § 3.15.4; 04 § 3.8, § 9 п. 6, 19 (научные инструменты № 1; решение координатора 3)',
        refs: ['3Цар 6:1', '4Цар 17:6', '4Цар 18:13'],
        actors: [],
        other: ['anchors'],
      };
    },
  },
  {
    id: 'D6-3',
    scope: Object.keys(EPOCHS).map((k) => `epoch:${k}`),
    run: ({ base }) => {
      for (const [id, f] of Object.entries(EPOCHS)) {
        const i = base.epochs.findIndex((e) => e.id === id);
        if (i < 0) throw new Error(`D6-3: нет эпохи ${id}`);
        base.epochs[i] = { ...f(base.epochs[i]), prov: touch };
      }
      return {
        what: 'Д6 (Д-11 для эпох 1–5): эпохи по образцу PeriodO — определение, начало и конец событием со стихом и словами, правило границы для расчёта, вид границы; готовые годы сняты (у событий эпохи — тоже); граница 2–3 — выход Аврама из Харрана (Быт 12:4); основание эпохи «В Египте» больше не выводит «Краткое пребывание» из слов в скобках',
        why: '02 § 3.15.1; 04 § 3.2, § 9 п. 3, 23',
        refs: ['Быт 12:4', 'Быт 7:6', 'Быт 47:9', 'Исх 12:40-41', '3Цар 6:1', 'Нав 3:17'],
        actors: ['avraam', 'noy', 'iakov', 'adam'],
        other: Object.keys(EPOCHS).map((k) => `epoch:${k}`),
      };
    },
  },
  {
    id: 'D6-4',
    scope: D6_ACTORS.map((a) => `chrono:${a}`),
    run: ({ base }) => {
      const fatherOf = (id: string) => base.origins.find((o) => o.child === id && o.role === 'father' && o.primary)?.parent;
      const n = { m: 0, s: 0, '-': 0, inputs: 0, epochs: 0, kept: 0 };
      for (const id of D6_ACTORS) {
        const c = base.chrono.find((x) => x.actor === id);
        if (!c) throw new Error(`D6-4: нет хронологической записи ${id}`);
        const old = c.chrono as any;
        const x = id.slice(2);
        let rec: ChronoD6;
        if (MANUAL[id]) rec = MANUAL[id]();
        else if (G5.includes(x) || G11.includes(x)) rec = fromGenealogy(id, old, fatherOf(id), G11.includes(x));
        else rec = { inputs: [] };
        const k = CALC_OF(id);
        rec.inputs = rec.inputs.map((t) => withCalc(t, k));
        // эпоха без стиха остаётся прежней строкой — долг 04 § 3.2; со стихом — в `epochs`
        if (!rec.epochs?.length && typeof old.epoch === 'string') (rec.epoch = old.epoch), n.kept++;
        if (rec.epochs?.length) n.epochs++;
        n.inputs += rec.inputs.length;
        for (const t of rec.inputs) if (t.calc) n[t.calc.model ? 'm' : t.calc.scheme ? 's' : '-']++;
        c.chrono = rec;
        c.prov = { ...c.prov, ...touch };
      }
      return {
        what: `Д6: хронологические записи ${D6_ACTORS.length} лиц сцен 1.14–1.16 — окончательного вида: входов ${n.inputs} (ссылка calc: модель m-dolgoe ${n.m}, схема s-mcfall-young ${n.s}); эпоха со стихом — у ${n.epochs} лиц, прежней строкой без стиха — у ${n.kept}; готовые годы, промежутки, «заведомо жив в годы…», оценки атласа и примечания о реконструкции сняты; добавлены «воцарился вместо него» у 10 царей (4 Цар 14–16) и синхронизмы 4 Цар 18:9–10`,
        why: '02 § 3.15.5 (в записи — только числа текста и отношения со стихами; ни один год не хранится); 04 § 3.2, § 9 п. 1, 2, 6, 15, 18; Д-р1 (Давид — по модели)',
        refs: ['Быт 5:3', 'Быт 11:10', 'Исх 7:7', 'Чис 33:38-39', '4Цар 15:5', '4Цар 18:9-10'],
        actors: D6_ACTORS.map((a) => a.slice(2)),
      };
    },
  },
];
