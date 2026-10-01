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
import { effect, signal } from '@preact/signals';
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
import { show, skyMode } from '../work.ts';
import { dotsOn, openDot } from './DotCard.tsx';
import { selectedKin } from '../card/kinrows.ts';
import { openSheetAt } from '../sheet.ts';

const LIST_ID = 'sky-stars';
const WINDOW_ID = 'sky-window';
const HELP_ID = 'sky-help';
/** id пункта списка лиц неба: на него указывает aria-activedescendant холста. */
export const starDomId = (id: string) => `sky-star-${id}`;
/** id пункта ромба союза в списке неба (решения 70, 76, 78): «u:avraam+agar» → «sky-plate-u_avraam_agar». */
export const plateDomId = (uid: string) => `sky-plate-${uid.replace(/[^a-z0-9-]/gi, '_')}`;

export const SKY_LABEL = 'Звёздная карта родословий';

/**
 * Короткое сообщение неба для диктора (решение 151; M7): «детей в данных нет» после «]» у лица без детей, «родителей
 * в данных нет» после «[». n — счётчик: то же сообщение дважды подряд звучит дважды (неразрывный пробел меняет текст).
 */
const skyNews = signal<{ text: string; n: number }>({ text: '', n: 0 });
export function skySay(text: string) {
  skyNews.value = { text, n: skyNews.peek().n + 1 };
}
export const SKY_HELP =
  'Стрелки — к ближайшей звезде в эту сторону; Shift со стрелками — сдвиг неба; Enter — открыть карточку звезды с её родством; клавиша меню или Shift и F10 — меню звезды; плюс и минус — масштаб; ноль — всё небо; квадратные скобки — к родителю и к ребёнку; вопросительный знак — все клавиши. Стрелки водят и по ромбам союзов; Enter на звезде или ромбе союза открывает у него карточку, Escape её закрывает. Связь выбирается строкой «Родство» карточки: Tab до строки, Enter на имени — карточка связи; Escape — назад. G (п) — к карточке и обратно.';
/** Справка для сенсорного экрана: жесты вместо клавиш (MOB-67). */
export const SKY_HELP_TOUCH =
  'Коснитесь звезды или её имени — откроется карточка лица с её родством; касание звезды или ромба союза открывает у него карточку, касание линии — связь, а в гуще линий — список «Какая связь?»; одним пальцем — сдвиг неба, двумя — масштаб (пальцы строго по горизонтали — только время, по вертикали — только строки); долгое касание звезды — меню звезды; «Всё небо» — вся карта.';
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
 * чьи точки союзов не показаны, — «есть нераскрытые союзы» (решение 70).
 */
const itemLabel = (id: string, sel: string | null) =>
  typo(
    [starName(id), lifeText(id), relText(id, sel), skyMode.peek() === 'work' && !opened.peek().includes(id) && hasHidden(id) ? REVEAL_TEXT : ''].filter(Boolean).join('; ') +
      (sel === id ? '; выбрано' : ''),
  );

/**
 * Пункт списка неба при выбранном лице называет отношение к нему (решение 151; M7): «жена Иакова», «отец Марии, толк.»;
 * лицо не из его «Родства» — «вне семьи выбранного». Стрелки ведут к ближайшей звезде, и диктор сразу говорит, своя ли она.
 */
function relText(id: string, sel: string | null): string {
  if (!sel || sel === id) return '';
  const k = selectedKin(id);
  return k ? k.text : 'вне семьи выбранного';
}

/** Точка союза в списке неба: id союза, лицо, у которого она стоит, раскрыт ли союз. */
type PlateItem = { uid: string; from: string; open: boolean };

/** Лица на виду для списка: самые яркие, затем по времени (слева направо); и точки союзов на виду (решения 70, 76). */
function listed(): { ids: string[]; text: string; plates: PlateItem[] } {
  const sky = skyRef.current;
  if (!sky || !sky.model) return { ids: [], text: '', plates: [] };
  const shown = starPoints(sky).filter((s) => s.onScreen);
  // звёзды без подписи на небе (контракт 2; решение 140: подпись скрыта до наведения, фокуса или выбора) — в списке
  // всегда: диктор читает их имена, хотя глазу они сейчас не подписаны
  const hidden = new Set(sky.hiddenLabels());
  const top = [...shown].sort((a, b) => a.mag - b.mag || a.x - b.x).slice(0, LIST_MAX);
  const extra = shown.filter((s) => hidden.has(s.id) && !top.includes(s)).slice(0, LIST_MAX);
  const ids = [...top, ...extra]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((s) => s.id);
  const vp = sky.cam.vp;
  const text = windowText(sky.tOf(sky.cam.wx(vp.l)), sky.tOf(sky.cam.wx(vp.r)), model.value.epochs, shown.length);
  // точки союзов по порядку чтения: слева направо, сверху вниз
  const plates = sky.plateHits
    .filter((h) => h.x + h.w > vp.l && h.x < vp.r && h.y + h.h > vp.t && h.y < vp.b)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((h) => ({ uid: h.uid, from: h.from, open: h.open }));
  return { ids, text, plates };
}

