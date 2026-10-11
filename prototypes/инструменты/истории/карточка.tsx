import type { ComponentChildren } from 'preact';
/**
 * Карточка лица (07; 08 § 7.28 — блоки с числом, § 5.4 — «нет сведений», § 7.7 — пометки) — сцена 1.7 «Карточка Ноя»:
 * переход со страницы истории и «Назад» на неё. Облик — лист-образец 3.2. Утверждения — из тома карточек пробы, у каждого
 * стихи адрес-кнопками; родители и дети — из рёбер указателя (без падежа: «Отец: Ламех», правило прототипов); истории лица —
 * строками каталога (11 § 4.9). Лицо без карточки (`n-…`) — «Эту карточку мы ещё не составили. Вот что сказано в истории».
 */
import { Д, загружено, том, имя, естьЛицо, статус } from '../общее/данные.ts';
import { адрес } from '../общее/адреса.ts';
import { слой2 } from '../общее/настройки.ts';
import { вБуфер, число } from '../общее/службы.ts';
import { href } from '../общее/приложение.ts';
import { Значок } from '../общее/знаки.tsx';
import { КнНазад, Хлебные, ПереключательСлоя, АдресКн, Блок, Вывод, Меню } from '../общее/компоненты.tsx';
import { лица, имяЛица } from './модель.ts';
import type { CardFact } from '../../../core/types.ts';
import { ОбразЭпох } from '../время/образ.tsx';
import { жизнь, годЭпохи } from '../время/модель.ts';

/** Малый образ Времени в Карточке (Л-д3; 04 § 7.5): эпохи, в которые лицо жило по расчёту; ссылка — «Жизни». */
function ОбразВремени({ id }: { id: string }) {
  const ж = жизнь(id);
  if (!ж.bc) return <p class="голос-мы">Время: {ж.нет ?? 'годы жизни мы ещё не посчитали'}.</p>;
  const [от, до] = ж.bc;
  const эп = Д.epochs.filter((e) => (годЭпохи(e, 'end') ?? -99999) >= от && (годЭпохи(e, 'start') ?? 99999) <= до);
  return (
    <a class="малый-образ образ-карточки" href={href({ screen: 'vremya', params: { view: 'lives', p: id } })} id="образ-время-карточки" data-key={`chrono:${id}`}>
      <span class="малый-образ__подпись">{!слой2() && 'Когда он жил? '}Время: {имя(id)}; эпохи — {эп.map((e) => e.short).join(', ')}</span>
      <span class="малый-образ__рисунок образ-без-рамки" aria-hidden="true">
        <ОбразЭпох залитые={эп.map((e) => e.id)} />
      </span>
    </a>
  );
}

const РАЗДЕЛЫ: [number, string][] = [
  [8, 'Рождение'], [9, 'Жена'], [10, 'Дети'], [11, 'Братья и сёстры'], [3, 'Имя'], [5, 'Кто он'], [7, 'Род'], [13, 'Когда жил'],
  [14, 'Кого знал'], [15, 'Где бывал'], [16, 'Что ему поручено'], [17, 'Что было с ним'], [18, 'Что он говорил'], [19, 'Что сказал о нём Бог'],
  [20, 'Смерть'], [21, 'В родословии Иисуса Христа'], [22, 'Что о нём в других книгах Библии'],
];
const МОЛЧАНИЕ: Record<number, string> = { 4: 'Другие имена', 12: 'Другая родня' };

interface V { text?: string; refs?: string[]; ref?: string; id?: string; name?: string; note?: string; title?: string; quote?: string; context?: string; facts?: { text: string; refs: string[] }[] }

