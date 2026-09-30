/**
 * Комбобокс выбора лица (образец ARIA «combobox» со списком): поле, список строк-лиц со сгруппированными одноимёнными,
 * стрелки, PageUp и PageDown, Enter, Escape (D9; IX-15, IX-20, IX-24; MOB-27). Один и тот же — у поиска верхней строки
 * (src/ui/top/Search.tsx) и у поля «Второе» панели «Родство» (G1): строки и поведение одни, различаются запрос,
 * строки-команды и то, что делает выбор.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, type ChronoRow } from '../../data/atlas.ts';
import { fixLayout, serviceWord, stems, type SearchHit } from '../../engine/search.ts';
import { eventMarks } from '../../render/frame.ts';
import type { SkyContext } from '../../render/sky.ts';
import { model, theme } from '../../state.ts';
import { plural } from '../common.tsx';
import { lifeText } from '../sky/text.ts';
import { typo } from '../text/typo.ts';
import { norm } from '../../engine/text.ts';
import { searchIndex } from './searchIndex.ts';

/**
 * Строка списка: лицо; «Все N на небе» (scope — лица стиха, стихов или главы; group — «Показать на небе» своей группы,
 * решение 120); «Снять отметки»; «Читать Мф 1 — имена со ссылками» (глава из «Глав», IX-75); «Руфь уже выбрана первой»
 * (выбор второго лица, UX-13 — строка без действия). lead — строка, на которой стоит курсор, пока читатель его не
 * двигал: Enter выбирает её.
 */
export type Row =
  | { key: string; kind: 'person'; id: string; hit: SearchHit; grouped: boolean }
  | { key: string; kind: 'all'; ids: string[]; lead?: boolean; scope?: 'verse' | 'verses' | 'chapter'; group?: boolean }
  | { key: string; kind: 'unpin' }
  | { key: string; kind: 'retry' }
  | { key: string; kind: 'read'; ch: string; lead: true }
  | { key: string; kind: 'self'; id: string; lead: true };
/**
 * Группа строк с подписью: «Имя совпадает», «Другие формы и похожие имена», «Упомянуты рядом», традиционное
 * именование, лица стиха. ids — кого показывает команда группы «Показать на небе» (решение 120); у группы из одного
 * лица команды нет — строка лица делает то же.
 */
export type Block = { head?: string; rows: Row[]; ids?: string[]; group?: 'name' | 'forms' | 'near' };

/**
 * Что делает выбор строки с полем: запрос остаётся выделенным (keep: фокус не открывает список снова) или нет; stay —
 * список остаётся открытым («Повторить загрузку», решение 127: выдача перестраивается на месте).
 */
export type AfterChoose = 'keep' | 'clear' | 'stay' | void;

const people = (n: number) => `${n}\u00a0${plural(n, 'лицо', 'лица', 'лиц')}`;
/** Первое слово имени лица — ключ одноимённых («Иисус» у Иисуса Христа, Иисуса Навина и всех Иисусов). */
export const firstWord = (id: string) => norm(byId.get(id)?.name ?? '').split(' ')[0];

/**
 * Совпадения по группам (решение 120; UI-10: точные, похожие и связанные — не вперемешку).
 *  - name — «Имя совпадает»: запрос — имя целиком, первое слово имени или его косвенная форма («Иосифа»), у
 *    одноимённых лучшего совпадения (тот же первый корень: «иосиф» — десять Иосифов, но не Иосифия). Такого нет
 *    (набирается начало имени, «Иос») — все найденные по имени; exact — было ли совпадение целиком.
 *  - forms — «Другие формы и похожие имена»: иные имена текста («Иероваал» — Гедеон), имена, похожие по написанию
 *    (Иосифия при «иосиф», Гемария при «Мария»), опечатки («Навуходонасор» — «Возможно, вы искали»).
 *  - near — «Упомянуты рядом»: имя запроса стоит в уточнении («сын Давида» — Авессалом) или в описательном имени
 *    после слова родства («Сын Давида и Вирсавии», «Мать Иисуса»), а не как имя лица.
 *  - trad — традиционное именование («Богородица» — Мария): своей строкой с синодальной формой.
 * q — запрос; без него совпадением целиком считается сильное совпадение поиска.
 */
