import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId, graph, persons } from '../../data/atlas.ts';
import { panel, selected, second, pickMode } from '../../state.ts';
import { P, skyRef } from '../common.tsx';
import { relate } from '../../engine/kinship.ts';
import { SearchIndex } from '../../engine/search.ts';
import { kinPath, lifeText } from '../SkyView.tsx';
import { Sheet } from './Sheet.tsx';

// ---------- родство ----------
export function KinshipPanel() {
  const a = selected.value;
  const b = second.value;
  const [q, setQ] = useState('');
  const index = useMemo(() => new SearchIndex(persons.map((p) => ({ id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, refs: [] }))), []);
  const rels = a && b ? relate(graph, a, b, 6) : [];
  useEffect(() => {
    kinPath.current = rels[0] ? [...new Set(rels[0].steps.flatMap((s) => [s.from, s.to]))] : null;
    skyRef.redraw();
  }, [a, b]);
  const hits = q.trim() ? index.search(q, 8) : [];
  return (
    <Sheet title="Родство" lead="Выберите два лица: первое — в карточке или на небе, второе — здесь или щелчком по небу. Показываются все пути родства до кратчайшего + 2, с названием степени и термином Писания.">
      <p>
        Первое лицо: {a ? <P id={a} /> : <span class="muted">не выбрано</span>}
        <br />
        Второе лицо: {b ? <P id={b} /> : <span class="muted">не выбрано</span>}
      </p>
      <div class="opts">
        <button aria-pressed={pickMode.value === 'kinship'} disabled={!a} onClick={() => (pickMode.value = pickMode.value ? null : 'kinship')}>
          выбрать второе на небе
        </button>
        {b && (
          <button onClick={() => { second.value = null; kinPath.current = null; }}>
            сбросить второе
          </button>
        )}
        {a && b && <button onClick={() => (panel.value = 'spread')}>открыть разворот двух карточек</button>}
      </div>
      <div class="search" style={{ margin: '0 0 10px' }}>
        <label for="kin-second">Второе:</label>
        <input id="kin-second" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="имя" />
      </div>
      {hits.length > 0 && (
        <ul style={{ padding: 0, margin: '0 0 12px' }}>
          {hits.map((h) => (
            <li key={h.id} style={{ listStyle: 'none', margin: '2px 0' }}>
              <button class="person" onClick={() => { second.value = h.id; setQ(''); }}>
                {byId.get(h.id)!.name}
              </button>{' '}
              <span class="muted">{byId.get(h.id)!.disambig}</span>
            </li>
          ))}
        </ul>
      )}
      {a && b && !rels.length && <p class="muted">Родственной связи в данных атласа не найдено.</p>}
      {rels.map((r, i) => (
        <div class="relation" key={i}>
          <div class="sent">{r.sentence}{r.interpretive ? <span class="muted"> — по толкованию</span> : null}</div>
          {r.scriptureTerm && <div class="muted">Так в Писании: «{r.scriptureTerm}»</div>}
          {r.ancestor && <div class="muted">Общий предок: <P id={r.ancestor} />; поколений вверх — {r.up}, вниз — {r.down}</div>}
          <ul class="chain">
            {[...new Set(r.steps.flatMap((s) => [s.from, s.to]))].map((id) => (
              <li key={id}>
                <P id={id} /> <span class="muted">{lifeText(id)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}
