import { render } from 'preact';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource-variable/jost/wght.css';
import '@fontsource/noto-serif-hebrew/hebrew-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/top.css';
import './styles/sky.css';
import './styles/folio.css';
import './styles/strip.css';
import './styles/panels.css';
import './styles/phone.css';
import './styles/spread.css';
import './styles/specimen.css';
import { App } from './ui/App.tsx';
import { Specimen } from './ui/Specimen.tsx';
import { probes } from './render/sky.ts';

async function start() {
  // проверочные метки кадра (src/render/sky.ts, probes) — только под автоматизацией: сценарии приёмки и снимки их читают;
  // замер кадров (tools/perf.ts) выключает их ключом «toledot:probes» = off — так, как небо работает у читателя; = on —
  // включает их в обычном браузере (разбор вручную)
  try {
    const want = localStorage.getItem('toledot:probes');
    probes.on = want === 'on' || (navigator.webdriver === true && want !== 'off');
  } catch {
    probes.on = navigator.webdriver === true;
  }
  // Холст меряет подписи — шрифты должны быть загружены до первой раскладки подписей.
  try {
    await Promise.all([
      document.fonts.load("500 14px 'Literata Variable'"),
      document.fonts.load("italic 400 14px 'Literata Variable'"),
      document.fonts.load("500 12px 'Jost Variable'"),
    ]);
  } catch {
    /* без шрифтов тоже работаем — подписи будут измерены по запасному шрифту */
  }
  const root = document.getElementById('app')!;
  const route = () => (location.hash.startsWith('#/specimen') ? <Specimen /> : <App />);
  render(route(), root);
  let wasSpecimen = location.hash.startsWith('#/specimen');
  window.addEventListener('hashchange', () => {
    const isSpecimen = location.hash.startsWith('#/specimen');
    if (isSpecimen !== wasSpecimen) {
      wasSpecimen = isSpecimen;
      render(route(), root);
    }
  });
}
start();
