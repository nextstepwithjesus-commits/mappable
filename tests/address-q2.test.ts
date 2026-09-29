/**
 * Адрес и история показа (этап 11, § 5; решение 81; Я28): поля «~v» (показ), «~x» (связи наружу), «~c» (выбранная
 * связь); прежние «~o1», «~k1», «~t1» открываются; смена показа, выбор лица и выбор связи — новая запись истории
 * (pushState), раскрытие и свёртка — та же запись (replaceState); «назад» возвращает прежний показ, лицо и связь.
 * История браузера здесь подменена записью в памяти; окно неба и время перехода — сценарии tools/accept/show11.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { LinkKey } from '../src/engine/linkkey.ts';
import type { Show } from '../src/ui/work.ts';

interface Entry {
  state: unknown;
  url: string;
}
const entries: Entry[] = [{ state: null, url: '#/' }];
let at = 0;
const pushes: string[] = [];
const replaces: string[] = [];
const listeners = new Map<string, (() => void)[]>();
const loc = { hash: '#/' };

let address: typeof import('../src/ui/address.ts');
let showM: typeof import('../src/ui/show.ts');
let work: typeof import('../src/ui/work.ts');
let reveal: typeof import('../src/ui/reveal.ts');
let state: typeof import('../src/state.ts');
let linkstate: typeof import('../src/ui/linkstate.ts');
let atlas: typeof import('../src/data/atlas.ts');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Дождаться, пока адрес допишет запись (окно неба ждёт небо до 180 кадров; неба здесь нет). */
const settle = () => wait(700);
function back() {
  at--;
  loc.hash = entries[at].url;
  for (const f of listeners.get('popstate') ?? []) f();
}
function forward() {
  at++;
  loc.hash = entries[at].url;
  for (const f of listeners.get('popstate') ?? []) f();
}

