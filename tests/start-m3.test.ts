/**
 * Пять начал, «Начать заново», строка раскрытия, «В работе», условные знаки и «О карте» (решения 68, 70, 72; задача M3):
 *  — вступление при первом посещении предлагает пять начал, быстрые входы остаются ниже; выбранное начало — без выбора;
 *  — выбор, который заменяет набор больше одного лица, сначала спрашивает; «всё небо» набор не трогает;
 *  — строка режима «набор» в раскрытии: «Раскрыто 12 лиц» со склонением;
 *  — группы «В работе» после раскрытия Адам → союз → Каин → союз читаются: «Адам и его семья (5)», «Семья Каина (1)»;
 *  — справка называет союз на небе, «+» нераскрытых союзов, подсветку ветвей, пять начал и «Начать заново».
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
import { Cartouche, revealing, revealLineText, workLineText } from '../src/ui/sky/Overlays.tsx';
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
    expect(flat(startNote('all'))).toBe(`все ${flat(String(byId.size).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))} лиц сразу`);
    expect(flat(startNote('key'))).toMatch(new RegExp(`${KEY_IDS.length} (лицо|лица|лиц)$`));
  });
  it('подтверждение — только если начало заменяет набор больше чем из одного лица; «всё небо» набор не трогает', () => {
    expect(needsConfirm('adam', 1)).toBe(false);
    expect(needsConfirm('adam', 2)).toBe(true);
    expect(needsConfirm('lines', 104)).toBe(true);
    expect(needsConfirm('all', 104)).toBe(false);
  });
  it('вопрос — с родительным падежом числа: «Набор из 21 лица», «из 104 лиц»', () => {
    expect(flat(replaceText(21))).toBe('Набор из 21 лица будет заменён');
    expect(flat(replaceText(2))).toBe('Набор из 2 лиц будет заменён');
    expect(flat(replaceText(104))).toBe('Набор из 104 лиц будет заменён');
    expect(flat(replaceText(1001))).toBe('Набор из 1 001 лица будет заменён');
  });
  it('выбор начала: набор начала, небо «набор»; «всё небо» — небо «все лица», набор прежний', () => {
    startWith('key');
    expect(start.value).toBe('key');
    expect(workSet.value.size).toBe(KEY_IDS.length);
    expect(skyMode.value).toBe('work');
    startWith('all');
    expect(skyMode.value).toBe('all');
    expect(workSet.value.size).toBe(KEY_IDS.length);
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

describe('строка режима «набор» в раскрытии (решение 72)', () => {
  it('раскрытие — начало выбрано и это не «всё небо»', () => {
    expect(revealing(null)).toBe(false);
    expect(revealing('all')).toBe(false);
    expect(revealing('adam')).toBe(true);
    expect(revealing('key')).toBe(true);
  });
  it('«Раскрыто N лиц» со склонением; прежняя строка набора не меняется', () => {
    expect(flat(revealLineText(1))).toBe('Раскрыто 1 лицо');
    expect(flat(revealLineText(22))).toBe('Раскрыто 22 лица');
    expect(flat(revealLineText(12))).toBe('Раскрыто 12 лиц');
    expect(flat(revealLineText(104))).toBe('Раскрыто 104 лица');
    expect(workLineText(12, null)).toBe('На небе — только рабочий набор, 12 лиц');
  });
});

describe('«В работе» после раскрытия Адам → Ева, Каин, Авель, Сиф → Каин → Енох (решение 72)', () => {
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
  it('«Клавиши»: щелчок по лицу в небе «набор» и по картушу союза; Enter на картуше', () => {
    const hows = POINTER_ROWS.map((r) => r.how);
    expect(hows).toContain('щелчок по лицу в небе «набор»');
    expect(hows).toContain('щелчок по картушу союза');
    // Enter на картуше — после строки «Enter — открыть карточку звезды»: первая строка с Enter остаётся прежней
    const enter = KEY_ROWS.map((r, i) => ({ r, i })).filter(({ r }) => r.keys.some((k) => k.en === 'Enter'));
    expect(enter[0].r.what).toMatch(/заголовок карточки/);
    const plate = enter.find(({ r }) => /картуше союза/.test(r.what));
    expect(plate && plate.i).toBeGreaterThan(enter[0].i);
    expect(KEY_ROWS.find((r) => r.keys.some((k) => k.en === '←') && !r.mod)?.what).toMatch(/к ближайшей звезде или картушу союза/);
  });
});