export function groupHits(hits: SearchHit[], q = ''): { trad: SearchHit[]; name: SearchHit[]; exact: boolean; forms: SearchHit[]; near: SearchHit[] } {
  const nq = norm(fixLayout(q)).trim();
  const qs = nq ? stems(nq) : [];
  const whole = (h: SearchHit) => {
    if (!h.strong) return false;
    if (!nq) return true;
    const w = firstWord(h.id);
    return w === nq || norm(byId.get(h.id)?.name ?? '') === nq || stems(w).some((x) => qs.includes(x));
  };
  // описательная форма, где имя запроса называет родню или предка: имя «Сын Давида и Вирсавии», иные имена «Матерь
  // Иисуса», «Корень и потомок Давида», «Мария Иосиева»; но «Иероваал» (Гедеон) и «Навин» (Нон) — другие формы имени
  const q0 = nq.split(/[^а-я]+/).filter(Boolean)[0] ?? '';
  const described = (h: SearchHit) => {
    const w = norm(h.matched).split(/[^а-я]+/).filter(Boolean);
    if (w.length < 2 || (q0 && w[0] === q0)) return false;
    if (h.via === 'name' || !q0) return serviceWord(w[0]);
    return !w[0].startsWith(q0) && !stems(w[0]).some((x) => stems(q0).includes(x));
  };
  const trad = hits.filter((h) => h.via === 'tradition');
  const names = hits.filter((h) => h.via === 'name');
  const lead = names.find(whole);
  const key = lead ? firstWord(lead.id) : '';
  const name = lead ? names.filter((h) => whole(h) && firstWord(h.id) === key) : names.filter((h) => !described(h));
  const inName = new Set(name.map((h) => h.id));
  const near = hits.filter((h) => h.via === 'disambig' || ((h.via === 'name' || h.via === 'alt') && !inName.has(h.id) && described(h)));
  const inNear = new Set(near.map((h) => h.id));
  const forms = hits.filter((h) => !inNear.has(h.id) && (h.via === 'alt' || h.via === 'fuzzy' || (h.via === 'name' && !inName.has(h.id))));
  return { trad, name, exact: !!lead, forms, near };
}

/**
 * Строки результатов по группам (решение 120): «Имя совпадает — 10 лиц», «Другие формы и похожие имена — 2 лица»,
 * «Упомянуты рядом — 7 лиц»; у каждой — свой счётчик, команду «Показать на небе» ставит поиск верхней строки
 * (Search.tsx, resultBlocks). Одноимённые внутри группы — рядом, на месте самого значимого (UX-01); если в группе одно
 * имя, оно стоит в подписи («Имя совпадает: Иосиф — 10 лиц»), а строка начинается с уточнения. Опечатки — под
 * «Возможно, вы искали» первой группой. q — запрос: из нескольких слов группа имени называется «Совпадают все слова».
 */
