/**
 * Подсказка неба (E11; IX-06, IX-07, UX-29) и ярусов эпох (D14; IX-28, MAP-46, MAP-47): лист у звезды или отрезка.
 * Правила места и задержки — src/ui/sky/tip.ts. Подсказка появляется в разметке сразу, прозрачной: её настоящий размер
 * нужен, чтобы выбрать положение; видимой (data-shown) она становится через 120 мс.
 * У звезды — не больше трёх строк и без клавиш (IX-58, VIS-69; клавиши — в таблице «Клавиши»): имя с уточнением, годы
 * с рождением одной строкой (MAP-53) и одна строка пояснения, самая нужная (StarTip). В режиме выбора второго лица
 * «Родства» первая строка — кем лицо приходится первому (IX-22). У ленты — шаг родства словами (решение 54).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, loadCard, loadRefVerses } from '../../data/atlas.ts';
import { dateText, epochSpanText, spanText, yearsWord } from '../../engine/years.ts';
import { nameCase } from '../text/ru.ts';
import { graph } from '../../data/atlas.ts';
import { relate } from '../../engine/kinship.ts';
import { lineFlip, model, pickMode, selected } from '../../state.ts';
import { refLabel, renderBrackets, skyRef } from '../common.tsx';
import { typo } from '../text/typo.ts';
import { hatchWord, type TierHit } from '../../render/tiers.ts';
import { starRadius } from '../../render/glyphs.ts';
import { BREAK_TEXT, countText, orderText, placeText, ribbonStepText, tipYears } from './text.ts';
import { reserve, screenOf } from './view.ts';
import { placeTip, TIP_DELAY, TIP_MARGIN, TIP_MORE, TIP_WARM, type TipSide } from './tip.ts';
import type { Rect } from '../../render/sky.ts';
import type { RibbonHit } from '../../render/ribbons.ts';
import { dotRect } from './DotCard.tsx';
import { linkTip, linkTitle } from '../linkwords.ts';
import { mainUnion } from '../../render/links.ts';
import { unions as ALL_UNIONS } from '../reveal.ts';
import { selectedKin } from '../card/kinrows.ts';
import type { LinkKey } from '../../engine/linkkey.ts';

export type Tip =
  /** звезда; count — указатель на номере лица в родословии у бусины (режим «только линии»; UX-69) */
  | { kind: 'star'; id: string; x: number; y: number; count?: { book: 'Мф' | 'Лк'; n: number } }
  | { kind: 'tier'; hit: TierHit; x: number; y: number }
  /** шаг ленты под указателем (E6; MAP-28, решение 54) */
  | { kind: 'ribbon'; hit: RibbonHit; x: number; y: number }
  /** пояснение надписи рамки (UX-08: «≈» масштабной линейки; UX-65: эпоха) у её прямоугольника box */
  | { kind: 'note'; key: string; text: string; x: number; y: number; box: Rect }
  /**
   * связь под указателем (этап 11, § 8): «Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)» — слова связи
   * src/ui/linkwords.ts (linkTip), у точки на линии x, y; ks — запись ключа
   */
  | { kind: 'link'; key: LinkKey; ks: string; x: number; y: number };

export const tipKey = (t: Tip | null) =>
  !t
    ? ''
    : t.kind === 'star'
      ? `s:${t.id}${t.count ? `:${t.count.book}` : ''}`
      : t.kind === 'tier'
        ? `t:${t.hit.bar.key}`
        : t.kind === 'ribbon'
          ? `r:${t.hit.line}:${t.hit.from}:${t.hit.to}`
          : t.kind === 'link'
            ? `l:${t.ks}`
            : `n:${t.key}`;

/**
 * Подсказка шага ленты (решение 54; стык 4): те же слова, что у любой связи (src/ui/linkwords.ts, linkTip) — стих, где
 * назван родитель (DG 2.3.7: у Марии → Иисус — Лк 1:31, а не Лк 3:23); если слов шага нет — прежняя строка ленты.
 */
export function ribbonTipText(line: 'joseph' | 'mary', from: string, to: string, flip = false, gap = 0): string {
  // участок, где показ скрыл поколения, — «цепочка» span (этап 13, решение 93, К4), а не шаг данных
  return gap ? linkTip({ kind: 'span', line, from, to }) : linkTip({ kind: 'step', line, child: to }) || ribbonStepText(line, from, to, flip);
}

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

