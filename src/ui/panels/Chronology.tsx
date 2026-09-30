/**
 * Панель «О хронологии» (этап 13, решение 102; X2 § 2.7, макет x2-m4): как читать годы атласа, почему Рождество —
 * «ок. 5 г. до Р. Х.», откуда годы (цепочка от опоры 967 г. до Адама, звенья модели обведены пунктиром), таблица моделей,
 * шкала лет, внебиблейские опоры и хронологические напряжения. Ссылки «см. «О хронологии»» в тексте атласа открывают её
 * (ChronoText, openChronology).
 */
import type { ComponentChildren } from 'preact';
import { anchors, byId, modelInfo, models } from '../../data/atlas.ts';
import { model, modelId, panel, rulerScale } from '../../state.ts';
import { skyRef } from '../common.tsx';
import { Refs, VerseInsert } from '../common.tsx';
import { dateText, lastText, lifeText, spanText, toAstro, type LifeDates } from '../../engine/years.ts';
import { DEFAULT_MODEL, factsOf, modelShort, type ModelEvent } from '../modelinfo.ts';
import { Sheet } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import '../../styles/chronology.css';

/** Открыть панель «О хронологии» (ссылки «см. «О хронологии»» в листе «Эпохи», карточке, «О карте»). */
export function openChronology() {
  panel.value = 'chronology';
}

/**
 * Текст, в котором «О хронологии» (в кавычках) — ссылка на панель: «… (см. «О хронологии»)». Остальное — как есть,
 * в русской типографике.
 */
export function ChronoText({ text }: { text: string }) {
  // типографика связывает «О» со следующим словом неразрывным пробелом
  const parts = typo(text).split(/(«О[\s\u00a0]хронологии»)/);
  if (parts.length === 1) return <>{parts[0]}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <button key={i} type="button" class="link chrono-link" onClick={openChronology}>
            «О хронологии»
          </button>
        ) : (
          p
        ),
      )}
    </>
  );
}

/**
 * Шкала лет линейки (ТЗ § 3.4; решение 102): «до / по Р. Х.», «от сотворения» (по числам Быт 5; 11 выбранной модели,
 * расч.), «византийская эра» (справ.). Выбор запоминается (src/state.ts, rulerScale); линейка перерисовывается сразу.
 * Тот же переключатель — в листе «Вид» → «Шкала лет» (src/ui/sky/Controls.tsx).
 */
