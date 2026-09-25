import { useEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { Sky, readPalette, type SkyState } from '../render/sky.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';
import {
  selected, second, hovered, lambda, model, layers, onlyLines, meridian, panel, pickMode, theme, introDone, epochMode, lineFlip, pins,
} from '../state.ts';
import { skyRef, viewTick, plural } from './common.tsx';
import { formatSpan, formatYear } from '../engine/years.ts';
import { relate } from '../engine/kinship.ts';
import { drawTiers } from '../render/tiers.ts';

export const kinPath = { current: null as string[] | null };

export function lifeText(id: string): string {
  const c = model.value.chrono.get(id);
  if (!c) return '';
  const approx = c.cls !== 'exact';
  if (c.cls === 'epochal') return 'время жизни не установлено';
  if (c.d !== null) return formatSpan(c.b, c.d, approx);
  return `род. ${formatYear(c.b, { approx })}`;
}

function highlightFor(id: string | null, other: string | null): Map<string, 'self' | 'anc' | 'desc' | 'path'> | null {
  if (!id) return null;
  const m = new Map<string, 'self' | 'anc' | 'desc' | 'path'>();
  m.set(id, 'self');
  if (other && kinPath.current) {
    for (const p of kinPath.current) m.set(p, 'path');
    m.set(other, 'self');
    return m;
  }
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

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SkyView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState('');

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
      let highlight = highlightFor(selected.value, second.value);
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
        model: model.value, lambda: shownLambda, selected: selected.value, second: second.value, hovered: hovered.value, focus: null,
        highlight, layers: layers.value, onlyLines: onlyLines.value, meridian: meridian.value,
        tensionPersons, flow: flowing ? now - flowStart : 0, reduced: reduced(), intro, lineFlip: lineFlip.value, pins: new Set(pins.value),
      };
      sky.draw(state);
      if (epochMode.value) drawTiers(sky, state);
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
    skyRef.flyTo = (id: string) => {
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
      sky.cam.flyTo((x0 + x1) / 2, n.lane, Math.max(50, x1 - x0), request, reduced());
    };

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      const first = sky.cam.w === 1000 && sky.cam.h === 700;
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
      void lineFlip.value;
      void pins.value;
      if (id) {
        introDone.value = true;
        const p = byId.get(id)!;
        setAnnounce(`${p.name}${p.disambig ? `, ${p.disambig}` : ''}; ${lifeText(id)}; ${groupById.get(p.group)?.name ?? ''}`);
      }
      request();
    });
    const offLines = effect(() => {
      if (onlyLines.value) flowStart = performance.now();
      request();
    });

    // ---------- указатель ----------
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { d: number; cx: number; cy: number } | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) drag = { x: p.x, y: p.y, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        drag = null;
      }
      introDone.value = true;
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        sky.cam.pan(cx - pinch.cx, cy - pinch.cy);
        sky.cam.zoomAt(cx, cy, d / pinch.d);
        pinch = { d, cx, cy };
        request();
        return;
      }
      if (drag) {
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        if (drag.moved || Math.abs(dx) + Math.abs(dy) > 3) {
          drag.moved = true;
          canvas.classList.add('dragging');
          sky.cam.pan(dx, dy);
          drag.x = p.x;
          drag.y = p.y;
          setTip(null);
          request();
        }
        return;
      }
      if (p.y < 26) {
        meridian.value = sky.tOf(sky.cam.wx(p.x));
        setTip(null);
        return;
      } else if (meridian.value !== null && !pointers.size) meridian.value = null;
      const hit = sky.hit(p.x, p.y, e.pointerType === 'touch' ? 22 : 12);
      if (hit !== hovered.value) hovered.value = hit;
      setTip(hit ? { id: hit, x: p.x, y: p.y } : null);
    };
    const onUp = (e: PointerEvent) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      canvas.classList.remove('dragging');
      if (pointers.size < 2) pinch = null;
      const edge = sky.edgeHits.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (drag && !drag.moved && edge) {
        skyRef.flyTo(edge.id);
        drag = null;
        return;
      }
      if (drag && !drag.moved) {
        if (pins.value.length) pins.value = [];
        const hit = sky.hit(p.x, p.y, e.pointerType === 'touch' ? 22 : 12);
        if (pickMode.value === 'kinship' && hit && selected.value && hit !== selected.value) {
          second.value = hit;
          pickMode.value = null;
          const rel = relate(graph, selected.value, hit, 1)[0];
          kinPath.current = rel ? [...new Set(rel.steps.flatMap((s) => [s.from, s.to]))] : null;
          panel.value = 'kinship';
        } else if (pickMode.value === 'spread' && hit && selected.value && hit !== selected.value) {
          second.value = hit;
          pickMode.value = null;
          panel.value = 'spread';
        } else if (hit) {
          selected.value = hit;
        }
      }
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (e.shiftKey) sky.cam.pan(-e.deltaY, 0);
      else if (e.ctrlKey) sky.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.01));
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) sky.cam.pan(-e.deltaX, 0);
      else sky.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016));
      introDone.value = true;
      request();
    };
    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      sky.cam.zoomAt(p.x, p.y, 2);
      request();
    };
    const onLeave = () => {
      hovered.value = null;
      meridian.value = null;
      setTip(null);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);

    return () => {
      ro.disconnect();
      offTheme();
      offModel();
      offLambda();
      offSel();
      offLines();
      if (raf) cancelAnimationFrame(raf);
      void dirty;
    };
  }, []);

  // клавиатура — по физическим клавишам, поэтому работает и на русской раскладке
  const onKey = (e: KeyboardEvent) => {
    const sky = skyRef.current;
    if (!sky) return;
    const id = selected.value;
    const go = (to: string | null | undefined) => {
      if (to && byId.has(to)) {
        selected.value = to;
        skyRef.flyTo(to);
      }
    };
    switch (e.code) {
      case 'Equal':
      case 'NumpadAdd':
        sky.cam.zoomAt(sky.cam.w / 2, sky.cam.h / 2, 1.5);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        sky.cam.zoomAt(sky.cam.w / 2, sky.cam.h / 2, 1 / 1.5);
        break;
      case 'ArrowLeft':
        sky.cam.pan(120, 0);
        break;
      case 'ArrowRight':
        sky.cam.pan(-120, 0);
        break;
      case 'ArrowUp':
        sky.cam.pan(0, 90);
        break;
      case 'ArrowDown':
        sky.cam.pan(0, -90);
        break;
      case 'BracketLeft':
        if (id) go(byId.get(id)?.father ?? byId.get(id)?.mother);
        break;
      case 'BracketRight':
        if (id) go((graph.childrenOf.get(id) ?? []).find((e2) => e2.kind === 'father' || e2.kind === 'mother')?.child);
        break;
      case 'Comma':
      case 'Period': {
        if (!id) break;
        const par = byId.get(id)?.father ?? byId.get(id)?.mother;
        if (!par) break;
        const sibs = (graph.childrenOf.get(par) ?? []).filter((x) => x.kind === 'father' || x.kind === 'mother').map((x) => x.child);
        const i = sibs.indexOf(id);
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
        if (hovered.value) selected.value = hovered.value;
        break;
      default:
        return;
    }
    e.preventDefault();
    skyRef.redraw();
  };

  const tipPerson = tip ? byId.get(tip.id) : null;
  const visibleForSR = (() => {
    void viewTick.value;
    const sky = skyRef.current;
    if (!sky || !sky.model) return [];
    const out: string[] = [];
    for (let i = 0; i < sky.nodes.length && out.length < 40; i++) {
      const n = sky.nodes[i];
      if (n.ghost) continue;
      const p = byId.get(n.person)!;
      if (p.magnitude > 2) continue;
      const x = sky.cam.sx(sky.X0[i]);
      const y = sky.cam.sy(n.lane);
      if (x > 0 && x < sky.cam.w && y > 0 && y < sky.cam.h) out.push(n.person);
    }
    return out;
  })();

  return (
    <div class="sky" ref={wrap} onKeyDown={onKey}>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Звёздная карта родословий. Стрелки — сдвиг, плюс и минус — масштаб, квадратные скобки — к родителю и к ребёнку." class={pickMode.value ? 'picking' : ''} />
      {tipPerson && tip && (
        <div class="tip" style={{ left: `${Math.min(tip.x + 14, (skyRef.current?.cam.w ?? 800) - 330)}px`, top: `${tip.y + 16}px` }}>
          <b>{tipPerson.name}</b>
          {tipPerson.disambig && <span class="ds">, {tipPerson.disambig}</span>}
          <div class="yr">{lifeText(tipPerson.id)}</div>
          <div class="ds">{groupById.get(tipPerson.group)?.name}</div>
        </div>
      )}
      <SkyControls />
      {!introDone.value && <Cartouche />}
      <ul class="visually-hidden" aria-label="Видимые на карте ключевые лица">
        {visibleForSR.map((id) => (
          <li key={id}>
            <button onClick={() => (selected.value = id)}>{byId.get(id)!.name}</button>
          </li>
        ))}
      </ul>
      <div class="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function SkyControls() {
  const zoom = (f: number) => {
    const s = skyRef.current;
    if (!s) return;
    s.cam.zoomAt(s.cam.w / 2, s.cam.h / 2, f);
    skyRef.redraw();
  };
  return (
    <div class="skyctl">
      <button aria-pressed={onlyLines.value} onClick={() => (onlyLines.value = !onlyLines.value)}>
        только линии Мессии
      </button>
      <span class="scale">
        масштаб:{' '}
        <button aria-pressed={lambda.value === 1} onClick={() => (lambda.value = 1)}>
          по насыщенности
        </button>{' '}
        <button aria-pressed={lambda.value === 0} onClick={() => (lambda.value = 0)}>
          истинный
        </button>
      </span>
      <span class="zoom">
        <button aria-label="Приблизить" onClick={() => zoom(1.6)}>
          +
        </button>
        <button aria-label="Отдалить" onClick={() => zoom(1 / 1.6)}>
          −
        </button>
      </span>
    </div>
  );
}

function Cartouche() {
  const count = byId.size;
  const go = (id: string) => {
    introDone.value = true;
    selected.value = id;
    skyRef.flyTo(id);
  };
  const entries = ['adam', 'noy', 'avraam', 'moisey', 'david', 'iisus'].filter((id) => byId.has(id));
  const m = model.value;
  return (
    <div class="cartouche" role="note">
      <button class="close" onClick={() => (introDone.value = true)}>
        свернуть
      </button>
      <h1>Толедот</h1>
      <p class="sub">Звёздный атлас библейских родословий</p>
      <p class="long">
        {count} {plural(count, 'лицо', 'лица', 'лиц')} канонического Писания. Каждая звезда — человек; по горизонтали — время его жизни, яркость — место в
        повествовании. Созвездия — роды, колена и народы.
      </p>
      <p>
        <span class="swatch gold" />
        линия Иосифа (Мф 1)
        <br />
        <span class="swatch azure" />
        линия по Луке, традиционно — Марии (Лк 3)
      </p>
      <p class="muted long">
        Колесо или щипок — масштаб, перетаскивание — сдвиг, щелчок по звезде — карточка. Хронологических напряжений: {m.tensions.length}.
      </p>
      <div class="entry">
        {entries.map((id) => (
          <button key={id} onClick={() => go(id)}>
            {byId.get(id)!.name}
          </button>
        ))}
      </div>
      <p style={{ display: 'none' }}>{lines.joseph.name}</p>
    </div>
  );
}
