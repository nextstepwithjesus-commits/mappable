/**
 * Телефон, крупный текст, вступление и панель «В работе» (L9; MOB-39, 69, 70, 71, 75; UX-70, 76, 77; VIS-83, 84;
 * решения 56, 57) без браузера. Поведение в браузере (320 × 568, 320 × 256, 390 × 844, 1024 × 768, кегль 32 px) —
 * сценарии 450–459 в tools/accept/phone3.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeTarget, type EscapeState } from '../src/ui/keys.ts';
import { introFocusTarget } from '../src/ui/focus.ts';
import { sheetIsDialog } from '../src/ui/panels/Sheet.tsx';
import { WORK_LEAD, groupTitle, memberNote, workGroups } from '../src/ui/panels/Work.tsx';
import type { WorkEntry } from '../src/ui/work.ts';
import { byId, persons } from '../src/data/atlas.ts';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Содержимое блока, который начинается с head, — с учётом вложенных скобок. */
function block(text: string, head: string): string {
  const at = text.indexOf(head);
  expect(at, `нет блока ${head}`).toBeGreaterThanOrEqual(0);
  let i = text.indexOf('{', at);
  const from = i + 1;
  let depth = 1;
  while (depth > 0 && i < text.length) {
    i++;
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return text.slice(from, i);
}
/** Объявления правил, в списке селекторов которых есть sel. */
function decls(text: string, sel: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let out = '';
  for (let m = re.exec(text); m; m = re.exec(text)) if (m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')).includes(sel)) out += m[2];
  expect(out, `нет правила ${sel}`).not.toBe('');
  return out;
}
const prop = (d: string, name: string) => new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`).exec(d)?.[1].trim() ?? null;

const sky = css('sky.css');
const phone = css('phone.css');

describe('Escape снимает одно состояние; вступление — последним (UX-76)', () => {
  const none: EscapeState = { pick: false, panel: false, pins: false, group: false, second: false, selected: false, intro: false };
  it('порядок: выбор второго лица, панель, отметки, группа, пара, выбранное лицо, вступление', () => {
    const all: EscapeState = { pick: true, panel: true, pins: true, group: true, second: true, selected: true, intro: true };
    const seen: string[] = [];
    let s = { ...all };
    for (let k = escapeTarget(s); k; k = escapeTarget(s)) {
      seen.push(k);
      s = { ...s, [k]: false };
    }
    expect(seen).toEqual(['pick', 'panel', 'pins', 'group', 'second', 'selected', 'intro']);
  });
  it('открыта только табличка — Escape сворачивает её; нечего снимать — ничего', () => {
    expect(escapeTarget({ ...none, intro: true })).toBe('intro');
    expect(escapeTarget({ ...none, intro: true, panel: true })).toBe('panel');
    expect(escapeTarget(none)).toBeNull();
  });
  it('фокус: открыли табличку — на заголовок; свернули с фокусом в ней — на «Как читать карту»; вход и выбор лица — карточке', () => {
    expect(introFocusTarget({ open: true, wasInside: false, selChanged: false })).toBe('title');
    expect(introFocusTarget({ open: false, wasInside: true, selChanged: false })).toBe('command');
    expect(introFocusTarget({ open: false, wasInside: true, selChanged: true })).toBeNull();
    expect(introFocusTarget({ open: false, wasInside: false, selChanged: false })).toBeNull();
  });
});

describe('панель на телефоне — диалог (MOB-75)', () => {
  it('телефон, модальная панель — role="dialog"; «Эпохи», «Вид», планшет и компьютер — область', () => {
    expect(sheetIsDialog(true, 'index', false)).toBe(true);
    expect(sheetIsDialog(true, 'work', false)).toBe(true);
    expect(sheetIsDialog(true, 'epochs', false)).toBe(false);
    expect(sheetIsDialog(true, 'view', true)).toBe(false);
    expect(sheetIsDialog(false, 'index', false)).toBe(false);
  });
});

describe('вступление (MOB-69, MOB-70, VIS-84, UX-70)', () => {
  it('входы — строки, уравненные по длине (VIS-84); на сенсорном экране — 44 px, поля 8 px, промежуток 8 px (MOB-69)', () => {
    expect(prop(decls(sky, '.cartouche .entry'), 'text-wrap')).toBe('balance');
    const touch = decls(block(sky.slice(sky.indexOf('.cartouche .entry {')), '@media (pointer: coarse)'), '.cartouche .entry button');
    expect(prop(touch, 'min-height')).toBe('44px');
    expect(prop(touch, 'padding')).toBe('0 8px');
    expect(prop(touch, 'margin')).toBe('0 8px 8px 0');
  });
  it('низкое небо: одна строка — только если помещается; уже 480 px — две строки, команды под названием (MOB-70)', () => {
    expect(prop(decls(sky, '.cartouche.low'), 'flex-wrap')).toBe('wrap');
    const narrow = block(sky, '@media (max-width: 480px)');
    expect(prop(decls(narrow, '.cartouche.low::after'), 'flex-basis')).toBe('100%');
    expect(prop(decls(narrow, '.cartouche.low button'), 'order')).toBe('2');
    expect(prop(decls(narrow, '.cartouche.low .hint'), 'white-space')).toBe('normal');
  });
  it('невысокое окно: главная фраза остаётся, уходят строки о координатах и «Всё небо», строка с «?» — нет (UX-70, IX-41); на телефоне фраза тоже есть', () => {
    const low = block(sky, '@media (max-height: 800px)');
    expect(low).not.toMatch(/\.long|for-mouse/);
    // строки неба; «Как читать карту» древа (решение 73, .tree-guide) — другой список, его строки остаются
    expect(prop(decls(low, '.cartouche .guide:not(.tree-guide) li:nth-child(2)'), 'display')).toBe('none');
    expect(prop(decls(low, '.cartouche .guide:not(.tree-guide) li:last-child'), 'display')).toBe('none');
    expect(block(phone, '@media (max-width: 720px)')).not.toMatch(/\.cartouche \.long/);
  });
});

describe('крупный текст (MOB-71)', () => {
  it('колонка органов неба — max(44px, 2.75rem), подписи переносятся; высота колонки в расчётах — тем же числом', () => {
    const b = decls(sky, '.skyctl.column button');
    expect(prop(b, 'width')).toBe('max(44px, 2.75rem)');
    expect(prop(b, 'min-height')).toBe('44px');
    expect(prop(b, 'white-space')).toBe('normal');
    expect(phone).toMatch(/4 \* max\(44px, 2\.75rem\)/);
    expect(phone).not.toMatch(/181px|width: 87px/);
  });
  it('поле «Найти» на телефоне — не уже 6rem; если места нет (уже 21em) — команда «Найти:», поле раскрывается по фокусу', () => {
    expect(prop(decls(phone, '.top.phone .search input'), 'min-width')).toBe('6rem');
    const tight = block(phone, '@media (max-width: 21em)');
    expect(prop(decls(tight, '.top.phone .search:not(:focus-within) input'), 'position')).toBe('absolute');
    expect(prop(decls(tight, '.top.phone .search:not(:focus-within) label'), 'cursor')).toBe('pointer');
    // цель 44 px — только у команды «Найти:», когда поле свёрнуто: в обычной строке подпись не растягивает верхнюю строку
    expect(decls(block(phone, '@media (max-width: 21em) and (pointer: coarse)'), '.top.phone .search:not(:focus-within) label')).toMatch(/min-height:\s*44px/);
  });
});

describe('«В работе»: происхождение — один раз, заголовком группы (VIS-83, UX-77)', () => {
  const fam = (of: string, gen = 1): WorkEntry => ({ via: 'family', of, gen });
  it('лицо и взятые с ним — одна группа, само лицо первым; одиночные — строками; порядок — по месту лица', () => {
    const ids = ['avraam', 'iessey', 'eliav', 'david', 'solomon', 'moisey'];
    const set = new Map<string, WorkEntry>([
      ['avraam', { via: 'self', of: 'avraam' }],
      ['iessey', fam('david')],
      ['eliav', fam('david')],
      ['david', { via: 'self', of: 'david' }],
      ['solomon', fam('david')],
      ['moisey', { via: 'self', of: 'moisey' }],
    ]);
    expect(workGroups(ids, set)).toEqual([
      { of: null, ids: ['avraam'] },
      { of: 'david', ids: ['david', 'iessey', 'eliav', 'solomon'] },
      { of: null, ids: ['moisey'] },
    ]);
  });
  it('лицо группы убрали — группа остаётся на месте первого взятого с ним', () => {
    const set = new Map<string, WorkEntry>([
      ['iessey', fam('david')],
      ['solomon', fam('david')],
      ['moisey', { via: 'self', of: 'moisey' }],
    ]);
    expect(workGroups(['moisey', 'iessey', 'solomon'], set)).toEqual([
      { of: null, ids: ['moisey'] },
      { of: 'david', ids: ['iessey', 'solomon'] },
    ]);
  });
  it('заголовок: имя в именительном в начале, местоимение по роду; без самого лица — родительный падеж', () => {
    expect(groupTitle('david', [fam('david'), fam('david')], true, 38)).toBe('Давид и его семья (38)');
    expect(groupTitle('ruf', [fam('ruf')], true, 6)).toBe('Руфь и её семья (6)');
    expect(groupTitle('ruf', [{ via: 'path', of: 'ruf' }], true, 4)).toBe('Руфь и путь родства от неё (4)');
    expect(groupTitle('david', [fam('david'), { via: 'anc', of: 'david', gen: 2 }, { via: 'desc', of: 'david', gen: 1 }], true, 50)).toBe(
      'Давид, его семья, предки и потомки (50)',
    );
    expect(groupTitle('david', [fam('david')], false, 37)).toBe('Семья Давида (37)');
    const unnamed = persons.find((p) => byId.get(p.id)?.unnamed)!;
    expect(groupTitle(unnamed.id, [fam(unnamed.id)], false, 3)).toBe(`Семья: ${unnamed.name} (3)`);
  });
  it('под именем — только отличие: поколение в группе одного вида, вид и поколение — в смешанной', () => {
    expect(memberNote(fam('david'), 1)).toBeNull();
    expect(memberNote({ via: 'anc', of: 'david', gen: 2 }, 1)).toBe('2-е поколение');
    expect(memberNote({ via: 'anc', of: 'david', gen: 2 }, 2)).toBe('предок, 2-е поколение');
    expect(memberNote(fam('david'), 2)).toBe('семья');
    expect(memberNote({ via: 'self', of: 'david' }, 2)).toBeNull();
  });
  it('вводка панели — «набор помнится в этом браузере», как пояснение команды «Набор»', () => {
    // этап 11 (Я30, решение 81): одно слово — «набор»; набор — один из показов неба
    expect(WORK_LEAD).toBe('Лица, собранные вручную; набор помнится в этом браузере. Показ «набор» — только они на небе.');
  });
});
