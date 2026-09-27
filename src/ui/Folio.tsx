import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, VNode } from 'preact';
import { byId, lineMembership, loadCard, loadedCard, loadedChrono } from '../data/atlas.ts';
import type { Card, Chrono } from '../data/types.ts';
import { selected, second, pickMode, model, showSchema } from '../state.ts';
import { grid, unfoldCard } from './layout.ts';
import { skyRef, plural, CAN_PRINT } from './common.tsx';
import { lowerFirst } from './text/ru.ts';
import { typo } from './text/typo.ts';
import { Masthead, isPeople } from './card/Masthead.tsx';
import { Close } from './controls.tsx';
import { SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups } from './card/sections.tsx';
import { Clamp, clampItems } from './card/Clamp.tsx';
import { Brief, authoredCount } from './card/Brief.tsx';
import { Rail, RailKey, type SecState } from './card/Rail.tsx';
import { affiliation } from './card/shared.tsx';
import { lifeSpanText } from '../engine/years.ts';
import { reduced } from './sky/view.ts';
import { sheetStop, snapSheet, stopsFor, releaseVelocity, type SheetStop } from './sheet.ts';
import { cardFolded, cardStack, dropCard } from './work.ts';
import { FoldButton, WorkButton } from './panels/Work.tsx';
import { goTo } from './common.tsx';

export { Masthead, SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups };
export type { SecState };

const modelNames: Record<string, string> = {
  'mt-long': 'масоретские числа, 430 лет в Египте',
  'mt-short': 'краткое пребывание, 215 лет',
  lxx: 'числа в скобках Быт 5 и 11',
  terah70: 'Фарре 70 лет',
};

/** «9–12, 14»: номера разделов подряд — диапазоном. */
export function ranges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j;
  }
  return out.join(', ');
}

/**
 * Состояние каждого из 24 разделов (ТЗ § 3.3; решение владельца 6):
 * content — есть сведения; header — сведения в шапке (§ 1 — имя, § 5 — роль, § 7 — колено: раздел их не повторяет);
 * silent — составитель проверил: Писание молчит; na — § 21 у лица вне родословий Мессии; absent — не составлен.
 */
export function sectionStates(id: string, out: Map<number, ComponentChildren>, card: Card | null): Record<number, SecState> {
  const p = byId.get(id)!;
  const silent = new Set(p.silent);
  const onLines = lineMembership.joseph.has(id) || lineMembership.mary.has(id);
  const st: Record<number, SecState> = {};
  for (const s of SECTIONS) {
    const n = s.n;
    if (out.has(n)) st[n] = 'content';
    else if (n === 1 || (n === 5 && p.roles.length) || (n === 7 && affiliation(id))) st[n] = 'header';
    else if (silent.has(n)) st[n] = 'silent';
    else if (n === 21 && !onLines && !card?.messiahNote?.length) st[n] = 'na';
    else st[n] = 'absent';
  }
  return st;
}

/**
 * Колофон (F10; CARD-38): точный перечень — где сведения, о чём Писание молчит, что не составлено;
 * модель хронологии — только если у лица есть годы, которые от неё зависят (до 967 г. до Р. Х.).
 */
export function colophonText(id: string, states: Record<number, SecState>): string {
  const of = (...k: SecState[]) => SECTIONS.filter((s) => k.includes(states[s.n])).map((s) => s.n);
  const filled = of('content', 'header').length;
  const silent = of('silent');
  const absent = of('absent');
  const na = of('na');
  const parts = [`Сведения — в ${filled} ${plural(filled, 'разделе', 'разделах', 'разделах')}`];
  if (silent.length) parts.push(`Писание молчит — § ${ranges(silent)}`);
  if (absent.length) parts.push(`не ${absent.length === 1 ? 'составлен' : 'составлены'} — § ${ranges(absent)}`);
  if (na.length) parts.push('§ 21 не относится: лицо не входит в линии Мессии');
  const c = model.value.chrono.get(id);
  // −966 — 967 г. до Р. Х. в астрономическом счёте: 4-й год Соломона, якорь хронологии (3 Цар 6:1)
  const dep = c && c.cls !== 'epochal' && c.b < -966;
  return typo(
    `${parts.join('; ')}. Ссылки сверены с Синодальным текстом.` + (dep ? ` Годы до 967 г. до Р. Х. — по модели «${modelNames[model.value.id] ?? model.value.id}».` : ''),
  );
}

