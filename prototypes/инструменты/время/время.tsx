/**
 * Инструмент «Время» (04) — рабочий прототип: три вида одного набора.
 *  - «Жизни» (§ 3.3, § 3.10; П-2, П-3, П-4): строки лиц на общей оси — `treegrid` (↑ ↓, Home, End, PageUp/PageDown по группам,
 *    → ← раскрыть и свернуть группу, буква — к имени, Enter — выбрать: уровень 2, лист с цепочкой). У каждой полосы — текст
 *    в ячейке («930 лет, Быт 5:5»), засечка «умер» только у «прожил … лет», у Еноха — «Бог взял его» (Быт 5:24); отметка
 *    потопа; срезанная окном полоса — со знаком края. Под рисунком — двойник-таблица и CSV. Годы до Р. Х. — только второй
 *    слой и с названием модели.
 *  - «События» (§ 4): нить «порядка» — одна остановка Tab, стрелки, Home, End; при «Приблизить» — части истории.
 *  - «Правители» (§ 15; П-1): по стихам синхронизмов — см. `правители.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Д, загружено, имя, статус, стихи, показ } from '../общее/данные.ts';
import { адрес, адресПолно } from '../общее/адреса.ts';
import { слой2, изменить } from '../общее/настройки.ts';
import { объявить, вБуфер, число, открыто } from '../общее/службы.ts';
import { маршрут, сВидом, href, router, шагОтмены } from '../общее/приложение.ts';
import { Значок } from '../общее/знаки.tsx';
import { КнНазад, ПереключательСлоя, АдресКн, Меню, Эскиз, Библия } from '../общее/компоненты.tsx';
import { жизнь, модель, схема, лет, годЭпохи, type Жизнь, type Звено } from './модель.ts';
import { правители, годЦаря, ИМЯ_В_СТИХЕ, type Царь, type Проверка } from './правители.ts';
import { эпохиСсылки } from './образ.tsx';
import { yearLabel } from '../../../core/years.ts';
import type { Epoch, Story } from '../общее/типы.ts';

type Вид = 'lives' | 'events' | 'rulers';
const ВИДЫ: [Вид, string][] = [
  ['lives', 'Жизни'],
  ['events', 'События'],
  ['rulers', 'Правители'],
];
/** Родословие Быт 5; 11 — по рёбрам и числам текста (Каинан Лк 3:36 — строкой о наборе прочтений у Салы). */
const РОД = ['p-adam', 'p-sif', 'p-enos', 'p-kainan', 'p-maleleil', 'p-iared', 'p-enokh', 'p-mafusal', 'p-lamekh', 'p-noy', 'p-sim', 'p-arfaksad', 'p-sala', 'p-ever', 'p-falek', 'p-ragav', 'p-serukh', 'p-nakhor', 'p-farra', 'p-avraam'];

export function Время() {
  void загружено.value;
  const r = маршрут.value;
  const sel = r.params.sel;
  const селИстория = sel?.startsWith('e-') ? Д.stories.get(sel) : undefined;
  const вид: Вид = (r.params.view as Вид) || (селИстория ? 'events' : 'lives');
  const эпоха = Д.epochs.find((e) => e.id === r.params.e);
  const z = Math.max(0, Math.min(5, Number(r.params.z ?? 0) || 0));
  const заголовок = селИстория ? `${селИстория.title.short} — Время` : sel?.startsWith('p-') ? `${имя(sel)} — Время` : 'Время';
  const сменитьВид = (v: Вид) => {
    сВидом({ view: v }, `вид «${ВИДЫ.find((x) => x[0] === v)?.[1]}»`);
    объявить(`Вид: ${ВИДЫ.find((x) => x[0] === v)?.[1]}`);
  };
  const tabs = useRef<HTMLDivElement>(null);
  const окно = вид === 'rulers' ? Д.epochs.filter((e) => e.id === 'era-divided' || e.id === 'era-judah-alone') : окноЭпох(вид, эпоха, селИстория);
  const ближе = () => сВидом({ z: String(z + 1) }, 'приблизить');
  const дальше = () => сВидом({ z: z > 1 ? String(z - 1) : undefined }, 'отдалить');
  const м = модель();
  return (
    <div class="время" data-key={эпоха ? `epoch:${эпоха.id}` : undefined}>
      <h1 class="т-h1 время__h1" id="h1" tabIndex={-1}>
        {заголовок}
      </h1>
      <div class="строка-инструмента" role="group" aria-label="Строка инструмента">
        <КнНазад />
        <div class="вкладки вкладки--сегменты" role="tablist" aria-label="Вид" ref={tabs}>
          {ВИДЫ.map(([v, п], i) => (
            <button
              role="tab"
              type="button"
              class="вкладка"
              id={`вкладка-${v}`}
              aria-selected={вид === v}
              aria-controls="время-вид"
              tabIndex={вид === v ? 0 : -1}
              onClick={() => сменитьВид(v)}
              onKeyDown={(e) => {
                const n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
                if (n >= 0) {
                  e.preventDefault();
                  сменитьВид(ВИДЫ[n][0]);
                  requestAnimationFrame(() => tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[n]?.focus());
                }
              }}
            >
              {п}
            </button>
          ))}
        </div>
        {вид !== 'rulers' && (
          <span class="ряд-кнопок масштаб-кнопки">
            <button class="кн" type="button" onClick={() => { ближе(); объявить('Приближено'); }} disabled={z >= 5}>
              <Значок имя="поиск" />
              Приблизить
            </button>
            <button class="кн" type="button" onClick={() => { дальше(); объявить('Отдалено'); }} disabled={z <= 0}>
              <Значок имя="мельче" />
              Отдалить
            </button>
          </span>
        )}
        <span class="слой-времени">
          <ПереключательСлоя />
        </span>
        <Меню
          подпись={<><Значок имя="действия" />Ещё<span class="скрыто"> действия: Время</span></>}
          имя="Ещё действия: Время"
          пункты={[
            { т: шагОтмены.value.undo ? `Отменить шаг: ${шагОтмены.value.undo}` : 'Отменить шаг', зн: 'отменить', on: () => router.undo(), скрыт: !шагОтмены.value.undo },
            { т: шагОтмены.value.redo ? `Вернуть шаг: ${шагОтмены.value.redo}` : 'Вернуть шаг', зн: 'вернуть', on: () => router.redo(), скрыт: !шагОтмены.value.redo },
            { т: 'Приблизить', зн: 'поиск', on: ближе, скрыт: вид === 'rulers' || z >= 5 },
            { т: 'Отдалить', зн: 'мельче', on: дальше, скрыт: вид === 'rulers' || z <= 0 },
            { т: слой2() ? 'Показать для начинающих' : 'Показать для изучающих', зн: 'слой', on: () => { изменить({ слой: слой2() ? '1' : '2' }); объявить(слой2() ? 'Показано для изучающих' : 'Показано для начинающих'); } },
            { т: 'Как сослаться', зн: 'сослаться', on: () => void вБуфер(какСослаться(заголовок, вид, м?.name), null, 'ссылка для сноски') },
            { т: 'Ссылка на это место', зн: 'ссылка', on: () => void вБуфер(location.href, null, 'ссылка на это место') },
            { т: 'Клавиши шкалы', зн: 'справка', on: () => объявить('Клавиши: стрелки вверх и вниз — по строкам; Home и End — к первой и последней; вправо и влево — раскрыть и свернуть группу; буква — к имени; Enter — выбрать; Esc — закрыть лист') },
            { т: 'Печать', зн: 'печать', on: () => print() },
          ]}
        />
      </div>
      <УказательЭпох текущие={окно.map((e) => e.id)} />
      <h2 class="скрыто">Шкала</h2>
      <p class="строка-сейчас т-интерфейс">
        Показано: {окно.map((e) => e.short).join(', ')}.
        {слой2() && м && <span class="т-адрес"> Годы — расчёт по модели «{м.name}» ({м.id}); цари — по стихам синхронизмов, годы до Р. Х. — по Тиле (справка).</span>}
      </p>
      <div id="время-вид" role="tabpanel" class="время__вид" aria-labelledby={`вкладка-${вид}`}>
        {вид === 'lives' && <Жизни эпоха={эпоха} z={z} />}
        {вид === 'events' && <События эпоха={эпоха} z={z} история={селИстория} />}
        {вид === 'rulers' && <Правители />}
      </div>
    </div>
  );
}

