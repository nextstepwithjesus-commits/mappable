/**
 * Шаги правки по задачам данных 02 § 3.18 (первая партия): Д-5, Д-7, Д-2. Все стихи прочитаны командой `npm run -s verse`;
 * новых толкований шаги не вносят. Отчёт — docs/app/reviews/Д-партия-1-отчёт.md.
 *
 * D5 (Д-5; 02 § 3.9): 18 записей родства словами и 5 обозначений союза уровня «толкование» вне набора прочтений. Каждая —
 *    (а) по слову текста: «Писание», если стих называет обоих; «вывод», если царя называет соседний стих главы;
 *    (б) слово сказано, а то ли это лицо — текст прямо не говорит: «Писание» и поле тождества `identity` (по образцу C45);
 *    (в) основание только в отождествлении или в толковании: запись снята, понимание — примечанием лица § 24 уровня
 *        «толкование» с пометкой needsSources (по образцу C46, C50; авторов нет).
 * D7 (Д-7, Р-5; 02 § 3.10.2, § 3.15): 323 утверждения с годом в записи. Год (`year`, `from`, `to`) снят; запись ссылается на
 *    расчёт `calc` — модель `m-dolgoe` до Соломона, схема царей `s-mcfall-young` от Соломона до падения Иерусалима; после
 *    падения Иерусалима и в Новом Завете модели в 04 § 16.1 нет — ссылка без модели (замечание «расчёт»). Событие — первый
 *    стих записи, пока нет историй `e-…`. Прежние годы остаются в data/ только для сверки (02 § 3.15.5). Примечания о самих
 *    годах («годы приблизительны», «по хронологии, принятой в атласе») сняты вместе с годом.
 * D2 (Д-2, Р-6; 02 § 3.4): 368 рёбер вида «предок» без степени. «Степень выведена» (`inferred`, «вывод») — где цепочка
 *    рождений названа другими стихами; Валтасар — вид «слово текста» (`text-word`) со словами Дан 5:11, 13, 18, 22 и их
 *    говорящими; остальные — «степень не названа» (`unstated`): текст говорит о происхождении («из сыновей Пароша»,
 *    «чрез Аарона, отца их»), а степени не называет.
 */
import type { Step } from './corrections.ts';
import type { Actor, Assertion, EndIdentity, KinTerm, Ref } from './types.ts';
import { issuerOf } from './ids.ts';

const by = (id: string) => ({ by: `исправление ${id}` });

// ---------------------------------------------------------------- Д-5

/** (а), (б): родство остаётся, уровень — по словам стиха. */
const KIN_KEEP: { from: string; to: string; rel: string; cert: 'scripture' | 'inference'; refs: Ref[]; identity?: EndIdentity }[] = [
  // «сын царя»: слова стиха; какой царь — по соседнему стиху главы (вывод по двум стихам)
  { from: 'p-maaseya-syn-akhaza', to: 'p-akhaz', rel: 'сын царя', cert: 'inference', refs: ['2Пар 28:1', '2Пар 28:7'] },
  { from: 'p-ierameil-syn-tsarya', to: 'p-ioakim-tsar', rel: 'сын царя', cert: 'inference', refs: ['Иер 36:26', 'Иер 36:28'] },
  { from: 'p-malkhiya-syn-tsarya', to: 'p-sedekiya', rel: 'сын царя', cert: 'inference', refs: ['Иер 38:5', 'Иер 38:6'] },
  { from: 'p-ioas-syn-tsarya', to: 'p-akhav', rel: 'сын царя', cert: 'inference', refs: ['3Цар 22:26', '2Пар 18:3', '2Пар 18:25'] },
  // слово сказано прямо
  { from: 'p-toviya-ammonityanin', to: 'p-eliashiv-pervosvyashchennik', rel: 'близкий родственник', cert: 'scripture', refs: ['Неем 13:4'] },
  { from: 'p-andronik', to: 'p-pavel', rel: 'сродник', cert: 'scripture', refs: ['Рим 16:7'] },
  { from: 'p-yuniya', to: 'p-pavel', rel: 'сродница', cert: 'scripture', refs: ['Рим 16:7'] },
  { from: 'p-irodion', to: 'p-pavel', rel: 'сродник', cert: 'scripture', refs: ['Рим 16:11'] },
  { from: 'p-luciy-srodnik', to: 'p-pavel', rel: 'сродник', cert: 'scripture', refs: ['Рим 16:21'] },
  { from: 'p-iason-srodnik', to: 'p-pavel', rel: 'сродник', cert: 'scripture', refs: ['Рим 16:21'] },
  { from: 'p-sosipatr-srodnik', to: 'p-pavel', rel: 'сродник', cert: 'scripture', refs: ['Рим 16:21'] },
  { from: 'p-maakha-zhena-makhira', to: 'p-shupim-syn-ira', rel: 'сестра', cert: 'scripture', refs: ['1Пар 7:15'] },
  { from: 'p-maakha-zhena-makhira', to: 'p-khupim-syn-ira', rel: 'сестра', cert: 'scripture', refs: ['1Пар 7:15'] },
  // (б) слово сказано; тождество конца — «предположительно»
  {
    from: 'p-mariya-kleopova', to: 'p-mariya', rel: 'сестра', cert: 'scripture', refs: ['Ин 19:25'],
    identity: { of: 'from', degree: 'possible', note: '«Матерь Его и сестра Матери Его, Мария Клеопова, и Мария Магдалина» (Ин 19:25) — одно ли лицо «сестра Матери Его» и Мария Клеопова, текст прямо не говорит', refs: ['Ин 19:25'] },
  },
  {
    from: 'p-ioil-brat-nafana', to: 'p-nafan-otets-igala', rel: 'брат', cert: 'scripture', refs: ['1Пар 11:38'],
    identity: { of: 'to', degree: 'possible', note: '«Иоиль, брат Нафана» (1Пар 11:38); на этом месте перечня в 2Цар 23:36 стоит «Игал, сын Нафана»; тот ли это Нафан, текст прямо не говорит', refs: ['1Пар 11:38', '2Цар 23:36'] },
  },
];

/** (в): родство снято; понимание — примечанием лица `from`. */
const KIN_DROP: { id: string; from: string; to: string; rel: string; text: string; refs: Ref[] }[] = [
  {
    id: 'k-57', from: 'p-iuda-brat-gospoden', to: 'p-iakov-brat-gospoden', rel: 'брат', refs: ['Иуд 1:1', 'Мф 13:55'],
    text: 'Прежняя запись родства «брат Иакова, брата Господня» снята: она держалась на отождествлении. Автор послания пишет: «Иуда, раб Иисуса Христа, брат Иакова» (Иуд 1:1); что это Иуда из «братьев Его» (Мф 13:55), а Иаков — брат Господень, текст не говорит',
  },
  ...([['k-66', 'p-ioann-deyan4-6'], ['k-67', 'p-aleksandr-deyan4-6']] as const).map(([id, from]) => ({
    id, from, to: 'p-anna-pervosvyashchennik', rel: 'из рода первосвященнического', refs: ['Деян 4:6'],
    text: 'Прежняя запись родства «из рода первосвященнического» с Анной снята: «и Анна первосвященник, и Каиафа, и Иоанн, и Александр, и прочие из рода первосвященнического» (Деян 4:6) — родство с Анной текст не называет',
  })),
];

const MERED_1 = { of: 'husband' as const, degree: 'possible' as const, note: '«И жена его Иудия родила…» (1Пар 4:18) — чья жена: Мереда или Иефера, названных в 1Пар 4:17, — текст прямо не говорит; в данных — Меред, как у рёбер детей', refs: ['1Пар 4:17', '1Пар 4:18'] };
const MERED_2 = { of: 'husband' as const, degree: 'possible' as const, note: '«Сыновья жены его Годии» (1Пар 4:19) — «его» после слов «которую взял Меред» (1Пар 4:18); чья жена, текст прямо не говорит; в данных — Меред, как у рёбер детей', refs: ['1Пар 4:18', '1Пар 4:19'] };

/** Обозначения союзов: уровень и примечание — по словам стиха. */
const UNION_FIX: { id: string; cert: 'scripture' | 'inference'; note: string; identity?: EndIdentity }[] = [
  // «родил от» — как Салмон и Рахава (Мф 1:5): союз по рождению, женой не названа — «не назван», «вывод»
  { id: 'u-khalev-syn-esroma--ieriofa', cert: 'inference', note: '«Халев, сын Есрома, родил от Азувы, жены своей, и от Иериофы» (1Пар 2:18); женой Иериофа не названа' },
  { id: 'u-mered--iudiya', cert: 'scripture', note: '«И жена его Иудия» (1Пар 4:18)', identity: MERED_1 },
  { id: 'u-mered--godiya-sestra-nakhama', cert: 'scripture', note: '«Сыновья жены его Годии» (1Пар 4:19)', identity: MERED_2 },
  // союз описан текстом («и приступил я к пророчице, и она зачала»), браком не назван
  { id: 'u-isaiya--prorochitsa-zhena-isaii', cert: 'scripture', note: '«и приступил я к пророчице, и она зачала и родила сына» (Ис 8:3); женой Исаии она в тексте не названа' },
];
const UNION_DROP = { id: 'u-kleopa--mariya-kleopova', actor: 'p-mariya-kleopova', refs: ['Ин 19:25', 'Лк 24:18'], text: 'Прежний союз «Клеопа — Мария Клеопова» снят: он держался на толковании. «Мария Клеопова» (Ин 19:25) — кем она приходится Клеопе и тот ли это Клеопа, что в Лк 24:18, текст не говорит' };

const kinKey = (k: { from: string; to: string; rel: string }) => `kin:${k.from}|${k.to}|${k.rel}`;
const note = (step: string, text: string, refs: Ref[]): Assertion => ({ sec: 24, field: 'notes', cert: 'interpretation', needsSources: true, prov: by(step), value: { kind: 'interpretation', text, refs } });

// ---------------------------------------------------------------- Д-7

