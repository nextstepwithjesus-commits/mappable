/**
 * Лист «Показ» (этап 11, решения 81, 82; STAGE11.md § 7): что показать на небе.
 *
 *  — Переключатель показа, шесть видов, у каждого число лиц: всё небо, линии Мессии, ключевые лица, набор, род лица,
 *    созвездия («выбрано: 1»).
 *  — Созвездия: поле «Найти созвездие» (ё и е не различаются, окончания отбрасываются, раскладка исправляется — как у
 *    главного поиска) и шесть разделов (src/ui/show.ts, groupSections): у раздела — флажок с тремя состояниями
 *    («все колена — 1 470»), у строки — флажок, название, число лиц и «только это» (созвездие с его домами).
 *    Раздел, где есть выбранное или найденное, развёрнут. Связи наружу: «обрывками», «с роднёй вне созвездия», «без связей».
 *  — Род лица: поле лица (тот же комбобокс, что у поиска), «предки | потомки | оба», «поколений: 1 2 3 все»,
 *    «по отцам | по крови»; число лиц видно до применения.
 *  — На широком экране лист применяется сразу (серия флажков — через 300 мс), небо перестраивается под листом. На телефоне
 *    лист закрывает небо: внизу — «Показать N лиц» (WCAG 3.2.2 — изменение по явной команде).
 *
 * Открывают лист «изменить» в строке показа (src/ui/sky/ShowBar.tsx), «Только его род ▾ → Настроить…» в карточке у звезды
 * и поле «Созвездие» в паспорте подробной карточки. Закрывают «×», Escape и нажатие мимо листа (на широком экране);
 * фокус возвращается туда, откуда лист открыли.
 */
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { byId, groupById } from '../../data/atlas.ts';
import { norm } from '../../engine/text.ts';
import { fixLayout, stems } from '../../engine/search.ts';
import { selected } from '../../state.ts';
import { countShow, groupSections, setShow, show, withHouses, type GroupRow, type GroupSectionInfo, type LineageBy, type LineageDir, type LinksOut, type Show } from '../show.ts';
import { workSet } from '../work.ts';
import { grid } from '../layout.ts';
import { sheetStop } from '../sheet.ts';
import { Close } from '../controls.tsx';
import { plural } from '../common.tsx';
import { num, typo } from '../text/typo.ts';
import { Combobox, countStatus, personBlocks, personHits, type Row } from '../top/Combobox.tsx';
import { isTextField } from '../keys.ts';
import '../../styles/show.css';

// ---------- состояние ----------

/** С какой части открыт лист: виды показа, созвездия или род лица. */
export type ShowFocus = 'kinds' | 'groups' | 'lineage';
/** Открытый лист «Показ»: часть, на которую ставится фокус, и откуда его открыли (туда вернётся фокус). */
export const showSheet = signal<{ focus: ShowFocus; back: HTMLElement | null; person?: string; group?: string } | null>(null);

/**
 * Открыть лист «Показ». person — лицо для рода («Только его род ▾ → Настроить…»); group — созвездие, на строке которого
 * стоит фокус (поле «Созвездие» в паспорте подробной карточки, § 5): его раздел раскрыт, «только это» — рядом.
 */
export function openShowSheet(o: { focus?: ShowFocus; back?: HTMLElement | null; person?: string; group?: string } = {}) {
  // телефон: лист «Показ» встаёт над листом карточки (show.css, --sheet-cover) — карточка опускается на первое положение,
  // чтобы выбору показа и команде «Показать» хватило места (прежде «Показать» оставалась под карточкой на 55 %)
  if (grid.peek().phone && selected.peek() && sheetStop.peek() !== 'peek') sheetStop.value = 'peek';
  showSheet.value = {
    focus: o.focus ?? 'groups',
    back: o.back ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null),
    ...(o.person ? { person: o.person } : {}),
    ...(o.group ? { group: o.group } : {}),
  };
}
/** Закрыть лист; refocus — фокус туда, откуда его открыли (или на «изменить» строки показа). */
export function closeShowSheet(refocus = true) {
  const st = showSheet.peek();
  if (!st) return;
  showSheet.value = null;
  if (!refocus) return;
  const back = st.back && st.back.isConnected ? st.back : document.querySelector<HTMLElement>('.showbar .sb-cmd[aria-haspopup="dialog"]');
  back?.focus({ preventScroll: true });
}

// ---------- слова и числа ----------

export const personsN = (n: number) => `${num(n)} ${plural(n, 'лицо', 'лица', 'лиц')}`;

