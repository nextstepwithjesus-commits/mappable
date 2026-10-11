/**
 * Инструмент «Время» (04) — рабочий прототип на данных пакета: три вида одного набора.
 *  - «Жизни» (§ 3.3): строки лиц на общей оси, `treegrid` (§ 8.2): ↑ ↓ по строкам, → ← раскрыть и свернуть группу, Enter —
 *    выбрать (уровень 2, лист справа); сплошная полоса — длина по числам текста или вывод из двух стихов, полая — расчёт.
 *    Сцена 1.14: родословие Адама — Аврама (Быт 5; 11) в эпохах 1–2; счёт лет — от сотворения Адама; годы — второй слой.
 *  - «События» (§ 4): истории каталога на нити «порядка» — «Так рассказывает Библия. Это порядок, а не годы»; при
 *    приближении — части выбранной истории (В-21). Сцена 1.15 «Исход»: историй Исх 12–15 в базе нет — честная строка.
 *  - «Правители» (§ 15): синхронистическая таблица 4 Цар 15–18 — номер года царствования в столбце царства, имя при
 *    воцарении, синхронизмы со стихом; APG Grid: стрелки по клеткам. Годы — реконструкция базы, справочно (эскиз: таблиц
 *    McFall — Young и Тиле с изданием и страницей нет).
 * Указатель эпох — 16 равных клеток не в масштабе, одна остановка Tab (APG Toolbar); строка «Сейчас» — описание шкалы.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Д, загружено, имя, статус } from '../общее/данные.ts';
import { адрес } from '../общее/адреса.ts';
import { слой2 } from '../общее/настройки.ts';
import { объявить, вБуфер, число, открыто } from '../общее/службы.ts';
import { маршрут, сВидом, href, router, шагОтмены } from '../общее/приложение.ts';
import { Значок } from '../общее/знаки.tsx';
import { КнНазад, ПереключательСлоя, АдресКн, Меню, Эскиз, Вывод } from '../общее/компоненты.tsx';
import { жизнь, царствования, type Жизнь } from './модель.ts';
import { эпохиСсылки } from './образ.tsx';
import { yearLabel } from '../../../core/years.ts';
import type { Epoch, Story } from '../общее/типы.ts';

type Вид = 'lives' | 'events' | 'rulers';
const ВИДЫ: [Вид, string][] = [
  ['lives', 'Жизни'],
  ['events', 'События'],
  ['rulers', 'Правители'],
];
/** Группы строк (04 § 3.3): состав — по данным; «Родословие Адама — Аврама» — по рёбрам и числам Быт 5; 11. */
const ГРУППЫ: Record<string, { имя: string; лица: () => string[] }> = {
  rod: { имя: 'Родословие: от Адама до Аврама (Быт 5; 11)', лица: () => ['p-adam', 'p-sif', 'p-enos', 'p-kainan', 'p-maleleil', 'p-iared', 'p-enokh', 'p-mafusal', 'p-lamekh', 'p-noy', 'p-sim', 'p-arfaksad', 'p-sala', 'p-ever', 'p-falek', 'p-ragav', 'p-serukh', 'p-nakhor', 'p-farra', 'p-avraam'] },
  key: { имя: 'Главные лица эпохи', лица: () => [] },
};

