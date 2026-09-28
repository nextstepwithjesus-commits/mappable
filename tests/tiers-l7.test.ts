/**
 * Ярусы эпох, этап 7, круг 3 (L7): столбец жизни выбранного лица (VIS-64; решение 53), основания яруса «Пророки»
 * и двусторонняя формула на краях столбца (MAP-48).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBible } from '../tools/bible.ts';

let tiers: typeof import('../src/render/tiers.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
let contrast: typeof import('../src/ui/contrast.ts');
let ru: typeof import('../src/ui/text/ru.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  tiers = await import('../src/render/tiers.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
  contrast = await import('../src/ui/contrast.ts');
  ru = await import('../src/ui/text/ru.ts');
});

/** Карточки лиц из данных (тома data/persons): то, что приходит из тома карточек в браузере; тома читаются один раз. */
let cards: Map<string, unknown> | null = null;
function cardOf(id: string) {
  if (!cards) {
    cards = new Map();
    const dir = join(__dirname, '../data/persons');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const p of Array.isArray(d) ? d : d.persons) cards.set(p.id, p.card ?? null);
    }
  }
  return (cards.get(id) ?? null) as Parameters<typeof tiers.ministryOf>[2];
}

/** Текст стихов ссылки «Исх 7:1-2» по Синодальному тексту. */
function verseText(ref: string): string {
  const m = /^(\S+) (\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return '';
  const bible = loadBible();
  const out: string[] = [];
  for (let v = Number(m[3]); v <= Number(m[4] ?? m[3]); v++) out.push(bible.verses.get(`${m[1]} ${m[2]}:${v}`) ?? '');
  return out.join(' ');
}

describe('столбец жизни выбранного лица (VIS-64; решение 53)', () => {
  it('ядро — надёжная часть жизни, края — неопределённость рождения и смерти (Давид: ±2 года по расчёту)', () => {
    const c = atlas.models[0].chrono.get('david')!;
    const s = tiers.columnSpan(c);
    expect(s.lo).toBe(c.bLo);
    expect(s.core0).toBe(c.bHi);
    expect(s.core1).toBe(c.dLo);
    expect(s.hi).toBe(c.dHi);
    // у Давида расчётные годы — с промежутками: растушёвка есть с обеих сторон (MAP-48: «края резкие»)
    expect(s.core0 - s.lo).toBeGreaterThan(0);
    expect(s.hi - s.core1).toBeGreaterThan(0);
  });
  it('без данных о смерти ядро кончается последним засвидетельствованным годом, край — оценкой смерти (Исаия)', () => {
    const c = atlas.models[0].chrono.get('isaiya')!;
    expect(c.d).toBe(null);
    const s = tiers.columnSpan(c);
    expect(s.core1).toBe(c.last);
    expect(s.hi).toBe(c.dEst);
    expect(s.lo <= s.core0 && s.core0 <= s.core1 && s.core1 <= s.hi).toBe(true);
  });
  it('у всех лиц отрезки столбца упорядочены: край ≤ ядро ≤ край', () => {
    for (const [id, c] of atlas.models[0].chrono) {
      const s = tiers.columnSpan(c);
      expect(s.lo <= s.core0 && s.core0 <= s.core1 && s.core1 <= s.hi, id).toBe(true);
    }
  });
  it('заливка в ярусах отличается от неба на 1,12 : 1 в обеих темах (прежде 1,44 и 1,62)', () => {
    // --sky и --ink-3 из src/styles/tokens.css: ночь и день
    for (const [sky, ink] of [['#0d1b34', '#8fa0bc'], ['#e9eef4', '#56637a']]) {
      const k = tiers.tintFor(sky, ink);
      const r = contrast.contrast(tiers.over(sky, ink, k), sky);
      expect(r, sky).toBeGreaterThan(1.1);
      expect(r, sky).toBeLessThanOrEqual(1.125);
    }
    expect(tiers.COLUMN_CONTRAST).toBe(1.12);
  });
});

describe('ярус «Пророки»: основания (MAP-48)', () => {
  const PROPHET = /пророк|пророчиц|прозорлив|пророчеств/i;
  it('Моисей, Аарон и Мариам: Писание называет их пророками — Втор 34:10, Исх 7:1, Исх 15:20', () => {
    expect(tiers.prophetBasis(cardOf('moisey'))).toContain('Втор 34:10');
    expect(tiers.prophetBasis(cardOf('mariam'))).toContain('Исх 15:20');
    expect(tiers.prophetBasis(cardOf('aaron'))).toContain('Исх 7:1-2');
    for (const id of ['moisey', 'aaron', 'mariam']) {
      const refs = tiers.prophetBasis(cardOf(id))!;
      expect(refs.some((r) => PROPHET.test(verseText(r))), `${id}: ${refs.join('; ')}`).toBe(true);
    }
    expect(verseText('Втор 34:10')).toMatch(/пророка такого, как Моисей/);
    expect(verseText('Исх 7:1')).toMatch(/Аарон, брат твой, будет твоим пророком/);
    expect(verseText('Исх 15:20')).toMatch(/Мариам пророчица/);
  });
  it('отрезок из карточки открывается основанием: первая ссылка — стих, где лицо названо пророком', () => {
    const m = atlas.models[0];
    for (const id of ['moisey', 'aaron']) {
      const w = tiers.ministryOf(null, m.chrono.get(id), cardOf(id))!;
      expect(w.refs![0], id).toBe(tiers.prophetBasis(cardOf(id))![0]);
    }
    // Аарон: в ярусе — служение, названное пророческим (год Исхода), с его названием в подсказке; не первосвященство
    const aaron = tiers.ministryOf(null, m.chrono.get('aaron'), cardOf('aaron'))!;
    expect(aaron.t0).toBe(years.toAstro(-1446));
    expect(aaron.t1).toBeLessThan(years.toAstro(-1445));
    expect(aaron.note).toMatch(/пророк Моисея/);
    // Моисей: вождь при Исходе и в пустыне, 1446–1406 гг.
    const moses = tiers.ministryOf(null, m.chrono.get('moisey'), cardOf('moisey'))!;
    expect(moses.t0).toBe(years.toAstro(-1446));
    expect(moses.t1).toBeGreaterThanOrEqual(years.toAstro(-1407));
  });
  it('у пророков, чьи годы в ярусе взяты из карточки, основание подтверждается стихом со словом «пророк»', () => {
    // у кого годы служения в данных (active), подсказка приводит стихи этих годов; из карточки — основание (prophetBasis)
    const m = atlas.models[0];
    let n = 0;
    for (const p of atlas.persons.filter((q) => q.roles.includes('prophet') && !q.active && !q.reign.length)) {
      const w = tiers.ministryOf(null, m.chrono.get(p.id), cardOf(p.id));
      const refs = tiers.prophetBasis(cardOf(p.id));
      if (!w || w.bracket || !refs) continue;
      n++;
      expect(w.refs![0], p.id).toBe(refs[0]);
      expect(refs.some((r) => PROPHET.test(verseText(r))), `${p.id}: ${refs.join('; ')}`).toBe(true);
    }
    expect(n).toBeGreaterThanOrEqual(4);
  });
});

describe('формула на краях столбца: «после…, до…» (MAP-48)', () => {
  it('Моисей: после рождения Аарона и до рождения Гирсама; у Исаака — по надёжно датированной родне, как прежде', () => {
    const m = atlas.models[0];
    expect(tiers.columnFormula('moisey', m).birth).toBe('Моисей родился после рождения Аарона и до рождения Гирсама');
    expect(tiers.columnFormula('isaak', m).birth).toBe('Исаак родился после рождения Измаила и до рождения Иакова');
  });
  it('если «после» опирается на надёжно датированную родню и есть ребёнок, рождённый позже, — у формулы есть «до»', () => {
    const m = atlas.models[0];
    let any = 0;
    let both = 0;
    for (const p of atlas.persons) {
      const f = tiers.columnFormula(p.id, m);
      if (!f.birth) continue;
      any++;
      expect(f.birth, p.id).not.toMatch(/null|undefined|\s{2}|рождения\s*$/);
      expect(f.birth.startsWith(`${p.name} ${p.sex === 'f' ? 'родилась' : 'родился'} `), p.id).toBe(true);
      if (/ до рождения /.test(f.birth)) {
        both++;
        continue;
      }
      // «после» — по родителю-опоре из родства (без надёжной даты) формулу не дополняет: одна сторона без года — не формула
      if (!/ после рождения /.test(f.birth)) continue;
      const me = m.chrono.get(p.id)!;
      const tense = new Set(m.tensions.filter((t) => t.persons.includes(p.id)).flatMap((t) => t.persons));
      const kid = (atlas.graph.childrenOf.get(p.id) ?? []).find((e) => {
        const c = m.chrono.get(e.child);
        const q = atlas.byId.get(e.child);
        return (
          (e.kind === 'father' || e.kind === 'mother') && e.cert !== 'interpretation' && e.claim !== 'legal' && !tense.has(e.child) &&
          !!c && !!q && q.kind === 'person' && !q.unnamed && c.cls !== 'epochal' && !c.named && c.b > me.b && ru.nameCase(q.name, q.sex, 'gen') !== null
        );
      });
      expect(kid, `${p.id}: «${f.birth}» без «до», хотя есть ребёнок ${kid?.child}`).toBeUndefined();
    }
    // 28.09.2026: формула у 168 лиц, двусторонняя — у 107
    expect(any).toBeGreaterThan(150);
    expect(both).toBeGreaterThan(100);
  });
  it('родство не строит формулу одно: у Давида нет надёжно датированной родни — только имя', () => {
    expect(tiers.columnFormula('david', atlas.models[0])).toEqual({ birth: null, death: null });
  });
  it('опора «до» из родства — только ребёнок, рождённый позже; «после» — только родитель, рождённый раньше', () => {
    const m = atlas.models[0];
    for (const p of atlas.persons.slice(0, 1500)) {
      const f = tiers.columnFormula(p.id, m);
      const me = m.chrono.get(p.id);
      if (!f.birth || !me) continue;
      for (const q of [...(atlas.graph.childrenOf.get(p.id) ?? []), ...(atlas.graph.parentsOf.get(p.id) ?? [])]) {
        const other = q.child === p.id ? q.parent : q.child;
        const o = atlas.byId.get(other);
        const oc = m.chrono.get(other);
        if (!o || !oc) continue;
        // имя ребёнка после «до рождения» — ребёнок родился позже; имя родителя после «после рождения» — раньше
        if (q.parent === p.id && f.birth.includes(`до рождения ${o.name.slice(0, -1)}`)) expect(oc.b, `${p.id} → ${other}`).toBeGreaterThan(me.b);
        if (q.child === p.id && f.birth.includes(`после рождения ${o.name.slice(0, -1)}`)) expect(oc.b, `${other} → ${p.id}`).toBeLessThan(me.b);
      }
    }
  });
});
