/**
 * Круг 3, L8a — карточка: время и оболочка (docs/ui-review/card.md, vis.md, ux.md, ix.md; решения 23, 50, 64).
 * CARD-78: эпоха рождения — по году рождения в текущей модели; CARD-86: опора формулы § 13 не выведена из года лица;
 * CARD-87: народ в § 13 и в колофоне; CARD-90: согласование в § 23; VIS-63, 71, 74, 80 — логика подписей.
 * Без браузера; поведение в браузере — сценарии 420–434 (tools/accept/card3.ts). Нужна свежая сборка данных.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { persons, byId, models, loadModel, loadCard, type ModelData } from '../src/data/atlas.ts';
import { birthEpoch, epochAtYear, nameIn } from '../src/ui/card/shared.tsx';
import { formulaAnchors } from '../src/ui/card/Chrono.tsx';
import { isPeople, epochBandLabels } from '../src/ui/card/Masthead.tsx';
import { scopeReason, placeGroupLabels } from '../src/ui/card/Canon.tsx';
import { colophonText, sectionStates } from '../src/ui/Folio.tsx';
import { tabLabel } from '../src/ui/stack.ts';
import { buildSections } from '../src/ui/card/sections.tsx';
import { declinableForm, nameCase } from '../src/ui/text/ru.ts';
import { typo, NBSP } from '../src/ui/text/typo.ts';
import { toAstro, shownYears } from '../src/engine/years.ts';
import { cardSections } from './helpers/cards.ts';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const flat = (s: string | undefined) => (s ?? '').replace(/[\s ]+/g, ' ').replace(/ ([,.;:)])/g, '$1').replace(/⁠/g, '');
const dated = (m: ModelData, id: string) => ['exact', 'calculated'].includes(m.chrono.get(id)?.cls ?? '');
const anchored = (m: ModelData, id: string) => dated(m, id) || !!byId.get(id)?.active || !!byId.get(id)?.reign.length;

let short: ModelData;
beforeAll(async () => {
  // тома всех лиц: опоры формулы берут числа текста (возраст отца при рождении) из томов
  for (const p of persons) await loadCard(p.id);
  short = (await loadModel('mt-short'))!;
}, 240_000);

describe('CARD-78: эпоха рождения — по году рождения в текущей модели', () => {
  it('у всех лиц с годом рождения год лежит в границах названной эпохи — в модели по умолчанию и в «кратком пребывании»', () => {
    for (const m of [models[0], short]) {
      const bad: string[] = [];
      for (const p of persons) {
        const c = m.chrono.get(p.id);
        if (!c || c.cls === 'epochal' || isPeople(p.id)) continue;
        const ep = birthEpoch(p.id, c, m.epochs);
        if (!ep) {
          bad.push(`${p.id}: нет эпохи`);
          continue;
        }
        const first = m.epochs[0];
        const last = m.epochs[m.epochs.length - 1];
        const lo = ep === first ? -Infinity : toAstro(ep.start);
        const hi = ep === last ? Infinity : toAstro(ep.end);
        if (c.b < lo || c.b >= hi) bad.push(`${p.id}: ${c.b} вне «${ep.name}»`);
      }
      expect(bad, m.id).toEqual([]);
    }
  });
  it('Иессей: рождение ок. 1085 г. — эпоха «Судьи», а не «Единое царство» из данных; § 8 и § 13 говорят одно', async () => {
    const s = await cardSections('iessey');
    expect(flat(s.get(13))).toMatch(/^Эпоха рождения: Судьи \(/);
    expect(flat(s.get(8))).toMatch(/эпоха — Судьи/);
    expect(byId.get('iessey')!.epoch).toBe('united');
  });
  it('годы в строке § 13 «Эпоха рождения: … (a–b гг.)» заключают показанный год рождения', async () => {
    const m = models[0];
    const bad: string[] = [];
    for (const id of ['lot', 'salmon', 'saruiya', 'eleazar-syn-aarona', 'nadav', 'ifamar', 'sadok', 'iessey', 'david', 'moisey', 'iisus']) {
      if (!byId.has(id)) continue;
      const c = m.chrono.get(id)!;
      const ep = birthEpoch(id, c, m.epochs)!;
      const y = shownYears(c);
      if (!y) continue;
      // показанный год (оценка кратна 5) — в границах эпохи с точностью до шага оценки
      if (y.b < toAstro(ep.start) - 5 || y.b > toAstro(ep.end) + 5) bad.push(`${id}: ${y.b} вне ${ep.name}`);
    }
    expect(bad).toEqual([]);
  });
  it('у лица без годов (epochal) — эпоха из данных с подписью «Эпоха:»', async () => {
    expect(flat((await cardSections('melkhisedek')).get(13))).toMatch(/^Эпоха: Патриархи/);
    const m = models[0];
    expect(epochAtYear(m.epochs, toAstro(-1085)).id).toBe('judges');
  });
});

describe('CARD-86: опора формулы § 13 — только родственник, чей год не выведен из года лица', () => {
  it('по всем лицам: у лица с годом по числам текста опора — лицо с годом по числам текста; у оценки — лицо со своей опорой', () => {
    const m = models[0];
    const bad: string[] = [];
    for (const p of persons) {
      if (isPeople(p.id) || !m.chrono.get(p.id) || m.chrono.get(p.id)!.cls === 'epochal') continue;
      const own = dated(m, p.id);
      const { up, down } = formulaAnchors(p.id, m);
      for (const a of [up, down]) {
        if (!a) continue;
        if (own ? !dated(m, a.id) : !anchored(m, a.id)) bad.push(`${p.id} → ${a.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('Иисус: не «после матери, Марии» — основание года «во дни царя Ирода» (Мф 2:1)', async () => {
    const t = flat((await cardSections('iisus')).get(13));
    expect(t).not.toMatch(/после матери/);
    expect(t).toMatch(/Основание года рождения: родился «во дни царя Ирода»/);
    expect(t).toMatch(/Мф 2:1/);
  });
  it('Давид: «Родился за 30 лет до воцарения (2 Цар 5:4)», не «до сына, Амнона»; Моисей — от числа Исх 7:7', async () => {
    const d = flat((await cardSections('david')).get(13));
    expect(d).toMatch(/Родился за 30 лет до воцарения 2 Цар 5:4/);
    expect(d).not.toMatch(/Амнона/);
    const mo = flat((await cardSections('moisey')).get(13));
    expect(mo).toMatch(/^Эпоха рождения: Израиль в Египте \([^)]+\)\. Основание года рождения: «Моисей был восьмидесяти/);
    expect(mo).not.toMatch(/Гирсама/);
    // запись составителя, ставшая формулой, не повторяется ниже
    expect(mo.match(/Моисей был восьмидесяти/g)?.length).toBe(1);
  });
  it('числа текста в формуле — со стихами: Сиф (Быт 5:3; 5:6), Сарра — на 10 лет моложе мужа (Быт 17:17)', async () => {
    expect(flat((await cardSections('sif')).get(13))).toMatch(/Родился через 130 лет после отца, Адама, и за 105 лет до сына, Еноса\. Быт 5:3; 5:6/);
    expect(flat((await cardSections('sarra')).get(13))).toMatch(/Родилась через 10 лет после мужа, Авраама[;.].*Быт 17:17/);
  });
  it('Авиуд, сын Зоровавеля: опора — Зоровавель (годы служения, Езд 2:2), а не сын Елиаким, чей год выведен из той же цепочки', async () => {
    const t = flat((await cardSections('aviud-syn-zorovavelya')).get(13));
    expect(t).toMatch(/Родился примерно через \d+ лет после отца, Зоровавеля\. расч\./);
    expect(t).not.toMatch(/Елиакима/);
  });
  it('склонение «-иа» по форме текста «-ия» (1 Пар 3:1): «Далуии», а не «Далуиа»', () => {
    expect(nameIn('daluia', 'gen')).toBe('Далуии');
    expect(nameIn('daluia', 'acc')).toBe('Далуию');
    expect(declinableForm('Далуиа', ['Далуия'])).toBe('Далуия');
    // без формы на «-ия» имя на «-иа» по-прежнему не склоняется
    expect(nameCase('Иешуа', 'm', 'gen')).toBe('Иешуа');
    expect(declinableForm('Иешуа', [])).toBe('Иешуа');
  });
});

describe('CARD-87: народ в § 13 и в колофоне', () => {
  it('§ 13 у народа — во множественном числе, со стихом: «Названы в родословии после Мицраима, от которого произошли (Быт 10:13)»', async () => {
    const t = flat((await cardSections('ludim')).get(13));
    expect(t).toMatch(/Названы в родословии после Мицраима, от которого произошли Быт 10:13/);
    expect(t).not.toMatch(/после отца/);
  });
  it('колофон: § 8 и 14 народа — «не относятся к народу», а не «не составлены»', async () => {
    const m = models[0];
    const d = await loadCard('ludim');
    const out = buildSections('ludim', byId.get('ludim')!, d?.card ?? null, m, m.chrono.get('ludim'), '', d?.chrono ?? null);
    const st = sectionStates('ludim', out, d?.card ?? null);
    expect(st[14]).toBe('na');
    if (!out.has(8)) expect(st[8]).toBe('na');
    const col = flat(colophonText('ludim', st));
    expect(col).toMatch(/§ [\d,– ]*14[\d,– ]* не относятся к народу/);
    expect(col).not.toMatch(/не составлен[ыа]? — [^;]*\b14\b/);
  });
});

describe('CARD-90: § 23 — согласование и подлежащее', () => {
  it('«то же имя носит ещё одно лицо», «носят ещё 3 лица»', () => {
    const counts = new Map<string, number>();
    for (const p of persons) if (!p.unnamed) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    const two = persons.find((p) => !p.unnamed && p.kind !== 'people' && p.kind !== 'clan' && counts.get(p.name) === 2)!;
    expect(scopeReason(two.id)).toBe('то же имя носит ещё одно лицо');
    const four = persons.find((p) => !p.unnamed && p.kind !== 'people' && p.kind !== 'clan' && counts.get(p.name) === 4);
    if (four) expect(scopeReason(four.id)).toBe('то же имя носят ещё 3 лица');
  });
  it('«Имя названо в 992 стихах»; число стихов неотрывно от книги: «3 Цар (74)»', async () => {
    const t = (await cardSections('david')).get(23) ?? '';
    expect(t).toMatch(/^Имя названо в[\s\u00a0]\d+[\s\u00a0]стихах/);
    expect(t).toMatch(new RegExp(`3${NBSP}Цар${NBSP}\\(\\d+\\)`));
  });
});

describe('VIS-63: эпохи мини-шкалы — без многоточия', () => {
  const E = models[0].epochs;
  const measure = (t: string) => t.length * 7;
  it('эпоха рождения подписана всегда целиком и в пределах шкалы; прочие — только если слово помещается в полосу', () => {
    for (const w of [120, 200, 320, 460]) {
      for (const [t0, t1] of [
        [toAstro(-1200), toAstro(-900)],
        [toAstro(-2300), toAstro(-1800)],
        [toAstro(-60), toAstro(60)],
      ]) {
        const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
        const born = E.find((e) => toAstro(e.start) <= (t0 + t1) / 2 && (t0 + t1) / 2 < toAstro(e.end))!;
        const { bands, labels } = epochBandLabels(E, x, w, born.id, measure);
        for (const l of labels) {
          expect(l.text).not.toMatch(/…/);
          expect(E.some((e) => e.name === l.text)).toBe(true);
        }
        const own = labels.find((l) => l.text === born.name);
        expect(own, `${w}: ${born.name}`).toBeTruthy();
        if (own!.w <= w - 4) expect(own!.x >= 0 && own!.x + own!.w <= w).toBe(true);
        for (const l of labels) {
          if (l === own) continue;
          const band = bands.find((b) => b.name === l.text)!;
          expect(l.x + l.w).toBeLessThanOrEqual(band.b);
          expect(l.x + l.w + 8 <= own!.x || l.x >= own!.x + own!.w + 8).toBe(true);
        }
      }
    }
  });
});

// этап 12, решение 91: строки стопки нет — имена стоят во вкладках; смысл прежний: имя целиком, без многоточия
describe('VIS-71, UX-75: имя во вкладке — целиком, без многоточия; уточнение — целыми словами', () => {
  it('имя не режется, уточнение не обрывается посреди слова', () => {
    for (const id of ['ruf', 'david', 'solomon', 'iosif-muzh-marii', 'doch-faraona-zhena-solomona', 'naama']) {
      const l = tabLabel(id);
      expect(l.name).not.toMatch(/…/);
      if (l.dis?.endsWith('…')) expect(l.full.startsWith(`${l.name}, ${l.dis.slice(0, -1)}`)).toBe(true);
    }
  });
});

describe('VIS-74: переносы не разрывают книгу и число, отношение', () => {
  it('«3 Цар (74)», «Быт (1)» — неразрывно; «4,5 : 1» — неразрывно; идемпотентно', () => {
    const t = typo('больше всего — 1 Цар (234), 3 Цар (74), Быт (1)');
    expect(t).toContain(`3${NBSP}Цар${NBSP}(74)`);
    expect(t).toContain(`Быт${NBSP}(1)`);
    const r = typo('Пороги: текст — 4,5 : 1, плоскости — 1,15 и 1,1 : 1.');
    expect(r).toContain(`4,5${NBSP}:${NBSP}1`);
    expect(r).toContain(`1,1${NBSP}:${NBSP}1`);
    expect(typo(t)).toBe(t);
    expect(typo(r)).toBe(r);
    // ссылка на стих не меняется
    expect(typo('Быт 5:3')).toBe(`Быт${NBSP}5:3`);
  });
});

describe('VIS-80: подписи групп книг — полными словами в два ряда', () => {
  it('подпись начинается над своей группой, в ряду подписи не задевают друг друга и не выходят за полосу; при 320 px — не больше трёх рядов', () => {
    const measure = (t: string) => t.length * 7;
    const names = ['Закон', 'Исторические', 'Учительные', 'Пророки', 'Евангелия', 'Деяния', 'Послания', 'Откровение'];
    const books = [5, 12, 5, 17, 4, 1, 21, 1];
    for (const W of [254, 324, 350, 430]) {
      const unit = (W - 7 * 4 - 6) / 66;
      let x = 0;
      const cells = books.map((n, i) => {
        if (i === 4) x += 6;
        const c = { a: Math.round(x), b: Math.round(x + n * unit) };
        x += n * unit + 4;
        return c;
      });
      const places = placeGroupLabels(cells, names.map(measure), W);
      const rows: [number, number][][] = [[], [], []];
      places.forEach((pl, i) => {
        if (!pl) return;
        expect(pl.x).toBeGreaterThanOrEqual(cells[i].a);
        expect(pl.x).toBeLessThanOrEqual(Math.max(cells[i].a, cells[i].b - Math.min(pl.w, cells[i].b - cells[i].a)));
        expect(pl.x + pl.w).toBeLessThanOrEqual(W);
        for (const [a, b] of rows[pl.row]) expect(pl.x >= b + 8 || pl.x + pl.w + 8 <= a).toBe(true);
        rows[pl.row].push([pl.x, pl.x + pl.w]);
      });
      // шесть больших групп подписаны всегда (у одноклеточных «Деяний» и «Откровения» места может не быть); на листе
      // карточки (≥ 350 px) хватает двух рядов
      for (const i of [0, 1, 2, 3, 4, 6]) expect(places[i], `${W}: ${names[i]}`).not.toBeNull();
      if (W >= 350) expect(places.every((pl) => !pl || pl.row < 2), `${W}`).toBe(true);
    }
  });
  it('в коде нет сокращений «Зак.», «Уч.»', () => {
    const src = readFileSync(join(__dirname, '../src/ui/card/Canon.tsx'), 'utf8');
    expect(src).not.toMatch(/'Зак\.'|'Уч\.'|'Ист\.'|'Прор\.'/);
  });
});

describe('оболочка: CSS (VIS-62, VIS-66, VIS-70, VIS-79)', () => {
  const f = css('folio.css');
  it('VIS-62: перед ссылками — пробел, а не поле 4 px', () => {
    expect(/(^|\n)\.ref\s*\{[^}]*margin-left:\s*4px/.test(f)).toBe(false);
    expect(/(^|\n)\.refs\s*\{[^}]*margin-left:\s*4px/.test(f)).toBe(false);
    expect(f).toMatch(/\.refs::before\s*\{\s*content:\s*' ';/);
  });
  it('VIS-66: рейка — с 12 px от края листа, за ручкой границы области', () => {
    const rail = /(^|\n)\.folio \.rail\s*\{([^}]*)\}/.exec(f)![2];
    expect(rail).toMatch(/margin:\s*26px 0 0 calc\(12px - var\(--folio-pl\)\)/);
  });
  it('VIS-70: колонка подписей паспорта — постоянной ширины', () => {
    const b = /(^|\n)\.passport\s*\{([^}]*)\}/.exec(f)![2];
    // 88 px при обычном кегле (5,5rem = 88 px); при крупном шрифте читателя колонка растёт вместе с ним (MOB-71)
    expect(b).toMatch(/grid-template-columns:\s*max\(88px, 5\.5rem\) minmax\(0, 1fr\)/);
  });
  it('VIS-79: на узком листе — «На небе», полное название — в имени кнопки', () => {
    // порог 480 px (был 440): четвёртая команда стала длиннее («Добавить в набор», этап 11) — на 1024 × 768 лист в 450 px
    // иначе переносил команды во вторую строку (сценарий 421)
    // и у «Добавить в набор» — «В набор» (то же правило, список селекторов)
    expect(f).toMatch(/@container folio \(max-width: 480px\)\s*\{\s*\.folio \.actions \.show-on-sky \.full\s*[,{][^}]*display:\s*none;/);
    const src = readFileSync(join(__dirname, '../src/ui/Folio.tsx'), 'utf8');
    expect(src).toMatch(/aria-label="Показать на небе"/);
  });
});