/** Отрезки пути связи ks в последнем кадре неба — прямоугольниками с полем 4 px (px холста). */
function pathRects(ks: string): Rect[] {
  const s = skyRef.current;
  const d = s?.linkFrame();
  if (!d) return [];
  const out: Rect[] = [];
  for (const q of d.frame.paths) {
    if (q.ks !== ks) continue;
    for (let i = 0; i + 3 < q.pts.length; i += 2) {
      const x0 = Math.min(q.pts[i], q.pts[i + 2]) + d.dx;
      const x1 = Math.max(q.pts[i], q.pts[i + 2]) + d.dx;
      const y0 = Math.min(q.pts[i + 1], q.pts[i + 3]) + d.dy;
      const y1 = Math.max(q.pts[i + 1], q.pts[i + 3]) + d.dy;
      out.push({ x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 });
    }
  }
  return out;
}

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
  // третья строка у звезды — через 700 мс неподвижности (IX-58)
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
    // открытая карточка у точки (решение 76): подсказка её не закрывает
    const card = dotRect();
    if (card) avoid.push({ x: card.x - 4, y: card.y - 4, w: card.w + 8, h: card.h + 8 });
    const sel = selected.peek();
    if (sel && (tip.kind !== 'star' || tip.id !== sel)) {
      const b = starBox(sel);
      // выбранная звезда и её имя справа
      if (b) avoid.push({ x: b.x - 4, y: b.y - 6, w: b.w + 110, h: b.h + 12 });
    }
    // указатель и имя наведённого лица (решение 154: имя под указателем — тоже наведение на звезду) подсказка не закрывает
    if (tip.kind === 'star') {
      avoid.push({ x: tip.x - 8, y: tip.y - 8, w: 16, h: 16 });
      const nb = s.ledger.boxes.find((b) => (b.kind === 'star' || b.kind === 'sticky') && b.id === tip.id);
      if (nb) avoid.push({ x: nb.x - 2, y: nb.y - 2, w: nb.w + 4, h: nb.h + 4 });
    }
    let anchor: Rect | null;
    if (tip.kind === 'star') anchor = tip.count ? { x: tip.x - 6, y: tip.y - 8, w: 12, h: 16 } : starBox(tip.id);
    else if (tip.kind === 'tier') anchor = { x: tip.x - 1, y: tip.hit.y, w: 2, h: tip.hit.h };
    else if (tip.kind === 'ribbon' || tip.kind === 'link') anchor = { x: tip.x - 8, y: tip.y - 8, w: 16, h: 16 };
    else anchor = tip.box;
    if (!anchor) return;
    // путь наведённой связи и яркие подписи (решение 144; G13, C8): подсказка встаёт туда, где их меньше; у связи —
    // со всех четырёх сторон, а не только снизу: конец пути под подсказкой не прячется
    const path = tip.kind === 'link' ? pathRects(tip.ks) : [];
    const names = s.ledger.boxes.filter((b) => b.kind === 'star' || b.kind === 'plate' || b.kind === 'mark');
    const own = (r: Rect) => Math.abs(r.w - size.w) < 1.5 && Math.abs(r.h - size.h) < 1.5;
    const p = placeTip(anchor, size, bounds, avoid, reserve().filter((r) => !own(r)), tip.kind === 'star' || tip.kind === 'link' ? undefined : ['se', 'sw'], { path, names });
    if (!pos || Math.abs(pos.x - p.x) > 0.5 || Math.abs(pos.y - p.y) > 0.5 || pos.side !== p.side) setPos(p);
  });
  // подсказка встала или исчезла — резерв подписей заново (data-reserve="tip"; SkyView слушает «reserve-move»)
  const shownNow = !!tip && shown && !!pos;
  useEffect(() => {
    ref.current?.dispatchEvent(new CustomEvent('reserve-move', { bubbles: true }));
    if (!shownNow) document.querySelector('.sky')?.dispatchEvent(new CustomEvent('reserve-move', { bubbles: true }));
  }, [shownNow, pos?.x, pos?.y]);

  if (!tip) return null;
  const visible = shown && !!pos;
  return (
    <div
      ref={ref}
      class="tip"
      role="tooltip"
      data-kind={tip.kind}
      data-reserve={visible ? 'tip' : undefined}
      data-id={tip.kind === 'star' ? tip.id : tip.kind === 'tier' ? tip.hit.bar.id : tip.kind === 'ribbon' ? `${tip.hit.from} ${tip.hit.to}` : tip.kind === 'link' ? tip.ks : tip.key}
      data-side={pos?.side}
      data-shown={visible ? '' : undefined}
      data-more={tip.kind === 'star' && more ? '' : undefined}
      style={{ left: `${pos?.x ?? 0}px`, top: `${pos?.y ?? 0}px` }}
    >
      {tip.kind === 'star' ? (
        <StarTip id={tip.id} more={more} count={tip.count} />
      ) : tip.kind === 'tier' ? (
        <TierTip hit={tip.hit} />
      ) : tip.kind === 'ribbon' ? (
        <div class="note">{ribbonTipText(tip.hit.line, tip.hit.from, tip.hit.to, lineFlip.peek(), tip.hit.gap)}</div>
      ) : tip.kind === 'link' ? (
        <div class="note">{linkTip(tip.key)}</div>
      ) : (
        <div class="note">{typo(tip.text)}</div>
      )}
    </div>
  );
}

