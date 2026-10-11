/**
 * Шаги правки по второму ключу Д-15 партии 2 (reviews/Д-15-партия-2-второй-ключ.md; решения координатора 1–6). Отчёт —
 * reviews/Д-15-партия-2-отчёт.md, раздел «Правка по второму ключу». Шаги D15-5…D15-11 в коммите и не меняются; перед этими
 * шагами номера закрепляются (freezeIds).
 *
 * D15-13 Тёзки: «то же имя другим написанием» без общего родственника — своя карточка и «возможно, то же лицо» (Имер, Корей,
 *        Уззиил, Елисафан, Елицафан, Шуваил, Шавтай, Авиезер, Сивхай; решение 1). Раамия — кандидатов двое (№ 8).
 * D15-14 «Нер» (1Пар 8:33; 9:36, 39) — форма «выв.» с напряжением: отец или брат Киса (№ 3; решение 1).
 * D15-15 Иоханан из Неем 12:22–23 — своя карточка (№ 5): что отец — тот же Елияшив, держится на «предположительно».
 * D15-16 Остатки на карточках: Иехония и Иез 1:2 (№ 4), имена земель в местах Писания (№ 12), Идифун и Ефан, Иевосфей (№ 6),
 *        Мааха (№ 9), Симон (№ 11), цитаты и стихи (№ 13).
 * D15-17 Тексты соседних карточек после разделения (№ 5, 6; решение 4).
 * D15-18 Тождество по форме по букве 02 § 3.3.5 — «или не названо вовсе» (№ 7; решение 3): idCert и identity … inferred.
 */
import type { Step } from './corrections.ts';
import { issuerOf } from './ids.ts';
import type { Base } from './migrate.ts';
import { formCertExempt, inferredForms, restsOnFormLoose } from './name-forms.ts';
import type { Assertion, Origin, Ref } from './types.ts';
import {
  R as R0, type Rel, type Split, type FormB, P, N, O, actorsOf, applySplit, b, fid, formOf, ident, makeInferred, mainOf, maybe, note, refsDeep, status, touch,
} from './corrections-d15b.ts';

const R = {
  ...R0,
  // ---- тёзки (второй ключ партии 2, № 2, 8; решение координатора 1): то же имя другим написанием без общего родственника
  imer: { b: 'p-immer', refs: ['1Пар 24:14', '1Пар 9:12', 'Езд 2:37'], note: 'Глава шестнадцатой череды при Давиде — «шестнадцатый Имеру» (1Пар 24:14); Иммер — предок священников после плена: «сын Мешиллемифа, сын Иммера» (1Пар 9:12), «сыновей Иммера» (Езд 2:37). Общего родственника у них текст не называет: тот ли это человек или род, названный по нему, текст не говорит' },
  koreyK: { b: 'p-kore-syn-eviasafa', refs: ['1Пар 26:1', '1Пар 9:19'], note: '«Мешелемия, сын Корея» (1Пар 26:1) — «Шаллум, сын Коре, сын Евиасафа, сын Корея» (1Пар 9:19): в одном стихе названы и Коре, и Корей. Кандидатов два — Коре, сын Евиасафа, и Корей, сын Ицгара (Исх 6:21), родоначальник Кореян; чей сын Мешелемия, текст не говорит' },
  koreyI: { b: 'p-korey', refs: ['1Пар 26:1', 'Исх 6:21', '1Пар 9:19'], note: '«Мешелемия, сын Корея… из Кореян» (1Пар 26:1); «Сыны Ицгаровы: Корей и Нефег и Зихри» (Исх 6:21). Слово «сын» в перечне привратников может значить и «потомок»; тот ли это Корей, текст не говорит' },
  uzziil: { b: 'p-uziil', refs: ['1Пар 15:10', 'Исх 6:18', '1Пар 15:5'], note: '«из сыновей Уззииловых, Аминадава начальника» (1Пар 15:10) — в перечне родов левитов, где «сыновья Каафовы» названы отдельно (1Пар 15:5); Узиил — сын Каафа (Исх 6:18). Общего родственника текст не называет: тот ли это Узиил, текст не говорит' },
  elisafan: { b: 'p-elitsafan', refs: ['1Пар 15:8', 'Исх 6:22', 'Чис 3:30'], note: '«из сыновей Елисафановых, Шемаию начальника» (1Пар 15:8) — Елцафан, сын Узиила, «начальник… поколения родов Каафовых» (Чис 3:30; Исх 6:22). Имя близкое, общего родственника текст не называет: тот ли это Елцафан, текст не говорит' },
  elitsafan: { b: 'p-elitsafan', refs: ['2Пар 29:13', 'Исх 6:22', 'Чис 3:30'], note: '«из сыновей Елицафановых: Шимри и Иеиел» (2Пар 29:13) — при Езекии; Елцафан, сын Узиила (Исх 6:22; Чис 3:30). Общего родственника текст не называет: тот ли это Елцафан, текст не говорит' },
  shuvail: { b: 'p-shevuil-syn-girsama', refs: ['1Пар 24:20', '1Пар 23:16', '1Пар 26:24'], note: '«из сынов Амрама: Шуваил; из сынов Шуваила: Иедия» (1Пар 24:20) — «Шевуил, сын Гирсона, сына Моисеева» (1Пар 26:24; 23:16). Моисей — из сынов Амрама, но общего родственника у Шуваила и Шевуила текст не называет: тот ли это человек, текст не говорит' },
  shavtay: { b: 'p-shavfay-levit', refs: ['Неем 8:7', 'Езд 10:15', 'Неем 11:16'], note: '«Шавтай» среди левитов, пояснявших закон (Неем 8:7) — «Шавфай левит» (Езд 10:15; Неем 11:16). Время и служение одни, но ни родственника, ни параллельного перечня нет: что это один человек, текст не говорит' },
  aviezerA: { b: 'p-eviezer', refs: ['1Пар 27:12', '2Цар 23:27', '1Пар 11:28'], note: '«Авиезер Анафофянин, из сыновей Вениаминовых» — начальник девятого месяца (1Пар 27:12); «Евиезер Анафофянин» — в перечне храбрых (2Цар 23:27; 1Пар 11:28). Общее — прозвание; перечень начальников по месяцам (1Пар 27) не параллелен перечню храбрых: что это один человек, текст не говорит' },
  sivkhayS: { b: 'p-sovokhay', refs: ['1Пар 11:29', '2Цар 21:18', '1Пар 27:11'], note: '«Сивхай Хушатянин» в перечне храбрых (1Пар 11:29) — «Совохай Хушатянин», убивший Сафута (2Цар 21:18; 1Пар 20:4), начальник восьмого месяца (1Пар 27:11). Общее — прозвание; родственника или места в параллельном перечне нет: что это один человек, текст не говорит' },
  sivkhayM: { b: 'p-mebunnay', refs: ['1Пар 11:29', '2Цар 23:27'], note: 'Параллельные перечни храбрых: «Евиезер Анафофянин; Сивхай Хушатянин» (1Пар 11:28–29) — «Евиезер Анафофянин, Мебуннай Хушатянин» (2Цар 23:27). Место то же, прозвание то же; имена разные, и кандидат не один (Совохай Хушатянин, 2Цар 21:18): что это один человек, текст не говорит' },
  raamiyaR: { b: 'p-reelay', refs: ['Неем 7:7', 'Езд 2:2'], note: '«Сараием, Реелаем, Мардохеем» (Езд 2:2) — «Азариею, Раамиею, Нахманием, Мардохеем» (Неем 7:7): на месте Реелая в Неем 7:7 два имени, в Езд 2:2 имён одиннадцать, в Неем 7:7 — двенадцать. Кандидатов двое — Раамия и Нахманий: что Раамия — это Реелай, текст не говорит' },
  raamiyaN: { b: 'p-nakhmaniy', refs: ['Неем 7:7', 'Езд 2:2'], note: 'На месте Реелая (Езд 2:2) в Неем 7:7 два имени — «Раамиею, Нахманием»; кто из них отвечает Реелаю, текст не говорит' },
  iokhananE: { b: 'p-iokhanan-syn-eliashiva', refs: ['Неем 12:23', 'Езд 10:6'], note: 'То же имя и отец с тем же именем: «до дней Иоханана, сына Елиашивова» (Неем 12:23) — «в жилище Иоханана, сына Елияшивова» (Езд 10:6). Елияшивов в те годы несколько (Езд 10:24, 27, 36; Неем 3:1); тот ли это отец и тот ли сын, текст не говорит' },
} satisfies Record<string, Rel>;

