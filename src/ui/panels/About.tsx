import { anchors, modelInfo, volumes, groupById, builtAt } from '../../data/atlas.ts';
import { model, modelId, lineFlip } from '../../state.ts';
import { Refs, VerseInsert, plural } from '../common.tsx';
import { formatYear, toAstro } from '../../engine/years.ts';
import { Sheet } from './Sheet.tsx';

/** Год якоря по-человечески: «967 г. до Р. Х.»; в вариантах «-966 (Тиле)» → «966 г. до Р. Х. (Тиле)». */
const anchorYear = (v: number) => formatYear(toAstro(v));
const anchorAlt = (s: string) => s.replace(/^(-?\d+)/, (y) => anchorYear(Number(y)));

// ---------- о карте ----------
export function AboutPanel() {
  const m = model.value;
  return (
    <Sheet title="О карте" lead="Метод атласа, хронология, уровни достоверности и известные трудности текста.">
      <h3>Источник</h3>
      <p>Только 66 канонических книг в Синодальном переводе (1876), в синодальной нумерации стихов. Неканонические книги и добавления (Пс 151, Дан 3:24–90, Дан 13–14, добавления к Есфири) не используются. Слова и числа в квадратных скобках Синодального текста — вставки по греческому переводу — не служат основанием фактов; они показаны в примечаниях и в модели «числа в скобках».</p>
      <h3>Уровни достоверности</h3>
      <p>Без пометы — прямо сказано в Писании. «выв.» — вывод из сопоставления стихов. «толк.» — толкование, распространённое, но не единственное. «расч.» — год, рассчитанный движком по выбранной модели. «справ.» — справочный слой (подлинник, этимология).</p>
      <h3>Модель хронологии</h3>
      <div class="opts">
        {modelInfo.map((mi) => (
          <button key={mi.id} aria-pressed={modelId.value === mi.id} onClick={() => (modelId.value = mi.id)}>
            {mi.name}
          </button>
        ))}
      </div>
      <p>{modelInfo.find((x) => x.id === modelId.value)?.description}</p>
      <p class="muted">Шкала «лет от сотворения» здесь — расчёт атласа по масоретским числам Быт 5 и 11 (сотворение — 4174 г. до Р. Х. в модели по умолчанию). Это не византийская эра «от сотворения мира» (5508 г. до Р. Х.), принятая в России до 1700 г.</p>
      <div class="opts">
        <button aria-pressed={lineFlip.value} onClick={() => (lineFlip.value = !lineFlip.value)}>
          показывать Лк 3 как второе родословие Иосифа
        </button>
      </div>
      <h3>Внебиблейские якоря</h3>
      <table>
        <thead>
          <tr>
            <th>Событие</th>
            <th>Год</th>
            <th>Источник</th>
          </tr>
        </thead>
        <tbody>
          {anchors.map((a) => (
            <tr key={a.id}>
              <td>
                {a.event} <Refs refs={[a.verse]} owner={`an${a.id}`} />
              </td>
              <td>
                {anchorYear(a.value)}
                {a.alternatives.length ? <div class="muted">или {a.alternatives.map(anchorAlt).join('; ')}</div> : null}
              </td>
              <td class="muted">{a.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Хронологические напряжения ({m.tensions.length})</h3>
      <p class="muted">Места, где числа текста не сходятся между собой. Атлас их не сглаживает.</p>
      <ul style={{ paddingLeft: '18px' }}>
        {m.tensions.slice(0, 80).map((t, i) => (
          <li key={i} style={{ fontSize: '14.5px', margin: '4px 0' }}>
            {t.text} <Refs refs={t.refs.slice(0, 3)} owner={`tn${i}`} />
            <VerseInsert owner={`tn${i}`} refs={t.refs.slice(0, 3)} />
          </li>
        ))}
      </ul>
      <h3>Тома данных</h3>
      <table>
        <tbody>
          {volumes.map((v) => (
            <tr key={v.volume}>
              <td>{v.volume}</td>
              <td>{v.title}</td>
              <td>
                {v.count} {plural(v.count, 'лицо', 'лица', 'лиц')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted">
        Роды, колена и народы образуют на небе {groupById.size} {plural(groupById.size, 'созвездие', 'созвездия', 'созвездий')}. Названия эпох и их основания — в панели «Эпохи». Данные атласа собраны {new Date(builtAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}.
      </p>
    </Sheet>
  );
}
