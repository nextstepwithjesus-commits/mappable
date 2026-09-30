/**
 * Слова связи (этап 11, стык 4; STAGE11.md § 8): заголовок, стихи, роли концов, подсказка и строка диктора для всех
 * видов ключа связи — «союз → ребёнок», черта брака, союз, шаг ленты, родство словами Писания.
 */
import { describe, expect, it } from 'vitest';
import { byId, graph, lines } from '../src/data/atlas.ts';
import type { LinkKey } from '../src/engine/linkkey.ts';
import { unions } from '../src/ui/reveal.ts';
import {
  linkExists,
  linkInfo,
  linkLines,
  linkMarks,
  linkRefs,
  linkRoleOf,
  linkRoles,
  linkSpeech,
  linkTip,
  linkTitle,
  refSpoken,
  refsShort,
  stepParent,
  unionName,
} from '../src/ui/linkwords.ts';

/** Без неразрывных пробелов и соединителей типографики — для сравнения с текстом. */
const plain = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : ''));
const child = (union: string, c: string): LinkKey => ({ kind: 'child', union, child: c });
const U = (id: string) => unions.byId.get(id)!;

describe('слова связи: «союз → ребёнок»', () => {
  it('«Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)», роли колец — отец, мать, сын', () => {
    const k = child('u:iakov+rakhil', 'iosif');
    expect(plain(linkTitle(k))).toBe('Иаков и Рахиль — родители; Иосиф — сын');
    expect(linkRefs(k)[0]).toBe('Быт 30:22-24');
    expect(plain(linkTip(k))).toBe('Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)');
    expect(linkRoles(k).map((e) => [e.id, e.role, e.side])).toEqual([
      ['iakov', 'отец', 'from'],
      ['rakhil', 'мать', 'from'],
      ['iosif', 'сын', 'to'],
    ]);
    expect(linkRoleOf(k, 'rakhil')).toBe('мать');
    expect(linkRoleOf(k, 'liya')).toBeNull();
  });
  it('диктор: «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35» (K2, S7)', () => {
    expect(plain(linkSpeech(child('u:iakov+liya', 'iuda')))).toBe('Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35');
  });
  it('шаг линии Мессии — строка «Ленты»: Иаков → Иуда рисуют обе ленты, Мф 1:2 и Лк 3:33–34', () => {
    const ls = linkLines(child('u:iakov+liya', 'iuda'));
    expect(ls.map((l) => [l.line, l.ref])).toEqual([
      ['joseph', 'Мф 1:2'],
      ['mary', 'Лк 3:33-34'],
    ]);
    expect(linkLines(child('u:iakov+rakhil', 'iosif'))).toEqual([]);
  });
  it('мать не названа (решение 75): «Ной и его жена — родители; Хам — сын»; кольцо только у Ноя; строка «Мать — в Писании не названа»', () => {
    const k = child('u:noy+', 'kham');
    expect(plain(linkTitle(k))).toBe('Ной и его жена — родители; Хам — сын');
    expect(linkRoles(k).map((e) => e.id)).toEqual(['noy', 'kham']);
    // этап 13 (решение 105, макет X4 М1): не пояснением под карточкой, а строкой конца
    expect(linkInfo(k)!.missing).toEqual({ role: 'Мать', text: 'в Писании не названа' });
    expect(linkInfo(k)!.note).toBeNull();
  });
  it('у лица есть и названные жёны — «его жена» двусмысленно: «Давид — отец; … — сын; мать не названа» (одна форма строк, решение 105)', () => {
    const u = U('u:david+');
    expect(unionName(u)).toBe('Давид (мать не названа)');
    expect(plain(linkTitle(child(u.id, u.kids[0])))).toMatch(/^Давид — отец; \S+ — (сын|дочь); мать не названа$/);
    expect(unionName(U('u:sif+'))).toBe('Сиф и его жена');
  });
  it('вид утверждения — в роли: «Иосиф — отец по закону, Мария — мать; Иисус Христос — сын (Мф 1:16)»', () => {
    const k = child('u:iosif-muzh-marii+mariya', 'iisus');
    expect(plain(linkTitle(k))).toBe('Иосиф — отец по закону, Мария — мать; Иисус Христос — сын');
    expect(linkRefs(k)[0]).toBe('Мф 1:16');
    expect(linkRoleOf(k, 'iosif-muzh-marii')).toBe('отец по закону');
    expect(linkLines(k).map((l) => l.line)).toEqual(['joseph', 'mary']);
    expect(plain(linkTitle(child('u:niriy+~by-luke', 'salafiil')))).toBe('Нирий — отец по Луке; Салафиил — сын');
    expect(plain(linkTitle(child('u:iakov+~adoptive', 'efrem')))).toBe('Иаков — приёмный отец; Ефрем — приёмный сын');
  });
  it('уровни: «толк.» у Илия — Марии — первым словом заголовка (решение 105); пропуск поколений (DF1) — помета, а не «внук»', () => {
    const m = child('u:iliy-otets-marii+', 'mariya');
    expect(linkMarks(m)).toContain('толк.');
    expect(plain(linkTitle(m))).toBe('По толкованию: Илий и его жена — родители; Мария — дочь');
    // уровень уже в заголовке — в подсказке помета «толк.» не повторяется
    expect(plain(linkTip(m))).toBe('По толкованию: Илий и его жена — родители; Мария — дочь (Лк 3:23)');
    expect(plain(linkSpeech(m))).toBe('Связь — по толкованию: Илий и его жена — родители; Мария — дочь; От Луки 3:23');
    const g = child('u:girsam+', 'shevuil-syn-girsama');
    expect(linkMarks(g)).toContain('пропуск поколений');
    expect(linkInfo(g)!.note).toMatch(/пропускать поколения/);
  });
  it('таблица народов: «От Мицраима произошли Лудим» (Быт 10:13); союз народа — без «его жены»', () => {
    expect(plain(linkTitle(child('u:mitsraim+', 'ludim')))).toBe('От Мицраима произошли Лудим');
    expect(linkRoleOf(child('u:mitsraim+', 'ludim'), 'ludim')).toBe('потомки');
    expect(unionName(U('u:mitsraim+'))).toBe('Мицраим');
  });
});

