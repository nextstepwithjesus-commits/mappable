/**
 * Синопсис истории — «Рассказы рядом» (11 § 4.11.2; 08 § 7.29) и синопсис без сцен для параллельных текстов и сравнения по
 * выбору (11 § 4.11.3–4.11.4). Совпадение — та же форма слова Синодального перевода во всех показанных рассказах сцены
 * (регистр и «ё» не различаются; -аго/-ого, -ыя/-ые сводятся); подряд не меньше двух слов или одно слово не из стоп-списка;
 * слова в скобках не считаются (библ. Р3-5). В клетках нет ссылок и многоточий; строка «Общие слова» — в DOM в обоих слоях.
 * Узкий экран (контейнер уже 37,5 rem) — вид «по сценам»: h3 сцены, под ней рассказы подряд (доступн. Р3-3).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { стихи, загружено, готовы, показ, type Стих } from '../общее/данные.ts';
import { ГОВОРИТ } from './модель.ts';
import { адрес, адресПолно, книгаСсылки } from '../общее/адреса.ts';
import { слой2 } from '../общее/настройки.ts';
import { объявить, вБуфер } from '../общее/службы.ts';
import { Значок } from '../общее/знаки.tsx';
import { BOOK_BY_CODE } from '../../../core/books.ts';

export interface Колонка { ключ: string; подпись: string; полно: string; пересказ?: string }
export interface Сцена {
  id: string;
  имя: string | null;
  клетки: (string | null)[];
  split?: string[];
  moved?: { col: number; after: string }[];
  различия?: { label: string; quotes: { ref: string; text: string }[] }[];
  /** Что писать в пустой клетке столбца: «рассказ молчит» (проверено), «см. сцену …» (подробность в другой сцене) или нет. */
  пусто?: (string | null)[];
}

const STOP = new Set('и в во на не с со к ко а но же ли бы о об обо от до по за из у что как его ее её их он она оно они им ему ей ней нем них нему ним то это так для при же ибо да или ни вот сей сия сие тот та те всё все здесь там чтобы было был была были будет есть тогда когда также ты я мы вы меня мне тебе тебя себе себя свой свои своих'.split(' '));
const нф = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/аго$/, 'ого').replace(/яго$/, 'его').replace(/ыя$/, 'ые').replace(/ия$/, 'ие');
const СЛОВО = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;

/** Слова стиха вне скобок: [начало, конец, нормальная форма]. */
function словаСтиха(s: Стих): [number, number, string][] {
  const t = показ(s.view.text);
  const out: [number, number, string][] = [];
  for (const m of t.matchAll(СЛОВО)) {
    const i = m.index ?? 0;
    if (s.view.brackets.some((b) => i >= b.start && i < b.end)) continue;
    out.push([i, i + m[0].length, нф(m[0])]);
  }
  return out;
}

interface Разбор { общие: Set<string>; доля: number; список: string[] }
/** Общие слова сцены по всем показанным клеткам. */
function разобрать(клетки: Стих[][]): { отмечено: Map<string, Set<number>>; свои: Map<string, Set<number>>; р: Разбор } {
  const слова = клетки.map((xs) => xs.map((s) => ({ s, w: словаСтиха(s) })));
  const мн = слова.map((xs) => new Set(xs.flatMap((x) => x.w.map((w) => w[2]))));
  const би = слова.map((xs) => {
    const all = xs.flatMap((x) => x.w.map((w) => w[2]));
    return new Set(all.slice(1).map((w, i) => `${all[i]} ${w}`));
  });
  const отмечено = new Map<string, Set<number>>();
  const свои = new Map<string, Set<number>>();
  let всего = 0;
  let общих = 0;
  const список: string[] = [];
  const виден = new Set<string>();
  слова.forEach((xs, ci) => {
    const all = xs.flatMap((x) => x.w.map((w) => ({ s: x.s, w })));
    all.forEach((x, i) => {
      const n = x.w[2];
      const везде = (f: (k: number) => boolean) => клетки.every((_, k) => k === ci || f(k));
      const одно = !STOP.has(n) && везде((k) => мн[k].has(n));
      // пара подряд — совпадение, только если хотя бы одно слово пары не служебное (научные № 11 а)
      const пара =
        (i > 0 && !(STOP.has(n) && STOP.has(all[i - 1].w[2])) && везде((k) => би[k].has(`${all[i - 1].w[2]} ${n}`))) ||
        (i + 1 < all.length && !(STOP.has(n) && STOP.has(all[i + 1].w[2])) && везде((k) => би[k].has(`${n} ${all[i + 1].w[2]}`)));
      // Н-9 (Л-д5): «только этого рассказа» — слова, которых нет ни в одном другом показанном рассказе сцены
      if (!STOP.has(n) && клетки.every((_, k) => k === ci || !мн[k].has(n))) (свои.get(x.s.id) ?? свои.set(x.s.id, new Set()).get(x.s.id)!).add(x.w[0]);
      всего++;
      if (одно || (пара && !STOP.has(n))) {
        общих++;
        (отмечено.get(x.s.id) ?? отмечено.set(x.s.id, new Set()).get(x.s.id)!).add(x.w[0]);
        if (ci === 0 && !STOP.has(n) && !виден.has(n)) {
          виден.add(n);
          // форма первого появления в тексте, с регистром текста (П-6: «Иисус», «Бога»)
          список.push(показ(x.s.view.text).slice(x.w[0], x.w[1]));
        }
      }
    });
  });
  return { отмечено, свои, р: { общие: new Set(список), доля: всего ? общих / всего : 0, список } };
}

