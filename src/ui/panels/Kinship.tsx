import { Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { byId, graph } from '../../data/atlas.ts';
import { selected, second, first, pickMode, kinPath, kinSteps, pathOf, setPair, clearPair, panel } from '../../state.ts';
import { P, Refs, VerseInsert, flyToIds, goTo, plural, skyRef } from '../common.tsx';
import { relate, foldChain, accusative, type KinLink, type Relation } from '../../engine/kinship.ts';
import { lifeText } from '../sky/text.ts';
import { grid } from '../layout.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { typo } from '../text/typo.ts';
import { Combobox, countStatus, personBlocks, personHits, type Row } from '../top/Combobox.tsx';
import { addPath, workSet } from '../work.ts';

// ---------- родство (G1; A7, E5; CARD-08, 39; VIS-36; UX-11, 12, 13; IX-23, 24) ----------

/**
 * Путь на небе (E5): лица пути светятся, остальное гаснет; перелёт вписывает весь путь в видимую часть неба.
 * На телефоне панель — полноэкранный лист: он закрывается, пара и путь остаются (U8).
 */
export function showPathOnSky(r: Relation) {
  const ids = pathOf(r.steps);
  kinPath.current = ids;
  kinSteps.current = r.steps;
  if (grid.peek().phone) panel.value = null;
  skyRef.redraw();
  flyToIds(ids);
}

/** Строка лица в поле пары: имя-ссылка, уточнение и годы. */
function Who({ id }: { id: string }) {
  const p = byId.get(id)!;
  return (
    <span class="who">
      <P id={id} />
      {p.disambig ? <span class="ds">{typo(`, ${p.disambig}`)}</span> : null}
      <span class="yrs">{typo(lifeText(id))}</span>
    </span>
  );
}

export function KinshipPanel() {
  // пара не следует за выбором: ссылки в цепочке открывают карточки, но первое лицо остаётся прежним
  const a = first.value ?? selected.value;
  const b = second.value && second.value !== a ? second.value : null;
  const [q, setQ] = useRemembered('kinship:q', '');
  // какое поле пары сейчас меняется командой «заменить»
  const [editing, setEditing] = useState<null | 'a' | 'b'>(null);
  const [more, setMore] = useState(false);
  const rels = useMemo(() => (a && b ? relate(graph, a, b) : []), [a, b]);
  // какой путь светится на небе: по умолчанию первый
  const [onSky, setOnSky] = useState(0);
  useEffect(() => {
    setMore(false);
    setOnSky(0);
    kinPath.current = rels[0] ? pathOf(rels[0].steps) : null;
    kinSteps.current = rels[0] ? rels[0].steps : null;
    skyRef.redraw();
    // новая пара — путь сразу вписан в видимую часть неба (U1, U5); на телефоне небо под листом, путь показывает команда
    if (rels[0] && !grid.peek().phone) flyToIds(kinPath.current!);
  }, [a, b]);

  const field = editing ?? (!a ? 'a' : !b ? 'b' : null);
  const other = field === 'a' ? b : a;
  // родство лица с самим собой не предлагается: второе поле не предлагает первое лицо, и наоборот
  const hits = useMemo(() => (field ? personHits(q, (id) => id === other) : []), [q, field, other]);
  const blocks = useMemo(() => personBlocks(hits), [hits]);
  const choose = (r: Row) => {
    if (r.kind !== 'person') return;
    const id = r.id;
    setQ('');
    setEditing(null);
    if (field === 'a') {
      if (b) setPair(id, b, true);
      else goTo(id);
    } else if (a) setPair(a, id, true);
    // фокус — на ответ: фраза первого пути
    setTimeout(() => document.querySelector<HTMLElement>('.sheet .relation .sent')?.focus(), 60);
    return 'clear' as const;
  };
  const main = rels.filter((r) => !r.more);
  const extra = rels.filter((r) => r.more);
  const combo = (which: 'a' | 'b') => (
    <Combobox
      id={which === 'a' ? 'kin-first' : 'kin-second'}
      class="field search combo"
      label={which === 'a' ? 'Первое:' : 'Второе:'}
      type="text"
      placeholder="имя"
      listLabel={which === 'a' ? 'Первое лицо' : 'Второе лицо'}
      q={q}
      onInput={setQ}
      blocks={blocks}
      onChoose={choose}
      status={countStatus(hits.length)}
      autoFocus={editing === which}
      onEscape={() => {
        if (!q) setEditing(null);
      }}
      empty={typo(`Лица с именем «${q.trim()}» в атласе нет. Проверьте написание по Синодальному переводу.`)}
    />
  );
  const shown = rels[onSky];
  return (
    <Sheet title="Родство" lead="Кем одно лицо приходится другому: степень родства, путь по поколениям и стихи.">
      <div class="pair">
        {field === 'a' ? (
          combo('a')
        ) : (
          <div class="slot">
            <span class="k">Первое:</span>
            <Who id={a!} />
            <button class="cmd" onClick={() => setEditing('a')} aria-label="Заменить первое лицо">
              заменить
            </button>
          </div>
        )}
        {a && b && !editing && (
          <div class="cmds swap">
            <button class="cmd" onClick={() => setPair(b, a, true)}>
              поменять местами
            </button>
          </div>
        )}
        {field === 'b' ? (
          combo('b')
        ) : b ? (
          <div class="slot">
            <span class="k">Второе:</span>
            <Who id={b} />
            <button class="cmd" onClick={() => setEditing('b')} aria-label="Заменить второе лицо">
              заменить
            </button>
          </div>
        ) : null}
        {editing && (
          <div class="cmds">
            <button
              class="cmd"
              onClick={() => {
                setEditing(null);
                setQ('');
              }}
            >
              отменить замену
            </button>
          </div>
        )}
      </div>
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
      {a && b && !rels.length && <p class="muted">Родственной связи в данных атласа не найдено.</p>}
      {main.map((r, i) => (
        <RelationView key={`${a}|${b}|${i}`} r={r} ns={`kin${i}`} lit={shown === r} onShow={() => (setOnSky(rels.indexOf(r)), showPathOnSky(r))} />
      ))}
      {extra.length > 0 && (
        <>
          <div class="cmds">
            <button class="cmd more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? 'скрыть другие пути' : `ещё ${extra.length} ${plural(extra.length, 'путь', 'пути', 'путей')}`}
            </button>
          </div>
          {more && extra.map((r, i) => <RelationView key={`${a}|${b}|x${i}`} r={r} ns={`kinx${i}`} lit={shown === r} onShow={() => (setOnSky(rels.indexOf(r)), showPathOnSky(r))} />)}
        </>
      )}
    </Sheet>
  );
}

/** «Взять путь в работу» (J3): все лица пути — в рабочий набор; взятый путь — «путь в работе». */
function WorkPath({ ids }: { ids: string[] }) {
  const all = ids.every((id) => workSet.value.has(id));
  return (
    <button class="cmd" aria-pressed={all} disabled={all} onClick={() => addPath(ids)}>
      {all ? 'путь в работе' : 'взять путь в работу'}
    </button>
  );
}

/** Имя лица в винительном падеже — ссылкой: «через Авессалома». */
const Acc = ({ id }: { id: string }) => {
  const p = byId.get(id);
  return <P id={id}>{p ? accusative(p.name, p.sex) : id}</P>;
};

/** Знак лица — как на небе (ТЗ § 3.1): мужчина — диск, женщина — диск в кольце, народ или род — пунктирный кружок. */
export function Sign({ id }: { id: string }) {
  const p = byId.get(id);
  const k = !p ? 'm' : p.kind === 'people' || p.kind === 'clan' ? 'people' : p.sex === 'f' ? 'f' : 'm';
  return <span class={`sign ${k}`} aria-hidden="true" />;
}

/** Звено по термину Писания, по толкованию или по закону — точками, как на небе (E5); кровное — сплошной отвод. */
const loose = (c: KinLink) => !!c.step && (c.step.kind === 'kin' || c.step.kind === 'spouse' || c.step.interpretive || c.step.claim === 'legal' || c.step.claim === 'by-luke');

/**
 * Цепочка родства сверху вниз: знак и имя лица, годы; между лицами — отвод и курсивом термин связи со стихами
 * (VIS-36; CARD-39). Цепочка длиннее 8 звеньев свёрнута: три звена, «… ещё N …», три звена.
 */
export function Chain({ chain, ns, years = true, refs = true }: { chain: KinLink[]; ns: string; years?: boolean; refs?: boolean }) {
  const [whole, setWhole] = useState(false);
  const shown = whole ? chain : foldChain(chain);
  return (
    <ol class="chain" aria-label="Цепочка родства">
      {shown.map((c, i) =>
        'hidden' in c ? (
          <li key="gap" class="gap">
            <button class="cmd more" aria-label={`показать ещё ${c.hidden} ${plural(c.hidden, 'звено', 'звена', 'звеньев')}`} onClick={() => setWhole(true)}>
              … ещё {c.hidden} …
            </button>
          </li>
        ) : (
          <li key={`${c.id}${i}`}>
            {c.term && (
              <div class={loose(c) ? 'step loose' : 'step'}>
                <i class="term">{c.term}</i>
                {c.step?.interpretive && <span class="q">, по толкованию</span>}
                {refs && c.step && <Refs refs={c.step.refs.slice(0, 2)} owner={`${ns}c${i}`} />}
              </div>
            )}
            <div class="link">
              <Sign id={c.id} />
              <P id={c.id} />
              {years && <span class="yrs">{typo(lifeText(c.id))}</span>}
            </div>
            {refs && c.step && <VerseInsert owner={`${ns}c${i}`} refs={c.step.refs} />}
          </li>
        ),
      )}
    </ol>
  );
}

/** Один путь родства: фраза, пометы со стихами, «показать путь на небе», цепочка лиц с термином каждого звена. */
function RelationView({ r, ns, lit, onShow }: { r: Relation; ns: string; lit: boolean; onShow: () => void }) {
  // общий предок — только при боковом родстве, и если фраза не назвала его сама
  const ancestorLine = !r.lineal && r.ancestors.length > 0 && !/: общи/.test(r.sentence) && r.up + r.down > 2;
  return (
    <article class="relation">
      <p class="sent" tabIndex={-1}>
        {typo(r.sentence)}
      </p>
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
      <div class="cmds">
        <button class="cmd" aria-pressed={lit} onClick={onShow}>
          показать путь на небе
        </button>
        <WorkPath ids={pathOf(r.steps)} />
      </div>
      <Chain chain={r.chain} ns={ns} />
    </article>
  );
}
