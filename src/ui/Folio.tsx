import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, VNode } from 'preact';
import { byId, lineMembership, loadCard, loadedCard, loadedChrono } from '../data/atlas.ts';
import type { Card, Chrono } from '../data/types.ts';
import { selected, second, pickMode, panel, model, showSchema } from '../state.ts';
import { grid } from './layout.ts';
import { skyRef, plural, CAN_PRINT } from './common.tsx';
import { lowerFirst } from './text/ru.ts';
import { typo } from './text/typo.ts';
import { Masthead } from './card/Masthead.tsx';
import { Close } from './controls.tsx';
import { SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups } from './card/sections.tsx';
import { Clamp, clampItems } from './card/Clamp.tsx';
import { Brief, authoredCount } from './card/Brief.tsx';
import { Rail, RailKey, type SecState } from './card/Rail.tsx';
import { affiliation } from './card/shared.tsx';

export { Masthead, SECTIONS, PARTS, buildSections, familyIds, contemporaryGroups };
export type { SecState };

const modelNames: Record<string, string> = {
  'mt-long': 'масоретские числа, 430 лет в Египте',
  'mt-short': 'краткое пребывание, 215 лет',
  lxx: 'числа в скобках Быт 5 и 11',
  terah70: 'Фарре 70 лет',
};

/** «9–12, 14»: номера разделов подряд — диапазоном. */
export function ranges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j;
  }
  return out.join(', ');
}

/**
 * Состояние каждого из 24 разделов (ТЗ § 3.3; решение владельца 6):
 * content — есть сведения; header — сведения в шапке (§ 1 — имя, § 5 — роль, § 7 — колено: раздел их не повторяет);
 * silent — составитель проверил: Писание молчит; na — § 21 у лица вне родословий Мессии; absent — не составлен.
 */
export function sectionStates(id: string, out: Map<number, ComponentChildren>, card: Card | null): Record<number, SecState> {
  const p = byId.get(id)!;
  const silent = new Set(p.silent);
  const onLines = lineMembership.joseph.has(id) || lineMembership.mary.has(id);
  const st: Record<number, SecState> = {};
  for (const s of SECTIONS) {
    const n = s.n;
    if (out.has(n)) st[n] = 'content';
    else if (n === 1 || (n === 5 && p.roles.length) || (n === 7 && affiliation(id))) st[n] = 'header';
    else if (silent.has(n)) st[n] = 'silent';
    else if (n === 21 && !onLines && !card?.messiahNote?.length) st[n] = 'na';
    else st[n] = 'absent';
  }
  return st;
}

/**
 * Колофон (F10; CARD-38): точный перечень — где сведения, о чём Писание молчит, что не составлено;
 * модель хронологии — только если у лица есть годы, которые от неё зависят (до 967 г. до Р. Х.).
 */
export function colophonText(id: string, states: Record<number, SecState>): string {
  const of = (...k: SecState[]) => SECTIONS.filter((s) => k.includes(states[s.n])).map((s) => s.n);
  const filled = of('content', 'header').length;
  const silent = of('silent');
  const absent = of('absent');
  const na = of('na');
  const parts = [`Сведения — в ${filled} ${plural(filled, 'разделе', 'разделах', 'разделах')}`];
  if (silent.length) parts.push(`Писание молчит — § ${ranges(silent)}`);
  if (absent.length) parts.push(`не ${absent.length === 1 ? 'составлен' : 'составлены'} — § ${ranges(absent)}`);
  if (na.length) parts.push('§ 21 не относится: лицо не входит в линии Мессии');
  const c = model.value.chrono.get(id);
  // −966 — 967 г. до Р. Х. в астрономическом счёте: 4-й год Соломона, якорь хронологии (3 Цар 6:1)
  const dep = c && c.cls !== 'epochal' && c.b < -966;
  return typo(
    `${parts.join('; ')}. Ссылки сверены с Синодальным текстом.` + (dep ? ` Годы до 967 г. до Р. Х. — по модели «${modelNames[model.value.id] ?? model.value.id}».` : ''),
  );
}

