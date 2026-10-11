/**
 * Страница истории (11 § 4; 08 § 3.3.4 — три яруса): шапка в три строки, «Коротко, нашими словами», текст Писания по частям
 * (APG Accordion) или рассказами (APG Tabs), «Рассказы рядом» (синопсис), справка панелью от 1024 px в порядке § 4.1.
 * Бюджет над первым стихом — не больше 300 px (11 § 4.1; Л-д1): на телефоне подпись «Так написано в Библии» — только для
 * программы чтения, «Коротко» при названии в две строки — кнопкой-раскрытием одной строкой, «дальше» — без роста строки.
 * Пока П7 не взята — в строке адреса «черновик», в «Как читать эту страницу» — «Текст Библии здесь полный» (11 § 12.2).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { Д, стихи, стих, загружено, готовы, показ, имя, естьЛицо, статус, стихов, type Стих } from '../общее/данные.ts';
import { адрес, адресПолно, адресПоСтихам, книгаСсылки, имяКниги, завет, отрезки, вСсылке, полноеИмя } from '../общее/адреса.ts';
import { слой2, детям, изменить } from '../общее/настройки.ts';
import { объявить, вБуфер, открыто, число, NB } from '../общее/службы.ts';
import { маршрут, href, сВидом } from '../общее/приложение.ts';
import { bookSlug } from '../общее/маршруты.ts';
import { Значок, ЗнакВида } from '../общее/знаки.tsx';
import { КнНазад, Хлебные, ПереключательСлоя, АдресКн, Блок, Меню, Библия, Вывод, Эскиз, ТекстСтиха, useРаскрыто, строкаКопии } from '../общее/компоненты.tsx';
import { видСловом, знакВида, строкаТрудного, трудноеКратко, стихиТрудного, номерВКниге, вКниге, книгаИм, лица, рольСловами, имяЛица, места, книгиРассказов } from './модель.ts';
import { Синопсис, Различие, type Колонка, type Сцена } from './синопсис.tsx';
import { ОбразЭпох, эпохиСсылки } from '../время/образ.tsx';
import type { Story, StoryActor, Link } from '../общее/типы.ts';
import { BOOK_BY_CODE, BOOKS } from '../../../core/books.ts';

/** Стихи, подсвеченные строкой лица или места (связанный выбор 09 § 4.3, уровень «подсветка»). */
const подсветка = signal<Set<string>>(new Set());
/** Стих, выделенный рамкой по адресу «по стихам» или по поиску. */
const рамка = signal<Set<string>>(new Set());
/** Начало отрывка с клавиатуры (11 § 4.4: «Начать отрывок отсюда»). */
const отрывок = signal<string | null>(null);

const СЛОВА_РАССКАЗОВ = ['', 'один рассказ', 'два рассказа', 'три рассказа', 'четыре рассказа'];
const ОБ_ЭТОМ: Record<number, string> = { 2: 'Об этом рассказывают две книги:', 3: 'Об этом рассказывают три Евангелия:', 4: 'Об этом рассказывают четыре Евангелия:' };

export function История({ id }: { id: string }) {
  void загружено.value;
  const s = Д.stories.get(id);
  if (s?.level !== 'story') return <НетСтраницы />;
  return <Страница s={s} />;
}

function НетСтраницы() {
  return (
    <div class="оболочка-страницы">
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        Такой страницы у нас нет
      </h1>
      <p class="т-проза">
        Возможно, историю переразметили. <a href={href({ screen: 'glavnaya', params: {} })}>На главную</a>
      </p>
    </div>
  );
}

function Страница({ s }: { s: Story }) {
  const r = маршрут.value;
  const книги = книгиРассказов(s);
  const книга = книги.find((b) => bookSlug(b) === r.params.rasskaz) ?? книги[0];
  const рассказ = Math.max(0, s.accounts.findIndex((a) => книгаСсылки(a.refs[0] ?? '') === книга));
  const основной = s.accounts[рассказ];
  const главный = s.accounts.map((a) => a.refs.join('; ')).join('; ');
  const все = s.accounts.flatMap((a) => a.refs);
  const синопсис = r.params.view === 'sinopsis';
  const естьРядом = !!s.scenes?.length && (s.accounts.length > 1 || s.scenes.some((sc) => sc.refs.some((x) => 'link' in x)));
  const ot = r.params.ot;
  const [сослаться, setСослаться] = useState(false);
  const [какЧитать, setКакЧитать] = useState(false);
  const полоса = useRef<HTMLDivElement>(null);
  // h2 «Так написано в Библии» — одной полосой с заголовком первой части (11 § 4.1); если полоса не помещается в строку —
  // подпись остаётся только для программы чтения, чтобы не съесть бюджет 300 px над первым стихом (Л-д1)
  useLayoutEffect(() => {
    const h2 = полоса.current?.querySelector<HTMLElement>('.так-написано');
    if (!h2) return;
    h2.classList.remove('так-написано--скрыто');
    const band = полоса.current?.querySelector<HTMLElement>('.полоса-рассказов');
    if (band) {
      const tab = band.querySelector<HTMLElement>('[role="tab"]');
      if (tab && band.getBoundingClientRect().height > tab.getBoundingClientRect().height * 1.6) h2.classList.add('так-написано--скрыто');
      return;
    }
    const b = полоса.current?.querySelector<HTMLElement>('.часть__кнопка');
    if (!b) return;
    const lh = parseFloat(getComputedStyle(b).lineHeight) || 28;
    if (b.getBoundingClientRect().height > lh * 1.6) h2.classList.add('так-написано--скрыто');
  });
  useEffect(() => {
    if (r.hash?.startsWith('st')) {
      const [c, v] = r.hash.slice(2).split('.').map(Number);
      рамка.value = new Set([`${книга} ${c}:${v}`]);
    }
  }, [r.hash]);
  if (!готовы(все)) return <p class="голос-мы оболочка-страницы" aria-busy="true">Загружаем историю…</p>;
  const номер = номерВКниге(s.id, книга);
  const назв = слой2() ? (s.title.full ?? s.title.short) : s.title.short;
  const путь = [
    { имя: завет(книга) === 'nt' ? 'Новый Завет' : 'Ветхий Завет' },
    { имя: имяКниги(книга), href: href({ screen: 'kniga', book: книга, params: {} }) },
    ...(s.partOf ? [{ имя: Д.stories.get(s.partOf)?.title.short ?? '' }] : []),
    { имя: s.title.short },
  ];
  const ссылкаНаМесто = () => {
    const url = `${location.origin}${href({ ...r, params: { ...r.params, v: `проба-${Д.proto.base}` } })}`;
    void вБуфер(url, null, 'ссылка на это место');
  };
  const пунктыЕщё = [
    { т: 'Как читать эту страницу', зн: 'справка', on: () => setКакЧитать(true) },
    { т: 'Как сослаться', зн: 'сослаться', on: () => setСослаться(true), скрыт: false },
    { т: 'Ссылка на это место', зн: 'ссылка', on: ссылкаНаМесто },
    { т: 'Печать', зн: 'печать', on: () => print() },
    { т: синопсис ? (слой2() ? 'Текст' : 'Один рассказ') : слой2() ? 'Синопсис' : 'Рассказы рядом', зн: 'таблица', on: () => сВидом({ view: синопсис ? undefined : 'sinopsis' }, синопсис ? 'один рассказ' : 'рассказы рядом'), скрыт: !естьРядом },
    { т: 'Сравнить с другим местом', зн: 'таблица', on: () => сВидомСравнение(s, основной.refs.join('; ')) },
    { т: 'Копировать номер записи', зн: 'копировать', on: () => void вБуфер(s.id, null, 'номер записи'), скрыт: !слой2() },
  ];
  return (
    <div data-key={`story:${s.id}`} data-status={статус(`story:${s.id}`)} ref={полоса}>
      <a class="скрыто-пропуск" href="#справка">
        К справке истории
      </a>
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
          <Хлебные путь={путь} />
          {ot && <ВходИз ot={ot} />}
        </div>
        <div class="ряд-действий" role="group" aria-label="Работа с материалом">
          <button class="кн на-ноутбуке от-1280" type="button" aria-expanded={сослаться} onClick={() => setСослаться(!сослаться)}>
            <Значок имя="сослаться" />
            Как сослаться
          </button>
          <button class="кн на-ноутбуке от-1440" type="button" onClick={ссылкаНаМесто}>
            <Значок имя="ссылка" />
            Ссылка на это место
          </button>
          <Меню подпись={<><Значок имя="действия" />Ещё<span class="скрыто"> действия: {s.title.short}</span></>} имя={`Ещё действия: ${s.title.short}`} пункты={пунктыЕщё} />
          <span class="слой-в-ряду">
            <ПереключательСлоя объявление={(v) => (v ? 'Показаны все части, полные названия и блок «Для изучающих»' : 'Показано для начинающих: открыта первая часть')} />
          </span>
        </div>
      </div>
      {сослаться && <КакСослаться s={s} закрыть={() => setСослаться(false)} />}
      {какЧитать && <КакЧитать закрыть={() => setКакЧитать(false)} />}
      <div class="чтение">
        <div class="чтение__текст">
          <Шапка s={s} назв={назв} книга={книга} номер={номер} основной={основной.refs.join('; ')} />
          {(синопсис || s.accounts.length < 2) && (
            <h2 class={`подпись-голоса так-написано${синопсис ? ' так-написано--синопсис' : ''}`} id="так-написано">
              Так написано в Библии
            </h2>
          )}
          {естьРядом && (синопсис || s.accounts.length < 2) && <ПереключательВида s={s} синопсис={синопсис} />}
          {синопсис && естьРядом ? (
            <СинопсисИстории s={s} />
          ) : s.accounts.length > 1 ? (
            <Рассказы s={s} рассказ={рассказ} переключатель={естьРядом ? <ПереключательВида s={s} синопсис={false} кнопки /> : null} />
          ) : (
            <Части s={s} refs={основной.refs} />
          )}

        </div>
        <div class="чтение__бок">
          <Панель s={s} книга={книга} рассказ={рассказ} />
        </div>
      </div>
      <footer class="колофон т-адрес">
            <p>
              {s.title.short} — {адрес(главный)}. Текст: Синодальный перевод (1876); электронный текст: scrollmapper/bible_databases. Где начинается и кончается история и кто в ней — черновик атласа, его ещё проверяют; текст Библии здесь полный. Выпуск данных: проба {Д.proto.base}.
            </p>
          </footer>
    </div>
  );
}

