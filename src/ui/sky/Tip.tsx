/**
 * Подсказка неба (E11; IX-06, IX-07, UX-29) и ярусов эпох (D14; IX-28, MAP-46, MAP-47): лист у звезды или отрезка.
 * Правила места и задержки — src/ui/sky/tip.ts. Подсказка появляется в разметке сразу, прозрачной: её настоящий размер
 * нужен, чтобы выбрать положение; видимой (data-shown) она становится через 120 мс.
 * У звезды сначала две строки — имя с уточнением и годы; место, промежуток рождения и клавиши набора — через 700 мс
 * неподвижности (IX-58). В режиме выбора второго лица «Родства» — кем лицо приходится первому (IX-22).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, loadCard, loadVerses } from '../../data/atlas.ts';
import { parseRef, verseId } from '../../engine/books.ts';
import { formatSpan, formatYear, yearsWord } from '../../engine/years.ts';
import { graph } from '../../data/atlas.ts';
import { relate } from '../../engine/kinship.ts';
import { model, pickMode, selected } from '../../state.ts';
import { refLabel, renderBrackets, skyRef } from '../common.tsx';
import { typo } from '../text/typo.ts';
import type { TierHit } from '../../render/tiers.ts';
import { starRadius } from '../../render/glyphs.ts';
import { birthSpanText, lifeText, placeText } from './text.ts';
import { reserve, screenOf } from './view.ts';
import { placeTip, TIP_DELAY, TIP_MARGIN, TIP_MORE, TIP_WARM, type TipSide } from './tip.ts';
import { foldDesc, hasDescendants, workSet } from '../work.ts';
import type { Rect } from '../../render/sky.ts';

export type Tip =
  | { kind: 'star'; id: string; x: number; y: number }
  | { kind: 'tier'; hit: TierHit; x: number; y: number }
  /** пояснение надписи рамки (UX-08: «≈» масштабной линейки) у её прямоугольника box */
  | { kind: 'note'; key: string; text: string; x: number; y: number; box: Rect };

export const tipKey = (t: Tip | null) => (!t ? '' : t.kind === 'star' ? `s:${t.id}` : t.kind === 'tier' ? `t:${t.hit.bar.key}` : `n:${t.key}`);

/** Когда подсказка последний раз была видна (для «тёплого» показа без задержки). */
let lastVisible = -Infinity;
/** Звезда, чья подсказка сейчас видна: её берёт клавиша В, если кольца клавиатуры нет (IX-51). */
let visibleStar: string | null = null;
export const shownTipStar = () => visibleStar;

/** Кем лицо id приходится выбранному — в режиме выбора второго лица «Родства» (IX-22): «Иоав — племянник Давида». */
export function kinPreview(id: string): { sentence: string; path: string[]; steps: ReturnType<typeof relate>[number]['steps'] } | null {
  const a = selected.peek();
  if (pickMode.peek() !== 'kinship' || !a || a === id) return null;
  const cached = previewCache.get(`${a} ${id}`);
  if (cached !== undefined) return cached;
  // предложение — от наведённого лица («Иоав — племянник Давида»), путь на небе — от первого лица, как у пары
  const back = relate(graph, id, a, 1)[0];
  const fwd = back ? relate(graph, a, id, 1)[0] : undefined;
  const out = back && fwd ? { sentence: back.sentence, path: [...new Set(fwd.steps.flatMap((x) => [x.from, x.to]))], steps: fwd.steps } : null;
  if (previewCache.size > 64) previewCache.clear();
  previewCache.set(`${a} ${id}`, out);
  return out;
}
const previewCache = new Map<string, ReturnType<typeof kinPreview>>();

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
  // место и клавиши у звезды — через 700 мс неподвижности (IX-58)
  const [more, setMore] = useState(false);
  const key = tipKey(tip);
  const shownRef = useRef(false);
  shownRef.current = shown;
  visibleStar = shown && tip?.kind === 'star' ? tip.id : null;
  useEffect(() => {
    setMore(false);
    if (!key || !shown) return;
    const t = window.setTimeout(() => setMore(true), TIP_MORE);
    return () => clearTimeout(t);
  }, [key, shown]);

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
      visibleStar = null;
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
    else if (tip.kind === 'tier') anchor = { x: tip.x - 1, y: tip.hit.y, w: 2, h: tip.hit.h };
    else anchor = tip.box;
    if (!anchor) return;
    const p = placeTip(anchor, size, bounds, avoid, reserve(), tip.kind === 'star' ? undefined : ['se', 'sw']);
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
      data-id={tip.kind === 'star' ? tip.id : tip.kind === 'tier' ? tip.hit.bar.id : tip.key}
      data-side={pos?.side}
      data-shown={visible ? '' : undefined}
      data-more={tip.kind === 'star' && more ? '' : undefined}
      style={{ left: `${pos?.x ?? 0}px`, top: `${pos?.y ?? 0}px` }}
    >
      {tip.kind === 'star' ? <StarTip id={tip.id} more={more} /> : tip.kind === 'tier' ? <TierTip hit={tip.hit} /> : <div class="note">{typo(tip.text)}</div>}
    </div>
  );
}

