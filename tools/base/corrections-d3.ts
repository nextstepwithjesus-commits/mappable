/**
 * Правки этапа Д3 по сверке контрольного набора вторым ключом (docs/app/reviews/Д3-контрольный-набор-сверка.md, § 4–5)
 * и решениям координатора к ней. Отчёт составителя — docs/app/reviews/Д3-исправления-набора.md.
 *
 * Шаги идут после дополнений A1 (additions.ts): жена Каина и её утверждение появляются только там, а список стихов
 * у записей «Писание молчит» (C38) собирается по готовым записям лица — поэтому C38 последний.
 * Каждый шаг меняет только объявленную область; стихи сверены командой `npm run -s verse`; слова в скобках не основание.
 */
import type { Step } from './corrections.ts';
import type { Actor, Union, UnionTerm } from './types.ts';
import { scriptureText } from './brackets.ts';
import { loadBible } from '../bible.ts';
import { compareRefs, parseRef, verseId } from '../../src/engine/books.ts';
import { nameMatcher, norm } from '../../src/engine/text.ts';

const by = (id: string) => ({ by: `исправление ${id}` });

function union(base: { unions: Union[] }, id: string): Union {
  const u = base.unions.find((x) => x.id === id);
  if (!u) throw new Error(`нет союза ${id}`);
  return u;
}

/**
 * Слова обозначений союзов по стихам (C35). Прежний перенос брал слово по стороне записи: на записи жены — «муж»,
 * хотя в стихах его нет. Здесь у каждого такого обозначения — слово, которое стоит в его стихах (вне скобок).
 * `null` — ни в одном стихе обозначения нет слова о союзе: слово снимается, вид остаётся из прежних данных
 * (проверка базы выдаёт замечание «вид без слова текста»). Индекс — номер обозначения в союзе.
 */
