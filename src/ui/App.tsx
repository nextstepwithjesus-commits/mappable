import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { SkyView } from './SkyView.tsx';
import { Folio } from './Folio.tsx';
import { TimeStrip } from './TimeStrip.tsx';
import { Panels } from './Panels.tsx';
import { byId, persons } from '../data/atlas.ts';
import { SearchIndex } from '../engine/search.ts';
import { panel, selected, theme, epochMode, readHash, writeHash, second, pickMode, model, pins, pickSecond, clearPair, type Panel } from '../state.ts';
import { skyRef, drawMicroAxis, refLabel } from './common.tsx';
import { lifeText } from './SkyView.tsx';

export function App() {
  useEffect(() => {
    // адрес → состояние
    const apply = () => {
      const h = readHash();
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

const COMMANDS: { id: Exclude<Panel, null> | 'epochMode'; label: string }[] = [
  { id: 'epochMode', label: 'Эпохи' },
  { id: 'index', label: 'Указатель' },
  { id: 'kinship', label: 'Родство' },
  { id: 'synopsis', label: 'Синопсис' },
  { id: 'chapter', label: 'Главы' },
  { id: 'section', label: 'Сквозной раздел' },
  { id: 'legend', label: 'Условные знаки' },
  { id: 'about', label: 'О карте' },
];

function TopBar() {
  return (
    <header class="top">
      <div class="wordmark">
        Толедот<small>звёздный атлас библейских родословий</small>
      </div>
      <nav class="commands" aria-label="Разделы атласа">
        {COMMANDS.map((c) => {
          const pressed = c.id === 'epochMode' ? epochMode.value : panel.value === c.id;
          return (
            <button
              key={c.id}
              aria-pressed={pressed}
              onClick={() => {
                if (c.id === 'epochMode') {
                  epochMode.value = !epochMode.value;
                  panel.value = epochMode.value ? 'epochs' : panel.value === 'epochs' ? null : panel.value;
                } else panel.value = panel.value === c.id ? null : c.id;
              }}
            >
              {c.label}
            </button>
          );
        })}
        <button onClick={() => (theme.value = theme.value === 'night' ? 'day' : 'night')}>{theme.value === 'night' ? 'Дневная' : 'Ночная'}</button>
      </nav>
      <Search />
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
      <canvas ref={ref} width={120} height={12} style={{ width: '120px', height: '12px' }} aria-hidden="true" />
      <span class="ds">
        {p.disambig || '—'}; {lifeText(id)}
      </span>
    </button>
  );
}
