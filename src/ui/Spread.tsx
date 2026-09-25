/**
 * Разворот (ТЗ § 3.3): две карточки рядом, раздел против раздела.
 * Номера разделов неизменны, поэтому строки выравниваются сами собой: слева первое лицо, справа второе,
 * номер и название раздела — в корешке. Разделы, о которых нет сведений ни у одного лица, сведены в одну строку.
 */
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, graph, loadCard } from '../data/atlas.ts';
import { relate } from '../engine/kinship.ts';
import type { Card } from '../data/types.ts';
import { selected, second, panel, model } from '../state.ts';
import { SECTIONS, PARTS, buildSections, Masthead } from './Folio.tsx';
import { P, skyRef, CAN_PRINT } from './common.tsx';

type St = 'content' | 'silent' | 'absent';
const STATE_TEXT: Record<Exclude<St, 'content'>, string> = { silent: 'в Писании не сообщается', absent: 'раздел не составлен' };

export function Spread() {
  const a = selected.value;
  const b = second.value;
  const [cards, setCards] = useState<Record<string, Card>>({});
  useEffect(() => {
    let alive = true;
    for (const id of [a, b]) {
      if (!id || cards[id]) continue;
      loadCard(id).then((d) => alive && setCards((c) => ({ ...c, [id]: d?.card ?? {} })));
    }
    return () => {
      alive = false;
    };
  }, [a, b]);
  if (!a || !b || !byId.has(a) || !byId.has(b)) return null;

  const m = model.value;
  const side = (id: string, ns: string) => {
    const p = byId.get(id)!;
    const out = buildSections(id, p, cards[id] ?? null, m, m.chrono.get(id), ns);
    const silent = new Set(p.silent);
    return { out, st: (n: number): St => (out.has(n) ? 'content' : silent.has(n) ? 'silent' : 'absent') };
  };
  const L = side(a, 'A:');
  const R = side(b, 'B:');

  const cell = (s: ReturnType<typeof side>, n: number) =>
    s.st(n) === 'content' ? s.out.get(n) : <span class="none">{STATE_TEXT[s.st(n) as Exclude<St, 'content'>]}</span>;

  const rows: ComponentChildren[] = [];
  let lastPart = 0;
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const n0 = run[0];
    rows.push(
      <div class="row quiet" key={`r${n0}`}>
        <div class="pg">{cell(L, n0)}</div>
        <div class="spine">
          <span class="no">{run.length > 1 ? `${n0}–${run[run.length - 1]}` : n0}</span>
          {run.map((n) => SECTIONS[n - 1].title).join(', ')}
        </div>
        <div class="pg">{cell(R, n0)}</div>
      </div>,
    );
    run = [];
  };
  for (const s of SECTIONS) {
    if (s.part !== lastPart) {
      flush();
      rows.push(
        <div class="part" key={`p${s.part}`}>
          {PARTS[s.part]}
        </div>,
      );
      lastPart = s.part;
    }
    const sl = L.st(s.n);
    const sr = R.st(s.n);
    if (sl !== 'content' && sr !== 'content') {
      if (run.length && (L.st(run[0]) !== sl || R.st(run[0]) !== sr)) flush();
      run.push(s.n);
      continue;
    }
    flush();
    rows.push(
      <div class="row" key={`r${s.n}`}>
        <div class="pg">{cell(L, s.n)}</div>
        <div class="spine">
          <span class="no">{s.n}</span>
          {s.title}
        </div>
        <div class="pg">{cell(R, s.n)}</div>
      </div>,
    );
  }
  flush();

  const close = () => (panel.value = null);
  return (
    <section class="spread" aria-label={`Разворот: ${byId.get(a)!.name} и ${byId.get(b)!.name}`}>
      <div class="spread-bar">
        <span class="title">Разворот</span>
        <button
          onClick={() => {
            selected.value = b;
            second.value = a;
          }}
        >
          поменять страницы
        </button>
        <button onClick={() => skyRef.flyTo(a)}>левое лицо на небе</button>
        <button onClick={() => skyRef.flyTo(b)}>правое лицо на небе</button>
        {CAN_PRINT && <button onClick={() => window.print()}>печать</button>}
        <button onClick={close}>закрыть</button>
      </div>
      <div class="spread-grid">
        <div class="row mastrow">
          <div class="pg">
            <Masthead id={a} />
          </div>
          <KinSpine a={a} b={b} />
          <div class="pg">
            <Masthead id={b} />
          </div>
        </div>
        {rows}
      </div>
    </section>
  );
}

/** Цепочка родства между лицами разворота — в корешке, сверху вниз от левого лица к правому. */
function KinSpine({ a, b }: { a: string; b: string }) {
  const r = relate(graph, a, b, 1)[0];
  if (!r) {
    return (
      <div class="spine kin">
        <span class="none">родство в данных атласа не найдено</span>
      </div>
    );
  }
  const ids = [...new Set(r.steps.flatMap((s) => [s.from, s.to]))];
  // длинная цепочка сокращается: три звена сверху, три снизу
  const shown: (string | number)[] = ids.length > 8 ? [...ids.slice(0, 3), ids.length - 6, ...ids.slice(-3)] : ids;
  return (
    <div class="spine kin">
      <p class="sent">
        {r.sentence}
        {r.interpretive ? ', по толкованию' : ''}
      </p>
      <ol class="chain">
        {shown.map((x, i) =>
          typeof x === 'number' ? (
            <li key={`gap${i}`} class="gap">
              ещё {x}
            </li>
          ) : (
            <li key={x}>
              <P id={x} />
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
