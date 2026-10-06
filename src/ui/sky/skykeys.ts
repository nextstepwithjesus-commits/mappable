/**
 * Клавиши неба: масштаб, сдвиг, переходы по родству «[ ] , .», «0» и Home — всё небо (D10; IX-38, 40); на карте
 * «набор» «[» и «]» раскрывают родителя или ребёнка, которого на карте нет (этап 21, решение 197);
 * масштаб по одной оси (Shift и Alt с «+» и «−») и «Небо во весь экран» (F) — viewKeys (J1, J2).
 * По физическим клавишам (KeyboardEvent.code), поэтому работают и на русской раскладке; слушает их window
 * (src/ui/keys.ts), а не холст: небо отвечает и без фокуса на холсте.
 * Фокус на небе (I1; MOB-29–31, IX-39): стрелки — к ближайшей звезде в эту сторону, Shift со стрелками — сдвиг неба,
 * Enter и пробел — открыть карточку звезды с фокусом, фокус — на заголовок карточки. Вне неба стрелки, как прежде,
 * сдвигают небо: кольца фокуса там нет, водить нечего.
 */
import { byId, graph, lineMembership } from '../../data/atlas.ts';
import { selected, hovered, focused, panel, epochMode, pickMode } from '../../state.ts';
import { goTo, skyRef } from '../common.tsx';
import { LANES_STEP, TIME_STEP, panStep, showAll, stopFlight, stretchBy, zoomBy } from './view.ts';
import { grid, toggleFull, unfoldCard } from '../layout.ts';
import { KEY_STEP, KEY_MS, openStarMenu, stopZoom } from './input.ts';
import { arrowDir, moveStarFocus, plateFocus, rememberFocus } from './starnav.ts';
import { skySay } from './SkyA11y.tsx';
import { focusCardTitle, focusKinFirst } from '../focus.ts';
import { expandUnion, originOf, stepBack } from '../reveal.ts';
import { linkSet, show, workSet } from '../work.ts';

/** Небо — своя карта «набор»: переходы «[ ]» раскрывают нужное (этап 21, решение 197). */
const onMap = () => show.peek().kind === 'set' && !linkSet.peek();

// ---------- клавиши неба ----------

/**
 * Путь подъёма по «[»: лица, от которых поднимались к родителю. «]» возвращает к последнему из них,
 * если стоим на его родителе (IX-40); иначе путь забывается.
 */
let climb: string[] = [];

/** Ребёнок для «]»: откуда пришли по «[»; иначе ребёнок на линии Мессии; иначе самый значимый. */
export function childFor(id: string, path: string[]): { to: string | null; path: string[] } {
  const p = [...path];
  const last = p[p.length - 1];
  const lp = last ? byId.get(last) : undefined;
  if (lp && (lp.father === id || lp.mother === id)) {
    p.pop();
    return { to: last, path: p };
  }
  const kids = (graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
  const onLine = kids.find((k) => lineMembership.joseph.has(k) || lineMembership.mary.has(k));
  const best = onLine ?? [...kids].sort((a, b) => (byId.get(a)?.magnitude ?? 9) - (byId.get(b)?.magnitude ?? 9))[0];
  return { to: best ?? null, path: [] };
}

/**
 * Клавиши вида (J1, J2), с модификаторами — поэтому до общего отсева в src/ui/keys.ts: Shift с «+» и «−» — растянуть
 * или сжать время, Alt с «+» и «−» — полосы; F (без модификаторов) — «Небо во весь экран». Не в полях ввода, меню
 * и списках. Возвращает true, если клавиша обработана.
 */
export function viewKeys(e: KeyboardEvent): boolean {
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t?.closest('[role="menu"], [role="listbox"]')) return false;
  const plus = e.code === 'Equal' || e.code === 'NumpadAdd';
  const minus = e.code === 'Minus' || e.code === 'NumpadSubtract';
  if ((plus || minus) && (e.shiftKey !== e.altKey)) {
    stopFlight();
    stopZoom();
    if (e.shiftKey) stretchBy('time', plus ? TIME_STEP : 1 / TIME_STEP);
    else stretchBy('lanes', plus ? LANES_STEP : 1 / LANES_STEP);
    e.preventDefault();
    return true;
  }
  if (e.code === 'KeyF' && !e.shiftKey && !e.altKey) {
    if (!toggleFull()) return false;
    e.preventDefault();
    return true;
  }
  return false;
}

/** Сдвиг неба стрелкой: на 120 px по времени, на 90 px по полосам — плавно, за 180 мс (panStep; IX-05). */
const PAN_X = 120;
const PAN_Y = 90;

/**
 * Клавиши неба (на window, кроме полей ввода; вызывает src/ui/keys.ts). Возвращает true, если клавиша обработана.
 * nav — можно ли стрелкам и Home вести небо (фокус не в прокручиваемой панели или карточке);
 * onSky — фокус на холсте или в списке лиц неба: стрелки водят фокус по звёздам; onCanvas — на самом холсте.
 */
