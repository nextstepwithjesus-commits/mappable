/**
 * Запросы ядра к пакетам (09 § 4.1 слой 4): инструмент получает номер предмета и спрашивает нужную часть, а не копирует
 * биографию. Номера наружу — полные (`p-adam`); в пакетах — короткие (02 § 3.3.1). Ядро без DOM.
 *
 * «Нет данных для инструмента» (01 § 2.3; 09 § 4.3): ответ с причиной и стихом из записи «нет сведений»; если записи нет —
 * «не размечено», а не пустота.
 */
import type { ActorRow, CardsVolume, CoreIndex, NoDataRow, OriginRow, PersonName, RedirectRow, ToolsIndex } from './types.ts';
import { empty, ready, type State } from './state.ts';

export const P = 'p-';
export const G = 'g-';
export const fullPerson = (short: string): string => P + short;
export function shortPerson(id: string): string {
  if (!id.startsWith(P)) throw new Error(`номер «${id}» — не лицо (нужен p-…)`);
  return id.slice(P.length);
}

/** Инструменты, у которых ядро отвечает «нет данных». */
export type Tool = 'genealogiya' | 'vremya' | 'geografiya' | 'svyazi';

/**
 * Разделы прежней карточки, записи «нет сведений» которых отвечают за инструмент. Раздел 6 — родители (так записаны
 * Адам, Ева, Мелхиседек: Евр 7:3). Разделы для Времени, Географии и Связей задают документы инструментов при разметке.
 */
export const TOOL_SECTIONS: Record<Tool, number[]> = { genealogiya: [6], vremya: [], geografiya: [], svyazi: [] };

export type Resolved =
  | { kind: 'есть'; id: string }
  | { kind: 'переход'; id: string; from: string }
  | { kind: 'выбор'; to: string[]; from: string }
  | { kind: 'снята'; from: string }
  | { kind: 'нет'; id: string };

export interface Person extends PersonName {
  /** Полный номер. */
  id: string;
  sex?: string;
  subkind?: string;
  volume?: string;
}

export interface Kin {
  id?: string;
  /** Безымянный родитель — словами стиха. */
  words?: string;
  role: 'f' | 'm';
  kind: string;
}

function redirectFull(row: RedirectRow): { from: string; to: string[] } {
  if (row.length === 3) return { from: row[0], to: row[1] };
  return { from: fullPerson(row[0]), to: row[1].map(fullPerson) };
}

export class Data {
  private names = new Map<string, PersonName>();
  private actors = new Map<string, ActorRow>();
  private up = new Map<string, OriginRow[]>();
  private down = new Map<string, OriginRow[]>();
  private redirects = new Map<string, string[]>();

  constructor(core: CoreIndex, private tools?: ToolsIndex) {
    for (const p of core.persons) this.names.set(p.id, p);
    if (tools) {
      for (const a of tools.actors) this.actors.set(a.id, a);
      for (const o of tools.origins) {
        (this.up.get(o.c) ?? this.up.set(o.c, []).get(o.c))?.push(o);
        if (o.p) (this.down.get(o.p) ?? this.down.set(o.p, []).get(o.p))?.push(o);
      }
      for (const r of tools.redirects) {
        const { from, to } = redirectFull(r);
        this.redirects.set(from, to);
      }
    }
  }

  /**
   * Номер → живая запись, переход, выбор или «снята» (09 § 4.4.1, переадресация трёх видов). Переадресация идёт по цепочке
   * (a → b → c) с защитой от петли (рецензия данных, № 19).
   */
  resolve(id: string): Resolved {
    const seen = new Set<string>();
    let cur = id;
    for (;;) {
      if (cur.startsWith(P) && this.names.has(cur.slice(P.length))) return cur === id ? { kind: 'есть', id } : { kind: 'переход', id: cur, from: id };
      const to = this.redirects.get(cur);
      if (!to || seen.has(cur)) return cur === id ? { kind: 'нет', id } : { kind: 'нет', id: cur };
      seen.add(cur);
      if (to.length === 0) return { kind: 'снята', from: id };
      if (to.length > 1) return { kind: 'выбор', to, from: id };
      cur = to[0];
    }
  }

