/**
 * Клавиши неба: масштаб, сдвиг, переходы по родству «[ ] , .», «0» и Home — всё небо (D10; IX-38, 40).
 * По физическим клавишам (KeyboardEvent.code), поэтому работают и на русской раскладке; слушает их window
 * (src/ui/keys.ts), а не холст: небо отвечает и без фокуса на холсте.
 */
import { byId, graph, lineMembership } from '../../data/atlas.ts';
import { selected, hovered, panel, epochMode, pickSecond } from '../../state.ts';
import { goTo, skyRef } from '../common.tsx';
import { showAll, stopFlight, zoomBy } from './view.ts';
import { KEY_STEP, KEY_MS, stopZoom } from './input.ts';

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
 * Клавиши неба (на window, кроме полей ввода; вызывает src/ui/keys.ts). Возвращает true, если клавиша обработана.
 * nav — можно ли стрелкам и Home вести небо (фокус не в прокручиваемой панели или карточке).
 */
export function skyKeys(e: KeyboardEvent, nav: boolean, onCanvas: boolean): boolean {
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
      const k = e.shiftKey ? 3 : 1;
      if (e.code === 'ArrowLeft') sky.cam.pan(120 * k, 0);
      else if (e.code === 'ArrowRight') sky.cam.pan(-120 * k, 0);
      else if (e.code === 'ArrowUp') sky.cam.pan(0, 90 * k);
      else sky.cam.pan(0, -90 * k);
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
      // Enter — только на самом холсте: у кнопок свои Enter и пробел (MOB-29)
      if (!onCanvas || !hovered.value) return false;
      if (!pickSecond(hovered.value)) selected.value = hovered.value;
      break;
    default:
      return false;
  }
  e.preventDefault();
  skyRef.redraw();
  return true;
}
