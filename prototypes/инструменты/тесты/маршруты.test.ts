/**
 * Таблица адресов и маршрутизатор прототипа (09 § 4.4; 08 § 6.5): «состояние → адрес → то же состояние» для адресов сцен,
 * уровни перехода и снятие выбора по метке записи (08 ред. 3.3) — на поддельной истории, без DOM.
 */
import { describe, it, expect } from 'vitest';
import { parseUrl, formatUrl, transitionLevel } from '../общее/маршруты.ts';
import { Router, type EntryState, type HistoryPort } from '../общее/маршрутизатор.ts';
import { СЦЕНЫ } from './сцены.ts';

describe('адреса сцен', () => {
  for (const s of СЦЕНЫ)
    it(`/${s.адрес}`, () => {
      const r = parseUrl(`/${s.адрес}`);
      expect(r).not.toBeNull();
      expect(parseUrl(formatUrl(r!))).toEqual(r);
    });
  it('уровни: смена истории — 1, выбор во Времени — 2, вид — 3, первое лицо — 1, лицо сравнения — 3', () => {
    const a = parseUrl('/vremya?view=lives&p=p-noy')!;
    expect(transitionLevel(parseUrl('/istoriya/e-noy-i-potop')!, parseUrl('/istoriya/e-umer-samuil')!)).toBe(1);
    expect(transitionLevel(a, { ...a, params: { ...a.params, sel: 'p-noy' } })).toBe(2);
    expect(transitionLevel(a, { ...a, params: { ...a.params, view: 'events' } })).toBe(3);
    expect(transitionLevel(a, { ...a, params: { ...a.params, p: 'p-sim' } })).toBe(1);
    expect(transitionLevel(a, { ...a, params: { ...a.params, p: 'p-noy,p-sim' } })).toBe(3);
    expect(transitionLevel(parseUrl('/istoriya/e-noy-i-potop')!, parseUrl('/istoriya/e-noy-i-potop?view=sinopsis')!)).toBe(3);
  });
});

function история() {
  const стек: { s: EntryState | null; url: string }[] = [{ s: null, url: '/' }];
  let i = 0;
  let r: Router;
  const h: HistoryPort = {
    get state() {
      return стек[i]?.s ?? null;
    },
    push(s, url) {
      стек.splice(i + 1);
      стек.push({ s, url });
      i++;
    },
    replace(s, url) {
      стек[i] = { s, url };
    },
    go(n) {
      i += n;
      r.popstate(стек[i].s, стек[i].url);
    },
  };
  const снимки = new Map();
  r = new Router(h, { get: (k) => снимки.get(k), set: (k, v) => снимки.set(k, v) }, { nameOf: (x) => x.id ?? x.screen });
  return { r, стек: () => стек, i: () => i };
}

describe('маршрутизатор (08 § 6.5)', () => {
  it('история → Время → три выбора → Esc: запись выбора снимается back(), «Назад» — на историю', () => {
    const { r, стек, i } = история();
    r.start('/istoriya/e-noy-i-potop');
    r.go(parseUrl('/vremya?view=events')!);
    for (const id of ['e-kain-i-avel', 'e-sif-i-enos', 'e-noy-i-potop']) r.go({ ...r.route, params: { ...r.route.params, sel: id } });
    expect(стек().length).toBe(3);
    r.clearLevel2({ ...r.route, params: { view: 'events' } });
    expect(i()).toBe(1);
    expect(r.route.params.sel).toBeUndefined();
    expect(r.backTarget()?.label).toBe('Назад: e-noy-i-potop');
    r.back();
    expect(r.route.screen).toBe('istoriya');
  });
  it('экран открыт уже с выбором: снятие выбора — замена записи, а не уход', () => {
    const { r, стек } = история();
    r.start('/istoriya/e-noy-i-potop');
    r.go(parseUrl('/vremya?view=events&sel=e-noy-i-potop')!);
    r.clearLevel2(parseUrl('/vremya?view=events')!);
    expect(стек().length).toBe(2);
    expect(r.route.screen).toBe('vremya');
    expect(r.route.params.sel).toBeUndefined();
  });
  it('вход по ссылке — кнопки «Назад: …» нет', () => {
    const { r } = история();
    r.start('/kniga/byt');
    expect(r.backTarget()).toBeNull();
  });
});
