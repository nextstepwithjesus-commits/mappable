/**
 * П-Т5: модель возврата 08 § 6.5 на поддельной истории браузера (те же правила, что History API:
 * push обрезает «вперёд», go вызывает popstate). Поведение в настоящем браузере — tests/behavior.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { Router, type EntryState, type HistoryPort, type Snapshot } from './router.ts';
import { parseUrl, formatUrl, transitionLevel, applyRedirects, type Route } from './routes.ts';

class FakeHistory implements HistoryPort {
  entries: { state: EntryState | null; url: string }[] = [];
  i = -1;
  onpop: (s: unknown, url: string) => void = () => {};
  constructor(url: string) {
    this.entries.push({ state: null, url });
    this.i = 0;
  }
  get state() {
    return this.entries[this.i].state;
  }
  get url() {
    return this.entries[this.i].url;
  }
  get length() {
    return this.entries.length;
  }
  push(state: EntryState, url: string) {
    this.entries = this.entries.slice(0, this.i + 1);
    this.entries.push({ state, url });
    this.i++;
  }
  replace(state: EntryState, url: string) {
    this.entries[this.i] = { state, url };
  }
  go(n: number) {
    const j = Math.max(0, Math.min(this.entries.length - 1, this.i + n));
    if (j === this.i) return;
    this.i = j;
    this.onpop(this.state, this.url);
  }
}

const NAMES: Record<string, string> = { noy: 'Ной', david: 'Давид', 's-noy': 'Ной и потоп' };
function nameOf(r: Route): string {
  if (r.screen === 'istoriya') return NAMES[r.id!] ?? r.id!;
  const tool = { genealogiya: 'Генеалогия', vremya: 'Время' }[r.screen as string] ?? r.screen;
  const p = r.params.p?.split(',')[0];
  return p ? `${NAMES[p] ?? p} — ${tool}` : tool;
}

function setup(url: string, snap: () => Snapshot = () => ({})) {
  const h = new FakeHistory(url);
  const store = new Map<string, Snapshot>();
  let n = 0;
  const r = new Router(h, { get: (k) => store.get(k), set: (k, s) => store.set(k, s) }, { nameOf, snapshotNow: snap, newKey: () => `k${n++}` });
  h.onpop = (s, u) => r.popstate(s, u);
  r.start(url);
  const go = (u: string, label?: string) => r.go(parseUrl(u)!, { label });
  return { h, r, go, store };
}

describe('модель возврата 08 § 6.5', () => {
  it('сценарий 08 § 6.5: история → инструмент → три выбора → лист → пять шагов вида → «Назад» × 2 = страница истории', () => {
    const { h, r, go } = setup('/istoriya/s-noy');
    go('/genealogiya?p=noy');
    go('/genealogiya?p=noy&sel=sim');
    go('/genealogiya?p=noy&sel=khamm');
    go('/genealogiya?p=noy&sel=iafet');
    go('/genealogiya?p=noy&sel=iafet&list=1');
    for (const o of ['u1', 'u1,u2', 'u1,u2,u3', 'u1,u2,u3,u4', 'u1,u2,u3,u4,u5']) go(`/genealogiya?p=noy&sel=iafet&list=1&open=${o}`, `раскрыть ${o}`);
    expect(h.length).toBe(3); // история, экран инструмента, запись выбора
    h.go(-1);
    expect(r.route.screen).toBe('genealogiya');
    expect(r.route.params.sel).toBeUndefined();
    expect(r.route.params.list).toBeUndefined();
    expect(r.route.params.open).toBe('u1,u2,u3,u4,u5'); // окно остаётся как есть
    h.go(-1);
    expect(r.route.screen).toBe('istoriya');
    expect(r.route.id).toBe('s-noy');
  });

  it('кнопка «Назад: …» — одним нажатием на прежний экран, пропуская запись выбора (go(-2))', () => {
    const { h, r, go } = setup('/istoriya/s-noy');
    go('/genealogiya?p=noy');
    go('/genealogiya?p=noy&sel=sim');
    expect(r.backTarget()).toEqual({ label: 'Назад: Ной и потоп', delta: -2 });
    r.back();
    expect(r.route.screen).toBe('istoriya');
    expect(h.i).toBe(0);
  });

  it('без выбора кнопка делает go(-1); имя — по записи прежнего экрана', () => {
    const { r, go } = setup('/genealogiya?p=david');
    go('/vremya?p=david');
    expect(r.backTarget()).toEqual({ label: 'Назад: Давид — Генеалогия', delta: -1 });
  });

  it('вход по ссылке — кнопки «Назад: …» нет (путь вверх — хлебные крошки)', () => {
    const { r } = setup('/genealogiya?p=noy&sel=sim');
    expect(r.backTarget()).toBeNull();
  });

  it('выбор — одна запись на экран: после возврата и нового входа — снова одна', () => {
    const { h, go } = setup('/istoriya/s-noy');
    go('/genealogiya?p=noy');
    for (const s of ['a', 'b', 'c', 'd']) go(`/genealogiya?p=noy&sel=${s}`);
    expect(h.length).toBe(3);
    go('/vremya?p=noy');
    go('/vremya?p=noy&sel=x');
    go('/vremya?p=noy&sel=y');
    expect(h.length).toBe(5);
  });

  it('шаг вида — замена: история не растёт, адрес описывает вид', () => {
    const { h, go } = setup('/vremya?p=noy');
    go('/vremya?p=noy&view=zhizni', 'вид «Жизни»');
    go('/vremya?p=noy&view=zhizni&c=-2300&w=400', 'сдвиг');
    expect(h.length).toBe(1);
    expect(h.url).toBe('/vremya?p=noy&view=zhizni&c=-2300&w=400');
  });

  it('Время: смена первого лица — новый экран; добавить лицо сравнения — шаг вида', () => {
    const a = parseUrl('/vremya?p=noy')!;
    expect(transitionLevel(a, parseUrl('/vremya?p=david')!)).toBe(1);
    expect(transitionLevel(a, parseUrl('/vremya?p=noy,sim')!)).toBe(3);
    expect(transitionLevel(parseUrl('/vremya?p=noy,sim')!, parseUrl('/vremya?p=noy')!)).toBe(3);
  });

  it('«Отменить шаг» и «Вернуть шаг»: только вид, выбор и лист не трогаются, история не растёт', () => {
    const { h, r, go } = setup('/genealogiya?p=noy');
    go('/genealogiya?p=noy&sel=sim');
    go('/genealogiya?p=noy&sel=sim&open=u1', 'раскрыть детей Сима');
    go('/genealogiya?p=noy&sel=khamm&open=u1');
    expect(r.undoLabel).toBe('раскрыть детей Сима');
    const len = h.length;
    r.undo();
    expect(r.route.params.open).toBeUndefined();
    expect(r.route.params.sel).toBe('khamm');
    expect(h.length).toBe(len);
    r.redo();
    expect(r.route.params.open).toBe('u1');
  });

  it('журнал шагов живёт, пока открыт экран', () => {
    const { r, go } = setup('/genealogiya?p=noy');
    go('/genealogiya?p=noy&open=u1', 'раскрыть');
    go('/vremya?p=noy');
    expect(r.undoLabel).toBeNull();
  });

  it('снимок экрана пишется при уходе и возвращается при «Назад» на этот экран', () => {
    let focus = 'mark-sim';
    const { h, r, go } = setup('/genealogiya?p=noy', () => ({ focus, scroll: 1234 }));
    go('/genealogiya?p=noy&sel=sim');
    go('/vremya?p=sim');
    focus = 'bar-sim';
    let snap: Snapshot | undefined;
    r.onChange((c) => {
      if (c.cause === 'pop-other') snap = c.snapshot;
    });
    h.go(-1);
    expect(r.route.screen).toBe('genealogiya');
    expect(r.route.params.sel).toBe('sim');
    expect(snap).toEqual({ focus: 'mark-sim', scroll: 1234 });
  });

  it('«Вперёд» браузера после «Назад» возвращает выбор', () => {
    const { h, r, go } = setup('/genealogiya?p=noy');
    go('/genealogiya?p=noy&sel=sim');
    h.go(-1);
    expect(r.route.params.sel).toBeUndefined();
    h.go(1);
    expect(r.route.params.sel).toBe('sim');
  });

  it('Esc снимает выбор заменой: запись уровня 2 остаётся без выбора, следующий «Назад» браузера — тот же экран (пустой шаг)', () => {
    const { h, r, go } = setup('/istoriya/s-noy');
    go('/genealogiya?p=noy');
    go('/genealogiya?p=noy&sel=sim');
    go('/genealogiya?p=noy'); // Esc: снять выбор
    expect(h.length).toBe(3);
    expect(r.backTarget()?.delta).toBe(-2); // кнопка «Назад: …» всё равно уходит на прежний экран одним нажатием
    h.go(-1);
    expect(r.route.screen).toBe('genealogiya'); // системный «Назад» сначала делает пустой шаг
  });

  it('перезагрузка: запись истории сохраняет шаг и имя прежнего экрана', () => {
    const { h, go } = setup('/istoriya/s-noy');
    go('/genealogiya?p=noy');
    const st = h.state;
    const h2 = new FakeHistory(h.url);
    h2.entries[0].state = st;
    const r2 = new Router(h2, { get: () => undefined, set: () => {} }, { nameOf });
    r2.start(h.url);
    expect(r2.backTarget()?.label).toBe('Назад: Ной и потоп');
  });
});

describe('адреса 09 § 4.4.1: состояние → адрес → то же состояние', () => {
  const urls = [
    '/',
    '/kniga/byt',
    '/kniga/1par/3#st5',
    '/istoriya/s-noy#chast-2',
    '/kartochka/david#razdel-10',
    '/genealogiya?p=david&show=messiya&sel=solomon&list=1&open=u1,u2',
    '/vremya?p=david,saul&sel=saul&view=zhizni&e=tsari&c=-1000&w=120&model=m1',
    '/geografiya?show=iskhod&stop=st-12&list=1&e=iskhod&view=sinay',
    '/svyazi?p=david&pair=saul&f=rodstvo',
    `/poisk?q=${encodeURIComponent('Ной')}`,
    '/nastroyki',
    '/genealogiya?p=david&ryadom=vremya&r.p=david&r.view=zhizni',
  ];
  for (const u of urls)
    it(u, () => {
      const r = parseUrl(u)!;
      expect(r).not.toBeNull();
      expect(formatUrl(r)).toBe(u);
      expect(parseUrl(formatUrl(r))).toEqual(r);
    });
  it('слой, тема и прочие настройки (уровень 5) в адрес не попадают', () => {
    expect(formatUrl(parseUrl('/genealogiya?p=david&sloy=2&tema=temnaya')!)).toBe('/genealogiya?p=david');
  });
  it('номер выпуска данных: только в ссылке на вид, на уровень не влияет', () => {
    const r = parseUrl('/vremya?p=noy&view=zhizni&v=probe-f69fa7d')!;
    expect(r.params.v).toBe('probe-f69fa7d');
    expect(formatUrl(r)).toBe('/vremya?p=noy&view=zhizni');
    expect(formatUrl(r, { version: true })).toBe('/vremya?p=noy&view=zhizni&v=probe-f69fa7d');
    expect(transitionLevel(r, parseUrl('/vremya?p=noy&view=zhizni')!)).toBe(0);
  });
  it('переадресация номера (base/redirects.json): один номер — переход со строкой', () => {
    const a = applyRedirects(parseUrl('/genealogiya?p=iliy-otets-marii')!, { 'iliy-otets-marii': ['iliy-syn-matfata'] });
    expect(a.route.params.p).toBe('iliy-syn-matfata');
    expect(a.notes.length).toBe(1);
    const b = applyRedirects(parseUrl('/kartochka/x')!, { x: ['y', 'z'] });
    expect(b.choose).toEqual({ from: 'x', to: ['y', 'z'] });
  });
  it('длина адреса «всё раскрыто у Давида» (8 союзов) — в пределах 2 000 знаков', () => {
    const open = Array.from({ length: 8 }, (_, i) => `u-david-${i + 1}`).join(',');
    expect(formatUrl(parseUrl(`/genealogiya?p=david&open=${open}`)!).length).toBeLessThan(2000);
  });
});
