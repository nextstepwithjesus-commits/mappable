import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, loadVerses } from '../data/atlas.ts';
import { parseRef, verseId } from '../engine/books.ts';
import type { Sky } from '../render/sky.ts';
import type { Cert, Role } from '../data/types.ts';
import { selected } from '../state.ts';

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

/** «1Цар 16:1» → «1 Цар 16:1» с неразрывными пробелами. */
export function refLabel(ref: string): string {
  return ref.replace(/^([1-4])(\S)/, '$1 $2').replace(/ (\d)/, ' $1').replace(/-/g, '–');
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

/** Ссылка на лицо: переход по щелчку. */
export function P({ id, children }: { id: string; children?: ComponentChildren }) {
  const p = byId.get(id);
  if (!p) return <span>{children ?? id}</span>;
  return (
    <button
      class="person"
      onClick={() => {
        selected.value = id;
        skyRef.flyTo(id);
      }}
    >
      {children ?? p.name}
    </button>
  );
}

const openRef = signal<string | null>(null);

/** Ссылки на стихи; раскрываются вклейкой под абзацем (до 3 стихов). */
const bookPart = (ref: string) => /^([1-4]?\s?[^\d\s]+)\s*(\d.*)$/.exec(ref);

/** Ссылки подряд: «Быт 11:26; 17:5; 1 Пар 1:27» — книга не повторяется, если та же, что у предыдущей. */
export function Refs({ refs, owner }: { refs?: string[]; owner: string }) {
  if (!refs || !refs.length) return null;
  return (
    <span class="refs">
      {refs.map((r, i) => {
        const key = `${owner}|${r}`;
        const cur = bookPart(r);
        const prev = i > 0 ? bookPart(refs[i - 1]) : null;
        const short = cur && prev && cur[1].replace(/\s/g, '') === prev[1].replace(/\s/g, '');
        const full = refLabel(r);
        return (
          <Fragment key={r}>
            {i > 0 && <span class="refsep">; </span>}
            <button
              class="ref"
              aria-label={short ? full : undefined}
              aria-expanded={openRef.value === key}
              onClick={() => (openRef.value = openRef.value === key ? null : key)}
            >
              {short ? cur![2].replace(/-/g, '–') : full}
            </button>
          </Fragment>
        );
      })}
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
          ещё {text.length - max} {plural(text.length - max, 'стих', 'стиха', 'стихов')}
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
