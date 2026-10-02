/**
 * Этап 16 (исполнитель S): рассказ «От Адама до Иисуса Христа» (решение 187) и фокус созвездия (решение 185).
 *  — шаги data/story.json: эпоха, опорное лицо, кадр, стихи — все стихи есть в сборке (приёмка О6);
 *  — строки шага из графа: ветви опорного лица по союзам (решение 69), место на лентах Мессии;
 *  — адрес: «~r» (шаг с единицы), «~z» (созвездие в фокусе), «~f» (врезка семьи, договор F);
 *  — каждый шаг — своя запись истории; «назад» возвращает прежний шаг; запись без «~r» закрывает рассказ;
 *  — Escape: врезка первой, фокус созвездия раньше «Ближайшей родни», рассказ раньше выбранного лица;
 *  — порог раскрытия по плотности: множители 0,6…1,6, фокус — 1 у своего созвездия и вложенных, 0 у прочих.
 * История браузера подменена записью в памяти, как в tests/address-q2.test.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
let state: typeof import('../src/state.ts');
let atlas: typeof import('../src/data/atlas.ts');
let story: typeof import('../src/ui/story/story.ts');
let storyState: typeof import('../src/ui/story/state.ts');
let facts: typeof import('../src/ui/story/facts.ts');
let areas: typeof import('../src/ui/story/areas.ts');
let density: typeof import('../src/ui/story/density.ts');
let keys: typeof import('../src/ui/keys.ts');
let reveal: typeof import('../src/ui/reveal.ts');

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
  reveal = await import('../src/ui/reveal.ts');
  storyState = await import('../src/ui/story/state.ts');
  story = await import('../src/ui/story/story.ts');
  facts = await import('../src/ui/story/facts.ts');
  areas = await import('../src/ui/story/areas.ts');
  density = await import('../src/ui/story/density.ts');
  keys = await import('../src/ui/keys.ts');
  address = await import('../src/ui/address.ts');
});

const has = (id: string) => atlas.byId.has(id);
const names = (ids: readonly (string | null)[]) => ids.map((id) => (id ? atlas.byId.get(id)?.name : null));

describe('шаги рассказа (решение 187; приёмка О6)', () => {
  it('восемь шагов: эпоха, опорное лицо в кадре, лица кадра, годы по порядку, один-два стиха', () => {
    const S = storyState.STORY_STEPS;
    expect(S.map((s) => s.short)).toEqual(['Адам', 'Патриархи', 'Колена', 'Исход', 'Судьи', 'Царство', 'Плен', 'Евангелие']);
    const epochs = new Set(atlas.epochs.map((e) => e.id));
    for (const s of S) {
      expect(epochs.has(s.epoch), s.id).toBe(true);
      expect(has(s.focus), s.id).toBe(true);
      expect(s.frame.persons.includes(s.focus), s.id).toBe(true);
      for (const id of s.frame.persons) expect(has(id), `${s.id}: ${id}`).toBe(true);
      expect(s.frame.years[0] < s.frame.years[1], s.id).toBe(true);
      expect(s.refs.length >= 1 && s.refs.length <= 2, s.id).toBe(true);
    }
    // шаги идут по времени: окна шагов не убывают
    for (let i = 1; i < S.length; i++) expect(S[i].frame.years[0] >= S[i - 1].frame.years[0], S[i].id).toBe(true);
  });
  it('все стихи шагов — в сборке (src/generated/verses), тот же текст Синодального перевода', () => {
    const dir = join(__dirname, '..', 'src/generated/verses');
    const byBook = new Map<string, Record<string, string>>();
    for (const f of readdirSync(dir)) {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { book: string; verses: Record<string, string> };
      byBook.set(j.book, j.verses);
    }
    const tsv = new Map<string, string>(
      readFileSync(join(__dirname, '..', 'tools/bible/synodal.tsv'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [b, c, v, t] = l.split('\t');
          return [`${b} ${c}:${v}`, t] as const;
        }),
    );
    let n = 0;
    for (const s of storyState.STORY_STEPS)
      for (const r of s.refs) {
        const m = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(r);
        expect(m, r).not.toBeNull();
        const [, book, ch, v0, v1] = m!;
        for (let v = +v0; v <= +(v1 ?? v0); v++) {
          const key = `${ch}:${v}`;
          expect(byBook.get(book)?.[key], `${s.id}: ${book} ${key}`).toBeTruthy();
          expect(tsv.has(`${book} ${key}`), `${book} ${key}`).toBe(true);
          n++;
        }
      }
    expect(n).toBeGreaterThanOrEqual(10);
  });
  it('шестое начало — «Рассказ: от Адама до Иисуса Христа»', () => {
    expect(reveal.STARTS.map((s) => s.value)).toContain('story');
    expect(reveal.STARTS.find((s) => s.value === 'story')?.label).toBe('Рассказ: от Адама до Иисуса Христа');
  });
});

describe('строки шага из графа', () => {
  it('ветви Иакова — четыре союза: Лия, Рахиль, Валла, Зелфа; дети по годам рождения', () => {
    const rows = facts.branchRows('iakov');
    expect(rows.map((r) => r.other)).toEqual(['liya', 'rakhil', 'valla', 'zelfa']);
    expect(names(rows[0].kids)).toEqual(['Рувим', 'Симеон', 'Левий', 'Иуда', 'Иссахар', 'Завулон', 'Дина']);
    expect(names(rows[1].kids)).toEqual(['Иосиф', 'Вениамин']);
    expect(names(rows[2].kids)).toEqual(['Дан', 'Неффалим']);
    expect(names(rows[3].kids)).toEqual(['Гад', 'Асир']);
    for (const r of rows) expect(r.ref, r.other ?? '').toMatch(/^Быт \d+:\d+/);
    // номер строки — номер ветви неба (цвет ветви, решение 69)
    expect(rows.map((r) => r.i)).toEqual([0, 1, 2, 3]);
  });
  it('ветви Авраама — Сарра, Агарь, Хеттура; у лица с одним союзом — ветвь на ребёнка', () => {
    expect(facts.branchRows('avraam').map((r) => r.other)).toEqual(['sarra', 'agar', 'khettura']);
    const m = facts.branchRows('moisey');
    expect(m.every((r) => r.other === null && r.kids.length === 1)).toBe(true);
    expect(names(m.flatMap((r) => r.kids))).toEqual(['Гирсам', 'Елиезер']);
  });
  it('ленты: у Давида расходятся — Соломон (Мф) и Нафан (Лк); у Зоровавеля сходятся в Салафииле и расходятся к Авиуду и Рисаю', () => {
    const d = facts.lineRows('david', ['iessey', 'david', 'solomon']);
    expect(d.map((r) => r.how)).toEqual(['split']);
    expect(names(d[0].ids)).toEqual(['Соломон', 'Нафан']);
    expect(d[0].refs[0]).toMatch(/^Мф 1:6/);
    expect(d[0].refs[1]).toMatch(/^Лк 3:31/);
    const z = facts.lineRows('zorovavel', ['iekhoniya', 'salafiil', 'zorovavel']);
    expect(z.map((r) => r.how)).toEqual(['join', 'split']);
    expect(names(z[0].ids)).toEqual(['Салафиил']);
    expect(names(z[1].ids)).toEqual(['Авиуд', 'Рисай']);
    const j = facts.lineRows('iisus');
    expect(j.map((r) => r.how)).toEqual(['join']);
    expect(j[0].refs.join(' ')).toMatch(/Мф 1:16.*Лк 3:23/);
    expect(facts.lineRows('vooz').map((r) => r.how)).toEqual(['both']);
    expect(facts.lineRows('adam').map((r) => r.how)).toEqual(['both']);
    // лица нет на обеих лентах — строк нет
    expect(facts.lineRows('moisey')).toEqual([]);
  });
});

describe('адрес: «~r», «~z», «~f»', () => {
  it('туда и обратно', () => {
    const s = address.formatAddress({ id: 'iakov', view: { year: -1865, width: 330, lane: 5 }, story: 2, area: 'judah', inset: 'iakov' });
    expect(s).toMatch(/~r3~zjudah~fiakov$/);
    expect(s).toMatch(/^#\/[a-z0-9._~-]*$/);
    const a = address.parseAddress(s, has);
    expect(a.story).toBe(2);
    expect(a.area).toBe('judah');
    expect(a.inset).toBe('iakov');
  });
  it('испорченные поля не читаются: шаг ноль, неизвестное созвездие и лицо', () => {
    const a = address.parseAddress('#/iakov~r0~znope~fnobody', has);
    expect(a.story).toBeUndefined();
    expect(a.area).toBeUndefined();
    expect(a.inset).toBeUndefined();
  });
});

describe('история: каждый шаг — своя запись (решение 187)', () => {
  it('«Дальше» — новая запись с «~r»; «назад» браузера — прежний шаг; запись без «~r» закрывает рассказ', { timeout: 30_000 }, async () => {
    const off = address.bindAddress();
    await settle();
    const start = entries.length;
    expect(story.openStory(1)).toBe(true);
    await settle();
    expect(storyState.storyStep.value).toBe(1);
    expect(state.selected.value).toBe('avraam');
    expect(entries[at].url).toMatch(/^#\/avraam~.*~r2$/);
    expect(story.nextStep()).toBe(true);
    await settle();
    expect(storyState.storyStep.value).toBe(2);
    expect(state.selected.value).toBe('iakov');
    expect(entries[at].url).toMatch(/^#\/iakov~.*~r3$/);
    expect(entries.length).toBeGreaterThan(start + 1);
    back();
    await settle();
    expect(storyState.storyStep.value).toBe(1);
    expect(state.selected.value).toBe('avraam');
    // запись до рассказа — рассказ закрыт
    while (at > 0 && /~r\d/.test(entries[at].url)) {
      back();
      await settle();
    }
    expect(storyState.storyStep.value).toBeNull();
    off();
  });
  it('«Выйти на небо»: рассказ закрыт, выбранное лицо остаётся', () => {
    story.goStep(5, 'none');
    expect(storyState.storyStep.value).toBe(5);
    expect(state.selected.value).toBe('david');
    expect(story.closeStory()).toBe(true);
    expect(storyState.storyStep.value).toBeNull();
    expect(state.selected.value).toBe('david');
    expect(story.closeStory()).toBe(false);
  });
  it('«Карточка»: колонка — карточка, рассказ открыт; «К рассказу» — снова рассказ', () => {
    story.goStep(2, 'none');
    expect(storyState.storyShown.value).toBe(true);
    expect(story.openStoryCard()).toBe(true);
    expect(storyState.storyShown.value).toBe(false);
    expect(storyState.storyStep.value).toBe(2);
    expect(story.backToStory()).toBe(true);
    expect(storyState.storyShown.value).toBe(true);
    story.closeStory();
  });
  it('объявление шага: «Шаг 3 из 8. Двенадцать колен. Патриархи, …»', () => {
    expect(story.stepAnnounce(2)).toMatch(/^Шаг 3 из 8\. Двенадцать колен\. Патриархи, /);
  });
});

describe('Escape (D5; этап 16)', () => {
  const none = { pick: false, panel: false, pins: false, group: false, second: false, selected: false, intro: false };
  it('врезка — первой, фокус созвездия — раньше «Ближайшей родни», рассказ — раньше выбранного лица', () => {
    expect(keys.escapeTarget({ ...none, inset: true, pick: true, panel: true })).toBe('inset');
    expect(keys.escapeTarget({ ...none, area: true, family: true, selected: true })).toBe('area');
    expect(keys.escapeTarget({ ...none, second: true, area: true })).toBe('second');
    expect(keys.escapeTarget({ ...none, family: true, story: true })).toBe('family');
    expect(keys.escapeTarget({ ...none, story: true, selected: true })).toBe('story');
    expect(keys.escapeTarget({ ...none, selected: true })).toBe('selected');
  });
});

describe('фокус созвездия и порог раскрытия по плотности (решение 185)', () => {
  it('созвездие с вложенными: «Колено Левиино» — со «Священниками, сынами Аароновыми»', () => {
    const t = areas.groupTree('levi');
    expect(t.has('levi')).toBe(true);
    expect(t.has('aaronides')).toBe(true);
    expect(areas.groupMembers('levi').length).toBeGreaterThan(300);
  });
  it('фокус: сигнал, имя; снятие; неизвестное созвездие — нет', () => {
    expect(areas.focusGroup('judah', 'address')).toBe(true);
    expect(storyState.groupFocus.value).toBe('judah');
    expect(areas.groupName('judah')).toBe('Колено Иудино');
    expect(areas.clearGroupFocus(false)).toBe(true);
    expect(storyState.groupFocus.value).toBeNull();
    expect(areas.clearGroupFocus(false)).toBe(false);
    expect(areas.focusGroup('nope')).toBe(false);
  });
  it('множители раскрытия — 0,6…1,6, у тесных созвездий меньше, чем у просторных; фокус — 1 своим, 0 прочим', () => {
    const m = atlas.models[0];
    const F = density.revealFactors(m.outlines, m.scale);
    expect(F.size).toBeGreaterThan(10);
    for (const [, f] of F) {
      expect(f).toBeGreaterThanOrEqual(0.6);
      expect(f).toBeLessThanOrEqual(1.6);
    }
    expect(new Set([...F.values()].map((f) => f.toFixed(2))).size).toBeGreaterThan(3);
    // раскрытие растёт с высотой строки; у созвездия в фокусе — 1, у другого — 0
    expect(density.groupReveal('judah', 3, F)).toBeLessThan(density.groupReveal('judah', 8, F));
    expect(density.groupReveal('aaronides', 2, F, 'levi')).toBe(1);
    expect(density.groupReveal('judah', 20, F, 'levi')).toBe(0);
  });
});