function сВидомСравнение(s: Story, a: string) {
  // сравнение по выбору (11 § 4.11.3): второй отрезок — по умолчанию спорная пара из прототипа или тот же отрывок
  const b = s.id === 'e-bich-iz-verevok-v-khrame' ? 'Мк 11:15-18' : s.id === 'e-prodayushchie-i-pokupayushchie-v-khrame' ? 'Ин 2:13-22' : a;
  location.assign(href({ screen: 'sravnenie', params: { a, b } }));
}

/** «из Евр 11:7 — упоминание»: вход из «Упоминается здесь» сохраняет стих (11 § 4.2). */
function ВходИз({ ot }: { ot: string }) {
  const m = /^([a-z0-9]+?)(\d+)\.(\d+)$/.exec(ot);
  const b = m ? BOOKS.find((x) => x.slug === m[1]) : undefined;
  if (!m || !b) return null;
  return (
    <span class="т-адрес вход-из">
      из <АдресКн ссылка={`${b.code} ${m[2]}:${m[3]}`} /> — упоминание
    </span>
  );
}

function Шапка({ s, назв, книга, номер, основной }: { s: Story; назв: string; книга: string; номер: { n: number; из: number } | null; основной: string }) {
  const трудное = строкаТрудного(s);
  const ещё = s.accounts.length - 1;
  const h1 = useRef<HTMLHeadingElement>(null);
  const кор = useRef<HTMLParagraphElement>(null);
  const [двеСтроки, setДве] = useState(false);
  // «Коротко»: первое предложение — до двух строк со ссылкой «дальше»; не помещается или название в две строки — кнопка (11 § 4.1; Л-д1)
  useLayoutEffect(() => {
    const el = h1.current;
    const p = кор.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 28;
    const plh = p ? parseFloat(getComputedStyle(p).lineHeight) || 24 : 24;
    if (el.clientHeight > lh * 1.5) setДве(true);
    else if (p && p.clientHeight > plh * 2.5) setДве(true);
  }, []);
  const к = s.summary ?? [];
  // «Коротко» написано по одному рассказу: если страница открыта на другом — подпись называет рассказ (педагог № 13)
  const книгаКоротко = к[0] ? книгаСсылки(к[0].refs[0]) : книга;
  const подписьК = книгаКоротко !== книга && s.accounts.length > 1 ? `Коротко, нашими словами (по рассказу ${подписьРассказа(книгаКоротко)}): ` : 'Коротко, нашими словами: ';
  const [дальше, setДальше] = useState(false);
  const выделить = (refs: string[]) => {
    const ids = new Set<string>();
    for (const r of refs) for (const x of стихи(r)) ids.add(x.id);
    рамка.value = ids;
    const first = [...ids][0];
    if (first) {
      const [, cv] = first.split(' ');
      const el = document.getElementById(`st${cv}`);
      document.dispatchEvent(new CustomEvent('открыть-стих', { detail: first }));
      requestAnimationFrame(() => document.getElementById(`st${cv}`)?.scrollIntoView({ block: 'center' }) ?? el?.scrollIntoView({ block: 'center' }));
    }
    объявить(`Выделены стихи ${адресПолно(refs)}`);
  };
  const фраза = (x: { text: string; refs: string[] }) => (
    <>
      {x.text}{' '}
      <button class="адрес-кн адрес-при-фразе" type="button" onClick={() => выделить(x.refs)} aria-label={`по стихам ${адресПоСтихам(x.refs).replace(/ /g, ' ')}: выделить в тексте`}>
        {адресПоСтихам(x.refs)}
      </button>
    </>
  );
  return (
    <header class="шапка-истории">
      <div class="шапка-истории__верх">
        <h1 class="т-h1" id="h1" tabIndex={-1} ref={h1}>
          {назв}
        </h1>
      </div>
      <p class="шапка-истории__вид т-адрес">
        <span class="вид">
          <ЗнакВида вид={знакВида(s.kind)} />
          {видСловом(s.kind)}
        </span>
        {номер && (
          <span class="номер-истории">
            история {номер.n} из {номер.из} {вКниге(книга)}
          </span>
        )}
        <span>
          {слой2() ? (
            <>
              <span aria-hidden="true">{адрес(основной)}</span>
              <span class="скрыто">{адресПолно(основной)}</span>
            </>
          ) : (
            <>
              <span class="полный-адрес">{адресПолно(основной)}</span>
              <span class="краткий-адрес" aria-hidden="true">
                {адрес(основной)}
              </span>
            </>
          )}
          {ещё > 0 && ` и ещё ${СЛОВА_РАССКАЗОВ[ещё] ?? число(ещё, ['рассказ', 'рассказа', 'рассказов'])}`}
        </span>
        <Черновик />
        {трудное && <span class="тихая-строка">{трудное}</span>}
      </p>
      {к.length > 0 &&
        (двеСтроки ? (
          <div class="коротко т-проза">
            <button class="кн кн--текст кн-коротко" type="button" aria-expanded={дальше} aria-controls="коротко-текст" onClick={() => setДальше(!дальше)}>
              <Значок имя="раскрыть" />
              {подписьК.replace(/: $/, '')}
            </button>
            <p id="коротко-текст" hidden={!дальше}>
              {к.map((x) => (
                <>
                  {фраза(x)}{' '}
                </>
              ))}
            </p>
          </div>
        ) : (
          <p class="коротко т-проза" ref={кор}>
            <span class="подпись-голоса">{подписьК}</span>
            {фраза(к[0])}
            {к.length > 1 && (
              <>
                {' '}
                <span class="коротко-дальше" hidden={!дальше}>
                  {к.slice(1).map((x) => (
                    <>
                      {фраза(x)}{' '}
                    </>
                  ))}
                </span>
                <button class="кн кн--текст кн-дальше" type="button" aria-expanded={дальше} onClick={() => setДальше(!дальше)}>
                  {дальше ? 'свернуть' : 'дальше'}
                  <span class="скрыто">: коротко, нашими словами</span>
                </button>
              </>
            )}
          </p>
        ))}
    </header>
  );
}

