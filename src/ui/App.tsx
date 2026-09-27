import { useEffect } from 'preact/hooks';
import { effect } from '@preact/signals';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { panel, selected, readHash, writeHash, second, pickMode, pins, clearPair } from '../state.ts';
import { skyRef } from './common.tsx';
import { TopBar } from './top/TopBar.tsx';

export function App() {
  useEffect(() => {
    // адрес → состояние
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
    const onKey = (e: KeyboardEvent) => {
      // в поле ввода клавиши принадлежат полю: Escape там не закрывает ни панель, ни карточку (IX-14)
      const typing = isTextField(e.target);
      if (e.code === 'Slash' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('find')?.focus();
      }
      // поле без своего Escape: нажатие только уводит из поля, следующее уже снимает состояние
      if (e.code === 'Escape' && typing && !e.defaultPrevented) (e.target as HTMLElement).blur();
      if (e.code === 'Escape' && !typing && !e.defaultPrevented) {
        // каждое нажатие снимает одно видимое состояние, по порядку (D5)
        if (pickMode.value) pickMode.value = null;
        else if (panel.value) panel.value = null;
        else if (pins.value.length) pins.value = [];
        else if (second.value) clearPair();
        else if (selected.value) selected.value = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', apply);
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);

  return (
    <div class="app">
      <TopBar />
      <SkyView />
      <Folio />
      <TimeStrip />
      <Panels />
    </div>
  );
}

/** Поле, в котором набирают текст (не флажок и не кнопка). */
function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t.type);
}
