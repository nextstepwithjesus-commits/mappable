import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { byId, persons } from '../data/atlas.ts';
import { SearchIndex } from '../engine/search.ts';
import { panel, selected, theme, readHash, writeHash, second, pickMode, model, pins, pickSecond, clearPair, type Panel } from '../state.ts';
import { skyRef, drawMicroAxis, refLabel } from './common.tsx';
import { lifeText, showAll } from './SkyView.tsx';
import { Menu, Segmented } from './controls.tsx';
import { typo } from './text/typo.ts';

export function App() {
  useEffect(() => {
    // адрес → состояние
    const apply = () => {
      const h = readHash();
      // переход на образец: выбор не сбрасывать, иначе writeHash вернёт адрес «#/» раньше, чем main.tsx сменит маршрут
      if (h.route === 'specimen') return;
      if (h.id && h.id !== selected.value) {
        selected.value = h.id;
        setTimeout(() => skyRef.flyTo(h.id!), 50);
      }
      if (!h.id && selected.value) selected.value = null;
    };
    apply();
    window.addEventListener('popstate', apply);
    const off = effect(() => writeHash(selected.value));
    const onKey = (e: KeyboardEvent) => {
      // в поле ввода клавиши принадлежат полю: Escape там не закрывает ни панель, ни карточку (IX-14)
      const typing = isTextField(e.target);
      if (e.code === 'Slash' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('find')?.focus();
      }
      // поле без своего Escape: нажатие только уводит из поля, следующее уже снимает состояние
      if (e.code === 'Escape' && typing && !e.defaultPrevented) (e.target as HTMLElement).blur();
      if (e.code === 'Escape' && !typing && !e.defaultPrevented) {
        // каждое нажатие снимает одно видимое состояние, по порядку (D5)
        if (pickMode.value) pickMode.value = null;
        else if (panel.value) panel.value = null;
        else if (pins.value.length) pins.value = [];
        else if (second.value) clearPair();
        else if (selected.value) selected.value = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', apply);
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);

  return (
    <div class="app">
      <TopBar />
      <SkyView />
      <Folio />
      <TimeStrip />
      <Panels />
    </div>
  );
}

/** Поле, в котором набирают текст (не флажок и не кнопка). */
function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t.type);
}

/** Панели атласа — средняя группа верхней строки (C3; VIS-20). «Эпохи» — флажок и команда органов неба (C6). */
const PANELS: { id: Exclude<Panel, null>; label: string }[] = [
  { id: 'index', label: 'Указатель' },
  { id: 'chapter', label: 'Главы' },
  { id: 'synopsis', label: 'Синопсис' },
  { id: 'kinship', label: 'Родство' },
  { id: 'section', label: 'Сквозной раздел' },
];
/** Справка — после вертикальной черты, рядом с темой. */
const HELP: { id: Exclude<Panel, null>; label: string }[] = [
  { id: 'legend', label: 'Условные знаки' },
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
function TopBar() {
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

  const button = (c: { id: Exclude<Panel, null>; label: string }) => (
    <button key={c.id} aria-pressed={panel.value === c.id} onClick={() => togglePanel(c.id)}>
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
      <button class="wordmark" title="Всё небо" onClick={showAll}>
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

function Search() {
  const index = useMemo(
    () =>
      new SearchIndex(
        persons.map((p) => ({ id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, magnitude: p.magnitude, refs: p.parentRefs })),
      ),
    [],
  );
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const hits = useMemo(() => (q.trim() ? index.search(q, 30) : []), [q]);
  const choose = (id: string) => {
    // в режиме «Родство с…» или «Разворот с…» найденное лицо становится вторым, первое остаётся (D6)
    if (pickSecond(id)) {
      setOpen(false);
      setQ('');
      return;
    }
    selected.value = id;
    skyRef.flyTo(id);
    setOpen(false);
    setQ('');
    // фокус — на заголовок открытой карточки: дальше Tab идёт по её разделам, а не по кнопкам неба
    setTimeout(() => document.querySelector<HTMLElement>(`.folio #title-${CSS.escape(id)}`)?.focus(), 80);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setCursor((c) => Math.min(hits.length - 1, c + 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setCursor((c) => Math.max(0, c - 1));
      e.preventDefault();
    } else if (e.key === 'Enter' && hits[cursor]) choose(hits[cursor].id);
    else if (e.key === 'Escape') {
      // Escape действует только в поле: закрыть подсказки, затем очистить, затем уйти из поля (D5)
      e.preventDefault();
      e.stopPropagation();
      if (open && q.trim()) setOpen(false);
      else if (q) setQ('');
      else (e.target as HTMLInputElement).blur();
    }
  };
  const isRef = /\d+:\d+/.test(q);
  return (
    <div class="search" role="search">
      <label for="find">Найти:</label>
      <input
        id="find"
        type="search"
        autocomplete="off"
        spellcheck={false}
        placeholder="имя или стих: Руф 4:21"
        value={q}
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        role="combobox"
        aria-autocomplete="list"
        aria-controls="find-results"
        aria-expanded={open && !!q}
      />
      {open && q.trim() && (
        <div class="results" id="find-results" role="listbox">
          {hits.length ? (
            <>
              <ul>
                {hits.map((h, i) => (
                  <li key={h.id}>
                    <ResultRow id={h.id} active={i === cursor} onChoose={choose} />
                  </li>
                ))}
              </ul>
              {hits.length > 1 && !isRef && (
                <button
                  class="all"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    pins.value = hits.map((h) => h.id);
                    setOpen(false);
                    const s = skyRef.current;
                    if (s) s.fitAll();
                    skyRef.redraw();
                  }}
                >
                  Показать всех найденных на небе ({hits.length})
                </button>
              )}
            </>
          ) : (
            <div class="empty">
              {isRef ? `В стихе ${refLabel(q.trim())} лиц из атласа нет.` : `Лица с именем «${q}» в атласе нет. Проверьте написание по Синодальному переводу: например, «Вооз», «Руфь», «Иессей».`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ id, active, onChoose }: { id: string; active: boolean; onChoose: (id: string) => void }) {
  const p = byId.get(id)!;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = model.value.chrono.get(id);
    if (!ref.current || !c) return;
    const cs = getComputedStyle(document.documentElement);
    const hist = (t: number) => (t <= 0 ? t - 1 : t);
    drawMicroAxis(ref.current, hist(c.b), hist(c.d ?? c.dEst), { ink: cs.getPropertyValue('--ink').trim(), ink3: cs.getPropertyValue('--ink-3').trim() });
  }, [id]);
  return (
    <button class="result" role="option" aria-selected={active} onMouseDown={(e) => e.preventDefault()} onClick={() => onChoose(id)}>
      <span class="nm">{p.name}</span>
      <canvas ref={ref} width={120} height={12} aria-hidden="true" />
      <span class="ds">{typo([p.disambig, lifeText(id)].filter(Boolean).join('; '))}</span>
    </button>
  );
}