/** «черновик» — с пояснением на месте (решение координатора § 2; педагог № 7; 11 § 12.2). */
function Черновик() {
  const [откр, setОткр] = useState(false);
  return (
    <span class="черновик">
      <button class="кн кн--текст черновик__кн" type="button" aria-expanded={откр} aria-controls="черновик-пояснение" onClick={() => setОткр(!откр)}>
        {слой2() ? 'черновик (проба П7 не взята)' : 'черновик'}
      </button>
      <span id="черновик-пояснение" class="черновик__пояснение" hidden={!откр}>
        Черновик — наше деление на истории и подписи. Текст Библии здесь полный.
      </span>
    </span>
  );
}

function ПереключательВида({ s, синопсис, кнопки }: { s: Story; синопсис: boolean; кнопки?: boolean }) {
  const set = (v: boolean) => {
    сВидом({ view: v ? 'sinopsis' : undefined }, v ? 'рассказы рядом' : 'один рассказ');
    объявить(v ? 'Рассказы рядом' : 'Один рассказ');
  };
  const n = s.accounts.length;
  const сегменты = (
      <span class="ряд-кнопок сегменты" role="group" aria-label="Вид текста">
        <button class="кн" type="button" aria-pressed={!синопсис} onClick={() => set(false)}>
          {слой2() ? 'Текст' : 'Один рассказ'}
        </button>
        <button class="кн" type="button" aria-pressed={синопсис} onClick={() => set(true)}>
          {слой2() ? 'Синопсис' : 'Рассказы рядом'}
        </button>
      </span>
  );
  if (кнопки) return сегменты;
  return (
    <div class="строка-над-текстом">
      <span class="т-адрес">{n > 1 ? (ОБ_ЭТОМ[n] ?? `Об этом рассказывают ${число(n, ['книга', 'книги', 'книг'])}:`) : 'Рассказ и пересказы участника:'}</span>
      {сегменты}
    </div>
  );
}

// ---------- текст: стихи, номера-меню, имена-ссылки при первом упоминании в части ----------
interface ОпцииТекста { s: Story; первыйТолько?: boolean; имена: Map<string, string> }
/** Словарь форм имён лиц истории: форма в нижнем регистре → полный номер лица (данные ядра индекса). */
function формыЛиц(s: Story): Map<string, string> {
  const ids = new Set(s.actors.filter((a) => a.actor.startsWith('p-')).map((a) => a.actor.slice(2)));
  const m = new Map<string, string>();
  for (const n of Д.core.names) {
    const own = n.ids.filter((x) => ids.has(x));
    if (own.length === 1) for (const f of n.forms) m.set(f, `p-${own[0]}`);
  }
  return m;
}

function Текст({ xs, o }: { xs: Стих[]; o: ОпцииТекста }) {
  const связано = new Set<string>();
  let прежняя = -1;
  void подсветка.value;
  void рамка.value;
  return (
    <div class="писание" lang="ru" onCopy={копияВыделения}>
      {xs.map((x, i) => {
        const новая = x.c !== прежняя;
        прежняя = x.c;
        return (
          <>
            {i > 0 ? ' ' : ''}
            <span class={`стих${подсветка.value.has(x.id) ? ' стих--подсветка' : ''}${рамка.value.has(x.id) ? ' стих--рамка' : ''}`} id={`st${x.c}.${x.v}`} key={x.id}>
              {новая && (
                <>
                  <span class="глава-номер т-номер-главы не-копировать" aria-hidden="true">
                    {x.c}
                  </span>
                  <span class="скрыто не-копировать">Глава {x.c}. </span>
                </>
              )}
              <НомерСтиха x={x} глава={новая} />
              <ТекстСИменами x={x} o={o} связано={связано} начало={i === 0} />
            </span>
          </>
        );
      })}
    </div>
  );
}

/** Копия выделения: показанные слова стиха без номеров, меток и кнопок (08 § 16.2; одинаково в трёх движках). */
function копияВыделения(e: ClipboardEvent) {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !e.clipboardData) return;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  for (const el of box.querySelectorAll('.не-копировать, .скрыто, button.стих__номер')) el.remove();
  const t = (box.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return;
  e.clipboardData.setData('text/plain', t);
  e.preventDefault();
}

