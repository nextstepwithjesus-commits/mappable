/**
 * Исправления при переносе (docs/app/02-ДАННЫЕ.md, § 3.4–3.6, § 9; рецензия Д1 — docs/app/reviews/Д1-перенос-рецензия.md).
 *
 * Каждое исправление — шаг с объявленной областью действия (`scope`): подстроки ключей записей базы, которые шаг вправе
 * менять (ключи — recordKeys в migrate.ts). Перенос применяет шаги по одному и сверяет: всё, что изменилось, должно
 * лежать в области шага. Так проверяются и поля, которых не было в прежних данных (прочтения, слова текста, пропуски).
 */
import type { Base } from './migrate.ts';
import type { Hints } from './project.ts';
import type { Actor, Assertion, Correction, Origin, ReadingSet } from './types.ts';

export interface Step {
  id: string;
  /** Подстроки ключей записей, которые шаг вправе менять. */
  scope: string[];
  run: (ctx: Ctx) => Omit<Correction, 'id'>;
}

interface Ctx {
  base: Base;
  hints: Hints;
  actor: (id: string) => Actor;
  origin: (child: string, parent: string, primary?: boolean) => Origin;
  at: string;
}

const HELI_OLD = 'p-iliy-otets-marii';
const HELI = 'p-iliy-syn-matfata';
const quarantine = (note: string) => ({ status: 'quarantine' as const, note });

/** Два отца одного лица по разным местам основного текста (рецензия Д1, № 5): набор прочтений на ребёнка. */
const DOUBLE_FATHERS = [
  'p-naaman-syn-veniamina', 'p-ard', 'p-shoval-otets-kiriaf-iarima', 'p-korey', 'p-sadok-1par6-12', 'p-zefam',
  'p-ioil-syn-laedana', 'p-asriil', 'p-kis', 'p-nir', 'p-maakha-doch-avessaloma',
];

