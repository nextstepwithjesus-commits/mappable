/**
 * «Кратко» (F3; CARD-35; решение владельца 11) по всем 2 660 лицам: абзац есть у каждой карточки, грамматичен,
 * без голых чисел и служебных слов; всё о линиях Мессии совпадает с data/lines (lineMembership); имя в косвенном
 * падеже — только через склонение src/ui/text/ru.ts.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { persons, byId, loadCard, lineMembership, graph } from '../src/data/atlas.ts';
import type { Card } from '../src/data/types.ts';
import { briefSentences, briefText, BRIEF_MAX_SMALL } from '../src/ui/card/Brief.tsx';
import { nameCase } from '../src/ui/text/ru.ts';

const cards = new Map<string, Card | null>();
const briefs = new Map<string, string>();
beforeAll(async () => {
  for (const p of persons) {
    const c = (await loadCard(p.id))?.card ?? null;
    cards.set(p.id, c);
    // неразрывные пробелы («40 лет») — обычными: проверки читают текст, как его видит читатель
    briefs.set(p.id, briefText(p.id, c).replace(/\u00a0/g, ' '));
  }
}, 300_000);

/** Текст без записей, взятых из данных дословно (§ 5, § 17), и без стихов в скобках: проверяется то, что собрал интерфейс. */
function built(id: string): string {
  const c = cards.get(id);
  let t = briefs.get(id)!;
  for (const x of [c?.status?.[0]?.text, c?.events?.[0]?.text]) if (x) t = t.replace(x.replace(/[.;]\s*$/, '').replace(/^./, (a) => a.toUpperCase()), '§');
  return t.replace(/ \([^()]*\d:\d[^()]*\)/g, '');
}

