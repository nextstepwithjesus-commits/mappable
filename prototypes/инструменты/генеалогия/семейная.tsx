/**
 * Двойник «Семьи» — семейная страница (03 § 6.5, § 7.5) и листы рёбер (03 § 21). Простой HTML: заголовки, таблица, списки;
 * имена — ссылки на «Семью» лица (переход уровня 1); у каждого ребра — стихи, уровень словом, «по словам», номер записи и
 * «Копировать источник». Серый макет: облик не проверяется.
 */
import { useEffect, useRef } from 'preact/hooks';
import { Г, Л } from './данные.ts';
import { Граф, type Выбор, type Ребро } from './граф.ts';
import { словоСоюза } from './лес.ts';
import { источникРебра } from './отчёты.ts';
import { href, маршрут, сВидом, идти } from '../общее/приложение.ts';
import { вБуфер, открыто } from '../общее/службы.ts';
import { стихи, показ } from '../общее/данные.ts';
import { прочтенияВАдрес } from './семья.ts';

const ссылка = (i: number) => href({ screen: 'genealogiya', params: { p: Г.лица[i].id } });
export const Имя = ({ i }: { i: number }) => <a href={ссылка(i)}>{Г.полное(i)}</a>;
const уровень = (u: string) => Граф.уровеньСловом(u);

export function адресЛиста(e: Ребро): string {
  return `${location.origin}${href({ screen: 'genealogiya', params: { p: Г.лица[e.реб].id, edge: e.номер } })}`;
}

function Стихи({ refs }: { refs: string[] }) {
  return <span class="т-адрес">{refs.join('; ')}</span>;
}

/** Строка ребра: кто кому, слово текста, стихи, уровень, «по словам», копирование источника. */
export function СтрокаРебра({ e }: { e: Ребро }) {
  const кто = e.роль === 'f' ? 'Отец' : 'Мать';
  return (
    <li class="ребро-строка">
      <span>{кто}: <Имя i={e.род} />; ребёнок: <Имя i={e.реб} />. </span>
      {e.слова?.[0] && <span>«{e.слова[0].t}» ({e.слова[0].r}). </span>}
      <span>Стихи: <Стихи refs={e.стихи} />. Уровень: {уровень(e.уровень)}{e.поСловам ? `; ${e.поСловам.l} (${e.поСловам.r})` : ''}{e.тождество ? `; тождество: ${e.тождество.d === 'weighty' ? 'весомо' : e.тождество.d}` : ''}. </span>
      <span class="т-адрес">Запись {e.номер}. </span>
      <button class="кн" type="button" onClick={() => void вБуфер(источникРебра(Г, e, адресЛиста(e)), null, 'источник ребра')}>
        Копировать источник
      </button>
    </li>
  );
}

/** Лист ребра (уровень 2): `edge=o-…`, `edge=up:<лицо>` (рёбра к родителям), `edge=down:<лицо>` (к детям). */
export function Лист({ edge }: { edge: string }) {
  const h = useRef<HTMLHeadingElement>(null);
  const закрыть = () => сВидом({ edge: undefined });
  useEffect(() => {
    h.current?.focus();
    return открыто(закрыть, document.getElementById('схема-окно')?.querySelector<HTMLElement>('[tabindex="0"]') ?? null);
  }, [edge]);
  let заголовок = '';
  let рёбра: Ребро[] = [];
  if (edge.startsWith('up:') || edge.startsWith('down:')) {
    const [вид, id] = edge.split(':');
    const i = Г.ид(id);
    if (i >= 0) {
      рёбра = (вид === 'up' ? Г.вверх[i] : Г.вниз[i]).map((x) => Г.рёбра[x]);
      заголовок = `${вид === 'up' ? 'Рёбра к родителям' : 'Рёбра к детям'}: ${Г.полное(i)}`;
    }
  } else {
    const e = Г.рёбра.find((x) => x.номер === edge);
    if (e) { рёбра = [e]; заголовок = `Лист ребра: ${Г.имя(e.род)} — ${Г.имя(e.реб)}`; }
  }
  return (
    <aside class="лист-ребра" aria-labelledby="лист-заголовок">
      <h2 id="лист-заголовок" tabIndex={-1} ref={h}>{заголовок || 'Ребро не найдено'}</h2>
      {рёбра.length ? <ul class="ребро-список">{рёбра.map((e) => <СтрокаРебра e={e} />)}</ul> : <p>В этих стихах рёбер нет.</p>}
      {рёбра.length === 1 && <ТекстСтихов refs={рёбра[0].стихи.slice(0, 4)} />}
      <button class="кн" type="button" onClick={закрыть}>Закрыть лист</button>
    </aside>
  );
}

