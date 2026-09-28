/**
 * Надписи поверх неба: строки состояния у верхней кромки (выбор второго лица, отметки поиска, группа панели, рабочий
 * набор, пропорция строк), вступительный картуш и «Как читать карту».
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { batch } from '@preact/signals';
import { byId } from '../../data/atlas.ts';
import { introDone, pickMode, pins, pinsQuery, selected, skyGroup, type SkyGroup } from '../../state.ts';
import { skyRef, plural } from '../common.tsx';
import { num, typo, typoTree } from '../text/typo.ts';
import { Close } from '../controls.tsx';
import { pickBarText, pinBarText } from './text.ts';
import { introOpen, lanes, openGuide, openLegend, resetProportions } from './view.ts';
import { addToWork, adoptLinkSet, leaveLinkSet, linkSet, skyMode, workNotice, workSet, WORK_URL_MAX } from '../work.ts';
import { grid } from '../layout.ts';
import { start, type Start } from '../reveal.ts';
import { StartList, openStarts, showView, startsFocus } from './Controls.tsx';

/** Уже этой ширины вступительный картуш слева внизу встал бы под блок органов справа: картуш переходит в левый верхний угол. */
export const CARTOUCHE_BESIDE = 880;

// ---------- строки состояния у верхней кромки неба ----------

/**
 * Строка состояния неба (VIS-46, MAP-67): под служебной строкой рамки, а не на линейке лет — годы видны всегда. Одна
 * строка: текст обрезается многоточием (целиком — в title), команды справа, после тире; «(Esc)» — только там, где есть
 * клавиатура (MOB-21). Непрозрачный лист с рамкой; data-reserve — подписи звёзд под ней не рисуются (SkyView).
 */
function SkyBar({ cls, text, cmds, esc, note }: { cls: string; text: string; cmds: { label: string; title?: string; run: () => void }[]; esc?: boolean; note?: string }) {
  const t = typo(text);
  // оговорка — в подсказке строки, а не в самой строке (MOB-73): строка остаётся одной
  const title = note ? `${t}. ${typo(note)}` : t;
  return (
    <div class={`pickbar ${cls}`} role="status" data-reserve="bar">
      <span class="txt" title={title}>
        {t}
      </span>
      <span class="dash" aria-hidden="true">
        —
      </span>
      {cmds.map((c) => (
        <button key={c.label} type="button" title={c.title} onClick={c.run}>
          {c.label}
        </button>
      ))}
      {esc && <span class="keys-only">(Esc)</span>}
    </div>
  );
}

/** Выбор второго лица «Родства» или «Разворота» (D6): «Родство с Давидом: выберите второе лицо… — отменить (Esc)». */
export function PickBar({ mode, id }: { mode: 'kinship' | 'spread'; id: string }) {
  return <SkyBar cls="pickbar-pick" text={pickBarText(mode, id)} cmds={[{ label: 'отменить', run: () => (pickMode.value = null) }]} esc />;
}

/**
 * Отметки поиска (E10; UX-31, IX-19): «Отмечено 6 лиц по запросу «Мария» — снять (Esc)». Снимают «снять», Escape,
 * новый поиск и щелчок по звезде или по пустому небу.
 */
export function PinBar({ n, query }: { n: number; query: string }) {
  return (
    <SkyBar
      cls="pinbar"
      text={pinBarText(n, query)}
      cmds={[
        {
          label: 'снять',
          run: () => {
            pins.value = [];
            pinsQuery.value = '';
          },
        },
      ]}
      esc
    />
  );
}

/** Текст строки группы: «Отмечены лица главы Мф 1» (CARD-71); участок синопсиса — «Участок линий: …». */
export function groupBarText(g: Pick<SkyGroup, 'label' | 'kind'>): string {
  if (g.kind === 'chapter') return `Отмечены ${g.label.charAt(0).toLowerCase()}${g.label.slice(1)}`;
  return `Участок линий: ${g.label}`;
}

/**
 * Строка группы (G2, G3; skyGroup): лица главы или участок линий Мессии светятся, остальное небо погашено до 25 %.
 * «Отмечены лица главы Мф 1 — снять (Esc)» (CARD-71). Снимают «снять», Escape и закрытие панели.
 */
export function GroupBar({ group }: { group: SkyGroup }) {
  return <SkyBar cls="groupbar" text={groupBarText(group)} cmds={[{ label: 'снять', run: () => (skyGroup.value = null) }]} esc />;
}

