// Сборка токенов Terrazzo (09 § 3.6). Вход — resolver DTCG 2025.10, который пишет tools/tokens/build.ts из tokens/токены.json;
// списки изменённых токенов по контекстам — tokens/build/режимы.json. Запуск — только через `npm run -s tokens`.
import { readFileSync } from 'node:fs';
import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';

const changed = JSON.parse(readFileSync(new URL('./build/режимы.json', import.meta.url), 'utf8'));
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// та же латинская запись, что tools/tokens/tokens.ts (cssVar): одна на приложение (08 § 3.1)
const cssVar = (id) => '--' + id.replace(/\./g, '-').toLowerCase().split('').map((ch) => (ch in TR ? TR[ch] : ch)).join('').replace(/[^a-z0-9-]/g, '-');
const base = { тема: 'светлая', экран: 'широкий', плотность: 'обычная', ввод: 'мышь' };
const block = (sel, c, pad = '') => `${pad}${sel} {\n${c.split('\n').map((l) => pad + '  ' + l.trim()).join('\n')}\n${pad}}\n`;
const media = (q, sel, c) => `${q} {\n${block(sel, c, '  ')}}\n`;
const perm = (mod, ctx, prepare) => ({ input: { ...base, [mod]: ctx }, include: changed[mod][ctx], prepare });

export default defineConfig({
  tokens: ['./build/токены.resolver.json'],
  outDir: './dist/',
  // имена токенов — русские, как в 08 (ВЗ, НЗ, Мф, Лк — прописными): правило kebab-case Terrazzo к ним не применяется
  lint: { rules: { 'core/consistent-naming': 'off' } },
  plugins: [
    css({
      filename: 'tokens.css',
      legacyHex: true,
      variableName: (t) => cssVar(t.id),
      permutations: [
        { input: base, prepare: (c) => block(':root, [data-theme="light"]', c) },
        perm('тема', 'тёмная', (c) => block(':root[data-theme="dark"], [data-theme="dark"]', c) + media('@media (prefers-color-scheme: dark)', ':root:not([data-theme="light"])', c)),
        // телефон — медиазапросом по окну и атрибутом области: в режиме «рядом» половина экрана берёт классы по своей ширине
        perm('экран', 'телефон', (c) => `/* Телефон: окно уже 37,5 em (08 § 3.4); [data-okno="узкое"] — узкая область в режиме «рядом» */\n` + media('@media (max-width: 37.4375em)', ':root', c) + block('[data-okno="узкое"]', c)),
        perm('плотность', 'плотная', (c) => `/* Плотность (08 § 3.4; 09 § 9.7): кегли не меняются */\n` + block('[data-density="плотная"]', c)),
        // ввод — после плотности: касание сильнее (цель не меньше 44, 08 § 3.4)
        perm('ввод', 'касание', (c) => `/* Способ ввода (08 § 3.5): касание — 44–48 */\n` + media('@media (pointer: coarse)', ':root:not([data-input="мышь"]), :root:not([data-input="мышь"]) [data-density="плотная"]', c) + block('[data-input="касание"], [data-input="касание"] [data-density="плотная"], [data-input="касание"][data-density="плотная"]', c)),
        perm('ввод', 'сенсорный', (c) => `/* Сенсорный ноутбук (08 § 3.5) */\n` + media('@media (pointer: fine) and (any-pointer: coarse)', ':root:not([data-input]), :root:not([data-input]) [data-density="плотная"]', c)),
      ],
    }),
  ],
});
