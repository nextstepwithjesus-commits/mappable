/**
 * Раскладка вида «Семья» (03 § 3.3 п. 2; 09 § 3.3): места видимых узлов из порядка и рядов леса, от измеренной ширины подписей.
 * Пустоты нераскрытого сжимаются: видимые узлы образуют лес-подмножество, порядок детей в нём — подпоследовательность порядка
 * леса, ряды — те же; по вертикали пустые ряды не занимают места. Скелет — аккуратное дерево по контурам (П-Т1, `layout.ts`).
 * Без DOM: ширины приходят функцией (в браузере — measureText тем же шрифтом, в тестах — оценка по числу знаков).
 *
 * Предмет раскладки — HTML-кнопка поверх рисунка (03 § 7.3): лицо, точка союза, отсыл, группа, «Показать родителей»,
 * «Показать ещё N детей», ярлык ребра. Номер предмета постоянен и строится из номеров данных (09 § 3.2.3 п. 1).
 */
import type { Лес, Отсыл, Узел } from './лес.ts';

export type ВидПредмета = 'лицо' | 'союз' | 'отсыл' | 'отсыл-жены' | 'группа' | 'родители' | 'ещё' | 'ярлык' | 'мать-не-названа';

export interface Предмет {
  /** Постоянный номер (id элемента DOM). */
  id: string;
  вид: ВидПредмета;
  узел: number;
  /** Лицо предмета (у союза — жена, у «родители», «ещё», «мать не названа» — глава, у ярлыка — ребёнок). */
  лицо: number;
  /** Слот детей (у союза и «мать не названа»): −1 знак главы, k — жена k блока. */
  слот?: number;
  союз?: number;
  ребро?: number;
  отсыл?: Отсыл;
  /** Сколько скрыто (у «ещё»). */
  n?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ширины {
  /** Ширина подписи лица: большая из имени и уточнения обоих слоёв, px. */
  лицо: (i: number) => number;
  /** Ширина короткой подписи (отсыл, группа, кнопки) мелким шрифтом, px. */
  мелко: (t: string) => number;
  /** Масштаб размера текста (1 — «Обычный», 2 — 200 %). */
  текст: number;
}

export const ШАГ = {
  ряд: 104, // шаг рядов на касании (03 ред. 5, решение п. 9)
  верх: 28, // верх кнопки лица от верха ряда (выше — «Показать родителей»)
  лицоВ: 40, // высота кнопки лица: имя 20 + уточнение 16 + 4
  чипВ: 24, // высота малых кнопок (цель 24 px, WCAG 2.5.8)
  чипНиз: 72, // верх «Показать ещё N детей»
  шина: 100, // шина детей от верха ряда
  знак: 10,
  отступИмени: 6,
  поле: 8,
  соседи: 24,
  союз: 24, // ширина точки союза — цель 24 px
  дерево: 48,
  полка: 1, // промежуток между полками, в рядах
};

export interface Геометрия {
  ширина: number;
  высота: number;
  предметы: Предмет[];
  поИд: Map<string, number>;
  /** Отрезки линий по видам: кровь (линии родства и шины), союз (черта союза), ярлык (линия с ярлыком). */
  линии: { кровь: number[]; союз: number[]; ярлык: number[] };
  /** Левый верх узла (px при масштабе 1) — для теста порядка и якоря. */
  узлы: Map<number, { x: number; y: number; w: number }>;
}

export const idЛица = (л: Лес, i: number) => `г-${л.граф.лица[i].id}`;

interface Contour { top: number; l: number[]; r: number[] }
function merge(a: Contour | null, b: Contour, off: number): Contour {
  if (!a) return { top: b.top, l: b.l.map((v) => v + off), r: b.r.map((v) => v + off) };
  const top = Math.min(a.top, b.top), end = Math.max(a.top + a.l.length, b.top + b.l.length);
  const l: number[] = new Array(end - top), r: number[] = new Array(end - top);
  for (let q = top; q < end; q++) {
    const ia = q - a.top, ib = q - b.top;
    const ha = ia >= 0 && ia < a.l.length, hb = ib >= 0 && ib < b.l.length;
    l[q - top] = ha && hb ? Math.min(a.l[ia], b.l[ib] + off) : ha ? a.l[ia] : b.l[ib] + off;
    r[q - top] = ha && hb ? Math.max(a.r[ia], b.r[ib] + off) : ha ? a.r[ia] : b.r[ib] + off;
  }
  return { top, l, r };
}

/** Подписи кнопок, которые зависят от данных (одни на оба слоя: ширина узла не меняется при смене слоя, 03 § 3.3 п. 2). */
export function подписьОтсыла(л: Лес, u: Узел): string {
  return `${л.граф.имя(u.лица[0])} — жена: ${л.граф.имя(u.муж!)}`;
}
export function подписьГруппы(л: Лес, u: Узел): string {
  return `из сыновей: ${л.граф.имя(u.лица[0])} — ${u.дети.length}`;
}

/**
 * Раскладка видимых узлов. `видимые` — номера узлов; `null` — весь лес («Без сжатия»).
 * Узел без видимого родителя — корень; корни идут в порядке леса.
 */
export function разложить(л: Лес, видимые: Set<number> | null, ш: Ширины): Геометрия {
  const s = ш.текст;
  const виден = (k: number) => !видимые || видимые.has(k);
  const узлы = л.узлы;
  const г = л.граф;
  const R = { ряд: ШАГ.ряд * s, верх: ШАГ.верх * s, лицоВ: ШАГ.лицоВ * s, чипВ: ШАГ.чипВ * s, чипНиз: ШАГ.чипНиз * s, шина: ШАГ.шина * s };
  const pad = ШАГ.поле * s;
  const lead = ШАГ.знак + ШАГ.отступИмени * s;
  const wЛица = (i: number) => lead + ш.лицо(i) + pad;
  const wЧип = (t: string) => ш.мелко(t) + 2 * pad;

  // состав узла: лица с точками союзов и отсылы — слева направо
  type Часть = { вид: ВидПредмета; лицо: number; x: number; w: number; слот?: number; союз?: number; отсыл?: Отсыл };
  const части = new Map<number, Часть[]>();
  const ширина = new Float64Array(узлы.length);
  const видДети = (k: number) => узлы[k].дети.filter(виден);
  for (const u of узлы) {
    if (!виден(u.key)) continue;
    const ps: Часть[] = [];
    let x = 0;
    if (u.вид === 'block') {
      u.лица.forEach((p, j) => {
        if (j > 0) {
          const un = г.союзы.find((v) => v.муж === u.лица[0] && v.жена === p);
          ps.push({ вид: 'союз', лицо: p, x, w: ШАГ.союз, слот: j, союз: un?.i });
          x += ШАГ.союз;
        }
        const w = wЛица(p);
        ps.push({ вид: 'лицо', лицо: p, x, w });
        x += w;
      });
      for (const o of u.отсылы) {
        const w = wЧип(o.текст);
        ps.push({ вид: 'отсыл', лицо: o.у, x: x + pad, w, отсыл: o });
        x += w + pad;
      }
    } else if (u.вид === 'wife-ref') {
      const w = wЧип(подписьОтсыла(л, u));
      ps.push({ вид: 'отсыл-жены', лицо: u.лица[0], x: 0, w });
      x = w;
    } else {
      const w = wЧип(подписьГруппы(л, u));
      ps.push({ вид: 'группа', лицо: u.лица[0], x: 0, w });
      x = w;
    }
    // малые кнопки под и над узлом не шире узла считаются ниже — ширина узла не меньше их
    const скрыто = u.дети.length - видДети(u.key).length;
    if (u.вид === 'block' && скрыто > 0) x = Math.max(x, wЧип(`Показать ещё ${скрыто} детей`));
    if (u.вид === 'block' && u.родитель >= 0 && !виден(u.родитель)) x = Math.max(x, wЧип('Показать родителей'));
    части.set(u.key, ps);
    ширина[u.key] = x;
  }

  const rel = new Float64Array(узлы.length);
  const sib = ШАГ.соседи * s, tree = ШАГ.дерево * s;
  const layout = (k: number): Contour => {
    const n = узлы[k];
    const дети = видДети(k);
    if (!дети.length) return { top: n.ряд, l: [0], r: [ширина[k]] };
    let acc: Contour | null = null;
    const offs: number[] = [];
    for (const c of дети) {
      const cc = layout(c);
      let off = 0;
      if (acc) {
        off = -Infinity;
        const from = Math.max(acc.top, cc.top), to = Math.min(acc.top + acc.l.length, cc.top + cc.l.length);
        for (let r = from; r < to; r++) off = Math.max(off, acc.r[r - acc.top] + sib - cc.l[r - cc.top]);
        if (off === -Infinity) off = Math.max(...acc.r) + sib;
      }
      acc = merge(acc, cc, off);
      offs.push(off);
    }
    const g = (i: number) => offs[i] + ШАГ.знак / 2;
    const center = (g(0) + g(offs.length - 1)) / 2;
    const left = center - ШАГ.знак / 2;
    дети.forEach((c, i) => (rel[c] = offs[i] - left));
    return merge({ top: n.ряд, l: [0], r: [ширина[k]] }, acc!, -left);
  };

  // корни видимого подмножества — в порядке леса, по полкам
  const корни: number[][] = л.полки.map(() => []);
  const byOrder = узлы.filter((u) => виден(u.key) && (u.родитель < 0 || !виден(u.родитель))).sort((a, b) => л.порядок[a.key] - л.порядок[b.key]);
  for (const u of byOrder) корни[u.полка].push(u.key);

  // ряды: только ряды с видимыми узлами занимают место (по полкам)
  const рядыПолки: Map<number, number>[] = л.полки.map(() => new Map());
  for (const u of узлы) if (виден(u.key)) рядыПолки[u.полка].set(u.ряд, 0);
  const absX = new Float64Array(узлы.length), absY = new Float64Array(узлы.length);
  let y0 = 0, maxW = 0;
  const place = (root: number, x: number, rowY: (r: number) => number) => {
    const st: [number, number][] = [[root, x]];
    while (st.length) {
      const [k, xx] = st.pop()!;
      absX[k] = xx; absY[k] = rowY(узлы[k].ряд);
      for (const c of видДети(k)) st.push([c, xx + rel[c]]);
    }
  };
  л.полки.forEach((_полка, si) => {
    if (!корни[si].length) return;
    const ряды = [...рядыПолки[si].keys()].sort((a, b) => a - b);
    ряды.forEach((r, i) => рядыПолки[si].set(r, i));
    const top = y0;
    const rowY = (r: number) => top + (рядыПолки[si].get(r) ?? 0) * R.ряд;
    if (si === 0 || видимые) {
      let acc: Contour | null = null;
      const offs: number[] = [];
      for (const r of корни[si]) {
        const cc = layout(r);
        let off = 0;
        if (acc) {
          off = -Infinity;
          const from = Math.max(acc.top, cc.top), to = Math.min(acc.top + acc.l.length, cc.top + cc.l.length);
          for (let q = from; q < to; q++) off = Math.max(off, acc.r[q - acc.top] + tree - cc.l[q - cc.top]);
          if (off === -Infinity) off = Math.max(...acc.r) + tree;
        }
        acc = merge(acc, cc, off);
        offs.push(off);
      }
      const minL = acc ? Math.min(...acc.l) : 0;
      корни[si].forEach((r, i) => place(r, offs[i] - minL, rowY));
      maxW = Math.max(maxW, acc ? Math.max(...acc.r) - minL : 0);
      y0 = top + ряды.length * R.ряд + ШАГ.полка * R.ряд;
    } else {
      // весь лес: острова полки — прямоугольниками по строкам (П-Т1)
      const limit = Math.max(maxW, 1200 * s);
      let x = 0, lineTop = top, lineRows = 0;
      for (const r of корни[si]) {
        const cc = layout(r);
        const minL = Math.min(...cc.l), w = Math.max(...cc.r) - minL, rows = cc.top + cc.l.length;
        if (x > 0 && x + w > limit) { lineTop += (lineRows + 1) * R.ряд; x = 0; lineRows = 0; }
        const lt = lineTop;
        place(r, x - minL, (q) => lt + q * R.ряд);
        x += w + tree;
        lineRows = Math.max(lineRows, rows);
      }
      y0 = lineTop + lineRows * R.ряд + ШАГ.полка * R.ряд;
    }
  });

  // предметы и линии
  const предметы: Предмет[] = [];
  const кровь: number[] = [], союз: number[] = [], ярлык: number[] = [];
  const геомУзлов = new Map<number, { x: number; y: number; w: number }>();
  const знакX = new Map<string, number>(); // `${узел}:${слот}` → x начала линии детей
  const центрЗнака = R.верх + R.лицоВ / 2;
  for (const u of узлы) {
    if (!виден(u.key)) continue;
    const x = absX[u.key], y = absY[u.key];
    геомУзлов.set(u.key, { x, y, w: ширина[u.key] });
    const ps = части.get(u.key)!;
    for (const p of ps) {
      const base = { узел: u.key, лицо: p.лицо, x: x + p.x, w: p.w };
      if (p.вид === 'лицо') предметы.push({ ...base, id: idЛица(л, p.лицо), вид: 'лицо', y: y + R.верх, h: R.лицоВ });
      else if (p.вид === 'союз') предметы.push({ ...base, id: `г-${г.союзы[p.союз ?? -1]?.номер ?? `союз-${u.key}-${p.слот}`}`, вид: 'союз', y: y + центрЗнака - R.чипВ / 2, h: R.чипВ, слот: p.слот, ...(p.союз !== undefined && { союз: p.союз }) });
      else if (p.вид === 'отсыл') предметы.push({ ...base, id: `г-отсыл-${г.лица[p.отсыл!.у].id}-${p.отсыл!.ребро !== undefined ? г.рёбра[p.отсыл!.ребро].номер : г.союзы[p.отсыл!.союз!].номер}`, вид: 'отсыл', y: y + центрЗнака - R.чипВ / 2, h: R.чипВ, отсыл: p.отсыл });
      else if (p.вид === 'отсыл-жены') предметы.push({ ...base, id: `г-жена-${г.лица[p.лицо].id}`, вид: 'отсыл-жены', y: y + центрЗнака - R.чипВ / 2, h: R.чипВ });
      else if (p.вид === 'группа') предметы.push({ ...base, id: `г-группа-${г.лица[p.лицо].id}`, вид: 'группа', y: y + центрЗнака - R.чипВ / 2, h: R.чипВ, n: u.дети.length });
    }
    if (u.вид === 'block') {
      // черта союза: от конца подписи предыдущего лица до знака жены (не перечёркивает имя, П-Т1)
      for (const p of ps) if (p.вид === 'союз') союз.push(x + p.x - 2, y + центрЗнака, x + p.x + p.w + ШАГ.знак / 2, y + центрЗнака);
      знакX.set(`${u.key}:-1`, x + ШАГ.знак / 2);
      for (const p of ps) if (p.вид === 'союз') знакX.set(`${u.key}:${p.слот}`, x + p.x + p.w / 2);
      ps.forEach((p, j) => { if (p.вид === 'лицо' && j > 0) знакX.set(`${u.key}:${100 + u.лица.indexOf(p.лицо)}`, x + p.x + ШАГ.знак / 2); });
      const head = u.лица[0];
      if (u.родитель >= 0 && !виден(u.родитель)) предметы.push({ id: `г-родители-${г.лица[head].id}`, вид: 'родители', узел: u.key, лицо: head, x, y, w: wЧип('Показать родителей'), h: R.чипВ });
      const скрыто = u.дети.length - видДети(u.key).length;
      if (скрыто > 0) предметы.push({ id: `г-ещё-${г.лица[head].id}`, вид: 'ещё', узел: u.key, лицо: head, x, y: y + R.чипНиз, w: wЧип(`Показать ещё ${скрыто} детей`), h: R.чипВ, n: скрыто });
    } else знакX.set(`${u.key}:-1`, x + ширина[u.key] / 2);
  }
  // линии детей: от знака главы, точки союза или знака жены — к шине и к детям
  for (const u of узлы) {
    if (!виден(u.key)) continue;
    const дети = видДети(u.key);
    if (!дети.length) continue;
    const y = absY[u.key];
    const слоты = new Map<number, number[]>();
    for (const c of дети) { const sl = узлы[c].слот; if (!слоты.has(sl)) слоты.set(sl, []); слоты.get(sl)!.push(c); }
    let i = 0;
    for (const [sl, cs] of слоты) {
      const px = знакX.get(`${u.key}:${sl}`) ?? absX[u.key] + ШАГ.знак / 2;
      const bus = y + R.шина - 6 * s * i++;
      const py = y + центрЗнака + (sl >= 0 && sl < 100 ? 0 : R.лицоВ / 2);
      let minX = px, maxX = px;
      // лицо «по другому прочтению» (Каинан) кровной линии и шины не получает (03 § 3.3)
      const обычные = cs.filter((c) => узлы[c].чтение === undefined);
      for (const c of обычные) {
        const cx = absX[c] + ШАГ.знак / 2;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        кровь.push(cx, bus, cx, absY[c] + R.верх);
      }
      if (обычные.length) {
        кровь.push(px, py, px, bus);
        if (maxX > minX) кровь.push(minX, bus, maxX, bus);
      }
      // «мать не названа» — подпись группы детей у знака отца (03 § 3.1; В-4), если в слоте главы есть дети без матери
      if (sl === -1 && u.вид === 'block' && cs.some((c) => узлы[c].вид !== 'group' && узлы[c].чтение === undefined && г.мать(узлы[c].лица[0]) < 0 && л.родитель[узлы[c].лица[0]] === u.лица[0])) {
        const t = 'мать не названа';
        предметы.push({ id: `г-без-матери-${г.лица[u.лица[0]].id}`, вид: 'мать-не-названа', узел: u.key, лицо: u.лица[0], слот: -1, x: px + 6 * s, y: y + R.ряд + 2 * s, w: wЧип(t), h: R.чипВ });
      }
    }
  }
  // линии с ярлыком: ребро другого места, приёмное, «родители Его» — если оба конца видны
  for (const я of л.ярлыки) {
    const a = л.узелЛица[я.род], b = л.узелЛица[я.реб];
    if (!виден(a) || !виден(b)) continue;
    const ia = узлы[a].лица.indexOf(я.род);
    const pa = части.get(a)!.find((p) => p.вид === 'лицо' && p.лицо === я.род)!;
    const x1 = absX[a] + pa.x + ШАГ.знак / 2, y1 = absY[a] + R.верх + R.лицоВ;
    const x2 = absX[b] + ШАГ.знак / 2, y2 = absY[b] + R.верх;
    const ym = absY[b] - 8 * s;
    ярлык.push(x1, y1, x1, ym, x1, ym, x2, ym, x2, ym, x2, y2);
    const w = wЧип(я.текст);
    // ярлык — в полосе над кнопкой ребёнка (между шиной и именем); правее «Показать родителей», если она есть
    let lx = Math.min(x1, x2) + Math.abs(x2 - x1) / 2 - w / 2;
    if (узлы[b].родитель >= 0 && !виден(узлы[b].родитель)) lx = Math.max(lx, absX[b] + wЧип('Показать родителей') + pad);
    предметы.push({ id: `г-ярлык-${г.рёбра[я.ребро].номер}`, вид: 'ярлык', узел: b, лицо: я.реб, ребро: я.ребро, x: lx, y: absY[b] + 2 * s, w, h: R.чипВ });
    void ia;
  }
  let W = 0;
  for (const p of предметы) W = Math.max(W, p.x + p.w);
  const поИд = new Map(предметы.map((p, i) => [p.id, i]));
  return { ширина: W, высота: y0, предметы, поИд, линии: { кровь, союз, ярлык }, узлы: геомУзлов };
}

/** Оценка ширины по числу знаков — для проверок без браузера (Golos/Literata ≈ 0,56 em). */
export const ширинаПоЗнакам = (px: number) => (t: string) => Math.ceil(t.length * px * 0.56);
