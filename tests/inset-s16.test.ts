/**
 * Врезка «Семья созвездием» (этап 16, решение 186; приёмка О5): дети по матерям, вид союза и счёт в шапке — 100 % по данным
 * на корпусе Иаков, Давид, Авраам, Иуда, Халев, Исав; раскладка без наложения звёзд и в своих границах; стих источника —
 * стих, где мать и её дети названы вместе.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byId, graph, lineMembership, models } from '../src/data/atlas.ts';
import { buildUnions } from '../src/engine/unions.ts';
import { marriageKind } from '../src/engine/stays.ts';
import { familyScene, fanWidth, hasFamilyIn, insetClashes, plotFamily, sourceVerse, type FamDeps, type FamScene, type Geom } from '../src/engine/famplot.ts';
import { kinTermReverse, nameCase } from '../src/ui/text/ru.ts';
import { insetSubtitle, insetTitle } from '../src/ui/sky/FamilyInset.tsx';

const U = buildUnions(graph);
const chrono = models[0].chrono;
const D: FamDeps = {
  graph,
  unions: U,
  year: (id) => {
    const c = chrono.get(id);
    return c ? { b: c.b, infant: !!c.infant } : null;
  },
  magnitude: (id) => byId.get(id)?.magnitude ?? 4,
  line: (id) => ({ mt: lineMembership.joseph.has(id), lk: lineMembership.mary.has(id) }),
  gen: (id) => {
    const p = byId.get(id)!;
    return nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt);
  },
  kinReverse: (rel, sex) => kinTermReverse(rel, sex),
};
const scene = (id: string) => familyScene(id, D)!;
const name = (id: string | null) => (id ? byId.get(id)!.name : null);
const kids = (S: FamScene, partner: string | null) => S.unions.find((u) => u.partner === partner)!.kids.map((k) => byId.get(k)!.name);

const CORPUS = ['iakov', 'david', 'avraam', 'iuda', 'khalev-syn-esroma', 'isav'];

describe('О5: дети по матерям и вид союза — по данным', () => {
  for (const id of CORPUS)
    it(`${byId.get(id)!.name}: каждый ребёнок — у своего союза, мать ребёнка — супруга этого союза; вид союза — из данных`, () => {
      const S = scene(id);
      const own = (U.of.get(id) ?? []).filter((u) => !u.claim || u.claim === 'legal');
      expect(S.unions.length).toBe(own.length);
      for (const fu of S.unions) {
        const u = U.byId.get(fu.id)!;
        // те же дети, что у союза в данных (порядок — по рождению)
        expect([...fu.kids].sort()).toEqual([...u.kids].sort());
        expect(fu.kind).toBe(marriageKind(u));
        for (const k of fu.kids) {
          const mother = graph.parentsOf.get(k)!.find((e) => e.kind === 'mother')?.parent ?? null;
          const father = graph.parentsOf.get(k)!.find((e) => e.kind === 'father')?.parent ?? null;
          // у отца-фокуса мать ребёнка — супруга союза (или не названа — союз без второго лица)
          if (byId.get(id)!.sex === 'm') {
            expect(father).toBe(id);
            expect(mother).toBe(fu.partner);
          }
        }
      }
    });
  it('Иаков: Лия — 7 детей, Рахиль — Иосиф и Вениамин, Валла — наложница (Быт 35:22), Зелфа — жена (Быт 30:9)', () => {
    const S = scene('iakov');
    expect(S.unions.map((u) => name(u.partner))).toEqual(['Лия', 'Рахиль', 'Валла', 'Зелфа']);
    expect(kids(S, 'liya')).toEqual(['Рувим', 'Симеон', 'Левий', 'Иуда', 'Иссахар', 'Завулон', 'Дина']);
    expect(kids(S, 'rakhil')).toEqual(['Иосиф', 'Вениамин']);
    expect(S.unions.find((u) => u.partner === 'valla')!.kind).toBe('concubine');
    expect(S.unions.find((u) => u.partner === 'zelfa')!.kind).toBe('wife');
    expect(S.sibs.map((x) => x.name)).toEqual(['Исав']);
    expect(S.parents?.father?.id).toBe('isaak');
    expect(S.parents?.mother?.id).toBe('revekka');
  });
  it('Давид: девять союзов; Мелхола — бездетный брак в конце; 11 детей от неназванных матерей; сёстры — словами Писания (1 Пар 2:16)', () => {
    const S = scene('david');
    expect(S.unions.length).toBe(9);
    expect(S.unions[S.unions.length - 1].partner).toBe('melkhola');
    expect(S.unions[S.unions.length - 1].kids).toEqual([]);
    const none = S.unions.find((u) => !u.partner)!;
    expect(none.kids.length).toBe(11);
    expect(kids(S, 'virsaviya')).toContain('Соломон');
    expect(S.parents?.mother).toBeNull();
    expect(S.kinSibs.map((k) => `${k.node.name}:${k.word}:${k.ref}`).sort()).toEqual(['Авигея:сестра:1Пар 2:16', 'Саруия:сестра:1Пар 2:16']);
  });
  it('Авраам: Сарра — жена и «сестра» (Быт 20:12); Агарь — жена; Хеттура — наложница с 6 сыновьями', () => {
    const S = scene('avraam');
    expect(S.unions.map((u) => `${name(u.partner)}:${u.kind}:${u.kids.length}`)).toEqual(['Сарра:wife:1', 'Агарь:wife:1', 'Хеттура:concubine:6']);
    expect(S.unions[0].kin).toEqual({ word: 'сестра', ref: 'Быт 20:12' });
  });
  it('Иуда и Фамарь: брак не назван; Ир — муж Фамари, Онан — левират; каждое лицо во врезке один раз', () => {
    const S = scene('iuda');
    const t = S.unions.find((u) => u.partner === 'famar')!;
    expect(t.kind).toBe('none');
    expect(t.kin?.word).toBe('невестка');
    expect(S.inner.map((q) => `${q.kid}>${q.wife}:${q.kind}`).sort()).toEqual(['ir-syn-iudy>famar:wife', 'onan>famar:levirate']);
    const all = [...S.nodes.keys()];
    expect(new Set(all).size).toBe(all.length);
  });
  it('Халев (1 Пар 2): Азува и Иериофа — жёны без детей в данных; восемь сыновей — «матери не названы»; Ефа и Мааха — наложницы', () => {
    const S = scene('khalev-syn-esroma');
    const none = S.unions.find((u) => !u.partner)!;
    expect(none.kids.length).toBe(8);
    expect(S.unions.filter((u) => u.kind === 'concubine').map((u) => name(u.partner)).sort()).toEqual(['Ефа', 'Мааха']);
    for (const w of ['azuva', 'ieriofa']) {
      const u = S.unions.find((x) => x.partner === w);
      if (u) expect(u.kids).toEqual([]);
    }
  });
});

describe('О5: шапка врезки — счёт по данным', () => {
  const cases: [string, string, string][] = [
    ['iakov', 'Семья Иакова', '12 сыновей и дочь Дина'],
    ['david', 'Семья Давида', '21 сын и дочь Фамарь'],
    ['avraam', 'Семья Авраама', '8 сыновей'],
    ['iuda', 'Семья Иуды', '5 сыновей'],
    ['khalev-syn-esroma', 'Семья Халева', '16 сыновей'],
    ['isav', 'Семья Исава', '5 сыновей'],
  ];
  for (const [id, title, sub] of cases)
    it(`${title} — ${sub}`, () => {
      const S = scene(id);
      expect(insetTitle(id)).toBe(title);
      expect(insetSubtitle(S)).toBe(sub);
      // счёт — дети всех союзов лица, ни одного выдуманного
      const n = (U.of.get(id) ?? []).filter((u) => !u.claim || u.claim === 'legal').reduce((s, u) => s + u.kids.length, 0);
      expect(S.sons + S.daughters.length).toBe(n);
    });
});

describe('врезке есть что показать', () => {
  it('у Мелхиседека нет ни родителей, ни союзов (Евр 7:3) — врезки нет', () => {
    expect(hasFamilyIn('melkhisedek', U)).toBe(false);
    expect(familyScene('melkhisedek', D)).toBeNull();
  });
  it('у Иакова, Давида, Адама — есть', () => {
    for (const id of ['iakov', 'david', 'adam']) expect(hasFamilyIn(id, U)).toBe(true);
  });
});

/** Синодальный текст для выбора стиха источника (tools/bible/synodal.tsv). */
const verses = (() => {
  const m = new Map<string, string>();
  for (const line of readFileSync(join(__dirname, '../tools/bible/synodal.tsv'), 'utf8').split('\n')) {
    const [b, c, v, t] = line.split('\t');
    if (t) m.set(`${b} ${c}:${v}`, t);
  }
  return m;
})();
const src = (id: string, partner: string | null, readable: (b: string, ch: number) => boolean = () => false) => {
  const S = scene(id);
  const u = S.unions.find((x) => x.partner === partner)!;
  return sourceVerse(
    { refs: u.refs, kids: u.kids, mother: partner },
    (k) => byId.get(k)?.parentRefs ?? [],
    (k) => [byId.get(k)!.name, ...(byId.get(k)!.alt ?? [])],
    (b, c, v) => verses.get(`${b} ${c}:${v}`),
    readable,
  );
};