/**
 * Текст строки режима «набор» (J4; UX-62, MOB-54, VIS-46): пустой набор — как его собрать; выбранное лицо вне набора —
 * «Вооз не в наборе» (имя в начале, без падежа); иначе — «На небе — только рабочий набор, 38 лиц», на телефоне — коротко,
 * в одну строку: «Только набор: 38 лиц» (MOB-73). Оговорка о ссылке — не в строке, а в её подсказке (workLineNote).
 */
export function workLineText(n: number, outName: string | null, short = false): string {
  if (outName) return `${outName} не в наборе`;
  if (!n) return 'Рабочий набор пуст: возьмите лиц клавишей В у звезды или командой «Взять в работу» в карточке';
  return short ? `Только набор: ${persons(n)}` : `На небе — только рабочий набор, ${persons(n)}`;
}

/**
 * Подсказка строки «набор» (решение 58; MOB-73): набор до 12 лиц передаётся ссылкой списком (решение 34), длиннее —
 * только режим. Прежняя оговорка «(ссылкой передаётся только режим)» ушла из строки сюда.
 */
export function workLineNote(n: number): string {
  return n > WORK_URL_MAX
    ? `Ссылкой передаётся режим «набор»; сам набор — только если в нём не больше ${WORK_URL_MAX} лиц`
    : `Ссылка на этот вид передаёт и сам набор: в нём не больше ${WORK_URL_MAX} лиц`;
}

/** Число лиц со склонением: «1 лицо», «2 лица», «38 лиц». */
const persons = (n: number) => `${num(n)} ${plural(n, 'лицо', 'лица', 'лиц')}`;

/** Раскрытие (решения 68, 70): начало выбрано и это не «всё небо» — набор раскрывают шаг за шагом. */
export const revealing = (s: Start | null) => !!s && s !== 'all';

/** Текст строки «набор» в раскрытии (решение 72): «Раскрыто 12 лиц», «Раскрыто 1 лицо». */
export const revealLineText = (n: number) => `Раскрыто ${persons(n)}`;

/**
 * Строка режима «набор» у верхней кромки неба: что скрыто и как вернуть всех (UX-62, MOB-54, MOB-73). В раскрытии
 * (решение 72) — «Раскрыто 12 лиц — показать всё небо | начать заново»; «начать заново» открывает выбор начала (лист
 * «Вид», раздел «Начало»). На телефоне — одна строка: «Раскрыто 12 лиц — все лица | начать заново»; уже 360 px строке
 * хватает места только на одну команду — «начать заново» остаётся в «Виде» и в «Разделах» (panels.css).
 */
export function WorkLine() {
  const set = workSet.value;
  const id = selected.value;
  const out = !!id && !set.has(id);
  const p = out ? byId.get(id!) : undefined;
  const phone = grid.value.phone;
  const reveal = revealing(start.value) && set.size > 0;
  // на телефоне — словами переключателя «все лица | набор»: кнопка «Всё небо» колонки вписывает небо, а не меняет его
  const all = reveal
    ? { label: phone ? 'все лица' : 'показать всё небо', title: 'Небо — все лица; раскрытое остаётся в наборе', run: () => (skyMode.value = 'all') }
    : { label: 'показать всех', title: 'Небо — все лица', run: () => (skyMode.value = 'all') };
  // на телефоне обычная строка — одна: короткий текст и «показать всех» рядом (MOB-73)
  const one = phone && !out && set.size > 0;
  if (reveal && !out)
    return (
      <SkyBar
        cls={one ? 'workbar revealbar one' : 'workbar revealbar'}
        text={revealLineText(set.size)}
        note={workLineNote(set.size)}
        cmds={[all, { label: 'начать заново', title: 'Выбрать начало заново: с Адама, с Иисуса Христа, родословие, ключевые лица или всё небо', run: openStarts }]}
      />
    );
  return (
    <SkyBar
      cls={one ? 'workbar one' : 'workbar'}
      text={workLineText(set.size, p ? p.name : null, one)}
      note={set.size ? workLineNote(set.size) : undefined}
      cmds={out ? [{ label: 'взять в работу', title: 'Взять выбранное лицо в рабочий набор', run: () => addToWork(id!) }, all] : [all]}
    />
  );
}