/** Виды показа по порядку листа: название и пояснение. */
export const KINDS: readonly { kind: Show['kind']; label: string; hint: string }[] = [
  { kind: 'all', label: 'Всё небо', hint: 'Все лица атласа на звёздном небе' },
  { kind: 'lines', label: 'Линии Мессии — Мф 1 и Лк 3', hint: 'Обе родословные линии Иисуса Христа, от Адама' },
  { kind: 'key', label: 'Ключевые лица', hint: 'Главные лица истории Писания' },
  { kind: 'set', label: 'Набор — собран вручную', hint: 'Лица вашего набора: раскрытые у ромбов союзов и взятые из карточек' },
  { kind: 'lineage', label: 'Род лица…', hint: 'Предки или потомки одного лица, по отцам или по крови' },
  { kind: 'groups', label: 'Созвездия', hint: 'Одно или несколько созвездий: колена, дома, народы' },
];

/** Связи наружу у показа созвездий (§ 7). */
export const LINKS: readonly { value: LinksOut; label: string; hint: string }[] = [
  { value: 'stubs', label: 'обрывками', hint: 'Связи с лицами вне созвездий — пунктиром с подписью «кто и где»' },
  { value: 'kin', label: 'с роднёй вне созвездия', hint: 'Родители, супруги и дети вне созвездий — на небе, гостями' },
  { value: 'none', label: 'без связей', hint: 'Только лица созвездий' },
];
const DIRS: readonly { value: LineageDir; label: string }[] = [
  { value: 'up', label: 'предки' },
  { value: 'down', label: 'потомки' },
  { value: 'both', label: 'оба' },
];
const GENS: readonly { value: 1 | 2 | 3 | null; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: null, label: 'все' },
];
const BYS: readonly { value: LineageBy; label: string; hint: string }[] = [
  { value: 'father', label: 'по отцам', hint: 'Род по отцам; дочь рода — с детьми, если они в том же роду, иначе «+N»' },
  { value: 'blood', label: 'по крови', hint: 'Все потомки и предки по отцу и по матери' },
];

/** Совпадает ли название созвездия с запросом: каждое слово запроса — начало слова названия или его основа. */
export function groupMatches(name: string, q: string): boolean {
  const words = norm(fixLayout(q)).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const own = norm(name).split(/[^а-яa-z0-9]+/).filter(Boolean);
  return words.every((w) => own.some((o) => o.startsWith(w) || stems(o).some((s) => stems(w).includes(s))));
}

/** Число показа для строки переключателя. */
function kindCount(kind: Show['kind'], draft: Show): string {
  switch (kind) {
    case 'all':
    case 'lines':
    case 'key':
      return personsN(countShow({ kind } as Show));
    case 'set':
      return personsN(workSet.value.size);
    case 'lineage':
      return draft.kind === 'lineage' ? personsN(countShow(draft)) : '';
    case 'groups':
      return draft.kind === 'groups' && draft.groups.length ? `выбрано: ${draft.groups.length}` : '';
  }
}

// ---------- лист ----------

/** Показ по умолчанию для вида kind: у рода — лицо st.person, выбранное или прежнее; у созвездий — прежний выбор. */
function draftFor(kind: Show['kind'], prev: Show, person: string | null): Show {
  if (kind === prev.kind) return prev;
  if (kind === 'lineage') return person ? { kind: 'lineage', id: person, dir: 'down', gen: null, by: 'father' } : prev;
  if (kind === 'groups') return { kind: 'groups', groups: [], links: 'stubs' };
  return { kind } as Show;
}

/** Готов ли черновик к показу: у созвездий — хотя бы одно, у рода — лицо. */
const ready = (s: Show) => (s.kind === 'groups' ? s.groups.length > 0 : s.kind === 'lineage' ? byId.has(s.id) : true);

export function ShowSheet() {
  const st = showSheet.value;
  if (!st) return null;
  return <SheetBody key={`${st.focus}|${st.person ?? ''}|${st.group ?? ''}`} focus={st.focus} person={st.person ?? null} group={st.group ?? null} />;
}

