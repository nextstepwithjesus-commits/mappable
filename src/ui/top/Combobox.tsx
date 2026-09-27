/**
 * Комбобокс выбора лица (образец ARIA «combobox» со списком): поле, список строк-лиц со сгруппированными одноимёнными,
 * стрелки, PageUp и PageDown, Enter, Escape (D9; IX-15, IX-20, IX-24; MOB-27). Один и тот же — у поиска верхней строки
 * (src/ui/top/Search.tsx) и у поля «Второе» панели «Родство» (G1): строки и поведение одни, различаются запрос,
 * строки-команды и то, что делает выбор.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId } from '../../data/atlas.ts';
import type { SearchHit } from '../../engine/search.ts';
import { model } from '../../state.ts';
import { drawMicroAxis, plural } from '../common.tsx';
import { lifeText } from '../sky/text.ts';
import { typo } from '../text/typo.ts';
import { searchIndex } from './searchIndex.ts';

/** Строка списка: лицо, «Все N на небе» или «Снять отметки». */
export type Row = { key: string; kind: 'person'; id: string; hit: SearchHit; grouped: boolean } | { key: string; kind: 'all'; ids: string[] } | { key: string; kind: 'unpin' };
/** Группа строк с подписью: одноимённые, традиционное именование, «возможно, вы искали». */
export type Block = { head?: string; rows: Row[] };

/** Что делает выбор строки с полем: запрос остаётся выделенным (keep: фокус не открывает список снова) или нет. */
export type AfterChoose = 'keep' | 'clear' | void;

/**
 * Строки одноимённых — группой «Иосиф — 10 лиц» на месте самого значимого из них (UX-01); опечатки — под «Возможно,
 * вы искали». Строки-команды («Все N на небе») добавляет поиск верхней строки сам.
 */
export function personBlocks(hits: SearchHit[]): Block[] {
  const blocks: Block[] = [];
  const person = (h: SearchHit, grouped: boolean): Row => ({ key: h.id, kind: 'person', id: h.id, hit: h, grouped });
  const fuzzy = hits.filter((h) => h.via === 'fuzzy');
  if (fuzzy.length) blocks.push({ head: 'Возможно, вы искали', rows: fuzzy.map((h) => person(h, false)) });
  const byName = new Map<string, SearchHit[]>();
  for (const h of hits) {
    if (h.via === 'fuzzy') continue;
    const name = byId.get(h.id)?.name ?? h.id;
    const g = byName.get(name);
    if (g) g.push(h);
    else byName.set(name, [h]);
  }
  const done = new Set<string>();
  for (const h of hits) {
    if (h.via === 'fuzzy' || done.has(h.id)) continue;
    const p = byId.get(h.id);
    if (h.via === 'tradition' && p) {
      done.add(h.id);
      blocks.push({ head: `«${h.tradition}»: в Синодальном переводе — ${p.name}${p.disambig ? `, ${p.disambig}` : ''}`, rows: [person(h, false)] });
      continue;
    }
    const name = p?.name ?? h.id;
    const g = (byName.get(name) ?? [h]).filter((x) => !done.has(x.id) && x.via !== 'tradition');
    for (const x of g) done.add(x.id);
    if (g.length > 1) blocks.push({ head: `${name} — ${g.length}\u00a0${plural(g.length, 'лицо', 'лица', 'лиц')}`, rows: g.map((x) => person(x, true)) });
    else blocks.push({ rows: [person(h, false)] });
  }
  return blocks;
}

/** Лица по запросу для поля выбора лица (без поиска по стиху): тот же индекс и то же ранжирование, что у поиска. */
export function personHits(q: string, exclude: (id: string) => boolean = () => false, limit = 40): SearchHit[] {
  if (!q.trim()) return [];
  return searchIndex.search(q, limit).filter((h) => h.via !== 'verse' && !exclude(h.id));
}

