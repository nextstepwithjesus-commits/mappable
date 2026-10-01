import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { BOOKS } from '../../engine/books.ts';
import { norm } from '../../engine/text.ts';
import { fixLayout, parseQueryRef, refProblem, serviceWord, type QueryRef, type RefProblem, type SearchHit } from '../../engine/search.ts';
import { pickMode, pins, pinsQuery, pickSecond, searchNotice, selected } from '../../state.ts';
import { flyToIds, goTo, plural, refLabel } from '../common.tsx';
import { typo } from '../text/typo.ts';
import { prepareBook, searchIndex } from './searchIndex.ts';
import { Combobox, countStatus, firstWord, groupHits, partialHead, personBlocks, type Block, type ComboboxProps, type Row } from './Combobox.tsx';
import { addToWork, removeFromWork, workKeyText, workSet } from '../work.ts';
import { CHAPTERS, openChapter } from '../panels/Chapter.tsx';
import { showResults } from '../show.ts';
import { openIndex } from '../panels/Index.tsx';

/**
 * «В набор» — вторичная команда строки-лица поиска (J3; этап 11 — одно слово «набор», Я30): щелчок по надписи справа
 * или Shift+Enter в поле. Лицо уже в наборе — «в наборе», повторное нажатие убирает его из набора. Что сделано,
 * объявляется той же фразой, что у клавиши В на небе (IX-84): «Иессей добавлен в набор; в наборе 5 лиц». Проп rowCmd —
 * у Combobox.
 */
export const searchRowCmd: NonNullable<ComboboxProps['rowCmd']> = {
  label: (id: string) => (workSet.value.has(id) ? 'в наборе' : 'в набор'),
  title: 'Добавить лицо в набор или убрать из него (Shift+Enter)',
  hint: 'Shift+Enter — добавить выбранное лицо в набор или убрать из набора',
  run: (id: string) => {
    const had = workSet.peek().has(id);
    if (had) removeFromWork(id);
    else addToWork(id);
    return workKeyText({ kind: had ? 'drop' : 'take', id, size: workSet.peek().size });
  },
};

export type { Block, Row };

/**
 * Кого отметить на небе строкой «Все N из стиха на небе» или командой группы «Имя совпадает» (ТЗ § 3.7: «отмечает
 * всех одноимённых»): при поиске по стиху или главе — всех лиц стиха; иначе — одноимённых лучшего совпадения (то же
 * первое слово имени), а не всех найденных по уточнению («иосиф» — десять Иосифов, без Манассии и Ефрема, «сыновей
 * Иосифа», и без Иосифии).
 */
export function markAllIds(hits: SearchHit[], q = ''): string[] {
  const first = hits.find((h) => h.via !== 'fuzzy');
  if (!first) return [];
  // по стиху или главе — названные в тексте; если названных нет — те, чьи карточки ссылаются на него
  if (first.via === 'verse' || first.via === 'cited') {
    const named = hits.filter((h) => h.via === 'verse');
    return (named.length ? named : hits.filter((h) => h.via === 'cited')).map((h) => h.id);
  }
  // «Сын Израильтянки», «Сын Иоиады» — не одноимённые: общее у них только служебное слово (IX-55)
  if (serviceWord(firstWord(first.id))) return [];
  const g = groupHits(hits, q);
  return g.exact ? g.name.map((h) => h.id) : [];
}

/**
 * Строки результатов (решение 120): группы «Имя совпадает», «Другие формы и похожие имена», «Упомянуты рядом» со
 * своими счётчиками; в каждой группе из двух лиц и больше первая строка — «Отметить на небе (N)»: отметки на небе и гости
 * вне показа (решение 113). Традиционное именование — с пометой «в Синодальном переводе — …» (решение владельца 13).
 * Если отметки уже стоят, первой строкой — «Снять отметки» (IX-19), команды групп не повторяются. По ссылке на главу
 * из «Глав» первая строка — «Читать Мф 1 — имена со ссылками», вторая — «Все 48 на небе»; по стиху первая — «Все N из
 * стиха на небе» (IX-75): Enter выбирает её, а не первое лицо. self — первое лицо «Родства» или «Разворота», которое
 * читатель набрал снова: строка «Руфь уже выбрана первой» без действия (UX-13).
 */