describe('карточка источника: стих, где мать и её дети названы вместе', () => {
  it('Рахиль — Быт 35:24 «Сыновья Рахили: Иосиф и Вениамин»; при родословной главе для чтения — Быт 46:19', () => {
    expect(src('iakov', 'rakhil')?.ref).toBe('Быт 35:24');
    expect(src('iakov', 'rakhil', (b, ch) => b === 'Быт' && ch === 46)?.ref).toBe('Быт 46:19');
  });
  it('Вирсавия — 1 Пар 3:5 (мать и четверо сыновей); Хеттура — 1 Пар 1:32; Фамарь — 1 Пар 2:4', () => {
    expect(src('david', 'virsaviya')?.ref).toBe('1Пар 3:5');
    expect(src('avraam', 'khettura')?.ref).toBe('1Пар 1:32');
    expect(src('iuda', 'famar')?.ref).toBe('1Пар 2:4');
  });
});

describe('раскладка врезки: звёзды не ложатся друг на друга и стоят в своих границах', () => {
  const measure: Geom['measure'] = (s, f) => s.length * (f === 'focal' ? 20 : f === 'name' ? 16 : 14) * 0.56;
  // ширина по Literata в браузере (средняя ширина знака на кегль, замер tools/_f-measure.ts) с запасом 6 %: для проверки
  // столкновений подписей нужна ширина не меньше настоящей
  const EM: Record<string, [number, number]> = { name: [16, 0.575], kid: [14, 0.565], kidStrong: [14, 0.582], focal: [20, 0.584], word: [13, 0.539], small: [12, 0.497], sib: [14, 0.565], note: [13, 0.564] };
  const real: Geom['measure'] = (s, f) => s.length * EM[f][0] * EM[f][1] * 1.06;
  const words: Geom['words'] = {
    kind: (k) => ({ wife: 'жена', concubine: 'наложница', levirate: 'по левирату', none: 'брак не назван' })[k],
    motherUnnamed: (n) => (n > 1 ? 'матери не названы' : 'мать не названа'),
    innerWord: () => 'муж',
    halves: () => 'единокровные',
    sibs: () => 'братья',
    up: (id) => `↑ ${byId.get(id)!.name}`,
    other: (c) => c,
  };
  // широкая врезка — 720 px (раскладка 656); узкая — 600 px (556), но не уже, чем нужно семье (fanWidth: врезка
  // Давида шире — девять союзов и восемь братьев и сестёр); телефон — гребень 358
  for (const [comb, w0] of [[false, 656], [false, 556], [true, 358]] as const)
    for (const id of CORPUS)
      it(`${byId.get(id)!.name}, ${comb ? 'телефон' : w0 > 600 ? 'широкий экран' : 'узкая врезка'}`, () => {
        const S = scene(id);
        const w = comb || w0 > 600 ? w0 : Math.max(w0, fanWidth(S, { measure: real, words, scale: 1.35 }));
        const G: Geom = comb
          ? { x: 16, y: 86, w, h: 520, comb, scale: 1.15, measure, words }
          : { x: 322, y: 164, w, h: 520, comb, scale: 1.35, measure, words };
        const P = plotFamily(S, G);
        const stars = P.prims.filter((p) => p.t === 'star') as Extract<(typeof P.prims)[number], { t: 'star' }>[];
        // каждое лицо сцены, кроме единокровных (они строкой), — звездой ровно один раз
        const ids = stars.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const u of S.unions) for (const k of u.kids) expect(ids).toContain(k);
        // звёзды не ложатся друг на друга
        for (let i = 0; i < stars.length; i++)
          for (let j = i + 1; j < stars.length; j++) {
            const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
            expect(d, `${stars[i].id} × ${stars[j].id}`).toBeGreaterThan(stars[i].r + stars[j].r + 2);
          }
        // по горизонтали — в границах раскладки
        for (const s of stars) {
          expect(s.x).toBeGreaterThanOrEqual(G.x - 4);
          expect(s.x).toBeLessThanOrEqual(G.x + G.w + 4);
        }
        // каждый луч к ребёнку кончается в звезде ребёнка своего союза
        for (const l of P.prims) {
          if (l.t !== 'line' || l.style !== 'ray' || !l.uid) continue;
          const u = S.unions.find((x) => x.id === l.uid);
          if (!u) continue;
          const end = stars.find((s) => Math.abs(s.x - l.x1) < 0.5 && Math.abs(s.y - l.y1) < 0.5);
          expect(end && u.kids.includes(end.id), `луч союза ${u.id} кончается не у его ребёнка`).toBe(true);
        }
        // подписи читаются: подпись × знак, подпись × подпись, подпись × линия (кроме своей выноски) — ни одного
        // столкновения (after-avraam.png: «Хеттура, наложница» на звезде Авраама, «Агарь, жена» на нити ленты)
        // и ни одна подпись не выходит за край врезки (поля врезки — 22 px, на телефоне — 16)
        const area = { x: G.x - (comb ? 16 : 22), y: 0, w: G.w + (comb ? 32 : 44), h: 2000 };
        const R = plotFamily(S, { ...G, measure: real });
        expect(insetClashes(R.prims, real, area)).toEqual([]);
        // и в низкой врезке (экран 1440 × 900 с открытой карточкой: раскладке остаётся 456 px — строки детей шагом 16)
        const Rl = plotFamily(S, { ...G, h: comb ? G.h : 456, measure: real });
        expect(insetClashes(Rl.prims, real, area)).toEqual([]);
        // цвет несут только ленты и ветви (ТЗ § 5.2): слова родства — тоном ink2 курсивом (кегль 'word'), не золотом
        for (const p of P.prims)
          if (p.t === 'label') for (const r of [...p.runs, ...(p.sub ?? [])]) expect(['ink', 'ink2', 'ink3'], `«${r.s}»`).toContain(r.ink);
        if (id === 'avraam' && !comb) {
          const sarah = P.prims.find((p) => p.t === 'label' && p.id === 'sarra') as Extract<(typeof P.prims)[number], { t: 'label' }>;
          expect(sarah.sub?.[0]).toMatchObject({ font: 'word', ink: 'ink2' });
          expect(sarah.sub?.[0].s).toMatch(/^сестра, Быт 20:12$/);
        }
      });
});
