/**
 * Таблица клавиш (D10; IX-41, UX-40): клавиши обеих раскладок — клавиши атласа привязаны к физическим клавишам
 * (KeyboardEvent.code), поэтому на русской раскладке нажимается та же клавиша с другой надписью.
 * Таблица стоит в «Условных знаках», в разделе «Клавиши» (#legend-keys); клавиша «?» открывает панель на нём
 * (src/ui/keys.ts → openLegend('keys')).
 */
import type { ComponentChildren } from 'preact';
import { typo } from '../text/typo.ts';

/** Клавиша: надпись на английской раскладке и, если другая, на русской. */
type Key = { en: string; ru?: string };
/** Строка таблицы: клавиши (любая из них) и действие. */
export type KeyRow = { keys: Key[]; what: string };

const k = (en: string, ru?: string): Key => ({ en, ru });

/** Клавиши неба и карточки — в том порядке, в каком их осваивают. */
export const KEY_ROWS: KeyRow[] = [
  { keys: [k('/', '.')], what: 'найти лицо или стих' },
  { keys: [k('?')], what: 'эта таблица' },
  { keys: [k('Esc')], what: 'снять одно: выбор второго лица, панель, отметки, пару, выбранное лицо' },
  { keys: [k('+'), k('−')], what: 'приблизить или отдалить вдвое — у выбранного лица, если оно на виду' },
  { keys: [k('0'), k('Home')], what: 'всё небо' },
  { keys: [k('←'), k('→'), k('↑'), k('↓')], what: 'сдвинуть небо; с Shift — втрое дальше' },
  { keys: [k('[', 'х')], what: 'к родителю' },
  { keys: [k(']', 'ъ')], what: 'обратно к тому, от кого поднялись по «[»; иначе к ребёнку на линии Мессии или к самому значимому' },
  { keys: [k(',', 'б'), k('.', 'ю')], what: 'к предыдущему или следующему брату или сестре' },
  { keys: [k('J', 'о'), k('K', 'л')], what: 'к следующему или предыдущему разделу карточки' },
  { keys: [k('E', 'у')], what: 'ярусы эпох' },
  { keys: [k('L', 'д')], what: 'условные знаки' },
  { keys: [k('Enter')], what: 'на небе — открыть звезду под указателем; в списке лиц неба — выбранное лицо' },
];

/** Мышь, тачпад и касание — там же, чтобы читатель нашёл их вместе с клавишами. */
export const POINTER_ROWS: { how: string; what: string }[] = [
  { how: 'колесо мыши', what: 'масштаб у указателя' },
  { how: 'Shift + колесо', what: 'сдвиг по времени' },
  { how: 'Alt + колесо', what: 'сдвиг по полосам' },
  { how: 'тачпад, два пальца', what: 'сдвиг неба' },
  { how: 'щипок', what: 'масштаб' },
  { how: 'двойной щелчок', what: 'приблизить вдвое; с Shift — отдалить' },
  { how: 'щелчок по пустому небу', what: 'снять выбор; кнопка «Назад» браузера вернёт его' },
  { how: 'полоса времени', what: 'тянуть рамку, края рамки — ширина окна; щелчок по эпохе — перелёт к ней; двойной щелчок — всё небо' },
];

function Caps({ keys }: { keys: string[] }) {
  const out: ComponentChildren[] = [];
  keys.forEach((k, i) => {
    if (i) out.push(' ');
    out.push(<kbd>{k}</kbd>);
  });
  return <>{out}</>;
}

/** Клавиши строки: надписи английской раскладки, под ними — русской, если они другие. */
function KeyCell({ keys }: { keys: Key[] }) {
  const ru = keys.some((k) => k.ru);
  return (
    <>
      {/* строка клавиш не переносится: колонка таблицы — по самой длинной строке */}
      <span class="nobr">
        <Caps keys={keys.map((k) => k.en)} />
      </span>
      {ru ? (
        <>
          <br />
          <span class="nobr">
            <span class="muted">рус.</span>{'\u00a0'}
            <Caps keys={keys.map((k) => k.ru ?? k.en)} />
          </span>
        </>
      ) : null}
    </>
  );
}

/** Таблица клавиш: клавиши обеих раскладок и действие. */
export function KeysTable() {
  return (
    <>
      <p class="muted">{typo('Клавиши привязаны к месту на клавиатуре: на русской раскладке нажимается та же клавиша, её надпись — после «рус.».')}</p>
      <table class="keys">
        <thead>
          <tr>
            <th scope="col">Клавиши</th>
            <th scope="col">Действие</th>
          </tr>
        </thead>
        <tbody>
          {KEY_ROWS.map((r) => (
            <tr key={r.what}>
              <td>
                <KeyCell keys={r.keys} />
              </td>
              <td>{typo(r.what)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Мышь, тачпад, касание</h3>
      <table class="keys">
        <tbody>
          {POINTER_ROWS.map((r) => (
            <tr key={r.how}>
              <td class="how">{typo(r.how)}</td>
              <td>{typo(r.what)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
