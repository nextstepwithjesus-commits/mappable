/**
 * Поле поиска с подсказками при вводе (11 § 3.6 (з); APG Combobox with Listbox Popup; рецензия архитектуры, № 9):
 * с двух букв — до 8 подсказок; стрелки — по подсказкам, Enter — открыть выбранную (без выбора — страница результатов),
 * Esc — закрыть список (лист и выбор экрана не трогает). Запрос остаётся в поле.
 */
import { useMemo, useState } from 'preact/hooks';
import { router } from './приложение.ts';
import { объявить } from './службы.ts';
import { подсказки, type Подсказка } from '../истории/поиск.ts';

const ВИД: Record<string, string> = { история: 'история', лицо: 'лицо', книга: 'книга', место: 'место', область: 'область' };

function открыть(x: Подсказка) {
  const [k, id] = [x.id.slice(0, 1), x.id.slice(2)];
  if (k === 's') router.go({ screen: 'istoriya', id, params: {} });
  else if (k === 'p') router.go({ screen: 'kartochka', id: `p-${id}`, params: {} });
  else if (k === 'b') router.go({ screen: 'kniga', book: id, params: {} });
  else router.go({ screen: 'poisk', params: { q: x.title } });
}

export function ПолеПоиска({ id, placeholder, q, setQ }: { id: string; placeholder: string; q: string; setQ: (v: string) => void }) {
  const [откр, setОткр] = useState(false);
  const [акт, setАкт] = useState(-1);
  const xs = useMemo(() => (откр ? подсказки(q) : []), [q, откр]);
  const список = `${id}-подсказки`;
  const видно = откр && xs.length > 0;
  return (
    <span class="поле-подсказок">
      <input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={видно}
        aria-controls={список}
        aria-activedescendant={видно && акт >= 0 ? `${список}-${акт}` : undefined}
        placeholder={placeholder}
        autocomplete="off"
        value={q}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setQ(v);
          setОткр(true);
          setАкт(-1);
          const n = подсказки(v).length;
          if (v.trim().length >= 2) объявить(n ? `Подсказок: ${n}` : 'Подсказок нет');
        }}
        onBlur={() => setTimeout(() => setОткр(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && xs.length) {
            e.preventDefault();
            setОткр(true);
            setАкт((акт + 1) % xs.length);
          } else if (e.key === 'ArrowUp' && xs.length) {
            e.preventDefault();
            setАкт(акт <= 0 ? xs.length - 1 : акт - 1);
          } else if (e.key === 'Enter' && видно && акт >= 0) {
            e.preventDefault();
            setОткр(false);
            открыть(xs[акт]);
          } else if (e.key === 'Escape' && видно) {
            e.preventDefault();
            e.stopPropagation();
            setОткр(false);
            setАкт(-1);
          }
        }}
      />
      <ul id={список} role="listbox" aria-label="Подсказки" class="подсказки" hidden={!видно}>
        {xs.map((x, i) => (
          <li
            id={`${список}-${i}`}
            role="option"
            aria-selected={i === акт}
            class={`подсказки__строка${i === акт ? ' подсказки__строка--выбрана' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setОткр(false);
              открыть(x);
            }}
          >
            <span>{x.title}</span> <span class="т-адрес">{ВИД[x.kind] ?? x.kind}</span>
          </li>
        ))}
      </ul>
    </span>
  );
}
