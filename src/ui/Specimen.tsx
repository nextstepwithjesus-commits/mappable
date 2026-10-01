/**
 * Образец (ТЗ § 5.7; B7, VIS-38): шкала кеглей, цвета обеих тем рядом, органы управления во всех состояниях,
 * условные знаки и линии неба, состояния карточки. Маршрут #/specimen — эталон для снимков экрана.
 *
 * Всё собрано из живых частей атласа: органы управления — из controls.tsx и common.tsx, знаки — drawGlyph,
 * ленты — buildRibbons и drawStrands, следы и родство — drawLifeTrail, drawDescent, drawBracket и drawMarriage
 * (те же функции, что у неба; образцы следов — те же, что в «Как читать карту»), карточка — сам Folio. Своих копий рисования и стилей нет:
 * наведение, нажатие и фокус показаны статично атрибутом data-pseudo, темы рядом — обёрткой .spec-map[data-map];
 * правила для них выводятся из действующих таблиц стилей (src/ui/specimen-css.ts).
 * Образец не анимируется и не использует случайных чисел: снимки между запусками совпадают.
 */
import { batch } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId } from '../data/atlas.ts';
import { buildRibbons } from '../engine/ribbons.ts';
import { drawGlyph, type GlyphOpts } from '../render/glyphs.ts';
import { drawStrands, ribbonLook } from '../render/ribbons.ts';
import { readPalette, type Palette } from '../render/sky.ts';
import { FONT_SANS, T_MAP_S, coarsePointer, mapFont, mapSize } from '../render/type.ts';
import { selected, showSchema, theme, type Theme } from '../state.ts';
import { P, Refs } from './common.tsx';
import { CONTRAST_USES, contrast } from './contrast.ts';
import { Check, Close, Segmented } from './controls.tsx';
import { Folio, PARTS, TabsSpecimen } from './Folio.tsx';
import { PAINTERS, type PainterKey } from './panels/Legend.tsx';
import { installSpecimenRules, type Pseudo } from './specimen-css.ts';
import { typo } from './text/typo.ts';

const MAPS: readonly Theme[] = ['night', 'day'];
const MAP_NAME: Record<Theme, string> = { night: 'Ночь', day: 'День' };
const noop = () => {};

