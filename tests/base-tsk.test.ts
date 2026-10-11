/**
 * Treasury of Scripture Knowledge в синодальной нумерации (АФ-3; 11 § 4.12; источник src-tsk): tools/bible/tsk.tsv и
 * карантин tools/bible/tsk-quarantine.tsv, собранные tools/bible/tsk.py из модуля CrossWire «TSK» (нумерация KJV).
 * Проверяется: перевод нумерации по обращённой таблице base/versification/synodal-kjv.json (контрольные пары),
 * карантин неоднозначных пар, ни одна пара не ведёт в несуществующий или пустой стих, пары — справка, не факт.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../tools/bible.ts';

const ROOT = join(import.meta.dirname, '..');
const read = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));

interface Row { home: string; kjv: string; group: number; word: string; places: string[]; src: string }
interface QRow { home: string; kjv: string; group: number; pos: number; word: string; addr: string; why: string; src: string }
let head: string[];
let rows: Row[];
let qhead: string[];
let qrows: QRow[];
let inv: Map<string, string[]>;
const bible = loadBible();

/** Обращение таблицы Синодальная → KJV: стих KJV → синодальные стихи (с частью «!a/!b», если она есть). */
function inverse(): Map<string, string[]> {
  const map: Record<string, string[]> = JSON.parse(readFileSync(join(ROOT, 'base/versification/synodal-kjv.json'), 'utf8')).map;
  const osis: Record<string, string> = {};
  const SYN = 'Быт Исх Лев Чис Втор Нав Суд Руф 1Цар 2Цар 3Цар 4Цар 1Пар 2Пар Езд Неем Есф Иов Пс Притч Еккл Песн Ис Иер Плач Иез Дан Ос Иоил Ам Авд Ион Мих Наум Авв Соф Агг Зах Мал Мф Мк Лк Ин Деян Иак 1Пет 2Пет 1Ин 2Ин 3Ин Иуд Рим 1Кор 2Кор Гал Еф Флп Кол 1Фес 2Фес 1Тим 2Тим Тит Флм Евр Откр'.split(' ');
  const OS = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Jas 1Pet 2Pet 1John 2John 3John Jude Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Rev'.split(' ');
  SYN.forEach((s, i) => (osis[s] = OS[i]));
  const out = new Map<string, string[]>();
  for (const key of bible.order) {
    const m = /^(\S+) (\d+):(\d+)$/.exec(key)!;
    for (const t of map[key] ?? [`${osis[m[1]]}.${m[2]}.${m[3]}`]) {
      const [base, part] = t.split('!');
      out.set(base, [...(out.get(base) ?? []), part ? `${key}!${part}` : key]);
    }
  }
  return out;
}

/** «Ис 13:1-14:32» → [начало, конец]. */
function parsePlace(p: string): [string, string] {
  const m = /^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(p);
  if (!m) throw new Error(`адрес: ${p}`);
  const a = `${m[1]} ${m[2]}:${m[3]}`;
  const b = m[5] ? `${m[1]} ${m[4] ?? m[2]}:${m[5]}` : a;
  return [a, b];
}

beforeAll(() => {
  const t = read('tools/bible/tsk.tsv');
  head = t[0];
  rows = t.slice(1).map((r) => ({ home: `${r[0]} ${r[1]}:${r[2]}`, kjv: r[3], group: +r[4], word: r[5], places: r[6].split('; '), src: r[7] }));
  const q = read('tools/bible/tsk-quarantine.tsv');
  qhead = q[0];
  qrows = q.slice(1).map((r) => ({ home: r[0] ? `${r[0]} ${r[1]}:${r[2]}` : '', kjv: r[3], group: +r[4], pos: +r[5], word: r[6], addr: r[7], why: r[8], src: r[9] }));
  inv = inverse();
});

