/**
 * Шаги правки по задаче данных Д-4 (02 § 3.3.4: «слияние — только при тождестве сказанном»), партия 2 — по решению
 * координатора Р-1 (docs/app/reviews/11-решения-координатора-ред4-2.md). Шаги D5…D5-4 уже в коммите и не меняются; перед
 * этими шагами номера закрепляются (freezeIds). Отчёт — docs/app/reviews/Д-партия-2-отчёт.md.
 *
 * Форма имени внутри карточки, которая — другое имя в другом стихе без тождества «сказано», — своя карточка со своими
 * стихами и отношение «возможно, то же лицо» уровня «вывод» (02 § 3.11.1: «вывод» у possibly-same — степень «весомо»).
 * Стих принадлежит лицу только через его записи (02 § 3.11.2): утверждения карточки по стихам другого имени уходят на
 * карточку этого имени.
 *
 * D4-1 Левий (Мк 2:14; Лк 5:27, 29) — из карточки Матфея (Мф 9:9; 10:3). Ребро «Алфей — отец» — к Левию, уровень «Писание»
 *      («Левия Алфеева», Мк 2:14), как у Иакова Алфеева. Утверждения по Мк 2 и Лк 5 — у Левия; у Матфея — по Мф 9:9–13.
 * D4-2 Фаддей и Леввей (Мф 10:3; Мк 3:18) — из карточки Иуды Иаковлева (Лк 6:16; Деян 1:13): «Леввей, прозванный Фаддеем»
 *      (Мф 10:3) — тождество сказано, одна карточка; с Иудой Иаковлевым — «возможно, то же лицо». Форма «Иуда» стояла со
 *      ссылкой Мф 10:3, где Иуды Иаковлева нет («Иуда Искариот» — Мф 10:4): теперь Лк 6:16.
 */
import type { Step } from './corrections.ts';
import type { Actor, Assertion, Ref } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });
const VOL = '17-new-testament.json';

// ---------------------------------------------------------------- D4-1

const MATFEY = 'p-matfey';
const LEVIY = 'p-leviy-alfeev';
const ALFEY = 'p-alfey-otets-leviya';

const LEVIY_CARD: Actor = {
  id: LEVIY,
  kind: 'human',
  sex: 'm',
  names: [
    { form: 'Левий', type: 'main', refs: ['Мк 2:14', 'Лк 5:27', 'Лк 5:29'] },
    { form: 'Левий Алфеев', type: 'patronymic', refs: ['Мк 2:14'] },
  ],
  disambig: 'мытарь, сын Алфея (Мк 2:14)',
  prominence: 2,
  facts: [
    { sec: 16, field: 'offices', value: { title: 'Мытарь: сидел у сбора пошлин', refs: ['Мк 2:14', 'Лк 5:27'] } },
    { sec: 14, field: 'met', value: { id: 'p-iisus', refs: ['Мк 2:14', 'Лк 5:27-29'], text: 'призван Им от сбора пошлин: «следуй за Мною»; сделал для Него угощение' } },
    { sec: 17, field: 'events', value: { text: 'Сидел у сбора пошлин; на слово Иисуса «следуй за Мною», оставив всё, встал и последовал за Ним', refs: ['Мк 2:14', 'Лк 5:27-28'] } },
    { sec: 23, field: 'scripture', value: { first: 'Мк 2:14', key: ['Мк 2:13-17', 'Лк 5:27-32'] } },
  ],
};

/** Утверждения Матфея по стихам Левия — на карточку Левия (номер записи тот же) с текстом по Лк 5. */
const LEVIY_MOVE: { id: string; field: string; has?: string; value: Record<string, unknown> }[] = [
  { id: 'a-12939', field: 'places', value: { name: 'У моря, у сбора пошлин', role: 'residence', refs: ['Мк 2:13-14'] } },
  { id: 'a-12942', field: 'events', has: 'Сделал для Иисуса', value: { text: 'Сделал для Иисуса в доме своём большое угощение, где возлежали многие мытари и другие; книжники и фарисеи роптали', refs: ['Лк 5:29-30'] } },
  { id: 'a-12945', field: 'withGod', value: { text: 'Слово Иисуса на угощении в его доме: «Я пришел призвать не праведников, а грешников к покаянию»', refs: ['Лк 5:31-32'] } },
];