/**
 * Строки подсказки звезды (IX-58, VIS-69; MAP-51, MAP-53, UX-69, UX-73): не больше трёх и без клавиш.
 *  1) имя с уточнением; в режиме выбора второго лица «Родства» — кем лицо приходится первому (IX-22): предложение само
 *     начинается с имени («Иессей — отец Давида»);
 *  2) годы, рождение — одной строкой (tipYears);
 *  3) одна строка пояснения, по важности: счёт номера у бусины (сразу), разрыв «//», год по порядку перечисления, созвездие
 *     (через 700 мс неподвижности).
 */
export function starTipLines(id: string, o: { more: boolean; count?: { book: 'Мф' | 'Лк'; n: number }; kin?: string | null }): { head: 'name' | 'kin'; years: string; extra: string | null; kind: 'count' | 'break' | 'order' | 'place' | null } {
  const c = model.value.chrono.get(id);
  const node = model.value.nodeByPerson.get(id);
  const order = orderText(id);
  const broken = !!node && node.brk !== null && node.brk < node.t1;
  let extra: string | null = null;
  let kind: 'count' | 'break' | 'order' | 'place' | null = null;
  if (o.count) [extra, kind] = [countText(o.count.book, o.count.n), 'count'];
  else if (o.more && broken) [extra, kind] = [typo(BREAK_TEXT), 'break'];
  else if (o.more && order) [extra, kind] = [order, 'order'];
  else if (o.more) {
    const place = placeText(id);
    if (place) [extra, kind] = [place, 'place'];
  }
  // помета «выв.» года по порядку — в строке порядка, если она видна; иначе у самих лет
  const years = tipYears(id, { mark: !(kind === 'order' && c?.byOrder) });
  return { head: o.kin ? 'kin' : 'name', years, extra, kind };
}

function StarTip({ id, more, count }: { id: string; more: boolean; count?: { book: 'Мф' | 'Лк'; n: number } }) {
  const p = byId.get(id);
  if (!p) return null;
  // выбор второго лица «Родства»: первой строкой — кем лицо приходится первому (IX-22, IX-58); предложение — с имени
  const kin = kinPreview(id);
  const t = starTipLines(id, { more, count, kin: kin?.sentence });
  // родня выбранного (решение 151): вместо уточнения — кем приходится выбранному, теми же словами, что «Родство»
  const rel = t.head === 'kin' ? null : selectedKin(id);
  // третья строка — через 700 мс неподвижности (IX-58); «//» объясняет и само происхождение — он важнее строки родителей
  const origin = t.head === 'kin' || !more || t.kind === 'break' ? null : originLine(id);
  return (
    <>
      {t.head === 'kin' ? (
        <div class="kin">
          <b>{typo(kin!.sentence)}</b>
        </div>
      ) : rel ? (
        <>
          <b>{p.name}</b>
          {rel.dis && <span class="ds"> ({rel.dis})</span>}
          <span class="rel">{` — ${rel.text}`}</span>
        </>
      ) : (
        <>
          <b>{p.name}</b>
          {p.disambig && <span class="ds">, {p.disambig}</span>}
        </>
      )}
      {/* строка порядка уступила место строке происхождения — помета «выв.» года по порядку остаётся у самих лет (П-4) */}
      <div class="yr">{origin && t.kind === 'order' ? tipYears(id, { mark: true }) : t.years}</div>
      {origin && t.kind !== 'count' ? (
        <div class="ex" data-origin="">
          {origin}
        </div>
      ) : t.extra ? (
        <div class={t.kind === 'place' ? 'ds' : 'ex'}>{t.extra}</div>
      ) : null}
    </>
  );
}

