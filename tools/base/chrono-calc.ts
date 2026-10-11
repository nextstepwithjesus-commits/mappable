/**
 * Расчёт лет по модели (Д6; 04 § 3.8, § 9 «Тесты при сборке»; 02 § 3.15: «годы считает расчёт по модели и схеме»).
 *
 * Сеть — числа текста хронологических записей (окончательного вида и прежнего: `fatherAge`, `age`) и выборы модели
 * (`choices` записи модели в base/models.json). Годы от сотворения Адама переводятся в годы до Р. Х. счётом назад от опоры
 * `an-solomon-4` (4-й год Соломона) через 479 лет 3 Цар 6:1 и 430 лет Исх 12:40. Цари — не расчёт: годы схемы берутся
 * только из таблицы схемы (04 § 16.1); у `s-thiele` это справка без страницы.
 *
 * Запуск: npx tsx tools/base/chrono-calc.ts — таблица лет сцен пакета 1 по каждой модели (для прототипа и сверки).
 */
import { pathToFileURL } from 'node:url';
import type { Base } from './migrate.ts';
import type { Anchor, Calc, ChronoModel, Cite, KingScheme, TimeInput } from './types.ts';

/** Год до Р. Х. — отрицательный, исторический (нулевого года нет). */
export type Year = number;
export interface ModelYears {
  model: string;
  /**
   * Рождение и конец земной жизни лица (годы исторические). `died` — год конца земной жизни по сумме лет; `end` — как он назван:
   * нет поля — «возраст при смерти»; `end-of-life` («конец земной жизни»: Енох, Быт 5:24; Сим и потомки в Быт 11 — «и умер» в
   * скобках). Подпись у `end-of-life` — «прожил всего N лет», не «умер» (Д6-3).
   */
  person: Map<string, { born?: Year; died?: Year; end?: 'death' | 'end-of-life' }>;
  /** События границ: сотворение Адама, потоп, выход из Харрана, приход в Египет, Исход. */
  events: Record<'creation' | 'flood' | 'exit' | 'egypt' | 'exodus', Year>;
}

const choice = (m: ChronoModel, re: RegExp) => m.choices.find((c) => re.test(c.what))?.number;

/** Вход «возраст отца при рождении» из записи любого вида: [отец, число, число в скобках]. */
function birthLinks(base: Base): Map<string, { father: string; n: number; br?: number }> {
  const fatherOf = new Map<string, string>();
  for (const o of base.origins) if (o.role === 'father' && o.primary && o.parent) fatherOf.set(o.child, o.parent);
  const out = new Map<string, { father: string; n: number; br?: number }>();
  for (const c of base.chrono) {
    const ch: any = c.chrono;
    if (Array.isArray(ch?.inputs)) {
      const t = (ch.inputs as TimeInput[]).find((x) => x.kind === 'age-at-birth' && x.other && x.number !== undefined);
      if (t) out.set(c.actor, { father: t.other!, n: t.number!, br: t.numberBracket });
    } else if (typeof ch?.born?.fatherAge === 'number' && fatherOf.get(c.actor)) {
      out.set(c.actor, { father: fatherOf.get(c.actor)!, n: ch.born.fatherAge, br: ch.born.fatherAgeBracket });
    }
  }
  return out;
}
function deathAges(base: Base): Map<string, { n: number; end: 'death' | 'end-of-life' }> {
  const out = new Map<string, { n: number; end: 'death' | 'end-of-life' }>();
  for (const c of base.chrono) {
    const ch: any = c.chrono;
    // «конец земной жизни» — та же сумма лет, что «возраст при смерти» (Д6-3)
    const t = Array.isArray(ch?.inputs) ? (ch.inputs as TimeInput[]).find((x) => x.kind === 'age-at-death' || x.kind === 'end-of-life') : undefined;
    const n = t?.number ?? ch?.died?.age;
    if (typeof n === 'number') out.set(c.actor, { n, end: t?.kind === 'end-of-life' ? 'end-of-life' : 'death' });
  }
  return out;
}

