import { Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId, graph, persons } from '../../data/atlas.ts';
import { selected, second, first, pickMode, kinPath, pathOf, setPair, clearPair, panel } from '../../state.ts';
import { P, Refs, VerseInsert, plural, skyRef } from '../common.tsx';
import { relate, foldChain, accusative, type Relation } from '../../engine/kinship.ts';
import { SearchIndex } from '../../engine/search.ts';
import { lifeText } from '../sky/text.ts';
import { Sheet } from './Sheet.tsx';
import { typo } from '../text/typo.ts';

// ---------- родство ----------
export function KinshipPanel() {
  // пара не следует за выбором: ссылки в цепочке открывают карточки, но первое лицо остаётся прежним
  const a = first.value ?? selected.value;
  const b = second.value && second.value !== a ? second.value : null;
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const index = useMemo(
    () => new SearchIndex(persons.map((p) => ({ id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, magnitude: p.magnitude, refs: [] }))),
    [],
  );
  const rels = useMemo(() => (a && b ? relate(graph, a, b) : []), [a, b]);
  useEffect(() => {
    setMore(false);
    kinPath.current = rels[0] ? pathOf(rels[0].steps) : null;
    skyRef.redraw();
  }, [a, b]);
  // родство лица с самим собой не предлагается
  const hits = q.trim() ? index.search(q, 9).filter((h) => h.id !== a).slice(0, 8) : [];
  const main = rels.filter((r) => !r.more);
  const extra = rels.filter((r) => r.more);
  return (
    <Sheet title="Родство" lead="Кем одно лицо приходится другому: степень родства, путь по поколениям и стихи.">
      <p>
        Первое лицо: {a ? <P id={a} /> : <span class="muted">не выбрано</span>}
        <br />
        Второе лицо: {b ? <P id={b} /> : <span class="muted">не выбрано</span>}
      </p>
      <div class="cmds">
        <button class="cmd" aria-pressed={pickMode.value === 'kinship'} disabled={!a} onClick={() => (pickMode.value = pickMode.value ? null : 'kinship')}>
          выбрать второе на небе
        </button>
        {b && (
          <button class="cmd" onClick={clearPair}>
            сбросить второе
          </button>
        )}
        {a && b && (
          <button class="cmd" onClick={() => (panel.value = 'spread')}>
            открыть разворот двух карточек
          </button>
        )}
      </div>
      <div class="field search">
        <label for="kin-second">Второе:</label>
        <input
          id="kin-second"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            // свой Escape: очистить поле и уйти из него; панель и карточка остаются
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            setQ('');
            (e.target as HTMLInputElement).blur();
          }}
          placeholder="имя"
        />
      </div>
      {hits.length > 0 && (
        <ul class="suggest">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                class="person"
                onClick={() => {
                  if (a) setPair(a, h.id, true);
                  setQ('');
                }}
              >
                {byId.get(h.id)!.name}
              </button>{' '}
              <span class="muted">{byId.get(h.id)!.disambig}</span>
            </li>
          ))}
        </ul>
      )}
      {a && b && !rels.length && <p class="muted">Родственной связи в данных атласа не найдено.</p>}
      {main.map((r, i) => (
        <RelationView key={`${a}|${b}|${i}`} r={r} ns={`kin${i}`} />
      ))}
      {extra.length > 0 && (
        <>
          <div class="cmds">
            <button class="cmd more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? 'скрыть другие пути' : `ещё ${extra.length} ${plural(extra.length, 'путь', 'пути', 'путей')}`}
            </button>
          </div>
          {more && extra.map((r, i) => <RelationView key={`${a}|${b}|x${i}`} r={r} ns={`kinx${i}`} />)}
        </>
      )}
    </Sheet>
  );
}

/** Имя лица в винительном падеже — ссылкой: «через Авессалома». */
const Acc = ({ id }: { id: string }) => {
  const p = byId.get(id);
  return <P id={id}>{p ? accusative(p.name, p.sex) : id}</P>;
};

/**
 * Один путь родства: фраза, пометы со стихами, цепочка лиц с термином каждого звена.
 * Цепочка длиннее 8 звеньев свёрнута: три звена, «… ещё N …», три звена.
 */
function RelationView({ r, ns }: { r: Relation; ns: string }) {
  const [whole, setWhole] = useState(false);
  const chain = whole ? r.chain : foldChain(r.chain);
  // общий предок — только при боковом родстве, и если фраза не назвала его сама
  const ancestorLine = !r.lineal && r.ancestors.length > 0 && !/: общи/.test(r.sentence) && r.up + r.down > 2;
  return (
    <div class="relation">
      <p class="sent">{typo(r.sentence)}</p>
      {r.scripture && (
        <div class="muted">
          {r.scripture.text ? `В Писании: ${r.scripture.text}` : 'Так названо в Писании'}
          <Refs refs={r.scripture.refs} owner={`${ns}s`} />
          <VerseInsert owner={`${ns}s`} refs={r.scripture.refs} />
        </div>
      )}
      {ancestorLine && (
        <div class="muted">
          {r.ancestors.length > 1 ? 'Общие предки' : 'Общий предок'}:{' '}
          {r.ancestors.map((c, i) => (
            <Fragment key={c}>
              {i > 0 && ' и '}
              <P id={c} />
            </Fragment>
          ))}
        </div>
      )}
      {r.variants.length > 0 && (
        <div class="muted">
          Путь той же длины идёт и{' '}
          {r.variants.map((v, i) => (
            <Fragment key={v.ids.join()}>
              {i > 0 && ', и '}
              через{' '}
              {v.ids.map((id, k) => (
                <Fragment key={id}>
                  {k > 0 && ' и '}
                  <Acc id={id} />
                </Fragment>
              ))}
              <Refs refs={v.refs} owner={`${ns}v${i}`} />
            </Fragment>
          ))}
          {r.variants.map((v, i) => (
            <VerseInsert key={i} owner={`${ns}v${i}`} refs={v.refs} />
          ))}
        </div>
      )}
      {r.open && r.gapRefs.length > 0 && (
        <div class="muted">
          Родословие здесь может пропускать поколения
          <Refs refs={r.gapRefs} owner={`${ns}g`} />
          <VerseInsert owner={`${ns}g`} refs={r.gapRefs} />
        </div>
      )}
      {r.sources.length > 0 && (
        <div class="muted">
          Стихи:
          <Refs refs={r.sources} owner={`${ns}r`} />
          <VerseInsert owner={`${ns}r`} refs={r.sources} />
        </div>
      )}
      <ol class="chain" aria-label="Цепочка родства">
        {chain.map((c, i) =>
          'hidden' in c ? (
            <li key="gap" class="gap">
              <button class="cmd more" aria-label={`показать ещё ${c.hidden} ${plural(c.hidden, 'звено', 'звена', 'звеньев')}`} onClick={() => setWhole(true)}>
                … ещё {c.hidden} …
              </button>
            </li>
          ) : (
            <li key={`${c.id}${i}`}>
              {c.term && (
                <>
                  <i class="term">{c.term}</i>
                  {c.step?.interpretive && ' (по толкованию)'}{' '}
                </>
              )}
              <P id={c.id} /> <span class="muted">{lifeText(c.id)}</span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
