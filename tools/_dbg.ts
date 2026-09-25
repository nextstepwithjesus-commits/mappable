import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('npx', ['vite', 'preview', '--port', '4183', '--strictPort'], { cwd: '/home/user/mappable', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:4183/');
await p.waitForTimeout(1800);
const l = p.locator('.commands >> text=Синопсис');
console.log('enabled', await l.isEnabled(), 'visible', await l.isVisible(), 'editable?', await l.evaluate((e) => (e as HTMLButtonElement).disabled + ' ' + getComputedStyle(e).visibility + ' ' + getComputedStyle(e).transition));
for (const t of ['Эпохи', 'Указатель', 'Родство', 'Синопсис', 'Главы']) {
  const t0 = Date.now();
  const r = await p.locator('.commands').getByText(t, { exact: true }).click({ timeout: 4000 }).then(() => 'ok').catch((e) => 'FAIL ' + e.message.split('\n').slice(-2).join(' '));
  console.log(t, r, Date.now() - t0);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
}
await b.close(); server.kill();