const WORDS: { id: string; i: number; word: string | null; kind?: UnionTerm['kind']; why: string }[] = [
  // Бытие
  { id: 'u-iakov--valla', i: 1, word: 'жена', why: '«дала она Валлу… в жену ему» (Быт 30:4); «жен отца своего» (Быт 37:2)' },
  { id: 'u-iakov--zelfa', i: 1, word: 'жена', why: '«дала ее Иакову в жену» (Быт 30:9); «жен отца своего» (Быт 37:2)' },
  { id: 'u-ir-syn-iudy--famar', i: 0, word: 'жена', why: '«взял Иуда жену Иру» (Быт 38:6)' },
  { id: 'u-potifar--zhena-potifara', i: 1, word: 'жена', why: '«жена господина его» (Быт 39:7); «слова жены своей» (Быт 39:19)' },
  { id: 'u-manassiya--nalozhnitsa-manassii', i: 1, word: 'наложница', kind: 'concubine', why: '«родила наложница его Арамеянка» (1Пар 7:14): в стихе — «наложница», не брак' },
  // 1 Паралипоменон 2 и 4
  { id: 'u-esrom--doch-makhira', i: 0, word: 'взял', why: '«вошел к дочери Махира… и взял ее» (1Пар 2:21)' },
  { id: 'u-esrom--aviya-zhena-esroma', i: 0, word: 'жена', why: '«жена Есромова, Авия» (1Пар 2:24)' },
  { id: 'u-iefer-izmailtyanin--avigeya-sestra-davida', i: 0, word: null, why: '«отец же Амессы — Иефер» (1Пар 2:17); «вошел к Авигее» (2Цар 17:25): ни «муж», ни «жена» в стихах нет' },
  { id: 'u-ierakhmeil--afara', i: 0, word: 'жена', why: '«и другая жена, имя ее Афара» (1Пар 2:26)' },
  { id: 'u-avishur--avikhail-zhena-avishura', i: 0, word: 'жена', why: '«Имя жене Авишуровой Авихаиль» (1Пар 2:29)' },
  { id: 'u-iarkha--doch-sheshana', i: 0, word: 'жена', why: '«отдал дочь свою Иархе… в жену» (1Пар 2:35)' },
  { id: 'u-khalev-syn-esroma--azuva-zhena-khaleva', i: 0, word: 'жена', why: '«от Азувы, жены своей» (1Пар 2:18)' },
  { id: 'u-khalev-syn-esroma--ieriofa', i: 0, word: null, why: '«родил от Азувы, жены своей, и от Иериофы» (1Пар 2:18): «жена» сказано об Азуве, не об Иериофе' },
  { id: 'u-khalev-syn-esroma--efrafa-zhena-khaleva', i: 0, word: 'взял', why: '«взял себе Халев Ефрафу» (1Пар 2:19)' },
  { id: 'u-ashkhur--khela-zhena-ashkhura', i: 0, word: 'жена', why: '«были две жены: Хела и Наара» (1Пар 4:5)' },
  { id: 'u-ashkhur--naara-zhena-ashkhura', i: 0, word: 'жена', why: '«были две жены: Хела и Наара» (1Пар 4:5)' },
  { id: 'u-mered--iudiya', i: 0, word: 'жена', why: '«И жена его Иудия родила» (1Пар 4:18)' },
  { id: 'u-mered--bifya', i: 0, word: 'взял', why: '«Бифьи, дочери фараоновой, которую взял Меред» (1Пар 4:18); «жена» в стихе — об Иудии' },
  { id: 'u-mered--godiya-sestra-nakhama', i: 0, word: 'жена', why: '«Сыновья жены его Годии» (1Пар 4:19)' },
  // Пятикнижие, Руфь, Судьи, Цари
  { id: 'u-moisey--efioplyanka-zhena-moiseya', i: 1, word: 'жена', why: '«за жену Ефиоплянку, которую он взял» (Чис 12:1)' },
  { id: 'u-khileon--orfa', i: 0, word: 'жена', why: '«Они взяли себе жен из Моавитянок» (Руф 1:4)' },
  { id: 'u-makhlon--ruf', i: 0, word: 'жена', why: '«Руфь Моавитянку, жену Махлонову» (Руф 4:10)' },
  { id: 'u-vooz--ruf', i: 0, word: 'жена', why: '«беру себе в жену» (Руф 4:10); «она сделалась его женою» (Руф 4:13)' },
  { id: 'u-lappidof--devora', i: 0, word: 'жена', why: '«Девора пророчица, жена Лапидофова» (Суд 4:4)' },
  { id: 'u-khever-keneyanin--iail', i: 0, word: 'жена', why: '«Иаили, жены Хевера Кенеянина» (Суд 4:17; 4:21; 5:24)' },
  { id: 'u-elkana--fennana', i: 1, word: 'жена', why: '«у него были две жены» (1Цар 1:2); «Феннане, жене своей» (1Цар 1:4)' },
  { id: 'u-adriel--merova', i: 0, word: 'в замужество', why: '«она выдана была в замужество за Адриэла» (1Цар 18:19)' },
  { id: 'u-ben-aminadav--tafaf', i: 0, word: 'жена', why: '«Тафафь, дочь Соломона, была его женою» (3Цар 4:11)' },
  { id: 'u-akhimaas-zyat-solomona--vasemafa-doch-solomona', i: 0, word: 'жена', why: '«он взял себе в жену Васемафу» (3Цар 4:15)' },
  { id: 'u-ioram-syn-iosafata--gofoliya', i: 1, word: 'жена', why: '«дочь Ахава была женою его» (4Цар 8:18; 2Пар 21:6)' },
  { id: 'u-shallum-muzh-oldamy--oldama', i: 0, word: 'жена', why: '«Олдаме пророчице, жене Шаллума» (4Цар 22:14; 2Пар 34:22)' },
  { id: 'u-iodai--iosavef', i: 1, word: 'жена', why: '«жена Иодая священника» (2Пар 22:11)' },
  { id: 'u-verzelliy-svyashchennik--zhena-verzelliya-svyashchennika', i: 1, word: 'жена', why: '«который взял жену из дочерей Верзеллия» (Езд 2:61; Неем 7:63)' },
  { id: 'u-iokhanan-syn-tovii--doch-meshullama-zhena-iokhanana', i: 0, word: 'взял', why: '«сын его Иоханан взял за себя дочь Мешуллама» (Неем 6:18)' },
  // Новый Завет
  { id: 'u-khuza--ioanna-zhena-khuzy', i: 0, word: 'жена', why: '«Иоанна, жена Хузы» (Лк 8:3)' },
  { id: 'u-filipp-brat-iroda--irodiada', i: 0, word: 'жена', why: '«за Иродиаду, жену Филиппа, брата своего» (Мф 14:3; Мк 6:17)' },
  { id: 'u-irod-antipa--irodiada', i: 0, word: 'женился', why: '«потому что женился на ней» (Мк 6:17)' },
  // «жена» на записи мужа, а в стихах обозначения слова «жена» нет ни в одном
  { id: 'u-iakov--liya', i: 0, word: null, why: '«взял дочь свою Лию и ввел ее к нему; и вошел к ней» (Быт 29:23): «взял» — о Лаване; слова «жена» в Быт 29:23–25, 30 нет' },
  { id: 'u-salmon--raav', i: 0, word: null, why: '«Салмон родил Вооза от Рахавы» (Мф 1:5): союз не назван' },
  { id: 'u-david--aggifa', i: 0, word: null, why: '«Адония, сын Аггифы» (2Цар 3:4; 1Пар 3:2); 1Пар 3:9 — о наложницах без имён: слова о союзе нет' },
  { id: 'u-navat--tserua', i: 0, word: null, why: '«имя матери его вдовы: Церуа» (3Цар 11:26): союз не назван' },
  { id: 'u-isaiya--prorochitsa-zhena-isaii', i: 0, word: null, why: '«и приступил я к пророчице» (Ис 8:3): слова «жена» нет' },
  { id: 'u-kleopa--mariya-kleopova', i: 0, word: null, why: '«Мария Клеопова» (Ин 19:25): союз не назван' },
  { id: 'u-zevedey--mat-synovey-zevedeevykh', i: 0, word: null, why: '«мать сыновей Зеведеевых» (Мф 20:20; 27:56): союз не назван' },
];