const ERAS = [
  { value: 'ad', label: 'до / по Р. Х.', title: 'Годы до и после Рождества Христова' },
  {
    value: 'am',
    label: 'от сотворения',
    title: 'Лет от сотворения Адама — по числам Быт 5; 11 выбранной модели (расч.); в основной модели сотворение — 4174 г. до Р. Х.',
  },
  { value: 'byz', label: 'византийская эра', title: 'Византийская эра: счёт от 5508 г. до Р. Х., принятый в России до 1700 г., — справочно, не числа Писания' },
] as const;
export function EraSwitch() {
  const v = rulerScale.value;
  return (
    <div class="seg era" role="group" aria-label="Шкала лет на линейке неба">
      {ERAS.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === v}
          title={typo(o.title)}
          aria-description={typo(o.title)}
          onClick={() => {
            rulerScale.value = o.value;
            skyRef.redraw();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Помета на поле строки: «расч.», «справ.» — с пояснением для диктора. */
function M({ k, full }: { k: string; full: string }) {
  return (
    <abbr class="mark" title={full} aria-label={`${k} — ${full}`}>
      {k}
    </abbr>
  );
}

const A = toAstro;
/** Годы опорного события во всех моделях: «2166 или 1951»; год выбранной модели — выделен. */
function eventYears(e: ModelEvent): { text: ComponentChildren; dep: boolean } {
  const seen: number[] = [];
  const cur = factsOf(modelId.value)?.years?.[e];
  for (const m of modelInfo) {
    const y = factsOf(m.id)?.years?.[e];
    if (y !== undefined && !seen.includes(y)) seen.push(y);
  }
  const dep = seen.length > 1;
  return {
    dep,
    text: (
      <>
        {seen.map((y, i) => (
          <span key={y}>
            {i ? (i === seen.length - 1 ? ' или ' : ', ') : ''}
            {y === cur && dep ? <b>{Math.abs(y)}</b> : Math.abs(y)}
          </span>
        ))}{' '}
        {typo('г. до Р. Х.')}
      </>
    ),
  };
}

/** Звено цепочки «Откуда годы»: узел — событие с годами, связь — числа текста со стихом. dep — меняется с моделью. */
type Link = { nums: string; refs: string[]; note?: string; dep: boolean };
const LINKS: Record<string, Link> = {
  'exodus-967': { nums: '479 лет: 4-й год Соломона — «в четыреста восьмидесятом году» от Исхода', refs: ['3Цар 6:1'], dep: false },
  'egypt-exodus': { nums: '430 лет в Египте (основной текст) или 215 (430 лет — от прихода Авраама в Ханаан, скобка текста)', refs: ['Исх 12:40', 'Гал 3:17'], dep: true },
  'abram-egypt': { nums: '100 + 60 + 130 лет: Авраам при рождении Исаака, Исаак при рождении Иакова, Иаков при приходе в Египет', refs: ['Быт 21:5', 'Быт 25:26', 'Быт 47:9'], dep: false },
  'flood-abram': { nums: 'Быт 11: числа основного текста или в скобках; Фарре 130 лет при рождении Аврама или 70', refs: ['Быт 11:10-26', 'Быт 11:32', 'Быт 12:4', 'Деян 7:4'], dep: true },
  'adam-flood': { nums: 'Быт 5: числа основного текста (1656 лет до Потопа) или в скобках', refs: ['Быт 5:3-32', 'Быт 7:6'], dep: true },
};
const NODES: { e: ModelEvent; name: string; link?: string }[] = [
  { e: 'exodus', name: 'Исход', link: 'exodus-967' },
  { e: 'egypt', name: 'Иаков приходит в Египет', link: 'egypt-exodus' },
  { e: 'abram', name: 'рождение Аврама', link: 'abram-egypt' },
  { e: 'flood', name: 'Потоп', link: 'flood-abram' },
  { e: 'adam', name: 'сотворение Адама', link: 'adam-flood' },
];

/** Цепочка «Откуда годы»: от опоры 967 г. до Р. Х. назад по числам текста; звенья модели обведены пунктиром. */
function Chain() {
  const a967 = anchors.find((a) => a.id === 'solomon-4');
  return (
    <ol class="ychain" aria-label="Откуда годы: от опоры 967 г. до Р. Х. назад к Адаму">
      <li class="node anchor">
        <span class="yr">{typo(dateText({ t: A(a967?.value ?? -967) }))}</span>
        <span class="nm">{typo('4-й год Соломона — внебиблейская опора')}</span>
      </li>
      {NODES.map((n) => {
        const l = LINKS[n.link!];
        const y = eventYears(n.e);
        return [
          <li key={`l-${n.e}`} class={l.dep ? 'link dep' : 'link'}>
            <span class="nums">{typo(l.nums)}</span> <Refs refs={l.refs} owner={`ych-${n.e}`} />
            {l.dep && <span class="dep-note">{typo(' — зависит от модели')}</span>}
            <VerseInsert owner={`ych-${n.e}`} refs={l.refs} />
          </li>,
          <li key={`n-${n.e}`} class={y.dep ? 'node dep' : 'node'}>
            <span class="yr">{y.text}</span>
            <span class="nm">{typo(n.name)}</span>
          </li>,
        ];
      })}
    </ol>
  );
}

/** Строки таблицы моделей: опорные события, Давид (годы после Исхода) и число напряжений. */
const ROWS: { e: ModelEvent; name: string }[] = [
  { e: 'adam', name: 'Адам' },
  { e: 'flood', name: 'Потоп' },
  { e: 'abram', name: 'Аврам' },
  { e: 'egypt', name: 'Иаков в Египте' },
  { e: 'exodus', name: 'Исход' },
];
/** Годы Давида в модели: у модели по умолчанию — из её строки, в других — из modelDep, если они там иные. */
function davidIn(mid: string): string {
  const base = (models.find((x) => x.id === DEFAULT_MODEL) ?? models[0])?.chrono.get('david');
  const dep = byId.get('david')?.modelDep as Partial<Record<string, LifeDates>> | undefined;
  const c = mid !== DEFAULT_MODEL && dep?.[mid] ? dep[mid]! : base;
  // эра — одна для всей таблицы, в подписи под ней
  return c ? typo(lifeText(c)).replace(/[\s\u00a0]гг?\.[\s\u00a0]до[\s\u00a0]Р\.[\s\u00a0]Х\.$/, '') : '';
}

function ModelTable() {
  const cols = modelInfo.map((m) => factsOf(m.id)!).filter(Boolean);
  const base = factsOf(DEFAULT_MODEL);
  return (
    // на узком листе таблица прокручивается вбок — область в порядке Tab и с именем (WCAG 2.1.1; axe: scrollable-region-focusable)
    <div class="ytable-wrap" tabIndex={0} role="region" aria-label="Таблица моделей хронологии">
      <table class="ytable">
        <caption class="visually-hidden">Годы опорных событий по моделям хронологии, до Р. Х.</caption>
        <thead>
          <tr>
            <th scope="col">
              <span class="visually-hidden">Событие</span>
            </th>
            {cols.map((c) => (
              <th key={c.id} scope="col" class={c.id === modelId.value ? 'on' : undefined} aria-current={c.id === modelId.value ? 'true' : undefined}>
                {c.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.e}>
              <th scope="row">{r.name}</th>
              {cols.map((c) => {
                const y = c.years?.[r.e];
                const diff = y !== undefined && base?.years?.[r.e] !== undefined && y !== base.years[r.e];
                return (
                  <td key={c.id} class={[diff && 'diff', c.id === modelId.value && 'on'].filter(Boolean).join(' ') || undefined}>
                    {y === undefined ? '' : Math.abs(y)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th scope="row">Давид</th>
            {cols.map((c) => (
              <td key={c.id} class={c.id === modelId.value ? 'on' : undefined}>
                {davidIn(c.id)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Напряжений</th>
            {cols.map((c) => (
              <td key={c.id} class={[c.tensions !== base?.tensions && 'diff', c.id === modelId.value && 'on'].filter(Boolean).join(' ') || undefined}>
                {c.tensions ?? ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** «Как читать годы»: образцы записей — теми же функциями словаря, что пишут годы везде (engine/years.ts). */
function reading(): [ComponentChildren, string][] {
  const calc = <M k="расч." full="год вычислен атласом; откуда именно — в пояснении пометы у лица" />;
  return [
    ['«80 лет», «в 27-й год Иеровоама»', 'число сказано в Писании; при нём стих, пометы нет'],
    [<>{typo(dateText({ t: A(-1446) }))} {calc}</>, 'год вычислен атласом из чисел Писания от внебиблейской опоры (ниже); точность — до года внутри модели; «ок.» нет'],
    [typo(dateText({ t: A(-30), est: true, lo: A(-34), hi: A(-26) })), 'оценка: своих чисел Писание не даёт, год выведен из поколений, служения или встречи; «ок.» пишется только у оценок'],
    [typo(dateText({ t: A(-30), est: true, lo: A(-45), hi: A(-20) })), 'возможный промежуток оценки, если он шире 10 лет'],
    [typo(dateText({ t: A(-1880), est: true, lo: A(-1950), hi: A(-1876), pin: 'hi' })), 'оценка упирается в границу, которую ставит текст (Быт 46:8–27: вошли в Египет вместе с Иаковом)'],
    [typo(spanText({ t: A(-1040) }, { t: A(-970) })), 'от рождения до смерти'],
    [typo(spanText({ t: A(-5), approx: true }, { t: A(30), approx: true })), 'годы по разные стороны Рождества Христова: эра и «ок.» — у каждого конца'],
    [typo(`род. …; ${lastText(A(30))}`), 'о смерти Писание не говорит; след на небе идёт до последнего упоминания и тает'],
    ['время не установлено', 'опор для года нет; названы эпоха или встреча, при которой лицо упомянуто'],
    ['до Р. Х., по Р. Х.', 'эра от Рождества Христова; нулевого года нет: за 1 г. до Р. Х. сразу идёт 1 г. по Р. Х.'],
  ];
}

export function ChronologyPanel() {
  const m = model.value;
  const herod = anchors.find((a) => a.id === 'herod-death');
  const cur = factsOf(modelId.value);
  // поздние опоры — словами строки: «разрушение Иерусалима (586 г. до Р. Х.)»
  const later = (
    [
      ['jerusalem-fall', 'разрушение Иерусалима'],
      ['cyrus-decree', 'указ Кира'],
      ['herod-death', 'смерть Ирода'],
      ['crucifixion', 'распятие'],
    ] as const
  )
    .map(([id, name]) => ({ name, a: anchors.find((a) => a.id === id) }))
    .filter((x) => !!x.a);
  return (
    <Sheet title="О хронологии" lead="Как читать годы атласа, откуда они берутся и что меняет выбор модели.">
      <h3>Как читать годы</h3>
      <table class="yread">
        <thead>
          <tr>
            <th scope="col">Запись</th>
            <th scope="col">Что значит</th>
          </tr>
        </thead>
        <tbody>
          {reading().map(([k, v], i) => (
            <tr key={i}>
              <th scope="row">{typeof k === 'string' ? typo(k) : k}</th>
              <td>{typo(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{typo('Почему Рождество Христово — «ок. 5 г. до Р. Х.»')}</h3>
      <p>
        {typo(
          `Счёт лет «от Рождества Христова» ввели в VI веке, и начало эры поставили на несколько лет позже самого события. Писание говорит, что Иисус родился «во дни царя Ирода» (Мф 2:1), а Ирод умер в ${dateText({ t: A(herod?.value ?? -4) })} (внебиблейская опора). Поэтому на небе меридиан «Рождество Христово» стоит левее отметки «Р. Х.» на линейке.`,
        )}{' '}
        <M k="справ." full="справочный слой: не слова Писания" />
      </p>

      <h3>Откуда годы</h3>
      <p>
        {typo(
          'Писание считает время от события к событию. Чтобы получить годы до Р. Х., атлас берёт одну внебиблейскую опору — 4-й год Соломона, 967 г. до Р. Х., — и идёт от неё по числам текста назад. Звенья, которые зависят от модели, обведены пунктиром.',
        )}
      </p>
      <Chain />
      <p class="muted">
        {typo(
          `После 967 г. до Р. Х. годы царей — по реконструкции Тиле — Янга; дальше опоры — ${later.map((x) => `${x.name} (${dateText({ t: A(x.a!.value) })})`).join(', ')}. Эти годы одинаковы во всех моделях.`,
        )}
      </p>

      <h3>Модели</h3>
      <p>
        {typo(
          `Модель — это выбор чисел текста там, где Писание даёт два чтения. Сейчас выбрана «${cur?.name ?? ''}»; модель выбирается в листе «Вид» → «Хронология».`,
        )}
      </p>
      <ModelTable />
      <p class="muted">{typo('Годы — до Р. Х.; отличия от основной модели выделены.')}</p>
      <dl class="models">
        {modelInfo.map((mi) => (
          <div key={mi.id} class={mi.id === modelId.value ? 'on' : ''}>
            <dt>
              {typo(factsOf(mi.id)?.name ?? mi.name)}
              {mi.id === modelId.value ? (
                <span class="muted"> — выбрана</span>
              ) : (
                <>
                  {' '}
                  <button type="button" class="cmd" onClick={() => (modelId.value = mi.id)} aria-label={`Выбрать модель «${modelShort(mi.id)}»`}>
                    выбрать
                  </button>
                </>
              )}
            </dt>
            <dd>{typo(mi.description)}</dd>
          </div>
        ))}
      </dl>

      <h3>Шкала лет на линейке</h3>
      <p>
        {typo(
          'Годы на линейке неба подписываются тремя способами. «До / по Р. Х.» — как везде в атласе. «От сотворения» — лет от сотворения Адама по числам Быт 5; 11 выбранной модели; это расчёт атласа (в основной модели Потоп — 1656 г. от сотворения). «Византийская эра» — счёт от 5508 г. до Р. Х., принятый в России до 1700 г.; это справочная шкала, не числа Писания.',
        )}
      </p>
      <EraSwitch />

      <h3>Внебиблейские опоры</h3>
      <p class="muted">{typo('Абсолютные годы невозможны без внешних опор; ниже — принятые значения и другие мнения.')}</p>
      {/* на узком листе строка таблицы — блоком с подписями полей (MOB-51; WCAG 1.4.10): лист не ездит вбок */}
      <div class="anchors-wrap">
        <table class="anchors">
          <thead>
            <tr>
              <th scope="col">Событие</th>
              <th scope="col">Год</th>
              <th scope="col">Источник</th>
            </tr>
          </thead>
          <tbody>
            {anchors.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  {typo(a.event)}
                  <Refs refs={[a.verse]} owner={`yan${a.id}`} />
                  <VerseInsert owner={`yan${a.id}`} refs={[a.verse]} />
                </th>
                <td class="yr" data-label="Год">
                  <div>
                    <span class="nobr">{typo(dateText({ t: A(a.value) }))}</span>
                    {a.alternatives.length ? <div class="muted">или {typo(a.alternatives.map(anchorAlt).join('; '))}</div> : null}
                  </div>
                </td>
                <td class="muted" data-label="Источник">
                  <div>{typo(a.source)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Хронологические напряжения</h3>
      <p class="muted">
        {typo(
          `Места, где числа и границы текста не сходятся между собой или требуют необычной разницы поколений: ${m.tensions.length} в модели «${modelShort(m.id)}». Атлас их не сглаживает; у лиц они названы в § 13.`,
        )}
      </p>
      <ul class="notes">
        {m.tensions.slice(0, 80).map((t, i) => (
          <li key={i}>
            {typo(t.text)} <Refs refs={t.refs.slice(0, 3)} owner={`ytn${i}`} />
            <VerseInsert owner={`ytn${i}`} refs={t.refs.slice(0, 3)} />
          </li>
        ))}
      </ul>
      <div class="cmds">
        <button type="button" class="cmd" onClick={() => (panel.value = 'epochs')}>
          Эпохи и их основания
        </button>
      </div>
    </Sheet>
  );
}

/** Вариант опоры «-966 (Тиле)» → «966 г. до Р. Х. (Тиле)». */
export const anchorAlt = (s: string) => s.replace(/^(-?\d+)/, (y) => dateText({ t: A(Number(y)) }));
