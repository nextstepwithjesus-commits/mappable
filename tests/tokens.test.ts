/**
 * Токены (08 § 3, ред. 3.3; 09 § 3.6): киноварь, шкала 30 · 22 · 18 · 16 · 14 · 12, контраст пар в обеих темах, сборка Terrazzo
 * в CSS-переменные по режимам и модуль TypeScript с теми же значениями. Каждая проверка падает на нарочно испорченном файле.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildTokens, check, resolver, SCALE } from '../tools/tokens/build.ts';
import { contrastRows, cssVar, flat, hex, load, resolve, type Doc } from '../tools/tokens/tokens.ts';

const clone = (): Doc => JSON.parse(JSON.stringify(load())) as Doc;
type Obj = Record<string, Record<string, Record<string, unknown>>>;

let css = '';
let ts = '';
beforeAll(() => {
  ({ css, ts } = buildTokens());
}, 120_000);

describe('файл токенов', () => {
  it('проверки проходят: ссылки, шкала, киноварь, контраст, имена переменных', () => {
    expect(check(load())).toEqual([]);
  });
  it('цвет действия — киноварь: #A33A1F светлая, #F0957B тёмная; второго варианта нет', () => {
    const all = flat(load());
    expect(hex(resolve(all, 'цвет.действие', [])).toUpperCase()).toBe('#A33A1F');
    expect(hex(resolve(all, 'цвет.действие', ['тёмная'])).toUpperCase()).toBe('#F0957B');
    expect(Object.keys(all).some((p) => /действие-/.test(p))).toBe(false);
    expect(JSON.stringify(load())).not.toMatch(/проба"/);
  });
  it('шкала — шесть ступеней 30 · 22 · 18 · 16 · 14 · 12', () => {
    expect(SCALE).toEqual([30, 22, 18, 16, 14, 12]);
    const all = flat(load());
    const sizes = new Set(Object.entries(all).filter(([, t]) => t.$type === 'typography').flatMap(([p]) => [[], ['телефон']].map((m) => {
      const fs = (resolve(all, p, m) as { fontSize: { value: number; unit: string } }).fontSize;
      expect(fs.unit, p).toBe('rem'); // все кегли — в rem (08 § 3.3.2; рецензия интерфейса, № 1)
      return fs.value * 16;
    })));
    expect([...sizes].sort((a, b) => b - a)).toEqual(SCALE);
  });
  it('контраст: все пары не ниже нормы в обеих темах', () => {
    const rows = contrastRows(load());
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
});

describe('нарочно испорченный файл — ошибка проверки', () => {
  it('цвет действия не киноварь', () => {
    const d = clone() as unknown as Obj;
    d['цвет']['действие'].$value = '{основа.цвет.бирюза-700}';
    expect(check(d as unknown as Doc).join()).toMatch(/нужна киноварь/);
  });
  it('лишняя ступень шкалы и кегль мельче 12', () => {
    const d = clone() as unknown as Obj;
    (d['текст']['адрес'].$value as { fontSize: { value: number } }).fontSize.value = 11 / 16;
    const e = check(d as unknown as Doc).join('\n');
    expect(e).toMatch(/мельче 12 px/);
    expect(e).toMatch(/шкала кеглей/);
  });
  it('кегль в px вместо rem', () => {
    const d = clone() as unknown as Obj;
    (d['текст']['писание'].$value as { fontSize: unknown }).fontSize = { value: 18, unit: 'px' };
    expect(check(d as unknown as Doc).join()).toMatch(/кегль не в rem/);
  });
  it('битая ссылка', () => {
    const d = clone() as unknown as Obj;
    d['цвет']['чернила'].$value = '{основа.цвет.нет-такого}';
    expect(check(d as unknown as Doc).join()).toMatch(/нет токена основа\.цвет\.нет-такого/);
  });
  it('пара ниже нормы контраста', () => {
    const d = clone() as unknown as Obj;
    d['цвет']['чернила'].$value = '{основа.цвет.сланец-200}';
    expect(check(d as unknown as Doc).join()).toMatch(/контраст чернила к/);
  });
});

describe('сборка Terrazzo', () => {
  it('resolver DTCG 2025.10: основа, три оси 08 § 3.1 (тема, плотность, ввод) и экран', () => {
    const r = resolver(load()).resolver as { version: string; modifiers: Record<string, { contexts: Record<string, unknown> }> };
    expect(r.version).toBe('2025.10');
    expect(Object.keys(r.modifiers)).toEqual(['тема', 'экран', 'плотность', 'ввод']);
    expect(Object.keys(r.modifiers['ввод'].contexts)).toEqual(['мышь', 'касание', 'сенсорный']);
    expect(Object.keys(r.modifiers['плотность'].contexts)).toEqual(['обычная', 'плотная']);
    expect(JSON.stringify(load())).not.toMatch(/касание·плотная/);
  });
  it('компоненты и цели — ссылками на основу, а не сырыми px (08 § 3.1)', () => {
    const all = flat(load());
    for (const [p, t] of Object.entries(all)) {
      if (!/^(компонент|цель)\./.test(p) || t.$type !== 'dimension' || /кегль/.test(p)) continue;
      expect(typeof t.$value === 'string' || (t.$value as { unit: string }).unit !== 'px', p).toBe(true);
    }
    expect(all['окно.среднее']).toBeDefined();
    expect(all['компонент.отступ-прокрутки']).toBeDefined();
  });
  it('CSS: киноварь в основе и в тёмной теме (атрибут и системная тема), телефон, касание, плотность, размер текста', () => {
    expect(css).toMatch(/Terrazzo/);
    const v = cssVar('цвет.действие');
    expect(v).toBe('--tsvet-deystvie');
    expect(css).toMatch(new RegExp(`:root, \\[data-theme="light"\\] \\{[\\s\\S]*?${v}: var\\(--osnova-tsvet-kinovar-700\\)`));
    expect(css).toMatch(/--osnova-tsvet-kinovar-700: #a33a1f/i);
    expect(css).toMatch(/:root\[data-theme="dark"\], \[data-theme="dark"\] \{[\s\S]*?--tsvet-deystvie: var\(--osnova-tsvet-kinovar-300\)/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
    expect(css).toMatch(/@media \(max-width: 37\.4375em\) \{[\s\S]*?--tekst-zagolovok-stranitsy-font-size: 1\.375rem/);
    expect(css).toMatch(/\[data-okno="узкое"\] \{[\s\S]*?--tekst-zagolovok-stranitsy-font-size: 1\.375rem/);
    expect(css).not.toMatch(/font-size: \d+(\.\d+)?px/);
    expect(css).toMatch(/--tekst-pisanie-font-size: 1\.125rem/);
    expect(css).toMatch(/--tekst-pisanie-font-feature-settings: "onum"/);
    expect(css).toMatch(/@media \(pointer: coarse\)/);
    expect(css).toMatch(/\[data-density="плотная"\] \{[\s\S]*?--tsel-stroka: var\(--osnova-razmer-28\)/);
    expect(css).toMatch(/\[data-density="плотная"\] \{[\s\S]*?--komponent-stroka-instrumenta-vysota: var\(--osnova-razmer-32\)/);
    expect(css).toMatch(/--osnova-razmer-28: 28px/);
    expect(css).toMatch(/:root\[data-text="крупнее"\] \{ font-size: 112\.5%; \}/);
  });
  it('модуль TypeScript: те же значения по режимам', async () => {
    expect(ts).toMatch(/export const TOKENS/);
    const m = (await import('../tokens/dist/tokens.ts')) as { token(p: string, modes?: string[]): unknown };
    expect(m.token('цвет.действие')).toBe('#A33A1F');
    expect(m.token('цвет.действие', ['тёмная'])).toBe('#F0957B');
    expect(m.token('цель.строка')).toEqual({ value: 36, unit: 'px' });
    expect(m.token('цель.строка', ['плотная'])).toEqual({ value: 28, unit: 'px' });
    expect(m.token('цель.строка', ['касание'])).toEqual({ value: 48, unit: 'px' });
    expect(m.token('цель.строка', ['плотная', 'касание'])).toEqual({ value: 48, unit: 'px' }); // касание сильнее плотности
    expect(m.token('компонент.строка-инструмента-высота', ['сенсорный'])).toEqual({ value: 44, unit: 'px' });
    expect((m.token('текст.заголовок-страницы', ['телефон']) as { fontSize: { value: number; unit: string } }).fontSize).toEqual({ value: 1.375, unit: 'rem' });
  });
});
