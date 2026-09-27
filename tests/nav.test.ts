/**
 * Навигация этапа 3 без браузера: мышь и тачпад (D1), порог щелчка (D3), адрес (D8), «]» после «[» (D10),
 * ползунок полосы времени (D12), строки результатов поиска (D9), таблица клавиш (D10).
 * Поведение в браузере — сценарии 50–63 в tools/accept/nav.ts. Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect } from 'vitest';
import { byId } from '../src/data/atlas.ts';
import { classifyWheel, wheelNotches, wheelPixels, isClick, childFor, CLICK_SLOP, type WheelSample } from '../src/ui/sky/input.ts';
import { parseAddress, formatAddress, nearIds } from '../src/ui/address.ts';
import { sliderStep, stripCursor, frameGrip } from '../src/ui/TimeStrip.tsx';
import { resultBlocks } from '../src/ui/top/Search.tsx';
import { searchIndex } from '../src/ui/top/searchIndex.ts';
import { KEY_ROWS, POINTER_ROWS } from '../src/ui/top/Keys.tsx';

const w = (o: Partial<WheelSample>): WheelSample => ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, shiftKey: false, t: 0, ...o });

describe('колесо мыши и тачпад (D1; IX-01)', () => {
  it('колесо мыши: строки или страницы, шаг Chrome на macOS, крупный целый шаг', () => {
    expect(classifyWheel(w({ deltaMode: 1, deltaY: 3 }), null)).toBe('mouse');
    expect(classifyWheel(w({ deltaMode: 2, deltaY: 1 }), null)).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 4.000244140625 * 25 }), null)).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 100 }), null)).toBe('mouse');
    expect(classifyWheel(w({ deltaY: -120 }), null)).toBe('mouse');
    // Shift + колесо на Windows приходит сдвигом по x
    expect(classifyWheel(w({ deltaX: 100, shiftKey: true }), null)).toBe('mouse');
  });
  it('тачпад: мелкий или дробный шаг, сдвиг по x; щипок — ctrlKey с мелким шагом; Ctrl + колесо мыши — колесо', () => {
    expect(classifyWheel(w({ deltaY: 1.5 }), null)).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: -12 }), null)).toBe('trackpad');
    expect(classifyWheel(w({ deltaX: 7, deltaY: 2 }), null)).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: -3.2, ctrlKey: true }), null)).toBe('pinch');
    expect(classifyWheel(w({ deltaY: 100, ctrlKey: true }), null)).toBe('mouse');
  });
  it('один жест — один вид: инерция тачпада с крупным шагом остаётся тачпадом', () => {
    const first = classifyWheel(w({ deltaY: 4, t: 0 }), null);
    expect(first).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: 120, t: 40 }), { t: 0, kind: first })).toBe('trackpad');
    // после паузы — новый жест
    expect(classifyWheel(w({ deltaY: 120, t: 900 }), { t: 0, kind: first })).toBe('mouse');
  });
  it('строки и страницы — в пиксели; щелчок колеса — 100 px, крупный шаг — не меньше щелчка, не больше трёх', () => {
    expect(wheelPixels(3, 1, 700)).toBeCloseTo(100);
    expect(wheelPixels(1, 2, 700)).toBe(700);
    expect(wheelPixels(53, 0, 700)).toBe(53);
    expect(wheelNotches(100)).toBe(1);
    expect(wheelNotches(53)).toBe(1);
    expect(wheelNotches(-240)).toBeCloseTo(2.4);
    expect(wheelNotches(1000)).toBe(3);
    expect(wheelNotches(4.000244140625)).toBeCloseTo(0.04);
  });
});

describe('порог щелчка по типу указателя (D3; IX-10, MOB-09)', () => {
  it('мышь 5 px, перо 6, палец 10', () => {
    expect(CLICK_SLOP).toMatchObject({ mouse: 5, pen: 6, touch: 10 });
    expect(isClick(4, 400, 'mouse')).toBe(true);
    expect(isClick(5.5, 400, 'mouse')).toBe(false);
    expect(isClick(5.5, 400, 'pen')).toBe(true);
    expect(isClick(9, 400, 'touch')).toBe(true);
    expect(isClick(11, 400, 'touch')).toBe(false);
  });
  it('быстрое отпускание со смещением до 8 px — щелчок', () => {
    expect(isClick(7, 150, 'mouse')).toBe(true);
    expect(isClick(9, 150, 'mouse')).toBe(false);
  });
});

describe('адрес хранит вид (D8; IX-43, IX-44, UX-30)', () => {
  const has = (id: string) => byId.has(id);
  it('лицо, окно, панель, пара, масштаб, модель и режимы — туда и обратно', () => {
    const a = { id: 'david', view: { year: -1010, width: 240, lane: 2.46 }, panel: 'epochs' as const, second: 'ioav', first: 'saruiya', scale: 0 as const, model: 'mt-short', only: true, tiers: true };
    const s = formatAddress(a);
    expect(s).toBe('#/david~y-1010~w240~l2.5~pepochs~asaruiya~bioav~s0~mmt-short~o1~e1');
    const b = parseAddress(s, has);
    expect(b).toMatchObject({ route: 'atlas', id: 'david', full: true, panel: 'epochs', first: 'saruiya', second: 'ioav', scale: 0, model: 'mt-short', only: true, tiers: true });
    expect(b.view).toEqual({ year: -1010, width: 240, lane: 2.5 });
  });
  it('только буквы, цифры и «. _ ~ -» после «#/» — ограничение опубликованной версии', () => {
    for (const s of [
      formatAddress({ id: 'iosif-muzh-marii', view: { year: 30, width: 21.4, lane: -3.04 }, scale: 1, model: 'mt-long' }),
      formatAddress({ id: null, view: { year: -4000, width: 6000, lane: -12 }, scale: 1, model: 'lxx' }),
    ])
      expect(s).toMatch(/^#\/[A-Za-z0-9._~-]*$/);
  });
  it('прежние адреса: «#/david», «#/moisey?v=abc», «#/»; образец', () => {
    expect(parseAddress('#/david', has)).toMatchObject({ id: 'david', full: false });
    expect(parseAddress('#/david', has).view).toBeUndefined();
    expect(parseAddress('#/moisey?v=abc', has)).toMatchObject({ id: 'moisey', full: false });
    expect(parseAddress('#/', has)).toMatchObject({ id: null, full: false });
    expect(parseAddress('', has)).toMatchObject({ id: null });
    expect(parseAddress('#/specimen', has).route).toBe('specimen');
  });
  it('несуществующее лицо — отмечено, с похожими адресами; испорченные поля пропускаются', () => {
    const a = parseAddress('#/davdi~y12x~wabc~l3~pnope~bnobody~s7', has);
    expect(a.id).toBe(null);
    expect(a.bad).toBe('davdi');
    expect(a.view).toBeUndefined();
    expect(a.panel).toBeUndefined();
    expect(a.second).toBeUndefined();
    expect(a.scale).toBeUndefined();
    expect(nearIds('davdi')).toContain('david');
    // окно без одного из трёх полей не читается; нулевого года нет
    expect(parseAddress('#/david~y-1010~w240', has).view).toBeUndefined();
    expect(parseAddress('#/david~y0~w240~l1', has).view).toBeUndefined();
  });
});

describe('«]» возвращает туда, откуда пришли по «[» (D10; IX-40)', () => {
  it('путь подъёма: Давид → «[» Иессей → «]» Давид, а не Елиав', () => {
    expect(byId.get('david')?.father).toBe('iessey');
    expect(childFor('iessey', ['david'])).toEqual({ to: 'david', path: [] });
  });
  it('без пути — ребёнок на линии Мессии; путь, ушедший в сторону, забывается', () => {
    expect(childFor('iessey', []).to).toBe('david');
    const r = childFor('iessey', ['ioav']);
    expect(r.to).toBe('david');
    expect(r.path).toEqual([]);
  });
});

describe('полоса времени (D12; IX-32, IX-33, MOB-35)', () => {
  it('курсоры: края — ew-resize, рамка — grab (при протяжке — grabbing), вне рамки — pointer', () => {
    expect(stripCursor(frameGrip(690, 700, 900), false)).toBe('ew-resize');
    expect(stripCursor(frameGrip(800, 700, 900), false)).toBe('grab');
    expect(stripCursor(frameGrip(800, 700, 900), true)).toBe('grabbing');
    expect(stripCursor(frameGrip(500, 700, 900), false)).toBe('pointer');
    // у узкой рамки ручки — снаружи
    expect(stripCursor(frameGrip(690, 700, 732), false)).toBe('ew-resize');
  });
  it('ползунок: стрелки на 10 %, Shift и PageUp/PageDown — на 40 %, Home и End — к краям; ширина не меняется', () => {
    expect(sliderStep('ArrowRight', false, 0, 100, -4000, 2040)).toEqual([10, 110]);
    expect(sliderStep('ArrowLeft', true, 0, 100, -4000, 2040)).toEqual([-40, 60]);
    expect(sliderStep('PageDown', false, 0, 100, -4000, 2040)).toEqual([40, 140]);
    expect(sliderStep('Home', false, 0, 100, -4000, 2040)).toEqual([-4000, -3900]);
    expect(sliderStep('End', false, 0, 100, -4000, 2040)).toEqual([1940, 2040]);
    expect(sliderStep('ArrowRight', false, 1950, 2040, -4000, 2040)).toEqual([1950, 2040]);
    expect(sliderStep('KeyA', false, 0, 100, -4000, 2040)).toBe(null);
  });
});

describe('строки результатов поиска (D9; UX-01, IX-19)', () => {
  it('«Иисус»: «Все N на небе» первой строкой, Христос и Навин — отдельно, одноимённые — группой', () => {
    const hits = searchIndex.search('Иисус', 60);
    const blocks = resultBlocks(hits, { pinned: false, noAll: false });
    expect(blocks[0].rows[0].kind).toBe('all');
    const persons = blocks.flatMap((b) => b.rows).filter((r) => r.kind === 'person');
    expect(persons[0]).toMatchObject({ id: 'iisus', grouped: false });
    expect(persons.slice(0, 3).map((r) => (r.kind === 'person' ? r.id : ''))).toContain('iisus-navin');
    const g = blocks.find((b) => b.head?.startsWith('Иисус —'));
    expect(g?.head).toMatch(/^Иисус — \d+ лиц/);
    expect(g!.rows.every((r) => r.kind === 'person' && r.grouped && byId.get(r.id)?.name === 'Иисус')).toBe(true);
  });
  it('в режиме выбора второго лица и при отметках — без «Все N»; при отметках — «Снять отметки»', () => {
    const hits = searchIndex.search('иосиф', 60);
    expect(resultBlocks(hits, { pinned: false, noAll: true })[0].rows[0].kind).toBe('person');
    expect(resultBlocks(hits, { pinned: true, noAll: false })[0].rows[0].kind).toBe('unpin');
  });
  it('традиционное именование — подписью «в Синодальном переводе — …», опечатка — «Возможно, вы искали»', () => {
    const t = resultBlocks(searchIndex.search('Богородица'), { pinned: false, noAll: false });
    expect(t[0].head).toBe('«Богородица»: в Синодальном переводе — Мария, Мать Иисуса');
    const f = resultBlocks(searchIndex.search('Навуходонасор'), { pinned: false, noAll: false });
    expect(f[0].head).toBe('Возможно, вы искали');
  });
});

describe('таблица клавиш обеих раскладок (D10; IX-41, UX-40)', () => {
  it('у каждой буквенной клавиши есть надпись русской раскладки', () => {
    for (const r of KEY_ROWS) for (const k of r.keys) if (/^[A-Z[\],./]$/.test(k.en) && k.en !== '?') expect(k.ru, `${k.en}: ${r.what}`).toBeTruthy();
    const ru = Object.fromEntries(KEY_ROWS.flatMap((r) => r.keys).map((k) => [k.en, k.ru]));
    expect(ru).toMatchObject({ '/': '.', '[': 'х', ']': 'ъ', ',': 'б', '.': 'ю', J: 'о', K: 'л', E: 'у', L: 'д' });
  });
  it('в строках нет «·» и стрелок «→», у каждого действия — текст', () => {
    for (const r of [...KEY_ROWS.map((x) => x.what), ...POINTER_ROWS.flatMap((x) => [x.how, x.what])]) {
      expect(r.trim().length).toBeGreaterThan(2);
      expect(r).not.toMatch(/[·→]/);
    }
  });
});
