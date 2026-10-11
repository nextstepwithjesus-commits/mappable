/**
 * П-Т1: скрипт замеров (09 § 7.3, 08 § 9.4). Запуск из корня: `npx tsx prototypes/П-Т1/bench/run.mts [--quick] [--webkit]`.
 * Собирает пробу (vite build), поднимает vite preview и гоняет сценарии в Chromium с замедлением процессора
 * (CDP Emulation.setCPUThrottlingRate) и, если есть, в WebKit (без замедления — у WebKit нет CDP).
 * Итог — prototypes/П-Т1/результаты/<браузер>-<данные>-<окно>-x<замедление>.json и сводка в консоль.
 */
import { build, preview } from 'vite';
import { chromium, webkit, type Browser, type Page, type CDPSession } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'результаты');
mkdirSync(out, { recursive: true });
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const costOnly = args.has('--cost');
const only = new Set((process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? 'real,synth,variants,webkit').split(','));
/** Лица для сценариев: у синтетики — свои номера (s0 — корень главного леса). */
const WHO = { real: { a: 'david', top: 'adam', far: 'iosif-muzh-marii' }, synth: { a: 's1200', top: 's0', far: 's5500' } };
let who = WHO.real;

await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
const srv = await preview({ configFile: join(root, 'vite.config.ts') });
const base = srv.resolvedUrls!.local[0];

type Win = { name: string; w: number; h: number; dpr: number; mobile: boolean };
const WINS: Win[] = [
  { name: '1280', w: 1280, h: 800, dpr: 1, mobile: false },
  { name: '360', w: 360, h: 640, dpr: 2, mobile: true },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = (page: Page, fn: string) => page.evaluate(`(async () => { const p = window.__probe; ${fn} })()`) as Promise<any>;

async function open(browser: Browser, win: Win, q: string, cpu: number) {
  const ctx = await browser.newContext({ viewport: { width: win.w, height: win.h }, deviceScaleFactor: win.dpr, isMobile: win.mobile && browser.browserType().name() === 'chromium', hasTouch: win.mobile });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let cdp: CDPSession | null = null;
  if (browser.browserType().name() === 'chromium') {
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await cdp.send('Performance.enable');
  }
  await page.goto(`${base}?${q}`);
  await page.waitForFunction(() => (window as any).__probe, null, { timeout: 20000 });
  await P(page, 'await p.ready;');
  await sleep(300);
  return { ctx, page, cdp, errors };
}

async function heap(page: Page, cdp: CDPSession | null) {
  if (cdp) {
    const m = (await cdp.send('Performance.getMetrics')).metrics as { name: string; value: number }[];
    const g = (n: string) => m.find((x) => x.name === n)?.value ?? 0;
    return { jsHeapMB: +(g('JSHeapUsedSize') / 2 ** 20).toFixed(1), jsHeapTotalMB: +(g('JSHeapTotalSize') / 2 ** 20).toFixed(1), nodes: g('Nodes') };
  }
  return P(page, 'return p.counters.memory();');
}

/** Прокрутка 2 с: мышь — колесо по диагонали туда и обратно; касание — жест прокрутки CDP (родная прокрутка). */
async function scrollRun(page: Page, cdp: CDPSession | null, win: Win, ms = 2000) {
  await P(page, 'p.counters.startFrames();');
  const t0 = Date.now();
  if (win.mobile && cdp) {
    let dir = 1;
    while (Date.now() - t0 < ms) {
      await cdp.send('Input.synthesizeScrollGesture', { x: win.w / 2, y: win.h / 2, xDistance: -300 * dir, yDistance: -200 * dir, speed: 900, gestureSourceType: 'touch', repeatCount: 1 });
      dir = -dir;
    }
  } else {
    await page.mouse.move(win.w / 2, win.h / 2);
    let i = 0;
    while (Date.now() - t0 < ms) {
      const dir = Math.floor(i / 40) % 2 ? -1 : 1;
      await page.mouse.wheel(30 * dir, 20 * dir);
      await sleep(8);
      i++;
    }
  }
  await sleep(150);
  return P(page, 'return p.counters.stopFrames();');
}

async function pinchRun(page: Page, cdp: CDPSession | null, win: Win, id = who.a) {
  await P(page, `p.setRender('auto'); p.centerOn('${id}', 1);`);
  await sleep(300);
  const g = await P(page, `return p.startAnchor('${id}');`);
  await P(page, 'p.zoomLatency(); p.counters.startFrames();');
  if (cdp) {
    const type = win.mobile ? 'touch' : 'mouse';
    await cdp.send('Input.synthesizePinchGesture', { x: g.x, y: g.y, scaleFactor: 2.2, relativeSpeed: 400, gestureSourceType: type });
    await cdp.send('Input.synthesizePinchGesture', { x: g.x, y: g.y, scaleFactor: win.mobile ? 0.5 : 0.25, relativeSpeed: 400, gestureSourceType: type });
    await cdp.send('Input.synthesizePinchGesture', { x: g.x, y: g.y, scaleFactor: 1.8, relativeSpeed: 400, gestureSourceType: type });
  } else {
    // WebKit: Ctrl + колесо в точке знака
    await page.mouse.move(g.x, g.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, i < 15 ? -8 : 12); await sleep(16); }
    await page.keyboard.up('Control');
  }
  await sleep(200);
  const frames = await P(page, 'return p.counters.stopFrames();');
  const anchor = await P(page, 'const a = p.anchor(); p.stopAnchor(); delete a.log; return a;');
  const latency = await P(page, 'return p.zoomLatency();');
  const k = await P(page, 'return p.state().k;');
  return { frames, anchor, latency, kAfter: k, kMax: 0 };
}

