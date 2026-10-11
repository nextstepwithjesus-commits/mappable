/**
 * Окно схемы «Семья» (03 § 3.3, § 7.3; 09 § 3.2.2 — выводы П-Т1):
 * - **родная прокрутка контейнера**; рисунок (SVG — пакетами путей, один `<path>` на вид линий) и HTML-кнопки лежат в слое
 *   «мир» внутри прокручиваемого содержимого; масштаб — `transform: scale` этого слоя, в том же кадре — размер содержимого
 *   и прокрутка; камера хранит дробное положение и пишет прокрутку округлённой; в начале жеста после прокрутки читателем —
 *   берёт положение у браузера;
 * - SVG — плиткой с запасом в пол-экрана; строится заново, только когда окно вышло из плитки;
 * - кнопки вложены списками в порядке леса (лицо → союзы → дети), `aria-level`, `aria-setsize`, `aria-posinset` — от данных;
 * - одна остановка Tab (подвижный `tabindex`), внутри — таблица «вид узла × клавиша» (`клавиши.ts`);
 * - правило якоря: после шага предмет действия стоит на тех же экранных координатах (допуск 1 px, 03 § 7.9).
 * Серый макет: облик не проверяется (08 § 10.3 п. 6). Canvas издали не повторён: порог и рисунок проверены в П-Т1.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Г, Л, замеры } from './данные.ts';

let t0раскладки = 0;
import { разложить, idЛица, подписьГруппы, подписьОтсыла, type Геометрия, type Предмет, type Ширины } from './раскладка.ts';
import { перейти, поРяду, поБукве, главный, type Клавиша, type Контекст, type Итог } from './клавиши.ts';
import { pad, contentSize, zoomAt, reveal, clampK, type Camera, type Viewport } from './камера.ts';
import { объявить } from '../общее/службы.ts';
import { router } from '../общее/приложение.ts';
import { слой2 } from '../общее/настройки.ts';
import { отношение } from './слова.ts';
import { Граф } from './граф.ts';

export interface Шаг { новое: Set<number>; подпись: string; якорь: string; фокус?: string; объявить?: string }

export interface СвойстваСхемы {
  раскрыто: Set<number>;
  выбрано: number;
  /** Сигнал смены текста и шрифтов: при смене — новая раскладка. */
  масштабТекста: number;
  измерить: Ширины['лицо'] | null;
  мелко: Ширины['мелко'] | null;
  наДействие: (p: Предмет, д: NonNullable<Итог['действие']>) => void;
  наЛист: (вид: 'up' | 'down', лицо: number) => void;
  наШаг?: (ш: Шаг) => void;
}

/** Состояние камеры между перерисовками и экранами (одно окно схемы на приложение). */
const S: { cam: Camera; v: Viewport; region: { x0: number; y0: number; x1: number; y1: number } | null; userScrolled: boolean; активный: string | null; якорь: { id: string; x: number; y: number; фокус?: string } | null; первый: boolean } = {
  cam: { k: 1, sx: 0, sy: 0 },
  v: { w: 800, h: 600 },
  region: null,
  userScrolled: true,
  активный: null,
  якорь: null,
  первый: true,
};
/** Для замеров и тестов: окно `window.__схема`. */
export const состояниеСхемы = S;

/** Запомнить экранное место предмета перед шагом (правило якоря). */
export function запомнитьЯкорь(id: string, фокус?: string) {
  const el = document.getElementById(id);
  const vp = document.getElementById('схема-окно');
  if (!el || !vp) { S.якорь = null; return; }
  const r = el.getBoundingClientRect(), v = vp.getBoundingClientRect();
  // от края области прокрутки (без рамки окна): так считает и прокрутка
  S.якорь = { id, x: r.left - v.left - vp.clientLeft, y: r.top - v.top - vp.clientTop, ...(фокус && { фокус }) };
}

