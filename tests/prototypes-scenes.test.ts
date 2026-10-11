/**
 * Опись сцен показа (10 § 3.3): каждый ключ `prototypes/инструменты/<инструмент>/сцены.json` допущен уровнем «выпуск» — в
 * сценах показа 0 записей уровня «проба». Описей пока нет (прототипов инструментов нет): тест готов к первой и проверяет
 * сам себя на нарочно испорченной описи.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBase } from '../tools/base/validate.ts';
import { admission, type Admission } from '../tools/base/admit.ts';

const DIR = join(import.meta.dirname, '..', 'prototypes', 'инструменты');

/** Опись: адрес → ключи записей. Ответ — ключи, не допущенные уровнем «выпуск». */
function notReleased(scenes: Record<string, string[]>, A: Admission): string[] {
  return Object.entries(scenes).flatMap(([addr, keys]) => keys.filter((k) => !A.okKey(k)).map((k) => `${addr}: ${k}`));
}

let A: Admission;
beforeAll(() => {
  A = admission(loadBase(), 'release');
}, 60_000);

describe('опись сцен показа', () => {
  const files = existsSync(DIR) ? readdirSync(DIR).map((t) => join(DIR, t, 'сцены.json')).filter(existsSync) : [];
  it(`каждый ключ описи допущен уровнем «выпуск» (описей: ${files.length})`, () => {
    for (const f of files) expect(notReleased(JSON.parse(readFileSync(f, 'utf8')) as Record<string, string[]>, A), f).toEqual([]);
  });
  it('проверка ловит запись пробы и неизвестный ключ', () => {
    const draft = [...A.status].find(([, s]) => s.status === 'draft')?.[0];
    expect(draft).toBeDefined();
    const bad = notReleased({ '/genealogiya?p=p-adam': [draft!, 'actor:p-нет-такого'] }, A);
    expect(bad.length).toBe(2);
  });
});
