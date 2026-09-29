/**
 * Один атлас (этап 11, решение 77; прежде — задача N2, решение 73 «Небо | Древо»): вида «Древо» больше нет.
 *
 * Прежние проверки этого файла (переключатель «Небо | Древо», поле адреса «t1» как древо, вступление и «Как читать
 * карту» древа, строка «Раскрыто N лиц» у кромки древа, раздел «Древо» в «Условных знаках», «Клавиши древа») заменены
 * проверками нового поведения: переключателя нет ни в верхней строке, ни в «Разделах» телефона; главная область — всегда
 * небо с полосой времени; «Начать заново…» открывает лист «Вид»; справка говорит о карточке у звезды, «Родстве», линиях
 * и строке показа. Адрес «~t1» (теперь — набор) проверяет tests/address-q2.test.ts (Q2).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { start, STARTS } from '../src/ui/reveal.ts';
import { introOpen } from '../src/ui/sky/view.ts';
import * as controls from '../src/ui/sky/Controls.tsx';
import { Cartouche, ReadingGuide } from '../src/ui/sky/Overlays.tsx';
import { KEY_ROWS, KeysTable, POINTER_ROWS } from '../src/ui/top/Keys.tsx';
import * as keys from '../src/ui/top/Keys.tsx';
import { phoneMenuItems } from '../src/ui/top/TopBar.tsx';

const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '');
const html = (v: VNode) => flat(renderToString(v).replace(/&nbsp;|&#160;/g, ' '));
const text = (v: VNode) => html(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const src = (f: string) => flat(readFileSync(join(__dirname, '..', f), 'utf8')).replace(/\s+/g, ' ');
const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Строки кода без комментариев: то, что видит читатель (надписи, подсказки, тексты). */
const code = (f: string) =>
  flat(readFileSync(join(__dirname, '..', f), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

beforeEach(() => {
  introOpen.value = false;
  controls.viewOpen.value = false;
  controls.startsFocus.value = false;
});

describe('один атлас: переключателя «Небо | Древо» нет (решение 77)', () => {
  it('органы неба не знают видов: нет ViewSwitch, showView, VIEWS', () => {
    expect('ViewSwitch' in controls).toBe(false);
    expect('showView' in controls).toBe(false);
    expect('VIEWS' in controls).toBe(false);
  });
  it('верхняя строка и «Разделы» телефона — без «Небо» и «Древо»', () => {
    const top = src('src/ui/top/TopBar.tsx');
    expect(top).not.toContain('ViewSwitch');
    expect(top).not.toContain('view-switch');
    const labels = phoneMenuItems(null, false, () => {}, () => {}).map((i) => i.label);
    expect(labels).not.toContain('Древо');
    expect(labels).not.toContain('Небо');
  });
  it('главная область — всегда небо с полосой времени; древа и его стилей в приложении нет', () => {
    const app = src('src/ui/App.tsx');
    expect(app).toContain('<SkyView />');
    expect(app).toContain('<TimeStrip />');
    expect(app).not.toMatch(/TreeArea|TreeView|atlasView/);
    expect(css('sky.css')).not.toMatch(/\.treearea|\.in-tree/);
    // главный файл стилей древа больше не подключается приложением: образы — в dotcard.css
    expect(src('src/ui/card/Avatar.tsx')).toContain("import '../../styles/dotcard.css'");
  });
  it('«Начать заново…» открывает лист «Вид» на разделе «Начало»', () => {
    controls.openStarts();
    expect(controls.viewOpen.value).toBe(true);
    expect(introOpen.value).toBe(false);
    expect(controls.startsFocus.value).toBe(true);
  });
});

describe('вступление и «Как читать карту» (решения 77, 78, 81, 83)', () => {
  it('вступление — одно, с пятью началами при первом посещении', () => {
    start.value = null;
    const first = text(h(Cartouche, { high: false }) as VNode);
    expect(first).toContain('С чего начать');
    for (const o of STARTS) expect(first).toContain(o.label);
    expect(first).not.toMatch(/древ/i);
  });
  it('«Как читать карту»: карточка у звезды с «Родством», ствол и зубцы, ромб союза, выбор линии, строка показа, «Вписать»', () => {
    const g = text(h(ReadingGuide, { both: true }) as VNode);
    for (const w of ['карточка с родством', 'вертикальный ствол', 'зубцы', 'ромб — союз родителей', 'жёлтым', '«На небе: …»', '«Вписать»'])
      expect(g).toContain(w);
    expect(g).not.toMatch(/древ|Небо \| Древо/i);
    expect(html(h(ReadingGuide, { both: false }) as VNode)).toMatch(/class="for-touch"/);
    expect(g).toContain('Годы сверху — время');
  });
});

describe('справка без древа (решение 77)', () => {
  it('«Условные знаки»: раздела «Древо» нет, есть «Карточки на небе» — карточка у звезды, образы, карточка связи', () => {
    const legend = src('src/ui/panels/Legend.tsx');
    expect(legend).not.toContain('id="legend-tree"');
    expect(legend).toContain('<h3 id="legend-cards">Карточки на небе</h3>');
    expect(legend).toContain('<AvatarSamples />');
    expect(legend).toContain('карточка связи');
    expect(legend).toMatch(/Щелчок по линии — связь выделяется жёлтым/);
  });
  it('«О карте»: без «Небо | Древо»; строка показа и карточка у звезды', () => {
    const about = src('src/ui/panels/About.tsx');
    expect(about).not.toContain('«Небо | Древо»');
    expect(about).not.toMatch(/открывают древо/);
    expect(about).toContain('«На небе: …»');
    expect(about).toContain('блоком «Родство»');
  });
  it('«Клавиши»: клавиш древа нет; «Родство» карточки у звезды — Tab, стрелки, Enter', () => {
    expect('TREE_KEY_ROWS' in keys).toBe(false);
    expect('TREE_POINTER_ROWS' in keys).toBe(false);
    const t = text(h(KeysTable, {}) as VNode);
    expect(t).not.toMatch(/древ/i);
    expect(KEY_ROWS.some((r) => /«Родстве» карточки у звезды/.test(r.what))).toBe(true);
    expect(KEY_ROWS.some((r) => /на имени в «Родстве» — карточка связи/.test(r.what))).toBe(true);
    expect(POINTER_ROWS.map((r) => r.how)).toContain('щелчок по звезде');
    expect(POINTER_ROWS.find((r) => r.how === 'наведение и щелчок по линии')?.what).toMatch(/жёлтым/);
  });
});

describe('слова (Я30): нет «Древо», «В работе», «Раскрыто»; «Всё небо» — только показ, кадр — «Вписать»', () => {
  const FILES = [
    'src/ui/App.tsx',
    'src/ui/Folio.tsx',
    'src/ui/top/TopBar.tsx',
    'src/ui/top/Keys.tsx',
    'src/ui/sky/Controls.tsx',
    'src/ui/sky/Overlays.tsx',
    'src/ui/sky/DotCard.tsx',
    'src/ui/sky/ShowBar.tsx',
    'src/ui/panels/Show.tsx',
    'src/ui/panels/Work.tsx',
    'src/ui/panels/Legend.tsx',
    'src/ui/panels/About.tsx',
  ];
  it.each(FILES)('%s', (f) => {
    const c = code(f);
    expect(c).not.toMatch(/Древо(?![а-яё])/);
    expect(c).not.toMatch(/В работе/);
    expect(c).not.toMatch(/Раскрыто(?![а-яё])/);
  });
  it('органы неба: «Вписать» вместо «Всё небо»', () => {
    const c = code('src/ui/sky/Controls.tsx');
    expect(c).toContain('Вписать');
    expect(c).not.toMatch(/>\s*Всё небо\s*</);
  });
});