beforeAll(async () => {
  const hist = {
    get state() {
      return entries[at].state;
    },
    pushState(st: unknown, _t: string, url: string) {
      entries.splice(at + 1);
      entries.push({ state: st, url });
      at++;
      loc.hash = url;
      pushes.push(url);
    },
    replaceState(st: unknown, _t: string, url: string) {
      entries[at] = { state: st, url };
      loc.hash = url;
      replaces.push(url);
    },
  };
  Object.assign(globalThis, {
    window: {
      addEventListener: (k: string, f: () => void) => listeners.set(k, [...(listeners.get(k) ?? []), f]),
      removeEventListener: (k: string, f: () => void) => listeners.set(k, (listeners.get(k) ?? []).filter((x) => x !== f)),
      history: hist,
      location: loc,
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    },
    location: loc,
    history: hist,
    document: { documentElement: { dataset: {} }, getElementById: () => null },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
  atlas = await import('../src/data/atlas.ts');
  state = await import('../src/state.ts');
  work = await import('../src/ui/work.ts');
  reveal = await import('../src/ui/reveal.ts');
  linkstate = await import('../src/ui/linkstate.ts');
  showM = await import('../src/ui/show.ts');
  address = await import('../src/ui/address.ts');
});

const has = (id: string) => atlas.byId.has(id);

describe('поля адреса: показ, связи наружу, выбранная связь (Я28)', () => {
  const shows: Show[] = [
    { kind: 'all' },
    { kind: 'lines' },
    { kind: 'key' },
    { kind: 'set' },
    { kind: 'groups', groups: ['nahorites'], links: 'stubs' },
    { kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' },
    { kind: 'groups', groups: ['benjamin'], links: 'none' },
    { kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' },
    { kind: 'lineage', id: 'iakov', dir: 'both', gen: 2, by: 'blood' },
  ];
  it('шесть показов туда и обратно: всё небо — без поля; остальные — «~v…», связи наружу — «~x»', () => {
    for (const sh of shows) {
      const s = address.formatAddress({ id: 'david', view: { year: -1010, width: 240, lane: 2 }, show: sh });
      expect(s, JSON.stringify(sh)).toMatch(/^#\/[a-z0-9._~-]*$/);
      if (sh.kind === 'all') expect(s).not.toMatch(/~v/);
      const a = address.parseAddress(s, has);
      expect(a.show ?? { kind: 'all' }, s).toEqual(sh);
    }
    expect(address.formatAddress({ id: null, show: { kind: 'groups', groups: ['nahorites'], links: 'stubs' } })).toBe('#/~vg.nahorites');
    expect(address.formatAddress({ id: null, show: { kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' } })).toBe('#/~vg.judah.davidic~x2');
    expect(address.formatAddress({ id: 'iuda', show: { kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' } })).toBe('#/iuda~vr.iuda.d.0.f');
  });
  it('прежние адреса: «~o1» — линии Мессии, «~k1» и «~t1» — набор (древа больше нет)', () => {
    expect(address.parseAddress('#/david~y-1010~w240~l2.5~o1', has).show).toEqual({ kind: 'lines' });
    expect(address.parseAddress('#/~k1~ndavid.iessey', has)).toMatchObject({ show: { kind: 'set' }, set: ['david', 'iessey'] });
    expect(address.parseAddress('#/adam~k1~nadam.eva~t1', has).show).toEqual({ kind: 'set' });
    expect(address.parseAddress('#/adam~t1', has).show).toEqual({ kind: 'set' });
    expect(address.parseAddress('#/david~y-1010~w240~l2.5', has).show).toBeUndefined();
  });
  it('испорченный показ не читается: неизвестное созвездие, лицо, поле', () => {
    expect(address.parseAddress('#/~vg.nobody', has).show).toBeUndefined();
    expect(address.parseAddress('#/~vr.nobody.d.0.f', has).show).toBeUndefined();
    expect(address.parseAddress('#/~vz', has).show).toBeUndefined();
    // испорченное «~v» не отменяет прежнего флажка
    expect(address.parseAddress('#/~vz~o1', has).show).toEqual({ kind: 'lines' });
  });
  it('выбранная связь «~c»: союз → ребёнок, черта брака, союз, шаг ленты, родство словами — туда и обратно', () => {
    const rakhil = reveal.originOf('iosif')[0];
    const keys: LinkKey[] = [
      { kind: 'child', union: rakhil.id, child: 'iosif' },
      { kind: 'spouse', union: rakhil.id, person: 'rakhil' },
      { kind: 'union', union: 'u:sif+' },
      { kind: 'step', line: 'joseph', child: 'solomon' },
      { kind: 'kin', a: 'saruiya', b: 'david' },
    ];
    for (const k of keys) {
      const s = address.formatAddress({ id: 'iosif', link: k });
      expect(s).toMatch(/^#\/[a-z0-9._~-]*$/);
      expect(address.parseAddress(s, has).link, s).toEqual(k);
    }
    expect(address.formatAddress({ id: 'iosif', link: keys[0] })).toBe('#/iosif~ck.iakov.rakhil._.iosif');
  });
  it('связь, которой нет в данных, не читается', () => {
    expect(address.parseAddress('#/iosif~ck.iakov.liya._.iosif', has).link).toBeUndefined();
    expect(address.parseAddress('#/iosif~cs.iakov.rakhil._.liya', has).link).toBeUndefined();
    expect(address.parseAddress('#/~cr.j.nafan-syn-davida', has).link).toBeUndefined();
    expect(address.parseAddress('#/~cn.david.ruf', has).link).toBeUndefined();
    expect(address.parseAddress('#/~cq.x', has).link).toBeUndefined();
  });
});

describe('история: показ, лицо и связь — новые записи; раскрытие — та же; «назад» возвращает (Я28)', () => {
  it('смена показа, выбор лица и связи пишутся pushState, «назад» возвращает их по одному', { timeout: 30_000 }, async () => {
    const off = address.bindAddress();
    await settle();
    const start = entries.length;
    showM.setShow({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    await settle();
    expect(entries.length).toBe(start + 1);
    expect(entries[at].url).toMatch(/~vg\.nahorites/);
    state.selected.value = 'lavan';
    await settle();
    expect(entries.length).toBe(start + 2);
    expect(entries[at].url).toMatch(/^#\/lavan~.*~vg\.nahorites/);
    const liya = reveal.originOf('liya')[0];
    linkstate.selectedLink.value = { kind: 'child', union: liya.id, child: 'liya' };
    await settle();
    expect(entries.length).toBe(start + 3);
    expect(entries[at].url).toMatch(/~ck\.lavan\._\._\.liya$/);
    // «назад»: связь снята, лицо и показ — прежние
    back();
    await settle();
    expect(linkstate.selectedLink.value).toBeNull();
    expect(state.selected.value).toBe('lavan');
    expect(work.show.value).toEqual({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    back();
    await settle();
    expect(state.selected.value).toBeNull();
    expect(work.show.value).toEqual({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    back();
    await settle();
    expect(work.show.value).toEqual({ kind: 'all' });
    // «вперёд» — снова созвездие, лицо и связь
    forward();
    forward();
    forward();
    await settle();
    expect(work.show.value).toEqual({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    expect(state.selected.value).toBe('lavan');
    expect(linkstate.selectedLink.value).toEqual({ kind: 'child', union: liya.id, child: 'liya' });
    off();
  });
  it('раскрытие и свёртка в наборе — та же запись; переход в набор раскрытием — новая', { timeout: 30_000 }, async () => {
    const off = address.bindAddress();
    await settle();
    linkstate.selectedLink.value = null;
    reveal.startWith('adam');
    await settle();
    expect(work.show.value).toEqual({ kind: 'set' });
    const n = entries.length;
    const u = reveal.unionsOf('adam')[0];
    reveal.expandUnion(u.id, 'adam');
    await settle();
    expect(entries.length, 'раскрытие — без новой записи').toBe(n);
    expect(entries[at].url).toMatch(/~vs~nadam\./);
    expect(work.showAnchor.value).toBe('adam');
    reveal.collapseUnion(u.id);
    await settle();
    expect(entries.length, 'свёртка — без новой записи').toBe(n);
    // из другого показа раскрытие переводит в набор — это смена показа, новая запись
    showM.setShow({ kind: 'lines' });
    await settle();
    const m = entries.length;
    reveal.expandUnion(u.id, 'adam');
    await settle();
    expect(work.show.value).toEqual({ kind: 'set' });
    expect(entries.length).toBe(m + 1);
    back();
    await settle();
    expect(work.show.value).toEqual({ kind: 'lines' });
    off();
  });
  it('флажок «только линии» — производный от показа; его запись меняет показ и «назад» возвращает прежний', { timeout: 30_000 }, async () => {
    const off = address.bindAddress();
    await settle();
    showM.setShow({ kind: 'key' });
    await settle();
    state.onlyLines.value = true;
    expect(work.show.value).toEqual({ kind: 'lines' });
    state.onlyLines.value = false;
    expect(work.show.value).toEqual({ kind: 'key' });
    showM.setShow({ kind: 'lines' });
    expect(state.onlyLines.value).toBe(true);
    showM.setShow({ kind: 'all' });
    expect(state.onlyLines.value).toBe(false);
    expect(work.skyMode.value).toBe('all');
    // прежний переключатель «все лица | набор» — тоже через показ
    work.skyMode.value = 'work';
    expect(work.show.value).toEqual({ kind: 'set' });
    work.skyMode.value = 'all';
    expect(work.show.value).toEqual({ kind: 'all' });
    await settle();
    off();
  });
});
