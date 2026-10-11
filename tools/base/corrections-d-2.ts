/**
 * Шаги правки по задачам данных 02 § 3.18, первая партия — вторая очередь: исправления по второму ключу
 * (docs/app/reviews/Д-партия-1-второй-ключ.md) и решениям координатора. Шаги D5, D7, D2 (corrections-d.ts) уже в коммите
 * и не меняются: правка выпущенного шага — новый шаг. Перед этими шагами номера закрепляются (freezeIds), поэтому новые
 * записи получают номера после выданных, а сборка с пустой таблицей повторяет таблицу на диске.
 *
 * D5-2 (Д-5): один возможный тёзка (02 § 3.3.4 [4.2]; решение координатора, п. 1–3) — Маасея, Малхия, Товия, Мааха (двое),
 *      Иоиль: своя карточка по стиху, родство «Писание» к ней, отношение `possibly-same` («вывод») к известному лицу.
 *      Юния — слово текста «сродник». Устаревшие фразы примечаний карточек — по новым записям (п. 4). Примечания шага D5
 *      — без пометки «толкование» и без истории правок (п. 4). У Мереда и Иудии — «чья жена, текст прямо не говорит».
 * D7-2 (Д-7; п. 6): Садок при Давиде — модель m-dolgoe, как у Авиафара с теми же стихами. У записей, где прежде был
 *      только конец службы, событие расчёта — стих конца, если он есть в записи (Ирод Великий, Феликс); у Садока его нет.
 * D2-2 (Д-2; п. 5): у Иерохама и Ииуя — пропуск и перечень пропущенных (02 § 3.4); примечание Гофолии — строго по
 *      4Цар 8:18, со словом текста «дочь» (4Цар 8:26).
 */
import type { Step } from './corrections.ts';
import type { Actor, Ref } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });
const kinKey = (k: { from: string; to: string; rel: string }) => `kin:${k.from}|${k.to}|${k.rel}`;

// ---------------------------------------------------------------- D5-2

/**
 * (в) Один возможный тёзка (02 § 3.3.4 [4.2]; решение координатора по второму ключу, п. 3): своя карточка по стиху, родство
 * «Писание» к ней и отношение `possibly-same` («вывод», стихи обеих сторон) к известному лицу — не ребро к известному.
 */