const ЧИСЛО = ['', 'в одном', 'в обоих', 'во всех трёх', 'во всех четырёх', 'во всех пяти'];

/** Текст клетки: стихи с номерами в строке; совпавшие (или особые) слова — подчёркнуты. */
function Клетка({ xs, отмечено, свои, режим, уже }: { xs: Стих[]; отмечено: Map<string, Set<number>>; свои: Map<string, Set<number>>; режим: 'общие' | 'свои'; уже: Map<string, string> }) {
  return (
    <div class="писание синопсис__текст" lang="ru">
      {xs.map((s, i) => {
        const t = показ(s.view.text);
        const m = (режим === 'общие' ? отмечено : свои).get(s.id) ?? new Set<number>();
        const ws = словаСтиха(s);
        const parts: ComponentChildren[] = [];
        let at = 0;
        for (const [a, b] of ws) {
          const on = m.has(a);
          if (!on) continue;
          if (a > at) parts.push(t.slice(at, a));
          parts.push(<span class="совпадение">{t.slice(a, b)}</span>);
          at = b;
        }
        if (at < t.length) parts.push(t.slice(at));
        // стих, разделённый между сценами: точек «а / б» в данных нет — стих виден целиком в обеих сценах, во второй — с пометкой
        const там = уже.get(s.id);
        return (
          <span class="стих" key={s.id}>
            {i > 0 ? ' ' : ''}
            {там && <span class="стих__пометка т-адрес не-копировать">тот же стих, что в сцене «{там}»: </span>}
            <span class="стих__номер не-копировать">
              {s.v}
              {'\u00A0'}
            </span>
            {parts}
          </span>
        );
      })}
    </div>
  );
}

