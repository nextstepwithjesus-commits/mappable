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
import { useEffect, useRef, useState } from 'preact/hooks';
import { setShow, showSummary, type ShowCmd, type SummaryPart } from '../show.ts';
import { Menu } from '../controls.tsx';
import { typo } from '../text/typo.ts';
import { openShowSheet, showSheet } from '../panels/Show.tsx';

/** Команда части строки. */
function runCmd(cmd: ShowCmd, from: HTMLElement | null) {
  if (cmd.kind === 'sheet') openShowSheet({ back: from });
  else if (cmd.kind === 'show') setShow(cmd.show);
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
  return (
    <button
      type="button"
      class="sb-cmd"
      data-cmd={cmd.kind}
      aria-haspopup={sheet ? 'dialog' : undefined}
      aria-expanded={sheet ? showSheet.value !== null : undefined}
      title={sheet ? 'Лист «Показ»: всё небо, линии Мессии, ключевые лица, созвездия, род лица, набор' : undefined}
      onClick={(e) => runCmd(cmd, e.currentTarget as HTMLElement)}
    >
      {typo(part.text)}
    </button>
  );
}

/** Строка показа: предложение «На небе: …» с изменяемыми частями и команды после тире. */
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
  const head = sum.text[0]?.text.trim() === 'На небе:' ? sum.text[0] : null;
  const rest = head ? sum.text.slice(1) : sum.text;
  return (
    <div class="showbar" role="group" aria-label={typo(`Показ. ${sum.label}`)} data-reserve="bar">
      {/* команды после тире — в том же потоке текста: на узком небе строка переносится как предложение,
          «— всё небо» не уходит отдельной строкой (и строка показа не отнимает у неба лишнего места) */}
      <span class="txt" title={typo(sum.label)}>
        {head && <span class="sb-k">{typo(head.text.trim())} </span>}
        <span class="sb-v">
          {rest.map((p, i) => (
            <Part key={i} part={p} />
          ))}
        </span>
        {sum.cmds.length > 0 && (
          <span class="dash" aria-hidden="true">
            {' — '}
          </span>
        )}
        {/* ключ — надпись: «изменить» остаётся тем же элементом при смене показа, фокус с него не теряется */}
        {sum.cmds.map((p) => (
          <Part key={`c:${p.text}`} part={p} />
        ))}
      </span>
      <span class="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
}
