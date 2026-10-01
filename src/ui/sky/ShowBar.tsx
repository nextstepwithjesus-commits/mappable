/**
 * Строка показа у верхней кромки неба (этап 11, решения 77, 81; STAGE11.md § 5): что сейчас на небе и как это
 * изменить. Стоит на месте прежней строки «Раскрыто N лиц»:
 *   «На небе: всё небо — изменить»;
 *   «На небе: созвездие «Дом Нахора» — 17 лиц; основатель Нахор; 3 связи наружу — изменить, добавить созвездие
 *    «Патриархи», всё небо»;
 *   «На небе: потомки ▾ Иуды (сын Иакова) — все поколения ▾; по отцам ▾ — 302 лица — всё небо».
 * Каждая изменяемая часть — отдельная команда (src/ui/show.ts, showSummary): «изменить» открывает лист «Показ»
 * (src/ui/panels/Show.tsx), «всё небо» — показ всего неба, части рода лица — списки с выбором.
 *
 * Строка — группа органов с именем «Показ: …»; смена показа объявляется живой областью (visually-hidden) — диктор слышит
 * «На небе: созвездие «Дом Нахора» — 17 лиц…». data-reserve — подписи звёзд под строкой не рисуются (SkyView).
 *
 * Под ней — строки состояния неба (этап 13, решения 102, 111; контракт 5: src/ui/modelinfo.ts, barLines), каждая своей
 * строкой с командой: «Годы — по модели «Краткое пребывание» — вернуть основную», «Скрыто: связи, подписи — вернуть».
 * На телефоне — коротко: «модель «Краткое пребывание» — вернуть основную», «Скрыто: 2 слоя — вернуть».
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  clearResults, LINES_TITLE, RESULT_WORD, resultGuests, resultIds, returnFromFamily, setLinkNote, setShow, show, showContent, showSummary, type ShowCmd, type SummaryPart,
} from '../show.ts';
import { pins, pinsQuery, selected, skyGroup } from '../../state.ts';
import { byId } from '../../data/atlas.ts';
import { goTo, skyRef } from '../common.tsx';
import { emptyWindow, inView } from './view.ts';
import { explorePath } from '../address.ts';
import { viewportWidth } from '../layout.ts';
import { barLines, type BarLine } from '../modelinfo.ts';
import { grid } from '../layout.ts';
import { Menu } from '../controls.tsx';
import { typo } from '../text/typo.ts';
import { lowerFirst } from '../text/ru.ts';
import { openShowSheet, showSheet } from '../panels/Show.tsx';

/**
 * «Показать на всём небе» (решение 111; X4 Д6 п. 3): лицо вне показа — показ «всё небо» с опорой на это лицо, и, когда
 * небо перестроится, перелёт к нему, если его нет в кадре. Её же зовёт команда подробной карточки у лица вне показа.
 */
export function revealOnAll(id: string) {
  setShow({ kind: 'all' }, { anchor: id });
  const go = (n: number) => {
    const s = skyRef.current;
    if (s && (s.transitioning || s.cam.moving) && n < 120) {
      requestAnimationFrame(() => go(n + 1));
      return;
    }
    if (!inView(id)) skyRef.flyTo(id);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => go(0)));
}

/**
 * Строка гостей-результатов (решение 113): «Результаты поиска вне показа: 2 — снять». «Снять» снимает и то, что их
 * показало: отметки поиска, подсвеченную главу или участок Синопсиса; у найденного лица — только гостя.
 */
function resultLine(): BarLine | null {
  const r = resultGuests.value;
  const n = resultIds.value.length;
  if (!r || !n) return null;
  const text = `${RESULT_WORD[r.source]}: ${n}`;
  return {
    key: 'results' as BarLine['key'],
    text,
    short: text,
    hint: 'Эти лица стоят вне нынешнего показа; до «снять» они на небе гостями',
    cmd: 'снять',
    run: () => {
      if (r.until === 'pins') {
        pins.value = [];
        pinsQuery.value = '';
      } else if (r.until === 'group') skyGroup.value = null;
      clearResults();
    },
  };
}

