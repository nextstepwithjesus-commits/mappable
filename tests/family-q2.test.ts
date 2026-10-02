/**
 * Семейная укладка по времени «Г» (этап 11, решение 80; STAGE11 § 4.2; src/engine/family.ts): требования Я16–Я20
 * на сценах критика K3 — Адам, Ной, Авраам, Иаков, Давид, «Дом Нахора», род Иуды по отцам, колено Вениамина — и коридор
 * линий Мессии без «горба».
 *
 *  Я16 — группы сплошные и по «Отчему дому» (этап 15, решение 173; прежде — «сверху вниз мать, под ней её дети по году
 *        рождения»): позже союз — ближе к родителю; наружу от родителя мать, за ней её дети — младший у матери, старший
 *        дальше всех; мать с детьми — по одну сторону; строки чужого союза того же родителя между ними не встают;
 *  Я18 — строк не больше лиц; род Иуды по отцам — не больше 90, колено Вениамина — не больше 80;
 *  Я19 — устойчивость при раскрытии по одному союзу от корня: перестановок пар прежних лиц нет (в роде Иуды —
 *        не больше 0,05 %), лица сдвигаются только наружу от опоры, второй союз не меняет первый;
 *  Я20 — укладка 300 лиц — не дольше 60 мс.
 */
import { describe, expect, it } from 'vitest';
import { familyLayout, type FamilyPrior, type FamilyResult } from '../src/engine/family.ts';
import { membersOf } from '../src/engine/unions.ts';
import { byId, lines } from '../src/data/atlas.ts';
import { unions } from '../src/ui/reveal.ts';
import { contentOf, familyData } from '../src/ui/show.ts';

const D = familyData();
const T0 = D.t0;
const name = (id: string) => byId.get(id)?.name ?? id;

/** Семья: первое лицо и все союзы названных лиц (супруги и дети), без утверждений иного рода. */
function fam(heads: string[]): Set<string> {
  const S = new Set<string>([heads[0]]);
  for (const h of heads) for (const u of unions.of.get(h) ?? []) if (!u.claim) for (const x of membersOf(u)) S.add(x);
  return S;
}
const withGuests = (c: { ids: ReadonlySet<string>; guests: ReadonlySet<string> }) => new Set([...c.ids, ...c.guests]);