/** Утверждение с годом: лицо, поле, стихи записи (для поиска), m — модель m-dolgoe, s — схема s-mcfall-young, «-» — модели нет. */
const YEARS: [string, string, string, 'm' | 's' | '-'][] = [
  ['p-naasson', 'offices', 'Чис 1:4-7;Чис 1:16', 'm'],
  ['p-naasson', 'events', 'Чис 1:1;Чис 1:7', 'm'],
  ['p-naasson', 'events', 'Чис 10:11-14', 'm'],
  ['p-ioav', 'offices', '1Пар 11:6;2Цар 5:5', 'm'],
  ['p-ioav', 'events', '3Цар 2:28-34', 's'],
  ['p-veseleil-syn-uriya', 'offices', 'Исх 31:2-6;Исх 36:1-2;Исх 38:22-23', 'm'],
  ['p-khalev', 'offices', 'Чис 13:3;Чис 13:7', 'm'],
  ['p-khalev', 'events', 'Чис 13:3-4;Чис 13:7', 'm'],
  ['p-khalev', 'events', 'Нав 14:6-12', 'm'],
  ['p-gofoniil', 'offices', 'Суд 3:10-11', 'm'],
  ['p-aaron', 'offices', 'Исх 7:1-2;Исх 4:16', 'm'],
  ['p-aaron', 'offices', 'Исх 28:1;Лев 8:1-12;Лев 8:30', 'm'],
  ['p-aaron', 'events', 'Чис 20:25-29;Чис 33:38-39', 'm'],
  ['p-moisey', 'offices', 'Исх 3:10;Деян 7:35-36', 'm'],
  ['p-moisey', 'events', 'Исх 12:21-28;Исх 12:40-41;Евр 11:28', 'm'],
  ['p-moisey', 'events', 'Исх 40:17-33', 'm'],
  ['p-moisey', 'events', 'Втор 34:1-5', 'm'],
  ['p-eleazar', 'offices', 'Чис 3:4', 'm'],
  ['p-eleazar', 'offices', 'Чис 20:28;Втор 10:6', 'm'],
  ['p-eleazar', 'events', 'Чис 20:25-28', 'm'],
  ['p-samuil', 'offices', '1Цар 7:6;1Цар 7:15-17', 'm'],
  ['p-samuil', 'events', '1Цар 9:15-17;1Цар 10:1', 'm'],
  ['p-iliy-svyashchennik', 'offices', '1Цар 4:18', 'm'],
  ['p-aviafar', 'offices', '2Цар 8:17;2Цар 20:25;1Пар 15:11', 'm'],
  ['p-aviafar', 'events', '3Цар 2:26-27', 's'],
  ['p-sadok', 'offices', '2Цар 8:17;2Цар 20:25;1Пар 18:16', '-'],
  ['p-sadok', 'offices', '3Цар 2:35;3Цар 4:4', 's'],
  ['p-sadok', 'events', '3Цар 1:8;3Цар 1:32-39', 's'],
  ['p-khelkiya-pervosvyashchennik', 'offices', '4Цар 22:4;2Пар 34:9', 's'],
  ['p-khelkiya-pervosvyashchennik', 'events', '4Цар 22:8;2Пар 34:14-15', 's'],
  ['p-seraiya-pervosvyashchennik', 'events', '4Цар 25:20-21;Иер 52:26-27', 's'],
  ['p-iosedek', 'events', '1Пар 6:15', 's'],
  ['p-iisus-syn-iosedeka', 'offices', 'Агг 1:1;Зах 3:1', '-'],
  ['p-iisus-syn-iosedeka', 'events', 'Езд 2:2;Неем 12:1', '-'],
  ['p-eliashiv-pervosvyashchennik', 'events', 'Неем 3:1', '-'],
  ['p-ezdra', 'offices', 'Езд 7:11-26', '-'],
  ['p-ezdra', 'events', 'Езд 7:6-9', '-'],
  ['p-ezdra', 'events', 'Неем 8:1-8', '-'],
  ['p-iodai', 'offices', '4Цар 11:9;2Пар 24:6', 's'],
  ['p-iodai', 'events', '2Пар 23:11;4Цар 11:12', 's'],
  ['p-tsefaniya-syn-maasei', 'events', '4Цар 25:18-21;Иер 52:24-27', 's'],
  ['p-ieriya', 'events', '1Пар 26:31', 's'],
  ['p-ioziil', 'events', '2Пар 20:14-17', 's'],
  ['p-daniil-iz-synov-ifamara', 'events', 'Неем 10:6;Неем 10:8', '-'],
  ['p-sherevia', 'events', 'Неем 8:7', '-'],
  ['p-sherevia', 'events', 'Неем 9:4-5', '-'],
  ['p-sherevia', 'events', 'Неем 10:9;Неем 10:12', '-'],
  ['p-khashaviya-merarit', 'events', 'Неем 10:9;Неем 10:11', '-'],
  ['p-meremof-syn-urii', 'events', 'Езд 8:33', '-'],
  ['p-meremof-syn-urii', 'events', 'Неем 3:3-4;Неем 3:21', '-'],
  ['p-kelaiya', 'events', 'Неем 8:7', '-'],
  ['p-kelaiya', 'events', 'Неем 9:38;Неем 10:1;Неем 10:9-10;Езд 10:23', '-'],
  ['p-elishama-syn-ammiuda', 'offices', 'Чис 1:10;Чис 2:18;Чис 10:22', 'm'],
  ['p-iisus-navin', 'offices', 'Исх 24:13;Исх 33:11;Чис 11:28;Нав 1:1', 'm'],
  ['p-iisus-navin', 'offices', 'Чис 27:18-23;Втор 34:9;Нав 1:1-2', 'm'],
  ['p-iisus-navin', 'events', 'Исх 17:9-13', 'm'],
  ['p-iisus-navin', 'events', 'Чис 13:9;Чис 13:17', 'm'],
  ['p-iisus-navin', 'events', 'Нав 1:1-9;Нав 1:16-17', 'm'],
  ['p-avenir', 'offices', '2Цар 2:8-9;2Цар 3:6', 'm'],
  ['p-saul', 'offices', '1Цар 10:24;1Цар 11:15;Деян 13:21', 'm'],
  ['p-ievosfey', 'offices', '2Цар 2:8-10', 'm'],
  ['p-agoliav', 'offices', 'Исх 31:6;Исх 36:1-2;Исх 38:23', 'm'],
  ['p-aod', 'offices', 'Суд 3:15;Суд 3:27-30', 'm'],
  ['p-devora', 'offices', 'Суд 4:4-5', 'm'],
  ['p-varak', 'offices', 'Суд 4:6-16', 'm'],
  ['p-gedeon', 'offices', 'Суд 6:14;Суд 6:34-35;Суд 8:28', 'm'],
  ['p-fola-syn-fui', 'offices', 'Суд 10:1-2', 'm'],
  ['p-iair-galaadityanin', 'offices', 'Суд 10:3', 'm'],
  ['p-ieffay', 'offices', 'Суд 12:7', 'm'],
  ['p-esevon-iz-vifleema', 'offices', 'Суд 12:8-9', 'm'],
  ['p-elon-zavulonyanin', 'offices', 'Суд 12:11', 'm'],
  ['p-avdon-syn-gillela', 'offices', 'Суд 12:13-14', 'm'],
  ['p-samson', 'offices', 'Суд 15:20;Суд 16:31', 'm'],
  ['p-david', 'offices', '2Цар 2:4;2Цар 2:11', 'm'],
  ['p-david', 'offices', '2Цар 5:3-5;2Цар 8:15', 'm'],
  ['p-david', 'events', '2Цар 2:1-4', 'm'],
  ['p-david', 'events', '2Цар 5:6-9;1Пар 11:4-7', 'm'],
  ['p-david', 'events', '3Цар 1:28-40', 's'],
  ['p-david', 'events', '3Цар 2:1-9;1Пар 22:6-16;1Пар 28:9-10', 's'],
  ['p-solomon', 'offices', '3Цар 1:39;3Цар 4:1;3Цар 11:42', 's'],
  ['p-solomon', 'events', '3Цар 1:32-40', 's'],
  ['p-solomon', 'events', '3Цар 6:1;2Пар 3:1-2', 's'],
  ['p-solomon', 'events', '3Цар 6:37-38', 's'],
  ['p-rovoam', 'offices', '3Цар 14:21;2Пар 12:13', 's'],
  ['p-aviya', 'offices', '3Цар 15:1-2;2Пар 13:1-2', 's'],
  ['p-asa', 'offices', '3Цар 15:9-10', 's'],
  ['p-iosafat', 'offices', '3Цар 22:41-42', 's'],
  ['p-ioram-syn-iosafata', 'offices', '4Цар 8:16-17', 's'],
  ['p-okhoziya-syn-iorama', 'offices', '4Цар 8:25-26', 's'],
  ['p-ioas-syn-okhozii', 'offices', '4Цар 12:1;2Пар 24:1', 's'],
  ['p-amasiya', 'offices', '4Цар 14:1-2', 's'],
  ['p-oziya', 'offices', '4Цар 15:1-2;2Пар 26:3', 's'],
  ['p-ioafam', 'offices', '4Цар 15:32-33', 's'],
  ['p-akhaz', 'offices', '4Цар 16:1-2', 's'],
  ['p-ezekiya', 'offices', '4Цар 18:1-2', 's'],
  ['p-manassiya-tsar', 'offices', '4Цар 21:1;2Пар 33:1', 's'],
  ['p-amon-tsar', 'offices', '4Цар 21:19', 's'],
  ['p-iosiya', 'offices', '4Цар 22:1;2Пар 34:1', 's'],
  ['p-ioakhaz-syn-iosii', 'offices', '4Цар 23:31;2Пар 36:2', 's'],
  ['p-ioakim-tsar', 'offices', '4Цар 23:36;2Пар 36:5', 's'],
  ['p-sedekiya', 'offices', '4Цар 24:18;Иер 52:1', 's'],
  ['p-iekhoniya', 'offices', '4Цар 24:8;2Пар 36:9', 's'],
  ['p-ieroboam', 'offices', '3Цар 12:20;3Цар 14:20', 's'],
  ['p-navat-syn-ieroboama', 'offices', '3Цар 14:20;3Цар 15:25', 's'],
  ['p-vaasa', 'offices', '3Цар 15:28;3Цар 15:33', 's'],
  ['p-ila-syn-vaasy', 'offices', '3Цар 16:8', 's'],
  ['p-zamvriy', 'offices', '3Цар 16:15', 's'],
  ['p-amvriy', 'offices', '3Цар 16:23', 's'],
  ['p-akhav', 'offices', '3Цар 16:29', 's'],
  ['p-okhoziya-syn-akhava', 'offices', '3Цар 22:51', 's'],
  ['p-ioram-syn-akhava', 'offices', '4Цар 3:1', 's'],
  ['p-gofoliya', 'offices', '4Цар 11:3;2Пар 22:12', 's'],
  ['p-iiuy', 'offices', '4Цар 10:36', 's'],
  ['p-ioakhaz-syn-iiuya', 'offices', '4Цар 13:1', 's'],
  ['p-ioas-syn-ioakhaza', 'offices', '4Цар 13:10', 's'],
  ['p-ieroboam-vtoroy', 'offices', '4Цар 14:23', 's'],
  ['p-zakhariya-syn-ieroboama', 'offices', '4Цар 15:8', 's'],
  ['p-sellum-syn-iavisa', 'offices', '4Цар 15:13', 's'],
  ['p-menaim', 'offices', '4Цар 15:17', 's'],
  ['p-fakiya', 'offices', '4Цар 15:23', 's'],
  ['p-fakey', 'offices', '4Цар 15:27', 's'],
  ['p-osiya-syn-ily', 'offices', '4Цар 17:1', 's'],
  ['p-iliya', 'offices', '3Цар 17:1;4Цар 1:3', 's'],
  ['p-elisey', 'offices', '3Цар 19:16;4Цар 2:15', 's'],
  ['p-ionadav-syn-rekhava', 'events', '4Цар 10:15-16', 's'],
  ['p-isaiya', 'offices', 'Ис 1:1;Ис 6:1;Ис 36:1', 's'],
  ['p-isaiya', 'events', 'Ис 6:1-8', 's'],
  ['p-isaiya', 'events', 'Ис 37:1-7;4Цар 19:1-7', 's'],
  ['p-osiya-prorok', 'offices', 'Ос 1:1', 's'],
  ['p-oldama', 'events', '4Цар 22:14;2Пар 34:22', 's'],
  ['p-ieremiya', 'offices', 'Иер 1:2-3', 's'],
  ['p-ieremiya', 'events', 'Иер 1:2;Иер 1:4-10', 's'],
  ['p-ieremiya', 'events', '2Пар 35:25', 's'],
  ['p-ieremiya', 'events', 'Иер 36:1-8;Иер 36:27-32', 's'],
  ['p-ieremiya', 'events', 'Иер 27:2;Иер 28:1-17', 's'],
  ['p-ieremiya', 'events', 'Иер 51:59-64', 's'],
  ['p-ieremiya', 'events', 'Иер 39:11-14', 's'],
  ['p-varukh', 'events', 'Иер 36:1-4;Иер 45:1', 's'],
  ['p-varukh', 'events', 'Иер 36:9-10', 's'],
  ['p-seraiya-syn-nirii', 'events', 'Иер 51:59-60', 's'],
  ['p-shafan', 'offices', '4Цар 22:3;2Пар 34:8', 's'],
  ['p-shafan', 'events', '4Цар 22:3-7;2Пар 34:8-13', 's'],
  ['p-akhikam', 'events', '4Цар 22:12-14;2Пар 34:20-22', 's'],
  ['p-gemariya-syn-shafana', 'events', 'Иер 36:10', 's'],
  ['p-godoliya', 'offices', '4Цар 25:22;Иер 40:5;Иер 40:7', 's'],
  ['p-ananiya-syn-azura', 'events', 'Иер 28:1-4', 's'],
  ['p-navuzardan', 'events', '4Цар 25:8-9;Иер 52:12-13', 's'],
  ['p-iezekiil', 'offices', 'Иез 1:3;Иез 3:17', 's'],
  ['p-iezekiil', 'events', 'Иез 1:1-3;Иез 1:28', 's'],
  ['p-daniil', 'events', 'Дан 1:1-7', 's'],
  ['p-daniil', 'events', 'Дан 10:1-5', '-'],
  ['p-navukhodonosor', 'offices', 'Иер 25:1;4Цар 24:1', 's'],
  ['p-navukhodonosor', 'events', 'Дан 1:1-4', 's'],
  ['p-navukhodonosor', 'events', '4Цар 24:10-16', 's'],
  ['p-navukhodonosor', 'events', '4Цар 25:8-9', 's'],
  ['p-evilmerodakh', 'events', '4Цар 25:27-30;Иер 52:31-34', '-'],
  ['p-kir', 'events', '2Пар 36:22-23;Езд 1:1-4', '-'],
  ['p-kir', 'offices', '2Пар 36:22;Езд 1:1', '-'],
  ['p-dariy-midyanin', 'events', 'Дан 5:31', '-'],
  ['p-dariy-persidskiy', 'events', 'Езд 6:15-16', '-'],
  ['p-artakserks', 'events', 'Езд 7:11-26', '-'],
  ['p-artakserks', 'events', 'Неем 2:1-9', '-'],
  ['p-sheshbatsar', 'events', 'Езд 1:11', '-'],
  ['p-aggey', 'events', 'Агг 1:1-11', '-'],
  ['p-zakhariya-syn-varakhii', 'events', 'Зах 1:1-6', '-'],
  ['p-neemiya', 'offices', 'Неем 5:14', '-'],
  ['p-neemiya', 'events', 'Неем 1:1-11', '-'],
  ['p-zorovavel', 'offices', 'Агг 1:1;Агг 1:14;Агг 2:2;Агг 2:21', '-'],
  ['p-zorovavel', 'events', 'Езд 2:1-2;Неем 7:6-7;Неем 12:1', '-'],
  ['p-zorovavel', 'events', 'Езд 5:1-2;Агг 1:12-15', '-'],
  ['p-zorovavel', 'events', 'Езд 6:14-16;Зах 4:9', '-'],
  ['p-mariya', 'events', 'Лк 1:26-33', '-'],
  ['p-mariya', 'events', 'Лк 2:6-7', '-'],
  ['p-mariya', 'events', 'Лк 2:42-51', '-'],
  ['p-mariya', 'events', 'Ин 19:25', '-'],
  ['p-iosif-muzh-marii', 'events', 'Лк 2:6-7;Лк 2:16', '-'],
  ['p-iosif-muzh-marii', 'events', 'Лк 2:42-45', '-'],
  ['p-iisus', 'offices', 'Мф 4:17;Мф 4:23;Ин 1:38', '-'],
  ['p-iisus', 'events', 'Лк 2:21', '-'],
  ['p-iisus', 'events', 'Лк 2:42-51', '-'],
  ['p-iisus', 'events', 'Мф 3:13-16;Мк 1:9-10;Лк 3:21-22', '-'],
  ['p-iisus', 'events', 'Мф 21:1-11', '-'],
  ['p-iisus', 'events', 'Мф 27:35-38;Ин 19:18-19', '-'],
  ['p-iisus', 'events', 'Мф 28:1-7;1Кор 15:4', '-'],
  ['p-iisus', 'events', 'Деян 1:3;Лк 24:50-51;Деян 1:9-12', '-'],
  ['p-zakhariya-svyashchennik', 'events', 'Лк 1:8-10', '-'],
  ['p-elisaveta', 'events', 'Лк 1:24-25', '-'],
  ['p-ioann-krestitel', 'offices', 'Лк 3:2-3;Мк 1:4', '-'],
  ['p-ioann-krestitel', 'events', 'Лк 3:2-3;Мф 3:1-2', '-'],
  ['p-ioann-krestitel', 'events', 'Мф 3:13-16;Ин 1:32-34', '-'],
  ['p-anna-prorochitsa', 'events', 'Лк 2:38', '-'],
  ['p-iakov-brat-gospoden', 'events', 'Деян 15:13-21', '-'],
  ['p-kleopa', 'events', 'Лк 24:13-16', '-'],
  ['p-mariya-kleopova', 'events', 'Ин 19:25', '-'],
  ['p-mariya-mat-iakova', 'events', 'Мф 27:55-56;Мк 15:40', '-'],
  ['p-petr', 'events', 'Мф 26:69-75;Мк 14:66-72;Ин 18:15-18;Ин 18:25-27', '-'],
  ['p-petr', 'events', 'Лк 24:12;Ин 20:2-7', '-'],
  ['p-petr', 'events', 'Ин 21:1-17', '-'],
  ['p-petr', 'events', 'Деян 1:15-26', '-'],
  ['p-petr', 'events', 'Деян 2:14-41', '-'],
  ['p-petr', 'events', 'Деян 15:7-11', '-'],
  ['p-andrey', 'events', 'Деян 1:13-14', '-'],
  ['p-mat-synovey-zevedeevykh', 'events', 'Мф 27:55-56', '-'],
  ['p-iakov-zevedeev', 'events', 'Деян 1:13', '-'],
  ['p-ioann-apostol', 'events', 'Ин 19:26-27', '-'],
  ['p-ioann-apostol', 'events', 'Ин 20:2-8', '-'],
  ['p-salomiya', 'events', 'Мк 15:40', '-'],
  ['p-salomiya', 'events', 'Мк 16:1-2', '-'],
  ['p-filipp-apostol', 'events', 'Деян 1:13', '-'],
  ['p-varfolomey', 'events', 'Деян 1:13', '-'],
  ['p-nafanail', 'events', 'Ин 21:1-2', '-'],
  ['p-foma', 'events', 'Ин 20:24-25', '-'],
  ['p-foma', 'events', 'Ин 20:26-28', '-'],
  ['p-foma', 'events', 'Ин 21:1-2', '-'],
  ['p-foma', 'events', 'Деян 1:13', '-'],
  ['p-matfey', 'events', 'Деян 1:13', '-'],
  ['p-iakov-alfeev', 'events', 'Деян 1:13', '-'],
  ['p-iuda-iakovlev', 'events', 'Деян 1:13', '-'],
  ['p-simon-zilot', 'events', 'Деян 1:9-13', '-'],
  ['p-iuda-iskariot', 'events', 'Мф 26:25;Ин 13:26-30', '-'],
  ['p-iuda-iskariot', 'events', 'Мф 26:47-50;Ин 18:2-5', '-'],
  ['p-iuda-iskariot', 'events', 'Мф 27:3-5', '-'],
  ['p-matfiy', 'events', 'Деян 1:23-26', '-'],
  ['p-lazar', 'events', 'Ин 12:1-2', '-'],
  ['p-lazar', 'events', 'Ин 12:9-11', '-'],
  ['p-marfa', 'events', 'Ин 11:20-27', '-'],
  ['p-marfa', 'events', 'Ин 12:1-2', '-'],
  ['p-mariya-iz-vifanii', 'events', 'Ин 11:20;Ин 11:28-32', '-'],
  ['p-mariya-iz-vifanii', 'events', 'Ин 12:1-3', '-'],
  ['p-simon-kirineyanin', 'events', 'Мф 27:32;Мк 15:21;Лк 23:26', '-'],
  ['p-mariya-magdalina', 'events', 'Мф 27:55-56;Мк 15:40;Ин 19:25', '-'],
  ['p-mariya-magdalina', 'events', 'Мф 27:61;Мк 15:47', '-'],
  ['p-mariya-magdalina', 'events', 'Мк 16:1', '-'],
  ['p-mariya-magdalina', 'events', 'Ин 20:1-2', '-'],
  ['p-mariya-magdalina', 'events', 'Ин 20:11-16', '-'],
  ['p-mariya-magdalina', 'events', 'Ин 20:18;Мк 16:10;Лк 24:10', '-'],
  ['p-ioanna-zhena-khuzy', 'events', 'Лк 24:1-10', '-'],
  ['p-nikodim', 'events', 'Ин 19:39-40', '-'],
  ['p-iosif-arimafeyskiy', 'events', 'Мк 15:43-45;Ин 19:38', '-'],
  ['p-iosif-arimafeyskiy', 'events', 'Мф 27:59-60;Мк 15:46;Лк 23:53;Ин 19:39-42', '-'],
  ['p-irod-velikiy', 'offices', 'Лк 1:5;Мф 2:1;Мф 2:22', '-'],
  ['p-arkhelay', 'offices', 'Мф 2:22', '-'],
  ['p-irod-antipa', 'offices', 'Лк 3:1;Лк 23:7', '-'],
  ['p-irod-antipa', 'events', 'Лк 23:6-9', '-'],
  ['p-irod-antipa', 'events', 'Лк 23:11-12', '-'],
  ['p-irod-antipa', 'events', 'Лк 23:15', '-'],
  ['p-filipp-brat-iroda', 'offices', 'Лк 3:1', '-'],
  ['p-feliks', 'offices', 'Деян 23:24;Деян 24:27', '-'],
  ['p-pontiy-pilat', 'offices', 'Лк 3:1;Мф 27:2', '-'],
  ['p-pontiy-pilat', 'events', 'Мф 27:1-2;Мф 27:11;Ин 18:28-33', '-'],
  ['p-pontiy-pilat', 'events', 'Лк 23:4;Ин 18:38', '-'],
  ['p-pontiy-pilat', 'events', 'Лк 23:6-12', '-'],
  ['p-pontiy-pilat', 'events', 'Мф 27:19', '-'],
  ['p-pontiy-pilat', 'events', 'Мф 27:15-21;Ин 18:39-40', '-'],
  ['p-pontiy-pilat', 'events', 'Мф 27:24-26;Мк 15:15', '-'],
  ['p-pontiy-pilat', 'events', 'Ин 19:19-22', '-'],
  ['p-pontiy-pilat', 'events', 'Мк 15:43-45', '-'],
  ['p-pontiy-pilat', 'events', 'Мф 27:62-66', '-'],
  ['p-zhena-pilata', 'events', 'Мф 27:19', '-'],
  ['p-anna-pervosvyashchennik', 'events', 'Ин 18:12-13', '-'],
  ['p-anna-pervosvyashchennik', 'events', 'Ин 18:24', '-'],
  ['p-kaiafa', 'events', 'Мф 26:57-65;Ин 18:24', '-'],
  ['p-kaiafa', 'events', 'Ин 18:28', '-'],
  ['p-malkh', 'events', 'Ин 18:10-11', '-'],
  ['p-malkh', 'events', 'Лк 22:50-51', '-'],
  ['p-pavel', 'events', 'Деян 9:3-9;Деян 22:6-11;Деян 26:12-18', '-'],
  ['p-pavel', 'events', 'Деян 9:17-18', '-'],
  ['p-pavel', 'events', 'Деян 15:2;Деян 15:12', '-'],
  ['p-pavel', 'events', 'Деян 28:16;Деян 28:30-31', '-'],
  ['p-varnava', 'events', 'Деян 15:2;Деян 15:12;Деян 15:22-25', '-'],
  ['p-sila', 'events', 'Деян 15:22;Деян 15:27;Деян 15:30-32', '-'],
  ['p-vartimey', 'events', 'Мк 10:51-52', '-'],
  ['p-elitsur', 'offices', 'Чис 1:4;Чис 1:5;Чис 1:16', 'm'],
  ['p-elitsur', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-elitsur', 'events', 'Чис 10:11-12;Чис 10:18', 'm'],
  ['p-shelumiil', 'offices', 'Чис 1:4;Чис 1:6;Чис 1:16', 'm'],
  ['p-shelumiil', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-shelumiil', 'events', 'Чис 10:11-12;Чис 10:19', 'm'],
  ['p-nafanail-syn-tsuara', 'offices', 'Чис 1:4;Чис 1:8;Чис 1:16', 'm'],
  ['p-nafanail-syn-tsuara', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-nafanail-syn-tsuara', 'events', 'Чис 10:11-12;Чис 10:15', 'm'],
  ['p-eliav-syn-khelona', 'offices', 'Чис 1:4;Чис 1:9;Чис 1:16', 'm'],
  ['p-eliav-syn-khelona', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-eliav-syn-khelona', 'events', 'Чис 10:11-12;Чис 10:16', 'm'],
  ['p-gamaliil-syn-pedatsura', 'offices', 'Чис 1:4;Чис 1:10;Чис 1:16', 'm'],
  ['p-gamaliil-syn-pedatsura', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-gamaliil-syn-pedatsura', 'events', 'Чис 10:11-12;Чис 10:23', 'm'],
  ['p-avidan', 'offices', 'Чис 1:4;Чис 1:11;Чис 1:16', 'm'],
  ['p-avidan', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-avidan', 'events', 'Чис 10:11-12;Чис 10:24', 'm'],
  ['p-akhiezer-syn-ammishaddaya', 'offices', 'Чис 1:4;Чис 1:12;Чис 1:16', 'm'],
  ['p-akhiezer-syn-ammishaddaya', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-akhiezer-syn-ammishaddaya', 'events', 'Чис 10:11-12;Чис 10:25', 'm'],
  ['p-pagiil', 'offices', 'Чис 1:4;Чис 1:13;Чис 1:16', 'm'],
  ['p-pagiil', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-pagiil', 'events', 'Чис 10:11-12;Чис 10:26', 'm'],
  ['p-eliasaf-syn-reguila', 'offices', 'Чис 1:4;Чис 1:14;Чис 1:16', 'm'],
  ['p-eliasaf-syn-reguila', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-eliasaf-syn-reguila', 'events', 'Чис 10:11-12;Чис 10:20', 'm'],
  ['p-akhira', 'offices', 'Чис 1:4;Чис 1:15;Чис 1:16', 'm'],
  ['p-akhira', 'events', 'Чис 1:1-4;Чис 1:17-19;Чис 1:44', 'm'],
  ['p-akhira', 'events', 'Чис 10:11-12;Чис 10:27', 'm'],
  ['p-sammua-syn-zakkhura', 'events', 'Чис 13:2-4;Чис 13:5;Чис 13:18-21', 'm'],
  ['p-safat-syn-khoriya', 'events', 'Чис 13:2-4;Чис 13:6;Чис 13:18-21', 'm'],
  ['p-igal-syn-iosifa', 'events', 'Чис 13:2-4;Чис 13:8;Чис 13:18-21', 'm'],
  ['p-faltiy-syn-rafu', 'events', 'Чис 13:2-4;Чис 13:10;Чис 13:18-21', 'm'],
  ['p-gaddiil', 'events', 'Чис 13:2-4;Чис 13:11;Чис 13:18-21', 'm'],
  ['p-gaddiy', 'events', 'Чис 13:2-4;Чис 13:12;Чис 13:18-21', 'm'],
  ['p-ammiil-syn-gemalliya', 'events', 'Чис 13:2-4;Чис 13:13;Чис 13:18-21', 'm'],
  ['p-sefur', 'events', 'Чис 13:2-4;Чис 13:14;Чис 13:18-21', 'm'],
  ['p-nakhbiy', 'events', 'Чис 13:2-4;Чис 13:15;Чис 13:18-21', 'm'],
  ['p-geuil', 'events', 'Чис 13:2-4;Чис 13:16;Чис 13:18-21', 'm'],
  ['p-samuil-syn-ammiuda', 'offices', 'Чис 34:16-18;Чис 34:20;Чис 34:29', 'm'],
  ['p-elidad', 'offices', 'Чис 34:16-18;Чис 34:21;Чис 34:29', 'm'],
  ['p-bukkiy-syn-ioglii', 'offices', 'Чис 34:16-18;Чис 34:22;Чис 34:29', 'm'],
  ['p-khanniil-syn-efoda', 'offices', 'Чис 34:16-18;Чис 34:23;Чис 34:29', 'm'],
  ['p-kemuil-syn-shiftana', 'offices', 'Чис 34:16-18;Чис 34:24;Чис 34:29', 'm'],
  ['p-elitsafan-syn-farnaka', 'offices', 'Чис 34:16-18;Чис 34:25;Чис 34:29', 'm'],
  ['p-faltiil', 'offices', 'Чис 34:16-18;Чис 34:26;Чис 34:29', 'm'],
  ['p-akhiud', 'offices', 'Чис 34:16-18;Чис 34:27;Чис 34:29', 'm'],
  ['p-pedail', 'offices', 'Чис 34:16-18;Чис 34:28;Чис 34:29', 'm'],
  ['p-vaneya-syn-iodaya', 'offices', '3Цар 2:35;3Цар 4:4', 's'],
  ['p-adoniram', 'offices', '3Цар 12:18;2Пар 10:18', 's'],
];

/** Примечания о самих годах: смысла без года у них нет. Числа текста («двадцать три года») остаются. */
const YEAR_NOTE = /(^|;\s*)(годы приблизительны|год приблизителен|годы — по хронологии, принятой в атласе \([^)]*\)|указаны только засвидетельствованные в тексте годы)/g;

// ---------------------------------------------------------------- Д-2

/** «Степень выведена»: цепочка рождений названа другими стихами (02 § 3.4). */
const INFERRED: { c: string; p: string; refs?: Ref[]; note?: string }[] = [
  { c: 'p-lavan', p: 'p-nakhor-syn-farry' },
  { c: 'p-oziya', p: 'p-ioram-syn-iosafata' },
  { c: 'p-azariya-1par6-10', p: 'p-meraiof' },
  {
    c: 'p-ierokham-syn-pashkhura', p: 'p-pashkhur-syn-malkhii', refs: ['1Пар 9:12', 'Неем 11:12'],
    note: '«Адаия, сын Иерохама, сын Пашхура» (1Пар 9:12); по Неем 11:12 — «Адаия, сын Иерохама, сын Фелалии, сын Амция, сын Захарии, сын Пашхура»',
  },
  {
    c: 'p-gofoliya', p: 'p-amvriy', refs: ['4Цар 8:26', '2Пар 22:2', '4Цар 8:18', '3Цар 16:28'],
    note: '«Гофолия, дочь Амврия» (4Цар 8:26; 2Пар 22:2); по 4Цар 8:18 она «дочь Ахава», а Ахав — сын Амврия: «И воцарился Ахав, сын его, вместо него» (3Цар 16:28)',
  },
  {
    c: 'p-iiuy', p: 'p-namessiy', refs: ['3Цар 19:16', '4Цар 9:20', '2Пар 22:7', '4Цар 9:2', '4Цар 9:14'],
    note: '«Ииуя, сына Намессиина» (3Цар 19:16), «сына Намессиева» (4Цар 9:20; 2Пар 22:7); по 4Цар 9:2, 14 — «Ииуя, сына Иосафата, сына Намессиева»',
  },
  {
    c: 'p-zakhariya-syn-varakhii', p: 'p-adda', refs: ['Езд 5:1', 'Езд 6:14', 'Зах 1:1', 'Зах 1:7'],
    note: '«Захария, сын Адды» (Езд 5:1; 6:14); по Зах 1:1, 7 — «Захарии, сыну Варахиину, сыну Аддову»',
  },
];

/** «Степень не названа»: текст говорит о происхождении, степени не называет. */
const UNSTATED: [string, string][] = [
  ['p-ashbeya', 'p-shela-syn-iudy'],
  ['p-lael', 'p-girson'],
  ['p-avikhail-otets-tsuriila', 'p-merari'],
  ['p-iliy-svyashchennik', 'p-aaron'],
  ['p-azariya-pri-ozii', 'p-aaron'],
  ['p-azariya-pri-ezekii', 'p-sadok'],
  ['p-iaaziya', 'p-merari'],
  ['p-iegoiariv', 'p-aaron'],
  ['p-iedaiya-1par24-7', 'p-aaron'],
  ['p-kharim', 'p-aaron'],
  ['p-seorim', 'p-aaron'],
  ['p-malkhiy-1par24-9', 'p-aaron'],
  ['p-miyamin-1par24-9', 'p-aaron'],
  ['p-gakkots', 'p-aaron'],
  ['p-aviya-1par24-10', 'p-aaron'],
  ['p-ieshua-1par24-11', 'p-aaron'],
  ['p-shekhaniya-1par24-11', 'p-aaron'],
  ['p-eliashiv-1par24-12', 'p-aaron'],
  ['p-iakim-1par24-12', 'p-aaron'],
  ['p-khushay', 'p-aaron'],
  ['p-ieshevav', 'p-aaron'],
  ['p-vilga-1par24-14', 'p-aaron'],
  ['p-immer', 'p-aaron'],
  ['p-khezir', 'p-aaron'],
  ['p-gapitsets', 'p-aaron'],
  ['p-petakhiya-1par24-16', 'p-aaron'],
  ['p-iezekiil-1par24-16', 'p-aaron'],
  ['p-iakhin-1par24-17', 'p-aaron'],
  ['p-gamul', 'p-aaron'],
  ['p-delaiya-1par24-18', 'p-aaron'],
  ['p-maaziya', 'p-aaron'],
  ['p-khenaniya-itsgarit', 'p-itsgar'],
  ['p-khashaviya-khevronit', 'p-khevron-syn-kaafa'],
  ['p-uriil-nachalnik-kaafitov', 'p-kaaf'],
  ['p-shemaiya-elisafanit', 'p-elitsafan'],
  ['p-eliel-khevronit', 'p-khevron-syn-kaafa'],
  ['p-aminadav-uzziilit', 'p-uziil'],
  ['p-khosa', 'p-merari'],
  ['p-shupim', 'p-leviy'],
  ['p-khashaviya-1par9-14', 'p-merari'],
  ['p-akkuv', 'p-leviy'],
  ['p-talmon', 'p-leviy'],
  ['p-akhiman-privratnik', 'p-leviy'],
  ['p-matfaniya-asafit', 'p-asaf'],
  ['p-amasay-2par29', 'p-kaaf'],
  ['p-azariya-otets-ioelya-2par29', 'p-kaaf'],
  ['p-avdiy-2par29', 'p-merari'],
  ['p-iegallelel', 'p-merari'],
  ['p-zimma-2par29', 'p-girson'],
  ['p-shimri-elitsafanit', 'p-elitsafan'],
  ['p-ieiel-elitsafanit', 'p-elitsafan'],
  ['p-zakhariya-asafit-2par29', 'p-asaf'],
  ['p-matfaniya-asafit-2par29', 'p-asaf'],
  ['p-iekhiel-emanit', 'p-eman'],
  ['p-shimey-emanit', 'p-eman'],
  ['p-shemaiya-idifunit', 'p-idifun'],
  ['p-uzziel-idifunit', 'p-idifun'],
  ['p-khonaniya-levit', 'p-leviy'],
  ['p-simey-brat-khonanii', 'p-leviy'],
  ['p-imna-levit', 'p-leviy'],
  ['p-iakhaf-merarit-2par34', 'p-merari'],
  ['p-ovadiya-merarit-2par34', 'p-merari'],
  ['p-zakhariya-kaafit-2par34', 'p-kaaf'],
  ['p-meshullam-kaafit-2par34', 'p-kaaf'],
  ['p-khonaniya-2par35', 'p-leviy'],
  ['p-shemaiya-2par35', 'p-leviy'],
  ['p-nafanail-2par35', 'p-leviy'],
  ['p-godaviya', 'p-leviy'],
  ['p-kadmiil', 'p-godaviya'],
  ['p-verzelliy-svyashchennik', 'p-aaron'],
  ['p-zhena-verzelliya-svyashchennika', 'p-verzelliy-galaadityanin'],
  ['p-girson-iz-synov-fineesa', 'p-finees'],
  ['p-daniil-iz-synov-ifamara', 'p-ifamar'],
  ['p-sherevia', 'p-makhli'],
  ['p-khashaviya-merarit', 'p-merari'],
  ['p-ieshaiya', 'p-merari'],
  ['p-iisus-otets-iozavada', 'p-leviy'],
  ['p-vinnuy-otets-noadii', 'p-leviy'],
  ['p-maaseya-ezd10-18', 'p-iosedek'],
  ['p-eliezer-ezd10-18', 'p-iosedek'],
  ['p-iariv-ezd10-18', 'p-iosedek'],
  ['p-gedaliya-ezd10-18', 'p-iosedek'],
  ['p-khananiy-ezd10-20', 'p-immer'],
  ['p-zevadiya-ezd10-20', 'p-immer'],
  ['p-maaseya-ezd10-21', 'p-kharim'],
  ['p-eliya-ezd10-21', 'p-kharim'],
  ['p-shemaiya-ezd10-21', 'p-kharim'],
  ['p-iekhiil-ezd10-21', 'p-kharim'],
  ['p-uzziya-ezd10-21', 'p-kharim'],
  ['p-elioenay-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-maaseya-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-ismail-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-nafanail-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-iozavad-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-elasa-ezd10-22', 'p-pashkhur-syn-malkhii'],
  ['p-iozavad-ezd10-23', 'p-leviy'],
  ['p-shimey-ezd10-23', 'p-leviy'],
  ['p-kelaiya', 'p-leviy'],
  ['p-pafakhiya-ezd10-23', 'p-leviy'],
  ['p-iuda-ezd10-23', 'p-leviy'],
  ['p-eliezer-ezd10-23', 'p-leviy'],
  ['p-seraiya-neem12', 'p-aaron'],
  ['p-ieremiya-neem12', 'p-aaron'],
  ['p-ezdra-neem12', 'p-aaron'],
  ['p-amariya-neem12', 'p-aaron'],
  ['p-mallukh-neem12', 'p-aaron'],
  ['p-khattush-neem12', 'p-aaron'],
  ['p-shekhaniya-neem12', 'p-aaron'],
  ['p-rekhum-neem12', 'p-aaron'],
  ['p-meremof-neem12', 'p-aaron'],
  ['p-iddo-neem12', 'p-aaron'],
  ['p-ginnefoy', 'p-aaron'],
  ['p-aviya-neem12', 'p-aaron'],
  ['p-miyamin-neem12', 'p-aaron'],
  ['p-maadiya', 'p-aaron'],
  ['p-vilga-neem12', 'p-aaron'],
  ['p-shemaiya-neem12', 'p-aaron'],
  ['p-ioiariv-neem12', 'p-aaron'],
  ['p-iedaiya-neem12-6', 'p-aaron'],
  ['p-sallu-neem12', 'p-aaron'],
  ['p-amok', 'p-aaron'],
  ['p-khelkiya-neem12', 'p-aaron'],
  ['p-iedaiya-neem12-7', 'p-aaron'],
  ['p-meraiya', 'p-seraiya-neem12'],
  ['p-khananiya-neem12', 'p-ieremiya-neem12'],
  ['p-meshullam-neem12-13', 'p-ezdra-neem12'],
  ['p-iokhanan-neem12', 'p-amariya-neem12'],
  ['p-ionafan-neem12-14', 'p-mallukh-neem12'],
  ['p-iosif-neem12', 'p-shekhaniya-neem12'],
  ['p-adna-neem12', 'p-rekhum-neem12'],
  ['p-khelkiya-neem12-15', 'p-meremof-neem12'],
  ['p-zakhariya-neem12', 'p-iddo-neem12'],
  ['p-meshullam-neem12-16', 'p-ginnefoy'],
  ['p-zikhriy-neem12', 'p-aviya-neem12'],
  ['p-piltay', 'p-maadiya'],
  ['p-shammuy-neem12', 'p-vilga-neem12'],
  ['p-ionafan-neem12-18', 'p-shemaiya-neem12'],
  ['p-mafnay', 'p-ioiariv-neem12'],
  ['p-uzziy-neem12', 'p-iedaiya-neem12-6'],
  ['p-kallay', 'p-sallu-neem12'],
  ['p-ever-neem12', 'p-amok'],
  ['p-khashaviya-neem12', 'p-khelkiya-neem12'],
  ['p-nafanail-neem12', 'p-iedaiya-neem12-7'],
  ['p-binnuy', 'p-leviy'],
  ['p-sherevia-neem12-8', 'p-leviy'],
  ['p-iuda-levit-neem12', 'p-leviy'],
  ['p-bakbukiya', 'p-leviy'],
  ['p-unniy-neem12', 'p-leviy'],
  ['p-ovadiya-neem12-25', 'p-leviy'],
  ['p-meshullam-neem12-25', 'p-leviy'],
  ['p-egud-1par8-6', 'p-veniamin'],
  ['p-shegaraim', 'p-veniamin'],
  ['p-shimey-1par8-21', 'p-veniamin'],
  ['p-ierokham-1par8-27', 'p-veniamin'],
  ['p-iefer-1par7-38', 'p-asir'],
  ['p-ulla', 'p-asir'],
  ['p-aod', 'p-gera-syn-veniamina'],
  ['p-khever-keneyanin', 'p-khovav'],
  ['p-ioas-otets-gedeona', 'p-aviezer-syn-galaada'],
  ['p-elon-zavulonyanin', 'p-zavulon'],
  ['p-manoy', 'p-dan'],
  ['p-naval', 'p-khalev'],
  ['p-navat', 'p-efrem'],
  ['p-akhiya-otets-vaasy', 'p-issakhar'],
  ['p-iazaniya-syn-ieremii', 'p-ionadav-syn-rekhava'],
  ['p-paskhor-syn-emmera', 'p-immer'],
  ['p-ismail-syn-nafanii', 'p-david'],
  ['p-daniil', 'p-iuda'],
  ['p-ananiya-sedrakh', 'p-iuda'],
  ['p-misail-misakh', 'p-iuda'],
  ['p-azariya-avdenago', 'p-iuda'],
  ['p-zakhariya-svyashchennik', 'p-aaron'],
  ['p-elisaveta', 'p-aaron'],
  ['p-sovokhay', 'p-zara'],
  ['p-magaray', 'p-zara'],
  ['p-khelev', 'p-gofoniil'],
  ['p-ionafan-syn-shage', 'p-yashen'],
  ['p-iashovam', 'p-fares'],
  ['p-khenadad', 'p-leviy'],
  ['p-ater-privratnik', 'p-leviy'],
  ['p-khatita', 'p-leviy'],
  ['p-shovay', 'p-leviy'],
  ['p-vaniy-1par9-4', 'p-fares'],
  ['p-asaiya-1par9-5', 'p-shilon'],
  ['p-ieuil', 'p-zara'],
  ['p-gassenuya', 'p-veniamin'],
  ['p-ierokham-otets-ivnii', 'p-veniamin'],
  ['p-mikhriy', 'p-veniamin'],
  ['p-ivniya-otets-reguila', 'p-veniamin'],
  ['p-vakbakar', 'p-leviy'],
  ['p-kheresh', 'p-leviy'],
  ['p-maleleil-iz-synovey-faresa', 'p-fares'],
  ['p-isaiya-veniamityanin', 'p-veniamin'],
  ['p-gabbay', 'p-veniamin'],
  ['p-sallay-neem11-8', 'p-veniamin'],
  ['p-vunniy-predok-shemaii', 'p-merari'],
  ['p-shavfay-levit', 'p-leviy'],
  ['p-iozavad-glava-levitov', 'p-leviy'],
  ['p-meshezavel-iz-synovey-zary', 'p-zara'],
  ['p-khattush-iz-synovey-davida', 'p-david'],
  ['p-zakhariya-iz-synovey-parosha', 'p-parosh'],
  ['p-zerakhiya-otets-elegoenaya', 'p-pakhaf-moav'],
  ['p-ionafan-otets-eveda', 'p-adin'],
  ['p-afaliya-otets-ieshaii', 'p-elam-rod'],
  ['p-mikhail-otets-zevadii', 'p-safatiya-rod'],
  ['p-iekhiel-otets-ovadii', 'p-ioav-rod'],
  ['p-gakkatan', 'p-azgad'],
  ['p-elifelet-iz-synovey-adonikama', 'p-adonikam'],
  ['p-ieiel-iz-synovey-adonikama', 'p-adonikam'],
  ['p-shemaiya-iz-synovey-adonikama', 'p-adonikam'],
  ['p-ufay-iz-synovey-bigvaya', 'p-bigvay-rod'],
  ['p-zabbud', 'p-bigvay-rod'],
  ['p-iekhiil-otets-shekhanii', 'p-elam-rod'],
  ['p-eliashiv-pevets', 'p-leviy'],
  ['p-shallum-privratnik-ezd10-24', 'p-leviy'],
  ['p-telem', 'p-leviy'],
  ['p-uriy-privratnik', 'p-leviy'],
  ['p-ramaiya-ezd10-25', 'p-parosh'],
  ['p-izziya-ezd10-25', 'p-parosh'],
  ['p-malkhiya-ezd10-25-1', 'p-parosh'],
  ['p-miyamin-ezd10-25', 'p-parosh'],
  ['p-eleazar-ezd10-25', 'p-parosh'],
  ['p-malkhiya-ezd10-25-2', 'p-parosh'],
  ['p-venaiya-ezd10-25', 'p-parosh'],
  ['p-matfaniya-ezd10-26', 'p-elam-rod'],
  ['p-zakhariya-ezd10-26', 'p-elam-rod'],
  ['p-iekhiel-ezd10-26', 'p-elam-rod'],
  ['p-avdiy-ezd10-26', 'p-elam-rod'],
  ['p-iremof-ezd10-26', 'p-elam-rod'],
  ['p-eliya-ezd10-26', 'p-elam-rod'],
  ['p-elioenay-ezd10-27', 'p-zaffu'],
  ['p-eliyashiv-ezd10-27', 'p-zaffu'],
  ['p-matfaniya-ezd10-27', 'p-zaffu'],
  ['p-iremof-ezd10-27', 'p-zaffu'],
  ['p-zavad-ezd10-27', 'p-zaffu'],
  ['p-azisa-ezd10-27', 'p-zaffu'],
  ['p-iokhanan-ezd10-28', 'p-bevay'],
  ['p-khananiya-ezd10-28', 'p-bevay'],
  ['p-zabvay-ezd10-28', 'p-bevay'],
  ['p-aflay-ezd10-28', 'p-bevay'],
  ['p-meshullam-ezd10-29', 'p-vaniy-rod'],
  ['p-mallukh-ezd10-29', 'p-vaniy-rod'],
  ['p-adaya-ezd10-29', 'p-vaniy-rod'],
  ['p-iashuv-ezd10-29', 'p-vaniy-rod'],
  ['p-sheal-ezd10-29', 'p-vaniy-rod'],
  ['p-ieramof-ezd10-29', 'p-vaniy-rod'],
  ['p-adna-ezd10-30', 'p-pakhaf-moav'],
  ['p-khelal-ezd10-30', 'p-pakhaf-moav'],
  ['p-venaiya-ezd10-30', 'p-pakhaf-moav'],
  ['p-maaseya-ezd10-30', 'p-pakhaf-moav'],
  ['p-matfaniya-ezd10-30', 'p-pakhaf-moav'],
  ['p-veseleil-ezd10-30', 'p-pakhaf-moav'],
  ['p-binnuy-ezd10-30', 'p-pakhaf-moav'],
  ['p-manassiya-ezd10-30', 'p-pakhaf-moav'],
  ['p-eliezer-ezd10-31', 'p-kharim-rod'],
  ['p-ishshiya-ezd10-31', 'p-kharim-rod'],
  ['p-shemaiya-ezd10-31', 'p-kharim-rod'],
  ['p-simeon-ezd10-31', 'p-kharim-rod'],
  ['p-veniamin-ezd10-32', 'p-kharim-rod'],
  ['p-mallukh-ezd10-32', 'p-kharim-rod'],
  ['p-shemariya-ezd10-32', 'p-kharim-rod'],
  ['p-mafnay-ezd10-33', 'p-khashum'],
  ['p-mafafa-ezd10-33', 'p-khashum'],
  ['p-zavad-ezd10-33', 'p-khashum'],
  ['p-elifelet-ezd10-33', 'p-khashum'],
  ['p-ieremay-ezd10-33', 'p-khashum'],
  ['p-manassiya-ezd10-33', 'p-khashum'],
  ['p-shimey-ezd10-33', 'p-khashum'],
  ['p-maaday-ezd10-34', 'p-vaniy-rod'],
  ['p-amram-ezd10-34', 'p-vaniy-rod'],
  ['p-uel-ezd10-34', 'p-vaniy-rod'],
  ['p-benaiya-ezd10-35', 'p-vaniy-rod'],
  ['p-bidya-ezd10-35', 'p-vaniy-rod'],
  ['p-kelugi-ezd10-35', 'p-vaniy-rod'],
  ['p-vaneya-ezd10-36', 'p-vaniy-rod'],
  ['p-meremof-ezd10-36', 'p-vaniy-rod'],
  ['p-eliashiv-ezd10-36', 'p-vaniy-rod'],
  ['p-matfaniya-ezd10-37', 'p-vaniy-rod'],
  ['p-mafnay-ezd10-37', 'p-vaniy-rod'],
  ['p-iaasay-ezd10-37', 'p-vaniy-rod'],
  ['p-vaniy-ezd10-38', 'p-vaniy-rod'],
  ['p-binnuy-ezd10-38', 'p-vaniy-rod'],
  ['p-shimey-ezd10-38', 'p-vaniy-rod'],
  ['p-shelemiya-ezd10-39', 'p-vaniy-rod'],
  ['p-nafan-ezd10-39', 'p-vaniy-rod'],
  ['p-adaiya-ezd10-39', 'p-vaniy-rod'],
  ['p-makhnadbay-ezd10-40', 'p-vaniy-rod'],
  ['p-shashay-ezd10-40', 'p-vaniy-rod'],
  ['p-sharay-ezd10-40', 'p-vaniy-rod'],
  ['p-azariel-ezd10-41', 'p-vaniy-rod'],
  ['p-shelemiyagu-ezd10-41', 'p-vaniy-rod'],
  ['p-shemariya-ezd10-41', 'p-vaniy-rod'],
  ['p-shallum-ezd10-42', 'p-vaniy-rod'],
  ['p-amariya-ezd10-42', 'p-vaniy-rod'],
  ['p-iosif-ezd10-42', 'p-vaniy-rod'],
  ['p-ieiel-ezd10-43', 'p-nevo-rod'],
  ['p-matfifiya-ezd10-43', 'p-nevo-rod'],
  ['p-zavad-ezd10-43', 'p-nevo-rod'],
  ['p-zevina-ezd10-43', 'p-nevo-rod'],
  ['p-iadday-ezd10-43', 'p-nevo-rod'],
  ['p-ioel-ezd10-43', 'p-nevo-rod'],
  ['p-benaiya-ezd10-43', 'p-nevo-rod'],
  ['p-vaniy-otets-rekhuma', 'p-leviy'],
  ['p-khashaviya-neem3-17', 'p-leviy'],
  ['p-seraiya-neem10-2', 'p-aaron'],
  ['p-azariya-neem10-2', 'p-aaron'],
  ['p-ieremiya-neem10-2', 'p-aaron'],
  ['p-pashkhur-neem10-3', 'p-aaron'],
  ['p-amariya-neem10-3', 'p-aaron'],
  ['p-malkhiya-neem10-3', 'p-aaron'],
  ['p-khattush-neem10-4', 'p-aaron'],
  ['p-shevaniya-neem10-4', 'p-aaron'],
  ['p-mallukh-neem10-4', 'p-aaron'],
  ['p-kharim-neem10-5', 'p-aaron'],
  ['p-meremof-neem10-5', 'p-aaron'],
  ['p-ovadiya-neem10-5', 'p-aaron'],
  ['p-ginnefon-neem10-6', 'p-aaron'],
  ['p-varukh-neem10-6', 'p-aaron'],
  ['p-meshullam-neem10-7', 'p-aaron'],
  ['p-aviya-neem10-7', 'p-aaron'],
  ['p-miyamin-neem10-7', 'p-aaron'],
  ['p-maaziya-neem10-8', 'p-aaron'],
  ['p-vilgay-neem10-8', 'p-aaron'],
  ['p-shemaiya-neem10-8', 'p-aaron'],
  ['p-azaniya', 'p-leviy'],
  ['p-kadmiil-neem10', 'p-leviy'],
  ['p-shevaniya-levit-neem10-10', 'p-leviy'],
  ['p-godiya-levit-neem10-10', 'p-leviy'],
  ['p-felaiya-levit', 'p-leviy'],
  ['p-khanan-levit-neem10-10', 'p-leviy'],
  ['p-mikha-levit-neem10-11', 'p-leviy'],
  ['p-rekhov-levit', 'p-leviy'],
  ['p-zakkhur-levit-neem10-12', 'p-leviy'],
  ['p-shevaniya-levit-neem10-12', 'p-leviy'],
  ['p-godiya-levit-neem10-13', 'p-leviy'],
  ['p-vaniy-levit-neem10-13', 'p-leviy'],
  ['p-veninuy', 'p-leviy'],
  ['p-vanaiya-levit-neem8-7', 'p-leviy'],
  ['p-iamin-levit-neem8-7', 'p-leviy'],
  ['p-akkuv-levit-neem8-7', 'p-leviy'],
  ['p-maaseya-levit-neem8-7', 'p-leviy'],
  ['p-azariya-levit-neem8-7', 'p-leviy'],
  ['p-shemaiya-neem12-36', 'p-leviy'],
  ['p-azariil-neem12-36', 'p-leviy'],
  ['p-milalay', 'p-leviy'],
  ['p-gilalay', 'p-leviy'],
  ['p-maay', 'p-leviy'],
  ['p-nafanail-neem12-36', 'p-leviy'],
  ['p-iuda-neem12-36', 'p-leviy'],
  ['p-khananiy-neem12-36', 'p-leviy'],
  ['p-eliakim-neem12-41', 'p-aaron'],
  ['p-maaseya-neem12-41', 'p-aaron'],
  ['p-miniamin-neem12-41', 'p-aaron'],
  ['p-mikhey-neem12-41', 'p-aaron'],
  ['p-elioenay-neem12-41', 'p-aaron'],
  ['p-zakhariya-neem12-41', 'p-aaron'],
  ['p-khananiya-neem12-41', 'p-aaron'],
  ['p-izrakhiya-nachalnik-pevtsov', 'p-leviy'],
  ['p-shelemiya-svyashchennik', 'p-aaron'],
  ['p-fedaiya-levit-neem13', 'p-leviy'],
];

/** Примечания рёбер, где прежний текст держался на «понимании», — по словам стиха. */
const UNSTATED_NOTES: Record<string, string> = {
  'p-aod|p-gera-syn-veniamina': '«Аода, сына Геры, сына Иеминиева» (Суд 3:15) — слово «сын» сказано; Гера ли это, сын Вениамина (Быт 46:21), и какая степень родства, текст прямо не говорит',
  'p-paskhor-syn-emmera|p-immer': '«Пасхор, сын Еммеров, священник» (Иер 20:1); Иммер ли это, глава шестнадцатой череды («шестнадцатый Имеру», 1Пар 24:14), и какая степень родства, текст прямо не говорит',
};

const QUEEN = 'p-tsaritsa-dan5';
const VALTASAR = { c: 'p-valtasar-tsar', p: 'p-navukhodonosor' };
const PROPHETS_VOL = '15-prophets-exile.json';

const okey = (c: string, p: string) => `origin:${c}|${p}|`;

export const STEPS_D: Step[] = [
  {
    id: 'D5',
    scope: [
      ...KIN_KEEP.map(kinKey), ...KIN_DROP.map(kinKey), ...KIN_DROP.map((k) => `actor:${k.from}.facts.notes`),
      ...UNION_FIX.map((u) => `union:${u.id}`), `union:${UNION_DROP.id}`, `actor:${UNION_DROP.actor}.facts.notes`,
      ...KIN_DROP.map((k) => `redirect:${k.id}`), `redirect:${UNION_DROP.id}`,
    ],
    run: ({ base, actor, at }) => {
      const find = (k: { from: string; to: string; rel: string }): KinTerm => {
        const xs = base.kin.filter((y) => y.from === k.from && y.to === k.to && y.rel === k.rel);
        if (xs.length !== 1 || xs[0].cert !== 'interpretation') throw new Error(`D5: ${k.from} — ${k.to} «${k.rel}»: ожидалась одна запись «толкование»`);
        return xs[0];
      };
      for (const k of KIN_KEEP) {
        const x = find(k);
        x.cert = k.cert;
        x.refs = [...k.refs];
        if (k.identity) x.identity = { ...k.identity, refs: [...k.identity.refs] };
        x.prov = { ...x.prov, ...by('D5') };
      }
      // снятая запись: номер выбывает, переадресация — на карточку лица, где теперь примечание (02 § 3.3.1; К-12)
      const iss = issuerOf(base);
      const reason = 'запись держалась на отождествлении или толковании — снята (Д-5); понимание — примечанием карточки';
      for (const k of KIN_DROP) {
        const x = find(k);
        // номер закреплён до поздних шагов (freezeIds) или ещё заготовка с ключом
        const e = x.id?.startsWith('?') ? iss?.entry(x.id.slice(1)) : x.id ? { id: x.id } : undefined;
        if (e && e.id !== k.id) throw new Error(`D5: ${k.from} — ${k.to}: ожидался номер ${k.id}, а выдан ${e.id}`);
        base.kin = base.kin.filter((y) => y !== x);
        actor(k.from).facts.push(note('D5', k.text, k.refs));
        // номер не выдан (сборка с пустой таблицей) — выбывать нечему
        if (e) {
          iss!.retire(e.id);
          base.redirects.push({ from: e.id, to: [k.from], reason, refs: k.refs, at });
        }
      }
      for (const f of UNION_FIX) {
        const u = base.unions.find((y) => y.id === f.id);
        const ts = u?.terms.filter((t) => t.cert === 'interpretation') ?? [];
        if (ts.length !== 1) throw new Error(`D5: ${f.id}: ожидалось одно обозначение «толкование»`);
        Object.assign(ts[0], { cert: f.cert, note: f.note, prov: { ...ts[0].prov, ...by('D5') } });
        if (f.identity) ts[0].identity = { ...f.identity, refs: [...f.identity.refs] };
      }
      const d = base.unions.find((y) => y.id === UNION_DROP.id);
      if (!d || d.terms.length !== 1 || d.terms[0].cert !== 'interpretation') throw new Error(`D5: ${UNION_DROP.id}: ожидалось одно обозначение «толкование»`);
      base.unions = base.unions.filter((y) => y !== d);
      actor(UNION_DROP.actor).facts.push(note('D5', UNION_DROP.text, UNION_DROP.refs));
      base.redirects.push({ from: UNION_DROP.id, to: [UNION_DROP.actor], reason, refs: UNION_DROP.refs, at });
      return {
        what: `Д-5: «толкование» у родства и союзов снято. Родство по слову текста — ${KIN_KEEP.filter((k) => !k.identity).length} записей (4 «сын царя» — «вывод»: царя называет соседний стих главы); слово сказано, тождество конца «предположительно» — 2 (Мария Клеопова, Иоиль); снято с примечанием needsSources — ${KIN_DROP.length} (Иуда — Иаков, Иоанн и Александр — Анна). Союзы: 4 обозначения — по словам стиха (у Мереда — тождество мужа «предположительно»), союз Клеопы и Марии Клеоповой снят с примечанием needsSources`,
        why: '02 § 3.9: «толк.» у родства и обозначения союза вне набора прочтений не хранится; толкование не становится ребром (R9 Г-5); образцы — шаги C45, C46, C50',
        refs: ['2Пар 28:7', 'Иер 36:26', 'Рим 16:7', 'Ин 19:25', '1Пар 11:38', 'Иуд 1:1', 'Деян 4:6', '1Пар 4:18-19', 'Ис 8:3'],
        actors: [...new Set([...KIN_KEEP, ...KIN_DROP].flatMap((k) => [k.from.slice(2), k.to.slice(2)]).concat(['mered', 'iudiya', 'godiya-sestra-nakhama', 'khalev-syn-esroma', 'ieriofa', 'isaiya', 'prorochitsa-zhena-isaii', 'kleopa', 'mariya-kleopova']))],
      };
    },
  },
  {
    id: 'D7',
    scope: [...new Set(YEARS.map(([a, f]) => `actor:${a}.facts.${f}`))],
    run: ({ actor }) => {
      const n = { m: 0, s: 0, '-': 0 };
      let notes = 0;
      for (const [id, field, refs, k] of YEARS) {
        const a = actor(id);
        const fs = a.facts.filter((f) => f.field === field && (f.value as any)?.refs?.join(';') === refs);
        const withYear = fs.filter((f) => ['year', 'from', 'to'].some((x) => typeof (f.value as any)[x] === 'number'));
        if (withYear.length !== 1) throw new Error(`D7: ${id} § ${field} ${refs}: ожидалась одна запись с годом, найдено ${withYear.length}`);
        const f = withYear[0];
        const v = f.value as Record<string, unknown>;
        for (const x of ['year', 'from', 'to']) if (typeof v[x] === 'number') delete v[x];
        if (typeof v.note === 'string') {
          const t = v.note.replace(YEAR_NOTE, '').replace(/^;\s*/, '').trim();
          if (t !== v.note) notes++;
          if (t) v.note = t;
          else delete v.note;
        }
        f.calc = { event: refs.split(';')[0], ...(k === 'm' ? { model: 'm-dolgoe' } : k === 's' ? { scheme: 's-mcfall-young' } : {}) };
        f.prov = { ...f.prov, ...by('D7') };
        n[k]++;
      }
      return {
        what: `Д-7: у ${YEARS.length} утверждений год снят из записи; ссылка на расчёт calc — модель m-dolgoe ${n.m}, схема царей s-mcfall-young ${n.s}, без модели ${n['-']} (после падения Иерусалима и Новый Завет: модели в 04 § 16.1 нет). Событие — первый стих записи. Снято примечаний о самих годах: ${notes}`,
        why: '02 § 3.10.2, § 3.15 (Р-5): ни один год не хранится в записи; годы считает расчёт по модели и схеме, значение — только в пакете сборки (04 § 16.1). Прежние годы — в data/ для сверки',
        refs: [],
        actors: [...new Set(YEARS.map(([a]) => a.slice(2)))],
      };
    },
  },
  {
    id: 'D2',
    scope: [
      ...INFERRED.map((x) => okey(x.c, x.p)), ...UNSTATED.map(([c, p]) => okey(c, p)), okey(VALTASAR.c, VALTASAR.p),
      `actor:${QUEEN}`, `volume:${PROPHETS_VOL}`,
    ],
    run: ({ base }) => {
      const edge = (c: string, p: string) => {
        const xs = base.origins.filter((o) => o.child === c && o.parent === p && o.kind === 'ancestor');
        if (xs.length !== 1 || xs[0].degree) throw new Error(`D2: ${c} ← ${p}: ожидалось одно ребро «предок» без степени`);
        return xs[0];
      };
      for (const x of INFERRED) {
        const o = edge(x.c, x.p);
        Object.assign(o, { degree: 'inferred', cert: 'inference', prov: { ...o.prov, ...by('D2') } });
        if (x.refs) o.refs = [...x.refs];
        if (x.note) o.note = x.note;
      }
      for (const [c, p] of UNSTATED) {
        const o = edge(c, p);
        o.degree = 'unstated';
        const t = UNSTATED_NOTES[`${c}|${p}`];
        if (t) o.note = t;
        o.prov = { ...o.prov, ...by('D2') };
      }
      // царица — говорящая Дан 5:10–12; безымянна, названа словом «царица»
      const vol = base.volumes.find((v) => v.file === PROPHETS_VOL);
      if (!vol || vol.actors.some((a) => a.id === QUEEN)) throw new Error('D2: нет тома пророков или царица уже есть');
      const queen: Actor = {
        id: QUEEN, kind: 'unnamed', sex: 'f', descriptor: 'царица',
        names: [{ form: 'Царица', type: 'main', refs: ['Дан 5:10'] }], disambig: 'при Валтасаре (Дан 5:10)',
        facts: [
          { sec: 5, field: 'status', value: { text: '«Царица же, по поводу слов царя и вельмож его, вошла в палату пиршества; начала говорить царица»', refs: ['Дан 5:10'] }, prov: by('D2') },
          { sec: 23, field: 'scripture', value: { first: 'Дан 5:10', key: ['Дан 5:10-12'] }, prov: by('D2') },
        ],
        prov: { ...by('D2'), status: 'draft' },
      };
      vol.actors.splice(vol.actors.findIndex((a) => a.id === VALTASAR.c) + 1, 0, queen);
      // Валтасар (02 § 3.4 [4.2]): текст говорит и «отец», и «сын»; у каждого слова свой говорящий
      const v = edge(VALTASAR.c, VALTASAR.p);
      Object.assign(v, {
        kind: 'text-word', cert: 'scripture',
        words: [
          { text: 'царь Навуходоносор, отец твой', ref: 'Дан 5:11', saidBy: { actor: QUEEN, ref: 'Дан 5:11', label: 'по словам царицы', speechStart: 'Дан 5:10' } },
          { text: 'отец мой, царь', ref: 'Дан 5:13', saidBy: { actor: VALTASAR.c, ref: 'Дан 5:13', label: 'по словам Валтасара' } },
          { text: 'отцу твоему Навуходоносору', ref: 'Дан 5:18', saidBy: { actor: 'p-daniil', ref: 'Дан 5:18', label: 'по словам Даниила', speechStart: 'Дан 5:17' } },
          { text: 'ты, сын его Валтасар', ref: 'Дан 5:22', saidBy: { actor: 'p-daniil', ref: 'Дан 5:22', label: 'по словам Даниила', speechStart: 'Дан 5:17' } },
        ],
        note: 'Текст говорит и «отец», и «сын». Повествователь: «Навуходоносор, отец его» (Дан 5:2). Царица: «во дни отца твоего» (Дан 5:11). Валтасар: «которых отец мой, царь, привел» (Дан 5:13). Даниил: «отцу твоему Навуходоносору» (Дан 5:18), «И ты, сын его Валтасар» (Дан 5:22)',
        prov: { ...v.prov, ...by('D2') },
      });
      return {
        what: `Д-2: степень у рёбер вида «предок» — «степень выведена» ${INFERRED.length} (вывод по цепочке стихов), «степень не названа» ${UNSTATED.length}; Валтасар — вид «слово текста» со словами Дан 5:11, 13, 18, 22 и говорящими (царица — новое безымянное лицо, Дан 5:10); прежнее примечание «сын, внук или преемник» заменено словами текста; у Аода и Пасхора примечания — по словам стиха`,
        why: '02 § 3.4 [4.2] (Р-6; К-13): уровень ребра — по словам стиха, степень — по виду ребра; «предок» и «предшественник на престоле» у Валтасара — только понимание un-, не вид ребра',
        refs: ['Быт 29:5', '1Пар 9:12', 'Неем 11:12', '4Цар 8:26', 'Зах 1:1', 'Дан 5:2', 'Дан 5:10-13', 'Дан 5:17-18', 'Дан 5:22', '1Пар 4:21'],
        actors: [...new Set([...INFERRED.flatMap((x) => [x.c, x.p]), ...UNSTATED.flat(), VALTASAR.c, VALTASAR.p, QUEEN].map((x) => x.slice(2)))],
      };
    },
  },
];
