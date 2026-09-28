import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { panel } from '../../state.ts';
import { Close } from '../controls.tsx';
import { typo, typoTree } from '../text/typo.ts';
import { showYears } from '../sky/view.ts';
import { parked } from '../focus.ts';

/** Прокрутка каждой панели за сеанс (D11; IX-30): вернувшись к панели, читатель видит то же место. */
const scrolls = new Map<string, number>();
/** Состояние панелей за сеанс: фильтры, выбранная глава, буква указателя (D11; IX-30). */
const remembered = new Map<string, unknown>();

/**
 * useState, который помнит значение между закрытием и открытием панели в пределах сеанса.
 * key — имя панели и поля: `useRemembered('index:letter', null)`.
 */
export function useRemembered<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (remembered.has(key) ? (remembered.get(key) as T) : init));
  return [
    v,
    (next: T) => {
      remembered.set(key, next);
      setV(next);
    },
  ];
}

/**
 * Панель. reserve — лист лежит на небе (лист «Вид» узкого неба): небо не рисует под ним подписей и сдвигает из-под него
 * выбранное лицо (SkyView, data-reserve). Пока на телефоне идёт выбор второго лица на небе, лист панели этого режима
 * убран (hidden; src/ui/focus.ts, parked — MOB-47): панель остаётся в разметке со своим состоянием и прокруткой.
 */
export function Sheet({ title, lead, wide, reserve, children }: { title: string; lead?: string; wide?: boolean; reserve?: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLElement>(null);
  // прокрутка — по названию панели: восстановить после отрисовки, запоминать при прокрутке
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const at = scrolls.get(title);
    if (at) el.scrollTop = at;
    const onScroll = () => scrolls.set(title, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [title]);
  // заголовок принимает фокус при открытии панели и называет область для диктора (I2; src/ui/focus.ts)
  const hid = `sheet-h-${title.replace(/[^\p{L}\p{N}]+/gu, '-')}`;
  return (
    <section
      ref={ref}
      class={wide ? 'sheet wide' : 'sheet'}
      aria-labelledby={hid}
      data-reserve={reserve ? 'sheet' : undefined}
      hidden={!reserve && parked.value}
    >
      {/* шапка: на телефоне прилипает к верху листа, чтобы «×» всегда был под рукой */}
      <header class="sheet-head">
        <h2 id={hid} tabIndex={-1}>
          {title}
        </h2>
        <Close label="Закрыть панель" onClick={() => (panel.value = null)} />
      </header>
      {lead && <p class="lead">{typo(lead)}</p>}
      {/* русская типографика для собственных строк панели; компоненты внутри набирают свои строки сами */}
      {typoTree(children)}
    </section>
  );
}

/** Перелёт к окну лет (лист «Эпохи»): та же функция, что у полосы времени (D4). */
export const flyToYears = (a: number, b: number) => {
  const pad = Math.max(10, (b - a) * 0.04);
  showYears(a - pad, b + pad, true);
};
