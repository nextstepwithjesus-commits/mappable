/**
 * Органы неба: блок в правом нижнем углу широкого неба и колонка кнопок 44 × 44 у узкого (C6; MOB-05, MOB-25, IX-56),
 * лист «Вид» над блоком или у колонки. Лист «Вид» — всплывающий на обеих ширинах (IX-80): открыт, пока viewOpen; в адрес
 * и историю не пишется; закрывают его «Вид», Escape, «×» у колонки и нажатие мимо.
 */
import { byId } from '../../data/atlas.ts';
import { lambda, modelId, panel, epochMode, layers, LAYER_KEYS, LAYER_NAMES } from '../../state.ts';
import { num, typo } from '../text/typo.ts';
import { Check, Menu } from '../controls.tsx';
import { DEFAULT_MODEL, factsOf, modelItems, modelsFoot } from '../modelinfo.ts';
import { EraSwitch, openChronology } from '../panels/Chronology.tsx';
import '../../styles/chronology.css';
import { Sheet } from '../panels/Sheet.tsx';
import { LANES_STEP, TIME_STEP, resetProportions, showAll, stretchBy, zoomBy } from './view.ts';
import { foldDesc, foldGroups, unfoldAll, workSet } from '../work.ts';
import { KEY_IDS, STARTS, start, startWith, type Start } from '../reveal.ts';
import { lanesText } from './Overlays.tsx';
import { plural, skyRef, viewTick } from '../common.tsx';
import { canFill, grid, skyFull, toggleFull } from '../layout.ts';
import type { Axis } from '../../render/camera.ts';
import { signal } from '@preact/signals';
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
 * Пояснения органов неба (UX-21): при наведении (title) и для диктора (aria-description), как у команд верхней строки.
 * Флажка «только линии Мессии» и переключателя «все лица | набор» больше нет (решение 81): это показы, их выбирает
 * строка показа у верхней кромки неба (src/ui/sky/ShowBar.tsx).
 */
export const SKY_HINTS = {
  tiers: 'Над небом — ярусы по годам: эпохи, судьи, цари Иудеи и Израиля, служения пророков, события',
  fit: 'Вписать: весь нынешний показ в окне (0, Home)',
} as const;

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
    story: 'восемь шагов по эпохам, со стихами',
  }[s];
}

/**
 * Нужно ли подтверждение (решение 68): начало заменяет набор, а в наборе больше одного лица. Набор заменяют только
 * «С Адама» и «С Иисуса Христа» (набор с одного лица); «Родословие Иисуса Христа», «Ключевые лица» и «Всё небо» —
 * показы, набор читателя они не трогают (этап 11, § 5; src/ui/reveal.ts, startWith).
 */
export const needsConfirm = (s: Start, n: number) => (s === 'adam' || s === 'jesus') && n > 1;
/** Вопрос подтверждения: «Набор из 12 лиц будет заменён», «Набор из 21 лица будет заменён». */
export const replaceText = (n: number) => `Набор из ${num(n)} ${plural(n, 'лица', 'лиц', 'лиц')} будет заменён`;

/** Лист «Вид» открыт командой «Начать заново…»: фокус — на разделе «Начало» (StartList листа). */
export const startsFocus = signal(false);

/**
 * «Начать заново…» (решение 68): лист «Вид» на разделе «Начало» — тот же выбор из пяти начал. Команда верхней строки
 * («Ещё», «Разделы» телефона), панели «Набор» и укороченного вступления. На телефоне открытая панель уступает место листу.
 */
export function openStarts() {
  if (grid.peek().phone && panel.peek()) panel.value = null;
  startsFocus.value = true;
  viewOpen.value = true;
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
    // «С Адама» и «С Иисуса Христа» — набор с одного лица, его карточка у звезды открыта (этап 11, § 5): у ромба его
    // союза — «+N»; карточка ждёт звезду, пока небо вписывает новый показ (модуль карточки — без круга импортов)
    if (s === 'adam' || s === 'jesus') {
      const id = s === 'adam' ? 'adam' : 'iisus';
      void import('./DotCard.tsx').then((m) => m.openDot({ kind: 'person', id }, { grace: 1500 }));
    }
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
 * карточки) и на низком экране (альбомный телефон, масштаб 200 %; MOB-26, MOB-46). Этап 14 (решение 150): снятый выбор
 * оставляет карточку вкладкой-корешком 56 px — планшет 768 px без выбранного лица даёт небу 712 px, и блок там
 * по-прежнему в одну строку; поэтому порог — 700, а не 760.
 */