/** 11,5 → «11,5»; 34 → «34»: без лишних нулей. */
const dec = (x: number, digits = 1) => String(Number(x.toFixed(digits))).replace('.', ',');
/** Контраст — всегда два знака после запятой: столбец выравнивается. */
const ratioText = (x: number) => x.toFixed(2).replace('.', ',');
/** Первое имя семейства шрифтов без кавычек и «Variable»: «'Literata Variable', …» → «Literata». */
const family = (css: string) => css.split(',')[0].replace(/['"]/g, '').replace(/\s+Variable$/, '').trim();

// ---------- холст ----------

/** Холст под размер CSS с учётом плотности пикселей; рисунок — в пикселях CSS. */
function prepare(cv: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * Палитра холста для темы колонки. readPalette читает токены с корня документа, поэтому на время чтения корень получает
 * тему колонки и сразу её возвращает (кадр между ними не рисуется). Когда readPalette примет элемент, здесь хватит
 * readPalette(обёртка колонки).
 */
function paletteOf(map: Theme): Palette {
  const root = document.documentElement;
  const was = root.getAttribute('data-map');
  root.setAttribute('data-map', map);
  try {
    return readPalette();
  } finally {
    if (was === null) root.removeAttribute('data-map');
    else root.setAttribute('data-map', was);
  }
}

/** Холст, который перерисовывается при смене размера; draw получает контекст и размер в пикселях CSS. */
function Canvas({ draw, deps, class: cls, label }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; deps: unknown[]; class: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current!;
    let lastW = -1;
    const paint = () => {
      if (cv.clientWidth === lastW) return;
      lastW = cv.clientWidth;
      const { ctx, w, h } = prepare(cv);
      draw(ctx, w, h);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(cv);
    return () => ro.disconnect();
  }, deps);
  return label ? <canvas ref={ref} class={cls} role="img" aria-label={label} /> : <canvas ref={ref} class={cls} aria-hidden="true" />;
}

// ---------- кегли ----------

interface TypeRow {
  token: string;
  sample: ComponentChildren;
  use: string;
  canvas?: boolean;
}

const david = byId.get('david');

/** Восемь ступеней шкалы (src/styles/tokens.css, VIS-27): образец строки там, где кегль работает. */
export const TYPE_ROWS: readonly TypeRow[] = [
  { token: '--t-display', sample: david?.name ?? 'Давид', use: 'имя в карточке' },
  { token: '--t-title', sample: 'Условные знаки', use: 'заголовки панелей и вступления' },
  { token: '--t-lead', sample: <i>{david?.disambig ?? ''}</i>, use: 'вводки, фраза родства, заголовки внутри панелей, уточнение имени' },
  { token: '--t-body', sample: typo('«посмотри на небо и сосчитай звезды, если ты можешь счесть их» (Быт 15:5)'), use: 'текст карточки и панелей' },
  { token: '--t-note', sample: typo('исчисляет количество звезд; всех их называет именами их (Пс 146:4)'), use: 'паспорт, подсказка, стихи, колофон, пометы в панелях' },
  { token: '--t-ui', sample: 'Показать на небе', use: 'команды, переключатели, ссылки на стихи, подписи полей' },
  { token: '--t-ui-s', sample: PARTS[1], use: 'номера разделов, части карточки, пометы, шкалы' },
  { token: '--t-map-s', sample: 'Годы кромки, созвездия', use: 'только холст: годы на кромке, буквы строк неба, масштаб, созвездия, ярусы, имена звёзд величины 6', canvas: true },
];

function TypeScale() {
  const body = useRef<HTMLTableSectionElement>(null);
  const coarse = coarsePointer();
  const [metrics, setMetrics] = useState<{ size: string; sizeNote?: string; lh: string; lhNote?: string; font: string }[] | null>(null);
  useLayoutEffect(() => {
    const out = [...body.current!.querySelectorAll<HTMLElement>('.spec-sample')].map((el, i) => {
      if (TYPE_ROWS[i].canvas) {
        // кегль холста: 11,5; на сенсорном экране подписи холста не мельче 12,5 (MOB-42)
        const other = coarse ? `с мышью ${dec(T_MAP_S)}` : `на сенсорном ${dec(mapSize(T_MAP_S, true))}`;
        return { size: dec(mapSize(T_MAP_S, coarse)), sizeNote: other, lh: '—', lhNote: 'одна строка', font: family(FONT_SANS) };
      }
      const cs = getComputedStyle(el);
      return { size: dec(parseFloat(cs.fontSize)), lh: dec(parseFloat(cs.lineHeight)), font: family(cs.fontFamily) };
    });
    setMetrics(out);
  }, []);
  return (
    <table class="spec-type">
      <thead>
        <tr>
          <th scope="col">Образец и назначение</th>
          <th scope="col" class="num">Кегль, px</th>
          <th scope="col" class="num">Интерлиньяж, px</th>
          <th scope="col">Шрифт и токен</th>
        </tr>
      </thead>
      <tbody ref={body}>
        {TYPE_ROWS.map((r, i) => (
          <tr key={r.token}>
            <td>
              {r.canvas ? (
                <Canvas
                  class="spec-sample spec-mapline"
                  label={r.sample as string}
                  deps={[theme.value]}
                  draw={(ctx, w, h) => {
                    const pal = readPalette();
                    ctx.clearRect(0, 0, w, h);
                    ctx.font = mapFont(T_MAP_S, { sans: true, coarse });
                    ctx.fillStyle = pal.ink;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(r.sample as string, 0, h / 2);
                  }}
                />
              ) : (
                <div class={`spec-sample t${r.token.slice(3)}`}>{r.sample}</div>
              )}
              <div class="spec-use">{r.use}</div>
            </td>
            <td class="num">
              {metrics?.[i].size}
              {metrics?.[i].sizeNote && <div class="spec-use">{metrics[i].sizeNote}</div>}
            </td>
            <td class="num">
              {metrics?.[i].lh}
              {metrics?.[i].lhNote && <div class="spec-use">{metrics[i].lhNote}</div>}
            </td>
            <td>
              {metrics?.[i].font}
              <div class="spec-use spec-token">{r.token}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- цвета ----------

/** Все токены цвета темы (src/styles/tokens.css) и где они работают. Полноту проверяет tests/specimen.test.ts. */
export const TOKEN_ROLES: Record<string, string> = {
  '--sky': 'небо: фон карты и страницы',
  '--sky-band': 'эпохи на небе через одну',
  '--sheet': 'лист карточки и панели',
  '--sheet-2': 'наведение, вклейки стихов',
  '--ink': 'имена и основной текст',
  '--ink-2': 'второстепенный текст, рамка флажка',
  '--ink-3': 'мелкие подписи и пометы',
  '--rule': 'тонкие линейки внутри листа',
  '--rule-strong': 'край листа и панели, рамка сегментов, подчёркивание ссылки',
  '--gold-1': 'лента Иосифа, начало',
  '--gold-2': 'лента Иосифа, конец',
  '--azure-1': 'лента по Луке, начало',
  '--azure-2': 'лента по Луке, конец',
  '--focus': 'кольцо фокуса',
  '--halo': 'подложка под звездой и дневной лентой',
  '--glow': 'свечение лент: 1 — ночью, 0 — днём',
  // метки вкладок закреплённых карточек (этап 12, решение 91): спокойная палитра, не похожая на ленты, ветви и связь
  '--tab-1': 'метка вкладки 1: приглушённая роза',
  '--tab-2': 'метка вкладки 2: песок',
  '--tab-3': 'метка вкладки 3: серо-бирюзовый',
  '--tab-4': 'метка вкладки 4: лиловато-серый',
  '--tab-5': 'метка вкладки 5: олива',
  '--tab-6': 'метка вкладки 6: сизый',
  '--tab-7': 'метка вкладки 7: пепельно-розовый',
  '--tab-8': 'метка вкладки 8: шалфей',
};

/** Фон, к которому меряется токен, у которого нет порога (он не несёт текста и знаков). */
const INFO_BG: Record<string, string> = { '--sky-band': '--sky', '--rule': '--sheet', '--halo': '--sky' };
const BG_NAME: Record<string, string> = { '--sky': 'небо', '--sheet': 'лист', '--sheet-2': 'наведение', '--ink': 'выбранный сегмент' };

/** Пары токена с фонами: одна строка на фон, порог — наибольший из его употреблений. */
export function contrastRows(token: string): { bg: string; min: number | null }[] {
  const rows = new Map<string, number>();
  for (const u of CONTRAST_USES) if (u.fg === token) rows.set(u.bg, Math.max(rows.get(u.bg) ?? 0, u.min));
  if (!rows.size && INFO_BG[token]) return [{ bg: INFO_BG[token], min: null }];
  return [...rows].map(([bg, min]) => ({ bg, min }));
}

/**
 * Значение токена как #rrggbb. Сборка сжимает цвета (#ffffff → #fff), поэтому краткая запись разворачивается;
 * всё прочее, чем браузер может записать цвет, приводится к #rrggbb через вычисленный цвет пробного элемента.
 */
export function toHex(v: string, probe?: HTMLElement): string | null {
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  if (!probe || !s) return null;
  probe.style.setProperty('--probe', s);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
  probe.style.removeProperty('--probe');
  return m ? `#${m.slice(1, 4).map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : null;
}

function Colors() {
  const ref = useRef<HTMLTableElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [vals, setVals] = useState<Record<string, string | null>>({});
  useLayoutEffect(() => {
    const cs = getComputedStyle(ref.current!);
    setVals(Object.fromEntries(Object.keys(TOKEN_ROLES).map((t) => {
      const v = cs.getPropertyValue(t).trim();
      return [t, t === '--glow' ? v : toHex(v, probe.current ?? undefined)];
    })));
  }, []);
  const hex = (t: string) => (t === '--glow' ? null : (vals[t] ?? null));
  return (
    <table class="spec-colors" ref={ref}>
      <caption class="visually-hidden">
        Токены цвета и их контраст к фону
        <span class="spec-probe" ref={probe} />
      </caption>
      <thead>
        <tr>
          <th scope="col">Токен</th>
          <th scope="col">Фон</th>
          <th scope="col">Контраст</th>
          <th scope="col">Порог</th>
        </tr>
      </thead>
      {Object.entries(TOKEN_ROLES).map(([t, role]) => {
        const rows = contrastRows(t);
        const head = (
          <th scope="rowgroup" rowSpan={Math.max(1, rows.length)}>
            {t !== '--glow' && <span class="spec-swatch" style={{ '--c': `var(${t})` }} />}
            <span class="spec-token spec-tname">{t}</span> <span class="spec-value">{vals[t]}</span>
            <div class="spec-use">{role}</div>
          </th>
        );
        if (!rows.length)
          return (
            <tbody key={t}>
              <tr>
                {head}
                <td colSpan={3} class="spec-use">
                  {t === '--glow' ? 'не цвет' : 'порога нет'}
                </td>
              </tr>
            </tbody>
          );
        return (
          <tbody key={t}>
            {rows.map((r, i) => {
              const a = hex(t);
              const b = hex(r.bg);
              const k = a && b ? contrast(a, b) : null;
              return (
                <tr key={r.bg}>
                  {i === 0 && head}
                  <td class="spec-bg">
                    <span class="spec-swatch" style={{ '--c': `var(${r.bg})` }} />
                    {BG_NAME[r.bg] ?? r.bg}
                  </td>
                  <td class="num">
                    {k === null ? '' : ratioText(k)}
                    {k !== null && r.min !== null && k < r.min ? <span class="spec-fail"> ниже порога</span> : null}
                  </td>
                  <td class="num">{r.min === null ? 'нет' : dec(r.min, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}

// ---------- органы управления ----------

type State = 'normal' | 'hover' | 'active' | 'on' | 'focus' | 'off';
const STATES: { key: State; label: string }[] = [
  { key: 'normal', label: 'обычное' },
  { key: 'hover', label: 'наведение' },
  { key: 'active', label: 'нажатие' },
  { key: 'on', label: 'включено' },
  { key: 'focus', label: 'фокус' },
  { key: 'off', label: 'выключено' },
];
const PSEUDO: Partial<Record<State, Pseudo>> = { hover: 'hover', active: 'active', focus: 'focus' };

interface Kind {
  name: string;
  /** органы в состоянии st; null — такого состояния у органа нет */
  render: (st: State, map: Theme) => ComponentChildren | null;
  /** на каком элементе внутри ячейки стоит состояние: наведение, нажатие, фокус, «включено» атрибутом */
  pick: Partial<Record<State, string>>;
  /** «включено» задаётся атрибутом элемента, а не свойством компонента: так раскрытая ссылка на стих */
  onAttr?: [string, string];
  /** своё название состояния «включено» */
  onLabel?: string;
}

function DemoCheck({ on, off }: { on: boolean; off: boolean }) {
  const [v, setV] = useState(on);
  return (
    <Check checked={v} disabled={off} onChange={setV}>
      эпохи
    </Check>
  );
}
function DemoSeg() {
  const [v, setV] = useState<Theme>('night');
  return <Segmented label="Тема карты" options={[{ value: 'night', label: 'ночь' }, { value: 'day', label: 'день' }]} value={v} onChange={setV} />;
}

const KINDS: Kind[] = [
  {
    name: 'Ссылка на лицо',
    render: (st) => (st === 'on' || st === 'off' ? null : <P id="david" />),
    pick: { hover: 'button', active: 'button', focus: 'button' },
  },
  {
    name: 'Ссылка на стих',
    render: (st, map) => (st === 'off' ? null : <Refs refs={['Быт 15:5']} owner={`specimen:${map}:${st}`} />),
    pick: { hover: 'button', active: 'button', focus: 'button', on: 'button' },
    onAttr: ['aria-expanded', 'true'],
    onLabel: 'раскрыта',
  },
  {
    name: 'Команда',
    render: (st) => (
      <button type="button" class="cmd" aria-pressed={st === 'on'} disabled={st === 'off'}>
        Указатель
      </button>
    ),
    pick: { hover: 'button', active: 'button', focus: 'button' },
    onLabel: 'нажата',
  },
  {
    name: 'Переключатель',
    // выбранный сегмент есть в каждом состоянии; выключенный переключатель — в выключенной группе полей
    render: (st) =>
      st === 'on' ? null : st === 'off' ? (
        <fieldset class="spec-off" disabled>
          <DemoSeg />
        </fieldset>
      ) : (
        <DemoSeg />
      ),
    pick: { hover: 'button[aria-pressed="false"]', active: 'button[aria-pressed="false"]', focus: 'button[aria-pressed="true"]' },
  },
  {
    name: 'Флажок',
    render: (st) => <DemoCheck on={st === 'on'} off={st === 'off'} />,
    pick: { hover: 'label', active: 'input', focus: 'input' },
    onLabel: 'отмечен',
  },
  {
    name: 'Закрыть',
    render: (st) => (st === 'on' || st === 'off' ? null : <Close label="Закрыть" onClick={noop} />),
    pick: { hover: 'button', active: 'button', focus: 'button' },
  },
];

/** Ячейка «орган × состояние»: состояние ставится на элемент внутри ячейки после отрисовки. */
function StateCell({ kind, st, map }: { kind: Kind; st: State; map: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const body = kind.render(st, map);
  const sel = kind.pick[st];
  useLayoutEffect(() => {
    const el = sel ? ref.current?.querySelector(sel) : null;
    if (!el) return;
    const ps = PSEUDO[st];
    if (ps) el.setAttribute('data-pseudo', ps);
    if (st === 'on' && kind.onAttr) el.setAttribute(kind.onAttr[0], kind.onAttr[1]);
  }, []);
  const label = st === 'on' && kind.onLabel ? kind.onLabel : STATES.find((s) => s.key === st)!.label;
  return (
    <div class="spec-state">
      <div class="spec-demo" ref={ref}>
        {body ?? <span aria-hidden="true">—</span>}
      </div>
      <span class="spec-cap">
        {label}
        {body === null && <span class="visually-hidden">: такого состояния нет</span>}
      </span>
    </div>
  );
}

function Controls({ map }: { map: Theme }) {
  return (
    <div class="spec-controls">
      {KINDS.map((k) => (
        <div class="spec-kind" key={k.name}>
          <h4>{k.name}</h4>
          <div class="spec-states">
            {STATES.map((s) => (
              <StateCell key={s.key} kind={k} st={s.key} map={map} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- знаки и линии ----------

const SIGNS: { o: Partial<GlyphOpts>; cap: string }[] = [
  { o: {}, cap: 'мужчина' },
  { o: { sex: 'f' }, cap: 'женщина' },
  { o: { kind: 'people' }, cap: 'народ или род из таблицы народов' },
  { o: { king: true }, cap: 'царь: черта над знаком' },
  { o: { king: true, sex: 'f' }, cap: 'царица: черта над кольцом' },
  { o: { infant: true }, cap: 'умер младенцем: † слева' },
  { o: { hollow: true }, cap: 'время не установлено: полый знак' },
  { o: { sex: 'f', ghost: true }, cap: 'жена в родной семье: «призрак»' },
  { o: { messiah: true, magnitude: 0 }, cap: 'Иисус Христос: восьмилучевая звезда' },
];

function Glyph({ map, o }: { map: Theme; o: Partial<GlyphOpts> }) {
  return (
    <Canvas
      class="spec-glyph"
      deps={[map]}
      draw={(ctx, w, h) => {
        const pal = paletteOf(map);
        ctx.fillStyle = pal.sky;
        ctx.fillRect(0, 0, w, h);
        drawGlyph(ctx, w / 2, h / 2, { sex: 'm', kind: 'person', magnitude: 2, ...o, color: pal.ink, halo: pal.sky });
      }}
    />
  );
}

/**
 * Лица образца лент по поколениям: общий участок; расхождение на одно лицо — у Луки лишнее звено по толкованию
 * (так на небе Каинан, Лк 3:36); снова общий участок; расхождение на два поколения; схождение и последнее лицо.
 * Полоса: 0 — ось, −1 — ветвь Иосифа (выше), +1 — ветвь по Луке (ниже).
 */
const RIBBON_PEOPLE: Record<string, [number, number]> = {
  a: [0, 0], b: [1, 0], c: [2, 0], k: [3, 1], e: [4, 0], f: [5, 0], g: [6, 0],
  j1: [7, -1], j2: [8, -1], m1: [7, 1], m2: [8, 1], h: [9, 0], i: [10, 0], z: [11, 0],
};
const JOSEPH = ['a', 'b', 'c', 'e', 'f', 'g', 'j1', 'j2', 'h', 'i', 'z'];
const MARY = ['a', 'b', 'c', 'k', 'e', 'f', 'g', 'm1', 'm2', 'h', 'i', 'z'];
const GENERATIONS = 11;
const LAST = 'z';

function Ribbons({ map }: { map: Theme }) {
  return (
    <Canvas
      class="spec-ribbons"
      deps={[map]}
      label="Две ленты линий Мессии: общие поколения свиты в косу, в расхождениях у каждой линии свои лица, звено по толкованию — разреженная нить"
      draw={(ctx, w, h) => {
        const pal = paletteOf(map);
        ctx.fillStyle = pal.sky;
        ctx.fillRect(0, 0, w, h);
        const pad = 20;
        const step = Math.min(60, (w - 2 * pad) / GENERATIONS);
        const lane = 22;
        const x0 = (w - step * GENERATIONS) / 2;
        const project = (id: string) => {
          const [g, l] = RIBBON_PEOPLE[id];
          return { x: x0 + g * step, y: h / 2 + l * lane };
        };
        const strands = buildRibbons({
          joseph: JOSEPH.map((id) => ({ id, weak: false })),
          mary: MARY.map((id) => ({ id, weak: id === 'k' })),
          project,
          amplitude: 8,
          meander: 4,
        });
        drawStrands(ctx, strands, 2.6, ribbonLook(pal), w);
        // звёзды поверх лент, как на небе; последнее лицо — Иисус Христос
        for (const id of Object.keys(RIBBON_PEOPLE)) {
          const p = project(id);
          drawGlyph(ctx, p.x, p.y, { sex: 'm', kind: 'person', magnitude: id === LAST ? 0 : 3, messiah: id === LAST, color: pal.ink, halo: pal.sky });
        }
      }}
    />
  );
}

/**
 * Следы жизни и родство — образцы «Как читать карту» (src/ui/panels/Legend.tsx, PAINTERS): drawLifeTrail и drawDescent
 * из src/render/trails.ts и знаки грамматики связей drawLinkSample из src/render/plates.ts (этап 11, решение 78) — те же
 * функции, что у неба.
 */
const TRAILS: { k: PainterKey; cap: string }[] = [
  { k: 'trailExact', cap: 'годы известны' },
  { k: 'trailEstimated', cap: 'годы оценочные: пунктир начала и конца' },
  { k: 'trailLast', cap: 'до последнего упоминания' },
  { k: 'trailNone', cap: 'о жизни не известно' },
  { k: 'trailEpochal', cap: 'известна только эпоха' },
];
const LINKS: { k: PainterKey; cap: string }[] = [
  { k: 'linkTrunk', cap: 'ствол, зубцы и черта брака' },
  { k: 'linkNode', cap: 'союз: дети показаны, свёрнуты' },
  { k: 'linkJoin', cap: 'второе гнездо союза' },
  { k: 'linkCut', cap: 'разрыв чужого следа' },
  { k: 'linkStub', cap: 'обрывки длинной связи' },
  { k: 'linkRibbon', cap: 'лента в узле своего шага' },
  { k: 'linkSelected', cap: 'выбранная связь' },
  { k: 'ghost', cap: 'призрак жены в родной семье' },
];

function Line({ map, k, tall = false }: { map: Theme; k: PainterKey; tall?: boolean }) {
  return (
    <Canvas
      class={tall ? 'spec-linecv tall' : 'spec-linecv'}
      deps={[map]}
      draw={(ctx, w, h) => {
        const pal = paletteOf(map);
        ctx.fillStyle = pal.sky;
        ctx.fillRect(0, 0, w, h);
        PAINTERS[k](ctx, pal, w, h);
      }}
    />
  );
}

function Signs({ map }: { map: Theme }) {
  return (
    <div class="spec-signs">
      <h4>Величина звезды — значимость лица</h4>
      <div class="spec-states spec-sky">
        {[0, 1, 2, 3, 4, 5, 6].map((m) => (
          <figure class="spec-sign spec-mag" key={m}>
            <Glyph map={map} o={{ magnitude: m }} />
            <figcaption class="spec-cap">{m}</figcaption>
          </figure>
        ))}
      </div>
      <h4>Знаки лиц</h4>
      <div class="spec-states spec-sky">
        {SIGNS.map((s) => (
          <figure class="spec-sign" key={s.cap}>
            <Glyph map={map} o={s.o} />
            <figcaption class="spec-cap">{s.cap}</figcaption>
          </figure>
        ))}
      </div>
      <h4>Линии Мессии</h4>
      <Ribbons map={map} />
      <ul class="spec-list">
        <li>Лента Иосифа (Мф 1) — золото, лента по Луке (Лк 3) — лазурь.</li>
        <li>Общие поколения: нити свиты в косу, лицо стоит между нитями.</li>
        <li>Расхождение: у каждой линии свои лица, нить Иосифа уходит вверх.</li>
        <li>Звено по толкованию — разреженная нить; «по закону» — штрих на всём шаге (Иосиф → Иисус, Мф 1:16).</li>
        <li>У края видимого участка ленты подписаны: «Мф 1» и «Лк 3» — линии различимы и без цвета.</li>
      </ul>
      <h4>Состояния и подписи</h4>
      <div class="spec-states spec-sky">
        <figure class="spec-sign spec-line">
          <Line map={map} k="focus" />
          <figcaption class="spec-cap">фокус клавиатуры — угловые скобки; выбор — кольцо</figcaption>
        </figure>
      </div>
      <ul class="spec-list">
        <li>Подпись — у своей звезды в 3 px от её колец или на выноске до 40 px (у самых значимых лиц на обзоре — до 100 px); не на чужой звезде, связи, ленте и дуге.</li>
        <li>Нет места — подпись скрыта до наведения, фокуса и выбора; под серединой имени следы, сетка и погашенные связи прерываются.</li>
        <li>«Иаков +13» на обзоре — знаки семьи собраны у знака старшего; щелчок по «+N» — ближайшая родня.</li>
      </ul>
      <h4>Следы жизни</h4>
      <div class="spec-states spec-sky">
        {TRAILS.map((s) => (
          <figure class="spec-sign spec-line" key={s.k}>
            <Line map={map} k={s.k} />
            <figcaption class="spec-cap">{s.cap}</figcaption>
          </figure>
        ))}
      </div>
      <h4>Родство</h4>
      <div class="spec-states spec-sky">
        {LINKS.map((s) => (
          <figure class="spec-sign spec-line" key={s.k}>
            <Line map={map} k={s.k} tall />
            <figcaption class="spec-cap">{s.cap}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------- карточка ----------

/**
 * Состояния карточки — на лицах, у которых они есть в данных (проверка — tests/specimen.test.ts).
 * schema — показать всю схему разделов, как по команде колофона «Показать все 24 раздела».
 */
export const CARD_STATES: readonly { key: string; label: string; id: string; schema: boolean; note: string }[] = [
  { key: 'silent', label: 'Писание молчит', id: 'khettura', schema: true, note: 'Больше всего разделов, о которых Писание, по проверке составителя, молчит. Такие разделы — бледные строки «в Писании не сообщается»; соседние сведены в одну.' },
  { key: 'absent', label: 'не составлено', id: 'shukha', schema: true, note: 'Несоставленные разделы — бледные строки курсивом «раздел не составлен»; соседние сведены в одну. Показана вся схема разделов, как по команде колофона «Показать все 24 раздела».' },
  { key: 'full', label: '24 раздела', id: 'david', schema: false, note: 'Составлены все 24 раздела.' },
  // самая короткая по тому же правилу (tests/specimen.test.ts): у Шухи после круга 3 появился § 12 (племянник Махир),
  // короче теперь Бен-Хур — пять разделов, как ещё у девяти лиц
  { key: 'short', label: 'самая короткая', id: 'iagdiil', schema: false, note: 'Карточки из одного раздела в атласе нет; это самая короткая.' },
];

function CardStates() {
  const [key, setKey] = useState(CARD_STATES[0].key);
  const st = CARD_STATES.find((s) => s.key === key)!;
  // образец на время показа берёт выбор лица и схему разделов, а уходя, возвращает их атласу
  useLayoutEffect(() => {
    const was = { id: selected.peek(), schema: showSchema.peek() };
    return () =>
      batch(() => {
        selected.value = was.id;
        showSchema.value = was.schema;
      });
  }, []);
  useLayoutEffect(() => {
    batch(() => {
      selected.value = st.id;
      showSchema.value = st.schema;
    });
  }, [key]);
  return (
    <div class="spec-cards">
      <div class="spec-cardside">
        <Segmented label="Состояние карточки" options={CARD_STATES.map((s) => ({ value: s.key, label: s.label }))} value={key} onChange={setKey} />
        <p class="spec-note">{typo(st.note)}</p>
        <dl class="spec-dl">
          <dt>Загрузка</dt>
          <dd>{typo('Том карточки не пришёл за 300 мс: под шапкой вместо разделов — строка «Загрузка карточки…». Лист ниже — живая карточка в этом состоянии.')}</dd>
          <dt>Ошибка</dt>
          <dd>{typo('Том не загрузился: сообщение и команда «Повторить» — тоже живой лист ниже.')}</dd>
          <dt>Из одного раздела</dt>
          <dd>{typo('Такой карточки в атласе нет; самая короткая показана под кнопкой «самая короткая».')}</dd>
        </dl>
      </div>
      <div class="spec-card">
        <Folio />
      </div>
      {/* «Загрузка» и «Ошибка» (VIS-55) — сам Folio в этих состояниях (проп forceState), рядом */}
      <div class="spec-cardstates">
        {CARD_BODY_STATES.map((s) => (
          <figure class="spec-card spec-cardstate" key={s.state}>
            <figcaption>{s.label}</figcaption>
            <Folio id={s.id} forceState={s.state} />
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Состояния тела карточки, которые образец держит живыми (VIS-55): лицо и подпись. */
export const CARD_BODY_STATES: readonly { state: 'loading' | 'error'; id: string; label: string }[] = [
  { state: 'loading', id: 'ruf', label: 'Загрузка' },
  { state: 'error', id: 'vooz', label: 'Ошибка' },
];

// ---------- страница ----------

function Themes({ children }: { children: (map: Theme) => ComponentChildren }) {
  return (
    <div class="spec-themes">
      {MAPS.map((m) => (
        <div class="spec-map" data-map={m} key={m}>
          <h3>{MAP_NAME[m]}</h3>
          {children(m)}
        </div>
      ))}
    </div>
  );
}

let rulesReady = false;

export function Specimen() {
  // двойники правил для состояний и тем — до первой отрисовки, чтобы колонки тем сразу несли свои токены
  if (!rulesReady && typeof document !== 'undefined') {
    installSpecimenRules();
    rulesReady = true;
  }
  useEffect(() => {
    const was = document.title;
    document.title = 'Образец — Толедот';
    return () => void (document.title = was);
  }, []);
  return (
    <div class="specimen">
      <header class="spec-head">
        <h1>Образец атласа</h1>
        <p class="spec-lead">
          {typo(
            'Кегли, цвета обеих тем, органы управления во всех состояниях, условные знаки и состояния карточки. Всё собрано из тех же компонентов и функций рисования, что и атлас. Образец — эталон для снимков экрана (ТЗ § 5.7).',
          )}
        </p>
        <div class="spec-bar">
          <span class="spec-cap" aria-hidden="true">
            Тема страницы
          </span>
          <Segmented label="Тема страницы" options={[{ value: 'night', label: 'ночь' }, { value: 'day', label: 'день' }]} value={theme.value} onChange={(v) => (theme.value = v)} />
          <button type="button" class="cmd" onClick={() => (location.hash = '#/')}>
            К атласу
          </button>
        </div>
      </header>
      <main>
        <section aria-labelledby="spec-h-type">
          <h2 id="spec-h-type">Кегли</h2>
          <p class="spec-note">{typo('Восемь ступеней шкалы. Кегль и интерлиньяж измерены на самом образце; 11,5 — только на холсте.')}</p>
          <TypeScale />
        </section>
        <section aria-labelledby="spec-h-colors">
          <h2 id="spec-h-colors">Цвета</h2>
          <p class="spec-note">
            {typo(
              'Контраст — по той же формуле и тем же парам, что проверка npm run -s contrast. Пороги: текст — 4,5 : 1, знаки и линии со смыслом — 3 : 1, край листа и рамка сегментов — 2,2 : 1, плоскости — 1,15 и 1,1 : 1.',
            )}
          </p>
          <Themes>{() => <Colors />}</Themes>
        </section>
        <section aria-labelledby="spec-h-controls">
          <h2 id="spec-h-controls">Органы управления</h2>
          <p class="spec-note">{typo('Наведение, нажатие и фокус показаны без указателя: те же правила стилей, что у настоящих :hover, :active и :focus-visible.')}</p>
          <Themes>{(m) => <Controls map={m} />}</Themes>
        </section>
        <section aria-labelledby="spec-h-signs">
          <h2 id="spec-h-signs">Условные знаки и линии</h2>
          <p class="spec-note">
            {typo('Нарисованы теми же функциями, что небо: drawGlyph, buildRibbons, drawStrands, drawLifeTrail, drawDescent, drawBracket и drawMarriage.')}
          </p>
          <Themes>{(m) => <Signs map={m} />}</Themes>
        </section>
        <section aria-labelledby="spec-h-card">
          <h2 id="spec-h-card">Карточка</h2>
          <CardStates />
        </section>
        <section aria-labelledby="spec-h-tabs">
          <h2 id="spec-h-tabs">Вкладки закреплённых карточек</h2>
          <p class="spec-note">
            {typo(
              'Решение 91: закреплённая карточка при выборе другого лица сворачивается в строку вверху листа — цветная метка, имя с уточнением, «×». Восемь цветов спокойной палитры (--tab-1 … --tab-8), раскрыта вторая вкладка.',
            )}
          </p>
          <Themes>{() => <TabsSpecimen />}</Themes>
        </section>
      </main>
    </div>
  );
}