/** Утверждения Матфея — только по стихам Матфея (номер записи тот же). */
const MATFEY_FIX: { id: string; field: string; has?: string; value: Record<string, unknown> }[] = [
  { id: 'a-12935', field: 'original', value: { lang: 'gr', script: 'Μαθθαῖος', translit: 'Maththaios' } },
  { id: 'a-12938', field: 'met', value: { id: 'p-iisus', refs: ['Мф 9:9'], text: 'призван Им от сбора пошлин: «следуй за Мною»' } },
  { id: 'a-12940', field: 'offices', value: { title: 'Мытарь: сидел у сбора пошлин', refs: ['Мф 9:9', 'Мф 10:3'] } },
  { id: 'a-12941', field: 'events', has: 'Сидел у сбора пошлин', value: { text: 'Сидел у сбора пошлин; на слово Иисуса «следуй за Мною» встал и последовал за Ним', refs: ['Мф 9:9'] } },
  { id: 'a-12946', field: 'scripture', value: { first: 'Мф 9:9', key: ['Мф 9:9-13', 'Мф 10:3', 'Мк 3:18', 'Лк 6:15', 'Деян 1:13'] } },
  {
    id: 'a-12947', field: 'notes', has: 'и Левий Алфеев (Мк 2:14; Лк 5:27) — одно лицо',
    value: {
      kind: 'identification',
      text: 'Возможно, это тот же человек, что Левий (Мк 2:14; Лк 5:27): так выходит, если сравнить Мф 9:9 с Мк 2:14 и Лк 5:27 — три Евангелия рассказывают о призвании мытаря у сбора пошлин теми же словами «следуй за Мною». Текст тождества не утверждает, поэтому это разные карточки с пометкой «возможно, то же лицо»',
      refs: ['Мф 9:9', 'Мк 2:14', 'Лк 5:27'],
    },
  },
  { id: 'a-12948', field: 'notes', has: 'Не смешивать с Матфием', value: { kind: 'identification', text: 'Не смешивать с Матфием, избранным на место Иуды (Деян 1:26)', refs: ['Деян 1:26'] } },
];

const LEVIY_REL = {
  refs: ['Мк 2:14', 'Лк 5:27', 'Мф 9:9'] as Ref[],
  note: '«Левия Алфеева, сидящего у сбора пошлин» (Мк 2:14) и «мытаря, именем Левия, сидящего у сбора пошлин» (Лк 5:27) — тот же рассказ о призвании, что у Матфея: «человека, сидящего у сбора пошлин, по имени Матфея» (Мф 9:9). Что это одно лицо, текст прямо не говорит',
};

const LEVIY_DROP_READ: Ref[] = ['Мк 2:14', 'Лк 5:27', 'Лк 5:29'];

const ALFEY_NOTE = { actor: 'p-alfey-otets-iakova', was: 'отец Левия-Матфея (Мк 2:14)', now: 'отец Левия (Мк 2:14)' };

// ---------------------------------------------------------------- D4-2

const IUDA = 'p-iuda-iakovlev';
const FADDEY = 'p-faddey';

const FADDEY_CARD: Actor = {
  id: FADDEY,
  kind: 'human',
  sex: 'm',
  names: [
    { form: 'Фаддей', type: 'main', refs: ['Мк 3:18', 'Мф 10:3'] },
    { form: 'Леввей', type: 'variant', refs: ['Мф 10:3'], note: '«Леввей, прозванный Фаддеем» (Мф 10:3)' },
  ],
  disambig: 'апостол (Мф 10:3; Мк 3:18)',
  roles: ['apostle'],
  prominence: 2,
  facts: [
    { sec: 5, field: 'status', value: { text: 'Один из двенадцати Апостолов', refs: ['Мф 10:2-3', 'Мк 3:18'] } },
    { sec: 17, field: 'events', value: { text: 'Поставлен в число двенадцати Апостолов', refs: ['Мк 3:14-18', 'Мф 10:1-3'] } },
    { sec: 23, field: 'scripture', value: { first: 'Мф 10:3', key: ['Мф 10:2-4', 'Мк 3:16-19'] } },
  ],
};

const IUDA_FIX: { id: string; field: string; has?: string; value: Record<string, unknown> }[] = [
  { id: 'a-12961', field: 'status', value: { text: 'Один из двенадцати Апостолов', refs: ['Лк 6:13-16', 'Деян 1:13'] } },
  { id: 'a-12963', field: 'events', has: 'Поставлен в число', value: { text: 'Поставлен в число двенадцати Апостолов', refs: ['Лк 6:13-16'] } },
  { id: 'a-12967', field: 'scripture', value: { first: 'Лк 6:16', key: ['Лк 6:16', 'Деян 1:13', 'Ин 14:22'] } },
  {
    id: 'a-12968', field: 'notes', has: 'стоит в перечнях Луки',
    value: {
      kind: 'identification',
      text: 'Возможно, это тот же человек, что Фаддей: так выходит, если сравнить перечни двенадцати Апостолов. У Луки назван Иуда Иаковлев (Лк 6:16; Деян 1:13), у Матфея и Марка на его месте в счёте двенадцати — «Леввей, прозванный Фаддеем» (Мф 10:3) и «Фаддей» (Мк 3:18); остальные одиннадцать — те же имена. Текст тождества не утверждает, поэтому это разные карточки с пометкой «возможно, то же лицо». «Иуда — не Искариот» (Ин 14:22) — по-видимому, он же: другого Иуды, кроме Искариота, в перечнях Луки нет',
      refs: ['Лк 6:16', 'Деян 1:13', 'Мф 10:3', 'Мк 3:18', 'Ин 14:22'],
    },
  },
];