function НомерСтиха({ x, глава }: { x: Стих; глава: boolean }) {
  const [откр, setОткр] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  const м = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!откр) return;
    const off = открыто(() => setОткр(false), кн.current);
    requestAnimationFrame(() => м.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return off;
  }, [откр]);
  const нач = отрывок.value;
  const диап = нач && нач !== x.id && нач.split(' ')[0] === x.book ? `${нач}-${нач.split(':')[0].split(' ')[1] === String(x.c) ? x.v : `${x.c}:${x.v}`}` : null;
  const пункт = (т: string, зн: string, on: () => void) => (
    <button
      role="menuitem"
      type="button"
      tabIndex={-1}
      onClick={() => {
        setОткр(false);
        кн.current?.focus();
        on();
      }}
    >
      <Значок имя={зн} />
      {т}
    </button>
  );
  const keys = (e: KeyboardEvent) => {
    const items = [...(м.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') setОткр(false);
  };
  // имя начинается с видимого: «6:9, стих 9 главы 6» у первого стиха главы, иначе «Стих 9» (2.5.3; доступность № 7)
  const имяНомера = глава ? `${x.c}:${x.v}, стих ${x.v} главы ${x.c}` : `Стих ${x.v}`;
  return (
    <span class="стих__номер-обёртка не-копировать">
      <button ref={кн} class="стих__номер" type="button" aria-haspopup="menu" aria-expanded={откр} aria-label={имяНомера} onClick={() => setОткр(!откр)} data-current={нач === x.id ? 'true' : undefined}>
        {глава && <span class="глава-в-строке" aria-hidden="true">{x.c}:</span>}
        {x.v}
      </button>
      {NB}
      {откр && (
        <span class="меню меню-стиха" role="menu" ref={м} aria-label={имяНомера} onKeyDown={keys}>
          {диап
            ? пункт(`Копировать стихи ${адрес(диап)} с адресом`, 'копировать', () => {
                const { plain, html } = строкаКопии(диап, true);
                void вБуфер(plain, html, адрес(диап));
                отрывок.value = null;
              })
            : пункт('Копировать стих с адресом', 'копировать', () => {
                const { plain, html } = строкаКопии(x.id);
                void вБуфер(plain, html, адрес(x.id));
              })}
          {пункт('Копировать адрес', 'ссылка', () => void вБуфер(адрес(x.id).replace(/ /g, ' '), null, адрес(x.id)))}
          {диап
            ? пункт('Отменить отрывок', 'закрыть', () => {
                отрывок.value = null;
                объявить('Отрывок отменён');
              })
            : пункт('Начать отрывок отсюда', 'вправо', () => {
                отрывок.value = x.id;
                объявить(`Отрывок: с ${адрес(x.id)}. Выберите в меню другого стиха «Копировать стихи»`);
              })}
          {пункт('Вся глава', 'списком', () => location.assign(href({ screen: 'glava', book: x.book, ch: x.c, params: {}, hash: `st${x.c}.${x.v}` })))}
        </span>
      )}
    </span>
  );
}

function ТекстСИменами({ x, o, связано, начало }: { x: Стих; o: ОпцииТекста; связано: Set<string>; начало: boolean }) {
  const t = показ(x.view.text);
  // начало части — насыщенностью 600 (первые слова до знака или до пяти слов)
  const подсветить = (кусок: string): ComponentChildren => {
    const out: ComponentChildren[] = [];
    let at = 0;
    for (const m of кусок.matchAll(/[А-ЯЁ][а-яё]+/g)) {
      const id = o.имена.get(m[0].toLowerCase());
      if (!id || связано.has(id)) continue;
      связано.add(id);
      const i = m.index ?? 0;
      if (i > at) out.push(кусок.slice(at, i));
      out.push(
        <a href={href({ screen: 'kartochka', id, params: {} })} class="имя-в-тексте" id={`текст-${id}-${x.c}-${x.v}`} data-key={`actor:${id}`}>
          {m[0]}
        </a>,
      );
      at = i + m[0].length;
    }
    if (at < кусок.length) out.push(кусок.slice(at));
    return out;
  };
  if (начало) {
    const m = /^(\S+(?:\s+\S+){0,4}?[,;:.!?])|^(\S+(?:\s+\S+){0,4})/.exec(t);
    const n = m ? m[0].length : 0;
    if (n && !x.view.brackets.some((b) => b.start < n)) {
      const view = { ...x.view, text: x.view.text.slice(n), brackets: x.view.brackets.map((b) => ({ ...b, start: b.start - n, end: b.end - n })) };
      return (
        <>
          <span class="начало-части">{подсветить(t.slice(0, n))}</span>
          <ТекстСтиха view={view} подсветка={подсветить} />
        </>
      );
    }
  }
  return <ТекстСтиха view={x.view} подсветка={подсветить} />;
}

// ---------- части (APG Accordion; 11 § 4.4) ----------
function Части({ s, refs }: { s: Story; refs: string[] }) {
  const имена = useMemo(() => формыЛиц(s), [s.id]);
  const hard = useMemo(() => стихиТрудного(s), [s.id]);
  const parts = s.parts?.length ? s.parts : null;
  const [всё, setВсё] = useState(0);
  if (!parts) {
    const xs = refs.flatMap((r) => стихи(r));
    return (
      <div class="части">
        <section class="часть" id="chast-1">
          <Текст xs={xs} o={{ s, имена }} />
        </section>
      </div>
    );
  }
  return (
    <>
      <div class="части">
        {parts.map((p) => (
          <Часть key={`${p.n}-${всё}`} s={s} n={p.n} имя={p.title.short} refs={p.refs} hard={hard} имена={имена} всеОткрыты={всё > 0} />
        ))}
      </div>
      {!слой2() && parts.length > 1 && (
        <p>
          <button
            class="кн кн--тихо"
            type="button"
            onClick={() => {
              setВсё(всё + 1);
              объявить(`Открыты все ${число(parts.length, ['часть', 'части', 'частей'])}`);
            }}
          >
            Открыть все части
          </button>
        </p>
      )}
    </>
  );
}

function Часть({ s, n, имя: назв, refs, hard, имена, всеОткрыты }: { s: Story; n: number; имя: string; refs: string[]; hard: Set<string>; имена: Map<string, string>; всеОткрыты: boolean }) {
  const xs = refs.flatMap((r) => стихи(r));
  const трудная = xs.some((x) => hard.has(x.id));
  const поУмолчанию = слой2() || всеОткрыты || (n === 1 && !трудная);
  const [откр, setОткр] = useРаскрыто(`часть-${n}`, поУмолчанию);
  // трудный стих уже в первой части: открыт только первый стих с пометкой (11 § 4.1; 08 § 4.7 п. 3)
  const [толькоПервый, setПервый] = useState(n === 1 && трудная && !слой2() && !всеОткрыты);
  useEffect(() => {
    const f = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (xs.some((x) => x.id === id)) {
        setОткр(true);
        setПервый(false);
      }
    };
    document.addEventListener('открыть-стих', f);
    return () => document.removeEventListener('открыть-стих', f);
  });
  const idt = `chast-${n}-t`;
  const полно = адресПолно(refs);
  // видимая строка части: «Быт 7:17–24, 8 стихов, трудное: смерть» — без точек-разделителей (арт С5)
  const видимоЧасти = [адрес(refs), ...(!откр ? [число(xs.length, ['стих', 'стиха', 'стихов'])] : []), ...(трудная ? [трудноеКратко(s)] : [])].join(', ');
  return (
    <section class="часть" id={`chast-${n}`}>
      <h3 class="часть__заголовок не-копировать">
        <button class="часть__кнопка" type="button" aria-expanded={откр} aria-controls={idt} data-snap={`часть-${n}`} onClick={() => setОткр(!откр)} aria-label={`Читать часть ${n}. ${назв} ${видимоЧасти}. ${полно}`}>
          <Значок имя="раскрыть" />
          <span class="часть__текст">
            Часть {n}. {назв}{' '}
            <span class="т-адрес">{видимоЧасти}</span>
          </span>
        </button>
      </h3>
      <div id={idt} hidden={!откр && !толькоПервый}>
        {толькоПервый && !откр ? (
          <>
            <Текст xs={xs.slice(0, 1)} o={{ s, имена }} />
            <p class="тихая-строка">
              Дальше в этой части — {трудноеКратко(s)}.{' '}
              <button class="кн кн--текст" type="button" onClick={() => { setПервый(false); setОткр(true); }}>
                Читать часть {n} целиком
              </button>
            </p>
          </>
        ) : (
          <Текст xs={xs} o={{ s, имена }} />
        )}
      </div>
    </section>
  );
}