const SCENES: Record<string, { S: Set<string>; root: string }> = {
  Адам: { S: new Set(['adam', 'eva', 'kain', 'avel', 'sif', 'enos', 'kainan', 'enokh-syn-kaina', 'irad', 'mekhiael']), root: 'adam' },
  Ной: { S: fam(['noy', 'sim', 'kham', 'iafet']), root: 'noy' },
  Авраам: { S: fam(['avraam']), root: 'avraam' },
  Иаков: { S: fam(['iakov']), root: 'iakov' },
  Давид: { S: fam(['david']), root: 'david' },
  'Дом Нахора': { S: withGuests(contentOf({ kind: 'groups', groups: ['nahorites'], links: 'stubs' })), root: 'nakhor-syn-farry' },
  'Род Иуды по отцам': { S: withGuests(contentOf({ kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' })), root: 'iuda' },
  'Колено Вениамина': { S: withGuests(contentOf({ kind: 'groups', groups: ['benjamin', 'saulides'], links: 'stubs' })), root: 'veniamin' },
};
const FAMILIES = ['Адам', 'Ной', 'Авраам', 'Иаков', 'Давид', 'Дом Нахора'];

const layouts = new Map<string, FamilyResult>();
const layoutOf = (k: string) => {
  let r = layouts.get(k);
  if (!r) layouts.set(k, (r = familyLayout(SCENES[k].S, D)));
  return r;
};

describe('Я16: группы сплошные — наружу мать, за ней её дети от младшего (решение 173)', () => {
  for (const k of Object.keys(SCENES))
    it(k, () => {
      const r = layoutOf(k);
      const row = (id: string) => r.rows.get(id)!;
      let checked = 0;
      for (const [p, us] of r.units) {
        const pr = row(p);
        // позже союз — ближе к родителю: единицы — по году ствола (год до первого ребёнка в показе), поздние первыми
        for (let i = 1; i < us.length; i++)
          if (us[i - 1].kids.length && us[i].kids.length)
            expect(T0(us[i - 1].kids[0]), `${k}: ${name(p)}: союз ${us[i - 1].union.id} раньше ${us[i].union.id}`).toBeGreaterThanOrEqual(T0(us[i].kids[0]));
        for (const u of us) {
          // наружу от родителя: мать, затем дети от младшего к старшему (u.kids — от старшего)
          const members = [...(u.wife ? [u.wife] : []), ...[...u.kids].reverse()];
          if (members.length < 2) continue;
          checked++;
          // мать с детьми — по одну сторону от родителя (дети связаны со следом матери)
          if (u.wife) for (const x of u.kids) expect(Math.sign(row(x) - pr), `${k}: ${name(x)} по ту же сторону, что ${name(u.wife)}`).toBe(Math.sign(row(u.wife) - pr));
          // на каждой стороне — дальше от родителя по порядку «мать, младший … старший»
          for (const sd of [1, -1]) {
            const side = members.filter((x) => Math.sign(row(x) - pr) === sd);
            for (let i = 1; i < side.length; i++)
              expect(Math.abs(row(side[i]) - pr), `${k}: ${name(p)}, союз ${u.union.id}: ${name(side[i - 1])} ближе к родителю, чем ${name(side[i])}`).toBeGreaterThan(Math.abs(row(side[i - 1]) - pr));
            if (side.length < 2) continue;
            // между ними — ни одного лица другого союза того же родителя
            const lo = Math.min(...side.map(row));
            const hi = Math.max(...side.map(row));
            for (const v of us) {
              if (v === u) continue;
              for (const x of [...(v.wife ? [v.wife] : []), ...v.kids]) {
                const rx = row(x);
                expect(rx > lo && rx < hi, `${k}: ${name(x)} (союз ${v.union.id}) внутри группы ${u.union.id}`).toBe(false);
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

  it('у Иакова наружу: Лия, Дина, Завулон, Иссахар, Левий, Симеон, Рувим; Рахиль, Вениамин, Иосиф; ближе всех — Рахиль, дальше всех — Лия', () => {
    const r = layoutOf('Иаков');
    const j = r.rows.get('iakov')!;
    const dist = (ids: string[]) => ids.map((id) => Math.abs(r.rows.get(id)! - j));
    const asc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);
    expect(asc(dist(['liya', 'dina', 'zavulon', 'issakhar', 'leviy', 'simeon', 'ruvim'])), 'Лия и её дети').toBe(true);
    expect(asc(dist(['rakhil', 'veniamin', 'iosif'])), 'Рахиль и её дети').toBe(true);
    // стороны по данным: у лица с несколькими союзами с детьми единицы чередуются выше и ниже следа
    const us = r.units.get('iakov')!;
    expect(new Set(us.map((u) => u.side)).size, 'союзы Иакова по обе стороны следа').toBe(2);
    // позже союз — ближе (решение 173): Рахиль (Иосиф родился последним из одиннадцати) — первой, Лия — последней
    expect(us[0].union.id).toBe('u:iakov+rakhil');
    expect(us[us.length - 1].union.id).toBe('u:iakov+liya');
  });

  it('решение 173: черта брака и отводы в год своего события не пересекают тех, кто в эти годы уже в семье (Иаков, Давид, Авраам)', () => {
    for (const k of ['Иаков', 'Давид', 'Авраам']) {
      const r = layoutOf(k);
      const row = (id: string) => r.rows.get(id)!;
      const S = SCENES[k].S;
      /** в год t лицо уже в семье и живо: жена — с года прихода (since), остальные — с рождения до конца места */
      const present = (id: string, t: number) => {
        const from = r.since.get(id) ?? T0(id);
        return from < t && t <= D.span(id)[1];
      };
      const bad: string[] = [];
      const cross = (what: string, a: number, b: number, t: number, skip: string[]) => {
        for (const x of S) {
          if (skip.includes(x) || !r.rows.has(x)) continue;
          const rx = row(x);
          if (rx > Math.min(a, b) && rx < Math.max(a, b) && present(x, t)) bad.push(`${k}: ${what} (${Math.round(t)}) — через ${name(x)}`);
        }
      };
      for (const [p, us] of r.units)
        for (const u of us) {
          if (u.wife) {
            cross(`черта ${name(p)} — ${name(u.wife)}`, row(p), row(u.wife), u.trunk, [p, u.wife]);
            for (const c of u.kids) cross(`отвод ${name(u.wife)} → ${name(c)}`, row(u.wife), row(c), T0(c), [p, u.wife, c]);
          } else if (u.kids.length) {
            // мать не названа: ствол от следа отца в год ствола, зубцы — по строкам детей
            const far = u.kids.reduce((m, c) => (Math.abs(row(c) - row(p)) > Math.abs(m - row(p)) ? row(c) : m), row(p));
            cross(`ствол ${name(p)}`, row(p), far + Math.sign(far - row(p)), u.trunk, [p, ...u.kids]);
          }
        }
      expect(bad).toEqual([]);
      // жёны — в семье мужа с года союза: Лия — за год до Рувима, Вирсавия — до первого сына
      if (k === 'Иаков') expect(r.since.get('liya')).toBe(T0('ruvim') - 1);
      if (k === 'Давид') {
        expect(r.since.get('virsaviya')).toBe(Math.min(...r.units.get('david')!.find((u) => u.wife === 'virsaviya')!.kids.map(T0)) - 1);
        // сыновья, рождённые в Иерусалиме (мать не названа): ствол — до рождения Нафана и Соломона, чьи строки он проходит
        const un = r.units.get('david')!.find((u) => u.union.id === 'u:david+')!;
        expect(un.trunk).toBeLessThan(Math.min(T0('nafan-syn-davida'), T0('solomon')));
      }
    }
  });

  it('большая семья одного союза: Иафет посередине своих семерых сыновей (Быт 10:2)', () => {
    const r = layoutOf('Ной');
    const sons = r.units.get('iafet')![0].kids;
    expect(sons.length).toBe(7);
    const above = sons.filter((x) => r.rows.get(x)! > r.rows.get('iafet')!).length;
    expect(above).toBeGreaterThanOrEqual(3);
    expect(sons.length - above).toBeGreaterThanOrEqual(3);
  });

  it('Давид: Вирсавия — ближе всех жён (её союз позже хевронских), хевронские союзы — лестницей по обе стороны', () => {
    const r = layoutOf('Давид');
    const us = r.units.get('david')!;
    // решение 173: ближе всех — дети, рождённые в Иерусалиме, чья мать не названа (1 Пар 3:5–9; 14:4–7), затем Вирсавия
    // (при равном годе союза с Эглой — союз с ребёнком линии Мессии ближе: у его черты расходятся ленты, решение 177)
    expect(us.filter((u) => u.wife)[0].union.id).toBe('u:david+virsaviya');
    expect(new Set(us.map((u) => u.side)).size).toBe(2);
  });

  it('муж-гость без детей в показе стоит у жены: Иодай — у Иосавеф, дочери Иорама, в «потомках Иуды» (2 Пар 22:11)', () => {
    const r = layoutOf('Род Иуды по отцам');
    expect(SCENES['Род Иуды по отцам'].S.has('iodai')).toBe(true);
    expect(r.home.get('iodai')).toBe('iosavef');
    expect(Math.abs(r.rows.get('iodai')! - r.rows.get('iosavef')!)).toBe(1);
    // Иосавеф осталась в родной семье: у отца (детей Иодая в роде Иуды нет)
    expect(r.home.get('iosavef')).not.toBe('iodai');
  });
});

describe('Я18: число строк', () => {
  for (const k of Object.keys(SCENES))
    it(`${k}: строк не больше лиц`, () => {
      const r = layoutOf(k);
      expect(r.count).toBeLessThanOrEqual(SCENES[k].S.size);
      // каждое лицо сцены получило строку, строки плотные 0…count − 1
      expect(r.rows.size).toBe(SCENES[k].S.size);
      expect(Math.max(...r.rows.values())).toBe(r.count - 1);
    });
  it('род Иуды по отцам — не больше 90 строк, колено Вениамина — не больше 80', () => {
    expect(layoutOf('Род Иуды по отцам').count).toBeLessThanOrEqual(90);
    expect(layoutOf('Колено Вениамина').count).toBeLessThanOrEqual(80);
  });
});

// ---------- Я19: устойчивость ----------

/** Шаги раскрытия (K3): от корня по союзам в ширину, каждый шаг — один союз (щелчок читателя). */
function steps(S: Set<string>, root: string): { uid: string; from: string; add: string[] }[] {
  const out: { uid: string; from: string; add: string[] }[] = [];
  const shown = new Set([root]);
  const q = [root];
  const done = new Set<string>();
  while (q.length) {
    const p = q.shift()!;
    for (const u of [...(unions.of.get(p) ?? []), ...(unions.origin.get(p) ?? [])]) {
      if (u.claim || done.has(u.id)) continue;
      const add = membersOf(u).filter((m) => S.has(m) && !shown.has(m));
      if (!add.length) continue;
      done.add(u.id);
      for (const m of add) {
        shown.add(m);
        q.push(m);
      }
      out.push({ uid: u.id, from: p, add });
    }
  }
  const rest = [...S].filter((x) => !shown.has(x));
  if (rest.length) out.push({ uid: 'rest', from: root, add: rest });
  return out;
}

interface Stab {
  steps: number;
  flips: number;
  pairs: number;
  /** сдвигов к опоре (не наружу) и всего сравнений */
  inward: number;
  compared: number;
  /** союзы, чья сторона или порядок у того же родителя поменялись после раскрытия другого союза */
  changed: string[];
}
function stability(S: Set<string>, root: string): Stab {
  let cur = new Set([root]);
  let prev = familyLayout(cur, D);
  let prior: FamilyPrior = prev.prior;
  const st: Stab = { steps: 0, flips: 0, pairs: 0, inward: 0, compared: 0, changed: [] };
  for (const s of steps(S, root)) {
    const next = new Set([...cur, ...s.add]);
    const now = familyLayout(next, D, { prior });
    st.steps++;
    const a = cur.has(s.from) ? s.from : root;
    const a0 = prev.rows.get(a)!;
    const a1 = now.rows.get(a)!;
    const ids = [...cur];
    for (let i = 0; i < ids.length; i++) {
      const pi0 = prev.rows.get(ids[i])!;
      const pi1 = now.rows.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j++) {
        const b0 = pi0 - prev.rows.get(ids[j])!;
        const b1 = pi1 - now.rows.get(ids[j])!;
        if (b0 * b1 < 0) st.flips++;
        st.pairs++;
      }
      // сдвиг относительно опоры — только наружу: лицо выше опоры не опускается к ней, ниже — не поднимается
      const side = Math.sign(pi0 - a0);
      if (side) {
        st.compared++;
        const d = pi1 - a1 - (pi0 - a0);
        if (d * side < 0) st.inward++;
      }
    }
    // второй союз не меняет первый: у прежних союзов лица from — те же стороны и тот же порядок членов
    for (const u of prev.units.get(s.from) ?? []) {
      const v = now.units.get(s.from)?.find((x) => x.union.id === u.union.id);
      if (!v) continue;
      // союз, у которого на небе ещё не было ни жены, ни детей (сын — в коридоре: Соломон и Наама — Ровоам), стороны
      // не имел: его первая постановка — не перестановка (этап 13: царица-мать ставится по другую сторону от коридора)
      if (!u.wife && !u.kids.length) continue;
      if (v.side !== u.side) st.changed.push(`${u.union.id}: сторона`);
      const m0 = [...(u.wife ? [u.wife] : []), ...u.kids];
      const rel0 = m0.map((x) => prev.rows.get(x)! - a0);
      const rel1 = m0.map((x) => now.rows.get(x)! - a1);
      for (let i = 1; i < m0.length; i++) if (Math.sign(rel0[i - 1] - rel0[i]) !== Math.sign(rel1[i - 1] - rel1[i])) st.changed.push(`${u.union.id}: порядок`);
    }
    cur = next;
    prev = now;
    prior = now.prior;
  }
  return st;
}

describe('Я19: устойчивость при раскрытии', () => {
  for (const k of [...FAMILIES, 'Колено Вениамина'])
    it(`${k}: перестановок пар нет, сдвиги только наружу, второй союз не меняет первый`, () => {
      const st = stability(SCENES[k].S, SCENES[k].root);
      expect(st.steps).toBeGreaterThan(0);
      expect(st.flips, `${k}: перестановок пар ${st.flips} из ${st.pairs}`).toBe(0);
      expect(st.inward, `${k}: сдвигов к опоре ${st.inward} из ${st.compared}`).toBe(0);
      expect(st.changed, k).toEqual([]);
    });
  it('род Иуды по отцам: перестановок пар не больше 0,05 %', { timeout: 60_000 }, () => {
    const st = stability(SCENES['Род Иуды по отцам'].S, 'iuda');
    expect(st.steps).toBeGreaterThan(100);
    expect(st.flips / st.pairs).toBeLessThanOrEqual(0.0005);
    expect(st.changed).toEqual([]);
  });
  it('прежняя укладка — вход: тот же состав с априорной укладкой ложится так же', () => {
    for (const k of Object.keys(SCENES)) {
      const r = layoutOf(k);
      const again = familyLayout(SCENES[k].S, D, { prior: r.prior });
      expect(Object.fromEntries(again.rows), k).toEqual(Object.fromEntries(r.rows));
    }
  });
});

describe('Я20: время укладки', () => {
  it('300 лиц — не дольше 60 мс (лучшее из трёх, после разогрева)', () => {
    const S = SCENES['Род Иуды по отцам'].S;
    expect(S.size).toBeGreaterThanOrEqual(250);
    expect(S.size).toBeLessThanOrEqual(320);
    familyLayout(S, D);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      familyLayout(S, D);
      best = Math.min(best, performance.now() - t);
    }
    expect(best, `${Math.round(best)} мс на ${S.size} лиц`).toBeLessThanOrEqual(60);
  });
});

describe('коридор линий Мессии: без «горба», ветвь Иосифа выше ветви Марии', () => {
  const ids = contentOf({ kind: 'lines' }).ids;
  const r = familyLayout(new Set(ids), D);
  const J = lines.joseph.persons.map((x) => x.id).filter((id) => ids.has(id));
  const M = lines.mary.persons.map((x) => x.id).filter((id) => ids.has(id));
  it('ни одно лицо линии не стоит на три строки и больше выше (или ниже) обоих соседей по линии', () => {
    // «горб Ламеха» (снимок владельца 14) — лицо на много строк выше соседей. Подъём на строку-две бывает вынужденным:
    // Иехония родился, когда Иосия и Иоаким ещё живы, и их строки заняты
    for (const seq of [J, M])
      for (let i = 1; i + 1 < seq.length; i++) {
        const [a, b, c] = [r.rows.get(seq[i - 1])!, r.rows.get(seq[i])!, r.rows.get(seq[i + 1])!];
        expect(Math.min(b - a, b - c) >= 3, `горб у ${name(seq[i])}`).toBe(false);
        expect(Math.min(a - b, c - b) >= 3, `яма у ${name(seq[i])}`).toBe(false);
      }
  });
  it('Ламех не выше Мафусала и Ноя больше чем на строку', () => {
    const l = r.rows.get('lamekh')!;
    expect(l - r.rows.get('mafusal')!).toBeLessThanOrEqual(1);
    expect(l - r.rows.get('noy')!).toBeLessThanOrEqual(2);
  });
  it('лица только линии Иосифа — выше лиц только линии Марии', () => {
    const jOnly = J.filter((id) => !M.includes(id)).map((id) => r.rows.get(id)!);
    const mOnly = M.filter((id) => !J.includes(id)).map((id) => r.rows.get(id)!);
    expect(Math.min(...jOnly)).toBeGreaterThan(Math.max(...mOnly));
  });
  it('шаг линии — не больше трёх строк; все 104 лица — не больше 16 строк', () => {
    for (const seq of [J, M]) for (let i = 1; i < seq.length; i++) expect(Math.abs(r.rows.get(seq[i])! - r.rows.get(seq[i - 1])!), `${name(seq[i - 1])} → ${name(seq[i])}`).toBeLessThanOrEqual(3);
    expect(ids.size).toBe(104);
    expect(r.count).toBeLessThanOrEqual(16);
  });
  it('«песочные часы»: в роде лица «оба направления» семьи предков выше лица, лицо и потомки ниже', () => {
    // лицо коридора (Иаков): семьи предков — над коридором, его семья — под ним
    const c = contentOf({ kind: 'lineage', id: 'iakov', dir: 'both', gen: 2, by: 'father' });
    const S = new Set([...c.ids, ...c.guests]);
    const h = familyLayout(S, D, { focus: 'iakov' });
    const at = h.rows.get('iakov')!;
    for (const kid of ['ruvim', 'iosif', 'dan', 'gad', 'liya', 'rakhil']) expect(h.rows.get(kid)!, name(kid)).toBeLessThan(at);
    for (const w of ['revekka', 'sarra']) expect(h.rows.get(w)!, name(w)).toBeGreaterThan(at);
    // лицо вне коридора (Моисей): цепочка предков сходит к нему сверху, потомки — ниже
    for (const [id, anc, desc] of [
      ['moisey', ['kaaf', 'amram'], ['girsam', 'eliezer-syn-moiseya', 'shevuil-syn-girsama', 'rekhaviya']],
      ['nakhor-syn-farry', ['farra'], ['uts-syn-nakhora', 'vafuil', 'lavan', 'maakha-syn-nakhora']],
    ] as const) {
      const cc = contentOf({ kind: 'lineage', id, dir: 'both', gen: 2, by: 'father' });
      const SS = new Set([...cc.ids, ...cc.guests]);
      const r = familyLayout(SS, D, { focus: id });
      const f = r.rows.get(id)!;
      for (const a of anc) if (SS.has(a)) expect(r.rows.get(a)!, `${name(a)} выше ${name(id)}`).toBeGreaterThan(f);
      let n = 0;
      for (const x of desc)
        if (SS.has(x)) {
          n++;
          expect(r.rows.get(x)!, `${name(x)} ниже ${name(id)}`).toBeLessThan(f);
        }
      expect(n, id).toBeGreaterThan(1);
    }
  });
});

describe('время знаков одно с небом', () => {
  it('укладка меняет только строки: год знака лица — тот же, что у всего неба', () => {
    for (const id of ['iakov', 'iosif', 'david', 'solomon']) expect(T0(id)).toBe(familyData().t0(id));
  });
});