/**
 * Эпоха без лиц показа (решение 147; U5): после прыжка по эпохе в частичном показе в кадре нет ни одного его лица —
 * «В показе нет лиц этой эпохи — всё небо». «Всё небо» — показ всего неба, окно эпохи остаётся.
 */
export const EMPTY_EPOCH = 'В показе нет лиц этой эпохи';
function emptyLine(): BarLine | null {
  if (!emptyWindow.value || show.value.kind === 'all') return null;
  return {
    key: 'empty' as BarLine['key'],
    text: EMPTY_EPOCH,
    short: 'нет лиц показа в этой эпохе',
    hint: 'Нынешний показ не содержит лиц этого времени; всё небо покажет всех, кто жил тогда',
    cmd: 'всё небо',
    run: () => setShow({ kind: 'all' }),
  };
}

/** Путь исследования свёрнут до «‹ Руфь» (решение 148): на 1024 px и уже, на телефоне. */
export const PATH_FOLD_W = 1100;

/**
 * Путь исследования (решение 148; U12, инвариант 9): «Путь: Руфь › Давид › Соломон» — до 5 последних выборов, прежние
 * имена нажимаются (выбор и, если звезды нет на экране, перелёт — как у ссылки), последнее — выбранное лицо. На 1024 px
 * и на телефоне — «‹ Руфь»: шаг назад по пути. Пунктирного кольца «откуда» нет (решение 93: пунктир — «нарисовано не
 * здесь»).
 */
