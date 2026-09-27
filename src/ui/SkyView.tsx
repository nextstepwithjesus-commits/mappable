import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { FRAME_H, Sky, readPalette, type Emphasis, type Rect, type SkyState } from '../render/sky.ts';
import { byId, lines } from '../data/atlas.ts';
import { highlightFor } from '../render/marks.ts';
import { comparePoints, lineNoteHits, ribbonHover } from '../render/ribbons.ts';
import {
  selected, second, first, hovered, focused, lambda, model, layers, onlyLines, meridian, panel, pickMode, theme, introDone, epochMode, lineFlip, pins,
  pinsQuery, kinPath, kinSteps, skyGroup, synopsisAt,
} from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { drawTiers, replanTiers, tiersBottom } from '../render/tiers.ts';
import { typo } from './text/typo.ts';
import { aliveAt, lifeText, meridianText, placeText } from './sky/text.ts';
import { allInView, flightTarget, flyToIds, flyToPerson, inView, introOpen, keepInView, lanes, reduced, screenOf, setReserve, startLanes, stopFlight } from './sky/view.ts';
import { attachPointer, type Tip } from './sky/input.ts';
import { COLUMN_BELOW, SkyColumn, SkyControls, ViewSheet, viewOpen } from './sky/Controls.tsx';
import { CARTOUCHE_BESIDE, Cartouche, GroupBar, GuideCommand, PickBar, PinBar } from './sky/Overlays.tsx';
import { SkyTip } from './sky/Tip.tsx';
import { SkyA11y } from './sky/SkyA11y.tsx';
import { foldDesc, foldGroups, skyMode, workIds, workKey } from './work.ts';
import { SkyMenu, WorkBar, skyMenu } from './panels/Work.tsx';
import { isTextField } from './keys.ts';

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

