import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { FRAME_H, SCALE_SETTLE_MS, Sky, readPalette, type Emphasis, type Rect, type SkyState } from '../render/sky.ts';
import { byId, groupById, lines, modelInfo } from '../data/atlas.ts';
import { highlightFor } from '../render/marks.ts';
import { comparePoints, lineNoteHits, ribbonHover } from '../render/ribbons.ts';
import {
  selected, second, first, hovered, focused, lambda, model, modelId, layers, onlyLines, meridian, panel, pickMode, theme, introDone, epochMode, lineFlip, pins,
  kinPath, kinSteps, skyGroup, synopsisAt,
} from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { drawTiers, replanTiers, tiersBottom } from '../render/tiers.ts';
import { typo } from './text/typo.ts';
import { aliveAt, lifeText, meridianText, placeText } from './sky/text.ts';
import {
  allInView, anchorNow, fitReveal, flightTarget, flyToIds, flyToPerson, holdAnchor, inView, introOpen, keepInView, lanes, reduced, screenOf, setReserve, showAround,
  startLanes, stopFlight, unionFlip, updateZoomFloor, viewAround, linesAgain, type Anchor,
} from './sky/view.ts';
import { expanded, hasHidden, opened, plates, selectedUnion, unionById, type Plate } from './reveal.ts';
import { linkClick, linkHover, plateFocus, plateHover, plateNews } from './sky/starnav.ts';
import { linkAnchor, previewLinks, selectedLink } from './linkstate.ts';
import { skyShow, whereOf } from './show.ts';
import { linkSpeech } from './linkwords.ts';
import { linkKeyString } from '../engine/linkkey.ts';
import { computed } from '@preact/signals';
import { attachPointer, type Tip } from './sky/input.ts';
import { SkyColumn, SkyControls, useColumn, viewOpen } from './sky/Controls.tsx';
import { CARTOUCHE_BESIDE, Cartouche, GuideCommand, SkyBars, lanesChanged, skyBarKind } from './sky/Overlays.tsx';
import { SkyTip, kinPreview, shownTipStar } from './sky/Tip.tsx';
import { SkyA11y } from './sky/SkyA11y.tsx';
import { DotCard, dotCard } from './sky/DotCard.tsx';
import { foldDesc, foldGroups, groupFoldText, keyTarget, linkSet, shownIds, skyMode, workIds, workKey, workKeyText, workSet } from './work.ts';
import { SkyMenu, skyMenu } from './panels/Work.tsx';
import { isTextField } from './keys.ts';
import { grid, skyFull, viewportHeight } from './layout.ts';

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

/**
 * Кадр неба с полями, которые рисует отрисовка (src/render/sky.ts, frame.ts, marks.ts добавят их в SkyState):
 *  — modelNote — название модели хронологии, если она не по умолчанию (решение 35; IX-48): служебная строка справа;
 *  — workMarks — лица рабочего набора в режиме «все лица» (IX-51): метка у знака; в режиме «набор» — null;
 *  — workFlash — отклик звезды на клавишу В или С (IX-51): однократная обводка 300 мс с мгновения at (performance.now()).
 */
export type SkyFrameState = SkyState & {
  modelNote: string | null;
  workMarks: ReadonlySet<string> | null;
  workFlash: { id: string; at: number } | null;
};

/** Отклик звезды на клавишу набора, мс (IX-51). */
export const WORK_FLASH_MS = 300;
/** Смена модели хронологии: старый кадр растворяется в новом за столько мс (IX-48); при ослабленном движении — сразу. */
export const MODEL_FADE_MS = 450;
/** Вписать прежнее окно лет в новое небо после смены его ширины панелью или «во весь экран» — за столько мс (IX-13, MAP-65). */
export const REFIT_MS = 300;

// выделение неба (род выбранного лица, путь родства, группа панели) — src/render/marks.ts, highlightFor

/**
 * Точки союзов на небе «набор» (решения 70, 76; src/ui/reveal.ts, plates): только для своего набора — набор из ссылки
 * (IX-69) смотрят как есть.
 */
const skyPlates = computed<readonly Plate[]>(() => (skyMode.value === 'work' && !linkSet.value ? plates.value : []));
/** Союз, у точки которого открыта карточка у точки (решение 76). */
const dotUnion = computed<string | null>(() => {
  const c = dotCard.value;
  return c?.kind === 'union' ? c.uid : null;
});
/** Лица набора с нераскрытыми союзами, чьи точки союзов не показаны: «+» после подписи (решение 70). */
const revealIds = computed<ReadonlySet<string> | null>(() => {
  if (skyMode.value !== 'work' || linkSet.value) return null;
  const open = new Set(opened.value);
  const out = new Set<string>();
  for (const id of workSet.value.keys()) if (!open.has(id) && hasHidden(id)) out.add(id);
  return out;
});