/** Тёзки (D15-13). */
export const TEZKI: Split[] = [
  // ---- тёзки: то же имя другим написанием без общего родственника — своя карточка и «возможно, то же лицо» (второй ключ партии
  // 2, № 2; решение координатора 1); Раамия — кандидатов двое (№ 8)
  {
    from: 'p-immer', id: 'p-imer-1par24-14', sex: 'm', forms: ['Имер'], roles: ['priest'], addRefs: ['1Пар 24:19'],
    disambig: 'глава шестнадцатой череды священников при Давиде (1Пар 24:14)', srcDisambig: 'предок священников после плена (1Пар 9:12; Езд 2:37)',
    rewrite: { 'a-5320': { value: { kind: 'identification', text: 'Иммер, предок священника Маасая (1Пар 9:12) и Амашсая (Неем 11:13), «сыновья Иммера» после плена (Езд 2:37; 10:20) и Садок, сын Иммера (Неем 3:29), — одной карточкой по имени и священническому семейству. Глава шестнадцатой череды при Давиде — своей карточкой: «шестнадцатый Имеру» (1Пар 24:14)', refs: ['1Пар 9:12', 'Езд 2:37', 'Езд 10:20', 'Неем 3:29', 'Неем 11:13', '1Пар 24:14'] } } },
    facts: [ident(`Возможно, это тот же человек, что Иммер, предок священников после плена: так выходит, если сравнить 1Пар 24:14 и 1Пар 9:12. ${R.imer.note}`, R.imer.refs)],
    rels: [R.imer],
  },
  {
    from: 'p-kore-syn-eviasafa', id: 'p-korey-otets-meshelemii', sex: 'm', forms: ['Корей'],
    disambig: 'отец привратника Мешелемии, «из Кореян» (1Пар 26:1)',
    rewrite: {
      'a-5384': { cert: undefined, value: { text: 'Сын — Шаллум, главный привратник: «Шаллум, сын Коре» (1Пар 9:19)', refs: ['1Пар 9:17-19'] } },
      'a-5387': note(R.koreyK, 'Корей, отец Мешелемии', '1Пар 9:19', '1Пар 26:1'),
    },
    facts: [
      ident(`Возможно, это тот же человек, что Коре, сын Евиасафа: так выходит, если сравнить 1Пар 26:1 и 1Пар 9:19. ${R.koreyK.note}`, R.koreyK.refs),
      ident(`Возможно, это Корей, сын Ицгара: так выходит, если сравнить 1Пар 26:1 и Исх 6:21. ${R.koreyI.note}`, R.koreyI.refs),
    ],
    rels: [R.koreyK, R.koreyI],
  },
  {
    from: 'p-uziil', id: 'p-uzziil-1par15-10', sex: 'm', forms: ['Уззиил'],
    disambig: 'родоначальник «сыновей Уззииловых» при перенесении ковчега (1Пар 15:10)',
    facts: [ident(`Возможно, это тот же человек, что Узиил, сын Каафа: так выходит, если сравнить 1Пар 15:10 и Исх 6:18. ${R.uzziil.note}`, R.uzziil.refs)],
    rels: [R.uzziil],
  },
  {
    from: 'p-elitsafan', id: 'p-elisafan-1par15-8', sex: 'm', forms: ['Елисафан'],
    disambig: 'родоначальник «сыновей Елисафановых» при Давиде (1Пар 15:8)',
    facts: [ident(`Возможно, это тот же человек, что Елцафан, сын Узиила: так выходит, если сравнить 1Пар 15:8 и Чис 3:30. ${R.elisafan.note}`, R.elisafan.refs)],
    rels: [R.elisafan],
  },
  {
    from: 'p-elitsafan', id: 'p-elitsafan-2par29-13', sex: 'm', forms: ['Елицафан'],
    disambig: 'родоначальник «сыновей Елицафановых» при Езекии (2Пар 29:13)',
    facts: [ident(`Возможно, это тот же человек, что Елцафан, сын Узиила: так выходит, если сравнить 2Пар 29:13 и Чис 3:30. ${R.elitsafan.note}`, R.elitsafan.refs)],
    rels: [R.elitsafan],
  },
  {
    from: 'p-shevuil-syn-girsama', id: 'p-shuvail-1par24-20', sex: 'm', forms: ['Шуваил'],
    disambig: 'из сынов Амрама, отец Иедии (1Пар 24:20)',
    facts: [ident(`Возможно, это тот же человек, что Шевуил, сын Гирсона: так выходит, если сравнить 1Пар 24:20 и 1Пар 26:24. ${R.shuvail.note}`, R.shuvail.refs)],
    rels: [R.shuvail],
  },
  {
    from: 'p-shavfay-levit', id: 'p-shavtay-levit', sex: 'm', forms: ['Шавтай'], addRefs: ['Неем 8:8'],
    disambig: 'левит, пояснявший закон народу (Неем 8:7)',
    origins: [{ child: 'p-shavtay-levit', parent: 'p-leviy', role: 'father', kind: 'ancestor', degree: 'unstated', refs: ['Неем 8:7'], cert: 'scripture', primary: false, note: '«и левиты поясняли народу закон»' } as Omit<Origin, 'prov'>],
    rewrite: { 'a-15358': note(R.shavtay, 'Шавтай из Неем 8:7', 'Езд 10:15', 'Неем 8:7') },
    facts: [ident(`Возможно, это тот же человек, что Шавфай левит: так выходит, если сравнить Неем 8:7 и Езд 10:15. ${R.shavtay.note}`, R.shavtay.refs)],
    rels: [R.shavtay],
  },
  {
    from: 'p-eviezer', id: 'p-aviezer-1par27-12', sex: 'm', forms: ['Авиезер'], roles: ['commander'],
    disambig: 'Анафофянин, из сыновей Вениаминовых, начальник девятого месяца (1Пар 27:12)', srcDisambig: 'Анафофянин, из тридцати храбрых Давида',
    facts: [{ sec: 7, field: 'lineage', value: { text: 'Анафофянин', refs: ['1Пар 27:12'] } } as Assertion, ident(`Возможно, это тот же человек, что Евиезер Анафофянин из храбрых Давида: так выходит, если сравнить 1Пар 27:12 и 2Цар 23:27. ${R.aviezerA.note}`, R.aviezerA.refs)],
    rewrite: {
      'a-14549': { value: { text: 'Анафофянин', refs: ['2Цар 23:27', '1Пар 11:28'] } },
      'a-14553': { value: { kind: 'identification', text: `${maybe('Авиезер Анафофянин, начальник девятого месяца', '2Цар 23:27', '1Пар 27:12', R.aviezerA.note, []).value.text}. Не смешивать с Авиезером, сыном Галаада (Нав 17:2)`, refs: [...R.aviezerA.refs, 'Нав 17:2'] } },
    },
    rels: [R.aviezerA],
  },
  {
    from: 'p-sovokhay', id: 'p-sivkhay-khushatyanin', sex: 'm', forms: ['Сивхай'], addRefs: ['1Пар 11:26'],
    disambig: 'Хушатянин, из храбрых Давида (1Пар 11:29)',
    rewrite: {
      'a-14563': note(R.sivkhayS, 'Сивхай Хушатянин из перечня храбрых', '2Цар 21:18', '1Пар 11:29'),
      'a-14559': { value: { text: 'Хушатянин, из племени Зары', refs: ['2Цар 21:18', '1Пар 20:4', '1Пар 27:11'] } },
    },
    facts: [
      { sec: 7, field: 'lineage', value: { text: 'Хушатянин', refs: ['1Пар 11:29'] } } as Assertion,
      ident(`Возможно, это тот же человек, что Совохай Хушатянин: так выходит, если сравнить 1Пар 11:29 и 2Цар 21:18. ${R.sivkhayS.note}`, R.sivkhayS.refs),
      ident(`Возможно, это тот же человек, что Мебуннай Хушатянин: так выходит, если сравнить 1Пар 11:29 и 2Цар 23:27. ${R.sivkhayM.note}`, R.sivkhayM.refs),
    ],
    rels: [R.sivkhayS, R.sivkhayM],
  },
  {
    from: 'p-reelay', id: 'p-raamiya', sex: 'm', forms: ['Раамия'],
    disambig: 'пришедший с Зоровавелем (Неем 7:7)',
    rewrite: {
      'a-15392': { value: { text: 'Один из вождей, с которыми вернулись из плена «сыны страны»', refs: ['Езд 2:1-2'] } },
      'a-15393': { value: { id: 'p-zorovavel', refs: ['Езд 2:2'], text: 'вернулся из плена вместе с ним' } },
      'a-15394': { value: { id: 'p-iisus-syn-iosedeka', refs: ['Езд 2:2'], text: 'вернулся из плена вместе с ним' } },
    },
    facts: [
      status('Из пришедших с Зоровавелем: «Азариею, Раамиею, Нахманием, Мардохеем»', ['Неем 7:7']),
      ident(`Возможно, это тот же человек, что Реелай: так выходит, если сравнить Неем 7:7 и Езд 2:2. ${R.raamiyaR.note}`, R.raamiyaR.refs),
    ],
    rels: [R.raamiyaR, R.raamiyaN],
  },
];

