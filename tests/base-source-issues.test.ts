/**
 * Дефекты электронного Синодального текста (Д3-4; Д-база, Б-4): таблица tools/bible/source-issues.tsv, пометки в
 * `npm run -s verse` и в проверке цитат документов, ошибка проверки базы на пустой стих в ссылке.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSourceIssues, emptyVerses, issuesAt, sourceIssues } from '../tools/base/source-issues.ts';
import { bracketRows } from '../tools/base/brackets.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import type { Base } from '../tools/base/migrate.ts';

const ROOT = join(import.meta.dirname, '..');
let base: Base;
beforeAll(() => {
  base = loadBase();
});

describe('таблица дефектов текста', () => {
  it('пустые стихи файла = пустые стихи таблицы; таблица сходится с файлом', () => {
    expect(emptyVerses()).toEqual(['Пс 114:9']);
    expect(sourceIssues().filter((r) => r.kind === 'empty').map((r) => `${r.book} ${r.chapter}:${r.from}`)).toEqual(['Пс 114:9']);
    expect(checkSourceIssues()).toEqual([]);
  });

  it('страж: пустой стих, которого нет в таблице, — ошибка', () => {
    const rows = sourceIssues().filter((r) => r.kind !== 'empty');
    expect(checkSourceIssues(rows)).toEqual(['стих Пс 114:9 пуст в synodal.tsv, а в таблице дефектов (source-issues.tsv) не записан']);
  });

  it('первые строки — по находке Б-4', () => {
    const kinds = (b: string, c: number, v: number) => issuesAt(b, c, v).map((r) => r.kind);
    expect(kinds('Пс', 114, 9)).toEqual(['empty']);
    expect(kinds('Пс', 114, 8)).toEqual(['merge']);
    expect(kinds('Притч', 29, 6)).toEqual(['open-bracket']);
    expect(kinds('Притч', 29, 27)).toEqual(['open-bracket']);
    expect(kinds('Нав', 24, 35)).toEqual(['span-bracket']);
    // Притч 30:31: форма скобки — только вопрос; synodal.tsv не правится
    expect(kinds('Притч', 30, 31)).toEqual(['bracket-shape']);
    expect(issuesAt('Притч', 30, 31)[0].state).toBe('вопрос');
  });

  it('каждая скобка через несколько стихов из brackets.tsv записана в таблице дефектов', () => {
    const multi = bracketRows().filter((r) => r.to !== r.from).map((r) => `${r.book} ${r.chapter}:${r.from}-${r.to}`);
    const listed = sourceIssues().filter((r) => r.kind === 'span-bracket' || r.kind === 'open-bracket').map((r) => `${r.book} ${r.chapter}:${r.from}-${r.to}`);
    expect(listed.sort()).toEqual(multi.sort());
    expect(multi).toHaveLength(7);
  });
});

describe('проверка базы: ссылка на пустой стих — ошибка с причиной', () => {
  it('ссылка «Пс 114:9» и диапазон «Пс 114:8-9»', () => {
    const b = structuredClone(base);
    b.kin.push({ from: 'p-david', to: 'p-solomon', rel: 'сын', refs: ['Пс 114:9'] });
    b.nodata.push({ actor: 'p-david', sec: 20, kind: 'silent', refs: ['Пс 114:8-9'] });
    const errs = validate(b).filter((i) => i.level === 'error' && i.check === 'дефект текста');
    expect(errs.map((e) => e.where)).toEqual(['p-david — p-solomon', 'нет сведений p-david § 20']);
    for (const e of errs) expect(e.msg).toMatch(/Пс 114:9 .*пуст в электронном тексте: стих пуст — .*Пс 114:8/);
  });

  it('база на диске на пустые стихи не ссылается', () => {
    expect(validate(base).filter((i) => i.check === 'дефект текста')).toEqual([]);
  });
});

describe('пометки в инструментах', () => {
  it('npm run -s verse: пустой стих и стих внутри скобки через стихи — с пометкой', () => {
    const out = execFileSync('npx', ['tsx', 'tools/verse.ts', 'Пс 114:9', 'Нав 24:35', 'Быт 1:1'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^Пс 114:9\t\(стих пуст в электронном тексте\)\n {3}! стих пуст \(Пс 114:9\)/m);
    expect(out).toMatch(/^Нав 24:35\t.*\n {3}! скобка через несколько стихов \(Нав 24:34–36\)/m);
    expect(out).toMatch(/^Быт 1:1\tВ начале сотворил Бог небо и землю\.\n?$/m);
  }, 30_000);

  it('проверка цитат документов: причина у пустого стиха и пометка у склейки и вставки', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'цитаты проба '));
    try {
      const doc = join(tmp, 'документ с пробелом.md');
      writeFileSync(doc, 'Проба: «Буду ходить пред лицем Господним на земле живых» (Пс 114:9). Ещё «Буду ходить пред лицем Господним» (Пс 114:8). И «пошли каждый в свое место» (Нав 24:35).\n');
      const out = execFileSync('python3', ['-I', 'docs/app/data/07-цитаты.py', doc], { cwd: ROOT, encoding: 'utf8' });
      expect(out).toMatch(/НЕ НАЙДЕНО .*Пс 114:9\n {4}! стих пуст \(Пс 114:9\)/);
      expect(out).toMatch(/ПОМЕТКА .*Пс 114:8\n {4}! вероятная склейка/);
      expect(out).toMatch(/ПОМЕТКА .*Нав 24:35\n {4}! скобка через несколько стихов/);
      expect(out.trim().split('\n').at(-1)).toBe('Проверено цитат: 3; не найдено: 1; пометок дефектов текста: 3');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
