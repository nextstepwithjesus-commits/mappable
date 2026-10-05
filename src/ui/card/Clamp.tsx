/**
 * Предел «до 8 строк» для раздела карточки (ТЗ § 3.3; F5; CARD-21): раздел показывает столько записей, сколько
 * помещается в 8 строк текста, дальше — «ещё 23 события». Предел одинаков для всех разделов.
 *
 * Тело раздела раскладывается на записи: абзацы и пункты списков верхнего уровня. Запись не режется: видны целые
 * записи, первая — всегда. Сколько записей помещается, измеряется в браузере после раскладки (useLayoutEffect,
 * до отрисовки кадра — без мигания) и пересчитывается при смене ширины и после загрузки шрифтов. При отрисовке
 * в строку (тесты, preact-render-to-string) эффектов нет, и раздел выводится целиком.
 */
import { Fragment, h, type ComponentChildren, type VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { plural } from '../common.tsx';
import { cardTitle, focusQuietly } from '../focus.ts';

/** Сколько строк текста показывает раздел до «ещё N …». */
export const CLAMP_LINES = 8;
/** Отбивка между записями до этапа 20, px: в предел «8 строк» входит только она. */
const CLAMP_GAP_WAS = 5;

type Item = { node: VNode; list: VNode | null };

const empty = (x: unknown) => x === null || x === undefined || typeof x === 'boolean' || x === '';

/** Записи тела раздела: абзацы и блоки верхнего уровня, пункты списков — по одному. */
export function clampItems(body: ComponentChildren): Item[] {
  const out: Item[] = [];
  const walk = (x: ComponentChildren, list: VNode | null) => {
    if (empty(x)) return;
    if (Array.isArray(x)) {
      for (const y of x) walk(y as ComponentChildren, list);
      return;
    }
    if (typeof x === 'string' || typeof x === 'number') {
      if (String(x).trim()) out.push({ node: h('p', null, x), list });
      return;
    }
    const v = x as VNode<{ children?: ComponentChildren }>;
    if (v.type === Fragment) return walk(v.props.children, list);
    if (v.type === 'ul' && !list) return walk(v.props.children, v);
    out.push({ node: v, list });
  };
  walk(body, null);
  return out;
}

/** Записи обратно в разметку: соседние пункты одного списка — в копии этого списка. */
function regroup(items: Item[]): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let run: VNode[] = [];
  let list: VNode | null = null;
  const flush = () => {
    if (list && run.length) {
      const { children: _c, ...props } = list.props as { children?: unknown };
      out.push(h('ul', { ...props, key: `ul${out.length}` }, run));
    }
    run = [];
    list = null;
  };
  items.forEach((it) => {
    if (it.list !== list) flush();
    if (it.list) {
      list = it.list;
      run.push(it.node);
    } else out.push(it.node);
  });
  flush();
  return out;
}

/** Существительное для «ещё N …» по разделу (ТЗ § 3.3: «ещё 23 события»). */
const NOUNS: Record<number, [string, string, string]> = {
  4: ['имя', 'имени', 'имён'],
  15: ['строка', 'строки', 'строк'],
  17: ['событие', 'события', 'событий'],
  18: ['цитата', 'цитаты', 'цитат'],
  22: ['упоминание', 'упоминания', 'упоминаний'],
  24: ['примечание', 'примечания', 'примечаний'],
};
export const moreLabel = (n: number, count: number) => {
  const [a, b, c] = NOUNS[n] ?? ['запись', 'записи', 'записей'];
  return `ещё ${count} ${plural(count, a, b, c)}`;
};

/** DOM-элементы записей в том же порядке, что clampItems: пункты списков — по одному. */
function itemElements(box: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(box.children) as HTMLElement[]) {
    if (el.classList.contains('clamp-more')) continue;
    if (el.tagName === 'UL') out.push(...(Array.from(el.children) as HTMLElement[]));
    else out.push(el);
  }
  return out;
}

/**
 * Раздел до CLAMP_LINES строк. sig — лицо и раздел: у другого лица предел считается заново и раздел снова свёрнут.
 */