export function resultBlocks(hits: SearchHit[], opts: { pinned: boolean; noAll: boolean; ref?: QueryRef | null; self?: string | null; q?: string }): Block[] {
  const blocks: Block[] = [];
  if (opts.self) blocks.push({ rows: [{ key: 'self', kind: 'self', id: opts.self, lead: true }] });
  const ref = opts.ref;
  if (opts.pinned) blocks.push({ rows: [{ key: 'unpin', kind: 'unpin' }] });
  else if (!opts.noAll && ref) {
    const rows: Row[] = [];
    const read = !ref.verses.length && CHAPTERS.includes(ref.ref);
    if (read) rows.push({ key: 'read', kind: 'read', ch: ref.ref, lead: true });
    const ids = markAllIds(hits, opts.q);
    if (ids.length > 1) rows.push({ key: 'all', kind: 'all', ids, lead: !read, scope: !ref.verses.length ? 'chapter' : ref.verses.length > 1 ? 'verses' : 'verse' });
    if (rows.length) blocks.push({ rows });
  }
  const groups = personBlocks(hits, opts.q ?? '');
  // команда группы — по имени; у стиха и главы — общая строка выше; «Сын…» — не одноимённые (IX-55)
  const cmds = !opts.pinned && !opts.noAll && !ref && !groups.some((b) => b.rows.some((r) => r.kind === 'person' && (r.hit.via === 'verse' || r.hit.via === 'cited')));
  const service = (b: Block) => b.group === 'name' && !!b.ids?.length && serviceWord(firstWord(b.ids[0]));
  return [
    ...blocks,
    ...groups.map((b, i) =>
      cmds && b.ids && b.ids.length > 1 && !service(b) ? { ...b, rows: [{ key: `all-${i}`, kind: 'all' as const, ids: b.ids, group: true }, ...b.rows] } : b,
    ),
  ];
}

/** Надпись строки-команды списка. */
export function cmdLabel(r: Exclude<Row, { kind: 'person' }>, pinned: number): string {
  if (r.kind === 'retry') return 'Повторить загрузку';
  if (r.kind === 'read') return `Читать ${refLabel(r.ch)} — имена со ссылками`;
  if (r.kind === 'self') {
    const p = byId.get(r.id);
    return `${p?.name ?? r.id} уже ${p?.sex === 'f' ? 'выбрана первой' : 'выбран первым'} — выберите другое лицо`;
  }
  // отметки поиска (решение 156; U9): «Отметить на небе (10)» — не перелёт и не гость показа
  if (r.kind === 'all' && r.group) return `Отметить на небе (${r.ids.length})`;
  if (r.kind === 'all') return `Все ${r.ids.length} ${r.scope === 'verse' ? 'из стиха ' : r.scope === 'verses' ? 'из стихов ' : ''}на небе`;
  return `Снять отметки: ${pinned} ${plural(pinned, 'лицо', 'лица', 'лиц')}`;
}

/** Где искать главу: «в книге Бытия», «в 1-й книге Царств», «в Евангелии от Матфея», «в 1-м послании Петра». */
export function bookWhere(code: string): string {
  const b = BOOKS.find((x) => x.code === code);
  if (!b) return `в ${refLabel(code)}`;
  const num = /^(\d)-(?:й|го) (.+)$/.exec(b.gen);
  if (b.t === 'ot' || code === 'Деян' || code === 'Откр') return num ? `в ${num[1]}-й книге ${num[2]}` : `в книге ${b.gen}`;
  if (['Мф', 'Мк', 'Лк', 'Ин'].includes(code)) return `в Евангелии ${b.gen}`;
  return num ? `в ${num[1]}-м послании ${num[2]}` : `в Послании ${b.gen}`;
}

/**
 * Такой главы или стиха нет (IX-82, UX-82): «Такой главы нет: в Евангелии от Матфея 28 глав»; «Такого стиха нет:
 * в Быт 5 — 32 стиха»; в Дан 3 — ещё и о стихах 24–90, которых нет в каноне (ТЗ П-1).
 */
export function refProblemText(p: RefProblem): string {
  if (p.kind === 'chapter') {
    const n = p.chapters;
    return `Такой главы нет: ${bookWhere(p.book)} ${n === 1 ? 'одна глава' : `${n} ${plural(n, 'глава', 'главы', 'глав')}`}.`;
  }
  const ch = refLabel(`${p.book} ${p.chapter}`);
  if (p.gap) return `Такого стиха нет: в ${ch} — стихи 1–${p.gap[0] - 1} и ${p.gap[1] + 1}–${p.last}; стихов ${p.gap[0]}–${p.gap[1]} в каноническом тексте нет.`;
  return `Такого стиха нет: в ${ch} — ${p.last} ${plural(p.last, 'стих', 'стиха', 'стихов')}.`;
}

