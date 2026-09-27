import { useEffect } from 'preact/hooks';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { TopBar } from './top/TopBar.tsx';
import { bindAddress } from './address.ts';
import { bindKeys } from './keys.ts';

export function App() {
  useEffect(() => {
    const offAddress = bindAddress();
    const offKeys = bindKeys();
    return () => {
      offAddress();
      offKeys();
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
