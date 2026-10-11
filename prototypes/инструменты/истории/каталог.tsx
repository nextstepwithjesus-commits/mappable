/**
 * Страница книги — каталог списком (11 § 3.2; 08 § 7.27, режим «переход»): одна строка — одна история; строка — одна ссылка
 * (№, название, вид не-события, пометка трудного, адрес) и кнопка «Подробнее» вне её; группы повествований; порядок и
 * фильтры строкой в обоих слоях; «Список / Таблица» — настройка уровня 5; «Упоминается здесь (N)»; оглавление книги слева
 * (в DOM — после списка). Книга размечена частично — строка «Пока здесь истории только из глав …» (11 § 3.8).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Д, загружено, глав, загрузитьКнигу, имя, статус } from '../общее/данные.ts';
import { адрес, адресПолно, имяКниги, завет, книгаСсылки, полноеИмя } from '../общее/адреса.ts';
import { слой2, детям } from '../общее/настройки.ts';
import { объявить, открыто, число } from '../общее/службы.ts';
import { маршрут, href, сВидом } from '../общее/приложение.ts';
import { bookSlug } from '../общее/маршруты.ts';
import { Значок, ЗнакВида } from '../общее/знаки.tsx';
import { КнНазад, Хлебные, ПереключательСлоя, Эскиз } from '../общее/компоненты.tsx';
import { книгаИм, строкиКниги, группы, видСловом, знакВида, строкаТрудного, трудноеКратко, частоВспоминается, размеченныеГлавы, главыСловами, лица, имяЛица, type Строка } from './модель.ts';
import { BOOKS, BOOK_BY_CODE } from '../../../core/books.ts';
import { эпохиСсылки } from '../время/образ.tsx';

const ИСТОРИИ: [string, string, string] = ['история', 'истории', 'историй'];
/** «Список / Таблица» — настройка уровня 5: не в адресе (08 § 6.5). */
export const видСписка = signal<'список' | 'таблица'>('список');
const ПОРЯДОК: Record<string, string> = { bib: 'по порядку Библии', name: 'по названию', men: 'по числу упоминаний', parts: 'по числу частей' };

interface Фильтр { vid: Set<string>; litso: Set<string>; trud: boolean; chasto: boolean }
function разобратьФ(f?: string): Фильтр {
  const out: Фильтр = { vid: new Set(), litso: new Set(), trud: false, chasto: false };
  for (const x of (f ?? '').split(';').filter(Boolean)) {
    const [k, v = ''] = x.split(':');
    if (k === 'vid') v.split(',').filter(Boolean).forEach((y) => out.vid.add(y));
    if (k === 'litso') v.split(',').filter(Boolean).forEach((y) => out.litso.add(y));
    if (k === 'trud') out.trud = true;
    if (k === 'chasto') out.chasto = true;
  }
  return out;
}
function собратьФ(f: Фильтр): string | undefined {
  const xs: string[] = [];
  if (f.vid.size) xs.push(`vid:${[...f.vid].join(',')}`);
  if (f.litso.size) xs.push(`litso:${[...f.litso].join(',')}`);
  if (f.trud) xs.push('trud');
  if (f.chasto) xs.push('chasto');
  return xs.length ? xs.join(';') : undefined;
}
const присутствует = (x: Строка, id: string) => x.s.actors.some((a) => a.actor === id && a.roles.some((r) => r.role !== 'mentioned'));
function подходит(x: Строка, f: Фильтр): boolean {
  if (f.vid.size && !f.vid.has(x.s.kind)) return false;
  if (f.litso.size && ![...f.litso].some((id) => присутствует(x, id))) return false;
  if (f.trud && !x.s.hard?.length) return false;
  if (f.chasto && !частоВспоминается(x.s)) return false;
  return true;
}
const упоминаний = (x: Строка) => x.s.links.filter((l) => !l.sameBook).length;

