/** Надписи поверх неба: строка выбора второго лица и вступительный картуш. */
import { byId } from '../../data/atlas.ts';
import { introDone, model, pickMode, selected } from '../../state.ts';
import { skyRef, plural } from '../common.tsx';
import { num, typo, typoTree } from '../text/typo.ts';
import { Close } from '../controls.tsx';
import { pickBarText } from './text.ts';

/** Уже этой ширины вступительный картуш слева внизу встал бы под блок органов справа: картуш переходит в левый верхний угол. */
export const CARTOUCHE_BESIDE = 880;

export function PickBar({ mode, id }: { mode: 'kinship' | 'spread'; id: string }) {
  return (
    <div class="pickbar" role="status">
      {/* неразрывные пробелы — при показе: сама строка проверяется тестами как текст (tests/shell.test.ts) */}
      <span>{typo(pickBarText(mode, id))}</span>
      <button onClick={() => (pickMode.value = null)}>Отменить</button>
    </div>
  );
}

export function Cartouche({ high }: { high: boolean }) {
  const count = byId.size;
  const go = (id: string) => {
    introDone.value = true;
    selected.value = id;
    skyRef.flyTo(id);
  };
  const entries = ['adam', 'noy', 'avraam', 'moisey', 'david', 'iisus'].filter((id) => byId.has(id));
  const m = model.value;
  return (
    <div class={high ? 'cartouche high' : 'cartouche'} role="note">
      <Close label="Свернуть вступление" onClick={() => (introDone.value = true)} />
      {typoTree(
        <>
          <h1>Толедот</h1>
          <p class="sub">Звёздный атлас библейских родословий</p>
          <p class="long">
            {num(count)} {plural(count, 'лицо', 'лица', 'лиц')} канонического Писания. Каждая звезда — человек; по горизонтали — время его жизни, яркость — место в
            повествовании. Созвездия — роды, колена и народы.
          </p>
          <p>
            <span class="swatch gold" />
            линия Иосифа (Мф 1)
            <br />
            <span class="swatch azure" />
            линия по Луке, традиционно — Марии (Лк 3)
          </p>
          <p class="muted long">
            Колесо или щипок — масштаб, перетаскивание — сдвиг, щелчок по звезде — карточка. Хронологических напряжений: {m.tensions.length}.
          </p>
        </>,
      )}
      <div class="entry">
        {entries.map((id) => (
          <button key={id} onClick={() => go(id)}>
            {byId.get(id)!.name}
          </button>
        ))}
      </div>
    </div>
  );
}
