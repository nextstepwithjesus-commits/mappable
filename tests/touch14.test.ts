/**
 * Этап 14, S4 «Карточки, касание, доступность» (docs/ui-review/STAGE14.md, решения 150–157): правила без браузера.
 *  — 154: касание имени (рамка не ниже 24 px) — это лицо; щипок — одна ось только в секторе 12° (tests/view-axes.test.ts);
 *  — 150: снятие выбора сворачивает карточку во вкладку; выбор изнутри листа и «назад» держат положение листа;
 *  — 155: шапка листа — высота краткой карточки, под данными неба не меньше 140 px;
 *  — 151: одна фраза родства — уровень, шаг линии, «по закону», тёзки, отношение к выбранному;
 *  — 152: ссылки строки «Год» — в записи данных для вклейки;
 *  — 156: слова команд — без «Показать на небе»;
 *  — 157: тон связи в tools/contrast.ts — тот же, что на холсте.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nameAt, NAME_TAP, pileText, trailLinksText } from '../src/ui/sky/input.ts';
import { PEEK_H, PEEK_MIN, SKY_DATA_MIN, peekFor, stopForNewSelection, stopsFor } from '../src/ui/sheet.ts';
import { readingAfter } from '../src/ui/card/reading.ts';
import { kinLabel, kinMarks, kinOf, kinPhrase } from '../src/ui/linkwords.ts';
import { kinNamesakes, kinRows, relationsOf } from '../src/ui/card/kinrows.ts';
import { refOfText, refsInText } from '../src/ui/sky/DotCard.tsx';
import { cmdLabel } from '../src/ui/top/Search.tsx';
import { LINK_TONE } from '../src/render/trails.ts';
import type { LinkKey } from '../src/engine/linkkey.ts';
import type { LabelBox } from '../src/render/labels.ts';

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const nb = (s: string) => s.replace(/[  ]/g, ' ').replace(/[⁠­]/g, '');

describe('решение 154: касание имени', () => {
  const boxes: LabelBox[] = [
    { kind: 'star', text: 'Гад', id: 'gad', x: 100, y: 100, w: 18, h: 14 },
    { kind: 'star', text: 'Асир', id: 'asir', x: 100, y: 118, w: 30, h: 14 },
    { kind: 'sticky', text: '‹ Евер', id: 'ever', x: 0, y: 200, w: 40, h: 14 },
    { kind: 'plate', text: 'мать', id: 'valla', x: 300, y: 300, w: 30, h: 14 },
  ];
  it(`рамка имени — не ниже ${NAME_TAP} px и по ширине; ближе к середине строки — то имя`, () => {
    expect(NAME_TAP).toBe(24);
    expect(nameAt(boxes, 109, 107)).toBe('gad');
    // короткое имя «Гад» (18 px): касание правее текста, но в поле 24 px — его
    expect(nameAt(boxes, 120, 107)).toBe('gad');
    // между строками Гада и Асира (поля по 24 px перекрываются) — ближе к середине строки Асира
    expect(nameAt(boxes, 110, 120)).toBe('asir');
    expect(nameAt(boxes, 110, 150)).toBe(null);
    // имя у кромки «‹ Евер» — тоже лицо; подпись роли и пометы — нет
    expect(nameAt(boxes, 20, 207)).toBe('ever');
    expect(nameAt(boxes, 310, 307)).toBe(null);
  });
  it('мышью — только сама рамка текста (поле пальца не нужно)', () => {
    expect(nameAt(boxes, 120, 107, false)).toBe(null);
    expect(nameAt(boxes, 105, 107, false)).toBe('gad');
  });
  it('скопление семьи «+N» говорит словами родства, кто в нём (решение 142)', () => {
    const sky = { pilesNow: () => [{ id: 'iakov', members: ['iakov', 'ruvim', 'simeon', 'leviy', 'dina'] }] };
    const t = nb(pileText(sky, 'iakov'));
    expect(t).toMatch(/^4: сыновья и дочь — щёлкните: ближайшая родня$/);
  });
  it('участок следа с несколькими связями — подсказка фразой родства (решение 159)', () => {
    const u = relationsOf('noy');
    const keys = ['sim', 'kham', 'iafet'].map((k) => u.get(k)!.key);
    expect(nb(trailLinksText('noy', keys))).toBe('Связи дальше по следу: Сим — сын; Хам — сын; Иафет — сын — щёлкните, чтобы выбрать');
  });
});

describe('решения 150, 155: лист телефона', () => {
  it('положение листа: запись истории, затем выбор изнутри листа, затем низкий экран, касание звезды, 55 %', () => {
    const now = 10_000;
    expect(stopForNewSelection({ stop: 'peek', at: now }, now, false, { history: 'full' })).toBe('full');
    expect(stopForNewSelection(null, now, false, { keep: 'peek' })).toBe('peek');
    expect(stopForNewSelection(null, now, true, { keep: 'half' })).toBe('half');
    expect(stopForNewSelection(null, now, true)).toBe('peek');
    expect(stopForNewSelection({ stop: 'peek', at: now - 10 }, now, false)).toBe('peek');
    expect(stopForNewSelection(null, now, false)).toBe('half');
    // мусор в записи истории — не положение
    expect(stopForNewSelection(null, now, false, { history: 'большой' })).toBe('half');
  });
  it('шапка листа — высота краткой карточки; под данными неба не меньше 140 px; не ниже 104', () => {
    expect(SKY_DATA_MIN).toBe(140);
    expect(PEEK_MIN).toBe(104);
    // телефон 390 × 844: место 740, рамка 44 — карточка 251 px как есть
    expect(peekFor(740, false, 251, 44)).toBe(251);
    // 200 %, 640 × 400: место 312, рамка 26 — не выше 312 − 26 − 140 = 146
    expect(peekFor(312, true, 151, 26)).toBe(146);
    expect(peekFor(312, true, 139, 26)).toBe(139);
    // места совсем нет — имя и годы всё же видны
    expect(peekFor(200, true, 151, 44)).toBe(PEEK_MIN);
    // карточка не измерена — прежние правила (H6)
    expect(peekFor(740, false)).toBe(PEEK_H);
    expect(stopsFor(740, false, 251, 44).peek).toBe(251);
    expect(stopsFor(740, false, 251, 44).half).toBe(Math.round(740 * 0.55));
  });
  it('снятие выбора: вкладка прежнего лица; «×» и закреплённая карточка — без вкладки; новый выбор её убирает', () => {
    const o = { closing: false, pinned: () => false, tab: null };
    expect(readingAfter('david', null, o)).toBe('david');
    expect(readingAfter('david', null, { ...o, closing: true })).toBe(null);
    expect(readingAfter('david', null, { ...o, pinned: (id: string) => id === 'david' })).toBe(null);
    expect(readingAfter('david', 'ruf', { ...o, tab: 'david' })).toBe(null);
    expect(readingAfter(null, null, { ...o, tab: 'david' })).toBe('david');
  });
  it('карточка у звезды и подсказка — резерв подписей (data-reserve), а лист сам ставит --sheet-peek', () => {
    expect(src('src/ui/sky/DotCard.tsx')).toMatch(/data-reserve="dot"/);
    expect(src('src/ui/sky/Tip.tsx')).toMatch(/data-reserve=\{visible \? 'tip' : undefined\}/);
    expect(src('src/ui/Folio.tsx')).toMatch(/setProperty\('--sheet-peek'/);
  });
});

describe('решение 151: одна фраза родства', () => {
  const role = (id: string, of: string) => relationsOf(of).get(id);
  it('уровень и шаг линии в «Родстве»: Мария, Иосиф, Салафиил, Каинан', () => {
    const ilii = role('iliy-otets-marii', 'mariya')!;
    expect(nb(kinLabel(kinPhrase('iliy-otets-marii', ilii.role, ilii.key)))).toBe('Илий — отец, толк.');
    const sister = role('mariya-kleopova', 'mariya')!;
    expect(nb(kinLabel(kinPhrase('mariya-kleopova', sister.role, sister.key, { namesake: kinNamesakes('mariya').has('mariya-kleopova') })))).toBe('Мария (Клеопова) — сестра, толк.');
    expect(role('iisus', 'iosif-muzh-marii')!.role).toBe('сын по закону');
    expect(role('iliy-otets-marii', 'iosif-muzh-marii')!.role).toBe('отец по Луке');
    expect(role('niriy', 'salafiil')!.role).toBe('отец по Луке');
    const ar = role('arfaksad', 'kainan-syn-arfaksada')!;
    expect(kinMarks(ar.key)).toEqual(['только у Луки']);
    expect(role('sala', 'kainan-syn-arfaksada')!.role).toBe('сын по Луке');
  });
  it('имя кнопки — «Лия — жена»; у тёзки — уточнение; вне показа — словами', () => {
    const liya = role('liya', 'iakov')!;
    expect(nb(kinLabel(kinPhrase('liya', liya.role, liya.key)))).toBe('Лия — жена');
    expect(nb(kinLabel(kinPhrase('liya', liya.role, liya.key, { outside: true })))).toBe('Лия — жена, вне показа');
    expect(nb(kinOf(kinPhrase('liya', liya.role, liya.key), 'iakov'))).toBe('жена Иакова');
    // все имена «Родства» Иакова знают своё отношение к нему
    for (const r of kinRows('iakov', null)) for (const p of r.parts) if (p.t === 'name') expect(p.role, p.id).toBeTruthy();
  });
  it('братья по одному родителю — «брат по отцу»; наложница — «наложница»', () => {
    expect(role('valla', 'iakov')!.role).toBe('наложница');
    expect(role('dan', 'iosif')!.role).toBe('брат по отцу');
  });
});

describe('решение 152: ссылки строки «Год» — кнопки с вклейкой', () => {
  it('ссылка из текста — в запись данных: книга без пробела, дефис', () => {
    expect(refOfText('1 Пар 3:17–18')).toBe('1Пар 3:17-18');
    expect(refsInText('по порядку перечисления, 1 Пар 3:17–18, выв.')).toEqual(['1Пар 3:17-18']);
    expect(refsInText('по числам Писания, Быт 5:3, расч.')).toEqual(['Быт 5:3']);
    expect(refsInText('оценка по поколениям, расч.')).toEqual([]);
  });
});

describe('решение 156: слова команд', () => {
  it('перелёт — «К звезде», отметки поиска — «Отметить на небе (N)», гость показа — «поставить на небо»', () => {
    expect(cmdLabel({ key: 'all-0', kind: 'all', ids: ['a', 'b', 'c'], group: true }, 0)).toBe('Отметить на небе (3)');
    const folio = src('src/ui/Folio.tsx');
    expect(folio).toMatch(/aria-label=\{outside \? 'К звезде на всём небе' : 'К звезде'\}/);
    expect(src('src/ui/Spread.tsx')).toMatch(/>\s*К звезде\s*</);
    expect(src('src/ui/sky/DotCard.tsx')).toMatch(/поставить на небо/);
  });
  it('запретные слова: «Показать на небе» и «На небе» больше не называют команду', () => {
    const files = ['src/ui/Folio.tsx', 'src/ui/Spread.tsx', 'src/ui/top/Search.tsx', 'src/ui/sky/DotCard.tsx', 'src/ui/sky/input.ts'];
    for (const f of files) {
      // без комментариев: в них старые слова — история решения
      const code = src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      // надпись кнопки или имя кнопки — запрещены; пояснение (title) «показать на небе ромбы союзов» — разрешено
      expect(code, f).not.toMatch(/>\s*(Показать на небе|На небе|Показать на всём небе|На всём небе)\s*</);
      expect(code, f).not.toMatch(/aria-label=\{?[`'"](Показать на небе|Показать на всём небе)/);
      expect(code, f).not.toMatch(/return '(Показать на небе)'/);
      expect(code, f).not.toMatch(/щёлкните, чтобы показать[`'"]/);
    }
  });
});

describe('решение 157: цвет по нарисованному', () => {
  it('тон связи в проверке контраста — тот же, что у холста', () => {
    const m = /const LINK_TONE = ([\d.]+);/.exec(src('tools/contrast.ts'));
    expect(Number(m?.[1])).toBe(LINK_TONE);
  });
  it('contrast.ts проверяет тританопию ветвей и тонкие линии', () => {
    const c = src('tools/contrast.ts');
    expect(c).toMatch(/\['tritan', CVD\.tritan\]/);
    expect(c).toMatch(/const THIN_DE = 20;/);
    expect(c).toMatch(/function peakCover/);
  });
});

void (null as unknown as LinkKey);
