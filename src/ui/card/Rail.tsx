/**
 * Рейка разделов карточки (F8; CARD-33, VIS-07, VIS-42, CARD-70, UX-24, MOB-14, MOB-36): 24 метки в шести группах у самого
 * края листа, на тонкой нити, отдельно от колонки номеров. Четыре различимых вида: сплошная — есть сведения; кольцо —
 * в Писании не сообщается; пунктирное кольцо — раздел не составлен; полый квадрат — не относится (§ 21 вне родословий
 * Мессии). Шаг и поле нажатия 24 × 24 (WCAG 2.5.8); текущий раздел — aria-current и метка 9 px в кольце; одна остановка
 * Tab, по меткам — стрелками, Home и End. Ярлык «17 Жизнеописание — есть сведения» — при наведении и фокусе.
 * На телефоне рейка — строка номеров под шапкой листа (folio.css).
 */
import { Fragment } from 'preact';
import { useRef } from 'preact/hooks';
import { SECTIONS } from './sections.tsx';

export type SecState = 'content' | 'header' | 'silent' | 'absent' | 'na';

export const STATE_TEXT: Record<SecState, string> = {
  content: 'есть сведения',
  header: 'есть сведения',
  silent: 'в Писании не сообщается',
  absent: 'не составлен',
  na: 'не относится',
};

export function Rail({ states, current, onGo }: { states: Record<number, SecState>; current: number; onGo: (n: number) => void }) {
  const nav = useRef<HTMLElement>(null);
  // одна остановка Tab — метка текущего раздела (или первого); по меткам — стрелками, Home и End (I1–I3; ТЗ § 11.2 п. 10)
  const stop = SECTIONS.some((s) => s.n === current) ? current : SECTIONS[0].n;
  const onKey = (e: KeyboardEvent) => {
    const els = [...(nav.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((b) => b.getClientRects().length);
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    els[Math.max(0, Math.min(els.length - 1, to))].focus();
  };
  return (
    <nav class="rail" aria-label="Метки разделов карточки" ref={nav} onKeyDown={onKey}>
      {SECTIONS.map((s, i) => {
        const st = states[s.n] ?? 'absent';
        const label = `${s.n} ${s.title} — ${STATE_TEXT[st]}`;
        return (
          <Fragment key={s.n}>
            {i > 0 && SECTIONS[i - 1].part !== s.part ? <span class="gap" aria-hidden="true" /> : null}
            <button
              type="button"
              class={`${st === 'header' ? 'content' : st}${current === s.n ? ' current' : ''}`}
              aria-label={label}
              aria-current={current === s.n ? 'location' : undefined}
              tabIndex={s.n === stop ? 0 : -1}
              onClick={() => onGo(s.n)}
            >
              <span class="dot" aria-hidden="true" />
              <span class="num" aria-hidden="true">
                {s.n}
              </span>
              <span class="rail-label" aria-hidden="true">
                <b>{s.n}</b> {s.title}
                {' '}— {STATE_TEXT[st]}
              </span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Ключ рейки перед колофоном (CARD-33): те же метки, что на рейке, с подписями — «Всё видимое объяснено».
 * Только состояния, которые есть у этой карточки.
 */
export function RailKey({ states }: { states: Record<number, SecState> }) {
  const has = new Set<SecState>(Object.values(states).map((s) => (s === 'header' ? 'content' : s)));
  const keys: [SecState, string][] = [
    ['content', 'есть сведения'],
    ['silent', 'в Писании не сообщается'],
    ['absent', 'не составлен'],
    ['na', 'не относится'],
  ];
  return (
    <p class="rail-key" aria-hidden="true">
      <span class="lbl">Метки разделов:</span>
      {keys
        .filter(([k]) => has.has(k))
        .map(([k, t]) => (
          <span class={`k ${k}`} key={k}>
            <span class="dot" />
            {t}
          </span>
        ))}
    </p>
  );
}
