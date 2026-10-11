/**
 * Шаги правки по задачам данных 02 ред. 4.6 (В-33; 02 § 3.18: Д-16, Д-18…Д-20, Д15-2, П1-4; код К-20…К-22). Отчёт —
 * docs/app/reviews/В-33-данные-отчёт.md. Шаги прежних партий не меняются; перед этими шагами номера закрепляются (freezeIds).
 *
 * D18-1 Д-18: 91 форма «другого написания» (D15-8, правило 4.5) — заново по общим проверкам 02 § 3.3.4 [4.6]. «Писание» — только
 *       если стих называет одно лицо обоими именами; такого стиха нет ни у одной формы. Девять форм без общего родственника уже
 *       разведены шагом D15-13 (тёзки), «Нер» — D15-14. Остальные 82: вид (б) — форма «выв.» со стихами сравнения и кодами
 *       проверок (78), вид (в) — своя карточка (Селлум Кореянин, шаг D18-2), три формы перечня Неем 12:12–21 — по Д15-2 (D15-19).
 *       Основное имя — по числу стихов текста (02 § 3.3.5): сменилось у шести карточек.
 * D18-2 Селлум Кореянин (1Пар 9:31) — вид (в): ни общего родственника, ни места в перечне с Шаллумом, сыном Коре (1Пар 9:19).
 * D15-19 Д15-2: перечень Неем 12:12–21 — дома («из дома X»), а не копия перечня Неем 12:1–7 («во дни Иисуса», 12:7; «Во дни
 *       Иоакима», 12:12). Глава каждого дома — своя карточка по имени стиха; ребро «из дома X» — предок без названной степени;
 *       с главой из Неем 12:1–7 — «возможно, то же лицо» уровня «вывод». Тождества лиц нет.
 * D19-1 Д-18, Д-19: тождество по форме у записей, которые держатся на формах «выв.» после D18-1 и D15-19 (02 § 3.3.5): утверждения,
 *       членство, «нет сведений», входы времени — `idCert`; рёбра — `identity … inferred`. Заметки освобождаются только явным
 *       полем `idCertExempt` по словам «Не смешивать», «так выходит, если сравнить» или по чужим стихам (К-22); a-12970 — без idCert.
 * D16-1 Д-16: подпись безымянного — поле `descriptor` со стихами; имя другого лица из соседнего стиха — уровень «выв.» (К-20).
 * D20-1 Д-20: опоры — вид (`external`, `calc`, `tradition`), год промежутком, альтернативы записями с трудом, журнал; без `derived`.
 * K21-1 К-21: у входа «N-й год после события» — вид счёта (`count`): «в сороковой год» (Чис 33:38) — порядковый год.
 * P14-1 П1-4: мелкое по эпохам (второй ключ после П1-3, № 86–89).
 */
import type { Step } from './corrections.ts';
import type { Base } from './migrate.ts';
import { formCertExempt, inferredForms, restsOnFormLoose, formVerses } from './name-forms.ts';
import type { Actor, Anchor, Assertion, Cite, Descriptor, IdCert, Name, Origin, Ref, TimeInput } from './types.ts';
import {
  type FormB, type Split, P, N, S, C, O, X, actorsOf, applySplit, b, by, fid, formOf, ident, mainOf, makeInferred, refsDeep, touch, verseIds,
} from './corrections-d15b.ts';

// ---------------------------------------------------------------- D18-1: формы «другого написания» — вид (б)

/** Пояснение формы «выв.»: где сравнивали, и что текст тождества не говорит. */
const why = (where: string) => `${where}. Одно ли это имя в разном написании, текст не говорит: что это один человек, так выходит, если сравнить места (02 § 3.3.4 [4.6])`;
const SONS = [P, N, S, O, X];
const LIST = [P, S, O, X];
const NODE = [N, O, X];