function какСослаться(заголовок: string, вид: Вид, модельИмя?: string) {
  const дата = new Date().toLocaleDateString('ru-RU');
  const видИмя = ВИДЫ.find((x) => x[0] === вид)?.[1];
  return `${заголовок}, вид «${видИмя}»${модельИмя ? `; годы — модель «${модельИмя}»` : ''} // Библия наглядно : сайт. Выпуск данных проба ${Д.proto.base}. URL: ${location.href} (дата обращения: ${дата}).`;
}

function окноЭпох(вид: Вид, эпоха: Epoch | undefined, история?: Story): Epoch[] {
  if (история && вид === 'events') {
    const xs = эпохиСсылки(история.accounts[0]?.refs[0] ?? '');
    if (xs.length) return xs;
  }
  if (эпоха) return [эпоха];
  return Д.epochs.filter((e) => e.id === 'era-antediluvian' || e.id === 'era-postdiluvian');
}

/** Указатель эпох (04 § 3.1; 08 § 7.5.1, вариант 2): 16 равных клеток, имена в два ряда; APG Toolbar — одна остановка Tab. Выбор — контур и полоса выбора (08 § 5.2). */
function УказательЭпох({ текущие }: { текущие: string[] }) {
  const [фокус, setФокус] = useState(Math.max(0, Д.epochs.findIndex((e) => текущие.includes(e.id))));
  const ref = useRef<HTMLDivElement>(null);
  const [лист, setЛист] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  useEffect(() => (лист ? открыто(() => setЛист(false), кн.current) : undefined), [лист]);
  const перейти = (e: Epoch) => {
    сВидом({ e: e.id, z: undefined, sel: undefined }, `эпоха «${e.short}»`);
    объявить(`Показано: ${e.name}`);
  };
  const key = (ev: KeyboardEvent) => {
    const n = Д.epochs.length;
    let i = фокус;
    if (ev.key === 'ArrowRight') i = (фокус + 1) % n;
    else if (ev.key === 'ArrowLeft') i = (фокус - 1 + n) % n;
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = n - 1;
    else return;
    ev.preventDefault();
    setФокус(i);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('button')[i]?.focus());
  };
  return (
    <>
      <nav class="указатель-эпох" aria-label="Эпохи: клетки равные, эпохи разной длины">
        <span class="указатель-эпох__масштаб т-адрес" aria-hidden="true">
          клетки равные, эпохи разной длины
        </span>
        <div class="указатель-эпох__клетки" role="toolbar" ref={ref} onKeyDown={key}>
          {Д.epochs.map((e, i) => (
            <button
              type="button"
              class={`указатель-эпох__клетка${i % 2 ? ' указатель-эпох__клетка--низ' : ''}${текущие.includes(e.id) ? ' указатель-эпох__клетка--тек' : ''}${i === Д.epochs.length - 1 ? ' указатель-эпох__клетка--разрыв' : ''}`}
              tabIndex={i === фокус ? 0 : -1}
              aria-current={текущие.includes(e.id) ? 'true' : undefined}
              aria-label={`${e.short}, эпоха ${i + 1} из ${Д.epochs.length}`}
              onClick={() => перейти(e)}
              data-key={`epoch:${e.id}`}
            >
              <span class="указатель-эпох__имя" aria-hidden="true">
                {e.short}
              </span>
            </button>
          ))}
        </div>
      </nav>
      <div class="эпохи-кнопка">
        <button ref={кн} class="кн" type="button" aria-expanded={лист} aria-controls="эпохи-лист" onClick={() => setЛист(!лист)}>
          <Значок имя="время" />
          Эпохи
        </button>
        <ul id="эпохи-лист" class="меню фасеты эпохи-лист" hidden={!лист}>
          {Д.epochs.map((e, i) => (
            <li>
              <button
                type="button"
                class="кн кн--текст"
                aria-current={текущие.includes(e.id) ? 'true' : undefined}
                onClick={() => {
                  setЛист(false);
                  перейти(e);
                }}
              >
                {i + 1}. {e.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ---------- «Жизни» ----------
interface Ряд { тип: 'группа' | 'лицо'; ключ: string; имя: string; уровень: number; лицо?: Жизнь; раскрыта?: boolean; n?: number }

/** Текст полосы для ячейки и двойника: «930 лет, Быт 5:5»; у вывода — «так выходит, если сравнить»; у выбора модели — «расчёт». */
function текстПолосы(ж: Жизнь): string {
  if (!ж.лет) return ж.нет ?? '';
  const t = `${лет(ж.лет.n)}, ${адрес(ж.лет.refs[0])}`;
  return `${t}${ж.лет.cert === 'inference' ? ', так выходит, если сравнить места Библии' : ''}${ж.лет.смерть ? '' : ', о смерти не сказано'}${ж.выборМодели || ж.опора ? '; где полоса начинается — расчёт по модели' : ''}`;
}

function Жизни({ эпоха, z }: { эпоха?: Epoch; z: number }) {
  const r = маршрут.value;
  const [закрыты, setЗакрыты] = useState<Set<string>>(new Set());
  const доп = (r.params.p ?? '').split(',').filter(Boolean);
  const ряды: Ряд[] = [];
  const группы: [string, string, string[]][] = [];
  if (доп.length) группы.push(['p', 'Сравнение', доп]);
  const род = !эпоха || ['era-antediluvian', 'era-postdiluvian'].includes(эпоха.id);
  if (род) группы.push(['rod', 'Родословие: от Адама до Аврама, он же Авраам (Быт 5; 11; 17:5)', РОД]);
  else группы.push(['key', `Главные лица эпохи «${эпоха!.short}»`, эпоха!.keyPersons ?? []]);
  const безПолосы: Жизнь[] = [];
  for (const [k, n, ids] of группы) {
    const ж = ids.map(жизнь);
    const сПолосой = ж.filter((x) => x.am || x.bc);
    безПолосы.push(...ж.filter((x) => !x.am && !x.bc));
    const раскрыта = !закрыты.has(k);
    ряды.push({ тип: 'группа', ключ: k, имя: n, уровень: 1, раскрыта, n: сПолосой.length });
    if (раскрыта) for (const x of сПолосой) ряды.push({ тип: 'лицо', ключ: x.id, имя: x.имя, уровень: 2, лицо: x });
  }
  // ось: годы от Адама у родословия, годы по модели у прочих (в простом слое подписей лет нет)
  const лица = ряды.filter((x) => x.лицо).map((x) => x.лицо!);
  const поAm = род;
  const конц = (x: Жизнь): [number, number] | null => (поAm ? (x.am ?? null) : x.bc ? [x.bc[0], x.bc[1]] : null);
  const все = лица.map(конц).filter((x): x is [number, number] => !!x);
  let от = поAm ? 0 : Math.min(...все.map((x) => x[0]));
  let до = поAm ? Math.max(...все.map((x) => x[1])) : Math.max(...все.map((x) => x[1]));
  if (!поAm && эпоха) {
    // окно — эпоха и жизни её главных лиц целиком (полосы не режутся окном без нужды)
    от = Math.min(годЭпохи(эпоха, 'start') ?? от, от);
    до = Math.max(годЭпохи(эпоха, 'end') ?? до, до);
  }
  if (!Number.isFinite(от) || !Number.isFinite(до) || до <= от) {
    от = 0;
    до = 1;
  }
  const sel = r.params.sel?.startsWith('p-') ? r.params.sel : undefined;
  const [фокус, setФокус] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const выбрать = (id: string) => {
    router.go({ ...r, params: { ...r.params, sel: id } });
    объявить(`Выбрано: ${имя(id)}`);
  };
  const к = (i: number) => {
    setФокус(i);
    requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLElement>('[role="row"]')[i]?.focus());
  };
  const key = (e: KeyboardEvent) => {
    const row = ряды[фокус];
    let i = -1;
    if (e.key === 'ArrowDown') i = Math.min(ряды.length - 1, фокус + 1);
    else if (e.key === 'ArrowUp') i = Math.max(0, фокус - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ряды.length - 1;
    else if (e.key === 'PageDown') i = ряды.findIndex((x, j) => j > фокус && x.тип === 'группа');
    else if (e.key === 'PageUp') i = ряды.map((x, j) => (j < фокус && x.тип === 'группа' ? j : -1)).reduce((a, b) => Math.max(a, b), 0);
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && row?.тип === 'группа') {
      const n = new Set(закрыты);
      e.key === 'ArrowLeft' ? n.add(row.ключ) : n.delete(row.ключ);
      setЗакрыты(n);
      e.preventDefault();
      return;
    } else if ((e.key === 'Enter' || e.key === ' ') && row?.тип === 'лицо') {
      e.preventDefault();
      выбрать(row.ключ);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      const б = e.key.toLowerCase();
      i = ряды.findIndex((x, j) => j > фокус && x.имя.toLowerCase().startsWith(б));
      if (i < 0) i = ряды.findIndex((x) => x.имя.toLowerCase().startsWith(б));
    } else return;
    if (i < 0) return;
    e.preventDefault();
    к(i);
  };
  const масштаб = 2 ** z;
  const x = (y: number) => ((y - от) / (до - от)) * 100;
  const деления = делениеОси(от, до, z);
  // отметка потопа (Быт 7:6; граница эпох 1 и 2) — у родословия, по счёту от Адама
  const потоп = поAm ? (() => {
    const ной = жизнь('p-noy');
    return ной.am ? ной.am[0] + 600 : undefined;
  })() : undefined;
  const м = модель();
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        {слой2() && (
          <div class="ось-лет" aria-hidden="true">
            <div class="ось-лет__ряд" style={{ width: `${100 * масштаб}%` }}>
              {деления.map((y) => (
                <span class="ось-лет__метка" style={{ left: `${x(y)}%` }}>
                  {поAm ? `${y}` : yearLabel(y, { era: false })}
                </span>
              ))}
            </div>
            <span class="ось-лет__подпись т-адрес">{поAm ? 'лет от сотворения Адама (расч.)' : `до Р. Х. — расчёт по модели «${м?.name ?? '—'}»`}</span>
          </div>
        )}
        <p class="скрыто">Описание рисунка: полосы жизни лиц. Те же числа — в таблице под рисунком.</p>
        <div class="жизни" role="treegrid" aria-label={`Жизни: ${число(лица.length, ['лицо', 'лица', 'лиц'])}`} aria-rowcount={ряды.length} ref={grid} onKeyDown={key}>
          {ряды.map((row, i) => (
            <div
              role="row"
              class={`жизни__ряд жизни__ряд--${row.тип}${row.ключ === sel ? ' жизни__ряд--выбран' : ''}`}
              aria-level={row.уровень}
              aria-expanded={row.тип === 'группа' ? row.раскрыта : undefined}
              aria-selected={row.тип === 'лицо' ? row.ключ === sel : undefined}
              aria-rowindex={i + 1}
              tabIndex={i === фокус ? 0 : -1}
              id={row.тип === 'лицо' ? `ряд-${row.ключ}` : `группа-${row.ключ}`}
              onClick={() => {
                setФокус(i);
                if (row.тип === 'лицо') выбрать(row.ключ);
                else {
                  const n = new Set(закрыты);
                  n.has(row.ключ) ? n.delete(row.ключ) : n.add(row.ключ);
                  setЗакрыты(n);
                }
              }}
              data-key={row.лицо ? `${row.лицо.ключ} actor:${row.ключ}` : undefined}
              data-status={row.лицо ? статус(row.лицо.ключ) : undefined}
            >
              <span role="rowheader" class="жизни__имя">
                {row.тип === 'группа' ? (
                  <>
                    <Значок имя={row.раскрыта ? 'раскрыть' : 'вправо'} />
                    {row.имя} — {число(row.n ?? 0, ['человек', 'человека', 'человек'])}
                  </>
                ) : (
                  <span class="жизни__имя-текст">{row.имя}</span>
                )}
              </span>
              {row.лицо && (
                <span role="gridcell" class="жизни__полоса-место">
                  <Полоса ж={row.лицо} x={x} масштаб={масштаб} конц={конц(row.лицо)} от={от} до={до} потоп={потоп} />
                </span>
              )}
            </div>
          ))}
        </div>
        <p class="т-интерфейс подпись-шкалы">
          {поAm
            ? 'Длина полосы — сколько лет человек жил: так написано в Библии. Где полоса начинается, мы посчитали по возрастам отцов из Быт 5 и 11. Жили ли они в одно время, в Библии не сказано.'
            : 'Длина полосы — сколько лет человек жил: так написано в Библии. Где полоса стоит, мы посчитали по модели: сколько лет назад это было, Библия не говорит.'}{' '}
          <span class="знак-легенда" aria-hidden="true">
            <span class="жизни__засечка-пример" /> — «умер» сказано{потоп !== undefined ? '; тонкая вертикаль — потоп (Быт 7:6)' : ''}
          </span>
        </p>
        {безПолосы.length > 0 && (
          <p class="т-интерфейс без-полосы">
            Без полосы:{' '}
            {безПолосы.map((ж, i) => (
              <>
                {i > 0 ? '; ' : ''}
                <a href={href({ screen: 'kartochka', id: ж.id, params: {} })}>{ж.имя}</a>
                {ж.лет ? ` — ${текстПолосы(ж)}` : ''}
              </>
            ))}
            . {безПолосы.some((ж) => ж.лет) ? 'Возраст Библия называет, а после кого они родились по счёту лет — нет.' : 'Годы их жизни по числам Библии не посчитать.'}
          </p>
        )}
        <КтоЕщё эпоха={эпоха} />
        <Двойник лица={лица} поAm={поAm} />
      </div>
      {sel && <ЛистЛица id={sel} />}
    </div>
  );
}

function делениеОси(от: number, до: number, z: number): number[] {
  const span = (до - от) / 2 ** z;
  const шаг = [1, 5, 10, 50, 100, 500, 1000].find((s) => span / s <= 10) ?? 1000;
  const out: number[] = [];
  for (let y = Math.ceil(от / шаг) * шаг; y <= до; y += шаг) if (y !== 0 || от >= 0) out.push(y);
  return out;
}

function Полоса({ ж, x, масштаб, конц, от, до, потоп }: { ж: Жизнь; x: (y: number) => number; масштаб: number; конц: [number, number] | null; от: number; до: number; потоп?: number }) {
  const текст = текстПолосы(ж);
  if (!конц) return <span class="голос-мы жизни__нет">{текст}</span>;
  if (ж.опора && !слой2() && !ж.лет) return <span class="голос-мы жизни__нет">{текст}</span>;
  const a = Math.max(от, конц[0]);
  const b = Math.min(до, конц[1]);
  const слева = конц[0] < от;
  const справа = конц[1] > до;
  const конецЦитата = ж.лет?.конец ? стихи(ж.лет.конец)[0] : undefined;
  // подпись — справа от конца; у правого края — слева от начала; полоса во всю ширину — на плашке в начале полосы
  const место = x(b) <= 82 ? 'справа' : x(a) >= 18 ? 'слева' : 'внутри';
  return (
    <span class="жизни__холст" style={{ width: `${100 * масштаб}%` }}>
      {потоп !== undefined && <span class="жизни__потоп" style={{ left: `${x(потоп)}%` }} aria-hidden="true" />}
      <span
        class={`жизни__полоса${ж.выборМодели || ж.опора ? ' жизни__полоса--расчёт' : ''}${слева ? ' жизни__полоса--срез-слева' : ''}${справа ? ' жизни__полоса--срез-справа' : ''}`}
        style={{ left: `${x(a)}%`, width: `${Math.max(0.4, x(b) - x(a))}%` }}
        aria-hidden="true"
      >
        {ж.лет?.смерть && !справа && <span class="жизни__засечка" />}
      </span>
      <span class={`жизни__подпись т-адрес${место === 'слева' ? ' жизни__подпись--слева' : место === 'внутри' ? ' жизни__подпись--внутри' : ''}`} style={{ left: место === 'слева' ? `calc(${x(a)}% - 0.4rem)` : место === 'внутри' ? `calc(${x(a)}% + 0.4rem)` : `calc(${x(b)}% + 0.4rem)` }}>
        <span aria-hidden="true">
          {ж.лет ? лет(ж.лет.n) : ''}
          {!ж.лет?.смерть && ж.лет?.конец && конецЦитата ? (/взял/.test(конецЦитата.view.text) ? ' · «Бог взял его»' : '') : ''}
        </span>
        <span class="скрыто">{текст}</span>
      </span>
    </span>
  );
}

/** Двойник рисунка (08 § 6.1 п. 12; 04 § 8.3): простая таблица, всегда в DOM; CSV для русского Excel. */
function Двойник({ лица, поAm }: { лица: Жизнь[]; поAm: boolean }) {
  const м = модель();
  const строки = лица.map((ж) => {
    const рожд = ж.звенья.find((z) => z.text.startsWith('Возраст отца') || z.text.startsWith('Вывод'));
    return {
      имя: ж.имя,
      лет: ж.лет ? `${ж.лет.n} (${адрес(ж.лет.refs[0])})` : '—',
      смерть: ж.лет ? (ж.лет.смерть ? 'сказано «умер»' : 'о смерти не сказано') : '—',
      рожд: рожд ? `${рожд.text.replace(/^.*— /, '')} (${адрес(рожд.refs)})` : '—',
      am: ж.am ? `${ж.am[0]}–${ж.am[1]}` : '—',
      bc: ж.bc ? `${yearLabel(ж.bc[0], { era: false })}–${yearLabel(ж.bc[1], { era: false })}` : '—',
    };
  });
  const csv = () => {
    const head = ['Имя', 'Лет жизни (стих)', 'Смерть', 'Рождение (стих)', ...(слой2() ? ['От Адама (расч.)', `До Р. Х. (модель ${м?.id ?? ''})`] : [])];
    const lines = [head, ...строки.map((s) => [s.имя, s.лет, s.смерть, s.рожд, ...(слой2() ? [s.am, s.bc] : [])])].map((r) => r.map((c) => `"${c.replace(/"/g, '""').replace(/ /g, ' ')}"`).join(';'));
    скачать(`﻿${lines.join('\r\n')}`, 'жизни.csv');
  };
  return (
    <div class="двойник">
      <div class="двойник__верх">
        <h2 class="т-h2" id="двойник-з">
          Таблица: те же числа
        </h2>
        <button class="кн кн--текст" type="button" onClick={csv}>
          <Значок имя="выгрузить" />
          Сохранить таблицу в файл
        </button>
      </div>
      <div class="таблица-обёртка" role="region" aria-labelledby="двойник-з" tabIndex={0}>
        <table class="таблица таблица--малая">
          <thead>
            <tr>
              <th scope="col">Имя</th>
              <th scope="col">Лет жизни</th>
              <th scope="col">Смерть</th>
              <th scope="col">Рождение</th>
              {слой2() && poЛет(поAm, м?.name)}
            </tr>
          </thead>
          <tbody>
            {строки.map((s) => (
              <tr>
                <th scope="row">{s.имя}</th>
                <td>{s.лет}</td>
                <td>{s.смерть}</td>
                <td>{s.рожд}</td>
                {слой2() && (
                  <>
                    <td>{s.am}</td>
                    <td>{s.bc}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const poЛет = (_: boolean, m?: string) => (
  <>
    <th scope="col">От Адама (расч.)</th>
    <th scope="col">До Р. Х. (модель «{m ?? '—'}»)</th>
  </>
);

function скачать(текст: string, имяФайла: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([текст], { type: 'text/csv;charset=utf-8' }));
  a.download = имяФайла;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  объявить(`Файл сохранён: ${имяФайла}`);
}

/** Звено цепочки: число текста — цитатой стиха; вывод — словами «так выходит»; выбор модели — с названием. */
function ЗвеноСтрока({ z }: { z: Звено }) {
  const цит = z.цитата ? стихи(z.цитата)[0] : undefined;
  return (
    <li class="т-интерфейс">
      {цит ? (
        <>
          <Библия>«{показ(цит.view.text)}»</Библия>{' '}
        </>
      ) : (
        <>{z.text} </>
      )}
      {z.refs.map((x) => (
        <АдресКн ссылка={x} />
      ))}
      {z.cert === 'inference' && <span class="пометка">{слой2() ? ' выв.' : ' Так выходит, если сравнить места Библии'}</span>}
      {z.cert === 'model' && <span class="пометка">{слой2() ? ` расчёт: ${z.модель}` : ' Это выбор модели: люди, которые изучают Библию, понимают это по-разному'}</span>}
    </li>
  );
}

function ЛистЛица({ id }: { id: string }) {
  const ж = жизнь(id);
  const r = маршрут.value;
  const м = модель();
  const закрыть = () => {
    const { sel: _s, ...rest } = r.params;
    void _s;
    router.clearLevel2({ ...r, params: rest });
    requestAnimationFrame(() => document.getElementById(`ряд-${id}`)?.focus());
  };
  // лист регистрируется в стеке Esc при каждом показе (а не только при смене лица): после «Назад» он снова закрывается Esc
  useEffect(() => открыто(закрыть, null), [r]);
  const сала = id === 'p-sala' ? Д.tools.readings.find((x) => x.id === 'r-father-sala') : undefined;
  const цепочка = ж.звенья.filter((z) => слой2() || z.cert !== 'model').map((z) => `${z.text} (${адрес(z.refs)})`).join('\n');
  return (
    <aside class="лист-времени" aria-labelledby="лист-з" data-key={`${ж.ключ} actor:${id}`}>
      <div class="лист-времени__верх">
        <h2 class="т-h2" id="лист-з">
          {ж.имя}
        </h2>
        <button class="кн" type="button" onClick={закрыть}>
          <Значок имя="закрыть" />
          Закрыть лист
        </button>
      </div>
      <ul class="цепочка">
        {ж.звенья.filter((z) => слой2() || z.cert !== 'model' || ж.выборМодели).map((z) => (
          <ЗвеноСтрока z={z} />
        ))}
        {сала && (
          <li class="т-интерфейс">
            Отец Салы — по Быт 11:12; по Лк 3:35–36 между Арфаксадом и Салой назван Каинан: <АдресКн ссылка="Лк 3:36" />. {слой2() ? `Набор прочтений ${сала.id}; модель «${м?.name}» берёт чтение по Бытию.` : 'Люди, которые изучают Библию, понимают это по-разному.'}
          </li>
        )}
      </ul>
      {ж.нет && <p class="т-проза">{ж.нет}.</p>}
      {!ж.нет && <p class="т-интерфейс">{ж.опора ? 'Сколько лет назад это было, Библия не говорит. Мы посчитали по модели.' : 'Где полоса начинается, мы посчитали по возрастам отцов из Быт 5 и 11.'}</p>}
      {слой2() && (
        <p class="т-адрес">
          {ж.am && `От сотворения Адама: ${ж.am[0]}–${ж.am[1]} (расч.). `}
          {ж.bc && `Годы: ${yearLabel(ж.bc[0])} — ${yearLabel(ж.bc[1])} (расчёт по модели «${м?.name}», ${м?.id}).`}
        </p>
      )}
      {слой2() && (
        <button class="кн кн--текст" type="button" onClick={() => void вБуфер(`${ж.имя}\n${цепочка}\n(Синодальный перевод; расчёт — модель «${м?.name}» (${м?.id}), Библия наглядно, проба ${Д.proto.base})`, null, `цепочка расчёта: ${ж.имя}`)}>
          <Значок имя="копировать" />
          Копировать цепочку расчёта<span class="скрыто">: {ж.имя}</span>
        </button>
      )}
      <p>
        <a class="ссылка-ряд" href={href({ screen: 'kartochka', id, params: {} })}>
          Карточка: {ж.имя}
        </a>
      </p>
    </aside>
  );
}

function КтоЕщё({ эпоха }: { эпоха?: Epoch }) {
  const [откр, setОткр] = useState(false);
  const r = маршрут.value;
  const e = эпоха ?? Д.epochs[0];
  const ids = (e.keyPersons ?? []).filter((id) => !(r.params.p ?? '').split(',').includes(id) && жизнь(id).am);
  if (!ids.length) return null;
  return (
    <div class="кто-ещё">
      <button class="кн кн--тихо" type="button" aria-expanded={откр} aria-controls="кто-ещё" onClick={() => setОткр(!откр)}>
        <Значок имя="раскрыть" />
        Кто ещё жил тогда?
      </button>
      <ul id="кто-ещё" hidden={!откр} class="список">
        {ids.map((id) => (
          <li class="строка-лица">
            <button
              class="кн кн--текст"
              type="button"
              onClick={() => {
                const p = [...(r.params.p ?? '').split(',').filter(Boolean), id].slice(0, 12).join(',');
                router.go({ ...r, params: { ...r.params, p } }, { level: 3, label: `добавлено лицо ${имя(id)}` });
                объявить(`Добавлено для сравнения: ${имя(id)}`);
              }}
            >
              {имя(id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- «События» ----------
function События({ эпоха, z, история }: { эпоха?: Epoch; z: number; история?: Story }) {
  const r = маршрут.value;
  const эпохи = окноЭпох('events', эпоха, история);
  const ids = new Set(эпохи.map((e) => e.id));
  const все = [...Д.stories.values()].filter((s) => s.level === 'story' && s.accounts[0] && эпохиСсылки(s.accounts[0].refs[0]).some((e) => ids.has(e.id)));
  const [фокус, setФокус] = useState(Math.max(0, все.findIndex((s) => s.id === история?.id)));
  const нить = useRef<HTMLOListElement>(null);
  const выбрать = (s: Story) => {
    router.go({ ...r, params: { ...r.params, sel: s.id } });
    объявить(`Выбрано: ${s.title.short}`);
  };
  const key = (e: KeyboardEvent) => {
    let i = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') i = Math.min(все.length - 1, фокус + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') i = Math.max(0, фокус - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = все.length - 1;
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      const б = e.key.toLowerCase();
      i = все.findIndex((s, j) => j > фокус && s.title.short.toLowerCase().startsWith(б));
      if (i < 0) i = все.findIndex((s) => s.title.short.toLowerCase().startsWith(б));
    } else return;
    if (i < 0) return;
    e.preventDefault();
    setФокус(i);
    requestAnimationFrame(() => нить.current?.querySelectorAll<HTMLElement>('.нить__кнопка')[i]?.focus());
  };
  const исход = ids.has('era-exodus');
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        <p class="нить__подпись т-интерфейс">{слой2() ? 'Порядок по тексту — не годы.' : 'Так рассказывает Библия. Это порядок, а не годы.'}</p>
        {все.length === 0 ? (
          <p class="т-проза">{исход ? 'Истории книги Исход мы ещё не составили.' : 'В этом окне историй каталога пока нет.'}</p>
        ) : (
          <ol class="нить" aria-label="Истории по порядку текста" ref={нить} onKeyDown={key}>
            {все.map((s, i) => (
              <li class={`нить__бусина${s.id === история?.id ? ' нить__бусина--выбрана' : ''}`} data-key={`story:${s.id}`}>
                <button type="button" class="нить__кнопка" aria-pressed={s.id === история?.id} tabIndex={i === фокус ? 0 : -1} onClick={() => { setФокус(i); выбрать(s); }} id={`бусина-${s.id}`}>
                  <span class="нить__знак" aria-hidden="true" />
                  <span class="нить__имя">{s.title.short}</span>
                  <span class="т-адрес">{адрес(s.accounts[0].refs)}</span>
                  <span class="скрыто">, {адресПолно(s.accounts[0].refs)}</span>
                </button>
                {s.id === история?.id && z >= 1 && s.parts?.length ? (
                  <ol class="нить нить--части" aria-label={`Части: ${s.title.short}`}>
                    {s.parts.map((p) => (
                      <li class="нить__бусина нить__бусина--часть">
                        <span class="нить__знак" aria-hidden="true" />
                        <span class="нить__имя">
                          {p.n}. {p.title.short}
                        </span>{' '}
                        <span class="т-адрес">{адрес(p.refs)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {история?.parts?.length && z < 1 ? <p class="т-адрес">Части истории видны, если нажать «Приблизить».</p> : null}
        <Эскиз простое="участники историй дорожками и годы историй появятся позже" подробно="дорожки участников (04 § 4.4), ступени значимости и годы историй по сети — после модели Д6; даты текста у частей потопа (Быт 7:11) — после разметки времени частей" />
      </div>
      {история && <ЛистИстории s={история} />}
    </div>
  );
}

function ЛистИстории({ s }: { s: Story }) {
  const r = маршрут.value;
  const закрыть = () => {
    const { sel: _s, ...rest } = r.params;
    void _s;
    router.clearLevel2({ ...r, params: rest });
    requestAnimationFrame(() => document.getElementById(`бусина-${s.id}`)?.focus());
  };
  useEffect(() => открыто(закрыть, null), [r]);
  const участники = s.actors.filter((a) => a.actor.startsWith('p-') && a.roles.some((x) => x.role !== 'mentioned'));
  return (
    <aside class="лист-времени" aria-labelledby="лист-з" data-key={`story:${s.id}`}>
      <div class="лист-времени__верх">
        <h2 class="т-h2" id="лист-з">
          {s.title.short}
        </h2>
        <button class="кн" type="button" onClick={закрыть}>
          <Значок имя="закрыть" />
          Закрыть лист
        </button>
      </div>
      <p class="т-адрес">{адрес(s.accounts.flatMap((a) => a.refs))}</p>
      {s.time?.said ? (
        <p class="т-интерфейс">
          Когда: <Библия>«{s.time.said.text}»</Библия> <АдресКн ссылка={s.time.said.refs[0]} />
        </p>
      ) : (
        <p class="т-интерфейс">Сколько лет назад это было, Библия не говорит.</p>
      )}
      {участники.length > 0 && (
        <p class="т-интерфейс">
          Участники:{' '}
          {участники.map((a, i) => (
            <>
              {i > 0 ? ', ' : ''}
              <a href={href({ screen: 'kartochka', id: a.actor, params: {} })} data-key={`actor:${a.actor}`}>
                {имя(a.actor)}
              </a>
            </>
          ))}
        </p>
      )}
      <p>
        <a class="ссылка-ряд" href={href({ screen: 'istoriya', id: s.id, params: {} })}>
          Страница истории: {s.title.short}
        </a>
      </p>
    </aside>
  );
}

// ---------- «Правители» (04 § 15; П-1) ----------
const СТАТУС: Record<string, string> = { выполнен: 'сходится', 'до года': 'сходится до года', напряжение: 'напряжение' };

function Правители() {
  const r = маршрут.value;
  const П = useMemo(() => правители(Д.chrono, имя), [Д.chrono]);
  const sel = r.params.sel;
  const выбран = П.цари.find((x) => x.id === sel);
  const первый = П.цари.find((k) => k.id === 'p-oziya')!;
  const последнийГод = Math.max(...П.события.map((e) => e.год));
  // строки: годы событий (воцарения, проверки, народы); промежутки без событий сжаты
  const годыСобытий = [...new Set([...П.события.map((e) => e.год), 0])].filter((y) => y >= 0 && y <= последнийГод).sort((a, b) => a - b);
  const выбрать = (k: Царь, n: number) => {
    router.go({ ...r, params: { ...r.params, sel: k.id } });
    объявить(`Выбрано: ${k.имя.split(',')[0]}, ${n}-й год`);
  };
  const клетка = (y: number, царство: 'Иудея' | 'Израиль') =>
    П.цари
      .filter((k) => k.царство === царство)
      .map((k) => ({ k, n: годЦаря(k, y) }))
      .filter((x): x is { k: Царь; n: number } => x.n !== null)
      .map(({ k, n }) => (
        <button type="button" class={`правитель${k.id === sel ? ' правитель--выбран' : ''}`} aria-pressed={k.id === sel} onClick={() => выбрать(k, n)} data-key={y === k.от ? `chrono:${k.id} actor:${k.id}` : undefined}>
          <span class="правитель__имя">{k.имя.split(',')[0]}</span>
          <span class="правитель__год">{k.месяцев ? `${k.месяцев} мес.` : `${n}-й год`}</span>
        </button>
      ));
  const проверкиГода = (y: number): Проверка[] => П.проверки.filter((x) => x.статус !== 'выполнен' && П.события.some((e) => e.год === y && x.стихи.includes(e.стих)));
  const счёт = { выполнен: 0, 'до года': 0, напряжение: 0 } as Record<string, number>;
  for (const x of П.проверки) счёт[x.статус]++;
  const csv = () => {
    const lines = [['Строка', 'Иудея', 'Израиль', 'Что сказано', 'Стих'], ...годыСобытий.flatMap((y) => П.события.filter((e) => e.год === y).map((e) => [`год ${y + 1} Азарии по счёту`, текстКлетки(П.цари, y, 'Иудея'), текстКлетки(П.цари, y, 'Израиль'), e.текст, адрес(e.стих)]))];
    скачать(`﻿${lines.map((r) => r.map((c) => `"${c.replace(/"/g, '""').replace(/ /g, ' ')}"`).join(';')).join('\r\n')}`, 'правители.csv');
  };
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        <p class="т-проза правители__вступление">
          Цари Иудеи и Израиля, 4 Цар 15–18. Год каждого царя посчитан по словам стиха: «В тридцать восьмой год Азарии… воцарился Захария» (<АдресКн ссылка="4Цар 15:8" />). Где числа Библии здесь сложить непросто, стоит слово «напряжение» и стихи.
        </p>
        <p class="т-интерфейс">
          Синхронизмы и длины царствований: сходится — {счёт.выполнен}; сходится до года (счёт года воцарения) — {счёт['до года']}; напряжение — {счёт.напряжение}.{' '}
          <button class="кн кн--текст" type="button" onClick={csv}>
            <Значок имя="выгрузить" />
            Сохранить таблицу в файл
          </button>
        </p>
        <div class="таблица-обёртка правители-обёртка" role="region" aria-labelledby="правители-подпись" tabIndex={0}>
          <table class="таблица правители">
            <caption id="правители-подпись" class="т-адрес">
              Правители по стихам: в каждой клетке — царь и номер его года; строки — годы, о которых сказано в 4 Цар 15–18{слой2() ? '. Годы до Р. Х. — в листе царя, по Тиле (справка, s-thiele)' : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Иудея</th>
                <th scope="col">Израиль</th>
                <th scope="col">Что сказано</th>
              </tr>
            </thead>
            <tbody>
              {годыСобытий.map((y, i) => (
                <>
                  {i > 0 && y - годыСобытий[i - 1] > 1 && (
                    <tr class="правители__промежуток">
                      <td colSpan={3} class="т-адрес">
                        … {лет(y - годыСобытий[i - 1] - 1)}, о которых в этих главах не сказано
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>{клетка(y, 'Иудея')}</td>
                    <td>{клетка(y, 'Израиль')}</td>
                    <td class="правители__что">
                      {П.события
                        .filter((e) => e.год === y)
                        .map((e) => (
                          <p>
                            {e.текст[0].toUpperCase() + e.текст.slice(1)} <АдресКн ссылка={e.стих} />
                          </p>
                        ))}
                      {проверкиГода(y).map((x) => (
                        <p class={`правители__проверка правители__проверка--${x.статус === 'напряжение' ? 'напр' : 'год'}`}>
                          <strong>{СТАТУС[x.статус]}:</strong> {x.текст}{' '}
                          {x.стихи.map((s) => (
                            <АдресКн ссылка={s} />
                          ))}
                        </p>
                      ))}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
        <div class="правители__прочее">
          <h3 class="т-повествование" id="напряжения-з">
            Где числа не сходятся
          </h3>
          <ul>
            {П.проверки
              .filter((x) => x.статус === 'напряжение')
              .map((x) => (
                <li class="т-интерфейс">
                  {x.текст}{' '}
                  {x.стихи.map((s) => (
                    <АдресКн ссылка={s} />
                  ))}
                </li>
              ))}
          </ul>
          <p class="т-интерфейс">Библия прямо не говорит, правили ли цари вместе. Так считают некоторые учёные, чтобы сошлись числа Библии.</p>
        </div>
        <p class="т-адрес">
          Выбор царя — кнопкой в клетке. Первый воцарившийся в главах — {первый.имя} (<АдресКн ссылка="4Цар 15:1" />).
        </p>
      </div>
      {выбран && <ЛистЦаря k={выбран} П={П} />}
    </div>
  );
}
const текстКлетки = (цари: Царь[], y: number, ц: 'Иудея' | 'Израиль') =>
  цари
    .filter((k) => k.царство === ц)
    .map((k) => ({ k, n: годЦаря(k, y) }))
    .filter((x) => x.n !== null)
    .map(({ k, n }) => `${k.имя.split(',')[0]}, ${k.месяцев ? `${k.месяцев} мес.` : `${n}-й год`}`)
    .join('; ');

function ЛистЦаря({ k, П }: { k: Царь; П: ReturnType<typeof правители> }) {
  const r = маршрут.value;
  const закрыть = () => {
    const { sel: _s, ...rest } = r.params;
    void _s;
    router.clearLevel2({ ...r, params: rest });
  };
  useEffect(() => открыто(закрыть, null), [r]);
  const т = схема('s-thiele');
  const строка = т?.table?.find((x) => x.king === k.id) as { coregencyStart?: number; soleStart?: number; end: number } | undefined;
  const своё = ИМЯ_В_СТИХЕ[k.id];
  const проверки = П.проверки.filter((x) => x.текст.includes(k.имя.split(',')[0]));
  return (
    <aside class="лист-времени" aria-labelledby="лист-з" data-key={`chrono:${k.id} actor:${k.id}`}>
      <div class="лист-времени__верх">
        <h2 class="т-h2" id="лист-з">
          {k.имя}
        </h2>
        <button class="кн" type="button" onClick={закрыть}>
          <Значок имя="закрыть" />
          Закрыть лист
        </button>
      </div>
      <p class="т-интерфейс">Царство: {k.царство}.</p>
      {своё && (
        <p class="т-интерфейс">
          Так он назван в стихе воцарения <АдресКн ссылка={своё.стих} />; имя карточки — {имя(k.id)}.
        </p>
      )}
      <ul class="цепочка">
        {k.стихЛет && (
          <li class="т-интерфейс">
            Царствовал: {k.месяцев ? `${k.месяцев} мес.` : лет(k.лет)} <АдресКн ссылка={k.стихЛет} />
          </li>
        )}
        {k.стихВоцарения && (
          <li class="т-интерфейс">
            Воцарение: <АдресКн ссылка={k.стихВоцарения} />
          </li>
        )}
        {проверки.map((x) => (
          <li class="т-интерфейс">
            <strong>{СТАТУС[x.статус]}:</strong> {x.текст}{' '}
            {x.стихи.map((s) => (
              <АдресКн ссылка={s} />
            ))}
          </li>
        ))}
      </ul>
      {слой2() && строка && (
        <p class="т-адрес">
          По Тиле (справка, s-thiele): {строка.coregencyStart ? `соправление с ${yearLabel(строка.coregencyStart)}, единолично с ` : ''}
          {yearLabel(строка.soleStart ?? строка.end)} — {yearLabel(строка.end)}; таблица атласа, близкая к Тиле; страница не сверена.
        </p>
      )}
      <p>
        <a class="ссылка-ряд" href={href({ screen: 'kartochka', id: k.id, params: {} })}>
          Карточка: {имя(k.id)}
        </a>
      </p>
    </aside>
  );
}

