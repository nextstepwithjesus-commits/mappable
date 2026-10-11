/**
 * Граф Генеалогии (03 § 3.1–3.2, § 5): лица, рёбра, союзы, родство словами, прочтения — из пакетов пробы (ядро индекса,
 * указатель инструментов, пакет Генеалогии) и добавочного пакета `genealogy-proto.json` (номера и стихи записей).
 * Без DOM: этим модулем пользуются экран, тесты и замеры (09 § 4.1, слой 4). Шаг 2.0 плана 10 — серый макет.
 *
 * Главные правила:
 * - **кровное ребро** — вид `natural`, `alternative`, `by-luke` уровня «сказано» или «вывод»; `parents-word` (Иосиф у Иисуса
 *   Христа), приёмное, «из сыновей» (`ancestor`), слово текста (`text-word`) кровными не бывают (03 § 3.1, § 18);
 * - **прочтения**: ребро набора действует, только если выбранное прочтение набора в его списке `ri`; в одном выборе у лица один
 *   кровный отец — сначала `natural`, затем другое место (левират и усыновление оставляют отцом Иакова, Илий — «по закону»);
 * - **рисуются все рёбра наборов при любом выборе** (03 § 5: «два места текста видны оба»): выбор меняет путь родства,
 *   отчёты, счётчики и подписи, но новых рёбер не создаёт никогда;
 * - ребро с тождеством «предположительно» в граф не входит: оно в `cand` и даёт строку у ребёнка (03 § 3.2).
 */
import type { CandRow, CoreIndex, GenealogyPack, Identity, SaidBy, ToolsIndex } from '../../../core/types.ts';

export interface ДопПакет {
  schema: 1;
  admit: 'probe' | 'release';
  base: string;
  origins: Record<string, { id: string; r: string[]; w?: { t: string; r: string; sb?: string }[]; n?: string; sh?: 1; ok?: 1 }>;
  unions: Record<string, { id: string; t: Слово[]; ok?: 1 }>;
  kin: Record<string, { id: string; r: string[]; ok?: 1 }>;
}
export interface Слово { k: string; w?: string; r: string[]; ce?: string; nm?: { ce: string; r: string[] }; sb?: string }

export interface Лицо {
  i: number;
  id: string;
  имя: string;
  /** Другие имена (для поиска и `NAME TYPE aka`). */
  другие: string[];
  /** Короткое уточнение: до первой запятой, не длиннее 24 знаков (03 § 7.4). */
  уточн?: string;
  /** Полное уточнение тёзки. */
  уточнПолн?: string;
  пол?: 'm' | 'f';
  вид: string;
  знач: number;
}

export interface Ребро {
  i: number;
  реб: number;
  род: number;
  роль: 'f' | 'm';
  вид: string;
  /** Уровень: `scripture` — сказано, `inference` — вывод. */
  уровень: string;
  набор?: string;
  в?: string[];
  основное: boolean;
  порядок?: number;
  пропуск: boolean;
  поСловам?: SaidBy;
  тождество?: Identity;
  /** Номер записи `o-…` (В1) и стихи. */
  номер: string;
  стихи: string[];
  слова?: { t: string; r: string; sb?: string }[];
  пояснение?: string;
  общиеСтихи: boolean;
  подписано: boolean;
}

export interface Союз { i: number; муж: number; жена: number; виды: string[]; номер: string; слова: Слово[]; подписано: boolean }
export interface Родство { от: number; к: number; слово: string; уровень: string; поСловам?: SaidBy; номер: string; стихи: string[] }
export interface Набор { id: string; название: string; поУмолчанию: string; прочтения: { id: string; название: string; уровень: string; авторы: string[] }[] }
/** Выбор прочтений: набор → прочтение. Отсутствие набора — прочтение по умолчанию. */
export type Выбор = Readonly<Record<string, string>>;

export const КРОВНЫЕ = new Set(['natural', 'alternative', 'by-luke']);
/** «Другое место текста» (03 § 3.2): второе ребро набора. */
export const ДРУГОЕ_МЕСТО = new Set(['alternative', 'by-luke']);

export function короткое(d?: string): string | undefined {
  if (!d) return undefined;
  const first = d.split(',')[0].trim();
  return first.length <= 24 ? first : first.slice(0, 23).trimEnd() + '…';
}

export class Граф {
  readonly лица: Лицо[];
  readonly рёбра: Ребро[];
  readonly союзы: Союз[];
  readonly родство: Родство[];
  readonly наборы: Map<string, Набор>;
  readonly кандидаты: CandRow[];
  readonly линии: ToolsIndex['lines'];
  readonly области: ToolsIndex['areas'];
  readonly членства: GenealogyPack['members'];
  readonly труды: Map<string, string>;
  readonly поИд = new Map<string, number>();
  /** Рёбра к родителям и к детям по лицу (все виды). */
  readonly вверх: number[][];
  readonly вниз: number[][];
  readonly союзыЛица: number[][];
  readonly база: string;
  private кэш = new Map<string, { отец: Int32Array; мать: Int32Array; предок: Int32Array }>();