export const STEPS_D3: Step[] = [
  {
    // решение координатора 1: два обозначения по тексту; Быт 16:15 союза не называет
    id: 'C32',
    scope: ['union:u-avraam--agar'],
    run: ({ base }) => {
      const u = union(base, 'u-avraam--agar');
      if (u.terms.length !== 1) throw new Error('u-avraam--agar: ожидалось одно обозначение');
      const [t] = u.terms;
      const P = by('C32');
      u.terms = [
        {
          kind: 'maid-as-wife', word: 'в жену', side: t.side, refs: ['Быт 16:3'],
          note: 'Сара «дала ее Авраму, мужу своему, в жену» (Быт 16:3). Наложницей по имени Агарь не названа; Быт 25:6 говорит о наложницах Авраама без имён',
          order: t.order, prov: { ...t.prov, ...P },
        },
        { kind: 'maid-as-wife', word: 'служанка', refs: ['Быт 16:1', 'Быт 25:12'], note: '«служанка Египтянка, именем Агарь» (Быт 16:1); «Агарь Египтянка, служанка Саррина» (Быт 25:12)', prov: P },
      ];
      return {
        what: 'Союз Авраама и Агари: два обозначения по стихам — «в жену» (Быт 16:3) и «служанка» (Быт 16:1; 25:12); Быт 16:15 убран из стихов союза',
        why: 'У каждого стиха своё обозначение, пример Агари назван в 02 § 3.2; Быт 16:15 говорит о рождении Измаила, а не о союзе (сверка Д3, № 1)',
        refs: ['Быт 16:1', 'Быт 16:3', 'Быт 25:12'],
        actors: ['avraam', 'agar'],
      };
    },
  },
  {
    // решение координатора 2: «сестра» — слова Авраама (02 § 3.6)
    id: 'C33',
    scope: ['kin:p-sarra|p-avraam|сестра', 'origin:p-sarra|p-farra|father|p'],
    run: ({ base, origin }) => {
      const saidBy = { actor: 'p-avraam', ref: 'Быт 20:11', label: 'по словам Авраама' };
      const k = base.kin.filter((x) => x.from === 'p-sarra' && x.to === 'p-avraam' && x.rel === 'сестра');
      if (k.length !== 1) throw new Error(`родство Сарры «сестра»: ${k.length}`);
      k[0].saidBy = saidBy;
      k[0].prov = { ...k[0].prov, ...by('C33') };
      const o = origin('p-sarra', 'p-farra', true);
      o.saidBy = saidBy;
      o.prov = { ...o.prov, ...by('C33') };
      return {
        what: 'Сарра — «сестра» Авраама и ребро Сарра ← Фарра: пометка «по словам Авраама» (новое поле saidBy: кто говорит и стих, где он назван говорящим — Быт 20:11)',
        why: '«да она и подлинно сестра мне: она дочь отца моего» — слова Авраама (Быт 20:11–12); 02 § 3.6 требует пометки «по словам Авраама» (сверка Д3, № 2)',
        refs: ['Быт 20:11-12', 'Быт 11:27'],
        actors: ['sarra', 'avraam', 'farra'],
      };
    },
  },
  {
    // решение координатора 3: вид «союз без брака»; стихи — где названа мать, и стих самого союза
    id: 'C34',
    scope: ['union:u-iuda--famar'],
    run: ({ base }) => {
      const u = union(base, 'u-iuda--famar');
      if (u.terms.length !== 1 || u.terms[0].kind !== 'not-stated') throw new Error('u-iuda--famar: ожидалось одно обозначение «не назван»');
      u.terms = [{
        kind: 'non-marital', word: 'вошел к ней', refs: ['Быт 38:18', 'Руф 4:12', '1Пар 2:4', 'Мф 1:3'], cert: 'inference',
        note: 'Союз описан в Быт 38:15–18: «вошел к ней; и она зачала от него» (Быт 38:18); браком текст его не называет',
        prov: by('C34'),
      }];
      return {
        what: 'Иуда и Фамарь: вид «союз без брака» (новый вид non-marital, 02 § 3.2), слово «вошел к ней» (Быт 38:18); стихи — Быт 38:18, Руф 4:12, 1Пар 2:4, Мф 1:3; убраны Быт 46:12, 1Пар 4:1, Лк 3:33 (Фамарь там не названа); примечание — по Быт 38:18',
        why: 'Прежнее примечание «сам союз текст не называет» спорило с Быт 38:18; в 02 § 3.2 «союз без брака» — отдельный вид (сверка Д3, № 3)',
        refs: ['Быт 38:15-18', 'Руф 4:12', '1Пар 2:4', 'Мф 1:3'],
        actors: ['iuda', 'famar'],
      };
    },
  },
  {
    // решение координатора 4: слово обозначения — только из стиха
    id: 'C35',
    scope: [...new Set(WORDS.map((w) => `union:${w.id}`))],
    run: ({ base }) => {
      const P = by('C35');
      for (const w of WORDS) {
        const t = union(base, w.id).terms[w.i];
        if (!t) throw new Error(`${w.id}: нет обозначения № ${w.i}`);
        if (w.word) t.word = w.word;
        else delete t.word;
        if (w.kind) t.kind = w.kind;
        t.prov = { ...t.prov, ...P };
      }
      const fixed = WORDS.filter((w) => w.word).length;
      return {
        what: `Слова обозначений союзов сверены со стихами: у ${fixed} обозначений слово заменено словом стиха («жена», «женился», «взял», «в замужество», «наложница»), у ${WORDS.length - fixed} снято — в их стихах слова о союзе нет; у наложницы Манассии вид — «наложница» (1Пар 7:14). Иродиада: у Филиппа — «жена» (Мф 14:3; Мк 6:17), у Ирода — «женился» (Мк 6:17)`,
        why: 'Слово текста хранится отдельно и должно стоять в стихе (02 § 3.2); прежний перенос ставил «муж» по стороне записи (сверка Д3, № 4). По стихам: ' + WORDS.map((w) => `${w.id} — ${w.why}`).join('; '),
        refs: ['Мф 14:3', 'Мк 6:17', '1Пар 7:14'],
        actors: [...new Set(WORDS.flatMap((w) => { const u = union(base, w.id); return [u.husband.slice(2), u.wife.slice(2)]; }))],
      };
    },
  },
  {
    // решение координатора 5: авторы толкований; левират и усыновление раздельно; ребро «Илий — отец Марии» снято
    id: 'C36',
    scope: ['reading:r-lk3-23', 'origin:p-iosif-muzh-marii|p-iakov-otets-iosifa|father|p', 'origin:p-iosif-muzh-marii|p-iliy-syn-matfata|father|o', 'origin:p-mariya|p-iliy-syn-matfata|father|o'],
    run: ({ base, origin }) => {
      const r = base.readings.find((x) => x.id === 'r-lk3-23');
      if (!r) throw new Error('нет набора r-lk3-23');
      const keep = (id: string) => {
        const x = r.readings.find((y) => y.id === id);
        if (!x) throw new Error(`r-lk3-23: нет прочтения ${id}`);
        return x;
      };
      const mt = keep('mt');
      const lk = keep('lk');
      const mary = keep('mary');
      mary.label = 'Толкование: Лк 3 — родословие Марии, Илий — Её отец; Иосиф — сын Иакова. Ребра «Илий — отец Марии» в базе нет: Писание родителей Марии не называет';
      mary.authors = [
        'Matthew Henry, «An Exposition of the Old and New Testament» (1708–1710), на Лк 3:23–38',
        'John MacArthur, проповедь «The Messiah’s Royal Lineage» (Grace to You, 42-48), на Лк 3:23–38',
        '«Толковая Библия» под ред. А. П. Лопухина (преемники), т. 9 (1912), на Лк 3:23',
      ];
      r.readings = [
        mt, lk, mary,
        {
          id: 'levirate', cert: 'interpretation', refs: ['Мф 1:16', 'Лк 3:23', 'Втор 25:5-6'],
          label: 'Толкование: левират — Иосиф сын Иакова по рождению и сын Илия по закону: Иаков взял вдову брата Илия, умершего бездетным',
          authors: [
            'Юлий Африкан, «Послание к Аристиду» (в передаче Евсевия)',
            'Евсевий Кесарийский, «Церковная история» I.7',
            'Феофилакт Болгарский, «Толкование на Евангелие от Луки», на Лк 3:23–38',
          ],
        },
        {
          id: 'adoption', cert: 'interpretation', refs: ['Мф 1:16', 'Лк 3:23'],
          label: 'Толкование: усыновление — Иосиф сын Иакова по рождению, Илий усыновил его',
          authors: ['Августин, «О согласии евангелистов» II.3–4; «Вопросы на Евангелия» II.5'],
        },
      ];
      r.note =
        'Мф 1:16: «Иаков родил Иосифа»; Лк 3:23: Иисус «был, как думали, Сын Иосифов, Илиев». Оба места — основной текст. ' +
        'Расчёт родства и схемы не складывают прочтения: Иосиф не получает двух отцов, Илий не выходит отцом Марии. ' +
        'Толкования подписаны авторами по совету источников (docs/app/research/R9-авторитеты.md, § 1; Г-4); ещё два понимания из R9 § 1 — природное родословие Иосифа у Луки (Bock) и историко-критическое (Brown) — в набор пока не внесены.';
      origin('p-iosif-muzh-marii', 'p-iakov-otets-iosifa', true).reading = { set: 'r-lk3-23', in: ['mt', 'mary', 'levirate', 'adoption'] };
      origin('p-iosif-muzh-marii', 'p-iliy-syn-matfata', false).reading = { set: 'r-lk3-23', in: ['lk', 'levirate', 'adoption'] };
      const mh = origin('p-mariya', 'p-iliy-syn-matfata', false);
      base.origins = base.origins.filter((o) => o !== mh);
      return {
        what: 'Набор r-lk3-23: у толкований — авторы (R9 § 1); прочтение «законное отцовство» разделено на «левират» (Африкан, Евсевий, Феофилакт) и «усыновление» (Августин); рёбра Иосифа переведены на новые прочтения; ребро «Илий — отец Марии» снято — толкование живёт только в наборе прочтений',
        why: '02 § 3.4 [R9]: у каждого толкования — авторы, левират и усыновление — разные понимания; толкование не становится ребром (CLAUDE.md; R9 Г-5) — решение координатора по сверке Д3, № 5 и № 8',
        refs: ['Мф 1:16', 'Лк 3:23', 'Втор 25:5-6'],
        actors: ['iosif-muzh-marii', 'mariya', 'iliy-otets-marii', 'iakov-otets-iosifa'],
      };
    },
  },
  {
    // решение координатора 6: утверждение не повторяет союз и ребро (02 § 3.1)
    id: 'C37',
    scope: ['actor:p-zhena-kaina.facts.status'],
    run: ({ actor }) => {
      const a = actor('p-zhena-kaina');
      const xs = a.facts.filter((f) => f.field === 'status' && JSON.stringify(f.value).includes('И познал Каин жену свою'));
      if (xs.length !== 1) throw new Error(`жена Каина: утверждений «познал» — ${xs.length}`);
      a.facts.splice(a.facts.indexOf(xs[0]), 1);
      return {
        what: 'Жена Каина: утверждение «И познал Каин жену свою; и она зачала и родила Еноха» снято — его содержание уже в союзе u-kain--zhena-kaina и ребре Енох ← жена Каина (Быт 4:17)',
        why: 'Утверждение не дублирует союз и происхождение (02 § 3.1; сверка Д3, № 6)',
        refs: ['Быт 4:17'],
        actors: ['zhena-kaina'],
      };
    },
  },
  {
    // решение координатора 7: у «Писание молчит» — список стихов, на которых держится вывод
    id: 'C38',
    scope: ['|silent'],
    run: ({ base }) => {
      const actors = new Map<string, Actor>(base.volumes.flatMap((v) => v.actors.map((a) => [a.id, a] as const)));
      const own = new Map<string, string[]>();
      const add = (id: string | undefined, rs: string[] | undefined) => {
        if (!id || !rs?.length) return;
        own.set(id, [...(own.get(id) ?? []), ...rs]);
      };
      const deep = (x: any, out: string[]) => {
        if (Array.isArray(x)) return x.forEach((y) => deep(y, out));
        if (!x || typeof x !== 'object') return;
        for (const [k, v] of Object.entries(x)) {
          if ((k === 'ref' || k === 'first') && typeof v === 'string') out.push(v);
          else if ((k === 'refs' || k === 'key' || k === 'all') && Array.isArray(v)) out.push(...v.filter((r): r is string => typeof r === 'string'));
          else deep(v, out);
        }
      };
      for (const a of actors.values()) {
        const rs: string[] = [];
        for (const n of a.names) rs.push(...n.refs);
        if (a.count) rs.push(...a.count.refs);
        for (const f of a.facts) if (f.prov?.status !== 'quarantine') deep(f.value, rs);
        add(a.id, rs);
      }
      for (const o of base.origins) {
        add(o.child, o.refs);
        add(o.parent, o.refs);
      }
      for (const u of base.unions) for (const t of u.terms) {
        add(u.husband, t.refs);
        add(u.wife, t.refs);
      }
      for (const k of base.kin) {
        add(k.from, k.refs);
        add(k.to, k.refs);
      }
      for (const m of base.memberships) add(m.actor, m.refs);
      // по каждому стиху отдельно: в список идут только стихи, где лицо названо; канонический порядок, без повторов
      const { chapterLength } = loadBible();
      const cache = new Map<string, string[]>();
      const readOf = (id: string) => {
        if (cache.has(id)) return cache.get(id)!;
        const a = actors.get(id);
        if (!a) throw new Error(`«нет сведений» у несуществующего лица ${id}`);
        const forms = (a.kind === 'unnamed' || a.kind === 'group') && a.descriptor ? [a.descriptor] : a.names.map((n) => n.form);
        const named = new Set<string>();
        for (const r of new Set(own.get(id) ?? [])) {
          for (const v of parseRef(r, chapterLength)?.verses ?? []) {
            const t = norm(scriptureText(v.book, v.chapter, v.verse) ?? '');
            if (t && forms.some((f) => nameMatcher(f).test(t))) named.add(verseId(v));
          }
        }
        const out = [...named].sort(compareRefs);
        cache.set(id, out);
        return out;
      };
      let listed = 0;
      let need = 0;
      for (const n of base.nodata) {
        if (n.kind !== 'silent') continue;
        const rs = readOf(n.actor);
        if (rs.length) {
          n.read = rs;
          listed++;
        } else {
          n.needsReading = true;
          need++;
        }
        n.prov = { ...n.prov, ...by('C38') };
      }
      return {
        what: `«Писание молчит»: у ${listed} записей — список стихов, где лицо названо (поле read; собран из стихов записей лица — имён, утверждений, рёбер, союзов, родства, членства — с проверкой, что имя или описательное слово стоит в стихе вне скобок); у ${need} записей список не восстановлен — пометка «нужно чтение» (needsReading)`,
        why: '02 § 3.2: «Писание молчит» — с проверкой, какие стихи прочитаны; без списка запись нельзя ни проверить, ни подписать (сверка Д3, № 9). Список — основание для сверщика, а не свидетельство, что прежний составитель их читал',
        refs: [],
        actors: [...new Set(base.nodata.filter((n) => n.kind === 'silent').map((n) => n.actor.slice(2)))],
      };
    },
  },
];
