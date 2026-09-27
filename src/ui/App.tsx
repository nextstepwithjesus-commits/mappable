import { useEffect } from 'preact/hooks';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { TopBar } from './top/TopBar.tsx';
import { bindAddress } from './address.ts';
import { bindKeys } from './keys.ts';
import { bindFocus } from './focus.ts';
import { grid, viewportWidth } from './layout.ts';

export function App() {
  useEffect(() => {
    const offAddress = bindAddress();
    const offKeys = bindKeys();
    const offFocus = bindFocus();
    const onResize = () => (viewportWidth.value = window.innerWidth);
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      offAddress();
      offKeys();
      offFocus();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const g = grid.value;

  // Сетка [панель][небо][карточка] (C1): ширину колонки панели считает layout.ts; карточка — своей шириной
  // из tokens.css (--folio-w) или корешком. Панель в разметке — сразу после верхней строки: к ней ближе с клавиатуры (I2).
  // Небо — основная область страницы (main, I3; MOB-37): main не занимает ячейку сетки (display: contents, panels.css),
  // его ячейку занимает небо; карточка — дополнение (aside), панель — область со своим заголовком.
  // Фокус при открытии и закрытии панелей и карточки и модальный лист панели на телефоне — src/ui/focus.ts.
  return (
    <div class={g.spine ? 'app spine' : 'app'} style={{ '--sheet-w': `${g.sheet}px` }}>
      <TopBar />
      <Panels />
      <main class="app-main">
        <h1 class="visually-hidden">Толедот — звёздный атлас библейских родословий</h1>
        <SkyView />
      </main>
      <Folio />
      <TimeStrip />
    </div>
  );
}
