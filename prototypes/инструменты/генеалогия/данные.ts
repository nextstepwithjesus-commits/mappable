/**
 * Данные экрана Генеалогии: граф и лес строятся один раз после загрузки пакета Генеалогии (в браузере, главный поток:
 * лес — около 10 мс, П-Т1). Экран читает сигнал `генеалогияГотова`.
 */
import { signal } from '@preact/signals';
import { Д, загрузитьГенеалогию } from '../общее/данные.ts';
import { Граф, type ДопПакет } from './граф.ts';
import { построитьЛес, type Лес } from './лес.ts';

export const генеалогияГотова = signal(0);
export const ошибкаГенеалогии = signal<string | null>(null);
export let Г: Граф;
export let Л: Лес;
export const замеры: Record<string, number> = {};

let ждём: Promise<void> | null = null;
export function начатьГенеалогию(): Promise<void> {
  ждём ??= (async () => {
    const t0 = performance.now();
    try {
      const { gen, доп } = await загрузитьГенеалогию();
      const t1 = performance.now();
      Г = new Граф(Д.core, Д.tools, gen, доп as ДопПакет);
      Л = построитьЛес(Г);
      замеры.загрузка = t1 - t0;
      замеры.лес = performance.now() - t1;
      генеалогияГотова.value++;
    } catch (e) {
      ошибкаГенеалогии.value = `Не получилось открыть данные Генеалогии: ${(e as Error).message}`;
    }
  })();
  return ждём;
}
