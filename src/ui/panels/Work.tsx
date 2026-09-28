/**
 * Рабочий набор (J3; решение владельца 17): панель «В работе», команда «Взять в работу» с выбором объёма и меню звезды
 * на небе (правая кнопка мыши, долгое касание). Строка режима «набор» у кромки неба — src/ui/sky/Overlays.tsx (WorkLine),
 * переключатель «все лица | набор» — src/ui/sky/Controls.tsx (SkyModeSwitch).
 * Состояние набора, неба и свёртки — src/ui/work.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { byId, groupById, loadCard, loadedCard } from '../../data/atlas.ts';
import type { Card } from '../../data/types.ts';
import { model, selected } from '../../state.ts';
import { goTo, plural } from '../common.tsx';
import { nameIn } from '../card/shared.tsx';
import { Sheet, useRemembered } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { lifeText } from '../sky/text.ts';
import { Brief } from '../card/Brief.tsx';
import { Check } from '../controls.tsx';
import { SkyModeSwitch } from '../sky/Controls.tsx';
import {
  addToWork, clearWork, foldDesc, foldDescOf, foldGroupOf, foldGroups, hasDescendants, lineOf, removeFromWork, removeWithLine, workOrder,
  workSet, type Scope, type WorkEntry,
} from '../work.ts';

/** «1 поколение», «2 поколения», «все» — число поколений для предков и потомков. */
export const genText = (g: number | null) => (g === null ? 'все' : `${g} ${plural(g, 'поколение', 'поколения', 'поколений')}`);
const GENS: (number | null)[] = [1, 2, 3, null];

/** «Только Давида» — имя в родительном падеже, если его надёжно склоняет src/ui/text/ru.ts; иначе «Только это лицо». */
export function onlyLabel(id: string): string {
  const g = nameIn(id, 'gen');
  return g ? `Только ${g}` : 'Только это лицо';
}

/**
 * Выбор объёма (J3; VIS-47): только лицо, с семьёй, с предками и с потомками на 1, 2, 3 поколения или все; со связями
 * по толкованию — флажком. Команды — в поле 32 px с рамкой, поколения — сегменты 28 px, подписи строк — колонкой.
 * Каждая команда сразу берёт лиц в работу. Ниже черты — «Скрыть потомков на небе» (решение 26) и, если лицо уже в работе,
 * «Убрать из работы» и «Убрать с родословной».
 */