/** Строка набора из чужой ссылки (решение 45; IX-69): «Набор по ссылке: 2 лица». */
export function linkBarText(n: number): string {
  return `Набор по ссылке: ${persons(n)}`;
}
/** Команда возврата к своему набору: «вернуться к моему (3)»; число — сколько лиц в своём наборе. */
export const mineLabel = (m: number) => `вернуться к моему (${num(m)})`;

/**
 * Набор из ссылки — временный просмотр (решение 45; IX-69, UX-79): «Набор по ссылке: 2 лица — добавить в мой набор |
 * вернуться к моему (3)». Свой набор и память браузера не меняются до «добавить»; «вернуться к моему» показывает свой
 * набор (пустой — все лица) и убирает набор ссылки из адреса.
 */
export function LinkSetBar() {
  const l = linkSet.value;
  if (!l) return null;
  const m = workSet.value.size;
  return (
    <SkyBar
      cls="workbar linkbar"
      text={linkBarText(l.size)}
      cmds={[
        { label: 'добавить в мой набор', title: 'Лица ссылки — в ваш рабочий набор; ваши лица остаются', run: () => void adoptLinkSet() },
        { label: mineLabel(m), title: m ? 'Небо — ваш рабочий набор; набор ссылки уходит из адреса' : 'Ваш набор пуст: небо — все лица', run: leaveLinkSet },
      ]}
    />
  );
}

/** Строка-пояснение у кромки неба (UX-79): ссылка «набор» при пустом своём наборе — показаны все лица. */
export function NoticeBar({ text }: { text: string }) {
  return <SkyBar cls="noticebar" text={text} cmds={[{ label: 'скрыть', run: () => (workNotice.value = null) }]} />;
}

/** Пропорция строк, отличная от обычной, — «строки ×3,6» (UX-53): 1 — обычная. */
export function lanesText(m: number): string {
  const v = Math.round(m * 10) / 10;
  return `строки ×${String(v >= 10 ? Math.round(v) : v).replace('.', ',')}`;
}
/** Пропорция заметно не обычная — метка видна. */
export const lanesChanged = (m: number) => Math.abs(Math.round(m * 10) / 10 - 1) >= 0.05;

/**
 * Метка изменённой пропорции строк (UX-53, IX-61): пока высота строк не обычная, у кромки неба — «строки ×3,6 — сбросить».
 * Случайная протяжка по буквам больше не меняет вид незаметно; сброс — здесь, двойным щелчком по буквам и в «Виде».
 */
export function LanesNote() {
  // пропорция, устоявшаяся после шага, протяжки или щипка (SkyView пишет её в lanes): метка не мигает во время шага
  const m = lanes.value;
  if (!lanesChanged(m)) return null;
  return <SkyBar cls="lanesbar" text={lanesText(m)} cmds={[{ label: 'сбросить', title: 'Пропорции по умолчанию (двойной щелчок по буквам строк)', run: resetProportions }]} />;
}

// ---------- строка у кромки древа (решение 73) ----------

/** Команда строки древа «показать всё небо»: небо «все лица»; раскрытое остаётся в наборе и в древе. */
export function showAllSky() {
  batch(() => {
    showView('sky');
    skyMode.value = 'all';
  });
}

/**
 * Строка у верхней кромки древа — та же, что у неба в раскрытии (решение 72): «Раскрыто 12 лиц — показать всё небо |
 * начать заново». Набор из чужой ссылки — строкой ссылки, как на небе (решение 45). Пустое древо строки не имеет: его
 * начало предлагает вступление.
 */
export function TreeBars() {
  const l = linkSet.value;
  const n = workSet.value.size;
  if (!l && !n) return null;
  const phone = grid.value.phone;
  return (
    <div class="skytop treetop">
      {l ? (
        <LinkSetBar />
      ) : (
        <SkyBar
          cls={phone ? 'workbar revealbar treebar one' : 'workbar revealbar treebar'}
          text={revealLineText(n)}
          note={workLineNote(n)}
          cmds={[
            { label: phone ? 'все лица' : 'показать всё небо', title: 'Небо — все лица; раскрытое остаётся в наборе и в древе', run: showAllSky },
            { label: 'начать заново', title: 'Выбрать начало заново: с Адама, с Иисуса Христа, родословие, ключевые лица или всё небо', run: openStarts },
          ]}
        />
      )}
    </div>
  );
}

