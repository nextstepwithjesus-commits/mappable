/**
 * Разворот (ТЗ § 3.3; G9): две карточки рядом, раздел против раздела.
 * Номера разделов неизменны, поэтому строки выравниваются сами собой: слева первое лицо, справа второе,
 * номер и название раздела — в корешке. Разделы, о которых нет сведений ни у одного лица, сведены в одну строку.
 * Линейки — только между частями I–VI (CARD-48; VIS-37); § 1 (имя) — в шапках, отдельной строкой не выводится.
 * Мини-шкалы двух шапок стоят на общей оси лет. На телефоне — один столбец: в каждом разделе корешок, под ним строки двух
 * лиц подряд (MOB-22, MOB-48).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Fragment, type ComponentChildren } from 'preact';
import { byId, graph, loadCard } from '../data/atlas.ts';
import { relate } from '../engine/kinship.ts';
import type { Card, Chrono } from '../data/types.ts';
import { selected, second, first, panel, model, setPair } from '../state.ts';
import { SECTIONS, PARTS, buildSections, sectionStates, Masthead, type SecState } from './Folio.tsx';
import { lifeWindow } from './card/Masthead.tsx';
import { skyRef, CAN_PRINT } from './common.tsx';
import { focusCardTitle } from './focus.ts';
import { grid } from './layout.ts';
import { openSheetAt, sheetStop } from './sheet.ts';
import { Close } from './controls.tsx';
import { Chain } from './panels/Kinship.tsx';
import { typo } from './text/typo.ts';

/**
 * Что стоит на странице вместо раздела без сведений. Пустая сторона разворота — словами, не одиноким «—» (VIS-57).
 * Несоставленный раздел — не молчание Писания (решения 6 и 64; CARD-88): бледное «—» с пояснением «раздел не составлен»;
 * если раздел не составлен у обоих лиц, строки нет.
 */
const STATE_TEXT: Partial<Record<SecState, string>> = { silent: 'в Писании не сообщается', na: 'не относится', absent: 'раздел не составлен' };

