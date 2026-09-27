import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { panel, theme, type Panel } from '../../state.ts';
import { showAll } from '../sky/view.ts';
import { Menu, Segmented } from '../controls.tsx';
import { Search } from './Search.tsx';

/** Панели атласа — средняя группа верхней строки (C3; VIS-20). «Эпохи» — флажок и команда органов неба (C6). */
const PANELS: { id: Exclude<Panel, null>; label: string }[] = [
  { id: 'index', label: 'Указатель' },
  { id: 'chapter', label: 'Главы' },
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
const COLLAPSE: Exclude<Panel, null>[] = ['section', 'kinship', 'synopsis', 'chapter', 'about', 'legend', 'index'];
const SUBTITLE = 'звёздный атлас библейских родословий';
const THEMES = [
  { value: 'night', label: 'Ночь' },
  { value: 'day', label: 'День' },
] as const;

/**
 * Какие команды не помещаются в ряд шириной avail (C3; VIS-20, IX-46, MOB-04): ряд — видимые панели, «Ещё» (если что-то
 * ушло в него), черта и видимая справка; gap — промежуток между соседями ряда. Ширины команд — по образцам (probe).
 */
export function overflowCommands(avail: number, width: (id: string) => number, gap: number, sep: number, more: number): Set<string> {
  const hidden = new Set<string>();
  const need = () => {
    const shown = [...PANELS, ...HELP].filter((c) => !hidden.has(c.id));
    const n = shown.length + 1 + (hidden.size ? 1 : 0);
    return shown.reduce((a, c) => a + width(c.id), 0) + sep + (hidden.size ? more : 0) + gap * (n - 1);
  };
  for (const id of COLLAPSE) {
    if (need() <= avail) break;
    hidden.add(id);
  }
  return hidden;
}

const togglePanel = (id: Exclude<Panel, null>) => (panel.value = panel.value === id ? null : id);

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
  useLayoutEffect(() => {
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
  }, []);

  const button = (c: { id: Exclude<Panel, null>; label: string; key?: string }) => (
    <button key={c.id} aria-pressed={panel.value === c.id} title={c.key ? `${c.label} (${c.key})` : undefined} aria-keyshortcuts={c.key} onClick={() => togglePanel(c.id)}>
      {c.label}
    </button>
  );
  const moreItems = [...PANELS, ...HELP]
    .filter((c) => hidden.has(c.id))
    .map((c, i, all) => ({
      key: c.id,
      label: c.label,
      checked: panel.value === c.id,
      // справка отделена от панелей чертой, как в самой строке
      sep: i > 0 && HELP.some((h) => h.id === c.id) && !HELP.some((h) => h.id === all[i - 1].id),
      onSelect: () => togglePanel(c.id),
    }));
  return (
    <header class="top">
      <button class="wordmark" title="Всё небо (0, Home)" aria-keyshortcuts="0 Home" onClick={showAll}>
        Толедот{sub && <small ref={subRef}>{SUBTITLE}</small>}
      </button>
      <Search />
      <nav class="commands" ref={nav} aria-label="Панели атласа">
        {PANELS.filter((c) => !hidden.has(c.id)).map(button)}
        {moreItems.length > 0 && <Menu class="more" label="Ещё" title="Другие панели и справка" items={moreItems} />}
        <span class="sep" aria-hidden="true" />
        {HELP.filter((c) => !hidden.has(c.id)).map(button)}
      </nav>
      <Segmented label="Тема" options={THEMES} value={theme.value} onChange={(v) => (theme.value = v)} />
      {/* образцы команд для замера ширины: невидимы, вне дерева доступности и вне порядка Tab */}
      <div class="probe" ref={probe} aria-hidden="true">
        {[...PANELS, ...HELP].map((c) => (
          <span key={c.id} class="cmd" data-id={c.id}>
            {c.label}
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
