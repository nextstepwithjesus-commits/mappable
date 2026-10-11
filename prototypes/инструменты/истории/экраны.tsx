/**
 * Остальные экраны пакета 1: главная (11 § 7.2; 08 § 7.3) с вопросом о возрасте (В-28), «Все истории» (11 § 3.5, обзор с
 * плашкой «проба»), параллельные тексты (11 § 4.11.4: Ис 2 и Мих 4), сравнение по выбору (11 § 4.11.3: Ин 2 и Мк 11),
 * результаты поиска (поиск ядра `core/search`, без текстового индекса) и «Настройки» (08 § 7.23).
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import { Д, загружено, стих, стихи, готовы, показ } from '../общее/данные.ts';
import { адрес, адресПолно, книгаСсылки, полноеИмя, отрезки } from '../общее/адреса.ts';
import { настройки, изменить, слой2, детям } from '../общее/настройки.ts';
import { объявить, число, фокус } from '../общее/службы.ts';
import { маршрут, href, router } from '../общее/приложение.ts';
import { bookSlug } from '../общее/маршруты.ts';
import { Значок, ЗнакВида } from '../общее/знаки.tsx';
import { КнНазад, Хлебные, АдресКн, Эскиз } from '../общее/компоненты.tsx';
import { видСловом, знакВида, частоВспоминается, строкаТрудного } from './модель.ts';
import { Синопсис, type Колонка, type Сцена } from './синопсис.tsx';
import { ЛистКниг } from './каталог.tsx';
import { ОбразЭпох } from '../время/образ.tsx';
import { BOOKS, BOOK_BY_CODE } from '../../../core/books.ts';
import { NameForms } from '../../../core/search/forms.ts';
import { Searcher, type Group } from '../../../core/search/search.ts';

const ИСТОРИИ: [string, string, string] = ['история', 'истории', 'историй'];

// ---------- главная ----------
export function Главная() {
  void загружено.value;
  const s = настройки.value;
  const начать = [...Д.stories.values()].filter((x) => x.level === 'story' && частоВспоминается(x) > 0);
  const книги = Object.entries(Д.proto.catalog).sort((a, b) => (BOOKS.findIndex((x) => x.code === a[0]) - BOOKS.findIndex((x) => x.code === b[0])));
  const быт = стих('Быт', 1, 1);
  const [книгиОткр, setКниги] = useState(false);
  return (
    <div class="главная">
      <div class="главная__лево">
        <h1 class="скрыто" id="h1" tabIndex={-1}>
          Библия наглядно — главная
        </h1>
        {быт && (
          <p class="т-проза главная__эпиграф">
            <span class="подпись-голоса">Библия: </span>
            <span class="т-цитата">«{показ(быт.view.text).replace(/\.$/, '')}»</span> <span class="т-адрес">{адрес('Быт 1:1')}</span>
          </p>
        )}
        <ПоискГлавной />
        <section aria-labelledby="книги-з">
          <h2 class="т-книга" id="книги-з">
            Книги Библии
          </h2>
          <p class="т-адрес">Обзор: истории размечены не во всех книгах — это проба.</p>
          <div class="полоса-книг полоса-книг--главная" aria-hidden="true">
            {BOOKS.map((b, i) => (
              <span class={`полоса-книг__клетка${[5, 17, 22, 39, 44, 51, 65].includes(i) ? ' полоса-книг__клетка--разрыв' : ''}`}>
                {(Д.proto.catalog[b.code]?.length ?? 0) > 0 && <span class="полоса-книг__отметка полоса-книг__отметка--рассказано" />}
              </span>
            ))}
          </div>
          <p class="т-адрес полоса-подпись">
            <span>Ветхий Завет — 39 книг</span>
            <span>Новый Завет — 27 книг</span>
          </p>
          <ul class="книги-с-историями">
            {книги.map(([code, xs]) => (
              <li>
                <a class="ссылка-ряд" href={href({ screen: 'kniga', book: code, params: {} })}>
                  {полноеИмя(code)}
                </a>{' '}
                <span class="т-адрес">{число(xs.length, ИСТОРИИ)}</span>
              </li>
            ))}
            <li>
              <button class="кн кн--текст" type="button" onClick={() => setКниги(true)}>
                Все 66 книг
              </button>
            </li>
            <li>
              <a class="ссылка-ряд" href={href({ screen: 'istorii', params: {} })}>
                Все истории
              </a>
            </li>
          </ul>
        </section>
        <section aria-labelledby="начать-з">
          <h2 class="т-книга" id="начать-з">
            С чего начать
          </h2>
          <p class="т-адрес">Истории, о которых Библия вспоминает чаще всего: в пяти других книгах и больше.</p>
          <ul class="список список-начать">
            {начать.map((x) => {
              const ref = x.accounts[0].refs.join('; ');
              return (
                <li class="строка" data-key={`story:${x.id}`}>
                  <div class="строка__верх">
                    <div class="строка__зона">
                      <span class="строка__номер т-адрес">{BOOK_BY_CODE.get(книгаСсылки(ref))?.short}</span>
                      <span class="строка__название">
                        <a class="строка__ссылка" href={href({ screen: 'istoriya', id: x.id, params: {} })}>
                          {x.title.short}
                        </a>
                      </span>
                      <span class="строка__вид">
                        <span class="вид">
                          <ЗнакВида вид={знакВида(x.kind)} />
                          {видСловом(x.kind)}
                        </span>
                        <span class="адрес-в-ярусе">{адрес(ref)}</span>
                      </span>
                      <span class="строка__адрес">{адрес(ref)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {!s.возрастСпрошен && <Возраст />}
        {книгиОткр && <ЛистКниг закрыть={() => setКниги(false)} />}
      </div>
      <div class="главная__право">
        <section aria-labelledby="инстр-з">
          <h2 class="т-книга" id="инстр-з">
            Инструменты
          </h2>
          <div class="строка-инструмента-гл">
            <div>
              <h3 class="т-интерфейс">
                <a class="сильно" href={href({ screen: 'vremya', params: {} })}>
                  Время: {число(Д.epochs.length, ['эпоха', 'эпохи', 'эпох'])}
                </a>
              </h3>
              {!слой2() && <p class="т-адрес">Когда это было?</p>}
              <p class="т-интерфейс ч2">Указатель эпох от сотворения до Апостолов; жизни праотцев по числам Быт 5 и 11; цари Иудеи и Израиля.</p>
            </div>
            <span class="малый-образ" aria-hidden="true">
              <span class="малый-образ__рисунок">
                <ОбразЭпох залитые={[]} />
              </span>
            </span>
          </div>
          {['Генеалогия', 'География', 'Связи'].map((x) => (
            <div class="строка-инструмента-гл">
              <div>
                <h3 class="т-интерфейс сильно">{x}</h3>
                <p class="голос-мы">Этот инструмент — в следующих пакетах прототипов.</p>
              </div>
            </div>
          ))}
        </section>
        <p class="ссылки-внизу т-интерфейс">
          <a href={href({ screen: 'istorii', params: {} })}>Все истории</a>
          <a href={href({ screen: 'paralleli', id: 'teksty', params: {} })}>Одинаковые слова в разных книгах</a>
          <a href={href({ screen: 'nastroyki', params: {} })}>Настройки</a>
        </p>
      </div>
    </div>
  );
}

function ПоискГлавной() {
  const [q, setQ] = useState('');
  return (
    <search class="главная__поиск" id="поиск">
      <form
        class="поиск"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.go({ screen: 'poisk', params: { q: q.trim() } });
        }}
      >
        <label class="поиск__подпись" for="поиск-главная">
          Поиск
        </label>
        <span class="поиск__поле">
          <Значок имя="поиск" />
          <input id="поиск-главная" type="search" placeholder="Стих, человек, место или история" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </span>
        <button class="кн кн--найти" type="submit">
          Найти
        </button>
      </form>
      <p class="поиск__примеры т-интерфейс">
        <span class="ч2">Например:</span>
        <a href={href({ screen: 'poisk', params: { q: 'Быт 6:9' } })}>Быт 6:9</a>
        <a href={href({ screen: 'poisk', params: { q: 'Давид' } })}>Давид</a>
        <a href={href({ screen: 'poisk', params: { q: 'Ной' } })}>Ной</a>
        <a href={href({ screen: 'poisk', params: { q: 'пять хлебов' } })}>пять хлебов</a>
      </p>
    </search>
  );
}

/** Вопрос о возрасте при первом открытии (В-28): одна тихая строка «Указать» / «Не сейчас»; ответ — только на устройстве. */
function Возраст() {
  const [форма, setФорма] = useState(false);
  const [v, setV] = useState('');
  const [ош, setОш] = useState('');
  const ошибка = useRef<HTMLSpanElement>(null);
  return (
    <section class="возраст-строка т-интерфейс" aria-labelledby="возраст-з">
      <h2 class="т-интерфейс" id="возраст-з" style="display:inline">
        Сколько лет тому, кто будет читать? <span class="ч2">Если читаете с ребёнком, укажите его возраст. Это нужно только для подсказок детям; ответ останется на этом устройстве.</span>
      </h2>
      <button class="кн кн--текст" type="button" aria-expanded={форма} aria-controls="возраст-форма" onClick={() => setФорма(!форма)}>
        Указать
      </button>
      <button
        class="кн кн--текст"
        type="button"
        onClick={() => {
          изменить({ возрастСпрошен: true });
          объявить('Вопрос о возрасте скрыт. Изменить — в настройках');
          фокус('h1');
        }}
      >
        Не сейчас
      </button>
      <form
        id="возраст-форма"
        hidden={!форма}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(v.trim());
          if (!v.trim() || !Number.isInteger(n) || n < 1 || n > 120) {
            setОш('Напишите число от 1 до 120 или нажмите «Не сейчас»');
            requestAnimationFrame(() => ошибка.current?.focus());
            return;
          }
          изменить({ возраст: n, возрастСпрошен: true });
          объявить('Возраст сохранён на этом устройстве');
          фокус('h1');
        }}
      >
        <label for="возраст-поле">Возраст, лет</label> <input class="поле-числа" id="возраст-поле" type="number" min={1} max={120} inputMode="numeric" aria-describedby="возраст-ошибка" value={v} onInput={(e) => setV(e.currentTarget.value)} />{' '}
        <button class="кн кн--текст" type="submit">
          Сохранить
        </button>{' '}
        <span class="т-интерфейс" id="возраст-ошибка" tabIndex={-1} ref={ошибка}>
          {ош}
        </span>
      </form>
    </section>
  );
}

