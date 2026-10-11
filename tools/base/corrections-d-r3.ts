/**
 * Шаги правки по задачам данных 02 § 3.18, первая партия — третья очередь: по повторной проверке второго ключа
 * (docs/app/reviews/Д-партия-1-второй-ключ.md, «Повторная проверка») и решениям координатора. Шаги D5…D2-2 уже в коммите и
 * не меняются; перед этими шагами номера закрепляются (freezeIds).
 *
 * D7-3 (Д-7, замечание № 2): поле события `calc.event` — снова ссылка на стих, без приписки. Ирод Великий — стих его смерти:
 *      «По смерти же Ирода» (Мф 2:19); Феликс — стих конца службы: «на место Феликса поступил Порций Фест» (Деян 24:27).
 *      Что это конец службы, сказано в примечании записи.
 * D5-3 (П-2): у карточек безымянных царей — § 23 «первый стих», как у остальных новых карточек.
 * D2-3 (Д-2): у Лавана и Захарии — пропуск и перечень пропущенных (02 § 3.4): Вафуил (Быт 28:5; 24:24), Варахия (Зах 1:1, 7).
 */
import type { Step } from './corrections.ts';
import type { Ref } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });

const END_ONLY: { actor: string; refs: string; event: Ref; addRef?: Ref; note: string }[] = [
  { actor: 'p-irod-velikiy', refs: 'Лк 1:5;Мф 2:1;Мф 2:22', event: 'Мф 2:19', addRef: 'Мф 2:19', note: 'конец царствования — «По смерти же Ирода» (Мф 2:19)' },
  { actor: 'p-feliks', refs: 'Деян 23:24;Деян 24:27', event: 'Деян 24:27', note: 'конец службы — «на место Феликса поступил Порций Фест» (Деян 24:27)' },
];

const KINGS: { actor: string; ref: Ref }[] = [
  { actor: 'p-tsar-2par28-7', ref: '2Пар 28:7' },
  { actor: 'p-tsar-ier38-6', ref: 'Иер 38:6' },
];

const SKIPPED: { c: string; p: string; actors: string[]; refs: Ref[] }[] = [
  { c: 'p-lavan', p: 'p-nakhor-syn-farry', actors: ['p-vafuil'], refs: ['Быт 28:5', 'Быт 24:24'] },
  { c: 'p-zakhariya-syn-varakhii', p: 'p-adda', actors: ['p-varakhiya-otets-zakharii'], refs: ['Зах 1:1', 'Зах 1:7'] },
];

export const STEPS_D_3: Step[] = [
  {
    id: 'D7-3',
    scope: END_ONLY.map((x) => `actor:${x.actor}.facts.offices`),
    run: ({ actor }) => {
      for (const x of END_ONLY) {
        const fs = actor(x.actor).facts.filter((f) => f.field === 'offices' && f.calc && (f.value as any)?.refs?.join(';') === x.refs);
        if (fs.length !== 1) throw new Error(`D7-3: ${x.actor} ${x.refs}: ожидалась одна запись со ссылкой на расчёт`);
        const f = fs[0];
        const v = f.value as { refs: Ref[]; note?: string };
        if (x.addRef && !v.refs.includes(x.addRef)) v.refs = [...v.refs, x.addRef];
        v.note = x.note;
        f.calc = { ...f.calc!, event: x.event };
        f.prov = { ...f.prov, ...by('D7-3') };
      }
      return {
        what: 'Д-7: у Ирода Великого и Феликса поле события calc.event — снова ссылка на стих (Мф 2:19 — смерть Ирода; Деян 24:27 — конец службы Феликса); что это конец, сказано в примечании записи',
        why: 'Повторная проверка второго ключа, Д-7 № 2 (02 § 3.10.2: event — стих или история e-…); решение координатора, п. 1',
        refs: ['Мф 2:19', 'Деян 24:27'],
        actors: ['irod-velikiy', 'feliks'],
      };
    },
  },
  {
    id: 'D5-3',
    scope: KINGS.map((x) => `actor:${x.actor}`),
    run: ({ actor }) => {
      for (const x of KINGS) {
        const a = actor(x.actor);
        if (a.facts.length) throw new Error(`D5-3: у ${x.actor} уже есть утверждения`);
        a.facts.push({ sec: 23, field: 'scripture', value: { first: x.ref }, prov: by('D5-3') });
      }
      return {
        what: 'Д-5: у карточек безымянных царей (2Пар 28:7; Иер 38:6) — § 23 «первый стих»',
        why: 'Повторная проверка второго ключа, П-2; решение координатора, п. 2',
        refs: KINGS.map((x) => x.ref),
        actors: KINGS.map((x) => x.actor.slice(2)),
      };
    },
  },
  {
    id: 'D2-3',
    scope: SKIPPED.map((x) => `origin:${x.c}|${x.p}|`),
    run: ({ base }) => {
      for (const x of SKIPPED) {
        const os = base.origins.filter((o) => o.child === x.c && o.parent === x.p && o.degree === 'inferred');
        if (os.length !== 1 || os[0].skipped) throw new Error(`D2-3: ${x.c} ← ${x.p}: ожидалось одно ребро «степень выведена» без перечня`);
        Object.assign(os[0], { gap: true, skipped: { actors: [...x.actors], refs: [...x.refs] }, prov: { ...os[0].prov, ...by('D2-3') } });
      }
      return {
        what: 'Д-2: у Лавана (Вафуил — Быт 28:5; 24:24) и Захарии (Варахия — Зах 1:1, 7) — пропуск и перечень пропущенных',
        why: '02 § 3.4 («Пропуск поколений»); повторная проверка второго ключа; решение координатора, п. 3',
        refs: ['Быт 28:5', 'Быт 24:24', 'Зах 1:1', 'Зах 1:7'],
        actors: ['lavan', 'nakhor-syn-farry', 'zakhariya-syn-varakhii', 'adda'],
      };
    },
  },
];
