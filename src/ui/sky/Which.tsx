/**
 * «Какое лицо?» (H5; MOB-10): касание в плотном месте неба, где под пальцем несколько звёзд на близких расстояниях,
 * не выбирает наугад, а спрашивает — список из 2–5 имён с уточнением или годами, по порядку сверху вниз, как на небе.
 * Список — лист у места касания (над пальцем, если есть место), на небе поверх звёзд; закрывают его «×», Escape,
 * касание мимо и любое движение неба. Выбор имени — то же, что касание звезды (ввод неба, src/ui/sky/input.ts).
 */
import { render } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { Close } from '../controls.tsx';
import { typo } from '../text/typo.ts';
import { lifeText } from './text.ts';

export interface WhichOpts {
  ids: string[];
  /** место касания и прямоугольник неба — px окна */
  x: number;
  y: number;
  bounds: { left: number; top: number; right: number; bottom: number };
  onPick: (id: string) => void;
  /** куда вернуть фокус после закрытия (холст неба) */
  back?: HTMLElement | null;
}

/** Зазор между пальцем и списком: палец не закрывает имена. */
const GAP = 24;

function WhichList({ ids, x, y, bounds, onPick, onClose }: WhichOpts & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // щелчок, который браузер досылает после касания неба, не должен выбрать имя под пальцем: строки отвечают только
  // на нажатие внутри списка или на клавишу (у щелчка с клавиатуры detail = 0)
  const armed = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(bounds.left + 8, Math.min(bounds.right - w - 8, x - w / 2));
    // над пальцем, если помещается; иначе под ним — и на лист карточки, если над ним мало неба; палец не закрывает имён
    const above = y - GAP - h;
    const below = y + GAP;
    const top = above >= bounds.top + 8 ? above : below + h <= bounds.bottom - 8 ? below : Math.max(bounds.top + 8, Math.min(below, window.innerHeight - h - 8));
    setAt({ left, top });
    el.querySelector<HTMLElement>('.which-item')?.focus({ preventScroll: true });
  }, [ids.join(' '), x, y]);
  return (
    <div
      class="which"
      ref={ref}
      role="dialog"
      aria-labelledby="which-title"
      data-placed={at ? '' : undefined}
      style={at ? { left: `${at.left}px`, top: `${at.top}px` } : undefined}
      onPointerDown={() => (armed.current = true)}
      onKeyDown={(e) => {
        armed.current = true;
        if (e.key !== 'Escape') return;
        // Escape снимает одно состояние — сам список; до общего Escape атласа он не доходит
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div class="which-head">
        <h2 id="which-title">Какое лицо?</h2>
        <Close label="Закрыть список" onClick={onClose} />
      </div>
      <ul>
        {ids.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const note = p.disambig || lifeText(id);
          return (
            <li key={id}>
              <button type="button" class="which-item" data-id={id} onClick={(e) => (armed.current || e.detail === 0) && onPick(id)}>
                <span class="nm">{p.name}</span>
                {note ? <span class="ds">{typo(note)}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

let host: HTMLDivElement | null = null;
let back: HTMLElement | null = null;
let offAway: (() => void) | null = null;

/** Список открыт? */
export const whichOpen = () => !!host?.firstChild;

/** Закрыть список; focus — вернуть фокус на небо (закрыт с клавиатуры или «×»). */
export function closeWhich(focus = false) {
  offAway?.();
  offAway = null;
  if (host) render(null, host);
  if (focus) back?.focus({ preventScroll: true });
  back = null;
}

/** Открыть список «Какое лицо?» у места касания. */
export function openWhich(o: WhichOpts) {
  closeWhich();
  if (!host) {
    host = document.createElement('div');
    host.className = 'which-host';
    document.body.appendChild(host);
  }
  back = o.back ?? null;
  const pick = (id: string) => {
    closeWhich();
    o.onPick(id);
  };
  render(<WhichList {...o} onPick={pick} onClose={() => closeWhich(true)} />, host);
  // касание мимо списка закрывает его, а само касание делает своё дело (выбирает другую звезду, сдвигает небо)
  const away = (e: PointerEvent) => {
    if (!host?.contains(e.target as Node)) closeWhich();
  };
  document.addEventListener('pointerdown', away, true);
  offAway = () => document.removeEventListener('pointerdown', away, true);
}