const FADDEY_REL = {
  refs: ['Мф 10:3', 'Мк 3:18', 'Лк 6:16', 'Деян 1:13'] as Ref[],
  note: 'В перечнях двенадцати Апостолов у Матфея и Марка назван Фаддей («Леввей, прозванный Фаддеем» — Мф 10:3; «Фаддея» — Мк 3:18), у Луки на его месте в счёте двенадцати — «Иуду Иаковлева» (Лк 6:16; «Иуда, брат Иакова» — Деян 1:13); остальные одиннадцать — те же имена. Что это одно лицо, текст прямо не говорит',
};

// ---------------------------------------------------------------- общее

/**
 * Утверждение по полю и словам значения (номера при проверке областей шагов ещё не выданы): ровно одно. `id` — номер
 * записи в base/ids.json, для чтения шага; после сборки он у найденной записи.
 */
function fact(a: Actor, x: { id: string; field: string; has?: string }, step: string): Assertion {
  const fs = a.facts.filter((f) => f.field === x.field && (!x.has || JSON.stringify(f.value).includes(x.has)));
  if (fs.length !== 1) throw new Error(`${step}: у ${a.id} ожидалось одно утверждение ${x.id} (${x.field}${x.has ? ` «${x.has}»` : ''}), найдено ${fs.length}`);
  if (fs[0].id && !fs[0].id.startsWith('?') && fs[0].id !== x.id) throw new Error(`${step}: у ${a.id} утверждение ${x.field} — ${fs[0].id}, а не ${x.id}`);
  return fs[0];
}

function addCard(base: Parameters<Step['run']>[0]['base'], card: Actor, after: string, step: string) {
  const vol = base.volumes.find((v) => v.file === VOL);
  if (!vol) throw new Error(`${step}: нет тома ${VOL}`);
  if (vol.actors.some((a) => a.id === card.id)) throw new Error(`${step}: карточка ${card.id} уже есть`);
  const c: Actor = { ...structuredClone(card), facts: card.facts.map((f) => ({ ...structuredClone(f), prov: by(step) })), prov: { ...by(step), status: 'draft' } };
  vol.actors.splice(vol.actors.findIndex((a) => a.id === after) + 1, 0, c);
  return c;
}

