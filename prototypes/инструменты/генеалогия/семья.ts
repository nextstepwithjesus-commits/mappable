/**
 * Состояние вида «Семья» (03 § 3.3 п. 2, § 6.1–6.2): какие узлы леса раскрыты, команды шагов и журнал «Отменить / Вернуть»
 * (08 § 7.22: журнал шагов ведёт общий маршрутизатор — шаг вида есть запись уровня 3). Без DOM. Узел раскрыт — его кнопки в DOM (03 § 7.3: «все раскрытые лица, а не только видимая часть окна»).
 */
import type { Лес } from './лес.ts';

export type Раскрыто = ReadonlySet<number>;

/** Вход «Семья с тремя поколениями целиком» (03 § 2.3, § 6.1): родители, братья и сёстры, лицо, его дети. */
export function вход(л: Лес, лицо: number): Set<number> {
  const k = л.узелЛица[лицо];
  const out = new Set<number>();
  if (k < 0) return out;
  out.add(k);
  const u = л.узлы[k];
  if (u.родитель >= 0) {
    const par = л.узлы[u.родитель];
    if (par.вид === 'group') { out.add(par.key); if (par.родитель >= 0) out.add(par.родитель); }
    else out.add(par.key);
    for (const c of par.дети) out.add(c);
  }
  for (const c of u.дети) out.add(c);
  return out;
}

export function родители(л: Лес, s: Раскрыто, узел: number): Set<number> {
  const out = new Set(s);
  const u = л.узлы[узел];
  if (u.родитель < 0) return out;
  const p = л.узлы[u.родитель];
  out.add(p.key);
  for (const c of p.дети) out.add(c);
  if (p.вид === 'group' && p.родитель >= 0) out.add(p.родитель);
  return out;
}

export function дети(л: Лес, s: Раскрыто, узел: number, слот?: number): Set<number> {
  const out = new Set(s);
  for (const c of л.узлы[узел].дети) if (слот === undefined || л.узлы[c].слот === слот) out.add(c);
  return out;
}

function потомки(л: Лес, узел: number): number[] {
  const out: number[] = [];
  const st = [...л.узлы[узел].дети];
  while (st.length) { const x = st.pop()!; out.push(x); st.push(...л.узлы[x].дети); }
  return out;
}

export function свернутьДетей(л: Лес, s: Раскрыто, узел: number, слот?: number): Set<number> {
  const out = new Set(s);
  for (const c of л.узлы[узел].дети) {
    if (слот !== undefined && л.узлы[c].слот !== слот) continue;
    out.delete(c);
    for (const x of потомки(л, c)) out.delete(x);
  }
  return out;
}

/** «Свернуть предков»: остаётся только ветвь узла (и то, что не связано с его предками). */
export function свернутьПредков(л: Лес, s: Раскрыто, узел: number): Set<number> {
  const своя = new Set([узел, ...потомки(л, узел)]);
  return new Set([...s].filter((k) => своя.has(k)));
}

export const толькоЭто = (узел: number) => new Set([узел]);

/** Слот детей закрыт? (все дети слота скрыты) */
export function слотСкрыт(л: Лес, s: Раскрыто, узел: number, слот: number): boolean {
  return л.узлы[узел].дети.filter((c) => л.узлы[c].слот === слот).every((c) => !s.has(c));
}

/** Входы-строки «Семьи» (03 § 2.3): название и лица, вокруг которых раскрыты три поколения. */
export const ВХОДЫ: Record<string, { имя: string; лица: string[] }> = {
  'adam-noy': { имя: 'От Адама до Ноя', лица: ['adam', 'kain', 'enokh-syn-kaina', 'irad', 'mekhiael', 'mafusal-syn-mekhiaelya', 'lamekh-kainit', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy'] },
  'avraam-iakov': { имя: 'Авраам, Исаак, Иаков', лица: ['farra', 'avraam', 'isaak', 'iakov'] },
  'noy-synovya': { имя: 'Ной и его сыновья', лица: ['noy', 'sim', 'kham', 'iafet'] },
};

/** Раскрытое по входу: лицо `p` или вход-строка. */
export function раскрытоВхода(л: Лес, p: number, вх?: string): Set<number> {
  const v = вх ? ВХОДЫ[вх] : undefined;
  if (!v) return вход(л, p);
  const out = new Set<number>();
  for (const id of v.лица) { const i = л.граф.ид(id); if (i >= 0) for (const k of вход(л, i)) out.add(k); }
  return out;
}

/** Ключ узла в адресе: блок — номер главы, отсыл жены — `ж.номер`, группа — `г.номер предка`. */
export function ключУзла(л: Лес, k: number): string {
  const u = л.узлы[k];
  const id = л.граф.лица[u.лица[0]].id;
  return u.вид === 'block' ? id : u.вид === 'wife-ref' ? `ж.${id}` : `г.${id}`;
}
export function узелПоКлючу(л: Лес): Map<string, number> {
  return new Map(л.узлы.map((u) => [ключУзла(л, u.key), u.key]));
}

/** Состояние → `open` и `zakr` (отличия от входа, в порядке леса). */
export function вАдрес(л: Лес, вх: Раскрыто, s: Раскрыто): { open: string; zakr: string } {
  if (s.size === л.узлы.length) return { open: 'все', zakr: '' };
  const по = (xs: number[]) => xs.sort((a, b) => л.порядок[a] - л.порядок[b]).map((k) => ключУзла(л, k)).join(',');
  return { open: по([...s].filter((k) => !вх.has(k))), zakr: по([...вх].filter((k) => !s.has(k))) };
}
export function изАдреса(л: Лес, вх: Раскрыто, open = '', zakr = ''): Set<number> {
  if (open === 'все') return new Set(л.узлы.map((u) => u.key));
  const m = узелПоКлючу(л);
  const out = new Set(вх);
  for (const k of open.split(',').filter(Boolean)) { const n = m.get(k); if (n !== undefined) out.add(n); }
  for (const k of zakr.split(',').filter(Boolean)) { const n = m.get(k); if (n !== undefined) out.delete(n); }
  return out;
}

/** Прочтения в адресе: `набор:прочтение` через запятую. */
export const прочтенияИзАдреса = (s = '') => Object.fromEntries(s.split(',').filter(Boolean).map((x) => x.split(':') as [string, string]));
export const прочтенияВАдрес = (в: Record<string, string>) => Object.entries(в).map(([a, b]) => `${a}:${b}`).join(',');
