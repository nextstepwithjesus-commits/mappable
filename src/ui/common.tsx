import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, loadVerses } from '../data/atlas.ts';
import { parseRef, verseId } from '../engine/books.ts';
import type { Sky } from '../render/sky.ts';
import type { Cert, Role } from '../data/types.ts';
import { selected, hovered, pickSecond } from '../state.ts';
import { typo } from './text/typo.ts';
import { inView, reduced } from './sky/view.ts';

export const skyRef: { current: Sky | null; redraw: () => void; flyTo: (id: string) => void } = {
  current: null,
  redraw: () => {},
  flyTo: () => {},
};
export const viewTick = signal(0);

export const ROLE_NAMES: Record<Role, [string, string]> = {
  patriarch: ['праотец', 'праматерь'],
  forefather: ['родоначальник', 'родоначальница'],
  matriarch: ['праматерь', 'праматерь'],
  king: ['царь', 'царица'],
  queen: ['царица', 'царица'],
  'queen-mother': ['царица-мать', 'царица-мать'],
  prince: ['царевич', 'царевна'],
  'high-priest': ['первосвященник', 'первосвященник'],
  priest: ['священник', 'священник'],
  levite: ['левит', 'левит'],
  prophet: ['пророк', 'пророчица'],
  judge: ['судья', 'судья'],
  apostle: ['апостол', 'апостол'],
  disciple: ['ученик', 'ученица'],
  commander: ['военачальник', 'военачальник'],
  official: ['сановник', 'сановница'],
  scribe: ['писец', 'писец'],
  musician: ['певец', 'певица'],
  craftsman: ['мастер', 'мастерица'],
  shepherd: ['пастух', 'пастушка'],
  'tribal-leader': ['князь колена', 'княгиня'],
  'foreign-ruler': ['иноземный правитель', 'иноземная правительница'],
  messiah: ['Мессия, Христос', 'Мессия'],
};

export function roleText(roles: Role[], sex: 'm' | 'f'): string {
  return roles.map((r) => ROLE_NAMES[r]?.[sex === 'f' ? 1 : 0] ?? r).join(', ');
}

/** Печать: в сборке для встраивания (vite build --mode artifact) рамка просмотра не открывает диалог печати. */
export const CAN_PRINT = import.meta.env.MODE !== 'artifact';

/** «1Цар 16:1-3» → «1 Цар 16:1–3»: неразрывные пробелы, «–» и U+2060 после него — той же typo(), что у всего текста. */
export function refLabel(ref: string): string {
  return typo(ref.replace(/^([1-4])(\S)/, '$1 $2'));
}

export const CERT_MARK: Record<Cert, string> = { scripture: '', inference: 'выв.', interpretation: 'толк.' };
export const CERT_FULL: Record<Cert, string> = {
  scripture: 'прямо сказано в Писании',
  inference: 'вывод из сопоставления стихов',
  interpretation: 'толкование: распространённое, но не единственное понимание',
};

export function Mark({ cert, calc }: { cert?: Cert; calc?: boolean }) {
  if (calc) return <abbr class="mark" title="год рассчитан хронологическим движком по выбранной модели">расч.</abbr>;
  if (!cert || cert === 'scripture') return null;
  return (
    <abbr class="mark" title={CERT_FULL[cert]}>
      {CERT_MARK[cert]}
    </abbr>
  );
}

/**
 * Звезда лица на виду: нарисована, доступна указателю и лежит в видимой части неба — не под панелью, ярусами,
 * листом карточки и органами неба (inView, src/ui/sky/view.ts).
 */
export function onScreen(id: string): boolean {
  const s = skyRef.current;
  return !!s && !!s.model && s.reachable(id) && inView(id);
}

/**
 * Одно правило для ссылки на лицо (D7; IX-47): лицо выбирается, а небо летит к нему, только если звезды нет на экране.
 * В режиме «Родство с…» или «Разворот с…» лицо становится вторым, первое остаётся (D6). Пока открыты «Родство»
 * или «Разворот», пара не меняется: её держит src/state.ts.
 */
