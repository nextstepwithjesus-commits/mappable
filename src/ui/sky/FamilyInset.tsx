/**
 * «Семья созвездием» — врезка семьи на небе (этап 16, решение 186; отчёт V2, docs/ui-review/stage16/v2.md).
 *
 * По образцу врезки тесного скопления в звёздных атласах (Тирион, Бечварж): врезка вырастает из места семьи на небе,
 * пунктирная рамка области и две выноски держат связь с местом и временем, подпись масштаба говорит, что шкалы
 * времени во врезке нет. Это часть неба, а не отдельный вид (решение 77): те же звёзды и знаки, тот же выбор лица,
 * карточка справа общая. Раскладка — src/engine/famplot.ts, отрисовка — src/render/family-inset.ts, состояние —
 * src/ui/sky/inset.ts (адрес, Shift + F, Escape, скопление «+N» и строку «Ближайшей родни» ведёт S).
 *
 *  — Широкий экран: врезка в видимой части неба, сбоку от области семьи; небо под ней гаснет, область видна.
 *  — Телефон: лист «Семья» на месте неба — гребень строками (супруга, под ней её дети), прокрутка пальцем.
 *  — Щелчок по звезде или имени — выбор лица (карточка справа); двойной щелчок, пыль внуков, «↑ дед» — семья этого лица
 *    в той же врезке; ромб и наведение — союз в фокусе, внизу — стих, где мать и её дети названы вместе.
 *  — Клавиатура: список лиц врезки в порядке чтения (скрыт от глаз), фокус — кольцом на холсте.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { byId, graph, lineMembership, loadVerses } from '../../data/atlas.ts';
import { familyScene, fanHeight, plotFamily, sourceBooks, sourceVerse, type FamScene, type FamUnion, type Hit, type Plot } from '../../engine/famplot.ts';
import { drawInsetBack, drawInsetFrame, drawPlot, insetMeasure, type InsetLook } from '../../render/family-inset.ts';
import { branchColor, KIN_GOLD, UNION_COLORS } from '../../render/branches.ts';
import { readPalette } from '../../render/sky.ts';
import { coarsePointer, FONT_SANS, mapSize } from '../../render/type.ts';
import { model, selected, theme } from '../../state.ts';
import { grid } from '../layout.ts';
import { plural, renderBrackets, skyRef, viewTick } from '../common.tsx';
import { halfSiblingsLabel, kinTermReverse, nameCase, otherParentLabel } from '../text/ru.ts';
import { typo } from '../text/typo.ts';
import { lifeText } from './text.ts';
import { reduced, screenOf } from './view.ts';
import { nearestFamily } from '../show.ts';
import { CHAPTERS, openChapter } from '../panels/Chapter.tsx';
import { closeFamilyInset, familyInset, hasFamily, openFamilyInset } from './inset.ts';
import { openSheetAt, sheetStop } from '../sheet.ts';
import { unions as unionsAll } from '../reveal.ts';
import { formatSpan } from '../../engine/years.ts';
import '../../styles/inset.css';

/** Переход «врезка вырастает из области неба», мс (ТЗ § 5.5: 300–500 мс). */
export const INSET_MS = 400;
const HEAD_H = 104;
const CARD_H = 76;
const PHONE_HEAD = 86;
const PHONE_CARD = 104;

type Box = { x: number; y: number; w: number; h: number };

/** Цвет ветви i — как на небе (решение 69). */
const branchHue = (i: number, th: 'night' | 'day') => branchColor(i, th);

const deps = () => {
  const chrono = model.peek().chrono;
  return {
    graph,
    unions: unionsRef(),
    year: (id: string) => {
      const c = chrono.get(id);
      return c ? { b: c.b, infant: !!c.infant } : null;
    },
    magnitude: (id: string) => byId.get(id)?.magnitude ?? 4,
    line: (id: string) => ({ mt: lineMembership.joseph.has(id), lk: lineMembership.mary.has(id) }),
    gen: (id: string) => {
      const p = byId.get(id);
      return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
    },
    kinReverse: (rel: string, sex: 'm' | 'f') => kinTermReverse(rel, sex),
  };
};
/** Союзы — те же, что у неба и карточек (src/ui/reveal.ts). */
const unionsRef = () => unionsAll;

