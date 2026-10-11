/**
 * Бюджеты пакетов (09 § 5.3; 02 § 8.1; Р-11; К-9): у каждого пакета есть бюджет, пакет без бюджета — ошибка сборки.
 * Бюджет проверяется тем же сжатием, что отдаёт хранилище (по умолчанию brotli, `--compression gzip` — строже); gzip
 * пишется в опись как верхняя граница (09 § 5.3, рецензия данных № 17).
 */
import type { PackKind } from '../../core/types.ts';

export const KB = 1024;

export interface Budget {
  kind: PackKind;
  name: string;
  max: number;
  /** Обязательный пакет (09 § 5.4; 02 § 8.1 [4.2]; В-30). */
  required: boolean;
  /** Откуда число. */
  basis: string;
}

export const BUDGETS: Record<PackKind, Budget> = {
  'core-index': { kind: 'core-index', name: 'ядро индекса', max: 200 * KB, required: true, basis: '02 § 8.1; 09 § 5.3; В-30' },
  'tools-index': { kind: 'tools-index', name: 'указатель инструментов', max: 192 * KB, required: true, basis: '02 § 8.1; 09 § 5.3; В-30' },
  cards: { kind: 'cards', name: 'карточки, том', max: 64 * KB, required: false, basis: '02 § 8.1; 09 § 5.3' },
  text: { kind: 'text', name: 'текст книги', max: 96 * KB, required: false, basis: '02 § 8.1; 09 § 5.3' },
  stems: { kind: 'stems', name: 'таблица основ', max: 192 * KB, required: false, basis: '09 § 3.5 п. 2, § 5.3' },
  // 09 § 5.3: размер пакета Генеалогии решит П-Т4; членства (02 § 8.1 — «в пакете Генеалогии») сейчас около 16 КБ.
  // Предварительный бюджет — как у части по требованию; пересмотр — по П-Т4.
  genealogy: { kind: 'genealogy', name: 'Генеалогия (членства)', max: 96 * KB, required: false, basis: 'предварительно; 09 § 5.3 — по П-Т4' },
  // 06 § 9: 3 000–5 000 связей, около 0,1–0,15 МБ gzip, тома по книгам; бюджет тома 06 не назначает — предварительно как часть
  relations: { kind: 'relations', name: 'Связи, том', max: 96 * KB, required: false, basis: 'предварительно; 06 § 9 — тома по книгам' },
  tsk: { kind: 'tsk', name: 'параллельные места, часть', max: 96 * KB, required: false, basis: '02 § 8.1, Р-11' },
  changes: { kind: 'changes', name: 'журнал изменений выпуска', max: 64 * KB, required: false, basis: 'tools/base/bundle.ts' },
};

export interface Sized {
  kind: PackKind;
  file: string;
  size: number;
  gzip: number;
}

/** Пакеты сверх бюджета (по сжатию хранилища) и сверх бюджета по gzip (замечание: верхняя граница). */
export function overBudget(list: Sized[]): { over: Sized[]; gzipOver: Sized[] } {
  return {
    over: list.filter((p) => p.size > BUDGETS[p.kind].max),
    gzipOver: list.filter((p) => p.gzip > BUDGETS[p.kind].max),
  };
}