const NEIGHBOURS: { card: string; disambig?: string; facts?: Record<string, Record<string, unknown>> }[] = [
  { card: 'p-salmon', facts: {
    'a-3140': { text: 'От Рахавы родил Вооза: «Салмон родил Вооза от Рахавы»', refs: ['Мф 1:5'] },
    'a-3144': { kind: 'identification', text: 'Рахава (Мф 1:5) — возможно, та же Раав, блудница из Иерихона (Нав 2:1; 6:24): так выходит, если сравнить Мф 1:5 и Нав 2:1; текст этого не говорит (см. Рахаву)', refs: ['Мф 1:5', 'Нав 2:1', 'Нав 6:24'] },
  } },
  { card: 'p-vooz', facts: {
    'a-3213': { kind: 'chronology', text: 'Между Салмоном (Мф 1:5) и Давидом родословия Руф 4:20–22 и Мф 1:5 называют лишь четыре имени — Салмон, Вооз, Овид, Иессей. Если мать Вооза Рахава — та же Раав из Иерихона (это не сказано), эти имена покрывают время от взятия Иерихона до рождения Давида, и родословие может опускать поколения. Где пропуск, текст не говорит', refs: ['Руф 4:20-22', 'Мф 1:5'] },
  } },
  { card: 'p-iokhanan-syn-eliashiva', facts: {
    'a-15535': { kind: 'identification', text: 'Какой Елияшив назван его отцом, текст не уточняет: в те годы Елияшивов несколько (Неем 3:1; Езд 10:24, 27, 36). Иоханан, «сын Елиашивов», из перечня дней первосвященников (Неем 12:22–23) — своей карточкой; тот ли это человек, текст не говорит', refs: ['Езд 10:6', 'Неем 3:1', 'Езд 10:24', 'Неем 12:22-23'] },
  } },
  { card: 'p-ionafan-syn-sammy', disambig: 'сын Сафая, брата Давидова (2Цар 21:21)' },
  { card: 'p-ionadav-syn-sammy', disambig: 'сын Самая, брата Давидова (2Цар 13:3)' },
  { card: 'p-kharmiy-syn-zimri', disambig: 'сын Завдия (Нав 7:1)' },
  { card: 'p-maaseya-otets-tsefanii', disambig: 'отец священника Софонии (Иер 21:1)' },
  { card: 'p-ionafan-dyadya-davida', facts: {
    'a-14479': { kind: 'identification', text: 'Писание называет его «дядей Давидовым», не называя его отца. Отождествление с Ионафаном, сыном Сафая, брата Давидова, то есть племянником Давида (2Цар 21:21), — лишь предположение', refs: ['1Пар 27:32', '2Цар 21:21'] },
  } },
  { card: 'p-samus-syn-davida', facts: {
    'a-8221': { kind: 'identification', text: 'Не смешивать с Шимой, братом Давида (1Пар 20:7), и с Саммой, сыном Иессея (1Пар 2:13)', refs: ['1Пар 20:7', '1Пар 2:13'] },
  } },
  { card: 'p-ionafan-syn-shage', facts: {
    'a-14628': { kind: 'identification', text: 'Не смешивать с Ионафаном, сыном Саула, и с Ионафаном, сыном Сафая, брата Давидова (2Цар 21:21)', refs: ['2Цар 21:21'] },
  } },
  { card: 'p-famar-doch-avessaloma', facts: {
    'a-8294': { kind: 'identification', text: 'Мать Авии названа по-разному: «Мааха, дочь Авессалома» (3Цар 15:2) и «Михаия, дочь Уриилова, из Гивы» (2Пар 13:2). Одна ли это женщина и кем она приходится Фамари, текст не говорит', refs: ['3Цар 15:2', '2Пар 11:20', '2Пар 13:2'] },
  } },
  { card: 'p-ioakhaz-syn-iosii', facts: {
    'a-9454': { kind: 'textual', text: 'В Синодальном тексте 1Пар 3:15 Иоахаз назван первенцем Иосии, а четвёртым — Селлум (своя карточка). «О Саллуме, сыне Иосии» (Иер 22:11) — возможно, тот же Иоахаз (см. Селлума)', refs: ['1Пар 3:15', 'Иер 22:11'] },
  } },
  // скрипт по формам разведённых пар (второй ключ партии 2, № 6): ещё тексты, где пара названа одним лицом
  { card: 'p-isav', facts: {
    'a-1761': { text: 'В родословии Быт 36 названы жёны: Ада, дочь Елона Хеттеянина; Оливема, дочь Аны, сына Цивеона Евеянина; Васемафа, дочь Измаила, сестра Наваиофа. Те ли это женщины, что в Быт 26:34 и 28:9, текст не говорит (см. § 24)', refs: ['Быт 36:2-3'] },
    'a-1762': { text: 'Пять сыновей, родившихся ему в земле Ханаанской: от Ады — Елифаз, первенец; от Васемафы — Рагуил; от Оливемы — Иеус, Иеглом и Корей', refs: ['Быт 36:4-5', 'Быт 36:15', '1Пар 1:35'] },
    'a-1805': { kind: 'identification', text: 'Жёны Исава в двух перечнях названы по-разному. Быт 26:34 и 28:9: Иегудифа, дочь Беэра Хеттеянина; Васемафа, дочь Елона Хеттеянина; Махалафа, дочь Измаила, сестра Наваиофа. Быт 36:2–3: Ада, дочь Елона Хеттеянина; Оливема, дочь Аны, сына Цивеона; Васемафа, дочь Измаила, сестра Наваиофа. Совпадают отцы, но не имена: в данных это разные карточки, связанные «возможно, то же лицо» (Ада и Васемафа, дочь Елона; Махалафа и Васемафа, дочь Измаила). Иегудифа и Оливема — разные имена и разные отцы. Причину расхождения имён Писание не объясняет', refs: ['Быт 26:34', 'Быт 28:9', 'Быт 36:2-3', 'Быт 36:15'] },
  } },
  { card: 'p-elon-khetteyanin', facts: {
    'a-1822': { text: 'Дочери-жёны Исава: Васемафа (Быт 26:34) и Ада (Быт 36:2) — своими карточками; одна ли это дочь, текст не говорит', refs: ['Быт 26:34', 'Быт 36:2'] },
  } },
  { card: 'p-izmail', facts: {
    'a-1282': { text: 'Дочь Махалафу, «сестру Наваиофову», взял в жёны Исав (Быт 28:9); дочь Васемафу, «сестру Наваиофа», — тоже жена Исава (Быт 36:3); одна ли это дочь, текст не говорит', refs: ['Быт 28:9', 'Быт 36:3'] },
  } },
  { card: 'p-navayof', facts: {
    'a-1309': { text: 'Брат дочерей Измаила, жён Исава: «Махалафу… сестру Наваиофову» (Быт 28:9); «Васемафу, дочь Измаила, сестру Наваиофа» (Быт 36:3)', refs: ['Быт 28:9', 'Быт 36:3'] },
  } },
  { card: 'p-uriil-iz-givy', facts: {
    'a-8669': { kind: 'identification', text: 'Мать царя Авии в 3Цар 15:2 и 2Пар 11:20–22 — Мааха, дочь Авессалома, в 2Пар 13:2 — Михаия, дочь Уриила из Гивы: две матери по разным местам — набор прочтений r-mother-aviya; одна ли это женщина, текст не говорит', refs: ['3Цар 15:2', '2Пар 11:20', '2Пар 13:2'] },
  } },
  { card: 'p-aviya', facts: {
    'a-8726': { kind: 'textual', text: 'Мать Авии названа в 3Цар 15:2 «Мааха, дочь Авессалома», в 2Пар 13:2 — «Михаия, дочь Уриилова, из Гивы»: набор прочтений r-mother-aviya (см. карточки Маахи и Михаии)', refs: ['3Цар 15:2', '2Пар 13:2'] },
  } },
  { card: 'p-iosiya', facts: {
    'a-9418': { kind: 'textual', text: 'Сыновья в Синодальном тексте 1Пар 3:15: «первенец Иоахаз… четвертый Селлум»; Селлум — отдельное лицо. «О Саллуме, сыне Иосии» (Иер 22:11) — на карточке Селлума; возможно, это царь Иоахаз, но текст этого не говорит', refs: ['1Пар 3:15', 'Иер 22:11'] },
  } },
  { card: 'p-iedaiya-syn-ioiariva', facts: {
    'a-15324': { kind: 'identification', text: '«Иедаия, сын Иоиарива» (Неем 11:10) — сын Иоиарива времени возвращения (1Пар 9:10); тот ли это Иегоиарив, глава первой череды (1Пар 24:7), или род, названный по нему, текст не говорит', refs: ['Неем 11:10', '1Пар 9:10', '1Пар 24:7'] },
  } },
  { card: 'p-shupim-syn-ira', disambig: 'сын Ира, из колена Вениаминова (1Пар 7:12)', facts: {
    'a-6415': { kind: 'identification', text: '«Шупим и Хупим, сыновья Ира» (1Пар 7:12); Ир — своя карточка; возможно, это Ири, сын Белы (1Пар 7:7), но текст этого не говорит', refs: ['1Пар 7:12', '1Пар 7:7'] },
  } },
  { card: 'p-khupim-syn-ira', disambig: 'сын Ира, из колена Вениаминова (1Пар 7:12)', facts: {
    'a-6420': { kind: 'identification', text: '«Шупим и Хупим, сыновья Ира» (1Пар 7:12); Ир — своя карточка; возможно, это Ири, сын Белы (1Пар 7:7), но текст этого не говорит', refs: ['1Пар 7:12', '1Пар 7:7'] },
  } },
  { card: 'p-saul', facts: {
    'a-6830': { kind: 'textual', text: 'Перечни сыновей Саула различаются: 1Цар 14:49 — Ионафан, Иессуи, Мелхисуа; 1Цар 31:2 — Ионафан, Аминадав, Малхисуа; 1Пар 8:33 — Ионафан, Мелхисуй, Авинадав, Ешбаал; царствовал после Саула Иевосфей (2Цар 2:8)', refs: ['1Цар 14:49', '1Цар 31:2', '1Пар 8:33', '2Цар 2:8'] },
  } },
];

