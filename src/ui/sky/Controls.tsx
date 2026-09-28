/**
 * Органы неба: блок в правом нижнем углу широкого неба и колонка кнопок 44 × 44 у узкого (C6; MOB-05, MOB-25, IX-56),
 * лист «Вид» над блоком или у колонки. Лист «Вид» — всплывающий на обеих ширинах (IX-80): открыт, пока viewOpen; в адрес
 * и историю не пишется; закрывают его «Вид», Escape, «×» у колонки и нажатие мимо.
 */
import { byId, modelInfo } from '../../data/atlas.ts';
import { lambda, modelId, onlyLines, panel, epochMode, selected } from '../../state.ts';
import { num, typo } from '../text/typo.ts';
import { Menu } from '../controls.tsx';
import { Sheet } from '../panels/Sheet.tsx';
import { LANES_STEP, TIME_STEP, introOpen, resetProportions, showAll, stretchBy, zoomBy } from './view.ts';
import { SKY_MODES, addToWork, foldDesc, foldGroups, skyMode, unfoldAll, workSet } from '../work.ts';
import { KEY_IDS, STARTS, atlasView, openPerson, start, startWith, type AtlasView, type Start } from '../reveal.ts';
import { lanesText } from './Overlays.tsx';
import { plural, skyRef, viewTick } from '../common.tsx';
import { canFill, grid, skyFull, toggleFull } from '../layout.ts';
import type { Axis } from '../../render/camera.ts';
import { batch, signal } from '@preact/signals';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isTextField } from '../keys.ts';

// ---------- масштаб по осям (J1) и «Небо во весь экран» (J2) ----------

/** Пара «−» и «+» одной оси: выключенная кнопка остаётся в порядке Tab (aria-disabled), чтобы фокус не пропадал на краю. */
function AxisPair({ axis }: { axis: Axis }) {
  // органы следят за камерой: у края масштаба кнопка выключается
  void viewTick.value;
  const sky = skyRef.current;
  const can = (dir: 1 | -1) => !sky || !sky.model || sky.cam.canStretch(axis, dir);
  const time = axis === 'time';
  const btn = (dir: 1 | -1) => {
    const off = !can(dir);
    const label = time ? (dir > 0 ? 'Растянуть время' : 'Сжать время') : dir > 0 ? 'Строки выше' : 'Строки ниже';
    const key = `${time ? 'Shift' : 'Alt'} и ${dir > 0 ? '+' : '−'}`;
    return (
      <button
        type="button"
        aria-label={label}
        title={`${label} (${key})`}
        aria-disabled={off ? 'true' : undefined}
        aria-keyshortcuts={`${time ? 'Shift' : 'Alt'}+${dir > 0 ? 'Equal' : 'Minus'}`}
        onClick={() => {
          if (!off) stretchBy(axis, dir > 0 ? (time ? TIME_STEP : LANES_STEP) : 1 / (time ? TIME_STEP : LANES_STEP));
        }}
      >
        {dir > 0 ? '+' : '−'}
      </button>
    );
  };
  return (
    <span class="pair">
      {btn(-1)}
      {btn(1)}
    </span>
  );
}

/**
 * «Пропорции по умолчанию»: высота строк снова следует за масштабом времени. Доступна, пока заданная пропорция не 1,
 * даже если на этом масштабе она упирается в край и не видна (IX-61); рядом — её значение: «строки ×0,5».
 */
function ResetProportions({ label = 'по умолчанию' }: { label?: string }) {
  void viewTick.value;
  const cam = skyRef.current?.cam;
  const off = !cam || Math.abs(cam.lanes - 1) < 1e-3;
  return (
    <>
      {/* значение — текстом перед командой: его читает и диктор, название команды не меняется */}
      {!off && <span class="lanes-now">{lanesText(cam!.lanes)}</span>}
      <button
        type="button"
        class="cmd reset"
        aria-label="Пропорции по умолчанию"
        title="Пропорции по умолчанию (двойной щелчок по буквам строк)"
        aria-disabled={off ? 'true' : undefined}
        onClick={() => !off && resetProportions()}
      >
        {label}
      </button>
    </>
  );
}