const NAMESAKE: { from: string; to: string; rel: string; card: Actor; vol: string; after: string; relRefs: Ref[]; relNote: string }[] = [
  {
    from: 'p-maaseya-syn-akhaza', to: 'p-akhaz', rel: 'сын царя', vol: '13-kings-of-judah.json', after: 'p-maaseya-syn-akhaza',
    card: { id: 'p-tsar-2par28-7', kind: 'unnamed', sex: 'm', descriptor: 'царь', names: [{ form: 'Царь', type: 'main', refs: ['2Пар 28:7'] }], disambig: 'названный в словах «Маасею, сына царя» (2Пар 28:7)', facts: [] },
    relRefs: ['2Пар 28:1', '2Пар 28:7'],
    relNote: '«убил Маасею, сына царя» (2Пар 28:7) — в рассказе о царствовании Ахаза: «Двадцати лет был Ахаз, когда воцарился» (2Пар 28:1); в стихе царь не назван',
  },
  {
    from: 'p-malkhiya-syn-tsarya', to: 'p-sedekiya', rel: 'сын царя', vol: '13-kings-of-judah.json', after: 'p-malkhiya-syn-tsarya',
    card: { id: 'p-tsar-ier38-6', kind: 'unnamed', sex: 'm', descriptor: 'царь', names: [{ form: 'Царь', type: 'main', refs: ['Иер 38:6'] }], disambig: 'названный в словах «Малхии, сына царя» (Иер 38:6)', facts: [] },
    relRefs: ['Иер 38:5', 'Иер 38:6'],
    relNote: '«в яму Малхии, сына царя» (Иер 38:6); стихом раньше — «И сказал царь Седекия» (Иер 38:5); в стихе 38:6 царь не назван',
  },
  {
    from: 'p-toviya-ammonityanin', to: 'p-eliashiv-pervosvyashchennik', rel: 'близкий родственник', vol: '08-levi.json', after: 'p-eliashiv-pervosvyashchennik',
    card: {
      id: 'p-eliashiv-neem13-4', kind: 'human', sex: 'm', names: [{ form: 'Елиашив', type: 'main', refs: ['Неем 13:4'] }], disambig: 'священник, приставленный к комнатам (Неем 13:4)',
      facts: [
        { sec: 5, field: 'status', value: { text: '«священник Елиашив, приставленный к комнатам при доме Бога нашего»', refs: ['Неем 13:4'] } },
        { sec: 17, field: 'events', value: { text: 'Отделал для Товии большую комнату, «в которую прежде клали хлебное приношение»; Неемия узнал «о худом деле»', refs: ['Неем 13:5', 'Неем 13:7'] } },
        { sec: 23, field: 'scripture', value: { first: 'Неем 13:4', key: ['Неем 13:4-7'] } },
      ],
    },
    relRefs: ['Неем 13:4', 'Неем 3:1', 'Неем 13:28'],
    relNote: 'В Неем 13:4 — «священник Елиашив», а «великий священник» Елияшив назван в Неем 3:1 и 13:28; что это одно лицо, текст прямо не говорит',
  },
  {
    from: 'p-ioil-brat-nafana', to: 'p-nafan-otets-igala', rel: 'брат', vol: '19-court-and-heroes.json', after: 'p-nafan-otets-igala',
    card: { id: 'p-nafan-1par11-38', kind: 'human', sex: 'm', names: [{ form: 'Нафан', type: 'main', refs: ['1Пар 11:38'] }], disambig: 'брат Иоиля (1Пар 11:38)', facts: [{ sec: 23, field: 'scripture', value: { first: '1Пар 11:38' } }] },
    relRefs: ['1Пар 11:38', '2Цар 23:36'],
    relNote: '«Иоиль, брат Нафана» (1Пар 11:38); на этом месте перечня в 2Цар 23:36 стоит «Игал, сын Нафана»; тот ли это Нафан, текст прямо не говорит',
  },
  ...([['Шупим', 'p-shupim-syn-ira', 'p-shupim-1par7-15'], ['Хупим', 'p-khupim-syn-ira', 'p-khupim-1par7-15']] as const).map(([form, to, id]) => ({
    from: 'p-maakha-zhena-makhira', to, rel: 'сестра', vol: '10-tribes-b.json', after: to,
    card: { id, kind: 'human' as const, sex: 'm' as const, names: [{ form, type: 'main' as const, refs: ['1Пар 7:15'] }], disambig: 'брат Маахи, жены Махира (1Пар 7:15)', facts: [{ sec: 23, field: 'scripture', value: { first: '1Пар 7:15' } }] },
    relRefs: ['1Пар 7:12', '1Пар 7:15'],
    relNote: '«Махир взял в жену сестру Хупима и Шупима» (1Пар 7:15); в той же главе — «Шупим и Хупим, сыновья Ира» (1Пар 7:12); те ли это лица, текст прямо не говорит',
  })),
];

/**
 * Примечания карточек, которые говорили о прежнем виде записи («дана как толкование», «текст не называет его отца»), —
 * по новым записям (второй ключ, «устаревшие примечания»). Меняется только устаревшая фраза; поиск — по её тексту.
 */
