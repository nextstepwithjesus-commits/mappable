/**
 * Справка называет то, что есть на экране (решение 36; UX-35, UX-54, UX-64): каждое название в кавычках «…» в текстах
 * «Условных знаков» (Legend.tsx) и «О карте» (About.tsx) есть в интерфейсе — в исходниках других модулей src/.
 * Кавычки, которые называют не орган интерфейса (слова Писания, образцы знаков, клавиши), перечислены с причиной.
 * Слово «органы неба» в справке не встречается: такой надписи на экране нет.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const HELP = ['src/ui/panels/Legend.tsx', 'src/ui/panels/About.tsx'];

/** Кавычки, которые не называют надпись интерфейса. */
const NOT_UI: Record<string, string> = {
  '‖': 'знак брака на небе — образец рядом',
  '+12': 'знак свёрнутых потомков — образец рядом',
  '≈': 'знак неравномерного масштаба у масштабной линейки — образец рядом',
  'масштаб ├──┤ 50 лет': 'масштабная линейка — образец рядом (этап 13: так она выглядит на экране, frame.ts)',
  'масштаб ├──┤ ≈ 50 лет': 'та же линейка на шкале «По эпохам»: «≈» — годы в окне неравномерны (этап 21; frame.ts рисует её на холсте)',
  '?': 'клавиша',
  мать: 'слово шага пути на небе — образец рядом',
  сын: 'слово шага пути на небе — образец рядом',
  сыном: 'слово Писания (Быт 10)',
  родственница: 'термин Писания (Лк 1:36)',
  Призрак: 'название знака в справке',
  'звезда светлая и утренняя': 'слова Писания (Откр 22:16)',
  'от сотворения мира': 'выражение, от которого справка предостерегает',
  'лет от сотворения': 'название шкалы',
  'Давид → Соломон (Мф 1:6)': 'образец подсказки ленты',
};

/** Все исходники src/ кроме самих справок — «интерфейс». */
function uiText(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (f !== 'generated') walk(p);
      } else if (/\.(ts|tsx)$/.test(f) && !HELP.some((h) => p.endsWith(h))) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(ROOT, 'src'));
  return out.join('\n').toLowerCase().replace(/ё/g, 'е');
}

/** Текст справки без комментариев: кавычки в комментариях — не слова для читателя. */
function helpText(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
}

const quotes = (t: string) => [...t.matchAll(/«([^»{}]+)»/g)].map((m) => m[1].trim());

describe('справка называет видимые надписи (UX-35, UX-54)', () => {
  const ui = uiText();
  for (const file of HELP) {
    it(`${file}: каждое название в кавычках есть в интерфейсе`, () => {
      const missing: string[] = [];
      for (const q of new Set(quotes(helpText(file)))) {
        if (q in NOT_UI) continue;
        const low = q.toLowerCase().replace(/ё/g, 'е');
        if (ui.includes(low)) continue;
        // «Все N на небе» — число подставляет интерфейс
        const withN = new RegExp(low.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\bn\b/g, '(\\$\\{[^}]+\\}|\\d+)'));
        if (withN.test(ui)) continue;
        // падежная форма названия: «в „Родстве“», «в „Синопсисе“» — по основе из пяти букв
        if (!low.includes(' ') && low.length >= 6 && ui.includes(`'${low.slice(0, 5)}`)) continue;
        if (!low.includes(' ') && low.length >= 6 && new RegExp(`[>'"«]${low.slice(0, 5)}[а-я]*[<'"»]`).test(ui)) continue;
        missing.push(q);
      }
      expect(missing).toEqual([]);
    });
    it(`${file}: нет слов «органы неба» и «хронологический движок»`, () => {
      const t = helpText(file).toLowerCase();
      expect(t).not.toMatch(/орган(ы|ах|ов) неба/);
      expect(t).not.toMatch(/хронологическ\S* движк/);
    });
  }
  it('словарь «Как читать карту»: строка неба, столбец, созвездие, лента, след', async () => {
    const { GLOSSARY } = await import('../src/ui/panels/Legend.tsx');
    expect(GLOSSARY.map(([t]) => t)).toEqual(['небо', 'строка неба', 'столбец', 'созвездие', 'лента', 'след']);
    // первый импорт панели тянет небо и образцы: под нагрузкой машины — дольше 5 с по умолчанию
  }, 60_000);
});
