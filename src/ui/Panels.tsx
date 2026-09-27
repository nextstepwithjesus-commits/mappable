/** Панели атласа: каждая — в своём файле src/ui/panels/*.tsx. */
import { panel } from '../state.ts';
import { Spread } from './Spread.tsx';
import { EpochsPanel } from './panels/Epochs.tsx';
import { IndexPanel } from './panels/Index.tsx';
import { KinshipPanel } from './panels/Kinship.tsx';
import { SynopsisPanel } from './panels/Synopsis.tsx';
import { ChapterPanel } from './panels/Chapter.tsx';
import { SectionPanel } from './panels/Section.tsx';
import { LegendPanel } from './panels/Legend.tsx';
import { AboutPanel } from './panels/About.tsx';
import { WorkPanel } from './panels/Work.tsx';

export function Panels() {
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
    case 'work':
      return <WorkPanel />;
    default:
      return null;
  }
}