export const SPELL_B: FormB[] = [
  b('p-khatsarmavef', 'Хацармавет', ['Быт 10:26'], SONS, why('сыновья Иоктана в том же порядке: Быт 10:26 — 1Пар 1:20')),
  b('p-oval', 'Евал', ['Быт 10:28'], SONS, why('сыновья Иоктана в том же порядке: Быт 10:28 — 1Пар 1:22')),
  // основное имя — «Мамре»: по одному стиху о самом лице (Быт 14:13; 14:24), Быт 14:13 раньше
  b('p-mamriy', 'Мамре', ['Быт 14:13'], NODE, why('союзники Аврама: «Мамре, Аморреянина, брата Эшколу и брата Анеру, которые были союзники Аврамовы» (Быт 14:13) — «Анер, Эшкол и Мамрий» (Быт 14:24)'), { swap: true }),
  b('p-etser-syn-seira', 'Ецер', ['Быт 36:21'], SONS, why('сыновья Сеира в том же порядке: Быт 36:21 — 1Пар 1:38')),
  b('p-famna-sestra-lotana', 'Фимна', ['Быт 36:22'], [P, N, O, X], why('сестра Лотана: «а сестра у Лотана: Фамна» (Быт 36:22) — «а сестра у Лотана: Фимна» (1Пар 1:39)')),
  b('p-eval-syn-shovala', 'Евал', ['Быт 36:23'], SONS, why('сыновья Шовала в том же порядке: Быт 36:23 — 1Пар 1:40')),
  b('p-eshban', 'Ешбан', ['Быт 36:26'], SONS, why('сыновья Дишона в том же порядке: Быт 36:26 — 1Пар 1:41')),
  b('p-fallu', 'Фаллуй', ['Быт 46:9', 'Чис 26:5'], [P, N, O, X], why('сын Рувима: «Ханох и Фаллу» (Быт 46:9), «от Фаллу поколение Фаллуево» (Чис 26:5) — «Сыны Фаллуя: Елиав» (Чис 26:8)')),
  b('p-iamin-syn-simeona', 'Ямин', ['Быт 46:10'], SONS, why('сыновья Симеона: Быт 46:10 — Чис 26:12')),
  b('p-iakhin-syn-simeona', 'Яхин', ['Быт 46:10'], SONS, why('сыновья Симеона: Быт 46:10 — Чис 26:12')),
  b('p-fuva', 'Фуа', ['Быт 46:13'], [P, N, S, C, O, X], why('сыновья Иссахара, второе место: «Фола и Фува» (Быт 46:13) — «Фола, Фуа, Иашув и Шимрон, четверо» (1Пар 7:1)'), { count: '1Пар 7:1' }),
  b('p-tsifion', 'Цефон', ['Быт 46:16'], SONS, why('сыновья Гада: Быт 46:16 — Чис 26:15')),
  b('p-shuni', 'Шуний', ['Быт 46:16'], SONS, why('сыновья Гада: Быт 46:16 — Чис 26:15')),
  // основное имя — «Верия»: Чис 26:44, 45 (два стиха), «Берия» — 1Пар 7:30, 31 (два), «Бриа» — Быт 46:17 (один); Чис раньше 1Пар
  b('p-bria-syn-asira', 'Верия', ['Чис 26:44', 'Чис 26:45'], [P, N, O, X], why('сын Асира, отец Хевера и Малхиила: «Бриа… Сыны Брии: Хевер и Малхиил» (Быт 46:17) — «от Верии… от Хевера… от Малхиила» (Чис 26:44–45)'), { swap: true }),
  b('p-bria-syn-asira', 'Берия', ['Чис 26:44', 'Чис 26:45'], [P, N, O, X], why('сын Асира, отец Хевера и Малхиила: Чис 26:44–45 — «Берия… Сыновья Берии: Хевер и Малхиил» (1Пар 7:30–31)')),
  b('p-guni-syn-neffalima', 'Гуний', ['Быт 46:24'], SONS, why('сыновья Неффалима: Быт 46:24 — Чис 26:48')),
  b('p-iessey', 'Иесей', ['Руф 4:17'], NODE, why('отец Давида: «Иессея, отца Давидова» (Руф 4:17) — «Давида, сына Иесеева» (Пс 71:20)')),
  b('p-amessay', 'Амесса', ['2Цар 17:25'], NODE, why('сын Иефера и Авигеи: 2Цар 17:25 — 1Пар 2:17')),
  b('p-veseleil-syn-uriya', 'Веселиил', ['Исх 31:2'], NODE, why('сын Урия, внук Ора (Хура): «Веселеила, сына Уриева, сына Орова» (Исх 31:2) — «Урий родил Веселиила» (1Пар 2:20)')),
  b('p-girson', 'Герсон', ['1Пар 23:7'], NODE, why('родоначальник Лаедана: «Из Гирсонян: Лаедан» (1Пар 23:7) — «Сыновья Лаедана, сына Герсонова» (1Пар 26:21)')),
  b('p-uziil', 'Озиил', ['Исх 6:18'], [P, N, S, C, O, X], why('сыновья Каафа, четвёртое место: «Амрам и Ицгар, и Хеврон, и Узиил» (Исх 6:18) — «Амрам, Ицгар, Хеврон и Озиил, четверо» (1Пар 23:12)'), { count: '1Пар 23:12' }),
  b('p-mushi', 'Муший', ['Исх 6:19'], [P, N, O, X], why('сын Мерари: «Махли и Муши» (Исх 6:19) — «сын Мушия, сын Мерари» (1Пар 6:47)')),
  b('p-aviasaf', 'Евиасаф', ['Исх 6:24', '1Пар 6:37'], [P, N, O, X], why('сын Корея: «Асир, Елкана и Авиасаф» (Исх 6:24) — «Евиасаф, сын его» (1Пар 6:23)')),
  b('p-tsuf', 'Цофай', ['1Цар 1:1', '1Пар 6:35'], LIST, why('родословие Самуила, то же место: 1Цар 1:1; 1Пар 6:35 — 1Пар 6:26')),
  b('p-toakh', 'Тоху', ['1Пар 6:34'], LIST, why('родословие Самуила, то же место: «сына Тоху» (1Цар 1:1) — «сын Тоаха» (1Пар 6:34)')),
  b('p-ikhavod', 'Иохавед', ['1Цар 4:21'], NODE, why('сын Финееса: «назвала младенца: Ихавод» (1Цар 4:21; мать — «жена Финеесова», 4:19) — «Ахитува, брата Иохаведа, сына Финееса» (1Цар 14:3)')),
  b('p-oziya-syn-bukkiya', 'Уззий', ['1Пар 6:5'], SONS, why('родословие священников: 1Пар 6:5 — 1Пар 6:51; Езд 7:4')),
  b('p-meraiof', 'Марайоф', ['1Пар 6:6', '1Пар 6:7'], SONS, why('родословие священников: 1Пар 6:6–7 — Езд 7:3')),
  b('p-sellum-syn-sadoka', 'Шаллум', ['1Пар 6:12', '1Пар 6:13'], SONS, why('родословие священников: 1Пар 6:12–13 — Езд 7:2')),
  b('p-berekhiya-otets-asafa', 'Верехия', ['1Пар 6:39'], NODE, why('отец Асафа: «Асаф, сын Берехии» (1Пар 6:39) — «Асафа, сына Верехиина» (1Пар 15:17)')),
  b('p-shevuil-syn-emana', 'Шуваил', ['1Пар 25:4'], [P, S, C, O, X], why('сыновья Емана и двадцать четыре жребия певцов: 1Пар 25:4 — 1Пар 25:20'), { count: '1Пар 25:31' }),
  b('p-kishiy', 'Кушаия', ['1Пар 6:44'], NODE, why('отец певца Ефана: «Ефан, сын Кишия» (1Пар 6:44) — «Ефана, сына Кушаии» (1Пар 15:17)')),
  b('p-tseri', 'Ицрий', ['1Пар 25:3'], [P, S, C, O, X], why('сыновья Идифуна и двадцать четыре жребия певцов: 1Пар 25:3 — 1Пар 25:11'), { count: '1Пар 25:31' }),
  b('p-semey-syn-idifuna', 'Шимей', ['1Пар 25:3'], [P, S, C, O, X], why('сыновья Идифуна и двадцать четыре жребия певцов: 1Пар 25:3 — 1Пар 25:17'), { count: '1Пар 25:31' }),
  b('p-iekhiil-syn-laedana', 'Иехиел', ['1Пар 23:8'], NODE, why('сын Лаедана: 1Пар 23:8 — 1Пар 26:21–22')),
  b('p-shelomif-syn-itsgara', 'Шеломоф', ['1Пар 23:18'], NODE, why('из сыновей Ицгара: 1Пар 23:18 — 1Пар 24:22')),
  b('p-ieremof-syn-mushi', 'Иеримоф', ['1Пар 23:23'], [P, N, S, C, O, X], why('сыновья Мушия, третье место: «Махли, Едер и Иремоф — трое» (1Пар 23:23) — «Махли, Едер и Иеримоф» (1Пар 24:30)'), { count: '1Пар 23:23' }),
  b('p-meshillemif', 'Мешиллемоф', ['1Пар 9:12'], SONS, why('священник, сын Иммера: 1Пар 9:12 — Неем 11:13')),
  b('p-khashuv', 'Хашшув', ['1Пар 9:14'], SONS, why('отец левита Шемаии: 1Пар 9:14 — Неем 11:15')),
  b('p-mikha-syn-zikhriya', 'Михей', ['1Пар 9:15'], NODE, why('отец Матфании, из сыновей Асафа: 1Пар 9:15 — Неем 12:35; отец назван по-разному — карточка отца несёт эти имена формами «выв.»')),
  b('p-akkuv', 'Аккуб', ['Неем 11:19'], LIST, why('привратники «Аккув, Талмон»: Неем 11:19 — 1Пар 9:17')),
  b('p-ionafan', 'Иоанафан', ['1Цар 14:49'], [P, N, O, X], why('сыновья Саула: 1Цар 14:49 — 1Пар 8:33')),
  b('p-melkhisua', 'Малхисуа', ['1Цар 14:49'], NODE, why('сын Саула: 1Цар 14:49 — «Ионафана и Аминадава и Малхисуа, сыновей Саула» (1Цар 31:2)')),
  b('p-faareya', 'Фарей', ['1Пар 8:35'], SONS, why('сыновья Михи: 1Пар 8:35 — 1Пар 9:41')),
  b('p-shomer-syn-khevera', 'Шемер', ['1Пар 7:32'], [S, O, X], why('родословие Асира, то же место в ряду: «Хевер родил… Шомера» (1Пар 7:32) — «Сыновья Шемера» (1Пар 7:34)')),
  b('p-egla', 'Аглая', ['2Цар 3:5'], [P, S, C, O, X], why('шестая из жён Давида в Хевроне: «шестой Иефераам от Эглы» (2Цар 3:5) — «шестой Ифреам от Аглаи» (1Пар 3:3); «шесть родившихся у него в Хевроне» (1Пар 3:4)'), { count: '1Пар 3:4' }),
  b('p-ieferaam', 'Ифреам', ['2Цар 3:5'], [P, N, S, C, O, X], why('шестой сын Давида в Хевроне: 2Цар 3:5 — 1Пар 3:3; «шесть родившихся у него в Хевроне» (1Пар 3:4)'), { count: '1Пар 3:4' }),
  b('p-sovav-syn-davida', 'Шовав', ['2Цар 5:14'], [P, N, S, C, O, X], why('сыновья Давида в Иерусалиме: 2Цар 5:14 — «Шима, Шовав, Нафан и Соломон, четверо от Вирсавии» (1Пар 3:5)'), { count: '1Пар 3:5' }),
  b('p-elifelet-syn-davida', 'Елфалет', ['1Пар 3:6'], SONS, why('сыновья Давида в Иерусалиме: 1Пар 3:6 — 1Пар 14:5')),
  b('p-elisama-syn-davida', 'Елишама', ['2Цар 5:16'], [P, N, S, C, O, X], why('сыновья Давида в Иерусалиме: 2Цар 5:16 — «Елишама, Елиада и Елифелет — девятеро» (1Пар 3:8)'), { count: '1Пар 3:8' }),
  b('p-eliada-syn-davida', 'Елиада', ['2Цар 5:16'], [P, N, S, C, O, X], why('сыновья Давида в Иерусалиме: 2Цар 5:16 — «Елишама, Елиада и Елифелет — девятеро» (1Пар 3:8)'), { count: '1Пар 3:8' }),
  b('p-elifalef-syn-davida', 'Елифелет', ['2Цар 5:16'], [P, N, S, C, O, X], why('сыновья Давида в Иерусалиме: 2Цар 5:16 — «Елишама, Елиада и Елифелет — девятеро» (1Пар 3:8)'), { count: '1Пар 3:8' }),
  b('p-maokh', 'Мааха', ['1Цар 27:2'], NODE, why('отец Анхуса, царя Гефского: «Анхусу, сыну Маоха» (1Цар 27:2) — «Анхусу, сыну Маахи, царю Гефскому» (3Цар 2:39)')),
  // основное имя — «Аммиэл»: 2Цар 9:4, 5 (два стиха), «Аммиил» — 2Цар 17:27 (один)
  b('p-ammiil-otets-makhira', 'Аммиэл', ['2Цар 9:4', '2Цар 9:5'], NODE, why('отец Махира из Лодевара: «Махира, сына Аммиэлова, в Лодеваре» (2Цар 9:4) — «Махир, сын Аммиила, из Лодавара» (2Цар 17:27)'), { swap: true }),
  b('p-akhio-syn-aminadava', 'Ахия', ['2Цар 6:3'], LIST, why('вели колесницу с ковчегом: «Оза и Ахио» (2Цар 6:3) — «Оза и Ахия» (1Пар 13:7)')),
  b('p-shimeata', 'Шимеафа', ['4Цар 12:21'], LIST, why('мать убийцы Иоаса: 4Цар 12:21 — 2Пар 24:26')),
  b('p-ioafam', 'Иофам', ['4Цар 15:38'], NODE, why('отец Ахаза: «почил Иоафам… и воцарился Ахаз, сын его» (4Цар 15:38) — «его сын Иофам, его сын Ахаз» (1Пар 3:12–13)')),
  b('p-amon-tsar', 'Аммон', ['2Пар 33:20'], [P, N, O, X], why('сын Манассии, царь после него: «воцарился Аммон, сын его» (4Цар 21:18) — «воцарился Амон, сын его» (2Пар 33:20)')),
  b('p-sellum-syn-iosii', 'Саллум', ['1Пар 3:15'], NODE, why('сын Иосии: «четвертый Селлум» (1Пар 3:15) — «о Саллуме, сыне Иосии» (Иер 22:11)')),
  b('p-feglaffellasar', 'Феглафелласар', ['4Цар 15:29'], LIST, why('царь Ассирийский, переселивший колена: 4Цар 15:29 — 1Пар 5:26; при Ахазе — 4Цар 16:7 — 2Пар 28:20')),
  // основное имя — «Иуй»: 3Цар 16:1, 7, 12 (три стиха), «Ииуй, сын Анании» — 2Пар 19:2; 20:34 (два)
  b('p-iiuy-syn-anani', 'Иуй', ['3Цар 16:1', '3Цар 16:7', '3Цар 16:12'], NODE, why('прозорливец, сын Анании: «к Иую, сыну Ананиеву» (3Цар 16:1) — «Ииуй, сын Анании, прозорливец» (2Пар 19:2)'), { swap: true }),
  b('p-rekhav-otets-ionadava', 'Рихав', ['Иер 35:6'], NODE, why('отец Ионадава: «с Ионадавом, сыном Рихавовым» (4Цар 10:15) — «Ионадав, сын Рехава» (Иер 35:6)')),
  // основное имя — «Баладан»: по одному стиху (4Цар 20:12; Ис 39:1), 4Цар раньше по порядку книг
  b('p-valadan', 'Баладан', ['4Цар 20:12'], [P, N, O, X], why('отец царя Вавилонского, пославшего письма Езекии: «Беродах-Баладан, сын Баладана» (4Цар 20:12) — «Меродах-Валадан, сын Валадана» (Ис 39:1)'), { swap: true }),
  b('p-shafan', 'Сафан', ['4Цар 22:12'], NODE, why('отец Ахикама: «Ахикаму, сыну Шафанову» (4Цар 22:12) — «Ахикама, сына Сафанова» (Иер 26:24)')),
  // основное имя — «Молхия»: по одному стиху (Иер 21:1; 38:1), Иер 21:1 раньше
  b('p-malkhiya-otets-paskhora', 'Молхия', ['Иер 21:1'], NODE, why('отец Пасхора: «Пасхора, сына Молхиина» (Иер 21:1) — «Пасхор, сын Малхии» (Иер 38:1)'), { swap: true }),
  b('p-elishama-ded-ismaila', 'Елисам', ['4Цар 25:25'], [P, N, O, X], why('дед Измаила: «Исмаил, сын Нефании, сына Елишамы» (4Цар 25:25) — «Исмаил, сын Нафании, сына Елисама» (Иер 41:1)')),
  b('p-nafaniya-otets-ismaila', 'Нефания', ['Иер 40:8'], [P, N, O, X], why('отец Измаила: 4Цар 25:23, 25 — Иер 40:8')),
  b('p-iezaniya-syn-makhafy', 'Иезония', ['4Цар 25:23'], [P, N, O, X], why('сын Маахати, пришедший к Годолии: 4Цар 25:23 — Иер 40:8')),
  b('p-evilmerodakh', 'Евильмеродах', ['4Цар 25:27'], [P, O, X], why('царь Вавилонский, освободивший Иехонию: 4Цар 25:27 — Иер 52:31')),
  b('p-sheshay', 'Сесай', ['Нав 15:14'], [N, C, O, X], why('сыновья Енака: «Ахиман, Сесай и Фалмай, дети Енаковы» (Чис 13:23) — «трех сынов Енаковых: Шешая, Ахимана и Фалмая» (Нав 15:14)'), { count: 'Нав 15:14' }),
  b('p-ikesh', 'Иккеш', ['2Цар 23:26'], NODE, why('отец Иры Фекоитянина: 2Цар 23:26 — 1Пар 27:9')),
  b('p-baana-otets-kheleva', 'Ваана', ['2Цар 23:29'], [P, N, S, C, O, X], why('отец Хелева в перечне храбрых: 2Цар 23:29 — 1Пар 11:30; «Всех тридцать семь» (2Цар 23:39)'), { count: '2Цар 23:39' }),
  b('p-azmavet', 'Азмавеф', ['2Цар 23:31'], [P, S, C, O, X], why('перечень храбрых: 2Цар 23:31 — 1Пар 11:33; «Всех тридцать семь» (2Цар 23:39)'), { count: '2Цар 23:39' }),
  b('p-khetsray', 'Хецрой', ['2Цар 23:35'], [P, S, C, O, X], why('перечень храбрых: 2Цар 23:35 — 1Пар 11:37; «Всех тридцать семь» (2Цар 23:39)'), { count: '2Цар 23:39' }),
  b('p-zaffu', 'Заттуй', ['Неем 7:13'], LIST, why('копия перечня пришедших с Зоровавелем (Неем 7:5): Неем 7:13 — Езд 2:8')),
  b('p-bevay', 'Бебай', ['Неем 7:16'], LIST, why('копия перечня пришедших с Зоровавелем (Неем 7:5): Неем 7:16 — Езд 2:11')),
  b('p-khabayya', 'Ховаия', ['Езд 2:61'], LIST, why('копия перечня пришедших с Зоровавелем (Неем 7:5): Езд 2:61 — Неем 7:63')),
  b('p-berekhiya-syn-meshizabela', 'Верехия', ['Неем 3:4'], NODE, why('отец Мешуллама: «Мешуллам, сын Берехии» (Неем 3:4) — «Мешуллама, сына Верехии» (Неем 6:18)')),
];

