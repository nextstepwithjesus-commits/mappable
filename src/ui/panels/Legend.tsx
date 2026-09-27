import { useEffect, useRef } from 'preact/hooks';
import { layers } from '../../state.ts';
import { drawGlyph } from '../../render/glyphs.ts';
import { Sheet } from './Sheet.tsx';

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
      <h3>Созвездия</h3>
      <p>Штриховой контур — род, колено или дом Израиля; точечный — народ вне Израиля. Полосы на левой кромке обозначены буквами, века — числами: так строятся координаты указателя.</p>
      <h3>Клавиши</h3>
      <p>
        <kbd>/</kbd> (<kbd>.</kbd> на русской раскладке) — поиск · <kbd>+</kbd> <kbd>−</kbd> — масштаб · стрелки — сдвиг · <kbd>[</kbd> <kbd>]</kbd> (<kbd>х</kbd> <kbd>ъ</kbd>) — к родителю и к ребёнку ·{' '}
        <kbd>,</kbd> <kbd>.</kbd> (<kbd>б</kbd> <kbd>ю</kbd>) — к брату или сестре · <kbd>E</kbd> (<kbd>У</kbd>) — эпохи · <kbd>L</kbd> (<kbd>Д</kbd>) — условные знаки · <kbd>Esc</kbd> — закрыть
      </p>
      <h3>Слои</h3>
      <div class="opts">
        {Object.entries({ lifelines: 'следы жизни', connectors: 'связи', constellations: 'созвездия', epochs: 'эпохи', ribbons: 'линии Мессии', tensions: 'напряжения', ghosts: 'призраки', labels: 'подписи' }).map(([k, v]) => (
          <button key={k} aria-pressed={layers.value[k]} onClick={() => (layers.value = { ...layers.value, [k]: !layers.value[k] })}>
            {v}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