// ---------------------------------------------------------------- D15-14 … D15-16

const NIR_ROW: FormB = b('p-nir', 'Нер', ['1Цар 14:50', '1Цар 14:51'], [P, N, O], 'один узел — отец Авенира и брат Киса: «Авенир, сын Нира» (1Цар 14:50), «Кис, отец Саулов, и Нир, отец Авенира, были сыновьями Авиила» (1Цар 14:51) — «Кис, Ваал, Нер» среди сыновей Иеила (1Пар 9:36). Напряжение: по 1Пар 8:33 и 9:39 «Нер родил Киса» — Нер отец Киса, а не брат; два отца Киса по разным местам — набор прочтений r-father-kis-nir; проверка «нет противоречия» не выполнена');

const IOKH = 'p-iokhanan-syn-eliashiva';
const IOKH12 = 'p-iokhanan-neem12-22';
const IONAFAN = 'p-ionafan-syn-ioiady';

/** Новые тексты связей и заметок (№ 9, 13). */
const MIKHAIYA_NOTE = 'Сын тот же — Авия, отец другой: «имя матери его Михаия, дочь Уриилова, из Гивы» (2Пар 13:2) — «имя матери его Мааха, дочь Авессалома» (3Цар 15:2; 2Пар 11:20). Тем же словом и с тем же отцом названа мать Асы, сына Авии: «имя матери его Ана, дочь Авессалома» (3Цар 15:2, 8, 10); кто она Асе, текст не поясняет. Одно ли это лицо, текст не говорит; две матери Авии по разным местам — набор прочтений r-mother-aviya';
const KHELETS: Rel = { ...R0.khelets, refs: [...R0.khelets.refs, '2Цар 23:26'] };
const AKHIRAM: Rel = {
  ...R0.akhiram, refs: ['Быт 46:21', 'Чис 26:38', '1Пар 8:1', '1Пар 8:2', '1Пар 7:6'],
  note: R0.akhiram.note
    .replace('в 1Пар 8:1–2 — пять других («Белу… Ашбела… Ахраха… Ноху… Рафу»)', 'в 1Пар 8:1–2 — пять других: «Белу, первенца своего, второго Ашбела, третьего Ахрая» (1Пар 8:1), «четвертого Ноху и пятого Рафу» (1Пар 8:2)')
    .replace('Бехеру или Ахраху', 'Бехеру или Ахраю'),
};

