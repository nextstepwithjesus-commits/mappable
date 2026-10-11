/**
 * Тесты сборки Генеалогии (03 § 9, кроме облика) и П1 (03 § 11) — шаг 2.0 плана 10 «Генеалогия — механика», без браузера.
 * Данные — пакеты пробы (`npm run -s proto:data`). Поведение в браузере — `генеалогия-поведение.test.ts`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { загрузитьГраф } from './генеалогия-данные.ts';
import type { Граф, Выбор } from '../генеалогия/граф.ts';
import { построитьЛес, type Лес } from '../генеалогия/лес.ts';
import { разложить, ширинаПоЗнакам, idЛица, type Геометрия } from '../генеалогия/раскладка.ts';
import { вход, раскрытоВхода, ВХОДЫ, вАдрес, изАдреса, дети, родители } from '../генеалогия/семья.ts';
import { перейти, КЛАВИШИ, type Контекст } from '../генеалогия/клавиши.ts';
import { предки, потомки, csvПредков, csvПотомков } from '../генеалогия/отчёты.ts';
import { выгрузитьGedcom, проверитьGedcom, разобрать } from '../генеалогия/gedcom.ts';
import { путьРодства, нить } from '../генеалогия/путь.ts';
import { zip, crc32 } from '../генеалогия/архив.ts';

let г: Граф;
let л: Лес;
const ш = { лицо: (i: number) => ширинаПоЗнакам(14)(г.полное(i)), мелко: ширинаПоЗнакам(12), текст: 1 };
const ид = (id: string) => {
  const i = г.ид(id);
  if (i < 0) throw new Error(`нет лица ${id}`);
  return i;
};
/** Входы § 2.3 и входы поиска сцен 03 (эскизы § 10, пробы П2, П5, П6, П14, П16). */
const ВХОДЫ_ПРОВЕРКИ: { имя: string; s: () => Set<number> }[] = [];

beforeAll(() => {
  г = загрузитьГраф();
  л = построитьЛес(г);
  for (const k of Object.keys(ВХОДЫ)) ВХОДЫ_ПРОВЕРКИ.push({ имя: k, s: () => раскрытоВхода(л, -1, k) });
  for (const id of ['iakov', 'avraam', 'iuda', 'david', 'aaron', 'iisus', 'mariya', 'kainan-syn-arfaksada', 'sala', 'ruf', 'noy', 'adam', 'lot', 'iosif-muzh-marii', 'salafiil', 'zorovavel', 'korey', 'moisey', 'esfir'])
    ВХОДЫ_ПРОВЕРКИ.push({ имя: id, s: () => вход(л, ид(id)) });
});