/** Заголовок раздела в строку («Имя. Давид…») — если тело раздела — один абзац или один пункт (F1; VIS-01, VIS-10). */
function runIn(body: ComponentChildren): VNode<{ class?: string; children?: ComponentChildren }> | null {
  const items = clampItems(body);
  if (items.length !== 1) return null;
  const v = items[0].node as VNode<{ class?: string; children?: ComponentChildren }>;
  return v.type === 'p' || v.type === 'li' ? v : null;
}

/**
 * Тело карточки без загрузки данных (для листа, образца и разворота): рейка, шапка с командами, «Кратко»,
 * разделы по частям I–VI, колофон.
 * id — лицо шапки; body — лицо, том и хронология тела (пока грузится том нового лица, тело — прежнего, бледнее).
 * actions — строка команд под именем (у листа карточки); current — раздел, до которого дошла прокрутка.
 */
export function CardPage({
  id, body, stale = false, current = 0, actions,
}: {
  id: string;
  body: { id: string; card: Card | null; chrono: Chrono | null } | null;
  stale?: boolean;
  current?: number;
  actions?: ComponentChildren;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const bodyId = body?.id ?? id;
  const bp = byId.get(bodyId)!;
  const card = body?.card ?? null;
  const m = model.value;
  // разделы собираются заново, только когда сменились лицо, том или модель: прокрутка меняет лишь текущий раздел рейки
  const { out, states } = useMemo(() => {
    const o = buildSections(bodyId, bp, card, m, m.chrono.get(bodyId), '', body?.chrono ?? null);
    return { out: o, states: sectionStates(bodyId, o, card) };
  }, [bodyId, card, body?.chrono, m]);
  const schema = showSchema.value;
  // малое лицо (F11; CARD-36): меньше трёх записей составителя — «Кратко» и есть статья, разделы — одной строкой
  const compact = !!card && authoredCount(card) < 3 && !schema && openFor !== bodyId;

  const go = (n: number) => {
    const st = states[n];
    if (compact) setOpenFor(bodyId);
    if (st === 'absent' && !schema) showSchema.value = true;
    requestAnimationFrame(() => {
      if (st === 'header') {
        const t = document.getElementById(`title-${id}`);
        t?.closest('.folio')?.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
        t?.focus({ preventScroll: true });
        return;
      }
      const el = document.getElementById(`sec-${n}`);
      // ослабленное движение — переход без плавной прокрутки (MOB-40)
      el?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
  };

  // ---------- разделы ----------
  const blocks: ComponentChildren[] = [];
  let run: number[] = [];
  const flushRun = () => {
    if (!run.length) return;
    const st = states[run[0]];
    const label = run.length === 1 ? `${run[0]}` : `${run[0]}–${run[run.length - 1]}`;
    const titles = run.map((n, i) => (i ? lowerFirst(SECTIONS[n - 1].title) : SECTIONS[n - 1].title)).join(', ');
    blocks.push(
      <div class={`sec ${st}`} key={`run${run[0]}`} data-n={run[0]} id={`sec-${run[0]}`}>
        <span class="no">{label}</span>
        {typo(`${titles} — ${st === 'silent' ? 'в Писании не сообщается' : st === 'na' ? 'не относится: лицо не входит в линии Мессии' : 'раздел не составлен'}`)}
      </div>,
    );
    run = [];
  };
  const shown = (n: number) => states[n] === 'content' || states[n] === 'silent' || states[n] === 'na' || (schema && states[n] === 'absent');
  let lastPart = 0;
  for (const s of SECTIONS) {
    if (!shown(s.n)) {
      // скрытый раздел (не составлен или в шапке) разрывает сведённую строку: «9–12» — только подряд идущие
      flushRun();
      continue;
    }
    if (s.part !== lastPart) {
      flushRun();
      blocks.push(
        <h3 class="part" key={`p${s.part}`}>
          {PARTS[s.part]}
        </h3>,
      );
      lastPart = s.part;
    }
    const st = states[s.n];
    if (st !== 'content') {
      if (run.length && (states[run[0]] !== st || st === 'na')) flushRun();
      run.push(s.n);
      continue;
    }
    flushRun();
    const bodyN = out.get(s.n);
    const one = runIn(bodyN);
    blocks.push(
      <section class={`sec${one ? '' : ' long'}`} key={s.n} data-n={s.n} id={`sec-${s.n}`} aria-labelledby={`h-${s.n}`}>
        <span class="no" aria-hidden="true">
          {s.n}
        </span>
        {one ? (
          <div class={`runin${one.props.class ? ` ${one.props.class}` : ''}`}>
            <h4 id={`h-${s.n}`}>{s.title}.</h4> {one.props.children}
          </div>
        ) : (
          <>
            <h4 id={`h-${s.n}`}>{s.title}</h4>
            <Clamp sig={`${bodyId}|${s.n}`} n={s.n}>
              {bodyN}
            </Clamp>
          </>
        )}
      </section>,
    );
  }
  flushRun();

  const restTitles = SECTIONS.filter((s) => states[s.n] === 'content').map((s) => lowerFirst(s.title));

  return (
    <>
      <Masthead id={id} actions={actions} />
      <Brief id={bodyId} card={card} />
      <div class="mast-rule" aria-hidden="true" />
      {/* рейка — вровень с первым разделом (VIS-07); на телефоне — строка номеров под шапкой */}
      {compact ? null : <Rail states={states} current={current} onGo={go} />}
      {body ? (
        <div class={stale ? 'folio-body stale' : 'folio-body'} aria-busy={stale ? 'true' : undefined}>
          {compact ? (
            <p class="rest">
              <button type="button" class="more" aria-expanded="false" onClick={() => setOpenFor(bodyId)}>
                Показать все сведения
              </button>
              {restTitles.length ? typo(` — ${restTitles.join(', ')}`) : null}
            </p>
          ) : (
            blocks
          )}
        </div>
      ) : null}
      <footer class="colophon">
        {compact ? null : <RailKey states={states} />}
        <p>{colophonText(bodyId, states)}</p>
        <div class="cmds">
          <button type="button" class="cmd" aria-pressed={schema} onClick={() => (showSchema.value = !schema)}>
            Показать все 24 раздела
          </button>
          {CAN_PRINT && (
            <button type="button" class="cmd" onClick={() => window.print()}>
              Напечатать карточку
            </button>
          )}
        </div>
      </footer>
    </>
  );
}

/** Сколько ждать тома карточки, прежде чем сказать «Загрузка карточки…» (IX-45). */
const LOADING_AFTER = 300;
/** Порог протяжки листа: дальше — лист тянется, ближе — касание (как у касания неба, D3). */
const DRAG_SLOP = 8;

/**
 * Протяжка нижнего листа на телефоне (H2; MOB-12): за шапку листа — указателем, за текст — касанием, если текст
 * прокручен к началу (тогда протяжка вниз сворачивает лист, а не прокручивает текст); на шапке (104 px) текст не
 * прокручивается, и лист тянется за любое место. Высота при протяжке — в --sheet-h на самом листе; при отпускании лист
 * встаёт в ближайшее положение с учётом скорости (snapSheet) или закрывается взмахом вниз.
 */
function useSheetDrag(aside: { current: HTMLElement | null }, on: boolean) {
  useEffect(() => {
    const el = aside.current;
    if (!el || !on) return;
    let d: { y0: number; h0: number; pts: { t: number; y: number }[]; from: SheetStop; moved: boolean } | null = null;
    let touch: { x0: number; y0: number; top: number; t: number } | null = null;
    // место для листа — небо между верхней строкой и полосой времени: лист на 100 % занимает его целиком
    const avail = () => document.querySelector('.sky')?.getBoundingClientRect().height ?? window.innerHeight * 0.8;
    // время — Event.timeStamp: скорость взмаха считается по времени касаний, а не по тому, когда до них дошла очередь
    const begin = (y: number, t: number) => {
      d = { y0: y, h0: el.getBoundingClientRect().height, pts: [{ t, y }], from: sheetStop.peek(), moved: false };
    };
    const move = (y: number, t: number) => {
      if (!d) return false;
      const dy = y - d.y0;
      if (!d.moved && Math.abs(dy) < DRAG_SLOP) return false;
      if (!d.moved) {
        d.moved = true;
        el.dataset.drag = '';
      }
      const h = Math.max(0, Math.min(stopsFor(avail()).full, d.h0 - dy));
      el.style.setProperty('--sheet-h', `${Math.round(h)}px`);
      d.pts.push({ t, y });
      while (d.pts.length > 2 && t - d.pts[0].t > 160) d.pts.shift();
      return true;
    };
    /** Отпускание: true — это была протяжка. */
    const end = (t: number) => {
      const was = d;
      d = null;
      if (!was || !was.moved) return false;
      const h = el.getBoundingClientRect().height;
      const to = snapSheet(h, releaseVelocity(was.pts, t), stopsFor(avail()), was.from);
      delete el.dataset.drag;
      el.style.removeProperty('--sheet-h');
      if (to === 'close') selected.value = null;
      else sheetStop.value = to;
      return true;
    };
    const inBar = (t: EventTarget | null) => t instanceof Element && !!t.closest('.sheet-bar') && !t.closest('button');
    // шапка листа: указатель (палец, перо, мышь); касание шапки на 104 px поднимает лист до 55 %
    const onDown = (e: PointerEvent) => {
      if (!inBar(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      el.setPointerCapture(e.pointerId);
      begin(e.clientY, e.timeStamp);
    };
    const onMove = (e: PointerEvent) => {
      if (d && el.hasPointerCapture(e.pointerId)) move(e.clientY, e.timeStamp);
    };
    const onUp = (e: PointerEvent) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      el.releasePointerCapture(e.pointerId);
      const from = d?.from;
      if (!end(e.timeStamp) && e.type === 'pointerup' && from === 'peek') sheetStop.value = 'half';
    };
    // текст листа: касание, прокрученное к началу, тянет лист вниз; на шапке — в обе стороны
    const onTouchStart = (e: TouchEvent) => {
      // шапку тянет указатель (выше); её кнопки нажимаются как обычно
      if (e.touches.length !== 1 || (e.target instanceof Element && e.target.closest('.sheet-bar'))) {
        touch = null;
        return;
      }
      const t = e.touches[0];
      touch = { x0: t.clientX, y0: t.clientY, top: el.scrollTop, t: e.timeStamp };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touch || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!d) {
        const dx = t.clientX - touch.x0;
        const dy = t.clientY - touch.y0;
        if (Math.abs(dy) < DRAG_SLOP || Math.abs(dy) < Math.abs(dx)) return;
        const peek = sheetStop.peek() === 'peek';
        if (!(peek || (dy > 0 && touch.top <= 0 && el.scrollTop <= 0))) {
          touch = null;
          return;
        }
        begin(touch.y0, touch.t);
      }
      if (e.cancelable) e.preventDefault();
      move(t.clientY, e.timeStamp);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touch && d) end(e.timeStamp);
      touch = null;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      delete el.dataset.drag;
      el.style.removeProperty('--sheet-h');
    };
  }, [on]);
}

/**
 * Закреплённая шапка нижнего листа (H2; MOB-12, MOB-15): ручка, имя, «Развернуть» или «Свернуть» и «×» (44 × 44).
 * На шапке (104 px) под именем — годы: этого хватает, чтобы узнать лицо, не открывая карточки (MOB-11).
 * Имя здесь — для глаз: заголовком карточки для диктора и для фокуса остаётся h2 шапки карточки (Masthead).
 */
function SheetBar({ id, stop }: { id: string; stop: SheetStop }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const years = c ? lifeSpanText(c, { people: isPeople(id) }) : '';
  const full = stop === 'full';
  return (
    <div class="sheet-bar">
      <div class="grab" aria-hidden="true">
        <span />
      </div>
      <div class="bar-row">
        <div class="bar-name" aria-hidden="true">
          {p.name}
        </div>
        <button
          type="button"
          class="cmd bar-toggle"
          aria-expanded={full}
          aria-label={full ? 'Свернуть карточку' : 'Развернуть карточку'}
          onClick={() => (sheetStop.value = full ? 'peek' : 'full')}
        >
          {full ? 'Свернуть' : 'Развернуть'}
        </button>
        {/* «×» снимает только выбор; открытая панель остаётся (D11; IX-26) */}
        <Close label="Закрыть карточку" onClick={() => (selected.value = null)} />
      </div>
      {stop === 'peek' && (
        <div class="bar-years" aria-hidden="true">
          {typo(years || 'время не установлено')}
        </div>
      )}
    </div>
  );
}

export function Folio() {
  const id = selected.value;
  const [data, setData] = useState<{ id: string; card: Card; chrono: Chrono | null } | null>(null);
  const [current, setCurrent] = useState(1);
  // том не загрузился (D11): лист говорит об этом и предлагает повторить, а не остаётся в «Загрузке» навсегда
  const [failed, setFailed] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  // на телефоне карточка — нижний лист с тремя положениями (ТЗ § 3.8; H2)
  const phone = grid.value.phone;
  const stop = sheetStop.value;
  const sheet = phone && !!id && byId.has(id);
  useSheetDrag(aside, sheet);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setFailed(null);
    setSlow(false);
    const t = setTimeout(() => alive && setSlow(true), LOADING_AFTER);
    loadCard(id)
      .then((d) => alive && setData({ id, card: d?.card ?? {}, chrono: d?.chrono ?? null }))
      .catch(() => alive && setFailed(id))
      .finally(() => clearTimeout(t));
    inner.current?.parentElement?.scrollTo({ top: 0 });
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id, attempt]);
  useEffect(() => {
    const el = inner.current?.parentElement;
    if (!el) return;
    // текущий раздел — тот, чей заголовок дошёл до верха листа; на телефоне верх листа — под шапкой и строкой номеров
    const edge = phone ? 120 : 80;
    const onScroll = () => {
      const secs = [...el.querySelectorAll<HTMLElement>('.sec[data-n]')];
      const top = el.getBoundingClientRect().top;
      let cur = 1;
      for (const s of secs) if (s.getBoundingClientRect().top - top < edge) cur = Number(s.dataset.n);
      setCurrent(cur);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });
  // лист на шапке показывает начало карточки; строка номеров на телефоне держит текущий раздел на виду (H3)
  useEffect(() => {
    if (sheet && stop === 'peek') aside.current?.scrollTo({ top: 0 });
  }, [sheet, stop, id]);
  useEffect(() => {
    if (!sheet) return;
    const rail = inner.current?.querySelector<HTMLElement>('.rail');
    const b = rail?.querySelector<HTMLElement>('button.current');
    if (!rail || !b || rail.scrollWidth <= rail.clientWidth) return;
    const want = b.offsetLeft + b.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollLeft = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, want));
  }, [sheet, current, id]);

  if (!id) return <aside class="folio" hidden />;
  const p = byId.get(id);
  if (!p) return <aside class="folio" hidden />;
  // карточка свёрнута в корешок: небу иначе осталось бы меньше 40 % (C1; решение 7)
  if (grid.value.spine) return <FolioSpine id={id} />;
  // тело карточки (D11; IX-45): том уже загружен — сразу; иначе до прихода нового держится прежнее тело (бледнее),
  // а «Загрузка карточки…» появляется, только если ждать дольше 300 мс
  const have = data && data.id === id ? data : loadedCard(id) ? { id, card: loadedCard(id)!, chrono: loadedChrono(id) } : null;
  const shownBody = have ?? (data && !slow && failed !== id ? data : null);
  const stale = !have && !!shownBody;

  // команды карточки — глаголами, одной строкой (F2; решение владельца 9); «Все 24 раздела» и печать — в колофоне
  const actions = (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          // на телефоне лист сначала сворачивается до шапки: перелёт идёт над ним, а не под ним (MOB-15)
          if (phone) sheetStop.value = 'peek';
          skyRef.flyTo(id);
        }}
      >
        Показать на небе
      </button>
      <button type="button" aria-pressed={pickMode.value === 'kinship'} onClick={() => { pickMode.value = pickMode.value === 'kinship' ? null : 'kinship'; second.value = null; }}>
        {pickMode.value === 'kinship' ? 'Выберите второе лицо…' : 'Найти родство с…'}
      </button>
      <button type="button" aria-pressed={pickMode.value === 'spread'} onClick={() => { pickMode.value = pickMode.value === 'spread' ? null : 'spread'; second.value = null; }}>
        {pickMode.value === 'spread' ? 'Выберите второе лицо…' : 'Открыть разворот с…'}
      </button>
    </div>
  );
  // рабочий набор и свёртка на небе (J3, J5) — второй строкой команд шапки: «Взять в работу» с выбором объёма, «Свернуть потомков»
  const workCmds = (
    <div class="workcmds">
      <WorkButton id={id} />
      <FoldButton id={id} />
    </div>
  );
  const others = cardStack.value.filter((x) => x !== id && byId.has(x));
  const folded = cardFolded.value;

  return (
    <aside class="folio" aria-label={`Карточка: ${p.name}`} ref={aside} data-stop={phone ? stop : undefined} data-folded={!phone && folded ? '' : undefined}>
      {phone && <SheetBar id={id} stop={stop} />}
      {/* стопка на телефоне — строка открытых карточек над листом (J6) */}
      {phone && others.length > 0 && <StackStrip ids={others} />}
      <div class="folio-inner" ref={inner}>
        {/* единый «×» (B3): липкий, в правом верхнем углу листа; на сенсорном экране — 44 × 44; на телефоне — в шапке листа */}
        {/* «×» снимает только выбор; открытая панель остаётся (D11; IX-26); карточка остаётся в стопке */}
        {!phone && <Close label="Закрыть карточку" onClick={() => (selected.value = null)} />}
        {/* «Свернуть» (J6): активная карточка — строкой стопки */}
        {!phone && !folded && (
          <button type="button" class="cmd fold-card" title="Свернуть карточку до строки" onClick={() => (cardFolded.value = true)}>
            Свернуть
          </button>
        )}
        {/* стопка (J6): другие открытые карточки — строками над активной; щелчок разворачивает */}
        {!phone && (others.length > 0 || folded) && <StackRows ids={others} active={folded ? id : null} />}
        {!phone && folded ? null : failed === id ? (
          <>
            <Masthead id={id} actions={<>{actions}{workCmds}</>} />
            <div class="load-error" role="alert">
              <p>{typo('Карточку не удалось загрузить: том с её разделами не пришёл. Проверьте связь и повторите.')}</p>
              <button type="button" class="cmd" onClick={() => setAttempt((a) => a + 1)}>
                Повторить
              </button>
            </div>
          </>
        ) : (
          <CardPage id={id} body={shownBody} stale={stale} current={current} actions={<>{actions}{workCmds}</>} />
        )}
        {!shownBody && failed !== id && slow && !(folded && !phone) ? (
          <p class="muted" role="status">
            Загрузка карточки…
          </p>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Корешок свёрнутой карточки (C1): 56 px — «×», имя и «развернуть». Развернуть — значит закрыть панель:
 * карточка и широкая панель вместе небу места не оставляют; прокрутка и фильтры панели помнятся (D11).
 */
function FolioSpine({ id }: { id: string }) {
  const p = byId.get(id)!;
  return (
    <aside class="folio spine" aria-label={`Карточка: ${p.name} (свёрнута)`}>
      <Close label="Закрыть карточку" onClick={() => (selected.value = null)} />
      <button type="button" class="unfold" aria-label={`Развернуть карточку: ${p.name}`} title="Развернуть карточку" onClick={unfoldCard}>
        <span class="nm">{p.name}</span>
        <span class="cmdl" aria-hidden="true">
          развернуть
        </span>
      </button>
    </aside>
  );
}


/** Годы лица для строки стопки: как в шапке листа. */
function stackYears(id: string): string {
  const c = model.value.chrono.get(id);
  return typo((c ? lifeSpanText(c, { people: isPeople(id) }) : '') || 'время не установлено');
}

/**
 * Стопка карточек (J6): открытые прежде карточки — строками «имя, уточнение, годы» над активной, самые недавние — выше.
 * Щелчок по строке делает карточку активной (и кладёт её наверх); «×» убирает её из стопки. active — активная
 * карточка, свёрнутая до строки: щелчок её разворачивает.
 */
function StackRows({ ids, active }: { ids: string[]; active: string | null }) {
  const row = (id: string, isActive: boolean) => {
    const p = byId.get(id)!;
    return (
      <li key={id} class={isActive ? 'stack-row active' : 'stack-row'} data-id={id}>
        <button
          type="button"
          class="sr-open"
          aria-label={`${isActive ? 'Развернуть карточку' : 'Открыть карточку'}: ${p.name}${p.disambig ? `, ${p.disambig}` : ''}`}
          onClick={() => (isActive ? (cardFolded.value = false) : goTo(id))}
        >
          <span class="nm">{p.name}</span>
          {p.disambig ? <span class="ds">{typo(`, ${p.disambig}`)}</span> : null}
          <span class="yrs">{stackYears(id)}</span>
        </button>
        <Close label={`Убрать из стопки: ${p.name}`} onClick={() => dropCard(id)} />
      </li>
    );
  };
  return (
    <ul class="stack" aria-label="Открытые карточки">
      {ids.map((id) => row(id, false))}
      {active && row(active, true)}
    </ul>
  );
}

/** Стопка на телефоне (J6): строка открытых карточек над листом; касание — карточка наверх, «×» — убрать. */
function StackStrip({ ids }: { ids: string[] }) {
  return (
    <ul class="stack-strip" aria-label="Открытые карточки">
      {ids.map((id) => {
        const p = byId.get(id)!;
        return (
          <li key={id} data-id={id}>
            <button type="button" class="sr-open" aria-label={`Открыть карточку: ${p.name}${p.disambig ? `, ${p.disambig}` : ''}`} onClick={() => goTo(id)}>
              {p.name}
            </button>
            <Close label={`Убрать из стопки: ${p.name}`} onClick={() => dropCard(id)} />
          </li>
        );
      })}
    </ul>
  );
}
