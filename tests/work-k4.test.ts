/**
 * Рабочий набор: отклик клавиш и адрес (этап 7, K4; IX-51, MOB-55, IX-67, решения 26 и 34) без браузера.
 * Поведение в браузере — сценарии 250–269 (tools/accept/skyin.ts).
 */
import { describe, expect, it } from 'vitest';
import { byId } from '../src/data/atlas.ts';
import { focused, selected } from '../src/state.ts';
import {
  SKY_MODES, WORK_URL_MAX, clearWork, foldDesc, groupFoldText, keyTarget, workKey, workKeyText, workSet,
} from '../src/ui/work.ts';
import { formatAddress, parseAddress } from '../src/ui/address.ts';

const has = (id: string) => byId.has(id);

describe('переключатель неба (решение 26; IX-59)', () => {
  it('«все лица | набор» — одно слово, одно действие', () => {
    expect(SKY_MODES.map((m) => m.label)).toEqual(['все лица', 'набор']);
  });
});

describe('клавиши набора: чья звезда и что сказать (IX-51, MOB-55)', () => {
  it('цель клавиши В: звезда с кольцом клавиатуры, иначе звезда с видимой подсказкой, иначе выбранное лицо', () => {
    selected.value = 'david';
    focused.value = null;
    expect(keyTarget(null)).toBe('david');
    expect(keyTarget('iessey')).toBe('iessey');
    focused.value = 'ruf';
    expect(keyTarget('iessey')).toBe('ruf');
    focused.value = null;
    selected.value = null;
    expect(keyTarget(null)).toBe(null);
  });
  it('В берёт и убирает, С сворачивает и разворачивает; ответ для живой области — с именем в начале и глаголом по роду', () => {
    clearWork();
    const t = workKey('KeyD', 'iessey')!;
    expect(t).toEqual({ kind: 'take', id: 'iessey', size: 1 });
    // этап 11 (Я30, решение 81): одно слово — «набор»; «в работу» в интерфейсе больше нет
    expect(workKeyText(t)).toBe('Иессей добавлен в набор; в наборе 1 лицо');
    const r = workKey('KeyD', 'ruf')!;
    expect(workKeyText(r)).toBe('Руфь добавлена в набор; в наборе 2 лица');
    expect(workKeyText(workKey('KeyD', 'ruf')!)).toBe('Руфь убрана из набора; в наборе 1 лицо');
    expect(workKeyText(workKey('KeyD', 'iessey')!)).toBe('Иессей убран из набора; набор пуст');
    expect(workSet.value.size).toBe(0);
    const f = workKey('KeyC', 'david')!;
    expect(f).toEqual({ kind: 'fold', id: 'david' });
    expect(foldDesc.value).toContain('david');
    // этап 13, решение 109: на небе — «скрыть» и «показать»
    expect(workKeyText({ kind: 'fold', id: f.id, hidden: 62 })).toBe('Давид: потомки скрыты на небе, 62 лица');
    const u = workKey('KeyC', 'david')!;
    expect(workKeyText(u)).toBe('Давид: потомки снова на небе');
    expect(workKey('KeyX', 'david')).toBeNull();
    expect(workKey('KeyD', null)).toBeNull();
  });
  it('счёт лиц — по правилам русского числа', () => {
    const size = (n: number) => workKeyText({ kind: 'take', id: 'david', size: n }).replace(/^.*в наборе /, '');
    expect([1, 2, 5, 11, 12, 21, 22, 25, 101, 112].map(size)).toEqual([
      '1 лицо', '2 лица', '5 лиц', '11 лиц', '12 лиц', '21 лицо', '22 лица', '25 лиц', '101 лицо', '112 лиц',
    ]);
  });
  it('свёртка созвездия вслух — без согласования с названием (UX-51)', () => {
    expect(groupFoldText('Дом Саулов', true, 65)).toBe('Созвездие «Дом Саулов» скрыто на небе: 65 лиц');
    expect(groupFoldText('Дом Саулов', false, 0)).toBe('Созвездие «Дом Саулов» снова на небе');
  });
});

describe('режим неба и набор в адресе (решение 34; IX-67)', () => {
  it('показ «набор» — поле «~vs»; n — набор до 12 лиц через точку; простые символы; прежнее «~k1» открывается набором', () => {
    // этап 11 (решение 81): режим «набор» стал показом «набор» и пишется полем показа «~vs»
    const s = formatAddress({ id: 'david', work: true, set: ['david', 'iessey', 'ovid'] });
    expect(s).toBe('#/david~vs~ndavid.iessey.ovid');
    expect(/^#\/[a-z0-9._~-]*$/.test(s)).toBe(true);
    const a = parseAddress(s, has);
    expect(a.show).toEqual({ kind: 'set' });
    expect(a.set).toEqual(['david', 'iessey', 'ovid']);
    expect(a.full).toBe(true);
    const old = parseAddress('#/david~k1~ndavid.iessey.ovid', has);
    expect(old.show).toEqual({ kind: 'set' });
    expect(old.set).toEqual(['david', 'iessey', 'ovid']);
  });
  it('набор длиннее 12 лиц — только показ; всё небо — без набора', () => {
    const many = [...byId.keys()].slice(0, WORK_URL_MAX + 1);
    expect(formatAddress({ id: null, work: true, set: many })).toBe('#/~vs');
    expect(formatAddress({ id: null, work: true, set: many.slice(0, WORK_URL_MAX) })).toMatch(/~n[a-z0-9.-]+$/);
    expect(formatAddress({ id: 'david', work: false, set: ['david'] })).toBe('#/david');
    expect(formatAddress({ id: 'david', show: { kind: 'all' }, set: ['david'] })).toBe('#/david');
  });
  it('неизвестные и повторённые id набора пропускаются; не больше 12', () => {
    const a = parseAddress('#/~k1~ndavid.nobody.david.ruf', has);
    expect(a.set).toEqual(['david', 'ruf']);
    const b = parseAddress('#/~k0', has);
    expect(b.work).toBe(false);
    expect(b.set).toBeUndefined();
  });
});
