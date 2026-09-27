import { useState } from 'preact/hooks';
import type { Card } from '../../data/types.ts';
import { Refs, VerseInsert, Mark, plural } from '../common.tsx';
import { formatYear, yearsWord } from '../../engine/years.ts';

export function Events({ events }: { events: NonNullable<Card['events']> }) {
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, 8);
  return (
    <>
      <ul>
        {shown.map((e, i) => (
          <li class="fact" key={i}>
            {e.age !== undefined ? <span class="muted">{yearsWord(e.age)}. </span> : e.year !== undefined ? <span class="muted">{formatYear(e.year <= 0 ? e.year + 1 : e.year, { approx: true })}. </span> : null}
            {e.text}
            <Refs refs={e.refs} owner={`e17.${i}`} />
            <Mark cert={e.cert} />
            <VerseInsert owner={`e17.${i}`} refs={e.refs} />
          </li>
        ))}
      </ul>
      {!all && events.length > 8 && (
        <button class="more" onClick={() => setAll(true)}>
          ещё {events.length - 8} {plural(events.length - 8, 'событие', 'события', 'событий')}
        </button>
      )}
    </>
  );
}

/** Полоса 66 книг в синодальном порядке, тон — число упоминаний лица. */
