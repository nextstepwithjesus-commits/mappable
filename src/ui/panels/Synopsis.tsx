import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { byId, graph, lines, loadCard, loadedCard } from '../../data/atlas.ts';
import type { LineStep } from '../../engine/layout.ts';
import type { Note } from '../../data/types.ts';
import { lineFlip, skyGroup, synopsisAt, panel } from '../../state.ts';
import { P, Refs, VerseInsert, Verses, flyToIds, plural, refLabel } from '../common.tsx';
import { grid, unfoldCard } from '../layout.ts';
import { typo } from '../text/typo.ts';
import { Segmented } from '../controls.tsx';
import { Sheet, useRemembered } from './Sheet.tsx';
import { showResults } from '../show.ts';

// ---------- синопсис родословий (G2; ТЗ § 3.2; CARD-40; UX-14; VIS-34; MOB-23) ----------

/** Сторона строки: лицо линии, его номер у Матфея или Луки, помета линии. */
export interface Side {
  id: string;
  no: number | null;
  flag: string;
  refs: string[];
}
/** Клетка ветхозаветного источника: стих, чтение в скобках, «нет» по примечанию, «—» или «источник не охватывает». */
export type OtCell = { kind: 'ref'; ref: string; via?: string; mother?: boolean } | { kind: 'bracket'; ref: string } | { kind: 'absent'; ref: string } | { kind: 'none' } | { kind: 'out' };
export type SynRow =
  | { kind: 'common'; key: string; id: string; mt: Side | null; lk: Side | null; ot: OtCell[] }
  | { kind: 'split'; key: string; mt: Side | null; lk: Side | null; ot: OtCell[] }
  | { kind: 'note'; key: string; note: SynNote };
/**
 * Вставка перед участком: extra — у одной линии лишние поколения (Каинан); split — линии расходятся после at;
 * join — линии сходятся в at. mt и lk — лица участка по линиям (для «показать на небе» и подписи).
 */
export interface SynNote {
  kind: 'extra' | 'split' | 'join';
  at: string;
  /** лицо, после которого (split, extra) или в котором (join) это происходит */
  prev: string | null;
  mt: Side[];
  lk: Side[];
  /** участок для неба: от общего лица до общего лица */
  ids: string[];
}

/** Ветхозаветные столбцы синопсиса (ТЗ § 3.2): книга и главы, которые столбец охватывает. */
export const OT_COLS = [
  { key: 'gen', label: 'Быт', title: 'Бытие', book: 'Быт', ch: [1, 50] },
  { key: 'chr', label: '1 Пар', title: '1 Паралипоменон 1–3', book: '1Пар', ch: [1, 3] },
  { key: 'ruth', label: 'Руф 4', title: 'Руфь 4', book: 'Руф', ch: [4, 4] },
] as const;

/** Объяснение расхождения — примечание (§ 24) этого лица (ссылка «почему»). */
const WHY: Record<string, string> = {
  'kainan-syn-arfaksada': 'kainan-syn-arfaksada',
  david: 'iliy-otets-marii',
  salafiil: 'salafiil',
  zorovavel: 'aviud-syn-zorovavelya',
  iisus: 'mariya',
  'iosif-muzh-marii': 'iliy-otets-marii',
};
/** Тома, чьи примечания нужны синопсису: скобки и «нет в 1 Пар 3:19–20» (Каинан, Авиуд, Рисай), «почему». */
export const synopsisNoteIds = () => [...new Set(Object.values(WHY))];

const refPart = (r: string) => /^(\S+)\s+(\d+)(?::(.*))?$/.exec(r.replace(/[–—]/g, '-'));
/**
 * Ссылка в клетке столбца — без книги, у каждого стиха своя глава (CARD-90): «1Пар 1:18,24» — «1:18; 1:24»,
 * «Руф 4:18-22» — «4:18–22».
 */
export function shortRef(r: string): string {
  const m = refPart(r);
  if (!m) return r;
  if (!m[3]) return m[2];
  return m[3]
    .split(',')
    .map((v) => `${m[2]}:${v.trim()}`)
    .join('; ')
    .replace(/-/g, '–');
}
/** Ссылка из столбца источника: та же книга, главы в пределах столбца. */
const inCol = (r: string, col: (typeof OT_COLS)[number]) => {
  const m = refPart(r);
  return !!m && m[1] === col.book && Number(m[2]) >= col.ch[0] && Number(m[2]) <= col.ch[1];
};