function SheetBody({ focus, person, group }: { focus: ShowFocus; person: string | null; group: string | null }) {
  const phone = grid.value.phone;
  const cur = show.value;
  const [draft, setDraftState] = useState<Show>(() => {
    if (person) return cur.kind === 'lineage' && cur.id === person ? cur : { kind: 'lineage', id: person, dir: 'down', gen: null, by: 'father' };
    return cur;
  });
  const [q, setQ] = useState('');
  const ref = useRef<HTMLElement>(null);
  const timer = useRef(0);
  const lastPerson = useRef<string | null>(person ?? (cur.kind === 'lineage' ? cur.id : null) ?? selected.peek());

  // широкий экран: применяется сразу (серия флажков — через 300 мс); телефон — по «Показать N лиц»
  const setDraft = (s: Show, delay = 0) => {
    setDraftState(s);
    if (s.kind === 'lineage') lastPerson.current = s.id;
    if (phone || !ready(s)) return;
    window.clearTimeout(timer.current);
    if (delay) timer.current = window.setTimeout(() => setShow(s), delay);
    else setShow(s);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // другой показ пришёл извне («назад», строка показа) — черновик следует за ним (не на телефоне: там черновик свой)
  useEffect(() => {
    if (!phone) setDraftState(cur);
  }, [cur]);

  // фокус при открытии: созвездия — поле «Найти созвездие», род — поле лица или направление, иначе — нынешний вид
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pick =
      focus === 'groups'
        ? ((group ? el.querySelector<HTMLElement>(`#ss-g-${group}`) : null) ?? el.querySelector<HTMLElement>('#show-find'))
        : focus === 'lineage'
          ? (el.querySelector<HTMLElement>('#show-person') ?? el.querySelector<HTMLElement>('.ss-dir button[aria-pressed="true"]'))
          : el.querySelector<HTMLElement>('.ss-kinds input:checked');
    (pick ?? el.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true });
  }, []);

  // Escape — закрыть лист (в поле с текстом Escape сначала очищает поле); нажатие мимо — закрыть (широкий экран)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (!ref.current?.contains(t)) return;
      if (isTextField(t) && (t as HTMLInputElement).value) return;
      if (t?.closest('[role="listbox"], [role="menu"]')) return;
      e.preventDefault();
      e.stopPropagation();
      closeShowSheet(true);
    };
    const away = (e: PointerEvent) => {
      if (phone) return;
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest('.showbar')) return;
      closeShowSheet(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', away, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', away, true);
    };
  }, [phone]);

  const n = ready(draft) ? countShow(draft) : 0;
  return (
    <section class="sheet showsheet" ref={ref} role="dialog" aria-labelledby="show-h" data-reserve="sheet" data-show-sheet="">
      <header class="sheet-head">
        <h2 id="show-h" tabIndex={-1}>
          Что показать на небе
        </h2>
        <Close label="Закрыть лист «Показ»" onClick={() => closeShowSheet(true)} />
      </header>
      <fieldset class="ss-kinds">
        <legend class="visually-hidden">Показ</legend>
        {KINDS.map((k) => {
          const on = draft.kind === k.kind;
          const count = kindCount(k.kind, draft);
          return (
            <label key={k.kind} class={on ? 'ss-kind on' : 'ss-kind'} title={k.hint}>
              <input
                type="radio"
                name="show-kind"
                value={k.kind}
                checked={on}
                onChange={() => setDraft(draftFor(k.kind, draft, lastPerson.current ?? selected.peek()))}
              />
              <span class="nm">{typo(k.label)}</span>
              {count && <span class="n">{typo(count)}</span>}
            </label>
          );
        })}
      </fieldset>
      {draft.kind === 'groups' || focus === 'groups' ? (
        <GroupsPart draft={draft} q={q} setQ={setQ} setDraft={setDraft} group={group} />
      ) : null}
      {draft.kind === 'lineage' ? <LineagePart draft={draft} setDraft={setDraft} /> : null}
      {draft.kind === 'lineage' && !ready(draft) ? <p class="muted">{typo('Выберите лицо: его предки или потомки встанут на небо.')}</p> : null}
      {phone ? (
        <div class="ss-apply">
          <button
            type="button"
            class="cmd apply"
            aria-disabled={!ready(draft) ? 'true' : undefined}
            onClick={() => {
              if (!ready(draft)) return;
              setShow(draft);
              closeShowSheet(false);
            }}
          >
            {ready(draft) ? `Показать ${personsN(n)}` : 'Показать'}
          </button>
        </div>
      ) : (
        <p class="ss-count" aria-live="polite">
          {ready(draft) ? typo(`На небе — ${personsN(n)}`) : ''}
        </p>
      )}
    </section>
  );
}

// ---------- созвездия ----------