// ---------------------------------------------------------------- D18-2: Селлум Кореянин — вид (в)

const SELLUM: Split = {
  from: 'p-shallum-syn-kore', id: 'p-sellum-koreyanin', sex: 'm', forms: ['Селлум'],
  disambig: 'Кореянин, отец левита Маттафии (1Пар 9:31)',
  facts: [ident('Возможно, это тот же человек, что Шаллум, сын Коре, главный привратник: так выходит, если сравнить 1Пар 9:31 и 1Пар 9:19. Оба названы Кореянами, но ни общего отца или сына, ни места в одном перечне текст не даёт: тот ли это человек, текст не говорит', ['1Пар 9:31', '1Пар 9:19'])],
  rels: [{ b: 'p-shallum-syn-kore', refs: ['1Пар 9:31', '1Пар 9:19'], note: '«первенец Селлума Кореянина» (1Пар 9:31) — «Шаллум, сын Коре, сын Евиасафа, сын Корея… Кореяне» (1Пар 9:19). Общее — только имя рода; родственника или места в перечне нет' }],
};

// ---------------------------------------------------------------- D15-19: Неем 12:12–21 — дома (Д15-2)

interface House { id: string; form: string; gen: string; verse: Ref; from: string; also?: string[]; moveForm?: true }
/** Главы домов «во дни Иоакима» (Неем 12:12–21) и главы священников «во дни Иисуса» (Неем 12:1–7), с которыми они могут совпадать. */
export const HOUSES: House[] = [
  { id: 'p-seraiya-neem12-12', form: 'Сераия', gen: 'Сераии', verse: 'Неем 12:12', from: 'p-seraiya-neem12' },
  { id: 'p-ieremiya-neem12-12', form: 'Иеремия', gen: 'Иеремии', verse: 'Неем 12:12', from: 'p-ieremiya-neem12' },
  { id: 'p-ezdra-neem12-13', form: 'Ездра', gen: 'Ездры', verse: 'Неем 12:13', from: 'p-ezdra-neem12' },
  { id: 'p-amariya-neem12-13', form: 'Амария', gen: 'Амарии', verse: 'Неем 12:13', from: 'p-amariya-neem12' },
  { id: 'p-melikhu-neem12-14', form: 'Мелиху', gen: 'Мелиху', verse: 'Неем 12:14', from: 'p-mallukh-neem12', moveForm: true },
  { id: 'p-shevaniya-neem12-14', form: 'Шевания', gen: 'Шевании', verse: 'Неем 12:14', from: 'p-shekhaniya-neem12', moveForm: true },
  { id: 'p-kharim-neem12-15', form: 'Харим', gen: 'Харима', verse: 'Неем 12:15', from: 'p-rekhum-neem12', moveForm: true },
  { id: 'p-meraiof-neem12-15', form: 'Мераиоф', gen: 'Мераиофа', verse: 'Неем 12:15', from: 'p-meremof-neem12', moveForm: true },
  { id: 'p-iddo-neem12-16', form: 'Иддо', gen: 'Иддо', verse: 'Неем 12:16', from: 'p-iddo-neem12' },
  { id: 'p-ginnefon-neem12-16', form: 'Гиннефон', gen: 'Гиннефона', verse: 'Неем 12:16', from: 'p-ginnefoy', moveForm: true },
  { id: 'p-aviya-neem12-17', form: 'Авия', gen: 'Авии', verse: 'Неем 12:17', from: 'p-aviya-neem12' },
  { id: 'p-miniamin-neem12-17', form: 'Миниамин', gen: 'Миниамина', verse: 'Неем 12:17', from: 'p-miyamin-neem12', moveForm: true },
  { id: 'p-moadiya-neem12-17', form: 'Моадия', gen: 'Моадии', verse: 'Неем 12:17', from: 'p-maadiya', moveForm: true },
  { id: 'p-vilga-neem12-18', form: 'Вилга', gen: 'Вилги', verse: 'Неем 12:18', from: 'p-vilga-neem12' },
  { id: 'p-shemaiya-neem12-18', form: 'Шемаия', gen: 'Шемаии', verse: 'Неем 12:18', from: 'p-shemaiya-neem12' },
  { id: 'p-ioiariv-neem12-19', form: 'Иоиарив', gen: 'Иоиарива', verse: 'Неем 12:19', from: 'p-ioiariv-neem12' },
  { id: 'p-iedaiya-neem12-19', form: 'Иедаия', gen: 'Иедаии', verse: 'Неем 12:19', from: 'p-iedaiya-neem12-6', also: ['p-iedaiya-neem12-7'] },
  { id: 'p-sallay-neem12-20', form: 'Саллай', gen: 'Саллая', verse: 'Неем 12:20', from: 'p-sallu-neem12', moveForm: true },
  { id: 'p-amok-neem12-20', form: 'Амок', gen: 'Амока', verse: 'Неем 12:20', from: 'p-amok' },
  { id: 'p-khelkiya-neem12-21', form: 'Хелкия', gen: 'Хелкии', verse: 'Неем 12:21', from: 'p-khelkiya-neem12' },
  { id: 'p-iedaiya-neem12-21', form: 'Иедаия', gen: 'Иедаии', verse: 'Неем 12:21', from: 'p-iedaiya-neem12-7', also: ['p-iedaiya-neem12-6'] },
];
const FIRST_LIST: Record<string, Ref> = {
  'p-seraiya-neem12': 'Неем 12:1', 'p-ieremiya-neem12': 'Неем 12:1', 'p-ezdra-neem12': 'Неем 12:1', 'p-amariya-neem12': 'Неем 12:2',
  'p-mallukh-neem12': 'Неем 12:2', 'p-shekhaniya-neem12': 'Неем 12:3', 'p-rekhum-neem12': 'Неем 12:3', 'p-meremof-neem12': 'Неем 12:3',
  'p-iddo-neem12': 'Неем 12:4', 'p-ginnefoy': 'Неем 12:4', 'p-aviya-neem12': 'Неем 12:4', 'p-miyamin-neem12': 'Неем 12:5', 'p-maadiya': 'Неем 12:5',
  'p-vilga-neem12': 'Неем 12:5', 'p-shemaiya-neem12': 'Неем 12:6', 'p-ioiariv-neem12': 'Неем 12:6', 'p-iedaiya-neem12-6': 'Неем 12:6',
  'p-sallu-neem12': 'Неем 12:7', 'p-amok': 'Неем 12:7', 'p-khelkiya-neem12': 'Неем 12:7', 'p-iedaiya-neem12-7': 'Неем 12:7',
};
const GENERATIONS = 'Перечни Неем 12:1–7 и 12:12–21 — разные поколения: «Это главы священников и братья их во дни Иисуса» (Неем 12:7) и «Во дни Иоакима были священники, главы поколений» (Неем 12:12). Во втором перечне названы дома; тот ли это человек, текст не говорит';