/** Какая строка состояния стоит у кромки неба: одна, по старшинству (выбор второго лица, отметки, группа, набор). */
export function skyBarKind(): 'pick' | 'pins' | 'group' | 'link' | 'work' | 'notice' | null {
  if (pickMode.value && selected.value) return 'pick';
  if (pins.value.length) return 'pins';
  if (skyGroup.value) return 'group';
  if (skyMode.value === 'work') return linkSet.value ? 'link' : 'work';
  if (workNotice.value) return 'notice';
  return null;
}

/** Строки у верхней кромки неба: строка состояния и метка пропорции строк; рядом, с переносом на узком небе. */
export function SkyBars() {
  const kind = skyBarKind();
  if (!kind && !lanesChanged(lanes.value)) return null;
  let bar: ComponentChildren = null;
  if (kind === 'pick') bar = <PickBar mode={pickMode.value!} id={selected.value!} />;
  else if (kind === 'pins') bar = <PinBar n={pins.value.length} query={pinsQuery.value} />;
  else if (kind === 'group') bar = <GroupBar group={skyGroup.value!} />;
  else if (kind === 'link') bar = <LinkSetBar />;
  else if (kind === 'work') bar = <WorkLine />;
  else if (kind === 'notice') bar = <NoticeBar text={workNotice.value!} />;
  return (
    <div class="skytop">
      {bar}
      <LanesNote />
    </div>
  );
}

// ---------- вступление и «Как читать карту» ----------

/**
 * «Как читать карту» (C5; UX-03, MOB-07): один текст — во вступлении и в начале «Условных знаков».
 * На сенсорном экране вступление говорит о касаниях (они — первым пунктом) и не называет клавиш; с мышью — о колесе,
 * щелчке и клавишах, в том числе «?» (IX-41). В «Условных знаках» (both) — оба способа (sky.css, .for-touch / .for-mouse).
 */
export function ReadingGuide({ both = false, tree = false }: { both?: boolean; tree?: boolean }) {
  if (tree) return <TreeGuide both={both} />;
  const touch = <li class="for-touch">{both ? 'Касание: коснитесь' : 'Коснитесь'} звезды — откроется карточка; двумя пальцами — масштаб, одним — сдвиг; долгое касание — меню звезды.</li>;
  return typoTree(
    <ul class={both ? 'guide both' : 'guide'}>
      {!both && touch}
      <li>
        Годы сверху — время; внизу — номера столбцов по сто лет, буквы слева — строки неба. Координата в «Указателе» — номер столбца и
        буква строки.
      </li>
      <li>
        Найти лицо — поле «Найти»
        <span class="for-mouse">
          {' '}
          или клавиша <kbd>/</kbd>
        </span>
        : имя, другая форма имени или стих («Руф 4:21»).
      </li>
      <li>
        Внизу — полоса времени от сотворения до 2040 года; рамка на ней — видимая часть неба. <span class="for-mouse">Щёлкните эпоху</span>
        <span class="for-touch">Коснитесь эпохи</span> — небо покажет её; рамку можно тянуть.
      </li>
      <li class="for-mouse">
        {both ? 'Мышь: колесо' : 'Колесо'} — масштаб, перетаскивание — сдвиг, щелчок по звезде — карточка лица, правая кнопка — меню звезды. Все клавиши —{' '}
        <kbd>?</kbd>.
      </li>
      {both && touch}
      <li>
        «Всё небо» или <span class="for-mouse">щелчок по названию</span>
        <span class="for-touch">касание названия</span> «Толедот» — снова вся карта.
      </li>
    </ul>,
  );
}

/**
 * «Как читать карту» в древе (решение 73): древо объясняется словами его же команд (src/ui/tree/). Тот же выбор касание
 * или мышь, что у неба: both — оба способа («Условные знаки»).
 */
