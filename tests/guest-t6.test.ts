/**
 * Временный гость (этап 13, решение 93, К3; контракт 3 — src/ui/show.ts, showGuest): лицо вне показа встаёт на небо
 * гостем до снятия выбора; адрес пишет его полем «~g» за «~c», ссылка воспроизводит вид, «назад» убирает гостя.
 * История браузера подменена записью в памяти, как в address-q2.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';

interface Entry {
  state: unknown;
  url: string;
}
const entries: Entry[] = [{ state: null, url: '#/' }];
let at = 0;
const listeners = new Map<string, (() => void)[]>();
const loc = { hash: '#/' };

let address: typeof import('../src/ui/address.ts');
let showM: typeof import('../src/ui/show.ts');
let work: typeof import('../src/ui/work.ts');
let state: typeof import('../src/state.ts');
let linkstate: typeof import('../src/ui/linkstate.ts');
let atlas: typeof import('../src/data/atlas.ts');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => wait(700);
function back() {
  at--;
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
    },
    replaceState(st: unknown, _t: string, url: string) {
      entries[at] = { state: st, url };
      loc.hash = url;
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
  linkstate = await import('../src/ui/linkstate.ts');
  showM = await import('../src/ui/show.ts');
  address = await import('../src/ui/address.ts');
});

const has = (id: string) => atlas.byId.has(id);
const ILIY = 'iliy-otets-marii';
const STEP = { kind: 'step', line: 'mary', child: 'mariya' } as const;

describe('контракт 3: показать лицо временным гостем', () => {
  it('Илий вне «ключевых лиц»: гость до снятия выбора связи, небо перестраивается по новому ключу', () => {
    showM.setShow({ kind: 'key' });
    state.selected.value = null;
    linkstate.selectedLink.value = STEP;
    expect(showM.showContent.value.ids.has(ILIY)).toBe(false);
    expect(showM.showContent.value.guests.has(ILIY)).toBe(false);
    const key0 = showM.skyShow.value.key;
    expect(showM.showGuest(ILIY)).toBe('guest');
    expect(showM.linkGuests.value).toEqual([ILIY]);
    expect(showM.showContent.value.guests.has(ILIY)).toBe(true);
    expect(showM.skyShow.value.guests.has(ILIY)).toBe(true);
    expect(showM.skyShow.value.key).not.toBe(key0);
    // повторный щелчок ничего не меняет; лицо показа — уже на небе
    expect(showM.showGuest(ILIY)).toBe('shown');
    expect(showM.showGuest('mariya')).toBe('shown');
    // выбор снят — гость ушёл
    linkstate.selectedLink.value = null;
    expect(showM.linkGuests.value).toEqual([]);
    expect(showM.showContent.value.guests.has(ILIY)).toBe(false);
    expect(showM.guestState.value).toBeNull();
  });
  it('без выбранной связи гость относится к выбранному лицу; смена показа его убирает', () => {
    showM.setShow({ kind: 'key' });
    state.selected.value = 'mariya';
    expect(showM.showGuest(ILIY)).toBe('guest');
    expect(showM.linkGuests.value).toEqual([ILIY]);
    // выбор связи при том же лице гостя не снимает
    linkstate.selectedLink.value = STEP;
    expect(showM.linkGuests.value).toEqual([ILIY]);
    linkstate.selectedLink.value = null;
    showM.setShow({ kind: 'lines' });
    expect(showM.linkGuests.value).toEqual([]);
    showM.setShow({ kind: 'key' });
    expect(showM.linkGuests.value).toEqual([]);
    state.selected.value = null;
  });
  it('во всём небе лицо уже на небе: гостя нет', () => {
    showM.setShow({ kind: 'all' });
    linkstate.selectedLink.value = STEP;
    expect(showM.showGuest(ILIY)).toBe('shown');
    expect(showM.linkGuests.value).toEqual([]);
    linkstate.selectedLink.value = null;
  });
  it('решение 113: результаты поиска вне показа — гостями, пока стоят отметки; участок — пока подсвечен; найденное лицо — пока выбрано', () => {
    showM.setShow({ kind: 'key' });
    state.selected.value = null;
    const ids = ['iliy-otets-marii', 'mariya'];
    state.pins.value = ids;
    expect(showM.showResults(ids, 'search', 'pins')).toBe(1);
    expect(showM.resultIds.value).toEqual(['iliy-otets-marii']);
    expect(showM.showContent.value.guests.has('iliy-otets-marii')).toBe(true);
    state.pins.value = [];
    expect(showM.resultIds.value).toEqual([]);
    // участок Синопсиса
    state.skyGroup.value = { ids, label: 'участок', kind: 'segment', line: 'both' };
    expect(showM.showResults(ids, 'synopsis', 'group')).toBe(1);
    state.skyGroup.value = null;
    expect(showM.resultIds.value).toEqual([]);
    // найденное лицо
    state.selected.value = 'iliy-otets-marii';
    showM.showResults(['iliy-otets-marii'], 'search', 'selected', 'iliy-otets-marii');
    expect(showM.resultIds.value).toEqual(['iliy-otets-marii']);
    state.selected.value = 'mariya';
    expect(showM.resultIds.value).toEqual([]);
    // всё небо — гостей не нужно
    showM.setShow({ kind: 'all' });
    expect(showM.showResults(ids, 'search', 'pins')).toBe(0);
    state.selected.value = null;
  });
  it('решение 130: понимание Лк 3 — в адресе «~j1»; запись истории и «назад» его возвращают', { timeout: 30_000 }, async () => {
    expect(address.formatAddress({ id: 'iosif-muzh-marii', luke: true })).toBe('#/iosif-muzh-marii~j1');
    expect(address.parseAddress('#/iosif-muzh-marii~j1', has).luke).toBe(true);
    expect(address.parseAddress('#/iosif-muzh-marii~y-10~w40~l0', has).luke).toBeUndefined();
    const off = address.bindAddress();
    await settle();
    state.lineFlip.value = false;
    await settle();
    const n = entries.length;
    state.lineFlip.value = true;
    await settle();
    expect(entries.length).toBe(n + 1);
    expect(entries[at].url).toMatch(/~j1/);
    back();
    await settle();
    expect(state.lineFlip.value).toBe(false);
    off();
  });
  it('адрес: «~g» за «~c» туда и обратно; чужие и битые id не читаются', () => {
    const s = address.formatAddress({ id: 'mariya', show: { kind: 'key' }, link: STEP, guests: [ILIY] });
    expect(s).toBe(`#/mariya~vk~cr.m.mariya~g${ILIY}`);
    const a = address.parseAddress(s, has);
    expect(a.link).toEqual(STEP);
    expect(a.guests).toEqual([ILIY]);
    expect(address.parseAddress('#/mariya~vk~gnobody.Iliy', has).guests).toBeUndefined();
  });
  it('гость — новая запись истории; «назад» убирает гостя, связь остаётся; ссылка воспроизводит вид', { timeout: 30_000 }, async () => {
    const off = address.bindAddress();
    await settle();
    showM.setShow({ kind: 'key' });
    await settle();
    linkstate.selectedLink.value = STEP;
    await settle();
    const n = entries.length;
    showM.showGuest(ILIY);
    await settle();
    expect(entries.length).toBe(n + 1);
    expect(entries[at].url).toMatch(new RegExp(`~cr\\.m\\.mariya~g${ILIY}$`));
    const url = entries[at].url;
    back();
    await settle();
    expect(showM.linkGuests.value).toEqual([]);
    expect(linkstate.selectedLink.value).toEqual(STEP);
    expect(work.show.value).toEqual({ kind: 'key' });
    // ссылка извне с «~g»
    loc.hash = url;
    for (const f of listeners.get('popstate') ?? []) f();
    await settle();
    expect(showM.linkGuests.value).toEqual([ILIY]);
    expect(showM.showContent.value.guests.has(ILIY)).toBe(true);
    off();
    linkstate.selectedLink.value = null;
  });
});