export function Время() {
  void загружено.value;
  const r = маршрут.value;
  const sel = r.params.sel;
  const селИстория = sel?.startsWith('e-') ? Д.stories.get(sel) : undefined;
  const вид: Вид = (r.params.view as Вид) || (селИстория ? 'events' : 'lives');
  const эпоха = Д.epochs.find((e) => e.id === r.params.e) ?? (вид === 'rulers' ? Д.epochs.find((e) => e.id === 'era-divided')! : undefined);
  const z = Math.max(0, Math.min(5, Number(r.params.z ?? 0) || 0));
  const заголовок = селИстория ? `${селИстория.title.short} — Время` : sel?.startsWith('p-') ? `${имя(sel)} — Время` : 'Время';
  const сменитьВид = (v: Вид) => {
    сВидом({ view: v }, `вид «${ВИДЫ.find((x) => x[0] === v)?.[1]}»`);
    объявить(`Вид: ${ВИДЫ.find((x) => x[0] === v)?.[1]}`);
  };
  const tabs = useRef<HTMLDivElement>(null);
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
              aria-selected={вид === v}
              aria-controls="время-вид"
              tabIndex={вид === v ? 0 : -1}
              onClick={() => сменитьВид(v)}
              onKeyDown={(e) => {
                const n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : -1;
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
            <button class="кн" type="button" onClick={() => { сВидом({ z: String(z + 1) }, 'крупнее'); объявить('Крупнее'); }} disabled={z >= 5}>
              <Значок имя="крупнее" />
              Крупнее
            </button>
            <button class="кн" type="button" onClick={() => { сВидом({ z: z > 1 ? String(z - 1) : undefined }, 'мельче'); объявить('Мельче'); }} disabled={z <= 0}>
              <Значок имя="мельче" />
              Мельче
            </button>
          </span>
        )}
        <ПереключательСлоя />
        <Меню
          подпись={<><Значок имя="действия" />Ещё<span class="скрыто"> действия: Время</span></>}
          имя="Ещё действия: Время"
          пункты={[
            { т: шагОтмены.value.undo ? `Отменить шаг: ${шагОтмены.value.undo}` : 'Отменить шаг', зн: 'отменить', on: () => router.undo(), скрыт: !шагОтмены.value.undo },
            { т: шагОтмены.value.redo ? `Вернуть шаг: ${шагОтмены.value.redo}` : 'Вернуть шаг', зн: 'вернуть', on: () => router.redo(), скрыт: !шагОтмены.value.redo },
            { т: 'Крупнее', зн: 'крупнее', on: () => сВидом({ z: String(z + 1) }, 'крупнее'), скрыт: вид === 'rulers' || z >= 5 },
            { т: 'Мельче', зн: 'мельче', on: () => сВидом({ z: z > 1 ? String(z - 1) : undefined }, 'мельче'), скрыт: вид === 'rulers' || z <= 0 },
            { т: 'Ссылка на это место', зн: 'ссылка', on: () => void вБуфер(location.href, null, 'ссылка на это место') },
            { т: 'Клавиши шкалы', зн: 'справка', on: () => объявить('Клавиши: стрелки вверх и вниз — по строкам; вправо и влево — раскрыть и свернуть группу; Enter — выбрать; Esc — закрыть лист') },
            { т: 'Печать', зн: 'печать', on: () => print() },
          ]}
        />
      </div>
      <УказательЭпох текущие={вид === 'rulers' ? ['era-divided', 'era-judah-alone'] : окноЭпох(вид, эпоха, селИстория).map((e) => e.id)} />
      <h2 class="скрыто">Шкала</h2>
      <p class="строка-сейчас т-интерфейс">
        Сейчас: {(вид === 'rulers' ? ['Два царства', 'Иудея одна'] : окноЭпох(вид, эпоха, селИстория).map((e) => e.short)).join(' — ')}. Место на ленте — примерное.
        {слой2() && <span class="т-адрес"> Годы — расч.: по числам Быт 5; 11 от сотворения Адама; цари — реконструкция базы, справочно.</span>}
      </p>
      <p class="голос-мы эскиз только-телефон">
        <strong>эскиз: </strong>на телефоне шкала по 04 § 8.1 вертикальная; здесь — та же горизонтальная, сжатая.
      </p>
      <div id="время-вид" role="tabpanel" class="время__вид">
        {вид === 'lives' && <Жизни эпоха={эпоха} z={z} />}
        {вид === 'events' && <События эпоха={эпоха} z={z} история={селИстория} />}
        {вид === 'rulers' && <Правители />}
      </div>
    </div>
  );
}

