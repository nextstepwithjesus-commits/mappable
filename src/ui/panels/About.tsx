import { anchors, modelInfo, volumes, groupById, builtAt } from '../../data/atlas.ts';
import { model, modelId, lineFlip, panel } from '../../state.ts';
import { Refs, VerseInsert, plural } from '../common.tsx';
import { formatYear, toAstro } from '../../engine/years.ts';
import { Sheet } from './Sheet.tsx';
import { num, typo } from '../text/typo.ts';

/** Год якоря по-человечески: «967 г. до Р. Х.»; в вариантах «-966 (Тиле)» → «966 г. до Р. Х. (Тиле)». */
export const anchorYear = (v: number) => formatYear(toAstro(v));
export const anchorAlt = (s: string) => s.replace(/^(-?\d+)/, (y) => anchorYear(Number(y)));
/** Дата сборки данных: «27 сентября 2026 г.» (без второй точки в конце предложения). */
export const builtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.?$/, '');

/** Пометы достоверности (ТЗ П-4, П-5): как они стоят на полях карточки, и что значат. */
const LEVELS: [string, string][] = [
  ['', 'прямо сказано в Писании'],
  ['выв.', 'вывод: однозначно следует из сопоставления стихов'],
  ['толк.', 'толкование: распространённое, но не единственное понимание; изложено в примечаниях (§ 24)'],
  ['расч.', 'год рассчитан по выбранной модели хронологии'],
  ['справ.', 'справочный слой: подлинник имени, этимология, расположение мест — не слова Писания'],
];

// ---------- о карте (G6; CARD-44; UX-36) ----------
export function AboutPanel() {
  const m = model.value;
  return (
    <Sheet title="О карте" lead="Источник, уровни достоверности, хронология и известные трудности текста.">
      <h3>Источник</h3>
      <p>
        {typo(
          'Только 66 канонических книг в Синодальном переводе (1876), в синодальной нумерации стихов. Неканонические книги и добавления (Пс 151, Дан 3:24–90, Дан 13–14, добавления к Есфири) не используются. Слова и числа в квадратных скобках Синодального текста — вставки по греческому переводу — не служат основанием фактов; они показаны в примечаниях и в модели «числа в скобках».',
        )}
      </p>
      <h3>Уровни достоверности</h3>
      <table class="levels">
        <thead>
          <tr>
            <th scope="col">Помета</th>
            <th scope="col">Что значит</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map(([mark, text]) => (
            <tr key={mark || 'none'}>
              <th scope="row">{mark ? <abbr class="mark">{mark}</abbr> : <span class="none">без пометы</span>}</th>
              <td>{typo(text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Хронология</h3>
      <p>{typo('Годы рассчитаны атласом по выбранной модели хронологии; модели расходятся только в годах до 967 г. до Р. Х. Модель выбирается кнопкой «Вид» внизу справа неба, строка «Хронология».')}</p>
      <dl class="models">
        {modelInfo.map((mi) => (
          <div key={mi.id} class={mi.id === modelId.value ? 'on' : ''}>
            <dt>
              {mi.name}
              {mi.id === modelId.value && <span class="muted"> — выбрана</span>}
            </dt>
            <dd>{typo(mi.description)}</dd>
          </div>
        ))}
      </dl>
      <p class="muted">
        {typo(
          'Шкала «лет от сотворения» — расчёт атласа по масоретским числам Быт 5 и 11 (сотворение — 4174 г. до Р. Х. в модели по умолчанию). Это не византийская эра «от сотворения мира» (5508 г. до Р. Х.), принятая в России до 1700 г.',
        )}
      </p>
      <h3>Родословие по Луке</h3>
      <p>
        {typo(
          lineFlip.value
            ? 'Сейчас Лк 3 показан как второе родословие Иосифа: Илий понят как его отец. Традиционное понимание — родословие Марии.'
            : 'Сейчас Лк 3 показан как родословие Марии: Илий понят как Её отец, а Иосиф назван по закону (Лк 3:23). Это толкование; другое понимание — второе родословие Иосифа.',
        )}
      </p>
      <div class="cmds">
        <button class="cmd" onClick={() => (panel.value = 'synopsis')}>
          сравнить и переключить в «Синопсисе»
        </button>
      </div>
      <h3>Внебиблейские опоры</h3>
      <p class="muted">{typo('Абсолютные годы невозможны без внешних опор; ниже — принятые значения и другие мнения (ТЗ П-6).')}</p>
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
                <Refs refs={[a.verse]} owner={`an${a.id}`} />
                <VerseInsert owner={`an${a.id}`} refs={[a.verse]} />
              </th>
              <td class="yr" data-label="Год">
                <div>
                  <span class="nobr">{anchorYear(a.value)}</span>
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
        {typo(`Места, где числа текста не сходятся между собой: ${m.tensions.length} в этой модели. Атлас их не сглаживает; у лиц они названы в § 13.`)}
      </p>
      <ul class="notes">
        {m.tensions.slice(0, 80).map((t, i) => (
          <li key={i}>
            {typo(t.text)} <Refs refs={t.refs.slice(0, 3)} owner={`tn${i}`} />
            <VerseInsert owner={`tn${i}`} refs={t.refs.slice(0, 3)} />
          </li>
        ))}
      </ul>
      <h3>Данные</h3>
      <table class="volumes">
        <tbody>
          {volumes.map((v) => (
            <tr key={v.volume}>
              <th scope="row">{typo(v.title)}</th>
              <td class="n">
                {num(v.count)} {plural(v.count, 'лицо', 'лица', 'лиц')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted">
        {typo(
          `Роды, колена и народы образуют на небе ${groupById.size} ${plural(groupById.size, 'созвездие', 'созвездия', 'созвездий')}. Названия эпох и их основания — в панели «Эпохи». Данные атласа собраны ${builtDate(builtAt)} г.`,
        )}
      </p>
    </Sheet>
  );
}
