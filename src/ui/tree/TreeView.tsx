/**
 * Древо карточек (решение 73; просьба владельца 28 сентября: «на самом атласе открывать карточки и разворачивать их
 * в понятную структуру»): карточки лиц и союзов на полотне слева направо — лица, их союз, дети союза, союзы детей…
 * Справа, как прежде, — подробная карточка (Folio.tsx; карточка союза — card/Union.tsx).
 *
 *  — Полотно: DOM-карточки на месте раскладки (src/engine/tree.ts), связи — SVG под ними; всё — в слое с transform.
 *    Протяжка сдвигает, колесо масштабирует у указателя (0,3…1,6), щипок — на касании. Органы в углу: «−», «+»,
 *    «Вписать всё», «К выбранному»; клавиши «+», «−» и «0» — по физическим клавишам (KeyboardEvent.code), как на небе.
 *  — После раскрытия раскрывавшая карточка остаётся на месте, а камера за 300 мс (при ослабленном движении — сразу)
 *    сдвигается ровно настолько, чтобы раскрытая группа была видна.
 *  — Подсветка выбранного лица (решение 69): потомки — цветом ветви со свечением, бледнее по поколениям; путь к
 *    предкам — мягкое светлое свечение; остальные связи гаснут до 40 %.
 *  — Клавиатура: карточки — в порядке Tab по столбцам; ←/→ — к соседу по связи, ↑/↓ — в столбце; Enter — выбрать,
 *    пробел — главная команда. Объявления — в вежливой живой области.
 *
 * Состояние раскрытия — общее с небом «набор» (src/ui/reveal.ts); команды — src/ui/tree/model.ts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { byId } from '../../data/atlas.ts';
import { personKey, type TreeLayout, type TreeNode } from '../../engine/tree.ts';
import type { Union } from '../../engine/unions.ts';
import { branchColor, branchFade, branchFloor } from '../../render/branches.ts';
import { branchMapOf } from '../../render/marks.ts';
import { model, pickSecond, selected, theme } from '../../state.ts';
import { expanded, selectUnion, selectedUnion, startWith, unionById } from '../reveal.ts';
import { addToWork, linkSet, workSet } from '../work.ts';
import { isCharKey, isTextField, letterKeys } from '../keys.ts';
import { sheetStop } from '../sheet.ts';
import { reduced } from '../sky/view.ts';
import { plural } from '../common.tsx';
import { nameCase } from '../text/ru.ts';
import { unionTitle } from '../card/Union.tsx';
import { OthersCard, PersonCard, UnionCard, UnnamedCard, type CardProps } from './Cards.tsx';
import { clampK, edgePath, fitCam, K_AUTO, K_MAX, K_MIN, lerpCam, nodeBox, revealCam, toScreen, unionBox, zoomAt, type Box, type Cam } from './geom.ts';
import {
  askCards, closeKids, continueBranch, foldBranch, hideParents, highlightOf, isOthers, neighbor, openKids, othersUnion, personCmds, revealState, ribbonOf,
  showParents, tabOrder, treeLayout, treePersons, treeReadOnly, type Glow, type Highlight,
} from './model.ts';
import '../../styles/tree.css';

/** Древо на экране: «Вписать всё» для верхней строки («Толедот») и клавиши «0». */
const treeRef: { fit: (() => void) | null } = { fit: null };
/** Вписать всё древо в окно (как «Вписать всё»); древа нет на экране — false. */
export function fitTree(): boolean {
  if (!treeRef.fit) return false;
  treeRef.fit();
  return true;
}

/** Масштаб камеры древа: органы выключают «+» и «−» у предела. */
const camK = signal(1);
/** Камера и окно древа — для миникарты. */
const camView = signal<{ cam: Cam; w: number; h: number }>({ cam: { x: 0, y: 0, k: 1 }, w: 0, h: 0 });
/** Шаг «+» и «−»: ×1,25. */
const STEP = 1.25;
/** Ход камеры, мс (задача N1: 300 мс, без пружин). */
const MOVE_MS = 300;

