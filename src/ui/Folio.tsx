import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { ComponentChildren, VNode } from 'preact';
import { byId, lineMembership, loadCard, loadedCard, loadedChrono } from '../data/atlas.ts';
import type { Card, Chrono } from '../data/types.ts';
import { selected, second, pickMode, model, showSchema, panel } from '../state.ts';
import { grid, unfoldCard } from './layout.ts';
import { skyRef, plural, CAN_PRINT, goTo } from './common.tsx';
import { lowerFirst } from './text/ru.ts';
import { typo } from './text/typo.ts';
import { Masthead, isPeople, passportYears } from './card/Masthead.tsx';
import { Close } from './controls.tsx';
import { SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups } from './card/sections.tsx';
import { Clamp, clampItems } from './card/Clamp.tsx';
import { Brief, authoredCount } from './card/Brief.tsx';
import { Rail, RailKey, type SecState } from './card/Rail.tsx';
import { affiliation, MODEL_NAMES } from './card/shared.tsx';
import { reduced } from './sky/view.ts';
import { sheetStop, snapSheet, stopsFor, releaseVelocity, type SheetStop } from './sheet.ts';
import { cardFolded, cardTabs, closeCurrent, isPinned, pinCard, tabLabel, unpinCard, type CardTab } from './stack.ts';
import { WorkButton } from './panels/Work.tsx';
import { cardTitle, focusCardTitle, focusQuietly } from './focus.ts';
import { selectedUnion, selectUnion, unionById } from './reveal.ts';
import { DotSheet } from './sky/DotCard.tsx';
import { UnionCard, openerSection, unionTitle, unionYears } from './card/Union.tsx';
import { cardsTick } from './card/star.ts';
import type { Union } from '../engine/unions.ts';

export { Masthead, SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups };
export type { SecState };


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

/** Разделы, которые к народу и роду не относятся (решение 23; CARD-87): народ не рождается в год, современников нет. */
const PEOPLE_NA = new Set([8, 14]);

/**
 * Состояние каждого из 24 разделов (ТЗ § 3.3; решение владельца 6):
 * content — есть сведения; header — сведения в шапке (§ 1 — имя, § 5 — роль, § 7 — колено: раздел их не повторяет);
 * silent — составитель проверил: Писание молчит; na — § 21 у лица вне родословий Мессии, § 8 и § 14 у народа и рода;
 * absent — не составлен.
 */
export function sectionStates(id: string, out: Map<number, ComponentChildren>, card: Card | null): Record<number, SecState> {
  const p = byId.get(id)!;
  const silent = new Set(p.silent);
  const onLines = lineMembership.joseph.has(id) || lineMembership.mary.has(id);
  const people = isPeople(id);
  const st: Record<number, SecState> = {};
  for (const s of SECTIONS) {
    const n = s.n;
    if (out.has(n)) st[n] = 'content';
    else if (n === 1 || (n === 5 && p.roles.length) || (n === 7 && affiliation(id))) st[n] = 'header';
    else if (silent.has(n)) st[n] = 'silent';
    else if (n === 21 && !onLines && !card?.messiahNote?.length) st[n] = 'na';
    else if (people && PEOPLE_NA.has(n)) st[n] = 'na';
    else st[n] = 'absent';
  }
  return st;
}

/** Почему раздел не относится к лицу: народ и род — § 8, 14, 21 (CARD-87); лицо вне линий Мессии — § 21. */
export const naReason = (id: string) => (isPeople(id) ? 'не относится к народу' : 'не относится: лицо не входит в линии Мессии');

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
  // у народа: «§ 8, 14, 21 не относятся к народу»; у лица — «§ 21 не относится: лицо не входит в линии Мессии»
  if (na.length) parts.push(isPeople(id) ? `§ ${ranges(na)} ${na.length === 1 ? 'не относится' : 'не относятся'} к народу` : '§ 21 не относится: лицо не входит в линии Мессии');
  const c = model.value.chrono.get(id);
  // −966 — 967 г. до Р. Х. в астрономическом счёте: 4-й год Соломона, якорь хронологии (3 Цар 6:1);
  // у народа и рода годов в карточке нет (CARD-59) — и зависимости от модели тоже
  const dep = c && c.cls !== 'epochal' && !isPeople(id) && c.b < -966;
  return typo(
    `${parts.join('; ')}. Ссылки сверены с Синодальным текстом.` + (dep ? ` Годы до 967 г. до Р. Х. — по модели «${MODEL_NAMES[model.value.id] ?? model.value.id}».` : ''),
  );
}

/** Ссылки на стихи и «ещё N ссылок» внутри раздела карточки. */
const REF_STOPS = '.refs button.ref, .refs button.more';

/**
 * Ссылки на стихи раздела — одна остановка Tab (IX-42): у Давида их 89, и Tab по карточке шёл от стиха к стиху.
 * В каждом разделе в порядке Tab остаётся одна ссылка — та, на которой читатель был в этом разделе последней (сначала
 * первая); по ссылкам раздела — стрелками влево и вправо, Home и End, как по меткам рейки. Стрелки вверх и вниз
 * по-прежнему прокручивают лист, J и K переходят между разделами. Ссылки остаются кнопками: диктор находит их обходом
 * текста, Enter раскрывает стих под абзацем.
 * Разметку ссылок строит Refs (common.tsx); порядок Tab правится здесь, после каждой перестройки тела карточки.
 */
