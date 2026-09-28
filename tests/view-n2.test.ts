/**
 * Древо в приложении (решение 73; задача N2): переключатель «Небо | Древо», поле адреса «t1», начала и «Начать заново» в
 * древе, вступление древа, строка «Раскрыто N лиц» у кромки древа, тексты «Условных знаков», «О карте» и «Клавиш».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { atlasView, opened, start, startWith, STARTS } from '../src/ui/reveal.ts';
import { skyMode, workSet } from '../src/ui/work.ts';
import { selected } from '../src/state.ts';
import { introOpen } from '../src/ui/sky/view.ts';
import { VIEWS, ViewSwitch, openStarts, showView, startsFocus, viewOpen, viewPlan } from '../src/ui/sky/Controls.tsx';
import { Cartouche, ReadingGuide, TreeBars } from '../src/ui/sky/Overlays.tsx';
import { formatAddress, parseAddress } from '../src/ui/address.ts';
import { KeysTable, TREE_KEY_ROWS, TREE_POINTER_ROWS } from '../src/ui/top/Keys.tsx';
import { phoneMenuItems } from '../src/ui/top/TopBar.tsx';

const flat = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\u2060/g, '');
const html = (v: VNode) => flat(renderToString(v).replace(/&nbsp;|&#160;/g, ' '));
const text = (v: VNode) => html(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const src = (f: string) => flat(readFileSync(join(__dirname, '..', f), 'utf8')).replace(/\s+/g, ' ');
const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

beforeEach(() => {
  atlasView.value = 'sky';
  introOpen.value = false;
  viewOpen.value = false;
  startsFocus.value = false;
  selected.value = null;
});

describe('переключатель «Небо | Древо» (решение 73)', () => {
  it('два вида с пояснением; нажат нынешний', () => {
    expect(VIEWS.map((v) => v.label)).toEqual(['Небо', 'Древо']);
    for (const v of VIEWS) {
      expect(v.hint, v.value).toMatch(/^[А-ЯЁ]/);
      expect(v.hint, v.value).not.toMatch(/[·→]/);
    }
    atlasView.value = 'tree';
    const out = html(h(ViewSwitch, {}) as VNode);
    expect(out).toMatch(/role="group" aria-label="Вид атласа"/);
    expect(out).toMatch(/aria-pressed="false"[^>]*>Небо</);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Древо</);
  });
  it('«Небо» — те же раскрытые лица на небе «набор»; при начале «Всё небо» небо остаётся каким было', () => {
    expect(viewPlan('sky', { start: 'adam', set: 6, selected: null })).toEqual({ mode: 'work' });
    expect(viewPlan('sky', { start: 'all', set: 6, selected: null })).toEqual({});
    expect(viewPlan('sky', { start: 'adam', set: 0, selected: null })).toEqual({});
  });
  it('«Древо» из раскрытых лиц; набор пуст — с выбранного лица, без него — вступление с началами', () => {
    expect(viewPlan('tree', { start: 'adam', set: 3, selected: 'david' })).toEqual({});
    expect(viewPlan('tree', { start: 'all', set: 0, selected: 'david' })).toEqual({ seed: 'david' });
    expect(viewPlan('tree', { start: null, set: 0, selected: null })).toEqual({ intro: true });
  });
  it('showView: древо → небо «набор» и обратно; одно состояние раскрытия', () => {
    startWith('adam');
    expect(atlasView.value).toBe('tree');
    skyMode.value = 'all';
    showView('sky');
    expect(atlasView.value).toBe('sky');
    expect(skyMode.value).toBe('work');
    expect([...workSet.value.keys()]).toEqual(['adam']);
    showView('tree');
    expect(atlasView.value).toBe('tree');
    expect([...workSet.value.keys()]).toEqual(['adam']);
  });
  it('showView: древо из пустого набора начинается с выбранного лица и показывает его союзы', () => {
    startWith('all');
    expect(atlasView.value).toBe('sky');
    workSet.value = new Map();
    selected.value = 'david';
    showView('tree');
    expect(atlasView.value).toBe('tree');
    expect([...workSet.value.keys()]).toEqual(['david']);
    expect(opened.value).toContain('david');
    expect(introOpen.value).toBe(false);
  });
  it('телефон: «Небо» и «Древо» — первыми пунктами «Разделов», отмечен нынешний вид', () => {
    const items = phoneMenuItems(null, false, () => {}, () => {}, 0, () => {}, 'tree');
    expect(items.slice(0, 2).map((i) => [i.label, i.checked])).toEqual([
      ['Небо', false],
      ['Древо', true],
    ]);
  });
});

describe('начала и «Начать заново» в древе (решения 68, 73)', () => {
  it('«Начать заново…» в древе открывает вступление с началами, а не лист «Вид»', () => {
    atlasView.value = 'tree';
    openStarts();
    expect(introOpen.value).toBe(true);
    expect(viewOpen.value).toBe(false);
    expect(startsFocus.value).toBe(true);
    atlasView.value = 'sky';
    introOpen.value = false;
    openStarts();
    expect(viewOpen.value).toBe(true);
    expect(introOpen.value).toBe(false);
  });
  it('вступление древа: пять начал всегда, «С чего начать» при первом посещении, «Начать заново» потом; как читать древо', () => {
    start.value = null;
    const first = text(h(Cartouche, { high: false, tree: true }) as VNode);
    expect(first).toContain('С чего начать');
    for (const o of STARTS) expect(first).toContain(o.label);
    expect(first).toContain('Как читать карту');
    expect(first).toContain('Слева направо — поколения');
    // о небе вступление древа не говорит: звёзд, столбцов и полосы времени в древе нет
    expect(first).not.toMatch(/звезд|столбц|полоса времени/i);
    start.value = 'adam';
    const later = text(h(Cartouche, { high: false, tree: true }) as VNode);
    expect(later).toContain('Начать заново');
    expect(later).not.toContain('С чего начать');
    for (const o of STARTS) expect(later).toContain(o.label);
    // быстрых входов к лицу в древе нет: древо растёт от начала
    expect(html(h(Cartouche, { high: false, tree: true }) as VNode)).not.toContain('class="entry"');
  });
  it('низкая область древа: одна строка «С чего начать», «Как читать карту», «Свернуть»', () => {
    const low = text(h(Cartouche, { high: false, low: true, tree: true }) as VNode);
    expect(low).toMatch(/С чего начать.*Как читать карту.*Свернуть/);
  });
  it('«Как читать карту» древа называет его команды и знаки; для касания и для мыши', () => {
    const g = text(h(ReadingGuide, { tree: true, both: true }) as VNode);
    for (const w of ['«Продолжить ветвь»', '«Родители»', '«Раскрыть детей»', 'Пунктирная рамка', '«Свернуть ветвь»', 'Золотая и лазурная', '«Небо | Древо»'])
      expect(g).toContain(w);
    expect(html(h(ReadingGuide, { tree: true }) as VNode)).toMatch(/class="for-touch"/);
    // прежний «Как читать карту» неба не изменился
    expect(text(h(ReadingGuide, { both: true }) as VNode)).toContain('Годы сверху — время');
  });
  it('строка у кромки древа: «Раскрыто N лиц — показать всё небо | начать заново»; пустое древо — без строки', () => {
    workSet.value = new Map([
      ['adam', { via: 'self', of: 'adam' }],
      ['eva', { via: 'family', of: 'adam' }],
    ]);
    const bar = text(h(TreeBars, {}) as VNode);
    expect(bar).toMatch(/Раскрыто 2 лица — показать всё небо начать заново/);
    workSet.value = new Map();
    expect(html(h(TreeBars, {}) as VNode)).toBe('');
  });
});

describe('адрес: поле «t1» — древо (решение 73)', () => {
  const has = (id: string) => ['adam', 'eva', 'david'].includes(id);
  it('разбор и запись', () => {
    const a = parseAddress('#/adam~k1~nadam.eva~t1', has);
    expect(a.tree).toBe(true);
    expect(a.work).toBe(true);
    expect(a.set).toEqual(['adam', 'eva']);
    expect(parseAddress('#/adam~k1', has).tree).toBeUndefined();
    expect(parseAddress('#/adam~t0', has).tree).toBe(false);
    expect(formatAddress({ id: 'adam', work: true, set: ['adam', 'eva'], tree: true })).toBe('#/adam~k1~nadam.eva~t1');
    expect(formatAddress({ id: 'adam', tree: false })).toBe('#/adam');
    // только буквы, цифры и «. _ ~ -»: опубликованная версия получает простой якорь
    expect(formatAddress({ id: 'david', work: true, tree: true })).toMatch(/^#\/[a-z0-9._~-]*$/);
  });
  it('адрес с полями вида задаёт и главную область; прежние адреса — небо', () => {
    const src_ = src('src/ui/address.ts');
    expect(src_).toContain("atlasView.value = a.tree ? 'tree' : 'sky'");
    // небо и древо — разные записи истории: «назад» и «вперёд» переходят между ними
    expect(src_).toMatch(/pushKey[\s\S]*atlasView\.value/);
  });
});

describe('справка о древе (решение 73)', () => {
  it('«Условные знаки»: раздел «Древо» — карточка лица, карточка союза, пустое место, двойная линия, цвета ветвей', () => {
    const legend = src('src/ui/panels/Legend.tsx');
    expect(legend).toContain('<h3 id="legend-tree">Древо</h3>');
    for (const k of ['TreePersonSample', 'TreeUnionSample', 'TreeUnnamedSample', 'TreeLinesSample', 'TreeBranchSample']) expect(legend).toContain(`<${k}`);
    expect(legend).toContain('Двойная линия, золотая и лазурная');
    expect(legend).toContain('Ветви выбранного лица светятся');
  });
  it('«О карте»: абзац о древе и переключателе', () => {
    const about = src('src/ui/panels/About.tsx');
    expect(about).toContain('«Небо | Древо»');
    expect(about).toContain('Первые четыре начала открывают древо');
  });
  it('«Клавиши»: раздел «Древо» — стрелки, Enter, пробел, «+» и «−»; мышь и касание', () => {
    const keys = TREE_KEY_ROWS.flatMap((r) => r.keys.map((k) => k.en));
    for (const k of ['←', '→', '↑', '↓', 'Enter', 'пробел', '+', '−']) expect(keys).toContain(k);
    expect(TREE_POINTER_ROWS.map((r) => r.how)).toContain('щелчок по карточке');
    const t = text(h(KeysTable, {}) as VNode);
    expect(t).toContain('Действие в древе');
  });
});

describe('место древа в сетке (решение 73)', () => {
  it('в древе полосы времени нет: её строка — 0 px, на телефоне положения листа — без неё', () => {
    expect(css('sky.css')).toMatch(/\.app\.in-tree\s*\{\s*--strip-h:\s*0px;/);
    expect(css('sky.css')).toMatch(/\.treearea\s*\{[^}]*grid-area:\s*sky;/);
    expect(css('phone.css')).toMatch(/\.app\.in-tree\s*\{[^}]*--sheet-avail:\s*calc\(100dvh - var\(--top-h\)/);
    const app = src('src/ui/App.tsx');
    expect(app).toContain('{tree ? <TreeArea /> : <SkyView />}');
    expect(app).toContain('{!tree && <TimeStrip />}');
  });
  it('в верхней строке переключатель стоит отдельно от темы: «.top > .seg» — только «Ночь | День»', () => {
    const top = src('src/ui/top/TopBar.tsx');
    expect(top).toMatch(/<div class="view-switch"> <ViewSwitch \/> <\/div>/);
  });
});
