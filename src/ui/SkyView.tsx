import { useEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { Sky, readPalette, type SkyState } from '../render/sky.ts';
import { byId, graph } from '../data/atlas.ts';
import {
  selected, second, first, hovered, focused, lambda, model, layers, onlyLines, meridian, panel, pickMode, theme, introDone, epochMode, lineFlip, pins,
  kinPath, pickSecond,
} from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { drawTiers, tiersBottom } from '../render/tiers.ts';
import { typo } from './text/typo.ts';
import { lifeText, placeText } from './sky/text.ts';
import { reduced } from './sky/view.ts';
import { attachPointer, skyKey, type Tip } from './sky/input.ts';
import { COLUMN_BELOW, SkyColumn, SkyControls, ViewSheet } from './sky/Controls.tsx';
import { CARTOUCHE_BESIDE, Cartouche, PickBar } from './sky/Overlays.tsx';

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

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sky = new Sky(canvas);
    skyRef.current = sky;
    let dirty = true;
    let raf = 0;
    let introStart = introDone.value || reduced() ? -1 : performance.now();
    let flowStart = 0;
    let morph: { from: number; to: number; start: number } | null = null;
    let shownLambda = lambda.value;
    let tensionPersons = new Set<string>();

    const tensions = () => {
      tensionPersons = new Set(model.value.tensions.flatMap((t) => (t.persons.length <= 3 ? t.persons : [t.persons[0], t.persons[t.persons.length - 1]])));
    };
    tensions();

    const frame = () => {
      raf = 0;
      const now = performance.now();
      let again = false;
      if (morph) {
        const t = Math.min(1, (now - morph.start) / 450);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const center = sky.tOf(sky.cam.wx(sky.cam.w / 2));
        shownLambda = morph.from + (morph.to - morph.from) * e;
        sky.setModel(model.value, shownLambda);
        // держим тот же год в центре экрана
        sky.cam.x0 = sky.xOf(center) - sky.cam.w / 2 / sky.cam.kx;
        if (t >= 1) morph = null;
        else again = true;
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
      };
      sky.draw(state);
      if (epochMode.value) drawTiers(sky, state);
      input.watchCamera(`${shownLambda} ${model.value.id}`);
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
    // лист карточки на телефоне появляется после отрисовки выбора — размеры берутся в следующем кадре
    skyRef.flyTo = (id: string) => requestAnimationFrame(() => flyNow(id));
    const flyNow = (id: string) => {
      const n = sky.node(id);
      if (!n) return;
      const c = model.value.chrono.get(id);
      // окно — несколько поколений вокруг лица (в годах, затем в мировых единицах)
      const life = c ? Math.max(40, (c.d ?? c.dEst) - c.b) : 80;
      const span = Math.max(120, Math.min(900, life * 2.6));
      const t0 = n.t0 - span * 0.35;
      const t1 = n.t0 + span * 0.65;
      const x0 = sky.xOf(t0);
      const x1 = sky.xOf(t1);
      // открытая панель слева закрывает часть неба: окно лет ложится на видимую справа от неё часть
      const L = sheetOverlap();
      const wT = Math.max(50, x1 - x0) * (sky.cam.w / (sky.cam.w - L));
      const cx = (x0 + x1) / 2 - L / 2 / (sky.cam.w / wT);
      // по вертикали лицо ставится в середину видимой части неба: ниже ярусов эпох и выше нижнего листа карточки
      const [vTop, vBottom] = visibleRows();
      const ky = sky.cam.kyFor(sky.cam.w / wT);
      const lane = n.lane + ((vTop + vBottom) / 2 - sky.cam.h / 2) / ky;
      sky.cam.flyTo(cx, lane, wT, request, reduced());
    };
    /** Видимая по вертикали часть холста (px): ниже линейки или ярусов эпох, выше нижнего листа карточки (телефон). */
    const visibleRows = (): [number, number] => {
      const top = epochMode.value ? tiersBottom(model.value) : 26;
      let bottom = sky.cam.h;
      const sheet = document.querySelector<HTMLElement>('.folio:not([hidden])');
      if (sheet && getComputedStyle(sheet).position === 'fixed') bottom = Math.max(top + 80, sheet.getBoundingClientRect().top - wrap.current!.getBoundingClientRect().top);
      return [top, Math.max(top + 80, bottom)];
    };
    /** Ширина неба под левой панелью (0, если панели нет или она закрывает почти всё небо, как на телефоне). */
    const sheetOverlap = () => {
      const sh = document.querySelector<HTMLElement>('.sheet');
      if (!sh) return 0;
      const c = wrap.current!.getBoundingClientRect();
      const L = Math.max(0, Math.min(c.width, sh.getBoundingClientRect().right - c.left));
      return c.width - L < 240 ? 0 : L;
    };

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      const first = sky.cam.w === 1000 && sky.cam.h === 700;
      setSkyW(r.width);
      sky.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1)); // выше 2× разница не видна, а заливка втрое дороже
      sky.setModel(model.value, shownLambda);
      if (first) sky.fitAll();
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    resize();

    // смена темы — новая палитра
    const offTheme = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        sky.pal = readPalette();
        request();
      });
    });
    const offModel = effect(() => {
      const m = model.value;
      tensions();
      sky.setModel(m, shownLambda);
      request();
    });
    const offLambda = effect(() => {
      const to = lambda.value;
      if (to === shownLambda) return;
      if (reduced()) {
        const center = sky.tOf(sky.cam.wx(sky.cam.w / 2));
        shownLambda = to;
        sky.setModel(model.value, to);
        sky.cam.x0 = sky.xOf(center) - sky.cam.w / 2 / sky.cam.kx;
        request();
        return;
      }
      morph = { from: shownLambda, to, start: performance.now() };
      request();
    });
    const offSel = effect(() => {
      const id = selected.value;
      void second.value;
      void layers.value;
      void onlyLines.value;
      void meridian.value;
      void epochMode.value;
      void hovered.value;
      void focused.value;
      void first.value;
      void lineFlip.value;
      void pins.value;
      if (id) {
        introDone.value = true;
        const p = byId.get(id)!;
        setAnnounce(typo([`${p.name}${p.disambig ? `, ${p.disambig}` : ''}`, lifeText(id), placeText(id)].filter(Boolean).join('; ')));
      }
      request();
    });
    // панель или ярусы эпох легли поверх выбранного лица — небо сдвигается так, чтобы лицо было видно
    const offPanel = effect(() => {
      if (!panel.value && !epochMode.value) return;
      requestAnimationFrame(() => {
        const id = selected.value;
        const n = id ? sky.node(id) : null;
        if (!id || !n) return;
        const L = sheetOverlap();
        const [vTop, vBottom] = visibleRows();
        const x = sky.cam.sx(sky.xOf(n.t0));
        const y = sky.cam.sy(n.lane);
        if ((L > 0 && x < L + 24) || y < vTop + 20 || y > vBottom - 10) flyNow(id);
      });
    });
    const offLines = effect(() => {
      if (onlyLines.value) flowStart = performance.now();
      request();
    });

    const input = attachPointer(sky, canvas, request, setTip);

    return () => {
      ro.disconnect();
      offTheme();
      offModel();
      offLambda();
      offSel();
      offLines();
      offPanel();
      input.dispose();
      if (raf) cancelAnimationFrame(raf);
      void dirty;
    };
  }, []);

  const onKey = (e: KeyboardEvent) => skyKey(e, canvasRef.current);


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
          onKeyDown={onKey}
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
        {!introDone.value && <Cartouche high={!column && skyW < CARTOUCHE_BESIDE} />}
        <ul class="visually-hidden" aria-label="Видимые на карте ключевые лица">
          {visibleForSR.map((id) => (
            <li key={id}>
              <button
                onClick={() => {
                  if (!pickSecond(id)) selected.value = id;
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
      </div>
      {column && panel.value === 'view' && <ViewSheet />}
    </>
  );
}

