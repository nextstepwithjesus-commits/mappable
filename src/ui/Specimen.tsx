/**
 * Образец (ТЗ § 5.7): все стили текста, токены в обеих темах, знаки легенды и состояния карточки.
 * Маршрут #/specimen. Снимки этого маршрута входят в визуальную проверку.
 */
import { useEffect, useRef } from 'preact/hooks';
import { drawGlyph } from '../render/glyphs.ts';
import { theme } from '../state.ts';
import { SECTIONS, PARTS } from './Folio.tsx';

const TOKENS = ['--sky', '--sky-band', '--sheet', '--ink', '--ink-2', '--ink-3', '--rule', '--rule-strong', '--gold-1', '--gold-2', '--azure-1', '--azure-2'];

function Swatches() {
  const cs = getComputedStyle(document.documentElement);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', margin: '10px 0 24px' }}>
      {TOKENS.map((t) => (
        <div key={t}>
          <div style={{ height: '38px', background: `var(${t})`, border: '1px solid var(--rule)' }} />
          <div style={{ fontFamily: 'var(--sans)', fontSize: '12.5px', color: 'var(--ink-2)', marginTop: '4px' }}>
            {t} {cs.getPropertyValue(t).trim()}
          </div>
        </div>
      ))}
    </div>
  );
}

function Glyphs() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const w = 760;
    const h = 150;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--ink').trim();
    const sky = cs.getPropertyValue('--sky').trim();
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let m = 0; m <= 6; m++) {
      drawGlyph(ctx, 30 + m * 46, 34, { sex: 'm', kind: 'person', magnitude: m, color: ink, halo: sky });
      drawGlyph(ctx, 30 + m * 46, 74, { sex: 'f', kind: 'person', magnitude: m, color: ink, halo: sky });
    }
    const x0 = 380;
    drawGlyph(ctx, x0, 34, { sex: 'm', kind: 'people', magnitude: 2, color: ink, halo: sky });
    drawGlyph(ctx, x0 + 50, 34, { sex: 'm', kind: 'person', magnitude: 2, king: true, color: ink, halo: sky });
    drawGlyph(ctx, x0 + 100, 34, { sex: 'm', kind: 'person', magnitude: 2, hollow: true, color: ink, halo: sky });
    drawGlyph(ctx, x0 + 150, 34, { sex: 'f', kind: 'person', magnitude: 2, ghost: true, color: ink, halo: sky });
    drawGlyph(ctx, x0 + 220, 40, { sex: 'm', kind: 'person', magnitude: 0, messiah: true, color: ink, halo: sky });
    // ленты
    const grad = (a: string, b: string, y: number) => {
      const g = ctx.createLinearGradient(20, 0, 740, 0);
      g.addColorStop(0, cs.getPropertyValue(a).trim());
      g.addColorStop(1, cs.getPropertyValue(b).trim());
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let x = 20; x <= 740; x += 4) ctx.lineTo(x, y + Math.cos((x - 20) / 36) * 6);
      ctx.stroke();
    };
    const braid = (a: string, b: string, phase: number) => {
      const g = ctx.createLinearGradient(20, 0, 740, 0);
      g.addColorStop(0, cs.getPropertyValue(a).trim());
      g.addColorStop(1, cs.getPropertyValue(b).trim());
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let x = 20; x <= 740; x += 3) ctx.lineTo(x, 116 + phase * Math.cos((x - 20) / 30) * 7);
      ctx.stroke();
    };
    braid('--azure-1', '--azure-2', -1);
    braid('--gold-1', '--gold-2', 1);
    void grad;
  }, [theme.value]);
  return <canvas ref={ref} style={{ width: '760px', height: '150px', display: 'block' }} />;
}

export function Specimen() {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--sky)' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 28px 80px' }}>
        <div class="opts">
          <button aria-pressed={theme.value === 'night'} onClick={() => (theme.value = 'night')}>
            ночная карта
          </button>
          <button aria-pressed={theme.value === 'day'} onClick={() => (theme.value = 'day')}>
            дневная карта
          </button>
          <a href="#/" style={{ fontFamily: 'var(--sans)', fontSize: '14px' }}>
            к атласу
          </a>
        </div>
        <h1 style={{ fontSize: '40px', lineHeight: '46px', fontWeight: 560, margin: '10px 0 4px' }}>Образец «Толедота»</h1>
        <p style={{ color: 'var(--ink-2)', fontStyle: 'italic', margin: '0 0 24px' }}>Стили, цвета, знаки и состояния карточки</p>

        <h2 style={{ fontSize: '22px' }}>Цвета</h2>
        <Swatches />

        <h2 style={{ fontSize: '22px' }}>Текст</h2>
        <div style={{ background: 'var(--sheet)', padding: '24px 40px 24px 64px', border: '1px solid var(--rule)', margin: '10px 0 24px' }}>
          <div class="mast">
            <h2>Давид</h2>
            <div class="dis">сын Иессея, царь и пророк</div>
            <dl class="passport">
              <dt>Роль</dt>
              <dd>царь, пророк</dd>
              <dt>Род</dt>
              <dd>Дом Давидов</dd>
              <dt>Эпоха</dt>
              <dd>Единое царство</dd>
              <dt>Годы</dt>
              <dd>ок. 1040–970 гг. до Р. Х.</dd>
            </dl>
            <div class="rule" />
          </div>
          <div class="part">{PARTS[1]}</div>
          <section class="sec">
            <span class="no">3</span>
            <h3>Значение имени</h3>
            <div class="runin">
              «возлюбленный»<abbr class="mark">справ.</abbr>
            </div>
          </section>
          <section class="sec long">
            <span class="no">17</span>
            <h3>Жизнеописание</h3>
            <ul>
              <li class="fact">
                Помазан Самуилом в доме Иессея <button class="ref">1 Цар 16:13</button>
              </li>
              <li class="fact">
                <span class="muted">30 лет. </span>Воцарился в Хевроне <button class="ref">2 Цар 5:4</button>
                <abbr class="mark">выв.</abbr>
              </li>
            </ul>
            <div class="verses">
              <sup>16:13</sup>И взял Самуил рог с елеем и помазал его среди братьев его, и почивал Дух Господень на Давиде с того дня и после.
            </div>
          </section>
          <div class="sec silent">
            <span class="no">9–12</span>Супруги, Дети, Братья и сёстры, Иное родство — в Писании не сообщается
          </div>
          <div class="sec absent">
            <span class="no">22</span>Упоминания в других книгах — раздел не составлен
          </div>
          <div class="tension">
            <b>Хронологическое напряжение.</b> Салмон → Давид: 5 поколений на 400 лет; вероятно, родословие сокращено
          </div>
          <p class="colophon">Составлено разделов: 14 из 24. Все ссылки сверены с Синодальным текстом.</p>
        </div>

        <h2 style={{ fontSize: '22px' }}>Знаки</h2>
        <Glyphs />

        <h2 style={{ fontSize: '22px', marginTop: '24px' }}>Схема карточки</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 32px', fontSize: '15px' }}>
          {SECTIONS.map((s) => (
            <div key={s.n}>
              <span style={{ display: 'inline-block', width: '28px', color: 'var(--ink-3)', fontFamily: 'var(--sans)', fontSize: '13px' }}>{s.n}</span>
              {s.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
