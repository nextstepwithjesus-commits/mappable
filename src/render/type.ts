/**
 * Кегли холста (B2; VIS-27, VIS-29, MOB-42). Ступени те же, что у токенов CSS (src/styles/tokens.css):
 * Literata 16 и 14 (--t-body, --t-note), Jost 13/18 и 12/16 (--t-ui, --t-ui-s) и 11,5 — кегль только для холста (--t-map-s).
 * Всё, что небо, ярусы эпох и рамка пишут текстом, берёт кегль отсюда; разовых размеров на холсте нет.
 * На сенсорных экранах (pointer: coarse) подписи холста не мельче 12,5 px: их читают с расстояния вытянутой руки.
 * Кегли холста следуют размеру шрифта браузера (решение 57; MOB-42, WCAG 1.4.4): ступень × корневой кегль / 16, не больше
 * ×1,5 и не мельче ступени. Сменился корневой кегль — небо заново замеряет и отбирает подписи (textScale, watchTextScale).
 */
export const FONT_SERIF = "'Literata Variable', Literata, Georgia, serif";
export const FONT_SANS = "'Jost Variable', Jost, sans-serif";

/** --t-body: имена звёзд величины 0. */
export const T_BODY = 16;
/** --t-note: имена величин 1–2; пояснение на пустом небе после канона. */
export const T_NOTE = 14;
/** --t-ui (Jost 13/18): колонтитул, указатели на лица за краем, имя выбранного лица под ярусами. */
export const T_UI = 13;
/** --t-ui-s (Jost 12/16): имена величин 4–5, черты «завершение канона» и «сегодня». */
export const T_UI_S = 12;
/** --t-map-s: самый мелкий кегль холста — годы на кромке, буквы полос, масштаб, созвездия, ярусы, имена величины 6. */
export const T_MAP_S = 11.5;
/** Нижняя граница кегля холста на сенсорном экране. */
export const T_MAP_TOUCH = 12.5;

/** Имена звёзд по величине 0…6: ступени той же шкалы; величину различают ещё и начертанием. */
export const NAME_SIZE: readonly number[] = [T_BODY, T_NOTE, T_NOTE, T_UI, T_UI_S, T_UI_S, T_MAP_S];
export const NAME_WEIGHT: readonly number[] = [620, 560, 520, 470, 430, 420, 400];

/** Ступени по убыванию: сокращение роли набирается на ступень мельче имени. */
const STEPS = [T_BODY, T_NOTE, T_UI, T_UI_S, T_MAP_S];

/** Экран с грубым указателем (палец): кегли холста крупнее. Вне браузера — нет. */
export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

// ---------- кегль браузера (решение 57; MOB-42) ----------

/** Наибольший коэффициент кегля холста: при корневом кегле 24 px и крупнее подписи холста — ×1,5. */
export const TEXT_SCALE_MAX = 1.5;

/**
 * Коэффициент кегля холста по корневому кеглю страницы (px): кегль / 16 в пределах 1…1,5. Мельче 16 px холст не мельчает:
 * его ступени — наименьшие читаемые; неизвестный кегль (вне браузера) — 1.
 */
export function textScaleFor(rootPx: number): number {
  if (!Number.isFinite(rootPx) || rootPx <= 0) return 1;
  return Math.min(TEXT_SCALE_MAX, Math.max(1, rootPx / 16));
}

/** Корневой кегль страницы: html { font-size: var(--t-body) } = 1rem — размер шрифта, заданный в браузере. */
function rootFontPx(): number {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function' || !document.documentElement) return NaN;
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize);
  } catch {
    return NaN;
  }
}

let scale: number | null = null;
const listeners = new Set<(k: number) => void>();

/**
 * Текущий коэффициент кегля холста. Читается один раз (замер корневого кегля — не в каждом кадре); смену кегля
 * в настройках браузера ловит наблюдатель за образцом шириной 1rem (watch).
 */
export function textScale(): number {
  if (scale === null) {
    scale = textScaleFor(rootFontPx());
    watch();
  }
  return scale;
}

/**
 * Задать коэффициент (смена корневого кегля; тесты). Если он изменился — сообщить подписчикам и небу: событие
 * «loadingdone» набора шрифтов документа — то же, что после догрузки шрифта: небо сбрасывает замеры и пороги подписей
 * и перерисовывается (src/render/sky.ts, конструктор Sky).
 */
export function setTextScale(k: number) {
  const next = Math.min(TEXT_SCALE_MAX, Math.max(1, k));
  if (next === scale) return;
  scale = next;
  for (const fn of listeners) fn(next);
  const fonts = typeof document !== 'undefined' ? (document as { fonts?: EventTarget }).fonts : undefined;
  if (fonts && typeof Event === 'function') fonts.dispatchEvent(new Event('loadingdone'));
}

/** Подписаться на смену коэффициента кегля холста; возвращает отписку. */
export function watchTextScale(fn: (k: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let watching = false;
/** Образец шириной 1rem: его ширина меняется вместе с корневым кеглем — коэффициент пересчитывается. */
function watch() {
  if (watching || typeof document === 'undefined' || typeof ResizeObserver !== 'function' || !document.body) return;
  watching = true;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.className = 'rem-probe';
  document.body.appendChild(probe);
  new ResizeObserver(() => setTextScale(textScaleFor(rootFontPx()))).observe(probe);
}

/** Кегль с нижней границей экрана: ступень × коэффициент кегля браузера, не мельче 11,5 px, на сенсорном — 12,5 px. */
export function mapSize(size: number, coarse: boolean): number {
  return Math.max(size * textScale(), coarse ? T_MAP_TOUCH : T_MAP_S);
}

/** Строка ctx.font для кегля шкалы. */
export function mapFont(size: number, o: { sans?: boolean; weight?: number; italic?: boolean; coarse: boolean }): string {
  return `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${mapSize(size, o.coarse)}px ${o.sans ? FONT_SANS : FONT_SERIF}`;
}

const mag = (m: number) => Math.max(0, Math.min(6, Math.round(m)));

/** Кегль имени звезды величины m. */
export function nameSize(m: number, coarse: boolean): number {
  return mapSize(NAME_SIZE[mag(m)], coarse);
}

/** Шрифт имени звезды величины m. */
export function nameFont(m: number, coarse: boolean): string {
  return `${NAME_WEIGHT[mag(m)]} ${nameSize(m, coarse)}px ${FONT_SERIF}`;
}

/**
 * Шрифт имени звезды с отличиями: italic — лицо «время не установлено» (MAP-52); light — погашенная выделением подпись
 * без полужирного (MOB-41); size — ступень шкалы вместо кегля величины (подписи лиц линий в режиме «только линии»).
 */
export function nameFontWith(m: number, coarse: boolean, o: { italic?: boolean; light?: boolean; size?: number } = {}): string {
  const size = o.size ? mapSize(o.size, coarse) : nameSize(m, coarse);
  return `${o.italic ? 'italic ' : ''}${o.light ? 400 : NAME_WEIGHT[mag(m)]} ${size}px ${FONT_SERIF}`;
}

/** Шрифт сокращения роли после имени («ц.», «пр.»): курсив на ступень мельче имени. */
export function siglaFont(m: number, coarse: boolean): string {
  const s = NAME_SIZE[mag(m)];
  const below = STEPS.find((x) => x < s) ?? T_MAP_S;
  return `italic 400 ${mapSize(below, coarse)}px ${FONT_SERIF}`;
}

/** Все кегли, которые холст может использовать: для образца и проверки шкалы. */
export const CANVAS_SIZES: readonly number[] = [T_BODY, T_NOTE, T_UI, T_UI_S, T_MAP_S];