export function TreeGuide({ both = false }: { both?: boolean }) {
  const touch = (
    <li class="for-touch">
      {both ? 'Касание: коснитесь' : 'Коснитесь'} карточки — откроется подробная карточка лица или союза; одним пальцем — сдвиг, двумя — масштаб.
    </li>
  );
  return typoTree(
    <ul class={both ? 'guide tree-guide both' : 'guide tree-guide'}>
      {!both && touch}
      <li>
        Слева направо — поколения: лицо, его союз — брак или связь, от которой пошли дети, — дети этого союза, их союзы и дальше.
      </li>
      <li>
        «Продолжить ветвь» на карточке лица показывает его союзы, «Родители» — союз его родителей. «Раскрыть детей» на карточке
        союза показывает его детей; «Свернуть ветвь» и «Свернуть детей» убирают всё, что раскрыто через карточку.
      </li>
      <li>Пунктирная рамка — место лица, которого Писание не называет по имени: так помечены неназванные жёны и матери.</li>
      <li>
        Золотая и лазурная линии — родословие Иисуса Христа по Матфею и по Луке. У выбранного лица ветви потомков светятся
        своими цветами, путь к предкам — светлым.
      </li>
      <li class="for-mouse">
        {both ? 'Мышь: щелчок' : 'Щелчок'} по карточке — подробная карточка справа; колесо — масштаб, перетаскивание — сдвиг. Все клавиши —{' '}
        <kbd>?</kbd>.
      </li>
      {both && touch}
      <li>
        {grid.value.phone && !both
          ? '«Небо» в «Разделах» показывает те же лица на звёздном небе, по времени их жизни.'
          : 'Переключатель «Небо | Древо» в верхней строке (на телефоне — в «Разделах») показывает те же лица на звёздном небе, по времени их жизни.'}
      </li>
    </ul>,
  );
}

/** Свернуть вступление: остаётся команда «Как читать карту» в углу неба. */
const fold = () => {
  introDone.value = true;
  introOpen.value = false;
};
/** Укороченное вступление: «С чего начать» — лист «Вид» на разделе «Начало» (тот же выбор), вступление сворачивается. */
const foldToStarts = () => {
  fold();
  openStarts();
};

/** Быстрые входы вступления (UX-56; решение 37: и «Руфь» — сценарий 1). */
export const ENTRIES = ['adam', 'noy', 'avraam', 'moisey', 'ruf', 'david', 'iisus'];

/**
 * Вступительный картуш. При первом посещении (начало не выбрано, решение 68) под подзаголовком — пять начал, выбор
 * сворачивает вступление. Быстрые входы — ниже них: на 1024 × 768 они видны без прокрутки (UX-56).
 * low — небо не выше 520 px (альбомный телефон, масштаб 200 %): одна строка «Как читать карту» и «Свернуть» (MOB-07),
 * небо остаётся видным.
 */
export function Cartouche({ high, low = false, tree = false }: { high: boolean; low?: boolean; tree?: boolean }) {
  if (tree) return <TreeCartouche high={high} low={low} />;
  const count = byId.size;
  const go = (id: string) => {
    fold();
    selected.value = id;
    skyRef.flyTo(id);
  };
  const entries = ENTRIES.filter((id) => byId.has(id));
  // начало ещё не выбрано (решение 68): вступление предлагает пять начал
  const pick = start.value === null;
  if (low)
    return (
      <div class={pick ? 'cartouche low picking' : 'cartouche low'} role="note" aria-label="Толедот — звёздный атлас библейских родословий" data-reserve="intro">
        <b class="ttl">Толедот</b>
        {/* главное для пальца — одной фразой (MOB-07); остальное — в «Как читать карту» */}
        <span class="hint for-touch">{typo('Коснитесь звезды — карточка лица')}</span>
        {/* пять начал на низком небе не помещаются: «С чего начать» открывает тот же выбор в листе «Вид» */}
        {pick && (
          <button type="button" class="cmd start-cmd" title="Пять начал: с Адама, с Иисуса Христа, родословие, ключевые лица, всё небо" onClick={foldToStarts}>
            С чего начать
          </button>
        )}
        <button type="button" class="cmd" onClick={() => openLegend('guide')}>
          Как читать карту
        </button>
        <button type="button" class="cmd" onClick={fold}>
          Свернуть
        </button>
      </div>
    );
  return (
    // data-reserve: под табличкой не рисуются подписи, «всё небо» вписывается рядом с ней (SkyView)
    <div class={`cartouche${high ? ' high' : ''}${pick ? ' picking' : ''}`} role="note" aria-labelledby="cartouche-title" data-reserve="intro">
      <Close label="Свернуть вступление" onClick={fold} />
      {typoTree(
        <>
          <h1 id="cartouche-title">Толедот</h1>
          <p class="sub">Звёздный атлас библейских родословий</p>
        </>,
      )}
      {/* пять начал (решение 68) — при первом посещении; выбор сворачивает вступление. Быстрые входы — ниже, как прежде */}
      {pick && (
        <div class="pick" role="group" aria-labelledby="starts-title">
          <h2 id="starts-title">С чего начать</h2>
          <StartList notes label="Начало" onDone={fold} />
        </div>
      )}
      <div class="entry" role="group" aria-label={pick ? 'Сразу к лицу' : 'С чего начать'}>
        {entries.map((id) => (
          <button key={id} type="button" onClick={() => go(id)}>
            {byId.get(id)!.name}
          </button>
        ))}
      </div>
      {typoTree(
        <>
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
    </div>
  );
}

/**
 * Свернуть вступление древа: фокус из таблички — на «Как читать карту» древа (src/ui/focus.ts ищет её только на небе);
 * после выбора начала (card) — на выбранную карточку древа, если она есть: с неё и продолжают раскрытие.
 */
const foldTree = (card = false) => {
  const inside = !!document.activeElement?.closest('.cartouche');
  fold();
  if (inside)
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      const to = (card && document.querySelector<HTMLElement>('.treearea .tc[aria-current="true"]')) || document.querySelector<HTMLElement>('.treearea .guide-cmd');
      to?.focus({ preventScroll: true });
    }, 30);
};