function окноЭпох(вид: Вид, эпоха: Epoch | undefined, история?: Story): Epoch[] {
  if (история && вид === 'events') {
    const xs = эпохиСсылки(история.accounts[0]?.refs[0] ?? '');
    if (xs.length) return xs;
  }
  if (эпоха) return [эпоха];
  return Д.epochs.filter((e) => e.id === 'era-antediluvian' || e.id === 'era-postdiluvian');
}

/** Указатель эпох (04 § 3.1; 08 § 7.5.1, вариант 2): 16 равных клеток, имена в два ряда; APG Toolbar — одна остановка Tab. */
function УказательЭпох({ текущие }: { текущие: string[] }) {
  const [фокус, setФокус] = useState(Math.max(0, Д.epochs.findIndex((e) => текущие.includes(e.id))));
  const ref = useRef<HTMLDivElement>(null);
  const [лист, setЛист] = useState(false);
  const кн = useRef<HTMLButtonElement>(null);
  useEffect(() => (лист ? открыто(() => setЛист(false), кн.current) : undefined), [лист]);
  const перейти = (e: Epoch) => {
    сВидом({ e: e.id, z: undefined }, `эпоха «${e.short}»`);
    объявить(`Эпоха: ${e.name}`);
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
      <nav class="указатель-эпох" aria-label="Эпохи, не в масштабе">
        <span class="указатель-эпох__масштаб т-адрес" aria-hidden="true">
          не в масштабе
        </span>
        <div class="указатель-эпох__клетки" role="toolbar" aria-label="Эпохи, не в масштабе" ref={ref} onKeyDown={key}>
          {Д.epochs.map((e, i) => (
            <button
              type="button"
              class={`указатель-эпох__клетка${i % 2 ? ' указатель-эпох__клетка--низ' : ''}${текущие.includes(e.id) ? ' указатель-эпох__клетка--тек' : ''}${e.id === 'era-intertestamental' ? ' указатель-эпох__клетка--тихая' : ''}${i === Д.epochs.length - 1 ? ' указатель-эпох__клетка--разрыв' : ''}`}
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

function Жизни({ эпоха, z }: { эпоха?: Epoch; z: number }) {
  const r = маршрут.value;
  const грп = (r.params.grp ?? 'rod').split(',').filter(Boolean);
  const keyPersons = эпоха?.keyPersons ?? Д.epochs.find((e) => e.id === 'era-antediluvian')?.keyPersons ?? [];
  const [закрыты, setЗакрыты] = useState<Set<string>>(new Set());
  const доп = (r.params.p ?? '').split(',').filter(Boolean);
  const ряды: Ряд[] = [];
  const группы: [string, string, string[]][] = [];
  if (доп.length) группы.push(['p', 'Сравнение', доп]);
  if (!эпоха || ['era-antediluvian', 'era-postdiluvian'].includes(эпоха.id)) {
    if (грп.includes('rod')) группы.push(['rod', ГРУППЫ.rod.имя, ГРУППЫ.rod.лица()]);
  }
  if (эпоха && !['era-antediluvian', 'era-postdiluvian'].includes(эпоха.id)) группы.push(['key', `Главные лица эпохи «${эпоха.short}»`, keyPersons]);
  for (const [k, n, ids] of группы) {
    const раскрыта = !закрыты.has(k);
    ряды.push({ тип: 'группа', ключ: k, имя: n, уровень: 1, раскрыта, n: ids.length });
    if (раскрыта) for (const id of ids) ряды.push({ тип: 'лицо', ключ: id, имя: имя(id), уровень: 2, лицо: жизнь(id) });
  }
  // окно: эпоха или все лица группы; ширина оси растёт с масштабом — сдвиг родной прокруткой (09 § 3.2.2)
  const лица = ряды.filter((x) => x.лицо).map((x) => x.лицо!);
  const есть = лица.filter((x) => x.от !== undefined || x.до !== undefined);
  const от = эпоха ? Math.min(эпоха.start, ...есть.map((x) => x.от ?? x.до!)) : Math.min(...есть.map((x) => x.от ?? x.до!), -4174);
  const до = эпоха ? Math.max(эпоха.end, ...есть.map((x) => x.до ?? x.от!)) : Math.max(...есть.map((x) => x.до ?? x.от!), -1991);
  const sel = r.params.sel?.startsWith('p-') ? r.params.sel : undefined;
  const [фокус, setФокус] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const выбрать = (id: string) => {
    router.go({ ...r, params: { ...r.params, sel: id } });
    объявить(`Выбрано: ${имя(id)}`);
  };
  const key = (e: KeyboardEvent) => {
    let i = фокус;
    const row = ряды[фокус];
    if (e.key === 'ArrowDown') i = Math.min(ряды.length - 1, фокус + 1);
    else if (e.key === 'ArrowUp') i = Math.max(0, фокус - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ряды.length - 1;
    else if (e.key === 'PageDown') i = Math.max(фокус + 1, ряды.findIndex((x, j) => j > фокус && x.тип === 'группа'));
    else if (e.key === 'PageUp') i = Math.max(0, ряды.map((x, j) => (j < фокус && x.тип === 'группа' ? j : -1)).reduce((a, b) => Math.max(a, b), 0));
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
    } else return;
    e.preventDefault();
    setФокус(i);
    requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLElement>('[role="row"]')[i]?.focus());
  };
  const масштаб = 2 ** z;
  const x = (y: number) => ((y - от) / (до - от)) * 100;
  const деления = делениеОси(от, до, z);
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        {слой2() && (
          <div class="ось-лет" aria-hidden="true" style={{ '--масштаб': масштаб }}>
            <div class="ось-лет__ряд" style={{ width: `${100 * масштаб}%` }}>
              {деления.map((y) => (
                <span class="ось-лет__метка" style={{ left: `${x(y)}%` }}>
                  {y <= -4174 + 2500 && y >= -4174 ? `${y - -4174} от Адама` : yearLabel(y, { era: false })}
                </span>
              ))}
            </div>
          </div>
        )}
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
                    {row.имя} — {row.n}
                  </>
                ) : (
                  row.имя
                )}
              </span>
              <span role="gridcell" class="жизни__полоса-место" hidden={row.тип === 'группа'}>
                {row.лицо && <Полоса ж={row.лицо} x={x} масштаб={масштаб} />}
              </span>
            </div>
          ))}
        </div>
        <p class="т-адрес подпись-шкалы">
          {слой2() ? 'Сплошная полоса — длина по числам текста или вывод из двух стихов; полая — расчёт. Деления — годы от сотворения Адама (расч.) и до Р. Х.' : 'Длина полосы — сколько лет он жил по словам Библии. Сколько лет назад это было, Библия не говорит: место на ленте — примерное.'}
        </p>
        <КтоЕщё эпоха={эпоха} />
      </div>
      {sel && <ЛистЛица id={sel} />}
    </div>
  );
}