export function skyKeys(e: KeyboardEvent, nav: boolean, onCanvas: boolean, onSky = onCanvas): boolean {
  const sky = skyRef.current;
  if (!sky) return false;
  const id = selected.value;
  // «[» и «]» — от звезды с кольцом клавиатуры, если она есть на небе, иначе от выбранного лица (рецензия этапа 21:
  // «]» на звезде с кольцом, но без выбора, молчал)
  const cur = (onSky ? focused.peek() : null) ?? id;
  /**
   * Переход по родству (решение 149; M5): лицо выбирается, и фокус клавиатуры — на нём же, если он был на небе: одно
   * текущее лицо, Enter открывает его карточку, диктор называет его (aria-activedescendant, SkyA11y).
   */
  const go = (to: string | null | undefined) => {
    if (!to || !byId.has(to)) return;
    const keep = onSky || focused.peek() !== null;
    goTo(to);
    if (keep && selected.peek() === to) {
      plateFocus.value = null;
      focused.value = to;
      rememberFocus(to);
    }
  };
  switch (e.code) {
    case 'Equal':
    case 'NumpadAdd':
      // ×2 за 250 мс у выбранного лица, если оно на виду, иначе у середины видимой части (IX-02)
      stopZoom();
      zoomBy(KEY_STEP, undefined, KEY_MS);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      stopZoom();
      zoomBy(1 / KEY_STEP, undefined, KEY_MS);
      break;
    case 'Digit0':
    case 'Numpad0':
      showAll();
      break;
    case 'Home':
      if (!nav) return false;
      showAll();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!nav) return false;
      stopZoom();
      if (onSky && !e.shiftKey) {
        stopFlight();
        // фокус — к ближайшей звезде в эту сторону; из списка лиц неба фокус возвращается на холст
        moveStarFocus(arrowDir(e.code)!);
        if (!onCanvas) sky.canvas.focus({ preventScroll: true });
        break;
      }
      // сдвиг сам прерывает перелёт; идущий сдвиг клавишей продолжается от своей цели — нажатия складываются
      if (e.code === 'ArrowLeft') panStep(PAN_X, 0);
      else if (e.code === 'ArrowRight') panStep(-PAN_X, 0);
      else if (e.code === 'ArrowUp') panStep(0, PAN_Y);
      else panStep(0, -PAN_Y);
      break;
    }
    case 'ContextMenu':
    case 'F10': {
      // меню звезды с клавиатуры (IX-49): клавиша меню или Shift + F10 — у звезды с кольцом фокуса, на холсте — и у
      // выбранного лица, если оно на виду; то же меню, что у правой кнопки мыши и долгого касания
      if (e.code === 'F10' && !e.shiftKey) return false;
      const to = focused.value ?? (onCanvas ? selected.value : null);
      if (!to || !openStarMenu(to)) return false;
      break;
    }
    case 'BracketLeft': {
      if (!cur) return false;
      const par = byId.get(cur)?.father ?? byId.get(cur)?.mother;
      // без цели — не тишина (M7): диктор слышит, что родителей в данных нет
      if (!par) {
        skySay('родителей в данных нет');
        break;
      }
      climb = [...climb, cur].slice(-200);
      // карта «набор» (этап 21, решение 197): родителя на карте нет — сначала шаг назад (родители, братья и сёстры)
      if (onMap() && !workSet.peek().has(par)) stepBack(cur);
      go(par);
      break;
    }
    case 'BracketRight': {
      if (!cur) return false;
      const r = childFor(cur, climb);
      climb = r.path;
      if (!r.to) {
        skySay('детей в данных нет');
        break;
      }
      // карта «набор» (решение 197): ребёнка на карте нет — раскрывается союз, где он родился (мать и братья с ним)
      if (onMap() && !workSet.peek().has(r.to)) {
        const u = originOf(r.to).find((q) => q.a === cur || q.b === cur) ?? originOf(r.to)[0];
        if (u) expandUnion(u.id, cur);
      }
      go(r.to);
      break;
    }
    case 'Comma':
    case 'Period': {
      if (!id) return false;
      const par = byId.get(id)?.father ?? byId.get(id)?.mother;
      if (!par) return false;
      const sibs = (graph.childrenOf.get(par) ?? []).filter((x) => x.kind === 'father' || x.kind === 'mother').map((x) => x.child);
      const i = sibs.indexOf(id);
      climb = [];
      go(sibs[(i + (e.code === 'Comma' ? -1 : 1) + sibs.length) % sibs.length]);
      break;
    }
    case 'KeyE':
      epochMode.value = !epochMode.value;
      break;
    case 'KeyL':
      panel.value = panel.value === 'legend' ? null : 'legend';
      break;
    case 'Enter':
    case 'NumpadEnter':
    case 'Space': {
      // Enter и пробел — только на самом холсте: у кнопок свои Enter и пробел (MOB-29). Звезда с фокусом клавиатуры,
      // иначе — под указателем; в режиме выбора второго лица она становится вторым (goTo → pickSecond)
      const to = focused.value ?? hovered.value;
      if (!onCanvas || !to) return false;
      goTo(to);
      // карточка открылась — фокус на её заголовок (MOB-31); выбрано второе лицо — фокус возьмёт открытая панель;
      // широкий экран (решение 194) — на первое имя «Родства» в колонке справа
      if (!pickMode.peek() && selected.peek() === to && !grid.peek().phone) {
        if (grid.peek().spine) unfoldCard();
        focusKinFirst(to);
      } else focusCardTitle(to);
      break;
    }
    default:
      return false;
  }
  e.preventDefault();
  skyRef.redraw();
  return true;
}
