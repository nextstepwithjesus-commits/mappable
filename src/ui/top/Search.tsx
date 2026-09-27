import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { norm } from '../../engine/text.ts';
import { parseQueryRef, type SearchHit } from '../../engine/search.ts';
import { model, pickMode, pins, pinsQuery, pickSecond, searchNotice } from '../../state.ts';
import { drawMicroAxis, flyToIds, goTo, plural, refLabel } from '../common.tsx';
import { lifeText } from '../sky/text.ts';
import { typo } from '../text/typo.ts';
import { prepareBook, searchIndex } from './searchIndex.ts';

/** Строка списка: лицо, «Все N на небе» или «Снять отметки». */
type Row = { key: string; kind: 'person'; id: string; hit: SearchHit; grouped: boolean } | { key: string; kind: 'all'; ids: string[] } | { key: string; kind: 'unpin' };
/** Группа строк с подписью: одноимённые, традиционное именование, «возможно, вы искали». */
type Block = { head?: string; rows: Row[] };

const optId = (i: number) => `find-opt-${i}`;

/**
 * Кого отметить на небе строкой «Все N на небе» (ТЗ § 3.7: «отмечает всех одноимённых»): при поиске по стиху
 * или главе — всех лиц стиха; иначе — одноимённых лучшего совпадения (то же первое слово имени), а не всех
 * найденных по уточнению («иосиф» — десять Иосифов, без Манассии и Ефрема, «сыновей Иосифа», и без Иосифии).
 */
export function markAllIds(hits: SearchHit[]): string[] {
  const first = hits.find((h) => h.via !== 'fuzzy');
  if (!first) return [];
  if (first.via === 'verse') return hits.filter((h) => h.via === 'verse').map((h) => h.id);
  // одно имя — по первому слову: «Иисус» — Иисус Христос, Иисус Навин и все Иисусы; «иосиф» — Иосифы, но не Иосифия
  const word = (id: string) => norm(byId.get(id)?.name ?? '').split(' ')[0];
  const key = word(first.id);
  return hits.filter((h) => (h.via === 'name' || h.via === 'alt' || h.via === 'tradition') && word(h.id) === key).map((h) => h.id);
}

/**
 * Строки результатов: одноимённые — группой «Иосиф — 10 лиц» на месте самого значимого из них (UX-01);
 * традиционное именование — с пометой «в Синодальном переводе — …» (решение владельца 13); опечатки — под
 * «Возможно, вы искали». Первой строкой — «Все N на небе» или, если отметки уже стоят, «Снять отметки» (IX-19).
 */
export function resultBlocks(hits: SearchHit[], opts: { pinned: boolean; noAll: boolean }): Block[] {
  const blocks: Block[] = [];
  if (opts.pinned) blocks.push({ rows: [{ key: 'unpin', kind: 'unpin' }] });
  else if (!opts.noAll) {
    const ids = markAllIds(hits);
    if (ids.length > 1) blocks.push({ rows: [{ key: 'all', kind: 'all', ids }] });
  }
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
    if (g.length > 1) blocks.push({ head: `${name} — ${g.length} ${plural(g.length, 'лицо', 'лица', 'лиц')}`, rows: g.map((x) => person(x, true)) });
    else blocks.push({ rows: [person(h, false)] });
  }
  return blocks;
}

