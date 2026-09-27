/**
 * Набор для проверки интерфейса глазами: сервер сборки, браузер, страница в нужном состоянии, снимки.
 * Им пользовались эксперты рецензии docs/ui-review; им же проверяется каждая правка интерфейса (docs/UI-PROMPT.md).
 *
 *   import { session } from './ui-kit.ts';
 *   const s = await session(4320);                       // у каждого параллельного агента свой порт
 *   try {
 *     const p = await s.page({ width: 1440, height: 900, theme: 'night', intro: false });
 *     await p.goto(s.url('#/david')); await p.waitForTimeout(2000);
 *     await p.screenshot({ path: `${s.shots('card')}/david-1440-night.png` });
 *     await p.screenshot({ path: `${s.shots('card')}/david-mast.png`, clip: { x: 1000, y: 40, width: 440, height: 360 } });
 *   } finally {
 *     await s.close();                                   // гасит браузер и сервер
 *   }
 *
 * Нужна свежая сборка: npm run -s data && npx vite build. Снимки ложатся в .ui-shots/<папка>/ (вне git).
 * Одноразовые сценарии кладите в tools/_<имя>.ts (тоже вне git) и запускайте: npx tsx tools/_<имя>.ts
 * Телефон: { width: 390, height: 844, touch: true }; касание — p.touchscreen.tap(x, y);
 * щипок и протяжка — CDP Input.dispatchTouchEvent через p.context().newCDPSession(p).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

export const SHOTS = join(ROOT, '.ui-shots');

export interface PageOpts {
  width: number;
  height: number;
  theme?: 'night' | 'day';
  /** false — вступительная табличка уже закрыта (вернувшийся читатель); true или не задано — первый визит */
  intro?: boolean;
  /** телефон или планшет: касания и мобильный браузер */
  touch?: boolean;
  dpr?: number;
  reducedMotion?: boolean;
}

/**
 * dist — каталог сборки: у параллельных агентов своя сборка, чтобы не затирать общую dist/.
 * Собрать в свой каталог: npx vite build --outDir .ui-build/<имя>  →  session(порт, { dist: '.ui-build/<имя>' }).
 */
export async function session(port: number, opts: { dist?: string } = {}) {
  const args = ['vite', 'preview', '--port', String(port), '--strictPort'];
  if (opts.dist) args.push('--outDir', opts.dist);
  const server = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors: string[] = [];
  return {
    /** ошибки страницы и консоли за весь сеанс */
    errors,
    url: (hash = '#/') => `http://localhost:${port}/${hash}`,
    shots: (dir: string) => {
      const d = join(SHOTS, dir);
      mkdirSync(d, { recursive: true });
      return d;
    },
    async page(o: PageOpts): Promise<Page> {
      const ctx = await browser.newContext({
        viewport: { width: o.width, height: o.height },
        deviceScaleFactor: o.dpr ?? (o.touch ? 2 : 1),
        isMobile: !!o.touch,
        hasTouch: !!o.touch,
        colorScheme: o.theme === 'day' ? 'light' : 'dark',
        reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference',
      });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      const init: string[] = [];
      if (o.intro === false) init.push(`localStorage.setItem('toledot:intro','true')`);
      if (o.theme) init.push(`localStorage.setItem('toledot:theme', JSON.stringify('${o.theme}'))`);
      if (init.length) await p.addInitScript(init.join(';'));
      return p;
    },
    async close() {
      await browser.close();
      try {
        process.kill(-server.pid!);
      } catch {
        /* уже остановлен */
      }
    },
  };
}
