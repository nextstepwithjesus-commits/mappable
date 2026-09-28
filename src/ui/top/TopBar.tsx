import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { panel, theme, type Panel } from '../../state.ts';
import { grid } from '../layout.ts';
import { showAll } from '../sky/view.ts';
import { Menu, Segmented } from '../controls.tsx';
import { Search } from './Search.tsx';
import { workSet } from '../work.ts';
import { plural } from '../common.tsx';
import { WORK_LEAD } from '../panels/Work.tsx';
import { VIEWS, ViewSwitch, openStarts, showView } from '../sky/Controls.tsx';
import { atlasView, type AtlasView } from '../reveal.ts';
import { fitTree } from '../tree/TreeView.tsx';

/** Команда выбора начала (решение 68): в «Ещё» и в «Разделах» телефона, последней; открывает лист «Вид» на «Начале». */
export const RESTART_LABEL = 'Начать заново…';
export const RESTART_HINT = 'Выбрать начало: с Адама, с Иисуса Христа, родословие Иисуса Христа, ключевые лица или всё небо';

/** Надпись команды рабочего набора (UX-48; решение 26): «В работе: 46», пустой набор — «В работе». */
export const workLabel = (n: number) => (n ? `В работе: ${n}` : 'В работе');

/**
 * Однострочные пояснения команд верхней строки (UX-21; решение 9) — подсказка при наведении и описание для диктора.
 * Слова — из вводок самих панелей.
 */
export const HINTS: Record<Exclude<Panel, null>, string> = {
  index: 'Все лица атласа по алфавиту, с атласными координатами',
  // те же слова, что вводка панели (UX-77): набор хранится в памяти браузера — «в этом сеансе» было неправдой
  work: WORK_LEAD.replace(/\.$/, ''),
  chapter: 'Родословные главы в Синодальном переводе: имена — ссылки на карточки',
  synopsis: 'Родословия Иисуса Христа по Матфею и по Луке рядом, по лицам',
  kinship: 'Кем одно лицо приходится другому: степень родства, путь по поколениям и стихи',
  section: 'Один раздел карточки у группы лиц, например «Смерть и погребение» у царей Иудеи',
  legend: 'Как читать карту: что значит каждый знак, линия и надпись на небе',
  about: 'Источник, уровни достоверности, хронология и известные трудности текста',
  epochs: 'Эпохи с годами и основаниями; над небом — ярусы эпох, судей, царей, пророков и событий',
  spread: 'Две карточки рядом',
  view: 'Вид неба',
};

/** Подсказка команды: пояснение, число лиц набора, клавиша. */
function hintOf(c: { id: Exclude<Panel, null>; key?: string }, n: number): string {
  const count = c.id === 'work' ? (n ? ` (в наборе ${n}\u00a0${plural(n, 'лицо', 'лица', 'лиц')})` : ' (набор пуст)') : '';
  return `${HINTS[c.id]}${count}${c.key ? `. Клавиша ${c.key}` : ''}`;
}

/**
 * Панели атласа — средняя группа верхней строки (C3; VIS-20). «Эпохи» — здесь же (решение 51; UX-65): та же панель,
 * что «Вид» → «Эпохи»; не помещается — уходит в «Ещё».
 */
const PANELS: { id: Exclude<Panel, null>; label: string }[] = [
  { id: 'index', label: 'Указатель' },
  // рабочий набор (J3; решение владельца 17): число лиц — в заголовке панели и в подсказке команды
  { id: 'work', label: 'В работе' },
  { id: 'chapter', label: 'Главы' },
  { id: 'epochs', label: 'Эпохи' },
  { id: 'synopsis', label: 'Синопсис' },
  { id: 'kinship', label: 'Родство' },
  { id: 'section', label: 'Сквозной раздел' },
];
/** Справка — после вертикальной черты, рядом с темой. key — клавиша, которая открывает панель (в подсказке кнопки). */
const HELP: { id: Exclude<Panel, null>; label: string; key?: string }[] = [
  { id: 'legend', label: 'Условные знаки', key: 'L' },
  { id: 'about', label: 'О карте' },
];
/**
 * В каком порядке команды уходят в «Ещё», когда строке не хватает места: сначала панели с конца ряда,
 * затем справка, последним — «Указатель». Видимые команды остаются в своих группах и на своих местах.
 */
const COLLAPSE: Exclude<Panel, null>[] = ['section', 'kinship', 'synopsis', 'epochs', 'chapter', 'work', 'about', 'legend', 'index'];
const SUBTITLE = 'звёздный атлас библейских родословий';
const THEMES = [
  { value: 'night', label: 'Ночь' },
  { value: 'day', label: 'День' },
] as const;

