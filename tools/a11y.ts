/**
 * Проверка доступности (ТЗ § 3.8) движком axe-core на основных экранах в обеих темах:
 * небо, карточка, разворот, панели. Небо — холст с текстовой альтернативой; всё остальное — обычная разметка.
 *   npm run -s a11y   (нужна сборка: npx vite build)
 *   npx tsx tools/a11y.ts --dist .ui-build/<имя> --port <порт>   (своя сборка и порт — для параллельной работы)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? null : (argv[i + 1] ?? null);
};
const DIST = opt('dist');
const PORT = Number(opt('port') ?? 4187);
const axeSource = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

type Screen = { name: string; hash: string; act?: (p: Page) => Promise<void>; view?: { width: number; height: number; touch?: boolean } };
const SCREENS: Screen[] = [
  { name: 'небо', hash: '#/' },
  { name: 'карточка Давида', hash: '#/david' },
  { name: 'разворот', hash: '#/avraam', act: async (p) => {
    await p.click('.folio .actions >> text=Разворот с…');
    await p.fill('#find', 'Исаак');
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
  } },
  ...['Указатель', 'Родство', 'Синопсис', 'Главы', 'Сквозной раздел', 'Условные знаки', 'О карте'].map((cmd) => ({
    name: `панель «${cmd}»`,
    hash: '#/david',
    act: async (p: Page) => {
      await p.locator('.commands').getByText(cmd, { exact: true }).click();
    },
  })),
  // «Эпохи» — в органах неба (C6): флажок ярусов и команда панели
  { name: 'панель «Эпохи» и ярусы', hash: '#/david', act: async (p) => {
    await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
    await p.locator('.skyctl').getByText('Эпохи', { exact: true }).click();
  } },
  { name: 'список моделей хронологии', hash: '#/', act: async (p) => {
    await p.click('.skyctl .menu.model > button');
  } },
  { name: '«Ещё» на 1024', hash: '#/', view: { width: 1024, height: 768 }, act: async (p) => {
    await p.click('.commands .more > button');
  } },
  { name: 'телефон: лист «Вид»', hash: '#/david', view: { width: 390, height: 844, touch: true }, act: async (p) => {
    await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
  } },
  { name: 'образец', hash: '#/specimen' },
];

async function main() {
  const args = ['vite', 'preview', '--port', String(PORT), '--strictPort'];
  if (DIST) args.push('--outDir', DIST);
  const server = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  let total = 0;
  try {
    for (const theme of ['night', 'day']) {
      for (const s of SCREENS) {
        const v = s.view ?? { width: 1440, height: 900 };
        const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.touch, hasTouch: !!v.touch });
        const p = await ctx.newPage();
        await p.addInitScript(`localStorage.setItem('toledot:intro','true');localStorage.setItem('toledot:theme', JSON.stringify('${theme}'))`);
        await p.goto(`http://localhost:${PORT}/${s.hash}`);
        await p.waitForTimeout(1500);
        if (s.act) {
          await s.act(p);
          await p.waitForTimeout(900);
        }
        await p.addScriptTag({ content: axeSource });
        const res = (await p.evaluate(
          "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })))",
        )) as { id: string; impact: string; help: string; nodes: string[] }[];
        total += res.length;
        console.log(`${res.length ? 'НЕТ' : 'да '} ${theme} · ${s.name}${res.length ? '' : ''}`);
        for (const v of res) console.log(`     ${v.impact} ${v.id}: ${v.help}\n       ${v.nodes.join('\n       ')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid!);
    } catch {
      /* уже остановлен */
    }
  }
  console.log(total ? `\nНарушений: ${total}` : '\nНарушений не найдено.');
  process.exitCode = total ? 1 : 0;
}
main();
