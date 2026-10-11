/**
 * Состояния ответа ядра (09 § 4.6): одним типом — загрузка, ошибка, пусто с причиной, неполно с охватом, не скачано для
 * работы без сети, готово. «Нет данных для инструмента» (01 § 2.3; 09 § 4.3) — вид «пусто» со стихом из записи
 * «нет сведений»: кнопка не прячется. Ядро без DOM; слова для читателя строит интерфейс по полям.
 */

export type State<T> =
  | { s: 'загрузка' }
  | { s: 'ошибка'; why: string; retry: true }
  | { s: 'пусто'; why: Empty }
  | { s: 'неполно'; data: T; cover: Cover }
  | { s: 'не скачано'; what: string }
  | { s: 'готово'; data: T };

/** Охват: «размечено книг 14 из 66». */
export interface Cover {
  have: number;
  of: number;
  unit: string;
}

/** Причина пустого ответа. */
export type Empty =
  /** Писание молчит или прямо говорит, что нет (запись «нет сведений»). */
  | { kind: 'нет сведений'; scripture: boolean; what?: string; refs: string[]; words?: { text: string; ref: string }[] }
  /** У предмета нет данных для инструмента, и записи «нет сведений» тоже нет (ещё не размечено). */
  | { kind: 'не размечено'; tool: string }
  /** Предмета нет: номер неизвестен или запись снята. */
  | { kind: 'нет записи'; id: string; reason?: string };

export const ready = <T>(data: T): State<T> => ({ s: 'готово', data });
export const failed = <T>(why: string): State<T> => ({ s: 'ошибка', why, retry: true });
export const empty = <T>(why: Empty): State<T> => ({ s: 'пусто', why });
