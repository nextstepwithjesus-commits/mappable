/**
 * Карточка у точки на небе «набор» (решение 76, задача P2): место у звезды и у точки союза (placeDot, dockDot), команды
 * карточки лица и союза поверх раскрытия (src/ui/reveal.ts), однострочная подсказка точки союза, имя диалога, когда
 * карточка у точки вообще есть (dotsOn), справка неба для клавиатуры.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { expandUnion, expanded, opened, startWith, unions } from '../src/ui/reveal.ts';
import { linkSet, skyMode, workSet, type WorkEntry } from '../src/ui/work.ts';
import { onlyLines, pickMode, selected } from '../src/state.ts';
import {
  closeDot, continueDot, dockDot, DOT_LEAD, dotCard, dotLabel, dotsOn, foldDot, openDot, parentsDot, personDotCmds, placeDot, unionDotCmd, unionSpouse,
  type Obstacle,
} from '../src/ui/sky/DotCard.tsx';
import { dotTipText, kidsText } from '../src/ui/sky/text.ts';
import { SKY_HELP, SKY_HELP_TOUCH } from '../src/ui/sky/SkyA11y.tsx';

const U = (id: string) => unions.byId.get(id)!;
/** Строка без неразрывных пробелов и соединителей типографики (typo). */
const plain = (s: string) => s.replace(/ /g, ' ').replace(/⁠/g, '');
const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Набор неба «набор»: первое лицо — начало, остальные раскрыты от него. */
const setWork = (ids: string[]) => {
  workSet.value = new Map<string, WorkEntry>(ids.map((id, i) => [id, { via: i ? 'family' : 'self', of: ids[0] }]));
};

const SKY = { x: 40, y: 60, w: 900, h: 700 };
const SIZE = { w: 240, h: 100 };

describe('место карточки у точки (placeDot)', () => {
  it('на свободном небе — под знаком, посередине, с отводом 1 px от края знака до карточки', () => {
    const a = { x: 400, y: 300, r: 8 };
    const q = placeDot(a, SIZE, SKY);
    expect(q.side).toBe('s');
    expect(q.x).toBe(a.x - SIZE.w / 2);
    expect(q.y).toBe(a.y + a.r + DOT_LEAD);
    expect(q.lead).toEqual({ x: 400, y: a.y + a.r, w: 1, h: DOT_LEAD });
  });
  it('у нижнего края неба — не под знаком, целиком в небе и не на знаке', () => {
    const a = { x: 400, y: SKY.y + SKY.h - 30, r: 8 };
    const q = placeDot(a, SIZE, SKY);
    expect(q.side).not.toBe('s');
    const r = { x: q.x, y: q.y, ...SIZE };
    expect(r.y + r.h).toBeLessThanOrEqual(SKY.y + SKY.h);
    expect(cross(r, { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r })).toBe(false);
    expect(q.lead).not.toBeNull();
  });
  it('у правого края — сдвинута внутрь неба, отвод по-прежнему к знаку', () => {
    const a = { x: SKY.x + SKY.w - 20, y: 300, r: 8 };
    const q = placeDot(a, SIZE, SKY);
    expect(q.x + SIZE.w).toBeLessThanOrEqual(SKY.x + SKY.w);
    expect(q.lead).not.toBeNull();
    expect(q.lead!.x).toBe(Math.round(a.x));
  });
  it('не закрывает подпись своего лица (avoid) и уходит от раскрытых детей (soft) по длинному отводу или в сторону', () => {
    const a = { x: 400, y: 300, r: 8 };
    // подпись справа от звезды и три ребёнка под ней
    const label = { x: 410, y: 290, w: 60, h: 20 };
    const kids: Obstacle[] = [0, 1, 2].map((k) => ({ x: 380 + 40 * k, y: 330 + 20 * k, w: 12, h: 12, cost: 20 }));
    const names: Obstacle[] = [0, 1, 2].map((k) => ({ x: 396 + 40 * k, y: 327 + 20 * k, w: 50, h: 18, cost: 30 }));
    const q = placeDot(a, SIZE, SKY, [label], [...kids, ...names]);
    const r = { x: q.x, y: q.y, ...SIZE };
    expect(cross(r, label)).toBe(false);
    for (const o of [...kids, ...names]) expect(cross(r, o)).toBe(false);
    expect(q.lead).not.toBeNull();
  });
  it('место прошлого кадра держится, пока небо сдвигают: карточка не прыгает со стороны на сторону', () => {
    const a = { x: 400, y: 300, r: 8 };
    // одна звезда под знаком: «под» — чуть хуже «справа», но был «под»
    const star: Obstacle[] = [{ x: 394, y: 330, w: 12, h: 12, cost: 6 }];
    const free = placeDot(a, SIZE, SKY, [], star);
    const kept = placeDot(a, SIZE, SKY, [], star, 's00');
    expect(kept.key).toBe('s00');
    expect(free.key).not.toBe('s00');
  });
  it('нигде не помещается — внутри неба, без отвода', () => {
    const tiny = { x: 0, y: 0, w: 200, h: 90 };
    const q = placeDot({ x: 100, y: 45, r: 8 }, SIZE, tiny);
    expect(q.x).toBeGreaterThanOrEqual(tiny.x);
    expect(q.y).toBeGreaterThanOrEqual(tiny.y);
    expect(q.lead).toBeNull();
  });
});

