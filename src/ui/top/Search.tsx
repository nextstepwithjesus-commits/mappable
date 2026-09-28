import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { norm } from '../../engine/text.ts';
import { parseQueryRef, type SearchHit } from '../../engine/search.ts';
import { pickMode, pins, pinsQuery, pickSecond, searchNotice, selected } from '../../state.ts';
import { flyToIds, goTo, plural, refLabel } from '../common.tsx';
import { typo } from '../text/typo.ts';
import { prepareBook, searchIndex } from './searchIndex.ts';
import { Combobox, countStatus, personBlocks, type Block, type ComboboxProps, type Row } from './Combobox.tsx';
import { addToWork, removeFromWork, workSet } from '../work.ts';

/**
 * «В работу» — вторичная команда строки-лица поиска (J3): щелчок по надписи справа или Shift+Enter в поле. Лицо уже
 * в работе — «в работе», повторное нажатие убирает его из набора. Проп rowCmd — у Combobox.
 */
export const searchRowCmd: NonNullable<ComboboxProps['rowCmd']> = {
  label: (id: string) => (workSet.value.has(id) ? 'в работе' : 'в работу'),
  title: 'Взять лицо в рабочий набор или убрать из него (Shift+Enter)',
  hint: 'Shift+Enter — взять выбранное лицо в работу или убрать из набора',
  run: (id: string) => {
    if (workSet.peek().has(id)) removeFromWork(id);
    else addToWork(id);
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
  return [...blocks, ...personBlocks(hits)];
}

/** Поиск по имени, иным формам, уточнению, традиционному именованию и ссылке на стих или главу (ТЗ § 3.7; D9). */
export function Search() {
  const [q, setQ] = useState('');
  // перестроить результаты, когда подгрузились ссылки карточек и текст книги (поиск по стиху)
  const [ready, setReady] = useState(0);
  const [loading, setLoading] = useState(false);

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

  // в режиме выбора второго лица первое лицо не предлагается (UX-13): родство с самим собой — молчаливое «ничего»
  const firstId = pickMode.value ? selected.value : null;
  const hits = useMemo(() => (q.trim() ? searchIndex.search(q, 60).filter((h) => h.id !== firstId) : []), [q, ready, firstId]);
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
  const blocks = useMemo(() => resultBlocks(shown, { pinned, noAll }), [shown, pinned, noAll]);

  const choose = (r: Row) => {
    if (r.kind === 'unpin') {
      pins.value = [];
      pinsQuery.value = '';
      return;
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

  return (
    <Combobox
      rowCmd={searchRowCmd}
      id="find"
      class="search"
      role="search"
      label="Найти:"
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
      cmdLabel={(r) => (r.kind === 'all' ? `Все ${r.ids.length} на небе` : `Снять отметки: ${pins.value.length}\u00a0${plural(pins.value.length, 'лицо', 'лица', 'лиц')}`)}
      notice={notice}
      status={countStatus(shown.length, loading)}
      onEscape={() => (searchNotice.value = null)}
      empty={
        ref
          ? loading
            ? 'Ищу по ссылкам карточек…'
            : typo(`${ref.verses.length ? 'В стихе' : 'В главе'} ${refLabel(ref.ref)} не найдено лиц, отмеченных в атласе.`)
          : typo(`Лица с именем «${q.trim()}» в атласе нет. Проверьте написание по Синодальному переводу.`)
      }
    />
  );
}
