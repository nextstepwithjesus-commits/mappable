/**
 * Модель историй для экранов (11 § 3–4): строки каталога книги, группы повествований, вид словом, трудное, метка «часто
 * вспоминается в Библии», лица по значимости, места Писания по видам ссылки. Только данные пакета прототипа.
 */
import { Д, имя, естьЛицо } from '../общее/данные.ts';
import { книгаСсылки, отрезки } from '../общее/адреса.ts';
import { слой2, детям } from '../общее/настройки.ts';
import type { Story, StoryActor, Link } from '../общее/типы.ts';
import { BOOK_BY_CODE } from '../../../core/books.ts';

/** Вид словом (11 § 2.3): в простом слое «сводка» называется «обзор». */
export function видСловом(kind: string): string {
  const m: Record<string, string> = { event: 'событие', speech: 'речь', notice: 'известие', summary: слой2() ? 'сводка' : 'обзор', genealogy: 'родословие', vision: 'видение', 'jesus-story': 'рассказ Иисуса', parable: 'притча' };
  return m[kind] ?? kind;
}
export function знакВида(kind: string): string {
  const m: Record<string, string> = { event: 'событие', speech: 'речь', notice: 'известие', summary: 'сводка', genealogy: 'родословие', vision: 'видение', 'jesus-story': 'притча', parable: 'притча' };
  return m[kind] ?? 'событие';
}

/** Тихая строка трудного по теме поля `hard` (08 § 4.7, таблица): взрослая форма; «Прочтите сначала сами» — только детям (В-28). */
const ТЕМЫ: Record<string, string> = {
  'смерть на глазах': 'есть смерть', убийство: 'есть убийство', казнь: 'есть казнь', 'гибель детей': 'гибнут дети', 'угроза жизни ребёнка': 'жизнь ребёнка в опасности',
  'насилие над женщиной': 'говорится о насилии над женщиной', блуд: 'говорится о блуде', нагота: 'говорится о наготе', самоубийство: 'человек убивает себя',
  'вызывание умершего': 'вызывают умершего', 'страшные образы видения': 'страшные образы',
};
export const темаКратко = (s: Story) => (s.hard ?? []).map((h) => ТЕМЫ[h.topic] ?? `есть ${h.topic}`).join(', ');
export function строкаТрудного(s: Story): string {
  if (!s.hard?.length) return '';
  return `Трудная история: здесь ${темаКратко(s)}${детям() ? '. Прочтите сначала сами' : ''}`;
}
/** Короткая пометка в строке каталога: «трудное: убийство». */
export const трудноеКратко = (s: Story) => (s.hard?.length ? `трудное: ${s.hard.map((h) => h.topic.replace('смерть на глазах', 'смерть')).join(', ')}` : '');
/** Стихи поля `hard`. */
export function стихиТрудного(s: Story): Set<string> {
  const out = new Set<string>();
  for (const h of s.hard ?? []) for (const r of h.refs) for (const sp of отрезки(r)) {
    if (sp.v1 === undefined) continue;
    for (let v = sp.v1; v <= (sp.v2 ?? sp.v1); v++) out.add(`${sp.book} ${sp.c1}:${v}`);
  }
  return out;
}

/** Другие книги, где историю рассказывают, пересказывают или явно упоминают с действием (метка § 3.2; виды 1–3). */
export function книгиВспоминают(s: Story): string[] {
  const own = new Set(s.accounts.map((a) => книгаСсылки(a.refs[0] ?? '')));
  const books = new Set<string>();
  for (const a of s.accounts) books.add(книгаСсылки(a.refs[0] ?? ''));
  for (const l of s.links) {
    if (l.sameBook) continue;
    if (l.kind === 'retelling' || (l.kind === 'mention' && l.action)) books.add(книгаСсылки(l.refs[0] ?? ''));
  }
  return [...books].filter((b) => b && (!own.has(b) || s.accounts.length > 1));
}
/** Метка «часто вспоминается в Библии» — факт: не меньше 5 других книг (11 § 3.2, решение координатора № 1). */
export function частоВспоминается(s: Story): number {
  const own = книгаСсылки(s.accounts[0]?.refs[0] ?? '');
  const n = книгиВспоминают(s).filter((b) => b !== own).length;
  return n >= 5 ? n : 0;
}

