/**
 * Кегли холста (B2; VIS-27, VIS-29, MOB-42). Ступени те же, что у токенов CSS (src/styles/tokens.css):
 * Literata 16 и 14 (--t-body, --t-note), Jost 13/18 и 12/16 (--t-ui, --t-ui-s) и 11,5 — кегль только для холста (--t-map-s).
 * Всё, что небо, ярусы эпох и рамка пишут текстом, берёт кегль отсюда; разовых размеров на холсте нет.
 * На сенсорных экранах (pointer: coarse) подписи холста не мельче 12,5 px: их читают с расстояния вытянутой руки.
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

/** Кегль с нижней границей экрана: 11,5 px, на сенсорном — 12,5 px. */
export function mapSize(size: number, coarse: boolean): number {
  return Math.max(size, coarse ? T_MAP_TOUCH : T_MAP_S);
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
