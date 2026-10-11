/**
 * Сборка пакетов (09 § 5.1–5.4; 02 § 8.1; 09 § 16 п. 2): бюджеты тем же сжатием, что хранилище; детерминизм; NFC; один
 * источник текста; опись с признаком «обязательный»; TSK по книгам (Пс — две части), только «проба»; проба и синтетика не
 * пишутся в папку выпуска.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { build, assertDir, PACK_DIR } from '../tools/pack/build.ts';
import { BUDGETS, overBudget } from '../tools/pack/budgets.ts';
import { compressed, nonNfc } from '../tools/pack/json.ts';
import { buildTsk } from '../tools/pack/packages.ts';
import { noticeFor } from '../tools/pack/build.ts';
import { loadBase } from '../tools/base/validate.ts';
import { admission } from '../tools/base/admit.ts';
import { Loader } from '../core/loader.ts';
import { createHash } from 'node:crypto';
import type { Manifest, PackKind } from '../core/types.ts';
import type { WriteResult } from '../tools/pack/write.ts';

const tmp = (p: string) => mkdtempSync(join(tmpdir(), `pack-${p}-`));
function tree(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p), readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

let A: { dir: string; r: WriteResult };
let B: { dir: string; r: WriteResult };
let R: { dir: string; r: WriteResult };
beforeAll(() => {
  const a = tmp('a');
  const b = tmp('b');
  const rel = tmp('r');
  A = { dir: a, r: build({ level: 'probe', dir: a, tsk: true }) };
  B = { dir: b, r: build({ level: 'probe', dir: b, tsk: true }) };
  R = { dir: rel, r: build({ level: 'release', dir: rel, release: '2026.10.1' }) };
}, 240_000);

const m = () => A.r.manifest;
const kinds = (man: Manifest, k: PackKind) => man.packages.filter((p) => p.kind === k);

describe('бюджеты (09 § 5.3): brotli 5 и gzip 9, пока хранилище не выбрано', () => {
  it('каждый пакет в бюджете своего вида и по brotli 5, и по gzip 9', () => {
    expect(m().compression).toBe('br');
    expect(A.r.over).toEqual([]);
    for (const p of m().packages) {
      expect(p.size, p.file).toBeLessThanOrEqual(BUDGETS[p.kind].max);
      expect(p.gzip, p.file).toBeLessThanOrEqual(BUDGETS[p.kind].max);
      expect(p.budget).toBe(BUDGETS[p.kind].max);
    }
  });
  it('размер в описи — настоящее сжатие файла', () => {
    const p = kinds(m(), 'core-index')[0];
    const body = readFileSync(join(A.dir, p.file), 'utf8');
    expect(compressed(body, 'br')).toBe(p.size); // brotli 5
    expect(compressed(body, 'gzip')).toBe(p.gzip);
  });
  it('бюджет есть у каждого вида пакета; обязательные — ядро индекса и указатель инструментов (В-30)', () => {
    for (const k of Object.keys(BUDGETS) as PackKind[]) expect(BUDGETS[k].max).toBeGreaterThan(0);
    expect(m().packages.filter((p) => p.required).map((p) => p.kind).sort()).toEqual(['core-index', 'tools-index']);
  });
  it('пакет сверх бюджета ловится и по brotli 5, и по gzip 9 — одно правило для всех', () => {
    const r = overBudget([
      { kind: 'core-index', file: 'a', size: 201 * 1024, gzip: 260 * 1024 },
      { kind: 'text', file: 'b', size: 90 * 1024, gzip: 97 * 1024 },
      { kind: 'cards', file: 'c', size: 10, gzip: 10 },
    ]);
    expect(r.over.map((x) => x.file)).toEqual(['a', 'b']);
  });
});

describe('детерминизм и NFC (09 § 5.1)', () => {
  it('две сборки подряд дают одни байты (пакеты, опись, NOTICE)', () => {
    const a = tree(A.dir);
    const b = tree(B.dir);
    expect([...a.keys()]).toEqual([...b.keys()]);
    for (const [k, v] of a) expect(v.equals(b.get(k)!), k).toBe(true);
  });
  it('имя пакета — с отпечатком содержимого; sha256 в описи совпадает с файлом', () => {
    for (const p of m().packages) {
      const body = readFileSync(join(A.dir, p.file));
      expect(createHash('sha256').update(body).digest('hex')).toBe(p.sha256);
      expect(p.file).toContain(p.sha256.slice(0, 10));
    }
  });
  it('в опись не идёт время сборки и коммит', () => {
    const s = readFileSync(join(A.dir, 'manifest.json'), 'utf8');
    expect(s).not.toMatch(/"built"|"commit"|\d{4}-\d\d-\d\dT\d\d:/);
  });
  it('строки пакетов — в NFC; проверка ловит строку не в NFC', () => {
    expect(A.r.nfc).toEqual([]);
    expect(nonNfc({ n: 'Ной' })).toEqual([]);
    expect(nonNfc({ n: 'Мои\u0306сей' }).length).toBe(1); // «й» из «и» и знака краткости
  });
});

describe('состав пакетов', () => {
  it('один источник текста — текст по книгам, 66 пакетов; пакета «стихи» нет', () => {
    expect(kinds(m(), 'text').length).toBe(66);
    expect(m().packages.some((p) => /verses/.test(p.file))).toBe(false);
  });
  it('каждый пакет несёт уровень; у пробы — плашка', () => {
    for (const p of m().packages) {
      const x = JSON.parse(readFileSync(join(A.dir, p.file), 'utf8'));
      expect(x.admit, p.file).toBe('probe');
      expect(x.banner, p.file).toBe('Данные не проверены: проба');
    }
    for (const p of R.r.manifest.packages) expect(JSON.parse(readFileSync(join(R.dir, p.file), 'utf8')).admit, p.file).toBe('release');
  });
  it('опись: схема, отпечатки базы и целых файлов, источники с SPDX, NOTICE', () => {
    expect(m().schema).toBe(3);
    expect(m().inputs.base).toMatch(/^[0-9a-f]{64}$/);
    for (const f of ['tools/bible/synodal.tsv', 'tools/bible/brackets.tsv', 'tools/bible/source-issues.tsv', 'base/sources.json', 'base/checks.json'])
      expect(m().inputs.files[f], f).toMatch(/^[0-9a-f]{64}$/);
    expect(m().sources.map((s) => s.id)).toContain('src-synodal');
    expect(m().sources.map((s) => s.id)).toContain('src-tsk');
    expect(existsSync(join(A.dir, 'NOTICE.txt'))).toBe(true);
  });
  it('ядро индекса: имена и словарь форм; указатель: лица без имён, рёбра', () => {
    const core = JSON.parse(readFileSync(join(A.dir, kinds(m(), 'core-index')[0].file), 'utf8'));
    const tools = JSON.parse(readFileSync(join(A.dir, kinds(m(), 'tools-index')[0].file), 'utf8'));
    expect(core.persons.length).toBeGreaterThan(2000);
    expect(core.names.length).toBeGreaterThan(1000);
    expect(tools.actors.every((a: Record<string, unknown>) => !('n' in a))).toBe(true);
    expect(tools.origins.length).toBeGreaterThan(1000);
  });
  it('выпуск — только допущенное: в ядре выпуска лиц не больше, чем подписано', () => {
    const core = JSON.parse(readFileSync(join(R.dir, kinds(R.r.manifest, 'core-index')[0].file), 'utf8'));
    expect(core.persons.length).toBeLessThanOrEqual(R.r.manifest.statuses.checked);
    expect(core.persons.length).toBeLessThan(500);
  });
  it('загрузчик ядра читает сборку выпуска и отказывает в пробе', async () => {
    const src = (dir: string) => ({ read: async (f: string) => readFileSync(join(dir, f), 'utf8'), sha256: async (s: string) => createHash('sha256').update(s).digest('hex') });
    const L = new Loader(src(R.dir), { level: 'release' });
    expect((await L.manifest()).s).toBe('готово');
    expect((await L.get('text', { book: 'Быт' })).s).toBe('готово');
    expect((await new Loader(src(A.dir), { level: 'release' }).manifest()).s).toBe('ошибка');
  });
});

describe('параллельные места TSK (02 § 3.16, § 8.1)', () => {
  it('по книгам и по запросу; Пс — две части; каждая часть и по gzip в бюджете', () => {
    const tsk = kinds(m(), 'tsk');
    expect(tsk.length).toBeGreaterThanOrEqual(66);
    expect(tsk.every((p) => !p.required)).toBe(true);
    expect(tsk.filter((p) => p.book === 'Пс').map((p) => p.part)).toEqual([1, 2]);
    for (const p of tsk) expect(p.gzip, p.file).toBeLessThanOrEqual(BUDGETS.tsk.max);
  });
  it('английских слов нет: строки — только числа', () => {
    const p = kinds(m(), 'tsk').find((x) => x.book === 'Быт')!;
    const x = JSON.parse(readFileSync(join(A.dir, p.file), 'utf8'));
    expect(JSON.stringify(x.rows)).not.toMatch(/[A-Za-z]/);
    expect(x.rows[0].slice(0, 3)).toEqual([1, 1, 1]);
  });
  it('выпуск TSK не собирает: коллекции нет в допуске, блок закрыт до Д-12', () => {
    expect(() => buildTsk({ level: 'release' }, '', () => true)).toThrow(/только уровень «проба»/);
    expect(kinds(R.r.manifest, 'tsk').length).toBe(0);
  });
});

describe('папки сборки (09 § 5.2 п. 7)', () => {
  it('проба и синтетика не пишутся в папку выпуска; выпуск — в папку пробы', () => {
    expect(() => assertDir('probe', PACK_DIR.release)).toThrow();
    expect(() => assertDir('synth', PACK_DIR.release)).toThrow();
    expect(() => assertDir('release', PACK_DIR.probe)).toThrow();
    expect(() => assertDir('release', PACK_DIR.synth)).toThrow();
    expect(() => assertDir('probe', PACK_DIR.probe)).not.toThrow();
  });
});

describe('рецензия данных на ядро: права, номер выпуска, карточки', () => {
  it('у сборки «выпуск» номер выпуска обязателен (№ 14)', () => {
    expect(() => build({ level: 'release', dir: tmp('x') })).toThrow(/номер выпуска/);
    expect(R.r.manifest.release).toBe('2026.10.1');
  });
  it('NOTICE: src-synodal всегда, полные тексты MIT и OFL 1.1 (№ 8)', () => {
    for (const d of [A.dir, R.dir]) {
      const t = readFileSync(join(d, 'NOTICE.txt'), 'utf8');
      expect(t).toMatch(/\[src-synodal\]/);
      expect(t).toMatch(/Permission is hereby granted, free of charge/);
      expect(t).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    }
    expect(R.r.manifest.sources.map((x) => x.id)).toContain('src-synodal');
  });
  it('выпуск без единой допущенной записи всё равно несёт src-synodal (текст идёт в каждую сборку)', () => {
    const base = loadBase();
    const real = admission(base, 'release');
    const none = { ...real, ok: () => false, okKey: () => false };
    const n = noticeFor(base, none);
    expect(n.entries.map((e) => e.id)).toContain('src-synodal');
  });
  it('таблица нумерации JSword (LGPL) не входит ни в один пакет (09 § 5.5)', () => {
    for (const p of [...m().packages, ...R.r.manifest.packages]) {
      const body = readFileSync(join(existsSync(join(A.dir, p.file)) ? A.dir : R.dir, p.file), 'utf8');
      expect(/"Ps\.\d+\.\d+"|"Num\.\d+\.\d+"/.test(body), p.file).toBe(false);
    }
  });
  it('карточки: номер утверждения у каждого факта; том больше бюджета делится на части, у лица — номер части (№ 5)', () => {
    const cards = kinds(m(), 'cards');
    const tools = JSON.parse(readFileSync(join(A.dir, kinds(m(), 'tools-index')[0].file), 'utf8'));
    const vols = new Set(cards.map((p) => p.volume));
    for (const a of tools.actors) expect(vols.has(a.v), `${a.id} → ${a.v}`).toBe(true);
    const one = JSON.parse(readFileSync(join(A.dir, cards[0].file), 'utf8'));
    const f = Object.values(one.cards as Record<string, { f: { n: number }[] }>).flatMap((c) => c.f);
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) expect(Number.isInteger(x.n)).toBe(true);
    expect(cards.some((p) => /\.\d+$/.test(p.volume ?? ''))).toBe(true);
  });
});

