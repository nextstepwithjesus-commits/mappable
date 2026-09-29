/**
 * Пять начал, «Начать заново», строка показа, панель «Набор», условные знаки и «О карте» (решения 68, 70, 72; задача M3;
 * этап 11 — решения 77, 81):
 *  — вступление при первом посещении предлагает пять начал, быстрые входы остаются ниже; выбранное начало — без выбора;
 *  — подтверждение — только у начал, которые заменяют набор («С Адама», «С Иисуса Христа»), при наборе больше одного
 *    лица; «Родословие Иисуса Христа», «Ключевые лица» и «Всё небо» — показы, набор они не трогают (этап 11, § 5);
 *  — строки «Раскрыто N лиц» больше нет: набор называет строка показа «На небе: набор — 12 лиц» (этап 11, § 5);
 *  — группы панели «Набор» после раскрытия Адам → союз → Каин → союз читаются: «Адам и его семья (5)», «Семья Каина (1)»;
 *  — справка называет союз на небе, «+» нераскрытых союзов, подсветку ветвей, пять начал и «Начать заново»; «Клавиши» —
 *    карточку у звезды в любом показе и карточку союза у ромба (решение 77).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { byId } from '../src/data/atlas.ts';
import { expandUnion, KEY_IDS, openPerson, start, startWith, STARTS, unionsOf } from '../src/ui/reveal.ts';
import { skyMode, workSet, type WorkEntry } from '../src/ui/work.ts';
import { needsConfirm, replaceText, StartList, startNote } from '../src/ui/sky/Controls.tsx';
import { Cartouche } from '../src/ui/sky/Overlays.tsx';
import { ShowBar } from '../src/ui/sky/ShowBar.tsx';
import { groupTitle, kindsOf, workGroups } from '../src/ui/panels/Work.tsx';
import { KEY_ROWS, POINTER_ROWS } from '../src/ui/top/Keys.tsx';
import { RESTART_LABEL } from '../src/ui/top/TopBar.tsx';

const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '');
const html = (v: VNode) => flat(renderToString(v).replace(/&nbsp;|&#160;/g, ' '));
const src = (f: string) => flat(readFileSync(join(__dirname, '..', f), 'utf8')).replace(/\s+/g, ' ');

describe('пять начал (решение 68)', () => {
  it('короткие пояснения: строчные, без стрелок и точек-разделителей, в одну строку вступления', () => {
    for (const o of STARTS) {
      const t = flat(startNote(o.value));
      expect(t, o.value).toMatch(/^[а-яё]/);
      expect(t, o.value).not.toMatch(/[·→]/);
      expect(t.length, o.value).toBeLessThanOrEqual(42);
    }
    // склонение считается здесь заново, не той же функцией: 2 660 лиц, 2 663 лица, 2 661 лицо
    const n = byId.size;
    const form = n % 10 === 1 && n % 100 !== 11 ? 'лицо' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'лица' : 'лиц';
    expect(flat(startNote('all'))).toBe(`все ${flat(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))} ${form} сразу`);
    expect(flat(startNote('key'))).toMatch(new RegExp(`${KEY_IDS.length} (лицо|лица|лиц)$`));
  });
  it('подтверждение — только если начало заменяет набор больше чем из одного лица; показы набор не трогают', () => {
    expect(needsConfirm('adam', 1)).toBe(false);
    expect(needsConfirm('adam', 2)).toBe(true);
    expect(needsConfirm('jesus', 2)).toBe(true);
    // этап 11 (§ 5, решение 81): «Родословие Иисуса Христа» и «Ключевые лица» — показы, набор прежний (show.ts, Q2)
    expect(needsConfirm('lines', 104)).toBe(false);
    expect(needsConfirm('key', 104)).toBe(false);
    expect(needsConfirm('all', 104)).toBe(false);
  });
  it('вопрос — с родительным падежом числа: «Набор из 21 лица», «из 104 лиц»', () => {
    expect(flat(replaceText(21))).toBe('Набор из 21 лица будет заменён');
    expect(flat(replaceText(2))).toBe('Набор из 2 лиц будет заменён');
    expect(flat(replaceText(104))).toBe('Набор из 104 лиц будет заменён');
    expect(flat(replaceText(1001))).toBe('Набор из 1 001 лица будет заменён');
  });
  it('выбор начала: «Ключевые лица» — показ ключевых лиц, набор прежний; «всё небо» — небо «все лица», набор прежний', () => {
    // этап 11 (§ 5, решение 81): «Ключевые лица» — показ, а не замена набора; небо показывает KEY_IDS (show.ts)
    startWith('adam');
    startWith('key');
    expect(start.value).toBe('key');
    expect([...workSet.value.keys()]).toEqual(['adam']);
    expect(KEY_IDS.length).toBeGreaterThan(40);
    expect(skyMode.value).toBe('work');
    startWith('all');
    expect(skyMode.value).toBe('all');
    expect([...workSet.value.keys()]).toEqual(['adam']);
  });
  it('список: пять кнопок с названием и подсказкой, текущее начало отмечено aria-current', () => {
    startWith('jesus');
    const out = html(h(StartList, { notes: true }) as VNode);
    for (const o of STARTS) expect(out).toContain(`aria-label="${o.label}"`);
    expect([...out.matchAll(/aria-current="true"/g)].length).toBe(1);
    expect(out).toMatch(/data-start="jesus"[^>]*aria-current="true"/);
    expect(out).toContain(flat(startNote('adam')));
  });
});

describe('вступление (решение 68)', () => {
  beforeEach(() => {
    start.value = null;
  });
  it('первое посещение: «С чего начать» — пять начал с пояснениями; быстрые входы ниже, группа «Сразу к лицу»', () => {
    const out = html(h(Cartouche, { high: false }) as VNode);
    expect(out).toContain('С чего начать');
    for (const o of STARTS) expect(out).toContain(o.label);
    expect(out).toContain('cartouche picking');
    expect(out.indexOf('class="starts notes"')).toBeLessThan(out.indexOf('class="entry"'));
    expect(out).toContain('aria-label="Сразу к лицу"');
    expect(out).not.toContain('aria-current="true"');
  });
  it('укороченное вступление: «С чего начать» — одна команда рядом с «Как читать карту» и «Свернуть»', () => {
    const out = html(h(Cartouche, { high: false, low: true }) as VNode);
    expect(out).toMatch(/С чего начать[\s\S]*Как читать карту[\s\S]*Свернуть/);
    expect(out).not.toContain('class="starts');
  });
  it('начало выбрано — вступление прежнее: без выбора, входы — «С чего начать»', () => {
    start.value = 'adam';
    const out = html(h(Cartouche, { high: false }) as VNode);
    expect(out).not.toContain('class="starts');
    expect(out).not.toContain('picking');
    expect(out).toContain('aria-label="С чего начать"');
    expect(html(h(Cartouche, { high: false, low: true }) as VNode)).not.toContain('С чего начать');
  });
});

describe('строка показа вместо строки «Раскрыто N лиц» (этап 11, § 5; прежде — решение 72)', () => {
  it('набор после раскрытия: «На небе: набор — 5 лиц» со склонением, «изменить» и «всё небо»; слова «Раскрыто» нет', () => {
    startWith('adam');
    const one = flat(renderToString(h(ShowBar, {})));
    expect(one).toContain('набор — 1 лицо');
    expandUnion(unionsOf('adam')[0].id, 'adam');
    const out = flat(renderToString(h(ShowBar, {})));
    expect(out).toContain('На небе:');
    expect(out).toContain('набор — 5 лиц');
    expect(out).toMatch(/>изменить</);
    expect(out).toMatch(/>всё небо</);
    expect(out).not.toMatch(/Раскрыто/);
  });
});

describe('панель «Набор» после раскрытия Адам → Ева, Каин, Авель, Сиф → Каин → Енох (решение 72; этап 11 — «Набор» вместо «В работе»)', () => {
  it('две группы: «Адам и его семья (5)» и «Семья Каина (1)»', () => {
    startWith('adam');
    expandUnion(unionsOf('adam')[0].id, 'adam');
    openPerson('kain');
    expandUnion(unionsOf('kain')[0].id, 'kain');
    const set = workSet.value;
    const groups = workGroups([...set.keys()], set);
    const titles = groups.map((g) => {
      const entries = g.ids.map((id) => set.get(id)).filter((e): e is WorkEntry => !!e && e.via !== 'self');
      return g.of ? groupTitle(g.of, entries, set.get(g.of)?.via === 'self', g.ids.length) : null;
    });
    expect(titles).toEqual(['Адам и его семья (5)', 'Семья Каина (1)']);
    // члены группы — одного вида («семья»): под именами нет строки происхождения
    expect(kindsOf(groups[0].ids.map((id) => set.get(id)!).filter((e) => e.via !== 'self'))).toEqual(['family']);
    expect(groups[0].ids.map((id) => byId.get(id)?.name)).toEqual(['Адам', 'Ева', 'Каин', 'Авель', 'Сиф']);
  });
});

describe('справка (решения 67–72)', () => {
  const legend = src('src/ui/panels/Legend.tsx');
  const about = src('src/ui/panels/About.tsx');
  it('«Условные знаки»: союз на небе, плюс нераскрытых союзов, подсветка ветвей, пять начал', () => {
    expect(legend).toContain('Союз на небе');
    expect(legend).toContain('Плюс без числа после имени');
    expect(legend).toContain('Подсветка ветвей выбранного лица');
    for (const o of STARTS) expect(legend).toContain(`«${o.label}»`);
    expect(legend).toContain('«Начать заново»');
  });
  it('«О карте»: абзац о пяти началах и раскрытии; названия — те же, что в интерфейсе', () => {
    expect(about).toContain('Начало и раскрытие родословия');
    for (const o of STARTS) expect(about).toContain(`«${o.label}»`);
    expect(RESTART_LABEL.replace(/…$/, '')).toBe('Начать заново');
    expect(about).toContain('«Начать заново»');
  });
  it('«Клавиши»: щелчок по звезде в любом показе и по ромбу союза — карточка у знака; Enter на звезде или ромбе союза (решения 76, 77)', () => {
    const hows = POINTER_ROWS.map((r) => r.how);
    // этап 11 (решение 77): карточка у звезды — в любом показе, а не только в небе «набор»; «Информация» стала
    // «Карточкой» (STAGE11 § 6), «Подробнее» у ромба — «Карточкой союза», как в карточке связи (§ 8)
    expect(hows).toContain('щелчок по звезде');
    expect(hows).toContain('щелчок по ромбу союза');
    expect(POINTER_ROWS.find((r) => r.how === 'щелчок по звезде')?.what).toMatch(/^карточка у звезды с «Родством»: «Карточка» — подробная справа, «Только его род ▾», «Родство с…»; в показе «набор» — «Продолжить ветвь» и «Родители»/);
    expect(POINTER_ROWS.find((r) => r.how === 'щелчок по ромбу союза')?.what).toMatch(/^карточка союза у ромба: «Раскрыть детей».*«Свернуть детей».*«Карточка союза» — подробная справа/);
    // картушей на небе больше нет (решение 76): ни одна строка «Клавиш» их не называет
    expect([...KEY_ROWS.map((r) => r.what), ...POINTER_ROWS.flatMap((r) => [r.how, r.what])].join(' ')).not.toMatch(/картуш/);
    // Enter на точке союза — после строки «Enter — открыть карточку звезды»: первая строка с Enter остаётся прежней
    const enter = KEY_ROWS.map((r, i) => ({ r, i })).filter(({ r }) => r.keys.some((k) => k.en === 'Enter'));
    expect(enter[0].r.what).toMatch(/заголовок карточки/);
    const plate = enter.find(({ r }) => /на звезде или ромбе союза — открыть у неё карточку/.test(r.what));
    expect(plate && plate.i).toBeGreaterThan(enter[0].i);
    expect(plate?.r.what).toMatch(/Escape — закрыть/);
    expect(KEY_ROWS.find((r) => r.keys.some((k) => k.en === '←') && !r.mod)?.what).toMatch(/к ближайшей звезде или ромбу союза/);
  });
});
