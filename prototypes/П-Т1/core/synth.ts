/**
 * Синтетика 10 000 лиц (09 § 10.2: «синтетика 10 000 лиц») — тот же формат индекса, имена — из настоящего индекса,
 * чтобы ширины подписей были настоящими. Детерминирована (зерно), чтобы замеры повторялись.
 * Главный лес — около 60 %, остальное — острова по 1–30 лиц. Глубина — около 100 рядов.
 */
import type { IndexActor, IndexOrigin, IndexPackage, IndexUnion } from './types.ts';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthIndex(real: IndexPackage, total = 10_000, seed = 7): IndexPackage {
  const rnd = rng(seed);
  const names = real.actors.map((a) => a.n);
  const notes = real.actors.filter((a) => a.d).map((a) => a.d!);
  const actors: IndexActor[] = [];
  const origins: IndexOrigin[] = [];
  const unions: IndexUnion[] = [];
  const add = (sex: 'm' | 'f') => {
    const i = actors.length;
    actors.push({
      id: `s${i}`, k: 'human', s: sex, n: names[Math.floor(rnd() * names.length)],
      ...(rnd() < 0.25 && { d: notes[Math.floor(rnd() * notes.length)] }),
      p: rnd() < 0.03 ? 5 : rnd() < 0.08 ? 4 : rnd() < 0.2 ? 3 : 1, v: '00',
    });
    return `s${i}`;
  };
  const kidsCount = () => {
    const x = rnd();
    return x < 0.42 ? 0 : x < 0.67 ? 1 : x < 0.87 ? 2 + Math.floor(rnd() * 3) : 5 + Math.floor(rnd() * 9);
  };
  const grow = (rootSize: number, depthMax: number) => {
    const base = actors.length;
    const full = () => actors.length - base >= rootSize;
    const root = add('m');
    // вглубь: «хребет» в depthMax рядов, затем ветви от случайных лиц хребта и ветвей
    let spine = root;
    const pool: { id: string; d: number }[] = [{ id: root, d: 0 }];
    for (let d = 1; d < depthMax && !full(); d++) {
      const c = add('m');
      origins.push({ c, p: spine, r: 'f', k: 'natural', pr: 1, or: 1 });
      pool.push({ id: c, d });
      spine = c;
    }
    let qi = 0;
    while (!full() && qi < 1e6) {
      const par = pool[Math.floor(rnd() * pool.length)];
      qi++;
      const n = kidsCount();
      if (!n) continue;
      if (rnd() < 0.15 && !full()) { const w = add('f'); unions.push({ h: par.id, w, k: ['marriage'] }); }
      for (let j = 0; j < n && !full(); j++) {
        const c = add(rnd() < 0.85 ? 'm' : 'f');
        origins.push({ c, p: par.id, r: 'f', k: 'natural', pr: 1, or: j + 1 });
        if (par.d + 1 < depthMax) pool.push({ id: c, d: par.d + 1 });
      }
    }
  };
  grow(Math.round(total * 0.6), 100);
  while (actors.length < total) {
    const size = 1 + Math.floor(rnd() ** 2 * 30);
    grow(Math.min(size, total - actors.length), Math.max(2, Math.ceil(size / 3)));
  }
  actors.length = Math.min(actors.length, total);
  const ids = new Set(actors.map((a) => a.id));
  return {
    schema: 1, admit: 'probe', banner: real.banner,
    actors, origins: origins.filter((o) => ids.has(o.c) && ids.has(o.p!)), unions: unions.filter((u) => ids.has(u.h) && ids.has(u.w)),
    readings: [], areas: [], members: [],
  };
}