describe('TSK: файл и источник', () => {
  it('заголовки; у каждой строки — источник src-tsk; src-tsk есть в реестре как справка в общественном достоянии', () => {
    expect(head).toEqual(['книга', 'глава', 'стих', 'стих KJV', 'группа', 'слово TSK', 'места', 'источник']);
    expect(qhead).toEqual(['книга', 'глава', 'стих', 'стих KJV', 'группа', 'номер в группе', 'слово TSK', 'адрес TSK', 'причина', 'источник']);
    expect(rows.length).toBeGreaterThan(60000);
    for (const r of rows) expect(r.src).toBe('src-tsk');
    for (const r of qrows) expect(r.src).toBe('src-tsk');
    const reg = JSON.parse(readFileSync(join(ROOT, 'base/sources.json'), 'utf8')).items;
    const s = reg.find((x: { id: string }) => x.id === 'src-tsk');
    expect([s.use, s.spdx, s.redistribute]).toEqual(['reference', 'LicenseRef-PublicDomain', true]);
    expect(s.licenseSource).toMatch(/tsk\.conf/);
  });

  it('пары TSK — справка: ни один файл базы, кроме реестра, на src-tsk не ссылается (не факт, не ребро, не связь)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        if (f.isDirectory()) walk(join(d, f.name));
        else if (f.name.endsWith('.json') && join(d, f.name) !== join('base', 'sources.json')) files.push(join(d, f.name));
      }
    };
    walk('base');
    for (const f of files) expect(readFileSync(join(ROOT, f), 'utf8').includes('src-tsk'), f).toBe(false);
  });

  it.skipIf(!existsSync(join(ROOT, 'inputs/crosswire/TSK.zip')))('файлы воспроизводятся из модуля (tsk.py --check)', () => {
    const out = execFileSync('python3', ['-I', join(ROOT, 'tools/bible/tsk.py'), '--check'], { encoding: 'utf8' });
    expect(out).toMatch(/сверка с файлами: совпадает/);
  });
});

describe('TSK: перевод нумерации KJV → синодальная', () => {
  it('контрольные пары: стих записи TSK (KJV) → синодальный стих', () => {
    const homeOf = (kjv: string) => [...new Set(rows.filter((r) => r.kjv === kjv).map((r) => r.home))];
    const cases: [string, string][] = [
      ['Gen.1.1', 'Быт 1:1'], ['Num.12.16', 'Чис 13:1'], ['Num.13.1', 'Чис 13:2'], ['Jonah.1.17', 'Ион 2:1'], ['Jonah.2.1', 'Ион 2:2'],
      ['Ps.10.1', 'Пс 9:22'], ['Ps.11.1', 'Пс 10:1'], ['Ps.23.1', 'Пс 22:1'], ['Ps.51.3', 'Пс 50:5'], ['Ps.119.105', 'Пс 118:105'],
      ['Ps.13.5', 'Пс 12:6'], ['Ps.13.6', 'Пс 12:6'], ['Ps.90.5', 'Пс 89:6'], ['Ps.90.6', 'Пс 89:6'], ['Ps.116.10', 'Пс 115:1'],
      ['Song.1.2', 'Песн 1:1'], ['Dan.3.24', 'Дан 3:91'], ['Dan.4.1', 'Дан 3:98'], ['Dan.4.4', 'Дан 4:1'],
      ['Prov.13.14', 'Притч 13:15'], ['Prov.18.24', 'Притч 18:25'],
      ['Mal.3.18', 'Мал 3:18'], ['Mal.4.1', 'Мал 4:1'], ['Mal.4.5', 'Мал 4:5'], ['Mal.4.6', 'Мал 4:6'], ['Joel.2.28', 'Иоил 2:28'],
      ['Acts.19.40', 'Деян 19:40'], ['Rom.16.25', 'Рим 14:24'], ['Rom.16.26', 'Рим 14:25'], ['Rom.16.24', 'Рим 16:24'],
      ['2Cor.13.14', '2Кор 13:13'], ['3John.1.13', '3Ин 1:13'], ['Jas.1.1', 'Иак 1:1'], ['Rev.22.20', 'Откр 22:20'],
    ];
    for (const [kjv, syn] of cases) expect([kjv, homeOf(kjv)]).toEqual([kjv, [syn]]);
  });

  it('контрольные пары: адреса мест переведены (Пс, Мал 4, Ион, Дан)', () => {
    const at = (kjv: string, g: number) => rows.find((r) => r.kjv === kjv && r.group === g)!.places;
    expect(at('Gen.1.1', 2)).toEqual(expect.arrayContaining(['Пс 32:6', 'Пс 32:9', 'Пс 88:12', 'Пс 101:26', 'Пс 113:23']));
    expect(at('Gen.1.2', 1)).toEqual(['Иов 26:7', 'Ис 45:18', 'Иер 4:23', 'Наум 2:10']);
    expect(rows.find((r) => r.kjv === 'Matt.17.11')!.places).toContain('Мал 4:6');
    // каждое место — перевод своего адреса KJV: в строке нет адреса, которого не было бы у обращённой таблицы
    const synSet = new Set(bible.order);
    for (const r of rows.slice(0, 3000)) for (const p of r.places) if (!p.startsWith('*')) for (const a of parsePlace(p)) expect(synSet.has(a), p).toBe(true);
  });

  it('стих записи — однозначный перевод обращённой таблицы (ровно один синодальный стих целиком)', () => {
    const homes = new Map<string, Set<string>>();
    for (const r of rows) homes.set(r.kjv, (homes.get(r.kjv) ?? new Set()).add(r.home));
    const bad = [...homes].filter(([kjv, h]) => JSON.stringify(inv.get(kjv) ?? []) !== JSON.stringify([...h]));
    expect(bad).toEqual([]);
  });
});

