/**
 * Общие органы управления (B3; VIS-14, 11, 17; IX-37). Вид и все состояния — src/styles/controls.css.
 * Три вида: ссылка в тексте (P и Refs в common.tsx), команда (<button class="cmd"> в ряду .cmds) и переключатель:
 * Segmented — один вариант из нескольких, Check — флажок слоя или режима. Close — единый «×» закрытия.
 * Menu — кнопка с раскрывающимся списком: «Ещё» верхней строки и выбор модели хронологии (C3, C6).
 */
import { Fragment, type ComponentChildren } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';

/** «×» закрытия: поле 32 × 32, на сенсорном экране 44 × 44; назначение — в aria-label. */
export function Close({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="close" aria-label={label} title={label} onClick={onClick}>
      ×
    </button>
  );
}

/** Переключатель из прямоугольных сегментов: нажат ровно тот вариант, чьё значение равно value. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  roving = false,
}: {
  label: string;
  options: readonly { value: T; label: ComponentChildren }[];
  value: T | null;
  onChange: (v: T) => void;
  /** одна остановка Tab на весь переключатель, выбор — стрелками, Home и End (верхняя строка: «Ночь | День») */
  roving?: boolean;
}) {
  const at = options.findIndex((o) => o.value === value);
  return (
    <div class="seg" role="group" aria-label={label} onKeyDown={roving ? (e) => rovingKey(e, at, options.length, (j) => onChange(options[j].value)) : undefined}>
      {options.map((o, k) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === value}
          tabIndex={roving ? (k === (at < 0 ? 0 : at) ? 0 : -1) : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Стрелки в переключателе с одной остановкой Tab (шаблон группы кнопок WAI-ARIA): ←/↑ — предыдущий, →/↓ — следующий
 * (по кругу), Home и End — первый и последний; выбранный сразу применяется, фокус переходит на него.
 */
export function rovingKey(e: KeyboardEvent, at: number, n: number, choose: (j: number) => void) {
  const k = e.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k) || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();
  const i = at < 0 ? 0 : at;
  const j = k === 'Home' ? 0 : k === 'End' ? n - 1 : (i + (k === 'ArrowLeft' || k === 'ArrowUp' ? n - 1 : 1)) % n;
  const group = e.currentTarget as HTMLElement;
  choose(j);
  requestAnimationFrame(() => group.querySelectorAll<HTMLElement>('button')[j]?.focus());
}

/** Флажок: квадрат 10 × 10 в поле нажатия 24 × 24, подпись нажимается вместе с ним. */
export function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ComponentChildren }) {
  return (
    <label class="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      {children}
    </label>
  );
}

export interface MenuItem {
  key: string;
  label: ComponentChildren;
  /** пояснение второй строкой */
  note?: ComponentChildren;
  /** пункт-переключатель: отмечен ли он (без поля — простая команда) */
  checked?: boolean;
  /** черта перед пунктом: начало другой группы */
  sep?: boolean;
  /**
   * Подпись группы (этап 13, решение 122: «Искать и читать», «Исследовать связи», «Справка»): соседние пункты с одной
   * подписью — в role="group" с видимой подписью над ними. Без поля — пункты как прежде.
   */
  group?: string;
  onSelect: () => void;
}

/** Пункты меню подряд по подписи группы: [{ group, items }], без подписи — group undefined. */
function runs(items: MenuItem[]): { group?: string; items: MenuItem[] }[] {
  const out: { group?: string; items: MenuItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.group === it.group) last.items.push(it);
    else out.push({ group: it.group, items: [it] });
  }
  return out;
}

/**
 * Кнопка с раскрывающимся списком (образец ARIA «menu button»). Enter, пробел или стрелка открывают список
 * и ставят фокус на отмеченный пункт, иначе на первый; стрелки ходят по кругу, Home и End — к краям;
 * Enter и пробел выбирают пункт; Escape закрывает список и возвращает фокус на кнопку; Tab и щелчок мимо закрывают.
 * radio — пункты взаимоисключающие (menuitemradio), иначе пункты с checked — флажки (menuitemcheckbox).
 * Куда раскрывается список и как выглядит кнопка, решает место (controls.css, .menu в своём ряду).
 */
export function Menu({
  label,
  title,
  items,
  radio,
  class: cls,
  foot,
}: {
  label: ComponentChildren;
  title?: string;
  items: MenuItem[];
  radio?: boolean;
  class?: string;
  /** строка под пунктами (не пункт): пояснение ко всему списку, диктор слышит её при открытии (aria-describedby) */
  foot?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const entries = () => [...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const focusAt = (i: number) => {
    const els = entries();
    if (els.length) els[(i + els.length) % els.length].focus();
  };
  const start = useRef<'first' | 'last'>('first');
  // фокус переходит в список до первой отрисовки: нажатие сразу после открытия уже попадает в список
  useLayoutEffect(() => {
    if (!open) return;
    const k = items.findIndex((x) => x.checked);
    focusAt(start.current === 'last' ? -1 : Math.max(0, k));
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const onButtonKey = (e: KeyboardEvent) => {
    if (open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    e.stopPropagation();
    start.current = e.key === 'ArrowUp' ? 'last' : 'first';
    setOpen(true);
  };
  /** Клавиши открытого списка — и на пунктах, и на самой кнопке. */
  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    const els = entries();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') focusAt(i + 1);
    else if (e.key === 'ArrowUp') focusAt(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(-1);
    else if (e.key === 'Escape') close();
    else {
      if (e.key === 'Tab') setOpen(false);
      return;
    }
    // Escape списка не доходит до общего Escape атласа (App.tsx): он снимает одно состояние — сам список
    e.preventDefault();
  };
  return (
    <div
      class={cls ? `menu ${cls}` : 'menu'}
      ref={wrap}
      onKeyDown={onKey}
      onFocusOut={(e) => {
        if (open && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={btn}
        id={`${id}-b`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={title}
        onClick={() => {
          start.current = 'first';
          setOpen(!open);
        }}
        onKeyDown={onButtonKey}
      >
        {label}
      </button>
      {open && (
        // длинный список с пояснением внизу (модели хронологии) может прокручиваться: сам список — в порядке Tab, чтобы
        // прокрутка была доступна с клавиатуры (axe: scrollable-region-focusable); стрелки ходят по пунктам, как прежде
        <div
          role="menu"
          id={id}
          aria-labelledby={`${id}-b`}
          aria-describedby={foot ? `${id}-f` : undefined}
          // список с группами (решение 122) длинный и на телефоне прокручивается — тоже в порядке Tab
          tabIndex={foot || items.some((it) => it.group) ? 0 : undefined}
        >
          {runs(items).map((run, ri) => {
            const buttons = run.items.map((it) => (
              <Fragment key={it.key}>
                {it.sep && <div role="separator" />}
                <button
                  type="button"
                  role={radio ? 'menuitemradio' : it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={radio || it.checked !== undefined ? !!it.checked : undefined}
                  tabIndex={-1}
                  onClick={() => {
                    it.onSelect();
                    close();
                  }}
                >
                  <span class="nm">{it.label}</span>
                  {it.note && <span class="note">{it.note}</span>}
                </button>
              </Fragment>
            ));
            if (!run.group) return buttons;
            const gid = `${id}-g${ri}`;
            return (
              <Fragment key={gid}>
                {ri > 0 && <div role="separator" />}
                <div role="group" aria-labelledby={gid}>
                  <div class="menu-group" id={gid}>
                    {run.group}
                  </div>
                  {buttons}
                </div>
              </Fragment>
            );
          })}
          {foot && (
            <p class="menu-foot" id={`${id}-f`} role="none">
              {foot}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