function делениеОси(от: number, до: number, z: number): number[] {
  const span = (до - от) / 2 ** z;
  const шаг = [1, 5, 10, 50, 100, 500, 1000].find((s) => span / s <= 12) ?? 1000;
  const out: number[] = [];
  for (let y = Math.ceil(от / шаг) * шаг; y <= до; y += шаг) if (y !== 0) out.push(y);
  return out;
}

function Полоса({ ж, x, масштаб }: { ж: Жизнь; x: (y: number) => number; масштаб: number }) {
  if (ж.от === undefined && ж.до === undefined) return <span class="голос-мы жизни__нет">{ж.нет}</span>;
  if (ж.опора && !слой2()) return <span class="голос-мы жизни__нет">Сколько лет назад это было, Библия не говорит. Годы — у изучающих.</span>;
  const a = ж.от ?? ж.до!;
  const b = ж.до ?? ж.от!;
  return (
    <span class="жизни__холст" style={{ width: `${100 * масштаб}%` }}>
      <span class={`жизни__полоса${ж.сплошная ? '' : ' жизни__полоса--полая'}${ж.до === undefined ? ' жизни__полоса--открыта' : ''}`} style={{ left: `${x(a)}%`, width: `${Math.max(0.4, x(b) - x(a))}%` }} />
    </span>
  );
}

