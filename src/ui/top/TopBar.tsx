import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { panel, theme, type Panel } from '../../state.ts';
import { grid } from '../layout.ts';
import { showAll } from '../sky/view.ts';
import { Menu, Segmented, type MenuItem } from '../controls.tsx';
import { Search } from './Search.tsx';
import { workSet } from '../work.ts';
import { plural } from '../common.tsx';
import { WORK_LEAD } from '../panels/Work.tsx';
import { openStarts } from '../sky/Controls.tsx';

/**
 * Команда выбора начала (решение 68): в «Меню» телефона; на широком экране — в «Вид → Начало» и во вступлении (этап 13,
 * решение 111: «Ещё» — только для команд, которые не поместились). Открывает лист «Вид» на «Начале».
 */
export const RESTART_LABEL = 'Начать заново…';
export const RESTART_HINT = 'Выбрать начало: с Адама, с Иисуса Христа, родословие Иисуса Христа, ключевые лица или всё небо';

/**
 * Надпись команды рабочего набора (UX-48; решения 26, 81): «Набор: 46», пустой набор — «Набор». Одно слово — одно
 * понятие: панель «Набор: 18», строка показа «На небе: набор — 18 лиц» (STAGE11.md § 5).
 */
export const workLabel = (n: number) => (n ? `Набор: ${n}` : 'Набор');

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
  about: 'Источник, уровни достоверности, данные атласа и как с ним начать; годы и модели — в «О хронологии»',
  chronology: 'Как читать годы атласа, откуда они берутся и что меняет выбор модели',
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
  { id: 'work', label: 'Набор' },
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
  // панель «О хронологии» (этап 13, решение 102; src/ui/panels/Chronology.tsx) — рядом с «О карте»
  { id: 'chronology', label: 'О хронологии' },
];
/**
 * В каком порядке команды уходят в «Ещё», когда строке не хватает места: сначала панели с конца ряда,
 * затем справка, последним — «Указатель». Видимые команды остаются в своих группах и на своих местах.
 */
const COLLAPSE: Exclude<Panel, null>[] = ['section', 'kinship', 'synopsis', 'epochs', 'chapter', 'work', 'chronology', 'about', 'legend', 'index'];
const SUBTITLE = 'звёздный атлас библейских родословий';
const THEMES = [
  { value: 'night', label: 'Ночь' },
  { value: 'day', label: 'День' },
] as const;

/**
 * Какие команды не помещаются в ряд шириной avail (C3; VIS-20, IX-46, MOB-04): ряд — видимые панели, черта и видимая
 * справка, а если что-то ушло — ещё «Ещё»; gap — промежуток между соседями ряда. Ширины команд — по образцам (probe).
 * «Ещё» — только когда команды не помещаются (этап 13, решение 111): меню из одного «Начать заново…» больше не бывает.
 */
export function overflowCommands(avail: number, width: (id: string) => number, gap: number, sep: number, more: number): Set<string> {
  const hidden = new Set<string>();
  const need = (withMore: boolean) => {
    const shown = [...PANELS, ...HELP].filter((c) => !hidden.has(c.id));
    const n = shown.length + 1 + (withMore ? 1 : 0);
    return shown.reduce((a, c) => a + width(c.id), 0) + sep + (withMore ? more : 0) + gap * (n - 1);
  };
  if (need(false) <= avail) return hidden;
  for (const id of COLLAPSE) {
    if (need(true) <= avail) break;
    hidden.add(id);
  }
  return hidden;
}

const togglePanel = (id: Exclude<Panel, null>) => (panel.value = panel.value === id ? null : id);

/**
 * Группы меню (этап 13, решение 122; UI-15): инструменты по задаче читателя, в этом порядке. Строка задачи у пункта —
 * что инструмент делает, короче пояснения HINTS: «Синопсис — сравнить родословия Мф 1 и Лк 3».
 */
export const MENU_GROUPS: { name: string; ids: Exclude<Panel, null>[] }[] = [
  { name: 'Искать и читать', ids: ['index', 'chapter', 'epochs'] },
  { name: 'Исследовать связи', ids: ['kinship', 'synopsis', 'section', 'work'] },
  { name: 'Справка', ids: ['legend', 'about', 'chronology'] },
];
export const TASKS: Partial<Record<Exclude<Panel, null>, string>> = {
  index: 'все лица по алфавиту',
  chapter: 'читать родословные главы; имена — ссылки на карточки',
  epochs: 'эпохи с годами и основаниями',
  kinship: 'кем одно лицо приходится другому',
  synopsis: 'сравнить родословия Мф 1 и Лк 3',
  section: 'сравнить один раздел у группы лиц',
  work: 'свои лица на небе',
  legend: 'что значит каждый знак на небе',
  about: 'источник, достоверность и данные атласа',
  chronology: 'откуда годы и что меняет модель',
};
const groupOf = (id: Exclude<Panel, null>) => MENU_GROUPS.find((g) => g.ids.includes(id))?.name;
/** Инструменты в порядке групп меню. */
const byGroups = <T extends { id: Exclude<Panel, null> }>(list: T[]): T[] =>
  MENU_GROUPS.flatMap((g) => g.ids.map((id) => list.find((c) => c.id === id)).filter((c): c is T => !!c));