  constructor(core: CoreIndex, tools: ToolsIndex, gen: GenealogyPack, доп: ДопПакет) {
    const имена = new Map(core.persons.map((p) => [p.id, p]));
    this.лица = tools.actors.map((a, i) => {
      this.поИд.set(a.id, i);
      const n = имена.get(a.id);
      return { i, id: a.id, имя: n?.n ?? a.id, другие: n?.o ?? [], уточн: короткое(a.d), уточнПолн: a.d, пол: a.s as 'm' | 'f' | undefined, вид: a.k, знач: a.p ?? 1 };
    });
    // короткое уточнение — кратчайшая часть уточнения, которая различает тёзок (03 § 7.4; 07 § 4.1 п. 2)
    const тёзки = new Map<string, Лицо[]>();
    for (const л of this.лица) { if (!тёзки.has(л.имя)) тёзки.set(л.имя, []); тёзки.get(л.имя)!.push(л); }
    for (const гр of тёзки.values()) {
      if (гр.length < 2) continue;
      const части = гр.map((л) => (л.уточнПолн ?? '').split(',').map((x) => x.trim()).filter(Boolean));
      гр.forEach((л, j) => {
        const чужие = new Set(части.flatMap((xs, k) => (k === j ? [] : xs)));
        const своя = части[j].find((x) => !чужие.has(x));
        if (своя && своя !== части[j][0]) л.уточн = короткое(своя);
      });
    }
    const ix = (id: string) => this.поИд.get(id) ?? -1;
    this.рёбра = [];
    for (const o of tools.origins) {
      if (!o.p) continue;
      const c = ix(o.c), p = ix(o.p);
      if (c < 0 || p < 0 || c === p) continue;
      const d = доп.origins[`${o.c}|${o.p}|${o.r}|${o.k}|${o.rs ?? ''}`];
      this.рёбра.push({
        i: this.рёбра.length, реб: c, род: p, роль: o.r, вид: o.k, уровень: o.ce ?? 'scripture',
        ...(o.rs && { набор: o.rs, в: Array.isArray(o.ri) ? o.ri : [o.ri as unknown as string] }),
        основное: !!o.pr, ...(o.or !== undefined && { порядок: o.or }), пропуск: !!o.g,
        ...(o.sb && { поСловам: o.sb }), ...(o.idt && { тождество: o.idt }),
        номер: d?.id ?? `o-${o.p}--${o.c}`, стихи: d?.r ?? [], ...(d?.w && { слова: d.w }), ...(d?.n && { пояснение: d.n }),
        общиеСтихи: !!d?.sh, подписано: !!d?.ok,
      });
    }
    this.союзы = [];
    for (const u of tools.unions) {
      if (!u.h || !u.w) continue;
      const h = ix(u.h), w = ix(u.w);
      if (h < 0 || w < 0) continue;
      const d = доп.unions[`${u.h}|${u.w}`];
      this.союзы.push({ i: this.союзы.length, муж: h, жена: w, виды: u.k, номер: d?.id ?? `u-${u.h}--${u.w}`, слова: d?.t ?? [], подписано: !!d?.ok });
    }
    this.родство = tools.kin.flatMap((k) => {
      const f = ix(k.f), t = ix(k.t);
      if (f < 0 || t < 0) return [];
      const d = доп.kin[`${k.f}|${k.t}|${k.r}`];
      return [{ от: f, к: t, слово: k.r, уровень: k.ce ?? 'scripture', ...(k.sb && { поСловам: k.sb }), номер: d?.id ?? '', стихи: d?.r ?? [] }];
    });
    this.труды = new Map(tools.works.map((w) => [w.id, [w.a, w.t].filter(Boolean).join(', ')]));
    this.наборы = new Map(tools.readings.map((r) => [r.id, {
      id: r.id, название: r.t, поУмолчанию: r.d,
      прочтения: r.r.map((x) => ({ id: x.id, название: x.l, уровень: x.ce ?? 'scripture', авторы: (x.w ?? []).map((c) => `${this.труды.get(c.w) ?? c.w} (${c.p})`) })),
    }]));
    this.кандидаты = tools.cand;
    this.линии = tools.lines;
    this.области = tools.areas;
    this.членства = gen.members;
    this.база = доп.base;
    const N = this.лица.length;
    this.вверх = Array.from({ length: N }, () => []);
    this.вниз = Array.from({ length: N }, () => []);
    this.союзыЛица = Array.from({ length: N }, () => []);
    for (const e of this.рёбра) {
      this.вверх[e.реб].push(e.i);
      this.вниз[e.род].push(e.i);
    }
    for (const u of this.союзы) {
      this.союзыЛица[u.муж].push(u.i);
      this.союзыЛица[u.жена].push(u.i);
    }
  }

