/**
 * Органы неба: блок в правом нижнем углу широкого неба и колонка кнопок 44 × 44 у узкого (C6; MOB-05, MOB-25, IX-56),
 * лист «Вид» над блоком или у колонки.
 */
import { modelInfo } from '../../data/atlas.ts';
import { lambda, modelId, onlyLines, panel, epochMode } from '../../state.ts';
import { typo } from '../text/typo.ts';
import { Check, Menu, Segmented } from '../controls.tsx';
import { Sheet } from '../panels/Sheet.tsx';
import { LANES_STEP, TIME_STEP, resetProportions, showAll, stretchBy, zoomBy } from './view.ts';
import { SKY_MODES, foldDesc, foldGroups, skyMode, unfoldAll } from '../work.ts';
import { lanesText } from './Overlays.tsx';
import { skyRef, viewTick } from '../common.tsx';
import { canFill, skyFull, toggleFull } from '../layout.ts';
import type { Axis } from '../../render/camera.ts';
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
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

/** Переключатель неба «все лица | набор» (решение 26; J4): тот же в блоке, в листе «Вид» и в панели «В работе». */
export function SkyModeSwitch() {
  return <Segmented label="Что показывает небо" options={SKY_MODES} value={skyMode.value} onChange={(v) => (skyMode.value = v)} />;
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

/** Флажки слоёв неба: линии Мессии и ярусы эпох. */
function LayerChecks() {
  return (
    <>
      <Check checked={onlyLines.value} onChange={(v) => (onlyLines.value = v)}>
        только линии Мессии
      </Check>
      <Check checked={epochMode.value} onChange={(v) => (epochMode.value = v)}>
        ярусы эпох
      </Check>
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
function ViewPop({ toggle }: { toggle: { current: HTMLButtonElement | null } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (back: boolean) => {
      viewOpen.value = false;
      if (back) toggle.current?.focus({ preventScroll: true });
    };
    const away = (e: PointerEvent) => {
      const box = ref.current?.closest('.skyctl');
      if (box && !box.contains(e.target as Node)) close(false);
    };
    // Escape — одно видимое состояние (D5): сначала открытый список моделей (его закрывает Menu), затем лист. Фокус в
    // другом слое (панель, карточка, поиск) — Escape снимает сначала тот слой, лист остаётся (IX-65)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented) return;
      // в поле ввода Escape принадлежит полю (D5); открытый список моделей закрывает сам Menu
      if (isTextField(e.target) || ref.current?.querySelector('[role="menu"]')) return;
      const a = document.activeElement;
      const inPop = !!ref.current?.closest('.skyctl')?.contains(a);
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
  return (
    <div class="viewpop" id="sky-viewpop" ref={ref} role="group" aria-label="Вид неба: масштаб времени, пропорции, хронология" data-reserve="view">
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
      <div class="full-row">
        <FullCommand label="небо во весь экран" />
      </div>
    </div>
  );
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
        title="Масштаб времени, пропорции, хронология"
        onClick={() => (viewOpen.value = !open)}
      >
        Вид
      </button>
      {open && <ViewPop toggle={toggle} />}
    </div>
  );
}

/** Узкое небо (телефон; планшет с карточкой): колонка кнопок 44 × 44 у правого края, остальное — в листе «Вид» (MOB-05, MOB-25). */
export function SkyColumn() {
  return (
    <div class="skyctl column" role="group" aria-label="Вид неба" data-reserve="controls">
      <ZoomButton dir={1} />
      <ZoomButton dir={-1} />
      <button type="button" class="all" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
        Всё небо
      </button>
      <button type="button" aria-pressed={panel.value === 'view'} onClick={() => (panel.value = panel.value === 'view' ? null : 'view')}>
        Вид
      </button>
    </div>
  );
}

/**
 * Лист «Вид» на узком небе (MOB-05): слои, масштаб времени, пропорции (J1), «небо во весь экран» (J2, не на телефоне),
 * модель хронологии — списком с пояснениями, «Эпохи и их основания», что на небе (J4). Лист не выше неба под колонкой кнопок.
 */
export function ViewSheet() {
  return (
    <Sheet title="Вид" reserve>
      <div class="viewctl">
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
          <button type="button" class="cmd" onClick={() => (panel.value = 'epochs')}>
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
      </div>
    </Sheet>
  );
}
