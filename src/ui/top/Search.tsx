import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { BOOKS } from '../../engine/books.ts';
import { norm } from '../../engine/text.ts';
import { parseQueryRef, refProblem, serviceWord, type QueryRef, type RefProblem, type SearchHit } from '../../engine/search.ts';
import { pickMode, pins, pinsQuery, pickSecond, searchNotice, selected } from '../../state.ts';
import { flyToIds, goTo, plural, refLabel } from '../common.tsx';
import { typo } from '../text/typo.ts';
import { prepareBook, searchIndex } from './searchIndex.ts';
import { Combobox, countStatus, partialHead, personBlocks, type Block, type ComboboxProps, type Row } from './Combobox.tsx';
import { addToWork, removeFromWork, workKeyText, workSet } from '../work.ts';
import { CHAPTERS, openChapter } from '../panels/Chapter.tsx';

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
 * Кого отметить на небе строкой «Все N на небе» (ТЗ § 3.7: «отмечает всех одноимённых»): при поиске по стиху
 * или главе — всех лиц стиха; иначе — одноимённых лучшего совпадения (то же первое слово имени), а не всех
 * найденных по уточнению («иосиф» — десять Иосифов, без Манассии и Ефрема, «сыновей Иосифа», и без Иосифии).
 */
export function markAllIds(hits: SearchHit[]): string[] {
  const first = hits.find((h) => h.via !== 'fuzzy');
  if (!first) return [];
  // по стиху или главе — названные в тексте; если названных нет — те, чьи карточки ссылаются на него
  if (first.via === 'verse' || first.via === 'cited') {
    const named = hits.filter((h) => h.via === 'verse');
    return (named.length ? named : hits.filter((h) => h.via === 'cited')).map((h) => h.id);
  }
  // одно имя — по первому слову: «Иисус» — Иисус Христос, Иисус Навин и все Иисусы; «иосиф» — Иосифы, но не Иосифия
  const word = (id: string) => norm(byId.get(id)?.name ?? '').split(' ')[0];
  const key = word(first.id);
  // «Сын Израильтянки», «Сын Иоиады» — не одноимённые: общее у них только служебное слово (IX-55)
  if (serviceWord(key)) return [];
  return hits.filter((h) => (h.via === 'name' || h.via === 'alt' || h.via === 'tradition') && word(h.id) === key).map((h) => h.id);
}

/**
 * Строки результатов: одноимённые — группой «Иосиф — 10 лиц» на месте самого значимого из них (UX-01);
 * традиционное именование — с пометой «в Синодальном переводе — …» (решение владельца 13); опечатки — под
 * «Возможно, вы искали». Первой строкой — «Все N на небе» или, если отметки уже стоят, «Снять отметки» (IX-19).
 * По ссылке на главу из «Глав» первая строка — «Читать Мф 1 — имена со ссылками», вторая — «Все 48 на небе»; по стиху
 * первая — «Все N из стиха на небе» (IX-75): Enter выбирает её, а не первое лицо. self — первое лицо «Родства» или
 * «Разворота», которое читатель набрал снова: строка «Руфь уже выбрана первой» без действия (UX-13).
 */
export function resultBlocks(hits: SearchHit[], opts: { pinned: boolean; noAll: boolean; ref?: QueryRef | null; self?: string | null }): Block[] {
  const blocks: Block[] = [];
  if (opts.self) blocks.push({ rows: [{ key: 'self', kind: 'self', id: opts.self, lead: true }] });
  if (opts.pinned) blocks.push({ rows: [{ key: 'unpin', kind: 'unpin' }] });
  else if (!opts.noAll) {
    const rows: Row[] = [];
    const ref = opts.ref;
    const read = !!ref && !ref.verses.length && CHAPTERS.includes(ref.ref);
    if (read) rows.push({ key: 'read', kind: 'read', ch: ref!.ref, lead: true });
    const ids = markAllIds(hits);
    if (ids.length > 1) rows.push({ key: 'all', kind: 'all', ids, lead: !!ref && !read, scope: ref ? (!ref.verses.length ? 'chapter' : ref.verses.length > 1 ? 'verses' : 'verse') : undefined });
    if (rows.length) blocks.push({ rows });
  }
  return [...blocks, ...personBlocks(hits)];
}

/** Надпись строки-команды списка. */
export function cmdLabel(r: Exclude<Row, { kind: 'person' }>, pinned: number): string {
  if (r.kind === 'read') return `Читать ${refLabel(r.ch)} — имена со ссылками`;
  if (r.kind === 'self') {
    const p = byId.get(r.id);
    return `${p?.name ?? r.id} уже ${p?.sex === 'f' ? 'выбрана первой' : 'выбран первым'} — выберите другое лицо`;
  }
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

/** Поиск по имени, иным формам, уточнению, традиционному именованию и ссылке на стих или главу (ТЗ § 3.7; D9). */
export function Search() {
  const [q, setQ] = useState('');
  // перестроить результаты, когда подгрузились ссылки карточек и текст книги (поиск по стиху)
  const [ready, setReady] = useState(0);
  const [loading, setLoading] = useState(false);

  const ref = useMemo(() => parseQueryRef(q), [q]);
  const bad = useMemo(() => (ref ? refProblem(ref) : null), [ref]);
  useEffect(() => {
    if (!ref || bad) return;
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
  }, [ref?.book, !!bad]);

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
  const blocks = useMemo(() => resultBlocks(shown, { pinned, noAll, ref, self }), [shown, pinned, noAll, ref, self]);

  const choose = (r: Row) => {
    if (r.kind === 'self') return 'keep' as const;
    if (r.kind === 'unpin') {
      pins.value = [];
      pinsQuery.value = '';
      return;
    }
    if (r.kind === 'read') {
      // глава из «Глав» — панель на этой главе; лица главы на небе подсвечивает сама панель (IX-75)
      openChapter(r.ch);
      return 'keep' as const;
    }
    if (r.kind === 'all') {
      // отметки на небе со строкой «Отмечено N лиц по запросу…» (E10) и перелёт к рамке отмеченных
      pins.value = r.ids;
      pinsQuery.value = q.trim();
      flyToIds(r.ids);
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
    // фокус — на заголовок открытой карточки: дальше Tab идёт по её разделам, а не по кнопкам неба
    setTimeout(() => document.querySelector<HTMLElement>(`.folio #title-${CSS.escape(id)}`)?.focus(), 80);
    // запрос остаётся в поле выделенным: стрелка вниз снова открывает список (IX-20)
    return 'keep' as const;
  };

  // что объявить диктору: число лиц, «по всем словам ничего…», «уже выбрана первой», «такой главы нет»
  const partial = shown[0]?.partial;
  const status = bad
    ? refProblemText(bad)
    : self
      ? `${cmdLabel({ key: 'self', kind: 'self', id: self, lead: true }, 0)}; ${countStatus(shown.length, loading)}`
      : partial
        ? partialHead(partial, shown.length)
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
      empty={
        bad
          ? typo(refProblemText(bad))
          : ref
            ? loading
              ? 'Ищу по ссылкам карточек…'
              : typo(`${ref.verses.length ? 'В стихе' : 'В главе'} ${refLabel(ref.ref)} не найдено лиц, отмеченных в атласе.`)
            : typo(emptyText(q.trim()))
      }
    />
  );
}