/**
 * Открыть карточку лица из списка неба или клавишей на холсте: выбор (или второе лицо пары), фокус — на заголовок
 * карточки. В небе «набор» (решение 76) — ещё и карточка у звезды, фокус — на её первую команду.
 */
function choose(id: string) {
  if (dotsOn.peek()) {
    if (id !== selected.peek()) openSheetAt('peek');
    goTo(id);
    openDot({ kind: 'person', id }, { focus: true });
    return;
  }
  goTo(id);
  focusCardTitle(id);
}

/** Ромб союза с клавиатуры: карточка у ромба с фокусом на первой команде; при выборе второго лица — раскрыть или свернуть. */
function chooseUnion(uid: string, from: string) {
  if (dotsOn.peek()) openDot({ kind: 'union', uid, from }, { focus: true });
  else pressPlate(uid, from);
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
  // пункты «есть нераскрытые союзы» и состояние точек союзов меняются вместе с раскрытием (решение 70)
  void opened.value;
  const exp = expanded.value;
  // небо «набор»: пункты открывают карточку у точки (решение 76)
  const dots = dotsOn.value;
  // «дети показаны / скрыты» — только в показе «набор» (X4 Д13)
  const inSet = show.value.kind === 'set';

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
    // Enter и пробел на холсте (решение 76): у точки союза с кольцом клавиатуры и, в небе «набор», у звезды с кольцом —
    // карточка у точки, фокус на её первую команду (без карточки у точки — союз раскрывается или сворачивается сразу).
    // Клавиши атласа (src/ui/keys.ts, src/ui/sky/skykeys.ts) событие, отменённое здесь, не берут
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return;
      const uid = plateFocus.peek();
      if (uid) {
        const h = skyRef.current?.plateHits.find((q) => q.uid === uid);
        const u = unionById(uid);
        if (!u) return;
        e.preventDefault();
        chooseUnion(uid, h?.from ?? u.a ?? u.b ?? u.kids[0]);
        skyRef.redraw();
        return;
      }
      const id = focused.peek();
      if (!id || !dotsOn.peek()) return;
      e.preventDefault();
      choose(id);
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
    /** места звёзд списка при последнем обновлении */
    let seen = '';
    /** окно неба при последнем кадре: кадры без сдвига окна (зажигание звёзд, ток света по ленте) не откладывают список */
    let camSeen = '';
    const update = () => {
      clearTimeout(timer);
      timer = 0;
      since = 0;
      const next = listed();
      const pk = (v: { plates: PlateItem[] }) => v.plates.map((q) => `${q.uid}${q.open ? 1 : 0}`).join();
      // места звёзд (data-x, data-y) — тоже часть списка: небо сдвинули, а лица на виду те же — места новые
      const at = (v: { ids: string[] }) => v.ids.map((id) => screenOf(id)).map((q) => (q ? `${Math.round(q.x)},${Math.round(q.y)}` : '')).join(';');
      const where = at(next);
      setView((prev) => (prev.text === next.text && prev.ids.join() === next.ids.join() && pk(prev) === pk(next) && seen === where ? prev : next));
      seen = where;
    };
    const off = effect(() => {
      void viewTick.value;
      void selected.value;
      const cam = skyRef.current?.cam;
      const key = cam ? `${cam.x0} ${cam.kx} ${cam.laneTop} ${cam.ky} ${cam.vp.l} ${cam.vp.t} ${cam.vp.r} ${cam.vp.b}` : '';
      const still = key === camSeen;
      camSeen = key;
      // окно стоит, обновление уже назначено — кадр его не откладывает: места звёзд в списке (data-x, data-y) верны через
      // 600 мс после остановки неба, а не через 2 с, пока идут кадры без движения
      if (still && timer) return;
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

  // звезда с фокусом всегда есть в списке: иначе холсту не на что указать; точка союза с фокусом — тоже
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
                aria-haspopup={dots ? 'dialog' : undefined}
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
        {/* ромбы союзов на виду (решения 70, 76, 78): Enter открывает у ромба карточку союза */}
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
                aria-label={plateItemText(u, open, inSet)}
                aria-expanded={dots ? undefined : open}
                aria-haspopup={dots ? 'dialog' : undefined}
                onClick={() => chooseUnion(q.uid, q.from)}
                onFocus={() => {
                  focused.value = null;
                  plateFocus.value = q.uid;
                }}
                onBlur={(e) => {
                  if (e.relatedTarget === canvas() || list.current?.contains(e.relatedTarget as Node | null)) return;
                  if (plateFocus.peek() === q.uid) plateFocus.value = null;
                }}
              >
                {plateItemText(u, open, inSet)}
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
      <p class="visually-hidden" aria-live="polite" data-sky-news="">
        {skyNews.value.text}
        {skyNews.value.n % 2 ? '\u00a0' : ''}
      </p>
    </>
  );
}