function PathLine() {
  const path = explorePath.value;
  const sel = selected.value;
  if (!sel || path.length < 2 || path[path.length - 1] !== sel) return null;
  const name = (id: string) => byId.get(id)?.name ?? id;
  const full = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.name}${p.disambig ? `, ${p.disambig}` : ''}` : id;
  };
  const fold = viewportWidth.value <= PATH_FOLD_W;
  const prev = path[path.length - 2];
  const label = `Путь: ${path.map(full).join(' › ')}`;
  return (
    <span class="sb-line sb-path" data-line="path" aria-label={typo(label)} role="group">
      {fold ? (
        <button type="button" class="sb-cmd" data-cmd="path" data-id={prev} title={typo(`Назад по пути: ${full(prev)}`)} onClick={() => goTo(prev, 'link')}>
          {typo(`‹ ${name(prev)}`)}
        </button>
      ) : (
        <>
          <span class="sb-t">Путь: </span>
          {path.map((id, i) => (
            <span key={`${i}:${id}`} class="sb-step">
              {i > 0 && (
                <span class="sep" aria-hidden="true">
                  {' › '}
                </span>
              )}
              {i < path.length - 1 ? (
                <button type="button" class="sb-cmd" data-cmd="path" data-id={id} title={typo(full(id))} onClick={() => goTo(id, 'link')}>
                  {typo(name(id))}
                </button>
              ) : (
                <span class="sb-t" aria-current="true">
                  {typo(name(id))}
                </span>
              )}
            </span>
          ))}
        </>
      )}
    </span>
  );
}

/** Команда части строки. */
function runCmd(cmd: ShowCmd, from: HTMLElement | null) {
  if (cmd.kind === 'sheet') openShowSheet(cmd.lineage ? { back: from, focus: 'lineage', person: cmd.lineage } : { back: from });
  else if (cmd.kind === 'show') setShow(cmd.show);
  else if (cmd.kind === 'reveal') revealOnAll(cmd.id);
  else if (cmd.kind === 'return') returnFromFamily();
}

/**
 * Строка перенеслась больше чем на max строк? Строки текста — по серединам частей строки (буквы и команды). На телефоне
 * строке показа можно две строки (решение 118; UI-06): лицо, направление, глубина и принцип родства не теряются.
 */
function wrapped(el: HTMLElement, max = 1): boolean {
  const tops: number[] = [];
  // части строки: слова, команды, кнопки списков — без открытых списков под строкой
  for (const part of el.querySelectorAll<HTMLElement>('.txt .sb-k, .txt .sb-t, .txt .dash, .txt .sb-cmd, .txt .sb-menu > button'))
    for (const q of part.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      const mid = q.top + q.height / 2;
      if (!tops.some((t) => Math.abs(t - mid) < 10)) tops.push(mid);
      if (tops.length > max) return true;
    }
  return false;
}

/** Часть строки с командой: кнопка («изменить», «всё небо») или список (поля рода лица). */
function Part({ part }: { part: SummaryPart }) {
  const cmd = part.cmd;
  if (!cmd) return <span class="sb-t">{typo(part.text)}</span>;
  if (cmd.kind === 'menu')
    return (
      <Menu
        class="sb-menu"
        label={`${typo(part.text)} ▾`}
        title={cmd.field === 'dir' ? 'Предки, потомки или те и другие' : cmd.field === 'gen' ? 'Сколько поколений показать' : 'Род по отцам или по крови'}
        radio
        items={cmd.options.map((o, i) => ({ key: String(i), label: typo(o.label), checked: o.current, onSelect: () => setShow(o.show) }))}
      />
    );
  const sheet = cmd.kind === 'sheet';
  // пояснение — при наведении и для диктора (UX-21), как у органов неба
  const tip = sheet
    ? `Лист «Показ»: всё небо, ${lowerFirst(LINES_TITLE)}, ключевые лица, созвездия, предки и потомки лица, набор`
    : cmd.kind === 'reveal'
      ? 'Всё небо — и перелёт к лицу'
      : cmd.kind === 'return'
        ? 'Показ и окно, с которых пришли в «Ближайшую родню» (Esc)'
        : undefined;
  return (
    <button
      type="button"
      class="sb-cmd"
      data-cmd={cmd.kind}
      aria-haspopup={sheet ? 'dialog' : undefined}
      aria-expanded={sheet ? showSheet.value !== null : undefined}
      title={tip}
      aria-description={tip}
      onClick={(e) => runCmd(cmd, e.currentTarget as HTMLElement)}
    >
      {typo(part.text)}
    </button>
  );
}

/**
 * Строка показа: предложение «На небе: …» с изменяемыми частями и команды после тире. Строка всегда в одну строку:
 * не поместилась (узкое небо, телефон, открытая карточка справа) — сперва без подробностей (mid), затем коротко:
 * «Дом Нахора» — 17 лиц — изменить» (short); подробности — в листе «Показ» и в имени группы для диктора.
 */
/** Сколько строк можно строке показа: на телефоне две (решение 118), иначе одна. */
const maxLines = () => (grid.peek().phone ? 2 : 1);

export function ShowBar() {
  const sum = showSummary.value;
  // объявление смены показа (не первое): живая область меняет текст — диктор его читает
  const [said, setSaid] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaid(typo(sum.label));
  }, [sum.label]);
  // 0 — полная строка, 1 — без подробностей, 2 — коротко; ширина места строки (у кромки неба) — заново с полной
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  levelRef.current = level;
  const [room, setRoom] = useState(0);
  // шрифты догрузились (первое посещение, файл с диска): ширины слов другие — строка подбирается заново
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(Math.round(box.clientWidth)));
    ro.observe(box);
    // и сама строка: выросла по высоте (перенеслась после отрисовки) — следующая, более краткая форма
    const self = new ResizeObserver(() => {
      if (levelRef.current < 2 && wrapped(el, maxLines())) setLevel(levelRef.current + 1);
    });
    self.observe(el);
    const ff = typeof document !== 'undefined' ? (document as { fonts?: FontFaceSet }).fonts : undefined;
    const onFonts = () => setFonts((n) => n + 1);
    ff?.addEventListener?.('loadingdone', onFonts);
    return () => {
      ro.disconnect();
      self.disconnect();
      ff?.removeEventListener?.('loadingdone', onFonts);
    };
  }, []);
  useLayoutEffect(() => setLevel(0), [sum.label, room, fonts]);
  // сменилась модель или выключили слой — диктор слышит новую строку («Годы — по модели …», «Скрыто: связи»); строка
  // ушла — слышит, что вернулось: «Годы — по основной модели», «Все слои на небе»
  const cur = barLines.value;
  const linesSaid = cur.map((l) => l.text).join('. ');
  const prevLines = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const was = prevLines.current;
    prevLines.current = new Map(cur.map((l) => [l.key as string, l.text]));
    if (!was) return;
    const back = [...was.keys()].filter((k) => !cur.some((l) => l.key === k)).map((k) => (k === 'model' ? 'Годы — по основной модели' : 'Все слои на небе'));
    const now = cur.filter((l) => was.get(l.key) !== l.text).map((l) => l.text);
    setSaid([...back, ...now].length ? typo([...back, ...now].join('. ')) : '');
  }, [linesSaid]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < 2 && wrapped(el, maxLines())) setLevel(level + 1);
  });
  const text = level === 0 ? sum.text : level === 1 ? sum.mid : sum.short;
  // подсказка строки — вся строка; у набора — и оговорка о ссылке (решение 58)
  const tip = show.value.kind === 'set' ? `${sum.label}. ${setLinkNote(showContent.value.ids.size)}` : sum.label;
  // телефон (решение 118): полная строка рода лица — поля списками (▾), «изменить» у неё нет; лист «Показ» на поле рода
  // остаётся под рукой той же командой, что в краткой строке
  const cmds0 = level === 2 ? sum.shortCmds : sum.cmds;
  const cmds = grid.value.phone && level < 2 && !cmds0.some((c) => c.cmd?.kind === 'sheet') ? [...sum.shortCmds.filter((c) => c.cmd?.kind === 'sheet'), ...cmds0] : cmds0;
  const head = level < 2 && text[0]?.text.trim() === 'На небе:' ? text[0] : null;
  const rest = head ? text.slice(1) : text;
  // строки модели и слоёв (контракт 5): на телефоне — коротко; гости-результаты (решение 113)
  const res = resultLine();
  const empty = emptyLine();
  const lines = [...(empty ? [empty] : []), ...barLines.value, ...(res ? [res] : [])];
  const phone = grid.value.phone;
  const extra = lines.map((l) => `${l.text} — ${l.cmd}`).join('. ');
  return (
    <div class="showbar" ref={ref} role="group" aria-label={typo(`Показ. ${sum.label}${extra ? `. ${extra}` : ''}`)} data-reserve="bar" data-level={level} data-lines={lines.map((l) => l.key).join(' ') || undefined}>
      {/* команды после тире — в том же потоке текста: на узком небе строка переносится как предложение,
          «— всё небо» не уходит отдельной строкой (и строка показа не отнимает у неба лишнего места) */}
      <span class="txt" title={typo(tip)}>
        {head && <span class="sb-k">{typo(head.text.trim())} </span>}
        <span class="sb-v">
          {rest.map((p, i) => (
            <Part key={i} part={p} />
          ))}
        </span>
        {cmds.length > 0 && (
          <span class="dash" aria-hidden="true">
            {' — '}
          </span>
        )}
        {/* ключ — надпись: «изменить» остаётся тем же элементом при смене показа, фокус с него не теряется */}
        {cmds.map((p) => (
          <Part key={`c:${p.text}`} part={p} />
        ))}
      </span>
      {lines.map((l) => (
        <span key={l.key} class="sb-line" data-line={l.key} title={typo(l.hint)}>
          <span class="sb-t">{typo(phone ? l.short : l.text)}</span>
          <span class="dash" aria-hidden="true">
            {' — '}
          </span>
          <button type="button" class="sb-cmd" data-cmd={l.key} title={typo(l.hint)} aria-description={typo(l.hint)} onClick={() => l.run()}>
            {typo(l.cmd)}
          </button>
        </span>
      ))}
      <PathLine />
      <span class="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
}
