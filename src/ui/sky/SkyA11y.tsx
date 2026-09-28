/**
 * Небо для клавиатуры и экранного диктора (I1, I3; MOB-29–31, MOB-34; IX-39; VIS-16).
 * — Холст — одна остановка Tab, role="application" с описанием «звёздная карта»; стрелки водят фокус по звёздам
 *   (src/ui/sky/starnav.ts, клавиши — src/ui/sky/skykeys.ts), небо рисует у звезды с фокусом кольцо и подпись.
 * — Список лиц на виду — вне порядка Tab (tabindex −1): его пункт с фокусом холст называет через aria-activedescendant,
 *   поэтому диктор читает звезду, к которой перешёл фокус: «Давид, царь; ок. 1040–970 гг. до Р. Х.».
 * — Описание окна («На карте 1100–920 гг. до Р. Х., эпоха «Единое царство»; видно 14 лиц») — у холста в описании;
 *   когда небо остановилось, а читатель работает с небом, оно же звучит вежливой живой областью. Описание и справка
 *   скрыты (hidden) и читаются только как описание холста: в режиме просмотра диктор не читает окно дважды (MOB-67).
 * — Справка — о клавишах, на сенсорном экране — о жестах (MOB-67).
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
import { REVEAL_TEXT, lifeText, plateItemText } from './text.ts';
import { enterSky, plateFocus, pressPlate, rememberFocus, starName, starPoints } from './starnav.ts';
import { focusCardTitle } from '../focus.ts';
import { screenOf } from './view.ts';
import { expanded, hasHidden, opened, unionById } from '../reveal.ts';
import { skyMode } from '../work.ts';

const LIST_ID = 'sky-stars';
const WINDOW_ID = 'sky-window';
const HELP_ID = 'sky-help';
/** id пункта списка лиц неба: на него указывает aria-activedescendant холста. */
export const starDomId = (id: string) => `sky-star-${id}`;
/** id пункта картуша союза в списке неба (решение 70): «u:avraam+agar» → «sky-plate-u_avraam_agar». */
export const plateDomId = (uid: string) => `sky-plate-${uid.replace(/[^a-z0-9-]/gi, '_')}`;

export const SKY_LABEL = 'Звёздная карта родословий';
export const SKY_HELP =
  'Стрелки — к ближайшей звезде в эту сторону; Shift со стрелками — сдвиг неба; Enter — открыть карточку звезды; клавиша меню или Shift и F10 — меню звезды; плюс и минус — масштаб; ноль — всё небо; квадратные скобки — к родителю и к ребёнку; вопросительный знак — все клавиши. В небе «набор» стрелки водят и по карточкам союзов; Enter на карточке союза раскрывает или сворачивает союз.';
/** Справка для сенсорного экрана: жесты вместо клавиш (MOB-67). */
export const SKY_HELP_TOUCH =
  'Коснитесь звезды — откроется карточка лица; одним пальцем — сдвиг неба, двумя — масштаб; долгое касание звезды — меню звезды; «Всё небо» — вся карта. В небе «набор» касание карточки союза раскрывает или сворачивает союз.';
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
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

/**
 * Пункт списка: имя (видимый текст), для диктора — с уточнением и годами; в небе «набор» у лица с нераскрытыми союзами,
 * чьи карточки союзов не показаны, — «есть нераскрытые союзы» (решение 70).
 */
const itemLabel = (id: string, sel: string | null) =>
  typo(
    [starName(id), lifeText(id), skyMode.peek() === 'work' && !opened.peek().includes(id) && hasHidden(id) ? REVEAL_TEXT : ''].filter(Boolean).join('; ') +
      (sel === id ? '; выбрано' : ''),
  );

/** Картуш союза в списке неба: id союза, лицо, у которого он стоит, раскрыт ли. */
type PlateItem = { uid: string; from: string; open: boolean };

/** Лица на виду для списка: самые яркие, затем по времени (слева направо); и картуши союзов на виду (решение 70). */
function listed(): { ids: string[]; text: string; plates: PlateItem[] } {
  const sky = skyRef.current;
  if (!sky || !sky.model) return { ids: [], text: '', plates: [] };
  const shown = starPoints(sky).filter((s) => s.onScreen);
  const ids = [...shown]
    .sort((a, b) => a.mag - b.mag || a.x - b.x)
    .slice(0, LIST_MAX)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((s) => s.id);
  const vp = sky.cam.vp;
  const text = windowText(sky.tOf(sky.cam.wx(vp.l)), sky.tOf(sky.cam.wx(vp.r)), model.value.epochs, shown.length);
  // картуши по порядку чтения: слева направо, сверху вниз
  const plates = sky.plateHits
    .filter((h) => h.x + h.w > vp.l && h.x < vp.r && h.y + h.h > vp.t && h.y < vp.b)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((h) => ({ uid: h.uid, from: h.from, open: h.open }));
  return { ids, text, plates };
}

