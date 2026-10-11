/**
 * Общие компоненты экранов прототипа по 08 ред. 3.3 (облик — лист-образец 3.2, принятый В-31): шапка, плашка пробы,
 * «Назад: …», хлебные крошки, адрес-кнопка со вклейкой стиха, блок справки с числом, меню, переключатель слоя, текст стиха
 * со скобками и скрытыми метками. Классы — те же, что в листе: CSS взят оттуда (`общее/*.css`).
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Значок } from './знаки.tsx';
import { Д, стихи, стих, показ, загружено, ошибка } from './данные.ts';
import { адрес, адресПолно, отрезки } from './адреса.ts';
import { настройки, изменить, слой2 } from './настройки.ts';
import { объявить, открыто, вБуфер, NB } from './службы.ts';
import { router, кнопкаНазад, снимок, href, маршрут } from './приложение.ts';
import type { VerseView } from '../../../core/verses.ts';

// ---------- шапка (08 § 7.1) и плашка пробы (09 § 4.6) ----------
export function Шапка() {
  const [меню, setМеню] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => (меню ? открыто(() => setМеню(false), кн.current) : undefined), [меню]);
  const пункт = (имя: string, адр: string, зн?: string) => (
    <a class="кн" href={адр} aria-current={маршрут.value.screen === адр.split('/').filter(Boolean).pop() ? 'page' : undefined}>
      {зн && <Значок имя={зн} />}
      <span>{имя}</span>
    </a>
  );
  return (
    <header class="шапка">
      <div class="оболочка шапка__ряд">
        <a class="знак-ссылка" href={href({ screen: 'glavnaya', params: {} })} aria-label="Библия наглядно, на главную">
          <span class="знак-приложения">
            <span class="знак-приложения__надпись">Библия наглядно</span>
          </span>
        </a>
        <search class="шапка__поиск">
          <form
            class="поиск"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.go({ screen: 'poisk', params: { q: q.trim() } });
            }}
          >
            <label class="поиск__подпись" for="поиск-шапка">
              Поиск
            </label>
            <span class="поиск__поле">
              <Значок имя="поиск" />
              <input id="поиск-шапка" type="search" placeholder="Стих, слово, имя, место" autocomplete="off" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
            </span>
          </form>
        </search>
        <nav class="шапка__нав" aria-label="Разделы">
          {пункт('Все истории', href({ screen: 'istorii', params: {} }))}
          {пункт('Время', href({ screen: 'vremya', params: {} }), 'время')}
          {пункт('Настройки', href({ screen: 'nastroyki', params: {} }), 'настройки')}
        </nav>
        <div class="шапка__меню">
          <a class="кн шапка__кн-поиск" href={href({ screen: 'poisk', params: {} })}>
            <Значок имя="поиск" />
            <span>Поиск</span>
          </a>
          <div class="меню-обёртка">
            <button ref={кн} class="кн" type="button" aria-haspopup="menu" aria-expanded={меню} aria-controls="меню-шапки" onClick={() => setМеню(!меню)}>
              <Значок имя="меню" />
              <span>Меню</span>
            </button>
            <div class="меню меню--справа" role="menu" id="меню-шапки" hidden={!меню} aria-label="Меню" onClick={() => setМеню(false)}>
              <a role="menuitem" href={href({ screen: 'poisk', params: {} })} class="пункт-поиск">
                <Значок имя="поиск" />
                Поиск
              </a>
              <a role="menuitem" href={href({ screen: 'istorii', params: {} })}>
                Все истории
              </a>
              <a role="menuitem" href={href({ screen: 'vremya', params: {} })}>
                <Значок имя="время" />
                Время
              </a>
              <a role="menuitem" href={href({ screen: 'nastroyki', params: {} })}>
                <Значок имя="настройки" />
                Настройки
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Плашка() {
  const p = Д.proto;
  // «проба данных» — другим словом, чем «черновик» историй (решение координатора § 2); числа — что они считают (научные № 19)
  return (
    <aside class="плашка-пробы-полоса" aria-label="Проба данных">
      <div class="оболочка плашка-пробы">
        <strong>Проба данных</strong>
        <span class="т-адрес">
          записи ещё не проверены вторым ключом: в пакете прототипа подписано {p.counts.signed} из {p.counts.keys}; рабочий прототип, база {p.base}
        </span>
      </div>
    </aside>
  );
}

// ---------- «Назад: …» (08 § 6.5, § 7.14) и хлебные крошки ----------
export function КнНазад() {
  const t = кнопкаНазад.value;
  if (!t) return null;
  return (
    <button class="кн кн-назад" type="button" id="кн-назад" onClick={() => router.back()}>
      <Значок имя="назад" />
      {t.label}
    </button>
  );
}
export function Хлебные({ путь }: { путь: { имя: string; href?: string }[] }) {
  return (
    <nav class="хлебные т-адрес" aria-label="Путь">
      {путь.map((x, i) => (
        <>
          {i > 0 && <Значок имя="вправо" />}
          {x.href && i < путь.length - 1 ? <a href={x.href}>{x.имя}</a> : <span aria-current={i === путь.length - 1 ? 'page' : undefined}>{x.имя}</span>}
        </>
      ))}
    </nav>
  );
}

// ---------- переключатель слоя (08 § 7.9): настройка уровня 5 ----------
export function ПереключательСлоя({ объявление }: { объявление?: (второй: boolean) => string }) {
  const s = настройки.value.слой;
  const id = useId();
  const set = (v: '1' | '2', e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    if (v === s) return;
    const btn = e.currentTarget;
    изменить({ слой: v });
    объявить(объявление?.(v === '2') ?? (v === '2' ? 'Показано для изучающих' : 'Показано для начинающих'));
    requestAnimationFrame(() => btn.isConnected && btn.focus());
  };
  return (
    <div class="слой" role="group" aria-labelledby={id}>
      <span id={id}>Показать:</span>
      <span class="слой__группа">
        <button type="button" aria-pressed={s === '1'} onClick={(e) => set('1', e)}>
          Для начинающих
        </button>
        <button type="button" aria-pressed={s === '2'} onClick={(e) => set('2', e)}>
          Для изучающих
        </button>
      </span>
    </div>
  );
}

// ---------- раскрытие с запоминанием в снимке ----------
/** Раскрыто ли (`data-snap` = ключ): при возврате на экран — из снимка; иначе — по умолчанию. */
export function useРаскрыто(ключ: string, поУмолчанию: boolean): [boolean, (v: boolean) => void] {
  const s = снимок.peek();
  const [v, set] = useState(s?.open ? s.open.includes(ключ) : поУмолчанию);
  return [v, set];
}