export function Карточка({ id }: { id: string }) {
  void загружено.value;
  if (id.startsWith('n-')) return <БезКарточки id={id} />;
  const row = Д.tools.actors.find((a) => `p-${a.id}` === id);
  if (!row || !естьЛицо(id)) return <БезКарточки id={id} />;
  const vol = том(row.v);
  const card = vol?.cards[row.id];
  const n = имя(id);
  const отец = Д.tools.origins.find((o) => `p-${o.c}` === id && o.r === 'f' && o.p);
  const мать = Д.tools.origins.find((o) => `p-${o.c}` === id && o.r === 'm' && o.p);
  const дети = Д.tools.origins.filter((o) => o.p && `p-${o.p}` === id && o.pr);
  const истории = [...Д.stories.values()].filter((s) => s.level === 'story' && s.actors.some((a) => a.actor === id));
  return (
    <div class="карточка" data-key={`actor:${id}`} data-status={статус(`actor:${id}`)}>
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
          <Хлебные путь={[{ имя: 'Главная', href: href({ screen: 'glavnaya', params: {} }) }, { имя: n }]} />
        </div>
        <div class="ряд-действий" role="group" aria-label="Работа с материалом">
          <Меню
            подпись={<><Значок имя="действия" />Ещё<span class="скрыто"> действия: {n}</span></>}
            имя={`Ещё действия: ${n}`}
            пункты={[
              { т: 'Ссылка на это место', зн: 'ссылка', on: () => void вБуфер(location.href, null, 'ссылка на это место') },
              { т: 'Печать', зн: 'печать', on: () => print() },
              { т: 'Копировать номер записи', зн: 'копировать', on: () => void вБуфер(id, null, 'номер записи'), скрыт: !слой2() },
            ]}
          />
          <span class="слой-в-ряду">
            <ПереключательСлоя />
          </span>
        </div>
      </div>
      <div class="карточка-шапка">
        <h1 class="т-h1" id="h1" tabIndex={-1}>
          {n}
        </h1>
        {card && <Вводная n={n} f={card.f} />}
        <p class="коротко т-проза">
          {отец && (
            <>
              <span class="подпись-голоса">Отец: </span>
              <a href={href({ screen: 'kartochka', id: `p-${отец.p}`, params: {} })}>{имя(`p-${отец.p}`)}</a>.{' '}
            </>
          )}
          {мать && (
            <>
              <span class="подпись-голоса">Мать: </span>
              {имя(`p-${мать.p}`)}.{' '}
            </>
          )}
          {дети.length > 0 && (
            <>
              <span class="подпись-голоса">Дети: </span>
              {дети.map((d, i) => (
                <>
                  {i > 0 ? ', ' : ''}
                  <a href={href({ screen: 'kartochka', id: `p-${d.c}`, params: {} })} data-key={`actor:p-${d.c}`}>
                    {имя(`p-${d.c}`)}
                  </a>
                </>
              ))}
              .
            </>
          )}
        </p>
        {слой2() && <p class="т-адрес">Номер записи: {id}</p>}
        <ОбразВремени id={id} />
      </div>
      {!card ? (
        <p class="голос-мы" aria-busy="true">
          Загружаем карточку…
        </p>
      ) : (
        <div class="карточка-блоки">
          {истории.length > 0 && (
            <Блок имя="Истории" n={истории.length} открыт ключ="к-истории">
              <ul class="список">
                {истории.map((s) => (
                  <li class="строка-лица" data-key={`story:${s.id}`}>
                    <a href={href({ screen: 'istoriya', id: s.id, params: {} })} id={`к-ист-${s.id}`}>
                      {s.title.short}
                    </a>{' '}
                    <span class="т-адрес">{адрес(s.accounts.flatMap((a) => a.refs))}</span>
                  </li>
                ))}
              </ul>
            </Блок>
          )}
          {РАЗДЕЛЫ.map(([s, имяР], i) => {
            const xs = card.f.filter((f) => f.s === s);
            if (!xs.length) return null;
            if (xs.length <= 3)
              return (
                <section class="блок блок--раздел">
                  <h2 class="блок__заголовок т-h2">{имяР}</h2>
                  <ul class="факты">
                    {xs.map((f) => (
                      <Факт f={f} />
                    ))}
                  </ul>
                </section>
              );
            return (
              <Блок имя={имяР} n={xs.length} открыт={i === 0} ключ={`р-${s}`}>
                <ul class="факты">
                  {xs.map((f) => (
                    <Факт f={f} />
                  ))}
                </ul>
              </Блок>
            );
          })}
          {(card.nd ?? []).filter((x) => x.k === 'silent' && МОЛЧАНИЕ[x.s]).map((x) => (
            <section class="блок">
              <h2 class="блок__заголовок">
                <span class="блок__молчание">
                  <span class="т-повествование">{МОЛЧАНИЕ[x.s]}:</span> <span class="т-интерфейс">в Библии не сказано</span>
                </span>
              </h2>
            </section>
          ))}
        </div>
      )}
      <p class="т-адрес эскиз-подпись">{Д.proto.banner}: записи карточки — черновик базы без второго ключа. Полная Карточка (07) — пакет 3 прототипов; здесь — сцена перехода из истории.</p>
    </div>
  );
}

