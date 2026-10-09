/**
 * Исправления при переносе (docs/app/02-ДАННЫЕ.md, § 3.4–3.6, § 9, этап Д1.3). Каждое исправление записано в
 * base/corrections.json с основанием и списком затронутых лиц; обратная проекция объясняет разницу только ими.
 */
import type { Base } from './migrate.ts';
import type { Hints } from './project.ts';
import type { Correction, Origin } from './types.ts';

export function applyCorrections(base: Base, hints: Hints) {
  const actor = (id: string) => {
    for (const v of base.volumes) for (const a of v.actors) if (a.id === id) return a;
    throw new Error(`нет лица ${id}`);
  };
  const origin = (child: string, parent: string, primary?: boolean) => {
    const o = base.origins.find((o) => o.child === child && o.parent === parent && (primary === undefined || o.primary === primary));
    if (!o) throw new Error(`нет происхождения ${child} ← ${parent}`);
    return o;
  };
  const fix = (c: Correction) => base.corrections.push(c);
  const at = new Date().toISOString().slice(0, 10);

  // ---------- C1. Лк 3:23 — Илий ----------
  const HELI_OLD = 'p-iliy-otets-marii';
  const HELI = 'p-iliy-syn-matfata';
  base.readings.push({
    id: 'r-lk3-23',
    title: 'Лк 3:23 — чей сын Илий',
    refs: ['Лк 3:23'],
    readings: [
      { id: 'letter', label: 'По букве текста: Иосиф — «Илиев»; линия Луки кончается Иосифом', cert: 'scripture', refs: ['Лк 3:23'] },
      { id: 'mary', label: 'Толкование: Лк 3 — родословие Марии, Илий — Её отец, Иосиф назван как Её муж', cert: 'interpretation', refs: ['Лк 3:23', 'Лк 1:32', 'Рим 1:3'] },
    ],
    default: 'letter',
    note:
      'По букве Лк 3:23 Иисус «был, как думали, Сын Иосифов, Илиев»: Илий назван отцом Иосифа, хотя в Мф 1:16 «Иаков родил Иосифа». ' +
      'Объяснения расхождения — толкования: родословие Марии (Илий — Её отец); законное отцовство или брак с женой умершего брата. ' +
      'Расчёт родства и схемы не складывают оба прочтения: при прочтении «по букве» Илий не отец Марии, при толковании — не отец Иосифа.',
  });
  // переименование: прежний номер навязывал толкование
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
  for (const v of base.volumes) for (const a of v.actors) for (const f of a.facts) if (f.field === 'met' && (f.value as any).id === HELI_OLD) (f.value as any).id = HELI;
  for (const l of Object.values<any>(base.lines)) for (const s of l.persons) if (s.id === HELI_OLD) s.id = HELI;
  if (hints.persons[HELI_OLD]) {
    hints.persons[HELI] = hints.persons[HELI_OLD];
    delete hints.persons[HELI_OLD];
  }
  base.redirects.push({ from: HELI_OLD, to: [HELI], reason: 'прежний номер «отец Марии» выдавал толкование за факт (r-lk3-23)', refs: ['Лк 3:23'], at });
  // Иосиф — «Илиев» по букве
  const josephHeli = origin('p-iosif-muzh-marii', HELI, false);
  josephHeli.reading = { set: 'r-lk3-23', reading: 'letter' };
  josephHeli.note = 'Лк 3:23: «как думали, Сын Иосифов, Илиев»; Мф 1:16: «Иаков родил Иосифа» — объяснения в наборе прочтений r-lk3-23';
  // Мария — дочь Илия только по толкованию
  const maryHeli = origin('p-mariya', HELI, true);
  Object.assign(maryHeli, { primary: false, kind: 'by-luke', cert: 'interpretation', refs: ['Лк 3:23'], reading: { set: 'r-lk3-23', reading: 'mary' } });
  maryHeli.note = 'по толкованию Лк 3:23 как родословия Марии; Писание прямо не называет родителей Марии';
  // «зять» в стихе нет
  base.kin = base.kin.filter((k) => !(k.from === 'p-iosif-muzh-marii' && k.to === HELI && k.rel.startsWith('зять')));
  fix({
    id: 'C1',
    what: 'Лк 3:23: набор прочтений r-lk3-23; Илий переименован (iliy-otets-marii → iliy-syn-matfata) с нейтральным уточнением; Мария ← Илий — дополнительное происхождение по толкованию; убрана связь «зять», которой нет в стихе',
    why: 'Прежние данные делали Илия одновременно отцом Иосифа (Лк 3:23) и отцом Марии (толкование) — Иосиф и Мария выходили братом и сестрой (рецензия библеиста, 02 Б1)',
    refs: ['Лк 3:23', 'Мф 1:16'],
    actors: ['iliy-otets-marii', 'mariya', 'iosif-muzh-marii'],
  });

  // ---------- C2. «Мои они» (Быт 48:5–6) ----------
  for (const id of ['p-efrem', 'p-manassiya']) {
    const o = origin(id, 'p-iakov', false);
    base.origins = base.origins.filter((x) => x !== o);
    actor(id).facts.push({
      sec: 6, field: 'parentsNote',
      value: { text: 'Иаков говорит Иосифу о его сыновьях: «мои они; Ефрем и Манассия, как Рувим и Симеон, будут мои» — о наследстве и уделе: дети Иосифа, родившиеся после них, «под именем братьев своих будут именоваться в их уделе»', refs: ['Быт 48:5-6'] },
    });
  }
  fix({
    id: 'C2',
    what: 'Ефрем и Манассия: ребро «приёмный отец Иаков» заменено утверждением со словами Быт 48:5–6',
    why: 'Слова «мои они» — о наследстве и уделе (48:6); ребро делало Ефрема сыном Иакова и братом собственного отца (02, § 3.6)',
    refs: ['Быт 48:5-6'],
    actors: ['efrem', 'manassiya'],
  });

  // ---------- C3. Иосиф и Иисус Христос ----------
  const jj = origin('p-iisus', 'p-iosif-muzh-marii', true);
  Object.assign(jj, {
    kind: 'legal', cert: 'interpretation',
    words: [
      { text: 'Иосифа, мужа Марии, от Которой родился Иисус', ref: 'Мф 1:16' },
      { text: 'родители Его', ref: 'Лк 2:41' },
      { text: 'отец Твой', ref: 'Лк 2:48' },
      { text: 'как думали, Сын Иосифов', ref: 'Лк 3:23' },
    ],
    note: 'Отца по плоти нет: «родившееся в Ней есть от Духа Святаго» (Мф 1:20). «Отец по закону» — толкование; связь подписывается словами текста',
  } satisfies Partial<Origin>);
  const jm = origin('p-iisus', 'p-mariya', true);
  jm.cert = 'scripture';
  fix({
    id: 'C3',
    what: 'Иисус Христос ← Иосиф: законное, «толк.», со словами текста (Мф 1:16; Лк 2:41, 48; 3:23) и примечанием Мф 1:20; мать — Мария, «Писание»',
    why: 'Модель «Бог и человек» (02, § 3.5): отца по плоти нет; «отец по закону» — толкование',
    refs: ['Мф 1:16', 'Мф 1:20', 'Лк 2:41', 'Лк 2:48', 'Лк 3:23'],
    actors: ['iisus'],
  });

  // ---------- C4. Справочные сведения без источника ----------
  const c4: string[] = [];
  for (const v of base.volumes) {
    for (const a of v.actors) {
      for (const f of a.facts) {
        if (f.field !== 'meaning') continue;
        const val = f.value as { refs?: string[] };
        if (f.cert === 'interpretation' && !val.refs?.length) {
          f.cert = 'reference';
          f.prov = { status: 'quarantine', note: 'значение имени без стиха и без источника; источник — этап Д1.5' };
          c4.push(hints.idmap[a.id] ?? a.id.slice(2));
        }
      }
    }
  }
  fix({
    id: 'C4',
    what: `Значение имени без стиха (${c4.length}): «толк.» → «справочно», статус «карантин» до указания источника`,
    why: 'Значение имени, которого не даёт само Писание, — справочное сведение и требует источника (02, § 3.1, § 7)',
    refs: [],
    actors: c4,
  });

  // ---------- C5. Каинан — возможный пропуск ----------
  origin('p-sala', 'p-arfaksad', true).gapPossible = ['Лк 3:36'];
  fix({
    id: 'C5',
    what: 'Арфаксад → Сала: возможный пропуск поколения (Лк 3:36); Каинан остаётся по Луке',
    why: 'Каинан есть в основном тексте Лк 3:36, в Быт 11:12 — только в скобках: это пропуск, а не иное прочтение (02, § 3.4)',
    refs: ['Лк 3:36', 'Быт 11:12'],
    actors: [],
  });

  // ---------- C6. Наборы прочтений: Салафиил и Зоровавель ----------
  base.readings.push(
    {
      id: 'r-shealtiel', title: 'Отец Салафиила', refs: ['Мф 1:12', '1Пар 3:17', 'Лк 3:27'],
      readings: [
        { id: 'iekhoniya', label: 'Иехония (Мф 1:12; 1Пар 3:17)', cert: 'scripture', refs: ['Мф 1:12', '1Пар 3:17'] },
        { id: 'niriy', label: 'Нирий (Лк 3:27)', cert: 'scripture', refs: ['Лк 3:27'] },
      ],
      default: 'iekhoniya',
      note: 'Оба места — основной текст. Каждая линия идёт по своему месту; объяснения согласования — толкования (примечания карточки).',
    },
    {
      id: 'r-zerubbabel', title: 'Отец Зоровавеля', refs: ['Мф 1:12', 'Лк 3:27', 'Езд 3:2', 'Агг 1:1', '1Пар 3:19'],
      readings: [
        { id: 'salafiil', label: 'Салафиил (Мф 1:12; Лк 3:27; Езд 3:2; Агг 1:1)', cert: 'scripture', refs: ['Мф 1:12', 'Лк 3:27', 'Езд 3:2', 'Агг 1:1'] },
        { id: 'fedaiya', label: 'Федаия (1Пар 3:19)', cert: 'scripture', refs: ['1Пар 3:19'] },
      ],
      default: 'salafiil',
      note: 'Оба места — основной текст. Объяснения согласования — толкования (примечания карточки).',
    },
  );
  origin('p-salafiil', 'p-iekhoniya', true).reading = { set: 'r-shealtiel', reading: 'iekhoniya' };
  origin('p-salafiil', 'p-niriy', false).reading = { set: 'r-shealtiel', reading: 'niriy' };
  origin('p-zorovavel', 'p-salafiil', true).reading = { set: 'r-zerubbabel', reading: 'salafiil' };
  origin('p-zorovavel', 'p-fedaiya-syn-iekhonii', false).reading = { set: 'r-zerubbabel', reading: 'fedaiya' };
  fix({
    id: 'C6',
    what: 'Наборы прочтений r-shealtiel и r-zerubbabel; рёбра отцов Салафиила и Зоровавеля помечены прочтениями',
    why: 'Два отца одного лица по разным местам основного текста не складываются в схемах и расчёте (02, § 3.4)',
    refs: ['Мф 1:12', 'Лк 3:27', '1Пар 3:17-19'],
    actors: [],
  });

  // ---------- C7. Линия Луки ----------
  const lk = base.lines.mary;
  const i = lk.persons.findIndex((s: any) => s.id === 'p-mariya');
  if (i < 0) throw new Error('в линии Луки нет Марии');
  lk.persons.splice(i, 1, { id: 'p-iosif-muzh-marii', lk: 1, refs: ['Лк 3:23'], flag: 'in-text' });
  lk.subtitle = 'Лк 3:23–38; по распространённому толкованию — родословие Марии';
  lk.basis =
    'Лк 3:23–38: Иисус «был, как думали, Сын Иосифов, Илиев» — и так до Адама. По букве текста линия кончается Иосифом. ' +
    'По распространённому толкованию это родословие Марии (Илий — Её отец); Давидово происхождение Иисуса по плоти: Лк 1:32; Рим 1:3; Деян 2:30; 2Тим 2:8. ' +
    'Понимания — в наборе прочтений r-lk3-23.';
  lk.reading = 'r-lk3-23';
  fix({
    id: 'C7',
    what: 'Линия по Луке кончается Иосифом (Лк 3:23), шаг «Мария» убран; подзаголовок и основание без «Илий — отец Марии» как факта',
    why: 'Линия по букве текста; толкование — в наборе прочтений (02, § 3.4; рецензия библеиста Б1)',
    refs: ['Лк 3:23'],
    actors: [],
    other: ['line:mary'],
  });
}