// ---------- текст стиха со скобками (08 § 4.2; 02 § 3.8) ----------
/** Стих: скобки — тем же цветом, знаки видны; скрытые метки «в скобках:» и «конец скобок» — сгенерированным содержимым (не копируются). */
export function ТекстСтиха({ view, подсветка }: { view: VerseView; подсветка?: (t: string) => ComponentChildren }) {
  const t = показ(view.text);
  const out: ComponentChildren[] = [];
  let at = 0;
  const br = [...view.brackets].sort((a, b) => a.start - b.start);
  for (const b of br) {
    if (b.start > at) out.push(подсветка ? подсветка(t.slice(at, b.start)) : t.slice(at, b.start));
    out.push(
      <span class={`скобка${b.isText ? ' скобка-бг' : ''}`} data-vid={b.kind}>
        {t.slice(b.start, b.end)}
      </span>,
    );
    at = b.end;
  }
  if (at < t.length) out.push(подсветка ? подсветка(t.slice(at)) : t.slice(at));
  return <>{out}</>;
}

// ---------- копия стиха с адресом (08 § 16.2) ----------
export function строкаКопии(ref: string, сНомерами = false): { plain: string; html: string } {
  const xs = стихи(ref);
  const a = адрес(ref);
  if (xs.length === 1 && !сНомерами) {
    const t = показ(xs[0].view.text);
    return { plain: `«${t}» (${a}, Синодальный перевод)`, html: `<blockquote><p>«${esc(t)}»</p></blockquote><p>(${esc(a)}, Синодальный перевод)</p>` };
  }
  const lines = xs.map((s, i) => `${i > 0 && s.c !== xs[i - 1].c ? `${s.c}:${s.v}` : s.v} ${показ(s.view.text)}`);
  return {
    plain: `«${lines.join('\n')}»\n(${a}, Синодальный перевод)`,
    html: `<blockquote>${xs.map((s) => `<p><sup>${s.v}</sup> ${esc(показ(s.view.text))}</p>`).join('')}</blockquote><p>(${esc(a)}, Синодальный перевод)</p>`,
  };
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

// ---------- адрес-кнопка со вклейкой (08 § 7.6; 11 § 4.5 п. 6) ----------
/** Адрес — кнопка; раскрытие на месте: стих и ± 2 стиха вокруг, «Вся глава», копия. Имя начинается с видимого адреса (2.5.3). */
export function АдресКн({ ссылка, вокруг = true, ключ }: { ссылка: string; вокруг?: boolean; ключ?: string }) {
  const id = useId();
  const [откр, setОткр] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  useEffect(() => (откр ? открыто(() => setОткр(false), кн.current) : undefined), [откр]);
  void загружено.value;
  const видимо = адрес(ссылка);
  return (
    <>
      <button ref={кн} class="адрес-кн" type="button" aria-expanded={откр} aria-controls={id} aria-label={`${видимо.replace(/ /g, ' ')}, ${адресПолно(ссылка)}`} onClick={() => setОткр(!откр)} data-key={ключ}>
        {видимо}
        <Значок имя="раскрыть" />
      </button>
      {откр && (
        <div class="вклейка" id={id}>
          <Вклейка ссылка={ссылка} вокруг={вокруг} />
        </div>
      )}
    </>
  );
}
function Вклейка({ ссылка, вокруг }: { ссылка: string; вокруг: boolean }) {
  const свои = стихи(ссылка);
  const s0 = отрезки(ссылка)[0];
  let около = свои;
  if (вокруг && свои.length === 1 && s0) {
    около = [-2, -1, 0, 1, 2].map((d) => стих(s0.book, s0.c1, (s0.v1 ?? 1) + d)).filter((x): x is NonNullable<typeof x> => !!x);
  }
  const свой = new Set(свои.map((x) => x.id));
  if (!около.length) return <p class="голос-мы">Загружаем стих…</p>;
  return (
    <>
      <blockquote class="голос-библия т-цитата">
        {около.map((x) => (
          <p class={свой.has(x.id) ? 'вклейка__свой' : undefined}>
            <span class="т-адрес не-копировать">
              {x.v}
              {NB}
            </span>
            <ТекстСтиха view={x.view} />
          </p>
        ))}
      </blockquote>
      <div class="ряд-действий">
        <button
          class="кн"
          type="button"
          onClick={() => {
            const { plain, html } = строкаКопии(ссылка, слой2());
            void вБуфер(plain, html, адрес(ссылка));
          }}
        >
          <Значок имя="копировать" />
          Копировать стих с адресом
        </button>
        {s0 && (
          <a class="кн" href={href({ screen: 'glava', book: s0.book, ch: s0.c1, params: {}, hash: `st${s0.c1}.${s0.v1 ?? 1}` })}>
            <Значок имя="списком" />
            Вся глава
          </a>
        )}
      </div>
    </>
  );
}

// ---------- блок справки с числом (08 § 7.28) ----------
export function Блок({ имя, n, открыт, ключ, children, id }: { имя: string; n?: number; открыт: boolean; ключ: string; children: ComponentChildren; id?: string }) {
  const [v, set] = useРаскрыто(ключ, открыт);
  const tid = useId();
  if (n === 0) return null; // пустой блок не рисуется
  return (
    <section class="блок" id={id}>
      <h2 class="блок__заголовок">
        <button class="блок__кнопка" type="button" aria-expanded={v} aria-controls={tid} data-snap={ключ} onClick={() => set(!v)}>
          {имя}
          {n !== undefined ? ` (${n})` : ''}
          <Значок имя="раскрыть" />
        </button>
      </h2>
      <div class="блок__тело" id={tid} hidden={!v}>
        {children}
      </div>
    </section>
  );
}

// ---------- меню (APG Menu Button; 08 § 7.16) ----------
export function Меню({ подпись, имя, пункты, справа = true, класс = '' }: { подпись: ComponentChildren; имя: string; пункты: { т: string; зн?: string; on: () => void; скрыт?: boolean }[]; справа?: boolean; класс?: string }) {
  const [откр, setОткр] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  const м = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!откр) return;
    const off = открыто(() => setОткр(false), кн.current);
    requestAnimationFrame(() => м.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return off;
  }, [откр]);
  const видимые = пункты.filter((p) => !p.скрыт);
  const key = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const items = [...(м.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => {
      e.preventDefault();
      items[(j + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') setОткр(false);
  };
  return (
    <span class={`меню-обёртка ${класс}`}>
      <button
        ref={кн}
        class="кн"
        type="button"
        aria-haspopup="menu"
        aria-expanded={откр}
        aria-controls={id}
        aria-label={имя}
        onClick={() => setОткр(!откр)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setОткр(true);
          }
        }}
      >
        {подпись}
      </button>
      <div ref={м} class={`меню${справа ? ' меню--справа' : ''}`} role="menu" id={id} hidden={!откр} aria-label={имя} onKeyDown={key}>
        {видимые.map((p) => (
          <button
            role="menuitem"
            type="button"
            tabIndex={-1}
            onClick={() => {
              setОткр(false);
              кн.current?.focus();
              p.on();
            }}
          >
            {p.зн && <Значок имя={p.зн} />}
            {p.т}
          </button>
        ))}
      </div>
    </span>
  );
}

// ---------- «Библия:» у цитаты вне текста (08 § 4.4; 11 § 4.3) ----------
export function Библия({ children }: { children: ComponentChildren }) {
  return (
    <>
      <span class={`${слой2() ? 'скрыто' : 'подпись-голоса'} не-копировать`}>Библия: </span>
      <q class="т-цитата голос-библия">{children}</q>
    </>
  );
}

/** Пометка «выв.» (08 § 7.7): в простом слое — словами. */
export function Вывод({ cert }: { cert?: string }) {
  if (cert !== 'inference') return null;
  return слой2() ? (
    <span class="пометка" title="так выходит, если сравнить места Библии">
      выв.
      <span class="скрыто">, так выходит, если сравнить места Библии</span>
    </span>
  ) : (
    <span class="пометка">Так выходит, если сравнить места Библии</span>
  );
}

/**
 * Пометка «эскиз» по правилу прототипов: данных или модели нет. В простом слое — слово «эскиз» и фраза для читателя;
 * служебные подробности (разделы документов, этапы данных) — только во втором слое (решение координатора § 2).
 */
export function Эскиз({ простое, подробно, children }: { простое?: string; подробно?: string; children?: ComponentChildren }) {
  return (
    <p class="голос-мы эскиз">
      <strong>эскиз</strong>
      {слой2() ? (подробно || children ? <>: {подробно ?? children}</> : null) : простое ? `: ${простое}` : null}
    </p>
  );
}

export function Ошибка() {
  const e = ошибка.value;
  if (!e) return null;
  return (
    <p class="тихая-строка" role="alert">
      {e}.{' '}
      <button class="кн кн--текст" type="button" onClick={() => location.reload()}>
        Повторить
      </button>
    </p>
  );
}