const NOTE_FIX: { actor: string; was: string; now: string }[] = [
  {
    actor: 'p-maaseya-syn-akhaza',
    was: 'Ахазу при воцарении было двадцать лет (2 Пар 28:1; 4 Цар 16:2), а война Факея пришлась на начало его царствования; если Маасея — сын Ахаза, он был тогда ребёнком. Поэтому родство записано словами текста («сын царя»), без указания отца',
    now: '«Двадцати лет был Ахаз, когда воцарился» (2 Пар 28:1; 4 Цар 16:2); в рассказе о его царствовании Зихрий «убил Маасею, сына царя» (2 Пар 28:7). Сколько лет прошло от воцарения Ахаза до этой войны, текст не говорит. Родство записано словами текста («сын царя») к царю этого стиха; что это Ахаз, текст прямо не говорит',
  },
  { actor: 'p-ierameil-syn-tsarya', was: 'либо как придворное звание члена царского рода; текст не называет его отца', now: 'либо как придворное звание члена царского рода. Царь, сжёгший свиток, назван в том же рассказе: «который сожег Иоаким, царь Иудейский» (Иер 36:28)' },
  { actor: 'p-malkhiya-syn-tsarya', was: 'какой царь имеется в виду, текст не говорит', now: 'какой царь имеется в виду, текст не говорит: в Иер 38:5 говорит «царь Седекия», а в 38:6 царь не назван' },
  { actor: 'p-toviya-ammonityanin', was: 'но текст этого прямо не говорит; поэтому родство с первосвященником помечено как толкование', now: 'но текст этого прямо не говорит; поэтому родство записано к священнику Елиашиву этого стиха, а с первосвященником — только «возможно, то же лицо»' },
  { actor: 'p-maakha-zhena-makhira', was: 'Текст этого прямо не говорит; в атласе родство с ними помечено как толкование', now: 'Текст этого прямо не говорит; поэтому родство записано к Хупиму и Шупиму этого стиха, а с сыновьями Ира — только «возможно, то же лицо»' },
  ...['p-shupim-syn-ira', 'p-khupim-syn-ira'].map((actor) => ({
    actor,
    was: 'приняты здесь за тех же лиц, что «Шупим и Хупим, сыновья Ира» (1 Пар 7:12): та же пара имён в той же главе. Так как Махир — из колена Манассиина, а эти братья — из Вениаминова, отождествление помечено как толкование',
    now: '— возможно, те же лица, что «Шупим и Хупим, сыновья Ира» (1 Пар 7:12): та же пара имён в той же главе. Махир — из колена Манассиина, а эти братья названы в роде Вениамина; текст тождества не утверждает, поэтому это разные карточки с пометкой «возможно, то же лицо»',
  })),
  { actor: 'p-andronik', was: 'связь с Павлом дана как толкование', now: 'родство записано словом текста; в каком смысле оно сказано, текст не уточняет' },
  ...['p-irodion', 'p-luciy-srodnik', 'p-iason-srodnik', 'p-sosipatr-srodnik'].map((actor) => ({ actor, was: 'связь с Павлом дана как толкование', now: 'родство записано словом текста; в каком смысле оно сказано, текст не уточняет' })),
  { actor: 'p-mariya-kleopova', was: 'Связь «сестра» с Марией, Матерью Иисуса, дана как толкование', now: 'Родство «сестра» записано по словам стиха; что Мария Клеопова и есть «сестра Матери Его», текст прямо не говорит' },
  { actor: 'p-iuda-brat-gospoden', was: 'На нём основана связь «брат» с Иаковом', now: 'Поэтому родство «брат» с Иаковом, братом Господним, не записано' },
];


/** Примечания шага D5 — без пометки «толкование» и без истории правок (п. 4): только слова текста. */
const D5_NOTES: { actor: string; kind: 'identification' | 'textual'; text: string; refs: Ref[] }[] = [
  {
    actor: 'p-iuda-brat-gospoden', kind: 'identification', refs: ['Иуд 1:1', 'Мф 13:55'],
    text: 'Автор послания называет себя: «Иуда, раб Иисуса Христа, брат Иакова» (Иуд 1:1). Тот ли это Иуда, что назван среди братьев Иисуса (Мф 13:55), и тот ли это Иаков, текст не говорит; родство «брат» с Иаковом, братом Господним, не записано',
  },
  {
    actor: 'p-mariya-kleopova', kind: 'identification', refs: ['Ин 19:25', 'Лк 24:18'],
    text: '«Мария Клеопова» (Ин 19:25): кем она приходится Клеопе и тот ли это Клеопа, что в Лк 24:18, текст не говорит; союз с Клеопой не записан',
  },
  ...['p-ioann-deyan4-6', 'p-aleksandr-deyan4-6'].map((actor) => ({
    actor, kind: 'textual' as const, refs: ['Деян 4:6'],
    text: '«и Анна первосвященник, и Каиафа, и Иоанн, и Александр, и прочие из рода первосвященнического» (Деян 4:6) — родство с Анной текст не называет',
  })),
];