describe('телефон: карточка у нижнего края неба над листом (dockDot)', () => {
  const B = { x: 32, y: 100, w: 300, h: 500 };
  it('знак выше — карточка у нижнего края во всю ширину, отвод от знака вниз к ней', () => {
    const a = { x: 150, y: 250, r: 8 };
    const q = dockDot(a, 110, B);
    expect(q).toMatchObject({ x: B.x, y: B.y + B.h - 110, side: 'dock', key: 'dock-low' });
    expect(q.lead).toEqual({ x: 150, y: 258, w: 1, h: B.y + B.h - 110 - 258 });
  });
  it('знак у нижнего края — карточка вверху, под строками и органами у кромки, знак не закрыт', () => {
    const a = { x: 150, y: 560, r: 8 };
    const bar = { x: 40, y: 104, w: 250, h: 40 };
    const q = dockDot(a, 110, B, [bar]);
    expect(q.key).toBe('dock-high');
    expect(q.y).toBeGreaterThanOrEqual(bar.y + bar.h);
    expect(cross({ x: q.x, y: q.y, w: B.w, h: 110 }, { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r })).toBe(false);
  });
});

describe('команды карточки у точки (решение 76)', () => {
  beforeEach(() => startWith('adam'));
  it('Адам «С Адама»: точки его союзов показаны — «Свернуть ветвь»; родителей нет — команды нет', () => {
    expect(personDotCmds('adam')).toEqual({ branch: 'fold', parents: null });
  });
  it('«Продолжить ветвь» показывает точки союзов лица; «Свернуть ветвь» убирает их', () => {
    expandUnion('u:adam+eva', 'adam');
    expect(personDotCmds('kain').branch).toBe('more');
    continueDot('kain');
    expect(opened.value).toContain('kain');
    expect(personDotCmds('kain').branch).toBe('fold');
    foldDot('kain');
    expect(opened.value).not.toContain('kain');
    expect(personDotCmds('kain').branch).toBe('more');
  });
  it('«Свернуть ветвь» сворачивает только раскрытое от самого лица: у Евы союз, раскрытый от Адама, остаётся', () => {
    expandUnion('u:adam+eva', 'adam');
    foldDot('eva');
    expect(expanded.value['u:adam+eva']).toBe('adam');
    expect(workSet.value.has('eva')).toBe(true);
    foldDot('adam');
    expect(expanded.value['u:adam+eva']).toBeUndefined();
    expect([...workSet.value.keys()]).toEqual(['adam']);
    expect(opened.value).not.toContain('adam');
  });
  it('«Родители» раскрывает союз родителей от лица, «Скрыть родителей» сворачивает; раскрыт от родителя — команды нет', () => {
    setWork(['kain']);
    opened.value = [];
    expect(personDotCmds('kain').parents).toBe('show');
    parentsDot('kain');
    expect(expanded.value['u:adam+eva']).toBe('kain');
    expect(['adam', 'eva', 'avel', 'sif'].every((id) => workSet.value.has(id))).toBe(true);
    expect(personDotCmds('kain').parents).toBe('hide');
    parentsDot('kain');
    expect([...workSet.value.keys()]).toEqual(['kain']);
    startWith('adam');
    expandUnion('u:adam+eva', 'adam');
    expect(personDotCmds('kain').parents).toBeNull();
  });
  it('карточка союза: «Раскрыть детей (3)» → «Свернуть детей»; союз родителей у ребёнка — «Раскрыть родителей»; брак без детей — «Раскрыть союз»', () => {
    const ae = U('u:adam+eva');
    expect(unionDotCmd(ae, 'adam')?.text).toBe('Раскрыть детей (3)');
    expandUnion(ae.id, 'adam');
    expect(unionDotCmd(ae, 'adam')).toMatchObject({ text: 'Свернуть детей', open: true });
    startWith('jesus');
    const jm = U('u:iosif-muzh-marii+mariya');
    expect(unionDotCmd(jm, 'iisus')?.text).toBe('Раскрыть родителей');
    expandUnion(jm.id, 'iisus');
    expect(unionDotCmd(jm, 'iisus')?.text).toBe('Скрыть родителей');
    setWork(['david']);
    expect(unionDotCmd(U('u:david+melkhola'), 'david')?.text).toBe('Раскрыть союз');
  });
  it('«Подробнее»: карточка союза справа — от супруга на небе (у точки ребёнка — от родителя, который на небе)', () => {
    const ae = U('u:adam+eva');
    expect(unionSpouse(ae, 'adam')).toBe('adam');
    setWork(['kain', 'eva']);
    expect(unionSpouse(ae, 'kain')).toBe('eva');
    setWork(['kain']);
    expect(unionSpouse(ae, 'kain')).toBe('kain');
  });
});