// выделение неба (род выбранного лица, путь родства, группа панели) — src/render/marks.ts, highlightFor

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
    // пропорция полос (J1): из адреса (h), иначе из памяти браузера — до первой раскладки, чтобы небо не перестраивалось
    sky.cam.lanes = startLanes();
    lanes.value = sky.cam.lanes;
    let dirty = true;
    let raf = 0;
    let introStart = introDone.value || reduced() ? -1 : performance.now();
    let flowStart = 0;
    let morph: { from: number; to: number; start: number; anchor: Anchor } | null = null;
    let shownLambda = lambda.value;
    let shownTop = -1;
    let shownLabels = '';
    let tensionPersons = new Set<string>();
    /** с какого мгновения указатель на ленте (ток света, E6) */
    let hotSince = 0;
    /** новый путь родства: вписать его, когда небо остановится (E5) */
    let pathFit: { path: string[]; since: number; still: number } | null = null;
    let fitted: string[] | null = null;

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
      // небо снято со страницы (образец #/specimen), а анимация камеры или таймер ещё просят кадр — рисовать некуда
      if (!wrap.current) return;
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
      // ток света к Иисусу: 3 с после включения «только линии» и всё время, пока указатель на ленте (ТЗ § 3.2; E6)
      const ribbonHot = !!ribbonHover(sky);
      if (!ribbonHot) hotSince = 0;
      else if (!hotSince) hotSince = now;
      const flowing = (flowStart > 0 && now - flowStart < 3000) || ribbonHot;
      if (flowing && !reduced()) again = true;
      const flowT = ribbonHot ? now - hotSince + 1 : now - flowStart;
      const path = pairPath();
      // отметки поиска (E10): светятся отмеченные и выбранное лицо, остальное небо гаснет; группа панели (главы,
      // участок синопсиса) — лица группы; иначе путь родства или род выбранного лица (E4, E5; src/render/marks.ts)
      const pinned = pins.value;
      const hlf = pinned.length ? null : highlightFor(selected.value, path, skyGroup.value?.ids);
      let highlight: Map<string, Emphasis> | null = pinned.length
        ? new Map<string, Emphasis>([...pinned, ...(selected.value ? [selected.value] : [])].map((x) => [x, 'self']))
        : (hlf?.hl ?? null);
      // какой путь родства светится на небе — для проверок приёмки (tools/accept.ts)
      const pathKey = path && selected.value ? path.join(' ') : '';
      if (pathKey !== shownPath.current) {
        shownPath.current = pathKey;
        if (pathKey) wrap.current!.dataset.kinPath = pathKey;
        else delete wrap.current!.dataset.kinPath;
      }
      // новый путь или команда «Показать путь на небе» (новый список лиц) — вписать оба конца (E5), когда небо
      // успокоится: после перелёта по адресу или панели
      if (path !== fitted) {
        fitted = path;
        pathFit = path && selected.value ? { path, since: now, still: now } : null;
      }
      if (pathFit) {
        if (sky.cam.moving) pathFit.still = now;
        if (now - pathFit.since > 4000) pathFit = null;
        else if (now - pathFit.since >= 500 && now - pathFit.still >= 250) {
          if (!allInView(pathFit.path)) flyToIds(pathFit.path);
          pathFit = null;
        } else again = true;
      }
      // меридиан года (D13): светятся все, кто жив в этот год, «вероятно» — бледнее, чем «наверняка»;
      // при выбранном лице небо не перестраивается, счёт живых — во флажке у линейки
      let meridianLabel: string | null = null;
      if (meridian.value !== null) {
        const alive = aliveAt(model.value.chrono, meridian.value);
        let sure = 0;
        for (const k of alive.values()) if (k === 'sure') sure++;
        meridianLabel = meridianText(meridian.value, alive.size, sure);
        if (!highlight) highlight = alive;
      }
      const state: SkyState = {
        model: model.value, lambda: shownLambda, selected: selected.value, second: second.value, hovered: hovered.value, focus: focused.value,
        highlight, layers: layers.value, onlyLines: onlyLines.value, meridian: meridian.value,
        tensionPersons, flow: flowing ? flowT : 0, reduced: reduced(), intro, lineFlip: lineFlip.value, pins: new Set(pins.value),
        reserve: reserveRef.current, meridianLabel, kinSteps: path ? kinSteps.current : null, depth: hlf?.depth ?? null,
      };
      // ярусы эпох — поверх звёзд, под меридианом, рамкой и указателями у края
      sky.draw(state, epochMode.value ? () => drawTiers(sky, state) : undefined);
      input.watchCamera(`${shownLambda} ${model.value.id}`);
      watchSettle(`${sky.cam.x0} ${sky.cam.kx} ${sky.cam.w} ${shownLambda} ${model.value.id}`);
      // окно неба — для проверок приёмки (tools/accept/layout.ts): видимая часть, годы и полосы по её краям
      const vp = sky.cam.vp;
      wrap.current!.dataset.view = [vp.l, vp.t, vp.r, vp.b, sky.cam.x0, sky.cam.kx, sky.cam.laneTop, sky.cam.ky].map((v) => +v.toFixed(4)).join(' ');
      // верх видимой части неба — для органов у верхнего края (вступление и «Как читать карту» на узком небе, sky.css):
      // в режиме эпох они встают под ярусы, а не на них; их прямоугольники резерва замеряются заново
      if (vp.t !== shownTop) {
        shownTop = vp.t;
        wrap.current!.style.setProperty('--sky-top', `${Math.round(vp.t)}px`);
        requestAnimationFrame(() => wrap.current && layoutRef.current(false));
      }
      // замер подписей кадра — для проверок этапа 4: «нарисовано подписей/пересекающихся пар» (src/render/labels.ts)
      const ls = sky.labelStats();
      const labelsKey = `${ls.boxes.length}/${ls.overlaps}`;
      if (labelsKey !== shownLabels) {
        shownLabels = labelsKey;
        wrap.current!.dataset.labels = labelsKey;
      }
      // флажок меридиана — для проверок приёмки (tools/accept/sky.ts): есть ли меридиан и что на флажке
      if (meridianLabel) wrap.current!.dataset.meridian = meridianLabel;
      else delete wrap.current!.dataset.meridian;
      // выноски точек сравнения линий (E6) — для проверок приёмки (tools/accept/map.ts): «лицо:x,y,w,h;…» в px холста
      const notesKey = lineNoteHits(sky).filter((h) => h.kind === 'synopsis').map((h) => `${h.id}:${[h.x, h.y, h.w, h.h].map(Math.round).join(',')}`).join(';');
      if (notesKey) wrap.current!.dataset.lineNotes = notesKey;
      else delete wrap.current!.dataset.lineNotes;
      // где звезда выбранного лица (px холста) — «выбранное лицо видно» проверяется по ней
      const sel = selected.value ? screenOf(selected.value) : null;
      if (sel) wrap.current!.dataset.sel = `${sel.x.toFixed(1)} ${sel.y.toFixed(1)}`;
      else delete wrap.current!.dataset.sel;
      // пропорция полос устоялась (шаг, протяжка, щипок закончились) — в память браузера и органам неба (J1)
      if (!sky.cam.moving && sky.cam.lanes !== lanes.peek()) lanes.value = sky.cam.lanes;
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
      // стопка карточек на телефоне — строка над листом (J6): небо под ней тоже закрыто
      const strip = sheet?.querySelector<HTMLElement>('.stack-strip');
      if (strip && bottom > 0) bottom = Math.max(bottom, box.bottom - strip.getBoundingClientRect().top);
      const cart = wrap.current!.querySelector<HTMLElement>('.cartouche');
      if (cart) {
        const c = cart.getBoundingClientRect();
        if (c.width > box.width * 0.6) bottom = Math.max(bottom, box.bottom - c.top + 8);
        else left = Math.max(0, c.right - box.left + 16 - sky.letterW);
      }
      // колонка кнопок узкого неба — полоса справа: иначе конец лент (Иисус Христос) на «всём небе» лежал бы под ней (MOB-01)
      const col = wrap.current!.querySelector<HTMLElement>('.skyctl.column');
      const right = col ? Math.max(0, box.right - col.getBoundingClientRect().left + 4) : 0;
      return { top: epochMode.peek() ? tiersBottom(sky, model.value) : FRAME_H, bottom: Math.min(bottom, box.height - FRAME_H - 80), left, right };
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
      if (!wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
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
      // читатель взялся за небо — путь родства больше не вписывается сам
      pathFit = null;
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
      // годы эпох зависят от модели: ярусы раскладываются заново
      if (epochMode.peek() && replanTiers(sky, m)) applyInsets(false);
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
      // группа панели («Главы», участок «Синопсиса») светится и без выбранного лица — кадр по её смене
      void skyGroup.value;
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
    // ярусы эпох сдвигают небо вниз, а не закрывают его (D14; UX-26): то, что было у верхнего края видимой части,
    // остаётся у него — под ярусами; выключили ярусы — небо поднимается обратно. «Всё небо» вписывается под ярусы.
    let tiersShown = epochMode.peek();
    const offTiers = effect(() => {
      const on = epochMode.value;
      requestAnimationFrame(() => {
        if (!wrap.current || !sky.model || !last.w) return;
        const toggled = on !== tiersShown;
        tiersShown = on;
        if (on) replanTiers(sky, model.peek());
        const before = snapshot();
        const t0 = sky.cam.vp.t;
        if (!sky.setInsets(insets())) return request();
        const dy = sky.cam.vp.t - t0;
        if (toggled && dy && !before.wasFit && !(sky.cam.moving && flightTarget)) {
          const to = sky.cam.constrain({ x0: sky.cam.x0, kx: sky.cam.kx, laneTop: sky.cam.laneTop + dy / sky.cam.ky });
          sky.cam.animateTo(to, 250, request, reduced());
          if (before.sel) requestAnimationFrame(() => keepInView(before.sel!));
          request();
          return;
        }
        afterViewport(before, true);
      });
    });
    // раскладка ярусов — по окну неба, когда оно остановилось: пустые ярусы свёрнуты, строки — по видимым отрезкам
    let settleKey = '';
    let settleTimer = 0;
    const watchSettle = (key: string) => {
      if (key === settleKey) return;
      settleKey = key;
      clearTimeout(settleTimer);
      if (!epochMode.peek()) return;
      settleTimer = window.setTimeout(() => {
        if (!wrap.current || !epochMode.peek() || sky.cam.moving) return;
        if (replanTiers(sky, model.peek())) applyInsets(false);
        request();
      }, 200);
    };
    const offLines = effect(() => {
      if (onlyLines.value) flowStart = performance.now();
      request();
    });
    // рабочий набор и свёртка (J4, J5): небо рисует только набор или сворачивает потомков и созвездия, полосы сжимаются.
    // Небо не сдвигается: свёрнутое или развёрнутое лицо (иначе выбранное) остаётся на своём месте экрана; смена режима
    // «все лица | в работе» вписывает то, что теперь на небе
    let shownMode: string | null = null;
    let shownFolds = foldDesc.peek();
    const offWork = effect(() => {
      const v = { mode: skyMode.value, set: workIds.value, foldDesc: foldDesc.value, foldGroups: foldGroups.value };
      const toggled = v.foldDesc.find((x) => !shownFolds.includes(x)) ?? shownFolds.find((x) => !v.foldDesc.includes(x));
      shownFolds = v.foldDesc;
      const changed = sky.setView(v, toggled ?? selected.peek());
      // первый показ в режиме «В работе» (сеанс продолжается после перезагрузки) — сразу вписать набор
      if (shownMode === null) {
        shownMode = v.mode;
        if (changed && v.mode === 'work' && sky.model && last.w) sky.fitAll();
        if (changed) request();
        return;
      }
      if (!changed) return;
      skyMenu.value = null;
      // включили «в работе» — вписать набор; вернулись ко всем лицам — то же окно лет и те же полосы, но со всем небом
      if (sky.model && last.w && v.mode === 'work' && shownMode !== 'work') {
        stopFlight();
        sky.cam.flyTo(sky.fitState(), request, reduced());
      } else if (sky.model && last.w) {
        sky.cam.clampNow();
        const id = selected.peek();
        if (id && v.mode !== shownMode && !inView(id)) keepInView(id);
      }
      shownMode = v.mode;
      request();
    });
    // клавиши рабочего набора (J3, J5): «В» — взять лицо в работу, «С» — свернуть потомков; лицо — звезда с фокусом,
    // под указателем или выбранное. Как у клавиш атласа (src/ui/keys.ts): не в полях ввода, не с модификаторами, не в меню
    const onWorkKey = (e: KeyboardEvent) => {
      // открытое меню неба — одно видимое состояние: Escape снимает его первым (D5)
      if (e.code === 'Escape' && skyMenu.peek() && !e.defaultPrevented) {
        skyMenu.value = null;
        e.preventDefault();
        return;
      }
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
      if (e.code !== 'KeyD' && e.code !== 'KeyC') return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('[role="menu"], [role="listbox"], .workpick')) return;
      if (workKey(e.code)) {
        e.preventDefault();
        request();
      }
    };
    window.addEventListener('keydown', onWorkKey);

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
      offWork();
      window.removeEventListener('keydown', onWorkKey);
      clearTimeout(settleTimer);
      // перелёт и шаг масштаба останавливаются вместе с небом: их кадры некуда рисовать
      sky.cam.stop();
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
  }, [column, intro, skyW, column && panel.value === 'view', !column && viewOpen.value]);



  // лист «Вид» — только у колонки: если небо стало шире (поворот, закрытая карточка), лист закрывается, органы снова в блоке
  useEffect(() => {
    if (!column && panel.value === 'view') panel.value = null;
    // лист «Вид» над блоком (широкое небо) — только у блока: небо стало узким — он закрывается
    if (column) viewOpen.value = false;
  }, [column]);

  // точки сравнения линий в режиме «только линии» — и для клавиатуры: открывают синопсис участка (E6; U2)
  const linePoints = onlyLines.value
    ? comparePoints(lines.joseph.persons, lines.mary.persons.map((st) => (lineFlip.value && st.id === 'mariya' ? { ...st, id: 'iosif-muzh-marii' } : st)))
    : [];

  return (
    <>
      {/* data-tiers — включены ли ярусы эпох: для проверок приёмки (tools/accept.ts) */}
      <div class="sky" ref={wrap} data-tiers={epochMode.value ? 'on' : undefined}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          class={pickMode.value ? 'picking' : ''}
        />
        <SkyA11y />
        {pickMode.value && selected.value && <PickBar mode={pickMode.value} id={selected.value} />}
        {pins.value.length > 0 && !pickMode.value && <PinBar n={pins.value.length} query={pinsQuery.value} />}
        {skyGroup.value && !pins.value.length && !pickMode.value && <GroupBar label={skyGroup.value.label} />}
        {/* режим «В работе» (J4): пустой набор или выбранное лицо вне набора — строка у верхней кромки */}
        {skyMode.value === 'work' && !skyGroup.value && !pins.value.length && !pickMode.value && <WorkBar />}
        <SkyTip tip={tip} />
        {/* меню звезды и названия созвездия (J3, J5): правая кнопка мыши, долгое касание */}
        <SkyMenu bounds={{ w: skyW, h: skyRef.current?.cam.h ?? 0 }} />
        {/* до первого замера ширина неба неизвестна: органы появляются сразу в своём виде, без мелькания блока на телефоне */}
        {skyW > 0 && (column ? <SkyColumn /> : <SkyControls />)}
        {skyW > 0 && (intro ? <Cartouche high={!column && skyW < CARTOUCHE_BESIDE} /> : <GuideCommand high={!column && skyW < CARTOUCHE_BESIDE} />)}
        {linePoints.length > 0 && (
          <ul class="visually-hidden" aria-label="Точки сравнения Мф 1 и Лк 3: синопсис участка">
            {linePoints.map((cp) => (
              <li key={cp.at}>
                <button
                  onClick={() => {
                    synopsisAt.value = cp.at;
                    panel.value = 'synopsis';
                  }}
                >
                  {typo(cp.full)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div class="visually-hidden" aria-live="polite">
          {announce}
        </div>
        {/* лист «Вид» узкого неба — у колонки кнопок, в пределах неба: на карточку он не ложится (C1) */}
        {column && panel.value === 'view' && <ViewSheet />}
      </div>
    </>
  );
}