export function goTo(id: string) {
  if (!byId.has(id)) return;
  if (hovered.peek() === id) hovered.value = null;
  if (pickSecond(id)) return;
  const visible = onScreen(id);
  selected.value = id;
  if (!visible) skyRef.flyTo(id);
}

/** Перелёт к окну, в котором видны все лица (отметки поиска «Все N на небе»): по годам и полосам, с полями. */
export function flyToIds(ids: string[]) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  const pts = ids.map((id) => ({ x: s.nodeX(id), n: s.node(id) })).filter((p): p is { x: number; n: NonNullable<typeof p.n> } => p.x !== null && !!p.n);
  if (!pts.length) return;
  const xs = pts.map((p) => p.x);
  const lanes = pts.map((p) => p.n.lane);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  // не уже 160 лет вокруг одиночного лица: иначе окно — одна звезда без соседей
  const minW = Math.abs(s.xOf(s.tOf(x0) + 160) - x0);
  const w = Math.max(minW, (x1 - x0) * 1.2);
  s.cam.flyTo((x0 + x1) / 2, (Math.min(...lanes) + Math.max(...lanes)) / 2, w, skyRef.redraw, reduced());
  skyRef.redraw();
}

/** Ссылка, которая сейчас подсвечивает звезду наведением: при уходе ссылки из разметки подсветка снимается. */
let hoverLink: HTMLElement | null = null;
const hoverOff = (el: HTMLElement | null) => {
  if (!el || hoverLink !== el) return;
  hoverLink = null;
  hovered.value = null;
};

/** Ссылка на лицо: выбрать и показать на небе по одному правилу (goTo); наведение и фокус подсвечивают звезду. */
export function P({ id, children }: { id: string; children?: ComponentChildren }) {
  const p = byId.get(id);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => () => hoverOff(ref.current), []);
  if (!p) return <span>{children ?? id}</span>;
  const on = (e: Event) => {
    hoverLink = e.currentTarget as HTMLElement;
    hovered.value = id;
  };
  const off = (e: Event) => hoverOff(e.currentTarget as HTMLElement);
  return (
    <button ref={ref} class="person" data-id={id} onClick={() => goTo(id)} onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}>
      {children ?? p.name}
    </button>
  );
}

const openRef = signal<string | null>(null);

/** Ссылки на стихи; раскрываются вклейкой под абзацем (до 3 стихов). */
const bookPart = (ref: string) => /^([1-4]?\s?[^\d\s]+)\s*(\d.*)$/.exec(ref);

/** Сколько ссылок видно сразу; остальные раскрывает «ещё N мест» (B4, CARD-32). */
export const REFS_SHOWN = 3;

/**
 * Ссылки подряд: «Быт 11:26; 17:5; 1 Пар 1:27» — книга не повторяется, если та же, что у предыдущей.
 * Каждая ссылка — вместе со своим разделителем в неразрывном блоке `.nobr`: кнопка ссылки — строчный блок, перед ним
 * и после него браузер может перенести строку даже у неразрывного пробела, и без обёртки «;» уходил в начало строки.
 * Больше трёх ссылок — первые три и команда «ещё 2 места», раскрывающая остальные.
 * tail — знак, который идёт в тексте сразу за ссылками («…2 Цар 5:4–5; 1010–1003 гг.»): он держится за последнюю ссылку.
 */
