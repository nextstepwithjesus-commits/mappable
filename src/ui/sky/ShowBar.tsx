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
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { setLinkNote, setShow, show, showContent, showSummary, type ShowCmd, type SummaryPart } from '../show.ts';
import { Menu } from '../controls.tsx';
import { typo } from '../text/typo.ts';
import { openShowSheet, showSheet } from '../panels/Show.tsx';

/** Команда части строки. */
function runCmd(cmd: ShowCmd, from: HTMLElement | null) {
  if (cmd.kind === 'sheet') openShowSheet(cmd.lineage ? { back: from, focus: 'lineage', person: cmd.lineage } : { back: from });
  else if (cmd.kind === 'show') setShow(cmd.show);
}

/**
 * Строка перенеслась? Строки текста — по верхним краям частей строки (буквы и команды): разные — больше одной строки.
 */
function wrapped(el: HTMLElement): boolean {
  const tops: number[] = [];
  // части строки: слова, команды, кнопки списков — без открытых списков под строкой
  for (const part of el.querySelectorAll<HTMLElement>('.txt .sb-k, .txt .sb-t, .txt .dash, .txt .sb-cmd, .txt .sb-menu > button'))
    for (const q of part.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      const mid = q.top + q.height / 2;
      if (!tops.some((t) => Math.abs(t - mid) < 10)) tops.push(mid);
      if (tops.length > 1) return true;
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
  const tip = sheet ? 'Лист «Показ»: всё небо, линии Мессии — Мф 1 и Лк 3, ключевые лица, созвездия, род лица, набор' : undefined;
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
      if (levelRef.current < 2 && wrapped(el)) setLevel(levelRef.current + 1);
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < 2 && wrapped(el)) setLevel(level + 1);
  });
  const text = level === 0 ? sum.text : level === 1 ? sum.mid : sum.short;
  // подсказка строки — вся строка; у набора — и оговорка о ссылке (решение 58)
  const tip = show.value.kind === 'set' ? `${sum.label}. ${setLinkNote(showContent.value.ids.size)}` : sum.label;
  const cmds = level === 2 ? sum.shortCmds : sum.cmds;
  const head = level < 2 && text[0]?.text.trim() === 'На небе:' ? text[0] : null;
  const rest = head ? text.slice(1) : text;
  return (
    <div class="showbar" ref={ref} role="group" aria-label={typo(`Показ. ${sum.label}`)} data-reserve="bar" data-level={level}>
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
      <span class="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
}