export function Синопсис({ колонки, сцены, подпись, основание, единица = 'рассказ' }: { колонки: Колонка[]; сцены: Сцена[]; подпись: string; основание?: ComponentChildren; единица?: 'рассказ' | 'отрывок' }) {
  void загружено.value;
  const [выбраны, setВыбраны] = useState<boolean[]>(колонки.map((_, i) => i < 4));
  const [режимРучной, setРежим] = useState<'общие' | 'свои' | null>(null);
  const обёртка = useRef<HTMLDivElement>(null);
  const [узко, setУзко] = useState(false);
  useEffect(() => {
    const el = обёртка.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setУзко(el.clientWidth < 37.5 * parseFloat(getComputedStyle(document.documentElement).fontSize)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const все = сцены.flatMap((s) => s.клетки).filter((x): x is string => !!x);
  if (!готовы(все)) return <p class="голос-мы">Загружаем текст рассказов…</p>;
  const видимые = колонки.map((c, i) => ({ c, i })).filter((x) => выбраны[x.i]);
  const разборы = сцены.map((s) => {
    const клетки = видимые.map((x) => (s.клетки[x.i] ? стихи(s.клетки[x.i]!) : null));
    const есть = клетки.filter((x): x is Стих[] => !!x && x.length > 0);
    return { s, клетки, ...(есть.length > 1 ? разобрать(есть) : { отмечено: new Map<string, Set<number>>(), свои: new Map<string, Set<number>>(), р: { общие: new Set<string>(), доля: 0, список: [] } }) };
  });
  // стихи, разделённые между сценами: где текст уже показан (сцена по порядку)
  const ужеПоСценам = разборы.map(() => new Map<string, string>());
  {
    const показан = new Map<string, string>();
    разборы.forEach((x, si) => {
      for (const xs of x.клетки) for (const st of xs ?? []) {
        if (!x.s.split?.includes(st.id) && !сцены.some((y) => y.split?.includes(st.id))) continue;
        if (показан.has(st.id)) ужеПоСценам[si].set(st.id, показан.get(st.id)!);
        else показан.set(st.id, x.s.имя ?? '');
      }
    });
  }
  const доля = разборы.reduce((a, x) => a + x.р.доля, 0) / Math.max(1, разборы.length);
  const режим = режимРучной ?? (доля > 0.5 ? 'свои' : 'общие');
  const мн = единица === 'рассказ' ? 'рассказах' : 'отрывках';
  const легенда = режим === 'общие' ? `Отмечены слова, которые есть во всех показанных ${мн}${единица === 'рассказ' ? ' сцены' : ''}.` : `Отмечены слова, которых нет ни в одном другом показанном ${единица === 'рассказ' ? 'рассказе сцены' : 'отрывке'}.`;
  const сменить = (v: 'общие' | 'свои') => {
    setРежим(v);
    объявить(v === 'общие' ? 'Отмечены общие слова' : `Отмечены слова только этого ${единица === 'рассказ' ? 'рассказа' : 'отрывка'}`);
  };
  const копия = (x: (typeof разборы)[number]) => {
    const t = видимые
      .map((v, k) => {
        const xs = x.клетки[k];
        if (!xs?.length) return '';
        return `${v.c.подпись} (${адрес(x.s.клетки[v.i]!)}): ${xs.map((s) => показ(s.view.text)).join(' ')}`;
      })
      .filter(Boolean)
      .join('\n');
    void вБуфер(`${x.s.имя ?? подпись}\n${t}\n(Синодальный перевод)`, null, `сцена «${x.s.имя ?? подпись}»`);
  };
  const общиеСтрока = (x: (typeof разборы)[number]) => {
    const n = x.клетки.filter((c) => c?.length).length;
    return x.р.список.length ? `${x.р.список.join(', ')} — ${ЧИСЛО[n] ?? `во всех ${n}`}` : 'общих слов нет';
  };
  return (
    <div class="синопсис-обёртка" ref={обёртка}>
      <div class="синопсис-управление">
        {колонки.length > 2 && (
          <fieldset class="радио синопсис-колонки">
            <legend>{единица === 'рассказ' ? 'Рассказы' : 'Отрывки'} рядом (2–4)</legend>
            {колонки.map((c, i) => (
              <label>
                <input
                  type="checkbox"
                  checked={выбраны[i]}
                  disabled={выбраны[i] && выбраны.filter(Boolean).length <= 2}
                  onChange={(e) => {
                    const v = [...выбраны];
                    v[i] = e.currentTarget.checked;
                    if (v.filter(Boolean).length > 4) return;
                    setВыбраны(v);
                    объявить(`${e.currentTarget.checked ? 'Показан' : 'Скрыт'} рассказ: ${c.подпись}`);
                  }}
                />{' '}
                {c.подпись}
              </label>
            ))}
          </fieldset>
        )}
        <span class="ряд-кнопок сегменты" role="group" aria-label="Что отметить">
          <button class="кн" type="button" aria-pressed={режим === 'общие'} onClick={() => сменить('общие')}>
            Отметить общие слова
          </button>
          <button class="кн" type="button" aria-pressed={режим === 'свои'} onClick={() => сменить('свои')}>
            Отметить слова только этого {единица === 'рассказ' ? 'рассказа' : 'отрывка'}
          </button>
        </span>
      </div>
      <p class="т-адрес синопсис-легенда">
        {легенда} Совпадения — в словах Синодального перевода, а не подлинника. Слова в скобках не считаются.
      </p>
      {узко ? (
        <div class="синопсис-сцены">
          {разборы.map((x) => (
            <section class="синопсис-сцена">
              {x.s.имя && <h3 class="т-повествование">{x.s.имя}</h3>}
              {видимые.map((v, k) =>
                x.клетки[k]?.length ? (
                  <div class="синопсис-рассказ">
                    <h4 class="т-адрес" role={x.s.имя ? undefined : 'heading'} aria-level={x.s.имя ? undefined : 3}>
                      {v.c.подпись}, {адрес(x.s.клетки[v.i]!)}
                      {v.c.пересказ ? ` — ${v.c.пересказ}` : ''}
                    </h4>
                    <Клетка xs={x.клетки[k]!} отмечено={x.отмечено} свои={x.свои} режим={режим} уже={ужеПоСценам[разборы.indexOf(x)]} />
                  </div>
                ) : null,
              )}
              <p class="т-интерфейс">
                <span class="сильно">Общие слова: </span>
                {общиеСтрока(x)}
              </p>
              {x.s.различия?.map((d) => <Различие d={d} />)}
            </section>
          ))}
        </div>
      ) : (
        <div class="таблица-обёртка" role="region" aria-label={`${подпись}: рассказы рядом`} tabIndex={0}>
          <table class="таблица синопсис">
            <caption class="скрыто">{подпись}: рассказы рядом по сценам</caption>
            <thead>
              <tr>
                {видимые.map((v) => (
                  <th scope="col">
                    {v.c.подпись}
                    <span class="т-адрес"> {v.c.пересказ ?? ''}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {разборы.map((x) => (
              <tbody>
                {x.s.имя && (
                  <tr>
                    <th scope="colgroup" colSpan={Math.max(1, видимые.length - 1)} class="сцена">
                      {x.s.имя}
                    </th>
                    {видимые.length > 1 && (
                      <td class="сцена-действие">
                        <button class="кн кн--тихо" type="button" onClick={() => копия(x)}>
                          <Значок имя="копировать" />
                          Копировать сцену<span class="скрыто">: {x.s.имя}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                )}
                <tr>
                  {видимые.map((v, k) => (
                    <td>
                      {x.клетки[k]?.length ? (
                        <>
                          <span class="т-адрес синопсис__адрес">
                            <span aria-hidden="true">{адрес(x.s.клетки[v.i]!)}</span>
                            <span class="скрыто">{адресПолно(x.s.клетки[v.i]!)}</span>
                          </span>
                          {x.s.moved?.filter((m) => m.col === v.i && местоИное(m.after, x.клетки[k]![0])).map((m) => (
                            <span class="т-адрес синопсис__место"> в {BOOK_BY_CODE.get(книгаСсылки(m.after))?.short ?? ''} {m.after.split(' ')[1]?.split(':')[0]} этот стих стоит после стиха {m.after.split(':')[1]}</span>
                          ))}
                          <Клетка xs={x.клетки[k]!} отмечено={x.отмечено} свои={x.свои} режим={режим} уже={ужеПоСценам[разборы.indexOf(x)]} />
                        </>
                      ) : (
                        <span class="т-адрес">
                          {x.s.пусто?.[v.i] ?? (
                            <>
                              <span aria-hidden="true">—</span>
                              <span class="скрыто">в этой сцене стихов нет</span>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr class="синопсис__общие">
                  <td colSpan={видимые.length} class="т-интерфейс">
                    <span class="сильно">Общие слова:</span> {общиеСтрока(x)}
                  </td>
                </tr>
                {x.s.различия?.length ? (
                  <tr>
                    <td colSpan={видимые.length}>
                      {x.s.различия.map((d) => (
                        <Различие d={d} />
                      ))}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {основание && (
        <details class="синопсис-основание">
          <summary>{единица === 'рассказ' ? 'Почему это одна история' : 'Почему эти отрывки рядом'}</summary>
          {основание}
        </details>
      )}
      {слой2() && <p class="т-адрес">Совпадение слов перевода — мера похожести слов, а не вывод о том, кто у кого взял.</p>}
    </div>
  );
}

/** Пометка «стоит после стиха N» — только если стих не идёт сразу за N и это не сам N (библеист № 11: «после стиха 10» у стиха 10). */
function местоИное(after: string, первый: Стих): boolean {
  const [c, v] = (after.split(' ')[1] ?? '').split(':').map(Number);
  return !(первый.c === c && (первый.v === v || первый.v === v + 1));
}
/** Различие рассказов — только цитатами стихов каждого рассказа и подписью-вопросом (11 § 4.5 п. 7). */
export function Различие({ d }: { d: { label: string; quotes: { ref: string; text: string }[] } }) {
  return (
    <p class="различие-строка т-интерфейс">
      <span class="сильно">Различие — {d.label}: </span>
      {d.quotes.map((q, i) => (
        <>
          {i > 0 ? '; ' : ''}
          {ГОВОРИТ[q.ref] && <span class="т-адрес">{ГОВОРИТ[q.ref]}: </span>}
          <span class="скрыто не-копировать">Библия: </span>
          <q class="голос-библия-в-строке">«{q.text}»</q> ({адрес(q.ref)})
        </>
      ))}
    </p>
  );
}
