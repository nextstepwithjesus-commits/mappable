/** Надписи поверх неба: строка выбора второго лица, вступительный картуш и «Как читать карту». */
import { byId } from '../../data/atlas.ts';
import { introDone, pickMode, selected } from '../../state.ts';
import { skyRef, plural } from '../common.tsx';
import { num, typo, typoTree } from '../text/typo.ts';
import { Close } from '../controls.tsx';
import { pickBarText } from './text.ts';
import { introOpen, openGuide } from './view.ts';

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

/**
 * «Как читать карту» (C5; UX-03, MOB-07): один текст — во вступлении и в начале «Условных знаков».
 * На сенсорном экране вступление говорит о касаниях, с мышью — о колесе и щелчке (sky.css, .for-touch / .for-mouse);
 * в «Условных знаках» (both) — оба способа.
 */
export function ReadingGuide({ both = false }: { both?: boolean }) {
  return typoTree(
    <ul class={both ? 'guide both' : 'guide'}>
      <li>Годы сверху — время, буквы слева — полосы неба. Координата в «Указателе» — номер века от начала шкалы и буква полосы.</li>
      <li>
        Найти лицо — поле «Найти» или клавиша <kbd>/</kbd>: имя, другая форма имени или стих («Руф 4:21»).
      </li>
      <li>Внизу — полоса времени от сотворения до 2040 года; рамка на ней — видимая часть неба. Щёлкните эпоху — небо покажет её; рамку можно тянуть.</li>
      <li class="for-mouse">{both ? 'Мышь: колесо' : 'Колесо'} — масштаб, перетаскивание — сдвиг, щелчок по звезде — карточка лица.</li>
      <li class="for-touch">{both ? 'Касание: коснитесь' : 'Коснитесь'} звезды — откроется карточка; двумя пальцами — масштаб, одним — сдвиг.</li>
      <li>«Всё небо» или щелчок по названию «Толедот» — снова вся карта.</li>
    </ul>,
  );
}

/** Свернуть вступление: остаётся команда «Как читать карту» в углу неба. */
const fold = () => {
  introDone.value = true;
  introOpen.value = false;
};

export function Cartouche({ high }: { high: boolean }) {
  const count = byId.size;
  const go = (id: string) => {
    fold();
    selected.value = id;
    skyRef.flyTo(id);
  };
  const entries = ['adam', 'noy', 'avraam', 'moisey', 'david', 'iisus'].filter((id) => byId.has(id));
  return (
    // data-reserve: под табличкой не рисуются подписи, «всё небо» вписывается рядом с ней (SkyView)
    <div class={high ? 'cartouche high' : 'cartouche'} role="note" aria-labelledby="cartouche-title" data-reserve="intro">
      <Close label="Свернуть вступление" onClick={fold} />
      {typoTree(
        <>
          <h1 id="cartouche-title">Толедот</h1>
          <p class="sub">Звёздный атлас библейских родословий</p>
          <p class="long">
            {num(count)} {plural(count, 'лицо', 'лица', 'лиц')} канонического Писания. Каждая звезда — человек; по горизонтали — время его жизни, яркость — место в
            повествовании. Созвездия — роды, колена и народы.
          </p>
          <p class="ribbons">
            <span class="swatch gold" />
            <span>линия Иосифа (Мф 1)</span>
            <span class="swatch azure" />
            <span>линия по Луке, традиционно — Марии (Лк 3)</span>
          </p>
          <h2>Как читать карту</h2>
        </>,
      )}
      <ReadingGuide />
      <div class="entry" aria-label="С чего начать">
        {entries.map((id) => (
          <button key={id} onClick={() => go(id)}>
            {byId.get(id)!.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Свёрнутое вступление: команда в левом нижнем углу неба (C5; UX-03). На небе уже 880 px внизу справа — органы неба,
 * и команда, как и сам картуш, переходит в левый верхний угол.
 */
export function GuideCommand({ high }: { high: boolean }) {
  return (
    <button type="button" class={high ? 'guide-cmd high' : 'guide-cmd'} data-reserve="guide" onClick={openGuide} title="Вступление и «Как читать карту»">
      Как читать карту
    </button>
  );
}