// ---------- «Все истории» — обзор с плашкой «проба» (10 § 3.3 п. 4) ----------
export function ВсеИстории() {
  void загружено.value;
  const книги = BOOKS.filter((b) => Д.proto.catalog[b.code]?.length);
  const всего = книги.reduce((n, b) => n + Д.proto.catalog[b.code].length, 0);
  return (
    <div class="все-истории">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        Все истории
      </h1>
      <p class="тихая-строка">Обзор, а не проверенный каталог: {Д.proto.banner.toLowerCase()}. Историй в пакете — {всего}; одна история, рассказанная в нескольких книгах, стоит в каждой.</p>
      <nav class="ряд-книг ссылки-внизу" aria-label="Книги с историями">
        {книги.map((b) => (
          <a href={`#кн-${b.slug}`}>{b.short}</a>
        ))}
      </nav>
      {книги.map((b) => (
        <section aria-labelledby={`кн-${b.slug}`} class="все-истории__книга">
          <h2 class="т-h2" id={`кн-${b.slug}`} tabIndex={-1}>
            {полноеИмя(b.code)} <span class="т-адрес">— {число(Д.proto.catalog[b.code].length, ИСТОРИИ)}</span>
          </h2>
          <ul class="список">
            {Д.proto.catalog[b.code].map((x, i) => {
              const s = Д.stories.get(x.id)!;
              const т = строкаТрудного(s);
              return (
                <li class="строка">
                  <div class="строка__верх">
                    <div class="строка__зона">
                      <span class="строка__номер" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span class="строка__название">
                        <a class="строка__ссылка" href={href({ screen: 'istoriya', id: s.id, params: книгаСсылки(s.accounts[0].refs[0]) === b.code ? {} : { rasskaz: bookSlug(b.code) } })} aria-label={`${s.title.short}${т ? `. ${т}` : ''}`}>
                          {s.title.short}
                        </a>
                      </span>
                      <span class="строка__вид">{s.kind !== 'event' && <span class="вид">{видСловом(s.kind)}</span>}</span>
                      <span class="строка__адрес">{адрес(x.ref)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------- параллельные тексты вне историй (11 § 4.11.4) ----------
export function Параллели({ id }: { id: string }) {
  void загружено.value;
  if (id !== 'teksty') return <Эскиз простое="этот набор ещё не собран">набор параллелей «{id}» в прототипе пакета 1 не собран; есть набор «Параллельные тексты».</Эскиз>;
  const tps = Д.proto.textParallels;
  return (
    <div class="параллели">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
          <Хлебные путь={[{ имя: 'Главная', href: href({ screen: 'glavnaya', params: {} }) }, { имя: 'Параллельные тексты' }]} />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        {слой2() ? 'Параллельные тексты' : 'Одинаковые слова в разных книгах'}
      </h1>
      <p class="т-проза">Псалмы, пророчества и списки — не истории, но у них есть места с теми же словами в другой книге. Подчёркнуты слова, которые стоят в обоих отрывках.</p>
      {tps.map((t) => {
        const колонки: Колонка[] = t.refs.map((r) => ({ ключ: r.join(';'), подпись: адрес(r), полно: адресПолно(r) }));
        // синопсис без сцен: строка на стих отрезка — пары стихов по порядку (Ис 2:2 ↔ Мих 4:1)
        const ссылки = t.refs.map((r) => r.join('; '));
        if (!готовы(ссылки)) return <p class="голос-мы">Загружаем текст…</p>;
        // синопсис без сцен: стихи двух отрезков выравниваются по общим словам (по порядку, без перестановок)
        const xs = t.refs.map((r) => стихи(r.join('; ')));
        const сл = (x: { view: { text: string } }) => new Set((x.view.text.toLowerCase().replace(/ё/g, 'е').match(/[а-я]+/g) ?? []).filter((w) => w.length > 2));
        const A = xs[0].map(сл);
        const B = (xs[1] ?? []).map(сл);
        const n = A.length;
        const m = B.length;
        const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
        const sim = (i: number, j: number) => [...A[i]].filter((w) => B[j].has(w)).length;
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1] + sim(i, j));
        const пары: [string | null, string | null][] = [];
        let i = 0;
        let j = 0;
        while (i < n || j < m) {
          if (i < n && j < m && dp[i][j] === dp[i + 1][j + 1] + sim(i, j) && sim(i, j) > 0) пары.push([xs[0][i++].id, xs[1][j++].id]);
          else if (j < m && (i >= n || dp[i][j] === dp[i][j + 1])) пары.push([null, xs[1][j++].id]);
          else пары.push([xs[0][i++].id, null]);
        }
        const сцены: Сцена[] = пары.map((p, k) => ({ id: `${t.id}-${k}`, имя: null, клетки: p, пусто: p.map((x) => (x ? null : 'в этом отрывке парного стиха нет')) }));
        return (
          <section class="параллель" data-key={`textparallel:${t.id}`}>
            <h2 class="т-h2">{колонки.map((c) => c.подпись).join(' и ')}</h2>
            <p class="т-интерфейс">
              {слой2() ? 'Основание — слова, которые стоят в обоих отрывках (сказано): ' : 'В обоих отрывках стоят слова: '}
              {t.basis.slice(0, 3).map((b, i) => (
                <>
                  {i > 0 ? '; ' : ''}
                  <span class="скрыто не-копировать">Библия: </span>
                  <q class="голос-библия-в-строке">«{b.text}»</q> (<АдресКн ссылка={b.ref} />)
                </>
              ))}
            </p>
            <Синопсис колонки={колонки} сцены={сцены} подпись={колонки.map((c) => c.подпись).join(' и ')} единица="отрывок" />
          </section>
        );
      })}
      <p class="голос-мы">Другие пары набора (1 Пар 16 и псалмы, Езд 2 и Неем 7) составитель находит на этапе И4 — в пакете их пока нет.</p>
    </div>
  );
}

// ---------- сравнение по выбору читателя (11 § 4.11.3) ----------
export function Сравнение() {
  void загружено.value;
  const r = маршрут.value;
  const a = r.params.a ?? 'Ин 2:13-22';
  const b = r.params.b ?? 'Мк 11:15-18';
  const [ввод, setВвод] = useState(b);
  const верно = [a, b].every((x) => отрезки(x).length > 0);
  const колонки: Колонка[] = [a, b].map((x) => ({ ключ: x, подпись: адрес(x), полно: адресПолно(x) }));
  const сцены: Сцена[] = [{ id: 'всё', имя: null, клетки: [a, b] }];
  const спорная = [a, b].some((x) => x.startsWith('Ин 2')) && [a, b].some((x) => x.startsWith('Мк 11'));
  return (
    <div class="сравнение">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        Сравнение по выбору{верно ? `: ${адрес(a)} и ${адрес(b)}` : ''}
      </h1>
      <p class="тихая-строка">Сравнение по выбору читателя. В каталоге это разные истории; мы не утверждаем, что это одно событие.</p>
      {спорная && слой2() && (
        <p class="т-интерфейс">
          Очищение храма у Иоанна (Ин 2:13–22) и у Марка (Мк 11:15–18) — в каталоге две истории: слова времени ставят рассказы в разное время. Спорное сравнение показывается только с авторами по правилам совета источников (Г-3); трудов в реестре пока нет — связи нет.
        </p>
      )}
      <form
        class="поиск сравнение-форма"
        onSubmit={(e) => {
          e.preventDefault();
          router.go({ screen: 'sravnenie', params: { a, b: ввод.trim() } });
        }}
      >
        <label for="сравнить-с">Сравнить с другим местом</label>{' '}
        <input id="сравнить-с" type="text" value={ввод} onInput={(e) => setВвод(e.currentTarget.value)} />{' '}
        <button class="кн кн--главная" type="submit">
          Сравнить
        </button>
      </form>
      {верно ? <Синопсис колонки={колонки} сцены={сцены} подпись="Сравнение по выбору" единица="отрывок" /> : <p class="т-проза">Такого места в Библии нет. Напишите адрес, например «Мк 11:15-18».</p>}
    </div>
  );
}

// ---------- поиск (11 § 3.6; поиск ядра) ----------
let искатель: Searcher | null = null;
function поиск(): Searcher {
  if (искатель) return искатель;
  const c = Д.core;
  const stories = [...Д.stories.values()].filter((s) => s.level === 'story').map((s) => ({ id: s.id, t: s.title.short, main: s.accounts[0]?.refs.join('; ') ?? '', common: s.title.common }));
  искатель = new Searcher({ names: c.names, exceptions: c.exceptions, persons: c.persons, stories, places: c.places, areas: c.areas }, new NameForms(c.names));
  искатель.setDisambig(Д.tools.actors);
  return искатель;
}
export function Поиск() {
  const q = маршрут.value.params.q ?? '';
  const res = useMemo(() => (q ? поиск().search(q) : null), [q]);
  return (
    <div class="поиск-страница">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        {q ? `Результаты по запросу «${q}»` : 'Поиск'}
      </h1>
      {!q && <ПоискГлавной />}
      {res && (
        <>
          {res.layout && <p class="т-интерфейс">Искали «{res.used}» — запрос был набран на другой раскладке.</p>}
          {res.groups.map((g) => (
            <ГруппаПоиска g={g} />
          ))}
          <Эскиз простое="поиск по словам в тексте Библии появится позже">поиск по тексту стихов («В тексте Библии») в прототипе выключен: текстовый индекс 66 книг — пакет поиска ядра, проверен пробой П-Т3.</Эскиз>
        </>
      )}
    </div>
  );
}
function ГруппаПоиска({ g }: { g: Group }) {
  const ист = (id: string, t: string, main: string) => (
    <li class="строка-лица">
      <a href={href({ screen: 'istoriya', id, params: {} })}>{t}</a> <span class="т-адрес">{адрес(main)}</span>
    </li>
  );
  switch (g.kind) {
    case 'адрес':
      return (
        <section>
          <h2 class="т-h2">Место Писания: {g.address.label}</h2>
          {g.address.notes.map((n) => (
            <p class="т-интерфейс">{n}</p>
          ))}
          {g.address.spans[0] && (
            <p>
              <a href={href({ screen: 'glava', book: g.address.spans[0].book, ch: g.address.spans[0].c1, params: {}, hash: g.address.spans[0].v1 ? `st${g.address.spans[0].c1}.${g.address.spans[0].v1}` : undefined })}>Открыть главу</a>
            </p>
          )}
          {g.stories.length > 0 && <ul>{g.stories.map((x) => ист(x.story.id, `${x.story.t} — ${x.role}`, x.story.main))}</ul>}
        </section>
      );
    case 'история':
      return (
        <section>
          <h2 class="т-h2">История</h2>
          <ul>{ист(g.story.id, g.story.t, g.story.main)}</ul>
          {g.notFromText && <p class="т-адрес">это название не из текста Библии</p>}
        </section>
      );
    case 'лица':
      return (
        <section>
          <h2 class="т-h2">Лица — {g.persons.length}</h2>
          <ul>
            {g.persons.map((p) => (
              <li class="строка-лица">
                <a href={href({ screen: 'kartochka', id: `p-${p.id}`, params: {} })}>{p.n}</a> {p.d && <span class="т-адрес">{p.d}</span>}
              </li>
            ))}
          </ul>
        </section>
      );
    case 'книга':
      return (
        <section>
          <h2 class="т-h2">Книга</h2>
          <p>
            <a href={href({ screen: 'kniga', book: g.book, params: {} })}>{полноеИмя(g.book)}</a>
          </p>
        </section>
      );
    case 'возможно':
      return <p class="т-интерфейс">Возможно, вы искали: {g.text}</p>;
    case 'пусто':
      return (
        <p class="т-проза" role="status">
          {g.message}
        </p>
      );
    default:
      return null;
  }
}

// ---------- настройки (08 § 7.23) ----------
export function Настройки() {
  const s = настройки.value;
  const радио = <K extends 'тема' | 'текст' | 'движение' | 'плотность'>(ключ: K, легенда: string, пары: [string, string][]) => (
    <fieldset class="радио">
      <legend class="т-книга">{легенда}</legend>
      {пары.map(([v, п]) => (
        <label>
          <input
            type="radio"
            name={ключ}
            value={v}
            checked={s[ключ] === v}
            onChange={() => {
              изменить({ [ключ]: v } as Partial<typeof s>);
              объявить(`${легенда}: ${п}`);
            }}
          />{' '}
          {п}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div class="настройки">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        Настройки
      </h1>
      {радио('тема', 'Тема', [
        ['система', 'Как на устройстве'],
        ['light', 'Светлая'],
        ['dark', 'Тёмная'],
      ])}
      {радио('текст', 'Размер текста', [
        ['обычный', 'Обычный'],
        ['крупнее', 'Крупнее'],
        ['самый', 'Самый крупный'],
      ])}
      {радио('движение', 'Движение', [
        ['система', 'Как на устройстве'],
        ['без', 'Без движения'],
        ['с', 'С движением'],
      ])}
      {слой2() &&
        радио('плотность', 'Плотность', [
          ['обычная', 'Обычная'],
          ['плотная', 'Плотная'],
        ])}
      <fieldset>
        <legend class="т-книга">Возраст</legend>
        <p class="т-интерфейс пояснение">Нужен только для подсказок детям младше 13 лет. Ответ остаётся на этом устройстве.</p>
        <label for="возраст">Возраст, лет</label>{' '}
        <input
          id="возраст"
          class="поле-числа"
          type="number"
          min={1}
          max={120}
          value={s.возраст ?? ''}
          onChange={(e) => {
            const n = Number(e.currentTarget.value);
            изменить({ возраст: e.currentTarget.value && Number.isInteger(n) && n > 0 && n <= 120 ? n : null, возрастСпрошен: true });
            объявить('Возраст сохранён');
          }}
        />{' '}
        <button class="кн кн--текст" type="button" onClick={() => { изменить({ возраст: null, возрастСпрошен: true }); объявить('Возраст убран'); }}>
          Не указывать
        </button>
        <p class="т-адрес">{детям() ? 'Подсказки для детей включены.' : 'Подсказок для детей нет.'}</p>
      </fieldset>
    </div>
  );
}
