/**
 * Клавиши неба: масштаб, сдвиг, переходы по родству «[ ] , .», «0» и Home — всё небо (D10; IX-38, 40).
 * По физическим клавишам (KeyboardEvent.code), поэтому работают и на русской раскладке; слушает их window
 * (src/ui/keys.ts), а не холст: небо отвечает и без фокуса на холсте.
 * Фокус на небе (I1; MOB-29–31, IX-39): стрелки — к ближайшей звезде в эту сторону, Shift со стрелками — сдвиг неба,
 * Enter и пробел — открыть карточку звезды с фокусом, фокус — на заголовок карточки. Вне неба стрелки, как прежде,
 * сдвигают небо: кольца фокуса там нет, водить нечего.
 */
import { byId, graph, lineMembership } from '../../data/atlas.ts';
import { selected, hovered, focused, panel, epochMode } from '../../state.ts';
import { goTo, skyRef } from '../common.tsx';
import { showAll, stopFlight, zoomBy } from './view.ts';
import { KEY_STEP, KEY_MS, stopZoom } from './input.ts';
import { arrowDir, moveStarFocus } from './starnav.ts';
import { focusCardTitle } from '../focus.ts';

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

/** Сдвиг неба стрелкой: на 120 px по времени, на 90 px по полосам. */
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
  const go = (to: string | null | undefined) => {
    if (to && byId.has(to)) goTo(to);
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
      stopFlight();
      stopZoom();
      if (onSky && !e.shiftKey) {
        // фокус — к ближайшей звезде в эту сторону; из списка лиц неба фокус возвращается на холст
        moveStarFocus(arrowDir(e.code)!);
        if (!onCanvas) sky.canvas.focus({ preventScroll: true });
        break;
      }
      if (e.code === 'ArrowLeft') sky.cam.pan(PAN_X, 0);
      else if (e.code === 'ArrowRight') sky.cam.pan(-PAN_X, 0);
      else if (e.code === 'ArrowUp') sky.cam.pan(0, PAN_Y);
      else sky.cam.pan(0, -PAN_Y);
      break;
    }
    case 'BracketLeft': {
      if (!id) return false;
      const par = byId.get(id)?.father ?? byId.get(id)?.mother;
      if (!par) return false;
      climb = [...climb, id].slice(-200);
      go(par);
      break;
    }
    case 'BracketRight': {
      if (!id) return false;
      const r = childFor(id, climb);
      climb = r.path;
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
      // карточка открылась — фокус на её заголовок (MOB-31); выбрано второе лицо — фокус возьмёт открытая панель
      focusCardTitle(to);
      break;
    }
    default:
      return false;
  }
  e.preventDefault();
  skyRef.redraw();
  return true;
}
