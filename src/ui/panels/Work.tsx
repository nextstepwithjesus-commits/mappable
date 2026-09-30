/**
 * Набор (J3; решения владельца 17, 81): панель «Набор», команда «Добавить в набор» с выбором объёма и меню звезды
 * на небе (правая кнопка мыши, долгое касание). Набор — один из показов неба (src/ui/show.ts): «Набор на небо» в панели
 * (пустой набор — команда неактивна, решение 111) и строка показа у кромки неба (src/ui/sky/ShowBar.tsx). На небе
 * лиц и созвездия «скрывают» и «показывают» (решение 109), а не «сворачивают».
 * Состояние набора, неба и свёртки — src/ui/work.ts.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import { byId, groupById, loadCard, loadedCard } from '../../data/atlas.ts';
import type { Card } from '../../data/types.ts';
import { model, selected } from '../../state.ts';
import { goTo, plural } from '../common.tsx';
import { nameIn } from '../card/shared.tsx';
import { Sheet, useRemembered } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { lifeText } from '../sky/text.ts';
import { Brief } from '../card/Brief.tsx';
import { Close } from '../controls.tsx';
import { grid } from '../layout.ts';
import { sheetStop } from '../sheet.ts';
import { reduced } from '../sky/view.ts';
import { StartList } from '../sky/Controls.tsx';
import { closePerson, opened } from '../reveal.ts';
import { setShow, show } from '../show.ts';
import {
  addToWork, clearWork, foldDesc, foldDescOf, foldGroupOf, foldGroups, hasDescendants, lineOf, parseSetFile, removeFromWork, removeWithLine, saveSetFile,
  WORK_URL_MAX, workOrder, workSet, type Scope, type WorkEntry,
} from '../work.ts';

/** «1 поколение», «2 поколения», «все» — число поколений для предков и потомков. */
export const genText = (g: number | null) => (g === null ? 'все' : `${g} ${plural(g, 'поколение', 'поколения', 'поколений')}`);
const GENS: (number | null)[] = [1, 2, 3, null];

/** «Только Давида» — имя в родительном падеже, если его надёжно склоняет src/ui/text/ru.ts; иначе «Только это лицо». */
export function onlyLabel(id: string): string {
  const g = nameIn(id, 'gen');
  return g ? `Только ${g}` : 'Только это лицо';
}

// ---------- меню из рядов: стрелки и перемещаемый tabindex (IX-83) ----------

/** Первый пункт меню: на него ставится фокус, когда меню открыто мышью или клавишей (src/ui/sky/input.ts). */
export const MENU_FIRST = '[role^="menuitem"]:not(:disabled)';
/** Пункты меню, по которым ходит фокус: включённые, в разметке и видимые. */
const menuItems = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter((el) => !el.matches(':disabled, [aria-disabled="true"]') && el.getClientRects().length > 0);
/** Ряд пункта: строка команд с data-mrow (сегменты поколений, «Только …» и «С семьёй») — один ряд, прочие пункты — каждый свой. */
const rowOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-mrow]') ?? el;

/**
 * Куда ведёт клавиша в меню из рядов (IX-83), как в контекстных меню ОС: ↑ и ↓ — к соседнему ряду (к пункту того же
 * места в ряду или к последнему, если ряд короче), ← и → — по пунктам ряда по кругу, Home и End — к первому и последнему
 * пункту меню. rows — пункты по рядам сверху вниз; at — [ряд, место]. null — клавиша не про меню.
 */
export function menuMove(rows: readonly (readonly unknown[])[], at: readonly [number, number], key: string): [number, number] | null {
  const [r, c] = at;
  if (!rows.length) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const n = (r + (key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      return [n, Math.min(c, rows[n].length - 1)];
    }
    case 'ArrowRight':
    case 'ArrowLeft': {
      const len = rows[r].length;
      return [r, (c + (key === 'ArrowRight' ? 1 : -1) + len) % len];
    }
    case 'Home':
      return [0, 0];
    case 'End':
      return [rows.length - 1, rows[rows.length - 1].length - 1];
    default:
      return null;
  }
}

/**
 * Меню из рядов (IX-83): фокус держит один пункт (tabindex 0, остальные −1), стрелки и Home, End водят его (menuMove).
 * Tab уводит из меню, и выбор закрывается (usePopover).
 */