// ---------- несколько рассказов: вкладки (APG Tabs; 11 § 4.4) ----------
const подписьРассказа = (code: string) => {
  const b = BOOK_BY_CODE.get(code);
  if (!b) return code;
  return b.gen.startsWith('от ') ? b.gen : b.short.replace(/ /g, NB);
};
function Рассказы({ s, рассказ, переключатель }: { s: Story; рассказ: number; переключатель: ComponentChildren }) {
  const имена = useMemo(() => формыЛиц(s), [s.id]);
  const tabs = useRef<HTMLDivElement>(null);
  const выбрать = (i: number, фокус = false) => {
    сВидом({ rasskaz: i === 0 ? undefined : bookSlug(книгаСсылки(s.accounts[i].refs[0])) }, `рассказ ${подписьРассказа(книгаСсылки(s.accounts[i].refs[0]))}`);
    if (фокус) requestAnimationFrame(() => tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus());
  };
  const a = s.accounts[рассказ];
  const xs = a.refs.flatMap((r) => стихи(r));
  return (
    <>
      <div class="полоса-рассказов">
      <h2 class="подпись-голоса так-написано так-написано--в-полосе" id="так-написано">
        Так написано в Библии
      </h2>
      <div class="вкладки" role="tablist" aria-label={(ОБ_ЭТОМ[s.accounts.length] ?? `Об этом рассказывают ${число(s.accounts.length, ['книга', 'книги', 'книг'])}`).replace(/:$/, '')} ref={tabs}>
        {s.accounts.map((acc, i) => {
          const b = книгаСсылки(acc.refs[0]);
          return (
            <button
              role="tab"
              type="button"
              class="вкладка"
              id={`вкладка-${i}`}
              aria-selected={i === рассказ}
              aria-controls="рассказ"
              tabIndex={i === рассказ ? 0 : -1}
              aria-label={`${подписьРассказа(b)}. ${адресПолно(acc.refs)}`}
              onClick={() => выбрать(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') выбрать((i + 1) % s.accounts.length, true);
                if (e.key === 'ArrowLeft') выбрать((i - 1 + s.accounts.length) % s.accounts.length, true);
                if (e.key === 'Home') выбрать(0, true);
                if (e.key === 'End') выбрать(s.accounts.length - 1, true);
              }}
            >
              {подписьРассказа(b)}
            </button>
          );
        })}
      </div>
      {переключатель}
      </div>
      <div role="tabpanel" id="рассказ" aria-labelledby={`вкладка-${рассказ}`} class="части">
        <section class="часть">
          {слой2() && (
            <p class="т-адрес">
              {адрес(a.refs)}
              {a.cert === 'inference' && (
                <>
                  {' · '}
                  <Вывод cert="inference" />
                </>
              )}
            </p>
          )}
          <Текст xs={xs} o={{ s, имена }} />
        </section>
      </div>
    </>
  );
}

// ---------- синопсис истории ----------
function СинопсисИстории({ s }: { s: Story }) {
  const колонки: Колонка[] = s.accounts.map((a) => {
    const b = книгаСсылки(a.refs[0]);
    return { ключ: `a${s.accounts.indexOf(a)}`, подпись: подписьРассказа(b), полно: адресПолно(a.refs) };
  });
  const linkCols = new Map<number, number>();
  const ссылки = [...new Set((s.scenes ?? []).flatMap((sc) => sc.refs.filter((x) => 'link' in x).map((x) => (x as unknown as { link: number }).link)))].sort((a, b) => a - b);
  for (const li of ссылки) {
    const l = s.links[li];
    linkCols.set(li, колонки.length);
    колонки.push({ ключ: `l${li}`, подпись: адрес(l?.refs ?? []), полно: адресПолно(l?.refs ?? []), пересказ: `пересказ: слова ${l?.teller ? (имя(l.teller) === 'Павел' ? 'Павла' : имя(l.teller)) : 'участника'}` });
  }
  if (ссылки.length) for (const c of колонки) if (!c.пересказ) c.подпись = адрес(s.accounts[0].refs);
  const сцены: Сцена[] = (s.scenes ?? []).map((sc) => {
    const клетки: (string | null)[] = колонки.map(() => '');
    for (const x of sc.refs) {
      const i = 'account' in x ? (x as { account: number }).account : linkCols.get((x as unknown as { link: number }).link) ?? -1;
      if (i >= 0) клетки[i] = x.refs.join('; ');
    }
    return {
      id: sc.id,
      имя: sc.title.short,
      клетки: клетки.map((c) => c || null),
      split: sc.split,
      moved: sc.moved?.map((m) => ({ col: m.account, after: m.after })),
      различия: (s.discrepancies ?? []).filter((d) => d.scene === sc.id),
    };
  });
  // пустая клетка: «рассказ молчит» — только если проверено (`silent`); если подробность стоит в другой сцене — ссылка на неё (научные № 9 б)
  const столбецСсылки = (ref: string) => {
    const п = отрезки(ref)[0];
    if (!п) return -1;
    const в = (refs: string[]) => refs.some((r) => отрезки(r).some((q) => q.book === п.book && вСсылке(r, п.book, п.c1, п.v1 ?? 1)));
    const ia = s.accounts.findIndex((a) => в(a.refs));
    if (ia >= 0) return ia;
    for (const [li, ci] of linkCols) if (в(s.links[li]?.refs ?? [])) return ci;
    return -1;
  };
  for (const сц of сцены) {
    сц.пусто = сц.клетки.map((c, i) => {
      if (c) return null;
      const ds = сц.различия ?? [];
      if (ds.some((d) => (d as { silent?: number[] }).silent?.includes(i))) return 'рассказ молчит';
      for (const d of ds)
        for (const q of d.quotes) {
          if (столбецСсылки(q.ref) !== i) continue;
          const там = сцены.find((y) => y !== сц && y.клетки[i] && вСсылке(y.клетки[i]!, отрезки(q.ref)[0].book, отрезки(q.ref)[0].c1, отрезки(q.ref)[0].v1 ?? 1));
          return там ? `см. сцену «${там.имя}»: ${адрес(q.ref)}` : `см. ${адрес(q.ref)}`;
        }
      return null;
    });
  }
  if (!сцены.length) return <Эскиз простое="рассказы рядом для этой истории ещё не подготовлены">сцены синопсиса для этой истории ещё не размечены (И3).</Эскиз>;
  const базы = s.accounts.filter((a) => a.basis);
  const основание = (
    <div class="синопсис-основание">
      {базы.some((a) => a.basis?.note) ? (
        <p class="т-проза">
          {слой2() ? 'Одна история — весомо: ' : 'Мы считаем это одной историей: '}
          {(базы.find((a) => a.basis?.note)?.basis?.note ?? '').replace(/\s*\(\d+ §[^)]*\)/g, '')}
          {слой2() && <Вывод cert="inference" />}
        </p>
      ) : базы.length > 0 ? (
        <p class="т-проза">
          {слой2() ? 'Одна история — весомо: ' : 'Мы считаем это одной историей, потому что в рассказах одни и те же слова: '}
          {[...new Set(базы.flatMap((a) => a.basis!.refs))].slice(0, 6).map((r, i) => (
            <>
              {i > 0 ? ', ' : ''}
              <АдресКн ссылка={r} />
            </>
          ))}
          {слой2() && базы[0].basis?.time?.length ? <>; слова времени: {адрес(базы[0].basis.time)}</> : null}
          {слой2() && <Вывод cert="inference" />}
        </p>
      ) : (
        <p class="т-проза">{слой2() ? 'Рассказ и пересказы участника в речах; правдивость слов лица атлас не утверждает.' : 'Рядом — рассказ и то, как об этом потом рассказывал сам участник.'}</p>
      )}
      {(s.discrepancies ?? []).filter((d) => !d.scene).map((d) => (
        <Различие d={d} />
      ))}
    </div>
  );
  return <Синопсис колонки={колонки} сцены={сцены} подпись={s.title.short} основание={основание} />;
}

