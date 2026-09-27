/**
 * Рабочий набор (J3; решение владельца 17): панель «В работе», команда «Взять в работу» с выбором объёма, строка набора
 * у верхней кромки неба и меню звезды на небе (правая кнопка мыши, долгое касание).
 * Состояние набора, неба и свёртки — src/ui/work.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { byId, groupById, loadCard, loadedCard } from '../../data/atlas.ts';
import type { Card } from '../../data/types.ts';
import { model, selected } from '../../state.ts';
import { goTo, plural } from '../common.tsx';
import { Sheet, useRemembered } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { lifeText } from '../sky/text.ts';
import { Brief } from '../card/Brief.tsx';
import { Check, Segmented } from '../controls.tsx';
import {
  addToWork, clearWork, foldDesc, foldDescOf, foldGroupOf, foldGroups, hasDescendants, lineOf, removeFromWork, removeWithLine, skyMode, workOrder,
  workSet, type Scope, type SkyMode, type WorkEntry,
} from '../work.ts';

/** «1 поколение», «2 поколения», «все» — число поколений для предков и потомков. */
export const genText = (g: number | null) => (g === null ? 'все' : `${g} ${plural(g, 'поколение', 'поколения', 'поколений')}`);
const GENS: (number | null)[] = [1, 2, 3, null];

/** Переключатель неба «все лица | в работе» (J4): тот же в органах неба, в листе «Вид» и в панели. */
export const SKY_MODES: readonly { value: SkyMode; label: string }[] = [
  { value: 'all', label: 'все лица' },
  { value: 'work', label: 'в работе' },
];
export function SkyModeSwitch() {
  return <Segmented label="Что показывает небо" options={SKY_MODES} value={skyMode.value} onChange={(v) => (skyMode.value = v)} />;
}

/**
 * Выбор объёма (J3): только лицо, с семьёй, с предками и с потомками на 1, 2, 3 поколения или все; со связями по толкованию
 * — флажком. Каждая команда сразу берёт лиц в работу. Если лицо уже в работе — «убрать из работы» и «убрать с родословной».
 */
