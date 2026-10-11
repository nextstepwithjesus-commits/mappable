/**
 * Шаги правки по задаче Д6-3 (очередь спорных мест; второй ключ Д6 пакета 1 — reviews/время-пакет-1-второй-ключ.md) и
 * тождество по форме у входов времени (Д-15, партия 2). Отчёт — docs/app/reviews/Д-15-партия-2-отчёт.md. Шаги D6-1…D6-4
 * уже в коммите и не меняются.
 *
 * D6-5 Енох — вход «конец земной жизни» (end-of-life), а не «возраст при смерти»: «Всех же дней Еноха было триста шестьдесят
 *      пять лет» (Быт 5:23); «и не стало его, потому что Бог взял его» (Быт 5:24); «Верою Енох переселен был так, что не видел
 *      смерти» (Евр 11:5). У события эпохи 1 — то же правило.
 * D6-6 Мелкое по второму ключу Д6: «не позже 40-го года» у Мариам и Иаира (№ 3); Быт 7:11 у Ханаана и Мадая (№ 4); Сим и
 *      потомки в Быт 11 — «конец земной жизни»: «и умер» там только в скобках (№ 5); Нав 4:19 и 5:6 в правиле границы эпохи 5 (№ 6);
 *      многоточие в словах Нав 3:17 (№ 7).
 * D6-7 Входы времени, которые держатся на форме «выв.» лица или второго участника (Азария — форма Озии, D15-5), — idCert.
 */
import type { Step } from './corrections.ts';
import type { Base } from './migrate.ts';
import { inferredForms, restsOnForm } from './name-forms.ts';
import { scriptureTexts } from './brackets.ts';
import type { ChronoD6, TimeInput } from './types.ts';

const by = (id: string) => ({ by: `исправление ${id}` });
const rec = (base: Base, actor: string, step: string): ChronoD6 => {
  const c = base.chrono.find((x) => x.actor === actor);
  const ch = c?.chrono as ChronoD6 | undefined;
  if (!c || !Array.isArray(ch?.inputs)) throw new Error(`${step}: нет хронологической записи окончательного вида ${actor}`);
  c.prov = { ...c.prov, ...by(step) };
  return ch!;
};
const one = (ch: ChronoD6, kind: TimeInput['kind'], step: string, who: string) => {
  const xs = ch.inputs.filter((t) => t.kind === kind);
  if (xs.length !== 1) throw new Error(`${step}: у ${who} ожидался один вход ${kind}, найдено ${xs.length}`);
  return xs[0];
};

/** Сим и потомки в Быт 11:10–25: «и умер» — только в скобках. */
const GEN11 = ['p-sim', 'p-arfaksad', 'p-sala', 'p-ever', 'p-falek', 'p-ragav', 'p-serukh', 'p-nakhor'];
const DEATH = /(^|[^а-яё])(умер|умерл|скончал|почил)/;
const EXODUS = { text: 'исшествие сынов Израилевых из земли Египетской', refs: ['Исх 12:41'] };