// ---------- справка (11 § 4.1, порядок блоков) ----------
function Панель({ s, книга, рассказ }: { s: Story; книга: string; рассказ: number }) {
  const узко = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 63.9375em)').matches;
  const Л = лица(s, s.accounts.length > 1 ? рассказ : undefined);
  const М = места(s);
  const заметки = прочитатьЗаметки().filter((z) => z.story === s.id);
  return (
    <aside class="панель" aria-label="Справка к истории" id="справка" tabIndex={-1}>
      <div class="панель-блоки">
        <Блок имя="В инструментах" n={1} открыт={!узко} ключ="инструменты" id="блок-инструменты">
          <Инструменты s={s} />
        </Блок>
        <Блок имя="Кто в этой истории" n={Л.люди.length + (Л.бог ? 1 : 0) + (слой2() ? Л.названы.length : 0)} открыт={!узко} ключ="лица">
          <ЛицаБлок s={s} Л={Л} />
        </Блок>
        <Блок имя="Где об этом в Библии" n={М.рассказано.length + М.пересказ.length + М.упоминания.length + М.намёки.length + (s.seeAlso?.length ?? 0) + (слой2() ? М.внутри.length : 0)} открыт={!узко} ключ="места">
          <МестаБлок s={s} />
        </Блок>
        <Блок имя="Соседние истории" открыт={false} ключ="соседи">
          <Соседи s={s} книга={книга} />
        </Блок>
        {заметки.length > 0 && (
          <Блок имя="Мои заметки" n={заметки.length} открыт={false} ключ="заметки">
            {заметки.map((z) => (
              <aside class="заметка" aria-label={`Моя заметка к ${адрес(z.ref)}`}>
                <span class="заметка__метка">Моя заметка к {адрес(z.ref)}</span>
                {z.text}
              </aside>
            ))}
          </Блок>
        )}
        <ДляИзучающих s={s} />
      </div>
    </aside>
  );
}

function прочитатьЗаметки(): { story: string; ref: string; text: string }[] {
  try {
    return JSON.parse(localStorage.getItem('бн-прототип:заметки') || '[]');
  } catch {
    return [];
  }
}

function Инструменты({ s }: { s: Story }) {
  const эпохи = эпохиСсылки(s.accounts[0]?.refs[0] ?? '');
  const href_ = href({ screen: 'vremya', params: { view: 'events', e: эпохи[0]?.id ?? '', sel: s.id } });
  const имяЭпох = эпохи.map((e) => e.short).join(', ');
  // в блоке — только то, что есть (арт С1): образ «Время»; имя ссылки — вопрос, инструмент, предмет и эпохи (доступность № 9)
  return эпохи.length > 0 ? (
    <div class="образы">
      <a class="малый-образ во-всю" href={href_} id="образ-время" data-key={эпохи.map((e) => `epoch:${e.id}`).join(' ')}>
        {!слой2() && <span class="малый-образ__вопрос">Когда это было? </span>}
        <span class="малый-образ__подпись">
          Время: {s.title.short}; {эпохи.length > 1 ? 'эпохи' : 'эпоха'} — {имяЭпох}
        </span>
        <span class="малый-образ__рисунок образ-без-рамки" aria-hidden="true">
          <ОбразЭпох залитые={эпохи.map((e) => e.id)} />
        </span>
      </a>
      {слой2() && <Эскиз подробно="эпоха — по главам книги из таблицы эпох; время истории по стихам ещё не посчитано (Д6)" />}
    </div>
  ) : (
    <p class="т-интерфейс">Сколько лет назад это было, Библия не говорит.</p>
  );
}

function ЛицаБлок({ s, Л }: { s: Story; Л: ReturnType<typeof лица> }) {
  const [все, setВсе] = useState(false);
  const первый = useRef<HTMLLIElement>(null);
  const ПРЕДЕЛ = 8;
  const люди = слой2() ? [...Л.люди, ...Л.названы] : Л.люди;
  const видно = все || слой2() ? люди : люди.slice(0, ПРЕДЕЛ);
  const ещё = люди.length - видно.length;
  return (
    <>
      {!слой2() && <p class="подпись-голоса лица-подпись">В кавычках — слова Библии.</p>}
      <ul class="лица-список">
        {Л.бог && <СтрокаЛица a={Л.бог} />}
        {видно.map((a, i) => (
          <СтрокаЛица a={a} ref_={i === ПРЕДЕЛ ? первый : undefined} />
        ))}
      </ul>
      {ещё > 0 && (
        <button
          class="кн кн--текст"
          type="button"
          onClick={() => {
            setВсе(true);
            requestAnimationFrame(() => первый.current?.querySelector<HTMLElement>('a, button')?.focus());
          }}
        >
          Показать ещё {число(ещё, ['лицо', 'лица', 'лиц'])}
          <span class="скрыто"> истории {s.title.short}</span>
        </button>
      )}
    </>
  );
}
const idsOf = (refs: string[]) => new Set(refs.flatMap((r) => стихи(r).map((x) => x.id)));

/** Строка лица — один образец (08 § 7.4; арт С2): имя — слова стиха в кавычках — адрес; Бог — первой строкой, без точки. */
function СтрокаЛица({ a, ref_ }: { a: StoryActor; ref_?: { current: HTMLLIElement | null } }) {
  const имяЛ = имяЛица(a);
  const бог = a.actor === 'god';
  const есть = a.actor.startsWith('p-') && естьЛицо(a.actor);
  const on = () => (подсветка.value = idsOf(a.refs));
  const off = () => (подсветка.value = new Set());
  const ссылка = есть ? href({ screen: 'kartochka', id: a.actor, params: {} }) : href({ screen: 'kartochka', id: `n-${a.actor.replace(/^new:/, '')}`, params: {} });
  const безымянный = a.kind === 'unnamed';
  return (
    <li class={`строка-лица строка-лица--одна${бог ? ' строка-бога' : ''}${слой2() ? ' строка-лица--второй' : ''}`} ref={ref_} onMouseEnter={on} onMouseLeave={off} onFocusIn={on} onFocusOut={off}>
      <span class="строка-лица__имя">
        {бог ? (
          'Бог'
        ) : (
          <a href={ссылка} id={`лицо-${a.actor.replace(/[^a-z0-9-]/gi, '-')}`} data-key={есть ? `actor:${a.actor}` : undefined}>
            {имяЛ}
          </a>
        )}
        {a.kind && a.kind !== 'person' && a.kind !== 'human' && !бог && <span class="скрыто">, {a.kind === 'group' || a.kind === 'people' ? 'группа' : a.kind === 'animal' ? 'животное' : a.kind === 'unnamed' ? 'имя не названо' : ''}</span>}
      </span>{' '}
      <span class="строка-лица__роль">
        {безымянный && <span class="т-интерфейс">{/а$|я$/.test(имяЛ.split(' ')[0]) ? 'Как её звали' : 'Как звали'}, в Библии не сказано. </span>}
        {a.roleText && (
          <>
            <span class="скрыто не-копировать">Библия: </span>
            <q class="т-цитата голос-библия-в-строке">«{a.roleText.text}»</q>{' '}
          </>
        )}
        <АдресКн ссылка={a.roleText?.refs[0] ?? a.refs[0]} />
        {a.cert === 'inference' && <Вывод cert="inference" />}
      </span>
      {слой2() && !бог && (
        <span class="т-адрес строка-лица__второй">
          {рольСловами(a)}; стихов: {a.refs.length}; {есть ? a.actor : 'карточки ещё нет'}
        </span>
      )}
    </li>
  );
}