/**
 * Какие команды не помещаются в ряд шириной avail (C3; VIS-20, IX-46, MOB-04): ряд — видимые панели, «Ещё», черта
 * и видимая справка; gap — промежуток между соседями ряда. Ширины команд — по образцам (probe). «Ещё» в ряду всегда:
 * в нём последней стоит «Начать заново…» (решение 68), остальное — ушедшие команды.
 */
export function overflowCommands(avail: number, width: (id: string) => number, gap: number, sep: number, more: number): Set<string> {
  const hidden = new Set<string>();
  const need = () => {
    const shown = [...PANELS, ...HELP].filter((c) => !hidden.has(c.id));
    const n = shown.length + 2;
    return shown.reduce((a, c) => a + width(c.id), 0) + sep + more + gap * (n - 1);
  };
  for (const id of COLLAPSE) {
    if (need() <= avail) break;
    hidden.add(id);
  }
  return hidden;
}

const togglePanel = (id: Exclude<Panel, null>) => (panel.value = panel.value === id ? null : id);

/**
 * Пункты меню «Разделы» телефона (H4; MOB-03, MOB-04): вид атласа, все панели, справка и тема — строками 48 px.
 * Вид — первыми пунктами «Небо» и «Древо» (решение 73): на телефоне в строке нет места для переключателя «Небо | Древо»;
 * отмечен нынешний вид. Тема — флажок «Дневная карта»: нет места и для «Ночь | День».
 */
export function phoneMenuItems(
  open: Panel,
  day: boolean,
  select: (id: Exclude<Panel, null>) => void,
  toggleTheme: () => void,
  workN = 0,
  restart: () => void = openStarts,
  view: AtlasView = 'sky',
  pickView: (v: AtlasView) => void = showView,
) {
  return [
    ...VIEWS.map((v) => ({ key: `view-${v.value}`, label: v.label, checked: view === v.value, sep: false, onSelect: () => pickView(v.value) })),
    ...[...PANELS, ...HELP].map((c) => ({
      key: c.id,
      label: c.id === 'work' ? workLabel(workN) : c.label,
      checked: open === c.id,
      // панели отделены чертой от вида, справка — от панелей
      sep: c.id === PANELS[0].id || c.id === HELP[0].id,
      onSelect: () => select(c.id),
    })),
    // выбор начала (решение 68) — после справки, отдельной группой; не флажок: пункт открывает лист «Вид»
    { key: 'restart', label: RESTART_LABEL, checked: undefined, sep: true, onSelect: restart },
    { key: 'theme', label: 'Дневная карта', checked: day, sep: true, onSelect: toggleTheme },
  ];
}

/**
 * Верхняя строка из трёх групп (C3; VIS-20, UX-20, IX-46, MOB-04): название и поиск; панели; после черты — справка и тема.
 * Если места не хватает, сначала уходит подзаголовок названия, затем лишние команды — в меню «Ещё»:
 * строка никогда не прокручивается вбок.
 */