describe('подсказка точки союза и имя карточки', () => {
  it('подсказка — одна строка со склонением: «Союз Адама и Евы: 3 сына — щёлкните»', () => {
    expect(plain(dotTipText(U('u:adam+eva')))).toBe('Союз Адама и Евы: 3 сына — щёлкните');
    expect(plain(dotTipText(U('u:avraam+khettura')))).toBe('Союз Авраама и Хеттуры: 6 сыновей — щёлкните');
    expect(plain(dotTipText(U('u:david+melkhola')))).toBe('Союз Давида и Мелхолы: детей не названо — щёлкните');
    expect(plain(dotTipText(U('u:iakov+liya')))).toMatch(/: 6 сыновей и дочь — щёлкните$/);
  });
  it('без надёжного склонения — имена в именительном после «Союз:»', () => {
    const t = plain(dotTipText(U('u:+doch-faraona-mat-moiseya~adoptive')));
    expect(t).toMatch(/^Союз: Дочь фараонова; сын — щёлкните$/);
  });
  it('потомки, названные без промежуточных звеньев, — «потомок», а не «сын»', () => {
    expect(kidsText(U('u:sadok+~ancestor'))).toBe('потомок');
    expect(kidsText(U('u:kaaf+~ancestor'))).toBe('5 потомков');
    expect(plain(dotTipText(U('u:girson+~ancestor')))).toMatch(/2 потомка — щёлкните$/);
  });
  it('имя диалога: у лица — имя и годы, у союза — «Союз Адама и Евы»', () => {
    expect(plain(dotLabel({ kind: 'person', id: 'adam' }))).toBe('Адам, 4174–3244 гг. до Р. Х.');
    expect(plain(dotLabel({ kind: 'union', uid: 'u:adam+eva', from: 'adam' }))).toBe('Союз Адама и Евы');
  });
});

describe('где есть карточка у точки (dotsOn) и одна карточка за раз', () => {
  beforeEach(() => {
    startWith('adam');
    linkSet.value = null;
    pickMode.value = null;
    onlyLines.value = false;
  });
  it('только небо «набор» своего набора: не «все лица», не набор из ссылки, не «только линии», не выбор второго лица', () => {
    expect(dotsOn.value).toBe(true);
    skyMode.value = 'all';
    expect(dotsOn.value).toBe(false);
    skyMode.value = 'work';
    linkSet.value = new Map([['david', { via: 'self', of: 'david' }]]);
    expect(dotsOn.value).toBe(false);
    linkSet.value = null;
    onlyLines.value = true;
    expect(dotsOn.value).toBe(false);
    onlyLines.value = false;
    pickMode.value = 'kinship';
    expect(dotsOn.value).toBe(false);
    pickMode.value = null;
    expect(dotsOn.value).toBe(true);
  });
  it('новая карточка сменяет прежнюю; карточка помнит выбор при открытии; неизвестное лицо и союз не открываются', () => {
    selected.value = 'adam';
    openDot({ kind: 'person', id: 'adam' });
    expect(dotCard.value).toMatchObject({ kind: 'person', id: 'adam', sel: 'adam', focus: false });
    openDot({ kind: 'union', uid: 'u:adam+eva', from: 'adam' }, { focus: true });
    expect(dotCard.value).toMatchObject({ kind: 'union', uid: 'u:adam+eva', focus: true });
    openDot({ kind: 'person', id: 'nobody' });
    openDot({ kind: 'union', uid: 'u:nobody', from: 'adam' });
    expect(dotCard.value).toMatchObject({ kind: 'union', uid: 'u:adam+eva' });
    closeDot();
    expect(dotCard.value).toBeNull();
  });
});

describe('справка неба для клавиатуры и касания', () => {
  it('Enter на звезде или точке союза открывает карточку у точки, Escape закрывает', () => {
    expect(SKY_HELP).toMatch(/точкам союзов/);
    expect(SKY_HELP).toMatch(/Enter на звезде или точке союза открывает у неё карточку/);
    expect(SKY_HELP).toMatch(/Escape её закрывает/);
    expect(SKY_HELP_TOUCH).toMatch(/касание звезды или точки союза открывает у неё карточку/);
  });
});
