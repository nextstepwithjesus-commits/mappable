import { byId } from '../../data/atlas.ts';
import { model, epochMode } from '../../state.ts';
import { P, Refs, VerseInsert } from '../common.tsx';
import { formatSpan, toAstro } from '../../engine/years.ts';
import { Sheet, flyToYears } from './Sheet.tsx';

// ---------- эпохи ----------
export function EpochsPanel() {
  return (
    <Sheet title="Эпохи" lead="Карта эпох — режим того же неба: сверху ярусы эпох, судей, царей Иудеи и Израиля, пророков и событий. Жизнь выбранного лица проецируется столбцом через все ярусы.">
      <div class="opts">
        <button aria-pressed={epochMode.value} onClick={() => (epochMode.value = !epochMode.value)}>
          ярусы на небе
        </button>
      </div>
      {model.value.epochs.map((e) => (
        <div key={e.id}>
          <h3>
            <button class="person" onClick={() => flyToYears(toAstro(e.start), toAstro(e.end))}>
              {e.name}
            </button>
          </h3>
          <p class="muted" style={{ margin: 0 }}>
            {formatSpan(toAstro(e.start), toAstro(e.end), ['judges', 'conquest', 'intertestamental', 'apostolic', 'church'].includes(e.id))}
          </p>
          <p style={{ margin: '4px 0' }}>{e.summary}</p>
          <p class="muted" style={{ margin: '4px 0', fontSize: '14px' }}>
            Основание: {e.basis} <Refs refs={e.refs} owner={`ep-${e.id}`} />
          </p>
          <VerseInsert owner={`ep-${e.id}`} refs={e.refs} />
          {e.keyPersons.filter((k) => byId.has(k)).length ? (
            <p style={{ margin: '4px 0', fontSize: '14.5px' }}>
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
          {e.books.length ? <p class="muted" style={{ margin: '4px 0', fontSize: '14px' }}>Книги: {e.books.join('; ')}</p> : null}
        </div>
      ))}
    </Sheet>
  );
}