describe('слова связи: союз, черта брака, шаг ленты, родство словами', () => {
  it('союз — сценарий 1: «Ной и его жена: Сим, Хам, Иафет (Быт 5:32)»', () => {
    expect(plain(linkTip({ kind: 'union', union: 'u:noy+' }))).toBe('Ной и его жена: Сим, Хам, Иафет (Быт 5:32)');
    // число детей словами (решение 105): «одна дочь», «один сын»
    expect(plain(linkTitle({ kind: 'union', union: 'u:iakov+liya' }))).toBe('Иаков и Лия: 6 сыновей и одна дочь');
    // первый стих союза — где названо больше всего его детей (Быт 35:23 — шесть сыновей Лии)
    expect(linkRefs({ kind: 'union', union: 'u:iakov+liya' })[0]).toBe('Быт 35:23');
    expect(plain(linkTitle({ kind: 'union', union: 'u:david+melkhola' }))).toBe('Давид и Мелхола — муж и жена');
  });
  it('черта брака: «Рахиль — жена Иакова», «Иаков — муж Рахили», «Валла — наложница Иакова»; стихи брака', () => {
    expect(plain(linkTitle({ kind: 'spouse', union: 'u:iakov+rakhil', person: 'rakhil' }))).toBe('Рахиль — жена Иакова');
    expect(plain(linkTitle({ kind: 'spouse', union: 'u:iakov+rakhil', person: 'iakov' }))).toBe('Иаков — муж Рахили');
    expect(linkRefs({ kind: 'spouse', union: 'u:iakov+rakhil', person: 'rakhil' })[0]).toBe('Быт 29:28');
    const v: LinkKey = { kind: 'spouse', union: 'u:iakov+valla', person: 'valla' };
    expect(plain(linkTitle(v))).toBe('Валла — наложница Иакова');
    expect(linkRoles(v).map((e) => e.role)).toEqual(['наложница', 'муж']);
  });
  it('шаг ленты: родитель — предыдущее лицо линии; «по закону», «только у Луки (Лк 3:36)», «у Мф опущен»', () => {
    expect(stepParent('joseph', 'solomon')).toBe('david');
    expect(stepParent('mary', 'nafan-syn-davida')).toBe('david');
    expect(stepParent('joseph', 'adam')).toBeNull();
    expect(plain(linkTip({ kind: 'step', line: 'joseph', child: 'solomon' }))).toBe('Давид — отец; Соломон — сын (Мф 1:6)');
    expect(plain(linkTitle({ kind: 'step', line: 'joseph', child: 'iisus' }))).toBe('Иосиф — отец по закону; Иисус Христос — сын');
    expect(plain(linkTip({ kind: 'step', line: 'mary', child: 'kainan-syn-arfaksada' }))).toContain('только у Луки (Лк 3:36)');
    expect(linkMarks({ kind: 'step', line: 'joseph', child: 'okhoziya-syn-iorama' })).toContain('у Мф опущен');
    expect(linkMarks({ kind: 'step', line: 'mary', child: 'mariya' })).toContain('толк.');
  });
  it('стих шага называет родителя (DG 2.3.7): Мария → Иисус — Лк 1:31, а не Лк 3:23; Фарра → Авраам — не Мф 1:2', () => {
    expect(linkRefs({ kind: 'step', line: 'mary', child: 'iisus' })[0]).toBe('Лк 1:31');
    expect(plain(linkTip({ kind: 'step', line: 'mary', child: 'iisus' }))).toBe('Мария — мать; Иисус Христос — сын (Лк 1:31)');
    expect(linkRefs({ kind: 'step', line: 'joseph', child: 'avraam' })[0]).not.toMatch(/^Мф/);
    expect(linkLines({ kind: 'step', line: 'joseph', child: 'avraam' })[0].ref).not.toMatch(/^Мф/);
    // шаг, который есть у обеих лент, — обе в строке «Ленты»
    expect(linkLines({ kind: 'step', line: 'joseph', child: 'iuda' }).map((l) => l.line)).toEqual(['joseph', 'mary']);
  });
  it('родство словами Писания (П-8): «Саруия — сестра Давида (1 Пар 2:16)» в любом порядке лиц в ключе', () => {
    const k: LinkKey = { kind: 'kin', a: 'david', b: 'saruiya' };
    expect(plain(linkTip(k))).toBe('Саруия — сестра Давида (1 Пар 2:16)');
    expect(linkTitle({ kind: 'kin', a: 'saruiya', b: 'david' })).toBe(linkTitle(k));
    expect(linkRoles(k).map((e) => [e.id, e.role])).toEqual([
      ['saruiya', 'сестра'],
      ['david', 'брат'],
    ]);
    expect(linkInfo(k)!.note).toMatch(/родители из него не выводятся/);
  });
  it('ссылки: коротко и для диктора', () => {
    expect(plain(refsShort(['Быт 29:35', 'Быт 35:23', '1Пар 2:1']))).toBe('Быт 29:35; 35:23; 1 Пар 2:1');
    expect(plain(refSpoken('1Пар 2:16'))).toBe('1-я Паралипоменон 2:16');
    expect(plain(refSpoken('Мф 1:2'))).toBe('От Матфея 1:2');
  });
  it('битые ключи: связи нет — пусто, linkExists = false', () => {
    expect(linkExists(child('u:iakov+rakhil', 'iuda'))).toBe(false);
    expect(linkExists({ kind: 'union', union: 'u:nobody+' })).toBe(false);
    expect(linkExists({ kind: 'step', line: 'mary', child: 'solomon' })).toBe(false);
    expect(linkExists({ kind: 'kin', a: 'david', b: 'iuda' })).toBe(false);
    expect(linkTitle(child('u:iakov+rakhil', 'iuda'))).toBe('');
    expect(linkRoles({ kind: 'union', union: 'u:nobody+' })).toEqual([]);
  });
});