export function personBlocks(hits: SearchHit[], q = ''): Block[] {
  const blocks: Block[] = [];
  const person = (h: SearchHit, grouped: boolean): Row => ({ key: h.id, kind: 'person', id: h.id, hit: h, grouped });
  // поиск по стиху или главе — две группы (IX-55, UX-58): «Названы в стихе» и «Стих упомянут в карточке»
  if (hits.some((h) => h.via === 'verse' || h.via === 'cited')) {
    const verse = hits.some((h) => /:/.test(h.matched));
    const named = hits.filter((h) => h.via === 'verse');
    const cited = hits.filter((h) => h.via === 'cited');
    if (named.length) blocks.push({ head: `${verse ? 'Названы в стихе' : 'Названы в главе'} — ${people(named.length)}`, rows: named.map((h) => person(h, false)), ids: named.map((h) => h.id) });
    if (cited.length)
      blocks.push({ head: `${verse ? 'Стих упомянут в карточке' : 'Глава упомянута в карточке'} — ${people(cited.length)}`, rows: cited.map((h) => person(h, false)), ids: cited.map((h) => h.id) });
    return blocks;
  }
  // по всем словам никого — лица по имени одним блоком (IX-71): «По всем словам ничего; по имени «Иосиф» — 10 лиц»
  const partial = hits[0]?.partial;
  if (partial) {
    const n = hits.length;
    return [{ head: partialHead(partial, n), rows: hits.map((h) => person(h, byId.get(h.id)?.name === partial && !!byId.get(h.id)?.disambig)), ids: hits.map((h) => h.id) }];
  }
  const g = groupHits(hits, q);
  for (const h of g.trad) {
    const p = byId.get(h.id);
    blocks.push({ head: `«${h.tradition}»: в Синодальном переводе — ${p?.name ?? h.id}${p?.disambig ? `, ${p.disambig}` : ''}`, rows: [person(h, false)], ids: [h.id] });
  }
  // одноимённые — рядом, на месте самого значимого из них
  const clustered = (list: SearchHit[]) => {
    const byName = new Map<string, SearchHit[]>();
    for (const h of list) {
      const nm = byId.get(h.id)?.name ?? h.id;
      byName.set(nm, [...(byName.get(nm) ?? []), h]);
    }
    return [...byName.values()].flat();
  };
  const block = (head: string, list: SearchHit[], group: 'name' | 'forms' | 'near') => {
    if (!list.length) return;
    const names = new Set(list.map((h) => byId.get(h.id)?.name ?? h.id));
    // одно имя на всю группу — в подписи; строки начинаются с уточнения
    const one = names.size === 1 && list.length > 1 ? [...names][0] : null;
    blocks.push({ head: `${head}${one ? `: ${one}` : ''} — ${people(list.length)}`, rows: clustered(list).map((h) => person(h, !!one)), ids: list.map((h) => h.id), group });
  };
  const nq = norm(fixLayout(q)).trim();
  const words = nq.split(/[^а-я]+/).filter(Boolean);
  // начало имени, пока его набирают: «Иос» — «Имя начинается с «Иос»»; «Навин» — «Совпадает слово имени»
  const nameWords = (h: SearchHit) => norm(byId.get(h.id)?.name ?? '').split(/[^а-я]+/).filter(Boolean);
  const begins = words.length === 1 && g.name.every((h) => nameWords(h)[0]?.startsWith(nq));
  const inWord = words.length === 1 && g.name.every((h) => nameWords(h).some((w) => w.startsWith(nq)));
  const nameHead = g.exact
    ? 'Имя совпадает'
    : words.length > 1
      ? 'Совпадают все слова'
      : begins
        ? `Имя начинается с «${q.trim()}»`
        : inWord
          ? 'Совпадает слово имени'
          : 'Имя совпадает частично';
  const fuzzy = g.forms.some((h) => h.via === 'fuzzy');
  const formsHead = fuzzy ? 'Возможно, вы искали: похожие имена' : 'Другие формы и похожие имена';
  // опечатки — первыми: точного совпадения нет, а похожее имя — то, что искали
  if (fuzzy) block(formsHead, g.forms, 'forms');
  block(nameHead, g.name, 'name');
  if (!fuzzy) block(formsHead, g.forms, 'forms');
  block('Упомянуты рядом', g.near, 'near');
  return blocks;
}

