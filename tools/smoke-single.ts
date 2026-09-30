// Приёмка выдаваемого файла (решение 133): «открыть → найти → раскрыть стих → восстановить» в самом
// dist-single/index.html без сети. Печатает контрольную сумму файла; код выхода 1 — если шаг не прошёл.
// npx tsx tools/smoke-single.ts [путь к html]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const file = resolve(process.argv[2] ?? 'dist-single/index.html');
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const net: string[] = [];
await ctx.route(/^(https?|wss?):/, (r) => { net.push(r.request().url()); return r.abort(); });
const p = await ctx.newPage();
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const steps: { step: string; ok: boolean; note: string }[] = [];
const check = (step: string, ok: boolean, note = '') => { steps.push({ step, ok, note }); };
const h2 = () => p.locator('.folio h2').first().innerText({ timeout: 5000 }).catch(() => '');

// 1. открыть
await p.goto('file://' + file);
const sky = await p.locator('.sky canvas').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
check('открыть', sky, sky ? 'небо на месте' : 'нет неба');

// 2. найти
await p.locator('#find').fill('Руфь');
await p.keyboard.press('Enter');
await p.waitForFunction(() => /Руфь/.test(document.querySelector('.folio h2')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
const t1 = await h2();
check('найти', /Руфь/.test(t1), t1);

// 3. раскрыть стих
const ref = p.locator('.folio .ref').first();
const label = (await ref.getAttribute('aria-label').catch(() => '')) ?? '';
await ref.click().catch(() => undefined);
const verses = p.locator('.folio .verses:not(.muted)').first();
const vtext = await verses.innerText({ timeout: 8000 }).catch(() => '');
check('раскрыть стих', vtext.trim().length > 20 && !/Загрузка|не удалось/.test(vtext), `${label}: ${vtext.slice(0, 60)}`);

// 4. восстановить: адрес и сохранённое состояние переживают перезагрузку
const hash = await p.evaluate(() => location.hash);
await p.reload();
await p.waitForFunction(() => /Руфь/.test(document.querySelector('.folio h2')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
const t2 = await h2();
const hash2 = await p.evaluate(() => location.hash);
check('восстановить', /Руфь/.test(t2) && hash2 === hash, `${hash2} ${t2}`);

check('без сети', net.length === 0, net.slice(0, 3).join(' '));
check('без ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();

for (const s of steps) console.log(`${s.ok ? 'ДА ' : 'НЕТ'} ${s.step}${s.note ? ' — ' + s.note : ''}`);
console.log(`sha256 ${sha}  ${file}`);
process.exit(steps.every((s) => s.ok) ? 0 : 1);