  /** Том карточек лица (часть тома, если том делится) — для `Loader.get('cards', { volume })`. */
  volumeOf(id: string): string | undefined {
    return this.actors.get(shortPerson(id))?.v;
  }

  person(id: string): Person | undefined {
    if (!id.startsWith(P)) return undefined;
    const s = id.slice(P.length);
    const n = this.names.get(s);
    if (!n) return undefined;
    const a = this.actors.get(s);
    return { ...n, id, ...(a?.s && { sex: a.s }), ...(a?.sk && { subkind: a.sk }), ...(a && { volume: a.v }) };
  }

  /** Родители лица: по рёбрам, без кандидатов (кандидаты — отдельным списком указателя). */
  parents(id: string): Kin[] {
    return (this.up.get(shortPerson(id)) ?? []).map((o) => ({ ...(o.p ? { id: fullPerson(o.p) } : { words: o.u }), role: o.r, kind: o.k }));
  }

  children(id: string): Kin[] {
    return (this.down.get(shortPerson(id)) ?? []).map((o) => ({ id: fullPerson(o.c), role: o.r, kind: o.k }));
  }

  spouses(id: string): string[] {
    const s = shortPerson(id);
    const out: string[] = [];
    for (const u of this.tools?.unions ?? []) {
      if (u.h === s && u.w) out.push(fullPerson(u.w));
      else if (u.w === s && u.h) out.push(fullPerson(u.h));
    }
    return out;
  }

  /** Есть ли у лица данные для инструмента (по пакетам, которые уже есть). */
  hasToolData(tool: Tool, id: string): boolean {
    if (tool === 'genealogiya') return this.parents(id).length > 0 || this.children(id).length > 0 || this.spouses(id).length > 0;
    return false;
  }

  /**
   * Ответ инструменту о предмете: данные есть — «готово» с номером; нет — «пусто» с причиной: запись «нет сведений» со стихом
   * (01 § 2.3: «Родство Мелхиседека в Библии не указано (Евр 7:3)»), иначе «не размечено». Кнопка не прячется.
   */
  forTool(tool: Tool, id: string, cards?: CardsVolume): State<{ id: string }> {
    const r = this.resolve(id);
    if (r.kind === 'нет') return empty({ kind: 'нет записи', id });
    if (r.kind === 'снята') return empty({ kind: 'нет записи', id, reason: 'запись снята' });
    if (r.kind === 'выбор') return empty({ kind: 'нет записи', id, reason: `запись разделена: ${r.to.join(', ')}` });
    const real = r.id;
    if (this.hasToolData(tool, real)) return ready({ id: real });
    const nd = noDataFor(tool, real, cards);
    if (nd) {
      return empty({ kind: 'нет сведений', scripture: nd.k === 'scripture-says', ...(nd.w && { what: nd.w }), refs: nd.r ?? [], ...(nd.q && { words: nd.q }) });
    }
    return empty({ kind: 'не размечено', tool });
  }
}

/** Полный номер утверждения по порядковому номеру пакета карточек: 12299 → `a-12299` (02 § 8.1, Р-11). */
export const claimId = (n: number): string => `a-${n}`;

/** Запись «нет сведений» лица для инструмента из тома карточек; «Писание говорит» — раньше «молчит». */
export function noDataFor(tool: Tool, id: string, cards?: CardsVolume): NoDataRow | undefined {
  const secs = TOOL_SECTIONS[tool];
  if (!cards || !secs.length) return undefined;
  const nd = cards.cards[shortPerson(id)]?.nd ?? [];
  const hit = nd.filter((n) => secs.includes(n.s));
  return hit.find((n) => n.k === 'scripture-says') ?? hit[0];
}