/** Утверждение по номеру: ровно одно. */
const factById = (base: Base, card: string, id: string, step: string) => {
  const a = actorsOf(base).get(card);
  const f = a?.facts.find((x) => fid(base, x) === id);
  if (!a || !f) throw new Error(`${step}: нет ${id} у ${card}`);
  return { a, f };
};
const setFact = (base: Base, card: string, id: string, value: Record<string, unknown>, step: string, cert?: Assertion['cert'] | null) => {
  const { f } = factById(base, card, id, step);
  f.value = structuredClone(value);
  if (cert === null) delete f.cert;
  else if (cert) f.cert = cert;
  touch(f, step);
};
const rel = (base: Base, a: string, b2: string) => {
  const r = base.relations.find((x) => x.a === a && x.b === b2 && x.kind === 'possibly-same');
  if (!r) throw new Error(`нет связи ${a} ~ ${b2}`);
  return r;
};
const retireFact = (base: Base, card: string, id: string, to: string, reason: string, refs: Ref[], at: string, step: string) => {
  const { a, f } = factById(base, card, id, step);
  a.facts = a.facts.filter((x) => x !== f);
  issuerOf(base)?.retire(id);
  base.redirects.push({ from: id, to: [to], reason, refs, at });
};

const scopeOf = (ids: string[]) => ids.flatMap((id) => [`actor:${id}.`, `origin:${id}|`, `|${id}|`, `membership:${id}|`, `nodata:${id}|`, `relation:${id}|`]);
const tezkiScope = [...scopeOf(TEZKI.flatMap((s) => [s.from, s.id, ...s.rels.map((r) => r.b)])), 'volume:', 'union:'];
const NATIONS = ['p-iavan', 'p-fuval', 'p-meshekh-syn-iafeta', 'p-khush-syn-khama', 'p-raama', 'p-nimrod', 'p-navayof', 'p-kedar'];
const NATION_VERSES: Record<string, Ref[]> = {
  'p-iavan': ['Ис 66:19'], 'p-fuval': ['Ис 66:19'], 'p-meshekh-syn-iafeta': ['Пс 119:5'], 'p-khush-syn-khama': ['Ис 11:11'],
  'p-raama': ['Иез 27:22'], 'p-nimrod': ['Мих 5:6'], 'p-navayof': ['Ис 60:7'], 'p-kedar': ['Ис 21:16', 'Ис 21:17', 'Иер 49:28'],
};