function useMenuKeys(menu: { current: HTMLElement | null }) {
  // после каждой отрисовки: tabindex 0 — у пункта с фокусом, иначе у первого пункта
  useLayoutEffect(() => {
    const m = menu.current;
    if (!m) return;
    const items = menuItems(m);
    const cur = items.find((el) => el === document.activeElement) ?? items.find((el) => el.tabIndex === 0) ?? items[0];
    for (const el of items) el.tabIndex = el === cur ? 0 : -1;
  });
  return (e: KeyboardEvent) => {
    const m = menu.current;
    if (!m || e.ctrlKey || e.metaKey || e.altKey) return;
    const items = menuItems(m);
    const now = document.activeElement as HTMLElement | null;
    const i = now ? items.indexOf(now) : -1;
    if (i < 0) return;
    // Enter у флажка — переключить его, меню не закрывается (у кнопок Enter свой)
    if (e.key === 'Enter' && now instanceof HTMLInputElement) {
      e.preventDefault();
      now.click();
      return;
    }
    const rows: HTMLElement[][] = [];
    let last: HTMLElement | null = null;
    for (const el of items) {
      const r = rowOf(el);
      if (r !== last) rows.push([]);
      rows[rows.length - 1].push(el);
      last = r;
    }
    const r = rows.findIndex((row) => row.includes(now!));
    const to = menuMove(rows, [r, rows[r].indexOf(now!)], e.key);
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    const next = rows[to[0]][to[1]];
    for (const el of items) el.tabIndex = el === next ? 0 : -1;
    next.focus({ preventScroll: true });
  };
}

/**
 * Выбор объёма (J3; VIS-47): только лицо, с семьёй, с предками и с потомками на 1, 2, 3 поколения или все; со связями
 * по толкованию — флажком. Команды — в поле 32 px с рамкой, поколения — сегменты 28 px, подписи строк — колонкой.
 * Каждая команда сразу добавляет лиц в набор; если лицо уже в наборе — «Убрать из набора» и «Убрать с родословной».
 * Ниже черты — команды вида неба (UX-71): «Скрыть потомков на небе» (решение 26) и, в меню звезды, «Свернуть созвездие».
 * Меню (role menu, IX-83): ряды — строки, сегменты поколений — пункты ряда. heading — подзаголовки групп «Добавить в набор:»
 * и «На небе:» (меню звезды: у него нет кнопки «Добавить в набор», которая говорила бы, что делают первые пункты; UX-71).
 */
export function WorkPicker({ id, onDone, heading = false, sky }: { id: string; onDone: () => void; heading?: boolean; sky?: ComponentChildren }) {
  const [interp, setInterp] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const onKey = useMenuKeys(menu);
  // фокус — на первый пункт; прокрутку карточки к выбору решает fitPick (VIS-82, MOB-74), не браузер
  useLayoutEffect(() => first.current?.focus({ preventScroll: true }), []);
  const on = workSet.value.has(id);
  const line = lineOf(id).length;
  const kids = hasDescendants(id);
  const folded = foldDesc.value.includes(id);
  const p = byId.get(id);
  const take = (s: Scope) => {
    addToWork(id, s);
    onDone();
  };
  const noteId = `wp-note-${id}`;
  // на кнопках — только число поколений: подпись строки говорит, чего; диктору — полностью («С предками: 2 поколения»)
  const row = (kind: 'anc' | 'desc', label: string, tail: boolean, disabled = false) => (
    <div class="wp-row wp-gens" role="group" aria-label={label} data-mrow="">
      <span class="k" aria-hidden="true">
        {label}
      </span>
      <span class="wp-seg" role="none">
        {GENS.map((g) => (
          <button key={String(g)} type="button" role="menuitem" disabled={disabled} aria-label={`${label}: ${genText(g)}`} onClick={() => take({ kind, gen: g, interp })}>
            {g === null ? 'все' : g}
          </button>
        ))}
      </span>
      {tail ? (
        <span class="wp-tail" aria-hidden="true">
          поколений
        </span>
      ) : null}
    </div>
  );
  const viewCmds = kids || folded || !!sky;
  return (
    <div class="wp-menu" role="menu" ref={menu} aria-label={p ? `${p.name}: добавить в набор${viewCmds ? ', на небе' : ''}` : 'Добавить в набор'} onKeyDown={onKey}>
      <div role="group" aria-label="Добавить в набор">
        {heading && (
          <p class="wp-sub" aria-hidden="true">
            Добавить в набор:
          </p>
        )}
        <div class="wp-row wp-take" role="none" data-mrow="">
          <button type="button" class="cmd" role="menuitem" ref={first} onClick={() => take({ kind: 'self' })}>
            {onlyLabel(id)}
          </button>
          <button type="button" class="cmd" role="menuitem" aria-describedby={noteId} onClick={() => take({ kind: 'family', interp })}>
            С семьёй
          </button>
        </div>
        <p class="wp-note" id={noteId} aria-hidden="true">
          {typo('Семья — родители, супруги, дети, братья и сёстры.')}
        </p>
        {row('anc', 'С предками', true)}
        {row('desc', 'С потомками', false, !kids)}
        {/* флажок — пункт меню (menuitemcheckbox): переключается пробелом и Enter, меню не закрывает */}
        <label class="check">
          <input type="checkbox" role="menuitemcheckbox" aria-checked={interp} checked={interp} onChange={(e) => setInterp((e.currentTarget as HTMLInputElement).checked)} />
          со связями по толкованию
        </label>
        {on && (
          <div class="wp-row wp-drop" role="none" data-mrow="">
            <button
              type="button"
              class="cmd"
              role="menuitem"
              onClick={() => {
                removeFromWork(id);
                onDone();
              }}
            >
              Убрать из набора
            </button>
            {line > 0 && (
              <button
                type="button"
                class="cmd"
                role="menuitem"
                title={`Убрать лицо и ещё ${line} ${plural(line, 'лицо', 'лица', 'лиц')}, взятых вместе с ним`}
                onClick={() => {
                  removeWithLine(id);
                  onDone();
                }}
              >
                Убрать с родословной
              </button>
            )}
          </div>
        )}
      </div>
      {viewCmds && (
        <div class="wp-row wp-out" role="group" aria-label="На небе">
          {heading && (
            <p class="wp-sub" aria-hidden="true">
              На небе:
            </p>
          )}
          {(kids || folded) && (
            <button
              type="button"
              class="cmd"
              role="menuitem"
              title="Потомки на небе заменяются знаком «+N» (клавиша С на небе)"
              onClick={() => {
                foldDescOf(id);
                onDone();
              }}
            >
              {folded ? 'Показать потомков на небе' : 'Скрыть потомков на небе'}
            </button>
          )}
          {sky}
        </div>
      )}
    </div>
  );
}

