/**
 * Страница атласа для публикации (claude.ai Artifact): после `vite build --mode artifact`
 * index.html превращается в содержимое страницы без <html>, <head> и <body> — их добавляет публикация.
 *   npm run -s build:artifact   → dist-artifact/toledot.html и dist-artifact/assets/*
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';

const dir = join(ROOT, 'dist-artifact');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const script = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
const css = /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/.exec(html)?.[1];
if (!script || !css) throw new Error('в index.html не найдены скрипт и стили');
const page = `<title>Толедот</title>
<meta name="description" content="Звёздный атлас всех родословных связей канонической Библии: две линии к Иисусу Христу, карточки лиц, шкала времени и карта эпох.">
<link rel="stylesheet" href="${css}">
<script type="module" src="${script}"></script>
<div id="app"></div>
`;
writeFileSync(join(dir, 'toledot.html'), page);
const files = readdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [`assets/${f}`, `dist-artifact/assets/${f}`])), null, 1));
console.log(`toledot.html; файлов в assets: ${files.length}`);
