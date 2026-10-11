/**
 * Шаги правки по задаче данных Д-15 (02 ред. 4.4 § 3.3.4–3.3.5; утверждено В-32), начало. Отчёт —
 * docs/app/reviews/В-32-данные-отчёт.md. Шаги D4-1, D4-2 и D11-1 уже в коммите и не меняются; перед этими шагами номера
 * закрепляются (freezeIds).
 *
 * D15-1 Фаддей и Иуда Иаковлев — вид (б) по перечню с названным числом («Двенадцати же Апостолов имена суть сии», Мф 10:2;
 *       «избрал из них двенадцать», Лк 6:13): одна карточка p-faddey (основное имя «Фаддей» по правилу 02 § 3.3.5);
 *       «Иуда Иаковлев» (Лк 6:16) и «Иуда, брат Иакова» (Деян 1:13) — формы «выв.» со стихами сравнения; «Леввей» — форма
 *       «Писание», сказанная вместе с «Фаддей» (Мф 10:3). p-iuda-iakovlev — в переадресацию (basis: parallel); связь ar-8
 *       снята. Возвращает шаг D4-2 новым шагом (D4-2 в коммите не меняется).
 * D15-2 Рагуил — вид (в) (02 § 3.3.4 [4.4 по Р-2]): своя карточка p-raguil («К Рагуилу, отцу своему», Исх 2:18; «Ховаву,
 *       сыну Рагуилову», Чис 10:29) и «возможно, то же лицо» уровня «вывод» с Иофором. Рёбра Сепфоры и Ховава — к Рагуилу,
 *       уровень «Писание»; у Иофора нет ни формы «Рагуил», ни стихов Исх 2:16–21 (имя «Иофор» в Исх 2:16 — только в скобках).
 * D15-3 Отец Есфири — вид (б): «Есфири, дочери Аминадава» (Есф 2:15) и «царица Есфирь, дочь Абихаила» (Есф 9:29) — оба имени
 *       на одном месте одного лица (отец Есфири; 02 § 3.3.4, проверка 1). Основное имя — «Аминадав» (по одному стиху, Есф 2:15
 *       раньше по порядку книг — правило 02 § 3.3.5); «Абихаил» — форма «выв.». Номер карточки прежний.
 */
import type { Step } from './corrections.ts';
import { issuerOf } from './ids.ts';
import type { Actor, Assertion, Name, NameWhyCode } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });

/** Утверждение по полю и словам значения: ровно одно (номер — для чтения шага и сверки). */
function fact(a: Actor, x: { id: string; field: string; has?: string }, step: string): Assertion {
  const fs = a.facts.filter((f) => f.field === x.field && (!x.has || JSON.stringify(f.value).includes(x.has)));
  if (fs.length !== 1) throw new Error(`${step}: у ${a.id} ожидалось одно утверждение ${x.id} (${x.field}${x.has ? ` «${x.has}»` : ''}), найдено ${fs.length}`);
  if (fs[0].id && !fs[0].id.startsWith('?') && fs[0].id !== x.id) throw new Error(`${step}: у ${a.id} утверждение ${x.field} — ${fs[0].id}, а не ${x.id}`);
  return fs[0];
}
const touch = <T extends { prov?: object }>(x: T, step: string) => {
  x.prov = { ...x.prov, ...by(step) };
  return x;
};
/** Номер записи (закреплённый) — для выбытия с переадресацией. */
const fixedId = (x: { id?: string }) => (x.id && !x.id.startsWith('?') ? x.id : undefined);

// ---------------------------------------------------------------- D15-1