export const STEPS_D4: Step[] = [
  {
    id: 'D4-1',
    scope: [`actor:${MATFEY}`, `actor:${LEVIY}`, `actor:${ALFEY}.disambig`, `actor:${ALFEY_NOTE.actor}.facts.notes`, `volume:${VOL}`, `origin:${MATFEY}|${ALFEY}|`, `origin:${LEVIY}|${ALFEY}|`, `nodata:${MATFEY}|`, `relation:${LEVIY}|${MATFEY}|`],
    run: ({ base, actor }) => {
      const m = actor(MATFEY);
      const drop = new Set(['Левий', 'Левий Алфеев']);
      if (m.names.filter((n) => drop.has(n.form)).length !== 2) throw new Error('D4-1: у Матфея нет форм «Левий», «Левий Алфеев»');
      m.names = m.names.filter((n) => !drop.has(n.form));
      m.disambig = 'апостол, мытарь';
      const l = addCard(base, LEVIY_CARD, ALFEY, 'D4-1');
      for (const x of LEVIY_MOVE) {
        const f = fact(m, x, 'D4-1');
        m.facts = m.facts.filter((y) => y !== f);
        l.facts.push({ ...f, value: structuredClone(x.value), prov: { ...f.prov, ...by('D4-1') } });
      }
      l.facts.sort((a, b) => a.sec - b.sec);
      for (const x of MATFEY_FIX) {
        const f = fact(m, x, 'D4-1');
        f.value = structuredClone(x.value);
        f.prov = { ...f.prov, ...by('D4-1') };
      }
      // ребро «Алфей — отец»: к Левию, по слову стиха «Левия Алфеева» (Мк 2:14)
      const os = base.origins.filter((o) => o.child === MATFEY && o.parent === ALFEY);
      if (os.length !== 1) throw new Error('D4-1: ожидалось одно ребро Матфей ← Алфей');
      Object.assign(os[0], { child: LEVIY, cert: 'scripture', refs: ['Мк 2:14'], prov: { ...os[0].prov, ...by('D4-1') } });
      actor(ALFEY).disambig = 'отец Левия (Мк 2:14)';
      const an = actor(ALFEY_NOTE.actor).facts.filter((f) => f.field === 'notes' && (f.value as any)?.text?.includes(ALFEY_NOTE.was));
      if (an.length !== 1) throw new Error('D4-1: нет примечания об отце Левия-Матфея');
      (an[0].value as any).text = (an[0].value as any).text.replace(ALFEY_NOTE.was, ALFEY_NOTE.now);
      an[0].prov = { ...an[0].prov, ...by('D4-1') };
      // прочитанные стихи «нет сведений» у Матфея — без стихов Левия
      for (const n of base.nodata.filter((x) => x.actor === MATFEY && x.read)) {
        n.read = n.read!.filter((r) => !LEVIY_DROP_READ.includes(r));
        n.prov = { ...n.prov, ...by('D4-1') };
      }
      base.relations.push({ a: LEVIY, b: MATFEY, kind: 'possibly-same', refs: [...LEVIY_REL.refs], cert: 'inference', note: LEVIY_REL.note, prov: { ...by('D4-1'), status: 'draft' } });
      return {
        what: 'Д-4: Левий (Мк 2:14; Лк 5:27, 29) — своя карточка p-leviy-alfeev; у Матфея сняты формы «Левий», «Левий Алфеев» и стихи Мк 2, Лк 5; утверждения по ним (место, угощение, слово на угощении) — у Левия; ребро «Алфей — отец» — к Левию, «Писание» (Мк 2:14); «возможно, то же лицо» уровня «вывод» Левий — Матфей (Мк 2:14; Лк 5:27; Мф 9:9)',
        why: '02 § 3.3.4 (слияние — только при тождестве «сказано»), § 3.11; решение координатора Р-1 (reviews/11-решения-координатора-ред4-2.md)',
        refs: ['Мф 9:9', 'Мк 2:14', 'Лк 5:27', 'Лк 5:29'],
        actors: ['matfey', 'leviy-alfeev', 'alfey-otets-leviya', 'alfey-otets-iakova'],
        other: ['relations'],
      };
    },
  },
  {
    id: 'D4-2',
    scope: [`actor:${IUDA}`, `actor:${FADDEY}`, `volume:${VOL}`, `membership:${FADDEY}|`, `relation:${FADDEY}|${IUDA}|`],
    run: ({ base, actor }) => {
      const j = actor(IUDA);
      const drop = new Set(['Леввей', 'Фаддей']);
      if (j.names.filter((n) => drop.has(n.form)).length !== 2) throw new Error('D4-2: у Иуды Иаковлева нет форм «Леввей», «Фаддей»');
      j.names = j.names.filter((n) => !drop.has(n.form));
      // форма «Иуда» стояла со ссылкой Мф 10:3 — в этом стихе Иуды Иаковлева нет
      const main = j.names[0];
      if (main.form !== 'Иуда' || main.refs.join() !== 'Мф 10:3') throw new Error('D4-2: главная форма Иуды Иаковлева — не «Иуда» (Мф 10:3)');
      main.refs = ['Лк 6:16'];
      j.disambig = 'апостол, Иаковлев';
      for (const x of IUDA_FIX) {
        const f = fact(j, x, 'D4-2');
        f.value = structuredClone(x.value);
        f.prov = { ...f.prov, ...by('D4-2') };
      }
      addCard(base, FADDEY_CARD, IUDA, 'D4-2');
      base.memberships.push({ actor: FADDEY, area: 'g-apostles', basis: 'named', refs: ['Мф 10:2-3'], prov: { ...by('D4-2'), status: 'draft' } });
      base.relations.push({ a: FADDEY, b: IUDA, kind: 'possibly-same', refs: [...FADDEY_REL.refs], cert: 'inference', note: FADDEY_REL.note, prov: { ...by('D4-2'), status: 'draft' } });
      return {
        what: 'Д-4: Фаддей («Леввей, прозванный Фаддеем» — Мф 10:3; Мк 3:18) — своя карточка p-faddey; у Иуды Иаковлева сняты формы «Леввей», «Фаддей» и стихи Мф 10:3, Мк 3:18; форма «Иуда» — со ссылкой Лк 6:16 вместо Мф 10:3 (в этом стихе Иуды Иаковлева нет); «возможно, то же лицо» уровня «вывод» Фаддей — Иуда Иаковлев (Мф 10:3; Мк 3:18; Лк 6:16; Деян 1:13)',
        why: '02 § 3.3.4 (слияние — только при тождестве «сказано»), § 3.11; решение координатора Р-1 (reviews/11-решения-координатора-ред4-2.md)',
        refs: ['Мф 10:3', 'Мк 3:18', 'Лк 6:16', 'Деян 1:13'],
        actors: ['iuda-iakovlev', 'faddey'],
        other: ['relations', 'memberships'],
      };
    },
  },
];
