/**
 * L5 (этап 7, круг 3): ввод на небе, меню звезды и подсказки — логика без браузера.
 *  — меню звезды: стрелки по рядам и пунктам (IX-83); сколько прокрутить карточку, чтобы выбор «Взять в работу» был виден
 *    целиком (VIS-82, MOB-74);
 *  — лента ловится, если указатель ближе к нити, чем к знаку и следу (MAP-28);
 *  — подсказка звезды: не больше трёх строк и без клавиш (IX-58, VIS-69), рождение одной строкой (MAP-53), разрыв «//»
 *    (MAP-51), год по порядку перечисления (UX-73, решение 41), счёт номера у бусины (UX-69, решение 39);
 *  — подсказка ленты словами, без стрелки (решение 54); эпоха служебной строки (UX-65);
 *  — клавиши-буквы (решение 48) и колесо с Shift (решение 47) в таблице «Клавиши»; пояснения флажков неба (UX-21).
 * Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect } from 'vitest';
import { byId, lines, models } from '../src/data/atlas.ts';
import { model } from '../src/state.ts';
import { menuMove, pickScroll } from '../src/ui/panels/Work.tsx';
import { RIBBON_R, countBook, ribbonReach } from '../src/ui/sky/input.ts';
import { BREAK_TEXT, birthSpanText, countText, epochGoText, orderNoteText, orderText, pickBarText, ribbonStepText, tipYears } from '../src/ui/sky/text.ts';
import { epochSpanText } from '../src/engine/years.ts';
import { starTipLines } from '../src/ui/sky/Tip.tsx';
import { isCharKey, LETTER_KEYS } from '../src/ui/keys.ts';
import { KEY_ROWS, POINTER_ROWS, isLetterRow } from '../src/ui/top/Keys.tsx';
import { SKY_HINTS } from '../src/ui/sky/Controls.tsx';

const flat = (s: string) => s.replace(/\u2060/g, '').replace(/\u00a0/g, ' ');
const nums = (s: string) => [...flat(s).matchAll(/\d+/g)].map((x) => Number(x[0]));
const m = models[0];
// model — вычисляемый сигнал: по умолчанию первая модель («масоретская, длинное пребывание»)
if (model.value.id !== m.id) throw new Error(`модель по умолчанию — ${model.value.id}`);

describe('меню звезды: стрелки по рядам и пунктам (IX-83)', () => {
  // ряды меню: «Только …, С семьёй», «С предками 1 2 3 все», «С потомками 1 2 3 все», флажок, «Скрыть потомков»
  const rows = [['only', 'family'], ['a1', 'a2', 'a3', 'aall'], ['d1', 'd2', 'd3', 'dall'], ['interp'], ['fold']];
  it('↓ и ↑ — к соседнему ряду, место в ряду сохраняется или ближайшее; по кругу', () => {
    expect(menuMove(rows, [0, 0], 'ArrowDown')).toEqual([1, 0]);
    expect(menuMove(rows, [1, 3], 'ArrowDown')).toEqual([2, 3]);
    expect(menuMove(rows, [2, 3], 'ArrowDown')).toEqual([3, 0]);
    expect(menuMove(rows, [4, 0], 'ArrowDown')).toEqual([0, 0]);
    expect(menuMove(rows, [0, 1], 'ArrowUp')).toEqual([4, 0]);
    expect(menuMove(rows, [2, 2], 'ArrowUp')).toEqual([1, 2]);
  });
  it('← и → — внутри ряда «1 2 3 все», по кругу; у ряда из одного пункта — на месте', () => {
    expect(menuMove(rows, [1, 0], 'ArrowRight')).toEqual([1, 1]);
    expect(menuMove(rows, [1, 3], 'ArrowRight')).toEqual([1, 0]);
    expect(menuMove(rows, [1, 0], 'ArrowLeft')).toEqual([1, 3]);
    expect(menuMove(rows, [3, 0], 'ArrowRight')).toEqual([3, 0]);
  });
  it('Home и End — первый и последний пункт; прочие клавиши — не меню', () => {
    expect(menuMove(rows, [2, 2], 'Home')).toEqual([0, 0]);
    expect(menuMove(rows, [0, 0], 'End')).toEqual([4, 0]);
    expect(menuMove(rows, [0, 0], 'Enter')).toBeNull();
    expect(menuMove(rows, [0, 0], 'KeyD')).toBeNull();
  });
});

describe('выбор «Взять в работу» целиком в видимой части карточки (VIS-82, MOB-74)', () => {
  it('виден целиком — карточка не прокручивается', () => {
    expect(pickScroll({ btnTop: 300, pickTop: 340, pickBottom: 700, top: 60, bottom: 780 })).toBe(0);
  });
  it('низ уходит под полосу времени — прокрутка ровно до края, кнопка остаётся видна', () => {
    // телефон: низ листа — 780 (верх полосы), выбор 355 px под кнопкой на 533
    const dy = pickScroll({ btnTop: 490, pickTop: 533, pickBottom: 888, top: 60, bottom: 780 });
    expect(dy).toBe(108);
    expect(490 - dy).toBeGreaterThanOrEqual(60);
  });
  it('кнопка и выбор вместе не помещаются — верх выбора к верху видимой части', () => {
    expect(pickScroll({ btnTop: 400, pickTop: 440, pickBottom: 900, top: 60, bottom: 460 })).toBe(380);
  });
  it('кнопка ушла вверх за край — карточка возвращает её вниз', () => {
    expect(pickScroll({ btnTop: 20, pickTop: 60, pickBottom: 400, top: 60, bottom: 780 })).toBe(-40);
  });
});

describe('лента или звезда под указателем (MAP-28)', () => {
  it('нить ловится не дальше 6 px и только если она ближе знака и следа', () => {
    expect(RIBBON_R).toBe(6);
    expect(ribbonReach(Infinity)).toBe(6);
    expect(ribbonReach(4)).toBeCloseTo(3.5);
    // указатель на самом знаке или следе — лицо, нить не ищется
    expect(ribbonReach(0)).toBe(0);
    expect(ribbonReach(0.3)).toBe(0);
  });
});

describe('подсказка звезды: три строки, без клавиш (IX-58, VIS-69)', () => {
  const sample = ['david', 'iessey', 'ovid', 'iokhaveda', 'amnon', 'adam', 'melkhisedek', 'ruf', 'avraam', 'moisey'];
  it('не больше трёх строк; третья — только через 700 мс, кроме счёта у бусины; клавиш нет', () => {
    for (const id of sample) {
      for (const more of [false, true]) {
        const t = starTipLines(id, { more });
        const lines = 2 + (t.extra ? 1 : 0);
        expect(lines, id).toBeLessThanOrEqual(3);
        if (!more) expect(t.extra, id).toBeNull();
        for (const s of [t.years, t.extra ?? '']) expect(s, id).not.toMatch(/\((D|C)\)|взять в работу|скрыть потомков|клавиш/i);
      }
    }
  });
  it('в режиме выбора второго лица первая строка — родство, а не имя (IX-22)', () => {
    expect(starTipLines('iessey', { more: false, kin: 'Иессей — отец Давида' }).head).toBe('kin');
    expect(starTipLines('iessey', { more: false }).head).toBe('name');
  });
  it('счёт номера у бусины — сразу и первым среди пояснений', () => {
    const t = starTipLines('david', { more: false, count: { book: 'Мф', n: 14 } });
    expect(t.kind).toBe('count');
    expect(flat(t.extra!)).toBe('«Мф 14» — 14-й в родословии Мф 1:2–16, считая от Авраама');
  });
});

describe('рождение одной строкой (MAP-53)', () => {
  const estimated = [...m.chrono.entries()].filter(([id, c]) => c.cls === 'estimated' && byId.has(id) && !c.named && birthSpanText(id));
  // этап 13, решение 96 (словарь дат): оценка шире 10 лет — «род. между 1805 и 1755 гг. до Р. Х.», без «ок.»; год
  // подсказки — те же слова, что в паспорте карточки (passportYears), с пометой «расч.»
  it('оценка без года смерти: «род. между 1805 и 1755 гг. до Р. Х. (расч.)» — как в паспорте', () => {
    expect(flat(tipYears('iokhaveda'))).toMatch(/^род\. между \d+ и \d+ гг\. до Р\. Х\.( .+)? \(расч\.\)$/);
    expect(flat(tipYears('iokhaveda'))).not.toMatch(/ок\./);
  });
  it('одна строка о рождении у каждой оценки; промежуток — тот же, что «Родился между …» и паспорт (решение 96)', () => {
    expect(estimated.length).toBeGreaterThan(100);
    for (const [id] of estimated.slice(0, 500)) {
      const t = flat(tipYears(id));
      expect(t.match(/род\./g)?.length ?? 0, id).toBeLessThanOrEqual(1);
      expect(t, id).not.toMatch(/Родил(ся|ась)/);
      // «выв.» у года не ставится: из порядка перечисления выводится очерёдность, а не год (решение 96)
      expect(t, id).toMatch(/\(расч\.\)$/);
      const b = birthSpanText(id);
      if (b) expect(nums(t.split('между')[1]).slice(0, 2), id).toEqual(nums(b));
      else expect(t, id).not.toMatch(/род\. между/);
    }
  });
  it('год по модели — с пометой «расч.»; время не установлено — без пометы', () => {
    expect(flat(tipYears('avraam'))).toMatch(/^\d+–\d+ гг\. до Р\. Х\. \(расч\.\)$/);
    expect(flat(tipYears('melkhisedek'))).toMatch(/^время не установлено/);
    expect(tipYears('melkhisedek')).not.toMatch(/расч/);
  });
});

describe('пояснения подсказки: разрыв «//», порядок перечисления (MAP-51, UX-73, решение 41)', () => {
  it('у лица с разрывом следа — «родословие, вероятно, называет не все поколения (выв.)»', () => {
    // этап 13: после исправления оценок (решение 101) Овид встал в позднее время судей и разрыва у него нет — берётся
    // первое лицо с разрывом следа
    const id = [...m.nodeByPerson.entries()].find(([, n]) => n.brk !== null && n.brk! < n.t1)?.[0];
    expect(id).toBeTruthy();
    const t = starTipLines(id!, { more: true });
    expect(t.kind).toBe('break');
    expect(flat(t.extra!)).toBe(flat(BREAK_TEXT));
    expect(BREAK_TEXT).toBe('родословие, вероятно, называет не все поколения (выв.)');
  });
  it('у ребёнка, чей год оценён по порядку, — «год оценён по порядку перечисления (ссылка), выв.»; «выв.» не дважды', () => {
    const t = starTipLines('amnon', { more: true });
    expect(t.kind).toBe('order');
    expect(flat(t.extra!)).toMatch(/^год оценён по порядку перечисления \(1 Пар 3:1–\d+\), выв\.$/);
    expect(t.years).not.toMatch(/выв\.|расч\./);
    expect(orderText('david')).toBeNull();
  });
  it('у сыновей Иакова ссылка — рассказ о рождениях, а не перечень', () => {
    const t = orderText('ruvim');
    if (t) expect(flat(t)).toMatch(/Быт 29:3\d/);
  });
  it('помета порядка у детей на небе объясняется подсказкой', () => {
    expect(flat(orderNoteText('1 Пар 2:13–15'))).toBe('Годы рождения этих детей оценены по порядку, в котором их называет 1 Пар 2:13–15, выв.');
  });
});

describe('номер у бусины в режиме «только линии» (UX-69; решение 39)', () => {
  it('Мф считает от Авраама: Авраам — 1-й, Давид — 14-й (Мф 1:17)', () => {
    const mt = new Map(lines.joseph.persons.filter((s) => s.mt).map((s) => [s.id, s.mt!]));
    expect(mt.get('avraam')).toBe(1);
    expect(mt.get('david')).toBe(14);
    expect(countBook('david', 14)).toBe('Мф');
    expect(flat(countText('Мф', 17))).toBe('«Мф 17» — 17-й в родословии Мф 1:2–16, считая от Авраама');
  });
  it('Лк считает от Иосифа вверх: Иосиф — 1-й (Лк 3:23), Илий — 2-й, Матфат — 3-й, Адам — 75-й (Лк 3:38)', () => {
    const lk = new Map([...lines.joseph.persons, ...lines.mary.persons].filter((s) => s.lk).map((s) => [s.id, s.lk!]));
    expect(lk.get('iliy-otets-marii')).toBe(2);
    expect(lk.get('matfat-lk3-24')).toBe(3);
    expect(lk.get('adam')).toBe(75);
    expect(countBook('adam', 75)).toBe('Лк');
    expect(countBook('nafan-syn-davida', 41)).toBe('Лк');
    expect(countBook('david', 99)).toBeNull();
    expect(flat(countText('Лк', 39))).toBe('«Лк 39» — 39-й в родословии Лк 3:23–38, считая от Иосифа');
  });
});

describe('подсказка ленты — родство словами (решение 54)', () => {
  it('«Давид, отец; Соломон, сын (Мф 1:6)» — имена в именительном, без стрелки', () => {
    expect(flat(ribbonStepText('joseph', 'david', 'solomon'))).toBe('Давид, отец; Соломон, сын (Мф 1:6)');
    expect(flat(ribbonStepText('mary', 'david', 'nafan-syn-davida'))).toBe('Давид, отец; Нафан, сын (Лк 3:31)');
  });
  it('пометы шага: по закону, толкование, у Мф опущен, только у Лк; мать — «мать»', () => {
    expect(flat(ribbonStepText('joseph', 'iosif-muzh-marii', 'iisus'))).toBe('Иосиф, отец по закону; Иисус Христос, сын (Мф 1:16)');
    expect(flat(ribbonStepText('mary', 'iliy-otets-marii', 'mariya'))).toBe('Илий, отец; Мария, дочь (Лк 3:23), толк.');
    expect(flat(ribbonStepText('mary', 'mariya', 'iisus'))).toMatch(/^Мария, мать; Иисус Христос, сын \(Лк /);
    expect(flat(ribbonStepText('joseph', 'ioram-syn-iosafata', 'okhoziya-syn-iorama'))).toMatch(/^Иорам, отец; Охозия, сын \(4 Цар 8:24\); у Мф опущен$/);
    expect(flat(ribbonStepText('mary', 'arfaksad', 'kainan-syn-arfaksada'))).toBe('Арфаксад, отец; Каинан, сын (Лк 3:36); только у Лк');
  });
  it('Лк 3 как второе родословие Иосифа: «Илий, отец; Иосиф, сын (Лк 3:23)» — прямо по тексту', () => {
    expect(flat(ribbonStepText('mary', 'iliy-otets-marii', 'iosif-muzh-marii', true))).toBe('Илий, отец; Иосиф, сын (Лк 3:23)');
  });
  it('ни у одного шага обеих линий нет стрелки, у каждого — стих', () => {
    for (const line of ['joseph', 'mary'] as const) {
      const ps = lines[line].persons;
      for (let k = 0; k + 1 < ps.length; k++) {
        const t = ribbonStepText(line, ps[k].id, ps[k + 1].id);
        if (!byId.has(ps[k].id) || !byId.has(ps[k + 1].id)) continue;
        expect(t, `${ps[k].id} ${ps[k + 1].id}`).not.toMatch(/[→←]/);
        expect(t, `${ps[k].id} ${ps[k + 1].id}`).toMatch(/\(.+\d:\d.*\)/);
      }
    }
  });
});

describe('строки неба', () => {
  it('строка выбора второго лица короче прежней и без имени, если падеж не выводится (IX-81)', () => {
    expect(pickBarText('kinship', 'david')).toBe('Родство с Давидом: выберите второе лицо на небе или через поиск');
    expect(pickBarText('spread', 'ruf')).toBe('Разворот с Руфью: выберите второе лицо на небе или через поиск');
    // вместе с «— отменить (Esc)» — не длиннее 85 знаков (≈ 560 px кеглем органов; ширину меряет tools/accept/input3.ts)
    expect(`${pickBarText('kinship', 'david')} — отменить (Esc)`.length).toBeLessThanOrEqual(85);
  });
  it('эпоха в служебной строке: «Эпоха «Единое царство»: 1050–931 гг. до Р. Х.; щёлкните — небо покажет эпоху» (UX-65)', () => {
    // этап 13, решения 96 и 99: годы границ — словарём дат (engine/years.ts, epochSpanText), «ок.» — у оценочной границы
    for (const e of m.epochs.filter((x) => x.end < 0)) {
      const t = flat(epochGoText(e));
      expect(t, e.id).toBe(flat(`Эпоха «${e.name}»: ${epochSpanText(e)}; щёлкните — небо покажет эпоху`));
      expect(t, e.id).toMatch(/^Эпоха «[^»]+»: (ок\. )?\d+/);
      expect(t, e.id).not.toMatch(/\.\./);
    }
    const king = m.epochs.find((x) => !x.startEst && !x.endEst && x.end < 0);
    if (king) expect(flat(epochGoText(king))).toMatch(/: \d+–\d+ гг\. до Р\. Х\.;/);
  });
});

describe('клавиши-буквы и колесо (решения 47, 48; WCAG 2.1.4)', () => {
  const key = (key: string, code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, code, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('одиночные буквы, цифры и знаки — клавиши-буквы; «/», «?», «+», «−», пробел, стрелки, Enter, Escape — нет', () => {
    for (const [k, c] of [['e', 'KeyE'], ['у', 'KeyE'], ['l', 'KeyL'], ['F', 'KeyF'], ['в', 'KeyD'], ['c', 'KeyC'], ['j', 'KeyJ'], ['[', 'BracketLeft'], ['ъ', 'BracketRight'], [',', 'Comma'], ['ю', 'Period'], ['0', 'Digit0']])
      expect(isCharKey(key(k, c)), c).toBe(true);
    for (const [k, c] of [['/', 'Slash'], ['.', 'Slash'], ['?', 'Slash'], ['?', 'Digit7'], ['=', 'Equal'], ['+', 'Equal'], ['-', 'Minus'], ['+', 'NumpadAdd'], [' ', 'Space'], ['ArrowLeft', 'ArrowLeft'], ['Enter', 'Enter'], ['Escape', 'Escape'], ['Home', 'Home'], ['F10', 'F10']])
      expect(isCharKey(key(k, c)), `${k} ${c}`).toBe(false);
    expect(isCharKey(key('d', 'KeyD', { ctrlKey: true }))).toBe(false);
    expect(isCharKey(key('d', 'KeyD', { altKey: true }))).toBe(false);
    expect(LETTER_KEYS).toBe('toledot:letterKeys');
  });
  it('в таблице «Клавиши» выключаемые строки — буквы и знаки; «/», «?», «+ −», «0 Home», стрелки — нет', () => {
    const off = KEY_ROWS.filter(isLetterRow).map((r) => r.keys.map((k) => k.en).join(' '));
    for (const k of ['F', '[', ']', ', .', 'J K', 'E', 'L', 'D', 'C']) expect(off).toContain(k);
    for (const r of KEY_ROWS.filter((r) => !isLetterRow(r))) expect(r.keys.every((k) => k.en.length === 1 && !'/?+−←→↑↓'.includes(k.en)) && !r.mod).toBe(false);
    expect(off).not.toContain('/');
    expect(off).not.toContain('0 Home');
  });
  it('Shift + колесо — сдвиг по времени, Ctrl + Shift + колесо — растяжение (решение 47)', () => {
    const row = (how: string) => POINTER_ROWS.find((r) => r.how === how)?.what ?? '';
    expect(row('Shift + колесо')).toMatch(/^сдвиг по времени/);
    expect(row('Ctrl + Shift + колесо')).toBe('растянуть или сжать только время');
    expect(row('Alt + колесо')).toMatch(/высоту строк/);
  });
});

describe('пояснения флажков и переключателя неба (UX-21)', () => {
  it('у каждого — строка без прописных подписей, стрелок и точек-разделителей', () => {
    for (const [k, t] of Object.entries(SKY_HINTS)) {
      expect(t.length, k).toBeGreaterThan(20);
      expect(t, k).not.toMatch(/[→·]|[А-ЯЁ]{3,}/);
    }
    // этап 11 (решение 81): показ «Линии Мессии» выбирает строка показа и лист «Показ» (src/ui/panels/Show.tsx); «Всё небо»
    // у органов неба стало «Вписать» — пояснение называет кадр, а не показ. Этап 17 (решение 192, просьба владельца
    // 4 октября): у органов неба — флажок слоя лент «линии Мессии»; его пояснение говорит, что без лент связи видны
    // обычными линиями родства
    expect(SKY_HINTS.lines).toMatch(/^Ленты родословия Иисуса Христа/);
    expect(SKY_HINTS.lines).toMatch(/обычными линиями родства/);
    expect(SKY_HINTS.fit).toMatch(/^Вписать/);
  });
});