/**
 * Пункты «Меню» телефона (H4; MOB-03, MOB-04; этап 13, решение 109: прежде «Разделы» — слово 24 разделов карточки): все
 * панели, справка и тема — строками 48 px. Вид атласа один (решение 77): переключателя «Небо | Древо» больше нет; что
 * показано на небе, говорит строка показа у его кромки. Тема — «Ночь» и «День», те же слова, что у переключателя темы
 * на широком экране (X4 § 2.1).
 */
export function phoneMenuItems(
  open: Panel,
  day: boolean,
  select: (id: Exclude<Panel, null>) => void,
  toggleTheme: () => void,
  workN = 0,
  restart: () => void = openStarts,
): (MenuItem & { label: string })[] {
  return [
    // этап 13, решение 122: группы «Искать и читать», «Исследовать связи», «Справка» с подписями; у пункта — строка задачи
    ...byGroups([...PANELS, ...HELP]).map((c) => ({
      key: c.id as string,
      label: c.id === 'work' ? workLabel(workN) : c.label,
      note: TASKS[c.id],
      group: groupOf(c.id),
      checked: open === c.id,
      sep: false,
      onSelect: () => select(c.id),
    })),
    // выбор начала (решение 68) — после справки, отдельной группой; не флажок: пункт открывает лист «Вид»
    { key: 'restart', label: RESTART_LABEL, checked: undefined, sep: true, onSelect: restart },
    { key: 'night', label: 'Ночь', checked: !day, sep: true, onSelect: () => day && toggleTheme() },
    { key: 'day', label: 'День', checked: day, sep: false, onSelect: () => !day && toggleTheme() },
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

  // телефон (H4; MOB-03, MOB-04): одна строка 48 px — название, поиск (при фокусе поле занимает всю строку) и «Меню»;
  // список «Меню» — все панели, справка и тема. Ряд команд — тот же nav.commands, чтобы панели открывались одним путём
  if (phone)
    return (
      <header class="top phone">
        <Wordmark />
        <Search />
        <nav class="commands" aria-label="Панели атласа">
          <Menu
            class="more sections"
            label="Меню"
            title="Панели атласа, справка и тема"
            items={phoneMenuItems(panel.value, theme.value === 'day', togglePanel, () => (theme.value = theme.value === 'day' ? 'night' : 'day'), workSet.value.size, openStarts)}
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
  // «Ещё» — те же группы и строки задач, что в «Меню» телефона (решение 122)
  const moreItems = [
    ...byGroups([...PANELS, ...HELP])
      .filter((c) => hidden.has(c.id))
      .map((c) => ({
        key: c.id as string,
        label: label(c),
        note: TASKS[c.id],
        group: groupOf(c.id),
        checked: (panel.value === c.id) as boolean | undefined,
        onSelect: (): void => {
          togglePanel(c.id);
        },
      })),
  ];
  return (
    <header class="top">
      <Wordmark>{sub && <small ref={subRef}>{SUBTITLE}</small>}</Wordmark>
      <Search />
      <nav class="commands" ref={nav} aria-label="Панели атласа">
        {PANELS.filter((c) => !hidden.has(c.id)).map(button)}
        {moreItems.length > 0 && <Menu class="more" label="Ещё" title="Панели и справка, которым не хватило места в строке" items={moreItems} />}
        <span class="sep" aria-hidden="true" />
        {HELP.filter((c) => !hidden.has(c.id)).map(button)}
      </nav>
      <Segmented label="Тема" options={THEMES} value={theme.value} onChange={(v) => (theme.value = v)} roving />
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
 * «Толедот» в верхней строке — «Вписать»: весь нынешний показ в окне (клавиши 0 и Home). Показ он не меняет: «Всё небо» —
 * только показ, его выбирает строка показа у кромки неба (решение 81).
 */
function Wordmark({ children }: { children?: ComponentChildren }) {
  return (
    <button class="wordmark" title="Вписать: весь показ в окне (0, Home)" aria-keyshortcuts="0 Home" onClick={() => showAll()}>
      Толедот{children}
    </button>
  );
}
