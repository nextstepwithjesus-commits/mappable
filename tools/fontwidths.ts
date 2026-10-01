/**
 * Таблица ширин шрифта неба (этап 14, контракт 5, решение 158; C12): ширины знаков по настоящему measureText в браузере
 * со шрифтами атласа (Literata, Jost) — для переписи (tools/census.ts) и тестов, которые оценивают ширину подписи без
 * холста. Прежняя оценка 0,56 кегля на знак занижала ширину Literata вдвое (медиана ×1,11–1,17).
 *
 *   npx tsx tools/fontwidths.ts [--dist .ui-build/s2] [--port 4812]     # пишет tools/font-widths.json
 *
 * Формат: fonts[ключ] = { family, weight, italic, size, spacing, em: { знак: ширина в долях кегля } } и roles —
 * какой ключ у какого вида подписи (имя звезды по величине 0–6, погашенное имя, курсив «время не установлено», сокращение
 * роли, уточнение, помета, название созвездия). Ширина строки ≈ size · Σ em[знак] + spacing · size · (число знаков);
 * знака нет в таблице — em['?']. Кернинг не учитывается: расхождение с measureText целой строки — в поле check
 * (наибольшее отклонение по выборке имён, доля).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';
import { session } from './ui-kit.ts';
import { FONT_SANS, FONT_SERIF, NAME_SIZE, NAME_WEIGHT, T_MAP_S, T_UI_S } from '../src/render/type.ts';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const CHARS = [
  ...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  ...' ,.;:()[]-–—«»"\'!?†‹›↑↓→←+/·…  ',
];

interface Spec {
  key: string;
  family: string;
  weight: number;
  italic: boolean;
  size: number;
  spacing: number;
}

const specs: Spec[] = [];
const add = (key: string, family: string, weight: number, italic: boolean, size: number, spacing = 0) => {
  if (!specs.some((s) => s.key === key)) specs.push({ key, family, weight, italic, size, spacing });
};
const roles: Record<string, string | string[]> = {};
// имена звёзд по величине 0–6 (labels.ts, nameFontWith): полужирность по величине, погашенные — 400, курсив — лицо без времени
roles.name = NAME_SIZE.map((size, m) => {
  const k = `serif-${NAME_WEIGHT[m]}-${size}`;
  add(k, 'serif', NAME_WEIGHT[m], false, size);
  return k;
});
roles.nameLight = NAME_SIZE.map((size) => {
  const k = `serif-400-${size}`;
  add(k, 'serif', 400, false, size);
  return k;
});
roles.nameItalic = NAME_SIZE.map((size, m) => {
  const k = `serif-${NAME_WEIGHT[m]}-${size}-italic`;
  add(k, 'serif', NAME_WEIGHT[m], true, size);
  return k;
});
// сокращения ролей — курсив 400 на ступень мельче; уточнение одноимённого — курсив --t-ui-s; пометы — курсив 11,5
for (const size of [14, 13, 12, T_MAP_S]) add(`serif-400-${size}-italic`, 'serif', 400, true, size);
roles.note = `serif-400-${T_UI_S}-italic`;
roles.mark = `serif-400-${T_MAP_S}-italic`;
// названия созвездий — Jost 500 с разрядкой 0,22 em (labels.ts, drawGroupNames)
add(`sans-500-${T_MAP_S}-spaced`, 'sans', 500, false, T_MAP_S, 0.22);
roles.group = `sans-500-${T_MAP_S}-spaced`;
add(`sans-500-${T_MAP_S}`, 'sans', 500, false, T_MAP_S);
roles.edge = `sans-500-${T_MAP_S}`;

const SAMPLE = ['Иаков', 'Мафусаил', 'Сын Давида и Вирсавии', 'Иосиф, сын Иакова', 'Авигея', 'Шегараим', 'Иисус Христос', 'КОЛЕНО ИУДИНО', 'Махалафа, жена Исава'];

async function main() {
  const port = Number(arg('port') ?? 4790);
  const dist = arg('dist') ?? 'dist';
  const s = await session(port, { dist });
  try {
    const p = await s.page({ width: 1200, height: 800, intro: false });
    // tsx оборачивает функции в __name (keepNames): в странице его нет
    await p.addInitScript('window.__name = window.__name || ((f) => f)');
    await p.goto(s.url('#/'));
    await p.waitForTimeout(2500);
    const out = await p.evaluate(
      async ([specs, chars, sample, serif, sans]) => {
        const fam = (f: string) => (f === 'serif' ? serif : sans);
        const font = (q: (typeof specs)[number]) => `${q.italic ? 'italic ' : ''}${q.weight} ${q.size}px ${fam(q.family)}`;
        for (const q of specs) await document.fonts.load(font(q), chars.join(''));
        const ctx = document.createElement('canvas').getContext('2d')!;
        const res: Record<string, { family: string; weight: number; italic: boolean; size: number; spacing: number; em: Record<string, number>; check: number }> = {};
        for (const q of specs) {
          ctx.font = font(q);
          (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
          const em: Record<string, number> = {};
          for (const ch of chars) em[ch] = Math.round((ctx.measureText(ch).width / q.size) * 10000) / 10000;
          em['?'] = em['о'];
          // проверка: строка целиком против суммы знаков (кернинг, лигатуры)
          (ctx as unknown as { letterSpacing: string }).letterSpacing = `${q.spacing}em`;
          let worst = 0;
          for (const t0 of sample) {
            const t = q.spacing ? t0.toUpperCase() : t0;
            const real = ctx.measureText(t).width;
            const est = q.size * ([...t].reduce((a, c) => a + (em[c] ?? em['?']), 0) + q.spacing * [...t].length);
            worst = Math.max(worst, Math.abs(est - real) / real);
          }
          res[q.key] = { family: q.family, weight: q.weight, italic: q.italic, size: q.size, spacing: q.spacing, em, check: Math.round(worst * 1000) / 1000 };
        }
        return res;
      },
      [specs, CHARS, SAMPLE, FONT_SERIF, FONT_SANS] as const,
    );
    const file = join(ROOT, 'tools/font-widths.json');
    writeFileSync(file, JSON.stringify({ note: 'tools/fontwidths.ts: ширины знаков в долях кегля по measureText шрифтов неба', fonts: out, roles }, null, 1) + '\n');
    const avg = (k: string) => {
      const e = out[k].em;
      const ru = [...'абвгдежзийклмнопрстуфхцчшщыьэюя'];
      return (ru.reduce((a, c) => a + e[c], 0) / ru.length).toFixed(3);
    };
    for (const k of Object.keys(out)) console.log(`${k.padEnd(26)} строчные в среднем ${avg(k)} em, расхождение строки ≤ ${(out[k].check * 100).toFixed(1)} %`);
    console.log(`→ ${file}`);
  } finally {
    await s.close();
  }
}

await main();
