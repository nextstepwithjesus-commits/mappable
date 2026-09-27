/**
 * Подсказка неба (E11; IX-06, IX-07, UX-29) и ярусов эпох (D14; IX-28, MAP-46, MAP-47): лист у звезды или отрезка.
 * Правила места и задержки — src/ui/sky/tip.ts. Подсказка появляется в разметке сразу, прозрачной: её настоящий размер
 * нужен, чтобы выбрать положение; видимой (data-shown) она становится через 120 мс.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, loadCard, loadVerses } from '../../data/atlas.ts';
import { parseRef, verseId } from '../../engine/books.ts';
import { formatSpan, formatYear, yearsWord } from '../../engine/years.ts';
import { model, selected } from '../../state.ts';
import { refLabel, renderBrackets, skyRef } from '../common.tsx';
import { typo } from '../text/typo.ts';
import type { TierHit } from '../../render/tiers.ts';
import { starRadius } from '../../render/glyphs.ts';
import { lifeText, placeText } from './text.ts';
import { reserve, screenOf } from './view.ts';
import { placeTip, TIP_DELAY, TIP_MARGIN, TIP_WARM, type TipSide } from './tip.ts';
import type { Rect } from '../../render/sky.ts';

export type Tip = { kind: 'star'; id: string; x: number; y: number } | { kind: 'tier'; hit: TierHit; x: number; y: number };

export const tipKey = (t: Tip | null) => (!t ? '' : t.kind === 'star' ? `s:${t.id}` : `t:${t.hit.bar.key}`);

/** Когда подсказка последний раз была видна (для «тёплого» показа без задержки). */
let lastVisible = -Infinity;

/** Прямоугольник звезды с кольцом наведения, px холста. */
function starBox(id: string): Rect | null {
  const q = screenOf(id);
  const p = byId.get(id);
  const s = skyRef.current;
  if (!q || !p || !s) return null;
  const r = starRadius(p.magnitude, Math.max(0.7, Math.min(1.25, s.cam.ky / 18))) + (p.sex === 'f' ? 7 : 5);
  return { x: q.x - r, y: q.y - r, w: 2 * r, h: 2 * r };
}

export function SkyTip({ tip }: { tip: Tip | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: TipSide } | null>(null);
  const [shown, setShown] = useState(false);
  const key = tipKey(tip);
  const shownRef = useRef(false);
  shownRef.current = shown;

  // задержка 120 мс; от соседней звезды к соседней — сразу
  useEffect(() => {
    if (!key) {
      if (shownRef.current) lastVisible = performance.now();
      setShown(false);
      setPos(null);
      return;
    }
    if (shownRef.current || performance.now() - lastVisible < TIP_WARM) {
      setShown(true);
      return;
    }
    setShown(false);
    const t = window.setTimeout(() => setShown(true), TIP_DELAY);
    return () => clearTimeout(t);
  }, [key]);
  useEffect(
    () => () => {
      if (shownRef.current) lastVisible = performance.now();
    },
    [],
  );

  // место — по настоящему размеру (и заново, когда подгрузился стих)
  useLayoutEffect(() => {
    const el = ref.current;
    const s = skyRef.current;
    if (!tip || !el || !s) return;
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const cam = s.cam;
    const bounds = { x: TIP_MARGIN, y: TIP_MARGIN, w: cam.w - 2 * TIP_MARGIN, h: cam.vp.b - 2 * TIP_MARGIN };
    const avoid: Rect[] = [];
    const sel = selected.peek();
    if (sel && (tip.kind !== 'star' || tip.id !== sel)) {
      const b = starBox(sel);
      // выбранная звезда и её имя справа
      if (b) avoid.push({ x: b.x - 4, y: b.y - 6, w: b.w + 110, h: b.h + 12 });
    }
    let anchor: Rect | null;
    if (tip.kind === 'star') anchor = starBox(tip.id);
    else anchor = { x: tip.x - 1, y: tip.hit.y, w: 2, h: tip.hit.h };
    if (!anchor) return;
    const p = placeTip(anchor, size, bounds, avoid, reserve(), tip.kind === 'tier' ? ['se', 'sw'] : undefined);
    if (!pos || Math.abs(pos.x - p.x) > 0.5 || Math.abs(pos.y - p.y) > 0.5 || pos.side !== p.side) setPos(p);
  });

  if (!tip) return null;
  const visible = shown && !!pos;
  return (
    <div
      ref={ref}
      class="tip"
      role="tooltip"
      data-kind={tip.kind}
      data-id={tip.kind === 'star' ? tip.id : tip.hit.bar.id}
      data-side={pos?.side}
      data-shown={visible ? '' : undefined}
      style={{ left: `${pos?.x ?? 0}px`, top: `${pos?.y ?? 0}px` }}
    >
      {tip.kind === 'star' ? <StarTip id={tip.id} /> : <TierTip hit={tip.hit} />}
    </div>
  );
}