function StarTip({ id, more }: { id: string; more: boolean }) {
  const p = byId.get(id);
  if (!p) return null;
  const on = workSet.value.has(id);
  const kids = hasDescendants(id);
  const folded = foldDesc.value.includes(id);
  // выбор второго лица «Родства»: сразу — кем лицо приходится первому (IX-22); предложение начинается с имени
  const kin = kinPreview(id);
  const place = more ? placeText(p.id) : '';
  const birth = more ? birthSpanText(p.id) : '';
  return (
    <>
      <b>{p.name}</b>
      {p.disambig && <span class="ds">, {p.disambig}</span>}
      <div class="yr">{lifeText(p.id)}</div>
      {kin && <div class="kin">{typo(kin.sentence)}</div>}
      {/* оценочный год рождения — промежутком, те же числа, что в § 8 и в пунктирном начале следа (G5) */}
      {birth ? <div class="yr">{birth}</div> : null}
      {place ? <div class="ds">{place}</div> : null}
      {/* команды рабочего набора (J3, J5): клавиши обеих раскладок; правая кнопка мыши — меню звезды */}
      {more && (
        <div class="tip-keys" data-in-work={on ? '' : undefined}>
          <span>
            <kbd>В</kbd> (D) — {on ? 'убрать из работы' : 'взять в работу'}
          </span>
          {kids && (
            <span>
              <kbd>С</kbd> (C) — {folded ? 'показать потомков на небе' : 'скрыть потомков на небе'}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Первый стих основания: для царя — стих о его царствовании, для пророка — надписание или стих служения. */
/** given — стихи отрезка из ярусов (пророк без годов служения в данных: стихи его засвидетельствованной деятельности). */
function useFirstVerse(id: string | null, kind: 'reign' | 'active', k: number, given?: string): { ref: string; text: string } | null {
  const [v, setV] = useState<{ ref: string; text: string } | null>(null);
  useEffect(() => {
    setV(null);
    if (!id) return;
    let alive = true;
    loadCard(id)
      .then((c) => {
        const refs = given ? [given] : kind === 'reign' ? c?.chrono?.reign?.[k]?.refs : c?.chrono?.active?.refs;
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
  }, [id, kind, k, given]);
  return v;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TierTip({ hit }: { hit: TierHit }) {
  const b = hit.bar;
  const isPerson = b.kind === 'person';
  const reign = b.reign !== undefined;
  const verse = useFirstVerse(isPerson ? b.id : null, reign ? 'reign' : 'active', b.reign ?? 0, isPerson ? b.refs?.[0] : undefined);
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
        <div class="yr">{typo(b.note ? `${b.note}: ${span}, расч.` : `Годы служения: ${span}, расч.`)}</div>
      )}
      {verse && (
        <div class="verse">
          «{renderBrackets(verse.text)}» ({refLabel(verse.ref)})
        </div>
      )}
    </>
  );
}