function useRefStops(root: { current: HTMLElement | null }, key: string) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const groupOf = (b: Element) => {
      const sec = b.closest('.sec');
      return sec ? [...sec.querySelectorAll<HTMLButtonElement>(REF_STOPS)].filter((x) => x.getClientRects().length) : [];
    };
    const settle = (g: HTMLButtonElement[], stop: HTMLButtonElement | undefined) => {
      for (const b of g) {
        const want = b === stop ? 0 : -1;
        if (b.tabIndex !== want) b.tabIndex = want;
      }
    };
    const apply = () => {
      for (const sec of el.querySelectorAll('.sec')) {
        const g = [...sec.querySelectorAll<HTMLButtonElement>(REF_STOPS)].filter((x) => x.getClientRects().length);
        if (!g.length) continue;
        settle(g, g.find((b) => b.dataset.stop === '') ?? g[0]);
      }
    };
    const onFocus = (e: FocusEvent) => {
      const b = e.target instanceof HTMLButtonElement && e.target.matches(REF_STOPS) ? e.target : null;
      if (!b) return;
      const g = groupOf(b);
      for (const x of g) delete x.dataset.stop;
      b.dataset.stop = '';
      settle(g, b);
    };
    const onKey = (e: KeyboardEvent) => {
      const b = e.target instanceof HTMLButtonElement && e.target.matches(REF_STOPS) ? e.target : null;
      if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
      const g = groupOf(b);
      const i = g.indexOf(b);
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? g.length - 1 : null;
      if (to === null || i < 0) return;
      e.preventDefault();
      e.stopPropagation();
      g[Math.max(0, Math.min(g.length - 1, to))].focus();
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('focusin', onFocus);
    el.addEventListener('keydown', onKey);
    return () => {
      mo.disconnect();
      el.removeEventListener('focusin', onFocus);
      el.removeEventListener('keydown', onKey);
    };
  }, [key]);
}

/** Заголовок раздела в строку («Имя. Давид…») — если тело раздела — один абзац или один пункт (F1; VIS-01, VIS-10). */
function runIn(body: ComponentChildren): VNode<{ class?: string; children?: ComponentChildren }> | null {
  const items = clampItems(body);
  if (items.length !== 1) return null;
  const v = items[0].node as VNode<{ class?: string; children?: ComponentChildren }>;
  return v.type === 'p' || v.type === 'li' ? v : null;
}

/** Состояние тела карточки: разделы, «Загрузка карточки…» (том ещё не пришёл) или «не удалось загрузить». */
export type BodyStatus = 'ok' | 'loading' | 'error';

/**
 * Тело карточки без загрузки данных (для листа, образца и разворота): шапка, «Кратко», команды, рейка,
 * разделы по частям I–VI, колофон.
 * id — лицо шапки; body — лицо, том и хронология тела (пока грузится том нового лица, тело — прежнего, бледнее).
 * actions — строка команд листа: под «Кратко», над двойной чертой (VIS-41); current — раздел, до которого дошла прокрутка.
 * status — вместо разделов строка «Загрузка карточки…» или сообщение «не удалось загрузить» с «Повторить» (onRetry).
 */
