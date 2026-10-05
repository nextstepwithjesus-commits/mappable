import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { signal } from '@preact/signals';
import { byId, graph, lines, loadCard, loadedCard } from '../../data/atlas.ts';
import { BOOKS } from '../../engine/books.ts';
import { norm, nameMatcher } from '../../engine/text.ts';
import { stems, textNamesOfCard } from '../../engine/search.ts';
import { panel, skyGroup } from '../../state.ts';
import { MarkNote, P, flyToIds, refLabel, renderBrackets } from '../common.tsx';
import { grid } from '../layout.ts';
import { sheetStop } from '../sheet.ts';
import { typo } from '../text/typo.ts';
import { Sheet, useRemembered } from './Sheet.tsx';
import { showResults } from '../show.ts';

// ---------- чтение глав (G3; ТЗ § 3.7; CARD-41; UX-39; VIS-35) ----------
export const CHAPTERS = [
  'Быт 4',
  'Быт 5',
  'Быт 10',
  'Быт 11',
  'Быт 25',
  'Быт 36',
  'Быт 46',
  'Исх 6',
  'Руф 4',
  '1Пар 1',
  '1Пар 2',
  '1Пар 3',
  '1Пар 4',
  '1Пар 5',
  '1Пар 6',
  '1Пар 7',
  '1Пар 8',
  '1Пар 9',
  'Мф 1',
  'Лк 3',
];
/**
 * Одиннадцать мест Бытия, которые начинаются словами «Вот родословие…», «Вот житие…», «Вот происхождение…» (этап 19).
 * Слова — Синодального текста (npm run verse); лица — те, чьё родословие или житие названо. Глава из CHAPTERS
 * открывается здесь же, остальные — ссылкой на стих.
 */
export const TOLEDOT: readonly { ref: string; words: string; ids: readonly string[] }[] = [
  { ref: 'Быт 2:4', words: 'Вот происхождение неба и земли', ids: [] },
  { ref: 'Быт 5:1', words: 'Вот родословие Адама', ids: ['adam'] },
  { ref: 'Быт 6:9', words: 'Вот житие Ноя', ids: ['noy'] },
  { ref: 'Быт 10:1', words: 'Вот родословие сынов Ноевых: Сима, Хама и Иафета', ids: ['sim', 'kham', 'iafet'] },
  { ref: 'Быт 11:10', words: 'Вот родословие Сима', ids: ['sim'] },
  { ref: 'Быт 11:27', words: 'Вот родословие Фарры', ids: ['farra'] },
  { ref: 'Быт 25:12', words: 'Вот родословие Измаила, сына Авраамова', ids: ['izmail'] },
  { ref: 'Быт 25:19', words: 'Вот родословие Исаака, сына Авраамова', ids: ['isaak'] },
  { ref: 'Быт 36:1', words: 'Вот родословие Исава, он же Едом', ids: ['isav'] },
  { ref: 'Быт 36:9', words: 'И вот родословие Исава, отца Идумеев, на горе Сеир', ids: ['isav'] },
  { ref: 'Быт 37:2', words: 'Вот житие Иакова', ids: ['iakov'] },
];

/** С какого стиха глава открывается: родословие Лк 3 начинается с 3:23 (стихи до него — по команде). */
export const FIRST_VERSE: Record<string, number> = { 'Лк 3': 23 };

export type Verse = { n: number; t: string; ids: string[] };
/** Кусок стиха: текст или имя лица, ставшее ссылкой. */
export type Part = string | { id: string; text: string };

/**
 * Порядок имён родословия в тексте главы: у Матфея — от Авраама (1) до Иисуса (42), у Луки — от Иосифа (1) до Адама (75).
 * По нему одноимённые Лк 3 (три Иосифа, два Матфата, два Левия, два Мелхия) получают каждый своё лицо.
 */
export function chapterSequence(ch: string): string[] | null {
  if (ch === 'Мф 1')
    return lines.joseph.persons
      .filter((s) => s.mt)
      .sort((a, b) => a.mt! - b.mt!)
      .map((s) => s.id);
  if (ch === 'Лк 3')
    return [
      'iosif-muzh-marii',
      ...lines.mary.persons
        .filter((s) => s.lk)
        .sort((a, b) => a.lk! - b.lk!)
        .map((s) => s.id),
    ];
  return null;
}

