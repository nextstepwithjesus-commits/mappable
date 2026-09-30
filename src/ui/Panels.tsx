/** Панели атласа: каждая — в своём файле src/ui/panels/*.tsx. */
import { useEffect } from 'preact/hooks';
import { panel, selected } from '../state.ts';
import { grid } from './layout.ts';
import { keepInView } from './sky/view.ts';
import { Spread } from './Spread.tsx';
import { EpochsPanel } from './panels/Epochs.tsx';
import { IndexPanel } from './panels/Index.tsx';
import { KinshipPanel } from './panels/Kinship.tsx';
import { SynopsisPanel } from './panels/Synopsis.tsx';
import { ChapterPanel } from './panels/Chapter.tsx';
import { SectionPanel } from './panels/Section.tsx';
import { LegendPanel } from './panels/Legend.tsx';
import { AboutPanel } from './panels/About.tsx';
import { ChronologyPanel } from './panels/Chronology.tsx';
import { WorkPanel } from './panels/Work.tsx';

/** Лист карточки на телефоне меняет высоту за 260 мс (phone.css): видимая часть неба устанавливается после этого. */
const SHEET_SETTLE_MS = 320;

/**
 * «Эпохи» на телефоне — лист на 55 % на месте листа карточки (phone.css; MOB-59). Небо над ним — видимая часть:
 * выбранное лицо, ушедшее под лист или под ярусы эпох, сдвигается в неё (keepInView — та же функция, что после
 * открытия карточки и панели).
 */
function useEpochsOnPhone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => {
      const id = selected.peek();
      if (id) keepInView(id);
    }, SHEET_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [on]);
}

export function Panels() {
  useEpochsOnPhone(grid.value.phone && panel.value === 'epochs');
  switch (panel.value) {
    case 'epochs':
      return <EpochsPanel />;
    case 'spread':
      return <Spread />;
    case 'index':
      return <IndexPanel />;
    case 'kinship':
      return <KinshipPanel />;
    case 'synopsis':
      return <SynopsisPanel />;
    case 'chapter':
      return <ChapterPanel />;
    case 'section':
      return <SectionPanel />;
    case 'legend':
      return <LegendPanel />;
    case 'about':
      return <AboutPanel />;
    case 'chronology':
      return <ChronologyPanel />;
    case 'work':
      return <WorkPanel />;
    default:
      return null;
  }
}