/**
 * Ряды синопсиса: две линии выровнены по общим лицам (наибольшая общая подпоследовательность), между ними —
 * расходящиеся участки параллельными столбцами «Мф 1 | № | Лк 3 | №», строка к строке от точки расхождения.
 * flip — Лк 3 как второе родословие Иосифа: в конце линии по Луке вместо Марии — Иосиф (Лк 3:23, номер 1).
 * notesOf — примечания карточки лица (если том уже загружен): скобки и «нет в источнике».
 */
export function synopsisRows(flip: boolean, notesOf: (id: string) => Note[] | null = () => null): SynRow[] {
  const J: Side[] = lines.joseph.persons.map((s) => ({ id: s.id, no: s.mt ?? null, flag: s.flag, refs: s.refs }));
  // второе родословие Иосифа (решения 107, 110): шаг «Илий → Иосиф» — по связи графа «по Луке» (otherParents Иосифа,
  // Лк 3:23), с её стихами; пока такой записи нет — стих Лк 3:23 самой линии
  const byLuke = (graph.parentsOf.get('iosif-muzh-marii') ?? []).find((e) => e.parent === 'iliy-otets-marii' && e.claim === 'by-luke');
  const M: Side[] = lines.mary.persons.map((s: LineStep) =>
    flip && s.id === 'mariya'
      ? { id: 'iosif-muzh-marii', no: 1, flag: byLuke ? 'by-luke' : 'in-text', refs: byLuke?.refs.length ? [...byLuke.refs] : ['Лк 3:23'] }
      : { id: s.id, no: s.lk ?? null, flag: s.flag, refs: s.refs },
  );
  // общие лица — наибольшая общая подпоследовательность по id
  const n = J.length;
  const m = M.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let k = m - 1; k >= 0; k--) L[i][k] = J[i].id === M[k].id ? L[i + 1][k + 1] + 1 : Math.max(L[i + 1][k], L[i][k + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, k = 0; i < n && k < m; ) {
    if (J[i].id === M[k].id) pairs.push([i++, k++]);
    else if (L[i + 1][k] >= L[i][k + 1]) i++;
    else k++;
  }
  // предшественник лица в линии — для стиха связи «отец — сын»
  const prevOf = new Map<string, Set<string>>();
  for (const line of [J, M]) line.forEach((s, i) => i > 0 && (prevOf.get(s.id) ?? prevOf.set(s.id, new Set()).get(s.id)!).add(line[i - 1].id));
  const otOf = (s: Side | null, other: Side | null): OtCell[] => {
    const who = s ?? other;
    if (!who) return OT_COLS.map(() => ({ kind: 'none' }));
    const prev = prevOf.get(who.id) ?? new Set<string>();
    const edges = graph.parentsOf.get(who.id) ?? [];
    const own = [...(s?.refs ?? []), ...(other?.refs ?? []), ...edges.filter((e) => prev.has(e.parent)).flatMap((e) => e.refs)];
    const notes = notesOf(who.id) ?? [];
    return OT_COLS.map((col) => {
      const r = own.find((x) => inCol(x, col));
      if (r) return { kind: 'ref', ref: r };
      // иной отец в этом источнике: «1 Пар 3:19 — отец Федаия» (у Зоровавеля)
      const alt = edges.find((e) => !prev.has(e.parent) && e.refs.some((x) => inCol(x, col)));
      if (alt) return { kind: 'ref', ref: alt.refs.find((x) => inCol(x, col))!, via: alt.parent, mother: /mother/.test(alt.kind) };
      for (const nt of notes) {
        const nr = (nt.refs ?? []).find((x) => inCol(x, col));
        if (nr && nt.kind === 'bracket') return { kind: 'bracket', ref: nr };
        if (nr && nt.kind === 'textual') return { kind: 'absent', ref: nr };
      }
      return { kind: 'none' };
    });
  };
  const rows: SynRow[] = [];
  const common = (i: number, k: number) => rows.push({ kind: 'common', key: J[i].id, id: J[i].id, mt: J[i], lk: M[k], ot: otOf(J[i], M[k]) });
  let pi = 0;
  let pk = 0;
  let last: string | null = null;
  const between = (i1: number, k1: number, at: string | null) => {
    const jr = J.slice(pi, i1);
    const mr = M.slice(pk, k1);
    if (!jr.length && !mr.length) return;
    const ids = [...(last ? [last] : []), ...jr.map((s) => s.id), ...mr.map((s) => s.id), ...(at ? [at] : [])];
    rows.push({ kind: 'note', key: `n-${last}`, note: { kind: jr.length && mr.length ? 'split' : 'extra', at: last ?? '', prev: last, mt: jr, lk: mr, ids } });
    for (let r = 0; r < Math.max(jr.length, mr.length); r++) {
      const a = jr[r] ?? null;
      const b = mr[r] ?? null;
      rows.push({ kind: 'split', key: `s-${a?.id ?? ''}-${b?.id ?? ''}`, mt: a, lk: b, ot: otOf(a, a ? null : b) });
    }
    if (at && jr.length && mr.length) {
      rows.push({ kind: 'note', key: `j-${at}`, note: { kind: 'join', at, prev: last, mt: jr.slice(-1), lk: mr.slice(-1), ids } });
    }
  };
  for (const [i, k] of pairs) {
    between(i, k, J[i].id);
    common(i, k);
    last = J[i].id;
    pi = i + 1;
    pk = k + 1;
  }
  between(n, m, null);
  // «источник не охватывает» — клетки выше первой и ниже последней ссылки столбца
  OT_COLS.forEach((_, c) => {
    const body = rows.filter((r): r is Exclude<SynRow, { kind: 'note' }> => r.kind !== 'note');
    const has = body.map((r) => r.ot[c].kind !== 'none');
    const lo = has.indexOf(true);
    const hi = has.lastIndexOf(true);
    body.forEach((r, i) => {
      if (i < lo || i > hi) r.ot[c] = { kind: 'out' };
    });
  });
  return rows;
}