describe('слова связи: все связи данных', () => {
  const keys: LinkKey[] = [];
  for (const u of unions.byId.values()) {
    keys.push({ kind: 'union', union: u.id });
    for (const c of u.kids) keys.push({ kind: 'child', union: u.id, child: c });
    for (const p of [u.a, u.b]) if (p && u.a && u.b) keys.push({ kind: 'spouse', union: u.id, person: p });
  }
  for (const line of ['joseph', 'mary'] as const) for (const s of lines[line].persons.slice(1)) keys.push({ kind: 'step', line, child: s.id });
  for (const [id, es] of graph.kinOf) for (const e of es) if (e.from === id) keys.push({ kind: 'kin', a: e.from, b: e.to });

  it('у каждой связи есть заголовок, стих, роли концов; без стрелок, id и «undefined»', () => {
    expect(keys.length).toBeGreaterThan(3000);
    const ids = /\b[a-z]+(-[a-z0-9]+)+\b/;
    for (const k of keys) {
      const i = linkInfo(k);
      expect(i, JSON.stringify(k)).not.toBeNull();
      const t = plain(i!.title);
      expect(t, JSON.stringify(k)).not.toBe('');
      expect(t).not.toMatch(/→|←|undefined|null/);
      expect(t, t).not.toMatch(ids);
      expect(i!.ends.length, t).toBeGreaterThan(0);
      for (const e of i!.ends) expect(byId.has(e.id), t).toBe(true);
      expect(plain(linkTip(k))).toMatch(/^\S/);
      expect(plain(linkSpeech(k))).toMatch(/^Связь(: | — по толкованию: | — вывод: )/);
      // решение 105, П17: заголовок связи по толкованию и по выводу начинается словом уровня (у союза целиком — помета)
      if (k.kind !== 'union' && i!.cert === 'interpretation') expect(t, t).toMatch(/^По толкованию: /);
      if (k.kind !== 'union' && i!.cert === 'inference') expect(t, t).toMatch(/^Вывод: /);
    }
  });
  it('у связи «союз → ребёнок» и шага ленты стих есть всегда; роль ребёнка — по полу', () => {
    for (const k of keys) {
      if (k.kind !== 'child' && k.kind !== 'step') continue;
      expect(linkRefs(k).length, JSON.stringify(k)).toBeGreaterThan(0);
      const c = byId.get(k.child)!;
      const role = linkRoleOf(k, k.child)!;
      if (c.sex === 'f') expect(role, c.name).toMatch(/дочь|потомок|потомки/);
      else expect(role, c.name).toMatch(/сын|потомок|потомки/);
    }
  });
});