/** Годы по модели `m-…`. */
export function modelYears(base: Base, id: string): ModelYears {
  const m = base.models.find((x) => x.id === id) as ChronoModel | undefined;
  if (!m || m.type !== 'model') throw new Error(`нет модели ${id}`);
  const brackets = m.basis === 'not-basis';
  const links = birthLinks(base);
  // Аврам: возраст Фарры при его рождении — выбор модели
  const terah = choice(m, /Фарре при рождении Аврама ровно/);
  if (terah === undefined) throw new Error(`${id}: нет выбора «Фарре ровно N»`);
  links.set('p-avraam', { father: 'p-farra', n: terah });
  // от сотворения Адама (год 0) по цепочке рождений
  const am = new Map<string, number>([['p-adam', 0]]);
  const at = (p: string, path = new Set<string>()): number | undefined => {
    if (am.has(p)) return am.get(p);
    const l = links.get(p);
    if (!l || path.has(p)) return undefined;
    path.add(p);
    const f = at(l.father, path);
    if (f === undefined) return undefined;
    const v = f + (brackets && l.br !== undefined ? l.br : l.n);
    am.set(p, v);
    return v;
  };
  const noah = at('p-noy')!;
  const abram = at('p-avraam')!;
  const jacob = at('p-iakov')!;
  const flood = noah + 600; // «Ной же был шестисот лет, как потоп водный пришел» (Быт 7:6) — граница эпохи
  const exit = abram + 75; // Быт 12:4
  const egypt = jacob + 130; // Быт 47:9
  const anchor = base.anchors.anchors.find((a: any) => a.id === m.anchors[0]);
  const since = choice(m, /479|четыреста восьмидесятом/) ?? 479;
  // опора модели — расчёт по схеме царей (an-solomon-4): год по умолчанию одним числом (Д-20: год опоры — промежуток)
  const exodusBC = anchor.year.earliest - since; // 967 + 479 лет назад
  const sojourn = choice(m, /430/) ?? 430;
  // «Краткое пребывание»: 430 лет — от выхода Аврама из Харрана; иначе — от прихода Иакова в Египет
  const fromExit = /от выхода Аврама/.test(m.choices.find((c) => /430/.test(c.what))?.what ?? '');
  const creationBC = exodusBC - sojourn - (fromExit ? exit : egypt);
  const Y = (amYear: number): Year => creationBC + amYear; // исторический год: < 0 — до Р. Х. (до первого года по Р. Х. не доходит)
  const deaths = deathAges(base);
  const person = new Map<string, { born?: Year; died?: Year; end?: 'death' | 'end-of-life' }>();
  for (const p of new Set([...links.keys(), 'p-adam'])) {
    const b = at(p);
    if (b === undefined) continue;
    const d = deaths.get(p);
    person.set(p, { born: Y(b), ...(d !== undefined && { died: Y(b + d.n) }), ...(d?.end === 'end-of-life' && { end: d.end }) });
  }
  return { model: id, person, events: { creation: Y(0), flood: Y(flood), exit: Y(exit), egypt: Y(egypt), exodus: exodusBC } };
}

/** Страница труда сверена: не пусто и не «страница не сверена» (04 § 9 п. 19). */
const pageOk = (c: Cite) => !!c.page?.trim() && !/не сверен/.test(c.page);

/**
 * Год записи от опоры (02 § 3.10.2 [4.5; 4.6]; К-21): только у ссылки `calc.anchor` к опоре вида `external`, у которой есть труд
 * со страницей (04 § 9 п. 19). Год — промежуток опоры по умолчанию, со сроком `offset` — сдвинутый на число лет: порядковый год
 * («в сороковой год») — на число без единицы, прошедший срок («спустя …») — промежуток в один год (включительный и обычный
 * счёт). Иначе года нет (`undefined`): запись стоит по эпохе со стихом. Нулевого года нет.
 */
export function anchorYear(base: Pick<Base, 'anchors'>, calc: Calc | undefined): { earliest: Year; latest: Year; anchor: string } | undefined {
  if (!calc?.anchor || calc.model || calc.scheme) return undefined;
  const a = (base.anchors?.anchors ?? []).find((x: Anchor) => x.id === calc.anchor) as Anchor | undefined;
  if (!a || a.kind !== 'external' || !a.year) return undefined;
  if (!(a.works ?? []).some(pageOk)) return undefined;
  const add = (y: Year, n: number): Year => {
    const z = y + n;
    return y < 0 && z >= 0 ? z + 1 : y > 0 && z <= 0 ? z - 1 : z;
  };
  const o = calc.offset;
  if (!o) return { earliest: a.year.earliest, latest: a.year.latest, anchor: a.id };
  if (o.unit === 'month') return undefined;
  if (o.count === 'ordinal') return { earliest: add(a.year.earliest, o.number - 1), latest: add(a.year.latest, o.number - 1), anchor: a.id };
  return { earliest: add(a.year.earliest, o.number - 1), latest: add(a.year.latest, o.number), anchor: a.id };
}

/** Годы царя по схеме: только таблица схемы (04 § 16.1). Нет строки — года по этой схеме нет. */
export function schemeYears(base: Base, scheme: string, king: string) {
  const s = base.models.find((x) => x.id === scheme) as KingScheme | undefined;
  if (!s || s.type !== 'scheme') throw new Error(`нет схемы ${scheme}`);
  return s.table.filter((r) => r.king === king);
}

function main() {
  import('./validate.ts').then(({ loadBase }) => {
    const base = loadBase();
    const bc = (y: number) => (y < 0 ? `${-y} до Р. Х.` : `${y} по Р. Х.`);
    for (const id of ['m-dolgoe', 'm-kratkoe', 'm-farra70', 'm-skobki']) {
      const r = modelYears(base, id);
      console.log(`== ${id}: сотворение Адама ${bc(r.events.creation)}; потоп ${bc(r.events.flood)}; выход из Харрана ${bc(r.events.exit)}; приход в Египет ${bc(r.events.egypt)}; Исход ${bc(r.events.exodus)}`);
    }
    const d = modelYears(base, 'm-dolgoe');
    for (const [p, y] of d.person) console.log(`  ${p}: род. ${y.born !== undefined ? bc(y.born) : '—'}; ум. ${y.died !== undefined ? bc(y.died) : '—'}`);
    for (const k of ['p-oziya', 'p-ioafam', 'p-akhaz', 'p-ezekiya', 'p-osiya-syn-ily']) {
      const my = schemeYears(base, 's-mcfall-young', k);
      const th = schemeYears(base, 's-thiele', k);
      console.log(`  ${k}: McFall — Young ${my.length ? JSON.stringify(my) : 'нет таблицы автора'}; Тиле (справка) ${th.map((r) => `${bc(r.coregencyStart ?? r.soleStart)}–${bc(r.end)}`).join(', ')}`);
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