/**
 * Нажатия, которые только закрыли всплывающий выбор или меню неба (IX-72): щелчок мимо значит «передумал» — небо под ним
 * не выбирает звезду и не снимает выбор (src/ui/sky/input.ts). Так закрываются меню в macOS, Windows и Figma.
 */
const dismissals = new WeakSet<Event>();
export const dismissedBy = (e: Event) => dismissals.has(e);

/** Закрытие всплывающего выбора: Escape, щелчок мимо, уход фокуса наружу. */
function usePopover(open: boolean, close: (refocus: boolean) => void, wrap: { current: HTMLElement | null }) {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      dismissals.add(e);
      close(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  return {
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape выбора не доходит до общего Escape атласа: он снимает одно состояние — сам выбор
      e.preventDefault();
      e.stopPropagation();
      close(true);
    },
    onFocusOut: (e: FocusEvent) => {
      if (open && !wrap.current?.contains(e.relatedTarget as Node)) close(false);
    },
  };
}

/**
 * «Добавить в набор ▾» — команда шапки карточки (J3; решение 26; этап 11 — одно слово «набор», Я30): раскрывает выбор
 * объёма. Лицо уже в наборе — «В наборе ▾» (нажата): тот же выбор добавляет родню, скрывает потомков на небе и убирает лицо.
 */
export function WorkButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pick = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [id]);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pop = usePopover(open, close, wrap);
  const on = workSet.value.has(id);
  // выбор раскрылся — целиком в видимую часть карточки, над полосой времени (VIS-82, MOB-74)
  useLayoutEffect(() => {
    if (open && pick.current && btn.current) fitPick(pick.current, btn.current);
  }, [open]);
  return (
    <div class="workbtn" ref={wrap} {...pop}>
      <button
        type="button"
        ref={btn}
        class="cmd"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={on}
        aria-controls={open ? `wp-${id}` : undefined}
        aria-label={on ? undefined : 'Добавить в набор'}
        title={on ? 'Лицо в наборе: добавить родню, скрыть потомков на небе или убрать' : 'Добавить лицо в набор, с роднёй или без; скрыть потомков на небе (клавиши В и С на небе)'}
        onClick={() => setOpen(!open)}
      >
        {/* на узком листе (400 px, 1024 × 768) — «В набор»: четыре команды карточки одной строкой (VIS-79, IX-81) */}
        {on ? (
          'В наборе'
        ) : (
          <>
            <span class="full">Добавить в набор</span>
            <span class="short">В набор</span>
          </>
        )}
        <span class="tri" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div class="workpick" id={`wp-${id}`} ref={pick}>
          <WorkPicker id={id} onDone={() => close(true)} />
        </div>
      )}
    </div>
  );
}

/**
 * На сколько px прокрутить карточку, чтобы раскрытый выбор был виден целиком (VIS-82, MOB-74). Все значения — px окна:
 * верх кнопки, верх и низ выбора, верх и низ видимой части листа.
 */
