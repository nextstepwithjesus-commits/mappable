/**
 * Образы лиц на карточках (решение 74; владелец: «когда карточки персонализированы, пользователю легче различать
 * информацию в большой генеалогии»).
 *
 *  — Сейчас — условные силуэты головы и плеч, два тона, без черт лица, в палитре атласа (tree.css, .av): фон —
 *    глубина неба, голова и плечи — светлее, волосы, покров и борода — тоном туманности. Вариант силуэта — по id
 *    (у лица всегда один и тот же): мужских пять (короткие волосы, кудри, борода, покров, седая борода), женских
 *    четыре (длинные волосы, покрывало, собранные волосы, волосы до плеч).
 *  — Особые: у Иисуса Христа вместо силуэта — восьмилучевая звезда (ТЗ § 3.1; Откр 22:16); народ и род — группа из трёх
 *    малых силуэтов; неназванное лицо — пунктирный контур; союз — два малых силуэта по полу супругов; «другие сыновья
 *    и дочери» — группа пунктиром.
 *  — Изображения потом: файл src/assets/portraits/<id>.webp (.jpg, .png) подхватывается сборкой сам и показывается
 *    вместо силуэта с пометой «худож.»: «Художественная интерпретация создателей приложения, не изображение из
 *    Писания». Без файлов всё работает на силуэтах.
 *
 * Силуэт не несёт фактов: для диктора он — украшение (aria-hidden); изображение — с пометой и для диктора.
 */
import type { ComponentChildren } from 'preact';
import type { Sex } from '../../data/types.ts';
import { byId } from '../../data/atlas.ts';
import '../../styles/tree.css';

// ---------- изображения (потом): src/assets/portraits/<id>.webp ----------