describe('«Кратко» у всех лиц', () => {
  test('есть у каждой карточки: предложения с прописной, с точкой в конце', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const t = briefs.get(p.id)!;
      if (!t) bad.push(`${p.id}: пусто`);
      else if (!/^[А-ЯЁ«]/.test(t) || !/\.$/.test(t)) bad.push(`${p.id}: «${t}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  test('нет undefined, null, NaN, [object …], двойных знаков и пробелов перед знаками', () => {
    const bad: string[] = [];
    for (const [id, t] of briefs) if (/undefined|\bnull\b|NaN|\[object| [,.;:]|,,|\.\.|;;|  /.test(t)) bad.push(`${id}: «${t}»`);
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  test('нет голых чисел: число — только с единицей («40 лет») или в ссылке на стих', () => {
    const bad: string[] = [];
    for (const [id] of briefs) {
      const t = built(id);
      for (const m of t.matchAll(/(^|[^\d:–-])(\d+)(?![\d:–-])/g)) {
        const after = t.slice(m.index! + m[0].length);
        if (!/^\s(лет|год|года|месяц|месяца|месяцев|г\.|гг\.)/.test(after)) bad.push(`${id}: «${t}»`);
      }
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  test('о линиях Мессии — ровно то, что в data/lines', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const t = briefs.get(p.id)!;
      const j = lineMembership.joseph.get(p.id);
      const m = lineMembership.mary.get(p.id);
      const says = /родословии Иисуса Христа|В линии/.test(t);
      if (p.id === 'iisus') {
        if (says) bad.push(`${p.id}: у Самого Иисуса Христа — строка о Его родословии`);
        continue;
      }
      if (!!(j || m) !== says) bad.push(`${p.id}: в линиях ${j ? 'Иосифа ' : ''}${m ? 'Луки' : ''}, а «Кратко»: «${t}»`);
      if (/по обеим линиям/.test(t) && !(j && m)) bad.push(`${p.id}: «по обеим линиям» не в обеих`);
      if (/по линии Иосифа/.test(t) && (!j || m)) bad.push(`${p.id}: «по линии Иосифа»`);
      if (/по линии Луки/.test(t) && (!m || j)) bad.push(`${p.id}: «по линии Луки»`);
      if (/по толкованию/.test(t) && m?.flag !== 'interpretation') bad.push(`${p.id}: «по толкованию» без звена толкования`);
      if (/у Матфея опущен/.test(t) && j?.flag !== 'omitted-by-mt') bad.push(`${p.id}: «опущен» без пометы`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  test('согласовано с полом: у женщин — «дочь», «мать», «жена»; у мужчин — «сын», «отец»', () => {
    const bad: string[] = [];
    for (const p of persons) {
      if (p.kind === 'people' || p.kind === 'clan') continue;
      const t = built(p.id);
      if (p.sex === 'f' && /(^|[;,.] )(сын|отец|законный отец|царствовал|Упомянут)(?![а-яё])/i.test(t)) bad.push(`${p.id}: «${t}»`);
      if (p.sex === 'm' && /(^|[;,.] )(дочь|мать|жена|наложница|царствовала|Упомянута)(?![а-яё])/i.test(t)) bad.push(`${p.id}: «${t}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  test('имена в косвенном падеже — формы склонения, а не подстановка именительного', () => {
    const bad: string[] = [];
    for (const p of persons)
      for (const s of briefSentences(p.id, cards.get(p.id)!))
        for (const x of s.segs) {
          if (typeof x === 'string') continue;
          const q = byId.get(x.id)!;
          const g = nameCase(q.name, q.sex, 'gen', q.unnamed);
          if (!g || (x.form !== g && x.form !== g.charAt(0).toUpperCase() + g.slice(1))) bad.push(`${p.id}: ${x.id} «${x.form}»`);
        }
    expect(bad.slice(0, 10), `${bad.length} имён`).toEqual([]);
  });

  test('нет утверждений о родителе по толкованию и об отцовстве законного отца как кровном', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const t = built(p.id);
      if (p.parentCert === 'interpretation' && p.father && new RegExp(`(сын|дочь) ${nameCase(byId.get(p.father)!.name, byId.get(p.father)!.sex, 'gen') ?? '—'}(?![а-яё])`).test(t)) bad.push(`${p.id}: родитель по толкованию`);
      for (const e of graph.childrenOf.get(p.id) ?? []) {
        if (e.claim !== 'legal') continue;
        const k = byId.get(e.child)!;
        const g = nameCase(k.name, k.sex, 'gen');
        if (g && new RegExp(`(^|[;,.] )отец (\\S+ и )?${g}`).test(t)) bad.push(`${p.id}: «отец ${g}» при законном отцовстве`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('2–3 строки: у малых лиц — не длиннее статьи в 240 знаков, у остальных — короче', () => {
    const long = [...briefs.keys()].filter((id) => built(id).length > BRIEF_MAX_SMALL + 140);
    expect(long.slice(0, 5)).toEqual([]);
  });
});

describe('«Кратко» — примеры', () => {
  test('Давид: царь, сын Иессея из колена Иудина, царствовал 40 лет, по обеим линиям', () => {
    expect(briefs.get('david')).toBe('Царь Иудеи, затем всего Израиля, сын Иессея из колена Иудина; царствовал 40 лет; отец Нафана и Соломона. В родословии Иисуса Христа по обеим линиям.');
  });
  test('Мария: без «дочери Илия» — это толкование; линия по Луке — по толкованию', () => {
    const t = briefs.get('mariya')!;
    expect(t).toMatch(/^Дева из Назарета, обручённая Иосифу\. Мать Иисуса Христа\./);
    expect(t).not.toMatch(/Илия/);
    expect(t).toContain('по толкованию');
  });
  test('Иосиф: плотник, законный отец Иисуса Христа (Мф 1:16)', () => {
    const t = briefs.get('iosif-muzh-marii')!;
    expect(t).toMatch(/^Плотник, сын Иакова/);
    expect(t).toContain('законный отец Иисуса Христа');
    expect(t).not.toMatch(/(^|; )отец Иисуса/);
  });
  test('Руфь, Мааха, Мелхиседек, Закхур', () => {
    expect(briefs.get('ruf')).toBe('Праматерь; жена Махлона, затем Вооза; мать Овида.');
    expect(briefs.get('maakha-nalozhnitsa-khaleva')).toBe('Наложница Халева. Мать Шевера, Фирханы, Шаафа и Шевы.');
    expect(briefs.get('melkhisedek')).toMatch(/^Царь Салимский\. Вынес хлеб и вино Авраму/);
    expect(briefs.get('zakkhur-syn-imriya')).toBe('Сын Имрия. Строил стену подле Иерихонцев, у Овечьих ворот (Неем 3:1-2).');
  });
});
