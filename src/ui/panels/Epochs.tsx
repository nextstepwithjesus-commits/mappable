import { byId, persons } from '../../data/atlas.ts';
import { model, epochMode, selected } from '../../state.ts';
import { P, Refs, VerseInsert, Mark } from '../common.tsx';
import { activityEpochs } from '../card/shared.tsx';
import { formatSpan, toAstro } from '../../engine/years.ts';
import { Sheet, flyToYears } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { Check } from '../controls.tsx';

/** Границы эпохи словами; у оценочных эпох — «ок.». Все годы до Р. Х. зависят от модели и опор (ТЗ П-6) — помета «расч.». */
const APPROX = ['judges', 'conquest', 'intertestamental', 'apostolic', 'church'];
const span = (e: { id: string; start: number; end: number }) => formatSpan(toAstro(e.start), toAstro(e.end), APPROX.includes(e.id));
/** Первые слова имён лиц атласа: «Авраам 100 лет…» остаётся с прописной. */
const NAMES = new Set(persons.map((p) => p.name.split(' ')[0]));
/** «Сумма лет…» → «сумма лет…» после «Основание:»; имена и аббревиатуры («Авраам», «ТЗ», «Мф») не трогаются. */
const lower = (s: string) => {
  const w = /^[А-ЯЁ][а-яё]+/.exec(s)?.[0];
  return w && !NAMES.has(w) ? s[0].toLowerCase() + s.slice(1) : s;
};

// ---------- эпохи ----------
export function EpochsPanel() {
  const id = selected.value;
  const sel = id ? byId.get(id) : null;
  const mine = new Set(id ? activityEpochs(id, model.value.chrono.get(id), model.value.epochs).map((e) => e.id) : []);
  return (
    <Sheet title="Эпохи" lead="Эпохи с годами и основаниями; над небом — ярусы эпох, судей, царей, пророков и событий.">
      <div class="checks">
        <Check checked={epochMode.value} onChange={(v) => (epochMode.value = v)}>
          ярусы на небе
        </Check>
      </div>
      {/* сводная таблица (G8; CARD-46): эпоха | годы | основание; эпоха выбранного лица выделена */}
      <table class="epochs">
        <thead>
          <tr>
            <th scope="col">Эпоха</th>
            <th scope="col">Годы</th>
          </tr>
        </thead>
        <tbody>
          {model.value.epochs.map((e) => {
            const here = mine.has(e.id);
            // основание — второй строкой под эпохой: в панели шириной 360–440 px три столбца не помещаются
            return [
              <tr key={e.id} class={here ? 'here' : undefined} aria-current={here ? 'true' : undefined}>
                <th scope="row">
                  <a href={`#ep-${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(`ep-${e.id}`)?.scrollIntoView({ block: 'start' }); }}>
                    {e.name}
                  </a>
                  {here && sel ? <span class="muted"> — здесь: {sel.name}</span> : null}
                </th>
                <td class="yrs">
                  {typo(span(e))} <Mark calc />
                </td>
              </tr>,
              <tr key={`${e.id}-b`} class="basis">
                <td colSpan={2}>Основание: {typo(lower(e.basis))}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
      {model.value.epochs.map((e) => (
        <div key={e.id} id={`ep-${e.id}`} class={mine.has(e.id) ? 'epoch here' : 'epoch'}>
          <h3>
            <button class="person" onClick={() => flyToYears(toAstro(e.start), toAstro(e.end))}>
              {e.name}
            </button>
          </h3>
          <p class="muted">
            {typo(span(e))} <Mark calc />
          </p>
          <p>{e.summary}</p>
          <p class="muted">
            Основание: {typo(lower(e.basis))} <Refs refs={e.refs} owner={`ep-${e.id}`} />
          </p>
          <VerseInsert owner={`ep-${e.id}`} refs={e.refs} />
          {e.keyPersons.filter((k) => byId.has(k)).length ? (
            <p>
              Лица:{' '}
              {e.keyPersons
                .filter((k) => byId.has(k))
                .map((k, i) => (
                  <span key={k}>
                    {i ? ', ' : ''}
                    <P id={k} />
                  </span>
                ))}
            </p>
          ) : null}
          {e.books.length ? <p class="muted">Книги: {e.books.join('; ')}</p> : null}
        </div>
      ))}
    </Sheet>
  );
}