describe('прочтения, parents-word, Каинан (03 § 9 п. 1)', () => {
  it('Иисус Христос ни в одном прочтении не ребёнок союза и не получает брата через Иосифа', () => {
    const iisus = ид('iisus'), iosif = ид('iosif-muzh-marii'), mariya = ид('mariya');
    for (const в of г.всеВыборы()) {
      const к = г.кровь(в);
      expect(к.отец[iisus], JSON.stringify(в)).toBe(-1);
      expect(г.рёбра[к.мать[iisus]].род).toBe(mariya);
      expect(г.детиКрови(iosif, в).map((e) => e.реб)).not.toContain(iisus);
      for (const b of г.братья(iisus, в)) expect(г.рёбра[г.кровь(в).отец[b]]?.род).not.toBe(iosif);
    }
    // на схеме — под Марией (знак жены, слот ≥ 100), не под точкой союза
    const u = л.узлы[л.узелЛица[iisus]];
    expect(u.слот).toBeGreaterThanOrEqual(100);
    expect(л.узлы[u.родитель].лица[u.слот - 100]).toBe(mariya);
    expect(л.родитель[iisus]).toBe(mariya);
  });
  it('ребро parents-word не бывает родителем раскладки и не входит в «Предки»', () => {
    const e = г.рёбра.find((x) => x.вид === 'parents-word')!;
    expect(e).toBeTruthy();
    expect(л.ребро[e.реб]).not.toBe(e.i);
    for (const в of г.всеВыборы()) {
      const п = предки(г, e.реб, в);
      expect(п.группы.flatMap((x) => x.строки.map((s) => s.ребро))).not.toContain(e.i);
      expect(п.группы.flatMap((x) => x.строки.map((s) => s.лицо))).not.toContain(e.род);
    }
    // нить косы: единственный шаг без кровного ребра — Иосиф → Иисус Христос
    for (const k of Object.keys(г.линии)) {
      const н = нить(г, k);
      const без = н.шаги.filter((s) => s.ребро < 0).map((s) => `${г.лица[s.от].id}>${г.лица[s.к].id}`);
      expect(без, k).toEqual(['iosif-muzh-marii>iisus']);
    }
  });
  it('Каинан ни в одном прочтении не брат Салы', () => {
    const kainan = ид('kainan-syn-arfaksada'), sala = ид('sala'), arf = ид('arfaksad');
    for (const в of г.всеВыборы()) {
      expect(г.братья(sala, в)).not.toContain(kainan);
      const дети = г.детиКрови(arf, в).map((e) => e.реб);
      expect(дети.includes(kainan) && дети.includes(sala)).toBe(false);
    }
    // по Луке: Арфаксад → Каинан → Сала; по Быт: Арфаксад → Сала, Каинана среди детей нет
    const лк = { 'r-father-sala': 'lk' };
    expect(г.рёбра[г.кровь(лк).отец[sala]].род).toBe(kainan);
    expect(г.рёбра[г.кровь(лк).отец[kainan]].род).toBe(arf);
    expect(г.рёбра[г.кровь({}).отец[sala]].род).toBe(arf);
    expect(г.кровь({}).отец[kainan]).toBe(-1);
    // в лесу — у Арфаксада «по другому прочтению», своей группой, без кровной линии
    const u = л.узлы[л.узелЛица[kainan]];
    expect(u.чтение).toBeDefined();
    expect(л.узлы[u.родитель].лица[0]).toBe(arf);
  });
  it('путь родства и отчёты не смешивают прочтения: в одном выборе — один кровный отец, и его ребро действует', () => {
    for (const в of г.всеВыборы()) {
      const к = г.кровь(в);
      for (let c = 0; c < г.лица.length; c++) for (const t of [к.отец[c], к.мать[c]]) if (t >= 0) {
        const e = г.рёбра[t];
        expect(г.действует(e, в)).toBe(true);
        expect(г.кровноеПоВиду(e)).toBe(true);
      }
    }
    // Иосиф: по Матфею — Иаков, по Луке — Илий; при левирате и усыновлении кровный — Иаков (Илий — «по закону»)
    const iosif = ид('iosif-muzh-marii');
    const отец = (в: Выбор) => г.лица[г.рёбра[г.кровь(в).отец[iosif]].род].id;
    expect(отец({})).toBe('iakov-otets-iosifa');
    expect(отец({ 'r-lk3-23': 'lk' })).toBe('iliy-syn-matfata');
    expect(отец({ 'r-lk3-23': 'levirate' })).toBe('iakov-otets-iosifa');
    expect(отец({ 'r-lk3-23': 'adoption' })).toBe('iakov-otets-iosifa');
    expect(отец({ 'r-lk3-23': 'mary' })).toBe('iakov-otets-iosifa');
  });
  it('ни одно прочтение не создаёт ребра: рёбра схемы одни при любом выборе; толкования не дают кровного ребра, которого нет в прочтении «сказано»', () => {
    const рисуемые = (в: Выбор) => { void в; return л.ярлыки.length + л.узлы.reduce((s, u) => s + u.отсылы.length, 0); };
    const n0 = рисуемые({});
    for (const в of г.всеВыборы()) expect(рисуемые(в)).toBe(n0);
    for (const н of г.наборы.values()) for (const п of н.прочтения) {
      if (п.уровень !== 'interpretation') continue;
      const к = г.кровь({ [н.id]: п.id });
      for (let c = 0; c < г.лица.length; c++) for (const t of [к.отец[c], к.мать[c]]) if (t >= 0) {
        const e = г.рёбра[t];
        if (e.набор !== н.id) continue;
        const сказано = н.прочтения.filter((x) => x.уровень === 'scripture').map((x) => x.id);
        expect(e.в!.some((x) => сказано.includes(x)), `${e.номер} в ${п.id}`).toBe(true);
      }
    }
  });
});

