import { useMemo } from 'preact/hooks';
import { byId, persons } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { goTo } from '../common.tsx';
import { atlasCoord } from '../../render/sky.ts';
import { norm } from '../../engine/text.ts';
import { lifeText } from '../sky/text.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { num } from '../text/typo.ts';
import { Segmented } from '../controls.tsx';

// ---------- указатель ----------
export function IndexPanel() {
  // буква и фильтр помнятся, пока открыт атлас: панель, открытая снова, стоит там же (D11)
  const [letter, setLetter] = useRemembered<string | null>('index:letter', null);
  const [filter, setFilter] = useRemembered('index:filter', '');
  const m = model.value;
  const groups = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const p of persons) {
      if (p.unnamed) continue;
      const k = p.name;
      const a = byName.get(k) ?? [];
      a.push(p.id);
      byName.set(k, a);
    }
    return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, []);
  const letters = [...new Set(groups.map(([n]) => n[0]))];
  const f = norm(filter);
  const shown = groups.filter(([n]) => (letter ? n[0] === letter : true) && (!f || norm(n).includes(f)));
  const coord = (id: string) => {
    const n = m.nodeByPerson.get(id);
    const c = m.chrono.get(id);
    return n && c ? atlasCoord(c.b, n.lane, m.laneMax) : '';
  };
  let lastLetter = '';
  return (
    <Sheet title="Указатель" lead={`Все лица атласа (${num(persons.length)}) по алфавиту. Число — век от начала шкалы, буква — полоса на левой кромке карты.`}>
      <Segmented
        label="Буква"
        options={[{ value: '', label: 'все' }, ...letters.map((l) => ({ value: l, label: l }))]}
        value={letter ?? ''}
        onChange={(v) => setLetter(v || null)}
      />
      <div class="field">
        <label for="idx-filter">Отобрать:</label>
        <input id="idx-filter" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="idx">
        {shown.slice(0, letter || f ? 5000 : 900).map(([name, ids]) => {
          const head = name[0] !== lastLetter;
          lastLetter = name[0];
          return (
            <div key={name}>
              {head && <div class="head">{name[0]}</div>}
              {ids.length === 1 ? (
                <button class="row" onClick={() => goTo(ids[0])}>
                  <span>{name}</span>
                  <span class="lead-dots" />
                  <span class="coord">{coord(ids[0])}</span>
                </button>
              ) : (
                <>
                  <div class="row">
                    <span>{name}</span>
                  </div>
                  {ids.map((id) => (
                    <button class="row sub" key={id} onClick={() => goTo(id)}>
                      <span>{byId.get(id)!.disambig || lifeText(id)}</span>
                      <span class="lead-dots" />
                      <span class="coord">{coord(id)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
      {!letter && !f && shown.length > 900 && <p class="muted">Показаны первые 900 имён; выберите букву, чтобы увидеть остальные.</p>}
    </Sheet>
  );
}