async function buttonsRun(page: Page, id = who.a) {
  await P(page, `p.setRender('auto'); p.centerOn('${id}', 1); p.select('${id}');`);
  await sleep(200);
  await P(page, `p.startAnchor('${id}', true); p.counters.startFrames();`);
  const since = await page.evaluate(() => performance.now());
  for (const id of ['#in', '#in', '#in', '#out', '#out', '#out', '#out', '#out']) { await page.click(id); await sleep(320); }
  const frames = await P(page, 'return p.counters.stopFrames();');
  const anchor = await P(page, 'const a = p.anchor(); p.stopAnchor(); delete a.log; return a;');
  const inp = await P(page, `return p.counters.inp(${since});`);
  return { frames, anchor, inp };
}

async function selectRun(page: Page, win: Win) {
  await P(page, `p.setRender('auto'); p.centerOn('${who.a}', 1);`);
  await sleep(300);
  const since = await page.evaluate(() => performance.now());
  const boxes = await page.$$eval('#labels button[role=treeitem]', (bs) => {
    const v = document.getElementById('vp')!.getBoundingClientRect();
    return bs.map((b) => b.getBoundingClientRect()).filter((r) => r.left > v.left + 4 && r.right < v.right - 4 && r.top > v.top + 4 && r.bottom < v.bottom - 4).map((r) => ({ x: r.left + 4, y: r.top + 6 }));
  });
  const n = boxes.length ? 20 : 0;
  for (let i = 0; i < n; i++) {
    const b = boxes[(i * 7) % boxes.length];
    if (win.mobile) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
    await sleep(120);
  }
  await sleep(200);
  return { clicks: n, ...(await P(page, `return p.counters.inp(${since});`)) };
}

async function keyboardRun(page: Page) {
  await P(page, `p.setRender('auto'); p.centerOn('${who.a}', 1); p.focus('${who.a}');`);
  await sleep(200);
  const since = await page.evaluate(() => performance.now());
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'];
  let ok = 0, visible = 0, moved = 0;
  const fails: string[] = [];
  for (const key of keys) {
    const cur = await P(page, 'return p.focusedId();');
    const dir = key.replace('Arrow', '').toLowerCase();
    const exp = await P(page, `return p.expectStep('${cur}', '${dir}');`);
    await page.keyboard.press(key);
    await sleep(60);
    const got = await P(page, 'return p.focusedId();');
    if (got === exp) ok++; else fails.push(`${cur} ${dir}: ждали ${exp}, фокус ${got}`);
    if (await P(page, `return p.isVisible('${got}');`)) visible++;
    if (got !== cur) moved++;
  }
  // «за краем»: фокус на лицо далеко за окном (09 § 3.2.3 п. 7) — камера подвозит, кнопка строится и получает фокус
  await P(page, `p.centerOn('${who.top}', 1); p.focus('${who.far}');`);
  await sleep(100);
  const far = { focused: await P(page, 'return p.focusedId();'), visible: await P(page, `return p.isVisible('${who.far}');`) };
  return { steps: keys.length, ok, visible, moved, fails, farTarget: far, inp: await P(page, `return p.counters.inp(${since});`) };
}

