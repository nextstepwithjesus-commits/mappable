import { useEffect, useMemo, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { books, byId, persons } from '../../data/atlas.ts';
import { model, panel } from '../../state.ts';
import { goTo, plural, ROLE_NAMES } from '../common.tsx';
import { lifeEpoch } from '../card/shared.tsx';
import { atlasCoord } from '../../engine/layout.ts';
import { norm } from '../../engine/text.ts';
import { lifeText } from '../sky/text.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { num, typo } from '../text/typo.ts';
import { Segmented } from '../controls.tsx';
import { starLaneOf } from '../../engine/stays.ts';

/** Известное лицо — полужирным в указателе (CARD-45): яркая звезда неба. */
const KNOWN_MAG = 2;

/**
 * Статьи указателя: имя — лица. Одноимённые — по году рождения (у лиц без года — в конце, по значимости), чтобы
 * Иосиф, сын Иакова, стоял раньше Иосифа, мужа Марии (CARD-45).
 */
export function indexGroups(birth: (id: string) => number | null): [string, string[]][] {
  const byName = new Map<string, string[]>();
  for (const p of persons) {
    if (p.unnamed) continue;
    const a = byName.get(p.name) ?? [];
    a.push(p.id);
    byName.set(p.name, a);
  }
  for (const ids of byName.values()) {
    ids.sort((x, y) => {
      const bx = birth(x);
      const by = birth(y);
      if (bx !== null && by !== null && bx !== by) return bx - by;
      if (bx === null && by !== null) return 1;
      if (by === null && bx !== null) return -1;
      return byId.get(x)!.magnitude - byId.get(y)!.magnitude;
    });
  }
  return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
}

/**
 * Открыть «Указатель» на букве или с запросом (решение 120: пустой поиск ведёт в «Указатель»). Панель, открытая или
 * уже открытая, берёт просьбу и сбрасывает её.
 */
export const indexAsk = signal<{ letter?: string | null; filter?: string; canon?: Canon; book?: string } | null>(null);
export function openIndex(ask: { letter?: string | null; filter?: string; canon?: Canon; book?: string }) {
  indexAsk.value = ask;
  panel.value = 'index';
}

/**
 * Что стоит у имени (решение 120; UI-22: указатель — не на языке координат): первая роль лица («царь», «пророчица»),
 * без ролей — краткое название эпохи жизни («Судьи», «Возвращение»); у рода и народа — ничего.
 */
export function indexTag(id: string, m = model.value): { text: string; title: string } | null {
  const p = byId.get(id);
  if (!p) return null;
  // Иисус Христос: «Христос» и есть Мессия, а одна из прочих ролей («пророк») рядом с именем читалась бы как главная
  // (рецензия этапа 21) — у Него в указателе эпоха, как у лиц без роли
  const r = p.roles.includes('messiah') ? undefined : p.roles[0];
  if (r) {
    const t = ROLE_NAMES[r]?.[p.sex === 'f' ? 1 : 0] ?? '';
    return t ? { text: t, title: t } : null;
  }
  if (p.kind === 'people' || p.kind === 'clan') return null;
  const e = lifeEpoch(id, m.chrono.get(id), m.epochs);
  return e ? { text: e.short, title: `эпоха: ${e.name}` } : null;
}

// ---------- каталог по Заветам и книгам (этап 21, решение 202) ----------

/** Часть Писания каталога: вся Библия, Ветхий или Новый Завет. */
export type Canon = 'all' | 'ot' | 'nt';
export const CANONS: readonly { value: Canon; label: string; title: string }[] = [
  { value: 'all', label: 'Вся Библия', title: 'Все лица атласа' },
  { value: 'ot', label: 'Ветхий Завет', title: 'Лица, впервые названные в Ветхом Завете' },
  { value: 'nt', label: 'Новый Завет', title: 'Лица, впервые названные в Новом Завете' },
];
const testamentOf = new Map(books.map((b) => [b.code, b.t]));
/**
 * Лицо в каталоге (решение 202). Часть Писания — по книге, где лицо названо впервые (в каноническом порядке): Авраам,
 * названный и в Мф 1, — лицо Ветхого Завета, Иосиф, муж Марии, — Нового. Книга — все лица, названные в ней (IdxPerson.inBooks).
 */
export function inCatalog(id: string, canon: Canon, book: string): boolean {
  const bs = byId.get(id)?.inBooks ?? [];
  if (book) return bs.includes(book);
  if (canon === 'all') return true;
  return !!bs[0] && testamentOf.get(bs[0]) === canon;
}
/** Заголовок указателя по части Писания и книге: «Лица Нового Завета — впервые названные в нём», «Лица, названные в книге Руфь». */
/**
 * Где названы лица книги — синодальное заглавие в предложном падеже (рецензия этапа 21: не «в книге к Евреям» и не
 * «в книге от Матфея», а «в Послании к Евреям», «в Евангелии от Матфея»).
 */
export const BOOK_IN: Readonly<Record<string, string>> = {
  Быт: 'в книге Бытия', Исх: 'в книге Исход', Лев: 'в книге Левит', Чис: 'в книге Числа', Втор: 'во Второзаконии',
  Нав: 'в книге Иисуса Навина', Суд: 'в книге Судей', Руф: 'в книге Руфь', '1Цар': 'в Первой книге Царств',
  '2Цар': 'во Второй книге Царств', '3Цар': 'в Третьей книге Царств', '4Цар': 'в Четвёртой книге Царств',
  '1Пар': 'в Первой книге Паралипоменон', '2Пар': 'во Второй книге Паралипоменон', Езд: 'в книге Ездры', Неем: 'в книге Неемии',
  Есф: 'в книге Есфирь', Иов: 'в книге Иова', Пс: 'в Псалтири', Притч: 'в книге Притчей Соломоновых', Еккл: 'в книге Екклесиаста',
  Песн: 'в книге Песни Песней Соломона', Ис: 'в книге пророка Исаии', Иер: 'в книге пророка Иеремии', Плач: 'в книге Плач Иеремии',
  Иез: 'в книге пророка Иезекииля', Дан: 'в книге пророка Даниила', Ос: 'в книге пророка Осии', Иоил: 'в книге пророка Иоиля',
  Ам: 'в книге пророка Амоса', Авд: 'в книге пророка Авдия', Ион: 'в книге пророка Ионы', Мих: 'в книге пророка Михея',
  Наум: 'в книге пророка Наума', Авв: 'в книге пророка Аввакума', Соф: 'в книге пророка Софонии', Агг: 'в книге пророка Аггея',
  Зах: 'в книге пророка Захарии', Мал: 'в книге пророка Малахии', Мф: 'в Евангелии от Матфея', Мк: 'в Евангелии от Марка',
  Лк: 'в Евангелии от Луки', Ин: 'в Евангелии от Иоанна', Деян: 'в Деяниях святых апостолов', Иак: 'в Послании Иакова',
  '1Пет': 'в Первом послании Петра', '2Пет': 'во Втором послании Петра', '1Ин': 'в Первом послании Иоанна',
  '2Ин': 'во Втором послании Иоанна', '3Ин': 'в Третьем послании Иоанна', Иуд: 'в Послании Иуды', Рим: 'в Послании к Римлянам',
  '1Кор': 'в Первом послании к Коринфянам', '2Кор': 'во Втором послании к Коринфянам', Гал: 'в Послании к Галатам',
  Еф: 'в Послании к Ефесянам', Флп: 'в Послании к Филиппийцам', Кол: 'в Послании к Колоссянам',
  '1Фес': 'в Первом послании к Фессалоникийцам', '2Фес': 'во Втором послании к Фессалоникийцам', '1Тим': 'в Первом послании к Тимофею',
  '2Тим': 'во Втором послании к Тимофею', Тит: 'в Послании к Титу', Флм: 'в Послании к Филимону', Евр: 'в Послании к Евреям',
  Откр: 'в Откровении Иоанна Богослова',
};
export function catalogTitle(canon: Canon, book: string): string {
  const b = book ? books.find((x) => x.code === book) : undefined;
  if (b) return `Лица, названные ${BOOK_IN[b.code] ?? `в книге ${b.gen}`}`;
  return canon === 'ot' ? 'Лица Ветхого Завета — впервые названные в нём' : canon === 'nt' ? 'Лица Нового Завета — впервые названные в нём' : 'Все лица атласа';
}

// ---------- указатель (G7; ТЗ § 3.7; CARD-45; VIS-33) ----------
export function IndexPanel() {
  // буква и фильтр помнятся, пока открыт атлас: панель, открытая снова, стоит там же (D11)
  const [letter, setLetter] = useRemembered<string | null>('index:letter', null);
  const [filter, setFilter] = useRemembered('index:filter', '');
  // часть Писания и книга (решение 202): «Ветхий Завет» — лица, названные в его книгах; книга — лица одной книги
  const [canon, setCanon] = useRemembered<Canon>('index:canon', 'all');
  const [book, setBook] = useRemembered('index:book', '');
  const m = model.value;
  const all = useMemo(
    () =>
      indexGroups((id) => {
        const c = m.chrono.get(id);
        return c && c.cls !== 'epochal' ? c.b : null;
      }),
    [m],
  );
  const groups = useMemo(
    () => (canon === 'all' && !book ? all : all.map(([n, ids]) => [n, ids.filter((id) => inCatalog(id, canon, book))] as [string, string[]]).filter(([, ids]) => ids.length)),
    [all, canon, book],
  );
  const total = groups.reduce((n, [, ids]) => n + ids.length, 0);
  const bookList = books.filter((b) => canon === 'all' || b.t === canon);
  const letters = [...new Set(groups.map(([n]) => n[0]))];
  const f = norm(filter);
  const shown = groups.filter(([n]) => (letter ? n[0] === letter : true) && (!f || norm(n).includes(f)));
  const coord = (id: string) => {
    const n = m.nodeByPerson.get(id);
    const c = m.chrono.get(id);
    // координата — там, где звезда стоит на карте: у лиц скоплений это клетка сетки (n.t0), а не год рождения
    // координата ведёт читателя к звезде лица — в полосе рождения (решение 173)
    return n && c ? atlasCoord(n.t0, starLaneOf(n)) : '';
  };
  const known = (id: string) => (byId.get(id)?.magnitude ?? 6) <= KNOWN_MAG;
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const found = shown.reduce((n, [, ids]) => n + ids.length, 0);
  // просьба поиска (решение 120): «ничего не найдено» — указатель на букве запроса
  const ask = indexAsk.value;
  useEffect(() => {
    if (!ask) return;
    setLetter(ask.letter && letters.includes(ask.letter) ? ask.letter : null);
    setFilter(ask.filter ?? '');
    if (ask.canon) setCanon(ask.canon);
    if (ask.book !== undefined || ask.canon) setBook(ask.book ?? '');
    indexAsk.value = null;
  }, [ask]);
  const tag = (id: string) => {
    const t = indexTag(id, m);
    return t ? (
      <span class="tag" title={t.title}>
        {' '}
        {t.text}
      </span>
    ) : null;
  };
  // «Отобрать» (IX-76): ↓ — на первую строку списка, Enter — к первому найденному лицу; в списке ↑ и ↓ — по строкам,
  // ↑ с первой строки — обратно в поле
  const rows = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('button.row') ?? [])];
  const onFieldKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      const first = rows()[0];
      if (!first) return;
      e.preventDefault();
      first.focus();
    } else if (e.key === 'Enter' && f && shown.length) {
      e.preventDefault();
      goTo(shown[0][1][0]);
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = rows();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
    else if (e.key === 'ArrowUp') field.current?.focus();
  };
  let lastLetter = '';
  return (
    <Sheet
      wide
      title="Указатель"
      lead={`${catalogTitle(canon, book)} (${num(canon === 'all' && !book ? persons.length : total)}) по алфавиту; у имени — роль или эпоха. Справа мелко — место на небе: число — столбец (сто лет от начала шкалы), буква — строка на левой кромке.`}
    >
      <div class="canon" role="group" aria-label="Часть Писания и книга">
        <Segmented
          label="Часть Писания"
          options={CANONS.map((c) => ({ value: c.value, label: c.label }))}
          value={canon}
          onChange={(v) => {
            setCanon(v as Canon);
            setBook('');
            setLetter(null);
          }}
        />
        <label class="book-pick">
          <span>Книга:</span>{' '}
          <select
            value={book}
            onChange={(e) => {
              setBook((e.target as HTMLSelectElement).value);
              setLetter(null);
            }}
          >
            <option value="">все книги</option>
            {bookList.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="letters">
        <Segmented label="Буква" options={[{ value: '', label: 'все' }, ...letters.map((l) => ({ value: l, label: l }))]} value={letter ?? ''} onChange={(v) => setLetter(v || null)} />
      </div>
      <div class="field">
        <label for="idx-filter">Найти в указателе:</label>
        <input
          id="idx-filter"
          ref={field}
          value={filter}
          aria-describedby="idx-found"
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          onKeyDown={onFieldKey}
        />
        {/* сколько найдено — видно у поля (решение 120) и слышно диктору, пока в поле есть текст (IX-76) */}
        {f ? (
          <span class="idx-count" aria-hidden="true">
            {found ? `найдено ${num(found)}\u00a0${plural(found, 'лицо', 'лица', 'лиц')}` : 'не найдено'}
          </span>
        ) : null}
        <span id="idx-found" class="visually-hidden" aria-live="polite">
          {/* и выбор части Писания или книги — вслух: сколько лиц в списке (рецензия этапа 21) */}
          {f
            ? found
              ? `найдено ${found}\u00a0${plural(found, 'лицо', 'лица', 'лиц')}; Enter — к первому, стрелка вниз — к списку`
              : 'не найдено ни одного лица'
            : canon !== 'all' || book
              ? `${catalogTitle(canon, book)}: ${total}\u00a0${plural(total, 'лицо', 'лица', 'лиц')}`
              : ''}
        </span>
      </div>
      <div class="idx" ref={list} onKeyDown={onListKey}>
        {shown.slice(0, letter || f ? 5000 : 900).map(([name, ids]) => {
          const head = name[0] !== lastLetter;
          lastLetter = name[0];
          return (
            <div key={name} class="entry">
              {head && <div class="head">{name[0]}</div>}
              {ids.length === 1 ? (
                // отточие — от конца текста до координаты (.lead::after); у координаты свой столбец (VIS-61)
                <button class={known(ids[0]) ? 'row known' : 'row'} onClick={() => goTo(ids[0])}>
                  <span class="nm lead">
                    {name}
                    {tag(ids[0])}
                  </span>
                  <span class="coord">{coord(ids[0])}</span>
                </button>
              ) : (
                <>
                  <div class="row word">
                    <span class="nm">{name}</span>
                  </div>
                  {ids.map((id) => {
                    // годы — всегда своей строкой под уточнением и переносятся; неразрывны только «ок. 815 г.» (VIS-61, VIS-33)
                    const yrs = typo(lifeText(id));
                    const ds = byId.get(id)!.disambig;
                    return (
                      // доступное имя — с общим словом группы: диктор читает «Захария, сын Иодая…», а не одно уточнение
                      // (этап 19, аудит Д-04: у 1479 кнопок тёзок имени не было)
                      <button class={known(id) ? 'row sub known' : 'row sub'} key={id} onClick={() => goTo(id)} aria-label={[name, ds, yrs, coord(id)].filter(Boolean).join(', ')}>
                        <span class={yrs || ds ? 'nm' : 'nm lead'}>
                          {ds ? <span class={yrs ? 'ds' : 'ds lead'}>{typo(ds)}</span> : tag(id)}
                          {yrs ? <span class="yrs lead">{yrs}</span> : null}
                        </span>
                        <span class="coord">{coord(id)}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
      {!letter && !f && shown.length > 900 && <p class="muted">Показаны первые 900 имён; выберите букву, чтобы увидеть остальные.</p>}
    </Sheet>
  );
}