function ЛистЛица({ id }: { id: string }) {
  const ж = жизнь(id);
  const r = маршрут.value;
  const ref = useRef<HTMLElement>(null);
  const закрыть = () => {
    const { sel: _s, ...rest } = r.params;
    void _s;
    router.clearLevel2({ ...r, params: rest });
    requestAnimationFrame(() => document.getElementById(`ряд-${id}`)?.focus());
  };
  useEffect(() => открыто(закрыть, null), [id]);
  const цепочка = ж.цепочка.map((z) => `${z.text} (${адрес(z.refs)})`).join('\n');
  return (
    <aside class="лист-времени" aria-labelledby="лист-з" ref={ref} data-key={`${ж.ключ} actor:${id}`}>
      <div class="лист-времени__верх">
        <h2 class="т-h2" id="лист-з">
          {ж.имя}
        </h2>
        <button class="кн" type="button" onClick={закрыть}>
          <Значок имя="закрыть" />
          Закрыть лист
        </button>
      </div>
      {ж.нет ? (
        <p class="т-проза">{ж.нет}.</p>
      ) : (
        <>
          <ol class="цепочка">
            {ж.цепочка.map((z) => (
              <li class="т-интерфейс">
                {z.text}{' '}
                {z.refs.map((x) => (
                  <АдресКн ссылка={x} />
                ))}
                {z.cert === 'inference' && <Вывод cert="inference" />}
                {z.cert === 'calc' && <span class="пометка">расч.</span>}
              </li>
            ))}
          </ol>
          {слой2() && (
            <p class="т-адрес">
              {ж.amОт !== undefined && `От сотворения Адама: ${ж.amОт}–${ж.amДо ?? '…'} (расч.). `}
              {ж.от !== undefined && `Годы: ${yearLabel(ж.от)} — ${ж.до !== undefined ? yearLabel(ж.до) : '…'} (расч.${ж.опора ? '; источник опоры не указан' : ': от начала эпохи 1 в базе'}).`}
            </p>
          )}
          {слой2() && (
            <button class="кн кн--текст" type="button" onClick={() => void вБуфер(`${ж.имя}\n${цепочка}\n(Синодальный перевод; расчёт — Библия наглядно, проба ${Д.proto.base})`, null, `цепочка расчёта: ${ж.имя}`)}>
              <Значок имя="копировать" />
              Копировать цепочку расчёта<span class="скрыто">: {ж.имя}</span>
            </button>
          )}
        </>
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
  const ids = (e.keyPersons ?? []).filter((id) => !(r.params.p ?? '').split(',').includes(id));
  if (!ids.length) return null;
  return (
    <div class="кто-ещё">
      <button class="кн кн--текст" type="button" aria-expanded={откр} aria-controls="кто-ещё" onClick={() => setОткр(!откр)}>
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
  const выбрать = (s: Story) => {
    router.go({ ...r, params: { ...r.params, sel: s.id } });
    объявить(`Выбрано: ${s.title.short}`);
  };
  const исход = ids.has('era-exodus');
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        <p class="нить__подпись т-интерфейс">{слой2() ? 'Порядок по тексту — не годы.' : 'Так рассказывает Библия. Это порядок, а не годы.'}</p>
        {все.length === 0 ? (
          <>
            <p class="т-проза">{исход ? 'Истории книги Исход мы ещё не составили: в каталоге пакета их нет.' : 'В этом окне историй каталога пока нет.'}</p>
            {исход && (
              <Эскиз>
                сцена «Исход» (Исх 12–15) требует историй Исход 12–15 (данные И3); пока здесь только главные лица эпохи —{' '}
                <a href={href({ screen: 'vremya', params: { view: 'lives', e: 'era-exodus' } })}>в виде «Жизни»</a>.
              </Эскиз>
            )}
          </>
        ) : (
          <ol class="нить" aria-label="Истории по порядку текста">
            {все.map((s) => (
              <li class={`нить__бусина${s.id === история?.id ? ' нить__бусина--выбрана' : ''}`} data-key={`story:${s.id}`}>
                <button type="button" class="нить__кнопка" aria-pressed={s.id === история?.id} onClick={() => выбрать(s)} id={`бусина-${s.id}`}>
                  <span class="нить__знак" aria-hidden="true" />
                  <span class="нить__имя">{s.title.short}</span>
                  <span class="т-адрес">{адрес(s.accounts[0].refs)}</span>
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
        {история?.parts?.length && z < 1 ? <p class="т-адрес">Части истории видны при приближении: «Крупнее».</p> : null}
        <Эскиз>дорожки участников (04 § 4.4), ступени значимости и годы историй по сети — после модели Д6; даты текста у частей потопа («во второй месяц, в семнадцатый… день», Быт 7:11) — после разметки времени частей.</Эскиз>
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
  useEffect(() => открыто(закрыть, null), [s.id]);
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
          Когда: <q class="голос-библия-в-строке">«{s.time.said.text}»</q> <АдресКн ссылка={s.time.said.refs[0]} />
        </p>
      ) : (
        <p class="голос-мы">Сколько лет назад это было, мы ещё не посчитали.</p>
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

// ---------- «Правители» (04 § 15) ----------
function Правители() {
  const от = -760;
  const до = -686;
  const ц = царствования(от, до);
  const иуд = ц.filter((x) => x.over === 'Иудея');
  const изр = ц.filter((x) => x.over === 'Израиль');
  const годы = Array.from({ length: до - от + 1 }, (_, i) => от + i);
  const [фок, setФок] = useState<[number, number]>([0, 1]);
  const t = useRef<HTMLTableElement>(null);
  const r = маршрут.value;
  const sel = r.params.sel;
  const клетка = (y: number, xs: typeof ц): ComponentChildren => {
    const на = xs.filter((x) => y >= x.start && y <= x.end);
    if (!на.length) return <span class="т-адрес">—</span>;
    return на.map((k) => {
      const n = y - k.start + 1;
      const первый = y === k.start || y === от;
      const синх = первый ? k.sync?.[0] : undefined;
      return (
        <span class={`правитель${первый ? ' правитель--воцарение' : ''}${k.id === sel ? ' правитель--выбран' : ''}`} data-key={первый ? `chrono:${k.id} actor:${k.id}` : undefined}>
          {первый && <span class="правитель__имя">{k.имя}</span>}
          <span class="правитель__год">{n}-й год</span>
          {синх && слой2() && (
            <span class="т-адрес">
              {' '}
              — в {синх.year}-й год {имя(синх.with)} ({адрес(синх.refs)})
            </span>
          )}
        </span>
      );
    });
  };
  const key = (e: KeyboardEvent) => {
    let [rI, cI] = фок;
    if (e.key === 'ArrowDown') rI = Math.min(годы.length - 1, rI + 1);
    else if (e.key === 'ArrowUp') rI = Math.max(0, rI - 1);
    else if (e.key === 'ArrowRight') cI = Math.min(2, cI + 1);
    else if (e.key === 'ArrowLeft') cI = Math.max(слой2() ? 0 : 1, cI - 1);
    else if (e.key === 'PageDown') rI = Math.min(годы.length - 1, rI + 10);
    else if (e.key === 'PageUp') rI = Math.max(0, rI - 10);
    else if (e.key === 'Home') cI = слой2() ? 0 : 1;
    else if (e.key === 'End') cI = 2;
    else if (e.key === 'Enter') {
      const y = годы[rI];
      const k = (cI === 1 ? иуд : изр).find((x) => y >= x.start && y <= x.end);
      if (k) {
        router.go({ ...r, params: { ...r.params, sel: k.id } });
        объявить(`Выбрано: ${k.имя}`);
      }
      return;
    } else return;
    e.preventDefault();
    setФок([rI, cI]);
    requestAnimationFrame(() => t.current?.querySelector<HTMLElement>(`[data-rc="${rI}-${cI}"]`)?.focus());
  };
  const выбран = ц.find((x) => x.id === sel);
  return (
    <div class="время__раскладка">
      <div class="время__шкала">
        <Эскиз>годы — реконструкция базы без названной схемы; таблиц McFall — Young и Тиле с изданием и страницей в базе нет (04 § 16.1), поэтому сравнения схем нет. Номера годов царствований и синхронизмы — со стихами.</Эскиз>
        <p class="т-интерфейс">Цари Иудеи и Израиля, 4 Цар 15–18. {!слой2() && 'Годы до Р. Х. — у изучающих; здесь — год царствования каждого царя.'}</p>
        <div class="таблица-обёртка правители-обёртка" role="region" aria-label="Правители: прокрутка таблицы" tabIndex={-1}>
          <table class="таблица правители" role="grid" aria-label="Правители: цари Иудеи и Израиля, 4 Цар 15–18" ref={t} onKeyDown={key}>
            <thead>
              <tr>
                {слой2() && <th scope="col">Год (расч.)</th>}
                <th scope="col">Иудея</th>
                <th scope="col">Израиль</th>
              </tr>
            </thead>
            <tbody>
              {годы.map((y, rI) => (
                <tr>
                  {слой2() && (
                    <th scope="row" class="цифры" tabIndex={фок[0] === rI && фок[1] === 0 ? 0 : -1} data-rc={`${rI}-0`}>
                      {yearLabel(y, { era: false })}
                    </th>
                  )}
                  {[иуд, изр].map((xs, k) => (
                    <td role="gridcell" tabIndex={фок[0] === rI && фок[1] === k + 1 ? 0 : -1} data-rc={`${rI}-${k + 1}`}>
                      {клетка(y, xs)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="т-адрес">Стрелки — по клеткам; Enter — выбрать царя; PageUp и PageDown — на 10 лет.</p>
      </div>
      {выбран && <ЛистЦаря k={выбран} />}
    </div>
  );
}

function ЛистЦаря({ k }: { k: ReturnType<typeof царствования>[number] }) {
  const r = маршрут.value;
  const закрыть = () => {
    const { sel: _s, ...rest } = r.params;
    void _s;
    router.clearLevel2({ ...r, params: rest });
  };
  useEffect(() => открыто(закрыть, null), [k.id]);
  return (
    <aside class="лист-времени" aria-labelledby="лист-з" data-key={`chrono:${k.id} actor:${k.id}`}>
      <div class="лист-времени__верх">
        <h2 class="т-h2" id="лист-з">
          {k.имя}, царь {k.over === 'Иудея' ? 'Иудеи' : 'Израиля'}
        </h2>
        <button class="кн" type="button" onClick={закрыть}>
          <Значок имя="закрыть" />
          Закрыть лист
        </button>
      </div>
      <ul class="цепочка">
        {k.years !== undefined && (
          <li class="т-интерфейс">
            Царствовал: {число(k.years, ['год', 'года', 'лет'])} <АдресКн ссылка={k.refs[0]} />
          </li>
        )}
        {k.ageAtStart !== undefined && <li class="т-интерфейс">Воцарился в {число(k.ageAtStart, ['год', 'года', 'лет'])}</li>}
        {k.sync?.map((s) => (
          <li class="т-интерфейс">
            Воцарился в {s.year}-й год царя {имя(s.with)} <АдресКн ссылка={s.refs[0]} />
            {s.note && слой2() && <p class="т-адрес">{s.note}</p>}
          </li>
        ))}
      </ul>
      {слой2() && <p class="т-адрес">Годы: {yearLabel(k.start)} — {yearLabel(k.end)} (реконструкция базы, справочно; схема не названа).</p>}
      <p>
        <a class="ссылка-ряд" href={href({ screen: 'kartochka', id: k.id, params: {} })}>
          Карточка: {k.имя}
        </a>
      </p>
    </aside>
  );
}
