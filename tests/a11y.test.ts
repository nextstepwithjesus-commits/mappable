/**
 * Клавиатура и экранный диктор (этап 6: I1–I3; MOB-28–38, IX-29, IX-39, VIS-16) без браузера: к какой звезде ведёт
 * стрелка, с какой звезды начинается фокус на небе, строка окна неба для диктора, таблица клавиш, модальный лист панели
 * на телефоне, заголовок панели для фокуса. Поведение в браузере (U9, ТЗ § 11.2 п. 10) — сценарии 170–184
 * в tools/accept/a11y.ts; axe с wcag22aa на столе, телефоне и планшете — tools/a11y.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { arrowDir, nearestInDirection, startStar, type StarPoint } from '../src/ui/sky/starnav.ts';
import { windowText, SKY_HELP } from '../src/ui/sky/SkyA11y.tsx';
import { modalOnPhone } from '../src/ui/focus.ts';
import { KEY_ROWS, KeysTable } from '../src/ui/top/Keys.tsx';
import { Sheet } from '../src/ui/panels/Sheet.tsx';
import { toAstro } from '../src/engine/years.ts';
import { epochs } from '../src/data/atlas.ts';

const NBSP = ' ';
const flat = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === NBSP ? ' ' : ''));
const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('стрелка на небе — к ближайшей звезде в эту сторону (I1; IX-39)', () => {
  // звёзды: две в той же полосе справа (ближняя и дальняя), одна чуть ниже и совсем рядом, одна сверху, одна слева
  const stars: StarPoint[] = [
    { id: 'me', x: 100, y: 100 },
    { id: 'lane-near', x: 160, y: 100 },
    { id: 'lane-far', x: 400, y: 102 },
    { id: 'below-close', x: 115, y: 130 },
    { id: 'up', x: 104, y: 40 },
    { id: 'left', x: 20, y: 96 },
  ];
  const from = stars[0];
  it('вправо — соседняя звезда своей полосы, а не более близкая, но на другой высоте', () => {
    expect(nearestInDirection(from, stars, 'right', 'me')).toBe('lane-near');
  });
  it('вверх, вниз и влево — по своим сторонам; сама звезда не выбирается', () => {
    expect(nearestInDirection(from, stars, 'up', 'me')).toBe('up');
    expect(nearestInDirection(from, stars, 'down', 'me')).toBe('below-close');
    expect(nearestInDirection(from, stars, 'left', 'me')).toBe('left');
  });
  it('сначала — конус ±45°; вне конуса — только если в нём никого нет', () => {
    const only = [from, { id: 'diag', x: 130, y: 190 }];
    // вправо: звезда ниже и правее (вне конуса) — лучше, чем ничего
    expect(nearestInDirection(from, only, 'right', 'me')).toBe('diag');
    // вниз: она же — в конусе
    expect(nearestInDirection(from, only, 'down', 'me')).toBe('diag');
  });
  it('впереди никого — фокус остаётся (null); звезда в том же году не «правее»', () => {
    expect(nearestInDirection(from, [from, { id: 'same-x', x: 100, y: 180 }], 'right', 'me')).toBeNull();
    expect(nearestInDirection({ x: 0, y: 0 }, [], 'left')).toBeNull();
  });
  it('стрелки — по физическим клавишам (KeyboardEvent.code)', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA'].map(arrowDir)).toEqual(['left', 'right', 'up', 'down', null]);
  });
});

describe('фокус пришёл на небо: с какой звезды начать (I1; MOB-30)', () => {
  const shown = [
    { id: 'bright-far', x: 700, y: 300, mag: 0 },
    { id: 'dim-center', x: 505, y: 305, mag: 5 },
    { id: 'mid', x: 540, y: 320, mag: 1 },
  ];
  it('выбранное лицо на виду — оно; иначе прежняя звезда с фокусом', () => {
    expect(startStar(shown, { x: 500, y: 300 }, [null, 'bright-far'])).toBe('bright-far');
    expect(startStar(shown, { x: 500, y: 300 }, ['gone', null, 'mid'])).toBe('mid');
  });
  it('без выбора — яркая звезда у середины: ступень величины «стоит» 80 px', () => {
    expect(startStar(shown, { x: 500, y: 300 })).toBe('mid');
    expect(startStar([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('окно неба для диктора (I3; MOB-34)', () => {
  const united = epochs.filter((e) => e.id === 'united');
  it('годы по краям, округлённые наружу, эпоха и число лиц', () => {
    const t = flat(windowText(toAstro(-1043), toAstro(-982), united, 14));
    expect(t).toBe('На карте 1045–980 гг. до Р. Х., эпоха «Единое царство»; видно 14 лиц.');
  });
  it('несколько эпох — перечнем, больше трёх — «от … до …»; склонение числа лиц', () => {
    const two = epochs.filter((e) => e.id === 'judges' || e.id === 'united');
    expect(flat(windowText(toAstro(-1100), toAstro(-1000), two, 1))).toContain('эпохи «Судьи», «Единое царство»; видно 1 лицо.');
    const all = flat(windowText(toAstro(-4174), 100, epochs, 62));
    expect(all).toContain('эпохи от «Первый мир» до «Апостольская Церковь»; видно 62 лица.');
    expect(all).toMatch(/^На карте 4200 г\. до Р\. Х\. — 100 г\. по Р\. Х\./);
    expect(flat(windowText(toAstro(-500), toAstro(-490), [], 0))).toBe('На карте 500–490 гг. до Р. Х.; звёзд не видно.');
  });
  it('нулевого года нет: окно у Рождества — «5 г. до Р. Х. — 10 г. по Р. Х.»', () => {
    expect(flat(windowText(toAstro(-3), 8, [], 3))).toMatch(/^На карте 5 г\. до Р\. Х\. — 10 г\. по Р\. Х\.; видно 3 лица\.$/);
  });
  it('описание холста называет клавиши неба', () => {
    expect(SKY_HELP).toMatch(/Стрелки — к ближайшей звезде/);
    expect(SKY_HELP).toMatch(/Shift со стрелками — сдвиг неба/);
    expect(SKY_HELP).toMatch(/Enter — открыть карточку/);
  });
});

describe('таблица клавиш: стрелки на небе и Shift (I1; IX-41)', () => {
  it('стрелки — фокус по звёздам, с Shift — сдвиг; Enter — карточка и фокус на заголовке', () => {
    const plain = KEY_ROWS.find((r) => r.keys.some((k) => k.en === '←') && !r.mod);
    const shift = KEY_ROWS.find((r) => r.keys.some((k) => k.en === '←') && r.mod === 'Shift');
    const enter = KEY_ROWS.find((r) => r.keys.some((k) => k.en === 'Enter'));
    expect(plain?.what).toMatch(/к ближайшей звезде/);
    expect(shift?.what).toBe('сдвинуть небо');
    expect(enter?.what).toMatch(/заголовок карточки/);
    expect(KEY_ROWS.find((r) => r.keys.some((k) => k.en === 'Esc'))?.what).toMatch(/фокус возвращается/);
  });
  it('клавиша-модификатор набрана своей клавишей: «Shift + ← → ↑ ↓»', () => {
    const out = renderToString(h(KeysTable, {}) as VNode);
    expect(out).toMatch(/<kbd>Shift<\/kbd>[\u00a0 ]\+ <kbd>←<\/kbd>/);
  });
});

describe('панели и телефон (I2; MOB-32, IX-29)', () => {
  it('заголовок панели принимает фокус и называет область', () => {
    const out = renderToString(h(Sheet, { title: 'Сквозной раздел', children: null }) as VNode);
    const id = /aria-labelledby="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toMatch(new RegExp(`<h2 id="${id}" tabindex="-1">Сквозной раздел</h2>`));
    expect(id).toMatch(/^sheet-h-[\p{L}\p{N}-]+$/u);
  });
  it('на телефоне модальны полноэкранные панели; «Эпохи» (лист на 55 %) и «Вид» (лист в небе) — нет', () => {
    for (const p of ['index', 'kinship', 'synopsis', 'chapter', 'section', 'legend', 'about', 'spread'] as const) expect(modalOnPhone(p)).toBe(true);
    expect(modalOnPhone('epochs')).toBe(false);
    expect(modalOnPhone('view')).toBe(false);
    expect(modalOnPhone(null)).toBe(false);
  });
});

describe('семантика страницы (I3; MOB-37)', () => {
  it('main вокруг неба не занимает ячейку сетки; прежний список лиц неба не показывается', () => {
    const c = css('panels.css');
    expect(c).toMatch(/\.app-main\s*\{\s*display:\s*contents;/);
    // прежний скрытый список из 40 кнопок удалён: одна остановка Tab — холст, звёзды — через aria-activedescendant (SkyA11y)
    const sky = readFileSync(join(__dirname, '../src/ui/SkyView.tsx'), 'utf8');
    expect(sky).not.toContain('Видимые на карте ключевые лица');
    expect(sky).toMatch(/<SkyA11y \/>/);
  });
});
