/**
 * Тексты панели «Родство» на настоящих данных атласа (задача A7, docs/ui-review/README.md).
 * Строка родства либо верна, грамматична и подтверждена данными, либо её нет.
 */
import { describe, it, expect } from 'vitest';
import { graph, byId } from '../src/data/atlas.ts';
import { relate, foldChain, genitive, accusative, type Relation } from '../src/engine/kinship.ts';

const shown = (rs: Relation[]) => rs.filter((r) => !r.more);
/** Ссылки и «в 34-м колене» во фразе связаны неразрывными пробелами; для сравнения — обычные. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');
const sentences = (rs: Relation[]) => rs.map((r) => plain(r.sentence));
const first = (a: string, b: string) => plain(relate(graph, a, b)[0].sentence);
const ids = (r: Relation) => r.chain.map((c) => c.id);
const viaJoseph = (r: Relation) => r.steps.some((s) => s.from === 'iosif-muzh-marii' && s.to === 'iisus') || r.steps.some((s) => s.from === 'iisus' && s.to === 'iosif-muzh-marii');
const viaMary = (r: Relation) => r.steps.some((s) => s.from === 'mariya' && s.to === 'iisus');

describe('родство на данных атласа', () => {
  it('Руфь — прабабушка Давида: одна строка, без «общего предка», звенья с терминами', () => {
    const rs = relate(graph, 'ruf', 'david');
    expect(sentences(rs)).toEqual(['Руфь — прабабушка Давида']);
    const [r] = rs;
    expect(r.lineal).toBe(true);
    expect(r.ancestor).toBeNull();
    expect(ids(r)).toEqual(['ruf', 'ovid', 'iessey', 'david']);
    expect(r.chain.slice(1).map((c) => c.term)).toEqual(['сын', 'сын', 'сын']);
    expect(r.sources[0]).toMatch(/^Руф 4:/);
  });

  it('Руфь — Иисус Христос: два пути с различимыми заголовками; путь через Иосифа — по закону, не по толкованию', () => {
    const rs = relate(graph, 'ruf', 'iisus');
    const main = shown(rs);
    expect(main.length).toBe(2);
    expect(new Set(sentences(main)).size).toBe(2);
    for (const r of rs) {
      expect(plain(r.sentence).startsWith('Руфь — прародительница Иисуса Христа')).toBe(true); // женский термин, полное имя в падеже
      expect(plain(r.sentence)).not.toMatch(/предок|Иисуса(?! Христа)/);
      expect(r.lineal).toBe(true);
      expect(r.ancestor).toBeNull(); // «общий предок» — только при боковом родстве
    }
    const mt = main.find((r) => r.steps.some((s) => s.to === 'solomon' || s.from === 'solomon'))!;
    expect(mt).toBeDefined();
    expect(viaJoseph(mt)).toBe(true);
    expect(plain(mt.sentence)).toContain('через Соломона');
    expect(plain(mt.sentence)).toContain('по закону (Мф 1:16)');
    expect(plain(mt.sentence)).not.toContain('по толкованию');
    expect(mt.interpretive).toBe(false);
    expect(mt.sources[0]).toMatch(/^Мф 1:5-16$/);
    // равные по длине обходы свёрнуты в основной путь: Авия — внук Авессалома через мать Мааху; Зоровавель — сын Федаии по 1 Пар 3:19
    expect(mt.variants).toEqual([
      { ids: ['avessalom', 'maakha-doch-avessaloma'], refs: ['3Цар 15:2'] },
      { ids: ['fedaiya-syn-iekhonii'], refs: ['1Пар 3:18', '1Пар 3:19'] },
    ]);
    const other = main.find((r) => r !== mt)!;
    expect(plain(other.sentence)).toContain('через Нафана');
    // родословие Луки через Марию — «по толкованию» (Илий — отец Марии, Лк 3:23), длиннее кратчайшего больше чем на 2 — под «ещё N путей»
    const luke = rs.find((r) => viaMary(r) && r.steps.some((s) => s.to === 'nafan-syn-davida' || s.from === 'nafan-syn-davida'));
    expect(luke).toBeDefined();
    expect(luke!.more).toBe(true);
    expect(plain(luke!.sentence)).toContain('через Нафана');
    expect(plain(luke!.sentence)).toContain('по толкованию (Лк 3:23; 3:27)'); // Илий — отец Марии; Нирий — отец Салафиила
    expect(luke!.sources).toEqual(['Лк 3:23-32']);
    for (const r of rs) expect(plain(r.sentence).includes('по толкованию')).toBe(r.steps.some((s) => s.cert === 'interpretation' || s.claim === 'by-luke'));
  });

  it('пути длиннее кратчайшего больше чем на 2 поколения прячутся', () => {
    for (const [a, b] of [['ruf', 'iisus'], ['avraam', 'iisus'], ['adam', 'avraam']]) {
      const blood = relate(graph, a, b).filter((r) => r.kind === 'blood');
      const min = Math.min(...blood.map((r) => r.steps.length));
      for (const r of blood) if (r.steps.length > min + 2) expect(r.more).toBe(true);
      expect(blood.filter((r) => !r.more).length).toBeGreaterThan(0);
    }
  });

  it('Авраам — Иисус Христос: только прямая линия, без боковых путей; путь по Мф — по закону', () => {
    const rs = relate(graph, 'avraam', 'iisus');
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.lineal).toBe(true);
      expect(r.ancestor).toBeNull();
      expect(plain(r.sentence)).not.toContain('родственник');
      expect(plain(r.sentence).startsWith('Авраам — предок Иисуса Христа')).toBe(true);
    }
    const mt = rs.find((r) => viaJoseph(r) && r.steps.some((s) => s.to === 'solomon'))!;
    expect(mt.more).toBe(false);
    expect(plain(mt.sentence)).toContain('по закону (Мф 1:16)');
    expect(plain(mt.sentence)).not.toContain('по толкованию');
    // цепочка в 45 лиц сворачивается: три звена, «… ещё 39 …», три звена
    const folded = foldChain(mt.chain);
    expect(folded.length).toBe(7);
    expect(folded[3]).toEqual({ hidden: mt.chain.length - 6 });
    expect((folded[0] as { id: string }).id).toBe('avraam');
    expect((folded[6] as { id: string }).id).toBe('iisus');
    expect(mt.chain[mt.chain.length - 1].term).toBe('сын по закону');
  });

  it('Иоав — племянник Давида (формулировка ТЗ § 11.2, п. 5)', () => {
    const rs = relate(graph, 'ioav', 'david');
    expect(plain(rs[0].sentence)).toBe('Иоав — племянник Давида (сын его сестры Саруии, 1 Пар 2:16)');
    expect(ids(rs[0])).toEqual(['ioav', 'saruiya', 'david']);
    expect(rs[0].chain.slice(1).map((c) => c.term)).toEqual(['мать', 'брат']);
    expect(first('david', 'ioav')).toBe('Давид — дядя Иоава (брат его матери Саруии, 1 Пар 2:16)');
  });

  it('Давид — отец Авессалома: без боковых путей через Фарру', () => {
    const rs = relate(graph, 'david', 'avessalom');
    expect(sentences(rs)).toEqual(['Давид — отец Авессалома']);
    expect(first('avessalom', 'david')).toBe('Авессалом — сын Давида');
  });

  it('Мария — дочь Илия по толкованию (Лк 3:23)', () => {
    const rs = relate(graph, 'mariya', 'iliy-otets-marii');
    expect(sentences(rs)).toEqual(['Мария — дочь Илия, по толкованию (Лк 3:23)']);
    expect(rs[0].interpretive).toBe(true);
    expect(first('iliy-otets-marii', 'mariya')).toBe('Илий — отец Марии, по толкованию (Лк 3:23)');
  });

  it('законная связь называется законной, а не толкованием', () => {
    expect(first('iosif-muzh-marii', 'iisus')).toBe('Иосиф — законный отец Иисуса Христа (Мф 1:16)');
    expect(first('iisus', 'iosif-muzh-marii')).toBe('Иисус Христос — сын Иосифа по закону (Мф 1:16)');
    expect(first('mariya', 'iisus')).toBe('Мария — мать Иисуса Христа');
  });

  it('термин Писания помечается как слова Писания, вывод — нет', () => {
    const saruiya = relate(graph, 'david', 'saruiya')[0];
    expect(plain(saruiya.sentence)).toBe('Давид — брат Саруии');
    expect(saruiya.scripture).toEqual({ text: 'Саруия — сестра Давида', refs: ['1Пар 2:16'] });
    const amessay = relate(graph, 'amessay', 'ioav')[0]; // «двоюродный брат» выведен из 2 Цар 17:25
    expect(plain(amessay.sentence)).toBe('Амессай — двоюродный брат Иоава');
    expect(amessay.scripture).toBeUndefined();
  });

  it('родство лица с самим собой не выводится', () => {
    expect(relate(graph, 'david', 'david')).toEqual([]);
  });

  it('боковое родство собирается одной грамматичной фразой', () => {
    const rs = relate(graph, 'moisey', 'david');
    expect(rs.length).toBeGreaterThan(0);
    const [r] = rs;
    expect(r.lineal).toBe(false);
    expect(r.ancestor).not.toBeNull();
    // Моисей — потомок Левия и через мать Иохаведу (Чис 26:59), и через отца Амрама (Исх 6:16–20): два пути, различимые по лицу
    expect(plain(r.sentence)).toBe('Моисей — родственник Давида, через Иохаведу: общие предки — Иаков и Лия; 3 поколения вверх, не меньше 11 вниз');
    expect(r.ancestors).toEqual(['iakov', 'liya']);
    const main = shown(rs);
    expect(sentences(main)).toEqual([
      'Моисей — родственник Давида, через Иохаведу: общие предки — Иаков и Лия; 3 поколения вверх, не меньше 11 вниз',
      'Моисей — родственник Давида, через Амрама: общие предки — Иаков и Лия; 4 поколения вверх, не меньше 11 вниз',
    ]);
    for (const x of rs) expect(plain(x.sentence)).toMatch(/^Моисей — родственник Давида(, через [^:]+)?: общи(й предок|е предки) — [^;]+; (не меньше )?\d+ поколени(е|я|й) вверх, (не меньше )?\d+ вниз$/);
  });

  it('фразы всех родственных пар «родитель — ребёнок» собраны целиком', () => {
    let n = 0;
    for (const [child, edges] of graph.parentsOf) {
      for (const e of edges) {
        if (e.kind !== 'father' && e.kind !== 'mother') continue;
        const P = byId.get(e.parent)!;
        const C = byId.get(child)!;
        const up = relate(graph, child, e.parent, 1)[0];
        const down = relate(graph, e.parent, child, 1)[0];
        expect(up.sentence.startsWith(`${C.name} — `)).toBe(true);
        expect(up.sentence).toContain(` ${genitive(P.name, P.sex)}`);
        expect(down.sentence.startsWith(`${P.name} — `)).toBe(true);
        for (const s of [up.sentence, down.sentence]) expect(s).not.toMatch(/undefined|null|\s{2}|—\s*$|[,:;]\s*$/);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1500);
  });
});

describe('свёртка цепочки', () => {
  it('до 8 звеньев не сворачивается, длиннее — три, «ещё N», три', () => {
    const a = Array.from({ length: 8 }, (_, i) => i);
    expect(foldChain(a)).toEqual(a);
    const b = Array.from({ length: 45 }, (_, i) => i);
    expect(foldChain(b)).toEqual([0, 1, 2, { hidden: 39 }, 42, 43, 44]);
  });
});

describe('падежи имён', () => {
  it('склоняет составные и описательные имена целиком', () => {
    expect(genitive('Иисус Христос', 'm')).toBe('Иисуса Христа');
    expect(genitive('Иоанн Креститель', 'm')).toBe('Иоанна Крестителя');
    expect(genitive('Павел', 'm')).toBe('Павла'); // беглая гласная
    expect(genitive('Пётр', 'm')).toBe('Петра');
    expect(genitive('Наложница Манассии', 'f')).toBe('наложницы Манассии'); // описательное имя — со строчной, остаток сохраняется
    expect(genitive('Жена Лота', 'f')).toBe('жены Лота');
    expect(genitive('Дочь фараонова', 'f')).toBe('дочери фараоновой');
    expect(genitive('Овед-Едом', 'm')).toBe('Овед-Едома');
    expect(genitive('Бен-Амми', 'm')).toBe('Бен-Амми');
  });
  it('ставит винительный падеж после «через»', () => {
    expect(accusative('Соломон', 'm')).toBe('Соломона');
    expect(accusative('Иуда', 'm')).toBe('Иуду');
    expect(accusative('Мария', 'f')).toBe('Марию');
    expect(accusative('Ревекка', 'f')).toBe('Ревекку');
    expect(accusative('Руфь', 'f')).toBe('Руфь');
    expect(accusative('Илий', 'm')).toBe('Илия');
    expect(accusative('Павел', 'm')).toBe('Павла');
    expect(accusative('Дочь фараонова', 'f')).toBe('дочь фараонову');
  });
  it('звенья «по Луке» (Нирий → Салафиил, Каинан → Сала) — по толкованию, как в ТЗ § 3.2', () => {
    expect(plain(first('niriy', 'salafiil'))).toContain('по толкованию (Лк 3:27)');
    expect(plain(first('kainan-syn-arfaksada', 'sala'))).toContain('по толкованию (Лк 3:35–36)');
    // путь Руфи к Иисусу Христу через Нафана идёт по Лк 3 до Салафиила — он тоже по толкованию
    const nathan = shown(relate(graph, 'ruf', 'iisus')).find((r) => plain(r.sentence).includes('через Нафана'))!;
    expect(plain(nathan.sentence)).toContain('по толкованию (Лк 3:27)');
    expect(nathan.chain.find((c) => c.id === 'salafiil')?.step?.interpretive).toBe(true);
  });
  it('в строке родства описательное имя стоит со строчной', () => {
    expect(first('moisey', 'doch-faraona-mat-moiseya')).toBe('Моисей — приёмный сын дочери фараоновой (Исх 2:10)');
  });
});