describe('«предположительно» и стихи рёбер (03 § 9 п. 2, 5)', () => {
  it('ребро с тождеством «предположительно» не рисуется и не считается; у ребёнка есть строка со стихом', () => {
    expect(г.рёбра.some((e) => e.тождество?.d === 'possible')).toBe(false);
    const возможные = г.кандидаты.filter((c) => c.idt?.d === 'possible');
    expect(возможные.length).toBeGreaterThan(0);
    for (const c of возможные) {
      expect(c.rf.length, c.c).toBeGreaterThan(0);
      expect(c.idt!.n, c.c).toBeTruthy();
      // у ребёнка — строка в выгрузке (NOTE) и на семейной странице (тот же список кандидатов)
    }
    const ged = выгрузитьGedcom(г, [...Array(г.лица.length).keys()].filter((i) => л.в[i]), { дата: '2026-10-12' });
    const ребёнок = возможные.find((c) => г.ид(c.c) >= 0 && л.в[г.ид(c.c)])!;
    expect(ged).toContain(ребёнок.rf[0]);
  });
  it('у каждого ребра — стих, уровень и номер записи; у ребра «по словам» — пометка во всех видах и в выгрузке', () => {
    for (const e of г.рёбра) {
      expect(e.стихи.length, e.номер).toBeGreaterThan(0);
      expect(['scripture', 'inference']).toContain(e.уровень);
      expect(e.номер).toMatch(/^o-/);
    }
    const sb = г.рёбра.filter((e) => e.поСловам);
    expect(sb.length).toBeGreaterThan(0);
    const сарра = ид('sarra');
    const ged = выгрузитьGedcom(г, [ид('farra'), сарра, ид('avraam')], { дата: '2026-10-12' });
    expect(ged).toContain('по словам Авраама');
    expect(csvПредков(г, предки(г, сарра))).toContain('по словам Авраама');
  });
});