const WORD = /[А-ЯЁ][а-яё]*(?:[-—–][А-ЯЁа-яё][а-яё]*)*/g;
const matchers = new Map<string, { full: boolean; res: RegExp[]; firsts: string[][] }>();
/**
 * Формы имени лица для сверки со словом текста: имя и, когда том карточки загружен, иные имена без титулов и прозваний
 * («Пилат», но не «Господь» и не «Дева»: они стоят в тексте как нарицательные слова) — как у поиска по стиху.
 * Иные имена — только из одного слова: описательные («Сын Иессеев») начинаются с нарицательного слова.
 */
const formsOf = (id: string) => {
  const card = loadedCard(id);
  let f = matchers.get(id);
  if (!f || (!f.full && card)) {
    const p = byId.get(id);
    const names = p && !p.unnamed ? [p.name, ...textNamesOfCard(card).filter((a) => !/\s/.test(a.trim()))] : [];
    f = { full: !!card, res: names.map(nameMatcher), firsts: names.map((n) => stems(norm(n).split(/\s+/)[0])) };
    matchers.set(id, f);
  }
  return f;
};
const named = (id: string, w: string) => formsOf(id).res.some((re) => re.test(` ${w} `));
/** Слово — форма самого имени, а не только его начало: «Иосифа» — Иосиф, а не Иосия. */
const fullForm = (id: string, w: string) => {
  const ws = stems(w);
  return formsOf(id).firsts.some((a) => ws.some((x) => a.includes(x)));
};
/** Сколько слов уточнения лица есть рядом (стих и предыдущий): «Ирод был четвертовластником» — Ирод, четвертовластник. */
const context = (id: string, words: string[]) => {
  const ds = norm(byId.get(id)?.disambig ?? '')
    .split(/[^а-я]+/)
    .filter((x) => x.length >= 5)
    .map((x) => x.slice(0, 5));
  return ds.filter((d) => words.some((w) => w.startsWith(d))).length;
};
/** Ссылка покрывает стих: «1Пар 3:21-22», «1Пар 3:19,22»; ссылка на главу целиком не считается. */
const covers = (ref: string, book: string, ch: number, v: number) => {
  const m = /^(\S+)\s+(\d+):([\d,\-–]+)$/.exec(ref.trim());
  if (!m || m[1] !== book || Number(m[2]) !== ch) return false;
  return m[3].split(',').some((part) => {
    const [a, b] = part.split(/[-–]/).map(Number);
    return v >= a && v <= (b || a);
  });
};
/** Стих называет лицо в его собственном родстве: связь с родителем, супругом, родственником или ребёнком стоит на этом стихе. */
const ownVerse = (id: string, book: string, ch: number, v: number) => {
  const p = byId.get(id);
  if (!p) return false;
  const refs = [
    ...p.parentRefs,
    ...p.otherParents.flatMap((o) => o.refs),
    ...p.spouses.flatMap((x) => x.refs),
    ...p.kin.flatMap((x) => x.refs),
    ...(graph.childrenOf.get(id) ?? []).flatMap((e) => e.refs),
  ];
  return refs.some((r) => covers(r, book, ch, v));
};

/**
 * Имена лиц атласа в тексте главы — ссылками (G3). Слово с прописной сверяется с именем и иными именами лиц,
 * на которых ссылается стих. В родословиях Мф 1 и Лк 3 лица идут по порядку линии: слово сверяется сначала
 * с ближайшими по порядку лицами (текущее, следующее, предыдущее), и так одноимённые различаются.
 * Текст в [скобках] не сверяется: вставка по греческому переводу не называет лица атласа (ТЗ П-2).
 */