const KIND_M = { wife: 'жена', concubine: 'наложница', levirate: 'по левирату', none: 'брак не назван' } as const;
const KIND_F = { wife: 'муж', concubine: 'союз: наложница', levirate: 'муж по левирату', none: 'брак не назван' } as const;

/** Заголовок врезки: «Семья Иакова» (склонение — ru.ts; ненадёжное — имя в начале). */
export function insetTitle(id: string): string {
  const p = byId.get(id)!;
  const g = nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt);
  return g ? `Семья ${g}` : `${p.name}: семья`;
}
/** Подзаголовок по данным: «12 сыновей и дочь Дина», «21 сын и дочь Фамарь», «8 сыновей». */
export function insetSubtitle(S: FamScene): string {
  const parts: string[] = [];
  if (S.sons) parts.push(`${S.sons} ${plural(S.sons, 'сын', 'сына', 'сыновей')}`);
  const d = S.daughters;
  if (d.length === 1) parts.push(`${S.sons ? '' : '1 '}дочь ${byId.get(d[0])!.name}`.trim());
  else if (d.length > 1) parts.push(`${d.length} ${plural(d.length, 'дочь', 'дочери', 'дочерей')}`);
  return parts.join(' и ');
}

/** Слово союза в карточке источника: «жена», «наложница», «мать не названа». */
function unionWord(u: FamUnion, female: boolean): string {
  if (!u.partner) return female ? 'отец не назван' : u.kids.length > 1 ? 'матери не названы' : 'мать не названа';
  return (female ? KIND_F : KIND_M)[u.kind];
}

/** Книги со стихами для карточки источника — загруженные (по требованию, src/data/atlas.ts, loadVerses). */
const books = new Map<string, Record<string, string>>();
const asked = new Set<string>();

