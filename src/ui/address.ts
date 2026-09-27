/**
 * Адрес страницы ↔ состояние атласа (ТЗ § 3.7, глубокие ссылки). Сейчас в адресе — выбранное лицо;
 * окно неба, панель, режимы и модель — задача D8.
 */
import { effect } from '@preact/signals';
import { selected, readHash, writeHash } from '../state.ts';
import { skyRef } from './common.tsx';

/** Подключить адрес: прочитать его сейчас и при «назад»/«вперёд», записывать при смене выбора. Возвращает отписку. */
export function bindAddress(): () => void {
  const apply = () => {
    const h = readHash();
    // переход на образец: выбор не сбрасывать, иначе writeHash вернёт адрес «#/» раньше, чем main.tsx сменит маршрут
    if (h.route === 'specimen') return;
    if (h.id && h.id !== selected.value) {
      selected.value = h.id;
      setTimeout(() => skyRef.flyTo(h.id!), 50);
    }
    if (!h.id && selected.value) selected.value = null;
  };
  apply();
  window.addEventListener('popstate', apply);
  const off = effect(() => writeHash(selected.value));
  return () => {
    window.removeEventListener('popstate', apply);
    off();
  };
}