function StarTip({ id }: { id: string }) {
  const p = byId.get(id);
  if (!p) return null;
  return (
    <>
      <b>{p.name}</b>
      {p.disambig && <span class="ds">, {p.disambig}</span>}
      <div class="yr">{lifeText(p.id)}</div>
      <div class="ds">{placeText(p.id)}</div>
    </>
  );
}

/** Первый стих основания: для царя — стих о его царствовании, для пророка — надписание или стих служения. */
function useFirstVerse(id: string | null, kind: 'reign' | 'active', k: number): { ref: string; text: string } | null {
  const [v, setV] = useState<{ ref: string; text: string } | null>(null);
  useEffect(() => {
    setV(null);
    if (!id) return;
    let alive = true;
    loadCard(id)
      .then((c) => {
        const refs = kind === 'reign' ? c?.chrono?.reign?.[k]?.refs : c?.chrono?.active?.refs;
        const first = refs?.[0];
        const pr = first ? parseRef(first) : null;
        if (!first || !pr) return;
        return loadVerses(pr.book).then((vs) => {
          const text = pr.verses
            .slice(0, 2)
            .map((x) => vs[verseId(x).slice(pr.book.length + 1)] ?? '')
            .filter(Boolean)
            .join(' ');
          // цитата в кавычках: точка конца стиха уходит, ссылка стоит после кавычки
          if (alive && text) setV({ ref: first, text: text.replace(/[.,;:]\s*$/, '') });
        });
      })
      .catch(() => {
        /* том или стихи не загрузились: подсказка остаётся без стиха */
      });
    return () => {
      alive = false;
    };
  }, [id, kind, k]);
  return v;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TierTip({ hit }: { hit: TierHit }) {
  const b = hit.bar;
  const isPerson = b.kind === 'person';
  const reign = b.reign !== undefined;
  const verse = useFirstVerse(isPerson ? b.id : null, reign ? 'reign' : 'active', b.reign ?? 0);
  if (b.kind === 'epoch') {
    const e = model.value.epochs.find((x) => x.id === b.id);
    return (
      <>
        <b>{b.label}</b>
        <div class="yr">{e ? formatSpan(b.t0, b.t1, b.soft) : ''}</div>
        <div class="ds">{typo('Щёлкните — небо покажет эпоху')}</div>
      </>
    );
  }
  if (b.kind === 'event') {
    return (
      <>
        <b>{typo(b.label)}</b>
        <div class="yr">
          {formatYear(b.t0)}
          {b.refs?.length ? `; ${b.refs.map(refLabel).join('; ')}` : ''}
        </div>
      </>
    );
  }
  const p = byId.get(b.id);
  if (!p) return null;
  const span = formatSpan(b.t0, b.t1, true);
  return (
    <>
      <b>{p.name}</b>
      {p.disambig && <span class="ds">, {p.disambig}</span>}
      {reign ? (
        <>
          <div class="yr">{typo(`${cap(b.over ?? '')}: ${span}, расч.`)}</div>
          {b.years ? <div>{typo(`${p.sex === 'f' ? 'Царствовала' : 'Царствовал'} ${yearsWord(b.years)}`)}</div> : null}
        </>
      ) : (
        <div class="yr">{typo(`Годы служения: ${span}, расч.`)}</div>
      )}
      {verse && (
        <div class="verse">
          «{renderBrackets(verse.text)}» ({refLabel(verse.ref)})
        </div>
      )}
    </>
  );
}