const results: any[] = [];

/**
 * Кривая цены: длительность кадра с пересборкой слоя от числа отрезков, по способам отрисовки.
 * Масштабы — от вблизи до всего леса; на каждом — svg, svgpath, canvas. Отсюда порог SVG ↔ Canvas.
 */
async function costCurve(browser: Browser, dataset: 'real' | 'synth', win: Win, cpu: number) {
  const tag = `cost-${dataset}-${win.name}-x${cpu}`;
  console.log('→', tag);
  const { ctx, page } = await open(browser, win, `data=${dataset}&twin=1`, cpu);
  const rows: any[] = [];
  for (const k of [1, 0.5, 0.25, 0.12, 0.06, 0.03, 0.015, 0]) {
    for (const at of dataset === 'real' ? ['david', 'adam'] : ['s1200', 's0']) {
      await P(page, k ? `p.centerOn('${at}', ${k});` : 'p.fitAll();');
      await sleep(150);
      for (const r of ['svg', 'svgpath', 'canvas']) rows.push({ k, at, ...(await P(page, `return await p.costStep('${r}');`)) });
      if (!k) break;
    }
  }
  await ctx.close();
  const res = { tag, dataset, window: win.name, cpu, rows };
  writeFileSync(join(out, `${tag}.json`), JSON.stringify(res, null, 1));
  for (const x of rows) console.log(`  k ${x.k} ${x.at} ${x.render.padEnd(8)} отрезков ${String(x.segs).padStart(6)} · сборка ${x.buildMs} мс · кадр ${x.frameMs} (макс ${x.frameMax}) · элементов слоя ${x.elements}`);
}
if (costOnly) {
  const crc = await chromium.launch({ channel: 'chromium' });
  for (const dataset of ['real', 'synth'] as const) for (const win of WINS) for (const cpu of [4, 6]) await costCurve(crc, dataset, win, cpu);
  await crc.close();
  await srv.close();
  process.exit(0);
}
async function config(browser: Browser, bname: string, dataset: 'real' | 'synth', win: Win, cpu: number, full: boolean, extra = '') {
  const tag = `${bname}-${dataset}-${win.name}-x${cpu}${extra ? '-' + extra.replace(/[=&]/g, '_') : ''}`;
  console.log('→', tag);
  who = WHO[dataset];
  const r: any = { tag, browser: bname, version: browser.version(), dataset, window: `${win.w}×${win.h}@${win.dpr}`, cpu, extra };
  // без extra — режим масштаба «rebuild» (так сняты первые замеры); zoom=css — явным extra
  const { ctx, page, cdp, errors } = await open(browser, win, `data=${dataset}&${extra || 'zoom=rebuild'}`, cpu);
  r.load = { ...(await P(page, 'return p.state();')), dom: await P(page, 'return p.dom();'), heap: await heap(page, cdp) };
  // кадры прокрутки по способам отрисовки и масштабам: где SVG перестаёт держать кадр
  r.scroll = [];
  const ks = quick ? [1, 0.25, 0] : win.mobile ? [1, 0.5, 0.25, 0.12, 0] : [1, 0.5, 0.25, 0.12, 0.06, 0];
  const renders = full ? ['svg', 'svgpath', 'canvas'] : ['svgpath', 'canvas'];
  for (const k of ks) for (const rr of renders) {
    await P(page, `p.setRender('${rr}'); ${k ? `p.centerOn('${who.a}', ${k});` : 'p.fitAll();'}`);
    await sleep(250);
    const f = await scrollRun(page, cdp, win, quick ? 1200 : 2000);
    const st = await P(page, 'return p.state();');
    const row: any = { k: k || +st.k.toFixed(3), render: rr, ...f, segs: st.last.segs, labels: st.last.labels, layerElements: st.last.elements, buildMs: +st.last.buildMs.toFixed(1), builds: st.last.builds, canvasMB: +st.last.canvasMB.toFixed(1), dom: await P(page, 'return p.dom();') };
    // щипок на этом масштабе: пересборка слоя на каждом кадре — самый тяжёлый случай для способа отрисовки
    if (cdp && k && k <= 0.25 && !quick) {
      await P(page, `p.centerOn('${who.a}', ${k});`);
      await sleep(200);
      const v = await page.evaluate(() => { const r = document.getElementById('vp')!.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
      await P(page, 'p.zoomLatency(); p.counters.startFrames();');
      const type = win.mobile ? 'touch' : 'mouse';
      await cdp.send('Input.synthesizePinchGesture', { x: v.x, y: v.y, scaleFactor: 0.6, relativeSpeed: 400, gestureSourceType: type });
      await cdp.send('Input.synthesizePinchGesture', { x: v.x, y: v.y, scaleFactor: 1.6, relativeSpeed: 400, gestureSourceType: type });
      await sleep(150);
      const pf = await P(page, 'return p.counters.stopFrames();');
      const pst = await P(page, 'return p.state();');
      row.pinch = { ...pf, latency: await P(page, 'return p.zoomLatency();'), segsEnd: pst.last.segs, buildMsEnd: +pst.last.buildMs.toFixed(1) };
    }
    r.scroll.push(row);
  }
  await P(page, `p.setRender('auto');`);
  r.pinch = await pinchRun(page, cdp, win);
  r.buttons = await buttonsRun(page);
  r.select = await selectRun(page, win);
  r.keyboard = await keyboardRun(page);
  // память: весь лес в окне (Canvas), затем после всех сценариев
  await P(page, `p.setRender('auto'); p.fitAll();`);
  await sleep(300);
  r.memory = { fitAll: await heap(page, cdp), dom: await P(page, 'return p.dom();'), state: (await P(page, 'return p.state().last;')) };
  // текст 200 %: пересчёт мест от новой ширины подписей
  if (full || dataset === 'real') {
    const rl = await P(page, 'return await p.relayout(2);');
    await P(page, `p.setRender('auto'); p.centerOn('${who.a}', 1);`);
    await sleep(200);
    const f = await scrollRun(page, cdp, win, 1500);
    const st = await P(page, 'return p.state();');
    r.text200 = { relayoutMs: +rl.ms.toFixed(1), worker: rl.worker, geomW: Math.round(st.geomW), geomH: Math.round(st.geomH), scroll: { ...f, render: st.renderer, segs: st.last.segs, labels: st.last.labels }, dom: await P(page, 'return p.dom();'), heap: await heap(page, cdp) };
    r.text200.pinch = await pinchRun(page, cdp, win);
  }
  r.errors = errors;
  await ctx.close();
  results.push(r);
  writeFileSync(join(out, `${tag}.json`), JSON.stringify(r, null, 1));
}

async function variants(browser: Browser, win: Win, cpu: number) {
  // сравнение: «липкий» слой по 09 § 3.2.2 и сдвиг transform против плитки внутри прокрутки
  for (const q of ['layer=sticky&render=svgpath', 'pan=transform&render=svgpath', 'layer=sticky&render=canvas']) {
    const tag = `chromium-real-${win.name}-x${cpu}-${q.replace(/[=&]/g, '_')}`;
    console.log('→', tag);
    const { ctx, page, cdp } = await open(browser, win, q, cpu);
    const rows: any[] = [];
    for (const k of win.mobile ? [1, 0.25] : [1, 0.25, 0.12]) {
      await P(page, `p.centerOn('david', ${k});`);
      await sleep(250);
      // в режиме transform родной прокрутки нет: только колесо (касание здесь — свой код)
      const f = q.startsWith('pan') ? await scrollRun(page, null, { ...win, mobile: false }) : await scrollRun(page, cdp, win);
      const st = await P(page, 'return p.state();');
      rows.push({ k, ...f, builds: st.last.builds, buildMs: +st.last.buildMs.toFixed(1), segs: st.last.segs });
    }
    const r = { tag, variant: q, window: win.name, cpu, rows };
    results.push(r);
    writeFileSync(join(out, `${tag}.json`), JSON.stringify(r, null, 1));
    await ctx.close();
  }
}

const cr = await chromium.launch({ channel: 'chromium' });
try {
  if (quick) {
    await config(cr, 'chromium', 'real', WINS[1], 4, true);
  } else {
    if (only.has('real')) for (const win of WINS) for (const cpu of [1, 4, 6]) await config(cr, 'chromium', 'real', win, cpu, true);
    if (only.has('synth')) for (const win of WINS) for (const cpu of [4, 6]) await config(cr, 'chromium', 'synth', win, cpu, false);
    if (only.has('variants')) for (const win of WINS) await variants(cr, win, 4);
    if (only.has('zoomcss')) for (const win of WINS) for (const cpu of [4, 6]) await config(cr, 'chromium', 'real', win, cpu, false, 'zoom=css');
    if (only.has('synthcss')) for (const win of WINS) for (const cpu of [4, 6]) await config(cr, 'chromium', 'synth', win, cpu, false, 'zoom=css');
  }
} finally { await cr.close(); }
if (args.has('--webkit') || (!quick && only.has('webkit'))) {
  try {
    // если версия WebKit, нужная Playwright, не скачана — берём установленную рядом (без скачивания)
    const cache = join(homedir(), 'Library/Caches/ms-playwright');
    const local = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('webkit-')).sort().map((d) => join(cache, d, 'pw_run.sh')).filter(existsSync).pop() : undefined;
    const wk = await webkit.launch().catch(() => webkit.launch({ executablePath: local }));
    for (const win of WINS) await config(wk, 'webkit', 'real', win, 1, false, 'zoom=css');
    await wk.close();
  } catch (e) { console.log('WebKit не запустился:', (e as Error).message); }
}
await srv.close();

// сводка
for (const r of results) {
  if (!r.load) { console.log(r.tag, r.rows.map((x: any) => `k${x.k}: пропуск ${(x.droppedShare * 100).toFixed(1)}% · долгих ${x.longTasks}`).join(' | ')); continue; }
  console.log(`\n${r.tag}: первая раскладка ${r.load.timings.firstFrameFromRequest.toFixed(0)} мс · DOM ${r.load.dom.rendered}/${r.load.dom.total} · куча ${JSON.stringify(r.load.heap)}`);
  for (const s of r.scroll) console.log(`  k ${s.k} ${s.render.padEnd(8)} отрезков ${String(s.segs).padStart(5)} · пропуск ${(s.droppedShare * 100).toFixed(1)}% · p95 ${s.p95ms.toFixed(1)} мс · долгих ${s.longTasks} (${s.longestTask.toFixed(0)} мс) · сборка ${s.buildMs} мс · DOM ${s.dom.rendered}${s.pinch ? ` | щипок: пропуск ${(s.pinch.droppedShare * 100).toFixed(1)}% · долгих ${s.pinch.longTasks} · ответ p75 ${s.pinch.latency.p75.toFixed(0)} мс · сборка ${s.pinch.buildMsEnd} мс` : ''}`);
  console.log(`  щипок: якорь ${r.pinch.anchor.maxFocal.toFixed(2)} px (знак ${r.pinch.anchor.maxGlyph.toFixed(2)}) за ${r.pinch.anchor.steps} шагов · пропуск ${(r.pinch.frames.droppedShare * 100).toFixed(1)}% · ответ p75 ${r.pinch.latency.p75.toFixed(1)} мс`);
  console.log(`  кнопки: якорь ${r.buttons.anchor.maxFocal.toFixed(2)} px · INP ${r.buttons.inp.p75.toFixed(0)}/${r.buttons.inp.max.toFixed(0)} · выбор INP p75 ${r.select.inp?.toFixed?.(0) ?? r.select.p75.toFixed(0)} max ${r.select.max.toFixed(0)} · клавиши ${r.keyboard.ok}/${r.keyboard.steps}, видно ${r.keyboard.visible}, за краем ${JSON.stringify(r.keyboard.farTarget)} INP ${r.keyboard.inp.p75.toFixed(0)}`);
  if (r.text200) console.log(`  200 %: пересчёт ${r.text200.relayoutMs} мс · ${r.text200.geomW}×${r.text200.geomH} · пропуск ${(r.text200.scroll.droppedShare * 100).toFixed(1)}% · якорь ${r.text200.pinch.anchor.maxFocal.toFixed(2)} · DOM ${r.text200.dom.rendered}/${r.text200.dom.total}`);
  console.log(`  весь лес: ${JSON.stringify(r.memory)}`);
  if (r.errors.length) console.log('  ошибки:', r.errors);
}