function ТекстСтихов({ refs }: { refs: string[] }) {
  const xs = refs.flatMap((r) => стихи(r).slice(0, 3).map((s) => ({ r, s })));
  if (!xs.length) return null;
  return (
    <blockquote class="т-цитата">
      {xs.map(({ s }) => <p><span class="т-адрес">{s.id} </span>{показ(s.view.text)}</p>)}
    </blockquote>
  );
}

/** Переключатель набора прочтений (03 § 5): радиокнопки с названиями прочтений; смена — уровень 3, адрес помнит выбор. */
export function Прочтения({ наборы, выбор }: { наборы: string[]; выбор: Выбор }) {
  if (!наборы.length) return null;
  return (
    <>
      {наборы.map((id) => {
        const н = Г.наборы.get(id)!;
        const тек = Г.прочтение(выбор, id);
        return (
          <fieldset class="прочтения">
            <legend>{н.название}</legend>
            {н.прочтения.map((п) => (
              <label class="прочтения__пункт">
                <input
                  type="radio"
                  name={`прочтение-${id}`}
                  checked={п.id === тек}
                  onChange={() => {
                    const next = { ...выбор, [id]: п.id };
                    if (п.id === н.поУмолчанию) delete next[id];
                    сВидом({ read: прочтенияВАдрес(next) || undefined }, `прочтение: ${п.название}`);
                  }}
                />
                <span>
                  {п.название}
                  {п.уровень === 'interpretation' && ' — толкование'}
                  {п.авторы.length > 0 && <span class="т-адрес"> Авторы: {п.авторы.join('; ')}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}

/** Наборы прочтений, рёбра которых касаются лица. */
export const наборыЛица = (i: number) => [...new Set([...Г.вверх[i], ...Г.вниз[i]].map((x) => Г.рёбра[x].набор).filter((x): x is string => !!x))];

/** Семейная страница выбранного лица (03 § 6.5): тот же состав, что «Семья» вокруг лица. */
export function СемейнаяСтраница({ i, выбор }: { i: number; выбор: Выбор }) {
  const к = Г.кровь(выбор);
  const отец = к.отец[i] >= 0 ? Г.рёбра[к.отец[i]] : undefined;
  const мать = к.мать[i] >= 0 ? Г.рёбра[к.мать[i]] : undefined;
  const другие = Г.вверх[i].map((x) => Г.рёбра[x]).filter((e) => e !== отец && e !== мать);
  const союзы = Г.союзыЛица[i].map((u) => Г.союзы[u]);
  const дети = Г.детиКрови(i, выбор);
  const ищиМать = (c: number) => {
    const m = Г.мать(c, выбор);
    if (m < 0 || m === i) return 'мать не названа';
    const un = союзы.find((u) => u.жена === m);
    return `${Г.полное(m)}${un ? `, ${словоСоюза(un.виды)}` : ''}`;
  };
  const братья = Г.братья(i, выбор);
  const изСыновей = Г.вниз[i].map((x) => Г.рёбра[x]).filter((e) => e.вид === 'ancestor');
  const путь: number[] = [];
  for (let x = i; x >= 0 && путь.length < 200; x = Л.родитель[x]) путь.unshift(x);
  const наборы = наборыЛица(i);
  const кн = Г.кандидаты.filter((c) => c.c === Г.лица[i].id);
  return (
    <section class="семейная" aria-labelledby="семейная-заголовок">
      <h2 id="семейная-заголовок">Семейная страница: {Г.полное(i)}</h2>
      <p>Порядок детей — как в тексте, не по рождению. Где мать не названа, сказано в строке. Ряд схемы — не число поколений.</p>
      <h3>Родители</h3>
      <ul>
        {отец ? <СтрокаРебра e={отец} /> : <li>Отец: в этих стихах не назван.</li>}
        {мать ? <СтрокаРебра e={мать} /> : <li>Мать: в этих стихах не названа.</li>}
      </ul>
      <h3>Союзы и дети</h3>
      {союзы.length > 0 && (
        <ul>
          {союзы.map((u) => (
            <li>
              {u.муж === i ? 'Жена' : 'Муж'}: <Имя i={u.муж === i ? u.жена : u.муж} /> — {словоСоюза(u.виды)}. Стихи: <Стихи refs={u.слова.flatMap((t) => t.r)} />.{' '}
              {u.слова.filter((t) => t.nm).map((t) => <span>Без брака — {уровень(t.nm!.ce)}: <Стихи refs={t.nm!.r} />. </span>)}
              <span class="т-адрес">Запись {u.номер}.</span>
            </li>
          ))}
        </ul>
      )}
      {дети.length > 0 ? (
        <table class="таблица">
          <caption>Дети: {дети.length}. Порядок — как в тексте, не по рождению</caption>
          <thead>
            <tr><th scope="col">Имя</th><th scope="col">Мать</th><th scope="col">Стих</th><th scope="col" class="кол-доп">Уровень</th><th scope="col" class="кол-доп">Своя семья</th></tr>
          </thead>
          <tbody>
            {дети.map((e) => (
              <tr>
                <th scope="row"><Имя i={e.реб} /></th>
                <td>{e.роль === 'm' ? Г.полное(i) : ищиМать(e.реб)}</td>
                <td><Стихи refs={e.стихи} /></td>
                <td class="кол-доп">{уровень(e.уровень)}{e.поСловам ? `; ${e.поСловам.l}` : ''}</td>
                <td class="кол-доп">детей: {Г.детиКрови(e.реб, выбор).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>Детей в этих стихах не названо.</p>}
      {братья.length > 0 && (
        <>
          <h3>Братья и сёстры</h3>
          <ul>{братья.map((b) => <li><Имя i={b} /></li>)}</ul>
        </>
      )}
      {изСыновей.length > 0 && (
        <>
          <h3>Из сыновей: {Г.полное(i)} — {изСыновей.length}</h3>
          <ul>{изСыновей.map((e) => <li><Имя i={e.реб} /> — <Стихи refs={e.стихи} /></li>)}</ul>
        </>
      )}
      {(другие.length > 0 || кн.length > 0 || наборы.length > 0) && (
        <>
          <h3>Отсылы и другие места текста</h3>
          <ul>
            {другие.map((e) => <СтрокаРебра e={e} />)}
            {кн.map((c) => <li>{c.idt?.n ?? 'Родитель не ясен'} ({c.rf.join('; ')}). Тождество «предположительно»: на схеме не рисуется.</li>)}
          </ul>
          <Прочтения наборы={наборы} выбор={выбор} />
        </>
      )}
      <nav aria-label="Где я" class="где-я">
        <h3>Где я</h3>
        <ol>
          {путь.map((x) => (
            <li>{x === i ? <span aria-current="page">{Г.полное(x)}</span> : <Имя i={x} />}</li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

/** Перейти к «Семье» лица (уровень 1). */
export const кЛицу = (i: number) => идти({ screen: 'genealogiya', params: { p: Г.лица[i].id, ...(маршрут.value.params.read && { read: маршрут.value.params.read }) } });
