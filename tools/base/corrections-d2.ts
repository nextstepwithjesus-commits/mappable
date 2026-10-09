/**
 * Правки этапа Д2 (docs/app/reviews/очередь-спорных-мест.md): по повторным рецензиям документа 03 (Д2-03-1…9),
 * по документу 07 (Д2-07-1…5) и по решению совета о скобках (Д2-С-3…5; reviews/R10-решение-совета.md § 10 п. 6).
 *
 * Каждая задача — отдельный шаг с объявленной областью действия, как шаги C1–C12 (corrections.ts). Стихи сверены
 * командой `npm run -s verse`; слова в скобках Синодального текста — по таблице tools/bible/brackets.tsv (02 § 3.8).
 */
import type { Step } from './corrections.ts';
import type { Actor, Assertion } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });

/** Утверждение поля `field` у лица, чей текст содержит `has`; ровно одно. */
function one(a: Actor, field: string, has: string): Assertion {
  const xs = a.facts.filter((f) => f.field === field && JSON.stringify(f.value).includes(has));
  if (xs.length !== 1) throw new Error(`${a.id}: утверждений ${field} со словами «${has}» — ${xs.length}`);
  return xs[0];
}
function drop(a: Actor, f: Assertion) {
  const i = a.facts.indexOf(f);
  if (i < 0) throw new Error(`${a.id}: нет утверждения`);
  a.facts.splice(i, 1);
}
/** Поставить утверждение после последнего утверждения того же раздела (порядок карточки сохраняется). */
function put(a: Actor, f: Assertion) {
  let i = -1;
  a.facts.forEach((x, k) => {
    if (x.sec <= f.sec) i = k;
  });
  a.facts.splice(i + 1, 0, f);
}

const KHULITEL_MOTHER = 'p-mat-khulitelya';
const DAVRIIN = 'p-davriin';
const VOL18 = '18-tribal-leaders.json';