function houseSplit(base: Base, h: House): Split {
  const A = actorsOf(base);
  const name = (id: string) => mainOf(A.get(id)!).form;
  const cands = [h.from, ...(h.also ?? [])];
  const same = cands.length === 1 && name(h.from) === h.form;
  const rels = cands.map((c) => ({
    b: c, refs: [h.verse, FIRST_LIST[c]],
    note: `${same ? 'То же имя' : cands.length > 1 ? 'Глав с этим именем в Неем 12:6–7 двое' : 'Имя другое'}: «из дома ${h.gen}» (${h.verse}) — ${name(c)} среди глав священников во дни Иисуса (${FIRST_LIST[c]}). ${GENERATIONS}`,
  }));
  return {
    from: h.from, id: h.id, sex: 'm', forms: h.moveForm ? [h.form] : [], addRefs: [h.verse],
    names: [{ form: h.form, type: 'main', refs: [h.verse] } as Name],
    disambig: `глава дома священников во дни Иоакима (${h.verse})`,
    facts: [ident(`Возможно, это ${cands.length > 1 ? 'один из двух глав священников по имени Иедаия, пришедших' : `тот же человек, что ${name(h.from)}, пришедший`} с Зоровавелем: так выходит, если сравнить ${h.verse} и ${cands.map((c) => FIRST_LIST[c]).join(', ')}. ${GENERATIONS}`, [h.verse, ...cands.map((c) => FIRST_LIST[c])])],
    rels,
  };
}

// ---------------------------------------------------------------- D16-1: подписи безымянных (Д-16)

const D = (text: string, refs: Ref[], x: Partial<Descriptor> = {}): Descriptor => ({ text, refs, cert: x.nameFrom ? 'inference' : 'scripture', ...x });
/**
 * Подписи 48 безымянных. Слова подписи — из стихов `refs` вне скобок; имя другого лица из соседнего стиха — `nameFrom` и
 * уровень «выв.». У «Матери Иеффая» слова «мать» в стихе нет («сын блудницы», Суд 11:1): подпись — «блудница», «мать Иеффая» —
 * только слова поиска.
 */
