// Снимки и проверки эскиза: node prototypes/main-screen/shoot.mjs [--only имя] [--no-shots]
// Chromium — из /opt/pw-browsers (playwright install не запускать).
// Снимки: prototypes/main-screen/shots/<имя>-<ширина>-<тема>.png (затем сжимаются compress.py).
// Проверки: Tab до поиска, контраст текста, прокрутка вбок, размер целей касания.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL0 = pathToFileURL(join(HERE, 'index.html')).href;
const SHOTS = join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const noShots = args.includes('--no-shots');

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

// Экраны: имя, вариант, адрес, действия после загрузки
const SCREENS = [
  ['01-home-ab', 'ab', '#/'],
  ['01-home-v', 'v', '#/'],
  ['01-home-v-open', 'v', '#/', async (p) => { await p.click('.ecell[data-epoch="patriarchs"]'); }],
  ['01-home-d', 'd', '#/'],
  ['01-home-d-open', 'd', '#/', async (p) => { await p.click('.gapbtn[aria-controls="g2"]'); await p.click('.trunk .anc .pick[data-pid="p-noy"]'); }],
  ['02-search-noy', 'ab', '#/s/' + encodeURIComponent('Ной')],
  ['02-search-ruf', 'ab', '#/s/' + encodeURIComponent('Руфь')],
  ['02-search-ruf4-17', 'ab', '#/s/' + encodeURIComponent('Руф 4:17')],
  ['02-search-ruvim', 'ab', '#/s/' + encodeURIComponent('Рувим')],
  ['03-gen-noy', 'ab', '#/gen/p-noy'],
  ['04-gen-avraam', 'ab', '#/gen/p-avraam'],
  ['05-gen-12', 'ab', '#/gen/p-iakov'],
  ['06-gen-messiah', 'ab', '#/gen/messiah'],
  ['07-time-avraam', 'ab', '#/time/p-avraam'],
  ['08-geo-avraam', 'ab', '#/geo/p-avraam'],
  ['09-card-avraam', 'ab', '#/card/p-avraam'],
  ['09-card-avraam-verse', 'ab', '#/card/p-avraam', async (p) => { await p.click('.mainverse .ref'); }],
  ['09-card-david', 'ab', '#/card/p-david'],
  ['09-card-ruf', 'ab', '#/card/p-ruf'],
  ['10-index-ruf', 'ab', '#/index/ruf'],
  ['11-stub', 'ab', '#/stub/' + encodeURIComponent('Связи — Авраам')],
  ['12-study-card-avraam', 'ab', '#/card/p-avraam', async (p) => { await p.selectOption('[data-layer-select]', 'study'); }],
  ['12-study-messiah', 'ab', '#/gen/messiah', async (p) => { await p.selectOption('[data-layer-select]', 'study'); }],
  ['12-study-time-avraam', 'ab', '#/time/p-avraam', async (p) => { await p.selectOption('[data-layer-select]', 'study'); }],
];
const SIZES = [['1280', { width: 1280, height: 800 }], ['360', { width: 360, height: 640 }]];
const THEMES = ['light', 'dark'];

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

async function audit(page) {
  return page.evaluate(() => {
    const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return v; };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && (c.length < 4 || c[3] > 0.5)) return c.slice(0, 3);
      }
      return parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const out = { texts: [], targets: [], overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[data-host], template, script, style, .sr, svg')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      out.texts.push({ t: n.textContent.trim().slice(0, 30), fg: parse(cs.color).slice(0, 3), bg: bgOf(el), size: parseFloat(cs.fontSize) });
    }
    for (const el of document.querySelectorAll('a, button, select, input, summary')) {
      if (el.closest('[data-host]')) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || cs.visibility === 'hidden') continue;
      if (el.classList.contains('skip')) continue;
      const inline = cs.display === 'inline';
      out.targets.push({ t: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), inline });
    }
    return out;
  });
}

const report = { contrast: [], small: {}, overflow: [], keyboard: [], errors: [], minContrast: {} };
for (const [sizeName, viewport] of SIZES) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => report.errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
    for (const [name, v, hash, act] of SCREENS) {
      if (only && !name.includes(only)) continue;
      await page.goto(URL0 + '?v=' + v + hash);
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await page.goto('about:blank');
      await page.goto(URL0 + '?v=' + v + hash);
      await page.waitForTimeout(80);
      if (act) { await act(page); await page.waitForTimeout(80); }
      if (!noShots) await page.screenshot({ path: join(SHOTS, `${name}-${sizeName}-${theme}.png`) });
      const a = await audit(page);
      if (a.overflow > 0) report.overflow.push(`${name} ${sizeName} ${theme}: +${a.overflow}px`);
      for (const t of a.texts) {
        const r = ratio(t.fg, t.bg);
        if (r < 4.5) report.contrast.push(`${name} ${sizeName} ${theme}: ${r.toFixed(2)} «${t.t}»`);
        const mk = theme;
        if (!report.minContrast[mk] || r < report.minContrast[mk][0]) report.minContrast[mk] = [+r.toFixed(2), t.t, name];
      }
      if (theme === 'light') {
        const layer = await page.evaluate(() => document.documentElement.getAttribute('data-layer'));
        const min = sizeName === '360' && layer === 'simple' ? 48 : 44;
        for (const t of a.targets) {
          if (t.h < min && !t.inline) {
            const k = `${sizeName}: ${t.t} (${t.w}×${t.h})`;
            report.small[k] = (report.small[k] || 0) + 1;
          }
        }
      }
    }
    // Клавиатура: от загрузки до поля поиска
    for (const v of ['ab', 'v', 'd']) {
      await page.goto('about:blank');
      await page.goto(URL0 + '?v=' + v + '#/');
      let n = 0, onSearch = false;
      for (; n < 4 && !onSearch; ) {
        await page.keyboard.press('Tab'); n++;
        onSearch = await page.evaluate(() => document.activeElement && document.activeElement.id === 'q');
        if (!onSearch) {
          const isSkip = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('skip'));
          if (isSkip) { await page.keyboard.press('Enter'); n++; onSearch = await page.evaluate(() => document.activeElement && document.activeElement.id === 'q'); }
        }
      }
      report.keyboard.push(`${sizeName} ${theme} ${v}: до поиска нажатий ${n}${onSearch ? '' : ' — НЕ ДОШЁЛ'}`);
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(HERE, 'shots', 'report.json'), JSON.stringify(report, null, 1));
console.log('ошибки страницы:', report.errors.length ? report.errors : 'нет');
console.log('прокрутка вбок:', report.overflow.length ? report.overflow : 'нет');
console.log('контраст < 4.5:', report.contrast.length ? report.contrast.slice(0, 40) : 'нет');
console.log('цели меньше нормы:', Object.keys(report.small).length ? Object.entries(report.small).slice(0, 60) : 'нет');
console.log('наименьший контраст текста:', JSON.stringify(report.minContrast));
console.log('клавиатура:', report.keyboard.join('\n  '));
