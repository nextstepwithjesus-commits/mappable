import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { FRAME_H, Sky, readPalette, type Rect, type SkyState } from '../render/sky.ts';
import { byId, graph } from '../data/atlas.ts';
import {
  selected, second, first, hovered, focused, lambda, model, layers, onlyLines, meridian, panel, pickMode, theme, introDone, epochMode, lineFlip, pins,
  kinPath,
} from '../state.ts';
import { skyRef, viewTick, goTo } from './common.tsx';
import { drawTiers, tiersBottom } from '../render/tiers.ts';
import { typo } from './text/typo.ts';
import { lifeText, placeText } from './sky/text.ts';
import { flightTarget, flyToPerson, inView, introOpen, keepInView, reduced, screenOf, setReserve, stopFlight } from './sky/view.ts';
import { attachPointer, type Tip } from './sky/input.ts';
import { COLUMN_BELOW, SkyColumn, SkyControls, ViewSheet } from './sky/Controls.tsx';
import { CARTOUCHE_BESIDE, Cartouche, GuideCommand, PickBar } from './sky/Overlays.tsx';

/**
 * Путь родства, который сейчас можно показать: он идёт от первого лица пары ко второму.
 * Прежний путь другой пары не показывается никогда (MAP-19).
 */
export function pairPath(): string[] | null {
  const b = second.value;
  const path = kinPath.current;
  if (!b || !path || path.length < 2 || path[path.length - 1] !== b) return null;
  const a = first.value ?? selected.value;
  return path[0] === a || path[0] === selected.value ? path : null;
}

function highlightFor(id: string | null, path: string[] | null): Map<string, 'self' | 'anc' | 'desc' | 'path'> | null {
  if (!id) return null;
  const m = new Map<string, 'self' | 'anc' | 'desc' | 'path'>();
  if (path) {
    for (const p of path) m.set(p, 'path');
    m.set(path[0], 'self');
    m.set(path[path.length - 1], 'self');
    m.set(id, 'self');
    return m;
  }
  m.set(id, 'self');
  const up = [id];
  while (up.length) {
    const x = up.pop()!;
    for (const e of graph.parentsOf.get(x) ?? []) if (!m.has(e.parent)) { m.set(e.parent, 'anc'); up.push(e.parent); }
  }
  const down = [id];
  while (down.length) {
    const x = down.pop()!;
    for (const e of graph.childrenOf.get(x) ?? []) if (!m.has(e.child)) { m.set(e.child, 'desc'); down.push(e.child); }
  }
  for (const s of graph.spousesOf.get(id) ?? []) m.set(s.a === id ? s.b : s.a, 'path');
  return m;
}