const MERED_NOTE = { was: 'чья жена: Мереда или Иефера, названных в 1Пар 4:17, — текст прямо не говорит', now: 'чья жена, текст прямо не говорит: в 1Пар 4:17 названы Езра и его сыновья Иефер и Меред' };
const YUNIYA = { from: 'p-yuniya', to: 'p-pavel', rel: 'сродница', now: 'сродник' };

// ---------------------------------------------------------------- D7-2

const SADOK = { actor: 'p-sadok', refs: '2Цар 8:17;2Цар 20:25;1Пар 18:16' };
const END_ONLY: { actor: string; refs: string; event: string }[] = [
  { actor: 'p-irod-velikiy', refs: 'Лк 1:5;Мф 2:1;Мф 2:22', event: 'конец — Мф 2:22' },
  { actor: 'p-feliks', refs: 'Деян 23:24;Деян 24:27', event: 'конец — Деян 24:27' },
];

// ---------------------------------------------------------------- D2-2

const SKIPPED: { c: string; p: string; actors: string[]; refs: Ref[] }[] = [
  // пропущенных называет другое место — перечень, от родителя к ребёнку (02 § 3.4, «Пропуск поколений»)
  { c: 'p-ierokham-syn-pashkhura', p: 'p-pashkhur-syn-malkhii', actors: ['p-zakhariya-syn-pashkhura', 'p-amtsiy-syn-zakharii', 'p-felaliya'], refs: ['Неем 11:12'] },
  { c: 'p-iiuy', p: 'p-namessiy', actors: ['p-iosafat-syn-namessii'], refs: ['4Цар 9:2', '4Цар 9:14'] },
];
const GOFOLIYA = {
  c: 'p-gofoliya', p: 'p-amvriy',
  refs: ['4Цар 8:26', '2Пар 22:2', '4Цар 8:18', '4Цар 8:25', '4Цар 8:27', '3Цар 16:28'],
  note: '«Гофолия, дочь Амврия» (4Цар 8:26; 2Пар 22:2) — мать Охозии, сына Иорама (4Цар 8:25–26). Об Иораме сказано: «дочь Ахава была женою его» (4Цар 8:18); об Охозии — «он был в родстве с домом Ахавовым» (4Цар 8:27). Ахав — сын Амврия: «И воцарился Ахав, сын его, вместо него» (3Цар 16:28)',
  words: [{ text: 'Гофолия, дочь Амврия', ref: '4Цар 8:26' }],
};

const okey = (c: string, p: string) => `origin:${c}|${p}|`;

