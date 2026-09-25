/**
 * Проверка доступности (ТЗ § 3.8) движком axe-core на основных экранах в обеих темах:
 * небо, карточка, разворот, панели. Небо — холст с текстовой альтернативой; всё остальное — обычная разметка.
 *   npm run -s a11y   (нужна сборка: npx vite build)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

const PORT = 4187;
const axeSource = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

type Screen = { name: string; hash: string; act?: (p: Page) => Promise<void> };
const SCREENS: Screen[] = [
  { name: 'небо', hash: '#/' },
  { name: 'карточка Давида', hash: '#/david' },
  { name: 'разворот', hash: '#/avraam', act: async (p) => {
    await p.click('.folio .actions >> text=Разворот с…');
    await p.fill('#find', 'Исаак');
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
  } },
  ...['Указатель', 'Родство', 'Синопсис', 'Главы', 'Сквозной раздел', 'Условные знаки', 'О карте', 'Эпохи'].map((cmd) => ({
    name: `панель «${cmd}»`,
    hash: '#/david',
    act: async (p: Page) => {
      await p.locator('.commands').getByText(cmd, { exact: true }).click();
    },
  })),
  { name: 'образец', hash: '#/specimen' },
];

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  let total = 0;
  try {
    for (const theme of ['night', 'day']) {
      for (const s of SCREENS) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