export function Clamp({ sig, n, children }: { sig: string; n: number; children: ComponentChildren }) {
  const items = clampItems(children);
  const box = useRef<HTMLDivElement>(null);
  // замер действителен для того же лица и раздела, той же ширины и того же числа записей (том карточки мог прийти позже)
  const [measured, setMeasured] = useState<{ sig: string; w: number; len: number; cut: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const focusFrom = useRef<number | null>(null);
  const w = typeof window === 'undefined' ? 0 : window.innerWidth;
  // тело раздела у нового лица строится заново (key ниже): фокус на ссылке прежнего тела ушёл бы на body —
  // он переходит на заголовок карточки нового лица, как после перехода по ссылке (I2)
  const shownSig = useRef(sig);
  const refocus = useRef(false);
  if (shownSig.current !== sig) {
    if (typeof document !== 'undefined' && box.current?.contains(document.activeElement)) refocus.current = true;
    shownSig.current = sig;
  }
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    focusQuietly(cardTitle(sig.split('|')[0]) ?? box.current?.closest<HTMLElement>('.folio')?.querySelector<HTMLElement>('h2') ?? null);
  }, [sig]);
  const all = open === sig;
  const known = measured && measured.sig === sig && measured.w === w && measured.len === items.length ? measured.cut : null;
  const cut = all || known === null ? items.length : known;

  useEffect(() => {
    // ширина листа или шрифты сменились — записи переносятся иначе: измерить заново
    const again = () => setMeasured(null);
    window.addEventListener('resize', again);
    document.fonts?.ready.then(again).catch(() => {});
    return () => window.removeEventListener('resize', again);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || all || known !== null) return;
    const els = itemElements(el);
    if (els.length !== items.length || items.length < 2) {
      setMeasured({ sig, w, len: items.length, cut: items.length });
      return;
    }
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    // «8 строк» — строки текста: отбивки между записями (этап 20, решение 195: 10 px между фактами) в предел не входят —
    // иначе раздел показывал бы меньше записей, чем прежде, только оттого, что они отделены друг от друга
    let gaps = 0;
    const limit = () => el.getBoundingClientRect().top + CLAMP_LINES * lh + 2 + gaps;
    let at = els.findIndex((x, i) => {
      // прежняя отбивка записи (5 px) в предел входит, как и раньше; прибавка этапа 20 — нет
      if (i > 0) gaps += Math.max(0, x.getBoundingClientRect().top - els[i - 1].getBoundingClientRect().bottom - CLAMP_GAP_WAS);
      return i > 0 && x.getBoundingClientRect().bottom > limit();
    });
    // одна скрытая запись в одну-две строки не стоит строки «ещё 1 …»: команда заняла бы почти то же место
    if (at >= 0 && items.length - at === 1 && els[at].getBoundingClientRect().height <= 2 * lh) at = -1;
    if (at < 0) at = items.length;
    // первое хронологическое напряжение не прячется под «ещё N …»: оно говорит, что числа текста спорят друг с другом
    // (ТЗ § 11.2 п. 8). В § 13 напряжение — одна короткая запись (объяснение — в § 24), и предел 8 строк держится;
    // следующие напряжения (у Моисея их два) уходят под «ещё N …», как любые записи
    // этап 13 (решение 100): строки § 13 идут в постоянном порядке, и напряжение бывает последней строкой — оно всё равно
    // не прячется (ТЗ § 11.2 п. 8; сценарии 223–225): такой § 13 длиннее 8 строк
    const firstTension = items.findIndex((it) => /(^|\s)tension(\s|$)/.test(String((it.node.props as { class?: string }).class ?? '')));
    if (firstTension >= at && at < items.length) at = firstTension + 1 >= items.length - 1 ? items.length : firstTension + 1;
    // подзаголовок не остаётся последней видимой строкой: он уходит вместе со своей группой
    while (at > 1 && at < items.length && /(^|\s)sub(\s|$)/.test(String((items[at - 1].node.props as { class?: string }).class ?? ''))) at--;
    setMeasured({ sig, w, len: items.length, cut: at });
  });

  useEffect(() => {
    // после «ещё N …» фокус — на первой раскрытой записи, а не теряется вместе с исчезнувшей командой
    if (!all || focusFrom.current === null || !box.current) return;
    const el = itemElements(box.current)[focusFrom.current];
    focusFrom.current = null;
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }, [all]);

  // подзаголовки («1 Цар 16–30», «Встречи, о которых говорит Писание») — не записи: в «ещё N …» не считаются
  const isSub = (it: Item) => /(^|\s)sub(\s|$)/.test(String((it.node.props as { class?: string }).class ?? ''));
  const hidden = items.slice(cut).filter((it) => !isSub(it)).length;
  // key — лицо и раздел: у другого лица тело раздела строится заново, а не перекраивается из прежнего. Перекройка
  // списков разного строения (у Моисея в § 12 группа «Дяди по матери: Гирсон и Мерари», у Давида на том же месте —
  // «Саул — тесть, отец Мелхолы») роняла Preact на insertBefore, и разделы с 12-го оставались от прежнего лица
  return (
    <div class="clamp" ref={box} key={sig}>
      {regroup(items.slice(0, cut))}
      {hidden > 0 && (
        <button
          type="button"
          class="more clamp-more"
          onClick={() => {
            focusFrom.current = cut;
            setOpen(sig);
          }}
        >
          {moreLabel(n, hidden)}
        </button>
      )}
    </div>
  );
}