  ид(id: string): number {
    return this.поИд.get(id) ?? -1;
  }
  имя(i: number): string {
    return this.лица[i]?.имя ?? '';
  }
  /** «Имя, короткое уточнение» — заголовок строки отчёта и начало доступного имени (03 § 7.4). */
  полное(i: number): string {
    const л = this.лица[i];
    return л.уточн ? `${л.имя}, ${л.уточн}` : л.имя;
  }

  прочтение(выбор: Выбор, набор: string): string {
    return выбор[набор] ?? this.наборы.get(набор)?.поУмолчанию ?? '';
  }
  действует(e: Ребро, выбор: Выбор): boolean {
    return !e.набор || (e.в ?? []).includes(this.прочтение(выбор, e.набор));
  }
  /** Ребро кровное по виду и уровню (без учёта прочтения). */
  кровноеПоВиду(e: Ребро): boolean {
    return КРОВНЫЕ.has(e.вид) && (e.уровень === 'scripture' || e.уровень === 'inference');
  }

  /**
   * Кровные родители в одном выборе прочтений: у лица не больше одного отца и одной матери. Сначала — действующее ребро
   * `natural`, затем действующее ребро другого места; при равных — основное (`pr`). «Из сыновей» — отдельно: `предок`.
   */
  кровь(выбор: Выбор = {}) {
    const ключ = JSON.stringify(Object.entries(выбор).sort());
    const есть = this.кэш.get(ключ);
    if (есть) return есть;
    const N = this.лица.length;
    const отец = new Int32Array(N).fill(-1), мать = new Int32Array(N).fill(-1), предок = new Int32Array(N).fill(-1);
    const ранг = (e: Ребро) => (e.вид === 'natural' ? 0 : 2) + (e.основное ? 0 : 1);
    for (const e of this.рёбра) {
      if (!this.действует(e, выбор)) continue;
      if (this.кровноеПоВиду(e)) {
        const t = e.роль === 'f' ? отец : мать;
        if (t[e.реб] < 0 || ранг(e) < ранг(this.рёбра[t[e.реб]])) t[e.реб] = e.i;
      } else if (e.вид === 'ancestor' && предок[e.реб] < 0) предок[e.реб] = e.i;
    }
    const r = { отец, мать, предок };
    this.кэш.set(ключ, r);
    return r;
  }
  /** Кровные дети лица в выборе (рёбра), в порядке текста. */
  детиКрови(p: number, выбор: Выбор = {}): Ребро[] {
    const к = this.кровь(выбор);
    return this.вниз[p].map((i) => this.рёбра[i]).filter((e) => к.отец[e.реб] === e.i || к.мать[e.реб] === e.i).sort((a, b) => (a.порядок ?? 1e6) - (b.порядок ?? 1e6) || a.i - b.i);
  }
  /** Братья и сёстры в выборе: общий кровный отец или общая кровная мать. */
  братья(p: number, выбор: Выбор = {}): number[] {
    const к = this.кровь(выбор);
    const out = new Set<number>();
    for (const t of [к.отец, к.мать]) {
      if (t[p] < 0) continue;
      const род = this.рёбра[t[p]].род;
      for (const e of this.детиКрови(род, выбор)) if (e.реб !== p) out.add(e.реб);
    }
    return [...out];
  }
  /** Мать ребёнка по кровному ребру (для групп по союзам). */
  мать(c: number, выбор: Выбор = {}): number {
    const m = this.кровь(выбор).мать[c];
    return m >= 0 ? this.рёбра[m].род : -1;
  }
  /** Все выборы прочтений: каждый набор — каждое прочтение при прочих по умолчанию, и выборы линий Мессии. */
  всеВыборы(): Выбор[] {
    const out: Выбор[] = [{}];
    for (const н of this.наборы.values()) for (const п of н.прочтения) if (п.id !== н.поУмолчанию) out.push({ [н.id]: п.id });
    for (const л of Object.values(this.линии)) if (л.rd) out.push(л.rd);
    return out;
  }
  /** Подпись уровня словом (03 § 7.4: без сокращений). */
  static уровеньСловом(u: string): string {
    return u === 'scripture' ? 'сказано' : u === 'inference' ? 'вывод' : u === 'interpretation' ? 'толкование' : u;
  }
}