export function CardPage({
  id, body, stale = false, current = 0, actions, status = 'ok', onRetry,
}: {
  id: string;
  body: { id: string; card: Card | null; chrono: Chrono | null } | null;
  stale?: boolean;
  current?: number;
  actions?: ComponentChildren;
  status?: BodyStatus;
  onRetry?: () => void;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const bodyId = body?.id ?? id;
  const bp = byId.get(bodyId)!;
  const card = body?.card ?? null;
  const m = model.value;
  // тома других лиц (стихи матери ребёнка в § 9 — решение 92) пришли — разделы собираются заново
  const vols = cardsTick.value;
  // разделы собираются заново, только когда сменились лицо, том, модель или пришёл том родни: прокрутка меняет лишь
  // текущий раздел рейки
  const { out, states } = useMemo(() => {
    const o = buildSections(bodyId, bp, card, m, m.chrono.get(bodyId), '', body?.chrono ?? null);
    return { out: o, states: sectionStates(bodyId, o, card) };
  }, [bodyId, card, body?.chrono, m, vols]);
  const schema = showSchema.value;
  // малое лицо (F11; CARD-36): меньше трёх записей составителя — «Кратко» и есть статья, разделы — одной строкой
  const compact = !!card && authoredCount(card) < 3 && !schema && openFor !== bodyId;
  const ready = status === 'ok' && !!body;
  // Тело карточки другого лица (или другой модели) строится заново, а не перекраивается из прежнего (CARD-76): разделы
  // с одним номером у двух лиц устроены по-разному (заголовок в строку, списки, вложенные фрагменты), и перекройка роняла
  // Preact на insertBefore — в новой карточке оставались разделы прежнего лица, затем лист переставал обновляться.
  // Ключ — у тела, «Кратко», рейки и колофона; шапка — по лицу шапки (id).
  const bodyKey = `${bodyId}|${m.id}`;
  const lead = useRef<HTMLDivElement>(null);
  const bodyEl = useRef<HTMLDivElement>(null);
  useRefStops(bodyEl, `${bodyKey}|${ready}|${compact}|${schema}`);
  const shownKey = useRef(bodyKey);
  const refocus = useRef(false);
  if (shownKey.current !== bodyKey) {
    // фокус был в теле прежнего лица (ссылка, «ещё N …», метка рейки) — после смены тела он ушёл бы на body
    const box = lead.current?.parentElement;
    if (typeof document !== 'undefined' && box?.contains(document.activeElement) && !document.activeElement?.closest('.mast, .actions')) refocus.current = true;
    shownKey.current = bodyKey;
  }
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    // как после перехода по ссылке (I2): фокус — на заголовок карточки нового лица
    focusQuietly(cardTitle(id) ?? lead.current?.parentElement?.querySelector<HTMLElement>('h2') ?? null);
  }, [bodyKey]);

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
    const titles = run.map((n, i) => (i ? lowerFirst(SECTIONS[n - 1].title) : SECTIONS[n - 1].title)).join(', ');
    const last = run[run.length - 1];
    // диапазон «9–12» на поле — в две строки, «9» над «–12» (VIS-42): рисует ::before из data-n и data-to (folio.css),
    // а сам номер остаётся текстом строки для диктора и поиска
    blocks.push(
      <div class={`sec ${st}`} key={`run${run[0]}`} data-n={run[0]} data-to={last !== run[0] ? last : undefined} id={`sec-${run[0]}`}>
        <span class="no">{last !== run[0] ? `${run[0]}–${last}` : `${run[0]}`}</span>
        {typo(`${titles} — ${st === 'silent' ? 'в Писании не сообщается' : st === 'na' ? naReason(bodyId) : 'раздел не составлен'}`)}
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
      blocks.push(<PartHead key={`p${s.part}`} part={s.part} />);
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
      <Masthead key={id} id={id} card={body?.id === id ? card : null} />
      {status === 'error' ? null : <Brief key={bodyKey} id={bodyId} card={card} />}
      {actions}
      <div class="mast-rule" aria-hidden="true" ref={lead} />
      {status === 'error' ? (
        <div class="load-error" role="alert">
          <p>{typo('Карточку не удалось загрузить: том с её разделами не пришёл. Проверьте связь и повторите.')}</p>
          <button type="button" class="cmd" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : status === 'loading' ? (
        // том ещё не пришёл (D11; IX-45): строка на месте разделов; рейки и колофона нет — им нечего перечислять
        <p class="muted load-wait" role="status">
          Загрузка карточки…
        </p>
      ) : null}
      {/* рейка — вровень с первым разделом (VIS-07); на телефоне — строка номеров под шапкой */}
      {ready && !compact ? <Rail key={bodyKey} states={states} current={current} onGo={go} /> : null}
      {ready ? (
        <div class={stale ? 'folio-body stale' : 'folio-body'} key={bodyKey} ref={bodyEl} aria-busy={stale ? 'true' : undefined}>
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
      {ready ? (
        <footer class="colophon" key={bodyKey}>
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
      ) : null}
    </>
  );
}

/** Название части (VIS-39): римская цифра — на поле, в колонке номеров; слово — курсивом, как подпись, а не надзаголовок. */
function PartHead({ part }: { part: number }) {
  const [roman, ...rest] = PARTS[part].split(' ');
  return (
    <h3 class="part">
      <span class="pn">{roman}</span> <span class="pt">{rest.join(' ')}</span>
    </h3>
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
 * Нижний лист на 214 px — это и есть карточка у звезды (этап 11, решение 77; STAGE11.md § 6): ручка, образ, имя, уточнение
 * и годы, две строки «Родства», команды «Карточка ▴», «Только его род ▾», «Родство с…» и «×». Выбранная связь или ромб
 * союза — их карточка на том же месте. За свободное место лист тянется, как за шапку; касание поднимает лист до 55 %.
 */
function DotSheetBar({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div class="sheet-bar sheet-dot">
      <div class="grab" aria-hidden="true">
        <span />
      </div>
      <DotSheet id={id} />
      <Close label="Закрыть карточку" onClick={onClose} />
    </div>
  );
}

/**
 * Закреплённая шапка нижнего листа (H2; MOB-12, MOB-15): ручка, имя, «Закрепить» (решение 91), «Развернуть» или «Свернуть»
 * и «×» (44 × 44).
 * На шапке (104 px) под именем — годы и уточнение (MOB-11, MOB-64): шапка занимает весь лист на 104 px, и ни одна
 * строка не режется его краем.
 * Имя здесь — для глаз: заголовком карточки для диктора и для фокуса остаётся h2 шапки карточки (Masthead).
 */
function SheetBar({ id, stop, onClose, union }: { id: string; stop: SheetStop; onClose: () => void; union?: Union | null }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  // карточка союза (решение 71): в шапке листа — имена супругов и годы рождения детей; «×» возвращает карточку лица
  const years = union ? (unionYears(union)?.text ?? '') : passportYears(id, c);
  const full = stop === 'full';
  return (
    <div class="sheet-bar">
      <div class="grab" aria-hidden="true">
        <span />
      </div>
      <div class="bar-row">
        <div class="bar-name" aria-hidden="true">
          {union ? unionTitle(union) : p.name}
        </div>
        {/* «Закрепить» — рядом со «Свернуть» (решение 91); у карточки союза её нет */}
        {!union && <PinCmd id={id} phone />}
        <button
          type="button"
          class="cmd bar-toggle"
          aria-expanded={full}
          aria-label={full ? 'Свернуть карточку' : 'Развернуть карточку'}
          onClick={() => (sheetStop.value = full ? 'peek' : 'full')}
        >
          {full ? 'Свернуть' : 'Развернуть'}
        </button>
        {/* «×» закрывает карточку; закреплённая остаётся вкладкой; панель остаётся (D11; решение 91) */}
        <Close label={union ? 'Закрыть карточку союза' : 'Закрыть карточку'} onClick={onClose} />
      </div>
      {stop === 'peek' && (
        <div class="bar-peek" aria-hidden="true">
          <div class="bar-years">{typo(years || 'время не установлено')}</div>
          {union ? <div class="bar-dis">карточка союза</div> : p.disambig ? <div class="bar-dis">{typo(p.disambig)}</div> : null}
        </div>
      )}
    </div>
  );
}

/**
 * Команды шапки карточки — одной строкой (F2; CARD-54, VIS-41; решения 9 и 26): глаголы с однострочными пояснениями;
 * «Взять в работу ▾» раскрывает выбор объёма, в нём же — «Скрыть потомков на небе».
 */
function CardActions({ id, phone }: { id: string; phone: boolean }) {
  const pick = pickMode.value;
  const toggle = (mode: 'kinship' | 'spread', btn: HTMLButtonElement) => {
    const on = pick !== mode;
    pickMode.value = on ? mode : null;
    second.value = null;
    // на телефоне и при масштабе 200 % (узкое окно — нижний лист) выбор сворачивает лист до шапки, и кнопка уходит за край:
    // фокус — на небо, где выбирают второе лицо (стрелки и Enter; строку выбора диктор слышит из её живой области), как
    // в панели «Родство» (MOB-47, MOB-72; WCAG 2.4.11). Отмена возвращает фокус на кнопку (usePickReturn)
    pickFrom = on && phone ? { btn, mode } : null;
    if (pickFrom) window.setTimeout(() => document.querySelector<HTMLElement>('.sky canvas')?.focus({ preventScroll: true }), 0);
  };
  usePickReturn();
  return (
    <div class="actions">
      {/* на узком листе (400 px и уже) — «На небе»: четыре команды — одной строкой (VIS-79, IX-81); имя для диктора —
          полное, видимая надпись входит в него (WCAG 2.5.3) */}
      <button
        type="button"
        class="show-on-sky"
        title="Перелететь к звезде лица на небе"
        aria-label="Показать на небе"
        onClick={() => {
          // на телефоне лист сначала сворачивается до шапки: перелёт идёт над ним, а не под ним (MOB-15)
          if (phone) sheetStop.value = 'peek';
          skyRef.flyTo(id);
        }}
      >
        <span class="full">Показать на небе</span>
        <span class="short" aria-hidden="true">
          На небе
        </span>
      </button>
      {/* в режиме выбора второго лица надпись и ширина те же — меняется только нажатость (IX-22): ряд не перестраивается,
          а что делать дальше, говорит строка у кромки неба */}
      <button type="button" aria-pressed={pick === 'kinship'} title="Как связаны это лицо и второе: выберите его на небе или в поиске" onClick={(e) => toggle('kinship', e.currentTarget)}>
        Родство с…
      </button>
      <button type="button" aria-pressed={pick === 'spread'} title="Две карточки рядом: выберите второе лицо" onClick={(e) => toggle('spread', e.currentTarget)}>
        Разворот с…
      </button>
      <WorkButton id={id} />
    </div>
  );
}

/** Выбор второго лица начат командой карточки на телефоне (MOB-72): кнопка, на которую вернуть фокус при отмене. */
let pickFrom: { btn: HTMLButtonElement; mode: 'kinship' | 'spread' } | null = null;
/** Лист возвращается в прежнее положение за это время (sheet.ts, переход высоты): потом кнопка видна и получает фокус. */
const PICK_RETURN_MS = 320;

/**
 * Отмена выбора (Escape, «отменить») на телефоне (MOB-72): лист возвращается в прежнее положение (sheet.ts), фокус — на
 * кнопку «Родство с…» или «Разворот с…», прокрученную в видимую часть листа под его закреплённой шапкой
 * (scroll-margin-top в folio.css; WCAG 2.4.11). Выбор закончен (открылась панель) — фокус ставит панель (focus.ts).
 */
function usePickReturn() {
  const mode = pickMode.value;
  useEffect(() => {
    if (mode || !pickFrom) return;
    const from = pickFrom;
    pickFrom = null;
    const t = window.setTimeout(() => {
      const a = document.activeElement;
      // фокус уже там, куда его поставила панель, поиск или сам читатель, — не трогать
      if (!from.btn.isConnected || (a && a !== document.body && !a.closest('.sky'))) return;
      from.btn.scrollIntoView({ block: 'nearest' });
      from.btn.focus({ preventScroll: true });
    }, PICK_RETURN_MS);
    return () => window.clearTimeout(t);
  }, [mode]);
}

/**
 * «×» карточки (решение 91): карточка закрывается, прежней из стопки больше нет; закреплённая остаётся вкладкой — фокус
 * на её вкладку (useTabReturn), иначе — туда, откуда карточку открыли (src/ui/focus.ts).
 */
function closeActive(_id: string) {
  // выбор второго лица относился к закрытой карточке
  pickMode.value = null;
  closeCurrent();
}

/** После «Свернуть карточку» фокус — на «развернуть» корешка (кнопка «Свернуть карточку» уходит из разметки). */
let focusSpine = false;

/** Прокрутка карточки лица перед переходом к карточке союза: лист возвращается на то же место. */
const personTop = new WeakMap<HTMLElement, number>();

/**
 * Переход «карточка лица ⇄ карточка союза» в одном листе (решение 71): карточка союза открывается с начала; «×» или
 * Escape возвращают карточку лица на прежнее место прокрутки, фокус — на ссылку «союз», с которой пришли (иначе — на
 * заголовок карточки). Другое лицо (выбор на небе, ссылка на ребёнка) — обычный переход, без возврата.
 */
function useUnionReturn(aside: { current: HTMLElement | null }, id: string | null, uid: string | null) {
  const last = useRef<{ id: string | null; uid: string | null; top: number }>({ id, uid, top: 0 });
  useLayoutEffect(() => {
    const el = aside.current;
    const was = last.current;
    if (was.id === id && was.uid === uid) return;
    if (uid && el) {
      // вход в союз из карточки лица — запомнить её место; из союза в союз — место остаётся прежним
      const top = was.id === id && !was.uid ? (personTop.get(el) ?? 0) : was.id === id ? was.top : 0;
      last.current = { id, uid, top };
      el.scrollTo({ top: 0 });
      return;
    }
    last.current = { id, uid, top: 0 };
    if (!el || was.id !== id || !was.uid) return;
    const from = was.uid;
    el.scrollTop = was.top;
    personTop.set(el, was.top);
    // разделы карточки сначала выводятся целиком, затем предел «8 строк» (Clamp) их сворачивает: место и ссылка — после
    // этого, в следующем кадре; ссылка — в том разделе, из которого пришли, и видимая (не под «ещё N записей»)
    requestAnimationFrame(() => {
      if (!el.isConnected || el.hasAttribute('data-union')) return;
      el.scrollTop = was.top;
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      const sec = openerSection(from);
      const scope = (sec && el.querySelector(`#${CSS.escape(sec)}`)) || el;
      const link = [...scope.querySelectorAll<HTMLElement>(`.folio-body [data-union="${CSS.escape(from)}"]`)].find((x) => x.getClientRects().length > 0);
      if (link) focusQuietly(link);
      else focusCardTitle(id!);
    });
  }, [id, uid]);
}

export function Folio({ id: forcedId, forceState }: { id?: string; forceState?: 'loading' | 'error' } = {}) {
  const id = forcedId ?? selected.value;
  // образец (#/specimen, VIS-55) показывает «Загрузку» и «Ошибку» живыми: лист в этом состоянии, без вкладок и листа телефона
  const live = !forceState;
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
  const spine = grid.value.spine;
  const tabs = live ? cardTabs.value.filter((t) => byId.has(t.id)) : [];
  const stop = sheetStop.value;
  const sheet = live && phone && !!id && byId.has(id);
  // карточка союза (решение 71) — вместо карточки лица: лицо остаётся выбранным, вкладки не меняются
  const uid = live && id ? selectedUnion.value : null;
  const union = uid ? (unionById(uid) ?? null) : null;
  useUnionReturn(aside, id ?? null, union?.id ?? null);
  useTabReturn(live ? (id ?? null) : null);
  useSheetDrag(aside, sheet);
  useEffect(() => {
    if (!id || !live) return;
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
  }, [id, attempt, live]);
  useEffect(() => {
    const el = inner.current?.parentElement;
    if (!el) return;
    // текущий раздел — тот, чей заголовок дошёл до верха листа (под закреплённой полосой); на телефоне — под шапкой листа
    const edge = phone ? 120 : 96;
    const onScroll = () => {
      const secs = [...el.querySelectorAll<HTMLElement>('.sec[data-n]')];
      const top = el.getBoundingClientRect().top;
      let cur = 1;
      for (const s of secs) if (s.getBoundingClientRect().top - top < edge) cur = Number(s.dataset.n);
      setCurrent(cur);
      // закреплённая полоса получает фон и черту, когда под неё уходит текст (CARD-53, UX-67)
      el.toggleAttribute('data-scrolled', el.scrollTop > BAR_H - 4);
      // место в карточке лица — чтобы вернуться на него после карточки союза
      if (!el.hasAttribute('data-union')) personTop.set(el, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });
  // лист на шапке показывает начало карточки; строка номеров на телефоне держит текущий раздел на виду (H3)
  useEffect(() => {
    if (sheet && stop === 'peek') aside.current?.scrollTo({ top: 0 });
  }, [sheet, stop, id]);
  // фокус клавиатуры ушёл в тело листа, свёрнутого до шапки, — лист поднимается на 55 %: фокус не прячется (MOB-50)
  useEffect(() => {
    const el = aside.current;
    if (!el || !sheet) return;
    // заголовок карточки (h2) на телефоне скрыт, его фокус виден на имени шапки листа (phone.css): поиск и ссылки ставят
    // фокус на него, и лист остаётся на шапке
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (sheetStop.peek() !== 'peek' || !(t instanceof HTMLElement) || t.closest('.sheet-bar') || t.matches('.mast h2')) return;
      sheetStop.value = 'half';
      // после подъёма — поле фокуса ниже закреплённой шапки листа (WCAG 2.4.11)
      window.setTimeout(() => {
        const bar = el.querySelector('.sheet-bar')?.getBoundingClientRect();
        const r = t.getBoundingClientRect();
        const fr = el.getBoundingClientRect();
        if (!bar) return;
        if (r.top < bar.bottom + 8) el.scrollTop -= bar.bottom + 8 - r.top;
        else if (r.bottom > fr.bottom - 8) el.scrollTop += r.bottom - fr.bottom + 8;
      }, 320);
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, [sheet]);
  useEffect(() => {
    if (!sheet) return;
    const rail = inner.current?.querySelector<HTMLElement>('.rail');
    const b = rail?.querySelector<HTMLElement>('button.current');
    if (!rail || !b || rail.scrollWidth <= rail.clientWidth) return;
    const want = b.offsetLeft + b.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollLeft = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, want));
  }, [sheet, current, id]);
  // сколько места команды закреплённой полосы занимают в колонке текста: имя в первой строке их обходит (folio.css, --bar-cmds)
  useLayoutEffect(() => {
    const el = aside.current;
    const cmds = el?.querySelector<HTMLElement>('.folio-bar .bar-cmds');
    const col = inner.current;
    if (!el || !cmds || !col) return;
    const set = () => {
      const box = col.getBoundingClientRect();
      const ccs = getComputedStyle(col);
      const right = box.right - parseFloat(ccs.paddingRight);
      pinLabel(el, cmds, col, box.left + parseFloat(ccs.paddingLeft));
      el.style.setProperty('--bar-cmds', `${Math.max(0, Math.ceil(right - cmds.getBoundingClientRect().left + 8))}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(cmds);
    ro.observe(col);
    return () => ro.disconnect();
  }, [id, phone, live, tabs.length, spine, union?.id]);

  const p = id ? byId.get(id) : undefined;
  if (!id || !p) {
    // лицо не выбрано, но есть закреплённые карточки (решение 91): вкладки видны всегда — корешком справа, на телефоне —
    // строками над полосой времени
    if (live && tabs.length) return phone ? <TabsOnly tabs={tabs} /> : <TabsSpine tabs={tabs} />;
    return <aside class="folio" hidden />;
  }
  // карточка свёрнута в корешок: её свернул читатель, «Небо во весь экран» или небу иначе осталось бы меньше 40 %
  // (C1; решения 7 и 18)
  if (live && spine) return <FolioSpine id={id} tabs={tabs} />;
  // тело карточки (D11; IX-45): том уже загружен — сразу; иначе до прихода нового держится прежнее тело (бледнее),
  // а «Загрузка карточки…» появляется, только если ждать дольше 300 мс
  const have = !live ? null : data && data.id === id ? data : loadedCard(id) ? { id, card: loadedCard(id)!, chrono: loadedChrono(id) } : null;
  const shownBody = have ?? (live && data && !slow && failed !== id ? data : null);
  const stale = !have && !!shownBody;
  // «Загрузка карточки…» — только если том не пришёл за 300 мс: быстрые переходы её не показывают (D11)
  const status: BodyStatus = forceState ?? (failed === id ? 'error' : !shownBody && slow ? 'loading' : 'ok');
  const close = () => closeActive(id);

  if (union)
    return (
      <aside
        class="folio"
        aria-label={`Карточка союза: ${unionTitle(union)}`}
        ref={aside}
        data-union={union.id}
        data-stop={sheet ? stop : undefined}
        onKeyDown={(e) => {
          // Escape в карточке союза возвращает карточку лица — одно видимое состояние (D5); выбор второго лица и
          // открытая панель снимаются раньше, общим порядком (keys.ts)
          if (e.key !== 'Escape' || e.defaultPrevented || pickMode.peek() || panel.peek()) return;
          e.preventDefault();
          selectUnion(null);
        }}
      >
        {sheet && <SheetBar id={id} stop={stop} onClose={() => selectUnion(null)} union={union} />}
        {sheet && tabs.length > 0 && <CardTabs tabs={tabs} current={id} phone />}
        {live && !phone && tabs.length > 0 && <CardTabs tabs={tabs} current={id} />}
        {live && !phone && <FolioBar id={id} onClose={() => selectUnion(null)} closeLabel="Закрыть карточку союза" />}
        <div class="folio-inner" ref={inner} key={`union|${union.id}`}>
          <UnionCard u={union} from={id} />
        </div>
        <TabNews />
      </aside>
    );

  return (
    <aside class="folio" aria-label={`Карточка: ${p.name}`} ref={aside} data-stop={sheet ? stop : undefined} data-state={status === 'ok' ? undefined : status}>
      {/* на 214 px лист — карточка у звезды (решение 77); выше — шапка листа и подробная карточка */}
      {sheet && (stop === 'peek' ? <DotSheetBar id={id} onClose={close} /> : <SheetBar id={id} stop={stop} onClose={close} />)}
      {/* закреплённые карточки (решение 91): вкладки вверху панели; на телефоне — строками над листом */}
      {sheet && tabs.length > 0 && <CardTabs tabs={tabs} current={id} phone />}
      {live && !phone && tabs.length > 0 && <CardTabs tabs={tabs} current={id} />}
      {live && !phone && <FolioBar id={id} person onClose={close} />}
      {/* полоса и тело карточки — соседи: имя обходит команды полосы (folio.css, .folio-bar + .folio-inner) */}
      <div class="folio-inner" ref={inner}>
        <CardPage
          id={id}
          body={shownBody}
          stale={stale}
          current={current}
          actions={<CardActions id={id} phone={phone} />}
          status={status}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      </div>
      {live && <TabNews />}
    </aside>
  );
}

/** Холст для замеров надписей (имя, команда закрепления). */
let measureCanvas: HTMLCanvasElement | null = null;
const textWidth = (el: Element, text: string): number => {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
};

/**
 * Надпись «Закрепить карточку персонажа» в полосе (решение 91) — полная, если имя лица помещается в первой строке рядом
 * с командами; если имя встаёт рядом только с короткой «Закрепить» — короткая (data-pin-short): первый экран не теряет
 * строки (VIS-41: § 1 — на первом экране). Имя не помещается и рядом с короткой — полная: строка всё равно уходит под
 * команды. Имя для диктора — всегда полное (WCAG 2.5.3). На узком листе — короткая всегда (folio.css, @container).
 */
function pinLabel(el: HTMLElement, cmds: HTMLElement, col: HTMLElement, colLeft: number) {
  const pin = cmds.querySelector<HTMLElement>('.pin-card');
  const nm = col.querySelector<HTMLElement>('.mast h2 .nm');
  if (!pin || !nm) {
    el.removeAttribute('data-pin-short');
    return;
  }
  const ps = getComputedStyle(pin);
  const pad = parseFloat(ps.paddingLeft) + parseFloat(ps.paddingRight) + parseFloat(ps.borderLeftWidth) + parseFloat(ps.borderRightWidth);
  const full = textWidth(pin, pin.querySelector('.full')?.textContent ?? '') + pad;
  const short = textWidth(pin, pin.querySelector('.short')?.textContent ?? '') + pad;
  const c = cmds.getBoundingClientRect();
  const others = c.width - pin.getBoundingClientRect().width;
  // место имени в первой строке при ширине команды w: от левого края колонки до команд, с зазором 8 px (как --bar-cmds)
  const room = (w: number) => c.right - others - w - 8 - colLeft;
  const name = textWidth(nm, nm.textContent ?? '');
  el.toggleAttribute('data-pin-short', name > room(full) && name <= room(short));
}

/** Высота закреплённой полосы карточки, px (folio.css, .folio-bar). */
const BAR_H = 36;

/**
 * Закреплённая полоса листа (CARD-53, UX-67; решения 18, 91): на всю ширину листа, текст прокручивается под ней.
 * Справа — «Закрепить карточку персонажа» (у закреплённой — «Открепить карточку персонажа»), «Свернуть карточку» и «×».
 * Полоса лежит на строке имени и прозрачна, пока лист не прокручен (data-scrolled): первый экран не теряет строки; имя
 * обходит её команды (--bar-cmds). У карточки союза команды закрепления нет: закрепляется карточка лица.
 */
function FolioBar({ id, person = false, onClose, closeLabel = 'Закрыть карточку' }: { id: string; person?: boolean; onClose: () => void; closeLabel?: string }) {
  return (
    <div class="folio-bar">
      <span class="bar-cmds">
        {person && <PinCmd id={id} />}
        <button
          type="button"
          class="cmd fold-card"
          title="Небо займёт место карточки; развернуть — на корешке справа"
          onClick={() => {
            focusSpine = true;
            cardFolded.value = true;
          }}
        >
          Свернуть карточку
        </button>
        <Close label={closeLabel} onClick={onClose} />
      </span>
    </div>
  );
}

/** Что сделали с вкладками — для диктора (role="status" листа): «Карточка закреплена: Давид». */
const tabNews = signal('');
let newsTimer = 0;
function tell(text: string) {
  tabNews.value = text;
  if (typeof window === 'undefined') return;
  window.clearTimeout(newsTimer);
  newsTimer = window.setTimeout(() => (tabNews.value = ''), 4000);
}
/** Живая строка листа: закрепление, открепление, закрытие вкладки. */
function TabNews() {
  return (
    <p class="visually-hidden" role="status">
      {tabNews.value}
    </p>
  );
}

/**
 * «Закрепить карточку персонажа» ⇄ «Открепить карточку персонажа» (решение 91). Надпись меняется, фокус остаётся на
 * команде; на узком листе видно «Закрепить» и «Открепить», имя для диктора — полное (WCAG 2.5.3).
 */
function PinCmd({ id, phone = false }: { id: string; phone?: boolean }) {
  const pinned = isPinned(id, cardTabs.value);
  const full = pinned ? 'Открепить карточку персонажа' : 'Закрепить карточку персонажа';
  const name = byId.get(id)?.name ?? id;
  return (
    <button
      type="button"
      class={`cmd pin-card${phone ? ' bar-pin' : ''}`}
      data-pinned={pinned ? '' : undefined}
      aria-label={full}
      title={pinned ? 'Убрать вкладку этой карточки из панели' : 'Карточка останется вкладкой вверху панели, когда откроется другая'}
      onClick={() => {
        if (pinned) {
          unpinCard(id);
          tell(`Карточка откреплена: ${name}`);
        } else {
          pinCard(id);
          tell(`Карточка закреплена, её вкладка — вверху панели: ${name}`);
        }
      }}
    >
      <span class="full">{full}</span>
      <span class="short" aria-hidden="true">
        {pinned ? 'Открепить' : 'Закрепить'}
      </span>
    </button>
  );
}

/** Вкладка, на которую поставить фокус после следующей отрисовки вкладок (свернули раскрытую, закрыли соседнюю). */
let focusTabNext: string | null = null;

/** Фокус на вкладку id, когда её строка появится: в листе, в корешке или на телефоне. */
function useTabFocus(root: { current: HTMLElement | null }, key: string) {
  useLayoutEffect(() => {
    const want = focusTabNext;
    if (!want || !root.current) return;
    const b = root.current.querySelector<HTMLElement>(`[data-id="${CSS.escape(want)}"] .tab-open`);
    if (!b) return;
    focusTabNext = null;
    b.focus({ preventScroll: true });
  }, [key]);
}

/**
 * Закреплённая карточка свернулась без команды вкладки (Escape, «×» карточки): фокус был в ней и потерян — он встаёт на
 * её вкладку (решение 91), а не уходит на небо.
 */
function useTabReturn(id: string | null) {
  const last = useRef(id);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = id;
    if (id || !was || !isPinned(was, cardTabs.peek())) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    // вкладки уже в разметке (корешок, строки телефона): эффекты дочерних частей прошли раньше этого
    const b = document.querySelector<HTMLElement>(`.app > .folio [data-id="${CSS.escape(was)}"] .tab-open`);
    if (b) b.focus({ preventScroll: true });
    else focusTabNext = was;
  }, [id]);
}

/** Раскрыть вкладку (выбрать лицо, перелететь к нему, если его нет на экране) или свернуть раскрытую. */
function toggleTab(id: string, open: boolean) {
  if (open) {
    focusTabNext = id;
    pickMode.value = null;
    closeCurrent();
    return;
  }
  goTo(id);
  cardFolded.value = false;
}

/** «×» вкладки: вкладка уходит; раскрытая карточка остаётся текущей, уже незакреплённой. Фокус — на соседнюю вкладку. */
function closeTab(t: CardTab, list: readonly CardTab[]) {
  const i = list.findIndex((x) => x.id === t.id);
  const next = list[i + 1] ?? list[i - 1] ?? null;
  unpinCard(t.id);
  tell(`Вкладка закрыта: ${byId.get(t.id)?.name ?? t.id}`);
  if (next) focusTabNext = next.id;
  else if (selected.peek()) focusCardTitle(selected.peek()!);
  else window.setTimeout(() => document.querySelector<HTMLElement>('.sky canvas')?.focus({ preventScroll: true }), 0);
}

/**
 * Вкладки закреплённых карточек (решение 91): строки вверху панели по порядку закрепления — цветная метка, имя
 * с уточнением целыми словами, «×» («Закрыть вкладку …»). Вкладка — кнопка с aria-expanded: у раскрытой (текущая карточка)
 * — true, щелчок сворачивает её; у свёрнутой щелчок раскрывает. На телефоне — те же строки над листом (phone).
 */
function CardTabs({ tabs, current, phone = false }: { tabs: readonly CardTab[]; current: string | null; phone?: boolean }) {
  const root = useRef<HTMLUListElement>(null);
  useTabFocus(root, `${tabs.map((t) => t.id).join('|')}#${current ?? ''}`);
  return (
    // на телефоне — ещё и .stack-strip: небо оставляет место над строками (src/ui/SkyView.tsx, insets)
    <ul class={phone ? 'card-tabs stack-strip' : 'card-tabs'} ref={root} aria-label="Закреплённые карточки" data-many={tabs.length > 3 ? '' : undefined}>
      {tabs.map((t) => {
        const l = tabLabel(t.id);
        const open = t.id === current;
        return (
          <li key={t.id} class="card-tab" data-id={t.id} data-hue={t.hue + 1} data-open={open ? '' : undefined}>
            <button
              type="button"
              class="tab-open"
              aria-expanded={open}
              aria-label={l.full}
              title={open ? 'Свернуть карточку во вкладку' : 'Раскрыть карточку'}
              onClick={() => toggleTab(t.id, open)}
            >
              <span class="tab-mark" aria-hidden="true" />
              <span class="nm">{l.name}</span>
              {l.dis ? <FitWords class="ds" text={typo(l.dis)} /> : null}
            </button>
            <Close label={`Закрыть вкладку: ${l.full}`} onClick={() => closeTab(t, tabs)} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Уточнение во вкладке — сколько помещается в строку, целыми словами с многоточием (VIS-48: не посреди слова); не
 * помещается ни одно слово — уточнения нет. Полное — в имени вкладки для диктора и в подсказке.
 */
function FitWords({ text, class: cls }: { text: string; class: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string | null>(text);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const bs = getComputedStyle(box);
      const rest = [...box.children].filter((c) => c !== el) as HTMLElement[];
      const gap = parseFloat(bs.columnGap || '0') || 0;
      const room = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight) - rest.reduce((w, c) => w + c.getBoundingClientRect().width + gap, 0) - 2;
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx || room <= 0) return setShown(room <= 0 ? null : text);
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if (ctx.measureText(text).width <= room) return setShown(text);
      let best: string | null = null;
      let out = '';
      for (const w of text.split(' ')) {
        out = out ? `${out} ${w}` : w;
        const cand = `${out.replace(/[,;:.\s—–-]+$/, '')}…`;
        if (ctx.measureText(cand).width > room) break;
        best = cand;
      }
      setShown(best);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span class={cls} ref={ref}>
      {shown ?? ''}
    </span>
  );
}

/** Вкладки для образца (#/specimen, ТЗ § 5.7): все восемь цветов палитры, раскрыта вторая — те же строки, что в листе. */
const SPEC_TABS: readonly CardTab[] = ['david', 'ruf', 'avraam', 'sarra', 'moisey', 'iakov', 'rakhil', 'iosif'].map((id, hue) => ({ id, hue }));
export function TabsSpecimen() {
  return (
    <div class="folio spec-tabs">
      <CardTabs tabs={SPEC_TABS.filter((t) => byId.has(t.id))} current="ruf" />
    </div>
  );
}

/**
 * Вкладки на корешке (решение 91): имена снизу вверх, как на корешке, у каждого — цветная метка; щелчок раскрывает
 * карточку. В корешке свёрнутой карточки — все закреплённые, кроме неё самой.
 */
function SpineTabs({ tabs, label }: { tabs: readonly CardTab[]; label: string }) {
  const root = useRef<HTMLUListElement>(null);
  useTabFocus(root, tabs.map((t) => t.id).join('|'));
  if (!tabs.length) return null;
  return (
    <ul class="spine-tabs" ref={root} aria-label={label}>
      {tabs.map((t) => {
        const l = tabLabel(t.id);
        return (
          <li key={t.id} data-id={t.id} data-hue={t.hue + 1}>
            <button type="button" class="tab-open sp-open" aria-expanded="false" aria-label={l.full} title={`Раскрыть карточку: ${l.full}`} onClick={() => toggleTab(t.id, false)}>
              <span class="tab-mark" aria-hidden="true" />
              <span class="nm">{l.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Лицо не выбрано, вкладки есть (решение 91): колонка карточки — корешок 56 px с вкладками. */
function TabsSpine({ tabs }: { tabs: readonly CardTab[] }) {
  return (
    <aside class="folio spine tabs-only" aria-label="Закреплённые карточки">
      <span class="sp-cap" aria-hidden="true">
        вкладки
      </span>
      <SpineTabs tabs={tabs} label="Закреплённые карточки" />
      <TabNews />
    </aside>
  );
}

/** Телефон, лицо не выбрано, вкладки есть (решение 91): строки вкладок над полосой времени, листа нет. */
function TabsOnly({ tabs }: { tabs: readonly CardTab[] }) {
  return (
    <aside class="folio tabs-only" aria-label="Закреплённые карточки">
      <CardTabs tabs={tabs} current={null} phone />
      <TabNews />
    </aside>
  );
}

/**
 * Корешок карточки (C1; VIS-44, UX-50; решения 7, 18, 91): 56 px — «×», имя и «развернуть», ниже — вкладки закреплённых
 * карточек снизу вверх, как на корешке. Корешок бывает по выбору читателя («Свернуть карточку»), в «Небе во весь экран»
 * и когда рядом с широкой панелью небу не хватило бы места; «развернуть» снимает причину (layout.ts, unfoldCard).
 */
function FolioSpine({ id, tabs }: { id: string; tabs: readonly CardTab[] }) {
  const p = byId.get(id)!;
  const unfold = useRef<HTMLButtonElement>(null);
  const own = tabs.find((t) => t.id === id);
  const others = tabs.filter((t) => t.id !== id);
  useLayoutEffect(() => {
    if (!focusSpine) return;
    focusSpine = false;
    unfold.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside class="folio spine" aria-label={`Карточка: ${p.name} (свёрнута)`} data-hue={own ? own.hue + 1 : undefined}>
      <Close label="Закрыть карточку" onClick={() => closeActive(id)} />
      <button
        type="button"
        class="unfold"
        ref={unfold}
        aria-label={`Развернуть карточку: ${p.name}`}
        title="Развернуть карточку"
        onClick={() => {
          unfoldCard();
          focusCardTitle(id);
        }}
      >
        {own ? <span class="tab-mark" aria-hidden="true" /> : null}
        <span class="nm">{p.name}</span>
        <span class="cmdl" aria-hidden="true">
          развернуть
        </span>
      </button>
      <SpineTabs tabs={others} label="Закреплённые карточки" />
      <TabNews />
    </aside>
  );
}