const FADDEY = 'p-faddey';
const IUDA = 'p-iuda-iakovlev';
const VOL_NT = '17-new-testament.json';
const APOSTLES_WHY = {
  codes: ['parallel', 'named-number', 'one-candidate', 'no-contradiction'] as NameWhyCode[],
  note: 'перечни двенадцати Апостолов (Мф 10:2–4; Мк 3:16–19; Лк 6:13–16; Деян 1:13): десять имён совпадают прямо, Симон Кананит и Симон Зилот — тоже; на оставшемся месте у Матфея и Марка — Фаддей, у Луки — Иуда Иаковлев. Места внутри перечней разные: решает число «двенадцать», а не соседи',
};
const FADDEY_NAMES: Name[] = [
  { id: `${FADDEY}#n1`, form: 'Фаддей', type: 'main', refs: ['Мк 3:18', 'Мф 10:3'] },
  { id: `${FADDEY}#n2`, form: 'Леввей', type: 'variant', refs: ['Мф 10:3'], note: '«Леввей, прозванный Фаддеем» (Мф 10:3)', with: `${FADDEY}#n1` },
  {
    id: `${FADDEY}#n3`, form: 'Иуда Иаковлев', type: 'variant', refs: ['Лк 6:16'], cert: 'inference',
    compare: { form: { refs: ['Лк 6:16'] }, main: { refs: ['Мф 10:3', 'Мк 3:18'] }, count: { ref: 'Лк 6:13' } },
    why: APOSTLES_WHY,
  },
  {
    id: `${FADDEY}#n4`, form: 'Иуда, брат Иакова', type: 'epithet', refs: ['Деян 1:13'], cert: 'inference', note: 'так передаёт Синодальный перевод в Деян 1:13',
    compare: { form: { refs: ['Деян 1:13'] }, main: { refs: ['Мф 10:3', 'Мк 3:18'] }, count: { ref: 'Лк 6:13' } },
    why: APOSTLES_WHY,
  },
];
const IUDA_FORM = `${FADDEY}#n3`;
const BRAT_FORM = `${FADDEY}#n4`;

// ---------------------------------------------------------------- D15-2

const IOFOR = 'p-iofor';
const RAGUIL = 'p-raguil';
const KHOVAV = 'p-khovav';
const SEPFORA = 'p-sepfora';
const VOL_LEVI = '08-levi.json';
const RAGUIL_CARD: Actor = {
  id: RAGUIL,
  kind: 'human',
  sex: 'm',
  names: [{ id: `${RAGUIL}#n1`, form: 'Рагуил', type: 'main', refs: ['Исх 2:18', 'Чис 10:29'] }],
  disambig: 'отец Сепфоры, священник Мадиамский (Исх 2:16–21)',
  roles: ['priest'],
  prominence: 2,
  facts: [
    { sec: 5, field: 'status', value: { text: 'Священник Мадиамский: дочери «священника Мадиамского» пришли «к Рагуилу, отцу своему»', refs: ['Исх 2:16', 'Исх 2:18'] }, cert: 'inference' },
    { sec: 14, field: 'met', value: { id: 'p-moisey', refs: ['Исх 2:20-21'], text: 'позвал его есть хлеб; Моисею понравилось жить у него, и он выдал за Моисея дочь свою Сепфору' } },
    { sec: 15, field: 'places', value: { name: 'Земля Мадиамская', role: 'residence', refs: ['Исх 2:15-16'] } },
    { sec: 23, field: 'scripture', value: { first: 'Исх 2:18', key: ['Исх 2:16-21', 'Чис 10:29'] } },
  ],
};
const RAGUIL_REL = {
  refs: ['Исх 2:18', 'Исх 2:21', 'Исх 3:1', 'Исх 18:2'],
  note: 'Отец Сепфоры назван Рагуилом: «К Рагуилу, отцу своему» (Исх 2:18), «он выдал за Моисея дочь свою Сепфору» (Исх 2:21). Иофор назван «тестем своим, священником Мадиамским» (Исх 3:1) и «тестем Моисеевым», который «взял… Сепфору, жену Моисееву» (Исх 18:2). Что это одно лицо, текст прямо не говорит: так выходит, если сравнить Исх 2:18 и Исх 3:1. Имя «Иофор» в Исх 2:16 — только в скобках',
};

// ---------------------------------------------------------------- D15-3

const ABIKHAIL = 'p-abikhail-otets-esfiri';
const ESFIR = 'p-esfir';

