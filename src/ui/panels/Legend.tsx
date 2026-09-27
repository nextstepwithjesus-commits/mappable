import { useEffect, useRef } from 'preact/hooks';
import { layers } from '../../state.ts';
import { drawGlyph } from '../../render/glyphs.ts';
import { Sheet } from './Sheet.tsx';
import { Check } from '../controls.tsx';
import { ReadingGuide } from '../sky/Overlays.tsx';
import { KeysTable } from '../top/Keys.tsx';

// ---------- условные знаки ----------
function Glyph({ o, w = 60, h = 26 }: { o: Parameters<typeof drawGlyph>[3]; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cs.getPropertyValue('--ink-2');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();
    drawGlyph(ctx, w / 2, h / 2, { ...o, color: cs.getPropertyValue('--ink').trim(), halo: cs.getPropertyValue('--sheet').trim() });
  }, []);
  return <canvas ref={ref} style={{ width: `${w}px`, height: `${h}px` }} aria-hidden="true" />;
}
export function LegendPanel() {
  const base = { sex: 'm' as const, kind: 'person', magnitude: 2, color: '', halo: '' };
  return (
    <Sheet title="Условные знаки" lead="Как читать звёздную карту.">
      {/* тот же текст, что во вступлении (C5; UX-03): клавиша «?» и команда «Как читать карту» ведут сюда */}
      <h3 id="legend-guide">Как читать карту</h3>
      <ReadingGuide both />
      <h3>Звёзды — лица</h3>
      <div class="legend-row"><Glyph o={{ ...base, magnitude: 0 }} /><span>величина звезды — значимость лица в повествовании (от 0 до 6)</span></div>
      <div class="legend-row"><Glyph o={base} /><span>мужчина</span></div>
      <div class="legend-row"><Glyph o={{ ...base, sex: 'f' }} /><span>женщина</span></div>
      <div class="legend-row"><Glyph o={{ ...base, kind: 'people' }} /><span>народ или род, названный «сыном» в таблице народов</span></div>
      <div class="legend-row"><Glyph o={{ ...base, king: true }} /><span>царь или царица — черта над знаком</span></div>
      <div class="legend-row"><Glyph o={{ ...base, hollow: true }} /><span>год рождения по реконструкции (не прямо из чисел Писания)</span></div>
      <div class="legend-row"><Glyph o={{ ...base, ghost: true }} /><span>«призрак»: женщина, стоящая рядом с мужем, отмечена и в родной семье</span></div>
      <div class="legend-row"><Glyph o={{ ...base, messiah: true, magnitude: 0 }} /><span>Иисус Христос — «звезда светлая и утренняя» (Откр 22:16)</span></div>
      <h3>Линии</h3>
      <p>Горизонтальный след — время жизни. Сплошной — годы известны; пунктирный конец — год смерти не установлен. Вертикальный отвод — родство «родитель — ребёнок», квадратик на отводе — мать. Двойная черта — брак. Знак разрыва «//» — хронологическое напряжение: вероятно, родословие здесь сокращено.</p>
      <p><span class="swatch gold" />Линия Иосифа — законная, царская (Мф 1). <span class="swatch azure" />Линия по Луке — традиционно родословие Марии (Лк 3). Разреженная нить — звено по толкованию.</p>
      <h3>Выделение и меридиан</h3>
      <p>Кольцо — выбранное лицо, тонкое кольцо — звезда под указателем. Сплошное кольцо с уточнением («Иосиф, муж Марии») — отметка поиска «Все на небе»; снимается командой «Снять» или клавишей Esc. При выделении остальное небо гаснет, но имена остаются читаемыми.</p>
      <p>Меридиан года: задержите указатель на линейке лет вверху неба или на полосе времени. Через всё небо пройдёт черта года, у линейки — сколько лиц живы в этот год. «Наверняка» живые — год внутри жизни, засвидетельствованной числами и событиями Писания, — светятся ярко; «вероятно» живые — по оценке дат — бледнее.</p>
      <h3>Ярусы эпох</h3>
      <p>Флажок «ярусы эпох» у неба: над ним — эпохи, судьи, цари Иудеи и Израиля, служения пророков и события. Штриховка — совместное правление, пунктирная рамка — годы по оценке. Ярус, пустой в видимых годах, свёрнут в строку с названием. Наведите указатель на отрезок — годы и стих; щелчок по царю, судье или пророку открывает его карточку.</p>
      <h3>Созвездия</h3>
      <p>Штриховой контур — род, колено или дом Израиля; точечный — народ вне Израиля. Полосы на левой кромке обозначены буквами, века — числами: так строятся координаты указателя.</p>
      <h3 id="legend-keys">Клавиши</h3>
      <KeysTable />
      <h3>Слои</h3>
      <div class="checks" role="group" aria-label="Слои карты">
        {Object.entries({ lifelines: 'следы жизни', connectors: 'связи', constellations: 'созвездия', epochs: 'эпохи', ribbons: 'линии Мессии', tensions: 'напряжения', ghosts: 'призраки', labels: 'подписи' }).map(([k, v]) => (
          <Check key={k} checked={layers.value[k]} onChange={(on) => (layers.value = { ...layers.value, [k]: on })}>
            {v}
          </Check>
        ))}
      </div>
    </Sheet>
  );
}