export const STEPS_D_2: Step[] = [
  {
    id: 'D5-2',
    scope: [
      ...NAMESAKE.flatMap((x) => [kinKey(x), kinKey({ ...x, to: x.card.id }), `actor:${x.card.id}`, `volume:${x.vol}`, `relation:${x.card.id}|${x.to}|`]),
      kinKey(YUNIYA), kinKey({ ...YUNIYA, rel: YUNIYA.now }), 'union:u-mered--iudiya',
      ...NOTE_FIX.map((x) => `actor:${x.actor}.facts.notes`), ...D5_NOTES.map((x) => `actor:${x.actor}.facts.notes`),
    ],
    run: ({ base, actor }) => {
      const kin = (k: { from: string; to: string; rel: string }) => {
        const xs = base.kin.filter((y) => y.from === k.from && y.to === k.to && y.rel === k.rel);
        if (xs.length !== 1) throw new Error(`D5-2: ${k.from} — ${k.to} «${k.rel}»: ожидалась одна запись`);
        return xs[0];
      };
      // один возможный тёзка: карточка по стиху, родство «Писание» к ней, «возможно, то же лицо» — к известному
      for (const n of NAMESAKE) {
        const x = kin(n);
        const vol = base.volumes.find((v) => v.file === n.vol);
        if (!vol) throw new Error(`D5-2: нет тома ${n.vol}`);
        if (!vol.actors.some((a) => a.id === n.card.id)) {
          const card: Actor = { ...structuredClone(n.card), facts: n.card.facts.map((f) => ({ ...structuredClone(f), prov: by('D5-2') })), prov: { ...by('D5-2'), status: 'draft' } };
          vol.actors.splice(vol.actors.findIndex((a) => a.id === n.after) + 1, 0, card);
        }
        delete x.identity;
        Object.assign(x, { to: n.card.id, cert: 'scripture', refs: [n.card.names[0].refs[0]], prov: { ...x.prov, ...by('D5-2') } });
        base.relations.push({ a: n.card.id, b: n.to, kind: 'possibly-same', refs: [...n.relRefs], cert: 'inference', note: n.relNote, prov: { ...by('D5-2'), status: 'draft' } });
      }
      // Юния: в стихе — «сродников» (общее для Андроника и Юнии); слова «сродница» в тексте нет
      const y = kin(YUNIYA);
      Object.assign(y, { rel: YUNIYA.now, prov: { ...y.prov, ...by('D5-2') } });
      // Меред и Иудия: «его» может относиться и к Езре (1Пар 4:17)
      const t = base.unions.find((u) => u.id === 'u-mered--iudiya')?.terms.find((x) => x.identity);
      if (!t?.identity?.note.includes(MERED_NOTE.was)) throw new Error('D5-2: нет примечания тождества у союза Мереда и Иудии');
      t.identity.note = t.identity.note.replace(MERED_NOTE.was, MERED_NOTE.now);
      // устаревшие фразы примечаний карточек — по новым записям
      for (const x of NOTE_FIX) {
        const fs = actor(x.actor).facts.filter((f) => f.field === 'notes' && typeof (f.value as any)?.text === 'string' && (f.value as any).text.includes(x.was));
        if (fs.length !== 1) throw new Error(`D5-2: ${x.actor}: ожидалось одно примечание со словами «${x.was.slice(0, 40)}…», найдено ${fs.length}`);
        const v = fs[0].value as { text: string };
        v.text = v.text.replace(x.was, x.now);
        fs[0].prov = { ...fs[0].prov, ...by('D5-2') };
      }
      // примечания шага D5 — без пометки «толкование» и без истории правок; номер записи тот же
      for (const x of D5_NOTES) {
        const fs = actor(x.actor).facts.filter((f) => f.prov?.by === 'исправление D5' && f.field === 'notes');
        if (fs.length !== 1) throw new Error(`D5-2: ${x.actor}: ожидалось одно примечание шага D5`);
        const f = fs[0];
        delete f.cert;
        delete f.needsSources;
        f.value = { kind: x.kind, text: x.text, refs: [...x.refs] };
        f.prov = { ...f.prov, ...by('D5-2') };
      }
      return {
        what: `Д-5 по второму ключу: один возможный тёзка — ${NAMESAKE.length} записей родства (Маасея, Малхия, Товия, Мааха — двое, Иоиль): своя карточка по стиху, родство «Писание» к ней и «возможно, то же лицо» («вывод») к известному лицу; Юния — «сродник»; устаревшие фразы примечаний — ${NOTE_FIX.length}; примечания шага D5 (${D5_NOTES.length}) — без «толкования» и истории правок; Меред и Иудия — «чья жена, текст прямо не говорит»`,
        why: '02 § 3.3.4 [4.2] (один возможный тёзка — своя карточка и possibly-same); второй ключ — reviews/Д-партия-1-второй-ключ.md; решения координатора, п. 1–4',
        refs: ['2Пар 28:1', '2Пар 28:7', 'Иер 38:5-6', 'Неем 13:4', 'Неем 3:1', 'Неем 13:28', '1Пар 7:12', '1Пар 7:15', '1Пар 11:38', '2Цар 23:36', 'Рим 16:7'],
        actors: [...new Set([...NAMESAKE.flatMap((x) => [x.from, x.to, x.card.id]), ...NOTE_FIX.map((x) => x.actor), ...D5_NOTES.map((x) => x.actor), 'p-yuniya', 'p-mered', 'p-iudiya'].map((x) => x.slice(2)))],
        other: ['relations'],
      };
    },
  },
  {
    id: 'D7-2',
    scope: [`actor:${SADOK.actor}.facts.offices`, ...END_ONLY.map((x) => `actor:${x.actor}.facts.offices`)],
    run: ({ actor }) => {
      const fact = (id: string, refs: string) => {
        const fs = actor(id).facts.filter((f) => f.field === 'offices' && f.calc && (f.value as any)?.refs?.join(';') === refs);
        if (fs.length !== 1) throw new Error(`D7-2: ${id} ${refs}: ожидалась одна запись со ссылкой на расчёт`);
        return fs[0];
      };
      const s = fact(SADOK.actor, SADOK.refs);
      s.calc = { event: s.calc!.event, model: 'm-dolgoe' };
      s.prov = { ...s.prov, ...by('D7-2') };
      for (const x of END_ONLY) {
        const f = fact(x.actor, x.refs);
        f.calc = { ...f.calc!, event: x.event };
        f.prov = { ...f.prov, ...by('D7-2') };
      }
      return {
        what: 'Д-7 по второму ключу: Садок при Давиде — модель m-dolgoe (как у Авиафара); у Ирода Великого и Феликса прежде был только конец службы — событие расчёта — стих конца (Мф 2:22; Деян 24:27)',
        why: 'Второй ключ (reviews/Д-партия-1-второй-ключ.md, Д-7); решение координатора, п. 6',
        refs: ['2Цар 8:17', 'Мф 2:22', 'Деян 24:27'],
        actors: ['sadok', 'irod-velikiy', 'feliks'],
      };
    },
  },
  {
    id: 'D2-2',
    scope: [...SKIPPED.map((x) => okey(x.c, x.p)), okey(GOFOLIYA.c, GOFOLIYA.p)],
    run: ({ base }) => {
      const edge = (c: string, p: string) => {
        const xs = base.origins.filter((o) => o.child === c && o.parent === p && o.degree === 'inferred');
        if (xs.length !== 1) throw new Error(`D2-2: ${c} ← ${p}: ожидалось одно ребро «степень выведена»`);
        return xs[0];
      };
      for (const x of SKIPPED) {
        const o = edge(x.c, x.p);
        Object.assign(o, { gap: true, skipped: { actors: [...x.actors], refs: [...x.refs] }, prov: { ...o.prov, ...by('D2-2') } });
      }
      const g = edge(GOFOLIYA.c, GOFOLIYA.p);
      Object.assign(g, { refs: [...GOFOLIYA.refs], note: GOFOLIYA.note, words: GOFOLIYA.words.map((w) => ({ ...w })), prov: { ...g.prov, ...by('D2-2') } });
      return {
        what: 'Д-2 по второму ключу: у Иерохама (Неем 11:12) и Ииуя (4Цар 9:2, 14) — пропуск и перечень пропущенных; примечание Гофолии — строго по 4Цар 8:18, 25–27 и 3Цар 16:28, слово текста «дочь» (4Цар 8:26)',
        why: '02 § 3.4 («Пропуск поколений»: пропущенные, которых называет другое место, — перечнем); второй ключ; решение координатора, п. 5',
        refs: ['Неем 11:12', '4Цар 9:2', '4Цар 9:14', '4Цар 8:18', '4Цар 8:25-27'],
        actors: ['ierokham-syn-pashkhura', 'pashkhur-syn-malkhii', 'iiuy', 'namessiy', 'gofoliya', 'amvriy'],
      };
    },
  },
];
