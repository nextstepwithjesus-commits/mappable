/**
 * Сценарии приёмки этапа 19 (docs/ui-review/STAGE19.md; значимые замечания внешнего аудита 5 октября), номера 1300–1319:
 *  — 1300 И-02: после щипка двумя пальцами оставшийся палец тянет небо дальше — без нового касания;
 *  — 1301 И-01: протяжка, вернувшаяся к точке нажатия, — не щелчок: выбор лица не снимается.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { open } from './unify11.ts';

const PHONE = { width: 390, height: 844, touch: true };
const hashId = (p: Page) => decodeURIComponent(new URL(p.url()).hash.replace(/^#\/?/, '').split(/[?~]/)[0]);
/** Год середины окна из адреса (поле «y»; пишется через 300 мс после остановки неба). */
const yearNow = (p: Page) => p.evaluate(() => Number(/~y(-?\d+)/.exec(decodeURIComponent(location.hash))?.[1] ?? NaN));

export const s19: Scenario[] = [
  {
    n: 1300,
    title: 'Аудит И-02: щипок, один палец поднят — оставшийся палец двигает небо без нового касания',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/~y-1000~w300~l0~s1', { ms: 3500 });
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height * 0.4;
      const cdp = await p.context().newCDPSession(p);
      const t0 = Date.now() / 1000;
      const two = (d: number) => [
        { x: cx - d / 2, y: cy, id: 1 },
        { x: cx + d / 2, y: cy, id: 2 },
      ];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(80), timestamp: t0 });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(80 + i * 10), timestamp: t0 + i * 0.03 });
      // поднят второй палец (в touchEnd — отпущенная точка), первый остался на экране
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx + 70, y: cy, id: 2 }], timestamp: t0 + 0.25 });
      await p.waitForTimeout(900);
      const y1 = await yearNow(p);
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 70 + i * 20, y: cy, id: 1 }], timestamp: t0 + 1.2 + i * 0.03 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 1.6 });
      await cdp.detach();
      await p.waitForTimeout(1400);
      const y2 = await yearNow(p);
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) return fail(`в адресе нет года окна: ${p.url()}`);
      // палец ушёл вправо на 160 px — небо сдвинулось вправо: середина окна — раньше по времени
      return y2 < y1 - 10 ? pass(`середина окна: ${y1} → ${y2}`) : fail(`оставшийся палец не сдвинул небо: ${y1} → ${y2}`);
    },
  },
  {
    n: 1301,
    title: 'Аудит И-01: протяжка от пустого места неба на 120 px и обратно к точке нажатия не снимает выбор Давида',
    run: async (p) => {
      await open(p, '#/david', { ms: 4500 });
      if (hashId(p) !== 'david') return fail(`выбран «${hashId(p)}»`);
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      // пустое место неба: правый нижний угол открытой части, над органами неба
      const x = box.x + box.width * 0.55;
      const y = box.y + box.height * 0.93;
      await p.mouse.move(x, y);
      await p.mouse.down();
      for (let i = 1; i <= 6; i++) await p.mouse.move(x + i * 20, y, { steps: 2 });
      for (let i = 5; i >= 0; i--) await p.mouse.move(x + i * 20, y, { steps: 2 });
      await p.mouse.up();
      await p.waitForTimeout(1200);
      return hashId(p) === 'david' ? pass('Давид остался выбранным') : fail(`после протяжки «туда и обратно» выбран «${hashId(p) || 'никто'}»`);
    },
  },
];