/**
 * «Приблизить» и «Отдалить» (IX-62): у предела масштаба кнопка выключена (aria-disabled, в порядке Tab) и говорит почему.
 */
function ZoomButton({ dir }: { dir: 1 | -1 }) {
  void viewTick.value;
  const sky = skyRef.current;
  const off = !!sky && !!sky.model && !sky.cam.canStretch('time', dir);
  const label = dir > 0 ? 'Приблизить' : 'Отдалить';
  const title = off ? (dir > 0 ? 'Ближе нельзя: 20 лет на экран' : 'Дальше нельзя: всё небо') : `${label} (${dir > 0 ? '+' : '−'})`;
  return (
    <button type="button" aria-label={label} title={title} aria-disabled={off ? 'true' : undefined} onClick={() => !off && zoomBy(dir > 0 ? STEP : 1 / STEP)}>
      {dir > 0 ? '+' : '−'}
    </button>
  );
}

/**
 * Пояснения флажков и переключателя неба (UX-21): при наведении (title) и для диктора (aria-description), как у команд
 * верхней строки.
 */
export const SKY_HINTS = {
  lines: 'Только две родословные линии Иисуса Христа — по Матфею (Мф 1) и по Луке (Лк 3) — и места, где они расходятся и сходятся',
  tiers: 'Над небом — ярусы по годам: эпохи, судьи, цари Иудеи и Израиля, служения пророков, события',
  all: 'Небо показывает всех лиц атласа',
  work: 'Небо показывает только лица рабочего набора («В работе»)',
} as const;

