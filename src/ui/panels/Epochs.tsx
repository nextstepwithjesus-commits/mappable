import { byId, modelInfo, persons } from '../../data/atlas.ts';
import type { Epoch } from '../../data/types.ts';
import { model, epochMode, selected, modelId } from '../../state.ts';
import { P, Refs, VerseInsert, MarkNote } from '../common.tsx';
import { activityEpochs } from '../card/shared.tsx';
import { epochSpanText, spanText, toAstro } from '../../engine/years.ts';
import { factsOf, modelShort, type ModelEvent } from '../modelinfo.ts';
import { ChronoText } from './Chronology.tsx';
import { Sheet, flyToYears } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { Check } from '../controls.tsx';
import { goToSection } from '../focus.ts';

/**
 * Границы эпохи словами — одно правило для листа «Эпохи», § 13, подсказки и ярусов (engine/years.ts, epochSpanText;
 * решение 99): «ок.» — только у оценочной границы (Epoch.startEst, endEst).
 */
const span = (e: Epoch) => epochSpanText(e);

/**
 * Границы эпох, заданные опорными событиями моделей (решение 102): у этих эпох годы меняются с моделью хронологии.
 * Остальные — по реконструкции Тиле — Янга и внешним опорам, одинаковы во всех моделях.
 */
const BOUNDS: Record<string, [ModelEvent, ModelEvent]> = {
  antediluvian: ['adam', 'flood'],
  postdiluvian: ['flood', 'abram'],
  patriarchs: ['abram', 'egypt'],
  egypt: ['egypt', 'exodus'],
};
/** Годы эпохи в других моделях, если они иные: «в модели «Краткое пребывание» — 3959–2303 гг. до Р. Х.». */
export function epochInModels(id: string, cur: string): string[] {
  const b = BOUNDS[id];
  if (!b) return [];
  const mine = factsOf(cur)?.years;
  const out: string[] = [];
  for (const m of modelInfo) {
    if (m.id === cur) continue;
    const y = factsOf(m.id)?.years;
    const a = y?.[b[0]];
    const z = y?.[b[1]];
    if (a === undefined || z === undefined || (a === mine?.[b[0]] && z === mine?.[b[1]])) continue;
    out.push(`в модели «${modelShort(m.id)}» — ${spanText({ t: toAstro(a) }, { t: toAstro(z) })}`);
  }
  return out;
}
/** Пояснение пометы «расч.» у границ эпохи: от чего зависят её годы. */
export function epochMarkText(id: string, cur: string): string {
  if (BOUNDS[id] && epochInModels(id, cur).length)
    return `границы вычислены по числам текста от опоры 967 г. до Р. Х. (3 Цар 6:1); годы — по модели «${factsOf(cur)?.name ?? modelShort(cur)}», в других моделях они иные`;
  return 'границы — по числам текста, реконструкции царствований Тиле — Янга и внешним опорам; одинаковы во всех моделях';
}
/** Первые слова имён лиц атласа: «Авраам 100 лет…» остаётся с прописной. */
const NAMES = new Set(persons.map((p) => p.name.split(' ')[0]));
/** «Сумма лет…» → «сумма лет…» после «Основание:»; имена и аббревиатуры («Авраам», «ТЗ», «Мф») не трогаются. */
const lower = (s: string) => {
  const w = /^[А-ЯЁ][а-яё]+/.exec(s)?.[0];
  return w && !NAMES.has(w) ? s[0].toLowerCase() + s.slice(1) : s;
};

/**
 * Тильда приближения в тексте оснований — словами, как в карточке (CARD-90): «в ~325 лет» → «примерно в 325 лет»,
 * «(~390)» и «~390» → «около 390». После предлога «около» не встаёт: «в около» было бы неграмотно.
 */
export function approxWords(s: string): string {
  return s
    .replace(/(^|[\s(«])(в|во|за|на|через)\s+~\s*(\d)/g, '$1примерно $2 $3')
    .replace(/~\s*(\d)/g, 'около $1');
}

// ---------- эпохи ----------
export function EpochsPanel() {
  const id = selected.value;
  const sel = id ? byId.get(id) : null;
  const mine = new Set(id ? activityEpochs(id, model.value.chrono.get(id), model.value.epochs).map((e) => e.id) : []);
  return (
    <Sheet title="Эпохи" lead="Эпохи с годами и основаниями; над небом — ярусы эпох, судей, царей, пророков и событий.">
      <div class="checks">
        <Check checked={epochMode.value} onChange={(v) => (epochMode.value = v)}>
          ярусы эпох
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
                  <a href={`#ep-${e.id}`} onClick={(ev) => { ev.preventDefault(); goToSection(`ep-${e.id}`); }}>
                    {e.name}
                  </a>
                  {here && sel ? <span class="muted"> — здесь: {sel.name}</span> : null}
                </th>
                <td class="yrs">
                  {typo(span(e))} <MarkNote label="расч." full={epochMarkText(e.id, modelId.value)} />
                </td>
              </tr>,
              <tr key={`${e.id}-b`} class="basis">
                <td colSpan={2}>
                  Основание: <ChronoText text={approxWords(lower(e.basis))} />
                  {epochInModels(e.id, modelId.value).length ? <span class="muted"> {typo(`(${epochInModels(e.id, modelId.value).join('; ')})`)}</span> : null}
                </td>
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
            {typo(span(e))} <MarkNote label="расч." full={epochMarkText(e.id, modelId.value)} />
          </p>
          <p>{typo(approxWords(e.summary))}</p>
          <p class="muted">
            Основание: <ChronoText text={approxWords(lower(e.basis))} /> <Refs refs={e.refs} owner={`ep-${e.id}`} />
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