export function FamilyInset() {
  const st = familyInset.value;
  void selected.value;
  const th = theme.value;
  const g = grid.value;
  void viewTick.value;
  void model.value;
  const cv = useRef<HTMLCanvasElement>(null);
  const [focusU, setFocusU] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [t, setT] = useState(1);
  const [booksTick, setBooksTick] = useState(0);
  const [scroll, setScroll] = useState(0);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const drag = useRef<{ y: number; s: number; moved: boolean } | null>(null);
  const center = st?.id ?? null;
  const scene = useMemo(() => (center ? familyScene(center, deps()) : null), [center, model.value]);

  // путь шагов внутри врезки: «Иаков › Иуда»; новое открытие — новый путь
  useEffect(() => {
    if (!st) return setTrail([]);
    setTrail((tr) => (st.from === 'step' ? (tr.includes(st.id) ? tr.slice(0, tr.indexOf(st.id) + 1) : [...tr, st.id]) : [st.id]));
    setFocusU(null);
    setScroll(0);
  }, [st?.id]);

  // выбор вне врезки (поиск, небо): лицо с семьёй становится центром врезки, без семьи — врезка закрывается
  useEffect(
    () =>
      effect(() => {
        const s = selected.value;
        const cur = familyInset.peek();
        if (!cur) return;
        if (!s) {
          closeFamilyInset();
          return;
        }
        if (s === cur.id || sceneHas(s)) return;
        if (!(hasFamily(s) && openFamilyInset(s, 'step'))) closeFamilyInset();
      }),
    [],
  );
  const sceneRef = useRef<FamScene | null>(null);
  sceneRef.current = scene;
  const sceneHas = (id: string) => !!sceneRef.current?.nodes.has(id);

  // телефон: нижний лист опускается до шапки (104 px) — лист «Семья» встаёт на место неба (решение 186)
  useEffect(() => {
    if (st && grid.peek().phone && sheetStop.peek() !== 'head') sheetStop.value = 'head';
  }, [st?.id]);

  // переход: врезка вырастает из области семьи (при ослабленном движении — сразу)
  useLayoutEffect(() => {
    if (!st) return;
    if (reduced() || st.from === 'address') return setT(1);
    let raf = 0;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / INSET_MS);
      setT(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setT(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [st?.id, !!st]);

  // стихи для карточки источника: книги ссылок союзов (загружаются по требованию)
  useEffect(() => {
    if (!scene) return;
    const need = new Set<string>();
    for (const u of scene.unions) for (const b of sourceBooks(u, refsOf)) if (!books.has(b) && !asked.has(b)) need.add(b);
    for (const b of need) {
      asked.add(b);
      loadVerses(b)
        .then((v) => {
          books.set(b, v);
          setBooksTick((x) => x + 1);
        })
        .catch(() => asked.delete(b));
    }
  }, [scene]);

  const sky = skyRef.current;
  const geo = useMemo(() => {
    if (!scene || !sky || !center) return null;
    const vp = sky.cam.vp;
    const vpBox: Box = { x: vp.l, y: vp.t, w: vp.r - vp.l, h: vp.b - vp.t };
    const phone = g.phone || vpBox.w < 540;
    // область семьи на небе: звёзды лиц врезки, которые сейчас в видимой части
    let region: Box | null = null;
    if (!phone) {
      const pts = [...scene.nodes.keys()].map((id) => screenOf(id)).filter((q): q is { x: number; y: number } => !!q && q.x > vp.l && q.x < vp.r && q.y > vp.t && q.y < vp.b);
      if (pts.length) {
        const x0 = Math.min(...pts.map((q) => q.x)) - 12;
        const x1 = Math.max(...pts.map((q) => q.x)) + 12;
        const y0 = Math.min(...pts.map((q) => q.y)) - 12;
        const y1 = Math.max(...pts.map((q) => q.y)) + 12;
        region = { x: x0, y: y0, w: Math.max(24, x1 - x0), h: Math.max(24, y1 - y0) };
      }
    }
    let R: Box;
    // телефон: лист «Семья» на месте неба — от верхнего края неба (линейка лет под ним не нужна) до шапки листа
    if (phone) R = { x: 0, y: 0, w: sky.cam.w, h: sky.cam.h };
    else {
      const rc = region ? region.x + region.w / 2 : vpBox.x;
      const right = rc < vpBox.x + vpBox.w / 2;
      // ширина — до 720 px, но область семьи на небе остаётся видна, если врезке хватает 600 px
      const room = region ? (right ? vpBox.x + vpBox.w - 14 - (region.x + region.w + 24) : region.x - 24 - (vpBox.x + 14)) : vpBox.w - 28;
      const W = Math.min(vpBox.w - 28, 720, Math.max(600, room));
      const x = right ? vpBox.x + vpBox.w - 14 - W : vpBox.x + 14;
      // полоса по высоте: видимая часть неба; строку показа вверху врезка не закрывает, если семье хватает места,
      // а кнопки масштаба внизу закрывает — врезка лежит поверх неба, пока открыта
      let top = vpBox.y + 12;
      const bottom = vpBox.y + vpBox.h - 12;
      const need = HEAD_H + fanHeight(scene) + CARD_H + 24;
      for (const o of organs()) {
        if (o.x > x + W || o.x + o.w < x || o.y + o.h / 2 > vpBox.y + vpBox.h / 2) continue;
        if (bottom - (o.y + o.h + 8) >= Math.min(need, 480)) top = Math.max(top, o.y + o.h + 8);
      }
      const H = Math.min(bottom - top, HEAD_H + fanHeight(scene) + CARD_H + 24);
      R = { x, y: top + (bottom - top - H) / 2, w: W, h: H };
      // область под врезкой — без рамки и выносок
      if (region && region.x < R.x + R.w && region.x + region.w > R.x && region.y < R.y + R.h && region.y + region.h > R.y) region = null;
    }
    return { vp: vpBox, R, region, phone };
  }, [scene, sky, center, g.phone, viewTick.value]);

  const coarse = coarsePointer();
  const plot = useMemo<Plot | null>(() => {
    if (!scene || !geo) return null;
    const ctx = measureCtx();
    if (!ctx) return null;
    const measure = insetMeasure(ctx, coarse);
    const R = geo.R;
    const female = byId.get(scene.focal.id)?.sex === 'f';
    const head = geo.phone ? PHONE_HEAD : HEAD_H;
    const card = geo.phone ? PHONE_CARD : CARD_H;
    const fu = focusU && scene.unions.some((u) => u.id === focusU) ? focusU : null;
    return plotFamily(scene, {
      x: R.x + (geo.phone ? 16 : 22),
      y: R.y + head,
      w: R.w - (geo.phone ? 32 : 44),
      h: R.h - head - card - 18,
      comb: geo.phone,
      scale: geo.phone ? 1.15 : 1.35,
      measure,
      focus: fu,
      words: {
        kind: (k) => (female ? KIND_F : KIND_M)[k],
        motherUnnamed: (n) => (female ? 'отец не назван' : n > 1 ? 'матери не названы' : 'мать не названа'),
        innerWord: (_kid, wife, kind) => {
          if (kind === 'levirate') return 'по левирату';
          const w = byId.get(wife);
          const gn = w ? nameCase(w.name, w.sex, 'gen', w.unnamed, w.alt) : null;
          return gn ? `муж ${gn}` : 'муж';
        },
        halves: (sexes) => halfSiblingsLabel('paternal', sexes),
        sibs: (sexes) => (sexes.length === 1 ? (sexes[0] === 'f' ? 'сестра' : 'брат') : sexes.every((x) => x === 'm') ? 'братья' : 'братья и сёстры'),
        up: (id) => `↑ ${byId.get(id)?.name ?? ''}`,
        other: (claim) => otherParentLabel(claim, 'father').toLowerCase(),
      },
    });
  }, [scene, geo, focusU, coarse, th]);

  const look = useMemo<InsetLook | null>(() => {
    if (typeof document === 'undefined') return null;
    const pal = readPalette();
    return {
      night: th === 'night', sky: pal.sky, deep: pal.band, ink: pal.ink, ink2: pal.ink2, ink3: pal.ink3, kin: KIN_GOLD[th],
      mt: [pal.gold1, pal.gold2], lk: [pal.azure1, pal.azure2], husband: UNION_COLORS[th].husband, wife: UNION_COLORS[th].wife,
      branch: (i) => branchHue(i, th), coarse,
    };
  }, [th, coarse]);

  // рисование: погашенное небо, рамка области, врезка (во время перехода — в промежуточном прямоугольнике)
  useLayoutEffect(() => {
    const c = cv.current;
    if (!c || !geo || !plot || !look || !sky) return;
    const dpr = window.devicePixelRatio || 1;
    const W = sky.cam.w;
    const H = sky.cam.h;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const e = 1 - (1 - t) ** 3;
    drawInsetFrame(ctx, look, { sky: geo.vp, region: geo.region, inset: geo.R, t: geo.phone ? 1 : e, sheet: geo.phone });
    const R = geo.R;
    const from = geo.region ?? { x: R.x + R.w / 2 - 20, y: R.y + R.h / 2 - 20, w: 40, h: 40 };
    const T = geo.phone || e >= 1 ? R : { x: from.x + (R.x - from.x) * e, y: from.y + (R.y - from.y) * e, w: from.w + (R.w - from.w) * e, h: from.h + (R.h - from.h) * e };
    ctx.save();
    if (T !== R) {
      const kx = T.w / R.w;
      const ky = T.h / R.h;
      ctx.setTransform(dpr * kx, 0, 0, dpr * ky, dpr * (T.x - R.x * kx), dpr * (T.y - R.y * ky));
      ctx.globalAlpha = 0.4 + 0.6 * e;
    }
    drawInsetBack(ctx, look, R, geo.phone);
    const head = geo.phone ? PHONE_HEAD : HEAD_H;
    const card = geo.phone ? PHONE_CARD : CARD_H;
    ctx.beginPath();
    ctx.rect(R.x, R.y + head - 30, R.w, R.h - head + 30 - card - 6);
    ctx.clip();
    if (scroll) ctx.translate(0, -scroll);
    drawPlot(ctx, plot, look, focusId, hover);
    ctx.restore();
    if (!geo.phone && e >= 1 && scene) drawBirths(ctx, look, scene, R, `${byId.get(scene.focal.id)?.name}: ${lifeText(scene.focal.id)}`);
  });

  // без открытой врезки — ничего в разметке: холст неба под .sky один (приёмка ищет .sky canvas); холст врезки —
  // в своей обёртке и только пока врезка открыта
  if (!st || !scene || !center) return null;
  const female = byId.get(center)?.sex === 'f';
  const R = geo?.R;
  const fu = (focusU && scene.unions.find((u) => u.id === focusU)) || scene.unions.find((u) => u.kids.length) || null;
  const src = fu ? sourceOf(fu, female) : null;
  void booksTick;
  const title = insetTitle(center);
  const sub = insetSubtitle(scene);
  const maxScroll = plot && R && geo ? Math.max(0, plot.bottom - (R.y + R.h - (geo.phone ? PHONE_CARD : CARD_H) - 12)) : 0;

  const pick = (x: number, y: number): Hit | null => {
    if (!plot) return null;
    const yy = y + scroll;
    let best: Hit | null = null;
    let bd = Infinity;
    for (const h of plot.hits) {
      if (h.kind === 'person' || h.kind === 'union') {
        const d = Math.hypot(h.x - x, h.y - yy);
        if (d <= h.r && d < bd) {
          bd = d;
          best = h;
        }
      } else if (x >= h.x && x <= h.x + h.w && yy >= h.y && yy <= h.y + h.h && bd > 0) {
        best = h;
        bd = 0.5;
      }
    }
    return best;
  };
  const local = (ev: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const unionOf = (id: string) => plot?.order.find((o) => o.id === id)?.uid ?? null;
  const step = (id: string) => {
    if (id !== center) openFamilyInset(id, 'step');
  };
  const onMove = (ev: PointerEvent) => {
    if (drag.current) {
      const dy = drag.current.y - ev.clientY;
      if (Math.abs(dy) > 4) drag.current.moved = true;
      setScroll(Math.max(0, Math.min(maxScroll, drag.current.s + dy)));
      return;
    }
    const q = local(ev);
    const h = pick(q.x, q.y);
    const id = h && (h.kind === 'person' || h.kind === 'name') ? h.id : null;
    if (id !== hover) setHover(id);
    const uid = h?.kind === 'union' ? h.uid : id ? unionOf(id) : null;
    if (uid && uid !== focusU) setFocusU(uid);
    (ev.currentTarget as HTMLElement).style.cursor = h ? 'pointer' : '';
  };
  const onClick = (ev: MouseEvent) => {
    if (drag.current?.moved) return;
    const q = local(ev);
    const h = pick(q.x, q.y);
    if (!h) return;
    if (h.kind === 'union') return setFocusU(h.uid);
    if (h.kind === 'dust' || h.kind === 'up') return step(h.id);
    const now = performance.now();
    const twice = lastTap.current && lastTap.current.id === h.id && now - lastTap.current.at < 450;
    lastTap.current = { id: h.id, at: now };
    if (twice) return step(h.id);
    if (selected.peek() !== h.id) {
      // на телефоне выбор во врезке оставляет лист на шапке: иначе он поднялся бы на 55 % и закрыл семью
      if (geo?.phone) openSheetAt('head');
      selected.value = h.id;
    }
    const uid = unionOf(h.id);
    if (uid) setFocusU(uid);
  };

  const ordered = plot?.order ?? [];
  const rowLabel = (o: { id: string; ring: string; uid?: string }) => {
    const p = byId.get(o.id)!;
    const u = o.uid ? scene.unions.find((x) => x.id === o.uid) : undefined;
    switch (o.ring) {
      case 'father':
        return `${p.name}, отец`;
      case 'mother':
        return `${p.name}, мать`;
      case 'focal':
        return `${p.name}: ${sub || 'семья'}`;
      case 'partner':
        return `${p.name}, ${u ? unionWord(u, female) : ''}; детей: ${u?.kids.length ?? 0}`;
      case 'kid': {
        const m = u?.partner ? byId.get(u.partner)?.name : null;
        return m ? `${p.name}; ${female ? 'отец' : 'мать'} — ${m}` : p.name;
      }
      case 'sib':
        return `${p.name}, ${p.sex === 'f' ? 'сестра' : 'брат'}`;
      default:
        return p.name;
    }
  };

  return (
    <div class="fam-layer">
      <canvas ref={cv} class="fam-cv" aria-hidden="true" />
      {R && (
        <section
          class={`fam-inset${geo?.phone ? ' fam-sheet' : ''}${t < 0.7 ? ' fam-grow' : ''}`}
          style={{ left: `${R.x}px`, top: `${R.y}px`, width: `${R.w}px`, height: `${R.h}px` }}
          aria-label={`${title} — врезка без шкалы времени`}
          data-family={center}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(ev) => {
            if (maxScroll && ev.pointerType !== 'mouse') drag.current = { y: ev.clientY, s: scroll, moved: false };
          }}
          onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
          onWheel={(ev) => {
            // колесо над врезкой не масштабирует небо под ней; длинная семья прокручивается
            ev.preventDefault();
            if (!maxScroll) return;
            setScroll((s) => Math.max(0, Math.min(maxScroll, s + ev.deltaY)));
          }}
          onClick={onClick}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape' && closeFamilyInset()) {
              ev.preventDefault();
              ev.stopPropagation();
            }
          }}
        >
          <header class="fi-head">
            {trail.length > 1 && (
              <nav class="fi-trail" aria-label="Шаги во врезке">
                {trail.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ' › '}
                    {id === center ? <span aria-current="true">{byId.get(id)?.name}</span> : <button type="button" onClick={() => openFamilyInset(id, 'step')}>{byId.get(id)?.name}</button>}
                  </span>
                ))}
              </nav>
            )}
            <h2 class="fi-title">{title}</h2>
            {sub && <p class="fi-sub">{sub}</p>}
            <div class="fi-cmds">
              <button
                type="button"
                onClick={() => {
                  closeFamilyInset();
                  nearestFamily(center);
                }}
                title="Ближайшая родня на небе по времени"
              >
                По времени
              </button>
              {!geo?.phone && (
                <button type="button" onClick={() => closeFamilyInset()} title="Закрыть врезку (Escape)">
                  Закрыть
                </button>
              )}
            </div>
            {!geo?.phone && <p class="fi-scale">врезка без шкалы времени: дети по порядку рождения сверху вниз</p>}
          </header>
          <ul class="visually-hidden" aria-label={typo(`${title}: лица врезки по порядку`)}>
            {ordered.map((o) => (
              <li key={`${o.ring}:${o.id}`}>
                <button
                  type="button"
                  onFocus={() => {
                    setFocusId(o.id);
                    if (o.uid) setFocusU(o.uid);
                  }}
                  onBlur={() => setFocusId((f) => (f === o.id ? null : f))}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (selected.peek() !== o.id) selected.value = o.id;
                  }}
                >
                  {typo(rowLabel(o))}
                </button>
                {o.id !== center && o.ring !== 'focal' && hasFamily(o.id) && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      step(o.id);
                    }}
                  >
                    {typo(insetTitle(o.id))}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {fu && (
            <footer class="fi-src" style={{ '--fi-sw': fu.branch === null ? 'var(--ink-3)' : branchHue(fu.branch, th) }}>
              <div class="fi-who">
                <span class="fi-nm">{fu.partner ? byId.get(fu.partner)?.name : unionWord(fu, female)}</span>
                {fu.partner && <span class="fi-kind">{unionWord(fu, female)}</span>}
                <span class="fi-kind">{`${fu.kids.length} ${plural(fu.kids.length, 'ребёнок', 'ребёнка', 'детей')}`}</span>
              </div>
              <div class="fi-verse">
                {src ? (
                  <>
                    <span class="fi-ref">{src.ref.replace(/^([1-4])([А-Я])/, '$1 $2')}</span>
                    <q class="fi-q">{renderBrackets(typo(src.text))}</q>
                  </>
                ) : (
                  <span class="fi-ref">{fu.refs.map((r) => r.replace(/^([1-4])([А-Я])/, '$1 $2')).join('; ')}</span>
                )}
              </div>
              {src && CHAPTERS.includes(`${src.book} ${src.ch}`) && (
                <button type="button" class="fi-read" onClick={() => openChapter(`${src.book} ${src.ch}`)}>
                  Читать главу
                </button>
              )}
            </footer>
          )}
          <div class="visually-hidden" aria-live="polite">
            {typo(`${title}${sub ? `: ${sub}` : ''}. ${byId.get(center)?.name}: ${lifeText(center)}. Врезка без шкалы времени.`)}
          </div>
        </section>
      )}
    </div>
  );
}

