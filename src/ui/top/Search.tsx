import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { byId, persons } from '../../data/atlas.ts';
import { SearchIndex } from '../../engine/search.ts';
import { selected, model, pins, pickSecond } from '../../state.ts';
import { skyRef, drawMicroAxis, refLabel } from '../common.tsx';
import { lifeText } from '../sky/text.ts';
import { typo } from '../text/typo.ts';

/** Поиск по имени, иным формам, уточнению и ссылке на стих (ТЗ § 3.7). */
export function Search() {
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