export function linkChapter(ch: string, verses: Verse[]): { n: number; parts: Part[] }[] {
  const seq = chapterSequence(ch);
  const [book, chS] = ch.split(' ');
  const chN = Number(chS);
  let k = 0;
  let prevText = '';
  return verses.map((v) => {
    // вставки в [скобках] не сверяются; длина строки сохраняется, чтобы места слов совпадали с текстом
    const plain = v.t.replace(/\[[^\]]*\]/g, (x) => ' '.repeat(x.length));
    const parts: Part[] = [];
    const used = new Set<string>();
    let at = 0;
    for (const m of plain.matchAll(WORD)) {
      const w = norm(m[0]);
      let id: string | null = null;
      if (seq) {
        for (const d of [0, 1, -1, 2, 3]) {
          const j = k + d;
          if (j >= 0 && j < seq.length && named(seq[j], w) && fullForm(seq[j], w)) {
            id = seq[j];
            k = j;
            break;
          }
        }
      }
      if (!id) {
        let cands = v.ids.filter((x) => byId.has(x) && named(x, w));
        const full = cands.filter((x) => fullForm(x, w));
        if (full.length) cands = full;
        if (cands.length > 1) {
          // одноимённые: сначала те, чьё родство стоит на этом стихе (1 Пар 3:22 — Шемаия, сын Шехании, а не Шемаия из Неем 3)
          const own = cands.filter((x) => ownVerse(x, book, chN, v.n));
          if (own.length) cands = own;
        }
        if (cands.length > 1) {
          // затем — чьё уточнение названо рядом («первосвященниках Анне» — Анна, первосвященник)
          const words = norm(`${prevText} ${plain}`).split(/[^а-я]+/);
          const best = Math.max(...cands.map((x) => context(x, words)));
          if (best > 0) cands = cands.filter((x) => context(x, words) === best);
          const fresh = cands.filter((x) => !used.has(x));
          if (fresh.length) cands = fresh;
        }
        id = cands[0] ?? null;
      }
      if (!id) continue;
      used.add(id);
      const i = m.index!;
      const gap = v.t.slice(at, i);
      const last = parts[parts.length - 1];
      // имя из двух слов — одной ссылкой: «Понтий Пилат»
      if (last && typeof last !== 'string' && last.id === id && /^\s+$/.test(gap)) last.text += gap + m[0];
      else {
        if (gap) parts.push(gap);
        parts.push({ id, text: m[0] });
      }
      at = i + m[0].length;
    }
    if (at < v.t.length) parts.push(v.t.slice(at));
    prevText = plain;
    return { n: v.n, parts };
  });
}

/** Главы по книгам: «Быт 4 5 10 11 25 36 46», «1 Пар 1 … 9». */
const TOC = (() => {
  const out: { code: string; name: string; chs: { ch: string; n: string }[] }[] = [];
  for (const ch of CHAPTERS) {
    const [code, n] = ch.split(' ');
    let g = out.find((x) => x.code === code);
    if (!g) out.push((g = { code, name: BOOKS.find((b) => b.code === code)?.name ?? code, chs: [] }));
    g.chs.push({ ch, n });
  }
  return out;
})();

// ---------- телефон: глава → карточка → назад к стиху (решение 114; UI-02) ----------

/**
 * Откуда читатель ушёл из главы в карточку на телефоне: глава, стих и лицо. Над карточкой — строка возврата «‹ Мф 1:5»
 * (ChapterReturn); возврат открывает ту же главу на том же месте (прокрутку помнит Sheet), фокус — на то же имя.
 */
export const chapterReturn = signal<{ ch: string; verse: number; id: string } | null>(null);

/** Вернуться к главе и стиху, из которых открыли карточку. */
export function backToChapter() {
  const r = chapterReturn.peek();
  if (!r) return;
  chapterReturn.value = null;
  chapterAsk.value = r.ch;
  panel.value = 'chapter';
  // после отрисовки главы: имя — в середину листа и в фокус
  let tries = 0;
  const focusName = () => {
    const b = document.querySelector<HTMLElement>(`.sheet .chapter p[data-v="${r.verse}"] .person[data-id="${CSS.escape(r.id)}"]`);
    if (b) {
      b.scrollIntoView({ block: 'center' });
      b.focus({ preventScroll: true });
    } else if (++tries < 40) window.setTimeout(focusName, 50);
  };
  window.setTimeout(focusName, 60);
}

/**
 * Строка возврата над карточкой на телефоне (решение 114): «‹ Мф 1:5 — к главе». Видна, пока открыта карточка лица,
 * в которое перешли из главы. Её ставит лист карточки (src/ui/Folio.tsx) над телом карточки.
 */