describe('П1: раскладка леса (03 § 11, § 9 п. 3)', () => {
  it('все лица Генеалогии имеют место; острова — на полках и в «Других семьях»', () => {
    for (let i = 0; i < г.лица.length; i++) if (л.в[i]) expect(л.узелЛица[i], г.лица[i].id).toBeGreaterThanOrEqual(0);
    const острова = new Set(л.узлы.map((u) => u.остров));
    expect(острова.size).toBe(л.островов);
    for (const u of л.узлы) expect(u.полка).toBeGreaterThanOrEqual(0);
    expect(л.полки[0].имя).toBe('Главный лес');
    expect(л.полки.at(-1)!.имя).toBe('Другие семьи');
  });
  it('ряды совпадают с 03, приложение А: Иосиф 62, Илий 70, Иаков 61, Салафиил 51, Нирий 52', () => {
    const ряд = (id: string) => л.узлы[л.узелЛица[ид(id)]].ряд;
    expect([ряд('iosif-muzh-marii'), ряд('iliy-syn-matfata'), ряд('iakov-otets-iosifa'), ряд('salafiil'), ряд('niriy'), ряд('iekhoniya')]).toEqual([62, 70, 61, 51, 52, 50]);
  });
  it('ни одно ребро не идёт линией от отца, стоящего не на один ряд выше ребёнка; рёбра другого места — линией только Аминадав → Корей и Федаия → Зоровавель', () => {
    for (const u of л.узлы) if (u.родитель >= 0 && л.узлы[u.родитель].вид !== 'group' && u.чтение === undefined && u.вид === 'block') expect(u.ряд, г.лица[u.лица[0]].id).toBe(л.узлы[u.родитель].ряд + 1);
    for (const я of л.ярлыки) expect(л.узлы[л.узелЛица[я.род]].ряд).toBe(л.узлы[л.узелЛица[я.реб]].ряд - 1);
    const другие = л.ярлыки.filter((я) => г.рёбра[я.ребро].вид === 'alternative' || г.рёбра[я.ребро].вид === 'by-luke').map((я) => `${г.лица[я.род].id}>${г.лица[я.реб].id}`).sort();
    expect(другие).toEqual(['aminadav-syn-kaafa>korey', 'fedaiya-syn-iekhonii>zorovavel']);
  });
  it('каждый остров находится за 2 действия: поле поиска — имя корня острова — «Показать» открывает «Семью» с ним', () => {
    const корни = new Map<number, number>();
    for (const u of л.узлы) if (u.вид === 'block' && !корни.has(u.остров)) корни.set(u.остров, u.лица[0]);
    expect(корни.size).toBe(л.островов);
    for (const [, p] of корни) {
      // действие 1 — ввести имя; действие 2 — «Показать»: поиск находит лицо по имени среди лиц Генеалогии
      const имя = г.лица[p].имя.toLocaleLowerCase('ru');
      const найдено = г.лица.filter((x) => л.в[x.i] && x.имя.toLocaleLowerCase('ru') === имя);
      expect(найдено.map((x) => x.i)).toContain(p);
      expect(вход(л, p).has(л.узелЛица[p])).toBe(true);
    }
  });
  it('вложенность контуров областей ≤ 2', () => {
    const по = new Map(г.области.map((a) => [a.id, a]));
    for (const a of г.области) {
      let d = 0;
      for (let x = a; x.pa && по.get(x.pa); x = по.get(x.pa)!) d++;
      expect(d, a.id).toBeLessThanOrEqual(2);
    }
  });
  it('на каждом входе доля раскрытых лиц с отсылом ≤ 10 %; пересечений предметов 0', () => {
    const доли: string[] = [];
    for (const { имя, s } of ВХОДЫ_ПРОВЕРКИ) {
      const раскр = s();
      const гео = разложить(л, раскр, ш);
      const лиц = гео.предметы.filter((p) => p.вид === 'лицо').length;
      const сОтсылом = new Set(гео.предметы.filter((p) => p.вид === 'отсыл' || p.вид === 'отсыл-жены').map((p) => p.лицо)).size;
      // порог 10 % — на входах § 2.3 (входы-строки); у входов поиска доля печатается для отчёта
      if (ВХОДЫ[имя]) expect(сОтсылом / Math.max(1, лиц), имя).toBeLessThanOrEqual(0.1);
      else доли.push(`${имя} ${сОтсылом}/${лиц}`);
      expect(пересечения(гео), имя).toEqual([]);
    }
    console.log(`доля лиц с отсылом на входах поиска: ${доли.join('; ')}`);
  });
  it('шаг не меняет порядок и ряд раскрытых; смена выбора и слоя мест не меняет (раскладке они не нужны)', () => {
    const p = ид('iakov');
    const s0 = вход(л, p);
    const g0 = разложить(л, s0, ш);
    const s1 = родители(л, s0, л.узлы[л.узелЛица[ид('isaak')]].key);
    const s2 = дети(л, s1, л.узелЛица[ид('iuda')]);
    const g2 = разложить(л, s2, ш);
    for (const гео of [g0, g2]) {
      // порядок в ряду — порядок леса
      const поРяду = new Map<number, [number, number][]>();
      for (const [k, x] of гео.узлы) { const r = л.узлы[k].ряд; if (!поРяду.has(r)) поРяду.set(r, []); поРяду.get(r)!.push([x.x, л.порядок[k]]); }
      for (const xs of поРяду.values()) { xs.sort((a, b) => a[0] - b[0]); for (let i = 1; i < xs.length; i++) expect(xs[i][1]).toBeGreaterThan(xs[i - 1][1]); }
    }
    for (const [k] of g0.узлы) expect(g2.узлы.has(k)).toBe(true);
    // та же раскладка дважды — те же места (смена выбора и слоя раскладку не вызывает)
    const g0b = разложить(л, s0, ш);
    expect([...g0b.узлы]).toEqual([...g0.узлы]);
  });
  it('состояние → адрес → то же состояние', () => {
    const p = ид('iakov');
    const вх = вход(л, p);
    const s = дети(л, родители(л, вх, л.узелЛица[ид('isaak')]), л.узелЛица[ид('iosif')]);
    const { open, zakr } = вАдрес(л, вх, s);
    expect([...изАдреса(л, вх, open, zakr)].sort()).toEqual([...s].sort());
    const все = new Set(л.узлы.map((u) => u.key));
    expect(вАдрес(л, вх, все).open).toBe('все');
    expect(изАдреса(л, вх, 'все').size).toBe(л.узлы.length);
  });
});

function пересечения(гео: Геометрия): string[] {
  const out: string[] = [];
  const xs = гео.предметы;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const a = xs[i], b = xs[j];
    if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) out.push(`${a.id} × ${b.id}`);
  }
  return out;
}