/** Переключатель неба «все лица | набор» (решение 26; J4): тот же в блоке, в листе «Вид» и в панели «В работе». */
export function SkyModeSwitch() {
  const v = skyMode.value;
  return (
    <div class="seg" role="group" aria-label="Что показывает небо">
      {SKY_MODES.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === v} title={SKY_HINTS[o.value]} aria-description={SKY_HINTS[o.value]} onClick={() => (skyMode.value = o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- вид атласа: небо или древо (решение 73) ----------

/** Два вида главной области: пояснение каждого — в подсказке и для диктора (UX-21). */
export const VIEWS: readonly { value: AtlasView; label: string; hint: string }[] = [
  { value: 'sky', label: 'Небо', hint: 'Звёздное небо: по горизонтали время, звёзды — лица, созвездия — роды и колена' },
  { value: 'tree', label: 'Древо', hint: 'Древо карточек: лица и их союзы слева направо, ветви раскрываются по щелчку' },
];

/**
 * Что делает переход к виду v (чистая часть showView): «Небо» — те же раскрытые лица на небе «набор» с картушами
 * союзов (кроме начала «Всё небо»: там небо остаётся каким было); «Древо» строится из раскрытых лиц — если их нет,
 * древо начинается с выбранного лица, а без него вступление предлагает начало.
 */
export function viewPlan(v: AtlasView, o: { start: Start | null; set: number; selected: string | null }): { mode?: 'work'; seed?: string; intro?: boolean } {
  if (v === 'sky') return !!o.start && o.start !== 'all' && o.set > 0 ? { mode: 'work' } : {};
  if (o.set > 0) return {};
  return o.selected ? { seed: o.selected } : { intro: true };
}

/** Показать небо или древо (переключатель «Небо | Древо», решение 73); одно состояние раскрытия на оба вида. */
export function showView(v: AtlasView) {
  if (atlasView.peek() === v) return;
  const plan = viewPlan(v, { start: start.peek(), set: workSet.peek().size, selected: selected.peek() });
  batch(() => {
    viewOpen.value = false;
    atlasView.value = v;
    if (plan.mode) skyMode.value = plan.mode;
    if (plan.seed) {
      addToWork(plan.seed);
      openPerson(plan.seed);
    }
    if (plan.intro) introOpen.value = true;
  });
}

/**
 * Переключатель «Небо | Древо» (решение 73): в верхней строке на широком экране, в «Разделах» на телефоне. Нажатая
 * кнопка — нынешний вид (aria-pressed), как у «Ночь | День».
 */
export function ViewSwitch() {
  const v = atlasView.value;
  return (
    <div class="seg viewswitch" role="group" aria-label="Вид атласа">
      {VIEWS.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === v} title={o.hint} aria-description={o.hint} onClick={() => showView(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- начало (решение 68): пять начал и «Начать заново» ----------

/**
 * Короткое пояснение начала — строкой под названием во вступлении и в панели «В работе»; полное (STARTS[].hint) — в
 * подсказке кнопки и для диктора.
 */
export function startNote(s: Start): string {
  const n = byId.size;
  return {
    adam: 'только Адам; союзы и дети — по щелчку',
    jesus: 'от Иисуса Христа вверх, к предкам',
    lines: 'обе линии, по Матфею и по Луке',
    key: `главные лица Писания, ${num(KEY_IDS.length)} ${plural(KEY_IDS.length, 'лицо', 'лица', 'лиц')}`,
    all: `все ${num(n)} ${plural(n, 'лицо', 'лица', 'лиц')} сразу`,
  }[s];
}

/** Нужно ли подтверждение (решение 68): начало, кроме «всего неба», заменяет набор, а в наборе больше одного лица. */
export const needsConfirm = (s: Start, n: number) => s !== 'all' && n > 1;
/** Вопрос подтверждения: «Набор из 12 лиц будет заменён», «Набор из 21 лица будет заменён». */
export const replaceText = (n: number) => `Набор из ${num(n)} ${plural(n, 'лица', 'лиц', 'лиц')} будет заменён`;

/** Лист «Вид» открыт командой «Начать заново…»: фокус — на разделе «Начало» (StartList листа). */
export const startsFocus = signal(false);

/**
 * «Начать заново…» (решение 68): лист «Вид» на разделе «Начало» — тот же выбор из пяти начал. Команда верхней строки
 * («Ещё», «Разделы» телефона), строки режима «набор» у кромки неба и укороченного вступления. На телефоне открытая панель
 * уступает место листу. В древе листа «Вид» нет (решение 73): выбор начала — во вступлении, фокус — на текущем начале.
 */
export function openStarts() {
  if (grid.peek().phone && panel.peek()) panel.value = null;
  startsFocus.value = true;
  if (atlasView.peek() === 'tree') introOpen.value = true;
  else viewOpen.value = true;
}

/**
 * Пять начал (решение 68): по кнопке на начало, текущее отмечено (aria-current). Начало, которое заменяет набор больше
 * чем из одного лица, сначала спрашивает: «Набор из N лиц будет заменён — начать заново | отмена». notes — короткое
 * пояснение строкой под названием (вступление, «В работе»); без него пояснение — в подсказке. onDone — после выбора
 * (свернуть вступление, закрыть лист «Вид»). focus — фокус на текущее начало (или первое) при появлении.
 */
export function StartList({ notes = false, label = 'Начало', onDone, focus = false }: { notes?: boolean; label?: string; onDone?: (s: Start) => void; focus?: boolean }) {
  const [ask, setAsk] = useState<Start | null>(null);
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const yes = useRef<HTMLButtonElement>(null);
  // после «отмены» фокус возвращается на начало, о котором спрашивали
  const back = useRef<Start | null>(null);
  const n = workSet.value.size;
  const cur = start.value;
  useLayoutEffect(() => {
    if (ask) yes.current?.focus({ preventScroll: true });
    else if (back.current) {
      list.current?.querySelector<HTMLElement>(`button[data-start="${back.current}"]`)?.focus({ preventScroll: true });
      back.current = null;
    }
  }, [ask]);
  useEffect(() => {
    if (!focus || !list.current) return;
    // весь список — в видимую часть листа (на телефоне лист «Вид» прокручивается), фокус — на текущее начало
    list.current.scrollIntoView({ block: 'nearest' });
    const b = list.current.querySelector<HTMLElement>('button[aria-current="true"]') ?? list.current.querySelector<HTMLElement>('button');
    b?.focus({ preventScroll: true });
  }, [focus]);
  const go = (s: Start) => {
    // список остаётся (панель «В работе») — фокус на выбранном начале, а не на исчезнувшей кнопке вопроса
    back.current = s;
    setAsk(null);
    // набор начала (src/ui/reveal.ts); камеру на новый набор ставит само небо (SkyView)
    startWith(s);
    onDone?.(s);
  };
  if (ask)
    return (
      <div class="starts-ask" role="group" aria-labelledby={id}>
        <span class="q" id={id}>
          {typo(replaceText(n))}
        </span>
        <span class="dash" aria-hidden="true">
          —
        </span>
        <button type="button" class="cmd" ref={yes} onClick={() => go(ask)}>
          начать заново
        </button>
        <button
          type="button"
          class="cmd"
          onClick={() => {
            back.current = ask;
            setAsk(null);
          }}
        >
          отмена
        </button>
      </div>
    );
  return (
    <ul class={notes ? 'starts notes' : 'starts'} ref={list} aria-label={label}>
      {STARTS.map((o) => (
        <li key={o.value}>
          <button
            type="button"
            data-start={o.value}
            aria-current={o.value === cur ? 'true' : undefined}
            aria-label={o.label}
            aria-description={typo(o.hint)}
            title={typo(o.hint)}
            onClick={() => (needsConfirm(o.value, n) ? setAsk(o.value) : go(o.value))}
          >
            <span class="nm">{o.label}</span>
            {notes && <span class="note">{typo(startNote(o.value))}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** «Во весь экран» (J2, клавиша F): панель и карточка — корешки. Есть, только если сворачивать есть что. */
function FullCommand({ label }: { label: string }) {
  if (!canFill.value && !skyFull.value) return null;
  return (
    <button type="button" class="cmd full" aria-pressed={skyFull.value} title="Небо во весь экран: панель и карточка — корешками (F)" aria-keyshortcuts="F" onClick={() => toggleFull()}>
      {label}
    </button>
  );
}

/** «Развернуть всё» (J5): есть ли на небе свёрнутые потомки или созвездия. */
const anyFolded = () => foldDesc.value.length + foldGroups.value.length > 0;
function UnfoldAll() {
  return (
    <button type="button" class="cmd" title="Развернуть свёрнутых потомков и созвездия" onClick={unfoldAll}>
      развернуть всё
    </button>
  );
}

/**
 * Уже этой ширины небо получает вместо блока органов колонку кнопок 44 × 44 и лист «Вид» (IX-56, VIS-51): блок в две
 * строки занимал бы больше двух третей низа неба и закрывал подписи. Колонка — и всегда на телефоне (с учётом листа
 * карточки) и на низком экране (альбомный телефон, масштаб 200 %; MOB-26, MOB-46).
 */
export const COLUMN_BELOW = 760;
/** Низкое окно (альбомная ориентация, масштаб 200 %): органы — колонкой (MOB-26). */
export const SHORT_BELOW = 520;
/** Колонка или блок: по ширине неба, по сетке телефона и по высоте окна. */
export const useColumn = (skyW: number, phone: boolean, winH: number) => skyW > 0 && (skyW < COLUMN_BELOW || phone || winH <= SHORT_BELOW);
/** Шаг масштаба кнопок и клавиш: ×2 за 250 мс (IX-02); привязка — выбранное лицо, если видно, иначе середина неба. */
const STEP = 2;

/** Масштаб времени: пояснение каждого сегмента — в title (UX-08). */
const SCALES = [
  { value: 1, label: 'по насыщенности', title: 'Время растянуто там, где много лиц: шкала неравномерная (≈ у масштабной линейки)' },
  { value: 0, label: 'истинный', title: 'Равномерная шкала: каждый год одной ширины' },
] as const;

const toggleEpochsPanel = () => (panel.value = panel.value === 'epochs' ? null : 'epochs');

/** Флажок слоя неба с пояснением (UX-21): подпись и квадрат нажимаются вместе, как у Check (src/ui/controls.tsx). */
function HintCheck({ checked, onChange, hint, children }: { checked: boolean; onChange: (v: boolean) => void; hint: string; children: string }) {
  return (
    <label class="check" title={hint}>
      <input type="checkbox" checked={checked} aria-description={hint} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      {children}
    </label>
  );
}

/** Флажки слоёв неба: линии Мессии и ярусы эпох. */
function LayerChecks() {
  return (
    <>
      <HintCheck checked={onlyLines.value} onChange={(v) => (onlyLines.value = v)} hint={SKY_HINTS.lines}>
        только линии Мессии
      </HintCheck>
      <HintCheck checked={epochMode.value} onChange={(v) => (epochMode.value = v)} hint={SKY_HINTS.tiers}>
        ярусы эпох
      </HintCheck>
    </>
  );
}

/** Переключатель масштаба времени: сегменты .seg, как у Segmented, с пояснением в title (UX-08). */
function ScaleSwitch() {
  const v = lambda.value === 0 ? 0 : 1;
  return (
    <div class="seg" role="group" aria-label="Масштаб времени">
      {SCALES.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === v} title={o.title} onClick={() => (lambda.value = o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Модель хронологии: список моделей с пояснениями из данных (modelInfo); тот же выбор — в «О карте». */
function ModelMenu() {
  const cur = modelInfo.find((m) => m.id === modelId.value) ?? modelInfo[0];
  return (
    <Menu
      class="model"
      label={cur?.name ?? ''}
      title="Модель хронологии"
      radio
      items={modelInfo.map((m) => ({ key: m.id, label: m.name, note: typo(m.description), checked: m.id === modelId.value, onSelect: () => (modelId.value = m.id) }))}
    />
  );
}

/** Лист «Вид» над блоком органов неба открыт (широкое небо). SkyView замеряет его как резерв неба. */
export const viewOpen = signal(false);

/**
 * Лист «Вид» над блоком (широкое небо): редкие настройки — масштаб времени, пропорции (J1), хронология и «Эпохи»,
 * «во весь экран» (J2). Непрозрачный, с рамкой, как блок; не модальный: Escape и нажатие вне блока его закрывают,
 * фокус возвращается на «Вид». Список моделей раскрывается вверх — над листом.
 */
/**
 * Как закрывается лист «Вид» (IX-65, IX-80) — одинаково у блока и у колонки: нажатие мимо листа и его органов (own —
 * блок с листом или колонка с листом) и Escape. Escape — одно видимое состояние (D5): сначала открытый список моделей
 * (его закрывает Menu), затем лист. Фокус в другом слое (панель, карточка, поиск) — Escape снимает сначала тот слой, лист
 * остаётся. Закрыли из листа — фокус на «Вид».
 */
function useViewDismiss(sheet: { current: HTMLElement | null }, own: () => Element[], toggle: () => HTMLElement | null) {
  useEffect(() => {
    const close = (back: boolean) => {
      viewOpen.value = false;
      if (back) toggle()?.focus({ preventScroll: true });
    };
    const inside = (n: Node | null) => !!n && own().some((b) => b.contains(n));
    const away = (e: PointerEvent) => {
      if (sheet.current && !inside(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented) return;
      // в поле ввода Escape принадлежит полю (D5); открытый список моделей закрывает сам Menu
      if (isTextField(e.target) || sheet.current?.querySelector('[role="menu"]')) return;
      const a = document.activeElement;
      const inPop = inside(a);
      const loose = !a || a === document.body || !!(a instanceof HTMLElement && a.closest('.sky') && !a.closest('.sheet, .folio'));
      if (!inPop && !loose) return;
      e.preventDefault();
      close(inPop);
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}

function ViewPop({ toggle }: { toggle: { current: HTMLButtonElement | null } }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewDismiss(
    ref,
    () => [ref.current?.closest('.skyctl')].filter((x): x is Element => !!x),
    () => toggle.current,
  );
  return (
    <div class="viewpop" id="sky-viewpop" ref={ref} role="group" aria-label="Вид неба: масштаб времени, пропорции, хронология, начало" data-reserve="view">
      <span class="lbl scale-lbl" aria-hidden="true">
        Масштаб времени
      </span>
      <ScaleSwitch />
      <span class="lbl axes-lbl" aria-hidden="true">
        Пропорции
      </span>
      <div class="axes" role="group" aria-label="Масштаб по осям">
        <span class="ax" aria-hidden="true">
          время
        </span>
        <AxisPair axis="time" />
        <span class="ax" aria-hidden="true">
          высота строк
        </span>
        <AxisPair axis="lanes" />
        <ResetProportions />
      </div>
      <span class="lbl chrono-lbl" aria-hidden="true">
        Хронология
      </span>
      <div class="chrono">
        <ModelMenu />
        {/* команда листа закрывает лист (IX-65): открытая панель «Эпохи» не лежит под ним */}
        <button
          type="button"
          class="cmd"
          aria-pressed={panel.value === 'epochs'}
          title="Эпохи и их основания"
          onClick={() => {
            toggleEpochsPanel();
            viewOpen.value = false;
          }}
        >
          Эпохи
        </button>
      </div>
      {/* начало (решение 68): те же пять начал, что во вступлении; «Начать заново…» открывает лист на этом разделе */}
      <span class="lbl start-lbl" aria-hidden="true">
        Начало
      </span>
      <div class="start-box">
        <StartsHere />
      </div>
      <div class="full-row">
        <FullCommand label="небо во весь экран" />
      </div>
    </div>
  );
}

/**
 * Раздел «Начало» листа «Вид»: пять начал; выбор закрывает лист, фокус — на «Вид», как после Escape. Лист открыт
 * командой «Начать заново…» (startsFocus) — фокус на текущем начале.
 */
function StartsHere() {
  const f = startsFocus.value;
  useEffect(() => {
    if (f) startsFocus.value = false;
  }, [f]);
  const done = () => {
    const had = !!document.activeElement?.closest('.viewpop, .sheet');
    viewOpen.value = false;
    if (had) document.querySelector<HTMLElement>('.sky .skyctl .view-toggle, .sky .skyctl.column button[aria-expanded]')?.focus({ preventScroll: true });
  };
  return <StartList focus={f} onDone={done} />;
}

/**
 * Органы неба (C6; VIS-21, VIS-22, IX-36, IX-37, UX-05): непрозрачный лист с рамкой в правом нижнем углу неба,
 * над полосой времени. На небе — частое, в две строки: слои, масштаб неба и «Всё небо»; что на небе (J4) и «Вид».
 * Редкое — масштаб времени, пропорции полос и времени (J1), модель хронологии и «Эпохи», «во весь экран» (J2) — в листе
 * «Вид» над блоком (ViewPop): блок не растёт в стену кнопок и меньше закрывает небо.
 */
export function SkyControls() {
  const toggle = useRef<HTMLButtonElement>(null);
  const open = viewOpen.value;
  return (
    // data-reserve: под блоком подписи и указатели у края не рисуются (C6), SkyView замеряет его прямоугольник
    <div class="skyctl" role="group" aria-label="Вид неба" data-reserve="controls">
      <div class="layers">
        <LayerChecks />
      </div>
      <div class="zoom">
        <ZoomButton dir={-1} />
        <ZoomButton dir={1} />
        <button type="button" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
          Всё небо
        </button>
      </div>
      {/* что показывает небо (J4): все лица или только рабочий набор; «развернуть всё» — если что-то свёрнуто (J5) */}
      <span class="lbl work-lbl" aria-hidden="true">
        На небе
      </span>
      <div class="work">
        <SkyModeSwitch />
        {anyFolded() && <UnfoldAll />}
      </div>
      <button
        type="button"
        class="cmd view-toggle"
        ref={toggle}
        aria-expanded={open}
        aria-controls={open ? 'sky-viewpop' : undefined}
        title="Масштаб времени, пропорции, хронология, начало"
        onClick={() => (viewOpen.value = !open)}
      >
        Вид
      </button>
      {open && <ViewPop toggle={toggle} />}
    </div>
  );
}

/**
 * Узкое небо (телефон; планшет с карточкой): колонка кнопок 44 × 44 у правого края, остальное — в листе «Вид» (MOB-05,
 * MOB-25). Лист «Вид» — всплывающий у колонки, как у блока на широком небе (IX-80): открыт, пока viewOpen, без записи
 * в истории; «назад» браузера его не закрывает, адрес не меняется. Прежний адрес с «~pview» открывает этот же лист.
 */
export function SkyColumn() {
  const col = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = viewOpen.value;
  // адрес прежних выпусков с «~pview» (панель «Вид»): тот же лист, без панели
  useEffect(() => {
    if (panel.value !== 'view') return;
    panel.value = null;
    viewOpen.value = true;
  }, [panel.value]);
  return (
    <>
      <div class="skyctl column" role="group" aria-label="Вид неба" data-reserve="controls" ref={col}>
        <ZoomButton dir={1} />
        <ZoomButton dir={-1} />
        <button type="button" class="all" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
          Всё небо
        </button>
        <button type="button" ref={toggle} aria-expanded={open} title="Масштаб времени, пропорции, хронология, начало" onClick={() => (viewOpen.value = !open)}>
          Вид
        </button>
      </div>
      {open && <ViewSheet col={col} toggle={toggle} />}
    </>
  );
}

/**
 * Лист «Вид» на узком небе (MOB-05): слои, масштаб времени, пропорции (J1), «небо во весь экран» (J2, не на телефоне),
 * модель хронологии — списком с пояснениями, «Эпохи и их основания», что на небе (J4). Лист не выше неба под колонкой кнопок.
 * Не панель атласа (IX-80): закрывают его «×», «Вид», Escape и нажатие мимо листа и колонки, фокус возвращается на «Вид».
 */
export function ViewSheet({ col, toggle }: { col?: { current: HTMLDivElement | null }; toggle?: { current: HTMLButtonElement | null } }) {
  const wrap = useRef<HTMLDivElement>(null);
  // «Вид» колонки — и если лист отрисован не колонкой (SkyView по прежней панели «Вид»)
  const toggleEl = () => toggle?.current ?? document.querySelector<HTMLElement>('.sky .skyctl.column button[aria-expanded]');
  useViewDismiss(
    wrap,
    () => [wrap.current?.closest('.sheet'), col?.current ?? document.querySelector('.sky .skyctl.column')].filter((x): x is Element => !!x),
    toggleEl,
  );
  const close = () => {
    viewOpen.value = false;
    if (panel.peek() === 'view') panel.value = null;
    toggleEl()?.focus({ preventScroll: true });
  };
  return (
    <Sheet title="Вид" reserve onClose={close}>
      <div class="viewctl" ref={wrap}>
        <div class="checks">
          <LayerChecks />
        </div>
        <h3>Масштаб времени</h3>
        <ScaleSwitch />
        {/* масштаб по осям (J1): пальцами — щипок по горизонтали или по вертикали; «по умолчанию» — в строке заголовка,
            чтобы лист не рос; «во весь экран» (J2) — не на телефоне */}
        <div class="axes-head">
          <h3>Пропорции</h3>
          <ResetProportions />
        </div>
        <div class="axes" role="group" aria-label="Масштаб по осям">
          <span class="ax" aria-hidden="true">
            время
          </span>
          <AxisPair axis="time" />
          <span class="ax" aria-hidden="true">
            высота строк
          </span>
          <AxisPair axis="lanes" />
        </div>
        <FullCommand label="небо во весь экран" />
        {/* модель — тем же списком с пояснениями, что у блока на широком небе: четыре кнопки и абзац пояснения делали лист
            выше неба над ним, а пояснение каждой модели и так стоит в её пункте списка */}
        <h3>Хронология</h3>
        <div class="model-row">
          <ModelMenu />
        </div>
        <div class="cmds">
          {/* панель «Эпохи» — колонка сетки или лист телефона: лист «Вид» уступает ей место */}
          <button
            type="button"
            class="cmd"
            onClick={() => {
              viewOpen.value = false;
              panel.value = 'epochs';
            }}
          >
            Эпохи и их основания
          </button>
        </div>
        {/* что показывает небо (J4) и «развернуть всё» (J5) — последней строкой: слои, масштаб и хронология остаются на своих
            местах, лист не становится выше неба над ним */}
        <div class="work-sky">
          <span class="k">На небе:</span>
          <SkyModeSwitch />
          {anyFolded() && <UnfoldAll />}
        </div>
        {/* начало (решение 68) — последним разделом: прежние строки листа остаются на своих местах */}
        <h3>Начало</h3>
        <StartsHere />
      </div>
    </Sheet>
  );
}