/**
 * Строка происхождения в подсказке звезды (этап 15, решение 179): «Иаков и Рахиль — родители; Вениамин — сын» — когда
 * союз происхождения лица на небе (хотя бы один родитель нарисован в кадре): наведение на ребёнка зажигает его путь
 * (src/render/marks.ts, drawOriginPath), подсказка называет его словами связи (src/ui/linkwords.ts, linkTitle). Третьей
 * строкой, после имени и лет, как всякое пояснение — через 700 мс неподвижности; разрыв «//» важнее её (он говорит, что
 * родословие между родителем и лицом, вероятно, неполно), пояснение порядка или места — только когда строки происхождения
 * нет (подсказка звезды — не больше трёх строк, IX-58), счёт номера у бусины — всегда. Год, оценённый по порядку перечисления, без
 * своей строки несёт помету «выв.» у самих лет (П-4); место перечисления — в карточке.
 */
export function originLine(id: string): string | null {
  const u = mainUnion(ALL_UNIONS, id);
  const s = skyRef.current;
  if (!u || !s) return null;
  const onSky = [u.a, u.b].some((par) => {
    if (!par) return false;
    const i = s.indexOf(par);
    return i !== undefined && s.drawn(i) && !s.hides(par);
  });
  if (!onSky) return null;
  const t = linkTitle({ kind: 'child', union: u.id, child: id });
  return t ? typo(t) : null;
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
        if (!first) return;
        // loadRefVerses раскрывает и межглавные ссылки (решение 129)
        return loadRefVerses(first).then((rv) => {
          const text = (rv?.verses ?? [])
            .slice(0, 2)
            .map((x) => x.t)
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
  // годы — словарём дат (этап 13, решение 96; engine/years.ts): у царствований «ок.» нет, у границ эпох — по правилу 99
  if (b.kind === 'epoch') {
    const e = model.value.epochs.find((x) => x.id === b.id);
    return (
      <>
        <b>{b.label}</b>
        <div class="yr">{e ? typo(epochSpanText(e)) : ''}</div>
        <div class="ds">{typo('Щёлкните — небо покажет эпоху')}</div>
      </>
    );
  }
  if (b.kind === 'event') {
    return (
      <>
        <b>{typo(b.label)}</b>
        <div class="yr">
          {typo(dateText({ t: b.t0 }))}
          {b.refs?.length ? `; ${b.refs.map(refLabel).join('; ')}` : ''}
        </div>
      </>
    );
  }
  if (b.kind === 'sync') {
    // синхронизм, чей год лежит вне отрезка своего царя (решение 103): штрих у начала отрезка
    return (
      <>
        <b>{typo('Синхронизм текста вне принятых годов')}</b>
        <div>{typo(b.label)}</div>
      </>
    );
  }
  const p = byId.get(b.id);
  if (!p) return null;
  // отрезок короче года (служение Аарона перед фараоном, 1446) — один год; оценочные годы служения — «ок.»
  const approx = b.soft ? { approx: true } : {};
  const span = b.t1 - b.t0 < 1 ? dateText({ t: b.t0, ...approx }) : spanText({ t: b.t0, ...approx }, { t: b.t1, ...approx });
  const f = p.sex === 'f';
  // совместные годы словами (решение 103): «792–767 гг. до Р. Х. — вместе с отцом, Амасией»; «один — с 767 г. до Р. Х.»
  const together = reign
    ? b.shared.map(([s0, s1], k) => {
        const other = b.sharedWith?.[k];
        const q = other ? byId.get(other) : null;
        const ins = q ? nameCase(q.name, q.sex, 'ins') : null;
        const w = hatchWord(b.id, other);
        return `${spanText({ t: s0 }, { t: s1 })} — ${w}${q ? (ins ? `, ${ins}` : ` (${q.name})`) : ''}`;
      })
    : [];
  return (
    <>
      <b>{p.name}</b>
      {p.disambig && <span class="ds">, {p.disambig}</span>}
      {reign ? (
        <>
          <div class="yr">{typo(`${cap(b.over ?? '')}: ${span}, расч.`)}</div>
          {b.years ? <div>{typo(`${f ? 'Царствовала' : 'Царствовал'} ${yearsWord(b.years)}`)}</div> : null}
          {together.map((t) => (
            <div key={t}>{typo(t)}</div>
          ))}
          {b.sole !== undefined && <div>{typo(`${f ? 'одна' : 'один'} — с ${dateText({ t: b.sole })}`)}</div>}
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