export const STEPS_D6B: Step[] = [
  {
    id: 'D6-5',
    scope: ['chrono:p-enokh', 'epoch:era-antediluvian'],
    run: ({ base }) => {
      const ch = rec(base, 'p-enokh', 'D6-5');
      const t = one(ch, 'age-at-death', 'D6-5', 'Еноха');
      Object.assign(t, {
        kind: 'end-of-life', refs: ['Быт 5:23', 'Быт 5:24', 'Евр 11:5'],
        note: 'всех дней Еноха (Быт 5:23); смерти текст не называет: «и не стало его, потому что Бог взял его» (Быт 5:24), «Енох переселен был так, что не видел смерти» (Евр 11:5)',
      });
      const e = base.epochs.find((x) => x.id === 'era-antediluvian')!;
      const ev = (e.events as any[]).find((x) => x.rule?.person === 'p-enokh');
      if (!ev) throw new Error('D6-5: нет события Еноха в эпохе 1');
      ev.rule = { person: 'p-enokh', of: 'end-of-life' };
      ev.refs = ['Быт 5:23-24', 'Евр 11:5'];
      e.prov = { ...e.prov, ...by('D6-5') };
      return {
        what: 'Д6-3: Енох — вход «конец земной жизни» (end-of-life) 365 лет вместо «возраста при смерти»; у события эпохи 1 «Енох взят Богом» — правило того же вида; Евр 11:5 — в стихах',
        why: 'второй ключ Д6, № 1; очередь Д6-3; новый вид входа — в поправку 02 § 3.15.5 (отчёт Д-15, партия 2)',
        refs: ['Быт 5:23', 'Быт 5:24', 'Евр 11:5'],
        actors: ['enokh'],
        other: ['epoch:era-antediluvian'],
      };
    },
  },
  {
    id: 'D6-6',
    scope: ['chrono:p-mariam', 'chrono:p-iair-syn-seguva', 'chrono:p-khanaan', 'chrono:p-maday', 'epoch:era-exodus', ...GEN11.map((x) => `chrono:${x}`)],
    run: ({ base }) => {
      // № 3: год текст не называет — «не позже сорокового года по исшествии»
      const m = one(rec(base, 'p-mariam', 'D6-6'), 'years-after', 'D6-6', 'Мариам');
      Object.assign(m, {
        kind: 'not-after', of: 'death', event: EXODUS,
        note: 'умерла в Кадесе «в первый месяц» (Чис 20:1) — какого года, текст не говорит; по порядку рассказа — прежде смерти Аарона в сороковой год по исшествии (Чис 20:22–28; 33:38): не позже сорокового года, вероятно, того же',
      });
      const j = one(rec(base, 'p-iair-syn-seguva', 'D6-6'), 'years-after', 'D6-6', 'Иаира');
      Object.assign(j, {
        kind: 'not-after', of: 'life',
        note: 'взял селения в Галааде при Моисее (Чис 32:41) — прежде речи Моисея в сороковой год (Втор 1:3), где это названо прошедшим (Втор 3:14): не позже сорокового года по исшествии; точный год текст не называет',
      });
      // № 4: что 601 — год жизни Ноя, видно из Быт 7:11 (в Быт 8:13 слова «[жизни Ноевой]» — в скобках)
      for (const a of ['p-khanaan', 'p-maday']) {
        const t = one(rec(base, a, 'D6-6'), 'not-before', 'D6-6', a);
        t.refs = [...new Set(['Быт 7:6', 'Быт 7:11', ...t.refs])];
        t.note = `${t.note}. Что это годы жизни Ноя, видно из Быт 7:11 («В шестисотый год жизни Ноевой»): в Быт 8:13 слова «жизни Ноевой» — в скобках`;
      }
      // № 5: Быт 11 — «и умер» только в скобках: «конец земной жизни», подпись «прожил всего N лет»
      let n = 0;
      for (const a of GEN11) {
        const t = one(rec(base, a, 'D6-6'), 'age-at-death', 'D6-6', a);
        if (DEATH.test(t.refs.flatMap((r) => scriptureTexts(r)).join(' '))) throw new Error(`D6-6: у ${a} в стихах входа названа смерть вне скобок`);
        t.kind = 'end-of-life';
        n++;
      }
      // № 6, № 7: эпоха 5 — Нав 4:19 и 5:6 в правиле границы; многоточие на месте слова «[сыны]» в Нав 3:17
      const e = base.epochs.find((x) => x.id === 'era-exodus')!;
      e.end.rule.refs = [...new Set([...e.end.rule.refs, 'Нав 4:19', 'Нав 5:6'])];
      e.end.words = 'Все… Израилевы переходили по суше, доколе весь народ не перешел чрез Иордан';
      e.prov = { ...e.prov, ...by('D6-6') };
      return {
        what: `Д6-3, мелкое по второму ключу Д6: у Мариам и Иаира — «не позже сорокового года» (not-after) вместо «в сороковой год»; у Ханаана и Мадая — Быт 7:11 в стихах входа; у Сима и потомков в Быт 11 (${n}) — «конец земной жизни» вместо «возраста при смерти» («и умер» — только в скобках); эпоха 5 — Нав 4:19 и 5:6 в правиле границы, многоточие в словах Нав 3:17`,
        why: 'второй ключ Д6 пакета 1, № 3–7; очередь Д6-3',
        refs: ['Чис 20:1', 'Чис 33:38', 'Быт 7:11', 'Быт 11:11', 'Нав 4:19', 'Нав 5:6', 'Нав 3:17'],
        actors: ['mariam', 'iair-syn-seguva', 'khanaan', 'maday', ...GEN11.map((x) => x.slice(2))],
        other: ['epoch:era-exodus'],
      };
    },
  },
  {
    id: 'D6-7',
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
            const f = restsOnForm(a, t.refs);
            if (!f) continue;
            t.idCert = { form: f.id!, refs: [...t.refs] };
            c.prov = { ...c.prov, ...by('D6-7') };
            got.push(`${c.actor} (${t.kind}, ${f.form})`);
            break;
          }
        }
      }
      // «Иофам, сын царя, начальствовал над дворцом» (4Цар 15:5): царь в стихе не назван, ближайшее имя перед ним — «Азария»
      // (4Цар 15:1; второй ключ Д6, № 2: «4 Цар 15:5–7, где имя стоит в соседних стихах») — 02 § 3.3.5, «не названо вовсе»
      const io = base.chrono.find((x) => x.actor === 'p-ioafam');
      const uk = (io?.chrono as ChronoD6 | undefined)?.inputs.find((t) => t.kind === 'under-king' && t.other === 'p-oziya');
      const az = actors.get('p-oziya')?.names.find((n) => n.form === 'Азария');
      if (!io || !uk || !az?.id) throw new Error('D6-7: нет входа Иоафама «при царе Озии» или формы «Азария»');
      uk.idCert = { form: az.id, refs: ['4Цар 15:5', '4Цар 15:1'] };
      io.prov = { ...io.prov, ...by('D6-7') };
      got.push('p-ioafam (under-king, Азария — ближайшее имя, 4Цар 15:1)');
      return {
        what: `Д-15: входы времени, которые держатся на форме «выв.» лица или второго участника, — idCert: ${got.join('; ')}`,
        why: '02 ред. 4.4 § 3.3.5 (тождество по форме у записей); второй ключ Д6, № 2 («Азария» — форма «выв.» Озии)',
        refs: ['4Цар 14:21', '4Цар 15:1', '4Цар 15:17'],
        actors: [...new Set(got.map((x) => x.split(' ')[0].slice(2)))],
      };
    },
  },
];