/** Поиск по имени, иным формам, уточнению, традиционному именованию и ссылке на стих или главу (ТЗ § 3.7; D9). */
export function Search() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  // перестроить результаты, когда подгрузились ссылки карточек и текст книги (поиск по стиху)
  const [ready, setReady] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  const justFocused = useRef(false);
  // уход из поля закрывает список с задержкой (чтобы щелчок по строке успел сработать); возврат в поле её отменяет
  const blurTimer = useRef(0);
  // запрос остался в поле после выбора: фокус его выделяет, но список не открывает — только набор или стрелка вниз
  const [kept, setKept] = useState(false);

  const ref = useMemo(() => parseQueryRef(q), [q]);
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    setLoading(true);
    prepareBook(ref.book)
      .catch(() => {}) // тома не загрузились — ищем по тому, что уже есть
      .then(() => {
        if (!alive) return;
        setLoading(false);
        setReady((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [ref?.book]);

  const hits = useMemo(() => (q.trim() ? searchIndex.search(q, 60) : []), [q, ready]);
  const notice = searchNotice.value;
  // сообщение об адресе приходит с пустым полем: прежний запрос его не заслоняет (IX-44)
  useEffect(() => {
    if (!notice) return;
    setQ('');
    setKept(false);
    setOpen(true);
  }, [notice]);
  const noticeHits = useMemo<SearchHit[]>(() => (notice ? notice.ids.map((id, i) => ({ id, score: -i, matched: id, via: 'name' as const })) : []), [notice]);
  const shown = q.trim() ? hits : noticeHits;
  const pinned = pins.value.length > 0 && pinsQuery.value === q.trim() && !!q.trim();
  // в режиме выбора второго лица и в подсказках к неверному адресу отмечать всех не нужно
  const noAll = !!pickMode.value || !q.trim();
  const blocks = useMemo(() => resultBlocks(shown, { pinned, noAll }), [shown, pinned, noAll]);
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
    if (r.kind === 'unpin') {
      pins.value = [];
      pinsQuery.value = '';
      close();
      return;
    }
    if (r.kind === 'all') {
      // отметки на небе со строкой «Отмечено N лиц по запросу…» (E10) и перелёт к рамке отмеченных
      pins.value = r.ids;
      pinsQuery.value = q.trim();
      close();
      flyToIds(r.ids);
      return;
    }
    const id = r.id;
    searchNotice.value = null;
    // в режиме «Родство с…» или «Разворот с…» найденное лицо становится вторым, первое остаётся (D6)
    if (pickSecond(id)) {
      close();
      setQ('');
      return;
    }
    goTo(id);
    // запрос остаётся в поле выделенным: стрелка вниз снова открывает список (IX-20)
    close();
    setKept(true);
    // фокус — на заголовок открытой карточки: дальше Tab идёт по её разделам, а не по кнопкам неба
    setTimeout(() => document.querySelector<HTMLElement>(`.folio #title-${CSS.escape(id)}`)?.focus(), 80);
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
      else if (q) setQ('');
      else (e.target as HTMLInputElement).blur();
      searchNotice.value = null;
    }
  };

  const count = shown.length;
  const status = !listOpen ? '' : count ? `${count} ${plural(count, 'лицо', 'лица', 'лиц')}` : loading ? '' : 'ничего не найдено';
  let i = -1;
  return (
    <div class="search" role="search">
      <label for="find">Найти:</label>
      <input
        id="find"
        ref={input}
        type="search"
        autocomplete="off"
        spellcheck={false}
        placeholder="имя или стих: Руф 4:21"
        title="Найти по имени или стиху (/)"
        aria-keyshortcuts="/"
        value={q}
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value);
          setOpen(true);
          setKept(false);
          setCursor(-1);
          searchNotice.value = null;
          // новый поиск снимает прежние отметки на небе (IX-19)
          if (pins.value.length) {
            pins.value = [];
            pinsQuery.value = '';
          }
        }}
        onFocus={(e) => {
          clearTimeout(blurTimer.current);
          setOpen(!kept || !!searchNotice.value);
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
        aria-controls="find-results"
        aria-expanded={listOpen}
        aria-activedescendant={listOpen && active >= 0 && rows[active] ? optId(active) : undefined}
      />
      <span class="visually-hidden" aria-live="polite">
        {status}
      </span>
      {listOpen && (
        <div class="results" id="find-results" ref={list} role="listbox" aria-label="Результаты поиска" style={maxH ? { '--results-max': `${maxH}px` } : undefined}>
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
                    {r.kind === 'all' ? `Все ${r.ids.length} на небе` : `Снять отметки: ${pins.value.length} ${plural(pins.value.length, 'лицо', 'лица', 'лиц')}`}
                  </div>
                );
              });
              if (!b.head) return items;
              const hid = `find-grp-${bi}`;
              return (
                <div key={hid} role="group" aria-labelledby={hid} class="grp">
                  <div class="grp-head" id={hid}>
                    {typo(b.head)}
                  </div>
                  {items}
                </div>
              );
            })}
          {!rows.length && q.trim() && (
            <div class="empty">
              {ref
                ? loading
                  ? 'Ищу по ссылкам карточек…'
                  : typo(`${ref.verses.length ? 'В стихе' : 'В главе'} ${refLabel(ref.ref)} не найдено лиц, отмеченных в атласе.`)
                : typo(`Лица с именем «${q.trim()}» в атласе нет. Проверьте написание по Синодальному переводу.`)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