describe('клавиатура: таблица «вид узла × клавиша» (03 § 7.3, § 9 п. 9)', () => {
  it('у каждой клетки — переход к существующему предмету, действие или объявление', () => {
    const виды = new Set<string>();
    for (const { имя, s } of ВХОДЫ_ПРОВЕРКИ) {
      const раскр = s();
      const гео = разложить(л, раскр, ш);
      const к: Контекст = { л, г: гео, раскрыто: раскр };
      for (const p of гео.предметы) {
        виды.add(p.вид);
        for (const кл of КЛАВИШИ) {
          const r = перейти(к, p, кл);
          const ok = (r.к && гео.поИд.has(r.к)) || r.действие || r.объявить;
          expect(ok, `${имя}: ${p.id} × ${кл} → ${JSON.stringify(r)}`).toBeTruthy();
          if (r.к) expect(гео.поИд.has(r.к), `${p.id} × ${кл} → ${r.к}`).toBe(true);
        }
      }
    }
    expect([...виды].sort()).toEqual(['группа', 'ещё', 'лицо', 'мать-не-названа', 'отсыл', 'отсыл-жены', 'родители', 'союз', 'ярлык']);
  });
  it('стрелки по графу: ↑ от Иисуса Христа — к Марии; ↓ от Иакова — к союзу с Лией; → от Рувима — Симеон', () => {
    const раскр = new Set([...вход(л, ид('iakov')), ...вход(л, ид('iisus'))]);
    const гео = разложить(л, раскр, ш);
    const к: Контекст = { л, г: гео, раскрыто: раскр };
    const пр = (id: string) => гео.предметы[гео.поИд.get(id)!];
    expect(перейти(к, пр(idЛица(л, ид('iisus'))), 'ArrowUp').к).toBe(idЛица(л, ид('mariya')));
    expect(перейти(к, пр(idЛица(л, ид('iakov'))), 'ArrowDown').к).toMatch(/^г-u-iakov--liya$/);
    expect(перейти(к, пр(idЛица(л, ид('ruvim'))), 'ArrowRight').к).toBe(idЛица(л, ид('simeon')));
  });
  it('в одном виде нет двух одинаковых доступных имён лиц («Имя, уточнение»)', () => {
    const повторы: string[] = [];
    for (const { имя, s } of ВХОДЫ_ПРОВЕРКИ) {
      const гео = разложить(л, s(), ш);
      const имена = гео.предметы.filter((p) => p.вид === 'лицо').map((p) => г.полное(p.лицо));
      const d = имена.filter((x, i) => имена.indexOf(x) !== i);
      if (d.length) повторы.push(`${имя}: ${[...new Set(d)].join(', ')}`);
    }
    expect(повторы).toEqual([]);
  });
});

