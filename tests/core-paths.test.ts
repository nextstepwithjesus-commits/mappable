/** Ядро: одна таблица адресов (09 § 4.4.1) и уровень перехода (09 § 4.4.2; 08 § 6.5). */
import { describe, it, expect } from 'vitest';
import { buildPath, parsePath, transitionLevel } from '../core/paths.ts';

const p = (u: string) => {
  const r = parsePath(u);
  if (!r) throw new Error(`не разобран ${u}`);
  return r;
};

describe('адреса экранов', () => {
  const urls = [
    '/', '/kniga/byt', '/kniga/byt/6#st9', '/kniga/1par/3', '/istoriya/e-noy-potop#chast-2', '/kartochka/p-adam#razdel-10',
    '/genealogiya?p=p-david&open=u-1,u-2&sel=p-solomon&list=1', '/vremya?p=p-avraam,p-isaak&e=era-judges&c=-1200&w=300',
    '/geografiya?show=put&stop=3', '/svyazi?p=p-david&sel=c-12', '/poisk?q=%D0%9D%D0%BE%D0%B9', '/nastroyki',
    '/genealogiya?p=p-david&ryadom=vremya&r.p=p-david&v=2026.10.2',
  ];
  it('состояние → адрес → то же состояние', () => {
    for (const u of urls) {
      const r = p(u);
      expect(buildPath(r), u).toBe(u);
      expect(parsePath(buildPath(r)), u).toEqual(r);
    }
  });
  it('неизвестный путь и книга — null', () => {
    expect(parsePath('/kniga/nebyt')).toBeNull();
    expect(parsePath('/neizvestno')).toBeNull();
    expect(parsePath('/kniga/byt/x')).toBeNull();
  });
  it('книга по коду адреса', () => {
    expect(p('/kniga/byt/6').book).toBe('Быт');
    expect(p('/kniga/byt/6').chapter).toBe(6);
  });
});

describe('уровень перехода считает ядро', () => {
  it('другой экран или предмет — 1', () => {
    expect(transitionLevel(p('/kartochka/p-adam'), p('/kartochka/p-eva'))).toBe(1);
    expect(transitionLevel(p('/genealogiya'), p('/vremya'))).toBe(1);
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-noy'))).toBe(1);
  });
  it('sel, list, stop — 2; прочее — 3; v — не влияет', () => {
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-adam&sel=p-kain'))).toBe(2);
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-adam&list=1'))).toBe(2);
    expect(transitionLevel(p('/geografiya?show=put'), p('/geografiya?show=put&stop=2'))).toBe(2);
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-adam&open=u-1'))).toBe(3);
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-adam&v=2026.10.2'))).toBe(0);
    expect(transitionLevel(p('/kniga/byt/6#st9'), p('/kniga/byt/6#st10'))).toBe(3);
  });
  it('Время: смена первого лица — 1, лицо сравнения — 3', () => {
    expect(transitionLevel(p('/vremya?p=p-avraam'), p('/vremya?p=p-isaak'))).toBe(1);
    expect(transitionLevel(p('/vremya?p=p-avraam'), p('/vremya?p=p-avraam,p-isaak'))).toBe(3);
  });
  it('«рядом» — 1', () => {
    expect(transitionLevel(p('/genealogiya?p=p-adam'), p('/genealogiya?p=p-adam&ryadom=vremya'))).toBe(1);
  });
});