export const STEPS: Step[] = [
  {
    id: 'C1',
    scope: [HELI_OLD, HELI, 'origin:p-iosif-muzh-marii|', 'origin:p-mariya|', 'kin:p-iosif-muzh-marii|', 'reading:r-lk3-23', `redirect:${HELI_OLD}`, 'volume:16-', 'line:mary'],
    run: ({ base, hints, actor, origin, at }) => {
      base.readings.push({
        id: 'r-lk3-23',
        title: 'Отец Иосифа и смысл Лк 3:23',
        refs: ['Мф 1:16', 'Лк 3:23'],
        readings: [
          { id: 'mt', label: 'Иосиф — сын Иакова (Мф 1:16)', cert: 'scripture', refs: ['Мф 1:16'] },
          { id: 'lk', label: 'Иосиф — «Илиев» (Лк 3:23, по букве); линия Луки кончается Иосифом', cert: 'scripture', refs: ['Лк 3:23'] },
          { id: 'mary', label: 'Толкование: Лк 3 — родословие Марии, Илий — Её отец; Иосиф — сын Иакова', cert: 'interpretation', refs: ['Лк 3:23', 'Лк 1:32', 'Рим 1:3'] },
          { id: 'legal', label: 'Толкование: Иаков и Илий — оба отцы Иосифа, один по рождению, другой по закону (брак с женой умершего брата) или по усыновлению', cert: 'interpretation', refs: ['Мф 1:16', 'Лк 3:23', 'Втор 25:5-6'] },
        ],
        default: 'mt',
        note:
          'Мф 1:16: «Иаков родил Иосифа»; Лк 3:23: Иисус «был, как думали, Сын Иосифов, Илиев». Оба места — основной текст. ' +
          'Расчёт родства и схемы не складывают прочтения: Иосиф не получает двух отцов, Илий не выходит отцом и Иосифа, и Марии. ' +
          'Перечень пониманий с авторами — docs/app/research/R9-авторитеты.md, § 1.',
      });
      const heli = actor(HELI_OLD);
      heli.id = HELI;
      heli.disambig = 'сын Матфата (Лк 3:24)';
      hints.idmap[HELI] = 'iliy-otets-marii';
      for (const o of base.origins) {
        if (o.child === HELI_OLD) o.child = HELI;
        if (o.parent === HELI_OLD) o.parent = HELI;
      }
      for (const k of base.kin) {
        if (k.from === HELI_OLD) k.from = HELI;
        if (k.to === HELI_OLD) k.to = HELI;
      }
      for (const m of base.memberships) if (m.actor === HELI_OLD) m.actor = HELI;
      for (const c of base.chrono) if (c.actor === HELI_OLD) c.actor = HELI;
      for (const n of base.nodata) if (n.actor === HELI_OLD) n.actor = HELI;
      for (const l of Object.values<any>(base.lines)) for (const s of l.persons) if (s.id === HELI_OLD) s.id = HELI;
      if (hints.persons[HELI_OLD]) {
        hints.persons[HELI] = hints.persons[HELI_OLD];
        delete hints.persons[HELI_OLD];
      }
      base.redirects.push({ from: HELI_OLD, to: [HELI], reason: 'прежний номер «отец Марии» выдавал толкование за факт (r-lk3-23)', refs: ['Лк 3:23'], at });
      origin('p-iosif-muzh-marii', 'p-iakov-otets-iosifa', true).reading = { set: 'r-lk3-23', in: ['mt', 'mary', 'legal'] };
      const jh = origin('p-iosif-muzh-marii', HELI, false);
      jh.reading = { set: 'r-lk3-23', in: ['lk', 'legal'] };
      jh.note = 'Лк 3:23: «как думали, Сын Иосифов, Илиев»; Мф 1:16: «Иаков родил Иосифа» — прочтения r-lk3-23';
      const mh = origin('p-mariya', HELI, true);
      Object.assign(mh, { primary: false, kind: 'by-luke', cert: 'interpretation', refs: ['Лк 3:23'], reading: { set: 'r-lk3-23', in: ['mary'] } });
      mh.note = 'по толкованию Лк 3:23 как родословия Марии; Писание прямо не называет родителей Марии';
      base.kin = base.kin.filter((k) => !(k.from === 'p-iosif-muzh-marii' && k.to === HELI && k.rel.startsWith('зять')));
      return {
        what: 'Отец Иосифа и Лк 3:23: набор прочтений r-lk3-23 (Иаков — Мф 1:16; Илий — Лк 3:23; толкования «родословие Марии» и «законное отцовство»); Илий переименован (iliy-otets-marii → iliy-syn-matfata), уточнение нейтральное; Мария ← Илий — по толкованию; убрана связь «зять», которой нет в стихе',
        why: 'Прежние данные делали Илия отцом и Иосифа, и Марии, а Иосифа — сыном и Иакова, и Илия одновременно (рецензия библеиста 02 Б1; рецензия Д1 № 4)',
        refs: ['Лк 3:23', 'Мф 1:16'],
        actors: ['iliy-otets-marii', 'mariya', 'iosif-muzh-marii'],
      };
    },
  },
  {
    id: 'C2',
    scope: ['origin:p-efrem|p-iakov|', 'origin:p-manassiya|p-iakov|', 'actor:p-efrem.facts.parentsNote', 'actor:p-manassiya.facts.parentsNote'],
    run: ({ base, actor, origin }) => {
      for (const id of ['p-efrem', 'p-manassiya']) {
        const o = origin(id, 'p-iakov', false);
        base.origins = base.origins.filter((x) => x !== o);
        actor(id).facts.push({
          sec: 6, field: 'parentsNote',
          value: { text: 'Иаков говорит Иосифу о его сыновьях: «мои они; Ефрем и Манассия, как Рувим и Симеон, будут мои» — о наследстве и уделе: дети Иосифа, родившиеся после них, «под именем братьев своих будут именоваться в их уделе»', refs: ['Быт 48:5-6'] },
        });
      }
      return {
        what: 'Ефрем и Манассия: ребро «приёмный отец Иаков» заменено утверждением со словами Быт 48:5–6',
        why: 'Слова «мои они» — о наследстве и уделе (48:6); ребро делало Ефрема сыном Иакова и братом собственного отца (02, § 3.6)',
        refs: ['Быт 48:5-6'],
        actors: ['efrem', 'manassiya'],
      };
    },
  },
  {
    id: 'C3',
    scope: ['origin:p-iisus|', 'actor:p-iisus.facts.parentsNote', 'nodata:p-iisus|'],
    run: ({ base, actor, origin }) => {
      const words = [
        { text: 'Иосифа, мужа Марии, от Которой родился Иисус', ref: 'Мф 1:16' },
        { text: 'родители Его', ref: 'Лк 2:41' },
        { text: 'отец Твой — слова Марии', ref: 'Лк 2:48' },
        { text: 'как думали, Сын Иосифов', ref: 'Лк 3:23' },
        { text: 'не Иосифов ли это сын? — говорили в Назарете', ref: 'Лк 4:22' },
        { text: 'Иисуса, сына Иосифова, из Назарета — слова Филиппа', ref: 'Ин 1:45' },
        { text: 'не Иисус ли это, сын Иосифов? — говорили иудеи', ref: 'Ин 6:42' },
        { text: 'не плотников ли Он сын? — говорили в Его отечестве', ref: 'Мф 13:55' },
      ];
      const jj = origin('p-iisus', 'p-iosif-muzh-marii', true);
      Object.assign(jj, {
        kind: 'legal', cert: 'interpretation', words,
        refs: [...new Set([...jj.refs, ...words.map((w) => w.ref)])],
        note: 'Отца по плоти нет: «родившееся в Ней есть от Духа Святаго» (Мф 1:20). Отцом Иосифа называет Мария (Лк 2:48) и люди со стороны; в Синодальном Лк 2:33, 43 — «Иосиф и Матерь Его». «Отец по закону» — толкование (research/R9, § 2). Союз Иосифа и Марии есть, но происхождение не от союза (02, § 3.5)',
      } satisfies Partial<Origin>);
      delete jj.refsShared;
      const jm = origin('p-iisus', 'p-mariya', true);
      jm.cert = 'scripture';
      jm.refs = ['Мф 1:16', 'Мф 1:18', 'Лк 1:31', 'Лк 2:7'];
      delete jm.refsShared;
      base.nodata.push({ actor: 'p-iisus', sec: 6, kind: 'not-applicable', what: 'отец по плоти', refs: ['Мф 1:18', 'Мф 1:20', 'Лк 1:34-35'] });
      const j = actor('p-iisus');
      const i = j.facts.findIndex((f) => f.field === 'parentsNote' && JSON.stringify(f.value).includes('законный отец'));
      if (i < 0) throw new Error('нет утверждения «законный отец» у Иисуса Христа');
      j.facts.splice(i, 1,
        { sec: 6, field: 'parentsNote', value: { text: 'Мать — Дева Мария. Иосифа текст называет так: Иисус «был, как думали, Сын Иосифов»; Мария говорит «отец Твой»; люди — «сын Иосифов», «не плотников ли Он сын?»', refs: ['Лк 3:23', 'Лк 2:48', 'Лк 4:22', 'Ин 1:45', 'Ин 6:42', 'Мф 13:55'] } },
        { sec: 6, field: 'parentsNote', value: { text: 'Иосиф — законный отец Иисуса', refs: ['Мф 1:16', 'Мф 1:20', 'Мф 1:25'] }, cert: 'interpretation' },
      );
      return {
        what: 'Иисус Христос: ребро от Иосифа — законное, «толк.», со словами текста (Мф 1:16; Лк 2:41, 48; 3:23; слова людей Лк 4:22; Ин 1:45; 6:42; Мф 13:55) и примечанием Мф 1:20; мать — Мария, «Писание», свои стихи; запись «не применимо: отец по плоти»; в § 6 «законный отец» — толкование',
        why: 'Модель «Бог и человек» (02, § 3.5); рецензия Д1 № 6, 7, 18',
        refs: ['Мф 1:16', 'Мф 1:20', 'Лк 1:34-35', 'Лк 2:41', 'Лк 2:48', 'Лк 3:23'],
        actors: ['iisus'],
      };
    },
  },
  {
    id: 'C4',
    scope: ['.facts.meaning'],
    run: ({ base }) => {
      const touched: string[] = [];
      // значения, где Писание и справочное смешаны: делятся на два утверждения (рецензия Д1, № 11)
      const split: Record<string, [string, string[]] | null> = {
        'p-adam': ['Бог «нарек им имя: человек»', ['Быт 5:2']],
        'p-isaak': ['Писание связывает рождение Исаака со смехом: Авраам «рассмеялся» при обетовании, Сарра «внутренно рассмеялась», а родив, сказала: «смех сделал мне Бог»', ['Быт 17:17', 'Быт 18:12', 'Быт 21:6']],
        'p-isav': ['Само имя «Исав» Писание не объясняет: младенец вышел «красный, весь, как кожа, косматый». Прозвание Едом Писание выводит из его просьбы: «дай мне поесть красного, красного этого»', ['Быт 25:25', 'Быт 25:30']],
        'p-noemin': ['«не называйте меня Ноеминью, а называйте меня Марою, потому что Вседержитель послал мне великую горесть»', ['Руф 1:20']],
        'p-kheftsiba': ['то же выражение в Ис 62:4 передано словами «Мое благоволение к нему» — новое имя Сиона', ['Ис 62:4']],
        'p-kain': null,
        'p-iafet': null,
      };
      const refText: Record<string, string> = {
        'p-adam': 'в еврейском тексте здесь стоит «адам»; имя сближают со словом «адама» — «земля», из праха которой он взят (Быт 2:7; 3:19)',
        'p-isaak': '«он засмеётся»',
        'p-isav': 'имя обычно связывают со словом «косматый»',
        'p-noemin': '«приятная»; Мара — «горькая»',
        'p-kheftsiba': '«моё благоволение к ней»',
      };
      for (const v of base.volumes) {
        for (const a of v.actors) {
          const i = a.facts.findIndex((f) => f.field === 'meaning');
          if (i < 0) continue;
          const f = a.facts[i];
          const val = f.value as { text: string; refs?: string[] };
          if (a.id in split) {
            const s = split[a.id];
            const out: Assertion[] = [];
            if (s) out.push({ sec: 3, field: 'meaning', value: { text: s[0], refs: s[1] } });
            out.push({
              sec: 3, field: 'meaning', value: { text: s ? refText[a.id] : val.text, ...(!s && val.refs && { refs: val.refs }) },
              cert: 'reference', prov: quarantine('значение имени — справочно; источник — этап Д1.5'),
            });
            a.facts.splice(i, 1, ...out);
            touched.push(a.id.slice(2));
          } else if (f.cert === 'interpretation' && !val.refs?.length) {
            f.cert = 'reference';
            f.prov = quarantine('значение имени без стиха и без источника; источник — этап Д1.5');
            touched.push(a.id.slice(2));
          }
        }
      }
      return {
        what: `Значение имени (${touched.length}): без стиха и с «толк.» → «справочно», карантин; где в одном утверждении смешаны слова Писания и справочное (Адам, Исаак, Исав, Ноеминь, Хефциба) — два утверждения; Каин и Иафет — справочно целиком`,
        why: 'Значение имени, которого не даёт само Писание, — справочное сведение и требует источника (02, § 3.1, § 7; рецензия Д1, № 11)',
        refs: [],
        actors: touched,
      };
    },
  },
  {
    id: 'C5',
    scope: ['origin:p-sala|p-arfaksad|'],
    run: ({ origin }) => {
      origin('p-sala', 'p-arfaksad', true).gapPossible = { refs: ['Лк 3:36'], via: ['p-kainan-syn-arfaksada'] };
      return {
        what: 'Арфаксад → Сала: возможный пропуск поколения через Каинана (Лк 3:36); при расчёте через Каинана ребро считается предком, а не отцом',
        why: 'Каинан есть в основном тексте Лк 3:36, в Быт 11:12 — только в скобках: это пропуск, а не иное прочтение (02, § 3.4); Каинан не должен выходить братом Салы (рецензия Д1, № 5)',
        refs: ['Лк 3:36', 'Быт 11:12'],
        actors: [],
      };
    },
  },
  {
    id: 'C6',
    scope: ['reading:r-shealtiel', 'reading:r-zerubbabel', 'origin:p-salafiil|', 'origin:p-zorovavel|'],
    run: ({ base, origin }) => {
      base.readings.push(
        {
          id: 'r-shealtiel', title: 'Отец Салафиила', refs: ['Мф 1:12', '1Пар 3:17', 'Лк 3:27'],
          readings: [
            { id: 'mt', label: 'Иехония (Мф 1:12; 1Пар 3:17)', cert: 'scripture', refs: ['Мф 1:12', '1Пар 3:17'] },
            { id: 'lk', label: 'Нирий (Лк 3:27)', cert: 'scripture', refs: ['Лк 3:27'] },
          ],
          default: 'mt',
          note: 'Оба места — основной текст. Каждая линия идёт по своему месту; объяснения согласования — толкования (research/R9, § 7).',
        },
        {
          id: 'r-zerubbabel', title: 'Отец Зоровавеля', refs: ['Мф 1:12', 'Лк 3:27', 'Езд 3:2', 'Агг 1:1', '1Пар 3:19'],
          readings: [
            { id: 'mt', label: 'Салафиил (Мф 1:12; Лк 3:27; Езд 3:2; Агг 1:1)', cert: 'scripture', refs: ['Мф 1:12', 'Лк 3:27', 'Езд 3:2', 'Агг 1:1'] },
            { id: 'chr', label: 'Федаия (1Пар 3:19)', cert: 'scripture', refs: ['1Пар 3:19'] },
          ],
          default: 'mt',
          note: 'Оба места — основной текст. Объяснения согласования — толкования (research/R9, § 7).',
        },
      );
      origin('p-salafiil', 'p-iekhoniya', true).reading = { set: 'r-shealtiel', in: ['mt'] };
      origin('p-salafiil', 'p-niriy', false).reading = { set: 'r-shealtiel', in: ['lk'] };
      origin('p-zorovavel', 'p-salafiil', true).reading = { set: 'r-zerubbabel', in: ['mt'] };
      origin('p-zorovavel', 'p-fedaiya-syn-iekhonii', false).reading = { set: 'r-zerubbabel', in: ['chr'] };
      return {
        what: 'Наборы прочтений r-shealtiel и r-zerubbabel; рёбра отцов Салафиила и Зоровавеля помечены прочтениями',
        why: 'Два отца одного лица по разным местам основного текста не складываются в схемах и расчёте (02, § 3.4)',
        refs: ['Мф 1:12', 'Лк 3:27', '1Пар 3:17-19'],
        actors: [],
      };
    },
  },
  {
    id: 'C7',
    scope: ['line:', 'actor:p-iosif-muzh-marii.facts.notes', `actor:${HELI}.facts.notes`],
    run: ({ base, hints, actor }) => {
      const lk = base.lines.mary;
      const i = lk.persons.findIndex((s: any) => s.id === 'p-mariya');
      if (i < 0) throw new Error('в линии Луки нет Марии');
      lk.persons.splice(i, 1, { id: 'p-iosif-muzh-marii', lk: 1, refs: ['Лк 3:23'], flag: 'in-text' });
      lk.id = 'luke';
      lk.subtitle = 'Лк 3:23–38; по распространённому толкованию — родословие Марии';
      lk.basis =
        'Лк 3:23–38: Иисус «был, как думали, Сын Иосифов, Илиев» — и так до Адама. По букве текста линия кончается Иосифом. ' +
        'По распространённому толкованию это родословие Марии (Илий — Её отец); Давидово происхождение Иисуса по плоти: Лк 1:32; Рим 1:3; Деян 2:30; 2Тим 2:8.';
      lk.readings = { 'r-lk3-23': 'lk', 'r-shealtiel': 'lk', 'r-zerubbabel': 'mt' };
      delete base.lines.mary;
      base.lines.luke = lk;
      hints.lineIdmap = { luke: 'mary' };
      base.lines.joseph.readings = { 'r-lk3-23': 'mt', 'r-shealtiel': 'mt', 'r-zerubbabel': 'mt' };
      // карточки не должны говорить, что атлас выбрал толкование
      const SAY = 'Атлас не выбирает между пониманиями: линия по Луке идёт по букве текста до Иосифа, понимания показываются рядом';
      for (const id of ['p-iosif-muzh-marii', HELI]) {
        let n = 0;
        for (const f of actor(id).facts) {
          const v = f.value as { text?: string };
          if (f.field !== 'notes' || !v.text) continue;
          const t = v.text.replace(/\s*(В атласе принято|Атлас показывает) первое понимание.*$/, ` ${SAY}`);
          if (t !== v.text) {
            v.text = t;
            n++;
          }
        }
        if (n !== 1) throw new Error(`карточка ${id}: примечаний о выборе атласа ${n}`);
      }
      return {
        what: 'Линия по Луке: номер mary → luke, кончается Иосифом (Лк 3:23), шаг «Мария» убран; основание без «Илий — отец Марии» как факта; у обеих линий записаны прочтения наборов; в примечаниях Иосифа и Илия — без «атлас принял первое понимание»',
        why: 'Линия по букве текста; толкование — в наборе прочтений (02, § 3.4; рецензия библеиста Б1; рецензия Д1, № 6, 14)',
        refs: ['Лк 3:23'],
        actors: ['iosif-muzh-marii', 'iliy-otets-marii'],
        other: ['line:mary', 'line:joseph'],
      };
    },
  },
  {
    id: 'C8',
    scope: ['kin:p-amessay|p-ioav|', 'kin:p-seraiya-syn-nirii|p-varukh|', 'kin:p-nakham-otets-keily|', 'kin:p-godiya-sestra-nakhama|', 'kin:p-shupim-syn-ira|', 'kin:p-khupim-syn-ira|', 'kin:p-maakha-zhena-makhira|'],
    run: ({ base }) => {
      const drop = (from: string, to: string) => {
        const n = base.kin.length;
        base.kin = base.kin.filter((k) => !(k.from === from && k.to === to));
        if (base.kin.length === n) throw new Error(`нет родства ${from} — ${to}`);
      };
      drop('p-amessay', 'p-ioav');
      drop('p-seraiya-syn-nirii', 'p-varukh');
      for (const [from, to, ref, cert] of [
        ['p-nakham-otets-keily', 'p-godiya-sestra-nakhama', '1Пар 4:19', undefined],
        ['p-shupim-syn-ira', 'p-maakha-zhena-makhira', '1Пар 7:15', 'interpretation'],
        ['p-khupim-syn-ira', 'p-maakha-zhena-makhira', '1Пар 7:15', 'interpretation'],
      ] as const) {
        drop(from, to);
        base.kin.push({ from: to, to: from, rel: 'сестра', refs: [ref], ...(cert && { cert }) });
      }
      return {
        what: 'Родство словами Писания: «двоюродный брат» (Амессай — Иоав) и «брат» (Сераия — Варух) убраны — выводятся из данных; «брат» у Нахама, Хупима и Шупима заменено записью сестры: «сестра» (1Пар 4:19; 7:15)',
        why: 'Слово родства должно стоять в стихе (ТЗ П-8; 02, § 7); выводимое родство считает инструмент «Связи», а не запись',
        refs: ['2Цар 17:25', '1Пар 2:16', 'Иер 32:12', 'Иер 51:59', '1Пар 4:19', '1Пар 7:15'],
        actors: ['amessay', 'seraiya-syn-nirii', 'nakham-otets-keily', 'godiya-sestra-nakhama', 'shupim-syn-ira', 'khupim-syn-ira', 'maakha-zhena-makhira'],
      };
    },
  },
  {
    id: 'C9',
    scope: ['.facts.birth', '.facts.notes'],
    run: ({ base }) => {
      const touched: string[] = [];
      for (const v of base.volumes) {
        for (const a of v.actors) {
          for (const f of a.facts) {
            const val = f.value as any;
            if (f.field === 'birth' && val.place && !val.refs && !val.facts) {
              const hebron = val.place === 'Хеврон';
              if (!hebron && val.place !== 'Иерусалим') throw new Error(`место рождения без стиха: ${a.id}`);
              val.refs = hebron ? ['2Цар 3:2', '1Пар 3:1'] : ['2Цар 5:14', '1Пар 3:5', '1Пар 14:4'];
              touched.push(a.id.slice(2));
            }
            if (f.field === 'notes' && !val.refs?.length) {
              if (a.id === 'p-adam') val.refs = ['Быт 5:3-32'];
              else {
                const first = (a.facts.find((x) => x.field === 'scripture')?.value as any)?.first;
                if (!first) throw new Error(`примечание без стиха и без первого упоминания: ${a.id}`);
                val.refs = [first];
              }
              touched.push(a.id.slice(2));
            }
          }
        }
      }
      return {
        what: `Стихи у записей без стиха (${touched.length}): место рождения сыновей Давида — «родились у него в Хевроне» / «в Иерусалиме»; примечания о народах Быт 10 — стих первого упоминания; примечание о хронологии Адама — Быт 5`,
        why: 'У каждой записи — стих или источник (02, § 7)',
        refs: ['2Цар 3:2', '1Пар 3:1', '2Цар 5:14', '1Пар 3:5', '1Пар 14:4'],
        actors: [...new Set(touched)],
      };
    },
  },
  {
    id: 'C10',
    scope: ['.facts.original'],
    run: ({ base }) => {
      const touched: string[] = [];
      for (const v of base.volumes) {
        for (const a of v.actors) {
          for (const f of a.facts) {
            if (f.field !== 'original') continue;
            f.cert = 'reference';
            f.prov = quarantine('написание в подлиннике без источника; источник — этап Д1.5 (02, § 5)');
            touched.push(a.id.slice(2));
          }
        }
      }
      return {
        what: `Написание имени в подлиннике (${touched.length}): «справочно», карантин до указания источника`,
        why: 'Справочное без источника в приложение не попадает (02, § 3.1; рецензия Д1, № 12)',
        refs: [],
        actors: touched,
      };
    },
  },
  {
    id: 'C11',
    scope: [...DOUBLE_FATHERS.map((c) => `origin:${c}|`), 'reading:r-father-'],
    run: ({ base, actor }) => {
      const sets: ReadingSet[] = [];
      for (const child of DOUBLE_FATHERS) {
        const os = base.origins.filter((o) => o.child === child);
        const a = os.filter((o) => o.primary && o.role === 'father');
        const b = os.filter((o) => !o.primary && o.kind === 'alternative');
        if (!a.length || !b.length) throw new Error(`нет двух отцов у ${child}`);
        const id = `r-father-${child.slice(2)}`;
        const label = (xs: Origin[]) => xs.map((o) => `${actor(o.parent!).names[0].form} (${o.refs.join('; ')})`).join(', ');
        const cert = b.some((o) => o.cert === 'interpretation') ? 'interpretation' : b.some((o) => o.cert === 'inference') ? 'inference' : 'scripture';
        sets.push({
          id, title: `Отец: ${actor(child).names[0].form}`, refs: [...new Set([...a, ...b].flatMap((o) => o.refs))],
          readings: [
            { id: 'a', label: label(a), cert: a[0].cert, refs: a[0].refs },
            { id: 'b', label: label(b), cert, refs: [...new Set(b.flatMap((o) => o.refs))] },
          ],
          default: 'a',
          note: 'Разные места текста называют разных отцов. Прочтение по умолчанию — основное ребро прежних данных; объяснения согласования — толкования.',
        });
        for (const o of a) o.reading = { set: id, in: ['a'] };
        for (const o of b) o.reading = { set: id, in: ['b'] };
      }
      base.readings.push(...sets);
      return {
        what: `Наборы прочтений для двух отцов одного лица по разным местам текста (${sets.length}): ${DOUBLE_FATHERS.map((c) => actor(c).names[0].form).join(', ')}`,
        why: 'Иначе расчёт выводит ложное родство: Кис выходит и сыном, и братом Нира (1Пар 8:33; 1Цар 14:51) (02, § 3.4; рецензия Д1, № 5)',
        refs: ['1Пар 8:33', '1Цар 14:51'],
        actors: [],
      };
    },
  },
];

export function makeCtx(base: Base, hints: Hints): Ctx {
  return {
    base, hints,
    at: new Date().toISOString().slice(0, 10),
    actor: (id) => {
      for (const v of base.volumes) for (const a of v.actors) if (a.id === id) return a;
      throw new Error(`нет лица ${id}`);
    },
    origin: (child, parent, primary) => {
      const o = base.origins.find((o) => o.child === child && o.parent === parent && (primary === undefined || o.primary === primary));
      if (!o) throw new Error(`нет происхождения ${child} ← ${parent}`);
      return o;
    },
  };
}

export function applyCorrections(base: Base, hints: Hints) {
  const ctx = makeCtx(base, hints);
  for (const s of STEPS) base.corrections.push({ id: s.id, ...s.run(ctx) });
}