export const DESCRIPTORS: Record<string, { d: Descriptor; form?: string; disambig?: string }> = {
  'p-zhena-lota': { d: D('жена Лотова', ['Быт 19:26']), form: 'Жена Лотова' },
  'p-starshaya-doch-lota': { d: D('старшая дочь Лота', ['Быт 19:30', 'Быт 19:31']) },
  'p-mladshaya-doch-lota': { d: D('младшая дочь Лота', ['Быт 19:30', 'Быт 19:31']) },
  'p-doch-shui': { d: D('дочь Шуи', ['Быт 38:2', 'Быт 38:12']) },
  'p-zhena-potifara': { d: D('жена Потифара', ['Быт 39:7'], { nameFrom: [{ actor: 'p-potifar', ref: 'Быт 39:1' }], alt: ['жена господина его'] }) },
  'p-doch-makhira': { d: D('дочь Махира', ['1Пар 2:21']) },
  'p-doch-sheshana': { d: D('дочь Шешана', ['1Пар 2:34', '1Пар 2:35']) },
  'p-doch-faraona-mat-moiseya': { d: D('дочь фараонова', ['Исх 2:5']) },
  'p-doch-futiila': { d: D('жена Елеазара', ['Исх 6:25']) },
  'p-efioplyanka-zhena-moiseya': { d: D('жена-Ефиоплянка Моисея', ['Чис 12:1']) },
  'p-zhena-fineesa-syn-iliya': { d: D('жена Финееса', ['1Цар 4:19']) },
  'p-zhena-verzelliya-svyashchennika': { d: D('жена Верзеллия-священника', ['Езд 2:61']) },
  'p-nalozhnitsa-manassii': { d: D('наложница Манассии', ['1Пар 7:14']) },
  'p-mat-sisary': { d: D('мать Сисары', ['Суд 5:28']) },
  'p-nalozhnitsa-gedeona': { d: D('наложница Гедеона', ['Суд 8:31'], { nameFrom: [{ actor: 'p-gedeon', ref: 'Суд 8:30' }] }) },
  'p-mat-ieffaya': { d: D('блудница', ['Суд 11:1'], { alt: ['мать Иеффая'] }), form: 'Блудница', disambig: 'её сын — Иеффай (Суд 11:1)' },
  'p-doch-ieffaya': { d: D('дочь Иеффая', ['Суд 11:34']) },
  'p-zhena-manoya': { d: D('жена Маноя', ['Суд 13:2']) },
  'p-zhena-samsona': { d: D('жена Самсона', ['Суд 14:1', 'Суд 14:2']) },
  'p-mat-mikhi': { d: D('мать Михи', ['Суд 17:2'], { nameFrom: [{ actor: 'p-mikha-s-gory-efremovoy', ref: 'Суд 17:1' }] }) },
  'p-mladenets-syn-virsavii': { d: D('сын Давида и Вирсавии', ['2Цар 11:27'], { nameFrom: [{ actor: 'p-david', ref: '2Цар 11:27' }, { actor: 'p-virsaviya', ref: '2Цар 11:3' }] }) },
  'p-faraon-test-solomona': { d: D('фараон', ['3Цар 3:1']) },
  'p-doch-faraona-zhena-solomona': { d: D('дочь фараона', ['3Цар 3:1']) },
  'p-tsar-2par28-7': { d: D('царь', ['2Пар 28:7']) },
  'p-tsar-ier38-6': { d: D('царь', ['Иер 38:6']) },
  'p-faraon-pri-adere': { d: D('фараон', ['3Цар 11:18']) },
  'p-sestra-takhpenesy': { d: D('сестра Тахпенесы', ['3Цар 11:19']) },
  'p-zhena-ieroboama': { d: D('жена Иеровоама', ['3Цар 14:2']) },
  'p-otets-venadada': { d: D('отец Венадада', ['3Цар 20:34']) },
  'p-pervenets-mesy': { d: D('первенец Месы', ['4Цар 3:27'], { nameFrom: [{ actor: 'p-mesa', ref: '4Цар 3:4' }] }) },
  'p-prorochitsa-zhena-isaii': { d: D('пророчица', ['Ис 8:3']) },
  'p-tsaritsa-dan5': { d: D('царица', ['Дан 5:10']) },
  'p-syn-ioiady-zyat-sanavallata': { d: D('сын Иоиады', ['Неем 13:28']) },
  'p-mat-lemuila': { d: D('мать Лемуила', ['Притч 31:1']) },
  'p-teshcha-simona': { d: D('тёща Симона', ['Мк 1:30', 'Лк 4:38']) },
  'p-mat-synovey-zevedeevykh': { d: D('мать сыновей Зеведеевых', ['Мф 20:20']) },
  'p-doch-iaira': { d: D('дочь Иаира', ['Мк 5:23'], { nameFrom: [{ actor: 'p-iair-nachalnik-sinagogi', ref: 'Мк 5:22' }] }) },
  'p-mat-rufa': { d: D('мать Руфа', ['Рим 16:13']) },
  'p-doch-irodiady': { d: D('дочь Иродиады', ['Мф 14:6']) },
  'p-zhena-pilata': { d: D('жена Пилата', ['Мф 27:19'], { nameFrom: [{ actor: 'p-pontiy-pilat', ref: 'Мф 27:17' }] }) },
  'p-docheri-filippa': { d: D('четыре дочери Филиппа', ['Деян 21:9'], { nameFrom: [{ actor: 'p-filipp-blagovestnik', ref: 'Деян 21:8' }] }) },
  'p-synovya-skevy': { d: D('семь сынов Скевы', ['Деян 19:14']) },
  'p-sestra-nireya': { d: D('сестра Нирея', ['Рим 16:15']) },
  'p-otets-publiya': { d: D('отец Публия', ['Деян 28:8']) },
  'p-syn-izrailtyanki-khulitel': { d: D('сын Израильтянки', ['Лев 24:10']) },
  'p-doch-meshullama-zhena-iokhanana': { d: D('дочь Мешуллама', ['Неем 6:18']) },
  'p-zhena-kaina': { d: D('жена Каина', ['Быт 4:17']) },
  'p-samaryanin-iz-desyati-prokazhennykh': { d: D('Самарянин', ['Лк 17:16']) },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- D20-1: опоры (Д-20)

const agent = (work: string, page: string): Cite => ({ work, page, weight: 'approx', checkedBy: 'agent' } as Cite);
const NO_PAGE = 'страница не сверена';
const Y = (earliest: number, latest: number, words: string) => ({ earliest, latest, words });
const LOG_V33 = { release: 'проба (до выпуска 1)', what: '' };
const log = (what: string) => [{ ...LOG_V33, what }];
type AnchorPatch = Pick<Anchor, 'kind' | 'year' | 'alternatives' | 'log'> & Partial<Pick<Anchor, 'event' | 'source' | 'works'>>;
/** Вид опоры — по предложению 02 § 3.15.4 [4.6]; год — промежуток; альтернативы — записи с трудом (Д-20). */
export const ANCHORS: Record<string, AnchorPatch> = {
  'an-solomon-4': {
    kind: 'calc', year: Y(-967, -967, '967 до Р. Х.'),
    alternatives: [{ year: { earliest: -966, latest: -966 }, words: '966 до Р. Х. (Тиле)', works: [agent('w-thiele-1983', NO_PAGE)] }],
    log: log('вид опоры — расчёт по схеме царей; год промежутком; альтернатива Тиле — записью с трудом (Д-20)'),
  },
  'an-qarqar': { kind: 'external', year: Y(-853, -853, '853 до Р. Х.'), alternatives: [], log: log('вид опоры — внешний документ; год промежутком (Д-20)') },
  'an-jehu-tribute': { kind: 'external', year: Y(-841, -841, '841 до Р. Х.'), alternatives: [], log: log('вид опоры — внешний документ; год промежутком (Д-20)') },
  'an-samaria': {
    kind: 'calc', year: Y(-723, -723, '723 до Р. Х.'),
    alternatives: [{ year: { earliest: -722, latest: -722 }, words: '722 до Р. Х. (Тиле)', works: [agent('w-thiele-1983', NO_PAGE)] }],
    log: log('вид опоры — расчёт по схеме царей; год промежутком; альтернатива Тиле — записью с трудом (Д-20)'),
  },
  'an-sennacherib': { kind: 'external', year: Y(-701, -701, '701 до Р. Х.'), alternatives: [], log: log('вид опоры — внешний документ; год промежутком (Д-20)') },
  'an-first-captivity': {
    kind: 'external', year: Y(-605, -605, '605 до Р. Х.'), event: 'В третий год царствования Иоакима Навуходоносор пришёл к Иерусалиму; Даниил уведён в Вавилон',
    alternatives: [], works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('вид опоры — внешний документ (вавилонские хроники); год промежутком; событие — словами Дан 1:1 (П1-4: слов «первое пленение» в тексте нет); труд (Д-20)'),
  },
  'an-jeconiah-exile': { kind: 'external', year: Y(-597, -597, '597 до Р. Х.'), alternatives: [], works: [agent('w-finegan-1998', NO_PAGE)], log: log('вид опоры — внешний документ; год промежутком; труд (Д-20)') },
  'an-jerusalem-fall': {
    kind: 'calc', year: Y(-587, -587, '587 до Р. Х.'),
    source: 'По схеме по умолчанию McFall — Young (В-23; 04 § 3.8): Иерусалим сожжён в 587 г. до Р. Х. (Young, 2004); по Тиле — 586',
    alternatives: [{ year: { earliest: -586, latest: -586 }, words: '586 до Р. Х. (Тиле)', works: [agent('w-thiele-1983', NO_PAGE)] }],
    works: [agent('w-young-jerusalem-2004', 'с. 21–38')],
    log: log('год по умолчанию — 587 по схеме McFall — Young (04 § 3.8), был 586 (Тиле); 586 — альтернатива с трудом; вид — расчёт по схеме (Д-20)'),
  },
  'an-babylon-fall': { kind: 'external', year: Y(-539, -539, '539 до Р. Х.'), alternatives: [], works: [agent('w-finegan-1998', NO_PAGE)], log: log('вид опоры — внешний документ (хроника Набонида); год промежутком; труд (Д-20)') },
  'an-cyrus-decree': {
    kind: 'external', year: Y(-538, -537, '538/537 до Р. Х.'),
    alternatives: [
      { year: { earliest: -538, latest: -538 }, words: '538 до Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: -537, latest: -537 }, words: '537 до Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('год по умолчанию — 538/537 (первый год Кира над Вавилоном), был 538; части — альтернативы с трудом (Д-20)'),
  },
  'an-darius-2': { kind: 'external', year: Y(-520, -520, '520 до Р. Х.'), alternatives: [], works: [agent('w-finegan-1998', NO_PAGE)], log: log('вид опоры — внешний документ; год промежутком; труд (Д-20)') },
  'an-ezra': {
    kind: 'external', year: Y(-458, -458, '458 до Р. Х.'),
    alternatives: [{ year: { earliest: -398, latest: -398 }, words: '398 до Р. Х. — если Артаксеркс в Езд 7:7 («в седьмой год царя Артаксеркса») — второй царь этого имени', works: [agent('w-yamauchi-1980', 'с. 7–13'), agent('w-finegan-1998', NO_PAGE)] }],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('альтернатива «Артаксеркс II» (398) — записью с трудом, обязательно (02 § 3.15.4; Д-20); год промежутком'),
  },
  'an-nehemiah': {
    kind: 'external', year: Y(-445, -444, '445/444 до Р. Х.'),
    alternatives: [
      { year: { earliest: -445, latest: -445 }, words: '445 до Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: -444, latest: -444 }, words: '444 до Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('год по умолчанию — 445/444 (двадцатый год Артаксеркса), был 445; части — альтернативы с трудом (Д-20)'),
  },
  'an-herod-death': {
    kind: 'external', year: Y(-4, -4, '4 до Р. Х.'),
    alternatives: [{ year: { earliest: -1, latest: -1 }, words: '1 до Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] }],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('готовые производные годы (derived: видение Захарии, Рождество, Иисус в храме) сняты — годы считает расчёт, а не опора; альтернатива — записью с трудом (Д-20)'),
  },
  'an-tiberius-15': {
    kind: 'external', year: Y(26, 29, '26–29 по Р. Х.'),
    source: 'Римская хронология: пятнадцатый год Тиверия — 26/27 при счёте от соправления с Августом (12 г.) и 28/29 при счёте от единоличного правления (14 г.); по умолчанию — оба способа',
    alternatives: [
      { year: { earliest: 26, latest: 27 }, words: '26/27 — от соправления с Августом', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: 28, latest: 29 }, words: '28/29 — от единоличного правления', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('год по умолчанию — промежуток 26–29 (оба способа счёта), был 26; части 26/27 и 28/29 — альтернативы с трудом; производный год казни Иоанна снят (Д-20)'),
  },
  'an-crucifixion': {
    kind: 'calc', year: Y(30, 30, '30 по Р. Х.'),
    alternatives: [{ year: { earliest: 33, latest: 33 }, words: '33 по Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] }],
    log: log('вид опоры — расчёт: года в Писании нет; альтернатива — записью с трудом (Д-20)'),
  },
  'an-paul-conversion': {
    kind: 'calc', year: Y(34, 34, '34 по Р. Х.'),
    alternatives: [
      { year: { earliest: 32, latest: 32 }, words: '32 по Р. Х. — если «три года» и «четырнадцать лет» — полные годы', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: 35, latest: 35 }, words: '35 по Р. Х. — если четырнадцать лет считать от обращения', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    log: log('вид опоры — расчёт; альтернативы — записями с трудом (Д-20)'),
  },
  'an-agrippa-death': {
    kind: 'external', year: Y(44, 44, '44 по Р. Х.'), alternatives: [], works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('готовый производный год (пророки и учители в Антиохии) снят; год промежутком; труд (Д-20)'),
  },
  'an-jerusalem-council': {
    kind: 'calc', year: Y(49, 49, '49 по Р. Х.'),
    alternatives: [
      { year: { earliest: 48, latest: 48 }, words: '48 по Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: 50, latest: 50 }, words: '50 по Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    log: log('вид опоры — расчёт; альтернативы — записями с трудом (Д-20)'),
  },
  'an-festus': {
    kind: 'external', year: Y(59, 59, '59 по Р. Х.'),
    source: 'Римские сведения о прокураторах Иудеи и монеты Феста; дата спорна',
    alternatives: [
      { year: { earliest: 60, latest: 60 }, words: '60 по Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] },
      { year: { earliest: 55, latest: 55 }, words: '55 по Р. Х. (ранняя хронология)', works: [agent('w-finegan-1998', NO_PAGE)] },
    ],
    works: [agent('w-finegan-1998', NO_PAGE)],
    log: log('готовый производный год (узы Павла в Кесарии) снят; альтернативы — записями с трудом (Д-20)'),
  },
  'an-paul-rome': {
    kind: 'calc', year: Y(60, 60, '60 по Р. Х.'), event: 'Павел в Риме «целых два года»',
    alternatives: [{ year: { earliest: 61, latest: 61 }, words: '61 по Р. Х.', works: [agent('w-finegan-1998', NO_PAGE)] }],
    log: log('вид опоры — расчёт; годы в имени события и производный год конца двух лет сняты; альтернатива — записью с трудом (Д-20)'),
  },
  'an-revelation': {
    kind: 'tradition', year: Y(95, 95, '95 по Р. Х.'),
    alternatives: [{ year: { earliest: 68, latest: 69 }, words: '68–69 по Р. Х. — при Нероне или вскоре после его смерти', works: [agent('w-finegan-1998', NO_PAGE)] }],
    log: log('вид опоры — предание (Ириней): года записям не даёт; альтернатива — записью с трудом (Д-20)'),
  },
};

// ---------------------------------------------------------------- P14-1: эпохи (П1-4)

/** Правки эпох по второму ключу сцен пакета 1 (№ 86–89): слова вместо готовых годов опор, «часто» без подсчёта, Деян 1:3. */
function patchEpochs(base: Base) {
  const ep = (id: string) => {
    const e = base.epochs.find((x: any) => x.id === id || `era-${x.id}` === id);
    if (!e) throw new Error(`P14-1: нет эпохи ${id}`);
    return e as any;
  };
  const replace = (s: string, a: string, b2: string, id: string) => {
    if (!s.includes(a)) throw new Error(`P14-1: в ${id} нет «${a}»`);
    return s.replace(a, b2);
  };
  const church = ep('era-church');
  church.basis = replace(church.basis, 'часто относят ко всему канону', 'некоторые относят ко всему канону', 'era-church');
  const divided = ep('era-divided');
  divided.end.note = 'год — опора an-samaria по схеме царей (по умолчанию и по Тиле — в записи опоры, 04 § 3.8)';
  const judah = ep('era-judah-alone');
  judah.start.note = divided.end.note;
  judah.end.note = 'год — опора an-jerusalem-fall по схеме царей (по умолчанию и по Тиле — в записи опоры, 04 § 3.8)';
  const exile = ep('era-exile');
  exile.start.note = judah.end.note;
  for (const e of base.epochs as any[]) for (const v of e.events ?? []) {
    if (typeof v.text === 'string' && /первое пленение/i.test(v.text)) v.text = v.text.replace(/Первое пленение: /i, '').replace(/первое пленение/i, 'Даниил уведён в Вавилон');
    for (const k of ['label', 'event', 'name'] as const) if (typeof v[k] === 'string' && /первое пленение/i.test(v[k])) v[k] = v[k].replace(/Первое пленение: /i, '').replace(/первое пленение/i, 'Даниил уведён в Вавилон');
  }
  const christ = ep('era-christ');
  christ.end.note = 'Пятидесятница — в год распятия: Иисус являлся ученикам «в продолжение сорока дней» (Деян 1:3), и «При наступлении дня Пятидесятницы» (Деян 2:1) они были вместе; год распятия — опора an-crucifixion (расчёт, с альтернативой в записи опоры)';
  christ.end.refs = [...new Set(['Деян 1:3', ...christ.end.refs])];
  const apostolic = ep('era-apostolic');
  apostolic.start = { ...apostolic.start, note: christ.end.note, refs: [...christ.end.refs] };
  christ.refs = [...new Set([...(christ.refs ?? []), 'Деян 1:3'])];
  christ.basis = replace(christ.basis, 'Конец — Пятидесятница (Деян 2:1) в год распятия', 'Конец — Пятидесятница (Деян 2:1) в год распятия: Иисус являлся ученикам «в продолжение сорока дней» (Деян 1:3)', 'era-christ');
  for (const e of [church, divided, judah, exile, christ, apostolic]) e.prov = { ...e.prov, ...by('P14-1') };
}

// ---------------------------------------------------------------- D19-1: тождество по форме (Д-18, Д-19)

/** Освобождение заметки от тождества по форме — только по словам или по чужим стихам (02 § 3.3.5 [4.6]; К-22). */
export function exemptOf(a: Actor, f: Assertion): Assertion['idCertExempt'] {
  const t = String((f.value as { text?: string } | undefined)?.text ?? '');
  if (/не смешивать/i.test(t)) return 'not-same';
  if (/так выходит, если сравнить/i.test(t)) return 'says-inferred';
  const fv = new Set(inferredForms(a).flatMap(formVerses));
  if (!verseIds(refsDeep(f.value)).some((v) => fv.has(v))) return 'other-verses';
  return undefined;
}

export function autoIdCert(base: Base, step: string) {
  const A = actorsOf(base);
  const n = { facts: 0, exempt: 0, memberships: 0, nodata: 0, origins: 0, inputs: 0, dangling: 0 };
  const touched = new Set<string>();
  const formIds = new Set<string>();
  for (const a of A.values()) for (const x of a.names) if (x.id && x.cert === 'inference') formIds.add(x.id);
  // тождество по форме, чья форма ушла на другую карточку (D15-19) — снимается: запись теперь на карточке имени стиха
  const drop = (x: { idCert?: IdCert; prov?: object }) => {
    if (x.idCert && !formIds.has(x.idCert.form)) (delete x.idCert, touch(x, step), n.dangling++);
  };
  for (const a of A.values()) for (const f of a.facts) drop(f);
  for (const m of base.memberships) drop(m);
  for (const x of base.nodata) drop(x);
  for (const o of base.origins) if (o.identity?.degree === 'inferred' && o.identity.form && !formIds.has(o.identity.form)) (delete o.identity, touch(o, step), n.dangling++);
  for (const c of base.chrono) for (const t of ((c.chrono as { inputs?: TimeInput[] })?.inputs ?? [])) if (t.idCert && !formIds.has(t.idCert.form)) (delete t.idCert, touch(c, step), n.dangling++);

  for (const a of A.values()) {
    if (!inferredForms(a).length) continue;
    for (const f of a.facts) {
      if (f.idCert || f.idCertExempt || f.prov?.status === 'quarantine' || f.field === 'scripture') continue;
      const rs = refsDeep(f.value).filter((r) => r);
      const form = rs.length ? restsOnFormLoose(a, rs) : undefined;
      if (!form) continue;
      const ex = formCertExempt(f) ? exemptOf(a, f) : undefined;
      if (ex) (f.idCertExempt = ex), n.exempt++;
      else (f.idCert = { form: form.id!, refs: [...new Set(rs)] }), n.facts++;
      touch(f, step);
      touched.add(a.id);
    }
  }
  for (const m of base.memberships) {
    const a = A.get(m.actor);
    const form = a && !m.idCert && m.refs.length ? restsOnFormLoose(a, m.refs) : undefined;
    if (form) (m.idCert = { form: form.id!, refs: [...m.refs] }), touch(m, step), n.memberships++, touched.add(m.actor);
  }
  for (const x of base.nodata) {
    const a = A.get(x.actor);
    const form = a && !x.idCert && x.refs.length ? restsOnFormLoose(a, x.refs) : undefined;
    if (form) (x.idCert = { form: form.id!, refs: [...x.refs] }), touch(x, step), n.nodata++, touched.add(x.actor);
  }
  for (const o of base.origins) {
    // «предположительно» слабее вывода по форме — степень не повышается (второй ключ В-33: Иоханан из Неем 12:22–23)
    if (o.identity?.degree === 'inferred' || o.identity?.degree === 'possible' || o.candidates?.length) continue;
    for (const [end, of] of [[o.parent, 'parent'], [o.child, 'child']] as const) {
      const a = end ? A.get(end) : undefined;
      if (!a || !inferredForms(a).length) continue;
      const f = restsOnFormLoose(a, o.refs);
      if (!f) continue;
      o.identity = {
        of, degree: 'inferred', form: f.id!, refs: [...new Set([...o.refs, ...(f.compare?.main.refs ?? [])])],
        note: `в стихах ребра ${of === 'parent' ? 'родитель' : 'ребёнок'} назван формой «${f.form}» или не назван вовсе — форма «выв.» карточки ${mainOf(a).form}: так выходит, если сравнить места (02 § 3.3.5)`,
      } as Origin['identity'];
      touch(o, step);
      n.origins++;
      touched.add(a.id);
      break;
    }
  }
  for (const c of base.chrono) {
    const inputs = (c.chrono as { inputs?: TimeInput[] })?.inputs;
    if (!Array.isArray(inputs)) continue;
    for (const t of inputs) {
      if (t.idCert || !t.refs?.length) continue;
      for (const id of [c.actor, t.other]) {
        const a = id ? A.get(id) : undefined;
        if (!a || !inferredForms(a).length) continue;
        const f = restsOnFormLoose(a, t.refs);
        if (!f) continue;
        t.idCert = { form: f.id!, refs: [...t.refs] };
        touch(c, step);
        n.inputs++;
        touched.add(a.id);
        break;
      }
    }
  }
  // явное освобождение у всех заметок, которые прежде освобождал только вид identification (К-22): держатся на форме — по словам
  for (const a of A.values()) {
    if (!inferredForms(a).length) continue;
    for (const f of a.facts) {
      if (f.idCert || f.idCertExempt || !formCertExempt(f)) continue;
      const rs = refsDeep(f.value);
      if (!rs.length || !restsOnFormLoose(a, rs)) continue;
      const ex = exemptOf(a, f);
      if (ex) (f.idCertExempt = ex), n.exempt++;
      else (f.idCert = { form: restsOnFormLoose(a, rs)!.id!, refs: [...new Set(rs)] }), n.facts++;
      touch(f, step);
    }
  }
  return { n, touched };
}

// ---------------------------------------------------------------- шаги

export const scopeOf = (ids: string[]) => ids.flatMap((id) => [`actor:${id}.`, `origin:${id}|`, `|${id}|`, `membership:${id}|`, `nodata:${id}|`, `relation:${id}|`, `chrono:${id}`]);

export const STEPS_V33: Step[] = [
  {
    id: 'D18-1',
    scope: [...new Set(SPELL_B.map((r) => `actor:${r.c}.`))],
    run: ({ base }) => {
      const A = actorsOf(base);
      let swap = 0;
      for (const row of SPELL_B) {
        const a = A.get(row.c);
        if (!a) throw new Error(`D18-1: нет карточки ${row.c}`);
        const f = formOf(a, row.f, 'D18-1');
        // при смене основного имени прежняя основная становится формой «выв.»: «другое написание» снимается и с неё
        const old = row.swap ? mainOf(a) : f;
        if (!row.swap && (f.cert !== 'scripture' || !/другое написание/.test(f.note ?? ''))) throw new Error(`D18-1: ${row.c} «${row.f}» — не форма «другого написания» уровня «Писание»`);
        delete f.note;
        delete old.note;
        if (row.swap) {
          delete f.cert;
          swap++;
        }
        makeInferred(a, row, 'D18-1');
        touch(a, 'D18-1');
      }
      for (const a of A.values()) for (const x of a.names) if (/другое написание/.test(x.note ?? '') && x.type !== 'main' && SPELL_B.some((r) => r.c === a.id)) throw new Error(`D18-1: у ${a.id} осталась «${x.form}» с прежним правилом`);
      return {
        what: `Д-18: формы «другого написания» (D15-8, правило 4.5) — по общим проверкам 02 § 3.3.4 [4.6]: стиха, где одно лицо названо обоими именами, нет ни у одной; вид (б) — форма «выв.» со стихами сравнения и кодами проверок — ${SPELL_B.length} форм у ${new Set(SPELL_B.map((r) => r.c)).size} карточек; основное имя по числу стихов текста сменилось у ${swap} (Мамре, Верия, Аммиэл, Иуй, Баладан, Молхия)`,
        why: '02 ред. 4.6 § 3.3.4 («другое написание само по себе уровня не даёт»), § 3.3.5; Р-1; В-33',
        refs: ['Быт 46:13', '1Пар 7:1', '1Пар 6:34', '1Цар 1:1'],
        actors: [...new Set(SPELL_B.map((r) => r.c.slice(2)))],
      };
    },
  },
  {
    id: 'D18-2',
    scope: [...scopeOf([SELLUM.from, SELLUM.id]), 'volume:', 'relation:'],
    run: ({ base, at }) => {
      const a = actorsOf(base).get(SELLUM.from)!;
      const f = formOf(a, 'Селлум', 'D18-2');
      delete f.note;
      delete f.cert;
      applySplit(base, SELLUM, 'D18-2', at);
      return {
        what: 'Д-18: «Селлум Кореянин» (1Пар 9:31) — вид (в): своя карточка и «возможно, то же лицо» с Шаллумом, сыном Коре (1Пар 9:19); ребро Маттафии — к новой карточке',
        why: '02 ред. 4.6 § 3.3.4: без общего родственника и места в перечне — вид (в)',
        refs: ['1Пар 9:31', '1Пар 9:19'],
        actors: [SELLUM.from, SELLUM.id].map((x) => x.slice(2)),
        other: ['relations', 'origins'],
      };
    },
  },
  {
    id: 'D15-19',
    scope: [...scopeOf([...HOUSES.flatMap((h) => [h.id, h.from, ...(h.also ?? [])]), 'p-meraiya', 'p-khananiya-neem12', 'p-meshullam-neem12-13', 'p-iokhanan-neem12', 'p-ionafan-neem12-14', 'p-iosif-neem12', 'p-adna-neem12', 'p-khelkiya-neem12-15', 'p-zakhariya-neem12', 'p-meshullam-neem12-16', 'p-zikhriy-neem12', 'p-piltay', 'p-shammuy-neem12', 'p-ionafan-neem12-18', 'p-mafnay', 'p-uzziy-neem12', 'p-kallay', 'p-ever-neem12', 'p-khashaviya-neem12', 'p-nafanail-neem12']), 'volume:', 'relation:'],
    run: ({ base, at }) => {
      const A = actorsOf(base);
      for (const h of HOUSES) if (A.has(h.id)) throw new Error(`D15-19: карточка ${h.id} уже есть`);
      for (const h of HOUSES) {
        const src = A.get(h.from)!;
        if (h.moveForm) {
          const f = formOf(src, h.form, 'D15-19');
          delete f.note;
        }
        applySplit(base, houseSplit(base, h), 'D15-19', at);
      }
      // рёбра «из дома X»: предок без названной степени, без тождества и без слов о главе Неем 12:1–7
      const houseIds = new Set(HOUSES.map((h) => h.id));
      let edges = 0;
      for (const o of base.origins) {
        if (!o.parent || !houseIds.has(o.parent)) continue;
        const h = HOUSES.find((x) => x.id === o.parent)!;
        if (o.kind !== 'ancestor') throw new Error(`D15-19: ребро ${o.child} ← ${o.parent} — не «предок»`);
        delete o.identity;
        o.note = `«из дома ${h.gen}» (${h.verse}): степень родства текст не называет`;
        touch(o, 'D15-19');
        edges++;
      }
      // заметки первых карточек о домах — по тексту, без «обычно понимают» и без «соответственно»
      const rewrite = (actor: string, id: string, text: string) => {
        const f = A.get(actor)!.facts.find((x) => fid(base, x) === id);
        if (!f) throw new Error(`D15-19: нет ${id} у ${actor}`);
        (f.value as { text: string }).text = text;
        touch(f, 'D15-19');
      };
      rewrite('p-rekhum-neem12', 'a-5677', 'В перечне домов во дни Иоакима (Неем 12:12–21) дома Рехума нет; на этом месте стоит «из дома Харима» (Неем 12:15). Тот ли это человек, текст не говорит');
      const ied = 'В перечне два разных Иедаии (Неем 12:6 и 12:7). Во дни Иоакима названы два дома Иедаии (Неем 12:19 и 12:21); какой дом — кого из них, текст не говорит';
      rewrite('p-iedaiya-neem12-6', 'a-5699', ied);
      rewrite('p-iedaiya-neem12-7', 'a-5708', ied);
      return {
        what: `Д15-2: перечень Неем 12:12–21 — дома, а не копия перечня Неем 12:1–7 (разные поколения: «во дни Иисуса», 12:7; «Во дни Иоакима», 12:12). Глава каждого дома — своя карточка по имени стиха (${HOUSES.length}); ${edges} рёбер «из дома X» — к ним, предок без названной степени, без тождества; формы «Мелиху», «Шевания», «Харим», «Мераиоф», «Гиннефон», «Миниамин», «Моадия», «Саллай» сняты с глав Неем 12:1–7; с ними — «возможно, то же лицо» уровня «вывод»`,
        why: 'решение координатора Д15-2 (очередь спорных мест); 02 ред. 4.6 § 3.3.4 (Р-2); В-33',
        refs: ['Неем 12:7', 'Неем 12:12', 'Неем 12:15', 'Неем 12:21'],
        actors: [...new Set(HOUSES.flatMap((h) => [h.id, h.from, ...(h.also ?? [])]))].map((x) => x.slice(2)),
        other: ['relations', 'origins'],
      };
    },
  },
  {
    id: 'D19-1',
    scope: ['actor:', 'origin:', 'membership:', 'nodata:', 'chrono:'],
    run: ({ base }) => {
      // a-12970 у Фаддея — «Не смешивать с Иудой Искариотом»: освобождена словами, idCert снимается (Д-19)
      const fad = actorsOf(base).get('p-faddey')!;
      const a12970 = fad.facts.find((f) => fid(base, f) === 'a-12970');
      if (!a12970?.idCert) throw new Error('D19-1: у a-12970 ожидался idCert');
      delete a12970.idCert;
      a12970.idCertExempt = 'not-same';
      touch(a12970, 'D19-1');
      const { n, touched } = autoIdCert(base, 'D19-1');
      return {
        what: `Д-18, Д-19: тождество по форме у записей, которые держатся на формах «выв.» (02 § 3.3.5): утверждений ${n.facts}, членств ${n.memberships}, «нет сведений» ${n.nodata}, рёбер ${n.origins}, входов времени ${n.inputs}; заметок, освобождённых явным полем idCertExempt, ${n.exempt + 1} (с a-12970: «Не смешивать» — без idCert); снято тождество по форме, ушедшей на карточку дома (Д15-2), — ${n.dangling}`,
        why: '02 ред. 4.6 § 3.3.5 («Какие заметки освобождены»; Р-6); Д-18, Д-19; К-22',
        refs: ['Лк 6:16', 'Неем 12:14'],
        actors: [...touched, 'p-faddey'].map((x) => x.slice(2)),
        other: ['origins', 'memberships', 'nodata', 'chrono'],
      };
    },
  },
  {
    id: 'D16-1',
    scope: Object.keys(DESCRIPTORS).map((id) => `actor:${id}.`),
    run: ({ base }) => {
      const A = actorsOf(base);
      const unnamed = [...A.values()].filter((a) => a.kind === 'unnamed').map((a) => a.id);
      const miss = unnamed.filter((id) => !DESCRIPTORS[id]);
      if (miss.length) throw new Error(`D16-1: нет подписи у ${miss.join(', ')}`);
      let renamed = 0;
      for (const [id, x] of Object.entries(DESCRIPTORS)) {
        const a = A.get(id);
        if (!a) throw new Error(`D16-1: нет карточки ${id}`);
        a.descriptor = structuredClone(x.d);
        const main = mainOf(a) ?? a.names[0];
        const form = x.form ?? cap(x.d.text);
        if (main.form !== form) {
          main.form = form;
          main.refs = [...x.d.refs];
          renamed++;
        }
        if (x.disambig) a.disambig = x.disambig;
        touch(a, 'D16-1');
      }
      return {
        what: `Д-16: подпись безымянного — поле descriptor со стихами (${Object.keys(DESCRIPTORS).length}); имя другого лица из соседнего стиха — nameFrom и уровень «выв.» (${Object.values(DESCRIPTORS).filter((x) => x.d.nameFrom).length}); основное имя сменилось по словам стиха у ${renamed} («Жена Лотова», «Блудница» — слова «мать» в Суд 11:1 нет)`,
        why: '02 ред. 4.6 § 3.2 («Подпись безымянного»; Р-7); К-20',
        refs: ['Быт 39:7', 'Быт 39:1', 'Быт 19:30', 'Быт 19:31', 'Суд 11:1'],
        actors: Object.keys(DESCRIPTORS).map((x) => x.slice(2)),
      };
    },
  },
  {
    id: 'D20-1',
    scope: ['anchors'],
    run: ({ base }) => {
      const list = base.anchors.anchors as any[];
      const seen = new Set<string>();
      base.anchors.anchors = list.map((a) => {
        const id = String(a.id).startsWith('an-') ? a.id : `an-${a.id}`;
        const p = ANCHORS[id];
        if (!p) throw new Error(`D20-1: нет правки опоры ${id}`);
        seen.add(id);
        const { value: _v, derived: _d, alternatives: _alt, ...rest } = a;
        const out: Anchor = { ...rest, ...structuredClone(p), works: p.works ?? rest.works, prov: { ...a.prov, ...by('D20-1') } };
        if (!out.works) delete out.works;
        return out;
      });
      const extra = Object.keys(ANCHORS).filter((k) => !seen.has(k));
      if (extra.length) throw new Error(`D20-1: опор нет в базе: ${extra.join(', ')}`);
      return {
        what: 'Д-20: опоры — вид (external 14, calc 7, tradition 1; 02 § 3.15.4 [4.6]); год — промежуток (у Тиверия — 26–29, оба способа счёта; у Кира и Неемии — год правления двумя числами); альтернативы — записи с трудом (у Ездры — Артаксеркс II, обязательно); готовые производные годы (derived) сняты; журнал log; падение Иерусалима — 587 по схеме по умолчанию, 586 (Тиле) — альтернатива',
        why: '02 ред. 4.6 § 3.15.4, § 3.10.2; 04 § 3.8; очередь П1-4; В-33',
        refs: ['Лк 3:1', 'Езд 7:7', '4Цар 25:8-9', 'Дан 1:1'],
        actors: [],
        other: ['anchors'],
      };
    },
  },
  {
    id: 'K21-1',
    scope: ['chrono:p-aaron'],
    run: ({ base }) => {
      const c = base.chrono.find((x) => x.actor === 'p-aaron')!;
      const t = ((c.chrono as { inputs: TimeInput[] }).inputs).find((x) => x.kind === 'years-after');
      if (!t || t.words !== 'сороковой') throw new Error('K21-1: у Аарона нет входа «в сороковой год»');
      t.count = 'ordinal';
      touch(c, 'K21-1');
      return {
        what: 'К-21: вид счёта у входа «N-й год после события»: «в сороковой год по исшествии» (Чис 33:38) — порядковый год (count: ordinal)',
        why: '02 ред. 4.6 § 3.15.5 (поле count); К-21',
        refs: ['Чис 33:38'],
        actors: ['aaron'],
        other: ['chrono'],
      };
    },
  },
  {
    id: 'P14-1',
    scope: ['epoch:era-church', 'epoch:era-divided', 'epoch:era-judah-alone', 'epoch:era-exile', 'epoch:era-christ', 'epoch:era-apostolic', 'epoch:church', 'epoch:divided', 'epoch:judah-alone', 'epoch:exile', 'epoch:christ', 'epoch:apostolic'],
    run: ({ base }) => {
      patchEpochs(base);
      return {
        what: 'П1-4: эпохи — «часто относят» без подсчёта → «некоторые относят» (16); годы опор словами в примечаниях границ — ссылкой на опору (9–11); «Первое пленение» — словами Дан 1 («Даниил уведён в Вавилон»); «Пятидесятница в год распятия» — со стихом Деян 1:3',
        why: 'reviews/сцены-пакет-1-второй-ключ.md, № 86–89; очередь П1-4; В-33',
        refs: ['Деян 1:3', 'Деян 2:1', 'Дан 1:1', 'Откр 22:18-19'],
        actors: [],
        other: ['epoch:era-church', 'epoch:era-divided', 'epoch:era-judah-alone', 'epoch:era-exile', 'epoch:era-christ', 'epoch:era-apostolic'],
      };
    },
  },
];
