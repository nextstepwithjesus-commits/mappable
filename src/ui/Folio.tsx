import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import { cardFolded, cardStack, clipWords, closeAllCards, closeCard, stackSummaryHead } from './stack.ts';
import { WorkButton } from './panels/Work.tsx';
import { cardTitle, focusCardTitle, focusQuietly } from './focus.ts';
import { atlasView, selectedUnion, selectUnion, unionById } from './reveal.ts';
import { UnionCard, openerSection, unionTitle, unionYears } from './card/Union.tsx';
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
  // разделы собираются заново, только когда сменились лицо, том или модель: прокрутка меняет лишь текущий раздел рейки
  const { out, states } = useMemo(() => {
    const o = buildSections(bodyId, bp, card, m, m.chrono.get(bodyId), '', body?.chrono ?? null);
    return { out: o, states: sectionStates(bodyId, o, card) };
  }, [bodyId, card, body?.chrono, m]);
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
    const avail = () => document.querySelector('.sky, .treearea')?.getBoundingClientRect().height ?? window.innerHeight * 0.8;
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
        <button
          type="button"
          class="cmd bar-toggle"
          aria-expanded={full}
          aria-label={full ? 'Свернуть карточку' : 'Развернуть карточку'}
          onClick={() => (sheetStop.value = full ? 'peek' : 'full')}
        >
          {full ? 'Свернуть' : 'Развернуть'}
        </button>
        {/* «×» закрывает карточку, как вкладку: открывается следующая из стопки; панель остаётся (D11; решение 18) */}
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
          // в древе (решение 73) — сначала на небо: перелёт — когда небо встало на место
          if (atlasView.peek() === 'tree') {
            atlasView.value = 'sky';
            let tries = 0;
            const wait = () => {
              if (skyRef.current?.model) skyRef.flyTo(id);
              else if (tries++ < 120) requestAnimationFrame(wait);
            };
            requestAnimationFrame(wait);
          } else skyRef.flyTo(id);
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

