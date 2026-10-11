/**
 * Шаги правки по второму ключу Д-15 партии 2 для времени (reviews/Д-15-партия-2-второй-ключ.md, № 7, 14; решения координатора
 * 3, 5). Шаги D6-5…D6-7 в коммите и не меняются.
 *
 * D6-8 «Конец земной жизни» — два случая: Енох — текст говорит, что смерти не было (`not-died`, Евр 11:5); Сим и потомки в
 *      Быт 11 — «и умер» только в скобках (`bracket`). Подписи разные: «взят Богом» и «прожил всего N лет».
 * D6-9 Входы времени на форме «выв.» по букве 02 § 3.3.5 («или не названо вовсе») — idCert.
 */
import type { Step } from './corrections.ts';
import { inferredForms, restsOnFormLoose } from './name-forms.ts';
import type { ChronoD6 } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });
const GEN11 = ['p-sim', 'p-arfaksad', 'p-sala', 'p-ever', 'p-falek', 'p-ragav', 'p-serukh', 'p-nakhor'];

export const STEPS_D6C: Step[] = [
  {
    id: 'D6-8',
    scope: ['chrono:p-enokh', ...GEN11.map((x) => `chrono:${x}`)],
    run: ({ base }) => {
      for (const [id, why] of [['p-enokh', 'not-died'], ...GEN11.map((x) => [x, 'bracket'])] as [string, 'not-died' | 'bracket'][]) {
        const c = base.chrono.find((x) => x.actor === id);
        const t = (c?.chrono as ChronoD6 | undefined)?.inputs.find((x) => x.kind === 'end-of-life');
        if (!c || !t) throw new Error(`D6-8: нет входа «конец земной жизни» у ${id}`);
        t.endOfLife = why;
        c.prov = { ...c.prov, ...by('D6-8') };
      }
      return {
        what: 'Д6-3, второй ключ Д-15 партии 2: у входа «конец земной жизни» — причина: Енох — «не видел смерти» (not-died, Евр 11:5); Сим и семь потомков — «и умер» только в скобках (bracket, Быт 11:11–25)',
        why: 'второй ключ Д-15 партии 2, № 14; решение координатора 5',
        refs: ['Евр 11:5', 'Быт 11:11'],
        actors: ['enokh', ...GEN11.map((x) => x.slice(2))],
      };
    },
  },
  {
    id: 'D6-9',
    scope: ['chrono:'],
    run: ({ base }) => {
      const actors = new Map(base.volumes.flatMap((v) => v.actors.map((a) => [a.id, a] as const)));
      const got: string[] = [];
      for (const c of base.chrono) {
        const ch = c.chrono as ChronoD6 | undefined;
        if (!Array.isArray(ch?.inputs)) continue;
        for (const t of ch!.inputs) {
          if (t.idCert || !t.refs?.length) continue;
          for (const id of [c.actor, t.other]) {
            const a = id ? actors.get(id) : undefined;
            if (!a || !inferredForms(a).length) continue;
            const f = restsOnFormLoose(a, t.refs);
            if (!f) continue;
            t.idCert = { form: f.id!, refs: [...t.refs] };
            c.prov = { ...c.prov, ...by('D6-9') };
            got.push(`${c.actor} (${t.kind}, ${f.form})`);
            break;
          }
        }
      }
      return {
        what: `Д-15, второй ключ партии 2: входы времени на форме «выв.» по букве 02 § 3.3.5 — idCert: ${got.join('; ') || 'нет'}`,
        why: '02 § 3.3.5; второй ключ Д-15 партии 2, № 7; решение координатора 3',
        refs: ['4Цар 15:1'],
        actors: [...new Set(got.map((x) => x.split(' ')[0].slice(2)))],
      };
    },
  },
];