export const STEPS_D2: Step[] = [
  // ---------- скобки: решение совета (Д2-С-3…С-5) ----------
  {
    id: 'C13',
    scope: [`actor:${KHULITEL_MOTHER}.`, `actor:${DAVRIIN}.`, `origin:${KHULITEL_MOTHER}|${DAVRIIN}|`, `membership:${KHULITEL_MOTHER}|g-dan`, `volume:${VOL18}`],
    run: ({ base, actor }) => {
      const m = actor(KHULITEL_MOTHER);
      if (m.kind !== 'unnamed') throw new Error('мать хулителя уже названа');
      m.kind = 'human';
      m.names = [{ form: 'Саломиф', type: 'main', refs: ['Лев 24:11'] }];
      m.disambig = 'дочь Давриина, мать хулителя (Лев 24:10–11)';
      const P = by('C13');
      drop(m, one(m, 'notes', 'Скобки не служат основанием факта'));
      const lin = one(m, 'lineage', 'родившейся от Египтянина');
      lin.value = { text: '«Имя же матери его Саломиф, дочь Давриина, из племени Данова»', refs: ['Лев 24:11'] };
      lin.prov = P;
      const tx = one(m, 'notes', 'Имя её отца текст не называет');
      tx.value = {
        kind: 'textual',
        text: 'Слова «сын одной Израильтянки, родившейся от Египтянина» (Лев 24:10) в Синодальном тексте грамматически можно отнести к ней самой; но стих 11 называет её отца — Давриин, из племени Данова. В еврейском тексте Египтянином назван отец её сына (справочно)',
        refs: ['Лев 24:10', 'Лев 24:11'],
      };
      tx.prov = P;
      const vol = base.volumes.find((v) => v.file === VOL18)!;
      const d: Actor = {
        id: DAVRIIN, kind: 'human', sex: 'm',
        names: [{ form: 'Давриин', type: 'main', refs: ['Лев 24:11'] }],
        disambig: 'отец Саломифи, из племени Данова (Лев 24:11)',
        facts: [
          { sec: 10, field: 'childrenNote', value: { text: '«Саломиф, дочь Давриина, из племени Данова» — мать сына Израильтянки, хулившего имя Господне', refs: ['Лев 24:11'] }, prov: P },
          { sec: 23, field: 'scripture', value: { first: 'Лев 24:11' }, prov: P },
        ],
        prov: { ...P, status: 'draft' },
      };
      vol.actors.splice(vol.actors.indexOf(m) + 1, 0, d);
      base.origins.push({ child: KHULITEL_MOTHER, parent: DAVRIIN, role: 'father', kind: 'natural', refs: ['Лев 24:11'], cert: 'scripture', primary: true, prov: P });
      base.memberships.push({ actor: KHULITEL_MOTHER, area: 'g-dan', basis: 'named', refs: ['Лев 24:11'], prov: P });
      return {
        what: 'Мать хулителя названа по Лев 24:11: Саломиф, дочь Давриина, из племени Данова; добавлен Давриин и ребро Давриин → Саломиф; членство в колене Дановом; примечание «скобки не основание» снято, примечание о Лев 24:10 поправлено',
        why: 'Слова Лев 24:11 в квадратных скобках — пояснение самого текста (вид «б»), проверено советом по WLC: основание факта (решение совета R10, § 8.1, § 10 п. 6; Д2-С-3)',
        refs: ['Лев 24:10-11'],
        actors: ['mat-khulitelya', 'davriin'],
      };
    },
  },
  {
    id: 'C14',
    scope: ['actor:p-finees.facts.events', 'actor:p-finees.facts.notes'],
    run: ({ actor }) => {
      const f = actor('p-finees');
      drop(f, one(f, 'notes', 'Суд 20:27'));
      put(f, {
        sec: 17, field: 'events', prov: by('C14'),
        value: { text: 'Когда сыны Израилевы вопрошали Господа о войне с сынами Вениамина, «ковчег завета Божия находился там, и Финеес, сын Елеазара, сына Ааронова, предстоял пред ним»', refs: ['Суд 20:27-28'] },
      });
      return {
        what: 'Финеес, сын Елеазара: событие «предстоял пред ковчегом завета Божия во время войны с Вениамином» (Суд 20:27–28); примечание «атлас не строит на них фактов» снято',
        why: 'Суд 20:27–28 в скобках — пояснение самого текста (вид «б»), проверено советом по WLC (R10, § 8.1, § 10 п. 6; Д2-С-3)',
        refs: ['Суд 20:27-28'],
        actors: ['finees'],
      };
    },
  },
  {
    id: 'C15',
    scope: ['actor:p-eldad.facts.', 'actor:p-modad.facts.', 'actor:p-gedeon.facts.', 'actor:p-samson.facts.', 'actor:p-iarkha.facts.', 'actor:p-ioann-mark.facts.'],
    run: ({ actor }) => {
      const P = by('C15');
      // Чис 11:26 — пояснение самого текста: факт о Елдаде и Модаде
      for (const id of ['p-eldad', 'p-modad']) {
        const a = actor(id);
        drop(a, one(a, 'notes', 'из числа записанных'));
        put(a, { sec: 5, field: 'status', prov: P, value: { text: '«Они были из числа записанных, только не выходили к скинии»', refs: ['Чис 11:26'] } });
      }
      // Суд 8:24 — пояснение о врагах: часть события о серьгах, а не примечание о скобках
      const g = actor('p-gedeon');
      drop(g, one(g, 'notes', 'Измаильтяне'));
      const ear = one(g, 'events', 'золотых серёг');
      ear.value = { text: 'Попросил у Израильтян по серьге из добычи — «ибо у неприятелей много было золотых серег, потому что они были Измаильтяне»; из золота сделал ефод и положил в Офре; Израиль стал блудно ходить туда, и ефод стал сетью ему и дому его', refs: ['Суд 8:24-27'] };
      ear.prov = P;
      // Суд 16:9, 12 — засада в спальне: текст; Суд 16:13–14 — вставки по греческому (не основание)
      const s = actor('p-samson');
      const sn = one(s, 'notes', 'засаде в спальне');
      sn.value = { kind: 'bracket', text: 'Часть подробностей Суд 16:13–14 (об усыплении Далидой и о прикреплении волос к ткани) стоит в скобках Синодального текста — дополнение по греческому переводу; данные строятся по основному тексту', refs: ['Суд 16:13-14'] };
      sn.prov = P;
      const de = one(s, 'events', 'Трижды обманул Далиду');
      de.value = { text: 'Трижды обманул Далиду: сырые тетивы, новые верёвки, косы, прибитые к колоде; когда она связывала его тетивами и верёвками, «между тем один скрытно сидел… в спальне»', refs: ['Суд 16:6-14'] };
      de.prov = P;
      // 1Пар 2:35 «рабу своему» — текст: ссылка добавляется к утверждению, примечание о скобках снято
      const i = actor('p-iarkha');
      drop(i, one(i, 'notes', 'рабу своему'));
      // Кол 4:10 — продолжение стиха: событие о Марке
      const mk = actor('p-ioann-mark');
      drop(mk, one(mk, 'notes', 'Продолжение Кол 4:10'));
      put(mk, { sec: 17, field: 'events', prov: P, value: { text: 'Павел пишет колоссянам о Марке, племяннике Варнавы: «о котором вы получили приказания: если придет к вам, примите его»', refs: ['Кол 4:10'] } });
      return {
        what: 'Примечания kind «bracket» у мест вида «б» пересмотрены по таблице скобок: Елдад и Модад — «из числа записанных» (Чис 11:26) стало фактом; Гедеон — пояснение Суд 8:24 внесено в событие о серьгах; Самсон — засада в спальне (Суд 16:9, 12) внесена в событие о Далиде, примечание оставлено только о Суд 16:13–14 (вид «а»); Иарха — примечание о скобках снято (1Пар 2:34–35 уже основание); Иоанн Марк — продолжение Кол 4:10 стало событием',
        why: 'Решение совета R10, § 8.1 и § 10 п. 6: места «б» — текст Писания и основание факта (Д2-С-3)',
        refs: ['Чис 11:26', 'Суд 8:24', 'Суд 16:9', 'Суд 16:12', '1Пар 2:35', 'Кол 4:10'],
        actors: ['eldad', 'modad', 'gedeon', 'samson', 'iarkha', 'ioann-mark'],
      };
    },
  },
  {
    id: 'C16',
    scope: ['actor:p-ioann-mark.facts.places'],
    run: ({ actor }) => {
      const a = actor('p-ioann-mark');
      drop(a, one(a, 'places', 'Антиохия'));
      return {
        what: 'Иоанн Марк: место «Антиохия» по Деян 12:25 убрано',
        why: '«(в Антиохию)» в Деян 12:25 — вставка, которой нет в TR и SBLGNT (вид «г-нз»); не основание (решение совета R10, § 8.2, § 10 п. 6; Д2-С-4)',
        refs: ['Деян 12:25'],
        actors: ['ioann-mark'],
      };
    },
  },
  {
    id: 'C17',
    scope: ['actor:p-sarra.facts.withGod', 'actor:p-isaak.facts.birth'],
    run: ({ actor }) => {
      const s = actor('p-sarra');
      const w = one(s, 'withGod', 'будучи неплодна');
      w.value = { text: '«Верою и сама Сарра… получила силу к принятию семени, и не по времени возраста родила, ибо знала, что верен Обещавший»', refs: ['Евр 11:11'] };
      w.prov = by('C17');
      const i = actor('p-isaak');
      const b = one(i, 'birth', 'Сарра была неплодна');
      const f = (b.value as any).facts.find((x: any) => x.text.includes('Сарра была неплодна'));
      f.refs = ['Быт 11:30', ...f.refs];
      b.prov = by('C17');
      return {
        what: 'Неплодство Сарры — по Быт 11:30: у Сарры цитата Евр 11:11 без вставки «(будучи неплодна)» (опущено многоточием); у Исаака к утверждению «Сарра была неплодна» добавлен Быт 11:30',
        why: '«(будучи неплодна)» в Евр 11:11 — вставка, которой нет в TR и SBLGNT (вид «г-нз»); неплодство Сарры сказано в Быт 11:30 (решение совета R10, § 8.2, § 10 п. 6; Д2-С-5)',
        refs: ['Быт 11:30', 'Евр 11:11'],
        actors: ['sarra', 'isaak'],
      };
    },
  },

  // ---------- повторные рецензии документа 03 (Д2-03-1…9) ----------
  {
    id: 'C18',
    scope: ['origin:p-akhsa|p-khalev|', 'actor:p-khalev-syn-esroma.facts.notes'],
    run: ({ actor, origin }) => {
      const o = origin('p-akhsa', 'p-khalev', true);
      if (!o.refs.includes('1Пар 2:49')) throw new Error('у ребра Ахсы нет 1Пар 2:49');
      o.refs = o.refs.filter((r) => r !== '1Пар 2:49');
      const k = actor('p-khalev-syn-esroma');
      const n = one(k, 'notes', '«Дочь же Халева — Ахса»');
      n.value = {
        kind: 'identification', degree: 'possible',
        text: '«Дочь же Халева — Ахса» (1 Пар 2:49): тот же или другой Халев — текст не говорит. Стих стоит в роде Халева, сына Есрома (1 Пар 2:42–49); Ахса, выданная за Гофониила, — дочь Халева, сына Иефонниина (Нав 15:16–17; Суд 1:12–13). Второго ребра нет',
        refs: ['1Пар 2:42', '1Пар 2:49', 'Нав 15:16-17', 'Суд 1:12-13'],
      };
      n.prov = by('C18');
      return {
        what: 'Ахса: 1Пар 2:49 снят с ребра Халев, сын Иефонниин → Ахса (остались Нав 15:16; Суд 1:12); у Халева, сына Есрома, — метка «тот же или другой Халев — текст не говорит» (предположительно, без второго ребра)',
        why: '1Пар 2:49 стоит в роде Халева, сына Есрома (1Пар 2:42–49); путь родства через этот стих слил бы двух Халевов (рецензия 03; Д2-03-1)',
        refs: ['1Пар 2:42-49', 'Нав 15:16-17', 'Суд 1:12-13'],
        actors: ['akhsa', 'khalev-syn-esroma'],
      };
    },
  },
  {
    id: 'C19',
    scope: ['origin:p-lavan|p-nakhor-syn-farry|'],
    run: ({ base }) => {
      base.origins.push({
        child: 'p-lavan', parent: 'p-nakhor-syn-farry', role: 'father', kind: 'ancestor', refs: ['Быт 29:5'], cert: 'scripture', primary: false,
        words: [{ text: 'Лавана, сына Нахорова', ref: 'Быт 29:5' }],
        note: 'Слово «сын» — Писание (Быт 29:5); смысл «внук» — вывод: Лаван — сын Вафуила (Быт 28:5), Вафуил — сын Нахора (Быт 22:20–23; 24:15, 24)',
        prov: by('C19'),
      });
      return {
        what: 'Лаван: ребро «из сыновей» Нахор → Лаван со словами «Лавана, сына Нахорова» (Быт 29:5); слово — Писание, смысл «внук» — вывод (в примечании ребра)',
        why: '«Сын» шире прямого родства: слово стиха на ребре, понимание — отдельно (рецензия 03; Д2-03-2)',
        refs: ['Быт 29:5', 'Быт 28:5', 'Быт 24:15', 'Быт 24:24'],
        actors: ['lavan'],
      };
    },
  },
  {
    id: 'C20',
    scope: ['origin:p-bogan|p-ruvim|'],
    run: ({ origin }) => {
      const o = origin('p-bogan', 'p-ruvim', true);
      o.outsideLists = { refs: ['Быт 46:9', 'Исх 6:14', 'Чис 26:5-6', '1Пар 5:3'] };
      o.words = [{ text: 'камня Богана, сына Рувимова', ref: 'Нав 15:6' }, { text: 'камню Богана, сына Рувимова', ref: 'Нав 18:17' }];
      return {
        what: 'Боган: у ребра Рувим → Боган пометка «назван вне перечня сыновей» (перечни Быт 46:9; Исх 6:14; Чис 26:5–6; 1Пар 5:3) и слова стихов «Богана, сына Рувимова» — раскладка ставит его отсылом',
        why: 'Иначе раскладка поставит Богана пятым сыном Рувима (рецензия 03, § 3.3; Д2-03-3)',
        refs: ['Нав 15:6', 'Нав 18:17', 'Быт 46:9', 'Исх 6:14', 'Чис 26:5-6', '1Пар 5:3'],
        actors: ['bogan'],
      };
    },
  },
  {
    id: 'C21',
    scope: ['actor:p-sedekiya-syn-ioakima.facts.notes', 'actor:p-sedekiya.facts.notes', 'kin:p-sedekiya|p-iekhoniya|брат его'],
    run: ({ base, actor }) => {
      const P = by('C21');
      const mark = {
        kind: 'identification', degree: 'possible',
        text: '«Седекия, сын его» (1 Пар 3:16) и царь Седекия, сын Иосии (1 Пар 3:15; 4 Цар 24:17): тот же или другой Седекия — текст не говорит. Царя 4 Цар 24:17 называет дядей Иехонии, 2 Пар 36:10 — «брата его»',
        refs: ['1Пар 3:15', '1Пар 3:16', '4Цар 24:17', '2Пар 36:10'],
      };
      const s = actor('p-sedekiya-syn-ioakima');
      const n = one(s, 'notes', 'Отличается от царя Седекии');
      n.value = structuredClone(mark);
      n.prov = P;
      const k = actor('p-sedekiya');
      const nk = one(k, 'notes', 'Не смешивать с Седекией, сыном Иоакима');
      nk.value = { kind: 'identification', text: 'Не смешивать с Седекией, сыном Хенааны (3 Цар 22:11), и с лжепророком Седекией, сыном Маасеи (Иер 29:21)', refs: ['3Цар 22:11', 'Иер 29:21'] };
      nk.prov = P;
      put(k, { sec: 24, field: 'notes', prov: P, value: structuredClone(mark) });
      base.kin.push({ from: 'p-sedekiya', to: 'p-iekhoniya', rel: 'брат его', refs: ['2Пар 36:10'], prov: P });
      return {
        what: 'Седекия: у сына Иоакима (1Пар 3:16) примечание «отличается от царя» заменено меткой «тот же или другой Седекия — текст не говорит»; та же метка у царя Седекии, из его «не смешивать» убран сын Иоакима; у царя — родство словом «брат его» (2Пар 36:10) рядом с «дядя» (4Цар 24:17). Лица не слиты',
        why: 'Тождество не решается за текст: предположительно, без связи (П-7; рецензия 03, § 4; Д2-03-4)',
        refs: ['1Пар 3:15-16', '4Цар 24:17', '2Пар 36:10'],
        actors: ['sedekiya', 'sedekiya-syn-ioakima'],
      };
    },
  },
  {
    id: 'C22',
    scope: ['origin:p-valtasar-tsar|p-navukhodonosor|', 'actor:p-valtasar-tsar.facts.notes'],
    run: ({ actor, origin }) => {
      const o = origin('p-valtasar-tsar', 'p-navukhodonosor', true);
      Object.assign(o, {
        kind: 'ancestor', cert: 'scripture', primary: false,
        refs: ['Дан 5:2', 'Дан 5:11', 'Дан 5:13', 'Дан 5:18', 'Дан 5:22'],
        words: [
          { text: 'Навуходоносор, отец его', ref: 'Дан 5:2' },
          { text: 'царь Навуходоносор, отец твой', ref: 'Дан 5:11' },
          { text: 'отец мой, царь', ref: 'Дан 5:13' },
          { text: 'отцу твоему Навуходоносору', ref: 'Дан 5:18' },
          { text: 'ты, сын его Валтасар', ref: 'Дан 5:22' },
        ],
        note: 'Слово «отец» — Писание; смысл слова (отец, предшественник на престоле, предок) — толкование, в Карточке',
      });
      delete o.gapSuspected;
      const v = actor('p-valtasar-tsar');
      const n = one(v, 'notes', 'помечена как толкование');
      n.value = {
        kind: 'interpretation',
        text: '«Отец» и «сын» в Дан 5 одни понимают буквально, другие — как «предшественник» или «предок»: по-семитски так называют и более далёкое родство. Слово «отец» — слово текста; толкование — его смысл',
        refs: ['Дан 5:2', 'Дан 5:22'],
      };
      n.prov = by('C22');
      return {
        what: 'Навуходоносор → Валтасар: ребро «из сыновей» (ancestor) с уровнем «Писание» и словами Дан 5:2, 11, 13, 18, 22; смысл слова — толкование в примечании Карточки; пометка о подозреваемом пропуске снята',
        why: 'Уровень слова отделён от уровня смысла (рецензия 03, § 3.2, § 4; Д2-03-5)',
        refs: ['Дан 5:2', 'Дан 5:11', 'Дан 5:18', 'Дан 5:22'],
        actors: ['valtasar-tsar'],
      };
    },
  },
  {
    id: 'C23',
    scope: ['origin:p-oziya|p-ioram-syn-iosafata|'],
    run: ({ base, actor }) => {
      const skipped = ['p-okhoziya-syn-iorama', 'p-ioas-syn-okhozii', 'p-amasiya'];
      for (const id of skipped) actor(id);
      base.origins.push({
        child: 'p-oziya', parent: 'p-ioram-syn-iosafata', role: 'father', kind: 'ancestor', primary: false, gap: true, cert: 'inference',
        refs: ['Мф 1:8', '4Цар 8:24', '4Цар 11:2', '4Цар 14:1', '1Пар 3:11-12'],
        words: [{ text: 'Иорам родил Озию', ref: 'Мф 1:8' }],
        skipped: { actors: skipped, refs: ['4Цар 8:24', '4Цар 11:2', '4Цар 14:1', '1Пар 3:11-12'] },
        note: 'У Матфея опущены Охозия, Иоас и Амасия; их называют 4 Цар 8:24 – 14:1 и 1 Пар 3:11–12',
        prov: by('C23'),
      });
      return {
        what: 'Пропуск Мф 1:8: ребро «из сыновей» Иорам → Озия со словами «Иорам родил Озию», знаком пропуска и перечнем пропущенных (Охозия, Иоас, Амасия), уровень «выв.» со стихами обеих сторон',
        why: 'Вид главы Мф 1 и синопсис строят «⋯ 3» из ребра, а не только из пометок линии (02 § 3.4; рецензия 03, § 3.2; Д2-03-6)',
        refs: ['Мф 1:8', '4Цар 8:24', '4Цар 11:2', '4Цар 14:1', '1Пар 3:11-12'],
        actors: ['oziya', 'ioram-syn-iosafata'],
      };
    },
  },
  {
    id: 'C24',
    scope: ['origin:p-azariya-1par6-10|p-meraiof|'],
    run: ({ actor, origin }) => {
      const o = origin('p-azariya-1par6-10', 'p-meraiof', false);
      if (o.kind !== 'ancestor') throw new Error('ребро Мераиоф → Азария не «из сыновей»');
      const skipped = ['p-amariya-1par6-7', 'p-akhitov-1par6-7', 'p-sadok', 'p-akhimaas-syn-sadoka', 'p-azariya-1par6-9', 'p-ioanan-syn-azarii'];
      for (const id of skipped) actor(id);
      o.gap = true;
      o.skipped = { actors: skipped, refs: ['1Пар 6:7-10'] };
      o.refs = [...new Set([...o.refs, '1Пар 6:7-10'])];
      return {
        what: 'Пропуск Езд 7:3: у ребра Мераиоф → Азария — знак пропуска и перечень пропущенных по 1Пар 6:7–10: Амария, Ахитув, Садок, Ахимаас, Азария, Иоанан (6)',
        why: 'Знак «⋯ 6» в виде главы Езд 7 и синопсисе строится из перечня (рецензия 03, § 3.2; Д2-03-7)',
        refs: ['Езд 7:3', '1Пар 6:7-10'],
        actors: ['azariya-1par6-10'],
      };
    },
  },
  {
    id: 'C25',
    scope: ['union:u-onan--famar'],
    run: ({ base }) => {
      const u = base.unions.find((x) => x.id === 'u-onan--famar');
      const t = u?.terms.find((x) => x.word === 'муж');
      if (!t) throw new Error('у союза Онана и Фамари нет слова «муж»');
      t.word = 'как деверь';
      return {
        what: 'Союз Онан — Фамарь: слово союза «как деверь» (Быт 38:8) вместо «муж»',
        why: 'На союзе — слово своего стиха; «муж» в Быт 38:8–9 не сказано (рецензия 03, § 2.1; Д2-03-8)',
        refs: ['Быт 38:8'],
        actors: ['onan', 'famar'],
      };
    },
  },
  {
    id: 'C26',
    scope: ['reading:r-father-kis-nir'],
    run: ({ base }) => {
      const r = base.readings.find((x) => x.id === 'r-father-kis-nir');
      if (!r) throw new Error('нет набора r-father-kis-nir');
      const a = r.readings.find((x) => x.id === 'a')!;
      const b = r.readings.find((x) => x.id === 'b')!;
      a.label = 'Авиил (1Цар 9:1; 14:51)';
      b.label = 'Нер (1Пар 8:33; 9:39), Иеил (1Пар 9:36)';
      return {
        what: 'Набор r-father-kis-nir: подпись прочтения b — «Нер (1Пар 8:33; 9:39)» формой своего стиха («Нир» — форма 1Цар 14:51); у прочтения a снят повтор «Авиил»',
        why: 'В подписи прочтения — форма имени того стиха, на который она ссылается (рецензия 03, § 4; Д2-03-9)',
        refs: ['1Пар 8:33', '1Пар 9:39', '1Цар 14:51'],
        actors: [],
      };
    },
  },

  // ---------- документ 07 (Д2-07-1…5) ----------
  {
    id: 'C27',
    scope: ['actor:p-simon-zilot.facts.events'],
    run: ({ actor }) => {
      const a = actor('p-simon-zilot');
      const e = one(a, 'events', 'После вознесения');
      (e.value as any).refs = ['Деян 1:9-13'];
      e.prov = by('C27');
      return {
        what: 'Симон Зилот: «После вознесения пребывал с Апостолами в горнице» — ссылка Деян 1:9–13 вместо Деян 1:13',
        why: 'Слов «после вознесения» в Деян 1:13 нет: они следуют из Деян 1:9–12 (07 § 4.3; Д2-07-1)',
        refs: ['Деян 1:9-13'],
        actors: ['simon-zilot'],
      };
    },
  },
  {
    id: 'C28',
    scope: ['actor:p-kelaiya.facts.events'],
    run: ({ actor }) => {
      const a = actor('p-kelaiya');
      const e = one(a, 'events', 'приложил печать к завету');
      (e.value as any).refs = ['Неем 9:38', 'Неем 10:1', 'Неем 10:9-10'];
      e.prov = by('C28');
      return {
        what: 'Келаия: «среди левитов приложил печать к завету» — о печати Неем 9:38 и 10:1, Келаия (Клита) среди левитов — Неем 10:9–10',
        why: 'В Неем 10:9–10 слов о печати нет (07 § 4.3; Д2-07-2)',
        refs: ['Неем 9:38', 'Неем 10:1', 'Неем 10:9-10'],
        actors: ['kelaiya'],
      };
    },
  },
  {
    id: 'C29',
    scope: ['actor:p-ila-syn-vaasy.facts.events'],
    run: ({ actor }) => {
      const a = actor('p-ila-syn-vaasy');
      put(a, { sec: 17, field: 'events', prov: by('C29'), value: { text: '«Прочие дела Илы, все, что он сделал, описано в летописи царей Израильских»', refs: ['3Цар 16:14'] } });
      return {
        what: 'Ила, сын Ваасы: добавлен стих 3Цар 16:14 («Прочие дела Илы… описано в летописи царей Израильских»)',
        why: 'Стих называет Илу, а в данных его не было (07 § 15.3; Д2-07-3)',
        refs: ['3Цар 16:14'],
        actors: ['ila-syn-vaasy'],
      };
    },
  },
  {
    id: 'C30',
    scope: ['nodata:p-adam|6|', 'nodata:p-eva|6|', 'nodata:p-melkhisedek|6|'],
    run: ({ base }) => {
      const P = by('C30');
      const says = (actor: string, ref: string, text: string) =>
        base.nodata.push({ actor, sec: 6, kind: 'scripture-says', what: 'родители', refs: [ref], words: [{ text, ref }], prov: P });
      says('p-adam', 'Быт 2:7', 'И создал Господь Бог человека из праха земного, и вдунул в лице его дыхание жизни, и стал человек душею живою.');
      says('p-eva', 'Быт 2:22', 'И создал Господь Бог из ребра, взятого у человека, жену, и привел ее к человеку.');
      says('p-melkhisedek', 'Евр 7:3', 'без отца, без матери, без родословия, не имеющий ни начала дней, ни конца жизни, уподобляясь Сыну Божию, пребывает священником навсегда.');
      return {
        what: '«Писание говорит» о родителях (scripture-says, слова стиха целиком): Адам — Быт 2:7; Ева — Быт 2:22; Мелхиседек — Евр 7:3',
        why: 'Отсутствие родителей у них — сведение самого Писания; без записи их карточки получили бы строку «Родители ещё не проверены по тексту» (07 § 8.3; Д2-07-4)',
        refs: ['Быт 2:7', 'Быт 2:22', 'Евр 7:3'],
        actors: ['adam', 'eva', 'melkhisedek'],
      };
    },
  },
  {
    id: 'C31',
    scope: ['nodata:p-iisus|6|'],
    run: ({ base }) => {
      const old = base.nodata.filter((n) => n.kind === 'stated-absent' || n.kind === 'not-applicable');
      if (old.length !== 1 || old[0].actor !== 'p-iisus') throw new Error(`прежних видов «нет сведений»: ${old.length}`);
      const n = old[0];
      n.kind = 'scripture-says';
      n.words = [
        { text: 'оказалось, что Она имеет во чреве от Духа Святаго', ref: 'Мф 1:18' },
        { text: 'родившееся в Ней есть от Духа Святаго', ref: 'Мф 1:20' },
        { text: 'как будет это, когда Я мужа не знаю?', ref: 'Лк 1:34' },
        { text: 'Дух Святый найдет на Тебя, и сила Всевышнего осенит Тебя', ref: 'Лк 1:35' },
      ];
      n.prov = by('C31');
      return {
        what: 'Вид «нет сведений» not-applicable → scripture-says со словами стихов (Иисус Христос, «отец по плоти»: Мф 1:18, 20; Лк 1:34–35); stated-absent в базе не было',
        why: 'Нейтральный вид хранит слова стиха и не выбирает между пониманиями (07 § 8.2; Д2-07-5)',
        refs: ['Мф 1:18', 'Мф 1:20', 'Лк 1:34-35'],
        actors: ['iisus'],
      };
    },
  },
];