/** Заголовок раздела в строку («Имя. Давид…») — если тело раздела — один абзац или один пункт (F1; VIS-01, VIS-10). */
function runIn(body: ComponentChildren): VNode<{ class?: string; children?: ComponentChildren }> | null {
  const items = clampItems(body);
  if (items.length !== 1) return null;
  const v = items[0].node as VNode<{ class?: string; children?: ComponentChildren }>;
  return v.type === 'p' || v.type === 'li' ? v : null;
}

/**
 * Тело карточки без загрузки данных (для листа, образца и разворота): рейка, шапка с командами, «Кратко»,
 * разделы по частям I–VI, колофон.
 * id — лицо шапки; body — лицо, том и хронология тела (пока грузится том нового лица, тело — прежнего, бледнее).
 * actions — строка команд под именем (у листа карточки); current — раздел, до которого дошла прокрутка.
 */
export function CardPage({
  id, body, stale = false, current = 0, actions,
}: {
  id: string;
  body: { id: string; card: Card | null; chrono: Chrono | null } | null;
  stale?: boolean;
  current?: number;
  actions?: ComponentChildren;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const bodyId = body?.id ?? id;
  const bp = byId.get(bodyId)!;
  const card = body?.card ?? null;
  const m = model.value;
  // разделы собираются заново, только когда сменились лицо, том или модель: прокрутка меняет лишь текущий раздел рейки
  const { out, states } = useMemo(() => {
    const o = buildSections(bodyId, bp, card, m, m.chrono.get(bodyId), '', body?.chrono ?? null);
    return { out: o, states: sectionStates(bodyId, o, card) };
  }, [bodyId, card, body?.chrono, m]);
  const schema = showSchema.value;
  // малое лицо (F11; CARD-36): меньше трёх записей составителя — «Кратко» и есть статья, разделы — одной строкой
  const compact = !!card && authoredCount(card) < 3 && !schema && openFor !== bodyId;

  const go = (n: number) => {
    const st = states[n];
    if (compact) setOpenFor(bodyId);
    if (st === 'absent' && !schema) showSchema.value = true;
    requestAnimationFrame(() => {
      if (st === 'header') {
        const t = document.getElementById(`title-${id}`);
        t?.closest('.folio')?.scrollTo({ top: 0, behavior: 'smooth' });
        t?.focus({ preventScroll: true });
        return;
      }
      const el = document.getElementById(`sec-${n}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // ---------- разделы ----------
  const blocks: ComponentChildren[] = [];
  let run: number[] = [];
  const flushRun = () => {
    if (!run.length) return;
    const st = states[run[0]];
    const label = run.length === 1 ? `${run[0]}` : `${run[0]}–${run[run.length - 1]}`;
    const titles = run.map((n, i) => (i ? lowerFirst(SECTIONS[n - 1].title) : SECTIONS[n - 1].title)).join(', ');
    blocks.push(
      <div class={`sec ${st}`} key={`run${run[0]}`} data-n={run[0]} id={`sec-${run[0]}`}>
        <span class="no">{label}</span>
        {typo(`${titles} — ${st === 'silent' ? 'в Писании не сообщается' : st === 'na' ? 'не относится: лицо не входит в линии Мессии' : 'раздел не составлен'}`)}
      </div>,
    );
    run = [];
  };
  const shown = (n: number) => states[n] === 'content' || states[n] === 'silent' || states[n] === 'na' || (schema && states[n] === 'absent');
  let lastPart = 0;
  for (const s of SECTIONS) {
    if (!shown(s.n)) {
      // скрытый раздел (не составлен или в шапке) разрывает сведённую строку: «9–12» — только подряд идущие
      flushRun();
      continue;
    }
    if (s.part !== lastPart) {
      flushRun();
      blocks.push(
        <h3 class="part" key={`p${s.part}`}>
          {PARTS[s.part]}
        </h3>,
      );
      lastPart = s.part;
    }
    const st = states[s.n];
    if (st !== 'content') {
      if (run.length && (states[run[0]] !== st || st === 'na')) flushRun();
      run.push(s.n);
      continue;
    }
    flushRun();
    const bodyN = out.get(s.n);
    const one = runIn(bodyN);
    blocks.push(
      <section class={`sec${one ? '' : ' long'}`} key={s.n} data-n={s.n} id={`sec-${s.n}`} aria-labelledby={`h-${s.n}`}>
        <span class="no" aria-hidden="true">
          {s.n}
        </span>
        {one ? (
          <div class={`runin${one.props.class ? ` ${one.props.class}` : ''}`}>
            <h4 id={`h-${s.n}`}>{s.title}.</h4> {one.props.children}
          </div>
        ) : (
          <>
            <h4 id={`h-${s.n}`}>{s.title}</h4>
            <Clamp sig={`${bodyId}|${s.n}`} n={s.n}>
              {bodyN}
            </Clamp>
          </>
        )}
      </section>,
    );
  }
  flushRun();

  const restTitles = SECTIONS.filter((s) => states[s.n] === 'content').map((s) => lowerFirst(s.title));

  return (
    <>
      <Masthead id={id} actions={actions} />
      <Brief id={bodyId} card={card} />
      <div class="mast-rule" aria-hidden="true" />
      {/* рейка — вровень с первым разделом (VIS-07); на телефоне — строка номеров под шапкой */}
      {compact ? null : <Rail states={states} current={current} onGo={go} />}
      {body ? (
        <div class={stale ? 'folio-body stale' : 'folio-body'} aria-busy={stale ? 'true' : undefined}>
          {compact ? (
            <p class="rest">
              <button type="button" class="more" aria-expanded="false" onClick={() => setOpenFor(bodyId)}>
                Показать все сведения
              </button>
              {restTitles.length ? typo(` — ${restTitles.join(', ')}`) : null}
            </p>
          ) : (
            blocks
          )}
        </div>
      ) : null}
      <footer class="colophon">
        {compact ? null : <RailKey states={states} />}
        <p>{colophonText(bodyId, states)}</p>
        <div class="cmds">
          <button type="button" class="cmd" aria-pressed={schema} onClick={() => (showSchema.value = !schema)}>
            Показать все 24 раздела
          </button>
          {CAN_PRINT && (
            <button type="button" class="cmd" onClick={() => window.print()}>
              Напечатать карточку
            </button>
          )}
        </div>
      </footer>
    </>
  );
}

/** Сколько ждать тома карточки, прежде чем сказать «Загрузка карточки…» (IX-45). */
const LOADING_AFTER = 300;

export function Folio() {
  const id = selected.value;
  const [data, setData] = useState<{ id: string; card: Card; chrono: Chrono | null } | null>(null);
  const [current, setCurrent] = useState(1);
  // том не загрузился (D11): лист говорит об этом и предлагает повторить, а не остаётся в «Загрузке» навсегда
  const [failed, setFailed] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setFailed(null);
    setSlow(false);
    const t = setTimeout(() => alive && setSlow(true), LOADING_AFTER);
    loadCard(id)
      .then((d) => alive && setData({ id, card: d?.card ?? {}, chrono: d?.chrono ?? null }))
      .catch(() => alive && setFailed(id))
      .finally(() => clearTimeout(t));
    inner.current?.parentElement?.scrollTo({ top: 0 });
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id, attempt]);
  useEffect(() => {
    const el = inner.current?.parentElement;
    if (!el) return;
    const onScroll = () => {
      const secs = [...el.querySelectorAll<HTMLElement>('.sec[data-n]')];
      let cur = 1;
      for (const s of secs) if (s.offsetTop - el.scrollTop < 80) cur = Number(s.dataset.n);
      setCurrent(cur);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });

  if (!id) return <aside class="folio" hidden />;
  const p = byId.get(id);
  if (!p) return <aside class="folio" hidden />;
  // карточка свёрнута в корешок: небу иначе осталось бы меньше 40 % (C1; решение 7)
  if (grid.value.spine) return <FolioSpine id={id} />;
  // тело карточки (D11; IX-45): том уже загружен — сразу; иначе до прихода нового держится прежнее тело (бледнее),
  // а «Загрузка карточки…» появляется, только если ждать дольше 300 мс
  const have = data && data.id === id ? data : loadedCard(id) ? { id, card: loadedCard(id)!, chrono: loadedChrono(id) } : null;
  const shownBody = have ?? (data && !slow && failed !== id ? data : null);
  const stale = !have && !!shownBody;

  // команды карточки — глаголами, одной строкой (F2; решение владельца 9); «Все 24 раздела» и печать — в колофоне
  const actions = (
    <div class="actions">
      <button type="button" onClick={() => skyRef.flyTo(id)}>
        Показать на небе
      </button>
      <button type="button" aria-pressed={pickMode.value === 'kinship'} onClick={() => { pickMode.value = pickMode.value === 'kinship' ? null : 'kinship'; second.value = null; }}>
        {pickMode.value === 'kinship' ? 'Выберите второе лицо…' : 'Найти родство с…'}
      </button>
      <button type="button" aria-pressed={pickMode.value === 'spread'} onClick={() => { pickMode.value = pickMode.value === 'spread' ? null : 'spread'; second.value = null; }}>
        {pickMode.value === 'spread' ? 'Выберите второе лицо…' : 'Открыть разворот с…'}
      </button>
    </div>
  );

  return (
    <aside class="folio" aria-label={`Карточка: ${p.name}`}>
      <div class="grab" aria-hidden="true" onClick={(e) => {
        const f = (e.currentTarget as HTMLElement).parentElement!;
        const cur = f.style.getPropertyValue('--sheet-h');
        f.style.setProperty('--sheet-h', cur === '104px' ? '55vh' : cur === '100vh' ? '104px' : '100vh');
      }}>
        <span />
      </div>
      <div class="folio-inner" ref={inner}>
        {/* единый «×» (B3): липкий, в правом верхнем углу листа; на сенсорном экране — 44 × 44 */}
        {/* «×» снимает только выбор; открытая панель остаётся (D11; IX-26) */}
        <Close label="Закрыть карточку" onClick={() => (selected.value = null)} />
        {failed === id ? (
          <>
            <Masthead id={id} actions={actions} />
            <div class="load-error" role="alert">
              <p>{typo('Карточку не удалось загрузить: том с её разделами не пришёл. Проверьте связь и повторите.')}</p>
              <button type="button" class="cmd" onClick={() => setAttempt((a) => a + 1)}>
                Повторить
              </button>
            </div>
          </>
        ) : (
          <CardPage id={id} body={shownBody} stale={stale} current={current} actions={actions} />
        )}
        {!shownBody && failed !== id && slow ? (
          <p class="muted" role="status">
            Загрузка карточки…
          </p>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Корешок свёрнутой карточки (C1): 56 px — «×», имя и «развернуть». Развернуть — значит закрыть панель:
 * карточка и широкая панель вместе небу места не оставляют; прокрутка и фильтры панели помнятся (D11).
 */
function FolioSpine({ id }: { id: string }) {
  const p = byId.get(id)!;
  return (
    <aside class="folio spine" aria-label={`Карточка: ${p.name} (свёрнута)`}>
      <Close label="Закрыть карточку" onClick={() => (selected.value = null)} />
      <button type="button" class="unfold" aria-label={`Развернуть карточку: ${p.name}`} title="Развернуть карточку" onClick={() => (panel.value = null)}>
        <span class="nm">{p.name}</span>
        <span class="cmdl" aria-hidden="true">
          развернуть
        </span>
      </button>
    </aside>
  );
}