const gen = (id: string) => {
  const p = byId.get(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
};
const nm = (id: string) => byId.get(id)?.name ?? id;

/** Цвет неба темы (#rrggbb) — фон, к которому считается различимость бледных ветвей. */
function skyHex(): string {
  if (typeof document === 'undefined') return '#0d1b34';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : theme.peek() === 'day' ? '#e9eef4' : '#0d1b34';
}

/** Класс и цвет подсветки узла или связи. */
function glowStyle(g: Glow | undefined, hl: Highlight | null, sky: string): { cls: string; color?: string; a?: number } {
  if (!hl) return { cls: '' };
  if (!g) return { cls: 'dim' };
  if (g.kind === 'self') return { cls: 'self' };
  if (g.kind === 'anc') return { cls: 'anc' };
  const c = branchColor(g.branch, theme.value);
  return { cls: 'desc', color: c, a: branchFade(g.gen, branchFloor(c, [sky])) };
}

export function TreeView() {
  const t = treeLayout.value;
  const sel = selected.value;
  const selU = selectedUnion.value;
  const exp = expanded.value;
  void workSet.value;
  const wrap = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ x: 0, y: 0, k: 1 });
  const anim = useRef(0);
  const size = useRef({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const prev = useRef<TreeLayout | null>(null);
  /** карточка, от которой раскрывали: остаётся на месте экрана */
  const pending = useRef<string | null>(null);
  const [said, setSaid] = useState({ text: '', n: 0 });
  const say = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));
  const dragged = useRef(false);
  /** карточка, в которой фокус (или была, пока он не ушёл из древа) */
  const focusedKey = useRef<string | null>(null);

  // тела карточек (записи о детях без имён, возраст) — по томам лиц древа
  useEffect(() => askCards(treePersons(t)), [t]);

  // ---------- камера ----------
  const apply = (c: Cam) => {
    cam.current = c;
    if (plane.current) plane.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.k})`;
    if (Math.abs(camK.peek() - c.k) > 1e-3) camK.value = c.k;
    camView.value = { cam: c, w: size.current.w, h: size.current.h };
  };
  const stop = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = 0;
  };
  const moveTo = (to: Cam, ms = MOVE_MS) => {
    stop();
    if (reduced() || ms <= 0) return apply(to);
    const from = cam.current;
    const t0 = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / ms);
      apply(lerpCam(from, to, f));
      anim.current = f < 1 ? requestAnimationFrame(step) : 0;
    };
    anim.current = requestAnimationFrame(step);
  };
  const allBox = (lay: TreeLayout) => unionBox(lay.nodes.map(nodeBox));
  const fitAll = (lay: TreeLayout, animate: boolean, first = false) => {
    const b = allBox(lay);
    const { w, h } = size.current;
    if (!b || !w) return;
    // видимая часть: под строкой у кромки и над листом карточки телефона
    const top = Math.max(0, topInset() - 24);
    const vh = Math.max(120, h - top - Math.max(0, bottomInset() - 24));
    let to = fitCam(b, w, vh, { m: 48, kMax: 1, left: first });
    to = { ...to, y: to.y + top };
    // первый показ большого древа: не мельче K_AUTO — посередине окна выбранное лицо или первое лицо начала
    if (first && to.k < K_AUTO) {
      const sk = selected.peek() ? personKey(selected.peek()!) : null;
      const at = (sk && lay.byKey.get(sk)) || lay.nodes.find((n) => n.kind === 'person') || lay.nodes[0];
      const a = nodeBox(at);
      to = { k: K_AUTO, x: w / 2 - (a.x + a.w / 2) * K_AUTO, y: top + vh / 2 - (a.y + a.h / 2) * K_AUTO };
    }
    if (animate) moveTo(to);
    else apply(to);
  };
  const boxOf = (key: string) => {
    const n = treeLayout.peek().byKey.get(key);
    return n ? nodeBox(n) : null;
  };
  /** Верхнее поле: строки у кромки области древа (TreeBars: «Раскрыто N лиц») не закрывают показанную карточку. */
  const topInset = () => {
    const w = wrap.current;
    const bar = w?.parentElement?.querySelector<HTMLElement>(':scope > .skytop');
    if (!w || !bar) return 24;
    return Math.max(24, bar.getBoundingClientRect().bottom - w.getBoundingClientRect().top + 8);
  };
  /**
   * Нижнее поле: лист карточки на телефоне (src/ui/sheet.ts) лежит поверх древа — видимая часть кончается у его верхнего
   * края, как у неба. На компьютере карточка — колонка сетки, поле обычное.
   */
  const bottomInset = () => {
    const w = wrap.current;
    const f = document.querySelector<HTMLElement>('.app > .folio[data-stop]');
    if (!w || !f) return 24;
    const r = w.getBoundingClientRect();
    const top = f.getBoundingClientRect().top;
    return top < r.bottom ? Math.max(24, r.bottom - top + 12) : 24;
  };
  /** Показать прямоугольник: камера сдвигается ровно настолько, чтобы он был виден. */
  const show = (b: Box, pin?: [number, number], animate = true) => {
    const { w, h } = size.current;
    const mb = bottomInset();
    const to = revealCam(cam.current, b, w, h, { m: 24, mt: topInset(), pin, kMin: K_AUTO, mb });
    if (Math.abs(to.x - cam.current.x) < 0.5 && Math.abs(to.y - cam.current.y) < 0.5 && Math.abs(to.k - cam.current.k) < 1e-3) return;
    if (animate) moveTo(to);
    else apply(to);
  };
  const zoomBy = (f: number, at?: [number, number]) => {
    stop();
    const { w, h } = size.current;
    const [sx, sy] = at ?? [w / 2, h / 2];
    moveTo(zoomAt(cam.current, clampK(cam.current.k * f), sx, sy), 200);
  };
  const toSelected = () => {
    const key = selU && t.byKey.has(selU) ? selU : sel ? personKey(sel) : null;
    const b = key ? boxOf(key) : null;
    if (!b) return;
    const { w, h } = size.current;
    const k = Math.max(cam.current.k, 0.8);
    const top = topInset();
    const mid = (top + h - bottomInset()) / 2;
    moveTo({ k, x: w / 2 - (b.x + b.w / 2) * k, y: mid - (b.y + b.h / 2) * k });
  };
  treeRef.fit = () => fitAll(treeLayout.peek(), true);

  // размер окна древа
  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const had = size.current.w > 0;
      size.current = { w: r.width, h: r.height };
      if (!had && r.width > 0) {
        fitAll(treeLayout.peek(), false, true);
        prev.current = treeLayout.peek();
        setReady(true);
      } else apply(cam.current);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      stop();
      treeRef.fit = null;
    };
  }, []);

  // раскладка сменилась: раскрывавшая карточка — на месте, раскрытая группа — в окне
  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = t;
    // карточка с фокусом переставлена в разметке (порядок Tab — по столбцам) — фокус возвращается на неё
    const fk = focusedKey.current;
    const a = document.activeElement;
    if (fk && t.byKey.has(fk) && (!a || a === document.body)) wrap.current?.querySelector<HTMLElement>(`.tc[data-key="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
    if (!ready || !size.current.w) return;
    apply(cam.current);
    if (!p || p === t) return;
    const common = t.nodes.filter((n) => p.byKey.has(n.key));
    const gone = p.nodes.filter((n) => !t.byKey.has(n.key)).length;
    const want = pending.current;
    pending.current = null;
    // новое начало (почти всё древо сменилось) — вписать заново
    if (!common.length || (!want && gone > p.nodes.length / 2)) return fitAll(t, false, true);
    const { w, h } = size.current;
    const c = cam.current;
    let anchor = want && p.byKey.has(want) && t.byKey.has(want) ? want : null;
    if (!anchor) {
      // ближайший к середине окна из оставшихся
      let best = Infinity;
      for (const n of common) {
        const s = toScreen(c, nodeBox(p.byKey.get(n.key)!));
        const d = Math.hypot(s.x + s.w / 2 - w / 2, s.y + s.h / 2 - h / 2);
        if (d < best) {
          best = d;
          anchor = n.key;
        }
      }
    }
    const pa = nodeBox(p.byKey.get(anchor!)!);
    const na = nodeBox(t.byKey.get(anchor!)!);
    stop();
    apply({ x: c.x + (pa.x - na.x) * c.k, y: c.y + (pa.y - na.y) * c.k, k: c.k });
    const added = t.nodes.filter((n) => !p.byKey.has(n.key));
    if (!added.length) return;
    // лицо, выбранное вне древа и взятое в набор, — его карточку в вид
    const sk = selected.peek() ? personKey(selected.peek()!) : null;
    if (!want && sk && !p.byKey.has(sk) && t.byKey.has(sk)) return show(nodeBox(t.byKey.get(sk)!));
    const b = unionBox([...added.map(nodeBox), na])!;
    const s = toScreen(cam.current, na);
    show(b, [s.x + s.w / 2, s.y + s.h / 2]);
  }, [t, ready]);

  // выбранное лицо сменилось (поиск, ссылка в карточке справа): его нет на древе — оно берётся в набор (помета «само»)
  // и появляется карточкой; есть — камера его показывает. Лист карточки телефона сменил высоту — выбранное не под ним
  const stopNow = sheetStop.value;
  useEffect(() => {
    if (!ready || !sel || !byId.has(sel)) return;
    if (!treeLayout.peek().byKey.has(personKey(sel)) && !linkSet.peek()) {
      pending.current = null;
      addToWork(sel);
      return;
    }
    // лист телефона раскрывается после выбора — места хватает только в следующем кадре
    const id = requestAnimationFrame(() => {
      const b = boxOf(personKey(sel));
      if (b) show(b);
    });
    return () => cancelAnimationFrame(id);
  }, [sel, ready, stopNow]);

  // колесо: масштаб у указателя (слушатель не пассивный — иначе страница прокрутится)
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.tree-ctl, .tree-map')) return;
      e.preventDefault();
      stop();
      const r = el.getBoundingClientRect();
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const f = Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015));
      apply(zoomAt(cam.current, clampK(cam.current.k * f), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // «+», «−», «0» — по физическим клавишам и без фокуса на древе, как на небе; раньше клавиш неба (фаза захвата)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || isTextField(e.target)) return;
      const tg = e.target instanceof HTMLElement ? e.target : null;
      if (tg?.closest('[role="menu"], [role="listbox"], [role="dialog"]')) return;
      const plus = e.code === 'Equal' || e.code === 'NumpadAdd';
      const minus = e.code === 'Minus' || e.code === 'NumpadSubtract';
      if (plus || minus) {
        e.preventDefault();
        if (!e.shiftKey && !e.altKey) zoomBy(plus ? STEP : 1 / STEP);
      } else if ((e.code === 'Digit0' || e.code === 'Numpad0') && !e.shiftKey && !e.altKey && (letterKeys.peek() || !isCharKey(e))) {
        // «0» — клавиша-знак: слушается выключателя «Клавиши-буквы» (решение 48; src/ui/keys.ts)
        e.preventDefault();
        fitAll(treeLayout.peek(), true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---------- протяжка и щипок ----------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; d: number; moved: boolean } | null>(null);
  const centroid = () => {
    const ps = [...ptrs.current.values()];
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    const d = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    return { x, y, d };
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('button, .tree-ctl, .tree-map')) return;
    stop();
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = centroid();
    gesture.current = { x: c.x, y: c.y, d: c.d, moved: gesture.current?.moved ?? false };
  };
  const onMove = (e: PointerEvent) => {
    if (!ptrs.current.has(e.pointerId) || !gesture.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const c = centroid();
    if (!g.moved && Math.hypot(c.x - g.x, c.y - g.y) < 5 && (!g.d || Math.abs(c.d - g.d) < 5)) return;
    if (!g.moved) {
      g.moved = true;
      wrap.current!.classList.add('dragging');
      for (const id of ptrs.current.keys()) wrap.current!.setPointerCapture?.(id);
    }
    let next = { ...cam.current, x: cam.current.x + c.x - g.x, y: cam.current.y + c.y - g.y };
    if (g.d && c.d) {
      const r = wrap.current!.getBoundingClientRect();
      next = zoomAt(next, clampK(next.k * (c.d / g.d)), c.x - r.left, c.y - r.top);
    }
    apply(next);
    gesture.current = { x: c.x, y: c.y, d: c.d, moved: true };
  };
  const onUp = (e: PointerEvent) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    if (ptrs.current.size) {
      const c = centroid();
      gesture.current = { x: c.x, y: c.y, d: c.d, moved: gesture.current?.moved ?? false };
      return;
    }
    if (gesture.current?.moved) {
      // щелчок после протяжки не выбирает карточку
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 0);
    }
    gesture.current = null;
    wrap.current?.classList.remove('dragging');
  };

  // ---------- действия карточек ----------
  const pick = (id: string) => {
    if (dragged.current) return;
    if (!pickSecond(id)) selected.value = id;
  };
  const moreUnion = (u: Union) => {
    if (dragged.current) return;
    const who = u.a ?? u.b ?? u.kids[0];
    if (!who) return;
    if (!pickSecond(who)) selected.value = who;
    selectUnion(u.id);
  };
  const run = (key: string, f: () => void) => {
    pending.current = key;
    f();
    // древо не изменилось — метка не должна дожить до чужой перестройки (перерисовка — в микрозадаче, раньше таймера)
    setTimeout(() => {
      if (pending.current === key) pending.current = null;
    }, 0);
  };
  const unionText = (u: Union) => {
    const g = [u.a, u.b].filter((x): x is string => !!x).map(gen);
    return g.length && g.every(Boolean) ? `союз ${g.join(' и ')}` : `союз: ${unionTitle(u)}`;
  };
  const kidsText = (n: number) => `${n} ${plural(n, 'ребёнок', 'ребёнка', 'детей')}`;
  const personActs = (id: string, key: string) => ({
    onMore: () =>
      run(key, () => {
        const n = continueBranch(id);
        const g = gen(id);
        say(g ? `Показаны союзы ${g}: ${n}` : `Показаны союзы: ${nm(id)}, ${n}`);
      }),
    onFold: () =>
      run(key, () => {
        foldBranch(id);
        const g = gen(id);
        say(g ? `Ветвь ${g} свёрнута` : `Ветвь свёрнута: ${nm(id)}`);
      }),
    onParents: () =>
      run(key, () => {
        showParents(id);
        const g = gen(id);
        say(g ? `Показаны родители ${g}` : `Показаны родители: ${nm(id)}`);
      }),
    onHideParents: () =>
      run(key, () => {
        hideParents(id);
        const g = gen(id);
        say(g ? `Родители ${g} скрыты` : `Родители скрыты: ${nm(id)}`);
      }),
  });
  const kidsAct = (u: Union, key: string) => () =>
    run(key, () => {
      if (u.id in expanded.peek()) {
        closeKids(u);
        say(`Свёрнуты дети: ${unionText(u)}`);
      } else {
        openKids(u);
        say(`Раскрыт ${unionText(u)}: ${kidsText(u.kids.length)}`);
      }
    });

  // ---------- подсветка ----------
  const sky = useMemo(skyHex, [theme.value]);
  const hl = useMemo(() => (sel ? highlightOf(t, sel, branchMapOf(sel, model.value.id)) : null), [t, sel, model.value.id]);
  const rs = revealState();
  const order = useMemo(() => tabOrder(t), [t]);

  // ---------- клавиатура на карточке ----------
  const focusKey = (key: string | null) => {
    if (!key) return;
    const el = wrap.current?.querySelector<HTMLElement>(`.tc[data-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    const b = boxOf(key);
    if (b) show(b);
  };
  const mainCommand = (n: TreeNode) => {
    const el = wrap.current?.querySelector<HTMLElement>(`.tc[data-key="${CSS.escape(n.key)}"] .tc-cmds button`);
    el?.click();
  };
  const keyFor = (n: TreeNode, select: () => void) => (e: KeyboardEvent) => {
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.code] as 'left' | 'right' | 'up' | 'down' | undefined;
    if (dir && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      focusKey(neighbor(t, n.key, dir));
      return;
    }
    if (e.target !== e.currentTarget) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      select();
    } else if (e.code === 'Space') {
      e.preventDefault();
      mainCommand(n);
    }
  };
  // фокус Tab на карточке за краем окна: окно не прокручивается (overflow: hidden) — камера показывает карточку
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tc');
    focusedKey.current = el?.dataset.key ?? null;
    const w = wrap.current!;
    if (w.scrollLeft || w.scrollTop) w.scrollLeft = w.scrollTop = 0;
    const b = el?.dataset.key ? boxOf(el.dataset.key) : null;
    if (b) show(b);
  };

  // ---------- разметка ----------
  // союз из раскладки может нести условного ребёнка «другие дети» (model.ts, withOthers): карточкам — союз из данных
  const real = (u: Union) => unionById(u.id) ?? u;
  // набор из чужой ссылки — только просмотр: команд раскрытия нет (model.ts, treeReadOnly)
  const ro = treeReadOnly.value;
  const NO_CMDS = { more: false, fold: false, parents: false, hideParents: false };
  const cards = order.map((n) => {
    const g = hl?.nodes.get(n.key);
    const gs = glowStyle(g, hl, sky);
    const base: Omit<CardProps, 'onKey'> = {
      node: n,
      current: false,
      glow: gs.cls ? `hl-${gs.cls}` : '',
      color: gs.color,
      onSelect: () => {},
    };
    if (n.kind === 'person' && isOthers(n.id)) {
      const u = t.byKey.get(othersUnion(n.id));
      if (!u || u.kind !== 'union') return null;
      const father = u.union.a ?? u.union.b ?? '';
      const select = () => father && pick(father);
      return <OthersCard key={n.key} {...base} u={real(u.union)} onSelect={select} onKey={keyFor(n, select)} />;
    }
    if (n.kind === 'person') {
      const select = () => pick(n.id);
      return (
        <PersonCard
          key={n.key}
          {...base}
          current={sel === n.id && !selU}
          id={n.id}
          cmds={ro ? NO_CMDS : personCmds(t, n.id, rs)}
          {...personActs(n.id, n.key)}
          onSelect={select}
          onKey={keyFor(n, select)}
        />
      );
    }
    if (n.kind === 'union') {
      const u = real(n.union);
      const select = () => moreUnion(u);
      return (
        <UnionCard
          key={n.key}
          {...base}
          current={selU === u.id}
          u={u}
          open={u.id in exp}
          hidden={n.hidden}
          noKids={ro}
          onKids={kidsAct(u, n.key)}
          onMore={select}
          onSelect={select}
          onKey={keyFor(n, select)}
        />
      );
    }
    const u = real(n.union);
    const select = () => moreUnion(u);
    return <UnnamedCard key={n.key} {...base} u={u} role={n.role} onSelect={select} onKey={keyFor(n, select)} />;
  });

  const links = t.edges.map((e, i) => {
    const g = hl?.edges.get(i);
    const gs = glowStyle(g, hl, sky);
    const toOthers = e.kind === 'child' && isOthers(e.kid ?? '');
    const kind = e.kind === 'unnamed' || toOthers ? 'dashed' : '';
    const rb = ribbonOf(t, e);
    const d = edgePath(t, e);
    const cls = (s: string) => [s, kind, gs.cls].filter(Boolean).join(' ');
    return (
      <g key={`${e.from}>${e.to}`} data-edge={`${e.from}>${e.to}`}>
        {(gs.cls === 'desc' || gs.cls === 'anc' || gs.cls === 'self') && <path class={cls('glow')} d={d} style={gs.color ? { '--c': gs.color, '--a': String(gs.a ?? 1) } : undefined} />}
        {rb ? (
          <>
            {rb.joseph && <path class={['rb mt', rb.interp && 'interp', gs.cls === 'dim' && 'dim'].filter(Boolean).join(' ')} d={rb.mary ? edgePath(t, e, 1.75) : d} />}
            {rb.mary && <path class={['rb lk', rb.interp && 'interp', gs.cls === 'dim' && 'dim'].filter(Boolean).join(' ')} d={rb.joseph ? edgePath(t, e, -1.75) : d} />}
          </>
        ) : (
          <path class={cls('ln')} d={d} style={gs.color ? { '--c': gs.color, '--a': String(gs.a ?? 1) } : undefined} />
        )}
      </g>
    );
  });

  const empty = !t.nodes.length;
  const selOn = !!((selU && t.byKey.has(selU)) || (sel && t.byKey.has(personKey(sel))));
  return (
    <section
      class="tree"
      ref={wrap}
      aria-label="Древо: карточки лиц и союзов"
      data-nodes={t.nodes.length}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onFocusIn={onFocusIn}
      onFocusOut={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !wrap.current?.contains(to)) focusedKey.current = null;
      }}
      onScroll={(e) => {
        const w = e.currentTarget as HTMLElement;
        if (w.scrollLeft || w.scrollTop) w.scrollLeft = w.scrollTop = 0;
      }}
    >
      <p class="visually-hidden">
        Карточки идут по столбцам слева направо: лица, их союз, дети союза. Стрелки влево и вправо — к карточке, связанной с этой, вверх и вниз — по
        столбцу; Enter — открыть подробную карточку справа; пробел — главная команда карточки.
      </p>
      <div class="tree-plane" ref={plane} style={{ width: `${t.width}px`, height: `${t.height}px` }}>
        <svg class="tree-links" width={t.width} height={t.height} aria-hidden="true">
          {links}
        </svg>
        {cards}
      </div>
      {empty && (
        <div class="tree-empty">
          <p>На древе пока никого нет.</p>
          <p>
            <button type="button" class="cmd" onClick={() => startWith('adam')}>
              С Адама
            </button>
            <button type="button" class="cmd" onClick={() => startWith('jesus')}>
              С Иисуса Христа
            </button>
          </p>
        </div>
      )}
      {!empty && <MiniMap t={t} sel={sel} onGo={(px, py) => {
        const { w, h } = size.current;
        const k = cam.current.k;
        stop();
        apply({ k, x: w / 2 - px * k, y: h / 2 - py * k });
      }} />}
      <TreeControls onZoom={(f) => zoomBy(f)} onFit={() => fitAll(t, true)} onSelected={toSelected} selOn={selOn} />
      <div class="visually-hidden" aria-live="polite">
        {said.text}
        {said.n % 2 ? ' ' : ''}
      </div>
    </section>
  );
}

/** Наибольший размер миникарты, px. */
const MAP_W = 200;
const MAP_H = 120;

/**
 * Миникарта (по образцу владельца): всё древо мелко, рамка — видимая часть; щелчок и протяжка по ней ведут камеру.
 * Видна, только когда древо не помещается в окно. Для мыши и касания; клавиатура ведёт камеру карточками и «Вписать всё»,
 * поэтому для диктора миникарта скрыта.
 */
function MiniMap({ t, sel, onGo }: { t: TreeLayout; sel: string | null; onGo: (px: number, py: number) => void }) {
  const v = camView.value;
  const sc = Math.min(MAP_W / Math.max(1, t.width), MAP_H / Math.max(1, t.height));
  const mw = Math.max(24, t.width * sc);
  const mh = Math.max(12, t.height * sc);
  const rects = useMemo(
    () =>
      t.nodes.map((n) => {
        const b = nodeBox(n);
        return <rect key={n.key} class={n.kind === 'person' && n.id === sel ? 'cur' : n.kind} x={b.x * sc} y={b.y * sc} width={Math.max(1, b.w * sc)} height={Math.max(1, b.h * sc)} />;
      }),
    [t, sc, sel],
  );
  const { cam, w, h } = v;
  // всё древо в окне — миникарта не нужна
  const all = useMemo(() => unionBox(t.nodes.map(nodeBox)), [t]);
  const on = all ? toScreen(cam, all) : null;
  if (!w || !on || (on.x >= -1 && on.y >= -1 && on.x + on.w <= w + 1 && on.y + on.h <= h + 1)) return null;
  const vx = (-cam.x / cam.k) * sc;
  const vy = (-cam.y / cam.k) * sc;
  const go = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    onGo((e.clientX - r.left) / sc, (e.clientY - r.top) / sc);
  };
  return (
    <svg
      class="tree-map"
      width={mw}
      height={mh}
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
        go(e);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as SVGElement).hasPointerCapture?.(e.pointerId)) go(e);
      }}
    >
      {rects}
      <rect class="view" x={vx} y={vy} width={(w / cam.k) * sc} height={(h / cam.k) * sc} />
    </svg>
  );
}

/** Органы древа в углу: «−», «+», «Вписать всё», «К выбранному». Выключенные — в порядке Tab (aria-disabled). */
function TreeControls({ onZoom, onFit, onSelected, selOn }: { onZoom: (f: number) => void; onFit: () => void; onSelected: () => void; selOn: boolean }) {
  const k = camK.value;
  const minOff = k <= K_MIN + 1e-3;
  const maxOff = k >= K_MAX - 1e-3;
  return (
    <div class="tree-ctl" role="group" aria-label="Вид древа">
      <button type="button" class="zm" aria-label="Отдалить" title={minOff ? 'Дальше нельзя' : 'Отдалить (−)'} aria-keyshortcuts="Minus" aria-disabled={minOff ? 'true' : undefined} onClick={() => !minOff && onZoom(1 / STEP)}>
        −
      </button>
      <button type="button" class="zm" aria-label="Приблизить" title={maxOff ? 'Ближе нельзя' : 'Приблизить (+)'} aria-keyshortcuts="Equal" aria-disabled={maxOff ? 'true' : undefined} onClick={() => !maxOff && onZoom(STEP)}>
        +
      </button>
      <button type="button" class="wd" title="Вписать всё древо в окно (0)" aria-keyshortcuts="0" onClick={onFit}>
        Вписать всё
      </button>
      <button
        type="button"
        class="wd"
        title={selOn ? 'Показать выбранную карточку' : 'Выбранного лица нет на древе'}
        aria-disabled={selOn ? undefined : 'true'}
        onClick={() => selOn && onSelected()}
      >
        К выбранному
      </button>
    </div>
  );
}