export interface ComboboxProps {
  /** id поля; список — `${id}-results`, строки — `${id}-opt-N` */
  id: string;
  label: ComponentChildren;
  /** класс обёртки: «search» у поиска верхней строки, «combo» — в панели */
  class: string;
  role?: 'search';
  type?: 'search' | 'text';
  placeholder?: string;
  title?: string;
  keyshortcuts?: string;
  /** подпись списка для диктора */
  listLabel: string;
  q: string;
  /** набор в поле (с побочными действиями вызывающего) */
  onInput: (q: string) => void;
  /** очистка поля Escape'ом — без побочных действий набора; по умолчанию onInput('') */
  onClear?: () => void;
  blocks: Block[];
  onChoose: (r: Row) => AfterChoose;
  /** надпись команды-строки («Все N на небе», «Снять отметки») */
  cmdLabel?: (r: Exclude<Row, { kind: 'person' }>) => string;
  /** что сказать в открытом списке, когда строк нет */
  empty?: ComponentChildren;
  /** сообщение при пустом запросе (неверный адрес — D8): его появление открывает список */
  notice?: { text: string } | null;
  /** что объявить диктору, пока список открыт */
  status: string;
  /** Escape в поле: сверх закрытия, очистки и ухода из поля */
  onEscape?: () => void;
  /** фокус в поле сразу после появления (поле «Второе», открытое командой «заменить») */
  autoFocus?: boolean;
}

export function Combobox(props: ComboboxProps) {
  const { id, q, blocks, notice } = props;
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  const justFocused = useRef(false);
  // уход из поля закрывает список с задержкой (чтобы щелчок по строке успел сработать); возврат в поле её отменяет
  const blurTimer = useRef(0);
  // запрос остался в поле после выбора: фокус его выделяет, но список не открывает — только набор или стрелка вниз
  const [kept, setKept] = useState(false);
  const optId = (i: number) => `${id}-opt-${i}`;

  // сообщение об адресе приходит с пустым полем: список открывается сам (IX-44)
  useEffect(() => {
    if (!notice) return;
    setKept(false);
    setOpen(true);
  }, [notice]);
  useEffect(() => {
    if (props.autoFocus) input.current?.focus();
  }, []);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const rows = blocks.flatMap((b) => b.rows);
  // курсор по умолчанию — первое лицо, а не «Все N на небе»: Enter открывает лучшее совпадение
  const firstPerson = rows.findIndex((r) => r.kind === 'person');
  const active = cursor >= 0 && cursor < rows.length ? cursor : firstPerson;
  const listOpen = open && (!!q.trim() || !!notice);

  // строка под курсором — в видимой части списка (IX-15)
  useLayoutEffect(() => {
    if (!listOpen || active < 0) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active, listOpen, rows.length]);
  // высота списка — по видимой части окна: на телефоне клавиатура не прячет строки (MOB-27)
  useLayoutEffect(() => {
    if (!listOpen) return;
    const vv = window.visualViewport;
    const fit = () => {
      const top = list.current?.getBoundingClientRect().top ?? 0;
      const h = (vv ? vv.height + vv.offsetTop : window.innerHeight) - top - 8;
      setMaxH(h > 120 ? Math.round(h) : null);
    };
    fit();
    vv?.addEventListener('resize', fit);
    window.addEventListener('resize', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      window.removeEventListener('resize', fit);
    };
  }, [listOpen]);

  const close = () => {
    setOpen(false);
    setCursor(-1);
  };
  const choose = (r: Row) => {
    const after = props.onChoose(r);
    close();
    setKept(after === 'keep');
  };
  const move = (to: number) => {
    if (!rows.length) return;
    setCursor(Math.max(0, Math.min(rows.length - 1, to)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listOpen) {
        setOpen(true);
        return;
      }
      move(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'PageDown' || e.key === 'PageUp') && listOpen) {
      e.preventDefault();
      move(active + (e.key === 'PageDown' ? 6 : -6));
    } else if (e.key === 'Enter' && listOpen && rows[active]) {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === 'Escape') {
      // Escape действует только в поле: закрыть подсказки, затем очистить, затем уйти из поля (D5)
      e.preventDefault();
      e.stopPropagation();
      if (listOpen) close();
      else if (q) (props.onClear ?? (() => props.onInput('')))();
      else (e.target as HTMLInputElement).blur();
      props.onEscape?.();
    }
  };

  const listId = `${id}-results`;
  let i = -1;
  return (
    <div class={props.class} role={props.role}>
      <label for={id}>{props.label}</label>
      <input
        id={id}
        ref={input}
        type={props.type ?? 'search'}
        autocomplete="off"
        spellcheck={false}
        placeholder={props.placeholder}
        title={props.title}
        aria-keyshortcuts={props.keyshortcuts}
        value={q}
        onInput={(e) => {
          props.onInput((e.target as HTMLInputElement).value);
          setOpen(true);
          setKept(false);
          setCursor(-1);
        }}
        onFocus={(e) => {
          clearTimeout(blurTimer.current);
          setOpen(!kept || !!notice);
          // прежний запрос выделен: новый набор его заменяет (IX-20)
          (e.target as HTMLInputElement).select();
          justFocused.current = true;
        }}
        onMouseUp={(e) => {
          // щелчок в поле ставит курсор и снимает выделение, сделанное при фокусе, — первый щелчок его сохраняет
          if (justFocused.current) e.preventDefault();
          justFocused.current = false;
        }}
        onBlur={() => {
          clearTimeout(blurTimer.current);
          blurTimer.current = window.setTimeout(close, 150);
        }}
        onKeyDown={onKey}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={listOpen}
        aria-activedescendant={listOpen && active >= 0 && rows[active] ? optId(active) : undefined}
      />
      <span class="visually-hidden" aria-live="polite">
        {listOpen ? props.status : ''}
      </span>
      {listOpen && (
        <div class="results" id={listId} ref={list} role="listbox" aria-label={props.listLabel} style={maxH ? { '--results-max': `${maxH}px` } : undefined}>
          {!q.trim() && notice && <div class="empty notice">{typo(notice.text)}</div>}
          {rows.length > 0 &&
            blocks.map((b, bi) => {
              const items = b.rows.map((r) => {
                i++;
                const k = i;
                const on = k === active;
                const common = {
                  id: optId(k),
                  role: 'option' as const,
                  'aria-selected': on,
                  onMouseDown: (e: MouseEvent) => e.preventDefault(),
                  onMouseMove: () => k !== active && setCursor(k),
                  onClick: () => choose(r),
                };
                if (r.kind === 'person') return <ResultRow key={r.key} {...common} person={r.id} grouped={r.grouped} />;
                return (
                  <div key={r.key} {...common} class={`result cmdrow ${r.kind}`}>
                    {props.cmdLabel?.(r) ?? ''}
                  </div>
                );
              });
              if (!b.head) return items;
              const hid = `${id}-grp-${bi}`;
              return (
                <div key={hid} role="group" aria-labelledby={hid} class="grp">
                  <div class="grp-head" id={hid}>
                    {typo(b.head)}
                  </div>
                  {items}
                </div>
              );
            })}
          {!rows.length && q.trim() && props.empty ? <div class="empty">{props.empty}</div> : null}
        </div>
      )}
    </div>
  );
}