export function pickScroll(o: { btnTop: number; pickTop: number; pickBottom: number; top: number; bottom: number }): number {
  // кнопка и выбор помещаются вместе: сдвиг dy — наименьший, при котором видны низ выбора и кнопка; иначе — верх выбора
  // к верху видимой части (остальное прокручивается)
  const fits = o.pickBottom - o.btnTop <= o.bottom - o.top;
  const lo = o.pickBottom - o.bottom;
  const hi = (fits ? o.btnTop : o.pickTop) - o.top;
  if (lo <= 0 && hi >= 0) return 0;
  if (!fits) return o.pickTop - o.top;
  return lo > 0 ? lo : hi;
}

/**
 * Выбор «Добавить в набор» целиком в видимой части карточки (VIS-82, MOB-74): если его низ уходит за край листа (на
 * телефоне — под полосу времени), карточка прокручивается так, чтобы были видны и кнопка, и весь выбор. На телефоне лист,
 * в котором выбору с кнопкой не хватает высоты, сначала поднимается во весь экран.
 */
function fitPick(pick: HTMLElement, btn: HTMLElement, again = true) {
  const sc = pick.closest<HTMLElement>('.folio');
  if (!sc) return;
  const box = sc.getBoundingClientRect();
  // закреплённая шапка листа на телефоне закрывает верх карточки
  const bar = sc.querySelector<HTMLElement>('.sheet-bar');
  const barH = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().height : 0;
  const strip = document.querySelector('.app > .strip')?.getBoundingClientRect();
  const top = box.top + barH + 8;
  const bottom = Math.min(box.bottom, window.innerHeight, strip && strip.top > box.top + 40 ? strip.top : Infinity) - 8;
  const r = pick.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  if (again && grid.peek().phone && sheetStop.peek() !== 'full' && r.bottom > bottom && r.bottom - b.top > bottom - top) {
    sheetStop.value = 'full';
    // лист поднимается 260 мс (phone.css); после — ещё раз, уже без подъёма
    window.setTimeout(() => pick.isConnected && fitPick(pick, btn, false), reduced() ? 0 : 320);
    return;
  }
  const dy = pickScroll({ btnTop: b.top, pickTop: r.top, pickBottom: r.bottom, top, bottom });
  if (dy) sc.scrollBy({ top: dy, behavior: reduced() ? 'auto' : 'smooth' });
}

/** Скрыть или показать потомков лица на небе (J5; решение 26): команда строки панели «Набор». */
export function FoldButton({ id }: { id: string }) {
  const on = foldDesc.value.includes(id);
  if (!hasDescendants(id) && !on) return null;
  return (
    <button type="button" class="cmd" aria-pressed={on} title="Потомки на небе заменяются знаком «+N» (клавиша С на небе)" onClick={() => foldDescOf(id)}>
      {on ? 'Показать потомков на небе' : 'Скрыть потомков на небе'}
    </button>
  );
}

// ---------- панель «Набор» ----------