/** Что сказать, когда никого нет (IX-55, IX-71): одно служебное слово, несколько слов или имя, которого нет. */
export function emptyText(q: string): string {
  const words = norm(q).split(/[^а-я]+/).filter(Boolean);
  if (words.length && words.every(serviceWord)) return `«${q}» — слово уточнения; ищите вместе с именем: «Давид сын Иессея», «Иосиф муж Марии».`;
  if (words.length > 1) return `По всем словам ничего, и ни одно слово не совпало с именем лица атласа. Проверьте написание по Синодальному переводу.`;
  return `Лица с именем «${q}» в атласе нет. Проверьте написание по Синодальному переводу.`;
}

/** Данные для поиска по ссылке не загрузились (решение 127): это не «не найдено». */
export const LOAD_FAILED = 'Не удалось загрузить данные для поиска по ссылке (карточки или текст книги) — поэтому лиц может быть больше.';

/**
 * Никого не нашлось по имени — «Указатель» на букве запроса (решение 120): рядом по алфавиту видно, как имя записано в
 * Синодальном переводе. «lfdbl» — буква «Д» (раскладка исправляется, как в поиске).
 */
export function indexCmd(q: string): { label: string; letter: string | null } {
  const c = norm(fixLayout(q)).replace(/[^а-я]/g, '')[0];
  const letter = c ? c.toUpperCase() : null;
  return { letter, label: letter ? `Открыть «Указатель» на букве «${letter}»` : 'Открыть «Указатель»' };
}