/** «3 лица», «ничего не найдено» — для живой области списка. */
export const countStatus = (n: number, loading = false) => (n ? `${n}\u00a0${plural(n, 'лицо', 'лица', 'лиц')}` : loading ? '' : 'ничего не найдено');

/** Строка-лицо: имя и уточнение, годы и микрошкала жизни (ТЗ § 3.7). */
function ResultRow({ person: id, grouped, ...rest }: { person: string; grouped: boolean } & Record<string, unknown>) {
  const p = byId.get(id)!;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = model.value.chrono.get(id);
    if (!ref.current || !c) return;
    const cs = getComputedStyle(document.documentElement);
    const hist = (t: number) => (t <= 0 ? t - 1 : t);
    drawMicroAxis(ref.current, hist(c.b), hist(c.d ?? c.dEst), { ink: cs.getPropertyValue('--ink').trim(), ink3: cs.getPropertyValue('--ink-3').trim() });
  }, [id]);
  // в группе одноимённых имя стоит в подписи группы: строка начинается с уточнения, имя — только для диктора
  const plain = !grouped || !p.disambig;
  return (
    <div {...rest} class={grouped ? 'result grouped' : 'result'}>
      <span class="l1">
        <span class={plain ? 'nm' : 'nm visually-hidden'}>{p.name}</span>
        {p.disambig ? <span class="ds">{plain ? typo(`, ${p.disambig}`) : typo(p.disambig)}</span> : null}
      </span>
      <span class="yr">{typo(lifeText(id))}</span>
      <canvas ref={ref} width={56} height={10} aria-hidden="true" />
    </div>
  );
}