export function SkyView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [announce, setAnnounce] = useState('');
  const [skyW, setSkyW] = useState(0);
  const shownPath = useRef('');
  const column = skyW > 0 && skyW < COLUMN_BELOW;
  /** Прямоугольники неба под органами управления и вступлением (C6): подписи и указатели под ними не рисуются. */
  const reserveRef = useRef<Rect[]>([]);
  /** Замерить резерв и поля видимой части после отрисовки органов неба и вступления (animate — вписать небо плавно). */
  const layoutRef = useRef<(animate: boolean) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sky = new Sky(canvas);
    skyRef.current = sky;
    let dirty = true;
    let raf = 0;
    let introStart = introDone.value || reduced() ? -1 : performance.now();
    let flowStart = 0;
    let morph: { from: number; to: number; start: number; anchor: Anchor } | null = null;
    let shownLambda = lambda.value;
    let tensionPersons = new Set<string>();

    const tensions = () => {
      tensionPersons = new Set(model.value.tensions.flatMap((t) => (t.persons.length <= 3 ? t.persons : [t.persons[0], t.persons[t.persons.length - 1]])));
    };
    tensions();

    // ---------- привязка при смене масштаба времени и модели (D15; ТЗ § 11.2 п. 6; IX-35) ----------
    /** Что держать на месте: выбранное лицо, если его звезда в видимой части, иначе год в середине видимой части. */
    type Anchor = { id: string | null; sx: number; t: number };
    const anchorNow = (): Anchor => {
      const id = selected.peek();
      const vp = sky.cam.vp;
      const q = id ? screenOf(id) : null;
      if (id && q && q.x >= vp.l && q.x <= vp.r && q.y >= vp.t && q.y <= vp.b) return { id, sx: q.x, t: 0 };
      const [cx] = sky.cam.vpCenter();
      return { id: null, sx: cx, t: sky.tOf(sky.cam.wx(cx)) };
    };
    const holdAnchor = (a: Anchor) => {
      const x = a.id ? sky.nodeX(a.id) : sky.xOf(a.t);
      if (x !== null) sky.cam.x0 = x - a.sx / sky.cam.kx;
    };

    const frame = () => {
      raf = 0;
      const now = performance.now();
      let again = false;
      if (morph) {
        const t = Math.min(1, (now - morph.start) / 450);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        shownLambda = morph.from + (morph.to - morph.from) * e;
        sky.setModel(model.value, shownLambda);
        holdAnchor(morph.anchor);
        if (t >= 1) {
          // лицо остаётся на месте, даже если окно теперь выходит за край данных: вернёт его первый же сдвиг (упор)
          if (!morph.anchor.id) sky.cam.clampNow();
          morph = null;
        } else again = true;
      }
      let intro = 1;
      if (introStart > 0) {
        intro = Math.min(1, (now - introStart) / 1200);
        if (intro < 1) again = true;
        else introStart = -1;
      }
      const flowing = flowStart > 0 && now - flowStart < 3000;
      if (flowing) again = true;
      const path = pairPath();
      let highlight = highlightFor(selected.value, path);
      // какой путь родства светится на небе — для проверок приёмки (tools/accept.ts)
      const pathKey = path && selected.value ? path.join(' ') : '';
      if (pathKey !== shownPath.current) {
        shownPath.current = pathKey;
        if (pathKey) wrap.current!.dataset.kinPath = pathKey;
        else delete wrap.current!.dataset.kinPath;
      }
      if (!highlight && meridian.value !== null) {
        // меридиан года: светятся все, кто жив в этот год
        const t = meridian.value;
        highlight = new Map();
        for (const [pid, c] of model.value.chrono) {
          if (c.cls === 'epochal') continue;
          const end = c.d ?? c.dEst;
          if (c.b <= t && t <= end) highlight.set(pid, c.d !== null || (c.last !== null && c.last >= t) ? 'path' : 'desc');
        }
      }
      const state: SkyState = {
        model: model.value, lambda: shownLambda, selected: selected.value, second: second.value, hovered: hovered.value, focus: focused.value,
        highlight, layers: layers.value, onlyLines: onlyLines.value, meridian: meridian.value,
        tensionPersons, flow: flowing ? now - flowStart : 0, reduced: reduced(), intro, lineFlip: lineFlip.value, pins: new Set(pins.value),
        reserve: reserveRef.current,
      };
      sky.draw(state);
      if (epochMode.value) drawTiers(sky, state);
      input.watchCamera(`${shownLambda} ${model.value.id}`);
      // окно неба — для проверок приёмки (tools/accept/layout.ts): видимая часть, годы и полосы по её краям
      const vp = sky.cam.vp;
      wrap.current!.dataset.view = [vp.l, vp.t, vp.r, vp.b, sky.cam.x0, sky.cam.kx, sky.cam.laneTop, sky.cam.ky].map((v) => +v.toFixed(4)).join(' ');
      // где звезда выбранного лица (px холста) — «выбранное лицо видно» проверяется по ней
      const sel = selected.value ? screenOf(selected.value) : null;
      if (sel) wrap.current!.dataset.sel = `${sel.x.toFixed(1)} ${sel.y.toFixed(1)}`;
      else delete wrap.current!.dataset.sel;
      // метка первого кадра неба — для замера «первого показа» (NFR-1, tools/perf.ts)
      if (!performance.getEntriesByName('sky-first-frame').length) performance.mark('sky-first-frame');
      viewTick.value++;
      if (again) request();
      dirty = false;
    };
    const request = () => {
      dirty = true;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    skyRef.redraw = request;
    sky.cam.onChange = request;

    // ---------- видимая часть неба (C1, D2, D3) ----------
    /**
     * Поля видимой части: сверху — рамка или ярусы эпох; снизу — нижний лист карточки на телефоне; слева или снизу —
     * открытое вступление, чтобы «всё небо» и начало лент не лежали под ним (C5; VIS-24, UX-04); справа — колонка кнопок.
     */
    const insets = () => {
      const box = wrap.current!.getBoundingClientRect();
      let bottom = 0;
      let left = 0;
      const sheet = document.querySelector<HTMLElement>('.folio:not([hidden])');
      if (sheet && getComputedStyle(sheet).position === 'fixed') bottom = Math.max(0, box.bottom - sheet.getBoundingClientRect().top);
      const cart = wrap.current!.querySelector<HTMLElement>('.cartouche');
      if (cart) {
        const c = cart.getBoundingClientRect();
        if (c.width > box.width * 0.6) bottom = Math.max(bottom, box.bottom - c.top + 8);
        else left = Math.max(0, c.right - box.left + 16 - sky.letterW);
      }
      // колонка кнопок узкого неба — полоса справа: иначе конец лент (Иисус Христос) на «всём небе» лежал бы под ней (MOB-01)
      const col = wrap.current!.querySelector<HTMLElement>('.skyctl.column');
      const right = col ? Math.max(0, box.right - col.getBoundingClientRect().left + 4) : 0;
      return { top: epochMode.peek() ? tiersBottom(model.value) : FRAME_H, bottom: Math.min(bottom, box.height - FRAME_H - 80), left, right };
    };
    /** Что было до смены видимой части: камера на «всём небе»? выбранное лицо видно? */
    const snapshot = () => {
      const id = selected.peek();
      return { wasFit: !!sky.model && sky.atFit(), sel: id && inView(id) ? id : null };
    };
    /** После смены видимой части: перелёт пересчитывается, «всё небо» вписывается заново, выбранное лицо остаётся видным. */
    const afterViewport = (before: { wasFit: boolean; sel: string | null }, animate: boolean) => {
      if (sky.cam.moving && flightTarget) {
        flyToPerson(flightTarget);
        return;
      }
      if (before.wasFit) {
        if (animate) sky.cam.flyTo(sky.fitState(), request, reduced());
        else sky.fitAll();
        request();
        return;
      }
      if (!sky.cam.moving) sky.cam.clampNow();
      if (before.sel) keepInView(before.sel);
      request();
    };
    const applyInsets = (animate: boolean) => {
      if (!sky.model || !last.w) return;
      const before = snapshot();
      if (sky.setInsets(insets())) afterViewport(before, animate);
    };

    let last = { left: 0, w: 0, h: 0 };
    /** Размер холста: при сетке [панель][небо][карточка] он меняется, когда открываются панель и карточка. */
    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      if (r.width === last.w && r.height === last.h && r.left === last.left) return;
      const first = last.w === 0;
      const before = first ? null : snapshot();
      const dL = first ? 0 : r.left - last.left;
      last = { left: r.left, w: r.width, h: r.height };
      setSkyW(r.width);
      sky.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1)); // выше 2× разница не видна, а заливка втрое дороже
      sky.setModel(model.value, shownLambda);
      sky.setInsets(insets());
      if (first) {
        sky.fitAll();
        request();
        return;
      }
      // левый край неба сдвинулся (панель открылась или закрылась): небо на экране стоит на месте
      if (dL && !sky.cam.moving) sky.cam.x0 += dL / sky.cam.kx;
      afterViewport(before!, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    resize();
    // нижний лист карточки на телефоне меняет высоту — видимая часть неба тоже
    const folioRO = new ResizeObserver(() => applyInsets(false));
    const folioEl = document.querySelector('.folio');
    if (folioEl) folioRO.observe(folioEl);

    // резерв органов неба и вступления: их прямоугольники и поля видимой части — после каждой их перерисовки
    const reserveRO = new ResizeObserver(() => measure(false));
    const watched = new Set<Element>();
    const measure = (animate: boolean) => {
      const box = wrap.current!.getBoundingClientRect();
      const out: Rect[] = [];
      // выбранное лицо было видно, а новый лист («Вид», вступление) лёг на него — небо сдвигается (принцип 2)
      const sel = selected.peek();
      const selWas = !!sel && !!sky.model && inView(sel);
      const els = [...wrap.current!.querySelectorAll<HTMLElement>('[data-reserve]')];
      for (const el of watched) if (!els.includes(el as HTMLElement)) {
        reserveRO.unobserve(el);
        watched.delete(el);
      }
      for (const el of els) {
        if (!watched.has(el)) {
          watched.add(el);
          reserveRO.observe(el);
        }
        const b = el.getBoundingClientRect();
        if (b.width && b.height) out.push({ x: b.left - box.left, y: b.top - box.top, w: b.width, h: b.height });
      }
      reserveRef.current = out;
      setReserve(out);
      applyInsets(animate);
      if (sel && selWas && !sky.cam.moving && !inView(sel)) keepInView(sel);
      request();
    };
    layoutRef.current = measure;

    // лист карточки на телефоне появляется после отрисовки выбора — размеры берутся в следующем кадре
    skyRef.flyTo = (id: string) =>
      requestAnimationFrame(() => {
        resize();
        sky.setInsets(insets());
        flyToPerson(id);
      });

    // любое нажатие на холсте прерывает перелёт (D4; IX-11); пока указатель нажат, небо у края данных не возвращается
    const onDown = () => {
      stopFlight();
      sky.cam.hold(true);
    };
    const onUp = () => sky.cam.hold(false);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // смена темы — новая палитра
    const offTheme = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        sky.pal = readPalette();
        request();
      });
    });
    // смена модели хронологии: выбранное лицо остаётся на месте
    let shownModel = model.peek();
    const offModel = effect(() => {
      const m = model.value;
      tensions();
      if (m === shownModel) return;
      shownModel = m;
      const a = anchorNow();
      sky.setModel(m, shownLambda);
      holdAnchor(a);
      if (!a.id) sky.cam.clampNow();
      request();
    });
    const offLambda = effect(() => {
      const to = lambda.value;
      if (to === shownLambda) return;
      const anchor = anchorNow();
      if (reduced()) {
        shownLambda = to;
        sky.setModel(model.value, to);
        holdAnchor(anchor);
        if (!anchor.id) sky.cam.clampNow();
        request();
        return;
      }
      morph = { from: shownLambda, to, start: performance.now(), anchor };
      request();
    });
    let lastSel = selected.peek();
    const offSel = effect(() => {
      const id = selected.value;
      void second.value;
      void layers.value;
      void onlyLines.value;
      void meridian.value;
      void hovered.value;
      void focused.value;
      void first.value;
      void lineFlip.value;
      void pins.value;
      if (id && id !== lastSel) {
        // выбор лица — явное действие: вступление сворачивается в «Как читать карту» (C5)
        introDone.value = true;
        introOpen.value = false;
        const p = byId.get(id)!;
        setAnnounce(typo([`${p.name}${p.disambig ? `, ${p.disambig}` : ''}`, lifeText(id), placeText(id)].filter(Boolean).join('; ')));
      }
      lastSel = id;
      request();
    });
    // ярусы эпох сдвигают верх видимой части: выбранное лицо остаётся видным, «всё небо» вписывается под ярусы
    const offTiers = effect(() => {
      void epochMode.value;
      requestAnimationFrame(() => applyInsets(true));
    });
    const offLines = effect(() => {
      if (onlyLines.value) flowStart = performance.now();
      request();
    });

    const input = attachPointer(sky, canvas, request, setTip);

    return () => {
      ro.disconnect();
      folioRO.disconnect();
      reserveRO.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      offTheme();
      offModel();
      offLambda();
      offSel();
      offLines();
      offTiers();
      input.dispose();
      if (raf) cancelAnimationFrame(raf);
      void dirty;
    };
  }, []);

  // органы неба и вступление перерисованы — замерить резерв; вступление свернули или открыли — вписать небо плавно
  const intro = introOpen.value;
  const firstLayout = useRef(true);
  const lastIntro = useRef(intro);
  useLayoutEffect(() => {
    const animate = !firstLayout.current && lastIntro.current !== intro;
    firstLayout.current = false;
    lastIntro.current = intro;
    layoutRef.current(animate);
  }, [column, intro, skyW, column && panel.value === 'view']);



  // лист «Вид» — только у колонки: если небо стало шире (поворот, закрытая карточка), лист закрывается, органы снова в блоке
  useEffect(() => {
    if (!column && panel.value === 'view') panel.value = null;
  }, [column]);

  const tipPerson = tip ? byId.get(tip.id) : null;
  const visibleForSR = (() => {
    void viewTick.value;
    const sky = skyRef.current;
    if (!sky || !sky.model) return [];
    const out: string[] = [];
    // только то, что видно и доступно указателю: без скрытых режимом «только линии» и закрытых ярусами эпох
    for (let i = 0; i < sky.nodes.length && out.length < 40; i++) {
      const n = sky.nodes[i];
      if (n.ghost) continue;
      const p = byId.get(n.person)!;
      if (p.magnitude > 2) continue;
      if (sky.reachable(i)) out.push(n.person);
    }
    // пункт с фокусом остаётся в списке, пока его звезда на виду: иначе фокус клавиатуры ушёл бы в никуда
    const f = focused.value;
    if (f && !out.includes(f) && sky.reachable(f)) out.push(f);
    return out;
  })();

  return (
    <>
      {/* data-tiers — включены ли ярусы эпох: для проверок приёмки (tools/accept.ts) */}
      <div class="sky" ref={wrap} data-tiers={epochMode.value ? 'on' : undefined}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Звёздная карта родословий. Стрелки — сдвиг, плюс и минус — масштаб, квадратные скобки — к родителю и к ребёнку."
          class={pickMode.value ? 'picking' : ''}
        />
        {pickMode.value && selected.value && <PickBar mode={pickMode.value} id={selected.value} />}
        {tipPerson && tip && (
          <div class="tip" style={{ left: `${Math.min(tip.x + 14, (skyRef.current?.cam.w ?? 800) - 330)}px`, top: `${tip.y + 16}px` }}>
            <b>{tipPerson.name}</b>
            {tipPerson.disambig && <span class="ds">, {tipPerson.disambig}</span>}
            <div class="yr">{lifeText(tipPerson.id)}</div>
            <div class="ds">{placeText(tipPerson.id)}</div>
          </div>
        )}
        {/* до первого замера ширина неба неизвестна: органы появляются сразу в своём виде, без мелькания блока на телефоне */}
        {skyW > 0 && (column ? <SkyColumn /> : <SkyControls />)}
        {skyW > 0 && (intro ? <Cartouche high={!column && skyW < CARTOUCHE_BESIDE} /> : <GuideCommand high={!column && skyW < CARTOUCHE_BESIDE} />)}
        <ul class="visually-hidden" aria-label="Видимые на карте ключевые лица">
          {visibleForSR.map((id) => (
            <li key={id}>
              <button
                onClick={() => {
                  goTo(id);
                }}
                onFocus={() => (focused.value = id)}
                onBlur={() => {
                  if (focused.value === id) focused.value = null;
                }}
              >
                {byId.get(id)!.name}
              </button>
            </li>
          ))}
        </ul>
        <div class="visually-hidden" aria-live="polite">
          {announce}
        </div>
        {/* лист «Вид» узкого неба — у колонки кнопок, в пределах неба: на карточку он не ложится (C1) */}
        {column && panel.value === 'view' && <ViewSheet />}
      </div>
    </>
  );
}

