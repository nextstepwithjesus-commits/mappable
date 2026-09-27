/**
 * Уже этой ширины небо получает вместо блока органов колонку кнопок 44 × 44 и лист «Вид» (C6; MOB-05, MOB-25):
 * телефон и планшет с открытой карточкой.
 */
import { modelInfo } from '../../data/atlas.ts';
import { lambda, modelId, onlyLines, panel, epochMode } from '../../state.ts';
import { typo } from '../text/typo.ts';
import { Check, Menu, Segmented } from '../controls.tsx';
import { Sheet } from '../panels/Sheet.tsx';
import { showAll, zoomBy } from './view.ts';
import { SkyModeSwitch } from '../panels/Work.tsx';
import { foldDesc, foldGroups, unfoldAll } from '../work.ts';

/** «Развернуть всё» (J5): есть ли на небе свёрнутые потомки или созвездия. */
const anyFolded = () => foldDesc.value.length + foldGroups.value.length > 0;
function UnfoldAll() {
  return (
    <button type="button" class="cmd" title="Развернуть свёрнутых потомков и созвездия" onClick={unfoldAll}>
      развернуть всё
    </button>
  );
}

export const COLUMN_BELOW = 520;
/** Шаг масштаба кнопок и клавиш: ×2 за 250 мс (IX-02); привязка — выбранное лицо, если видно, иначе середина неба. */
const STEP = 2;

const SCALES = [
  { value: 1, label: 'по насыщенности' },
  { value: 0, label: 'истинный' },
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

function ScaleSwitch() {
  return <Segmented label="Масштаб времени" options={SCALES} value={lambda.value === 0 ? 0 : 1} onChange={(v) => (lambda.value = v)} />;
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

/**
 * Органы неба (C6; VIS-21, VIS-22, IX-36, IX-37, UX-05): непрозрачный лист с рамкой в правом нижнем углу неба,
 * над полосой времени. Слои, масштаб времени, модель хронологии, масштаб неба и «Всё небо»; «Эпохи» — панель
 * с основаниями эпох (прежде её открывала команда «Эпохи» верхней строки).
 */
export function SkyControls() {
  return (
    // data-reserve: под блоком подписи и указатели у края не рисуются (C6), SkyView замеряет его прямоугольник
    <div class="skyctl" role="group" aria-label="Вид неба" data-reserve="controls">
      <div class="layers">
        <LayerChecks />
      </div>
      <div class="zoom">
        <button type="button" aria-label="Отдалить" title="Отдалить (−)" onClick={() => zoomBy(1 / STEP)}>
          −
        </button>
        <button type="button" aria-label="Приблизить" title="Приблизить (+)" onClick={() => zoomBy(STEP)}>
          +
        </button>
        <button type="button" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
          Всё небо
        </button>
      </div>
      <span class="lbl scale-lbl" aria-hidden="true">
        Масштаб времени
      </span>
      <ScaleSwitch />
      <span class="lbl chrono-lbl" aria-hidden="true">
        Хронология
      </span>
      <div class="chrono">
        <ModelMenu />
        <button type="button" class="cmd" aria-pressed={panel.value === 'epochs'} title="Эпохи и их основания" onClick={toggleEpochsPanel}>
          Эпохи
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
    </div>
  );
}

/** Узкое небо (телефон; планшет с карточкой): колонка кнопок 44 × 44 у правого края, остальное — в листе «Вид» (MOB-05, MOB-25). */
export function SkyColumn() {
  return (
    <div class="skyctl column" role="group" aria-label="Вид неба" data-reserve="controls">
      <button type="button" aria-label="Приблизить" title="Приблизить (+)" onClick={() => zoomBy(STEP)}>
        +
      </button>
      <button type="button" aria-label="Отдалить" title="Отдалить (−)" onClick={() => zoomBy(1 / STEP)}>
        −
      </button>
      <button type="button" class="all" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
        Всё небо
      </button>
      <button type="button" aria-pressed={panel.value === 'view'} onClick={() => (panel.value = panel.value === 'view' ? null : 'view')}>
        Вид
      </button>
    </div>
  );
}

/** Лист «Вид» на узком небе: слои, масштаб времени и модель хронологии с пояснением (MOB-05). */
export function ViewSheet() {
  const cur = modelInfo.find((m) => m.id === modelId.value);
  return (
    <Sheet title="Вид" reserve>
      <div class="viewctl">
        <div class="checks">
          <LayerChecks />
        </div>
        <h3>Масштаб времени</h3>
        <ScaleSwitch />
        <h3>Хронология</h3>
        <Segmented label="Модель хронологии" options={modelInfo.map((m) => ({ value: m.id, label: m.name }))} value={modelId.value} onChange={(v) => (modelId.value = v)} />
        {cur && <p class="muted">{cur.description}</p>}
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
