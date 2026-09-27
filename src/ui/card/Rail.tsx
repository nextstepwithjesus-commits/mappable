/**
 * Рейка разделов карточки (F8; CARD-33, VIS-07, UX-24, MOB-14, MOB-36): 24 метки в шести группах вдоль внутреннего
 * края листа. Четыре различимых вида: сплошная — есть сведения; кольцо — в Писании не сообщается; пунктирное
 * кольцо — раздел не составлен; черта — не относится (§ 21 вне родословий Мессии). Шаг 12 px, поле нажатия 24 × 16;
 * текущий раздел — aria-current и крупная метка. Ярлык «17 Жизнеописание — есть сведения» — при наведении и фокусе.
 * На телефоне рейка — строка номеров под шапкой листа (folio.css).
 */
import { Fragment } from 'preact';
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
  return (
    <nav class="rail" aria-label="Разделы карточки">
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
