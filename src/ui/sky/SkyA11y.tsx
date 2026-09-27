/**
 * Небо для клавиатуры и экранного диктора (I1, I3; MOB-29–31, MOB-34; IX-39; VIS-16).
 * — Холст — одна остановка Tab, role="application" с описанием «звёздная карта»; стрелки водят фокус по звёздам
 *   (src/ui/sky/starnav.ts, клавиши — src/ui/sky/skykeys.ts), небо рисует у звезды с фокусом кольцо и подпись.
 * — Список лиц на виду — вне порядка Tab (tabindex −1): его пункт с фокусом холст называет через aria-activedescendant,
 *   поэтому диктор читает звезду, к которой перешёл фокус: «Давид, царь; ок. 1040–970 гг. до Р. Х.».
 * — Описание окна («На карте 1100–920 гг. до Р. Х., эпоха «Единое царство»; видно 14 лиц») — у холста в описании;
 *   когда небо остановилось, а читатель работает с небом, оно же звучит вежливой живой областью.
 * Компонент стоит в .sky сразу после холста (SkyView); атрибуты холста он ставит сам.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { byId } from '../../data/atlas.ts';
import type { Epoch } from '../../data/types.ts';
import { focused, selected, model } from '../../state.ts';
import { goTo, plural, skyRef, viewTick } from '../common.tsx';
import { formatSpan, toAstro, toHist } from '../../engine/years.ts';
import { typo } from '../text/typo.ts';
import { lifeText } from './text.ts';
import { enterSky, rememberFocus, starName, starPoints } from './starnav.ts';
import { focusCardTitle } from '../focus.ts';
import { screenOf } from './view.ts';

const LIST_ID = 'sky-stars';
const WINDOW_ID = 'sky-window';
const HELP_ID = 'sky-help';
/** id пункта списка лиц неба: на него указывает aria-activedescendant холста. */
export const starDomId = (id: string) => `sky-star-${id}`;

export const SKY_LABEL = 'Звёздная карта родословий';
export const SKY_HELP =
  'Стрелки — к ближайшей звезде в эту сторону; Shift со стрелками — сдвиг неба; Enter — открыть карточку звезды; плюс и минус — масштаб; ноль — всё небо; квадратные скобки — к родителю и к ребёнку; вопросительный знак — все клавиши.';
/** Сколько лиц держать в списке: самые яркие на виду, по порядку времени. */
const LIST_MAX = 40;
/** Через сколько мс после остановки неба обновлять описание окна (MOB-34). */
const SETTLE_MS = 600;
const MAX_WAIT_MS = 2000;

/** Год промежутка, округлённый наружу до step лет (по историческому счёту, без нулевого года). */
function roundOut(astro: number, step: number, dir: -1 | 1): number {
  const h = toHist(astro);
  let r = (dir < 0 ? Math.floor(h / step) : Math.ceil(h / step)) * step;
  if (r === 0) r = dir;
  return toAstro(r);
}

/**
 * Строка окна неба: годы по краям видимой части (астр.), эпохи, которые оно захватывает, и сколько звёзд видно.
 * «На карте 1100–920 гг. до Р. Х., эпоха «Единое царство»; видно 14 лиц.»
 */
export function windowText(t0: number, t1: number, epochs: readonly Pick<Epoch, 'name' | 'start' | 'end'>[], shown: number): string {
  const span = t1 - t0;
  const step = span > 1500 ? 50 : span > 300 ? 10 : 5;
  const a = roundOut(t0, step, -1);
  const b = roundOut(t1, step, 1);
  const h0 = toHist(t0);
  const h1 = toHist(t1);
  const hit = epochs.filter((e) => e.start < h1 && e.end > h0).map((e) => `«${e.name}»`);
  const era = !hit.length
    ? ''
    : hit.length === 1
      ? `, эпоха ${hit[0]}`
      : hit.length <= 3
        ? `, эпохи ${hit.join(', ')}`
        : `, эпохи от ${hit[0]} до ${hit[hit.length - 1]}`;
  const who = shown ? `видно ${shown} ${plural(shown, 'лицо', 'лица', 'лиц')}` : 'звёзд не видно';
  return typo(`На карте ${formatSpan(a, b)}${era}; ${who}.`);
}

/** Пункт списка: имя (видимый текст), для диктора — с уточнением и годами. */
const itemLabel = (id: string, sel: string | null) => typo([starName(id), lifeText(id)].filter(Boolean).join('; ') + (sel === id ? '; выбрано' : ''));

/** Лица на виду для списка: самые яркие, затем по времени (слева направо). */
function listed(): { ids: string[]; text: string } {
  const sky = skyRef.current;
  if (!sky || !sky.model) return { ids: [], text: '' };
  const shown = starPoints(sky).filter((s) => s.onScreen);
  const ids = [...shown]
    .sort((a, b) => a.mag - b.mag || a.x - b.x)
    .slice(0, LIST_MAX)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((s) => s.id);
  const vp = sky.cam.vp;
  const text = windowText(sky.tOf(sky.cam.wx(vp.l)), sky.tOf(sky.cam.wx(vp.r)), model.value.epochs, shown.length);
  return { ids, text };
}

