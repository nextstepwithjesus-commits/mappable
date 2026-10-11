/**
 * 02 ред. 4.6 (В-33): задачи кода К-20…К-22 и данных Д-16, Д-18…Д-20, Д15-2, П1-4 (02 § 3.18). Настоящая база проходит без
 * ошибок; на каждое новое правило — нарочно испорченная запись. Шаги — tools/base/corrections-v33.ts; отчёт —
 * docs/app/reviews/В-33-данные-отчёт.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { admission } from '../tools/base/admit.ts';
import { anchorYear } from '../tools/base/chrono-calc.ts';
import { buildCardVolumes } from '../tools/pack/packages.ts';
import { HOUSES, SPELL_B } from '../tools/base/corrections-v33.ts';
import { CASES, NOCERT_B } from '../tools/base/corrections-v33b.ts';
import type { Actor, Anchor, ChronoD6, Descriptor } from '../tools/base/types.ts';

const ROOT = join(import.meta.dirname, '..');
let base: Base;
const errs = (b: Base, re: RegExp) => validate(b).filter((i) => i.level === 'error' && re.test(i.check)).map((i) => `${i.where}: ${i.msg}`).join('\n');
const actor = (b: Base, id: string): Actor => b.volumes.flatMap((v) => v.actors).find((a) => a.id === id)!;
const anchor = (b: Base, id: string): Anchor => b.anchors.anchors.find((a: Anchor) => a.id === id);
const chrono = (b: Base, id: string) => b.chrono.find((c) => c.actor === id)!.chrono as ChronoD6;

beforeAll(() => {
  base = loadBase();
});

describe('К-21: таблица 02 § 3.15.5 и TimeInput — поле в поле', () => {
  it('поля таблицы хронологического входа и поля TimeInput совпадают (кроме subject — в коде это ChronoRecord.actor)', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'app', '02-ДАННЫЕ.md'), 'utf8');
    const sec = doc.slice(doc.indexOf('#### 3.15.5.'), doc.indexOf('#### 3.15.6.'));
    const fromDoc = new Set(sec.split('\n').filter((l) => l.startsWith('| `')).flatMap((l) => [...l.split('|')[1].matchAll(/`([a-zA-Z]+)`/g)].map((m) => m[1])));
    const src = readFileSync(join(ROOT, 'tools', 'base', 'types.ts'), 'utf8');
    const body = src.slice(src.indexOf('export interface TimeInput {'), src.indexOf('\n}\n', src.indexOf('export interface TimeInput {')));
    const fromCode = new Set([...body.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]));
    // «о ком или о чём» — лицо записи ChronoRecord.actor (02 § 3.15.5 [4.6]: «поля у входа нет»)
    fromDoc.delete('subject');
    expect([...fromDoc].filter((f) => !fromCode.has(f)).sort()).toEqual([]);
    expect([...fromCode].filter((f) => !fromDoc.has(f)).sort()).toEqual([]);
  });
});

describe('настоящая база (02 ред. 4.6)', () => {
  it('без ошибок подписи безымянных, опор, расчёта, формы имени и тождества по форме', () => {
    expect(errs(base, /^(подпись безымянного|опора|расчёт|время|форма имени|форма «Писание»|форма без вида|тождество по форме)$/)).toBe('');
  });
});

describe('Д-16, К-20: подпись безымянного — поле descriptor со стихами', () => {
  it('у всех 48 безымянных — запись подписи; основное имя повторяет её; имя из соседнего стиха — «выв.»', () => {
    const un = base.volumes.flatMap((v) => v.actors).filter((a) => a.kind === 'unnamed');
    expect(un).toHaveLength(48);
    expect(un.filter((a) => typeof a.descriptor !== 'object').map((a) => a.id)).toEqual([]);
    const d = (id: string) => actor(base, id).descriptor as Descriptor;
    expect([d('p-zhena-potifara').text, d('p-zhena-potifara').cert, d('p-zhena-potifara').nameFrom]).toEqual(['жена Потифара', 'inference', [{ actor: 'p-potifar', ref: 'Быт 39:1' }]]);
    expect([d('p-starshaya-doch-lota').refs, d('p-starshaya-doch-lota').cert]).toEqual([['Быт 19:30', 'Быт 19:31'], 'scripture']);
    expect(d('p-mladenets-syn-virsavii').nameFrom!.map((x) => x.actor)).toEqual(['p-david', 'p-virsaviya']);
    // «Мать Иеффая»: слова «мать» в стихе нет («сын блудницы», Суд 11:1) — подпись по слову стиха, «мать Иеффая» — только поиск
    expect([actor(base, 'p-mat-ieffaya').names[0].form, d('p-mat-ieffaya').alt]).toEqual(['Блудница', ['мать Иеффая']]);
  });

  it('проверка ловит: слово не из стиха, имя другого лица без «выв.», строку прежнего вида, безымянного без подписи', () => {
    const b = structuredClone(base);
    const pot = actor(b, 'p-zhena-potifara').descriptor as Descriptor;
    pot.cert = 'scripture';
    const lot = actor(b, 'p-zhena-lota');
    (lot.descriptor as Descriptor).text = 'жена праведного Лота';
    lot.names[0].form = 'Жена праведного Лота';
    actor(b, 'p-mat-sisary').descriptor = 'мать';
    delete actor(b, 'p-tsaritsa-dan5').descriptor;
    const e = errs(b, /^подпись безымянного$/);
    expect(e).toMatch(/p-zhena-potifara.*уровень подписи «выв\.»/);
    expect(e).toMatch(/p-zhena-lota.*праведного/);
    expect(e).toMatch(/p-mat-sisary.*прежнего вида/);
    expect(e).toMatch(/p-tsaritsa-dan5.*нет подписи/);
  });
});

describe('Д-18, К-22: другое написание — по общим проверкам 02 § 3.3.4', () => {
  it('ни одной формы «другого написания» уровня «Писание»; 78 форм — «выв.» со стихами сравнения; основное имя по счёту стихов', () => {
    const left = base.volumes.flatMap((v) => v.actors).flatMap((a) => a.names.filter((n) => n.type !== 'main' && /другое написание/.test(n.note ?? '')).map((n) => `${a.id} ${n.form}`));
    expect(left).toEqual([]);
    expect(SPELL_B).toHaveLength(78);
    // правка по второму ключу: «Фаллуй», «Шуний», «Гуний» — падеж, сняты (D18-3); «Мааха» — своя карточка (D18-5)
    for (const r of SPELL_B.filter((x) => !CASES.some(([c, f]) => c === x.c && f === x.f) && x.c !== 'p-maokh')) {
      const a = actor(base, r.c);
      const f = r.swap ? a.names.find((n) => n.type !== 'main' && n.cert === 'inference' && n.compare?.main.refs.join() === r.main.join()) : a.names.find((n) => n.form === r.f);
      expect([r.c, f?.cert, !!f?.compare?.form.refs.length, !!f?.why?.codes.length]).toEqual([r.c, 'inference', true, true]);
    }
    for (const [id, main] of [['p-mamriy', 'Мамре'], ['p-bria-syn-asira', 'Верия'], ['p-ammiil-otets-makhira', 'Аммиэл'], ['p-iiuy-syn-anani', 'Иуй'], ['p-valadan', 'Баладан'], ['p-malkhiya-otets-paskhora', 'Молхия']]) {
      expect([id, actor(base, id).names[0].form]).toEqual([id, main]);
    }
    // Селлум Кореянин — вид (в): своя карточка и «возможно, то же лицо»
    expect(base.relations.filter((r) => r.a === 'p-sellum-koreyanin').map((r) => [r.b, r.kind])).toEqual([['p-shallum-syn-kore', 'possibly-same']]);
    expect(base.origins.find((o) => o.child === 'p-mattafiya-syn-selluma')!.parent).toBe('p-sellum-koreyanin');
  });

  it('проверка ловит форму «Писание» без стиха, где лицо названо обеими формами', () => {
    const b = structuredClone(base);
    const f = actor(b, 'p-iessey').names.find((n) => n.form === 'Иесей')!;
    f.cert = 'scripture';
    delete f.compare;
    delete f.why;
    // форма без поля cert — тоже «Писание» (второй ключ В-33, № 2)
    const g = actor(b, 'p-shimey-syn-girsona').names.find((n) => n.form === 'Шимеи')!;
    delete g.cert;
    delete g.compare;
    delete g.why;
    // падеж основного имени отдельной формой (второй ключ, № 5): «Хаггий» по «от Хаггия» (Чис 26:15) при «Хагги»
    actor(b, 'p-khaggi').names.push({ form: 'Хаггий', type: 'variant', refs: ['Чис 26:15'] });
    const e = errs(b, /^форма «Писание»$/);
    expect(e).toMatch(/p-iessey «Иесей»/);
    expect(e).toMatch(/p-shimey-syn-girsona «Шимеи»/);
    expect(e).toMatch(/p-khaggi «Хаггий»/);
  });
});

describe('Д-19, К-22: освобождение заметок — только явным полем idCertExempt', () => {
  it('a-12970 («Не смешивать с Иудой Искариотом») — освобождена словами, без idCert', () => {
    const f = actor(base, 'p-faddey').facts.find((x) => x.id === 'a-12970')!;
    expect([f.idCert, f.idCertExempt]).toEqual([undefined, 'not-same']);
  });

  it('проверка ловит: освобождение без слов, оба поля сразу, заметку на форме «выв.» без idCert и без освобождения', () => {
    const b = structuredClone(base);
    const fad = actor(b, 'p-faddey');
    fad.facts.find((x) => x.id === 'a-12970')!.idCertExempt = 'says-inferred';
    const mash = actor(b, 'p-mash').facts.find((x) => x.id === 'a-693')!;
    expect(mash.idCertExempt).toBe('not-same');
    mash.idCert = { form: 'p-mash#n2', refs: ['1Пар 1:17'] };
    const sara = actor(b, 'p-serakh').facts.find((x) => x.id === 'a-2864')!;
    delete sara.idCert;
    const e = errs(b, /^тождество по форме$/);
    expect(e).toMatch(/a-12970.*слов «так выходит, если сравнить» в заметке нет/);
    expect(e).toMatch(/a-693.*и idCert, и idCertExempt/);
    expect(e).toMatch(/a-2864.*нужен idCert или явное освобождение/);
  });
});

describe('Д15-2: Неем 12:12–21 — дома, без тождества лиц', () => {
  it('21 глава дома — своя карточка; рёбра «из дома X» к ним — предок без названной степени; с главами Неем 12:1–7 — «возможно, то же лицо»', () => {
    expect(HOUSES).toHaveLength(21);
    for (const h of HOUSES) {
      const kids = base.origins.filter((o) => o.parent === h.id);
      expect(kids.every((o) => o.kind === 'ancestor' && o.degree === 'unstated' && !o.identity)).toBe(true);
      expect(base.relations.filter((r) => r.a === h.id && r.kind === 'possibly-same').map((r) => r.b).sort()).toEqual([h.from, ...(h.also ?? [])].sort());
    }
    // у глав Неем 12:1–7 нет форм из перечня домов
    const neh = /^Неем 12:(1[2-9]|2[01])$/;
    for (const id of new Set(HOUSES.map((h) => h.from))) expect([id, actor(base, id).names.flatMap((n) => n.refs).filter((r) => neh.test(r))]).toEqual([id, []]);
    // «из дома Миниамина» — глава дома без названного члена (Неем 12:17)
    expect(base.origins.filter((o) => o.parent === 'p-miniamin-neem12-17')).toEqual([]);
  });
});

describe('Д-20, К-21: опоры — вид, промежуток, альтернативы записями, журнал', () => {
  it('виды по 02 § 3.15.4: external 14, calc 7, tradition 1; без value и derived; у каждой — журнал', () => {
    const all: Anchor[] = base.anchors.anchors;
    const n = (k: string) => all.filter((a) => a.kind === k).length;
    expect([n('external'), n('calc'), n('tradition')]).toEqual([14, 7, 1]);
    expect(all.filter((a) => 'value' in a || 'derived' in a || !a.log?.length).map((a) => a.id)).toEqual([]);
    expect(all.flatMap((a) => a.alternatives).every((x) => typeof x === 'object' && x.works.length > 0)).toBe(true);
  });

  it('Тиверий — 26–29 (оба способа счёта), части — альтернативы; Ездра — Артаксеркс II с трудом; Иерусалим — 587, 586 — Тиле', () => {
    const t = anchor(base, 'an-tiberius-15');
    expect([t.year.earliest, t.year.latest]).toEqual([26, 29]);
    expect(t.alternatives.map((x) => [x.year.earliest, x.year.latest])).toEqual([[26, 27], [28, 29]]);
    const ez = anchor(base, 'an-ezra');
    expect(ez.alternatives.map((x) => [x.year.earliest, x.works.map((w) => w.work)])).toEqual([[-398, ['w-yamauchi-1980', 'w-finegan-1998']]]);
    const j = anchor(base, 'an-jerusalem-fall');
    expect([j.year.earliest, j.alternatives[0].year.earliest, j.alternatives[0].works[0].work]).toEqual([-587, -586, 'w-thiele-1983']);
  });

  it('проверка ловит: одно число value, производные годы, альтернативу строкой, опору без вида', () => {
    const b = structuredClone(base);
    (anchor(b, 'an-qarqar') as any).value = -853;
    (anchor(b, 'an-festus') as any).derived = [{ year: 57, text: '…' }];
    (anchor(b, 'an-festus') as any).alternatives.push('60');
    delete (anchor(b, 'an-darius-2') as any).kind;
    const e = errs(b, /^опора$/);
    expect(e).toMatch(/an-qarqar.*value/);
    expect(e).toMatch(/an-festus.*derived/);
    expect(e).toMatch(/an-festus, альтернатива 3.*строкой/);
    expect(e).toMatch(/an-darius-2.*вид опоры/);
  });
});

describe('К-21: год от опоры и срок', () => {
  it('ссылка на опору не вида external, срок без опоры, срок без вида счёта и не из стиха — ошибки', () => {
    const b = structuredClone(base);
    const ezra = actor(b, 'p-ezdra');
    const f1 = ezra.facts.find((f) => f.id === 'a-4921')!;
    f1.calc = { event: 'Езд 7:6-9', anchor: 'an-crucifixion' };
    const f2 = ezra.facts.find((f) => f.id === 'a-4920')!;
    f2.calc = { event: 'Езд 7:11-26', offset: { number: 7, words: 'седьмой', count: 'ordinal', refs: ['Езд 7:7'] } };
    const f3 = ezra.facts.find((f) => f.id === 'a-4929')!;
    f3.calc = { event: 'Неем 8:1-8', anchor: 'an-ezra', offset: { number: 3, words: 'три', count: undefined as any, refs: ['Неем 8:2'] } };
    const e = errs(b, /^расчёт$/);
    expect(e).toMatch(/опора «an-crucifixion» вида «calc»/);
    expect(e).toMatch(/срок \(offset\) — только от опоры/);
    expect(e).toMatch(/у срока нет вида счёта/);
    expect(e).toMatch(/слов срока «три» нет в Неем 8:2/);
  });

  it('год от опоры — только от external с трудом со страницей; порядковый год и прошедший срок', () => {
    const b = structuredClone(base);
    // у Тиверия труд без сверенной страницы — года нет (04 § 9 п. 19)
    expect(anchorYear(b, { event: 'Лк 3:1', anchor: 'an-tiberius-15' })).toBeUndefined();
    anchor(b, 'an-tiberius-15').works = [{ work: 'w-finegan-1998', page: 'с. 1', weight: 'approx', checkedBy: 'agent' } as any];
    expect(anchorYear(b, { event: 'Лк 3:1', anchor: 'an-tiberius-15' })).toEqual({ earliest: 26, latest: 29, anchor: 'an-tiberius-15' });
    expect(anchorYear(b, { event: 'Лк 3:1', anchor: 'an-tiberius-15', offset: { number: 3, words: 'третий', count: 'ordinal', refs: [] } })).toEqual({ earliest: 28, latest: 31, anchor: 'an-tiberius-15' });
    expect(anchorYear(b, { event: 'Лк 3:1', anchor: 'an-tiberius-15', offset: { number: 3, words: 'три', count: 'elapsed', refs: [] } })).toEqual({ earliest: 28, latest: 32, anchor: 'an-tiberius-15' });
    // опора-расчёт года не даёт, даже с трудом
    anchor(b, 'an-crucifixion').works = [{ work: 'w-finegan-1998', page: 'с. 1', weight: 'approx', checkedBy: 'agent' } as any];
    expect(anchorYear(b, { event: 'Мф 27:35', anchor: 'an-crucifixion' })).toBeUndefined();
    // через нулевой год: 4 до Р. Х. + 5 лет порядкового счёта = 1 по Р. Х. (нулевого года нет)
    anchor(b, 'an-herod-death').works = [{ work: 'w-finegan-1998', page: 'с. 1', weight: 'approx', checkedBy: 'agent' } as any];
    expect(anchorYear(b, { event: 'Мф 2:19', anchor: 'an-herod-death', offset: { number: 5, words: 'пятый', count: 'ordinal', refs: [] } })?.earliest).toBe(1);
  });

  it('по выходу сборки: запись с опорой без труда со страницей года в пакете карточки не получает', () => {
    const b = structuredClone(base);
    const f = actor(b, 'p-ezdra').facts.find((x) => x.id === 'a-4921')!;
    f.calc = { event: 'Езд 7:6-9', anchor: 'an-ezra' };
    const card = (bb: Base) => {
      const { volumes } = buildCardVolumes(bb, admission(bb, 'probe'));
      for (const v of volumes.values()) if (v.cards.ezdra) return v.cards.ezdra.f.find((x: any) => x.n === 4921);
      return undefined;
    };
    const no = card(b);
    expect(no).toBeDefined();
    expect([no!.y, no!.ya]).toEqual([undefined, undefined]);
    anchor(b, 'an-ezra').works = [{ work: 'w-finegan-1998', page: 'с. 1', weight: 'approx', checkedBy: 'agent' } as any];
    expect([card(b)!.y, card(b)!.ya]).toEqual([[-458, -458], 'an-ezra']);
  });
});

describe('К-21: вид счёта и «смерти не было» — по словам в стихах самого лица', () => {
  it('у Аарона «в сороковой год» — порядковый год; проверка ловит вход без вида счёта и «не видел смерти» без слов в стихах лица', () => {
    expect(chrono(base, 'p-aaron').inputs.find((t) => t.kind === 'years-after')!.count).toBe('ordinal');
    const b = structuredClone(base);
    delete chrono(b, 'p-aaron').inputs.find((t) => t.kind === 'years-after')!.count;
    // слова «Бог взял его» есть только в Быт 5:24; без него у Еноха остаётся «не стало его» без второй половины
    const en = chrono(b, 'p-enokh').inputs.find((t) => t.kind === 'end-of-life')!;
    en.refs = ['Быт 5:23', 'Евр 11:13'];
    const e = errs(b, /^время$/);
    expect(e).toMatch(/p-aaron.*без вида счёта/);
    expect(e).toMatch(/p-enokh.*not-died/);
  });
});

describe('П1-4: мелкое по эпохам', () => {
  it('без «часто относят», без годов опор в примечаниях границ, без «первое пленение»; Пятидесятница — со стихом Деян 1:3', () => {
    const s = JSON.stringify(base.epochs);
    expect(s).not.toMatch(/часто относят/);
    expect(s).not.toMatch(/[Пп]ервое пленение/);
    expect(s).not.toMatch(/723 по схеме|587 по умолчанию|30, возможен 33/);
    const christ = base.epochs.find((e) => e.id === 'era-christ') as any;
    expect(christ.end.refs).toContain('Деян 1:3');
  });
});

describe('правка по второму ключу В-33 (tools/base/corrections-v33b.ts)', () => {
  it('главы домов Неем 12 — «тот, по кому назван дом»; падежи сняты; формы без cert — «выв.»', () => {
    for (const h of HOUSES) expect(actor(base, h.id).disambig).toBe(`тот, по кому назван дом (${h.verse})`);
    for (const [c, f] of CASES) expect([c, actor(base, c).names.some((n) => n.form === f)]).toEqual([c, false]);
    expect(actor(base, 'p-kharmiy-syn-zimri').names.map((n) => n.form)).toEqual(['Харми']);
    for (const r of NOCERT_B) {
      const a = actor(base, r.c);
      expect([r.c, a.names.filter((n) => n.cert === 'inference').length]).toEqual([r.c, 1]);
    }
    expect([actor(base, 'p-vaana-iz-vernuvshikhsya').names[0].form, actor(base, 'p-matred').names[0].form]).toEqual(['Ваан', 'Матреда']);
  });

  it('вид (в): Анания, отец Ииуя; Анхус при Соломоне и Мааха — без кругового вывода; Вания (Неем 10:14)', () => {
    const rel = (a: string) => base.relations.filter((r) => r.a === a && r.kind === 'possibly-same').map((r) => r.b);
    expect(rel('p-ananiya-otets-iiuya')).toEqual(['p-ananiy-prozorlivets']);
    expect(base.origins.filter((o) => o.child === 'p-iiuy-syn-anani' && o.role === 'father').map((o) => o.parent)).toEqual(['p-ananiya-otets-iiuya']);
    expect(rel('p-ankhus-syn-maakhi')).toEqual(['p-ankhus']);
    expect(rel('p-maakha-otets-ankhusa')).toEqual(['p-maokh']);
    expect(base.origins.filter((o) => o.child === 'p-ankhus-syn-maakhi').map((o) => [o.parent, o.refs, o.identity])).toEqual([['p-maakha-otets-ankhusa', ['3Цар 2:39'], undefined]]);
    expect(base.origins.filter((o) => o.child === 'p-ankhus').map((o) => [o.parent, o.refs])).toEqual([['p-maokh', ['1Цар 27:2']]]);
    expect(actor(base, 'p-maokh').names.map((n) => n.form)).toEqual(['Маох']);
    expect(rel('p-vaniya-neem10-14')).toEqual(['p-vaniy-rod']);
  });

  it('Иоафам и Амон — «Писание» по стиху с основным именем; четыре заметки — толкование без авторов; Деян 1:5 у границы', () => {
    const t = chrono(base, 'p-ioafam').inputs.find((x) => x.kind === 'under-king' && x.refs.includes('4Цар 15:5'))!;
    expect([t.refs, t.idCert]).toEqual([['4Цар 15:5', '2Пар 26:21'], undefined]);
    const amon = actor(base, 'p-amon-tsar').facts.find((f) => f.id === 'a-9344')!;
    expect([(amon.value as any).refs, amon.idCert]).toEqual([['4Цар 21:19', '2Пар 33:21'], undefined]);
    for (const [w, id] of [['p-khuppim', 'a-2989'], ['p-khur', 'a-3615'], ['p-iiuy-syn-anani', 'a-10507'], ['p-malkhiya-otets-paskhora', 'a-11119']]) {
      const f = actor(base, w).facts.find((x) => x.id === id)!;
      expect([id, f.cert, f.needsSources]).toEqual([id, 'interpretation', true]);
    }
    for (const id of ['era-christ', 'era-apostolic']) {
      const e = base.epochs.find((x) => x.id === id) as any;
      expect((id === 'era-christ' ? e.end : e.start).refs).toEqual(['Деян 1:3', 'Деян 1:5', 'Деян 2:1']);
    }
  });
});