describe('TSK: карантин', () => {
  it('неоднозначные стихи KJV не переведены и лежат в карантине с причиной', () => {
    const homes = new Set(rows.map((r) => r.kjv));
    const q = (kjv: string) => qrows.filter((r) => r.kjv === kjv || (r.addr.split('-')[0] === kjv && !r.why.startsWith('исходный')));
    const cases: [string, RegExp][] = [
      ['3John.1.14', /несколько синодальных: 3Ин 1:14, 3Ин 1:15/], // один стих KJV — два синодальных
      ['1Sam.20.42', /несколько синодальных: 1Цар 20:42, 1Цар 20:43/],
      ['1Kgs.18.33', /несколько синодальных: 3Цар 18:33, 3Цар 18:34/],
      ['Rom.16.27', /часть синодального Рим 14:26/],
      ['Song.1.1', /нет синодальной пары/],
      ['2Cor.11.32', /нет синодальной пары/],
      ['Lev.14.57', /таблица неполна/], ['Lev.14.56', /таблица неполна/], ['Acts.19.41', /таблица неполна/],
      ['Ps.116.9', /Пс 114:9 пуст/],
      ['Ps.51.1', /надписание псалма.*50:1, Пс 50:2/], // 11 § 4.12: Пс 50:1–2 — надписание Пс 51 KJV
      ['Ps.3.1', /надписание псалма/],
    ];
    for (const [kjv, why] of cases) {
      expect(homes.has(kjv), kjv).toBe(false);
      expect(q(kjv).length, kjv).toBeGreaterThan(0);
      for (const r of q(kjv)) expect(r.why, kjv).toMatch(why);
    }
  });

  it('надписание и стих 1 в одном синодальном стихе — перевод (Пс 10:1 = Ps 11:0–1); у каждой строки карантина — причина', () => {
    expect(rows.some((r) => r.kjv === 'Ps.11.1' && r.home === 'Пс 10:1')).toBe(true);
    for (const r of qrows) {
      expect(r.why.trim()).not.toBe('');
      expect(r.group).toBeGreaterThan(0);
      expect(r.pos).toBeGreaterThan(0);
    }
    expect(qrows.length).toBeLessThan(rows.reduce((n, r) => n + r.places.length, 0) / 100); // карантин — меньше 1 %
  });

  it('ни одна пара не ведёт в несуществующий или пустой стих; диапазоны — по порядку текста', () => {
    const idx = new Map(bible.order.map((k, i) => [k, i]));
    const empty = new Set(bible.order.filter((k) => !bible.verses.get(k)!.trim()));
    for (const r of rows) {
      expect(idx.has(r.home), r.home).toBe(true);
      expect(empty.has(r.home), r.home).toBe(false);
      expect(r.places.filter((p) => !p.startsWith('*')).length, `${r.home} гр. ${r.group}`).toBeGreaterThan(0);
      for (const p of r.places) {
        if (p.startsWith('*')) continue; // пометка источника («*marg:» и т. п.)
        const [a, b] = parsePlace(p);
        expect(idx.has(a) && idx.has(b), `${r.home}: ${p}`).toBe(true);
        expect(idx.get(a)! <= idx.get(b)!, `${r.home}: ${p}`).toBe(true);
        expect(empty.has(a) || empty.has(b), `${r.home}: ${p}`).toBe(false);
      }
    }
  });

  it('группы по словам стиха и порядок источника: номера групп у стиха KJV идут по возрастанию', () => {
    const last = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.home}|${r.kjv}`;
      expect(r.group, k).toBeGreaterThan(last.get(k) ?? 0);
      last.set(k, r.group);
    }
  });
});