export const STEPS_D15C: Step[] = [
  {
    id: 'D15-13',
    scope: tezkiScope,
    run: ({ base, at }) => {
      for (const s of TEZKI) applySplit(base, s, 'D15-13', at);
      return {
        what: `Д-15, второй ключ партии 2: «то же имя другим написанием» без общего родственника — тёзки: свои карточки и «возможно, то же лицо» уровня «вывод» (${TEZKI.length}: Имер, Корей, Уззиил, Елисафан, Елицафан, Шуваил, Шавтай, Авиезер, Сивхай; Раамия — кандидатов двое)`,
        why: '02 § 3.3.4 («один возможный тёзка»); второй ключ Д-15 партии 2, № 2, 8; решение координатора 1',
        refs: ['1Пар 24:14', '1Пар 26:1', '1Пар 15:10', '1Пар 15:8', '2Пар 29:13', '1Пар 24:20', 'Неем 8:7', '1Пар 27:12', '1Пар 11:29', 'Неем 7:7'],
        actors: [...new Set(TEZKI.flatMap((s) => [s.from, s.id]).map((x) => x.slice(2)))],
        other: ['relations', 'origins'],
      };
    },
  },
  {
    id: 'D15-14',
    scope: ['actor:p-nir.'],
    run: ({ base, actor }) => {
      const a = actor('p-nir');
      makeInferred(a, NIR_ROW, 'D15-14');
      delete formOf(a, 'Нер', 'D15-14').note;
      setFact(base, 'p-nir', 'a-6654', { kind: 'identification', text: 'Нер (1Пар 8:33; 9:36, 39) — форма «выв.» карточки Нира: «Кис, Ваал, Нер» среди сыновей Иеила (1Пар 9:36) — «Кис… и Нир… были сыновьями Авиила» (1Цар 14:51), отец Авенира назван Ниром и в 1Пар 26:28. Но по 1Пар 8:33 и 9:39 «Нер родил Киса»: отец или брат Киса — напряжение текста, два отца Киса — набор прочтений r-father-kis-nir', refs: ['1Цар 14:51', '1Пар 9:36', '1Пар 8:33', '1Пар 26:28'] }, 'D15-14');
      touch(a, 'D15-14');
      return {
        what: 'Д-15, второй ключ партии 2: «Нер» — не другое написание «Писание», а форма «выв.» с напряжением: по 1Пар 8:33; 9:39 Нер — отец Киса, по 1Цар 14:51 Нир — брат Киса; основание без ссылки на еврейский текст',
        why: '02 § 3.3.4 (проверка 4); второй ключ Д-15 партии 2, № 3; решение координатора 1',
        refs: ['1Пар 8:33', '1Пар 9:36', '1Цар 14:51'],
        actors: ['nir'],
      };
    },
  },
  {
    id: 'D15-15',
    scope: [...scopeOf([IOKH, IOKH12, IONAFAN]), 'volume:', 'redirect:ar-34'],
    run: ({ base, at }) => {
      const A = actorsOf(base);
      const src = A.get(IOKH)!;
      const m = mainOf(src);
      m.refs = m.refs.filter((r) => r !== 'Неем 12:22' && r !== 'Неем 12:23');
      const vol = base.volumes.find((v) => v.actors.includes(src))!;
      const dst = {
        id: IOKH12, kind: 'human', sex: 'm', names: [{ form: 'Иоханан', type: 'main', refs: ['Неем 12:22', 'Неем 12:23'] }],
        disambig: 'сын Елиашива, в перечне дней первосвященников (Неем 12:22–23)', roles: ['priest'], prominence: 1, facts: [] as Assertion[],
        prov: { by: 'исправление D15-15', status: 'draft' },
      } as unknown as (typeof vol.actors)[number];
      vol.actors.splice(vol.actors.indexOf(src) + 1, 0, dst);
      // записи о Неем 12:22–23 — к новой карточке (номера прежние)
      for (const id of ['a-16352', 'a-16353']) {
        const f = src.facts.find((x) => fid(base, x) === id);
        if (!f) throw new Error(`D15-15: нет ${id}`);
        src.facts = src.facts.filter((x) => x !== f);
        dst.facts.push(touch(f, 'D15-15'));
      }
      const n53 = dst.facts.find((x) => fid(base, x) === 'a-16353')!;
      n53.value = ident(`Возможно, это тот же человек, что Ионафан, сын Иоиады: так выходит, если сравнить Неем 12:22 и Неем 12:11. ${R.iokhanan.note}`, R.iokhanan.refs).value;
      dst.facts.push({ ...ident(`Возможно, это тот же человек, что Иоханан, сын Елияшива, в жилище которого пришёл Ездра: так выходит, если сравнить Неем 12:23 и Езд 10:6. ${R.iokhananE.note}`, R.iokhananE.refs), prov: { by: 'исправление D15-15' } });
      dst.facts.push({ sec: 23, field: 'scripture', value: { first: 'Неем 12:22', key: ['Неем 12:22', 'Неем 12:23'] }, prov: { by: 'исправление D15-15' } } as Assertion);
      dst.facts.sort((x, y) => x.sec - y.sec);
      const sk = src.facts.find((x) => x.field === 'scripture');
      if (sk) {
        const v = sk.value as { first?: string; key?: Ref[] };
        sk.value = { first: v.first, ...(v.key && { key: v.key.filter((r) => !/^Неем 12:2[23]/.test(r)) }) };
        if (!(sk.value as { key?: Ref[] }).key?.length) delete (sk.value as { key?: Ref[] }).key;
        touch(sk, 'D15-15');
      }
      for (const x of base.nodata) if (x.actor === IOKH && x.read?.some((r) => /^Неем 12:2[23]/.test(r))) (x.read = x.read.filter((r) => !/^Неем 12:2[23]/.test(r))), touch(x, 'D15-15');
      // ребро «сына Елиашивова» (Неем 12:23): какой Елиашив — «предположительно», как в Езд 10:6
      base.origins.push({
        child: IOKH12, parent: 'p-eliashiv-pervosvyashchennik', role: 'father', kind: 'natural', refs: ['Неем 12:23'], cert: 'scripture', primary: true,
        identity: { of: 'parent', degree: 'possible', note: '«до дней Иоханана, сына Елиашивова» (Неем 12:23) — сказано; что это первосвященник Елиашив (Неем 12:10, 22), текст прямо не говорит', refs: ['Неем 12:23', 'Неем 12:10', 'Неем 12:22'] },
        prov: { by: 'исправление D15-15' },
      } as Origin);
      // связь Иоханан (Езд 10:6) ~ Ионафан — снята: «возможно, то же лицо» с Ионафаном — у Иоханана из Неем 12
      const old = rel(base, IOKH, IONAFAN);
      base.relations = base.relations.filter((x) => x !== old);
      const oid = (old as { id?: string }).id;
      if (oid && !oid.startsWith('?')) {
        issuerOf(base)?.retire(oid);
        base.redirects.push({ from: oid, to: [IOKH12], reason: 'Иоханан из Неем 12:22–23 — своя карточка (второй ключ Д-15 партии 2, № 5): «возможно, то же лицо» с Ионафаном — у неё', refs: ['Неем 12:22', 'Неем 12:11'], at });
      }
      for (const r of [R.iokhanan, R.iokhananE]) base.relations.push({ a: IOKH12, b: r.b, kind: 'possibly-same', refs: r.refs, cert: 'inference', note: r.note, prov: { by: 'исправление D15-15', status: 'draft' } });
      setFact(base, IONAFAN, 'a-4906', note(R.iokhanan, 'Иоханан из Неем 12:22–23', 'Неем 12:11', 'Неем 12:22').value, 'D15-15');
      setFact(base, IONAFAN, 'a-4907', { kind: 'identification', text: 'Иоханан из Неем 12:22–23 и Иоханан, сын Елияшива (Езд 10:6), — своими карточками; что это один человек, текст не говорит', refs: ['Езд 10:6', 'Неем 12:23'] }, 'D15-15');
      touch(src, 'D15-15');
      return {
        what: 'Д-15, второй ключ партии 2: Иоханан из Неем 12:22–23 — своя карточка p-iokhanan-neem12-22 (не форма Иоханана из Езд 10:6): что отец — тот же Елияшив, держится на «предположительно»; «возможно, то же лицо» — с Иохананом (Езд 10:6) и с Ионафаном, сыном Иоиады; записи a-16352, a-16353 — к ней',
        why: '02 § 3.3.4 («один возможный тёзка»); второй ключ Д-15 партии 2, № 5',
        refs: ['Неем 12:22', 'Неем 12:23', 'Езд 10:6', 'Неем 12:11'],
        actors: ['iokhanan-syn-eliashiva', 'iokhanan-neem12-22', 'ionafan-syn-ioiady'],
        other: ['relations', 'origins', 'redirects'],
      };
    },
  },
  {
    id: 'D15-16',
    scope: [...scopeOf(['p-raguil', 'p-iofor', 'p-akhan', 'p-iekhoniya', 'p-idifun', 'p-efan-syn-kishiya', 'p-ievosfey', 'p-maakha-doch-avessaloma', 'p-mikhaiya-doch-uriila', 'p-simon-zilot', 'p-samma-syn-iesseya', 'p-kherets', 'p-khelets-pelonityanin', 'p-ekhi', 'p-akhiram-syn-veniamina', ...NATIONS]), 'redirect:a-9572', 'redirect:a-9590'],
    run: ({ base, at }) => {
      const S = 'D15-16';
      // № 4: Иез 1:2 — упоминание с кандидатами; a-9572 и a-9590 отдавали его Иехонии как факт — выбывают
      const why4 = 'Иез 1:2 — упоминание с кандидатами (Иехония или его отец Иоаким), а не сведение об Иехонии: см. заметку карточки (второй ключ Д-15 партии 2, № 4)';
      retireFact(base, 'p-iekhoniya', 'a-9572', 'p-iekhoniya', why4, ['Иез 1:2'], at, S);
      retireFact(base, 'p-iekhoniya', 'a-9590', 'p-iekhoniya', why4, ['Иез 1:2'], at, S);
      setFact(base, 'p-iekhoniya', 'a-9594', { kind: 'textual', text: 'В Иер 52:31 Синодальный текст называет его «Иоакимом», как и отца; в остальных местах — Иехония', refs: ['Иер 52:31'] }, S);
      for (const x of base.nodata) if (x.actor === 'p-iekhoniya' && x.read?.includes('Иез 1:2')) (x.read = x.read.filter((r) => r !== 'Иез 1:2')), touch(x, S);
      // № 12: имена земель — не в местах Писания лица; «землю Немврода» — понимание
      const A = actorsOf(base);
      for (const id of NATIONS) {
        const a = A.get(id)!;
        const nv = NATION_VERSES[id];
        for (const f of a.facts) {
          if (f.field === 'scripture') {
            const v = f.value as { first?: string; key?: Ref[] };
            if (v.key?.some((r) => nv.includes(r))) (v.key = v.key.filter((r) => !nv.includes(r))), touch(f, S);
          } else if (f.field === 'laterMentions' && refsDeep(f.value).some((r) => nv.some((n) => r.startsWith(n.split(':')[0])))) {
            if (refsDeep(f.value).every((r) => /^(Мих 5|Ис 66:19|Ис 11:11|Иез 27:22|Ис 60:7|Ис 21:1[67]|Иер 49:28|Пс 119:5)/.test(r)) && f.cert !== 'interpretation') (f.cert = 'interpretation'), touch(f, S);
          }
        }
      }
      // № 6: Идифун — родословие Ефана к карточке Ефана; уточнение и подлинник без Ефана
      const idf = A.get('p-idifun')!;
      const efan = A.get('p-efan-syn-kishiya')!;
      const lin = idf.facts.find((x) => fid(base, x) === 'a-5120');
      if (!lin) throw new Error('D15-16: нет a-5120');
      idf.facts = idf.facts.filter((x) => x !== lin);
      efan.facts.push(touch(lin, S));
      efan.facts.sort((x, y) => x.sec - y.sec);
      idf.disambig = 'начальник певцов при Давиде (1Пар 16:41; 25:1)';
      setFact(base, 'p-idifun', 'a-5116', { lang: 'he', script: 'יְדוּתוּן', translit: 'Yedutun' }, S);
      touch(idf, S);
      touch(efan, S);
      setFact(base, 'p-ievosfey', 'a-6884', { text: '«муж стыда»' }, S);
      // ссылка на еврейское слово (стоп-лист 02 § 7) — без неё: созвучие видно по словам стихов
      setFact(base, 'p-akhan', 'a-3040', { text: 'Форма «Ахар» созвучна словам о беде: «Ахар, наведший беду на Израиля» (1Пар 2:7); «за то, что ты навел на нас беду» (Нав 7:25); долина Ахор (Нав 7:26)', refs: ['1Пар 2:7', 'Нав 7:25-26'] }, S);
      // № 9: Мааха — без толкования «мать шире, чем родила»
      setFact(base, 'p-maakha-doch-avessaloma', 'a-8682', maybe('Михаия, дочь Уриила, мать Авии', '3Цар 15:2', '2Пар 13:2', MIKHAIYA_NOTE, R0.mikhaiya.refs).value, S);
      const rm = rel(base, 'p-mikhaiya-doch-uriila', 'p-maakha-doch-avessaloma');
      rm.note = MIKHAIYA_NOTE;
      touch(rm, S);
      // № 11: уточнение Симона — по стороне основной формы
      A.get('p-simon-zilot')!.disambig = 'апостол, Кананит (Мф 10:4)';
      touch(A.get('p-simon-zilot')!, S);
      // № 13: цитаты по стиху и стих цитаты в ссылках
      setFact(base, 'p-samma-syn-iesseya', 'a-3377', { kind: 'identification', text: 'Самай (2Цар 13:3, 32) и Сафай (2Цар 21:21; в 1Пар 20:7 — Шима), «брата Давидова», — своими карточками: возможно, кто-то из них — Самма, но текст этого не говорит; у Иессея был ещё один сын, имя которого не названо (1Цар 16:10–11; 1Пар 2:13–15)', refs: ['2Цар 13:3', '2Цар 21:21', '1Пар 20:7', '1Цар 16:10', '1Пар 2:13'] }, S);
      setFact(base, 'p-kherets', 'a-14541', note(KHELETS, 'Хелец Пелонитянин', '1Пар 11:27', '1Пар 27:10').value, S);
      setFact(base, 'p-ekhi', 'a-2978', note(AKHIRAM, 'Ахирам, сын Вениамина', 'Быт 46:21', 'Чис 26:38').value, S);
      for (const [card, r, who, a2, b2, extra] of [
        ['p-khelets-pelonityanin', KHELETS, 'Херец Пелонитянин из храбрых Давида', '1Пар 27:10', '1Пар 11:27', ' Не смешивать с Хелецом, сыном Азарии (1Пар 2:39)'],
        ['p-akhiram-syn-veniamina', AKHIRAM, 'Эхи, сын Вениамина', 'Чис 26:38', 'Быт 46:21', ''],
      ] as const) {
        const a = A.get(card)!;
        const f = a.facts.find((x) => x.field === 'notes' && /^Возможно, это тот же человек/.test(String((x.value as { text?: string }).text)));
        if (f) {
          f.value = { kind: 'identification', text: `Возможно, это тот же человек, что ${who}: так выходит, если сравнить ${a2} и ${b2}. ${r.note}${extra}`, refs: [...r.refs, ...(extra ? ['1Пар 2:39'] : [])] };
          touch(f, S);
        }
        const rr = rel(base, card, r.b);
        Object.assign(rr, { refs: r.refs, note: r.note });
        touch(rr, S);
      }
      // цитата Исх 3:1 по стиху: «у Иофора, тестя своего, священника Мадиамского» (в связи D15-2 и заметке a-4372)
      const BAD = 'Иофор назван «тестем своим, священником Мадиамским» (Исх 3:1)';
      const GOOD = 'Иофор назван так: «у Иофора, тестя своего, священника Мадиамского» (Исх 3:1)';
      const ri = rel(base, 'p-raguil', 'p-iofor');
      if (ri.note?.includes(BAD)) (ri.note = ri.note.replace(BAD, GOOD)), touch(ri, S);
      const n72 = factById(base, 'p-iofor', 'a-4372', S).f;
      const v72 = n72.value as { text: string };
      if (v72.text.includes(BAD)) (v72.text = v72.text.replace(BAD, GOOD)), touch(n72, S);
      return {
        what: 'Д-15, второй ключ партии 2: Иехония — a-9572 и a-9590 выбыли (Иез 1:2 — упоминание с кандидатами), a-9594 без Иез 1:2; имена земель сняты из мест Писания, «землю Немврода» — понимание; родословие Ефана — на его карточке, у Идифуна уточнение и подлинник без Ефана; у Иевосфея — без «Ешбаал»; Мааха — без толкования слова «мать»; уточнение Симона — «Кананит»; цитаты a-3377, Хелец и Ахирам — по стихам',
        why: 'второй ключ Д-15 партии 2, № 4, 6, 9, 11, 12, 13; решения координатора 4, 6',
        refs: ['Иез 1:2', 'Мих 5:6', '1Пар 6:44', '3Цар 15:10', 'Мф 10:4', '2Цар 23:26', '1Пар 8:2'],
        actors: ['iekhoniya', 'idifun', 'efan-syn-kishiya', 'ievosfey', 'maakha-doch-avessaloma', 'simon-zilot', 'samma-syn-iesseya', 'kherets', 'khelets-pelonityanin', 'ekhi', 'akhiram-syn-veniamina', ...NATIONS.map((x) => x.slice(2))],
        other: ['redirects', 'relations'],
      };
    },
  },
  {
    id: 'D15-17',
    scope: NEIGHBOURS.flatMap((x) => [`actor:${x.card}.disambig`, `actor:${x.card}.facts.`, `actor:${x.card}.prov`]),
    run: ({ base, actor }) => {
      for (const x of NEIGHBOURS) {
        const a = actor(x.card);
        if (x.disambig) a.disambig = x.disambig;
        for (const [id, value] of Object.entries(x.facts ?? {})) {
          const f = a.facts.find((y) => fid(base, y) === id);
          if (!f) throw new Error(`D15-17: нет ${id} у ${x.card}`);
          f.value = structuredClone(value);
          if (f.cert === 'interpretation' && (value as { kind?: string }).kind !== 'interpretation') delete f.cert;
          touch(f, 'D15-17');
        }
        touch(a, 'D15-17');
      }
      return {
        what: `Д-15, второй ключ партии 2: тексты соседних карточек, где разведённая пара ещё названа одним лицом (${NEIGHBOURS.length} карточек): ${NEIGHBOURS.map((x) => x.card).join(', ')}`,
        why: 'второй ключ Д-15 партии 2, № 5, 6; решение координатора 4',
        refs: ['Мф 1:5', 'Неем 12:23', '2Цар 21:21', '2Пар 13:2', 'Иер 22:11'],
        actors: NEIGHBOURS.map((x) => x.card.slice(2)),
      };
    },
  },
  {
    id: 'D15-18',
    scope: ['actor:', 'origin:', 'membership:', 'nodata:'],
    run: ({ base }) => autoIdCertLoose(base, 'D15-18'),
  },
];