/** Вводная фраза Карточки (07; 08 § 3.3.2, ступень 4): имя и первое утверждение раздела «Кто он» со стихами. */
function Вводная({ n, f }: { n: string; f: CardFact[] }) {
  const кто = f.find((x) => x.s === 5);
  const v = кто?.v as V | undefined;
  if (!v?.text) return null;
  return (
    <p class="т-проза вводная">
      {n} — {сЦитатами(v.text[0].toLowerCase() + v.text.slice(1))}. {(v.refs ?? []).map((r) => <АдресКн ссылка={r} />)}
    </p>
  );
}

const сЦитатами = (t: string) =>
  t.split(/(«[^»]+»)/).map((x) =>
    x.startsWith('«') ? (
      <>
        <span class="скрыто не-копировать">Библия: </span>
        <q class="голос-библия-в-строке">{x}</q>
      </>
    ) : (
      x
    ),
  );

function Факт({ f }: { f: CardFact }) {
  const v = f.v as V;
  const key = `fact:a-${f.n}`;
  if ((f.f === 'birth' || f.f === 'death') && v.facts)
    return (
      <>
        {v.facts.map((x) => (
          <li class="факт" data-key={key}>
            <span class="т-проза">{сЦитатами(x.text)}</span>{' '}
            <span class="факт__адреса">
              {x.refs.map((r) => (
                <АдресКн ссылка={r} />
              ))}
            </span>
          </li>
        ))}
      </>
    );
  const refs = v.refs ?? (v.ref ? [v.ref] : []);
  let текст: ComponentChildren;
  if (f.f === 'met' && v.id)
    текст = (
      <>
        <a href={href({ screen: 'kartochka', id: v.id, params: {} })}>{имя(v.id)}</a> — {v.text}
      </>
    );
  else if (f.f === 'places') текст = <>{v.name}{v.note ? <> — {сЦитатами(v.note)}</> : null}</>;
  else if (f.f === 'offices') текст = v.title;
  else if (f.f === 'sayings')
    текст = (
      <>
        <span class={`${слой2() ? 'скрыто' : 'подпись-голоса'} не-копировать`}>Библия: </span>
        <q class="т-цитата голос-библия">«{v.quote}»</q>
      </>
    );
  else текст = сЦитатами(v.text ?? '');
  return (
    <li class="факт" data-key={key}>
      <span class="т-проза">
        {текст}
        {f.c === 'inference' && <> <Вывод cert="inference" /></>}
      </span>{' '}
      <span class="факт__адреса">
        {refs.map((r) => (
          <АдресКн ссылка={r} />
        ))}
      </span>
    </li>
  );
}

/** Лицо истории без карточки (08 § 7.4; 07 § 8.5): «Эту карточку мы ещё не составили. Вот что сказано в истории». */
function БезКарточки({ id }: { id: string }) {
  const key = `new:${id.replace(/^n-/, '')}`;
  const где = [...Д.stories.values()].flatMap((s) => s.actors.filter((a) => a.actor === key).map((a) => ({ s, a })));
  const n = где[0] ? имяЛица(где[0].a) : id;
  return (
    <div class="карточка">
      <div class="полоса-шапки">
        <div class="полоса-шапки__лево">
          <КнНазад />
        </div>
      </div>
      <h1 class="т-h1" id="h1" tabIndex={-1}>
        {n}
      </h1>
      <p class="т-проза">Эту карточку мы ещё не составили. Вот что сказано в {где.length > 1 ? 'историях' : 'истории'}:</p>
      <ul class="факты">
        {где.map(({ s, a }) => (
          <li class="факт">
            <a href={href({ screen: 'istoriya', id: s.id, params: {} })}>{s.title.short}</a>
            {a.roleText && (
              <>
                {': '}
                <span class={`${слой2() ? 'скрыто' : 'подпись-голоса'} не-копировать`}>Библия: </span>
                <q class="т-цитата голос-библия">«{a.roleText.text}»</q> <АдресКн ссылка={a.roleText.refs[0]} />
              </>
            )}
            {!a.roleText && (
              <>
                {' '}
                <span class="т-адрес">{число(a.refs.length, ['стих', 'стиха', 'стихов'])}</span> <АдресКн ссылка={a.refs[0]} />
              </>
            )}
          </li>
        ))}
      </ul>
      {где.length === 0 && <p class="голос-мы">Мы не нашли это лицо в историях пакета.</p>}
      <p class="голос-мы">{лица.length ? '' : ''}</p>
    </div>
  );
}