const PORTRAIT_FILES = import.meta.glob('/src/assets/portraits/*.{webp,jpg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** Помета изображения — видимая и для диктора. */
export const PORTRAIT_MARK = 'худож.';
export const PORTRAIT_NOTE = 'Художественная интерпретация создателей приложения, не изображение из Писания';
/** Изображение лица id, если его файл положен в src/assets/portraits/; иначе null. */
export function portraitOf(id: string): string | null {
  for (const ext of ['webp', 'jpg', 'png']) {
    const url = PORTRAIT_FILES[`/src/assets/portraits/${id}.${ext}`];
    if (url) return url;
  }
  return null;
}

// ---------- варианты силуэтов ----------

/** Мужские силуэты: короткие волосы, кудри, борода, покров на голове, седая борода. */
export const MALE_VARIANTS = ['short', 'curly', 'beard', 'cover', 'elder'] as const;
/** Женские силуэты: длинные волосы, покрывало, собранные волосы, волосы до плеч. */
export const FEMALE_VARIANTS = ['long', 'veil', 'bun', 'bob'] as const;
export type Variant = (typeof MALE_VARIANTS)[number] | (typeof FEMALE_VARIANTS)[number];

/** Хеш строки (FNV-1a, 32 бита): вариант лица не меняется между выпусками и сеансами. */
export function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** Вариант силуэта лица: по полу и хешу id. */
export function variantOf(id: string, sex: Sex): Variant {
  const vs = sex === 'f' ? FEMALE_VARIANTS : MALE_VARIANTS;
  return vs[hashId(id) % vs.length];
}

/** Что показывает образ лица: изображение, звезду, группу (народ, род) или силуэт. */
export type Look = { kind: 'portrait'; url: string } | { kind: 'star' } | { kind: 'group' } | { kind: 'figure'; sex: Sex; variant: Variant };
export function lookOf(id: string): Look {
  const url = portraitOf(id);
  if (url) return { kind: 'portrait', url };
  if (id === 'iisus') return { kind: 'star' };
  const p = byId.get(id);
  if (p && (p.kind === 'people' || p.kind === 'clan' || p.kind === 'founder')) return { kind: 'group' };
  const sex = p?.sex ?? 'm';
  return { kind: 'figure', sex, variant: variantOf(id, sex) };
}

// ---------- рисунок: поле 64 × 64 ----------

const HEAD = { cx: 32, cy: 26, rx: 10.5, ry: 12.5 };
const BODY = 'M6 64 C7 53 17 47.5 32 47.5 C47 47.5 57 53 58 64 Z';
const NECK = 'M27 35 L37 35 L38.5 49 L25.5 49 Z';
const FACE_HOLE = 'M32 17 C27.3 17 23.5 21.7 23.5 27.5 C23.5 33.3 27.3 38 32 38 C36.7 38 40.5 33.3 40.5 27.5 C40.5 21.7 36.7 17 32 17 Z';
const SHORT = 'M21.2 25 C20.4 16.5 24.8 11.2 32 11.2 C38.6 11.2 43.6 15.6 42.8 25 C42 21.5 41 19.4 39.2 18.2 C35.5 19.4 29.5 18.6 25.8 16.6 C23.6 18.2 22 21 21.2 25 Z';

/** Волосы и покров позади головы (рисуются до плеч и головы). */
function behind(v: Variant) {
  switch (v) {
    case 'long':
      return <path class="h" d="M19.5 28 C19 14 25 9.5 32 9.5 C39 9.5 45 14 44.5 28 C44.5 38 46 46 48 52 L16 52 C18 46 19.5 38 19.5 28 Z" />;
    case 'bob':
      return <path class="h" d="M19.8 27 C19.5 14.5 25 10 32 10 C39 10 44.5 14.5 44.2 27 C44 33 45 38 46.5 42 C43 43.5 40 42.5 39 41 L25 41 C24 42.5 21 43.5 17.5 42 C19 38 20 33 19.8 27 Z" />;
    case 'bun':
      return <circle class="h" cx="32" cy="10.5" r="6" />;
    default:
      return null;
  }
}
/** Волосы, борода, покров поверх головы. */
function over(v: Variant) {
  switch (v) {
    case 'short':
      return <path class="h" d={SHORT} />;
    case 'curly':
      return (
        <>
          <path class="h" d="M21.6 26 C21 18.5 25.5 14.5 32 14.5 C38.5 14.5 43 18.5 42.4 26 C40.5 22 37 20.5 32 20.5 C27 20.5 23.5 22 21.6 26 Z" />
          {[
            [22, 22.5, 4],
            [23.5, 17, 4.4],
            [27.5, 13, 4.6],
            [32.5, 11.6, 4.8],
            [37.5, 13.2, 4.6],
            [41, 17.2, 4.4],
            [42.3, 22.5, 4],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}`} class="h" cx={cx} cy={cy} r={r} />
          ))}
        </>
      );
    case 'beard':
      return (
        <>
          <path class="h" d={SHORT} />
          <path class="h" d="M21.8 26 C21.8 37 26 44 32 44 C38 44 42.2 37 42.2 26 C41 30.5 39 33 36.5 33.6 C34.8 32.6 29.2 32.6 27.5 33.6 C25 33 23 30.5 21.8 26 Z" />
        </>
      );
    case 'cover':
      // покров на голове до плеч с повязкой; лицо — просвет
      return (
        <>
          <path class="h" fill-rule="evenodd" d={`M18.5 50 L19.3 28 C19.3 15 25 9 32 9 C39 9 44.7 15 44.7 28 L45.5 50 C42 48.5 40 46 40 43 L24 43 C24 46 22 48.5 18.5 50 Z ${FACE_HOLE}`} />
          <path class="b" d="M19.6 17.8 C25 14.6 39 14.6 44.4 17.8 L44.6 20.4 C39 17.4 25 17.4 19.4 20.4 Z" />
        </>
      );
    case 'elder':
      return (
        <>
          <path class="h" d="M21 25 C20.6 19.5 23 16.5 26 15.8 C24.3 19 23.6 22 23.6 26.5 Z" />
          <path class="h" d="M43 25 C43.4 19.5 41 16.5 38 15.8 C39.7 19 40.4 22 40.4 26.5 Z" />
          <path class="h" d="M21.5 27 C21.5 42 26 52.5 32 55 C38 52.5 42.5 42 42.5 27 C40.5 33.5 37 36 32 36 C27 36 23.5 33.5 21.5 27 Z" />
        </>
      );
    case 'long':
      return (
        <>
          <path class="h" d="M21.5 25 C22 15.5 27 12.5 32 12.5 C37.5 12.5 42 16 42.5 25 C39 19.5 33 17.5 27 19.5 C24.5 20.5 22.5 22.5 21.5 25 Z" />
          <path class="h" d="M21 30 C20.5 40 19 48 15.5 58 L22.5 58 C24 50 24.5 42 23.8 33 Z" />
        </>
      );
    case 'veil':
      return <path class="h" fill-rule="evenodd" d={`M13 64 C14 52 17.5 42 19.3 28 C19.8 15 25.5 8.5 32 8.5 C38.5 8.5 44.2 15 44.7 28 C46.5 42 50 52 51 64 Z ${FACE_HOLE}`} />;
    case 'bun':
      return <path class="h" d="M21.3 26 C20.5 16 25.5 12.5 32 12.5 C38.5 12.5 43.5 16 42.7 26 C41 20.5 37.5 18.5 32 18.5 C26.5 18.5 23 20.5 21.3 26 Z" />;
    case 'bob':
      return <path class="h" d="M21.4 26 C21.5 16.5 26 12.8 32 12.8 C38 12.8 42.5 16.5 42.6 26 C40 21.5 36.5 19.5 31 19.8 C26.5 20 23 22.5 21.4 26 Z" />;
  }
}

/** Силуэт в поле 64 × 64: плечи, шея, голова, волосы; dashed — пунктирный контур (лицо не названо). */
export function Figure({ variant, dashed = false }: { variant: Variant; dashed?: boolean }) {
  if (dashed)
    return (
      <g class="d">
        <path d={BODY} />
        <ellipse {...HEAD} />
      </g>
    );
  return (
    <g>
      {behind(variant)}
      <path class="b" d={BODY} />
      <path class="b" d={NECK} />
      <ellipse class="b" {...HEAD} />
      {over(variant)}
    </g>
  );
}

/** Восьмилучевая звезда (Иисус Христос; ТЗ § 3.1) в поле 64 × 64 — цветом света. */
export function Star8Figure() {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 7.5 : 21;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${(32 + r * Math.cos(a)).toFixed(2)},${(32 + r * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon class="s" points={pts.join(' ')} />;
}

/** Группа из трёх малых силуэтов (народ, род; «другие сыновья и дочери» — пунктиром). */
export function GroupFigure({ dashed = false, seed = 'group' }: { dashed?: boolean; seed?: string }) {
  const h = hashId(seed);
  const vs: Variant[] = [MALE_VARIANTS[h % 5], FEMALE_VARIANTS[(h >> 3) % 4], MALE_VARIANTS[(h >> 6) % 5]];
  return (
    <>
      <g transform="translate(15.5 4) scale(0.52)">
        <Figure variant={vs[1]} dashed={dashed} />
      </g>
      <g transform="translate(-1 20) scale(0.56)">
        <Figure variant={vs[0]} dashed={dashed} />
      </g>
      <g transform="translate(29 20) scale(0.56)">
        <Figure variant={vs[2]} dashed={dashed} />
      </g>
    </>
  );
}

// ---------- образы на карточках ----------

function Frame({ size, cls, children, label }: { size: number; cls?: string; children: ComponentChildren; label?: string }) {
  return (
    <svg class={['av', cls].filter(Boolean).join(' ')} viewBox="0 0 64 64" width={size} height={size} aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

/** Образ лица id: изображение (если положено), звезда Иисуса Христа, группа народа или рода, силуэт. */
export function Avatar({ id, size }: { id: string; size: number }) {
  const look = lookOf(id);
  if (look.kind === 'portrait')
    return (
      <span class="av av-img" role="img" aria-label={PORTRAIT_NOTE} title={PORTRAIT_NOTE} style={{ width: `${size}px`, height: `${size}px` }}>
        <img src={look.url} alt="" width={size} height={size} />
        <span class="av-mark" aria-hidden="true">
          {PORTRAIT_MARK}
        </span>
      </span>
    );
  return <Frame size={size}>{look.kind === 'star' ? <Star8Figure /> : look.kind === 'group' ? <GroupFigure seed={id} /> : <Figure variant={look.variant} />}</Frame>;
}

/** Пустое место союза: пунктирный силуэт. */
export function UnnamedAvatar({ size }: { size: number }) {
  return (
    <Frame size={size} cls="av-empty">
      <g transform="translate(0 2)">
        <Figure variant="short" dashed />
      </g>
    </Frame>
  );
}

/** «Другие сыновья и дочери»: группа пунктиром. */
export function OthersAvatar({ size }: { size: number }) {
  return (
    <Frame size={size} cls="av-empty">
      <GroupFigure dashed />
    </Frame>
  );
}

/** Два малых силуэта союза по полу супругов; неназванный — пунктиром. a — муж или отец, b — жена или мать. */
export function UnionAvatar({ a, b, size }: { a: string | null; b: string | null; size: number }) {
  const one = (id: string | null, sex: Sex) => (id ? (lookOf(id).kind === 'star' ? null : <Figure variant={variantOf(id, byId.get(id)?.sex ?? sex)} />) : <Figure variant="short" dashed />);
  return (
    <Frame size={size}>
      <g transform="translate(-3 14) scale(0.66)">{one(a, 'm')}</g>
      <g transform="translate(24 14) scale(0.66)">{one(b, 'f')}</g>
    </Frame>
  );
}

/**
 * Образец для «Условных знаков» (решение 74): силуэт варианта variant, звезда ('star'), группа ('group') или пунктирный
 * силуэт ('empty'), в том же квадрате, что на карточках.
 */
export function AvatarSample({ look, size }: { look: Variant | 'star' | 'group' | 'empty' | 'others'; size: number }) {
  if (look === 'empty') return <UnnamedAvatar size={size} />;
  if (look === 'others') return <OthersAvatar size={size} />;
  return <Frame size={size}>{look === 'star' ? <Star8Figure /> : look === 'group' ? <GroupFigure /> : <Figure variant={look} />}</Frame>;
}