export const STEPS_D15: Step[] = [
  {
    id: 'D15-1',
    scope: [`actor:${FADDEY}`, `actor:${IUDA}`, `volume:${VOL_NT}`, `membership:${IUDA}|`, `membership:${FADDEY}|`, `relation:${FADDEY}|${IUDA}|`, `chrono:${IUDA}`, `chrono:${FADDEY}`, `redirect:${IUDA}`, 'redirect:ar-8', 'redirect:a-1296'],
    run: ({ base, actor, at }) => {
      const f = actor(FADDEY);
      const j = actor(IUDA);
      if (f.names.map((n) => n.form).join() !== 'Фаддей,Леввей') throw new Error('D15-1: у Фаддея ожидались формы «Фаддей», «Леввей» (шаг D4-2)');
      if (j.names.map((n) => n.form).join() !== 'Иуда,Иуда Иаковлев,Иуда, брат Иакова') throw new Error('D15-1: у Иуды Иаковлева ожидались формы «Иуда», «Иуда Иаковлев», «Иуда, брат Иакова»');
      f.names = structuredClone(FADDEY_NAMES);
      f.disambig = 'апостол (Мф 10:3; Мк 3:18)';
      touch(f, 'D15-1');
      const iss = issuerOf(base);
      const retire = (id: string | undefined, to: string, refs: string[], reason: string) => {
        if (!id) return;
        iss?.retire(id);
        base.redirects.push({ from: id, to: [to], reason, refs, at });
      };
      // утверждения: «Один из двенадцати», «Поставлен в число», «Места Писания» — по одной записи на карточке, со стихами
      // обоих перечней; запись Иуды выбывает с переадресацией на запись Фаддея
      const merge = (fx: { id: string; field: string; has?: string }, jx: { id: string; field: string; has?: string }, value: Record<string, unknown>) => {
        const keep = fact(f, fx, 'D15-1');
        const drop = fact(j, jx, 'D15-1');
        keep.value = structuredClone(value);
        touch(keep, 'D15-1');
        j.facts = j.facts.filter((x) => x !== drop);
        retire(fixedId(drop), fixedId(keep) ?? FADDEY, ['Лк 6:16'], 'одна запись на карточке Фаддея (Д-15: Иуда Иаковлев — форма «выв.» Фаддея, 02 § 3.3.4)');
      };
      merge({ id: 'a-16293', field: 'status' }, { id: 'a-12961', field: 'status' }, { text: 'Один из двенадцати Апостолов', refs: ['Мф 10:2-3', 'Мк 3:18', 'Лк 6:13-16', 'Деян 1:13'] });
      merge({ id: 'a-16294', field: 'events', has: 'Поставлен в число' }, { id: 'a-12963', field: 'events', has: 'Поставлен в число' }, { text: 'Поставлен в число двенадцати Апостолов', refs: ['Мк 3:14-18', 'Мф 10:1-3', 'Лк 6:13-16'] });
      merge({ id: 'a-16295', field: 'scripture' }, { id: 'a-12967', field: 'scripture' }, { first: 'Мф 10:3', key: ['Мф 10:2-4', 'Мк 3:16-19', 'Лк 6:16', 'Деян 1:13', 'Ин 14:22'] });
      // остальные утверждения Иуды Иаковлева — на карточку Фаддея; держатся на формах «выв.» — idCert
      const move: { id: string; field: string; has?: string; idCert?: { form: string; refs: string[] }; value?: Record<string, unknown> }[] = [
        { id: 'a-12960', field: 'original' },
        { id: 'a-12962', field: 'kinNote', idCert: { form: IUDA_FORM, refs: ['Лк 6:16', 'Деян 1:13'] } },
        // цепочка двух выводов (02 § 3.3.5): «Иуда — не Искариот» (Ин 14:22) — по форме «Иуда Иаковлев», не строкой «Фаддей спросил»
        { id: 'a-12964', field: 'events', has: 'На вечери', idCert: { form: IUDA_FORM, refs: ['Ин 14:22'] } },
        { id: 'a-12965', field: 'events', has: 'горнице', idCert: { form: BRAT_FORM, refs: ['Деян 1:13'] } },
        { id: 'a-12966', field: 'sayings', idCert: { form: IUDA_FORM, refs: ['Ин 14:22'] } },
        {
          id: 'a-12968', field: 'notes', has: 'Возможно, это тот же человек',
          value: {
            kind: 'identification',
            text: 'Иуда Иаковлев (Лк 6:16; «Иуда, брат Иакова» — Деян 1:13) — другое имя Фаддея в перечне с названным числом. Что это один человек, Библия не говорит: так выходит, если сравнить перечни двенадцати Апостолов — «Двенадцати же Апостолов имена суть сии» (Мф 10:2), «избрал из них двенадцать» (Лк 6:13). Десять имён совпадают прямо, Симон Кананит и Симон Зилот — тоже; на оставшемся месте у Матфея и Марка — Фаддей («Леввей, прозванный Фаддеем», Мф 10:3; Мк 3:18), у Луки — Иуда Иаковлев. «Иуда — не Искариот» (Ин 14:22) — по-видимому, он же, если говорящий — из двенадцати: другого Иуды, кроме Искариота, в перечнях Луки нет',
            refs: ['Мф 10:2-3', 'Мк 3:18', 'Лк 6:13-16', 'Деян 1:13', 'Ин 14:22'],
          },
        },
        { id: 'a-12969', field: 'notes', has: 'Греческое «Иуда Иакова»' },
        { id: 'a-12970', field: 'notes', has: 'Не смешивать с Иудой Искариотом', idCert: { form: IUDA_FORM, refs: ['Лк 6:16'] } },
      ];
      for (const x of move) {
        const a = fact(j, x, 'D15-1');
        j.facts = j.facts.filter((y) => y !== a);
        if (x.value) a.value = structuredClone(x.value);
        if (x.idCert) a.idCert = structuredClone(x.idCert);
        f.facts.push(touch(a, 'D15-1'));
      }
      if (j.facts.length) throw new Error(`D15-1: у Иуды Иаковлева остались утверждения: ${j.facts.map((x) => x.id).join(', ')}`);
      f.facts.sort((a, b) => a.sec - b.sec);
      // членство по прежней раскладке у Иуды — снимается (у Фаддея — членство по названию, Мф 10:2–3, со стихами Луки)
      base.memberships = base.memberships.filter((m) => m.actor !== IUDA);
      const mf = base.memberships.find((m) => m.actor === FADDEY && m.area === 'g-apostles');
      if (!mf) throw new Error('D15-1: нет членства Фаддея в «Апостолах»');
      mf.refs = ['Мф 10:2-3', 'Лк 6:13-16'];
      touch(mf, 'D15-1');
      // время прежнего вида — к Фаддею
      const ch = base.chrono.find((c) => c.actor === IUDA);
      if (ch) touch(Object.assign(ch, { actor: FADDEY }), 'D15-1');
      // связь «возможно, то же лицо» не нужна
      const rel = (base.relations ?? []).find((r) => r.a === FADDEY && r.b === IUDA && r.kind === 'possibly-same');
      if (!rel) throw new Error('D15-1: нет связи Фаддей ~ Иуда Иаковлев');
      base.relations = base.relations.filter((r) => r !== rel);
      retire(fixedId(rel), FADDEY, ['Мф 10:3', 'Лк 6:16'], 'Иуда Иаковлев — форма «выв.» карточки Фаддея (Д-15, вид (б)): связь «возможно, то же лицо» не нужна');
      // карточка Иуды Иаковлева — в переадресацию
      const vol = base.volumes.find((v) => v.file === VOL_NT)!;
      vol.actors = vol.actors.filter((a) => a.id !== IUDA);
      base.redirects.push({ from: IUDA, to: [FADDEY], reason: 'вид (б), перечень с названным числом (02 § 3.3.4 [4.4 по Р-2]; Д-15): Иуда Иаковлев — форма «выв.» карточки Фаддея', refs: ['Лк 6:16', 'Деян 1:13', 'Мф 10:3', 'Мк 3:18'], at, basis: 'parallel' });
      return {
        what: 'Д-15: Фаддей и Иуда Иаковлев — одна карточка p-faddey (вид (б) по перечню с названным числом): формы «Фаддей» (основная), «Леввей» (with «Фаддей»), «Иуда Иаковлев» и «Иуда, брат Иакова» — «выв.» со стихами сравнения (Лк 6:16; Деян 1:13 — Мф 10:3; Мк 3:18; число — Лк 6:13); утверждения Иуды — у Фаддея (по Ин 14:22 и Деян 1:13 — с idCert), три повторных записи сведены в одну; p-iuda-iakovlev — переадресация basis parallel; связь ar-8 снята',
        why: '02 ред. 4.4 § 3.3.4 (Фаддей и Иуда Иаковлев — вид (б)), § 3.3.5 (форма «выв.», основное имя); В-32',
        refs: ['Мф 10:2-3', 'Мк 3:18', 'Лк 6:13-16', 'Деян 1:13', 'Ин 14:22'],
        actors: ['faddey', 'iuda-iakovlev'],
        other: ['relations', 'memberships', 'chrono', 'redirects'],
      };
    },
  },
  {
    id: 'D15-2',
    scope: [`actor:${IOFOR}`, `actor:${RAGUIL}`, `actor:${KHOVAV}.facts.notes`, `actor:${SEPFORA}.disambig`, `volume:${VOL_LEVI}`, `origin:${SEPFORA}|`, `origin:${KHOVAV}|`, `relation:${RAGUIL}|${IOFOR}|`, `nodata:${IOFOR}|`],
    run: ({ base, actor }) => {
      const io = actor(IOFOR);
      if (io.names.map((n) => n.form).join() !== 'Иофор,Рагуил') throw new Error('D15-2: у Иофора ожидались формы «Иофор», «Рагуил»');
      io.names = io.names.filter((n) => n.form !== 'Рагуил');
      touch(io, 'D15-2');
      const vol = base.volumes.find((v) => v.file === VOL_LEVI)!;
      if (vol.actors.some((a) => a.id === RAGUIL)) throw new Error('D15-2: карточка Рагуила уже есть');
      const r: Actor = { ...structuredClone(RAGUIL_CARD), facts: RAGUIL_CARD.facts.map((x) => ({ ...structuredClone(x), prov: by('D15-2') })), prov: { ...by('D15-2'), status: 'draft' } };
      vol.actors.splice(vol.actors.findIndex((a) => a.id === IOFOR) + 1, 0, r);
      // утверждения по стихам Рагуила (Исх 2:16–21; Чис 10:29) — к Рагуилу (номер записи тот же)
      const toR: { id: string; field: string; has?: string; value: Record<string, unknown>; cert?: Assertion['cert'] }[] = [
        { id: 'a-4353', field: 'childrenNote', has: 'семь дочерей', value: { text: 'У него было семь дочерей; они пришли напоить овец отца своего. Одну из них, Сепфору, он выдал за Моисея', refs: ['Исх 2:16', 'Исх 2:18', 'Исх 2:21'] } },
        { id: 'a-4354', field: 'childrenNote', has: 'Ховав назван сыном Рагуила', value: { text: 'Сын — Ховав: «Ховаву, сыну Рагуилову» (Чис 10:29)', refs: ['Чис 10:29'] }, cert: undefined },
        { id: 'a-4359', field: 'events', has: 'защитившего его дочерей', value: { text: 'Принял Моисея, защитившего его дочерей у колодезя, и выдал за него дочь свою Сепфору', refs: ['Исх 2:18-21'] } },
      ];
      for (const x of toR) {
        const a = fact(io, x, 'D15-2');
        io.facts = io.facts.filter((y) => y !== a);
        a.value = structuredClone(x.value);
        if ('cert' in x) delete a.cert;
        r.facts.push(touch(a, 'D15-2'));
      }
      r.facts.sort((a, b) => a.sec - b.sec);
      // утверждения Иофора — только по стихам Иофора
      const fixI: { id: string; field: string; has?: string; value: Record<string, unknown> }[] = [
        { id: 'a-4349', field: 'status', has: 'Священник Мадиамский', value: { text: 'Священник Мадиамский', refs: ['Исх 3:1', 'Исх 18:1'] } },
        { id: 'a-4351', field: 'lineage', has: 'Из Мадиама', value: { text: 'Из Мадиама: «священника Мадиамского» (Исх 3:1); после совета Моисею «пошел в землю свою» (Исх 18:27)', refs: ['Исх 3:1', 'Исх 18:1', 'Исх 18:27'] } },
        { id: 'a-4355', field: 'met', has: 'p-moisey', value: { id: 'p-moisey', refs: ['Исх 3:1', 'Исх 4:18', 'Исх 18:5-27'], text: 'Моисей пас его овец; отпустил Моисея в Египет; привёл к нему Сепфору и сыновей; дал совет о судьях' } },
        { id: 'a-4357', field: 'places', has: 'Земля Мадиамская', value: { name: 'Земля Мадиамская', role: 'residence', refs: ['Исх 3:1', 'Исх 18:27'] } },
        { id: 'a-4371', field: 'scripture', value: { first: 'Исх 3:1', key: ['Исх 3:1', 'Исх 4:18', 'Исх 18:1-27'] } },
        {
          id: 'a-4372', field: 'notes', has: 'Рагуилом',
          value: { kind: 'identification', text: `Возможно, это тот же человек, что Рагуил, отец Сепфоры: так выходит, если сравнить Исх 2:18 и Исх 3:1. ${RAGUIL_REL.note}`, refs: [...RAGUIL_REL.refs] },
        },
      ];
      for (const x of fixI) {
        const a = fact(io, x, 'D15-2');
        a.value = structuredClone(x.value);
        touch(a, 'D15-2');
      }
      // рёбра: Сепфора и Ховав — к Рагуилу, уровень «Писание» (Исх 2:18, 21; Чис 10:29)
      const os = base.origins.find((o) => o.child === SEPFORA && o.parent === IOFOR);
      const ok = base.origins.find((o) => o.child === KHOVAV && o.parent === IOFOR);
      if (!os || !ok) throw new Error('D15-2: нет рёбер Сепфора ← Иофор и Ховав ← Иофор');
      touch(Object.assign(os, { parent: RAGUIL, refs: ['Исх 2:18', 'Исх 2:21'], cert: 'scripture' }), 'D15-2');
      Object.assign(ok, { parent: RAGUIL, refs: ['Чис 10:29'], cert: 'scripture' });
      delete ok.identity;
      touch(ok, 'D15-2');
      actor(SEPFORA).disambig = 'жена Моисея, дочь Рагуила';
      const kn = fact(actor(KHOVAV), { id: 'a-4401', field: 'notes', has: 'сыном Рагуиловым' }, 'D15-2');
      kn.value = { kind: 'identification', text: 'Назван «сыном Рагуиловым» (Чис 10:29). Рагуил, отец Сепфоры, — возможно, тот же человек, что Иофор, тесть Моисея (см. Рагуила): так выходит, если сравнить Исх 2:18 и Исх 3:1', refs: ['Чис 10:29', 'Исх 2:18', 'Исх 3:1'] };
      touch(kn, 'D15-2');
      // «нет сведений» Иофора: стихи Рагуила — не стихи Иофора
      for (const n of base.nodata.filter((x) => x.actor === IOFOR && x.read)) {
        n.read = n.read!.filter((x) => x !== 'Исх 2:18' && x !== 'Чис 10:29');
        touch(n, 'D15-2');
      }
      base.relations.push({ a: RAGUIL, b: IOFOR, kind: 'possibly-same', refs: [...RAGUIL_REL.refs], cert: 'inference', note: RAGUIL_REL.note, prov: { ...by('D15-2'), status: 'draft' } });
      return {
        what: 'Д-15: Рагуил — своя карточка p-raguil (вид (в)): формы «Рагуил» (Исх 2:18; Чис 10:29); утверждения по Исх 2:16–21 и Чис 10:29 — у Рагуила; рёбра Сепфоры (Исх 2:18, 21) и Ховава (Чис 10:29) — к Рагуилу, «Писание», без тождества «весомо»; у Иофора — только стихи Иофора; «возможно, то же лицо» уровня «вывод» Рагуил — Иофор',
        why: '02 ред. 4.4 § 3.3.4 (Рагуил и Иофор — вид (в)); Д-4; В-32',
        refs: ['Исх 2:16-21', 'Исх 3:1', 'Исх 18:2', 'Чис 10:29'],
        actors: ['iofor', 'raguil', 'khovav', 'sepfora'],
        other: ['relations', 'origins'],
      };
    },
  },
  {
    id: 'D15-3',
    scope: [`actor:${ABIKHAIL}.names`, `actor:${ESFIR}.disambig`],
    run: ({ actor }) => {
      const a = actor(ABIKHAIL);
      if (a.names.map((n) => `${n.form}:${n.refs.join()}`).join('|') !== 'Абихаил:Есф 9:29|Аминадав:Есф 2:15') throw new Error('D15-3: у отца Есфири ожидались формы «Абихаил» (Есф 9:29), «Аминадав» (Есф 2:15)');
      a.names = [
        { id: `${ABIKHAIL}#n2`, form: 'Аминадав', type: 'main', refs: ['Есф 2:15'] },
        {
          id: `${ABIKHAIL}#n1`, form: 'Абихаил', type: 'variant', refs: ['Есф 9:29'], cert: 'inference',
          compare: { form: { refs: ['Есф 9:29'] }, main: { refs: ['Есф 2:15'] } },
          why: { codes: ['parallel', 'same-node', 'one-candidate', 'no-contradiction'], note: 'оба имени стоят на одном месте одного лица: отец Есфири — «Есфири, дочери Аминадава» (Есф 2:15) и «царица Есфирь, дочь Абихаила» (Есф 9:29); двух отцов у неё текст не даёт' },
        },
      ];
      actor(ESFIR).disambig = 'царица, дочь Аминадава';
      return {
        what: 'Д-15: отец Есфири — одна карточка вида (б): основное имя «Аминадав» (Есф 2:15; по одному стиху, Есф 2:15 раньше — правило 02 § 3.3.5), «Абихаил» (Есф 9:29) — форма «выв.» со стихами сравнения; номер карточки прежний',
        why: '02 ред. 4.4 § 3.3.4 (Есфирь — проверка 1: оба имени на одном месте одного лица), § 3.3.5; В-32',
        refs: ['Есф 2:15', 'Есф 9:29'],
        actors: ['abikhail-otets-esfiri', 'esfir'],
      };
    },
  },
];