function МестаБлок({ s }: { s: Story }) {
  const М = места(s);
  const [все, setВсе] = useState(false);
  const [различия, setРазличия] = useState(false);
  const ups = [...М.упоминания];
  const видно = все || слой2() ? ups : ups.slice(0, 3);
  const рассказы = [...new Set(s.accounts.map((a) => книгаСсылки(a.refs[0])))];
  return (
    <>
      <ul>
        <li class="строка-лица">
          <span class="т-интерфейс">
            Рассказано: {рассказы.map(книгаИм).join(', ')}
            {рассказы.length > 1 && (
              <>
                {'. '}
                <a href={href({ ...маршрут.value, params: { ...маршрут.value.params, view: 'sinopsis' } })}>Сравнить рассказы</a>
              </>
            )}
          </span>
        </li>
        {М.пересказ.map((l) => (
          <li class="строка-лица">
            <span class="т-интерфейс">
              Пересказывает {l.teller ? имя(l.teller) : полноеИмя(книгаСсылки(l.refs[0]))}:{' '}
            </span>
            {l.words?.length ? <Библия>«{l.words.join('… ')}»</Библия> : null} <АдресКн ссылка={l.refs[0]} />
          </li>
        ))}
        {М.пересказ.length === 0 &&
          s.links
            .filter((l) => l.kind === 'retelling' && l.sameBook)
            .map((l) => (
              <li class="строка-лица">
                <span class="т-интерфейс">Пересказывает {l.teller ? имя(l.teller) : 'участник'}: </span>
                {l.words?.[0] && <Библия>«{l.words[0]}»</Библия>} <АдресКн ссылка={l.refs[0]} />
              </li>
            ))}
        {ups.length + М.намёки.length > 0 && (
          <li class="строка-лица">
            <span class="т-интерфейс">
              Вспоминают ещё {число(new Set([...ups, ...М.намёки].map((l) => книгаСсылки(l.refs[0]))).size, ['книга', 'книги', 'книг'])}, {число(ups.length + М.намёки.length, ['место', 'места', 'мест'])}:
            </span>
          </li>
        )}
        {видно.map((l) => (
          <li class="строка-лица">
            {l.words?.length ? <Библия>«{l.words.join('… ')}»</Библия> : null} <АдресКн ссылка={l.refs[0]} />
            {l.cert === 'inference' && (слой2() ? <Вывод cert="inference" /> : <span class="пометка">похоже, вспоминает — так выходит, если сравнить места Библии</span>)}
          </li>
        ))}
        {М.намёки.map((l) => (
          <li class="строка-лица">
            <span class="т-интерфейс">{полноеИмя(книгаСсылки(l.refs[0]))}, похоже, вспоминает об этом: </span>
            {l.words?.length ? <Библия>«{l.words.join('… ')}»</Библия> : null} <АдресКн ссылка={l.refs[0]} />
            <span class="пометка"> так выходит, если сравнить места Библии</span>
          </li>
        ))}
        {s.seeAlso?.map((x) => (
          <ТожеИмя x={x} />
        ))}
      </ul>
      {ups.length > видно.length && (
        <button class="кн кн--текст" type="button" onClick={() => setВсе(true)}>
          Показать ещё {число(ups.length - видно.length, ['место', 'места', 'мест'])}
        </button>
      )}
      {(s.discrepancies?.length ?? 0) > 0 && (
        <div class="различия-блок">
          {слой2() || различия ? (
            s.discrepancies!.map((d) => <Различие d={d} />)
          ) : (
            <p class="т-интерфейс">
              В рассказах есть различия.{' '}
              <button class="кн кн--текст" type="button" onClick={() => setРазличия(true)}>
                Показать различия рассказов
              </button>
            </p>
          )}
        </div>
      )}
      {слой2() && М.внутри.length > 0 && (
        <details class="внутри-книги">
          <summary>Ссылки внутри книги ({М.внутри.length})</summary>
          <ul>
            {М.внутри.map((l) => (
              <li class="строка-лица">
                {l.words?.length ? <Библия>«{l.words.join('… ')}»</Библия> : null} <АдресКн ссылка={l.refs[0]} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {слой2() && <ПолосаКниг s={s} />}
      <p class="голос-мы">Все найденные места. Мы ещё ищем такие места в других книгах.</p>
    </>
  );
}

/**
 * «То же имя стоит ещё» (11 § 4.5 п. 8): из поля данных `seeAlso` — без слов «назван ещё» (они решают за читателя, то же ли
 * это лицо) и с цитатами обоих стихов. Формулировка данных — задача данных (README).
 */
function ТожеИмя({ x }: { x: { text: string; refs: string[]; story?: string } }) {
  const имяИзДанных = x.text.split(' назван')[0];
  return (
    <li class="строка-лица см-также">
      <span class="т-интерфейс">Имя «{имяИзДанных}» стоит и в другом рассказе:</span>
      <ul>
        {x.refs.map((r) => {
          const ст = стихи(r)[0];
          return (
            <li>
              {ст && (
                <>
                  <span class="скрыто не-копировать">Библия: </span>
                  <q class="т-цитата голос-библия-в-строке">«{показ(ст.view.text)}»</q>{' '}
                </>
              )}
              <АдресКн ссылка={r} />
            </li>
          );
        })}
      </ul>
      {слой2() && x.story && (
        <span class="т-адрес">
          Рассказ — <a href={href({ screen: 'istoriya', id: x.story, params: {} })}>{Д.stories.get(x.story)?.title.short}</a>. Одно ли это лицо, Библия прямо не говорит.
        </span>
      )}
    </li>
  );
}

/** Полоса 66 книг (08 § 7.12; 11 § 4.5 п. 3): не нажимается и скрыта от программы чтения; двойник — таблица. */
function ПолосаКниг({ s }: { s: Story }) {
  const рассказано = new Set(s.accounts.map((a) => книгаСсылки(a.refs[0])));
  const М = места(s);
  const упомянуто = new Map<string, string[]>();
  for (const l of [...М.пересказ, ...М.упоминания, ...М.намёки]) {
    const b = книгаСсылки(l.refs[0]);
    (упомянуто.get(b) ?? упомянуто.set(b, []).get(b)!).push(l.refs[0]);
  }
  const разрыв = new Set([5, 17, 22, 39, 44, 51, 65]);
  return (
    <>
      <div class="полоса-книг" aria-hidden="true">
        {BOOKS.map((b, i) => (
          <span class={`полоса-книг__клетка${разрыв.has(i) ? ' полоса-книг__клетка--разрыв' : ''}`} title={полноеИмя(b.code)}>
            {рассказано.has(b.code) ? <span class="полоса-книг__отметка полоса-книг__отметка--рассказано" /> : упомянуто.has(b.code) ? <span class="полоса-книг__отметка полоса-книг__отметка--упомянуто" /> : null}
          </span>
        ))}
      </div>
      <table class="таблица таблица--малая">
        <caption class="т-адрес">Все найденные места; как искали — опись полноты (ещё составляется)</caption>
        <thead>
          <tr>
            <th scope="col">Книга</th>
            <th scope="col">Как говорит</th>
            <th scope="col">Места</th>
          </tr>
        </thead>
        <tbody>
          {[...рассказано].map((b) => (
            <tr>
              <th scope="row">{полноеИмя(b)}</th>
              <td>рассказано</td>
              <td>{адрес(s.accounts.filter((a) => книгаСсылки(a.refs[0]) === b).flatMap((a) => a.refs))}</td>
            </tr>
          ))}
          {[...упомянуто].filter(([b]) => !рассказано.has(b)).map(([b, refs]) => (
            <tr>
              <th scope="row">{полноеИмя(b)}</th>
              <td>{s.links.find((l) => книгаСсылки(l.refs[0]) === b)?.kind === 'retelling' ? 'пересказывает' : 'вспоминает'}</td>
              <td>{адрес(refs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Соседи({ s, книга }: { s: Story; книга: string }) {
  const xs = Д.proto.catalog[книга] ?? [];
  const i = xs.findIndex((x) => x.id === s.id);
  const пред = i > 0 ? Д.stories.get(xs[i - 1].id) : undefined;
  const след = i >= 0 && i + 1 < xs.length ? Д.stories.get(xs[i + 1].id) : undefined;
  const цикл = s.partOf ? (Д.proto.catalog[книга] ?? []).filter((x) => Д.stories.get(x.id)?.partOf === s.partOf) : [];
  const ссылка = (x: Story) => href({ screen: 'istoriya', id: x.id, params: книга === книгаСсылки(x.accounts[0]?.refs[0] ?? '') ? {} : { rasskaz: bookSlug(книга) } });
  return (
    <>
      <ul class="в-книге">
        {пред && (
          <li class="строка-лица">
            <span class="т-адрес">Предыдущая {вКниге(книга)}</span> <a href={ссылка(пред)}>{пред.title.short}</a>
          </li>
        )}
        {след && (
          <li class="строка-лица">
            <span class="т-адрес">Следующая {вКниге(книга)}</span> <a href={ссылка(след)}>{след.title.short}</a>
          </li>
        )}
      </ul>
      {цикл.length > 1 && (
        <>
          <h3 class="т-повествование">{Д.stories.get(s.partOf!)?.title.short}</h3>
          <ul>
            {цикл.map((x) => {
              const st = Д.stories.get(x.id)!;
              return (
                <li class="строка-лица">
                  {x.id === s.id ? (
                    <span aria-current="page" class="сильно текущий">
                      {st.title.short} (вы здесь)
                    </span>
                  ) : (
                    <a href={ссылка(st)}>{st.title.short}</a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {слой2() && <p class="голос-мы">Соседи по времени: сколько времени прошло между этими историями, мы ещё не посчитали (Д6).</p>}
    </>
  );
}

function ДляИзучающих({ s }: { s: Story }) {
  if (!слой2()) {
    return (
      <p class="для-изучающих-кн">
        <button
          class="кн кн--текст"
          type="button"
          onClick={(e) => {
            const btn = e.currentTarget;
            изменить({ слой: '2' });
            объявить('Показаны номера записей, скобки, толкования и источники');
            requestAnimationFrame(() => (document.getElementById('для-изучающих-кн') ?? btn).focus());
          }}
        >
          Показать для изучающих: скобки, толкования, источники
        </button>
      </p>
    );
  }
  const скобок = s.accounts.flatMap((a) => a.refs).flatMap((r) => стихи(r)).reduce((n, x) => n + x.view.brackets.length, 0);
  return (
    <Блок имя="Для изучающих" открыт={false} ключ="изучающим">
      <dl class="т-интерфейс для-изучающих">
        <dt>Границы</dt>
        <dd>
          начало — {адрес(s.accounts[0].refs[0].split('-')[0])}, правило {s.boundary?.startRule ?? '—'}
          {s.boundary?.human ? `; решал человек: ${s.boundary.human}` : ''}
        </dd>
        {s.plot?.length ? (
          <>
            <dt>Завязка и развязка</dt>
            <dd>
              {s.plot.map((p) => `${адрес(p.setup)} — ${адрес(p.resolution)}`).join('; ')}
            </dd>
          </>
        ) : null}
        <dt>Скобки</dt>
        <dd>мест в скобках в стихах истории: {скобок}; слова в скобках — не основание фактов этой страницы (02 § 3.8)</dd>
        {s.title.common?.length ? (
          <>
            <dt>Так называют</dt>
            <dd>{s.title.common.join(', ')} — так называют; в тексте этих слов нет</dd>
          </>
        ) : null}
        <dt>Номер записи</dt>
        <dd>
          {s.id}{' '}
          <button class="кн кн--текст" type="button" id="для-изучающих-кн" onClick={() => void вБуфер(s.id, null, 'номер записи')}>
            Копировать номер
          </button>
        </dd>
        <dt>Колофон</dt>
        <dd>
          разметка: {s.source?.method === 'reading' ? 'составитель историй, чтение стихов' : (s.source?.method ?? '—')}; второй ключ — {статус(`story:${s.id}`) === 'checked' ? 'подписано' : 'ещё нет (черновик)'}; проба П7 не взята; выпуск данных — проба {Д.proto.base}
        </dd>
      </dl>
      <p class="голос-мы">Внешние номера (Евсевий, Theographic) и толкования по Г-1–Г-7 — эскиз: в пакете прототипа их нет.</p>
    </Блок>
  );
}

function КакСослаться({ s, закрыть }: { s: Story; закрыть: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = открыто(закрыть, null);
    ref.current?.focus();
    return off;
  }, []);
  const дата = new Date().toLocaleDateString('ru-RU');
  const r = маршрут.value;
  const url = `${location.origin}${href({ ...r, params: { ...r.params, v: `проба-${Д.proto.base}` } })}`;
  const рк = r.params.rasskaz ? BOOKS.find((b) => b.slug === r.params.rasskaz)?.code : undefined;
  const вид = [r.params.view === 'sinopsis' ? 'рассказы рядом' : '', рк ? `рассказ ${подписьРассказа(рк)}` : ''].filter(Boolean).join(', ');
  const сноска = `${s.title.short}${вид ? ` (${вид})` : ''}, ${адрес(s.accounts.flatMap((a) => a.refs)).replace(/\u00A0/g, ' ')} // Библия наглядно : сайт. Выпуск данных проба ${Д.proto.base}. URL: ${url} (дата обращения: ${дата}).`;
  const список = `${s.title.short}${вид ? ` (${вид})` : ''}. – Текст : электронный // Библия наглядно : сайт. – Выпуск данных проба ${Д.proto.base}. – URL: ${url} (дата обращения: ${дата}).`;
  return (
    <div class="как-сослаться" ref={ref} tabIndex={-1} role="region" aria-label="Как сослаться">
      <p class="т-адрес">Для ссылки в тексте или сноске (ГОСТ Р 7.0.108-2022)</p>
      <p>
        <code>{сноска}</code>
      </p>
      <button class="кн кн--текст" type="button" onClick={() => void вБуфер(сноска, null, 'ссылка для сноски')}>
        <Значок имя="копировать" />
        Копировать ссылку для сноски
      </button>
      <p class="т-адрес">Для списка литературы (ГОСТ Р 7.0.100-2018)</p>
      <p>
        <code>{список}</code>
      </p>
      <button class="кн кн--текст" type="button" onClick={() => void вБуфер(список, null, 'запись для списка литературы')}>
        <Значок имя="копировать" />
        Копировать запись для списка литературы
      </button>{' '}
      <button class="кн кн--текст" type="button" onClick={закрыть}>
        Закрыть
      </button>
    </div>
  );
}

function КакЧитать({ закрыть }: { закрыть: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = открыто(закрыть, null);
    ref.current?.focus();
    return off;
  }, []);
  return (
    <div class="как-сослаться как-читать" ref={ref} tabIndex={-1} role="region" aria-labelledby="как-читать-з">
      <h2 class="т-h2" id="как-читать-з">
        Как читать эту страницу
      </h2>
      <p class="т-проза">Вверху — название и коротко, нашими словами, о чём история. Ниже — сам текст Библии по частям. Справа (на телефоне — ниже) — кто в этой истории и где ещё о ней говорит Библия.</p>
      <p class="т-проза">Черновик — наше деление на истории и подписи: где начинается и кончается эта история и кто в ней. Его ещё проверяют. Текст Библии здесь полный.</p>
      <p class="т-проза">Слова в скобках — так напечатано в Синодальном переводе. В квадратных скобках — слова, которых нет в части древних рукописей или которые добавлены переводчиками; в круглых — пояснения. На слова в скобках мы не опираемся.</p>
      {детям() && <p class="т-проза">Если читаете с ребёнком: прочтите историю сначала сами.</p>}
      <button class="кн кн--текст" type="button" onClick={закрыть}>
        Закрыть
      </button>
    </div>
  );
}

// для поведенческих тестов и отладки
export const __история = { подсветка, рамка, отрывок, стихов, вСсылке, отрезки, стих };
export type { Link };