/** Поиск по имени, иным формам, уточнению, традиционному именованию и ссылке на стих или главу (ТЗ § 3.7; D9). */
export function Search() {
  const [q, setQ] = useState('');
  // перестроить результаты, когда подгрузились ссылки карточек и текст книги (поиск по стиху)
  const [ready, setReady] = useState(0);
  const [loading, setLoading] = useState(false);
  // тома карточек или текст книги не загрузились (решение 127): «не удалось загрузить — повторить», а не «не найдено»
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const ref = useMemo(() => parseQueryRef(q), [q]);
  const bad = useMemo(() => (ref ? refProblem(ref) : null), [ref]);
  useEffect(() => {
    if (!ref || bad) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    prepareBook(ref.book)
      .then(
        () => alive && setFailed(false),
        // тома не загрузились — ищем по тому, что уже есть, и говорим об этом; отказ в кэше не остаётся (searchIndex.ts)
        () => alive && setFailed(true),
      )
      .then(() => {
        if (!alive) return;
        setLoading(false);
        setReady((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [ref?.book, !!bad, retry]);

  // в режиме выбора второго лица первое лицо не предлагается: набрано его имя — строка «Руфь уже выбрана первой»,
  // а Enter ничего не выбирает (UX-13); второе лицо — ровно то, что выбрано в списке
  const firstId = pickMode.value ? selected.value : null;
  const all = useMemo(() => (q.trim() ? searchIndex.search(q, 60) : []), [q, ready]);
  const self = firstId && all[0]?.id === firstId && all[0].strong ? firstId : null;
  const hits = useMemo(() => (firstId ? all.filter((h) => h.id !== firstId) : all), [all, firstId]);
  const notice = searchNotice.value;
  // сообщение об адресе приходит с пустым полем: прежний запрос его не заслоняет (IX-44)
  useEffect(() => {
    if (notice) setQ('');
  }, [notice]);
  const noticeHits = useMemo<SearchHit[]>(() => (notice ? notice.ids.map((id, i) => ({ id, score: -i, matched: id, via: 'name' as const })) : []), [notice]);
  const shown = q.trim() ? hits : noticeHits;
  const pinned = pins.value.length > 0 && pinsQuery.value === q.trim() && !!q.trim();
  // в режиме выбора второго лица и в подсказках к неверному адресу отмечать всех не нужно
  const noAll = !!pickMode.value || !q.trim();
  const lost = !!ref && !bad && failed && !loading;
  const blocks = useMemo(() => {
    const b = resultBlocks(shown, { pinned, noAll, ref, self, q: q.trim() });
    // часть найдена по уже загруженному, остальное не загрузилось (решение 127): сказано над строками, с «Повторить»
    return lost && shown.length ? [{ head: LOAD_FAILED, rows: [{ key: 'retry', kind: 'retry' as const }] }, ...b] : b;
  }, [shown, pinned, noAll, ref, self, q, lost]);

  const choose = (r: Row) => {
    if (r.kind === 'self') return 'keep' as const;
    if (r.kind === 'unpin') {
      pins.value = [];
      pinsQuery.value = '';
      return;
    }
    if (r.kind === 'retry') {
      setRetry((n) => n + 1);
      return 'stay' as const;
    }
    if (r.kind === 'read') {
      // глава из «Глав» — панель на этой главе; лица главы на небе подсвечивает сама панель (IX-75)
      openChapter(r.ch);
      return 'keep' as const;
    }
    if (r.kind === 'all') {
      // отметки на небе со строкой «Отмечено N лиц по запросу…» (E10) и перелёт к рамке отмеченных; кто вне показа —
      // встаёт гостем, пока стоят отметки (решение 113: пустой карты после обещания показать нет)
      pins.value = r.ids;
      pinsQuery.value = q.trim();
      const guests = showResults(r.ids, 'search', 'pins');
      // небо перестраивается под гостей — перелёт после перехода строк
      if (guests) window.setTimeout(() => flyToIds(r.ids), 120);
      else flyToIds(r.ids);
      return;
    }
    const id = r.id;
    searchNotice.value = null;
    // в режиме «Родство с…» или «Разворот с…» найденное лицо становится вторым, первое остаётся (D6)
    if (pickSecond(id)) {
      setQ('');
      return 'clear' as const;
    }
    goTo(id);
    // найденное лицо вне показа — гостем, пока оно выбрано (решение 113)
    showResults([id], 'search', 'selected', id);
    // фокус — на заголовок открытой карточки: дальше Tab идёт по её разделам, а не по кнопкам неба
    setTimeout(() => document.querySelector<HTMLElement>(`.folio #title-${CSS.escape(id)}`)?.focus(), 80);
    // запрос остаётся в поле выделенным: стрелка вниз снова открывает список (IX-20)
    return 'keep' as const;
  };

  // что объявить диктору: число лиц, «по всем словам ничего…», «уже выбрана первой», «такой главы нет»
  const partial = shown[0]?.partial;
  const toIndex = !ref && !bad && q.trim() && !shown.length ? indexCmd(q) : null;
  const status = bad
    ? refProblemText(bad)
    : lost
      ? `${LOAD_FAILED} ${shown.length ? `Найдено по уже загруженному: ${countStatus(shown.length)}; первая строка — «Повторить загрузку».` : 'Enter — повторить.'}`
    : self
      ? `${cmdLabel({ key: 'self', kind: 'self', id: self, lead: true }, 0)}; ${countStatus(shown.length, loading)}`
      : partial
        ? partialHead(partial, shown.length)
        : toIndex
          ? `${countStatus(0)}; Enter — ${toIndex.label.replace(/^О/, 'о')}`
          : countStatus(shown.length, loading);

  return (
    <Combobox
      rowCmd={searchRowCmd}
      id="find"
      class="search"
      role="search"
      // двоеточие — своим элементом: на узком экране свёрнутое поле — команда «Найти» (L9; phone.css, .colon)
      label={
        <>
          Найти<span class="colon">:</span>
        </>
      }
      placeholder="имя или стих: Руф 4:21"
      title="Найти по имени или стиху (/)"
      keyshortcuts="/"
      listLabel="Результаты поиска"
      q={q}
      onInput={(v) => {
        setQ(v);
        searchNotice.value = null;
        // новый поиск снимает прежние отметки на небе (IX-19)
        if (pins.value.length) {
          pins.value = [];
          pinsQuery.value = '';
        }
      }}
      blocks={blocks}
      onClear={() => setQ('')}
      onChoose={choose}
      cmdLabel={(r) => cmdLabel(r, pins.value.length)}
      notice={notice}
      status={status}
      onEscape={() => (searchNotice.value = null)}
      emptyCmd={
        lost
          ? { label: 'Повторить', keep: true, run: () => setRetry((n) => n + 1) }
          : toIndex
            ? { label: toIndex.label, run: () => openIndex({ letter: toIndex.letter, filter: '' }) }
            : null
      }
      empty={
        bad
          ? typo(refProblemText(bad))
          : ref
            ? lost
              ? typo(LOAD_FAILED)
              : loading
              ? 'Ищу по ссылкам карточек…'
              : typo(`${ref.verses.length ? 'В стихе' : 'В главе'} ${refLabel(ref.ref)} не найдено лиц, отмеченных в атласе.`)
            : typo(emptyText(q.trim()))
      }
    />
  );
}