// ---------- каталог книги ----------
export interface Строка { s: Story; ref: string; n: number }
export interface Группа { id: string | null; имя: string | null; строки: Строка[] }
export function строкиКниги(code: string): Строка[] {
  return (Д.proto.catalog[code] ?? []).map((x, i) => ({ s: Д.stories.get(x.id)!, ref: x.ref, n: i + 1 })).filter((x) => x.s);
}
export function группы(xs: Строка[]): Группа[] {
  const out: Группа[] = [];
  for (const x of xs) {
    const g = x.s.partOf ?? null;
    const last = out[out.length - 1];
    if (last && last.id === g) last.строки.push(x);
    else out.push({ id: g, имя: g ? (Д.stories.get(g)?.title.short ?? null) : null, строки: [x] });
  }
  return out;
}
/** Главы книги, по которым истории размечены (прототип: книга размечена частично — 11 § 3.8). */
export function размеченныеГлавы(code: string): number[] {
  const out = new Set(Д.proto.storyChapters.filter((c) => c.startsWith(`${code} `)).map((c) => +c.split(' ')[1]));
  for (const x of Д.proto.catalog[code] ?? []) for (const sp of отрезки(x.ref)) if (sp.book === code) for (let c = sp.c1; c <= sp.c2; c++) out.add(c);
  return [...out].sort((a, b) => a - b);
}
export function главыСловами(xs: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    out.push(i === j ? `${xs[i]}` : `${xs[i]}–${xs[j]}`);
    i = j;
  }
  return out.join(', ');
}

// ---------- лица истории ----------
export const РОЛИ: Record<string, [string, string, string]> = {
  agent: ['действует', 'действует', 'действуют'],
  undergoer: ['с ним происходит', 'с ней происходит', 'с ними происходит'],
  addressed: ['к нему обращаются', 'к ней обращаются', 'к ним обращаются'],
  mentioned: ['назван', 'названа', 'названы'],
};
export function имяЛица(a: StoryActor): string {
  if (a.actor === 'god') return 'Бог';
  if (a.label) return a.label;
  return естьЛицо(a.actor) ? имя(a.actor) : a.actor;
}
/** Лица истории по значимости (11 § 4.3): главные, затем по числу стихов, затем по первому появлению; Бог — отдельной строкой. */
export function лица(s: Story, рассказ?: number): { бог?: StoryActor; люди: StoryActor[]; названы: StoryActor[] } {
  const xs = s.actors.filter((a) => рассказ === undefined || a.account === undefined || a.account === рассказ);
  const бог = xs.find((a) => a.actor === 'god');
  const участник = (a: StoryActor) => a.roles.some((r) => r.role !== 'mentioned');
  const ord = (a: StoryActor, b: StoryActor) => Number(!!b.main) - Number(!!a.main) || b.refs.length - a.refs.length || xs.indexOf(a) - xs.indexOf(b);
  const люди = xs.filter((a) => a.actor !== 'god' && участник(a)).sort(ord);
  const названы = xs.filter((a) => a.actor !== 'god' && !участник(a)).sort(ord);
  return { бог, люди, названы };
}
/** Роль по частям словами второго слоя: «в части 1 — действует; в части 5 — с ним происходит». */
export function рольСловами(a: StoryActor): string {
  const род = a.kind === 'group' || a.kind === 'people' ? 2 : /а$|я$/.test(a.label ?? '') && a.kind === 'unnamed' ? 1 : 0;
  const w = (r: string) => РОЛИ[r]?.[род] ?? r;
  const parts = a.roles.filter((r) => r.part !== undefined);
  if (!parts.length) return a.roles.map((r) => w(r.role)).join(', ');
  const byRole = new Map<string, number[]>();
  for (const r of parts) (byRole.get(r.role) ?? byRole.set(r.role, []).get(r.role)!).push(r.part!);
  if (byRole.size === 1) return w([...byRole.keys()][0]);
  return [...byRole].map(([r, ns]) => `в ${ns.length > 1 ? 'частях' : 'части'} ${ns.join(', ')} — ${w(r)}`).join('; ');
}