export function Каталог({ book }: { book: string }) {
  void загружено.value;
  const r = маршрут.value;
  const b = BOOK_BY_CODE.get(book)!;
  useEffect(() => {
    void загрузитьКнигу(book);
  }, [book]);
  const все = строкиКниги(book);
  const f = разобратьФ(r.params.f);
  const порядок = r.params.sort && ПОРЯДОК[r.params.sort] ? r.params.sort : 'bib';
  let xs = все.filter((x) => подходит(x, f));
  if (порядок === 'name') xs = [...xs].sort((a, c) => a.s.title.short.localeCompare(c.s.title.short, 'ru'));
  if (порядок === 'men') xs = [...xs].sort((a, c) => упоминаний(c) - упоминаний(a) || a.n - c.n);
  if (порядок === 'parts') xs = [...xs].sort((a, c) => (c.s.parts?.length ?? 0) - (a.s.parts?.length ?? 0) || a.n - c.n);
  const главы = размеченныеГлавы(book);
  const упом = упоминанияКниги(book);
  const путь = [{ имя: завет(book) === 'nt' ? 'Новый Завет' : 'Ветхий Завет' }, { имя: полноеИмя(b.code) }];
  const [книгиОткр, setКниги] = useState(false);
  const [главыОткр, setГлавы] = useState(false);
  const таблица = видСписка.value === 'таблица';
  const сменить = (patch: Record<string, string | undefined>, что: string) => {
    сВидом(patch, что);
    setTimeout(() => объявить(что), 500); // число результатов — через 500 мс (доступн. Р3-13)
  };
  return (
    <div class="каталог" data-zavet={завет(book) === 'nt' ? 'НЗ' : 'ВЗ'}>
      <div class="каталог__список">
        <nav class="пропуски" aria-label="Переходы">
          <a class="скрыто-пропуск" href="#список">
            Перейти к списку
          </a>
          <a class="скрыто-пропуск" href="#оглавление-книги">
            К оглавлению книги
          </a>
        </nav>
        <div class="полоса-шапки">
          <div class="полоса-шапки__лево">
            <КнНазад />
            <Хлебные путь={путь} />
          </div>
          <div class="ряд-действий">
            {упом.length > 0 && (
              <a class="кн кн--текст" href="#упоминается">
                Упоминается здесь ({упом.length})
              </a>
            )}
            <button class="кн" type="button" aria-haspopup="dialog" onClick={() => setКниги(true)} id="кн-книги">
              <Значок имя="списком" />
              Книги
            </button>
          </div>
        </div>
        <div class="заголовок-книги">
          <h1 class="т-h1" id="h1" tabIndex={-1}>
            {полноеИмя(b.code)}
          </h1>
          <p class="т-адрес заголовок-книги__число">
            {число(все.length, ИСТОРИИ)}
            {главы.length > 0 && главы.length < (глав(book) || 999) ? ` из глав ${главыСловами(главы)}` : ''}
            <span class="без-пометки">; без пометки — событие</span>
          </p>
          <button class="кн кн--текст другая-книга" type="button" aria-haspopup="dialog" onClick={() => setГлавы(true)}>
            <Значок имя="списком" />
            Главы
          </button>
            {главы.length > 0 && главы.length < (глав(book) || 999) && (
          <p class="голос-мы неполно">
            {слой2() ? `Размечены главы ${главыСловами(главы)} из ${глав(book) || '…'}` : `Пока здесь истории только из глав ${главыСловами(главы)}`}
            {все.length === 0 ? ', и рассказов о событиях в них нет.' : '.'}
          </p>
        )}
          <span class="заголовок-книги__слой">
            <ПереключательСлоя объявление={(v) => (v ? 'Показаны столбцы частей и упоминаний' : 'Столбцы для изучающих скрыты')} />
          </span>
        </div>
        {слой2() && все.length > 0 && (
          <p class="т-адрес">
            историй с рассказом в этой книге: {все.length}; из них ещё и в других книгах: {все.filter((x) => x.s.accounts.length > 1).length}; упоминаний других историй: {упом.length}. Одна история, рассказанная в двух книгах, считается в обеих
          </p>
        )}
        {все.length > 0 && <СтрокаДействий всего={все.length} показано={xs.length} f={f} порядок={порядок} сменить={сменить} строки={все} />}
        <h2 class="скрыто">Рассказано здесь</h2>
        <div id="список" tabIndex={-1}>
          {все.length === 0 ? (
            главы.length ? (
              <p class="т-проза">
                В этой книге мы не нашли рассказов о событиях. <span class="голос-мы">Как искали — опись полноты ещё составляется.</span>
              </p>
            ) : (
              <p class="т-проза">Истории этой книги мы ещё не составили. Главы книги — в оглавлении.</p>
            )
          ) : xs.length === 0 ? (
            <p class="т-проза ч2" role="status">
              Таких историй в этой книге нет.{' '}
              <button class="кн кн--текст" type="button" onClick={() => сменить({ f: undefined }, 'Фильтры сброшены')}>
                Снять фильтры
              </button>
            </p>
          ) : таблица ? (
            <Таблица xs={xs} книга={book} />
          ) : порядок !== 'bib' ? (
            <>
              <p class="т-адрес">Группы скрыты: порядок {ПОРЯДОК[порядок]}</p>
              <ul class="список" aria-label="Истории">
                {xs.map((x) => (
                  <СтрокаИстории x={x} книга={book} />
                ))}
              </ul>
            </>
          ) : (
            группы(xs).map((g) =>
              g.id ? (
                <section class="группа" aria-labelledby={`г-${g.id}`}>
                  <h3 class="группа-заголовок т-повествование" id={`г-${g.id}`}>
                    {g.имя} <span class="группа-число">— {число(g.строки.length, ИСТОРИИ)}</span>
                  </h3>
                  <ul class="список">
                    {g.строки.map((x) => (
                      <СтрокаИстории x={x} книга={book} />
                    ))}
                  </ul>
                </section>
              ) : (
                <ul class="список" aria-label="Истории">
                  {g.строки.map((x) => (
                    <СтрокаИстории x={x} книга={book} />
                  ))}
                </ul>
              ),
            )
          )}
        </div>
        {упом.length > 0 && <Упоминается книга={book} />}
        <p class="т-адрес эскиз-подпись">
          Истории идут в порядке книги. Когда это было — <a href={href({ screen: 'vremya', params: { view: 'events', e: эпохиСсылки(все[0]?.ref ?? '')[0]?.id ?? '', kniga: bookSlug(book) } })}>на ленте времени</a>.
        </p>
      </div>
      <Оглавление книга={book} строки={все} />
      {книгиОткр && <ЛистКниг текущая={book} закрыть={() => setКниги(false)} />}
      {главыОткр && <ЛистГлав книга={book} строки={все} закрыть={() => setГлавы(false)} другая={() => { setГлавы(false); setКниги(true); }} />}
    </div>
  );
}

