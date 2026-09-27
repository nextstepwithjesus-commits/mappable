/**
 * Общие органы управления (B3; VIS-14, 11, 17; IX-37). Вид и все состояния — src/styles/controls.css.
 * Три вида: ссылка в тексте (P и Refs в common.tsx), команда (<button class="cmd"> в ряду .cmds) и переключатель:
 * Segmented — один вариант из нескольких, Check — флажок слоя или режима. Close — единый «×» закрытия.
 */
import type { ComponentChildren } from 'preact';

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
}: {
  label: string;
  options: readonly { value: T; label: ComponentChildren }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
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
