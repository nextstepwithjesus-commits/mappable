/**
 * Телефон и планшет, этап 7 (K7; MOB-39, 44, 45, 47, 48, 50, 59; решение 33) без браузера: когда лист панели убран на время
 * выбора второго лица, и правила стилей, которые держат сетку, слои, порядок разворота и цели касания.
 * Поведение в браузере (390 × 844, 360 × 740, 844 × 390, 768 × 1024; пальцем) — сценарии 300–307 в tools/accept/phone7.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modalOnPhone, parkedFor } from '../src/ui/focus.ts';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Содержимое блока, который начинается с head (например, «@media (max-width: 720px)»), — с учётом вложенных скобок. */
function block(text: string, head: string): string {
  const at = text.indexOf(head);
  expect(at, `нет блока ${head}`).toBeGreaterThanOrEqual(0);
  let i = text.indexOf('{', at);
  const from = i + 1;
  for (let depth = 1; depth > 0; ) {
    i++;
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return text.slice(from, i);
}
/** Объявления правила, в списке селекторов которого есть sel (точное совпадение одного из селекторов). */
function decls(text: string, sel: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let out = '';
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const sels = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (sels.includes(sel)) out += m[2];
  }
  expect(out, `нет правила ${sel}`).not.toBe('');
  return out;
}
const prop = (d: string, name: string) => new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`).exec(d)?.[1].trim() ?? null;
const px = (v: string | null) => (v === null ? NaN : parseFloat(v));

const phone = css('phone.css');
const narrow = block(phone, '@media (max-width: 720px)');
const coarse = block(phone, '@media (pointer: coarse) {');

describe('выбор второго лица из «Родства» на телефоне: лист панели убран (MOB-47)', () => {
  it('на телефоне панель режима выбора убрана, пока идёт выбор', () => {
    expect(parkedFor(true, 'kinship', 'kinship')).toBe(true);
  });
  it('выбора нет, другой режим, другая панель — лист на месте', () => {
    expect(parkedFor(true, 'kinship', null)).toBe(false);
    expect(parkedFor(true, 'kinship', 'spread')).toBe(false);
    // выбор начат из карточки, а читатель открыл «Указатель», чтобы найти второе лицо: указатель виден
    expect(parkedFor(true, 'index', 'kinship')).toBe(false);
  });
  it('на планшете и компьютере панель — колонка рядом с небом: убирать нечего', () => {
    expect(parkedFor(false, 'kinship', 'kinship')).toBe(false);
  });
  it('немодальные листы («Эпохи», «Вид») не убираются', () => {
    expect(modalOnPhone('epochs')).toBe(false);
    expect(modalOnPhone('view')).toBe(false);
    expect(parkedFor(true, 'view', 'kinship')).toBe(false);
  });
});

describe('стили телефона: сетка, слои, разворот, «Эпохи» (MOB-44, 45, 48, 50, 59)', () => {
  it('одна колонка шириной окна: содержимое не держит сетку после поворота (MOB-44)', () => {
    expect(prop(decls(narrow, '.app'), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(prop(decls(narrow, '.app > .top'), 'min-width')).toBe('0');
    expect(prop(decls(narrow, '.app > .strip'), 'min-width')).toBe('0');
  });
  it('верхняя строка и списки — над листами панелей и разворота (MOB-45)', () => {
    const sheetZ = px(prop(decls(narrow, '.sheet'), 'z-index'));
    const spreadZ = px(prop(decls(css('spread.css'), '.spread'), 'z-index'));
    const topZ = px(prop(decls(narrow, '.top.phone'), 'z-index'));
    const menuZ = px(prop(decls(css('controls.css'), ".menu [role='menu']"), 'z-index'));
    expect(topZ).toBeGreaterThan(sheetZ);
    expect(topZ).toBeGreaterThan(spreadZ);
    expect(menuZ).toBeGreaterThan(Math.max(sheetZ, spreadZ));
  });
  it('лист панели, убранный на время выбора, не показывается (MOB-47)', () => {
    expect(prop(decls(narrow, '.app > .sheet[hidden]'), 'display')).toBe('none');
  });
  it('разворот на телефоне: корешок раздела — первым, строки лиц — под ним (MOB-48)', () => {
    const sp = block(css('spread.css'), '@media (max-width: 720px)');
    const row = decls(sp, '.spread .row');
    expect(prop(row, 'display')).toBe('flex');
    expect(prop(row, 'flex-direction')).toBe('column');
    expect(prop(decls(sp, '.spread .row > .spine'), 'order')).toBe('-1');
    // в шапках цепочка родства остаётся под обеими шапками
    expect(prop(decls(sp, '.spread .mastrow .spine.kin'), 'order')).toBe('3');
  });
  it('«Эпохи» — на месте листа карточки: над полосой времени, 55 %; карточка на это время скрыта (MOB-59)', () => {
    const ep = decls(narrow, '.sheet:has(> table.epochs)');
    expect(prop(ep, 'bottom')).toContain('var(--strip-h)');
    expect(prop(ep, 'height')).toBe('var(--sheet-half)');
    const under = decls(narrow, '.app:has(> .sheet > table.epochs) > .folio[data-stop]');
    expect(prop(under, 'visibility')).toBe('hidden');
    // невидимый лист карточки — той же высоты: по нему небо считает видимую часть (SkyView, insets)
    expect(prop(under, 'height')).toBe('var(--sheet-half)');
  });
  it('«Как читать карту» под открытым листом скрыта от фокуса и диктора (MOB-50)', () => {
    expect(prop(decls(narrow, '.app:has(> .folio[data-stop]) .guide-cmd'), 'visibility')).toBe('hidden');
    expect(prop(decls(narrow, '.app:has(> .sheet > table.epochs) .guide-cmd'), 'visibility')).toBe('hidden');
  });
});

describe('цели касания 44 px при pointer: coarse (решение 33; MOB-39)', () => {
  it('номера глав, буквы указателя, сегменты поколений — 44 × 44', () => {
    for (const sel of ['.toc button', '.letters .seg > button', 'div.workpick .wp-seg button']) {
      const d = decls(coarse, sel);
      expect(px(prop(d, 'min-width')), sel).toBeGreaterThanOrEqual(44);
      expect(px(prop(d, 'min-height')), sel).toBeGreaterThanOrEqual(44);
    }
  });
  it('поля ввода и списки в панелях — не ниже 44 px', () => {
    for (const sel of ['.field input', ".sheet input:not([type='checkbox'])", '.sheet select']) expect(px(prop(decls(coarse, sel), 'min-height')), sel).toBeGreaterThanOrEqual(44);
  });
  it('флажок: строка 44 px и поле квадрата 44 × 44 при прежнем месте в строке (24 px)', () => {
    expect(px(prop(decls(coarse, '.check'), 'min-height'))).toBeGreaterThanOrEqual(44);
    const d = decls(coarse, '.check input');
    const w = px(prop(d, 'width'));
    expect(w).toBeGreaterThanOrEqual(44);
    expect(px(prop(d, 'height'))).toBeGreaterThanOrEqual(44);
    // отрицательные поля: место в строке — 44 − 2 × 10 = 24 px, как у флажка без пальца (controls.css)
    expect(w + 2 * px(prop(d, 'margin'))).toBe(px(prop(decls(css('controls.css'), '.check input'), 'width')));
  });
  it('строка указателя и «ещё N записей» — 44 px', () => {
    expect(px(prop(decls(coarse, '.idx .row'), 'min-height'))).toBeGreaterThanOrEqual(44);
    expect(px(prop(decls(coarse, '.clamp-more'), 'min-height'))).toBeGreaterThanOrEqual(44);
  });
  it('«ещё N ссылок» — поле 44 px; ссылки внутри фразы («см. § 24», «Илий, § 24») — 32 px, межстрочие прежнее', () => {
    expect(px(prop(decls(coarse, '.refs .more::after'), 'height'))).toBeGreaterThanOrEqual(44);
    const link = decls(coarse, '.sec .see::after');
    expect(px(prop(link, 'height'))).toBeGreaterThanOrEqual(32);
    expect(decls(coarse, 'button.why::after')).toBe(link);
  });
});
