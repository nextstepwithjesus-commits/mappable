import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { TopBar } from './top/TopBar.tsx';
import { bindAddress } from './address.ts';
import { bindKeys } from './keys.ts';
import { bindFocus } from './focus.ts';
import { grid, panelKind, setWidth, skyFull, splitRange, unfoldCard, viewportHeight, viewportWidth, type Grid, type Widths } from './layout.ts';
import { panel, type Panel } from '../state.ts';
import { Close } from './controls.tsx';
import { plural } from './common.tsx';

export function App() {
  useEffect(() => {
    const offAddress = bindAddress();
    const offKeys = bindKeys();
    const offFocus = bindFocus();
    const onResize = () => {
      viewportWidth.value = window.innerWidth;
      viewportHeight.value = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    onResize();
    // «Небо во весь экран» (J2): фокус был в панели или карточке, а они свернулись в корешки — фокус на небо
    let shownFull = skyFull.peek();
    const offFull = effect(() => {
      const on = skyFull.value;
      if (on === shownFull) return;
      shownFull = on;
      window.setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body || !a.isConnected) document.querySelector<HTMLElement>('.sky canvas')?.focus({ preventScroll: true });
      }, 0);
    });
    return () => {
      offAddress();
      offKeys();
      offFocus();
      offFull();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const g = grid.value;
  const p = panel.value;

  // Сетка [панель][небо][карточка] (C1): ширины колонок панели и карточки считает layout.ts — по экрану, по ширинам,
  // которые задал читатель (J2), и с «Небом во весь экран»; карточка-корешок — своей шириной из folio.css.
  // Панель в разметке — сразу после верхней строки: к ней ближе с клавиатуры (I2).
  // Небо — основная область страницы (main, I3; MOB-37): main не занимает ячейку сетки (display: contents, panels.css),
  // его ячейку занимает небо; карточка — дополнение (aside), панель — область со своим заголовком.
  // Фокус при открытии и закрытии панелей и карточки и модальный лист панели на телефоне — src/ui/focus.ts.
  // Ручки-разделители (J2) — между панелью и небом и между небом и карточкой: после панели и после неба в порядке Tab.
  return (
    <div
      class={['app', g.spine && 'spine', g.full && 'full'].filter(Boolean).join(' ')}
      // ширина карточки — только у развёрнутой колонки: корешок и лист телефона — своей шириной из CSS
      style={{ '--sheet-w': `${g.sheet}px`, '--folio-w': !g.phone && g.folio > 0 && !g.spine ? `${g.folio}px` : undefined }}
    >
      <TopBar />
      {g.sheetSpine && p ? <PanelSpine id={p} /> : <Panels />}
      {splitShown(g, 'sheet') && <Splitter side="sheet" g={g} />}
      <main class="app-main">
        <h1 class="visually-hidden">Толедот — звёздный атлас библейских родословий</h1>
        {/* один атлас (решение 77): вида «Древо» больше нет — щелчок по звезде в любом показе открывает у неё карточку
            с «Родством», семья лица рисуется на небе */}
        <SkyView />
      </main>
      {splitShown(g, 'folio') && <Splitter side="folio" g={g} />}
      <Folio />
      <TimeStrip />
    </div>
  );
}

// ---------- размер областей (J2) ----------

/** Названия панелей на корешке — как в верхней строке (src/ui/top/TopBar.tsx). */
const PANEL_NAMES: Partial<Record<Exclude<Panel, null>, string>> = {
  index: 'Указатель',
  work: 'Набор',
  chapter: 'Главы',
  synopsis: 'Синопсис',
  kinship: 'Родство',
  section: 'Сквозной раздел',
  legend: 'Условные знаки',
  about: 'О карте',
  epochs: 'Эпохи',
};

/** Корешок панели в «Небе во весь экран»: «×», название и «развернуть» (как корешок карточки, C1). */
function PanelSpine({ id }: { id: Exclude<Panel, null> }) {
  const name = PANEL_NAMES[id] ?? '';
  return (
    <section class="sheet spine" aria-label={`Панель: ${name} (свёрнута)`}>
      <Close label="Закрыть панель" onClick={() => (panel.value = null)} />
      <button type="button" class="unfold" aria-label={`Развернуть панель: ${name}`} title="Развернуть панель и карточку (F)" onClick={unfoldCard}>
        <span class="nm">{name}</span>
        <span class="cmdl" aria-hidden="true">
          развернуть
        </span>
      </button>
    </section>
  );
}

/** Есть ли граница, которую можно тянуть: колонка панели или развёрнутая карточка рядом с небом. */
function splitShown(g: Grid, side: 'sheet' | 'folio'): boolean {
  if (g.phone || g.full) return false;
  return side === 'sheet' ? g.sheet > 0 : g.folio > 0 && !g.spine;
}

/** Шаг ручки со стрелок, px; с Shift — крупнее. */
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;

/**
 * Ручка-разделитель (J2): зона 24 px (на сенсорном экране 44 px; MOB-58) на границе колонки и неба, три точки в покое
 * (VIS-50), черта при наведении, курсор col-resize. Протяжка задаёт
 * ширину панели или карточки; двойной щелчок и Enter — ширина по умолчанию; стрелки — шаг 16 px (с Shift — 64),
 * Home и End — наименьшая и наибольшая. Пределы — splitRange: сосед не сворачивается, небу — не меньше max(480, 40 %).
 */
function Splitter({ side, g }: { side: 'sheet' | 'folio'; g: Grid }) {
  const W = viewportWidth.value;
  const kind = panelKind(panel.value);
  const key: keyof Widths = side === 'folio' ? 'folio' : kind === 'wide' ? 'wide' : 'regular';
  const now = side === 'folio' ? g.folio : g.sheet;
  const [lo, hi] = splitRange(W, kind, side, g, viewportHeight.value);
  const drag = useRef<{ x: number; w: number; id: number } | null>(null);
  const set = (w: number) => setWidth(key, Math.max(lo, Math.min(hi, w)));
  // граница карточки — слева от неё: протяжка влево расширяет карточку
  const sign = side === 'folio' ? -1 : 1;
  const name = side === 'folio' ? 'карточки' : 'панели';
  return (
    <div
      class={`resizer resizer-${side}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={side === 'folio' ? 'Граница неба и карточки' : 'Граница панели и неба'}
      aria-valuenow={Math.round(now)}
      aria-valuemin={Math.round(lo)}
      aria-valuemax={Math.round(hi)}
      aria-valuetext={`ширина ${name} — ${Math.round(now)} ${plural(Math.round(now), 'пиксель', 'пикселя', 'пикселей')}`}
      title="Потяните, чтобы изменить ширину; двойной щелчок — по умолчанию"
      data-width={Math.round(now)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: now, id: e.pointerId };
        (e.currentTarget as HTMLElement).classList.add('dragging');
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        set(d.w + sign * (e.clientX - d.x));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        (e.currentTarget as HTMLElement).classList.remove('dragging');
      }}
      onPointerCancel={(e) => {
        drag.current = null;
        (e.currentTarget as HTMLElement).classList.remove('dragging');
      }}
      onDblClick={() => setWidth(key, null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') set(now + sign * (e.code === 'ArrowRight' ? step : -step));
        else if (e.code === 'Home') set(lo);
        else if (e.code === 'End') set(hi);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') setWidth(key, null);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  );
}
