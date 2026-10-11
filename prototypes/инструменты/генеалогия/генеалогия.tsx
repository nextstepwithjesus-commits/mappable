/**
 * Экран Генеалогии — шаг 2.0 плана 10 «Генеалогия — механика» (10 § 4.2.1). СЕРЫЙ МАКЕТ: проверяет только путь
 * (08 § 10.3 п. 6). Виды: «Семья» (схема и двойник — семейная страница), «Предки», «Потомки» (отчёты и выгрузка CSV и GEDCOM).
 * Адрес — 03 § 22.2: `p`, `vhod`, `show`, `read`, `open`, `zakr`, `up`, `down`, `sel`, `edge`.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Г, Л, генеалогияГотова, ошибкаГенеалогии, начатьГенеалогию, замеры } from './данные.ts';
import { маршрут, сВидом, идти, href, router, шагОтмены } from '../общее/приложение.ts';
import { настройки } from '../общее/настройки.ts';
import { объявить } from '../общее/службы.ts';
import { загружено } from '../общее/данные.ts';
import { Схема, запомнитьЯкорь, состояниеСхемы } from './схема.tsx';
import { СемейнаяСтраница, Лист, Прочтения, кЛицу, Имя } from './семейная.tsx';
import { ВХОДЫ, раскрытоВхода, изАдреса, вАдрес, дети, родители, свернутьДетей, слотСкрыт, вход, прочтенияИзАдреса, свернутьПредков, толькоЭто } from './семья.ts';
import { idЛица, type Предмет } from './раскладка.ts';
import type { Итог } from './клавиши.ts';
import { предки, потомки, csvПредков, csvПотомков } from './отчёты.ts';
import { выгрузитьGedcom } from './gedcom.ts';
import { zip } from './архив.ts';
import { путьРодства } from './путь.ts';
import { Граф, type Выбор } from './граф.ts';
import './генеалогия.css';

// ---------- измерение подписей (09 § 3.3: от шрифта и «Размера текста» читателя) ----------
interface Мерка { лицо: (i: number) => number; мелко: (t: string) => number; s: number }
function useМерка(): Мерка | null {
  const [м, setМ] = useState<Мерка | null>(null);
  const текст = настройки.value.текст;
  useEffect(() => {
    let живо = true;
    void document.fonts.ready.then(() => {
      if (!живо) return;
      const пробаИмя = document.getElementById('мерка-имя'), пробаУточн = document.getElementById('мерка-уточн'), пробаМелко = document.getElementById('мерка-мелко');
      if (!пробаИмя || !пробаУточн || !пробаМелко) return;
      const ctx = document.createElement('canvas').getContext('2d')!;
      const шрифт = (el: HTMLElement) => { const s = getComputedStyle(el); return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; };
      const fИ = шрифт(пробаИмя), fУ = шрифт(пробаУточн), fМ = шрифт(пробаМелко);
      const w = (f: string, t: string) => { ctx.font = f; return ctx.measureText(t).width; };
      const s = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      const кэш = new Map<number, number>();
      setМ({
        s,
        // знак 10 px и отступ — в раскладке; здесь — имя и уточнение одной строкой, с запасом 2 px на округление
        лицо: (i) => { let v = кэш.get(i); if (v === undefined) { const л = Г.лица[i]; v = Math.ceil(w(fИ, л.имя) + (л.уточн ? w(fУ, `, ${л.уточн}`) : 0)) + 2; кэш.set(i, v); } return v; },
        мелко: (t) => Math.ceil(w(fМ, t)) + 2,
      });
    });
    return () => { живо = false; };
  }, [текст]);
  return м;
}

function скачать(имя: string, данные: BlobPart, тип: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([данные], { type: тип }));
  a.download = имя;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const дата = () => new Date().toISOString().slice(0, 10);
const слаг = (s: string) => s.toLocaleLowerCase('ru').replace(/[^a-zа-яё0-9]+/giu, '-').replace(/^-|-$/g, '');

export function Генеалогия() {
  void генеалогияГотова.value;
  void загружено.value;
  useEffect(() => { void начатьГенеалогию(); }, []);
  const м = useМерка();
  if (ошибкаГенеалогии.value) return <p role="alert">{ошибкаГенеалогии.value}</p>;
  return (
    <div class="генеалогия">
      <div class="мерки" aria-hidden="true">
        <span id="мерка-имя" class="узел__имя">Мерка</span>
        <span id="мерка-уточн" class="узел__уточн">Мерка</span>
        <span id="мерка-мелко" class="пр пр--отсыл">Мерка</span>
      </div>
      {!Г ? <p aria-busy="true">Загружаем родословие…</p> : <Экран м={м} />}
    </div>
  );
}

function Экран({ м }: { м: Мерка | null }) {
  const r = маршрут.value;
  const P = r.params;
  const вх = P.vhod && ВХОДЫ[P.vhod] ? P.vhod : undefined;
  const лицо = P.p ? Г.ид(P.p) : вх ? Г.ид(ВХОДЫ[вх].лица.at(-1)!) : -1;
  if (!P.p && !вх) return <Входы />;
  if (лицо < 0) return <><h1 id="h1" tabIndex={-1}>Генеалогия</h1><p>Такого человека в Генеалогии нет.</p></>;
  if (Л.узелЛица[лицо] < 0) return <><h1 id="h1" tabIndex={-1}>{Г.полное(лицо)} — Генеалогия</h1><p>{Г.имя(лицо)} есть в Библии, но родство не названо. <a href={href({ screen: 'kartochka', id: `p-${Г.лица[лицо].id}`, params: {} })}>Открыть карточку</a></p></>;
  const выбор: Выбор = прочтенияИзАдреса(P.read);
  const show = P.show === 'predki' || P.show === 'potomki' ? P.show : 'semya';
  return (
    <>
      <h1 id="h1" tabIndex={-1}>{вх && !P.p ? `${ВХОДЫ[вх].имя} — Генеалогия` : show === 'semya' ? `${Г.полное(лицо)} — Генеалогия` : `${Г.полное(лицо)} — ${show === 'predki' ? 'предки' : 'потомки'}`}</h1>
      <p class="серый-макет"><strong>серый макет: проверяет только путь</strong> (шаг 2.0 плана; облик не проверялся)</p>
      <СтрокаИнструмента лицо={лицо} show={show} выбор={выбор} />
      {show === 'semya' ? <Семья лицо={лицо} вх={вх} м={м} выбор={выбор} /> : <Отчёт лицо={лицо} вид={show} выбор={выбор} />}
    </>
  );
}

function Входы() {
  return (
    <>
      <h1 id="h1" tabIndex={-1}>Генеалогия</h1>
      <p class="серый-макет"><strong>серый макет: проверяет только путь</strong></p>
      <p class="эскиз"><strong>эскиз:</strong> первый экран «Всё родословие» (03 § 19) строится в пакете 2. Здесь — входы строками и поиск.</p>
      <Поиск />
      <h2>Входы</h2>
      <ul class="входы">
        {Object.entries(ВХОДЫ).map(([k, v]) => <li><a href={href({ screen: 'genealogiya', params: { vhod: k } })}>{v.имя}</a></li>)}
        {['iakov', 'david', 'aaron', 'iisus', 'kainan-syn-arfaksada', 'iuda', 'ruf'].map((id) => (Г.ид(id) >= 0 ? <li><a href={href({ screen: 'genealogiya', params: { p: id } })}>{Г.полное(Г.ид(id))}</a></li> : null))}
      </ul>
    </>
  );
}

function Поиск() {
  const [q, setQ] = useState('');
  const найти = () => {
    const t = q.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
    if (!t) return;
    const кандидаты = Г.лица.filter((л) => Л.узелЛица[л.i] >= 0 && [л.имя, ...л.другие].some((n) => n.toLocaleLowerCase('ru').replace(/ё/g, 'е') === t));
    const все = кандидаты.length ? кандидаты : Г.лица.filter((л) => Л.узелЛица[л.i] >= 0 && л.имя.toLocaleLowerCase('ru').replace(/ё/g, 'е').startsWith(t));
    все.sort((a, b) => b.знач - a.знач);
    const х = все[0];
    if (!х) {
      const вне = Г.лица.find((л) => л.имя.toLocaleLowerCase('ru') === t);
      объявить(вне ? `${вне.имя} есть в Библии, но родство не названо` : 'В Генеалогии такого имени нет');
      return;
    }
    кЛицу(х.i);
  };
  return (
    <form class="поиск-генеалогии" role="search" onSubmit={(e) => { e.preventDefault(); найти(); }}>
      <label for="поиск-генеалогии">Найти в Генеалогии</label>
      <input id="поиск-генеалогии" type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autocomplete="off" />
      <button class="кн" type="submit">Показать</button>
    </form>
  );
}

function СтрокаИнструмента({ лицо, show, выбор }: { лицо: number; show: string; выбор: Выбор }) {
  const P = маршрут.value.params;
  const ш = шагОтмены.value;
  const [клавиши, setКлавиши] = useState(false);
  const вид = (v: string, t: string) => (
    <button class="кн" type="button" aria-pressed={show === v} onClick={() => сВидом({ show: v === 'semya' ? undefined : v, sel: undefined, edge: undefined }, t)}>{t}</button>
  );
  const выгрузить = () => {
    const набор = show === 'predki' ? [лицо, ...предки(Г, лицо, выбор).группы.flatMap((г) => г.строки.map((s) => s.лицо))] : show === 'potomki' ? потомки(Г, лицо, выбор).строки.map((s) => s.лицо) : [...изАдреса(Л, раскрытоВхода(Л, лицо, P.vhod), P.open, P.zakr)].flatMap((k) => Л.узлы[k].вид === 'block' ? Л.узлы[k].лица : []);
    const что = show === 'predki' ? 'предки' : show === 'potomki' ? 'потомки' : 'семья';
    const ged = выгрузитьGedcom(Г, набор, { выбор, дата: дата(), описание: `${Г.полное(лицо)} — ${что}` });
    скачать(`библия-наглядно_генеалогия_${слаг(Г.имя(лицо))}-${что}_${дата()}.ged`, ged, 'text/plain;charset=utf-8');
    объявить(`Сохранён файл GEDCOM: ${набор.length} человек`);
  };
  return (
    <div class="строка-инструмента" role="toolbar" aria-label="Генеалогия: виды и действия">
      <div class="строка-инструмента__группа">
        {вид('semya', 'Семья')}
        {вид('predki', 'Предки')}
        {вид('potomki', 'Потомки')}
      </div>
      <div class="строка-инструмента__группа">
        <button class="кн" type="button" disabled={!ш.undo} onClick={() => { const a = состояниеСхемы.активный; if (a) запомнитьЯкорь(a); router.undo(); }}>Отменить шаг{ш.undo ? `: ${ш.undo}` : ''}</button>
        <button class="кн" type="button" disabled={!ш.redo} onClick={() => { const a = состояниеСхемы.активный; if (a) запомнитьЯкорь(a); router.redo(); }}>Вернуть шаг</button>
        <button class="кн" type="button" onClick={выгрузить}>Сохранить GEDCOM 5.5.1</button>
        <button class="кн" type="button" aria-expanded={клавиши} aria-controls="клавиши-схемы" onClick={() => setКлавиши(!клавиши)}>Клавиши схемы</button>
      </div>
      <div id="клавиши-схемы" hidden={!клавиши} class="справка-клавиш">
        <p>В схему — одна остановка Tab. Стрелка вверх — к союзу родителей или к отцу; вниз — к союзу и детям; влево и вправо — братья и сёстры одной группы; Home и End — первый и последний в группе; Enter — выбрать или раскрыть. Alt и стрелки вбок — соседний узел ряда через границу семьи; Alt и стрелка вверх — рёбра к родителям, вниз — к детям. Буква — следующее имя на эту букву. «+» и «−» — масштаб; Shift и стрелки — сдвиг окна; Ctrl+Z — отменить шаг. В NVDA и JAWS стрелки графа работают в режиме фокуса (NVDA + Пробел; JAWS — режим форм); в режиме просмотра читайте вложенный список и семейную страницу.</p>
      </div>
    </div>
  );
}

function Семья({ лицо, вх, м, выбор }: { лицо: number; вх?: string; м: Мерка | null; выбор: Выбор }) {
  const P = маршрут.value.params;
  const вход0 = useMemo(() => раскрытоВхода(Л, лицо, вх), [лицо, вх]);
  const раскрыто = useMemo(() => изАдреса(Л, вход0, P.open, P.zakr), [вход0, P.open, P.zakr]);
  const выбрано = P.sel ? Г.ид(P.sel) : лицо;
  const шаг = (новое: Set<number>, подпись: string, якорь: string, фокус?: string, сказать?: string) => {
    запомнитьЯкорь(якорь, фокус);
    const { open, zakr } = вАдрес(Л, вход0, новое);
    сВидом({ open: open || undefined, zakr: zakr || undefined }, подпись);
    if (сказать) объявить(сказать);
  };
  const наДействие = (p: Предмет, д: NonNullable<Итог['действие']>) => {
    const u = Л.узлы[p.узел];
    switch (д) {
      case 'выбрать':
        if (выбрано !== p.лицо) { идти({ ...маршрут.value, params: { ...маршрут.value.params, sel: Г.лица[p.лицо].id } }); объявить(`Выбрано: ${Г.полное(p.лицо)}`); }
        else объявить(`Уже выбрано: ${Г.полное(p.лицо)}`);
        return;
      case 'раскрыть-слот': {
        const скрыт = слотСкрыт(Л, раскрыто, p.узел, p.слот!) && (p.слот! < 0 || слотСкрыт(Л, раскрыто, p.узел, 100 + p.слот!));
        let s = скрыт ? дети(Л, раскрыто, p.узел, p.слот) : свернутьДетей(Л, раскрыто, p.узел, p.слот);
        if (p.слот! > 0) s = скрыт ? дети(Л, s, p.узел, 100 + p.слот!) : свернутьДетей(Л, s, p.узел, 100 + p.слот!);
        шаг(s, скрыт ? 'показать детей союза' : 'свернуть детей союза', p.id, undefined, скрыт ? 'Дети союза показаны' : 'Дети союза свёрнуты');
        return;
      }
      case 'раскрыть-группу': {
        const откр = u.дети.some((c) => раскрыто.has(c));
        шаг(откр ? свернутьДетей(Л, раскрыто, p.узел) : дети(Л, раскрыто, p.узел), откр ? 'свернуть группу' : 'раскрыть группу', p.id, undefined, откр ? 'Группа свёрнута' : `Группа раскрыта: ${u.дети.length}`);
        return;
      }
      case 'показать-детей': {
        // фокус — на главе: кнопка «ещё» исчезает, а узел действия стоит на месте (↓ — к первому ребёнку)
        шаг(дети(Л, раскрыто, p.узел), 'показать детей', idЛица(Л, u.лица[0]), undefined, `Показано детей: ${u.дети.length}. Стрелка вниз — к детям`);
        return;
      }
      case 'показать-родителей':
        шаг(родители(Л, раскрыто, p.узел), 'показать родителей', idЛица(Л, u.лица[0]), undefined, 'Родители показаны');
        return;
      case 'перелёт': {
        const t = p.вид === 'отсыл-жены' ? p.лицо : p.отсыл!.к;
        const k = Л.узелЛица[t];
        if (k >= 0 && раскрыто.has(k)) { состояниеСхемы.активный = idЛица(Л, t); document.getElementById(idЛица(Л, t))?.focus(); запомнитьЯкорь(idЛица(Л, t)); объявить(`Перелёт: ${Г.полное(t)}`); }
        else {
          const s = new Set(раскрыто);
          for (const x of вход(Л, t)) s.add(x);
          шаг(s, `показать: ${Г.имя(t)}`, p.id, idЛица(Л, t), `Показано: ${Г.полное(t)}`);
        }
        return;
      }
      case 'лист-ребра':
        сВидом({ edge: Г.рёбра[p.ребро!].номер });
    }
  };
  const видимыхЛиц = [...раскрыто].reduce((s, k) => s + (Л.узлы[k].вид === 'block' ? Л.узлы[k].лица.length : 0), 0);
  // для проверок и замеров
  (window as unknown as { __генеалогия: unknown }).__генеалогия = {
    раскрыто: [...раскрыто],
    замеры,
    схема: состояниеСхемы,
    // замер блока «По родству» (П9): путь в одном прочтении, мс
    путь: (a: string, b: string) => { const t = performance.now(); const z = путьРодства(Г, Г.ид(a), Г.ид(b), выбор); return { мс: performance.now() - t, звеньев: z?.length ?? -1 }; },
  };
  const выбранныйУзел = Л.узелЛица[выбрано];
  return (
    <>
      <div class="команды-лица" role="group" aria-label={`Команды: ${Г.полное(выбрано)}`}>
        <button class="кн" type="button" onClick={() => шаг(свернутьПредков(Л, раскрыто, выбранныйУзел), 'свернуть предков', idЛица(Л, выбрано))}>Свернуть предков</button>
        <button class="кн" type="button" onClick={() => шаг(свернутьДетей(Л, раскрыто, выбранныйУзел), 'свернуть потомков', idЛица(Л, выбрано))}>Свернуть потомков</button>
        <button class="кн" type="button" onClick={() => шаг(толькоЭто(выбранныйУзел), 'только это лицо', idЛица(Л, выбрано))}>Только это лицо</button>
        <button class="кн" type="button" onClick={() => шаг(new Set(Л.узлы.map((u) => u.key)), 'весь лес', idЛица(Л, выбрано), undefined, `Раскрыт весь лес: ${Л.в.reduce((a, b) => a + b, 0)} человек`)}>Раскрыть весь лес</button>
        <button class="кн" type="button" onClick={() => { const id = idЛица(Л, выбрано); состояниеСхемы.активный = id; запомнитьЯкорь(id); document.getElementById(id)?.focus(); }}>К выбранному лицу</button>
      </div>
      <h2 class="скрыто" id="схема-заголовок">Схема</h2>
      <p class="описание-схемы" id="описание-схемы">
        Схема: семья — {Г.полное(лицо)}; раскрыто {видимыхЛиц} человек; выбрано: {Г.полное(выбрано)}. Порядок детей — как в тексте. <a href="#семейная-заголовок">К семейной странице</a>
      </p>
      <Схема раскрыто={раскрыто} выбрано={выбрано} масштабТекста={м?.s ?? 1} измерить={м?.лицо ?? null} мелко={м?.мелко ?? null} наДействие={наДействие} наЛист={(вид, i) => сВидом({ edge: `${вид}:${Г.лица[i].id}` })} />
      {маршрут.value.params.edge && <Лист edge={маршрут.value.params.edge} />}
      <СемейнаяСтраница i={выбрано} выбор={выбор} />
    </>
  );
}

// ---------- отчёты (03 § 18): списки по поколениям, CSV в архиве, GEDCOM ----------
function Отчёт({ лицо, вид, выбор }: { лицо: number; вид: 'predki' | 'potomki'; выбор: Выбор }) {
  const P = маршрут.value.params;
  const t0 = performance.now();
  const о = useMemo(() => (вид === 'predki' ? { вид, п: предки(Г, лицо, выбор) } : { вид, п: потомки(Г, лицо, выбор, P.down ? Number(P.down) : Infinity) }), [лицо, вид, P.read, P.down]);
  замеры[`отчёт-${вид}`] = performance.now() - t0;
  const наборы = useMemo(() => {
    const лица = о.вид === 'predki' ? о.п.группы.flatMap((г) => г.строки.map((s) => s.лицо)) : о.п.строки.map((s) => s.лицо);
    const s = new Set<string>();
    for (const i of лица) for (const x of [...Г.вверх[i], ...Г.вниз[i]]) { const н = Г.рёбра[x].набор; if (н) s.add(н); }
    return [...s];
  }, [о]);
  const сохранить = () => {
    const текст = о.вид === 'predki' ? csvПредков(Г, о.п) : csvПотомков(Г, о.п);
    const имя = `${слаг(Г.имя(лицо))}-${о.вид === 'predki' ? 'предки' : 'потомки'}`;
    const описание = [`Библия наглядно — Генеалогия, серый макет (шаг 2.0). ${Г.полное(лицо)}: ${о.вид === 'predki' ? 'предки' : 'потомки'}.`, `Дата: ${дата()}. Отпечаток базы: ${Г.база}. Данные: проба, записи не проверены вторым ключом.`, `Прочтение: ${P.read || 'по умолчанию'}.`, 'Номер Ahnentafel и д’Абовиля — номер в этом отчёте, а не номер записи; ссылайтесь на номер записи. Номер записан со знаком «№» впереди, чтобы табличная программа не превратила его в число или дату; для сортировки — столбец «порядок».', 'Разделитель — «;», кодировка UTF-8 с BOM.', 'Текст: Синодальный перевод (1876), общественное достояние; электронный текст scrollmapper/bible_databases, MIT.'].join('\r\n');
    скачать(`библия-наглядно_генеалогия_${имя}_${дата()}.zip`, zip([{ имя: `${имя}.csv`, текст }, { имя: 'описание.txt', текст: описание }]), 'application/zip');
    объявить('Таблица сохранена в файл');
  };
  return (
    <section class="отчёт" aria-labelledby="отчёт-заголовок">
      <h2 id="отчёт-заголовок">{о.вид === 'predki' ? `Предки: ${о.п.лиц} человек, ${о.п.поколений} поколений, номеров ${о.п.номеров}` : `Потомки: ${о.п.строки.length - 1} человек, ${о.п.поколений} поколений`}</h2>
      <p>Одно прочтение — текущее: {P.read ? P.read : 'по умолчанию (отец Иосифа — по Матфею)'}. Рёбра — кровные, «сказано» и «вывод»; ребро Иосифа у Иисуса Христа, приёмные и толкования номера не получают.{о.вид === 'predki' && о.п.естьПропуск ? ' На пути есть пропуск поколений: шаг по тексту — не меньше 1.' : ''}</p>
      <div class="ряд-действий">
        <button class="кн" type="button" onClick={сохранить}>Сохранить таблицу в файл</button>
        {о.вид === 'potomki' && (
          <label class="поле-поколений">
            Поколений вниз:{' '}
            <select value={P.down ?? 'все'} onChange={(e) => сВидом({ down: (e.target as HTMLSelectElement).value === 'все' ? undefined : (e.target as HTMLSelectElement).value }, 'поколения')}>
              {['все', '1', '2', '3', '5', '10'].map((x) => <option value={x}>{x}</option>)}
            </select>
          </label>
        )}
      </div>
      <Прочтения наборы={наборы} выбор={выбор} />
      {о.вид === 'predki' ? (
        о.п.группы.map((г) => (
          <>
            <h3>{г.заголовок}</h3>
            {поПоколениям(г.строки).map(([n, rows]) => (
              <section class="поколение" aria-label={`Поколение ${n}`}>
                <h4>Поколение {n}</h4>
                <ul>
                  {rows.map((s) => {
                    const e = s.ребро !== undefined ? Г.рёбра[s.ребро] : undefined;
                    return (
                      <li>
                        <span class="т-адрес">№{s.номер} </span>
                        <Имя i={s.лицо} />
                        {e && <span> — {s.основание}; <span class="т-адрес">{e.стихи.slice(0, 3).join('; ')}</span>; {Граф.уровеньСловом(e.уровень)}{e.поСловам ? `; ${e.поСловам.l}` : ''}</span>}
                        {s.ещё.length > 0 && <span> · ещё путей: {s.ещё.length}</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        ))
      ) : (
        <>
          {поПоколениям(о.п.строки).map(([n, rows]) => (
            <section class="поколение" aria-label={`Поколение ${n}`}>
              <h3>Поколение {n}</h3>
              <ul>
                {rows.map((s) => (
                  <li>
                    <span class="т-адрес">№{s.номер} </span>
                    <Имя i={s.лицо} />
                    {s.поколение > 0 && <span> — мать: {s.мать >= 0 ? `${Г.полное(s.мать)}${s.союз ? `, ${s.союз}` : ''}` : 'не названа'}</span>}
                    {s.дальше > 0 && <span> · потомков дальше: {s.дальше}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {о.п.изСыновей.length > 0 && (
            <>
              <h3>Из сыновей: {Г.полное(лицо)} — {о.п.изСыновей.length}</h3>
              <ul>{о.п.изСыновей.map((i) => <li><Имя i={i} /></li>)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
function поПоколениям<T extends { поколение: number }>(xs: T[]): [number, T[]][] {
  const m = new Map<number, T[]>();
  for (const x of xs) { if (!m.has(x.поколение)) m.set(x.поколение, []); m.get(x.поколение)!.push(x); }
  return [...m];
}