export function WorkPicker({ id, onDone }: { id: string; onDone: () => void }) {
  const [interp, setInterp] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => first.current?.focus(), []);
  const on = workSet.value.has(id);
  const line = lineOf(id).length;
  const kids = hasDescendants(id);
  const take = (s: Scope) => {
    addToWork(id, s);
    onDone();
  };
  // на кнопках — только число поколений: подпись строки говорит, чего; диктору — полностью («С предками: 2 поколения»)
  const row = (kind: 'anc' | 'desc', label: string, disabled = false) => (
    <div class="wp-row wp-gens" role="group" aria-label={label}>
      <span class="k" aria-hidden="true">
        {label}, поколений:
      </span>
      {GENS.map((g) => (
        <button key={String(g)} type="button" class="cmd" disabled={disabled} aria-label={`${label}: ${genText(g)}`} onClick={() => take({ kind, gen: g, interp })}>
          {g === null ? 'все' : g}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <div class="wp-row">
        <button type="button" class="cmd" ref={first} onClick={() => take({ kind: 'self' })}>
          Только лицо
        </button>
        <button type="button" class="cmd" onClick={() => take({ kind: 'family', interp })}>
          С семьёй
        </button>
      </div>
      <p class="wp-note">{typo('Семья — родители, супруги, дети, братья и сёстры.')}</p>
      {row('anc', 'С предками')}
      {row('desc', 'С потомками', !kids)}
      <Check checked={interp} onChange={setInterp}>
        со связями по толкованию
      </Check>
      {on && (
        <div class="wp-row wp-out">
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
          {line > 0 && (
            <button
              type="button"
              class="cmd"
              title={`Убрать лицо и ещё ${line} ${plural(line, 'лицо', 'лица', 'лиц')}, взятых вместе с ним`}
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
 * «Взять в работу» — команда шапки карточки (J3): раскрывает выбор объёма. Лицо уже в работе — «В работе» (нажата):
 * тот же выбор добавляет родню и убирает лицо.
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
        title={on ? 'Лицо в рабочем наборе: добавить родню или убрать' : 'Взять лицо в рабочий набор (клавиша В на небе)'}
        onClick={() => setOpen(!open)}
      >
        {on ? 'В работе' : 'Взять в работу'}
      </button>
      {open && (
        <div class="workpick" id={`wp-${id}`} role="group" aria-label="Что взять в работу">
          <WorkPicker id={id} onDone={() => close(true)} />
        </div>
      )}
    </div>
  );
}

/** Свернуть или развернуть потомков лица на небе (J5): команда шапки карточки. */
export function FoldButton({ id }: { id: string }) {
  if (!hasDescendants(id)) return null;
  const on = foldDesc.value.includes(id);
  return (
    <button type="button" class="cmd" aria-pressed={on} title="Потомки на небе заменяются знаком «+N» (клавиша С на небе)" onClick={() => foldDescOf(id)}>
      {on ? 'Развернуть потомков' : 'Свернуть потомков'}
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

/** Откуда лицо в наборе — для диктора и подсказки строки: «предок», «потомок», «семья», «звено пути». */
const VIA: Record<WorkEntry['via'], string> = { self: '', anc: 'предок', desc: 'потомок', family: 'семья', path: 'звено пути' };

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
    <Sheet title={n ? `В работе: ${n} ${plural(n, 'лицо', 'лица', 'лиц')}` : 'В работе'} lead="Лица, с которыми вы работаете в этом сеансе. Набор помнится и после перезагрузки страницы; небо может показывать только его.">
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
              const via = e ? VIA[e.via] : '';
              return (
                <li key={id} class={on ? 'open' : undefined} data-id={id}>
                  <div class="wi-head">
                    <button type="button" class="wi-row" aria-expanded={on} aria-current={selected.value === id ? 'true' : undefined} onClick={() => setOpen(on ? null : id)}>
                      <span class="nm">{p.name}</span>
                      {p.disambig ? <span class="ds">{typo(`, ${p.disambig}`)}</span> : null}
                      <span class="yrs">{typo(lifeText(id))}</span>
                      {via && <span class="visually-hidden">{`; ${via}`}</span>}
                    </button>
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
 * Строка у верхней кромки неба в режиме «В работе» (J4): пустой набор — как его собрать; выбранное лицо не в наборе —
 * взять его в работу или показать все лица.
 */
export function WorkBar() {
  const n = workSet.value.size;
  const id = selected.value;
  const out = !!id && !workSet.value.has(id);
  if (n && !out) return null;
  return (
    <div class="pickbar pinbar workbar" role="status">
      <span>
        {typo(
          out
            ? 'Выбранное лицо не в рабочем наборе, и на небе его нет.'
            : 'Рабочий набор пуст: небо показывает только лиц, взятых в работу. Возьмите их командой «Взять в работу» в карточке или клавишей В у звезды.',
        )}
      </span>
      {out && (
        <button type="button" onClick={() => addToWork(id!)}>
          Взять в работу
        </button>
      )}
      <button type="button" onClick={() => (skyMode.value = 'all')}>
        Показать все лица
      </button>
    </div>
  );
}

/** Меню неба: у звезды (id), у названия созвездия (group) или у знака свёрнутого — в точке (x, y) px неба. */
export type SkyMenuAt = { x: number; y: number; id?: string; group?: string };
export const skyMenu = signal<SkyMenuAt | null>(null);

/**
 * Меню звезды на небе (J3, J5): правая кнопка мыши, долгое касание или клавиша меню на звезде. У звезды — выбор объёма
 * «Взять в работу» и «Свернуть потомков»; у названия созвездия — «Свернуть созвездие». Escape и щелчок мимо закрывают.
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
  const firstGroup = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (at && !at.id) firstGroup.current?.focus();
  }, [at]);
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
          {hasDescendants(p.id) && (
            <div class="wp-row wp-out">
              <button
                type="button"
                class="cmd"
                onClick={() => {
                  foldDescOf(p.id);
                  close(true);
                }}
              >
                {foldDesc.value.includes(p.id) ? 'Развернуть потомков' : 'Свернуть потомков'}
              </button>
            </div>
          )}
        </>
      )}
      {/* созвездие линий Мессии не сворачивается: его лица — хребет неба */}
      {g && g.kind !== 'other' && g.id !== 'messiah' && (
        <div class={p ? 'wp-row' : 'wp-row wp-first'}>
          <button
            type="button"
            class="cmd"
            ref={firstGroup}
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
