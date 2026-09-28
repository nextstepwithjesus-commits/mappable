/**
 * «Кратко» (L8b, этап 7, круг 3): CARD-77 — части подзаголовка «затем…», «потом…» не начинают фразу, мужья — по порядку
 * текста; CARD-82 — без самоповторов и повторов подзаголовка.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { persons, byId, loadCard } from '../src/data/atlas.ts';
import type { Card } from '../src/data/types.ts';
import { briefSentences, briefText, disambigHead } from '../src/ui/card/Brief.tsx';
import { nameCase } from '../src/ui/text/ru.ts';
import { stemsOf } from '../src/ui/text/repeat.ts';

const cards = new Map<string, Card | null>();
const briefs = new Map<string, string>();
beforeAll(async () => {
  for (const p of persons) {
    const c = (await loadCard(p.id))?.card ?? null;
    cards.set(p.id, c);
    briefs.set(p.id, briefText(p.id, c).replace(/\u00a0/g, ' '));
  }
}, 300_000);

describe('CARD-77: браки по порядку текста', () => {
  test('подзаголовок: части «затем …», «потом …» — не служение', () => {
    expect(disambigHead('дочь Елиама, жена Урии, затем Давида, мать Соломона')).toBe('');
    expect(disambigHead('жена Филиппа, потом Ирода четвертовластника')).toBe('');
    expect(disambigHead('жена Навала, затем Давида')).toBe('');
    expect(disambigHead('пророк и законодатель, сын Амрама')).toBe('пророк и законодатель');
  });

  test('ни одно «Кратко» не начинает предложение словами «Затем», «Потом»', () => {
    const bad: string[] = [];
    for (const [id, t] of briefs) if (/(^|[.!?] )(Затем|Потом)(?![а-яё])/.test(t)) bad.push(`${id}: «${t}»`);
    expect(bad).toEqual([]);
  });

  test('Вирсавия, Авигея, Иродиада: сначала первый муж, затем второй', () => {
    expect(briefs.get('virsaviya')).toBe('Царица-мать, дочь Елиама; жена Урии, затем Давида; мать Соломона и Нафана.');
    expect(briefs.get('avigeya')).toMatch(/^Жена Навала, затем Давида(\.|;)/);
    expect(briefs.get('irodiada')).toMatch(/^Жена Филиппа, затем Ирода(\.|;)/);
  });

  test('у всех женщин порядок мужей в «Кратко» совпадает с подзаголовком', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const p of persons) {
      if (p.sex !== 'f') continue;
      const dis = p.disambig.toLowerCase();
      // мужья — имена-ссылки после «жена»/«затем»/«наложница» в первом предложении
      const segs = briefSentences(p.id, cards.get(p.id)!).flatMap((s) => s.segs);
      const at = segs.findIndex((x) => typeof x === 'string' && /(жена|наложница|вдова) $/i.test(x));
      if (at < 0) continue;
      const husbands: string[] = [];
      for (let i = at + 1; i < segs.length; i++) {
        const x = segs[i];
        if (typeof x === 'string') {
          if (/^, затем( жена| наложница)? $/.test(x)) continue;
          break;
        }
        husbands.push(x.id);
      }
      if (husbands.length < 2) continue;
      // место каждого мужа в подзаголовке — по родительному падежу его имени
      const pos = husbands.map((h) => {
        const q = byId.get(h)!;
        const g = nameCase(q.name, q.sex, 'gen', q.unnamed)?.toLowerCase();
        return g ? dis.indexOf(g) : -1;
      });
      if (pos.some((x) => x < 0)) continue;
      checked++;
      if (pos.some((x, i) => i > 0 && x < pos[i - 1])) bad.push(`${p.id}: «${p.disambig}» — «${briefs.get(p.id)}»`);
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('CARD-82: «Кратко» не повторяет себя и подзаголовок', () => {
  /** Части «Кратко» (без стихов в скобках): предложения и части через «;» и «,». */
  const clauses = (t: string) =>
    t
      .replace(/ \([^()]*\d:\d[^()]*\)/g, '')
      .split(/[.;]\s+|\.$/)
      .flatMap((s) => s.split(/,\s+/))
      .map((s) => s.trim())
      .filter(Boolean);

  test('часть, чьи основы уже все сказаны раньше, не добавляется (кроме имён и записей из данных)', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const c = cards.get(p.id);
      let t = briefs.get(p.id)!;
      // записи § 5 и § 17, взятые дословно, — текст составителя, а не сборка «Кратко»
      for (const x of [c?.status?.[0]?.text, c?.events?.[0]?.text]) if (x) t = t.replace(x.replace(/[.;]\s*$/, '').replace(/^./, (a) => a.toUpperCase()), '§');
      const seen = new Set<string>();
      for (const part of clauses(t)) {
        const st = stemsOf(part);
        if (st.length && st.every((w) => seen.has(w)) && !/^(отец|мать|сын|дочь|законный|в родословии|в линии)/i.test(part)) {
          bad.push(`${p.id}: «${briefs.get(p.id)}»`);
          break;
        }
        for (const w of st) seen.add(w);
      }
    }
    expect(bad.slice(0, 15), `${bad.length} лиц`).toEqual([]);
  });

  test('«В родословии Иисуса Христа…» не добавляется, если уже сказано «праотец в родословии»', () => {
    const bad = [...briefs].filter(([, t]) => /родословии Иисуса Христа.*родословии Иисуса Христа/.test(t)).map(([id, t]) => `${id}: «${t}»`);
    expect(bad).toEqual([]);
  });

  test('часть подзаголовка, повторённая записью § 5, не стоит перед ней: «Хананеянин; его дочь…», не «Хананеянин. Хананеянин; …»', () => {
    const bad: string[] = [];
    for (const [id, t] of briefs) {
      const ss = t.split(/(?<=\.) /);
      if (ss.length > 1 && /^[А-ЯЁ][а-яё]+(,? [а-яё]+)?\.$/.test(ss[0]) && ss[1].toLowerCase().startsWith(ss[0].slice(0, -1).toLowerCase())) bad.push(`${id}: «${t}»`);
    }
    expect(bad).toEqual([]);
  });

  test('примеры: Арам, Шехания, Иисус Христос, Хананеянин Шуа', () => {
    expect(briefs.get('aram')).not.toMatch(/Праотец в родословии Иисуса Христа\..*В родословии Иисуса Христа/);
    expect(briefs.get('aram')).toMatch(/В родословии Иисуса Христа по обеим линиям|Праотец в родословии Иисуса Христа/);
    expect(briefs.get('shekhaniya-syn-iekhiila')).toMatch(/^Сын Иехиила/);
    expect(briefs.get('iisus')).not.toMatch(/Сын Божий, Сын Давидов/);
    expect(briefs.get('iisus')).toMatch(/^Христос, Сын Бога Живаго; родился от Марии/);
    expect(briefs.get('potifar')).toMatch(/^Египтянин, царедворец фараонов/);
    expect(briefs.get('efron')).toBe('Хеттеянин, сын Цохара.');
    expect(briefs.get('shua-khananeyanin')).not.toMatch(/Хананеянин\. Хананеянин/);
  });
});