/** Помета лица в линии Иосифа: у Иисуса Христа — «legal» (Мф 1:16). */
const lineFlagOf = (id: string) => lines.joseph.persons.find((s) => s.id === id)?.flag ?? '';
/** Стих строки линии: «Мф 1:6» для Соломона; у лица без стиха Мф 1 или Лк 3 — null. */
const lineRef = (s: Side | undefined, book: 'Мф' | 'Лк') => s?.refs.find((r) => r.startsWith(`${book} `)) ?? null;
const Name = ({ id }: { id: string }) => <P id={id} />;

/** Имена участка через запятую; у каждого — стих своей линии. */
function Names({ sides, book, owner }: { sides: Side[]; book: 'Мф' | 'Лк'; owner: string }) {
  return (
    <>
      {sides.map((s, i) => {
        const r = lineRef(s, book);
        return (
          <Fragment key={s.id}>
            {i > 0 && ', '}
            <Name id={s.id} />
            {r && <Refs refs={[r]} owner={`${owner}${i}`} />}
          </Fragment>
        );
      })}
    </>
  );
}

export function SynopsisPanel() {
  const flip = lineFlip.value;
  const [notesReady, setNotesReady] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all(synopsisNoteIds().map((id) => loadCard(id).catch(() => null))).then(() => alive && setNotesReady((x) => x + 1));
    return () => {
      alive = false;
    };
  }, []);
  const rows = useMemo(() => synopsisRows(flip, (id) => loadedCard(id)?.notes ?? null), [flip, notesReady]);
  const [open, setOpen] = useState<string | null>(null);
  const [whyTop, setWhyTop] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const segOn = skyGroup.value?.kind === 'segment' ? skyGroup.value.label : null;
  // решение 125 (UI-19): на телефоне сначала только Мф и Лк; Бытие, 1 Пар и Руфь — по команде
  const phone = grid.value.phone;
  const [otOn, setOt] = useRemembered<boolean | null>('synopsis:ot', null);
  const ot = otOn ?? !phone;
  const cols = ot ? 7 : 4;
  // переходы к расхождениям и схождениям (решение 125): строка-вставка участка — в видимую часть листа, фокус — на неё
  const jump = (at: string) => {
    const el = box.current?.querySelector<HTMLElement>(`tr.note[data-at="${CSS.escape(at)}"] > td`);
    const sheet = box.current?.closest<HTMLElement>('.sheet');
    if (!el || !sheet) return;
    sheet.scrollTop = (el.closest('tr') as HTMLElement).offsetTop - 60;
    el.focus({ preventScroll: true });
  };

  // U2: панель, открытая с неба у точки сравнения, стоит у своего участка
  useLayoutEffect(() => {
    const at = synopsisAt.value;
    if (!at) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-at="${CSS.escape(at)}"]`) ?? box.current?.querySelector<HTMLElement>(`tr[data-id="${CSS.escape(at)}"]`);
    const sheet = box.current?.closest<HTMLElement>('.sheet');
    if (el && sheet) sheet.scrollTop = el.offsetTop - 60;
    synopsisAt.value = null;
  }, [synopsisAt.value, rows]);
  // участок на небе снимается вместе с панелью
  useEffect(
    () => () => {
      if (skyGroup.peek()?.kind === 'segment') skyGroup.value = null;
    },
    [],
  );

  const showSegment = (note: SynNote, label: string) => {
    if (segOn === label) {
      skyGroup.value = null;
      return;
    }
    skyGroup.value = { ids: note.ids, label, kind: 'segment', line: 'both' };
    if (grid.peek().phone) panel.value = null;
    // лица участка вне показа — гостями, пока участок подсвечен (решение 113)
    const guests = showResults(note.ids, 'synopsis', 'group');
    if (guests) window.setTimeout(() => flyToIds(note.ids), 120);
    else flyToIds(note.ids);
  };

  const refCell = (row: string, cell: OtCell, c: number): ComponentChildren => {
    const col = OT_COLS[c];
    if (cell.kind === 'out') return <td key={col.key} class="ot out" aria-label={`${col.title}: не охватывает`} />;
    if (cell.kind === 'none')
      return (
        <td key={col.key} class="ot no">
          —
        </td>
      );
    const key = `${row}|${cell.ref}`;
    const short = shortRef(cell.ref);
    // в узком столбце ссылка переносится после «–» (без U+2060), скобки — внутри кнопки: «[» и «]» не отрываются (MOB-62)
    const btn = (label: string) => (
      <button class="ref" aria-expanded={open === key} aria-label={refLabel(cell.ref)} onClick={() => setOpen(open === key ? null : key)}>
        {label}
      </button>
    );
    if (cell.kind === 'bracket')
      return (
        <td key={col.key} class="ot bracket" title="только в квадратных скобках Синодального текста">
          {btn(`[${short}]`)}
        </td>
      );
    if (cell.kind === 'absent')
      return (
        <td key={col.key} class="ot absent">
          <span class="odd-note">не назван в</span> {btn(short)}
        </td>
      );
    return (
      <td key={col.key} class="ot">
        {btn(short)}
        {cell.via && (
          <span class="via">
            {cell.mother ? 'мать' : 'отец'} — <P id={cell.via} />
          </span>
        )}
      </td>
    );
  };
  const noCell = (s: Side | null, which: 'mt' | 'lk', out: boolean) => {
    if (out) return <td class="no-cell out" />;
    if (!s) return <td class="no-cell" />;
    if (which === 'mt' && s.flag === 'omitted-by-mt') return <td class="no-cell">—</td>;
    if (s.no === null) return <td class="no-cell" />;
    return <td class="no-cell">{s.no}</td>;
  };
  const sideName = (s: Side | null, which: 'mt' | 'lk') => {
    if (!s) return null;
    return (
      <>
        <Name id={s.id} />
        {which === 'mt' && s.flag === 'omitted-by-mt' && <span class="odd-note"> у Мф опущен</span>}
        {which === 'lk' && s.flag === 'interpretation' && <span class="odd-note"> Лк 3:23, по толкованию</span>}
        {which === 'lk' && s.flag === 'luke-only' && <span class="odd-note"> только у Луки</span>}
      </>
    );
  };

  let body = 0;
  const trs: ComponentChildren[] = [];
  // до Авраама Матфей родословия не ведёт (CARD-63): имя — в столбце «Лк 3», столбцы Матфея — одна клетка на участок
  const preRun = (k: number) => {
    let n = 0;
    for (let i = k; i < rows.length; i++) {
      const x = rows[i];
      if (x.kind !== 'common' || x.mt?.flag !== 'before-matthew') break;
      n++;
    }
    return n;
  };
  let preLeft = 0;
  let preSaid = false;
  for (const [ri, r] of rows.entries()) {
    if (r.kind === 'note') {
      trs.push(<NoteRow key={r.key} note={r.note} segOn={segOn} onShow={showSegment} cols={cols} />);
      body = 0;
      preLeft = 0;
      continue;
    }
    body++;
    const openHere = open && open.startsWith(`${r.key}|`) ? open.slice(r.key.length + 1) : null;
    const fifth = body % 5 === 0 ? ' fifth' : '';
    if (r.kind === 'common' && r.mt?.flag === 'before-matthew') {
      const run = preLeft > 0 ? 0 : preRun(ri);
      if (run) preLeft = run;
      trs.push(
        <tr key={r.key} class={`common pre${fifth}`} data-id={r.id}>
          {run ? (
            <td class="mt-pre" rowSpan={run} colSpan={2}>
              {preSaid ? null : typo('Матфей начинает с Авраама (Мф 1:2)')}
            </td>
          ) : null}
          <th scope="row" class="nm lk">
            <Name id={r.id} />
          </th>
          {noCell(r.lk, 'lk', false)}
          {ot && r.ot.map((c, i) => refCell(r.key, c, i))}
        </tr>,
      );
      preSaid = true;
      preLeft--;
    } else if (r.kind === 'common') {
      const jesusLk = r.id === 'iisus' && !r.lk?.no;
      trs.push(
        // общий участок: имя на обе колонки — оно принадлежит обеим линиям (VIS-34); стоит на оси имён Матфея (VIS-78)
        <tr key={r.key} class={`common${fifth}`} data-id={r.id}>
          {noCell(r.mt, 'mt', false)}
          <th scope="row" colspan={2} class="nm both">
            <Name id={r.id} />
          </th>
          {jesusLk ? <td class="no-cell ref-cell">{typo('3:23')}</td> : noCell(r.lk, 'lk', false)}
          {ot && r.ot.map((c, i) => refCell(r.key, c, i))}
        </tr>,
      );
    } else {
      trs.push(
        <tr key={r.key} class={`split${fifth}`} data-id={r.mt?.id ?? r.lk?.id}>
          {noCell(r.mt, 'mt', false)}
          <th scope="row" class={r.mt ? 'nm mt' : 'nm mt empty'}>
            {sideName(r.mt, 'mt')}
          </th>
          <td class={r.lk ? 'nm lk' : 'nm lk empty'}>{sideName(r.lk, 'lk')}</td>
          {noCell(r.lk, 'lk', false)}
          {ot && r.ot.map((c, i) => refCell(r.key, c, i))}
        </tr>,
      );
    }
    if (openHere)
      trs.push(
        <tr key={`${r.key}-v`} class="verse-row">
          <td colspan={cols}>
            <Verses refText={openHere} />
          </td>
        </tr>,
      );
  }

  return (
    <Sheet wide title="Синопсис родословий" lead="Родословия по Матфею и по Луке рядом, с Бытием, 1 Паралипоменон и Руфью.">
      <div class="lk3">
        <Segmented
          label="Как понимать Лк 3"
          options={[
            { value: 'mary', label: 'Лк 3 — родословие Марии (традиционно)' },
            { value: 'joseph', label: 'Лк 3 — второе родословие Иосифа' },
          ]}
          value={flip ? 'joseph' : 'mary'}
          onChange={(v) => (lineFlip.value = v === 'joseph')}
        />
        <p class="muted">
          {flip
            ? typo('Илий в Лк 3:23 понят как отец Иосифа; линия по Луке сходится с линией Матфея в Иосифе. ')
            : typo('Илий в Лк 3:23 понят как отец Марии, а Иосиф назван по закону; это толкование. ')}
          Почему так понимают —{' '}
          <span class="nobr">
            <PWhy id="iliy-otets-marii" open={whyTop} onToggle={() => setWhyTop(!whyTop)} />.
          </span>
        </p>
        {whyTop && (loadedCard('iliy-otets-marii')?.notes?.length ?? 0) > 0 ? <WhyInsert id="iliy-otets-marii" owner="syn-why-top" /> : null}
      </div>
      {/* переходы к расхождениям и схождениям; источники Ветхого Завета — командой (решение 125) */}
      <div class="syn-jumps" role="group" aria-label="Переходы по синопсису">
        <span class="k">Перейти:</span>
        {rows.flatMap((r) => (r.kind === 'note' ? [r.note] : [])).map((n) => (
          <button key={`${n.kind}-${n.at}`} type="button" class="cmd" onClick={() => jump(noteAt(n))}>
            {typo(jumpLabel(n))}
          </button>
        ))}
        <button type="button" class="cmd syn-ot" onClick={() => setOt(!ot)}>
          {ot ? 'Скрыть Быт, 1 Пар и Руф' : 'Показать Быт, 1 Пар и Руф'}
        </button>
      </div>
      <div class="syn-wrap" ref={box}>
        <table class={ot ? 'synopsis' : 'synopsis mtlk'}>
          <colgroup>
            <col class="c-no" />
            <col class="c-nm" />
            <col class="c-nm" />
            <col class="c-no" />
            {ot && (
              <>
                <col class="c-ot" />
                <col class="c-ot" />
                <col class="c-ot" />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" class="num" aria-label="Номер у Матфея">
                №
              </th>
              <th scope="col">Мф 1</th>
              <th scope="col">Лк 3</th>
              <th scope="col" class="num" aria-label="Номер у Луки">
                №
              </th>
              {ot &&
                OT_COLS.map((c) => (
                  <th scope="col" key={c.key} title={c.title}>
                    {c.label}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>{trs}</tbody>
        </table>
      </div>
      <p class="muted">
        {typo(
          'Номера — порядок имён: у Матфея от Авраама (1) до Иисуса (42), у Луки от Иосифа (1) до Адама (75). В столбцах Бытия, 1 Паралипоменон и Руфи — стих, где назван человек; «—» — источник его не называет; пустая тёмная клетка — источник этой части родословия не охватывает; [ ] — только в квадратных скобках Синодального текста.',
        )}
      </p>
    </Sheet>
  );
}

/** Где стоит строка-вставка участка (data-at): у схождения — само лицо, у расхождения и лишних поколений — лицо перед ними. */
const noteAt = (n: SynNote) => (n.kind === 'join' ? n.at : (n.prev ?? n.at));

/**
 * Надпись перехода (решение 125): «расхождение: Давид», «схождение: Салафиил», «только у Луки: Каинан». Имена — в
 * именительном падеже, без склонения.
 */
export function jumpLabel(n: SynNote): string {
  const nm = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : '');
  if (n.kind === 'join') return `схождение: ${nm(n.at)}`;
  if (n.kind === 'split') return `расхождение: ${nm(n.prev)}`;
  const side = n.mt.length ? n.mt : n.lk;
  return `${n.mt.length ? 'только у Матфея' : 'только у Луки'}: ${side.map((s) => nm(s.id)).join(', ')}`;
}

/** Сколько имён у линии на участке: «15 имён». */
const count = (n: number) => `${n} ${plural(n, 'имя', 'имени', 'имён')}`;

/**
 * Вставка перед участком (U2; UX-14): что здесь происходит, со стихами обеих линий, «почему» — ссылкой на примечание
 * карточки, и команда «показать участок на небе». Строки собраны без подстановки имени в падеж.
 */
function NoteRow({ note, segOn, onShow, cols = 7 }: { note: SynNote; segOn: string | null; onShow: (n: SynNote, label: string) => void; cols?: number }) {
  const why = WHY[note.kind === 'join' ? note.at : note.kind === 'extra' ? (note.mt[0] ?? note.lk[0]).id : (note.prev ?? '')];
  const owner = `sn-${note.kind}-${note.at}`;
  const prevName = note.prev ? (byId.get(note.prev)?.name ?? '') : '';
  const atName = byId.get(note.at)?.name ?? '';
  let label = '';
  let text: ComponentChildren = null;
  if (note.kind === 'extra') {
    const side = note.mt.length ? note.mt : note.lk;
    const who = note.mt.length ? 'у Матфея' : 'у Луки';
    label = `Участок: ${prevName} и ${side.map((s) => byId.get(s.id)?.name).join(', ')}`;
    text = (
      <>
        {typo(`Здесь ${who} на ${side.length} ${plural(side.length, 'поколение', 'поколения', 'поколений')} больше: `)}
        <Names sides={side} book={note.mt.length ? 'Мф' : 'Лк'} owner={owner} />.
      </>
    );
  } else if (note.kind === 'split') {
    const omitted = note.mt.filter((s) => s.flag === 'omitted-by-mt').length;
    label = `Участок: ${prevName} — ${byId.get(note.mt[0].id)?.name} / ${byId.get(note.lk[0].id)?.name}`;
    text = (
      <>
        Здесь линии расходятся: <Names sides={note.mt.slice(0, 1)} book="Мф" owner={`${owner}m`} /> — <Names sides={note.lk.slice(0, 1)} book="Лк" owner={`${owner}l`} />.{' '}
        {typo(
          `До схождения у Матфея ${count(note.mt.length - omitted)}${omitted ? ` (и ещё ${omitted} ${plural(omitted, 'царь', 'царя', 'царей')} по 4 Цар и 1 Пар 3, опущенных в Мф 1:8)` : ''}, у Луки — ${count(note.lk.length)}.`,
        )}
      </>
    );
  } else {
    label = `Схождение: ${atName}`;
    text = (
      <>
        Здесь линии сходятся: <P id={note.at} />. Имя перед этим у Матфея — <Names sides={note.mt} book="Мф" owner={`${owner}m`} />
        {lineFlagOf(note.at) === 'legal' ? ', по закону' : ''}, у Луки — <Names sides={note.lk} book="Лк" owner={`${owner}l`} />
        {note.lk.some((s) => s.flag === 'interpretation') ? ', по толкованию' : ''}.
      </>
    );
  }
  const whyP = !!why && byId.has(why) && (loadedCard(why)?.notes?.length ?? 0) > 0;
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <tr class={`note ${note.kind}`} data-at={noteAt(note)}>
      {/* цель перехода «Перейти: …» (решение 125): фокус встаёт на вставку, Tab идёт дальше по её ссылкам */}
      <td colspan={cols} tabIndex={-1}>
        <p>
          {text}
          {whyP && (
            <>
              {' '}
              Почему —{' '}
              <span class="nobr">
                <PWhy id={why} open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} />.
              </span>
            </>
          )}
        </p>
        {whyP && whyOpen ? <WhyInsert id={why} owner={`${owner}w`} /> : null}
        {note.kind !== 'join' && (
          <div class="cmds">
            <button class="cmd" aria-pressed={segOn === label} onClick={() => onShow(note, label)}>
              показать участок на небе
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * «Почему» (UX-44): примечания § 24 лица — вклейкой прямо в синопсисе, как вклейка стиха; синопсис остаётся открытым.
 * Под вклейкой — ссылка на всю карточку.
 */
function PWhy({ id, open, onToggle }: { id: string; open: boolean; onToggle: () => void }) {
  return (
    <button class="why" aria-expanded={open} onClick={onToggle}>
      {typo(`${byId.get(id)?.name ?? id}, § 24`)}
    </button>
  );
}

const NOTE_KIND: Record<string, string> = { textual: 'Текст', interpretation: 'Толкование', identification: 'Отождествление', chronology: 'Хронология', bracket: 'Скобки Синодального текста' };

function WhyInsert({ id, owner }: { id: string; owner: string }) {
  const notes = loadedCard(id)?.notes ?? [];
  const p = byId.get(id);
  return (
    <div class="why-insert" role="region" aria-label={typo(`${p?.name ?? id}: примечания, § 24`)}>
      <ul>
        {notes.map((n, i) => (
          <li key={i}>
            <span class="muted">{NOTE_KIND[n.kind] ?? 'Примечание'}. </span>
            {typo(n.text)}
            <Refs refs={n.refs} owner={`${owner}${i}`} />
            <VerseInsert owner={`${owner}${i}`} refs={n.refs} />
          </li>
        ))}
      </ul>
      {/* «Вся карточка» открывает карточку развёрнутой (UX-81): если рядом с синопсисом ей нет места и она легла
          корешком — как «развернуть» на корешке (unfoldCard) */}
      <p class="why-card" onClick={() => grid.peek().spine && !grid.peek().phone && unfoldCard()}>
        Вся карточка: <P id={id} />
      </p>
    </div>
  );
}