/**
 * linkAnchor (src/ui/linkstate.ts) по кадру: у выбранной мышью связи — точка щелчка (со сдвигом неба), иначе середина
 * её пути в окне; null — связи нет или её пути нет в окне. Сигнал меняется, только если точка сдвинулась больше чем на 0,5 px.
 */
function anchorLink(sky: Sky) {
  const k = selectedLink.peek();
  const info = sky.linkSel;
  let at: { x: number; y: number } | null = null;
  if (k && info) {
    const ks = info.ks;
    if (linkClick.ks === ks && info.x !== null) {
      const x = sky.cam.sx(linkClick.wx);
      const y = sky.cam.sy(linkClick.lane);
      const vp = sky.cam.vp;
      at = x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b ? { x, y } : { x: info.x, y: info.y! };
    } else if (info.x !== null) at = { x: info.x, y: info.y! };
  }
  const was = linkAnchor.peek();
  if (!at && !was) return;
  if (at && was && Math.abs(at.x - was.x) < 0.5 && Math.abs(at.y - was.y) < 0.5) return;
  linkAnchor.value = at;
}

/** Сколько раз небо создавалось (переход «Древо → Небо» создаёт его заново): со второго раза — linesAgain. */
let mounts = 0;

export function SkyView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  // живая область неба: выбор лица и ответы клавиш набора; n — чтобы тот же текст прозвучал снова
  const [announce, setAnnounce] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
  const [skyW, setSkyW] = useState(0);
  const [skyH, setSkyH] = useState(0);
  const shownPath = useRef('');
  const column = useColumn(skyW, grid.value.phone, viewportHeight.value);
  /** Прямоугольники неба под органами управления и вступлением (C6): подписи и указатели под ними не рисуются. */
  const reserveRef = useRef<Rect[]>([]);
  /** Замерить резерв и поля видимой части после отрисовки органов неба и вступления (animate — вписать небо плавно). */
  const layoutRef = useRef<(animate: boolean) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sky = new Sky(canvas);
    skyRef.current = sky;
    // небо создано заново (с древа): режим «только линии» вписывает коридор, как при первом показе (этап 11, B1)
    if (mounts++ > 0) linesAgain.value++;
    // пропорция полос (J1): из адреса (h), иначе из памяти браузера — до первой раскладки, чтобы небо не перестраивалось
    sky.cam.lanes = startLanes();
    lanes.value = sky.cam.lanes;
    let dirty = true;
    let raf = 0;
    let staleTimer = 0;
    let introStart = introDone.value || reduced() ? -1 : performance.now();
    let flowStart = 0;
    let morph: { from: number; to: number; start: number; anchor: Anchor } | null = null;
    /** прежний кадр при смене модели: растворяется поверх нового (IX-48) */
    let fade: { img: HTMLCanvasElement; start: number } | null = null;
    /** отклик звезды на клавишу набора (IX-51) */
    let flash: { id: string; at: number } | null = null;
    let shownLambda = lambda.value;
    let shownTop = -1;
    let shownLabels = '';
    let floorKey = '';
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

    // привязка при смене масштаба времени и модели (D15; IX-35, IX-48) — src/ui/sky/view.ts: anchorNow, holdAnchor

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
      // предел отдаления по режиму неба («набор», «только линии»): после смены режима, видимой части, модели (IX-64, MAP-59)
      const vp0 = sky.cam.vp;
      const fk = `${sky.plan.mode} ${onlyLines.value} ${vp0.l} ${vp0.r} ${vp0.t} ${vp0.b} ${sky.rowsKey} ${shownLambda} ${model.value.id}`;
      if (fk !== floorKey && sky.model) {
        floorKey = fk;
        updateZoomFloor();
        if (!sky.cam.moving && sky.cam.kx < sky.cam.kxLo() * (1 - 1e-6)) sky.cam.clampNow();
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
      const pair = pairPath();
      // выбор второго лица «Родства»: путь к звезде под указателем — предпросмотром, до выбора (IX-22)
      const preview = !pair && pickMode.value === 'kinship' && hovered.value ? kinPreview(hovered.value) : null;
      const path = pair ?? preview?.path ?? null;
      // отметки поиска (E10): светятся отмеченные и выбранное лицо, остальное небо гаснет; группа панели (главы,
      // участок синопсиса) — лица группы; иначе путь родства или род выбранного лица (E4, E5; src/render/marks.ts)
      const pinned = pins.value;
      const hlf = pinned.length ? null : highlightFor(selected.value, path, skyGroup.value?.ids);
      let highlight: Map<string, Emphasis> | null = pinned.length
        ? new Map<string, Emphasis>([...pinned, ...(selected.value ? [selected.value] : [])].map((x) => [x, 'self']))
        : (hlf?.hl ?? null);
      // какой путь родства светится на небе — для проверок приёмки (tools/accept.ts)
      const pathKey = pair && selected.value ? pair.join(' ') : '';
      if (pathKey !== shownPath.current) {
        shownPath.current = pathKey;
        if (pathKey) wrap.current!.dataset.kinPath = pathKey;
        else delete wrap.current!.dataset.kinPath;
      }
      if (preview) wrap.current!.dataset.kinPreview = preview.path.join(' ');
      else delete wrap.current!.dataset.kinPreview;
      // новый путь или команда «Показать путь на небе» (новый список лиц) — вписать оба конца (E5), когда небо
      // успокоится: после перелёта по адресу или панели. Предпросмотр не вписывается: небо под указателем не ездит
      if (pair !== fitted) {
        fitted = pair;
        pathFit = pair && selected.value ? { path: pair, since: now, still: now } : null;
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
      if (flash && now - flash.at >= WORK_FLASH_MS) flash = null;
      if (flash) again = true;
      const mid = modelId.value;
      const state: SkyFrameState = {
        model: model.value, lambda: shownLambda, selected: selected.value, second: second.value, hovered: hovered.value, focus: focused.value,
        highlight, layers: layers.value, onlyLines: onlyLines.value, meridian: meridian.value,
        tensionPersons, flow: flowing ? flowT : 0, reduced: reduced(), intro, lineFlip: lineFlip.value, pins: new Set(pins.value),
        reserve: reserveRef.current, meridianLabel, kinSteps: pair ? kinSteps.current : (preview?.steps ?? null), depth: hlf?.depth ?? null,
        modelNote: mid !== modelInfo[0]?.id ? (modelInfo.find((m) => m.id === mid)?.name ?? null) : null,
        workMarks: skyMode.value === 'all' && workSet.value.size ? workIds.value : null,
        workFlash: flash,
        // точки союзов и «+» нераскрытых союзов в небе «набор» (решения 70, 76)
        plates: skyPlates.value,
        // точка союза с открытой карточкой у точки (решение 76) отмечена, как союз, открытый в листе карточки
        plateMarks: { hover: plateHover.value, focus: plateFocus.value, selected: dotUnion.value ?? selectedUnion.value },
        reveal: revealIds.value,
        // выбранная связь, подсвеченные строкой «Родство» и связь под указателем (этап 11, § 8; src/ui/linkstate.ts)
        link: selectedLink.value,
        linkPreview: previewLinks.value,
        linkHover: linkHover.value,
        // гости показа (§ 7): уточнение подписи «в «Доме Фарры»»
        guestWhere: whereOf,
      };
      // переход между укладками (§ 10): при ослабленном движении — сразу конечный кадр
      sky.animate = !reduced();
      // ярусы эпох — поверх звёзд, под меридианом, рамкой и указателями у края
      sky.draw(state, epochMode.value ? () => drawTiers(sky, state) : undefined);
      // переход идёт — кадры до его конца (§ 10)
      if (sky.transitioning) again = true;
      // масштаб в движении: кадр связей и пороги подписей пересчитаны из прежних — точный кадр, когда масштаб постоит (Я33)
      if (sky.scaleMoving || sky.linksStale) {
        clearTimeout(staleTimer);
        staleTimer = window.setTimeout(request, SCALE_SETTLE_MS + 30);
      }
      // место выбранной связи на экране — карточке связи (стык 1): точка щелчка по линии, иначе середина её пути в кадре
      anchorLink(sky);
      // смена модели: прежний кадр растворяется поверх нового (IX-48)
      if (fade) {
        const t = (now - fade.start) / MODEL_FADE_MS;
        if (t >= 1) fade = null;
        else {
          const ctx = sky.ctx;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1 - t * t * (3 - 2 * t);
          ctx.drawImage(fade.img, 0, 0);
          ctx.restore();
          again = true;
        }
      }
      input.watchCamera(`${shownLambda} ${model.value.id}`);
      watchSettle(`${sky.cam.x0} ${sky.cam.kx} ${sky.cam.w} ${shownLambda} ${model.value.id}`);
      // окно неба — для проверок приёмки (tools/accept/layout.ts): видимая часть, годы и полосы по её краям
      const vp = sky.cam.vp;
      wrap.current!.dataset.view = [vp.l, vp.t, vp.r, vp.b, sky.cam.x0, sky.cam.kx, sky.cam.laneTop, sky.cam.ky].map((v) => +v.toFixed(4)).join(' ');
      // верх видимой части неба — для органов у верхнего края (строки состояния, вступление на узком небе, sky.css):
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
        // какие подписи наложились — «вид:текст~вид:текст» (этап 11, B1; tools/_bugs-chaos.ts): пусто — наложений нет
        wrap.current!.dataset.overlapPairs = ls.pairs.map(([a, b]) => `${ls.boxes[a].kind}:${ls.boxes[a].text}~${ls.boxes[b].kind}:${ls.boxes[b].text}`).join(';');
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
      // временное сжатие строк вписыванием группы (IX-70) — не пропорция читателя: в память идёт своя
      if (!sky.cam.moving && sky.cam.ownLanes !== lanes.peek()) lanes.value = sky.cam.ownLanes;
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
      // вступление-строка на низком небе (MOB-07) — только резерв: оно не отнимает у неба поля
      const cart = wrap.current!.querySelector<HTMLElement>('.cartouche:not(.low)');
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
      if (!sky.setInsets(insets())) return;
      // идёт перелёт к лицу (поиск, ссылка): прежнее окно не довписывается — иначе оно перебивает перелёт, и небо остаётся
      // на старом месте (сценарий 36: ярусы, панель и карточка); перелёт пересчитывает afterViewport
      if (sky.cam.moving && flightTarget) refit = null;
      // органы неба сменили вид (колонка ↔ блок) сразу после смены ширины неба — вписывание идёт к той же цели
      if (refit && performance.now() < refit.until && !before.wasFit && refitTo()) return;
      afterViewport(before, animate);
    };

    /**
     * Цель вписывания: якорь, его доля ширины видимой части и высота на экране, ширина окна в мировых единицах. Держится,
     * пока идёт переход: панель и карточка сворачиваются в корешки в разных кадрах, и второе изменение ширины вписывает
     * к той же цели, а не к промежуточному кадру.
     */
    let refit: { a: Anchor; fx: number; span: number; row: number; until: number } | null = null;
    /** Вписать к цели refit в нынешнюю видимую часть. */
    const refitTo = () => {
      const g = refit;
      const cam = sky.cam;
      const vp = cam.vp;
      const w1 = vp.r - vp.l;
      const wx = g ? (g.a.id ? sky.nodeX(g.a.id) : sky.xOf(g.a.t)) : null;
      if (!g || wx === null || !(w1 > 0)) return false;
      g.until = performance.now() + REFIT_MS + 200;
      const kx = cam.clampKx(w1 / g.span, wx);
      const to = cam.constrain({ x0: wx - (vp.l + g.fx * w1) / kx, kx, laneTop: g.row + g.a.sy / cam.kyFor(kx) });
      if (cam.near(to)) return true;
      cam.animateTo(to, REFIT_MS, request, reduced());
      request();
      return true;
    };
    /**
     * Прежнее окно лет — в новое небо (IX-13, MAP-65): открылась или закрылась панель слева, «небо во весь экран» —
     * небо стало шире или уже, а окно лет то же; выбранное лицо (если было видно) остаётся на своей доле ширины и на своей
     * высоте экрана, иначе — середина окна. Плавно, за 300 мс; при ослабленном движении — сразу.
     */
    const refitWindow = (prev: { kx: number; vp: { l: number; r: number; t: number; b: number }; ky: number; laneTop: number; a: Anchor }) => {
      const w0 = prev.vp.r - prev.vp.l;
      if (!(w0 > 0)) return false;
      if (!refit || performance.now() > refit.until) {
        const a = prev.a;
        const n = a.id ? sky.node(a.id) : undefined;
        refit = { a, fx: (a.sx - prev.vp.l) / w0, span: w0 / prev.kx, row: n ? sky.rowOf(n.lane) : prev.laneTop - a.sy / prev.ky, until: 0 };
      }
      return refitTo();
    };
    /** «Во весь экран» только что включили или выключили: смена ширины неба — вписать прежнее окно (MAP-65). */
    let fullAt = -Infinity;

    let last = { left: 0, w: 0, h: 0 };
    /** Размер холста: при сетке [панель][небо][карточка] он меняется, когда открываются панель и карточка. */
    const resize = () => {
      if (!wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      if (r.width === last.w && r.height === last.h && r.left === last.left) return;
      const first = last.w === 0;
      const before = first ? null : snapshot();
      const a0 = first ? null : anchorNow();
      const prev = a0 ? { kx: sky.cam.kx, vp: { ...sky.cam.vp }, ky: sky.cam.ky, laneTop: sky.cam.laneTop, a: a0 } : null;
      const dL = first ? 0 : r.left - last.left;
      const dW = first ? 0 : r.width - last.w;
      last = { left: r.left, w: r.width, h: r.height };
      setSkyW(r.width);
      setSkyH(r.height);
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
      // панель слева или «во весь экран» поменяли ширину неба — прежнее окно лет вписывается в новое небо; ручку границы
      // тянут — небо стоит на месте, как было (протяжка не масштабирует небо на каждом шаге)
      const handle = !!document.querySelector('.resizer.dragging') || !!document.activeElement?.closest?.('.resizer');
      const jump = (dL !== 0 || performance.now() - fullAt < 800) && dW !== 0 && !handle;
      if (prev && before && jump && !before.wasFit && !(sky.cam.moving && flightTarget) && refitWindow(prev)) return;
      refit = null;
      afterViewport(before!, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    resize();
    // нижний лист карточки на телефоне меняет высоту — видимая часть неба тоже
    const folioRO = new ResizeObserver(() => applyInsets(false));
    const folioEl = document.querySelector('.folio');
    if (folioEl) folioRO.observe(folioEl);
    const offFull = effect(() => {
      void skyFull.value;
      fullAt = performance.now();
    });

    // резерв органов неба и вступления: их прямоугольники и поля видимой части — после каждой их перерисовки
    const reserveRO = new ResizeObserver(() => measure(false));
    const watched = new Set<Element>();
    const measure = (animate: boolean) => {
      const box = wrap.current!.getBoundingClientRect();
      const out: Rect[] = [];
      // выбранное лицо было видно, а новый лист («Вид», вступление, строка у кромки) лёг на него — небо сдвигается (принцип 2)
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

    // ввод неба (src/ui/sky/input.ts) — первым: его нажатие видит, шёл ли перелёт, прежде чем тот остановится (IX-54)
    const input = attachPointer(sky, canvas, request, setTip);
    // любое нажатие на холсте прерывает перелёт (D4; IX-11); пока указатель нажат, небо у края данных не возвращается
    const onDown = () => {
      // ввод во время перехода (§ 10) — сразу конечный кадр
      sky.endTransition();
      // читатель взялся за небо — путь родства больше не вписывается сам
      pathFit = null;
      stopFlight();
      sky.cam.hold(true);
    };
    const onUp = () => sky.cam.hold(false);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    // колесо над надписями поверх неба — небу (IX-57): органы, строки у кромки, «Как читать карту»; прокручиваемые листы
    // (вступление, «Вид» у колонки, меню) прокручиваются сами
    const onAnyInput = () => sky.endTransition();
    canvas.addEventListener('wheel', onAnyInput, { passive: true });
    window.addEventListener('keydown', onAnyInput, true);
    const onWheelOver = (e: WheelEvent) => {
      const t = e.target;
      if (t === canvas || !(t instanceof Element)) return;
      if (t.closest('.cartouche:not(.low), .sheet, .workpick, [role="menu"], .which')) return;
      input.wheel(e);
    };
    const wrapEl = wrap.current!;
    wrapEl.addEventListener('wheel', onWheelOver, { passive: false });

    // смена темы — новая палитра
    const offTheme = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        sky.pal = readPalette();
        request();
      });
    });
    // смена модели хронологии: выбранное лицо остаётся на месте экрана по обеим осям (IX-48, решение 35); прежний кадр
    // растворяется в новом за 450 мс, при ослабленном движении — сразу
    let shownModel = model.peek();
    const offModel = effect(() => {
      const m = model.value;
      tensions();
      if (m === shownModel) return;
      shownModel = m;
      const a = anchorNow();
      if (!a) {
        sky.setModel(m, shownLambda);
        request();
        return;
      }
      if (!reduced() && canvas.width && canvas.height) {
        const img = document.createElement('canvas');
        img.width = canvas.width;
        img.height = canvas.height;
        img.getContext('2d')?.drawImage(canvas, 0, 0);
        fade = { img, start: performance.now() };
      }
      sky.setModel(m, shownLambda);
      holdAnchor(a, true);
      if (!a.id) sky.cam.clampNow();
      // годы эпох зависят от модели: ярусы раскладываются заново
      if (epochMode.peek() && replanTiers(sky, m)) applyInsets(false);
      request();
    });
    const offLambda = effect(() => {
      const to = lambda.value;
      if (to === shownLambda) return;
      const anchor = anchorNow();
      if (!anchor) {
        shownLambda = to;
        sky.setModel(model.value, to);
        request();
        return;
      }
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
      void pickMode.value;
      void workSet.value;
      void modelId.value;
      // группа панели («Главы», участок «Синопсиса») светится и без выбранного лица — кадр по её смене
      void skyGroup.value;
      // точки союзов, их состояния, карточка у точки и «+» нераскрытых союзов (решения 70, 76)
      void skyPlates.value;
      void revealIds.value;
      void plateFocus.value;
      void selectedUnion.value;
      void dotUnion.value;
      // связи (§ 8): выбранная, подсвеченные строкой «Родство», под указателем
      void selectedLink.value;
      void previewLinks.value;
      void linkHover.value;
      if (id && id !== lastSel) {
        // выбор лица — явное действие: вступление сворачивается в «Как читать карту» (C5)
        introDone.value = true;
        introOpen.value = false;
        const p = byId.get(id)!;
        say(typo([`${p.name}${p.disambig ? `, ${p.disambig}` : ''}`, lifeText(id), placeText(id)].filter(Boolean).join('; ')));
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
    // небо «набор» (решение 76): щелчок по звезде лица сам союзов не показывает — у звезды раскрывается карточка у точки
    // (src/ui/sky/DotCard.tsx), точки союзов показывает её команда «Продолжить ветвь» или «+» после подписи лица
    // раскрытие и свёртка союза — вслух (решение 70): «Раскрыт союз Авраама и Агари: 1 лицо»
    const offNews = effect(() => {
      const n = plateNews.value;
      if (n.text) say(n.text);
    });
    // выбранная связь — вслух (§ 8): «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35»
    let saidLink = '';
    const offLinkSay = effect(() => {
      const k = selectedLink.value;
      const ks = k ? (linkKeyString(k) ?? '') : '';
      if (ks === saidLink) return;
      saidLink = ks;
      if (k) say(linkSpeech(k));
      else if (linkClick.ks) linkClick.ks = '';
    });
    /**
     * Свернули созвездие не у его названия на небе (меню без места щелчка на экране, UX-51): строка-подпись «+N» может
     * оказаться за краем — небо мягко переходит к ней: строка встаёт на высоту at или в середину, её начало — в видимой
     * части. Масштаб не меняется. Свёртка у названия неба не двигает: строка встаёт на место щелчка (offWork).
     */
    const showFoldRow = (g: string, at: { x: number; y: number } | null) => {
      const m = sky.plan.marks.find((k) => k.kind === 'group' && k.id === g);
      if (!m || m.lane === undefined || !sky.model) return;
      const cam = sky.cam;
      const vp = cam.vp;
      const row = sky.rowOf(m.lane);
      const sy = cam.sy(m.lane);
      const sx = cam.sx(sky.xOf(m.t0 ?? sky.tOf(cam.wx((vp.l + vp.r) / 2))));
      const wantY = at ? Math.max(vp.t + 30, Math.min(vp.b - 30, at.y)) : sy >= vp.t + 20 && sy <= vp.b - 20 ? sy : (vp.t + vp.b) / 2;
      const dx = sx < vp.l + 20 || sx > vp.r - 160 ? vp.l + (vp.r - vp.l) * 0.3 - sx : 0;
      if (Math.abs(wantY - sy) < 2 && !dx) return;
      const to = cam.constrain({ x0: cam.x0 - dx / cam.kx, kx: cam.kx, laneTop: row + wantY / cam.ky });
      stopFlight();
      cam.animateTo(to, 350, request, reduced());
    };
    // рабочий набор и свёртка (J4, J5): небо рисует только набор или сворачивает потомков и созвездия, полосы сжимаются.
    // Небо не сдвигается: свёрнутое или развёрнутое лицо (иначе выбранное) остаётся на своём месте экрана; смена режима
    // «все лица | набор» вписывает то, что теперь на небе
    let shownMode: string | null = null;
    let shownFolds = foldDesc.peek();
    let shownGroups = foldGroups.peek();
    /** где свернули созвездие (UX-51): созвездие → полоса у места щелчка; строка «+N» встаёт на неё (src/render/rows.ts) */
    const foldAt = new Map<string, number>();
    // раскрытие на небе (решения 70, 76): прежние раскрытые союзы и прежний набор — чтобы понять, какой союз раскрыли или
    // свернули, и удержать на месте экрана лицо, от которого его раскрыли
    let shownExp = expanded.peek();
    let shownSet: ReadonlySet<string> = shownIds.peek();
    const offWork = effect(() => {
      // небо «набор» показывает набор из ссылки, пока читатель его смотрит (IX-69), иначе свой набор; точки союзов —
      // место под них в строках неба (решение 70). В режиме «только линии» точек союзов нет (sky.ts, unionPlates) — нет и
      // пустых строк под них: иначе лента линий раздувалась вдвое (горб у Ламеха, снимок 14; этап 11, B1)
      // показ (этап 11; src/ui/show.ts): план неба строится по нему — укладка, гости, обрывки, опора перехода
      const sh = skyShow.value;
      const v = { mode: skyMode.value, set: shownIds.value, foldDesc: foldDesc.value, foldGroups: foldGroups.value, foldAt, plates: onlyLines.value ? [] : skyPlates.value, show: sh };
      const exp = expanded.peek();
      const flip = unionFlip(shownExp, exp, v.set);
      shownExp = exp;
      const prevSet = shownSet;
      shownSet = v.set;
      // лицо, от которого раскрыли или свернули союз, — было ли оно на виду (до перестройки строк)
      const flipAt = flip && sky.model && last.w && v.mode === 'work' && shownMode === 'work' && inView(flip.from) ? flip : null;
      const toggled = v.foldDesc.find((x) => !shownFolds.includes(x)) ?? shownFolds.find((x) => !v.foldDesc.includes(x));
      const newGroup = v.foldGroups.find((g) => !shownGroups.includes(g)) ?? null;
      const openedGroup = shownGroups.find((g) => !v.foldGroups.includes(g)) ?? null;
      shownFolds = v.foldDesc;
      shownGroups = v.foldGroups;
      // место щелчка по названию созвездия — у меню, пока оно не закрылось
      const menuAt = skyMenu.peek();
      // свёртка и развёртка созвездия не уносят небо (UX-51): строка, по которой щёлкнули, остаётся на своей высоте экрана —
      // свернули у названия — строка «+N» встаёт на полосу щелчка; развернули строку «+N» — её полоса там же, где была
      let hold: { group: string | null; lane: number; y: number } | null = null;
      if (sky.model && last.w && v.mode === shownMode) {
        const vp = sky.cam.vp;
        if (newGroup && menuAt && menuAt.y > vp.t && menuAt.y < vp.b) {
          foldAt.set(newGroup, Math.round(sky.laneOf(sky.cam.wLane(menuAt.y))));
          hold = { group: newGroup, lane: 0, y: menuAt.y };
        } else if (openedGroup) {
          const m = sky.plan.marks.find((k) => k.kind === 'group' && k.id === openedGroup);
          const y = m?.lane !== undefined ? sky.cam.sy(m.lane) : NaN;
          if (m?.lane !== undefined && y > vp.t && y < vp.b) hold = { group: null, lane: m.lane, y };
        }
      }
      if (openedGroup) foldAt.delete(openedGroup);
      sky.animate = !reduced();
      const changed = sky.setView(v, toggled ?? flip?.from ?? sh.anchor ?? selected.peek());
      if (changed && hold) {
        const lane = hold.group ? sky.plan.marks.find((k) => k.kind === 'group' && k.id === hold!.group)?.lane : hold.lane;
        if (lane !== undefined) {
          stopFlight();
          sky.cam.laneTop = sky.rowOf(lane) + hold.y / sky.cam.ky;
        } else hold = null;
      }
      // раскрыли или свернули союз (решения 70, 76): небо не прыгает — лицо, от которого раскрыли, остаётся на своём месте
      // экрана (setView держит его строку), точка союза встаёт на своё новое место между супругами; новые лица вне видимой
      // части — вписать их прямым переходом, не дольше 600 мс, не сдвигая этого лица; свёртка небо не сдвигает
      let revealed = false;
      if (changed && flip && flipAt) {
        const keep = screenOf(flip.from);
        if (flip.open) {
          const u = unionById(flip.uid);
          updateZoomFloor();
          if (u && keep) revealed = fitReveal([...(u.a ? [u.a] : []), ...(u.b ? [u.b] : []), ...u.kids].filter((id) => v.set.has(id)), keep);
        }
      }
      // новый набор (начало «С Адама», «С Иисуса Христа», «Ключевые лица»…; решение 68): одно лицо — окно вокруг него
      // с запасом на поколение-два, несколько — весь набор
      // (и «Начать заново», когда ни одного лица набора не видно: небо не остаётся пустым)
      const fresh = v.mode === 'work' && v.set.size > 0 && (![...v.set].some((id) => prevSet.has(id)) || (changed && ![...v.set].some((id) => inView(id))));
      const single = v.set.size === 1 ? [...v.set][0] : null;
      // первый показ в режиме «набор» (сеанс продолжается после перезагрузки) — сразу вписать набор
      if (shownMode === null) {
        shownMode = v.mode;
        if (changed && v.mode === 'work' && sky.model && last.w) {
          if (!(single && showAround(single, false))) sky.fitAll();
        }
        if (changed) request();
        return;
      }
      if (!changed) return;
      skyMenu.value = null;
      // включили «набор» — вписать набор; вернулись ко всем лицам — то же окно лет и те же полосы, но со всем небом.
      // Показ «линии Мессии» вписывает view.ts (fitLines: коридор или ±10 поколений у выбранного) — его окно не перебивается
      // вписыванием набора, кто бы из двух ни успел первым (этап 11, B1; сценарий 721)
      if (sky.model && last.w && v.mode === 'work' && onlyLines.peek()) {
        /* окно — у fitLines */
      } else if (sky.model && last.w && v.mode === 'work' && shownMode !== 'work') {
        stopFlight();
        updateZoomFloor();
        const around = single ? viewAround(single) : null;
        sky.cam.flyTo(around ?? sky.fitState(), request, reduced());
      } else if (sky.model && last.w && fresh && !revealed) {
        stopFlight();
        updateZoomFloor();
        if (!(single && showAround(single, true))) sky.cam.zoomTo(sky.fitState(), 500, request, reduced());
      } else if (sky.model && last.w && !revealed) {
        sky.cam.clampNow();
        const id = selected.peek();
        if (id && v.mode !== shownMode && !inView(id)) keepInView(id);
        // свернули не у названия (клавиатура, служебная строка) — строка «+N» может оказаться за краем: небо переходит к ней
        if (newGroup && v.mode === shownMode && !hold) showFoldRow(newGroup, null);
      }
      // свёртка созвездия — вслух (UX-51): «Созвездие «Дом Саулов» свёрнуто: скрыто 65 лиц»
      const g = newGroup ?? openedGroup;
      if (g && v.mode === shownMode) {
        const count = sky.plan.marks.find((k) => k.kind === 'group' && k.id === g)?.count ?? 0;
        say(groupFoldText(groupById.get(g)?.name ?? g, !!newGroup, count));
      }
      shownMode = v.mode;
      request();
    });
    // клавиши набора (J3, J5): «В» — добавить лицо в набор, «С» — свернуть потомков. Лицо — звезда с кольцом
    // клавиатуры, иначе звезда с видимой подсказкой, иначе выбранное (IX-51); ответ — в живой области (MOB-55) и
    // однократной обводкой звезды. Как у клавиш атласа (src/ui/keys.ts): не в полях ввода, не с модификаторами, не в меню
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
      const r = workKey(e.code, keyTarget(shownTipStar()));
      if (!r) return;
      e.preventDefault();
      flash = { id: r.id, at: performance.now() };
      if (r.kind === 'fold') say(workKeyText({ ...r, hidden: sky.plan.marks.find((k) => k.kind === 'desc' && k.id === r.id)?.count }));
      else say(workKeyText(r));
      request();
    };
    window.addEventListener('keydown', onWorkKey);

    return () => {
      ro.disconnect();
      folioRO.disconnect();
      reserveRO.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      wrapEl.removeEventListener('wheel', onWheelOver);
      canvas.removeEventListener('wheel', onAnyInput);
      window.removeEventListener('keydown', onAnyInput, true);
      offTheme();
      offModel();
      offLambda();
      offSel();
      offLines();
      offTiers();
      offWork();
      offNews();
      offLinkSay();
      offFull();
      window.removeEventListener('keydown', onWorkKey);
      clearTimeout(settleTimer);
      clearTimeout(staleTimer);
      // перелёт и шаг масштаба останавливаются вместе с небом: их кадры некуда рисовать
      sky.cam.stop();
      input.dispose();
      if (raf) cancelAnimationFrame(raf);
      void dirty;
    };
  }, []);

  // органы неба, строки у кромки и вступление перерисованы — замерить резерв; вступление свернули или открыли — вписать
  // небо плавно
  const intro = introOpen.value;
  const low = skyH > 0 && skyH <= 520;
  const bars = `${skyBarKind()} ${lanesChanged(lanes.value)} ${selected.value ?? ''} ${workSet.value.size}`;
  const firstLayout = useRef(true);
  const lastIntro = useRef(intro);
  useLayoutEffect(() => {
    const animate = !firstLayout.current && lastIntro.current !== intro;
    firstLayout.current = false;
    lastIntro.current = intro;
    layoutRef.current(animate);
  }, [column, intro, low, skyW, bars, viewOpen.value]);

  // лист «Вид» всплывает у своей кнопки — у блока или у колонки (IX-80; src/ui/sky/Controls.tsx): небо сменило вид органов
  // (поворот, закрытая карточка) — лист закрывается, его кнопки больше нет на месте
  useEffect(() => {
    viewOpen.value = false;
  }, [column]);

  // точки сравнения линий в режиме «только линии» — и для клавиатуры: открывают синопсис участка (E6; U2)
  // в небе «набор» — только по лицам линий из набора, как выноски на холсте (ribbons.ts, skySteps; этап 11, B1): список
  // для клавиатуры не называет точек сравнения, которых на небе нет
  const onSky = (id: string) => skyMode.value !== 'work' || shownIds.value.has(id);
  const linePoints = onlyLines.value
    ? comparePoints(
        lines.joseph.persons.filter((st) => onSky(st.id)),
        lines.mary.persons.map((st) => (lineFlip.value && st.id === 'mariya' ? { ...st, id: 'iosif-muzh-marii' } : st)).filter((st) => onSky(st.id)),
      )
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
        {/* карточка у звезды или точки союза в небе «набор» (решение 76): сразу после холста — Tab с неба ведёт в неё */}
        <DotCard />
        {/* строки у кромки неба — под служебной строкой рамки (VIS-46, MAP-67): выбор второго лица, отметки поиска, группа,
            режим «набор» (UX-62, MOB-54), пропорция строк (UX-53) */}
        <SkyBars />
        <SkyTip tip={tip} />
        {/* меню звезды и названия созвездия (J3, J5): правая кнопка мыши, долгое касание, клавиша меню и Shift + F10 */}
        <SkyMenu bounds={{ w: skyW, h: skyRef.current?.cam.h ?? 0 }} />
        {/* до первого замера ширина неба неизвестна: органы появляются сразу в своём виде, без мелькания блока на телефоне */}
        {skyW > 0 && (column ? <SkyColumn /> : <SkyControls />)}
        {skyW > 0 && (intro ? <Cartouche high={!column && skyW < CARTOUCHE_BESIDE} low={low} /> : <GuideCommand />)}
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
          {announce.text}
          {announce.n % 2 ? ' ' : ''}
        </div>
      </div>
    </>
  );
}