/** Флажок с тремя состояниями (раздел «все колена»): mixed — выбраны не все. */
function TriCheck({ state, onChange, label }: { state: boolean | 'mixed'; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed';
  }, [state]);
  return (
    <label class="check ss-all">
      <input ref={ref} type="checkbox" checked={state === true} aria-checked={state === 'mixed' ? 'mixed' : state} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      {typo(label)}
    </label>
  );
}

/** «все колена — 1 470», «все — 97»: подпись флажка раздела. */
const allLabel = (sec: GroupSectionInfo) => `${sec.id === 'tribes' ? 'все колена' : 'все'} — ${num(sec.count)}`;

function GroupsPart({
  draft,
  q,
  setQ,
  setDraft,
  group = null,
}: {
  draft: Show;
  q: string;
  setQ: (v: string) => void;
  setDraft: (s: Show, delay?: number) => void;
  group?: string | null;
}) {
  const secs = groupSections();
  const chosen = new Set(draft.kind === 'groups' ? draft.groups : []);
  const links: LinksOut = draft.kind === 'groups' ? draft.links : 'stubs';
  const [openSecs, setOpenSecs] = useState<Set<string>>(() => new Set(secs.filter((s) => s.groups.some((g) => chosen.has(g.id) || g.id === group)).map((s) => s.id)));
  const query = q.trim();
  const hits = useMemo(() => (query ? new Set(secs.flatMap((s) => s.groups.filter((g) => groupMatches(g.name, query)).map((g) => g.id))) : null), [query]);
  const put = (groups: string[], delay = 300) => setDraft({ kind: 'groups', groups: [...new Set(groups)], links }, delay);
  const only = (g: GroupRow) => put(withHouses(g.id), 0);
  const toggle = (id: string, on: boolean) => put(on ? [...chosen, id] : [...chosen].filter((x) => x !== id));
  const found = hits ? secs.flatMap((s) => s.groups.filter((g) => hits.has(g.id))) : [];
  return (
    <div class="ss-groups">
      <div class="field ss-find">
        <label for="show-find">Найти созвездие</label>
        <input
          id="show-find"
          type="search"
          autocomplete="off"
          spellcheck={false}
          value={q}
          placeholder="например, нах"
          aria-describedby="show-find-n"
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            // Enter — только первое найденное (с домами) на небе, и лист закрывается, фокус — на «изменить»: «только Дом
            // Нахора» — три действия (Я27), с клавиатуры — «изменить», «нах», Enter (Я32); на телефоне так же
            if (e.key === 'Enter' && found.length >= 1) {
              e.preventDefault();
              setShow({ kind: 'groups', groups: [...new Set(withHouses(found[0].id))], links });
              closeShowSheet(true);
            } else if (e.key === 'ArrowDown') {
              const first = (e.currentTarget as HTMLElement).closest('.ss-groups')?.querySelector<HTMLElement>('.ss-row input');
              if (first) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
        />
        <span id="show-find-n" class="visually-hidden" aria-live="polite">
          {query ? (found.length ? `найдено созвездий: ${found.length}; Enter — на небе только «${found[0].name}»` : 'созвездий не найдено') : ''}
        </span>
      </div>
      {secs.map((sec) => {
        const rows = hits ? sec.groups.filter((g) => hits.has(g.id)) : sec.groups;
        if (hits && !rows.length) return null;
        const open = !!hits || openSecs.has(sec.id);
        const all = sec.groups.every((g) => chosen.has(g.id));
        const some = sec.groups.some((g) => chosen.has(g.id));
        const hid = `ss-sec-${sec.id}`;
        return (
          <div class={open ? 'ss-sec open' : 'ss-sec'} key={sec.id}>
            <div class="ss-sec-head">
              <button
                type="button"
                class="ss-toggle"
                id={hid}
                aria-expanded={open}
                onClick={() => {
                  const next = new Set(openSecs);
                  if (next.has(sec.id)) next.delete(sec.id);
                  else next.add(sec.id);
                  setOpenSecs(next);
                }}
              >
                <span class="tri" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                {typo(sec.name)}
              </button>
              <TriCheck
                state={all ? true : some ? 'mixed' : false}
                label={allLabel(sec)}
                onChange={(v) => {
                  const ids = sec.groups.map((g) => g.id);
                  put(v ? [...chosen, ...ids] : [...chosen].filter((x) => !ids.includes(x)), 0);
                }}
              />
            </div>
            {open && (
              <ul class="ss-list" aria-labelledby={hid}>
                {rows.map((g) => (
                  <li key={g.id} class={['ss-row', g.depth ? 'house' : '', chosen.has(g.id) ? 'on' : ''].filter(Boolean).join(' ')}>
                    <label class="check">
                      <input id={`ss-g-${g.id}`} type="checkbox" checked={chosen.has(g.id)} onChange={(e) => toggle(g.id, (e.currentTarget as HTMLInputElement).checked)} />
                      <span class="nm">{typo(g.name)}</span>
                    </label>
                    <span class="n" aria-label={personsN(g.count)}>
                      {num(g.count)}
                    </span>
                    <button
                      type="button"
                      class="cmd only"
                      aria-label={typo(`Только «${g.name}»${g.total > g.count ? ` с домами — ${personsN(g.total)}` : ''}`)}
                      title={g.total > g.count ? typo(`Только это созвездие с его домами: ${personsN(g.total)}`) : 'Только это созвездие'}
                      onClick={() => only(g)}
                    >
                      только это
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {hits && !found.length ? <p class="muted">{typo(`Созвездия «${query}» нет.`)}</p> : null}
      <fieldset class="ss-links">
        <legend>Связи наружу</legend>
        {LINKS.map((l) => (
          <label key={l.value} class="ss-radio" title={l.hint}>
            <input
              type="radio"
              name="show-links"
              value={l.value}
              checked={links === l.value}
              onChange={() => draft.kind === 'groups' && setDraft({ ...draft, links: l.value })}
            />
            {typo(l.label)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

// ---------- род лица ----------

/** Сегменты: одна остановка Tab, выбор — стрелками, нажатая — aria-pressed. */
function Seg<T>({ label, cls, options, value, onPick }: { label: string; cls: string; options: readonly { value: T; label: string; hint?: string }[]; value: T; onPick: (v: T) => void }) {
  const i = options.findIndex((o) => o.value === value);
  return (
    <div
      class={`seg ${cls}`}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const j = (i + d + options.length) % options.length;
        onPick(options[j].value);
        const bs = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button');
        bs[j]?.focus();
      }}
    >
      {options.map((o, k) => (
        <button type="button" key={String(o.value)} aria-pressed={k === i} tabIndex={k === i || (i < 0 && k === 0) ? 0 : -1} title={o.hint} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LineagePart({ draft, setDraft }: { draft: Extract<Show, { kind: 'lineage' }>; setDraft: (s: Show, delay?: number) => void }) {
  const [editing, setEditing] = useState(!byId.has(draft.id));
  const [q, setQ] = useState('');
  const hits = useMemo(() => personHits(q), [q]);
  const blocks = useMemo(() => personBlocks(hits), [hits]);
  const p = byId.get(draft.id);
  return (
    <div class="ss-lineage">
      <h3>Род лица</h3>
      {editing || !p ? (
        <Combobox
          id="show-person"
          class="field search combo"
          label="Лицо:"
          type="text"
          placeholder="имя"
          listLabel="Лицо"
          q={q}
          onInput={setQ}
          blocks={blocks}
          status={countStatus(hits.length)}
          onChoose={(r: Row) => {
            if (r.kind !== 'person') return;
            setQ('');
            setEditing(false);
            setDraft({ ...draft, id: r.id });
            window.setTimeout(() => document.querySelector<HTMLElement>('.showsheet .ss-dir button[aria-pressed="true"]')?.focus(), 30);
            return 'clear';
          }}
          empty={typo(`Лица с именем «${q.trim()}» в атласе нет.`)}
          autoFocus={editing}
        />
      ) : (
        <div class="slot">
          <span class="k">Лицо:</span>
          <span class="who">
            {p.name}
            {p.disambig ? <span class="muted">{typo(`, ${p.disambig}`)}</span> : null}
          </span>
          <button type="button" class="cmd" aria-label="Заменить лицо рода" onClick={() => setEditing(true)}>
            заменить
          </button>
        </div>
      )}
      <div class="ss-opts">
        <Seg label="Направление" cls="ss-dir" options={DIRS} value={draft.dir} onPick={(v) => setDraft({ ...draft, dir: v })} />
        <span class="k" aria-hidden="true">
          поколений:
        </span>
        <Seg label="Поколений" cls="ss-gen" options={GENS} value={draft.gen} onPick={(v) => setDraft({ ...draft, gen: v })} />
        <Seg label="Род" cls="ss-by" options={BYS} value={draft.by} onPick={(v) => setDraft({ ...draft, by: v })} />
      </div>
    </div>
  );
}

/** Название созвездия лица — для «Созвездие» в паспорте и меню звезды. */
export const groupName = (id: string) => groupById.get(id)?.name ?? id;