export function WorkPicker({ id, onDone }: { id: string; onDone: () => void }) {
  const [interp, setInterp] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => first.current?.focus(), []);
  const on = workSet.value.has(id);
  const line = lineOf(id).length;
  const kids = hasDescendants(id);
  const folded = foldDesc.value.includes(id);
  const take = (s: Scope) => {
    addToWork(id, s);
    onDone();
  };
  // на кнопках — только число поколений: подпись строки говорит, чего; диктору — полностью («С предками: 2 поколения»)
  const row = (kind: 'anc' | 'desc', label: string, tail: boolean, disabled = false) => (
    <div class="wp-row wp-gens" role="group" aria-label={label}>
      <span class="k" aria-hidden="true">
        {label}
      </span>
      <span class="wp-seg">
        {GENS.map((g) => (
          <button key={String(g)} type="button" disabled={disabled} aria-label={`${label}: ${genText(g)}`} onClick={() => take({ kind, gen: g, interp })}>
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
  return (
    <>
      <div class="wp-row wp-take">
        <button type="button" class="cmd" ref={first} onClick={() => take({ kind: 'self' })}>
          {onlyLabel(id)}
        </button>
        <button type="button" class="cmd" onClick={() => take({ kind: 'family', interp })}>
          С семьёй
        </button>
      </div>
      <p class="wp-note">{typo('Семья — родители, супруги, дети, братья и сёстры.')}</p>
      {row('anc', 'С предками', true)}
      {row('desc', 'С потомками', false, !kids)}
      <Check checked={interp} onChange={setInterp}>
        со связями по толкованию
      </Check>
      {(kids || folded || on) && (
        <div class="wp-row wp-out">
          {(kids || folded) && (
            <button
              type="button"
              class="cmd"
              aria-pressed={folded}
              title="Потомки на небе заменяются знаком «+N» (клавиша С на небе)"
              onClick={() => {
                foldDescOf(id);
                onDone();
              }}
            >
              {folded ? 'Показать потомков на небе' : 'Скрыть потомков на небе'}
            </button>
          )}
          {on && (
            <button
              type="button"
              class="cmd"
              onClick={() => {
                removeFromWork(id);
                onDone();
              }}
            >
              Убрать из работы
            </button>
          )}
          {on && line > 0 && (
            <button
              type="button"
              class="cmd"
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
    </>
  );
}

/** Закрытие всплывающего выбора: Escape, щелчок мимо, уход фокуса наружу. */
function usePopover(open: boolean, close: (refocus: boolean) => void, wrap: { current: HTMLElement | null }) {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
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
 * «Взять в работу ▾» — команда шапки карточки (J3; решение 26): раскрывает выбор объёма. Лицо уже в наборе — «В наборе ▾»
 * (нажата): тот же выбор добавляет родню, скрывает потомков на небе и убирает лицо.
 */
export function WorkButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [id]);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pop = usePopover(open, close, wrap);
  const on = workSet.value.has(id);
  return (
    <div class="workbtn" ref={wrap} {...pop}>
      <button
        type="button"
        ref={btn}
        class="cmd"
        aria-expanded={open}
        aria-pressed={on}
        aria-controls={open ? `wp-${id}` : undefined}
        title={on ? 'Лицо в рабочем наборе: добавить родню, скрыть потомков на небе или убрать' : 'Взять лицо в рабочий набор, с родней или без; скрыть потомков на небе (клавиши В и С на небе)'}
        onClick={() => setOpen(!open)}
      >
        {on ? 'В наборе' : 'Взять в работу'}
        <span class="tri" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div class="workpick" id={`wp-${id}`} role="group" aria-label="Что взять в работу">
          <WorkPicker id={id} onDone={() => close(true)} />
        </div>
      )}
    </div>
  );
}

/** Скрыть или показать потомков лица на небе (J5; решение 26): команда строки панели «В работе». */
export function FoldButton({ id }: { id: string }) {
  const on = foldDesc.value.includes(id);
  if (!hasDescendants(id) && !on) return null;
  return (
    <button type="button" class="cmd" aria-pressed={on} title="Потомки на небе заменяются знаком «+N» (клавиша С на небе)" onClick={() => foldDescOf(id)}>
      {on ? 'Показать потомков на небе' : 'Скрыть потомков на небе'}
    </button>
  );
}

// ---------- панель «В работе» ----------

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
          Убрать из работы
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

/** Набор, очищенный последним: «Вернуть» восстанавливает его (без подтверждений и всплывающих окон). */
let cleared: [string, WorkEntry][] | null = null;

export function WorkPanel() {
  const set = workSet.value;
  const m = model.value;
  const ids = workOrder((id) => {
    const c = m.chrono.get(id);
    return c && c.cls !== 'epochal' ? c.b : null;
  });
  const [open, setOpen] = useRemembered<string | null>('work:open', null);
  const [undo, setUndo] = useState(false);
  const n = ids.length;
  const folded = foldDesc.value.length + foldGroups.value.length;
  return (
    <Sheet title={n ? `В работе: ${n} ${plural(n, 'лицо', 'лица', 'лиц')}` : 'В работе'} lead="Лица, с которыми вы работаете; набор помнится и после перезагрузки. Небо может показывать только их.">
      <div class="work-sky">
        <span class="k">На небе:</span>
        <SkyModeSwitch />
      </div>
      {n === 0 ? (
        <>
          <p class="muted work-empty">
            {typo(
              'Набор пуст. Чтобы собрать его, нажмите «Взять в работу» в карточке лица — с предками, потомками или семьёй. То же — в строке поиска (Shift+Enter), в «Родстве» (весь путь) и на небе: клавиша В у звезды под указателем, правая кнопка мыши или долгое касание звезды.',
            )}
          </p>
          {undo && cleared && (
            <div class="cmds">
              <button
                type="button"
                class="cmd"
                onClick={() => {
                  workSet.value = new Map(cleared!);
                  cleared = null;
                  setUndo(false);
                }}
              >
                Вернуть очищенный набор
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <ul class="worklist">
            {ids.map((id) => {
              const p = byId.get(id)!;
              const e = set.get(id);
              const on = open === id;
              const via = e ? viaText(e) : null;
              const from = e && e.via !== 'self' && set.has(e.of) ? e.of : null;
              return (
                <li key={id} class={on ? 'open' : undefined} data-id={id}>
                  <div class="wi-head">
                    <button type="button" class="wi-row" aria-expanded={on} aria-current={selected.value === id ? 'true' : undefined} onClick={() => setOpen(on ? null : id)}>
                      <span class="nm">{p.name}</span>
                      {p.disambig ? <span class="ds">{typo(`, ${p.disambig}`)}</span> : null}
                      <span class="yrs">{typo(lifeText(id))}</span>
                    </button>
                    {/* почему лицо в наборе (CARD-75): щелчок раскрывает строку лица, с которым его взяли, — там вся его родословная */}
                    {via ? (
                      from ? (
                        <button
                          type="button"
                          class="wi-via"
                          title={`Раскрыть в списке: ${byId.get(from)!.name}`}
                          onClick={() => {
                            setOpen(from);
                            requestAnimationFrame(() => document.querySelector<HTMLElement>(`.worklist li[data-id="${CSS.escape(from)}"] .wi-row`)?.focus());
                          }}
                        >
                          {typo(via)}
                        </button>
                      ) : (
                        <span class="wi-via">{typo(via)}</span>
                      )
                    ) : null}
                  </div>
                  {on && <WorkItem id={id} />}
                </li>
              );
            })}
          </ul>
          <div class="cmds">
            <button
              type="button"
              class="cmd"
              onClick={() => {
                cleared = [...workSet.peek()];
                clearWork();
                setUndo(true);
                setOpen(null);
              }}
            >
              Очистить набор
            </button>
          </div>
        </>
      )}
      {folded > 0 && <FoldList />}
    </Sheet>
  );
}

/** Что свёрнуто на небе (J5): потомки лиц и созвездия — с командой «развернуть» у каждого. */
function FoldList() {
  return (
    <>
      <h3>Свёрнуто на небе</h3>
      <ul class="worklist folds">
        {foldDesc.value.map((id) => (
          <li key={`d${id}`}>
            <span class="nm">{typo(`${byId.get(id)?.name ?? id}: потомки`)}</span>
            <button type="button" class="cmd" onClick={() => foldDescOf(id, false)}>
              развернуть
            </button>
          </li>
        ))}
        {foldGroups.value.map((g) => (
          <li key={`g${g}`}>
            <span class="nm">{typo(`${groupById.get(g)?.name ?? g}: созвездие`)}</span>
            <button type="button" class="cmd" onClick={() => foldGroupOf(g, false)}>
              развернуть
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
 * «Взять в работу» с пунктом «Скрыть потомков на небе»; у названия созвездия — «Свернуть созвездие». Escape и щелчок мимо закрывают.
 */
export function SkyMenu({ bounds }: { bounds: { w: number; h: number } }) {
  const at = skyMenu.value;
  const wrap = useRef<HTMLDivElement>(null);
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
  // фокус — на первую команду меню, когда оно встало на место (data-placed): до замера оно невидимо и фокус не держит;
  // так меню одинаково открывается правой кнопкой и клавишей меню (IX-49); после долгого касания фокус не переносится
  const placed = !!at && !!pos;
  useEffect(() => {
    const m = wrap.current;
    if (!placed || !m || m.contains(document.activeElement) || lastInput === 'touch') return;
    m.querySelector<HTMLElement>('button:not([disabled]), input')?.focus({ preventScroll: true });
  }, [placed, at]);
  if (!at) return null;
  const p = at.id ? byId.get(at.id) : undefined;
  const groupOn = !!group && foldGroups.value.includes(group);
  return (
    <div
      class="workpick skymenu"
      ref={wrap}
      role="group"
      aria-label={p ? `Лицо на небе: ${p.name}` : 'Созвездие на небе'}
      style={{ left: `${pos?.x ?? at.x}px`, top: `${pos?.y ?? at.y}px` }}
      data-placed={pos ? '' : undefined}
      {...pop}
    >
      {p && (
        <>
          <p class="wp-head">
            <b>{p.name}</b>
            {p.disambig ? typo(`, ${p.disambig}`) : null}
          </p>
          <WorkPicker id={p.id} onDone={() => close(true)} />
        </>
      )}
      {/* созвездие линий Мессии не сворачивается: его лица — хребет неба */}
      {g && g.kind !== 'other' && g.id !== 'messiah' && (
        <div class={p ? 'wp-row' : 'wp-row wp-first'}>
          <button
            type="button"
            class="cmd"
            onClick={() => {
              foldGroupOf(g.id);
              close(true);
            }}
          >
            {typo(`${groupOn ? 'Развернуть' : 'Свернуть'} созвездие «${g.name}»`)}
          </button>
        </div>
      )}
    </div>
  );
}
