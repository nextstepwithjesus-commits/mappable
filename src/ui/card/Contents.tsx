/**
 * Видимое оглавление карточки «Разделы карточки» (этап 13, решение 119; UI-09): названия 24 разделов в шести частях.
 * Рейка из точек остаётся быстрым указателем (Rail.tsx), оглавление называет разделы словами.
 * — Блок: строка на часть, «I. Личность: Имя, Другие имена…». Разделы со сведениями —
 *   команды перехода (фокус переходит на заголовок раздела, решение 115); о которых Писание молчит, не составленные
 *   и не относящиеся — бледнее и без команды: их состояние говорит рейка и колофон.
 * — В колонке карточки и на телефоне — одна строка («Разделы карточки ▾» под шапкой; «17 Жизнеописание ▾» в закреплённой
 *   полосе и в строке номеров телефона), по нажатию — тот же перечень раскрывающимся списком: блок из девяти строк над
 *   § 1 уводил бы § 1 с первого экрана (VIS-41) и удлинял карточку (F5). Блоком — в «Карточке на весь экран» (решение 123).
 * Одна остановка Tab: по пунктам — стрелками, Home и End (как у рейки; I1–I3).
 */
import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { SecState } from './Rail.tsx';
import { PARTS, SECTIONS } from './sections.tsx';

/**
 * Оглавление открытой карточки для закреплённой полосы листа (Folio.tsx, FolioBar): состояния разделов и переход. Его
 * публикует тело карточки (CardPage), полоса показывает текущий раздел со списком, когда имя шапки ушло под неё.
 */
export const tocNow = signal<{ id: string; states: Record<number, SecState>; go: (n: number) => void } | null>(null);

/** Раздел можно открыть из оглавления: есть сведения в теле или в шапке. */
const goable = (st: SecState | undefined) => st === 'content' || st === 'header';

/** Стрелки, Home и End по командам списка (одна остановка Tab). */
function onArrows(e: KeyboardEvent, box: HTMLElement | null) {
  const els = [...(box?.querySelectorAll<HTMLButtonElement>('button.toc-go') ?? [])];
  const i = els.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : null;
  if (to === null) return;
  e.preventDefault();
  els[Math.max(0, Math.min(els.length - 1, to))].focus();
}

/** Перечень по частям — общий для блока и раскрывающегося списка. */
function PartsList({ states, current, onGo }: { states: Record<number, SecState>; current: number; onGo: (n: number) => void }) {
  const first = SECTIONS.find((s) => goable(states[s.n]))?.n ?? null;
  const stop = SECTIONS.some((s) => s.n === current && goable(states[s.n])) ? current : first;
  return (
    <ol class="toc-parts">
      {PARTS.slice(1).map((name, k) => {
        const part = k + 1;
        const secs = SECTIONS.filter((s) => s.part === part);
        const [roman, ...rest] = name.split(' ');
        return (
          <li key={part}>
            <span class="pn">{roman}</span>{' '}
            <span class="pl">
            <span class="pt">{rest.join(' ')}</span>
            {': '}
            {secs.map((s, i) => (
              <Fragment key={s.n}>
                {i ? ' ' : ''}
                {/* запятая держится за своё название (.nobr): не уходит в начало строки */}
                <span class="nobr">
                  {goable(states[s.n]) ? (
                    <button type="button" class="toc-go" aria-current={current === s.n ? 'location' : undefined} tabIndex={s.n === stop ? 0 : -1} onClick={() => onGo(s.n)}>
                      {s.title}
                    </button>
                  ) : (
                    <span class="toc-off">{s.title}</span>
                  )}
                  {i < secs.length - 1 ? ',' : ''}
                </span>
              </Fragment>
            ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Оглавление на широком экране — блок под шапкой карточки. */
export function Contents({ states, current, onGo }: { states: Record<number, SecState>; current: number; onGo: (n: number) => void }) {
  const box = useRef<HTMLElement>(null);
  return (
    <nav class="card-toc" aria-label="Разделы карточки" ref={box} onKeyDown={(e) => onArrows(e, box.current)}>
      <p class="toc-h" aria-hidden="true">
        Разделы карточки
      </p>
      <PartsList states={states} current={current} onGo={onGo} />
    </nav>
  );
}

/**
 * Оглавление на телефоне (решение 119): строка «Раздел: 17 Жизнеописание ▾» в шапке листа; список раскрывается под ней.
 * Escape и выбор раздела закрывают список; фокус возвращается на строку (после выбора — на заголовок раздела).
 */
export function ContentsMenu({ states, current, onGo, label }: { states: Record<number, SecState>; current: number; onGo: (n: number) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = SECTIONS.find((s) => s.n === current) ?? SECTIONS[0];
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('button.toc-go[tabindex="0"]')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div class="toc-menu">
      <button
        type="button"
        class="toc-cur"
        ref={btn}
        aria-expanded={open}
        aria-label={label ? undefined : `Разделы карточки; сейчас — ${cur.n} ${cur.title}`}
        onClick={() => setOpen(!open)}
      >
        {label ? (
          label
        ) : (
          <>
            <span class="n">{cur.n}</span> {cur.title}
          </>
        )}
        <span class="tri" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div
          class="toc-drop"
          ref={list}
          role="group"
          // прокручиваемый список — сам остановка Tab (axe: scrollable-region-focusable); пункты — стрелками
          tabIndex={0}
          aria-label="Разделы карточки"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              btn.current?.focus({ preventScroll: true });
              return;
            }
            onArrows(e, list.current);
          }}
        >
          <PartsList
            states={states}
            current={current}
            onGo={(n) => {
              setOpen(false);
              onGo(n);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