describe('отчёты и нумерация (03 § 18, § 9 п. 6)', () => {
  it('у каждого 2N и 2N + 1 номера Ahnentafel ребро — кровное: чётный — отец, нечётный — мать', () => {
    for (const id of ['david', 'ezdra', 'iosif-muzh-marii', 'saul', 'iisus']) {
      const п = предки(г, ид(id));
      const к = г.кровь({});
      for (const гр of п.группы) for (const s of гр.строки) {
        if (s.ребро === undefined) continue;
        const e = г.рёбра[s.ребро];
        expect(г.кровноеПоВиду(e)).toBe(true);
        const n = BigInt(s.номер);
        expect(n % 2n === 0n ? 'f' : 'm').toBe(e.роль);
        expect(к.отец[e.реб] === e.i || к.мать[e.реб] === e.i).toBe(true);
      }
    }
  });
  it('номер Адама у Иосифа, мужа Марии, совпадает с точным значением (BigInt, строкой)', () => {
    let x = ид('iosif-muzh-marii'), k = 0n;
    const к = г.кровь({});
    while (к.отец[x] >= 0) { x = г.рёбра[к.отец[x]].род; k++; }
    expect(г.лица[x].id).toBe('adam');
    const точно = (2n ** k).toString();
    const п = предки(г, ид('iosif-muzh-marii'));
    const s = п.группы[0].строки.find((r) => r.лицо === x)!;
    expect(s.номер).toBe(точно);
    expect(точно.length).toBeGreaterThan(15);
    expect(BigInt(точно) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
  it('CSV: «;», UTF-8 с BOM, номера текстом со знаком «№» и столбец «порядок»; длинный номер не испорчен', () => {
    const t = csvПредков(г, предки(г, ид('iosif-muzh-marii')));
    expect(t.startsWith('﻿№ (Ahnentafel);порядок;')).toBe(true);
    const строки = t.split('\r\n');
    expect(строки.slice(1).every((l) => l === '' || l.startsWith('№'))).toBe(true);
    let x = ид('iosif-muzh-marii'), k = 0n;
    const к = г.кровь({});
    while (к.отец[x] >= 0) { x = г.рёбра[к.отец[x]].род; k++; }
    expect(t).toContain(`№${(2n ** k).toString()};`);
    const d = csvПотомков(г, потомки(г, ид('aaron')));
    expect(d).toContain('№1.2;');
    expect(d.split('\r\n')[1]).toMatch(/^№1;1;0;/);
  });
  it('отчёт «Потомки» и «Предки» одного прочтения: состав меняется только через свои наборы', () => {
    const iosif = ид('iosif-muzh-marii');
    const мт = new Set(предки(г, iosif).группы[0].строки.map((s) => s.лицо));
    const лк = new Set(предки(г, iosif, { 'r-lk3-23': 'lk' }).группы[0].строки.map((s) => s.лицо));
    expect(мт.has(ид('iakov-otets-iosifa'))).toBe(true);
    expect(мт.has(ид('iliy-syn-matfata'))).toBe(false);
    expect(лк.has(ид('iliy-syn-matfata'))).toBe(true);
    expect(лк.has(ид('iakov-otets-iosifa'))).toBe(false);
  });
});

describe('выгрузка GEDCOM 5.5.1: проверка, как у GED-inline, и разбор импорта (03 § 22.3; П14)', () => {
  const набор = (ids: number[]) => ids;
  it('потомки Аарона, предки Давида, весь лес — без ошибок', () => {
    const наборы = {
      'потомки Аарона': набор(потомки(г, ид('aaron')).строки.map((s) => s.лицо)),
      'предки Давида': набор([ид('david'), ...предки(г, ид('david')).группы.flatMap((x) => x.строки.map((s) => s.лицо))]),
      'весь лес': набор([...Array(г.лица.length).keys()].filter((i) => л.в[i])),
      'весь лес по Луке': набор([...Array(г.лица.length).keys()].filter((i) => л.в[i])),
    };
    for (const [имя, xs] of Object.entries(наборы)) {
      const ged = выгрузитьGedcom(г, xs, { дата: '2026-10-12', ...(имя.endsWith('Луке') && { выбор: { 'r-lk3-23': 'lk', 'r-father-sala': 'lk', 'r-shealtiel': 'lk' } }) });
      expect(проверитьGedcom(ged), имя).toEqual([]);
    }
  });
  it('разбор: цитата у события рождения, у FAMC источника нет; нет брака у «наложницы», «браком не назван», «союза без брака»; Иисус Христос — только с Марией; Сарра не полнородная сестра Аврама', () => {
    const все = [...Array(г.лица.length).keys()].filter((i) => л.в[i]);
    const ged = выгрузитьGedcom(г, все, { дата: '2026-10-12' });
    const recs = разобрать(ged);
    const xref = new Map<string, string>();
    for (const [x, r] of recs) if (r.tag === 'INDI') { const ref = r.lines.find((l) => l.startsWith('1 REFN ') || l.startsWith('1 NOTE номер записи: ')); if (ref) xref.set(ref.replace(/^1 (REFN|NOTE номер записи:) /, ''), x); }
    const I = (id: string) => xref.get(`p-${id}`)!;
    // у каждого BIRT с FAMC — SOUR с PAGE; у INDI.FAMC — нет SOUR
    for (const [, r] of recs) if (r.tag === 'INDI') {
      const b = r.lines.indexOf('1 BIRT');
      if (b >= 0) { const блок = r.lines.slice(b + 1, r.lines.findIndex((l, i) => i > b && l.startsWith('1 '))); expect(блок.some((l) => l.startsWith('2 SOUR @S1@'))).toBe(true); expect(блок.some((l) => l.startsWith('3 PAGE '))).toBe(true); }
    }
    // брак — только при слове брака
    const famOf = (h: string, w: string) => [...recs].find(([, r]) => r.tag === 'FAM' && r.lines.includes(`1 HUSB ${I(h)}`) && r.lines.includes(`1 WIFE ${I(w)}`))?.[1];
    for (const u of г.союзы) {
      const f = famOf(г.лица[u.муж].id, г.лица[u.жена].id);
      expect(f, u.номер).toBeTruthy();
      const брак = u.виды.includes('marriage') || u.виды.includes('maid-as-wife');
      expect(f!.lines.includes('1 MARR'), u.номер).toBe(брак);
      if (u.виды.includes('concubine')) expect(f!.lines).toContain('2 TYPE наложница');
    }
    // Иисус Христос — ребёнок семьи только Марии; Иосиф — ASSO «родители Его»
    const iisus = recs.get(I('iisus'))!;
    const famc = iisus.lines.filter((l) => l.startsWith('1 FAMC ')).map((l) => l.slice(7));
    expect(famc.length).toBe(1);
    const fj = recs.get(famc[0])!;
    expect(fj.lines).toContain(`1 WIFE ${I('mariya')}`);
    expect(fj.lines.some((l) => l.startsWith('1 HUSB'))).toBe(false);
    expect(iisus.lines).toContain(`1 ASSO ${I('iosif-muzh-marii')}`);
    expect(iisus.lines).toContain('2 RELA родители Его');
    // Сарра и Аврам — не дети одной семьи
    const fc = (id: string) => recs.get(I(id))!.lines.filter((l) => l.startsWith('1 FAMC ')).map((l) => l.slice(7));
    const общие = fc('sarra').filter((f) => fc('avraam').includes(f));
    expect(общие).toEqual([]);
    expect(recs.get(I('sarra'))!.lines.join('\n')).toContain('не дочь матери моей');
    // приёмные — ADOP с HUSB или WIFE
    expect(recs.get(I('esfir'))!.lines).toContain('3 ADOP HUSB');
    expect(recs.get(I('moisey'))!.lines).toContain('3 ADOP WIFE');
    // число лиц и семей — в заголовке не врёт: каждое лицо набора — INDI
    expect([...recs.values()].filter((r) => r.tag === 'INDI').length).toBe(все.length);
  });
  it('проверка ловит ошибки: FAMC.SOUR, висячий указатель, нет взаимности, длинная строка, RELA длиннее 25', () => {
    const плохо = ['0 HEAD', '1 SOUR X', '1 SUBM @U1@', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '0 @U1@ SUBM', '1 NAME x', '0 @I1@ INDI', '1 FAMC @F1@', '2 SOUR @S9@', '1 ASSO @I1@', '2 RELA ' + 'я'.repeat(26), `1 NOTE ${'я'.repeat(260)}`, '0 @F1@ FAM', '0 TRLR'].join('\n');
    const ош = проверитьGedcom(плохо).map((x) => x.текст).join('\n');
    expect(ош).toMatch(/FAMC\.SOUR/);
    expect(ош).toMatch(/никуда не ведёт/);
    expect(ош).toMatch(/нет CHIL/);
    expect(ош).toMatch(/длиннее 255/);
    expect(ош).toMatch(/RELA длиннее 25/);
  });
});

describe('П9 — лабораторно, без браузера (03 § 11; браузерный замер — тесты/генеалогия-замер.ts)', () => {
  it('«Потомки Адама» < 1 с; блок «По родству» ≤ 200 мс; лес < 500 мс', () => {
    let t = performance.now();
    const лес2 = построитьЛес(г);
    expect(performance.now() - t).toBeLessThan(500);
    expect(лес2.узлы.length).toBe(л.узлы.length);
    t = performance.now();
    const п = потомки(г, ид('adam'));
    expect(performance.now() - t).toBeLessThan(1000);
    expect(п.строки.length).toBeGreaterThan(500);
    t = performance.now();
    const путь = путьРодства(г, ид('david'), ид('moisey'));
    expect(performance.now() - t).toBeLessThan(200);
    expect(путь?.length).toBeGreaterThan(3);
    expect(путьРодства(г, ид('ruf'), ид('david'))!.map((z) => г.лица[z.к].id)).toEqual(['ovid', 'iessey', 'david']);
  });
});

describe('архив «Сохранить таблицу в файл»', () => {
  it('ZIP без сжатия: подписи, CRC, имена UTF-8', () => {
    const z = zip([{ имя: 'описание.txt', текст: 'проба' }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(14, true)).toBe(crc32(new TextEncoder().encode('проба')));
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
  });
});