// ---------- места Писания по видам ссылки (11 § 4.5) ----------
export interface МестаПоВидам { рассказано: string[]; пересказ: Link[]; упоминания: Link[]; намёки: Link[]; внутри: Link[] }
export function места(s: Story): МестаПоВидам {
  // место в книге, которая сама рассказывает историю (Мк 8:19 при Мк 6:30–44), — «ссылка внутри книги» (библеист № 3)
  const своиКниги = new Set(s.accounts.map((a) => книгаСсылки(a.refs[0] ?? '')));
  const внутри = (l: Link) => !!l.sameBook || своиКниги.has(книгаСсылки(l.refs[0] ?? ''));
  return {
    рассказано: s.accounts.map((a) => a.refs.join('; ')),
    пересказ: s.links.filter((l) => l.kind === 'retelling' && !внутри(l)),
    упоминания: s.links.filter((l) => l.kind === 'mention' && !внутри(l)),
    намёки: s.links.filter((l) => l.kind === 'allusion' && !внутри(l)),
    внутри: s.links.filter(внутри),
  };
}
/** Имя книги для строки «Рассказано: в книге Бытие». Склонять программой нельзя (08 § 4.3 п. 10): берём родительный падеж из таблицы книг с родовым словом. */
function родовое(code: string): [string, string] {
  const b = BOOK_BY_CODE.get(code);
  if (!b) return ['книга', 'книге'];
  if (b.gen.startsWith('от ')) return ['Евангелие', 'Евангелии'];
  if (b.t === 'nt' && code !== 'Откр' && code !== 'Деян') return ['Послание', 'Послании'];
  return ['книга', 'книге'];
}
/** «книга Бытия», «Евангелие от Марка», «Послание к евреям» — родовое слово и родительный падеж из таблицы книг ядра. */
const номерная = (code: string) => /^(\d)-й (.*)$/.exec(BOOK_BY_CODE.get(code)?.gen ?? '');
export const книгаИм = (code: string) => {
  const m = номерная(code);
  return m ? `${m[1]}-я книга ${m[2]}` : `${родовое(code)[0]} ${BOOK_BY_CODE.get(code)?.gen ?? code}`;
};
/** «в книге Бытия», «в Евангелии от Марка», «в Послании к евреям». */
export const вКниге = (code: string) => {
  const m = номерная(code);
  return m ? `в ${m[1]}-й книге ${m[2]}` : `в ${родовое(code)[1]} ${BOOK_BY_CODE.get(code)?.gen ?? code}`;
};
/** Номер истории в книге (11 § 4.2: «история 6 из 48 в книге Бытие»). */
export function номерВКниге(id: string, code: string): { n: number; из: number } | null {
  const xs = Д.proto.catalog[code] ?? [];
  const i = xs.findIndex((x) => x.id === id);
  return i < 0 ? null : { n: i + 1, из: xs.length };
}
/** Книга рассказа, на котором открыта страница: параметр `rasskaz` (код книги транслитом) или первый по канону. */
export function книгиРассказов(s: Story): string[] {
  return [...new Set(s.accounts.map((a) => книгаСсылки(a.refs[0] ?? '')))];
}

/**
 * Члены группы, названные по имени в стихе (архитектура № 8): «вошел в ковчег Ной, и Сим, Хам и Иафет, сыновья Ноевы»
 * (Быт 7:13). В данных поля нет — задача данных (README); прототип держит таблицу сам.
 */
export const ЧЛЕНЫ: Record<string, { ids: string[]; ref: string }> = {
  'new:synovya-noya': { ids: ['p-sim', 'p-kham', 'p-iafet'], ref: 'Быт 7:13' },
};
/** Лицо названо в истории: участником или членом названной группы. */
export const названВИстории = (s: Story, id: string) => s.actors.some((a) => a.actor === id || ЧЛЕНЫ[a.actor]?.ids.includes(id));

/**
 * Различия рассказов на экране (библеист № 5, 6): ложное различие снято до правки данных; говорящий — перед цитатой, где
 * различие именно в том, кто говорит. Обе правки — задачи данных (README).
 */
const СНЯТЬ: Record<string, string[]> = { 'e-savl-na-puti-v-damask': ['когда'] };
export const ГОВОРИТ: Record<string, string> = {
  'Деян 9:15': 'Господь — Анании',
  'Деян 22:14': 'Анания — Савлу, в рассказе Павла',
  'Деян 26:16': 'Господь — Савлу, в рассказе Павла',
};
export const различияИстории = (s: Story) => (s.discrepancies ?? []).filter((d) => !СНЯТЬ[s.id]?.includes(d.label));