export function Refs({ refs, owner, tail, max = REFS_SHOWN }: { refs?: string[]; owner: string; tail?: string; max?: number }) {
  // раскрыт список именно этих ссылок: при переходе к другому лицу тот же компонент показывает новые ссылки свёрнутыми
  const [openFor, setOpenFor] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const focusAt = useRef<number | null>(null);
  const sig = `${owner}|${(refs ?? []).join('|')}`;
  const all = openFor === sig;
  useEffect(() => {
    // после «ещё N мест» фокус переходит на первую раскрытую ссылку, а не теряется вместе с исчезнувшей командой
    if (!all || focusAt.current === null) return;
    box.current?.querySelectorAll<HTMLButtonElement>('button.ref')[focusAt.current]?.focus();
    focusAt.current = null;
  }, [all]);
  if (!refs || !refs.length) return tail ? <>{tail}</> : null;
  const cut = !all && refs.length > max;
  const shown = cut ? refs.slice(0, max) : refs;
  const rest = refs.length - shown.length;
  return (
    <span class="refs" ref={box}>
      {shown.map((r, i) => {
        const key = `${owner}|${r}`;
        const cur = bookPart(r);
        const prev = i > 0 ? bookPart(refs[i - 1]) : null;
        const short = cur && prev && cur[1].replace(/\s/g, '') === prev[1].replace(/\s/g, '');
        const full = refLabel(r);
        const last = i === shown.length - 1;
        const sep = !last || cut ? ';' : tail;
        return (
          <Fragment key={r}>
            <span class="nobr">
              <button
                class="ref"
                aria-label={short ? full : undefined}
                aria-expanded={openRef.value === key}
                onClick={() => (openRef.value = openRef.value === key ? null : key)}
              >
                {short ? typo(cur![2]) : full}
              </button>
              {sep ? <span class="refsep">{sep}</span> : null}
            </span>
            {!last || cut ? ' ' : null}
          </Fragment>
        );
      })}
      {cut ? (
        <span class="nobr">
          <button
            class="more"
            onClick={() => {
              focusAt.current = max;
              setOpenFor(sig);
            }}
          >
            ещё{'\u00a0'}{rest}{'\u00a0'}{plural(rest, 'место', 'места', 'мест')}
          </button>
          {tail ? <span class="refsep">{tail}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export function VerseInsert({ owner, refs }: { owner: string; refs?: string[] }) {
  const key = openRef.value;
  const r = key && key.startsWith(`${owner}|`) ? key.slice(owner.length + 1) : null;
  if (!r || !refs?.includes(r)) return null;
  return <Verses refText={r} />;
}

export function Verses({ refText, max = 3 }: { refText: string; max?: number }) {
  const [text, setText] = useState<{ n: string; t: string }[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const p = parseRef(refText);
    if (!p) return;
    let alive = true;
    loadVerses(p.book).then((vs) => {
      if (!alive) return;
      setText(p.verses.map((v) => ({ n: `${v.chapter}:${v.verse}`, t: vs[verseId(v).slice(p.book.length + 1)] ?? '' })).filter((x) => x.t));
    });
    return () => {
      alive = false;
    };
  }, [refText]);
  if (!text) return <div class="verses muted">…</div>;
  if (!text.length) return <div class="verses muted">Текст стиха не включён в издание.</div>;
  const shown = all ? text : text.slice(0, max);
  return (
    <div class="verses" lang="ru">
      {shown.map((v) => (
        <span key={v.n}>
          <sup>{v.n}</sup>
          {renderBrackets(v.t)}{' '}
        </span>
      ))}
      {!all && text.length > max && (
        <button class="more" onClick={() => setAll(true)}>
          ещё{'\u00a0'}{text.length - max}{'\u00a0'}{plural(text.length - max, 'стих', 'стиха', 'стихов')}
        </button>
      )}
    </div>
  );
}

/** Вставки в [скобках] Синодального текста — бледнее, с пояснением. */
export function renderBrackets(t: string) {
  const parts = t.split(/(\[[^\]]*\])/g);
  return parts.map((s, i) =>
    s.startsWith('[') ? (
      <span class="br" title="вставка в скобках Синодального текста (по греческому переводу)" key={i}>
        {s}
      </span>
    ) : (
      s
    ),
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** Микрошкала жизни: волосяная линия от сотворения до 2040 с отрезком жизни лица. */
export function drawMicroAxis(canvas: HTMLCanvasElement, b: number, e: number, colors: { ink: string; ink3: string }) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 120;
  const h = canvas.clientHeight || 12;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t0 = -4173;
  const t1 = 2040;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  ctx.strokeStyle = colors.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + 0.5);
  ctx.lineTo(w, h / 2 + 0.5);
  ctx.stroke();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x(b), h / 2 + 0.5);
  ctx.lineTo(Math.max(x(b) + 2, x(e)), h / 2 + 0.5);
  ctx.stroke();
}

export { verseId };
