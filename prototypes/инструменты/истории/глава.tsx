/**
 * Страница главы (11 § 4.13; ВП-45): вид страницы книги — чтение главы целиком. Названия историй — заголовками в колонке
 * текста перед первым стихом истории; если глава начинается внутри истории — строка «Продолжение: …»; стихи вне историй —
 * их класс тихой строкой; номера стихов — в строке; скобки — со скрытыми метками; соседние главы. Справки нет.
 */
import { useEffect } from 'preact/hooks';
import { Д, стихи, загружено, глав, загрузитьКнигу, статус } from '../общее/данные.ts';
import { адрес, имяКниги, завет, отрезки, книгаСсылки, полноеИмя } from '../общее/адреса.ts';
import { слой2 } from '../общее/настройки.ts';
import { маршрут, href } from '../общее/приложение.ts';
import { bookSlug } from '../общее/маршруты.ts';
import { КнНазад, Хлебные, ПереключательСлоя, ТекстСтиха } from '../общее/компоненты.tsx';
import { BOOKS, BOOK_BY_CODE } from '../../../core/books.ts';
import type { Story } from '../общее/типы.ts';

const КЛАСС: Record<string, string> = { intro: 'заглавие или обращение', law: 'закон', prophecy: 'пророчество', teaching: 'учение', prayer: 'молитва', song: 'песнь', list: 'перечень', letter: 'послание' };

export function Глава({ book, ch }: { book: string; ch: number }) {
  void загружено.value;
  const r = маршрут.value;
  useEffect(() => {
    void загрузитьКнигу(book);
  }, [book]);
  useEffect(() => {
    if (!r.hash) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(r.hash!);
      if (el) {
        el.classList.add('стих--рамка');
        el.scrollIntoView({ block: 'center' });
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
    });
  }, [r.hash, загружено.value]);
  const b = BOOK_BY_CODE.get(book)!;
  const xs = стихи(`${book} ${ch}`);
  const n = глав(book);
  // истории, чьи рассказы задевают главу
  const вГлаве: { s: Story; ref: string; c: number; v: number }[] = [];
  for (const s of Д.stories.values()) {
    if (s.level !== 'story') continue;
    for (const a of s.accounts) for (const ref of a.refs) for (const sp of отрезки(ref)) {
      if (sp.book !== book || sp.c1 > ch || sp.c2 < ch) continue;
      const c = sp.c1 === ch ? ch : ch;
      const v = sp.c1 === ch ? (sp.v1 ?? 1) : 1;
      вГлаве.push({ s, ref, c, v });
    }
  }
  вГлаве.sort((x, y) => x.v - y.v || (x.s.nested ? -1 : 1));
  const первое = вГлаве.find((x) => x.v === 1 && отрезки(x.ref)[0].c1 < ch);
  const классы = Д.proto.vclasses.filter((c) => c.book === book && c.ch === ch);
  const пред = ch > 1 ? { book, ch: ch - 1 } : (() => {
    const i = BOOKS.findIndex((x) => x.code === book);
    return i > 0 ? { book: BOOKS[i - 1].code, ch: 0 } : null;
  })();
  const след = n && ch < n ? { book, ch: ch + 1 } : (() => {
    const i = BOOKS.findIndex((x) => x.code === book);
    return i < BOOKS.length - 1 ? { book: BOOKS[i + 1].code, ch: 1 } : null;
  })();
  const путь = [{ имя: завет(book) === 'nt' ? 'Новый Завет' : 'Ветхий Завет' }, { имя: полноеИмя(b.code), href: href({ screen: 'kniga', book, params: {} }) }, { имя: `глава ${ch}` }];
  const hrefИст = (s: Story) => href({ screen: 'istoriya', id: s.id, params: книгаСсылки(s.accounts[0].refs[0]) === book ? {} : { rasskaz: bookSlug(book) } });
  return (
    <div class="глава-страница">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
          <Хлебные путь={путь} />
        </div>
        <div class="ряд-действий">
          <span class="слой-в-ряду">
            <ПереключательСлоя />
          </span>
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        {полноеИмя(b.code)}, глава {ch}
      </h1>
      {вГлаве.length > 0 && (
        <p class="т-адрес">
          В этой главе:{' '}
          {[...new Map(вГлаве.map((x) => [x.s.id, x.s])).values()].map((s, i) => (
            <>
              {i > 0 ? ', ' : ''}
              <a href={hrefИст(s)} data-key={`story:${s.id}`}>
                {s.title.short}
              </a>
            </>
          ))}
        </p>
      )}
      {первое && (
        <p class="продолжение т-интерфейс">
          Продолжение: <a href={hrefИст(первое.s)}>{первое.s.title.short}</a>
          {(() => {
            const p = первое.s.parts?.find((x) => x.refs.some((r) => отрезки(r).some((sp) => sp.book === book && (sp.c1 < ch || (sp.c1 === ch && (sp.v1 ?? 1) <= 1)) && sp.c2 >= ch)));
            return p ? `, часть ${p.n}` : '';
          })()}{' '}
          (с {адрес(первое.ref.split('-')[0])})
        </p>
      )}
      {!xs.length ? (
        <p class="голос-мы" aria-busy="true">
          Загружаем главу…
        </p>
      ) : (
        <div class="писание глава-текст" lang="ru">
          {xs.map((x) => {
            const ист = вГлаве.filter((y) => y.v === x.v && !(y === первое));
            const кл = классы.find((c) => x.v === c.from);
            return (
              <>
                {ист.map((y) => (
                  <h2 class="история-в-главе">
                    <a href={hrefИст(y.s)} data-key={`story:${y.s.id}`} data-status={статус(`story:${y.s.id}`)}>
                      {y.s.title.short}
                    </a>{' '}
                    <span class="т-адрес">{адрес(y.ref)}</span>
                  </h2>
                ))}
                {кл && (
                  <p class="тихая-строка класс-стиха" data-key={`vclass:${кл.book} ${кл.ch}:${кл.from}-${кл.to}`}>
                    {КЛАСС[кл.class] ?? кл.class}
                    {слой2() && кл.why ? ` — ${кл.why}` : ''}
                  </p>
                )}
                <span class="стих" id={`st${x.c}.${x.v}`}>
                  <span class="стих__номер не-копировать">
                    {x.v}
                    {' '}
                  </span>
                  <ТекстСтиха view={x.view} />{' '}
                </span>
              </>
            );
          })}
        </div>
      )}
      <nav class="соседние-главы ссылки-внизу" aria-label="Соседние главы">
        {пред && (
          <a href={пред.book === book ? href({ screen: 'glava', book, ch: пред.ch, params: {} }) : href({ screen: 'kniga', book: пред.book, params: {} })} rel="prev">
            {пред.book === book ? 'Предыдущая глава' : `Предыдущая книга: ${имяКниги(пред.book)}`}
          </a>
        )}
        {след && (
          <a href={href({ screen: 'glava', book: след.book, ch: след.ch, params: {} })} rel="next">
            {след.book === book ? 'Следующая глава' : `${имяКниги(след.book)}, глава 1`}
          </a>
        )}
      </nav>
    </div>
  );
}