/** Органы неба, которые врезка не закрывает: строка показа и кнопки масштаба — прямоугольники в координатах неба. */
function organs(): Box[] {
  const sky = typeof document === 'undefined' ? null : document.querySelector('.sky');
  if (!sky) return [];
  const base = sky.getBoundingClientRect();
  return [...sky.querySelectorAll<HTMLElement>('.showbar')].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }).filter((r) => r.w > 0 && r.h > 0);
}

/** Холст для мерки строк раскладки (вне разметки: раскладка не ждёт монтирования холста врезки). */
let mctx: CanvasRenderingContext2D | null = null;
const measureCtx = () => (mctx ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d'));

const refsOf = (id: string) => byId.get(id)?.parentRefs ?? [];
const namesOf = (id: string) => {
  const p = byId.get(id);
  return p ? [p.name, ...(p.alt ?? [])] : [];
};

/** Стих источника союза: мать и её дети названы вместе (решение 186). */
function sourceOf(u: FamUnion, female: boolean) {
  const mother = female ? null : u.partner;
  return sourceVerse(
    { refs: u.refs, kids: u.kids, mother },
    refsOf,
    namesOf,
    (book, ch, v) => books.get(book)?.[`${ch}:${v}`],
    (book, ch) => CHAPTERS.includes(`${book} ${ch}`),
  );
}

/**
 * Мини-шкала рождений детей (расч.) — строка шапки под годами лица: «дети: ——•—••—— ок. 1922–1909 гг. до Р. Х., расч.»;
 * точка — ребёнок, цвет — ветвь, одинаковый год — стопкой. Связь врезки со временем: видно, как чередовались матери
 * (Быт 29–30).
 */
function drawBirths(ctx: CanvasRenderingContext2D, L: InsetLook, S: FamScene, R: Box, life: string) {
  ctx.save();
  ctx.font = `400 ${mapSize(12, L.coarse)}px ${FONT_SANS}`;
  ctx.fillStyle = L.ink3;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const ay = R.y + 88;
  const lifeLine = life.replace(/\u2060/g, '');
  ctx.fillText(lifeLine, R.x + 22, ay + 4);
  const bs = S.births.filter((b): b is { id: string; b: number; branch: number | null } => b.b !== null);
  const b0 = Math.min(...bs.map((b) => b.b));
  const b1 = Math.max(...bs.map((b) => b.b));
  if (bs.length < 2 || b1 === b0) return ctx.restore();
  const lead = 'дети:';
  const lx = R.x + 22 + ctx.measureText(lifeLine).width + 18;
  ctx.fillText(lead, lx, ay + 4);
  const ax = lx + ctx.measureText(lead).width + 8;
  const aw = 110;
  const X = (b: number) => ax + ((b - b0) / (b1 - b0)) * aw;
  ctx.fillText(`${formatSpan(b0, b1, true)}, расч.`.replace(/\u2060/g, ''), ax + aw + 10, ay + 4);
  ctx.strokeStyle = L.ink3;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + aw, ay);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const stack = new Map<number, number>();
  for (const b of bs) {
    const k = Math.round(X(b.b));
    const n = stack.get(k) ?? 0;
    stack.set(k, n + 1);
    ctx.fillStyle = b.branch === null ? L.ink3 : L.branch(b.branch);
    ctx.beginPath();
    ctx.arc(X(b.b), ay - 3.5 - n * 3.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