export function Схема(п: СвойстваСхемы) {
  const vp = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [, перерисовать] = useState(0);

  const ключ = [...п.раскрыто].sort((a, b) => a - b).join(',');
  const г: Геометрия | null = useMemo(() => {
    if (!п.измерить || !п.мелко) return null;
    t0раскладки = performance.now();
    return разложить(Л, п.раскрыто, { лицо: п.измерить, мелко: п.мелко, текст: п.масштабТекста });
  }, [ключ, п.измерить, п.мелко, п.масштабТекста]);
  const к: Контекст | null = г ? { л: Л, г, раскрыто: п.раскрыто } : null;

  // ---------- камера ----------
  const пределы = () => ({ min: г ? Math.min(1, (S.v.w / Math.max(1, г.ширина)) * 0.9, (S.v.h / Math.max(1, г.высота)) * 0.9) : 0.2, max: 3 });
  const плитка = (force = false) => {
    if (!г || !svg.current) return;
    const p = pad(S.v), k = S.cam.k;
    const vx0 = (S.cam.sx - p.x) / k, vy0 = (S.cam.sy - p.y) / k, vx1 = vx0 + S.v.w / k, vy1 = vy0 + S.v.h / k;
    const r = S.region;
    if (!force && r && vx0 >= r.x0 && vy0 >= r.y0 && vx1 <= r.x1 && vy1 <= r.y1) return;
    const mx = (vx1 - vx0) / 2, my = (vy1 - vy0) / 2;
    const reg = { x0: vx0 - mx, y0: vy0 - my, x1: vx1 + mx, y1: vy1 + my };
    S.region = reg;
    const d = (a: number[]) => {
      let s = '';
      for (let i = 0; i < a.length; i += 4) {
        const x1 = a[i], y1 = a[i + 1], x2 = a[i + 2], y2 = a[i + 3];
        if (Math.max(x1, x2) < reg.x0 || Math.min(x1, x2) > reg.x1 || Math.max(y1, y2) < reg.y0 || Math.min(y1, y2) > reg.y1) continue;
        s += `M${(x1 - reg.x0).toFixed(1)} ${(y1 - reg.y0).toFixed(1)}L${(x2 - reg.x0).toFixed(1)} ${(y2 - reg.y0).toFixed(1)}`;
      }
      return s;
    };
    const el = svg.current;
    el.style.left = `${reg.x0}px`;
    el.style.top = `${reg.y0}px`;
    el.setAttribute('width', String(reg.x1 - reg.x0));
    el.setAttribute('height', String(reg.y1 - reg.y0));
    (el.querySelector('.л-кровь') as SVGPathElement).setAttribute('d', d(г.линии.кровь));
    (el.querySelector('.л-союз') as SVGPathElement).setAttribute('d', d(г.линии.союз));
    (el.querySelector('.л-ярлык') as SVGPathElement).setAttribute('d', d(г.линии.ярлык));
  };
  const применить = (c: Camera, kChanged: boolean) => {
    if (!г || !vp.current || !content.current || !world.current) return;
    S.cam = c;
    if (kChanged) {
      const sz = contentSize(г.ширина, г.высота, c.k, S.v);
      content.current.style.width = `${sz.w}px`;
      content.current.style.height = `${sz.h}px`;
    }
    const p = pad(S.v);
    world.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${c.k})`;
    world.current.classList.toggle('издали', 14 * п.масштабТекста * c.k < 12);
    // округляем сами: WebKit отбрасывает дробную часть, Chromium округляет (П-Т1)
    vp.current.scrollLeft = Math.round(c.sx);
    vp.current.scrollTop = Math.round(c.sy);
    // плитка — в координатах мира: при смене масштаба строится заново, только если окно вышло из неё (П-Т1)
    плитка(false);
  };
  const синхр = () => {
    if (S.userScrolled && vp.current) S.cam = { ...S.cam, sx: vp.current.scrollLeft, sy: vp.current.scrollTop };
    S.userScrolled = false;
  };
  /** Масштаб с якорем в точке окна (fx, fy). */
  const масштаб = (множ: number, fx?: number, fy?: number) => {
    синхр();
    const lim = пределы();
    const kk = clampK(S.cam.k * множ, lim.min, lim.max);
    if (kk === S.cam.k) { объявить(множ > 1 ? 'Крупнее нельзя' : 'Мельче нельзя'); return; }
    const a = document.activeElement as HTMLElement | null;
    let x = fx, y = fy;
    if (x === undefined || y === undefined) {
      // якорь — предмет в фокусе или выбранный, иначе середина окна
      const el = (a && world.current?.contains(a) ? a : document.getElementById(idЛица(Л, п.выбрано))) as HTMLElement | null;
      const v = vp.current!.getBoundingClientRect();
      if (el) { const r = el.getBoundingClientRect(); x = r.left - v.left - vp.current!.clientLeft + 5; y = r.top - v.top - vp.current!.clientTop + r.height / 2; }
      else { x = S.v.w / 2; y = S.v.h / 2; }
    }
    применить(zoomAt(S.cam, S.v, kk, x, y), true);
    объявить(`Масштаб ${Math.round(kk * 100)} %`);
  };

  // размер окна
  useLayoutEffect(() => {
    const el = vp.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      S.v = { w: el.clientWidth, h: el.clientHeight };
      if (г) применить(S.cam, true);
    });
    ro.observe(el);
    S.v = { w: el.clientWidth, h: el.clientHeight };
    return () => ro.disconnect();
  }, [!!г]);

  // новая геометрия: правило якоря или первый показ (выбранное лицо в окне)
  useLayoutEffect(() => {
    if (!г || !vp.current) return;
    S.region = null;
    const p = pad(S.v);
    const я = S.якорь;
    const цель = я ? г.поИд.get(я.id) ?? г.поИд.get(я.фокус ?? '') : undefined;
    if (я && цель !== undefined) {
      const it = г.предметы[цель];
      const k = S.cam.k;
      // экранная точка предмета действия до шага = после шага (03 § 7.9; 08 § 6.2)
      применить({ k, sx: it.x * k + p.x - я.x, sy: it.y * k + p.y - я.y }, true);
      S.якорь = null;
      const ф = я.фокус ?? я.id;
      if (г.поИд.has(ф)) фокусНа(ф);
    } else {
      const sel = г.поИд.get(idЛица(Л, п.выбрано)) ?? 0;
      const it = г.предметы[sel];
      const k = S.первый ? 1 : S.cam.k;
      S.первый = false;
      if (it) применить({ k, sx: (it.x + it.w / 2) * k + p.x - S.v.w / 2, sy: it.y * k + p.y - Math.min(S.v.h / 3, 160) }, true);
      else применить({ k, sx: p.x, sy: p.y }, true);
      S.якорь = null;
    }
    S.активный = S.активный && г.поИд.has(S.активный) ? S.активный : idЛица(Л, п.выбрано);
    if (замеры.первыйПоказ === undefined) замеры.первыйПоказ = performance.now();
    замеры.раскладка = performance.now() - t0раскладки;
    перерисовать((x) => x + 1);
  }, [г]);

  // прокрутка, колесо, касание
  useEffect(() => {
    const el = vp.current;
    if (!el || !г) return;
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - S.cam.sx) >= 1) { S.cam.sx = el.scrollLeft; S.userScrolled = true; }
      if (Math.abs(el.scrollTop - S.cam.sy) >= 1) { S.cam.sy = el.scrollTop; S.userScrolled = true; }
      плитка();
    };
    let ждёт = 1, fx = 0, fy = 0, raf = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // щипок трекпада (Chrome, Firefox) и Ctrl + колесо: масштаб схемы, а не страницы
      e.preventDefault();
      const r = el.getBoundingClientRect();
      ждёт *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
      fx = e.clientX - r.left - el.clientLeft; fy = e.clientY - r.top - el.clientTop;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const f = ждёт; ждёт = 1; масштабТихо(f, fx, fy); });
    };
    let touch: { d0: number; k0: number; wx: number; wy: number } | null = null;
    const mid = (t: TouchList) => { const r = el.getBoundingClientRect(); return { x: (t[0].clientX + t[1].clientX) / 2 - r.left - el.clientLeft, y: (t[0].clientY + t[1].clientY) / 2 - r.top - el.clientTop, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) }; };
    const onTS = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      синхр();
      const m = mid(e.touches), p = pad(S.v);
      touch = { d0: m.d, k0: S.cam.k, wx: (S.cam.sx + m.x - p.x) / S.cam.k, wy: (S.cam.sy + m.y - p.y) / S.cam.k };
    };
    const onTM = (e: TouchEvent) => {
      if (!touch || e.touches.length !== 2) return;
      e.preventDefault();
      const m = mid(e.touches), p = pad(S.v), lim = пределы();
      const kk = clampK(touch.k0 * (m.d / touch.d0), lim.min, lim.max);
      применить({ k: kk, sx: touch.wx * kk + p.x - m.x, sy: touch.wy * kk + p.y - m.y }, true);
    };
    const onTE = (e: TouchEvent) => { if (e.touches.length < 2) touch = null; };
    const масштабТихо = (f: number, x: number, y: number) => {
      синхр();
      const lim = пределы();
      const kk = clampK(S.cam.k * f, lim.min, lim.max);
      if (kk !== S.cam.k) применить(zoomAt(S.cam, S.v, kk, x, y), true);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
    };
  }, [г]);

  // ---------- фокус по номеру предмета ----------
  const фокусНа = (id: string) => {
    if (!г) return;
    const i = г.поИд.get(id);
    if (i === undefined) return;
    S.активный = id;
    const it = г.предметы[i];
    // перед фокусом камера делает предмет видимым «не дальше, чем нужно» (09 § 3.2.3 п. 2)
    синхр();
    const c2 = reveal(S.cam, S.v, { x: it.x, y: it.y, w: it.w, h: it.h }, 24);
    if (c2.sx !== S.cam.sx || c2.sy !== S.cam.sy) применить(c2, false);
    for (const b of world.current?.querySelectorAll<HTMLElement>('[data-пр]') ?? []) b.tabIndex = b.id === id ? 0 : -1;
    document.getElementById(id)?.focus({ preventScroll: true });
  };
  const итог = (r: Итог, p: Предмет) => {
    if (r.действие) п.наДействие(p, r.действие);
    if (r.к) фокусНа(r.к);
    if (r.объявить) объявить(r.объявить);
    if (!r.к && !r.объявить && !r.действие) объявить('Здесь переходов нет');
  };
  const onKey = (e: KeyboardEvent) => {
    if (!к) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-пр]');
    if (!el) return;
    const p = к.г.предметы[к.г.поИд.get(el.id) ?? -1];
    if (!p) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((mod && e.code === 'KeyZ') || (e.ctrlKey && e.code === 'KeyY')) {
      e.preventDefault();
      запомнитьЯкорь(el.id);
      if (e.shiftKey || e.code === 'KeyY') router.redo(); else router.undo();
      return;
    }
    if (mod) return; // Ctrl + «+/−» — масштаб браузера (1.4.4)
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); итог(поРяду(к, p, e.key === 'ArrowRight'), p); return; }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); п.наЛист(e.key === 'ArrowUp' ? 'up' : 'down', p.лицо); return; }
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      синхр();
      const d = 64;
      применить({ ...S.cam, sx: S.cam.sx + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0), sy: S.cam.sy + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0) }, false);
      return;
    }
    if (e.shiftKey && e.key === 'Enter') { e.preventDefault(); объявить('Путь родства между двумя лицами — в пакете 2 (03 § 6.4)'); return; }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); объявить('Команды лица — в строке инструмента над схемой'); return; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); масштаб(1.25); return; }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); масштаб(0.8); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      итог(перейти(к, p, e.key as Клавиша), p);
      return;
    }
    if (e.key.length === 1 && /\p{L}/u.test(e.key) && !e.altKey) { e.preventDefault(); итог(поБукве(к, p, e.key), p); }
  };
  const onClick = (e: MouseEvent) => {
    if (!к) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-пр]');
    if (!el) return;
    const p = к.г.предметы[к.г.поИд.get(el.id) ?? -1];
    if (!p) return;
    S.активный = el.id;
    итог(перейти(к, p, 'Enter'), p);
  };
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-пр]');
    if (el && S.активный !== el.id) {
      S.активный = el.id;
      for (const b of world.current?.querySelectorAll<HTMLElement>('[data-пр]') ?? []) b.tabIndex = b.id === el.id ? 0 : -1;
    }
  };

  // ---------- кнопки списками в порядке леса ----------
  const список = г && к ? построитьСписок(г, к, п.выбрано) : null;
  return (
    <div class="схема">
      <div class="схема__кнопки" role="group" aria-label="Масштаб схемы">
        <button class="кн" type="button" onClick={() => масштаб(1.25)}>Крупнее</button>
        <button class="кн" type="button" onClick={() => масштаб(0.8)}>Мельче</button>
      </div>
      <div class="схема__окно" id="схема-окно" ref={vp}>
        <div class="схема__содержимое" ref={content}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: делегирование — клавиши и нажатия приходят от кнопок предметов внутри слоя */}
          <div class="схема__мир" ref={world} onKeyDown={onKey} onClick={onClick} onFocusIn={onFocusIn}>
            <svg class="схема__рисунок" ref={svg} aria-hidden="true" focusable="false">
              <path class="л-кровь" />
              <path class="л-союз" />
              <path class="л-ярлык" />
            </svg>
            {слой2() && г && <Ряды г={г} />}
            {список}
          </div>
        </div>
      </div>
    </div>
  );
}

/** «ряд N» у изучающих — в поле слева от схемы (вне мест узлов: смена слоя не двигает узлы). */
function Ряды({ г }: { г: Геометрия }) {
  const ряды = new Map<number, number>();
  for (const [k, x] of г.узлы) if (Л.узлы[k].полка === 0 && Л.узлы[k].вид === 'block') ряды.set(x.y, Л.узлы[k].ряд);
  return (
    <div class="схема__ряды" aria-hidden="true">
      {[...ряды].map(([y, r]) => (
        <span style={{ top: `${y + 34}px` }}>ряд {r}</span>
      ))}
    </div>
  );
}

function текстПредмета(p: Предмет, к: Контекст, выбрано: number): { видимо: ComponentChildren; скрыто?: string; раскрыт?: boolean } {
  const u = Л.узлы[p.узел];
  switch (p.вид) {
    case 'лицо': {
      const л = Г.лица[p.лицо];
      const отн = выбрано >= 0 && выбрано !== p.лицо ? отношение(Г, Л, выбрано, p.лицо) : '';
      return { видимо: <span class="узел__подпись"><span class="узел__имя">{л.имя}</span>{л.уточн && <span class="узел__уточн">{`, ${л.уточн}`}</span>}</span>, скрыто: отн ? ` — ${отн}` : undefined };
    }
    case 'союз': {
      const un = p.союз !== undefined ? Г.союзы[p.союз] : undefined;
      const детей = u.дети.filter((c) => Л.узлы[c].слот === p.слот || Л.узлы[c].слот === 100 + p.слот!).length;
      const откр = u.дети.some((c) => (Л.узлы[c].слот === p.слот || Л.узлы[c].слот === 100 + p.слот!) && к.раскрыто.has(c));
      return { видимо: null, скрыто: `Союз с: ${Г.имя(p.лицо)}${un ? `, ${словоВида(un.виды)}` : ''}, детей: ${детей}${детей ? (откр ? '; развёрнуто' : '; свёрнуто') : ''}`, раскрыт: детей ? откр : undefined };
    }
    case 'мать-не-названа': {
      const откр = u.дети.some((c) => Л.узлы[c].слот === -1 && к.раскрыто.has(c));
      return { видимо: 'мать не названа', скрыто: `; дети: ${Г.имя(u.лица[0])}; одна или несколько матерей — в стихах не сказано`, раскрыт: откр };
    }
    case 'группа':
      return { видимо: подписьГруппы(Л, u), раскрыт: u.дети.some((c) => к.раскрыто.has(c)) };
    case 'отсыл-жены':
      return { видимо: подписьОтсыла(Л, u), скрыто: '; отсыл: стоит у мужа; перейти' };
    case 'отсыл':
      return { видимо: p.отсыл!.текст, скрыто: '; отсыл; перейти' };
    case 'родители':
      return { видимо: 'Показать родителей', скрыто: `: ${Г.полное(p.лицо)}` };
    case 'ещё':
      return { видимо: `Показать ещё ${p.n} детей`, скрыто: `: ${Г.полное(p.лицо)}` };
    case 'ярлык': {
      const e = Г.рёбра[p.ребро!];
      return { видимо: Л.ярлыки.find((я) => я.ребро === e.i)?.текст ?? '', скрыто: `; ребро: ${Г.имя(e.род)} — ${Г.имя(e.реб)}; ${Граф.уровеньСловом(e.уровень)}; Enter — лист ребра` };
    }
  }
}
const словоВида = (в: string[]) => (в.includes('non-marital') ? 'союз без брака, вывод' : в.includes('not-stated') ? 'браком не назван, вывод' : в.includes('marriage') ? 'жена' : в.includes('maid-as-wife') ? 'служанка в жену' : в.includes('concubine') ? 'наложница' : '');

function построитьСписок(г: Геометрия, к: Контекст, выбрано: number) {
  const поУзлу = new Map<number, Предмет[]>();
  for (const p of г.предметы) { if (!поУзлу.has(p.узел)) поУзлу.set(p.узел, []); поУзлу.get(p.узел)!.push(p); }
  for (const xs of поУзлу.values()) xs.sort((a, b) => порядокВида(a) - порядокВида(b) || a.x - b.x);
  const активный = S.активный && г.поИд.has(S.активный) ? S.активный : idЛица(Л, выбрано);
  const корни = [...г.узлы.keys()].filter((k) => Л.узлы[k].родитель < 0 || !к.раскрыто.has(Л.узлы[k].родитель)).sort((a, b) => Л.порядок[a] - Л.порядок[b]);
  const кнопка = (p: Предмет) => {
    const t = текстПредмета(p, к, выбрано);
    const sel = p.вид === 'лицо' && p.лицо === выбрано;
    return (
      <button
        type="button"
        id={p.id}
        data-пр={p.вид}
        class={`пр пр--${p.вид}${sel ? ' пр--выбрано' : ''}`}
        style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` }}
        tabIndex={p.id === активный ? 0 : -1}
        aria-current={sel ? 'true' : undefined}
        aria-expanded={t.раскрыт}
      >
        {p.вид === 'лицо' && <span class={`знак знак--${Г.лица[p.лицо].пол ?? 'u'}`} aria-hidden="true" />}
        {t.видимо}
        {t.скрыто && <span class="скрыто">{t.скрыто}</span>}
      </button>
    );
  };
  const узел = (k: number) => {
    const u = Л.узлы[k];
    const дети = u.дети.filter((c) => к.раскрыто.has(c));
    const гр = u.родитель >= 0 ? Л.узлы[u.родитель].дети.filter((c) => Л.узлы[c].слот === u.слот) : [];
    return (
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA 1.2 — у listitem есть aria-level, aria-setsize, aria-posinset (03 § 7.3)
      <li aria-level={u.ряд + 1} {...(гр.length ? { 'aria-setsize': гр.length, 'aria-posinset': гр.indexOf(k) + 1 } : {})}>
        {(поУзлу.get(k) ?? []).map(кнопка)}
        {/* biome-ignore lint/a11y/noRedundantRoles: WebKit снимает роль списка при list-style: none (03 § 7.3) */}
        {дети.length > 0 && <ul role="list">{дети.map(узел)}</ul>}
      </li>
    );
  };
  // biome-ignore lint/a11y/noRedundantRoles: WebKit снимает роль списка при list-style: none (03 § 7.3)
  return <ul role="list" class="схема__список" aria-label="Схема: люди по семьям">{корни.map(узел)}</ul>;
}
const ПОРЯДОК: Record<string, number> = { родители: 0, лицо: 1, союз: 1, 'отсыл-жены': 1, группа: 1, отсыл: 2, 'мать-не-названа': 3, ещё: 4, ярлык: -1 };
const порядокВида = (p: Предмет) => ПОРЯДОК[p.вид] ?? 5;
export { главный };