/** Закрыть карточку id, как вкладку (решение 18): следующая из стопки — активной, фокус на её заголовок (IX-52). */
function closeActive(id: string) {
  // выбор второго лица относился к закрытой карточке: следующая открывается как первое лицо, а не как второе
  pickMode.value = null;
  const next = closeCard(id, goTo);
  if (next) focusCardTitle(next);
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
  // образец (#/specimen, VIS-55) показывает «Загрузку» и «Ошибку» живыми: лист в этом состоянии, без стопки и листа телефона
  const live = !forceState;
  const [data, setData] = useState<{ id: string; card: Card; chrono: Chrono | null } | null>(null);
  const [current, setCurrent] = useState(1);
  // том не загрузился (D11): лист говорит об этом и предлагает повторить, а не остаётся в «Загрузке» навсегда
  const [failed, setFailed] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stackOpen, setStackOpen] = useState(false);
  const inner = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  // на телефоне карточка — нижний лист с тремя положениями (ТЗ § 3.8; H2)
  const phone = grid.value.phone;
  const spine = grid.value.spine;
  const stackSize = cardStack.value.length;
  const stop = sheetStop.value;
  const sheet = live && phone && !!id && byId.has(id);
  // карточка союза (решение 71) — вместо карточки лица: лицо остаётся выбранным, стопка не меняется
  const uid = live && id ? selectedUnion.value : null;
  const union = uid ? (unionById(uid) ?? null) : null;
  useUnionReturn(aside, id ?? null, union?.id ?? null);
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
    setStackOpen(false);
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
      const right = col.getBoundingClientRect().right - parseFloat(getComputedStyle(col).paddingRight);
      el.style.setProperty('--bar-cmds', `${Math.max(0, Math.ceil(right - cmds.getBoundingClientRect().left + 8))}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(cmds);
    ro.observe(col);
    return () => ro.disconnect();
  }, [id, phone, live, stackSize, spine, union?.id]);

  if (!id) return <aside class="folio" hidden />;
  const p = byId.get(id);
  if (!p) return <aside class="folio" hidden />;
  // карточка свёрнута в корешок: её свернул читатель, «Небо во весь экран» или небу иначе осталось бы меньше 40 %
  // (C1; решения 7 и 18)
  if (live && spine) return <FolioSpine id={id} />;
  // тело карточки (D11; IX-45): том уже загружен — сразу; иначе до прихода нового держится прежнее тело (бледнее),
  // а «Загрузка карточки…» появляется, только если ждать дольше 300 мс
  const have = !live ? null : data && data.id === id ? data : loadedCard(id) ? { id, card: loadedCard(id)!, chrono: loadedChrono(id) } : null;
  const shownBody = have ?? (live && data && !slow && failed !== id ? data : null);
  const stale = !have && !!shownBody;
  // «Загрузка карточки…» — только если том не пришёл за 300 мс: быстрые переходы её не показывают (D11)
  const status: BodyStatus = forceState ?? (failed === id ? 'error' : !shownBody && slow ? 'loading' : 'ok');
  const others = live ? cardStack.value.filter((x) => x !== id && byId.has(x)) : [];
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
        {sheet && others.length > 0 && <StackStrip ids={others} />}
        {live && !phone && <FolioBar id={id} others={others} open={stackOpen} setOpen={setStackOpen} onClose={() => selectUnion(null)} closeLabel="Закрыть карточку союза" />}
        <div class="folio-inner" ref={inner} key={`union|${union.id}`}>
          <UnionCard u={union} from={id} />
        </div>
      </aside>
    );

  return (
    <aside class="folio" aria-label={`Карточка: ${p.name}`} ref={aside} data-stop={sheet ? stop : undefined} data-state={status === 'ok' ? undefined : status}>
      {sheet && <SheetBar id={id} stop={stop} onClose={close} />}
      {/* стопка на телефоне — строка открытых карточек над листом (J6) */}
      {sheet && others.length > 0 && <StackStrip ids={others} />}
      {live && !phone && <FolioBar id={id} others={others} open={stackOpen} setOpen={setStackOpen} onClose={close} />}
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
    </aside>
  );
}

/** Высота закреплённой полосы карточки, px (folio.css, .folio-bar). */
const BAR_H = 36;

/**
 * Закреплённая полоса листа (CARD-53, UX-67; решение 18): на всю ширину листа, текст прокручивается под ней.
 * Слева — строка стопки «Ещё открыты (N): …» (по щелчку — список), справа — «Свернуть карточку» и «×».
 * Без стопки полоса лежит на строке имени и прозрачна, пока лист не прокручен (data-scrolled): первый экран не теряет строки.
 */
function FolioBar({ id, others, open, setOpen, onClose, closeLabel = 'Закрыть карточку' }: { id: string; others: string[]; open: boolean; setOpen: (v: boolean) => void; onClose: () => void; closeLabel?: string }) {
  const sum = useRef<HTMLButtonElement>(null);
  const hide = (refocus: boolean) => {
    setOpen(false);
    if (refocus) sum.current?.focus();
  };
  return (
    <div
      class="folio-bar"
      data-stack={others.length ? '' : undefined}
      onKeyDown={(e) => {
        // Escape списка снимает только список, а не выбор лица (одно видимое состояние)
        if (e.key !== 'Escape' || !open) return;
        e.preventDefault();
        e.stopPropagation();
        hide(true);
      }}
    >
      {others.length > 0 && <StackSummary ids={others} open={open} btn={sum} onToggle={() => setOpen(!open)} />}
      <span class="bar-cmds">
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
      {open && others.length > 0 && <StackList ids={others} active={id} onPick={() => hide(false)} />}
    </div>
  );
}

/** Годы лица для строки стопки: как в шапке листа. */
function stackYears(id: string): string {
  const c = model.value.chrono.get(id);
  return typo(passportYears(id, c) || 'время не установлено');
}

/**
 * Имена строки стопки: первые k целиком, остальные — числом, без многоточия (VIS-71): «Руфь, Давид и ещё 2».
 */
export function stackNames(names: string[], k: number): string {
  const n = Math.max(1, Math.min(k, names.length));
  return n < names.length ? `${names.slice(0, n).join(', ')} и ещё ${names.length - n}` : names.join(', ');
}

/**
 * Строка стопки (решение 18; CARD-52, IX-52, UX-49): «Ещё открыты (N): Иосиф, Моисей» — свёрнута по умолчанию.
 * Имена — от недавних к старым, целиком: сколько помещается в поле до команд, остальные — «и ещё N» (UX-75, VIS-71).
 */
function StackSummary({ ids, open, btn, onToggle }: { ids: string[]; open: boolean; btn: { current: HTMLButtonElement | null }; onToggle: () => void }) {
  const names = ids.map((x) => byId.get(x)!.name);
  const namesRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(names.length);
  const key = names.join('|');
  useLayoutEffect(() => {
    const el = namesRef.current;
    if (!el) return;
    const btn = el.parentElement!;
    // место имён — вся строка стопки без «Ещё открыты (N):», треугольника и зазоров (UX-75): поле имён само по себе
    // узко, пока в нём короткая строка, и замер по нему не давал строке вырасти обратно
    const roomOf = () => {
      const bs = getComputedStyle(btn);
      const others = [...btn.children].filter((c) => c !== el) as HTMLElement[];
      const taken = others.reduce((w, c) => w + c.getBoundingClientRect().width + parseFloat(getComputedStyle(c).marginLeft || '0'), 0);
      const gap = parseFloat(bs.columnGap || '0') || 0;
      return btn.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight) - taken - gap * others.length;
    };
    const measure = () => {
      const room = roomOf();
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx || !room) return setFit(names.length);
      // свойство font у вычисленного стиля бывает пустым: шрифт холста собирается из частей
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      let k = names.length;
      while (k > 1 && ctx.measureText(stackNames(names, k)).width > room - 2) k--;
      setFit(k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [key]);
  const shown = stackNames(names, fit);
  return (
    <button
      type="button"
      class="stack-sum"
      ref={btn}
      aria-expanded={open}
      aria-controls={open ? 'stack-list' : undefined}
      aria-label={`${stackSummaryHead(ids.length)} ${names.join(', ')}`}
      title={open ? 'Скрыть список открытых карточек' : 'Показать список открытых карточек'}
      onClick={onToggle}
    >
      <span class="sh">{stackSummaryHead(ids.length)}</span>
      <span class="names" ref={namesRef}>
        {shown}
      </span>
      <span class="tri" aria-hidden="true">
        {open ? '▴' : '▾'}
      </span>
    </button>
  );
}

/** Уточнение в строке стопки — целыми словами, не длиннее 40 знаков (VIS-48). */
const STACK_DIS = 40;

/**
 * Список открытых карточек (решение 18): от недавних к старым; строка — имя и годы, под ними уточнение; щелчок делает
 * карточку активной; «×» закрывает её; в конце — «Закрыть все».
 */
function StackList({ ids, active, onPick }: { ids: string[]; active: string; onPick: () => void }) {
  return (
    <ul class="stack" id="stack-list" aria-label="Открытые карточки">
      {ids.map((x) => {
        const q = byId.get(x)!;
        const dis = q.disambig ? clipWords(q.disambig, STACK_DIS) : null;
        return (
          <li key={x} class="stack-row" data-id={x}>
            <button
              type="button"
              class="sr-open"
              aria-label={`Открыть карточку: ${q.name}${q.disambig ? `, ${q.disambig}` : ''}`}
              onClick={() => {
                onPick();
                goTo(x);
              }}
            >
              <span class="nm">{q.name}</span>
              <span class="yrs">{stackYears(x)}</span>
              {dis ? <span class="ds">{typo(dis)}</span> : null}
            </button>
            <Close label={`Закрыть карточку: ${q.name}`} onClick={() => closeCard(x)} />
          </li>
        );
      })}
      <li class="stack-all">
        <button
          type="button"
          class="cmd"
          title={`Закрыть и эту карточку (${byId.get(active)?.name ?? ''}), и все открытые`}
          onClick={closeAllCards}
        >
          Закрыть все
        </button>
      </li>
    </ul>
  );
}

/**
 * Корешок карточки (C1; VIS-44, UX-50; решения 7 и 18): 56 px — «×», имя и «развернуть», ниже — имена других открытых
 * карточек снизу вверх, как на корешке. Корешок бывает по выбору читателя («Свернуть карточку»), в «Небе во весь экран»
 * и когда рядом с широкой панелью небу не хватило бы места; «развернуть» снимает причину (layout.ts, unfoldCard).
 */
function FolioSpine({ id }: { id: string }) {
  const p = byId.get(id)!;
  const unfold = useRef<HTMLButtonElement>(null);
  const others = cardStack.value.filter((x) => x !== id && byId.has(x));
  useLayoutEffect(() => {
    if (!focusSpine) return;
    focusSpine = false;
    unfold.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside class="folio spine" aria-label={`Карточка: ${p.name} (свёрнута)`}>
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
        <span class="nm">{p.name}</span>
        <span class="cmdl" aria-hidden="true">
          развернуть
        </span>
      </button>
      {others.length > 0 && (
        <ul class="spine-stack" aria-label={stackSummaryHead(others.length).replace(/:$/, '')}>
          {others.map((x) => {
            const q = byId.get(x)!;
            return (
              <li key={x}>
                <button type="button" class="sp-open" aria-label={`Открыть карточку: ${q.name}`} title={`Открыть карточку: ${q.name}`} onClick={() => goTo(x)}>
                  {q.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/** Стопка на телефоне (J6): строка открытых карточек над листом; касание — карточка наверх, «×» — закрыть её. */
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
            <Close label={`Закрыть карточку: ${p.name}`} onClick={() => closeCard(id)} />
          </li>
        );
      })}
    </ul>
  );
}