function СтрокаДействий({ всего, показано, f, порядок, сменить, строки }: { всего: number; показано: number; f: Фильтр; порядок: string; сменить: (p: Record<string, string | undefined>, что: string) => void; строки: Строка[] }) {
  const [ф, setФ] = useState(false);
  const [п, setП] = useState(false);
  const кнФ = useRef<HTMLButtonElement>(null);
  const кнП = useRef<HTMLButtonElement>(null);
  useEffect(() => (ф ? открыто(() => setФ(false), кнФ.current) : undefined), [ф]);
  useEffect(() => (п ? открыто(() => setП(false), кнП.current) : undefined), [п]);
  const видов = new Map<string, number>();
  строки.forEach((x) => видов.set(x.s.kind, (видов.get(x.s.kind) ?? 0) + 1));
  const лицаКниги = new Map<string, { n: number; имя: string }>();
  for (const x of строки) for (const a of лица(x.s).люди) if (a.actor.startsWith('p-')) {
    const v = лицаКниги.get(a.actor) ?? { n: 0, имя: имяЛица(a) };
    v.n++;
    лицаКниги.set(a.actor, v);
  }
  const [найти, setНайти] = useState('');
  const лицаСписок = [...лицаКниги].sort((a, b) => b[1].n - a[1].n || a[1].имя.localeCompare(b[1].имя, 'ru')).filter(([, v]) => !найти || v.имя.toLowerCase().includes(найти.toLowerCase()));
  const ф2 = (patch: Partial<Фильтр>, что: string) => {
    const n: Фильтр = { vid: new Set(f.vid), litso: new Set(f.litso), trud: f.trud, chasto: f.chasto, ...patch };
    сменить({ f: собратьФ(n) }, что);
  };
  const toggle = (set: Set<string>, v: string) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };
  const включено = [...[...f.vid].map((v) => ({ т: `Вид: ${видСловом(v)}`, снять: () => ф2({ vid: toggle(f.vid, v) }, 'Фильтр снят') })), ...[...f.litso].map((id) => ({ т: `Лицо: ${имя(id)}`, снять: () => ф2({ litso: toggle(f.litso, id) }, 'Фильтр снят') })), ...(f.trud ? [{ т: 'Трудные истории', снять: () => ф2({ trud: false }, 'Фильтр снят') }] : []), ...(f.chasto ? [{ т: 'Часто вспоминается', снять: () => ф2({ chasto: false }, 'Фильтр снят') }] : [])];
  const порядки = Object.entries(ПОРЯДОК).filter(([k]) => слой2() || k === 'bib' || k === 'name');
  return (
    <div class="строка-действий">
      <p class="строка-действий__число">
        {показано === всего ? число(всего, ИСТОРИИ) : `Показано ${показано} из ${число(всего, ИСТОРИИ)}`}
        <span class="хвост">, {ПОРЯДОК[порядок]}; без пометки — событие</span>
      </p>
      <div class="меню-обёртка">
        <button ref={кнП} class="кн" type="button" aria-expanded={п} aria-controls="лист-порядок" onClick={() => setП(!п)}>
          <Значок имя="сортировка" />
          <span>Порядок</span>
        </button>
        <div class="меню фасеты" id="лист-порядок" hidden={!п}>
          <fieldset class="радио">
            <legend>Порядок</legend>
            {порядки.map(([k, v]) => (
              <label>
                <input type="radio" name="порядок" value={k} checked={порядок === k} onChange={() => сменить({ sort: k === 'bib' ? undefined : k }, `Порядок: ${v}`)} /> {v[0].toUpperCase() + v.slice(1)}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
      <div class="меню-обёртка">
        <button ref={кнФ} class="кн" type="button" aria-expanded={ф} aria-controls="фасеты" id="кн-фильтры" onClick={() => setФ(!ф)}>
          <Значок имя="фильтры" />
          <span>Фильтры</span>
          {включено.length > 0 && <span> ({включено.length})</span>}
        </button>
        <div class="меню фасеты" id="фасеты" hidden={!ф}>
          <fieldset class="радио">
            <legend>Вид</legend>
            {[...видов].map(([k, n]) => (
              <label>
                <input type="checkbox" checked={f.vid.has(k)} onChange={() => ф2({ vid: toggle(f.vid, k) }, `Вид: ${видСловом(k)}`)} /> {видСловом(k)[0].toUpperCase() + видСловом(k).slice(1)} — <span class="цифры">{n}</span>
              </label>
            ))}
          </fieldset>
          <fieldset class="радио фасет-лица">
            <legend>Лицо</legend>
            <label class="найти-в-списке">
              Найти в списке{' '}
              <input type="search" value={найти} onInput={(e) => setНайти(e.currentTarget.value)} />
            </label>
            <div class="фасет-лица__список">
              {лицаСписок.slice(0, 40).map(([id, v]) => (
                <label>
                  <input type="checkbox" checked={f.litso.has(id)} onChange={() => ф2({ litso: toggle(f.litso, id) }, `Лицо: ${v.имя}`)} /> {v.имя} — <span class="цифры">{v.n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="радио">
            <legend>Ещё</legend>
            <label>
              <input type="checkbox" checked={f.trud} onChange={() => ф2({ trud: !f.trud }, 'Трудные истории')} /> Трудные истории — <span class="цифры">{строки.filter((x) => x.s.hard?.length).length}</span>
            </label>
            <label>
              <input type="checkbox" checked={f.chasto} onChange={() => ф2({ chasto: !f.chasto }, 'Часто вспоминается в Библии')} /> Часто вспоминается в Библии — <span class="цифры">{строки.filter((x) => частоВспоминается(x.s)).length}</span>
            </label>
          </fieldset>
        </div>
      </div>
      <span class="ряд-кнопок сегменты" role="group" aria-label="Вид списка">
        <button class="кн" type="button" aria-pressed={видСписка.value === 'список'} onClick={() => { видСписка.value = 'список'; объявить('Вид: список'); }}>
          <Значок имя="списком" />
          <span>Список</span>
        </button>
        <button class="кн" type="button" aria-pressed={видСписка.value === 'таблица'} onClick={() => { видСписка.value = 'таблица'; объявить('Вид: таблица'); }}>
          <Значок имя="таблица" />
          <span>Таблица</span>
        </button>
      </span>
      <span class="фильтры-вкл">
        {включено.map((x) => (
          <span class="фильтр-вкл">
            {x.т}.{' '}
            <button
              class="кн кн--текст"
              type="button"
              onClick={() => {
                x.снять();
                document.getElementById('кн-фильтры')?.focus();
              }}
            >
              Снять<span class="скрыто"> фильтр: {x.т}</span>
            </button>
          </span>
        ))}
      </span>
    </div>
  );
}

function hrefИстории(x: Строка, книга: string) {
  const own = книгаСсылки(x.s.accounts[0]?.refs[0] ?? '');
  return href({ screen: 'istoriya', id: x.s.id, params: own === книга ? {} : { rasskaz: bookSlug(книга) } });
}

function СтрокаИстории({ x, книга }: { x: Строка; книга: string }) {
  const r = маршрут.value;
  const открыта = r.params.open === String(x.n);
  const т = строкаТрудного(x.s);
  const метка = частоВспоминается(x.s);
  const id = `р-${x.n}`;
  const вид = x.s.kind === 'event' ? null : видСловом(x.s.kind);
  const тр = т ? трудноеКратко(x.s) : '';
  return (
    <li class={`строка${слой2() ? ' строка--второй' : ''}`} data-key={`story:${x.s.id}`} data-status={статус(`story:${x.s.id}`)}>
      <div class="строка__верх">
        <div class="строка__зона">
          <span class="строка__номер" aria-hidden="true">
            {x.n}
          </span>
          <span class="строка__название">
            <a class="строка__ссылка" href={hrefИстории(x, книга)} id={`история-${x.s.id}`} aria-label={`${x.s.title.short}. история ${x.n}${вид ? `, ${вид}` : ''}${т ? `. ${т}` : ''}${метка ? '. Часто вспоминается в Библии' : ''}`}>
              {x.s.title.short}
            </a>
            {метка > 0 && (
              <span class="строка__метка" aria-hidden="true">
                {слой2() ? `вспоминают ${число(метка, ['книга', 'книги', 'книг'])}` : 'часто вспоминается в Библии'}
              </span>
            )}
            {тр && (
              <span class="строка__трудное" aria-hidden="true">
                {тр}
              </span>
            )}
          </span>
          <span class="строка__вид" aria-hidden="true">
            {вид && (
              <span class="вид">
                <ЗнакВида вид={знакВида(x.s.kind)} />
                {вид}
              </span>
            )}
            <span class="адрес-в-ярусе">{адрес(x.ref)}</span>
            {метка > 0 && <span class="строка__метка">часто вспоминается</span>}
            {тр && <span class="строка__трудное">{тр}</span>}
          </span>
          <span class="строка__адрес" aria-hidden="true">
            {адрес(x.ref)}
          </span>
          {слой2() && (
            <>
              <span class="строка__число т-адрес">
                <span aria-hidden="true">{x.s.parts?.length || '—'}</span>
              </span>
              <span class="строка__число т-адрес">
                <span aria-hidden="true">{упоминаний(x) || '—'}</span>
              </span>
            </>
          )}
        </div>
        <button class="строка__подробнее" type="button" aria-expanded={открыта} aria-controls={`${id}-подр`} aria-label={`Кратко: ${x.s.title.short}`} onClick={() => сВидом({ open: открыта ? undefined : String(x.n) }, 'раскрыть строку')}>
          <Значок имя="раскрыть" />
        </button>
      </div>
      <div class="строка__раскрытие" id={`${id}-подр`} hidden={!открыта}>
        {открыта && <Раскрытие x={x} книга={книга} />}
      </div>
    </li>
  );
}

function Раскрытие({ x, книга }: { x: Строка; книга: string }) {
  const т = строкаТрудного(x.s);
  const к = x.s.summary ?? [];
  const Л = лица(x.s);
  const метка = частоВспоминается(x.s);
  const другие = [...new Set(x.s.accounts.map((a) => книгаСсылки(a.refs[0])))].filter((b) => b !== книга);
  return (
    <>
      {т && <p class="тихая-строка">{т}</p>}
      {к.length ? (
        <p class="т-проза">
          <span class="подпись-голоса">Коротко, нашими словами: </span>
          {к.map((s) => s.text).join(' ')} <span class="т-адрес">по стихам {адрес(к.flatMap((s) => s.refs))}</span>
        </p>
      ) : (
        <p class="голос-мы">Коротко, нашими словами: этот раздел мы ещё не написали.</p>
      )}
      <dl class="т-интерфейс">
        {x.s.parts?.length ? (
          <>
            <dt>Части</dt>
            <dd>
              <ol>
                {x.s.parts.map((p) => (
                  <li>
                    {p.n}. {p.title.short} <span class="т-адрес">{адрес(p.refs)}</span>
                  </li>
                ))}
              </ol>
            </dd>
          </>
        ) : null}
        {Л.люди.length > 0 && (
          <>
            <dt>Кто</dt>
            <dd>{Л.люди.slice(0, 8).map(имяЛица).join(', ')}</dd>
          </>
        )}
        {x.s.places.length > 0 && (
          <>
            <dt>Где</dt>
            <dd>{[...new Set(x.s.places.map((p) => p.label))].join(', ')}</dd>
          </>
        )}
        {другие.length > 0 && (
          <>
            <dt>Также в книгах</dt>
            <dd>{другие.map((b) => полноеИмя(b)).join(', ')}</dd>
          </>
        )}
        {метка > 0 && (
          <>
            <dt>Вспоминают</dt>
            <dd>Об этой истории вспоминают ещё {число(метка, ['книга', 'книги', 'книг'])} Библии</dd>
          </>
        )}
      </dl>
      {детям() && x.s.hard?.length ? <p class="тихая-строка">Если читаете с ребёнком: прочтите историю сначала сами.</p> : null}
      <p>
        <a class="ссылка-ряд" href={hrefИстории(x, книга)}>
          Открыть историю: {x.s.title.short}
        </a>
      </p>
    </>
  );
}

function Таблица({ xs, книга }: { xs: Строка[]; книга: string }) {
  return (
    <div class="таблица-обёртка" role="region" aria-labelledby="табл-подпись" tabIndex={0}>
      <table class="таблица таблица--полосы таблица--каталог">
        <caption id="табл-подпись" class={слой2() ? 'т-адрес' : 'скрыто'}>
          {имяКниги(книга)}: {число(xs.length, ИСТОРИИ)}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="число">
              №
            </th>
            <th scope="col">Название</th>
            <th scope="col">Вид</th>
            <th scope="col">Адрес</th>
            {слой2() && (
              <>
                <th scope="col">Рассказы</th>
                <th scope="col" class="число">
                  Частей
                </th>
                <th scope="col" class="число">
                  Упоминаний
                </th>
                <th scope="col">Трудная</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {xs.map((x) => (
            <tr data-key={`story:${x.s.id}`}>
              <td class="число цифры">{x.n}</td>
              <th scope="row">
                <a href={hrefИстории(x, книга)}>{x.s.title.short}</a>
              </th>
              <td>
                <span class="вид">
                  <ЗнакВида вид={знакВида(x.s.kind)} />
                  {видСловом(x.s.kind)}
                </span>
              </td>
              <td class="цифры">
                <span aria-hidden="true">{адрес(x.ref)}</span>
                <span class="скрыто">{адресПолно(x.ref)}</span>
              </td>
              {слой2() && (
                <>
                  <td>{адрес(x.s.accounts.flatMap((a) => a.refs))}</td>
                  <td class="число">{x.s.parts?.length || '—'}</td>
                  <td class="число">{упоминаний(x) || '—'}</td>
                  <td>{x.s.hard?.map((h) => h.topic).join(', ') || '—'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const упоминанияКниги = (книга: string) =>
  (Д.proto.mentions[книга] ?? []).filter((m) => !Д.stories.get(m.id)?.accounts.some((a) => книгаСсылки(a.refs[0] ?? '') === книга));
function Упоминается({ книга }: { книга: string }) {
  // упоминание из книги, которая сама рассказывает историю (Мк 8:19 — Мк 6:30–44), — не «Упоминается здесь»: история уже
  // в каталоге этой книги (библеист № 3; архитектура № 7)
  const xs = упоминанияКниги(книга);
  const вид: Record<string, string> = { mention: 'упоминание', retelling: 'пересказ', allusion: 'намёк' };
  return (
    <section class="упоминается" aria-labelledby="упоминается">
      <h2 class="т-h2" id="упоминается" tabIndex={-1}>
        Упоминается здесь ({xs.length})
      </h2>
      <ul class="список">
        {xs
          .filter((m) => слой2() || m.kind !== 'possibly-same')
          .map((m) => {
            const s = Д.stories.get(m.id);
            if (!s) return null;
            const b = книгаСсылки(s.accounts[0]?.refs[0] ?? '');
            const нач = /^([1-4]?[А-Яа-яЁё]+)\s+(\d+):(\d+)/.exec(m.ref);
            const ot = нач ? `${bookSlug(нач[1])}${нач[2]}.${нач[3]}` : undefined;
            return (
              <li class="строка" data-key={`story:${s.id}`}>
                <div class="строка__верх">
                  <div class="строка__зона">
                    <span class="строка__номер" aria-hidden="true" />
                    <span class="строка__название">
                      <a class="строка__ссылка" href={href({ screen: 'istoriya', id: s.id, params: ot ? { ot } : {} })}>
                        {s.title.short}
                      </a>
                    </span>
                    <span class="строка__вид">
                      {вид[m.kind] ?? m.kind}; рассказ — {книгаИм(b)}
                    </span>
                    <span class="строка__адрес">{адрес(m.ref)}</span>
                  </div>
                </div>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function Оглавление({ книга, строки }: { книга: string; строки: Строка[] }) {
  const n = глав(книга);
  const текущие = new Set(строки.map((x) => +(x.ref.split(' ')[1]?.split(':')[0] ?? 0)));
  const пов = группы(строки).filter((g) => g.id);
  return (
    <nav class="указатель-книг оглавление-книги" id="оглавление-книги" aria-label={`Оглавление книги ${полноеИмя(книга)}`} tabIndex={-1}>
      <h2 class="т-книга указатель-книг__завет">Главы</h2>
      <p class="т-адрес главы-подпись">Подчёркнуты главы, где есть истории.</p>
      {n ? (
        <ul class="главы-сетка">
          {Array.from({ length: n }, (_, i) => i + 1).map((c) => (
            <li>
              <a href={href({ screen: 'glava', book: книга, ch: c, params: {} })} class={текущие.has(c) ? 'глава--есть' : undefined} aria-label={`Глава ${c}`}>
                {c}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p class="голос-мы">Загружаем главы…</p>
      )}
      {пов.length > 0 && (
        <>
          <h2 class="т-книга указатель-книг__завет">Повествования</h2>
          <ul>
            {пов.map((g) => (
              <li class="указатель-книг__книга">
                <a href={`#г-${g.id}`}>{g.имя}</a>
                <span class="цифры">{g.строки.length}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

/** Лист «Книги» (11 § 3.4): все 66 книг сразу; боковой на ноутбуке, нижний на телефоне; модальный диалог. */
export function ЛистКниг({ текущая, закрыть }: { текущая?: string; закрыть: () => void }) {
  const d = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    d.current?.showModal();
    const off = открыто(() => d.current?.close(), opener);
    return () => {
      off();
    };
  }, []);
  const группы_ = [
    ['Ветхий Завет', 'ot'],
    ['Новый Завет', 'nt'],
  ] as const;
  return (
    <dialog class="диалог лист-книг" ref={d} aria-labelledby="лист-книг-з" onClose={закрыть}>
      <div class="лист-книг__верх">
        <h2 class="т-h2" id="лист-книг-з">
          Книги Библии
        </h2>
        <button class="кн" type="button" onClick={() => d.current?.close()}>
          <Значок имя="закрыть" />
          Закрыть
        </button>
      </div>
      <nav aria-label="Книги Библии">
        {группы_.map(([имяЗ, t]) => (
          <>
            <h3 class={`т-книга указатель-книг__завет ч-${t === 'ot' ? 'вз' : 'нз'}`}>{имяЗ}</h3>
            <ul class="лист-книг__сетка">
              {BOOKS.filter((b) => b.t === t).map((b) => {
                const n = Д.proto.catalog[b.code]?.length ?? 0;
                const размечена = Д.proto.storyChapters.some((c) => c.startsWith(`${b.code} `));
                return (
                  <li class={`указатель-книг__книга${b.code === текущая ? ' указатель-книг__книга--тек' : ''}`}>
                    <a href={href({ screen: 'kniga', book: b.code, params: {} })} aria-current={b.code === текущая ? 'page' : undefined} onClick={() => d.current?.close()}>
                      {полноеИмя(b.code)}
                    </a>
                    <span class="цифры">
                      <span aria-hidden="true">{n || '—'}</span>
                      {!n && <span class="скрыто">{размечена ? 'рассказов нет' : 'ещё не составлено'}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ))}
      </nav>
    </dialog>
  );
}

function ЛистГлав({ книга, строки, закрыть, другая }: { книга: string; строки: Строка[]; закрыть: () => void; другая: () => void }) {
  const d = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    d.current?.showModal();
    return открыто(() => d.current?.close(), opener);
  }, []);
  return (
    <dialog class="диалог лист-книг" ref={d} aria-label={`Книга и главы: ${имяКниги(книга)}`} onClose={закрыть}>
      <div class="лист-книг__верх">
        <button class="кн кн--текст" type="button" onClick={другая}>
          Другая книга
        </button>
        <button class="кн" type="button" onClick={() => d.current?.close()}>
          <Значок имя="закрыть" />
          Закрыть
        </button>
      </div>
      <Оглавление книга={книга} строки={строки} />
    </dialog>
  );
}

export { Эскиз };