/** Общая ось мини-шкал двух шапок: объединение окон обоих лиц (астрономические годы). */
export function commonAxis(a: [number, number] | null, b: [number, number] | null): [number, number] | undefined {
  if (!a || !b) return undefined;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

/**
 * «Показать на небе» (IX-25): разворот закрывается (запись в истории), лицо выбирается, небо летит к нему. Фокус — на
 * заголовок карточки этого лица (IX-66), а не туда, откуда открыли разворот: читатель продолжает с лицом, которое показал.
 * На телефоне лист карточки — на шапке, как после той же команды в карточке (MOB-15): звезда видна над ним.
 */
function showOnSky(id: string) {
  const phone = grid.peek().phone;
  if (phone) openSheetAt('peek');
  panel.value = null;
  selected.value = id;
  if (phone) sheetStop.value = 'peek';
  skyRef.flyTo(id);
  focusCardTitle(id);
}

export function Spread() {
  // пара не следует за выбором: ссылки внутри разворота открывают карточки, но страницы остаются прежними
  const a = first.value ?? selected.value;
  const b = second.value;
  const [cards, setCards] = useState<Record<string, { card: Card; chrono: Chrono | null }>>({});
  useEffect(() => {
    let alive = true;
    for (const id of [a, b]) {
      if (!id || cards[id]) continue;
      loadCard(id).then((d) => alive && setCards((c) => ({ ...c, [id]: { card: d?.card ?? {}, chrono: d?.chrono ?? null } })));
    }
    return () => {
      alive = false;
    };
  }, [a, b]);
  if (!a || !b || !byId.has(a) || !byId.has(b)) return null;

  const m = model.value;
  const side = (id: string, ns: string) => {
    const p = byId.get(id)!;
    const card = cards[id]?.card ?? null;
    const out = buildSections(id, p, card, m, m.chrono.get(id), ns, cards[id]?.chrono ?? null);
    const states = sectionStates(id, out, card);
    return { id, name: p.name, out, st: (n: number): SecState => states[n] };
  };
  const L = side(a, 'A:');
  const R = side(b, 'B:');
  const axis = commonAxis(lifeWindow(a), lifeWindow(b));

  // имя лица перед его строкой — видно в один столбец (телефон), диктору — всегда. В разметке строки раздела корешок
  // (номер и название) — первым, затем «Давид: …», «Соломон: …» (MOB-48): так строку читает диктор и так она идёт на
  // телефоне; на широком экране места страниц и корешка заданы в spread.css
  const cell = (s: ReturnType<typeof side>, n: number) => (
    <div class="pg">
      <span class="who">{s.name}:</span>
      {s.st(n) === 'content' ? (
        s.out.get(n)
      ) : s.st(n) === 'absent' ? (
        <span class="none absent">
          <span class="dash" aria-hidden="true">
            —
          </span>{' '}
          {STATE_TEXT.absent}
        </span>
      ) : (
        <span class="none">{STATE_TEXT[s.st(n)] ?? ''}</span>
      )}
    </div>
  );

  const rows: ComponentChildren[] = [];
  let lastPart = 0;
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const n0 = run[0];
    rows.push(
      <div class="row quiet" key={`r${n0}`}>
        <div class="spine">
          <span class="no">{run.length > 1 ? `${n0}–${run[run.length - 1]}` : n0}</span>
          {typo(run.map((n) => SECTIONS[n - 1].title).join(', '))}
        </div>
        {cell(L, n0)}
        {cell(R, n0)}
      </div>,
    );
    run = [];
  };
  for (const s of SECTIONS) {
    const sl = L.st(s.n);
    const sr = R.st(s.n);
    // § 1 и разделы, которые стоят в шапках, не повторяются; не составленные у обоих — не показываются
    const hidden = (x: SecState) => x === 'header' || x === 'absent';
    if (s.n === 1 || (hidden(sl) && hidden(sr))) {
      flush();
      continue;
    }
    if (s.part !== lastPart) {
      flush();
      rows.push(
        <h3 class="part" key={`p${s.part}`}>
          {PARTS[s.part]}
        </h3>,
      );
      lastPart = s.part;
    }
    if (sl !== 'content' && sr !== 'content') {
      if (run.length && (L.st(run[0]) !== sl || R.st(run[0]) !== sr)) flush();
      run.push(s.n);
      continue;
    }
    flush();
    rows.push(
      <div class="row" key={`r${s.n}`}>
        <div class="spine">
          <span class="no">{s.n}</span>
          {s.title}
        </div>
        {cell(L, s.n)}
        {cell(R, s.n)}
      </div>,
    );
  }
  flush();

  const act = (id: string) => (
    <div class="cmds">
      <button class="cmd" onClick={() => showOnSky(id)}>
        Показать на небе
      </button>
    </div>
  );
  return (
    <section class="spread" aria-label={`Разворот: ${byId.get(a)!.name} и ${byId.get(b)!.name}`}>
      <div class="spread-bar">
        <h2 class="title">Разворот</h2>
        <button
          class="cmd"
          onClick={() => {
            setPair(b, a, false);
            selected.value = b;
          }}
        >
          {/* одно действие — одно слово (решение 109): как в «Родстве» */}
          Поменять местами
        </button>
        {CAN_PRINT && (
          <button class="cmd" onClick={() => window.print()}>
            Напечатать
          </button>
        )}
        <Close label="Закрыть разворот" onClick={() => (panel.value = null)} />
      </div>
      <div class="spread-grid">
        {/* шапки обоих лиц, затем цепочка родства; на широком экране цепочка — в корешке между шапками (spread.css) */}
        <div class="row mastrow">
          <div class="pg">
            <Masthead id={a} axis={axis} actions={act(a)} />
          </div>
          <div class="pg">
            <Masthead id={b} axis={axis} actions={act(b)} />
          </div>
          <KinSpine key={`${a}|${b}`} a={a} b={b} />
        </div>
        {/* строки другой пары, модели или пришедшего тома строятся заново, а не перекраиваются (CARD-76) */}
        <Fragment key={`${a}|${b}|${m.id}|${cards[a] ? 1 : 0}${cards[b] ? 1 : 0}`}>{rows}</Fragment>
      </div>
    </section>
  );
}

/**
 * Цепочка родства между лицами разворота — в корешке, сверху вниз от левого лица к правому:
 * та же фраза и та же цепочка, что в панели «Родство» (знак лица, отвод, термин связи); длиннее 8 звеньев — свёрнута.
 */
function KinSpine({ a, b }: { a: string; b: string }) {
  const r = useMemo(() => relate(graph, a, b, 1)[0], [a, b]);
  if (!r) {
    return (
      <div class="spine kin">
        <span class="none">родство не найдено</span>
      </div>
    );
  }
  return (
    <div class="spine kin">
      <p class="sent">{typo(r.sentence)}</p>
      <Chain chain={r.chain} ns="spine" years={false} refs={false} />
    </div>
  );
}