export const COLUMN_BELOW = 700;
/** Низкое окно (альбомная ориентация, масштаб 200 %): органы — колонкой (MOB-26). */
export const SHORT_BELOW = 520;
/** Колонка или блок: по ширине неба, по сетке телефона и по высоте окна. */
export const useColumn = (skyW: number, phone: boolean, winH: number) => skyW > 0 && (skyW < COLUMN_BELOW || phone || winH <= SHORT_BELOW);
/** Шаг масштаба кнопок и клавиш: ×2 за 250 мс (IX-02); привязка — выбранное лицо, если видно, иначе середина неба. */
const STEP = 2;

/**
 * Масштаб времени: пояснение каждого сегмента — в title (UX-08). Этап 13, решение 124: «сжатый по плотности лиц» и
 * «равномерный по годам» вместо «по насыщенности» и «истинный» — «истинный» читался как оценка достоверности.
 */
export const SCALES = [
  { value: 1, label: 'Сжатый по плотности лиц', title: 'Время растянуто там, где много лиц, и сжато там, где их мало: шкала неравномерная (≈ у масштабной линейки)' },
  { value: 0, label: 'Равномерный по годам', title: 'Каждый год одной ширины' },
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

/** Флажок слоя неба: ярусы эпох. Линии Мессии — показ (решение 81), не слой. */
function LayerChecks() {
  return (
    <HintCheck checked={epochMode.value} onChange={(v) => (epochMode.value = v)} hint={SKY_HINTS.tiers}>
      ярусы эпох
    </HintCheck>
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

/** «Меняет: …» → ['Меняет', '…']: слово строки — подписью, как в макете X2 (m3-model). */
const splitRow = (t: string): [string, string] => {
  const i = t.indexOf(': ');
  return i < 0 ? ['', t] : [t.slice(0, i), t.slice(i + 2)];
};
function ItemRow({ text }: { text: string }) {
  const [k, v] = splitRow(text);
  return (
    <span class="mi-row">
      {k && <span class="k">{k}</span>} {typo(v)}
    </span>
  );
}

/**
 * Модель хронологии (этап 13, решение 102): список моделей. У каждой — название, входные числа и что она меняет
 * на небе и в карточках («Меняет», «Напряжения»; числа считает сборка, src/ui/modelinfo.ts); внизу — что не меняет
 * ни одна: Исход (1446) и годы после него. Название модели по умолчанию — «Основной текст: 430 лет в Египте».
 */
function ModelMenu() {
  const cur = factsOf(modelId.value) ?? factsOf(DEFAULT_MODEL);
  const wrap = useRef<HTMLSpanElement>(null);
  // «Сменить модель» из пояснения пометы «расч.» (решение 124): лист «Вид» открыт — список моделей раскрывается сам
  const want = modelsFocus.value;
  useEffect(() => {
    if (!want) return;
    modelsFocus.value = false;
    wrap.current?.querySelector<HTMLButtonElement>('.menu.model > button')?.click();
  }, [want]);
  return (
    <span class="model-wrap" ref={wrap}>
    <Menu
      class="model"
      label={cur?.name ?? ''}
      title="Модель хронологии: что она меняет — в пояснении каждой"
      radio
      foot={typo(modelsFoot())}
      items={modelItems().map((m) => ({
        key: m.id,
        label: m.id === DEFAULT_MODEL ? `${m.name} — по умолчанию` : m.name,
        note: (
          <>
            <span class="mi-in">{typo(m.inputs)}</span>
            {m.years && <ItemRow text={m.years} />}
            {m.changes && <ItemRow text={m.changes} />}
            {m.tensions && <ItemRow text={m.tensions} />}
          </>
        ),
        checked: m.id === modelId.value,
        onSelect: () => (modelId.value = m.id),
      }))}
    />
    </span>
  );
}

/** Просьба раскрыть список моделей, когда лист «Вид» откроется (openModelChoice). */
const modelsFocus = signal(false);
/**
 * «Сменить модель» (решение 124): лист «Вид» с раскрытым списком моделей хронологии. Зовёт пояснение пометы «расч.»
 * у даты (src/ui/common.tsx) рядом со ссылкой «О хронологии». На телефоне открытая панель уступает место листу.
 */
export function openModelChoice() {
  if (grid.peek().phone && panel.peek()) panel.value = null;
  modelsFocus.value = true;
  viewOpen.value = true;
}

/**
 * Слои неба (решение 111): что рисовать — следы жизни, связи, созвездия, эпохи, линии Мессии, напряжения, призраки,
 * подписи. Выбор запоминается; выключенный слой называет строка показа («Скрыто: связи — вернуть»; src/ui/modelinfo.ts).
 */
function LayerList() {
  return (
    <div class="checks layer-list" role="group" aria-label="Слои неба">
      {LAYER_KEYS.map((k) => (
        <Check key={k} checked={layers.value[k] !== false} onChange={(on) => (layers.value = { ...layers.value, [k]: on })}>
          {LAYER_NAMES[k]}
        </Check>
      ))}
    </div>
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
    <div class="viewpop" id="sky-viewpop" ref={ref} role="group" aria-label="Вид неба: масштаб времени, шкала лет, пропорции, хронология, слои, начало" data-reserve="view">
      <span class="lbl scale-lbl" aria-hidden="true">
        Масштаб времени
      </span>
      <ScaleSwitch />
      <span class="lbl era-lbl" aria-hidden="true">
        Шкала лет
      </span>
      <EraSwitch />
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
        <button
          type="button"
          class="cmd"
          aria-pressed={panel.value === 'chronology'}
          title="Как читать годы, откуда они и что меняет модель"
          onClick={() => {
            openChronology();
            viewOpen.value = false;
          }}
        >
          О хронологии
        </button>
      </div>
      {/* слои (решение 111): прежде — в конце «Условных знаков», где их не находили */}
      <span class="lbl layers-lbl" aria-hidden="true">
        Слои
      </span>
      <LayerList />
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
 * над полосой времени. На небе — частое, одной строкой: ярусы эпох, масштаб неба, «Вписать» и «Вид». Что показано на
 * небе, — строка показа у верхней кромки (решение 81). Редкое — масштаб времени, пропорции полос и времени (J1), модель
 * хронологии и «Эпохи», «во весь экран» (J2) — в листе «Вид» над блоком (ViewPop).
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
        {/* «Вписать» — кадр; «Всё небо» — только показ, в строке показа (решение 81) */}
        <button type="button" class="fit" title={SKY_HINTS.fit} aria-keyshortcuts="0 Home" onClick={showAll}>
          Вписать
        </button>
      </div>
      {/* «развернуть всё» — если на небе что-то свёрнуто (J5) */}
      {anyFolded() && (
        <div class="work">
          <UnfoldAll />
        </div>
      )}
      <button
        type="button"
        class="cmd view-toggle"
        ref={toggle}
        aria-expanded={open}
        aria-controls={open ? 'sky-viewpop' : undefined}
        title="Масштаб времени, шкала лет, пропорции, хронология, слои, начало"
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
        <button type="button" class="all fit" title={SKY_HINTS.fit} aria-keyshortcuts="0 Home" onClick={showAll}>
          Вписать
        </button>
        <button type="button" ref={toggle} aria-expanded={open} title="Масштаб времени, шкала лет, пропорции, хронология, слои, начало" onClick={() => (viewOpen.value = !open)}>
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
        <h3>Шкала лет</h3>
        <EraSwitch />
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
          <button
            type="button"
            class="cmd"
            onClick={() => {
              viewOpen.value = false;
              openChronology();
            }}
          >
            О хронологии
          </button>
        </div>
        <h3>Слои</h3>
        <LayerList />
        {/* «развернуть всё» (J5) — последней строкой: слои, масштаб и хронология остаются на своих местах */}
        {anyFolded() && (
          <div class="work-sky">
            <UnfoldAll />
          </div>
        )}
        {/* начало (решение 68) — последним разделом: прежние строки листа остаются на своих местах */}
        <h3>Начало</h3>
        <StartsHere />
      </div>
    </Sheet>
  );
}
