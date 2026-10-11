/** Замер подписей — общий для рабочего потока и запасного пути на главном. */
import type { Forest } from '../core/forest.ts';

export const REL_WORD = 'бабушка'; // самое длинное слово отношения (08 § 4.4, строка «слова родства»)

/** Тексты для замера: имя, вторая строка; отсыл; заголовок полки. Без падежей: «Ревекка, муж: Исаак». */
export function labelTexts(f: Forest) {
  return {
    names: f.persons.map((p) => p.name),
    notes: f.persons.map((p) => p.note ?? ''),
    refs: f.nodes.map((n) => (n.kind === 'ref' ? `${f.persons[n.persons[0]].name}, муж: ${f.persons[n.refHusband!].name}` : '')),
    shelves: f.shelves.map((s) => s.name.toUpperCase()),
  };
}

/** Замер ширин: на главном потоке, если в рабочем нет шрифтов (запасной путь). */
export function measureAll(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, t: ReturnType<typeof labelTexts>, s: number) {
  const nameFont = `500 ${14 * s}px "PT1 Literata"`, noteFont = `450 ${12 * s}px "PT1 Golos"`, refFont = `italic 500 ${14 * s}px "PT1 Literata"`, shelfFont = `500 ${12 * s}px "PT1 Golos"`;
  ctx.font = noteFont;
  const rel = ctx.measureText(REL_WORD).width;
  const person = new Float64Array(t.names.length);
  const notes = t.notes.map((n) => (n ? ctx.measureText(n).width : 0));
  ctx.font = nameFont;
  t.names.forEach((n, i) => (person[i] = Math.ceil(Math.max(ctx.measureText(n).width, notes[i], rel))));
  ctx.font = refFont;
  const ref = new Float64Array(t.refs.map((r) => (r ? Math.ceil(ctx.measureText(r).width) : 0)));
  ctx.font = shelfFont;
  const shelf = new Float64Array(t.shelves.map((r) => Math.ceil(ctx.measureText(r).width + r.length * 0.12 * 12 * s)));
  return { person, ref, shelf };
}