/** Лица по запросу для поля выбора лица (без поиска по стиху): тот же индекс и то же ранжирование, что у поиска. */
export function personHits(q: string, exclude: (id: string) => boolean = () => false, limit = 40): SearchHit[] {
  if (!q.trim()) return [];
  return searchIndex.search(q, limit).filter((h) => h.via !== 'verse' && h.via !== 'cited' && !exclude(h.id));
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
  /**
   * Вторая команда строки-лица (J3: «в набор»): надпись в конце строки — для мыши и пальца, Shift+Enter в поле —
   * для клавиатуры. Надпись скрыта от диктора: внутри option нет вложенного органа управления (WCAG 4.1.2), а команду
   * диктору называет статус списка (Search.tsx).
   */
  rowCmd?: { label: (id: string) => string; title: string; hint: string; run: (id: string) => string | void };
  /**
   * Команда пустого списка (решение 120: пустой поиск ведёт в «Указатель»): кнопка под «ничего не найдено»; Enter в
   * поле при пустом списке делает то же.
   */
  emptyCmd?: { label: string; run: () => void; keep?: boolean } | null;
}

/** «По всем словам ничего; по имени «Иосиф» — 10 лиц» (IX-71). */
export const partialHead = (name: string, n: number) => `По всем словам ничего; по имени «${name}» — ${n}\u00a0${plural(n, 'лицо', 'лица', 'лиц')}`;

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
  // курсор по умолчанию — первое лицо, а не «Все N на небе»: Enter открывает лучшее совпадение; у ссылки на главу
  // или стих — «Читать главу» или «Все N из стиха на небе» (IX-75), в выборе второго лица — «уже выбрана» (UX-13)
  const firstPerson = rows.findIndex((r) => r.kind === 'person' || ('lead' in r && !!r.lead));
  const active = cursor >= 0 && cursor < rows.length ? cursor : firstPerson;
  const listOpen = open && (!!q.trim() || !!notice);
  // что сказала вторая команда строки («Иессей добавлен в набор; в наборе 5 лиц», IX-84) — до следующего набора или хода курсора
  const [said, setSaid] = useState('');
  const runCmd = (pid: string) => {
    const text = props.rowCmd?.run(pid);
    if (text) setSaid(text);
  };

  // полное уточнение строки под курсором (решение 120): если в строке оно обрезано — строкой у нижнего края списка;
  // курсор ставят стрелки и мышь, поэтому строка отвечает и фокусу, и наведению
  const [full, setFull] = useState('');
  useLayoutEffect(() => {
    const r = listOpen && active >= 0 ? rows[active] : undefined;
    const p = r?.kind === 'person' ? byId.get(r.id) : undefined;
    const el = p?.disambig ? document.getElementById(optId(active))?.querySelector<HTMLElement>('.l1') : null;
    setFull(p && el && el.scrollWidth > el.clientWidth + 1 ? `${p.name}, ${p.disambig}` : '');
  }, [active, listOpen, rows.length, q]);

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
    if (after === 'stay') return;
    close();
    setKept(after === 'keep');
  };
  const move = (to: number) => {
    if (!rows.length) return;
    setSaid('');
    setCursor(Math.max(0, Math.min(rows.length - 1, to)));
  };
  const onKey = (e: KeyboardEvent) => {
    const row = listOpen ? rows[active] : undefined;
    if (e.key === 'Enter' && e.shiftKey && props.rowCmd && row?.kind === 'person') {
      // Shift+Enter — вторая команда строки; список остаётся открытым: так берут несколько лиц подряд
      e.preventDefault();
      runCmd(row.id);
      return;
    }
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
    } else if (e.key === 'Enter' && listOpen && q.trim() && props.emptyCmd && !rows.length) {
      e.preventDefault();
      props.emptyCmd.run();
      if (!props.emptyCmd.keep) close();
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
          setSaid('');
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
        onClick={() => {
          // щелчок по полю с сохранённым запросом открывает прежний список (IX-60); фокус с клавиатуры — без списка
          if (q.trim() && !open) {
            setKept(false);
            setOpen(true);
          }
        }}
        onBlur={(e) => {
          clearTimeout(blurTimer.current);
          // Tab на кнопку «Указателя» под «ничего не найдено» список не закрывает
          if (list.current && e.relatedTarget instanceof Node && list.current.contains(e.relatedTarget)) return;
          blurTimer.current = window.setTimeout(close, 150);
        }}
        onKeyDown={onKey}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listOpen ? listId : undefined}
        aria-expanded={listOpen && rows.length > 0}
        aria-activedescendant={listOpen && active >= 0 && rows[active] ? optId(active) : undefined}
        aria-describedby={props.rowCmd ? `${id}-hint` : undefined}
      />
      {/* вторая команда строки — подсказкой поля (MOB-63): внутри option кнопка диктору недоступна */}
      {props.rowCmd ? (
        <span id={`${id}-hint`} class="visually-hidden">
          {props.rowCmd.hint}
        </span>
      ) : null}
      <span class="visually-hidden" aria-live="polite">
        {listOpen ? (said ? typo(said) : !q.trim() && notice ? typo(`${notice.text} ${props.status}`) : props.status) : ''}
      </span>
      {listOpen && (
        // список (listbox) — только когда в нём есть строки (I3; MOB-28): «ничего не найдено» и сообщение об адресе —
        // не пункты списка; сообщение над строками скрыто от диктора внутри списка, его читает живая область статуса
        <div
          class="results"
          id={listId}
          ref={list}
          role={rows.length ? 'listbox' : undefined}
          aria-label={rows.length ? props.listLabel : undefined}
          style={maxH ? { '--results-max': `${maxH}px` } : undefined}
        >
          {!q.trim() && notice && (
            <div class="empty notice" aria-hidden={rows.length ? 'true' : undefined}>
              {typo(notice.text)}
            </div>
          )}
          {rows.length > 0 && (
            <>
              {blocks.map((b, bi) => {
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
                  if (r.kind === 'person') return <ResultRow key={r.key} {...common} person={r.id} grouped={r.grouped} cmd={props.rowCmd} run={runCmd} />;
                  return (
                    // «уже выбрана первой» — строка-сообщение: выбрать её нельзя (UX-13)
                    <div key={r.key} {...common} class={`result cmdrow ${r.kind}`} aria-disabled={r.kind === 'self' ? 'true' : undefined}>
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
              {full ? (
                // зрительная подсказка: диктор слышит полное уточнение в самой строке
                <div class="full" aria-hidden="true">
                  {typo(full)}
                </div>
              ) : null}
            </>
          )}
          {!rows.length && q.trim() && props.empty ? (
            <div class="empty">
              {props.empty}
              {props.emptyCmd ? (
                <>
                  <br />
                  <button
                    type="button"
                    class="to-index"
                    onMouseDown={(e) => e.preventDefault()}
                    onBlur={() => (blurTimer.current = window.setTimeout(close, 150))}
                    onClick={() => {
                      props.emptyCmd?.run();
                      if (!props.emptyCmd?.keep) close();
                    }}
                  >
                    {props.emptyCmd.label}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** «3 лица», «ничего не найдено» — для живой области списка. */
export const countStatus = (n: number, loading = false) => (n ? `${n}\u00a0${plural(n, 'лицо', 'лица', 'лиц')}` : loading ? '' : 'ничего не найдено');

/** Размер микрошкалы строки поиска, px (VIS-17; на узком экране её ширину задаёт CSS). */
export const AXIS_W = 120;
export const AXIS_H = 14;
/** Риски микрошкалы — меридианы событий неба этой модели: Потоп, Исход, закладка храма, Рождество Христово. */
const AXIS_EVENTS = ['Потоп', 'Исход', 'Закладка храма', 'Рождество Христово'];
/** Правый край микрошкалы: завершение канона (около 95 г. по Р. Х.; ТЗ § 3.4) — после него лиц Писания нет. */
const AXIS_END = 100;

/**
 * Микрошкала строки поиска (ТЗ § 3.7; VIS-17): время от сотворения (по модели) до конца I в. по Р. Х., риски
 * меридианов событий, как на небе, и отрезок жизни. Годы — как у следа на небе: сплошной отрезок от рождения до смерти
 * или до последнего упоминания, без придуманной длительности жизни; у лица, чьё время не установлено, — редкие точки
 * через годы его эпохи.
 */
export function axisMarks(m: { chrono: Map<string, ChronoRow> }, c: ChronoRow): { t0: number; t1: number; ticks: number[]; from: number; to: number; dotted: boolean } {
  const t0 = Math.min(m.chrono.get('adam')?.b ?? -4173, c.b);
  const ticks = eventMarks({ model: m } as unknown as SkyContext)
    .filter((e) => AXIS_EVENTS.includes(e.name))
    .map((e) => e.t);
  const dotted = c.cls === 'epochal';
  const to = dotted ? c.dEst : (c.d ?? c.last ?? c.b);
  return { t0, t1: AXIS_END, ticks, from: c.b, to: Math.max(c.b, to), dotted };
}

function drawSearchAxis(canvas: HTMLCanvasElement, a: ReturnType<typeof axisMarks>, colors: { ink2: string; ink3: string }) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || AXIS_W;
  const h = canvas.clientHeight || AXIS_H;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const x = (t: number) => Math.max(0, Math.min(w, ((t - a.t0) / (a.t1 - a.t0)) * w));
  const mid = Math.round(h / 2) + 0.5;
  ctx.strokeStyle = colors.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  // риски событий — во всю высоту шкалы
  for (const t of a.ticks) {
    const tx = Math.round(x(t)) + 0.5;
    ctx.moveTo(tx, 2);
    ctx.lineTo(tx, h - 2);
  }
  ctx.stroke();
  ctx.strokeStyle = colors.ink2;
  if (a.dotted) {
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 3]);
  } else ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x(a.from), mid);
  ctx.lineTo(Math.max(x(a.from) + 3, x(a.to)), mid);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Строка-лицо: имя и уточнение, годы и микрошкала жизни (ТЗ § 3.7); cmd — вторая команда строки в её конце. */
function ResultRow({ person: id, grouped, cmd, run, ...rest }: { person: string; grouped: boolean; cmd?: ComboboxProps['rowCmd']; run?: (id: string) => void } & Record<string, unknown>) {
  const p = byId.get(id)!;
  const ref = useRef<HTMLCanvasElement>(null);
  const m = model.value;
  const th = theme.value;
  useEffect(() => {
    const c = m.chrono.get(id);
    if (!ref.current || !c) return;
    const cs = getComputedStyle(document.documentElement);
    drawSearchAxis(ref.current, axisMarks(m, c), { ink2: cs.getPropertyValue('--ink-2').trim(), ink3: cs.getPropertyValue('--ink-3').trim() });
  }, [id, m, th]);
  // в группе одноимённых имя стоит в подписи группы: строка начинается с уточнения, имя — только для диктора
  const plain = !grouped || !p.disambig;
  return (
    <div {...rest} class={grouped ? 'result grouped' : 'result'}>
      <span class="l1">
        <span class={plain ? 'nm' : 'nm visually-hidden'}>{p.name}</span>
        {p.disambig ? <span class="ds">{plain ? typo(`, ${p.disambig}`) : typo(p.disambig)}</span> : null}
      </span>
      <span class="yr">{typo(lifeText(id, { when: false }))}</span>
      <canvas ref={ref} width={AXIS_W} height={AXIS_H} aria-hidden="true" />
      {cmd ? (
        // нажатие не уводит фокус из поля и не выбирает строку: команда — своя
        <span
          class="row-cmd"
          title={cmd.title}
          aria-hidden="true"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            (run ?? cmd.run)(id);
          }}
        >
          {cmd.label(id)}
        </span>
      ) : null}
    </div>
  );
}