export function ChapterReturn({ id }: { id: string }) {
  const r = chapterReturn.value;
  if (!r || r.id !== id || !grid.value.phone) return null;
  const at = refLabel(`${r.ch}:${r.verse}`);
  return (
    <div class="ch-return">
      <button type="button" class="cmd" aria-label={`Назад к главе: ${at}`} onClick={backToChapter}>
        {typo(`‹ ${at}`)}
      </button>
    </div>
  );
}

/** Глава, которую просит открыть поиск («Мф 1» — «Читать Мф 1 — имена со ссылками», IX-75). */
const chapterAsk = signal<string | null>(null);
/** Открыть панель «Главы» на главе ch (из «Глав»): лица главы подсвечиваются на небе, как при выборе в оглавлении. */
export function openChapter(ch: string) {
  chapterAsk.value = ch;
  panel.value = 'chapter';
}

export function ChapterPanel() {
  const [ch, setCh] = useRemembered('chapter:ch', 'Мф 1');
  const asked = chapterAsk.value;
  useLayoutEffect(() => {
    if (!asked) return;
    chapterAsk.value = null;
    if (CHAPTERS.includes(asked)) setCh(asked);
  }, [asked]);
  const [text, setText] = useState<Verse[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setText(null);
    setAll(false);
    let alive = true;
    import('../../generated/chapters.json').then((m) => {
      const book = (m as unknown as { default: Record<string, Verse[]> }).default;
      if (alive) setText(book[ch] ?? []);
    });
    return () => {
      alive = false;
    };
  }, [ch]);
  // тома карточек лиц главы: их иные имена (без титулов) тоже становятся ссылками
  const [cards, setCards] = useState(0);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    const vols = new Map<string, string>();
    for (const v of text)
      for (const id of v.ids) {
        const p = byId.get(id);
        if (p && !vols.has(p.volume)) vols.set(p.volume, id);
      }
    Promise.all([...vols.values()].map((id) => loadCard(id).catch(() => null))).then(() => alive && setCards((x) => x + 1));
    return () => {
      alive = false;
    };
  }, [text]);
  const from = FIRST_VERSE[ch] ?? 1;
  const shown = useMemo(() => (text ? linkChapter(ch, text).filter((v) => all || v.n >= from) : null), [text, ch, all, from, cards]);
  const ids = useMemo(() => [...new Set((shown ?? []).flatMap((v) => v.parts.flatMap((p) => (typeof p === 'string' ? [] : [p.id]))))], [shown]);
  const label = `Лица главы ${refLabel(ch)}`;
  // лица главы подсвечены на небе, пока открыта панель (ТЗ § 3.7): остальное небо гаснет
  useEffect(() => {
    if (!ids.length) return;
    skyGroup.value = { ids, label, kind: 'chapter' };
  }, [ids.join(' ')]);
  useEffect(
    () => () => {
      // закрытие панели снимает подсветку; на телефоне «вписать в небо» закрывает лист, и подсветка остаётся
      if (skyGroup.peek()?.kind === 'chapter' && !keepGroup) skyGroup.value = null;
      keepGroup = false;
    },
    [],
  );
  const fit = () => {
    skyGroup.value = { ids, label, kind: 'chapter' };
    if (grid.peek().phone) {
      keepGroup = true;
      panel.value = null;
    }
    // «Вписать главу»: лица главы вне показа — гостями, пока глава подсвечена (решение 113)
    if (showResults(ids, 'chapter', 'group')) window.setTimeout(() => flyToIds(ids), 120);
    else flyToIds(ids);
  };
  return (
    <Sheet title="Чтение глав" lead="Родословные главы Синодального перевода: имена — ссылки на карточки, лица главы подсвечены на небе.">
      <div class="toc" role="group" aria-label="Глава">
        {TOC.map((b) => (
          <span class="bk" key={b.code}>
            <span class="b" title={b.name}>
              {refLabel(b.code)}
            </span>
            {b.chs.map((c) => (
              <button type="button" key={c.ch} aria-pressed={c.ch === ch} aria-label={refLabel(c.ch)} onClick={() => setCh(c.ch)}>
                {c.n}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div class="cmds">
        {/* одно действие — одно слово (решение 109): «Вписать», «Вписать связь», «Вписать главу» */}
        <button class="cmd" disabled={!ids.length} title="Все лица главы — в окне неба" onClick={fit}>
          Вписать главу
        </button>
        {from > 1 && (
          <button class="cmd" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? `скрыть стихи 1–${from - 1}` : `показать стихи 1–${from - 1}`}
          </button>
        )}
      </div>
      <Toledot open={(c) => setCh(c)} current={ch} />
      <h3 class="ch-title">
        {refLabel(ch)}
        {from > 1 && !all && text?.length ? typo(`:${from}–${text[text.length - 1].n}`) : ''}
      </h3>
      <div
        class="chapter"
        lang="ru"
        onClickCapture={(e) => {
          // телефон (решение 114): имя в главе — карточка следующим экраном, над ней «‹ Мф 1:5»; глава закрывается, её
          // подсветка на небе остаётся
          if (!grid.peek().phone) return;
          const b = (e.target as Element | null)?.closest<HTMLElement>('.person[data-id]');
          const v = b?.closest<HTMLElement>('p[data-v]');
          if (!b || !v) return;
          chapterReturn.value = { ch, verse: Number(v.dataset.v), id: b.dataset.id! };
          window.setTimeout(() => {
            keepGroup = true;
            panel.value = null;
            sheetStop.value = 'full';
          }, 0);
        }}
      >
        {!shown ? (
          <p class="muted">…</p>
        ) : (
          shown.map((v) => (
            <p key={v.n} data-v={v.n}>
              <sup>{v.n}</sup>
              {render(v.parts)}
            </p>
          ))
        )}
      </div>
    </Sheet>
  );
}
/**
 * «Вот родословие…» Бытия (этап 19): одиннадцать начальных слов разделов книги со стихом и лицами. Стих главы из списка
 * чтения открывает её здесь же; имя — ссылка на лицо. Еврейское слово «толедот» — справочно.
 */
function Toledot({ open, current }: { open: (ch: string) => void; current: string }) {
  return (
    <details class="toledot">
      <summary>«Вот родословие…» в Бытии — 11 мест</summary>
      <p class="muted">
        Бытие одиннадцать раз начинает рассказ словами «Вот родословие…», «Вот житие…» или «Вот происхождение…». По-еврейски
        это одно слово — «толедот», отсюда название атласа <MarkNote label="справ." full="справочно: слово подлинника, не текст Синодального перевода" />
      </p>
      <ul>
        {TOLEDOT.map((r) => {
          const ch = r.ref.replace(/:\d+$/, '');
          const here = CHAPTERS.includes(ch);
          return (
            <li key={r.ref}>
              {here ? (
                <button type="button" class="link" aria-pressed={current === ch} onClick={() => open(ch)}>
                  {refLabel(r.ref)}
                </button>
              ) : (
                <span>{refLabel(r.ref)}</span>
              )}{' '}
              {typo(`«${r.words}»`)}
              {r.ids.length ? (
                <>
                  {' — '}
                  {r.ids.map((id, k) => (
                    <span key={id}>
                      {k ? ', ' : ''}
                      <P id={id} />
                    </span>
                  ))}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** «Вписать в небо» на телефоне закрывает лист: подсветка главы остаётся на небе. */
let keepGroup = false;

function render(parts: Part[]): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  parts.forEach((p, i) => {
    if (typeof p === 'string') {
      // знак препинания после имени не отрывается от ссылки на новую строку
      const prev = parts[i - 1];
      const lead = prev && typeof prev !== 'string' ? (/^[,;:.!?»)]+/.exec(p)?.[0] ?? '') : '';
      out.push(renderBrackets(p.slice(lead.length)));
      return;
    }
    const next = parts[i + 1];
    const tail = typeof next === 'string' ? (/^[,;:.!?»)]+/.exec(next)?.[0] ?? '') : '';
    out.push(
      <span class="nobr" key={i}>
        <P id={p.id}>{p.text}</P>
        {tail}
      </span>,
    );
  });
  return out;
}