/** Открыть карточку лица из списка неба: выбор (или второе лицо пары), фокус — на заголовок карточки. */
function choose(id: string) {
  goTo(id);
  focusCardTitle(id);
}

export function SkyA11y() {
  const list = useRef<HTMLUListElement>(null);
  const [view, setView] = useState<{ ids: string[]; text: string; plates: PlateItem[] }>({
    ids: [],
    text: '',
    plates: [],
  });
  const [said, setSaid] = useState('');
  const f = focused.value;
  const sel = selected.value;
  const pf = plateFocus.value;
  // пункты «есть нераскрытые союзы» и состояние картушей меняются вместе с раскрытием (решение 70)
  void opened.value;
  const exp = expanded.value;

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
      plateFocus.value = null;
    };
    // картуш союза с кольцом клавиатуры (решение 70): Enter и пробел раскрывают или сворачивают союз; клавиши атласа
    // (src/ui/keys.ts) событие, отменённое здесь, не берут
    const onKey = (e: KeyboardEvent) => {
      const uid = plateFocus.peek();
      if (!uid || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return;
      const h = skyRef.current?.plateHits.find((q) => q.uid === uid);
      const u = unionById(uid);
      if (!u) return;
      e.preventDefault();
      pressPlate(uid, h?.from ?? u.a ?? u.b ?? u.kids[0]);
      skyRef.redraw();
    };
    c.addEventListener('focus', onFocus);
    c.addEventListener('blur', onBlur);
    c.addEventListener('keydown', onKey);
    return () => {
      c.removeEventListener('focus', onFocus);
      c.removeEventListener('blur', onBlur);
      c.removeEventListener('keydown', onKey);
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
      const pk = (v: { plates: PlateItem[] }) => v.plates.map((q) => `${q.uid}${q.open ? 1 : 0}`).join();
      setView((prev) => (prev.text === next.text && prev.ids.join() === next.ids.join() && pk(prev) === pk(next) ? prev : next));
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

  // звезда с фокусом всегда есть в списке: иначе холсту не на что указать; картуш с фокусом — тоже
  const ids = f && !view.ids.includes(f) && byId.has(f) ? [...view.ids, f] : view.ids;
  const pfHit = pf && !view.plates.some((q) => q.uid === pf) ? skyRef.current?.plateHits.find((q) => q.uid === pf) : undefined;
  const plates = pfHit ? [...view.plates, { uid: pfHit.uid, from: pfHit.from, open: pfHit.open }] : view.plates;
  useLayoutEffect(() => {
    const c = canvas();
    if (!c) return;
    if (pf && document.getElementById(plateDomId(pf))) c.setAttribute('aria-activedescendant', plateDomId(pf));
    else if (f && document.getElementById(starDomId(f))) c.setAttribute('aria-activedescendant', starDomId(f));
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
                onFocus={() => {
                  plateFocus.value = null;
                  focused.value = id;
                }}
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
        {/* картуши союзов на виду (решение 70): Enter раскрывает или сворачивает союз */}
        {plates.map((q) => {
          const u = unionById(q.uid);
          if (!u) return null;
          const open = q.uid in exp;
          return (
            <li key={q.uid}>
              <button
                type="button"
                id={plateDomId(q.uid)}
                tabIndex={-1}
                aria-label={plateItemText(u, open)}
                aria-expanded={open}
                onClick={() => pressPlate(q.uid, q.from)}
                onFocus={() => {
                  focused.value = null;
                  plateFocus.value = q.uid;
                }}
                onBlur={(e) => {
                  if (e.relatedTarget === canvas() || list.current?.contains(e.relatedTarget as Node | null)) return;
                  if (plateFocus.peek() === q.uid) plateFocus.value = null;
                }}
              >
                {plateItemText(u, open)}
              </button>
            </li>
          );
        })}
      </ul>
      <p id={WINDOW_ID} hidden>
        {view.text}
      </p>
      <p id={HELP_ID} hidden>
        {coarse() ? SKY_HELP_TOUCH : SKY_HELP}
      </p>
      <p class="visually-hidden" aria-live="polite">
        {said}
      </p>
    </>
  );
}