export function TopBar() {
  const nav = useRef<HTMLElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [sub, setSub] = useState(true);
  const phone = grid.value.phone;
  useLayoutEffect(() => {
    // на телефоне ряда команд и образцов нет: все панели — в «Разделах»
    if (phone || !nav.current || !probe.current) return;
    const fit = () => {
      const n = nav.current;
      const pr = probe.current;
      if (!n || !pr) return;
      const w = new Map([...pr.children].map((el) => [(el as HTMLElement).dataset.id!, el.getBoundingClientRect().width]));
      const cs = getComputedStyle(n);
      const sep = n.querySelector<HTMLElement>('.sep');
      const sepW = sep ? sep.getBoundingClientRect().width + parseFloat(getComputedStyle(sep).marginLeft) + parseFloat(getComputedStyle(sep).marginRight) : 0;
      // запас в 1 px: дробные ширины не должны вытолкнуть последнюю команду за край
      const over = (avail: number) => overflowCommands(avail - 1, (id) => w.get(id) ?? 0, parseFloat(cs.columnGap) || 0, sepW, w.get('more') ?? 0);
      // ширина ряда без подзаголовка (на телефоне подзаголовка нет, и ряд команд — отдельной строкой)
      const s = subRef.current;
      const base = n.clientWidth + (s ? s.getBoundingClientRect().width + parseFloat(getComputedStyle(s).marginLeft) : 0);
      const withSub = over(base - (w.get('sub') ?? 0));
      const keepSub = withSub.size === 0;
      const next = keepSub ? withSub : over(base);
      setSub(keepSub);
      setHidden((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(nav.current!);
    ro.observe(probe.current!);
    fit();
    return () => ro.disconnect();
  }, [phone]);

  // телефон (H4; MOB-03, MOB-04): одна строка 48 px — название, поиск (при фокусе поле занимает всю строку) и «Разделы»;
  // список «Разделы» — все панели, справка и тема. Ряд команд — тот же nav.commands, чтобы панели открывались одним путём
  if (phone)
    return (
      <header class="top phone">
        <Wordmark />
        <Search />
        <nav class="commands" aria-label="Панели атласа">
          <Menu
            class="more sections"
            label="Разделы"
            title="Панели атласа, справка и тема"
            items={phoneMenuItems(panel.value, theme.value === 'day', togglePanel, () => (theme.value = theme.value === 'day' ? 'night' : 'day'), workSet.value.size, openStarts, atlasView.value)}
          />
        </nav>
      </header>
    );
  const n = workSet.value.size;
  const label = (c: { id: Exclude<Panel, null>; label: string }) => (c.id === 'work' ? workLabel(n) : c.label);
  const button = (c: { id: Exclude<Panel, null>; label: string; key?: string }) => (
    <button
      key={c.id}
      aria-pressed={panel.value === c.id}
      title={hintOf(c, n)}
      aria-description={hintOf(c, n)}
      aria-keyshortcuts={c.key}
      onClick={() => togglePanel(c.id)}
    >
      {label(c)}
    </button>
  );
  const moreItems = [
    ...[...PANELS, ...HELP]
      .filter((c) => hidden.has(c.id))
      .map((c, i, all) => ({
        key: c.id as string,
        label: label(c),
        checked: (panel.value === c.id) as boolean | undefined,
        // справка отделена от панелей чертой, как в самой строке
        sep: i > 0 && HELP.some((h) => h.id === c.id) && !HELP.some((h) => h.id === all[i - 1].id),
        onSelect: (): void => {
          togglePanel(c.id);
        },
      })),
  ];
  // выбор начала (решение 68) — последним пунктом «Ещё», после черты; не флажок: пункт открывает лист «Вид»
  moreItems.push({ key: 'restart', label: RESTART_LABEL, checked: undefined, sep: moreItems.length > 0, onSelect: openStarts });
  return (
    <header class="top">
      <Wordmark>{sub && <small ref={subRef}>{SUBTITLE}</small>}</Wordmark>
      <Search />
      {/* вид главной области (решение 73): «Небо | Древо» — рядом с поиском, до панелей; в «Ещё» не уходит */}
      <div class="view-switch">
        <ViewSwitch />
      </div>
      <nav class="commands" ref={nav} aria-label="Панели атласа">
        {PANELS.filter((c) => !hidden.has(c.id)).map(button)}
        <Menu class="more" label="Ещё" title={moreItems.length > 1 ? 'Другие панели и справка; начать заново' : RESTART_HINT} items={moreItems} />
        <span class="sep" aria-hidden="true" />
        {HELP.filter((c) => !hidden.has(c.id)).map(button)}
      </nav>
      <Segmented label="Тема" options={THEMES} value={theme.value} onChange={(v) => (theme.value = v)} />
      {/* образцы команд для замера ширины: невидимы, вне дерева доступности и вне порядка Tab */}
      <div class="probe" ref={probe} aria-hidden="true">
        {[...PANELS, ...HELP].map((c) => (
          <span key={c.id} class="cmd" data-id={c.id}>
            {label(c)}
          </span>
        ))}
        <span class="cmd more-probe" data-id="more">
          Ещё
        </span>
        <span class="sub" data-id="sub">
          {SUBTITLE}
        </span>
      </div>
    </header>
  );
}

/**
 * «Толедот» в верхней строке: на небе — «Всё небо», в древе (решение 73) — «Вписать всё» древо (src/ui/tree/TreeView.tsx).
 */
function Wordmark({ children }: { children?: ComponentChildren }) {
  const tree = atlasView.value === 'tree';
  return (
    <button
      class="wordmark"
      title={tree ? 'Вписать всё древо (0)' : 'Всё небо (0, Home)'}
      aria-keyshortcuts={tree ? '0' : '0 Home'}
      onClick={() => (tree ? fitTree() : showAll())}
    >
      Толедот{children}
    </button>
  );
}