/** Тело лица набора, развёрнутое по щелчку: роль и созвездие, «Кратко» и команды. */
function WorkItem({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(() => loadedCard(id));
  useEffect(() => {
    let alive = true;
    if (!card)
      loadCard(id)
        .then((d) => alive && setCard(d?.card ?? {}))
        .catch(() => {
          /* том не пришёл: без «Кратко» */
        });
    return () => {
      alive = false;
    };
  }, [id]);
  const line = lineOf(id).length;
  // «Кратко» называет роль, род и главное о лице (F12): шапке набора его хватает
  return (
    <div class="wi-body">
      <Brief id={id} card={card} ns={`work.${id}.`} />
      <div class="cmds">
        <button type="button" class="cmd" onClick={() => goTo(id)}>
          Открыть карточку
        </button>
        <button type="button" class="cmd" onClick={() => removeFromWork(id)}>
          Убрать из набора
        </button>
        {line > 0 && (
          <button type="button" class="cmd" title={`Убрать лицо и ещё ${line} ${plural(line, 'лицо', 'лица', 'лиц')}, взятых вместе с ним`} onClick={() => removeWithLine(id)}>
            Убрать с родословной
          </button>
        )}
        <FoldButton id={id} />
      </div>
    </div>
  );
}

/**
 * Почему лицо в наборе (CARD-75): «семья Руфи», «предок Давида, 2-е поколение», «потомок Давида, 1-е поколение»,
 * «путь родства от Руфи». Имя — в родительном падеже, только если его надёжно склоняет src/ui/text/ru.ts; иначе строка
 * начинается с отношения, а имя стоит после двоеточия: «семья: Жена Лота». Взятое само — null.
 */
export function viaText(e: WorkEntry): string | null {
  if (e.via === 'self') return null;
  const of = byId.get(e.of);
  if (!of) return null;
  const g = nameIn(e.of, 'gen');
  const gen = e.gen ? `, ${e.gen}-е поколение` : '';
  const head = { family: 'семья', anc: 'предок', desc: 'потомок', path: 'путь родства от' }[e.via];
  if (g) return `${head} ${g}${e.via === 'anc' || e.via === 'desc' ? gen : ''}`;
  const rel = e.via === 'path' ? 'путь родства' : head;
  return `${rel}${e.via === 'anc' || e.via === 'desc' ? gen : ''}: ${of.name}`;
}

// ---------- группы панели «Набор» (VIS-83) ----------

/**
 * Строка панели «Набор»: одиночное лицо (of — null) или группа — лицо of и взятые вместе с ним (его семья, предки,
 * потомки, путь родства от него). Происхождение пишется один раз — заголовком группы, а не под каждой строкой.
 */
export type WorkGroup = { of: string | null; ids: string[] };

/** Откуда лицо в наборе: у взятого само — оно само, у остальных — лицо, с которым его взяли. */
const originOf = (id: string, e: WorkEntry | undefined) => (e && e.via !== 'self' ? e.of : id);

/**
 * Группы набора (VIS-83). ids — лица в порядке рождения; группа стоит на месте своего лица (если его убрали из набора — на
 * месте первого взятого с ним), внутри — само лицо первым, дальше по рождению. Лицо без взятых с ним — одиночная строка.
 */
export function workGroups(ids: readonly string[], set: ReadonlyMap<string, WorkEntry>): WorkGroup[] {
  const by = new Map<string, string[]>();
  for (const id of ids) {
    const o = originOf(id, set.get(id));
    const g = by.get(o);
    if (g) g.push(id);
    else by.set(o, [id]);
  }
  const pos = new Map(ids.map((id, i) => [id, i]));
  const at = (o: string, g: string[]) => pos.get(o) ?? pos.get(g[0])!;
  return [...by]
    .sort((a, b) => at(a[0], a[1]) - at(b[0], b[1]))
    .map(([o, g]) => {
      const rest = g.filter((id) => id !== o);
      if (!rest.length) return { of: null, ids: g };
      return { of: o, ids: g.includes(o) ? [o, ...rest] : rest };
    });
}

type Via = Exclude<WorkEntry['via'], 'self'>;
/** Порядок видов происхождения в заголовке группы. */
const VIA_ORDER: Via[] = ['family', 'anc', 'desc', 'path'];
/** Виды происхождения в группе, по порядку VIA_ORDER. */
export const kindsOf = (entries: readonly WorkEntry[]): Via[] => VIA_ORDER.filter((v) => entries.some((e) => e.via === v));

/** Перечисление через запятую и «и»: «семья», «семья и предки», «семья, предки и потомки». */
const listing = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}`);

/**
 * Заголовок группы (VIS-83): «Давид и его семья (38)», «Руфь, её семья и предки (9)», «Руфь и путь родства от неё (4)».
 * Имя — в начале, в именительном падеже; местоимение согласовано с полом. Если самого лица в наборе уже нет — «Семья
 * Давида (37)» (родительный падеж — только надёжный, как в viaText; иначе «Семья: Жена Лота (5)»).
 */
export function groupTitle(of: string, entries: readonly WorkEntry[], hasOrigin: boolean, n: number): string {
  const p = byId.get(of);
  const kinds = kindsOf(entries);
  const count = ` (${n})`;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  if (!p) return `${cap(listing(kinds.map((k) => ({ family: 'семья', anc: 'предки', desc: 'потомки', path: 'путь родства' })[k])))}${count}`;
  if (hasOrigin) {
    const his = p.sex === 'f' ? 'её' : 'его';
    const him = p.sex === 'f' ? 'неё' : 'него';
    const words = kinds.map((k) => ({ family: 'семья', anc: 'предки', desc: 'потомки', path: `путь родства от ${him}` })[k]);
    // местоимение — перед первым словом, кроме пути: «Руфь и путь родства от неё»
    if (kinds[0] !== 'path') words[0] = `${his} ${words[0]}`;
    return words.length === 1 ? `${p.name} и ${words[0]}${count}` : `${p.name}, ${listing(words)}${count}`;
  }
  const rel = listing(kinds.map((k) => ({ family: 'семья', anc: 'предки', desc: 'потомки', path: 'путь родства от' })[k]));
  const g = nameIn(of, 'gen');
  return g ? `${cap(rel)} ${g}${count}` : `${cap(rel.replace(/ от$/, ''))}: ${p.name}${count}`;
}

/**
 * Строка под именем в группе (VIS-83): только то, что отличает лицо от соседей. В группе одного вида — поколение предка
 * или потомка («2-е поколение») или ничего; в смешанной группе — и вид: «предок, 2-е поколение», «семья».
 */
export function memberNote(e: WorkEntry | undefined, kinds: number): string | null {
  if (!e || e.via === 'self') return null;
  const gen = (e.via === 'anc' || e.via === 'desc') && e.gen ? `${e.gen}-е поколение` : null;
  if (kinds < 2) return gen;
  const word = { family: 'семья', anc: 'предок', desc: 'потомок', path: 'путь родства' }[e.via];
  return gen ? `${word}, ${gen}` : word;
}

/**
 * Набор, очищенный последним: «Вернуть очищенный набор» восстанавливает его (без подтверждений и всплывающих окон).
 * Решение 126 (UI-24): отмена живёт до следующего изменения набора, а не до закрытия панели — after хранит пустой набор,
 * получившийся очисткой; любое другое значение набора (добавили лицо, начали заново, открыли набор из файла) её снимает.
 */
export const cleared = signal<{ entries: [string, WorkEntry][]; after: ReadonlyMap<string, WorkEntry> } | null>(null);
effect(() => {
  const now = workSet.value;
  const c = cleared.peek();
  if (c && now !== c.after) cleared.value = null;
});
/** Очистить набор с возможностью вернуть его до следующего изменения набора. */
export function clearWorkUndoable() {
  const entries = [...workSet.peek()];
  if (!entries.length) return;
  clearWork();
  cleared.value = { entries, after: workSet.peek() };
}
/**
 * Открыть набор из файла (решение 130): набор заменяется лицами файла; прежний можно вернуть до следующего изменения
 * набора. Что вышло — словами для строки состояния панели.
 */
export function openSetText(text: string): string {
  const r = parseSetFile(text);
  if ('error' in r) return r.error;
  const prev = [...workSet.peek()];
  workSet.value = r.set;
  if (prev.length) cleared.value = { entries: prev, after: workSet.peek() };
  const n = r.set.size;
  return `Открыт набор из файла: ${n} ${plural(n, 'лицо', 'лица', 'лиц')}${r.skipped ? `; не прочитано строк: ${r.skipped} (лиц нет в этом атласе)` : ''}.`;
}

/** Оговорка о ссылке (решение 130; TOL 007): набор больше 12 лиц ссылка не передаёт — видимым текстом, до отправки. */
export function setLinkWarning(n: number): string | null {
  return n > WORK_URL_MAX
    ? `В наборе ${n} ${plural(n, 'лицо', 'лица', 'лиц')} — больше ${WORK_URL_MAX}, поэтому ссылка на вид передаёт только показ «набор», без его лиц. Чтобы передать сам набор, сохраните его в файл.`
    : null;
}

/** Вернуть очищенный набор. */
export function undoClear() {
  const c = cleared.peek();
  if (!c) return;
  cleared.value = null;
  workSet.value = new Map(c.entries);
}

/** Вводка панели (UX-77): то же, что пояснение команды «Набор» в верхней строке. */
export const WORK_LEAD = 'Лица, собранные вручную; набор помнится в этом браузере. Показ «набор» — только они на небе.';

export function WorkPanel() {
  const set = workSet.value;
  const m = model.value;
  const ids = workOrder((id) => {
    const c = m.chrono.get(id);
    return c && c.cls !== 'epochal' ? c.b : null;
  });
  const [open, setOpen] = useRemembered<string | null>('work:open', null);
  const n = ids.length;
  const folded = foldDesc.value.length + foldGroups.value.length;
  const file = useRef<HTMLInputElement>(null);
  // что сделало открытие файла: «Открыт набор из файла: 18 лиц» или почему нет
  const [fileSaid, setFileSaid] = useState('');
  const warn = setLinkWarning(n);
  const undo = cleared.value;
  return (
    <Sheet title={n ? `Набор: ${n} ${plural(n, 'лицо', 'лица', 'лиц')}` : 'Набор'} lead={WORK_LEAD}>
      {/* набор — один из показов неба (решение 81): что на небе, говорит строка показа у его кромки */}
      <div class="work-sky">
        {show.value.kind === 'set' ? (
          <span class="k">{typo('На небе — набор')}</span>
        ) : (
          <button
            type="button"
            class="cmd"
            aria-disabled={n ? undefined : 'true'}
            aria-describedby={n ? undefined : 'work-empty'}
            title={n ? 'Небо покажет только лиц набора; прежний показ вернёт «назад»' : 'Набор пуст: соберите его командой «Добавить в набор» в карточке'}
            onClick={() => n && setShow({ kind: 'set' })}
          >
            Набор на небо
          </button>
        )}
      </div>
      {warn && <p class="work-link">{typo(warn)}</p>}
      {/* набор в файле (решение 130): передать большой набор, перенести в другой браузер */}
      <div class="cmds work-file">
        {n > 0 && (
          <button type="button" class="cmd" onClick={() => saveSetFile()}>
            Сохранить набор в файл
          </button>
        )}
        <button type="button" class="cmd" onClick={() => file.current?.click()}>
          Открыть набор из файла
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          class="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={async (e) => {
            const input = e.currentTarget as HTMLInputElement;
            const f = input.files?.[0];
            input.value = '';
            if (f) setFileSaid(openSetText(await f.text()));
          }}
        />
      </div>
      <p class="work-said" role="status">
        {fileSaid ? typo(fileSaid) : ''}
      </p>
      {n === 0 ? (
        <>
          <p class="muted work-empty" id="work-empty">
            {typo(
              'Набор пуст. Чтобы собрать его, нажмите «Добавить в набор» в карточке лица — с предками, потомками или семьёй. То же — в строке поиска (Shift+Enter), в «Родстве» (весь путь) и на небе: клавиша В у звезды под указателем, правая кнопка мыши или долгое касание звезды.',
            )}
          </p>
        </>
      ) : (
        <>
          <ul class="worklist">
            {/* группы по происхождению (VIS-83): «Давид и его семья (38)» — один раз, члены — с отступом под ним */}
            {workGroups(ids, set).map((g) => {
              if (!g.of) return <WorkRow key={g.ids[0]} id={g.ids[0]} note={null} open={open} setOpen={setOpen} />;
              const entries = g.ids.map((id) => set.get(id)).filter((e): e is WorkEntry => !!e && e.via !== 'self');
              const kinds = kindsOf(entries).length;
              const hid = `wg-${g.of}`;
              return (
                <li key={`g:${g.of}`} class="wg">
                  <p class="wg-head" id={hid}>
                    {typo(groupTitle(g.of, entries, set.get(g.of)?.via === 'self', g.ids.length))}
                  </p>
                  <ul class="wg-list" aria-labelledby={hid}>
                    {g.ids.map((id) => (
                      <WorkRow key={id} id={id} note={memberNote(set.get(id), kinds)} open={open} setOpen={setOpen} />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div class="cmds">
            <button
              type="button"
              class="cmd"
              onClick={() => {
                clearWorkUndoable();
                setOpen(null);
              }}
            >
              Очистить набор
            </button>
          </div>
        </>
      )}
      {/* отмена очистки или открытия файла — до следующего изменения набора (решение 126) */}
      {undo && (
        <div class="cmds">
          <button type="button" class="cmd" onClick={undoClear}>
            {`${undo.after.size ? 'Вернуть прежний набор' : 'Вернуть очищенный набор'} (${undo.entries.length})`}
          </button>
        </div>
      )}

      {folded > 0 && <FoldList />}
      {/* «Начать заново» (решение 68): те же пять начал, что во вступлении и в листе «Вид»; набор больше одного лица
          заменяется только после подтверждения */}
      <h3 id="work-start">Начать заново</h3>
      <StartList notes label="Начать заново" />
    </Sheet>
  );
}

/** Строка лица в панели «Набор»: имя, уточнение и годы; под ними — чем лицо отличается от соседей по группе; щелчок — тело. */
function WorkRow({ id, note, open, setOpen }: { id: string; note: string | null; open: string | null; setOpen: (v: string | null) => void }) {
  const p = byId.get(id)!;
  const on = open === id;
  return (
    <li class={on ? 'open' : undefined} data-id={id}>
      <div class="wi-head">
        <button type="button" class="wi-row" aria-expanded={on} aria-current={selected.value === id ? 'true' : undefined} onClick={() => setOpen(on ? null : id)}>
          <span class="nm">{p.name}</span>
          {p.disambig ? <span class="ds">{typo(`, ${p.disambig}`)}</span> : null}
          <span class="yrs">{typo(lifeText(id))}</span>
        </button>
        {note ? <span class="wi-via">{typo(note)}</span> : null}
      </div>
      {on && <WorkItem id={id} />}
    </li>
  );
}

/** Что скрыто на небе (J5): потомки лиц и созвездия — с командой «показать» у каждого (решение 109). */
function FoldList() {
  return (
    <>
      <h3>Скрыто на небе</h3>
      <ul class="worklist folds">
        {foldDesc.value.map((id) => (
          <li key={`d${id}`}>
            <span class="nm">{typo(`${byId.get(id)?.name ?? id}: потомки`)}</span>
            <button type="button" class="cmd" onClick={() => foldDescOf(id, false)}>
              показать
            </button>
          </li>
        ))}
        {foldGroups.value.map((g) => (
          <li key={`g${g}`}>
            <span class="nm">{typo(`${groupById.get(g)?.name ?? g}: созвездие`)}</span>
            <button type="button" class="cmd" onClick={() => foldGroupOf(g, false)}>
              показать
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- на небе: строка набора и меню звезды ----------

/**
 * Чем читатель открыл меню неба: касание фокус не переносит (фокус клавиатуры пальцу не нужен, а небо после касания
 * возвращает его себе и закрыло бы меню); клавиша меню и мышь — переносят на первую команду.
 */
let lastInput: 'key' | 'mouse' | 'touch' | 'pen' = 'mouse';
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastInput = 'key'), true);
  window.addEventListener('pointerdown', (e) => (lastInput = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'), true);
}

/** Меню неба: у звезды (id), у названия созвездия (group) или у знака свёрнутого — в точке (x, y) px неба. */
export type SkyMenuAt = { x: number; y: number; id?: string; group?: string };
export const skyMenu = signal<SkyMenuAt | null>(null);

/**
 * Меню звезды на небе (J3, J5): правая кнопка мыши, долгое касание или клавиша меню на звезде. У звезды — выбор объёма
 * «Добавить в набор» с пунктом «Скрыть потомков на небе»; у названия созвездия — «Свернуть созвездие». У лица, чьи точки
 * союзов показаны на небе «набор» (решения 70, 76), — «Скрыть союзы на небе». Escape и щелчок мимо закрывают.
 */
export function SkyMenu({ bounds }: { bounds: { w: number; h: number } }) {
  const at = skyMenu.value;
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const onKey = useMenuKeys(menu);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const close = (refocus: boolean) => {
    skyMenu.value = null;
    if (refocus) document.querySelector<HTMLElement>('.sky canvas')?.focus({ preventScroll: true });
  };
  const pop = usePopover(!!at, close, wrap);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!at || !el) return setPos(null);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.max(8, Math.min(bounds.w - w - 8, at.x + 8));
    const y = Math.max(8, Math.min(bounds.h - h - 8, at.y + 8));
    if (!pos || pos.x !== x || pos.y !== y) setPos({ x, y });
  });
  const group = at?.group ?? (at?.id ? byId.get(at.id)?.group : undefined);
  const g = group ? groupById.get(group) : undefined;
  // фокус — на первый пункт меню, когда оно встало на место (data-placed): до замера оно невидимо и фокус не держит;
  // так меню одинаково открывается правой кнопкой и клавишей меню (IX-49); после долгого касания фокус не переносится
  const placed = !!at && !!pos;
  useEffect(() => {
    const m = wrap.current;
    if (!placed || !m || m.contains(document.activeElement) || lastInput === 'touch') return;
    m.querySelector<HTMLElement>(MENU_FIRST)?.focus({ preventScroll: true });
  }, [placed, at]);
  if (!at) return null;
  const p = at.id ? byId.get(at.id) : undefined;
  const groupOn = !!group && foldGroups.value.includes(group);
  // «×» (MOB-77): как у «Какое лицо?» — 44 px на сенсорном экране; закрыть меню можно не только касанием мимо
  const x = <Close label="Закрыть меню" onClick={() => close(lastInput !== 'touch')} />;
  // созвездие линий Мессии не сворачивается: его лица — хребет неба
  const groupCmd =
    g && g.kind !== 'other' && g.id !== 'messiah' ? (
      <button
        type="button"
        class="cmd"
        role="menuitem"
        onClick={() => {
          foldGroupOf(g.id);
          close(true);
        }}
      >
        {typo(`${groupOn ? 'Показать' : 'Скрыть'} созвездие «${g.name}»`)}
      </button>
    ) : null;
  // точки союзов лица на небе «набор» (решения 70, 76): скрыть их, раскрытые союзы и раскрытые лица остаются
  const unionsCmd =
    p && opened.value.includes(p.id) ? (
      <button
        type="button"
        class="cmd"
        role="menuitem"
        title="Точки нераскрытых союзов лица уходят с неба; раскрытые союзы и лица остаются. Показать снова — «Продолжить ветвь» в карточке у звезды"
        onClick={() => {
          closePerson(p.id);
          close(true);
        }}
      >
        Скрыть союзы на небе
      </button>
    ) : null;
  const skyCmds =
    unionsCmd || groupCmd ? (
      <>
        {unionsCmd}
        {groupCmd}
      </>
    ) : null;
  return (
    <div class="workpick skymenu" ref={wrap} style={{ left: `${pos?.x ?? at.x}px`, top: `${pos?.y ?? at.y}px` }} data-placed={pos ? '' : undefined} {...pop}>
      {p ? (
        <>
          {/* имя, чьё это меню, и «×» — вне списка пунктов */}
          <div class="wp-head">
            <p>
              <b>{p.name}</b>
              {p.disambig ? typo(`, ${p.disambig}`) : null}
            </p>
            {x}
          </div>
          <WorkPicker id={p.id} heading sky={skyCmds} onDone={() => close(true)} />
        </>
      ) : (
        <div class="wp-head wp-first">
          <div class="wp-menu" role="menu" ref={menu} aria-label={g ? typo(`Созвездие «${g.name}»`) : 'Созвездие'} onKeyDown={onKey}>
            {groupCmd}
          </div>
          {x}
        </div>
      )}
    </div>
  );
}