/** Открыть карточку лица из списка неба: выбор (или второе лицо пары), фокус — на заголовок карточки. */
function choose(id: string) {
  goTo(id);
  focusCardTitle(id);
}

export function SkyA11y() {
  const list = useRef<HTMLUListElement>(null);
  const [view, setView] = useState<{ ids: string[]; text: string }>({
    ids: [],
    text: '',
  });
  const [said, setSaid] = useState('');
  const f = focused.value;
  const sel = selected.value;

  const canvas = () => list.current?.parentElement?.querySelector<HTMLCanvasElement>(':scope > canvas') ?? null;
  /** Читатель работает с небом: фокус на холсте, в списке лиц неба или нигде. */
  const onSky = () => {
    const a = document.activeElement;
    return !a || a === document.body || a === canvas() || !!list.current?.contains(a);
  };

  // холст — приложение «звёздная карта» с описанием окна; фокус клавиатуры на холсте — кольцо у звезды
  useLayoutEffect(() => {
    const c = canvas();
    if (!c) return;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-roledescription', 'звёздная карта');
    c.setAttribute('aria-label', SKY_LABEL);
    c.setAttribute('aria-describedby', `${WINDOW_ID} ${HELP_ID}`);
    c.setAttribute('aria-owns', LIST_ID);
    const inSky = (el: EventTarget | null) => el === c || (el instanceof Node && !!list.current?.contains(el));
    // фокус пришёл с клавиатуры (Tab, возврат из карточки или панели): кольцо у выбранного лица, у прежней звезды
    // с фокусом или у яркой звезды в середине; щелчок мышью кольца не ставит — стрелки поставят его сами
    const onFocus = () => {
      if (!focused.peek() && c.matches(':focus-visible')) enterSky();
    };
    const onBlur = (e: FocusEvent) => {
      if (inSky(e.relatedTarget)) return;
      rememberFocus(focused.peek());
      focused.value = null;
    };
    c.addEventListener('focus', onFocus);
    c.addEventListener('blur', onBlur);
    return () => {
      c.removeEventListener('focus', onFocus);
      c.removeEventListener('blur', onBlur);
    };
  }, []);

  // список и описание окна — когда небо остановилось (кадры неба идут десятками в секунду); если кадры не кончаются
  // (зажигание звёзд, ток света по ленте), то не реже чем через MAX_WAIT_MS
  useEffect(() => {
    let timer = 0;
    let since = 0;
    const update = () => {
      clearTimeout(timer);
      since = 0;
      const next = listed();
      setView((prev) => (prev.text === next.text && prev.ids.join() === next.ids.join() ? prev : next));
    };
    const off = effect(() => {
      void viewTick.value;
      void selected.value;
      const now = performance.now();
      if (!since) since = now;
      clearTimeout(timer);
      timer = window.setTimeout(update, Math.max(0, Math.min(SETTLE_MS, since + MAX_WAIT_MS - now)));
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  // вслух — только новое окно и только когда читатель работает с небом: чтение карточки перелёт не перебивает
  useEffect(() => {
    if (view.text && onSky()) setSaid(view.text);
  }, [view.text]);

  // звезда с фокусом всегда есть в списке: иначе холсту не на что указать
  const ids = f && !view.ids.includes(f) && byId.has(f) ? [...view.ids, f] : view.ids;
  useLayoutEffect(() => {
    const c = canvas();
    if (!c) return;
    if (f && document.getElementById(starDomId(f))) c.setAttribute('aria-activedescendant', starDomId(f));
    else c.removeAttribute('aria-activedescendant');
  });

  return (
    <>
      <ul id={LIST_ID} ref={list} class="visually-hidden" aria-label="Лица на виду">
        {ids.map((id) => {
          // где звезда (px холста) — для проверок приёмки (tools/accept/a11y.ts): куда вести фокус стрелками
          const at = screenOf(id);
          return (
            <li key={id}>
              <button
                type="button"
                id={starDomId(id)}
                tabIndex={-1}
                data-x={at ? Math.round(at.x) : undefined}
                data-y={at ? Math.round(at.y) : undefined}
                aria-label={itemLabel(id, sel)}
                onClick={() => choose(id)}
                onFocus={() => (focused.value = id)}
                onBlur={(e) => {
                  if (e.relatedTarget === canvas() || list.current?.contains(e.relatedTarget as Node | null)) return;
                  rememberFocus(id);
                  if (focused.peek() === id) focused.value = null;
                }}
              >
                {byId.get(id)!.name}
              </button>
            </li>
          );
        })}
      </ul>
      <p id={WINDOW_ID} class="visually-hidden">
        {view.text}
      </p>
      <p id={HELP_ID} class="visually-hidden">
        {SKY_HELP}
      </p>
      <p class="visually-hidden" aria-live="polite">
        {said}
      </p>
    </>
  );
}