/** Тождество по форме по букве 02 § 3.3.5: в каждом стихе записи лицо названо только формой «выв.» или не названо вовсе. */
function autoIdCertLoose(base: Base, step: string) {
  const A = actorsOf(base);
  const n = { facts: 0, memberships: 0, nodata: 0, origins: 0 };
  const touched = new Set<string>();
  for (const a of A.values()) {
    if (!inferredForms(a).length) continue;
    for (const f of a.facts) {
      if (f.idCert || f.prov?.status === 'quarantine' || f.field === 'scripture' || formCertExempt(f)) continue;
      const rs = refsDeep(f.value).filter((r) => r);
      const form = rs.length ? restsOnFormLoose(a, rs) : undefined;
      if (form) (f.idCert = { form: form.id!, refs: [...new Set(rs)] }), touch(f, step), n.facts++, touched.add(a.id);
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
    if (o.identity?.degree === 'inferred' || o.candidates?.length) continue;
    for (const [end, of] of [[o.parent, 'parent'], [o.child, 'child']] as const) {
      const a = end ? A.get(end) : undefined;
      if (!a || !inferredForms(a).length) continue;
      const f = restsOnFormLoose(a, o.refs);
      if (!f) continue;
      o.identity = {
        of, degree: 'inferred', form: f.id!, refs: [...new Set([...o.refs, ...(f.compare?.main.refs ?? [])])],
        note: `в стихах ребра ${of === 'parent' ? 'родитель' : 'ребёнок'} назван формой «${f.form}» или не назван вовсе — форма «выв.» карточки ${mainOf(a).form}: так выходит, если сравнить ${f.compare!.form.refs[0]} и ${f.compare!.main.refs[0]}`,
      } as Origin['identity'];
      touch(o, step);
      n.origins++;
      touched.add(a.id);
      break;
    }
  }
  return {
    what: `Д-15, второй ключ партии 2: тождество по форме по букве 02 § 3.3.5 («или не названо вовсе»): утверждений ${n.facts}, членств ${n.memberships}, «нет сведений» ${n.nodata} — idCert; рёбер ${n.origins} — identity … inferred`,
    why: '02 § 3.3.5; второй ключ Д-15 партии 2, № 7; решение координатора 3',
    refs: ['1Пар 7:27', '1Пар 4:5'],
    actors: [...touched].map((x) => x.slice(2)),
    other: ['origins', 'memberships', 'nodata'],
  };
}
