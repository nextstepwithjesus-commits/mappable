import { useMemo } from 'preact/hooks';
import { byId, persons } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { goTo } from '../common.tsx';
import { atlasCoord } from '../../engine/layout.ts';
import { norm } from '../../engine/text.ts';
import { lifeText } from '../sky/text.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { num, typo } from '../text/typo.ts';
import { Segmented } from '../controls.tsx';

/** Известное лицо — полужирным в указателе (CARD-45): яркая звезда неба. */
const KNOWN_MAG = 2;

/**
 * Статьи указателя: имя — лица. Одноимённые — по году рождения (у лиц без года — в конце, по значимости), чтобы
 * Иосиф, сын Иакова, стоял раньше Иосифа, мужа Марии (CARD-45).
 */
export function indexGroups(birth: (id: string) => number | null): [string, string[]][] {
  const byName = new Map<string, string[]>();
  for (const p of persons) {
    if (p.unnamed) continue;
    const a = byName.get(p.name) ?? [];
    a.push(p.id);
    byName.set(p.name, a);
  }
  for (const ids of byName.values()) {
    ids.sort((x, y) => {
      const bx = birth(x);
      const by = birth(y);
      if (bx !== null && by !== null && bx !== by) return bx - by;
      if (bx === null && by !== null) return 1;
      if (by === null && bx !== null) return -1;
      return byId.get(x)!.magnitude - byId.get(y)!.magnitude;
    });
  }
  return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
}

// ---------- указатель (G7; ТЗ § 3.7; CARD-45; VIS-33) ----------
export function IndexPanel() {
  // буква и фильтр помнятся, пока открыт атлас: панель, открытая снова, стоит там же (D11)
  const [letter, setLetter] = useRemembered<string | null>('index:letter', null);
  const [filter, setFilter] = useRemembered('index:filter', '');
  const m = model.value;
  const groups = useMemo(
    () =>
      indexGroups((id) => {
        const c = m.chrono.get(id);
        return c && c.cls !== 'epochal' ? c.b : null;
      }),
    [m],
  );
  const letters = [...new Set(groups.map(([n]) => n[0]))];
  const f = norm(filter);
  const shown = groups.filter(([n]) => (letter ? n[0] === letter : true) && (!f || norm(n).includes(f)));
  const coord = (id: string) => {
    const n = m.nodeByPerson.get(id);
    const c = m.chrono.get(id);
    // координата — там, где звезда стоит на карте: у лиц скоплений это клетка сетки (n.t0), а не год рождения
    return n && c ? atlasCoord(n.t0, n.lane) : '';
  };
  const known = (id: string) => (byId.get(id)?.magnitude ?? 6) <= KNOWN_MAG;
  let lastLetter = '';
  return (
    <Sheet wide title="Указатель" lead={`Все лица атласа (${num(persons.length)}) по алфавиту. Число — век от начала шкалы, буква — полоса на левой кромке карты.`}>
      <div class="letters">
        <Segmented label="Буква" options={[{ value: '', label: 'все' }, ...letters.map((l) => ({ value: l, label: l }))]} value={letter ?? ''} onChange={(v) => setLetter(v || null)} />
      </div>
      <div class="field">
        <label for="idx-filter">Отобрать:</label>
        <input id="idx-filter" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="idx">
        {shown.slice(0, letter || f ? 5000 : 900).map(([name, ids]) => {
          const head = name[0] !== lastLetter;
          lastLetter = name[0];
          return (
            <div key={name} class="entry">
              {head && <div class="head">{name[0]}</div>}
              {ids.length === 1 ? (
                <button class={known(ids[0]) ? 'row known' : 'row'} onClick={() => goTo(ids[0])}>
                  <span class="nm">{name}</span>
                  <span class="lead-dots" />
                  <span class="coord">{coord(ids[0])}</span>
                </button>
              ) : (
                <>
                  <div class="row word">
                    <span class="nm">{name}</span>
                  </div>
                  {ids.map((id) => (
                    <button class={known(id) ? 'row sub known' : 'row sub'} key={id} onClick={() => goTo(id)}>
                      <span class="nm">
                        {byId.get(id)!.disambig ? <span class="ds">{typo(byId.get(id)!.disambig)} </span> : null}
                        <span class="yrs">{typo(lifeText(id))}</span>
                      </span>
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