/**
 * Вступление в древе (решение 73). Начало выбирается здесь — и при первом посещении, и по «Начать заново…»: листа «Вид»
 * в древе нет. Под началами — как читать древо; быстрых входов к лицу нет: древо растёт от начала. Табличку открыли
 * командой «Начать заново…» (startsFocus) — фокус на текущем начале, после фокуса на заголовке (src/ui/focus.ts).
 * low — область не выше 520 px: одна строка; «С чего начать» разворачивает табличку целиком, она прокручивается.
 */
function TreeCartouche({ high, low }: { high: boolean; low: boolean }) {
  const [wide, setWide] = useState(false);
  const f = startsFocus.value;
  const pick = start.value === null;
  useEffect(() => {
    if (!f) return;
    startsFocus.value = false;
    setWide(true);
    // без отмены при смене f: сброс startsFocus сам меняет f, а фокус нужен после заголовка (focus.ts, setTimeout 0)
    window.setTimeout(() => {
      const q = (s: string) => document.querySelector<HTMLElement>(`.cartouche .starts ${s}`);
      (q('button[aria-current="true"]') ?? q('button'))?.focus({ preventScroll: true });
    }, 40);
  }, [f]);
  if (low && !wide && !f)
    return (
      <div class="cartouche low picking tree-intro" role="note" aria-label="Толедот — древо библейских родословий" data-reserve="intro">
        <b class="ttl">Толедот</b>
        <span class="hint for-touch">{typo('Коснитесь карточки — подробная карточка')}</span>
        <button type="button" class="cmd start-cmd" title="Пять начал: с Адама, с Иисуса Христа, родословие, ключевые лица, всё небо" onClick={() => setWide(true)}>
          С чего начать
        </button>
        <button type="button" class="cmd" onClick={() => openLegend('guide')}>
          Как читать карту
        </button>
        <button type="button" class="cmd" onClick={() => foldTree()}>
          Свернуть
        </button>
      </div>
    );
  return (
    <div class={`cartouche picking tree-intro${high ? ' high' : ''}`} role="note" aria-labelledby="cartouche-title" data-reserve="intro">
      <Close label="Свернуть вступление" onClick={() => foldTree()} />
      {typoTree(
        <>
          <h1 id="cartouche-title">Толедот</h1>
          <p class="sub">Звёздный атлас библейских родословий</p>
        </>,
      )}
      {/* пять начал (решения 68, 73): «Всё небо» открывает небо, остальные — древо; выбор сворачивает табличку */}
      <div class="pick" role="group" aria-labelledby="starts-title">
        <h2 id="starts-title">{pick ? 'С чего начать' : 'Начать заново'}</h2>
        <StartList notes label="Начало" onDone={() => foldTree(true)} />
      </div>
      {typoTree(
        <>
          <p class="long">
            Древо — родословие карточками: лица и их союзы, от которых пошли дети. Каждая ветвь раскрывается по щелчку; все
            сведения — из Писания, со стихами.
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
      <ReadingGuide tree />
    </div>
  );
}

/**
 * Свёрнутое вступление: команда «Как читать карту» — всегда в левом нижнем углу неба (IX-63); органы неба на узком небе —
 * колонкой справа, на широком — блоком справа, углу они не мешают. На телефоне лист карточки её закрывает: над листом —
 * указатели у края.
 */
export function GuideCommand() {
  return (
    <button type="button" class="guide-cmd" data-reserve="guide" onClick={openGuide} title="Вступление и «Как читать карту»">
      Как читать карту
    </button>
  );
}
