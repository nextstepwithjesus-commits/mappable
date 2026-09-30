/**
 * Этап 12, задача S2 «Карточки: вкладки и родство» (решения 91, 92) — без браузера:
 *  — палитра вкладок закреплённых карточек (--tab-1 … --tab-8): во всех четырёх блоках тем, к листу ≥ 3 : 1, не похожа
 *    на ленты, ветви, знак союза, золотистый семьи и жёлтую связь (ΔE CIE76, обычное зрение и три вида дальтонизма);
 *  — «Родство» полно: все, от кого у лица есть дети (жёны, матери детей, которых текст не называет жёнами, неназванная
 *    жена, если текст её упоминает), все дети по союзам — на Соломоне, Иуде, Каине, Лоте, Давиде, Иакове, Аврааме, Исаве
 *    и на всех 17 парах «отец + мать ребёнка»; ни один супруг и ни один ребёнок не выпадает ни у одного лица атласа;
 *  — слова связи такой пары: «Соломон и Наама: Ровоам», «отец» и «мать», без «муж» и «жена».
 * Поведение в браузере — сценарии 890–909 (tools/accept/cards12.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byId, loadCard, persons } from '../src/data/atlas.ts';
import { coparents, genName, kinRows, unnamedSpouseNote, type KinRow } from '../src/ui/card/kinrows.ts';
import { unionsOf } from '../src/ui/reveal.ts';
import { partnerIn } from '../src/engine/unions.ts';
import { isClaimUnion, linkInfo } from '../src/ui/linkwords.ts';
import { contrast, linearRgb } from '../src/ui/contrast.ts';
import { BRANCH_COLORS, BRANCH_SHADES, LINK_YELLOW, UNION_COLORS, KIN_GOLD } from '../src/render/branches.ts';

const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '');
const text = (r: KinRow | undefined) => (r ? flat(r.parts.map((p) => (p.t === 'text' ? p.text : byId.get(p.id)!.name)).join('')) : '');
const rows = (id: string) => Object.fromEntries(kinRows(id, null).map((r) => [r.kind, r])) as Record<string, KinRow>;

// ---------- палитра вкладок ----------

const tokens = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function block(head: string): Record<string, string> {
  const i = tokens.indexOf(head);
  const j = tokens.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of tokens.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}
const THEMES = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };
const TABS = (t: Record<string, string>) => Array.from({ length: 8 }, (_, i) => t[`--tab-${i + 1}`]);

const CVD: number[][][] = [
  [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
];
function lab(hex: string, m?: number[][]): number[] {
  const l = linearRgb(hex);
  const [r, g, b] = m ? m.map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))) : l;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a: string, b: string, m?: number[][]) => Math.hypot(...lab(a, m).map((v, i) => v - lab(b, m)[i]));

describe('палитра вкладок закреплённых карточек (решение 91)', () => {
  it('восемь цветов в ночной и дневной теме; блок светлой темы системы и печать — те же, что днём', () => {
    for (const t of Object.values(THEMES)) expect(TABS(t).every((c) => /^#[0-9a-f]{6}$/.test(c ?? ''))).toBe(true);
    const light = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: light)'));
    for (let i = 1; i <= 8; i++) expect(light).toContain(`--tab-${i}: ${THEMES.day[`--tab-${i}`]}`);
    const print = tokens.slice(tokens.indexOf('@media print'));
    for (let i = 1; i <= 8; i++) expect(print).toContain(`--tab-${i}: ${THEMES.day[`--tab-${i}`]}`);
  });
  it('метка к листу и к раскрытой вкладке — не меньше 3 : 1 (графика, WCAG 1.4.11)', () => {
    for (const t of Object.values(THEMES)) for (const c of TABS(t)) for (const bg of ['--sheet', '--sheet-2']) expect(contrast(c, t[bg]), `${c} на ${bg}`).toBeGreaterThanOrEqual(3);
  });
  it('не похожа на ленты, ветви, знак союза, золотистый семьи и жёлтую связь: ΔE ≥ 15, при дальтонизме ≥ 7; вкладки между собой ≥ 8', () => {
    for (const th of ['night', 'day'] as const) {
      const t = THEMES[th];
      const other = [t['--gold-1'], t['--gold-2'], t['--azure-1'], t['--azure-2'], ...BRANCH_COLORS[th], ...BRANCH_SHADES[th], LINK_YELLOW[th], UNION_COLORS[th].husband, UNION_COLORS[th].wife, KIN_GOLD[th]].map((c) => c.toLowerCase());
      const tabs = TABS(t);
      for (const c of tabs) {
        for (const o of other) {
          expect(dE(c, o), `${th}: ${c} ~ ${o}`).toBeGreaterThanOrEqual(15);
          for (const m of CVD) expect(dE(c, o, m), `${th}, дальтонизм: ${c} ~ ${o}`).toBeGreaterThanOrEqual(7);
        }
        for (const d of tabs) if (d !== c) expect(dE(c, d), `${th}: ${c} ~ ${d}`).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

// ---------- родство полно ----------

describe('«Родство» у звезды — все, от кого у лица есть дети (решение 92)', () => {
  beforeAll(async () => {
    // записи § 9 о неназванных жёнах — в томах карточек
    for (const id of ['kain', 'noy', 'lot', 'iuda', 'solomon', 'david', 'iakov', 'avraam', 'isav', 'asa', 'iosiya', 'ieroboam', 'ierakhmeil', 'sif', 'petr', 'iov', 'evnika', 'naama', 'famar'])
      await loadCard(id);
  });
  it('Соломон: «Жена: Дочь фараона»; «Мать сына: Наама» — не «жена»; дети по союзам', () => {
    const r = rows('solomon');
    expect(r.spouses.label).toBe('Жена');
    expect(text(r.spouses)).toBe('Дочь фараона');
    expect(r.coparents.label).toBe('Мать сына');
    expect(text(r.coparents)).toBe('Наама');
    expect(text(r.children)).toBe('от Наамы — Ровоам; мать не названа — Тафафь, Васемафа');
  });
  it('Иуда: «Жена: Дочь Шуи», «Мать сыновей: Фамарь»; сыновья от дочери Шуи и от Фамари', () => {
    const r = rows('iuda');
    expect([r.spouses.label, text(r.spouses)]).toEqual(['Жена', 'Дочь Шуи']);
    expect([r.coparents.label, text(r.coparents)]).toEqual(['Мать сыновей', 'Фамарь']);
    expect(text(r.children)).toBe('от дочери Шуи — Ир, Онан, Шела; от Фамари — Фарес, Зара');
  });
  it('Лот: дочери — матери сыновей словами текста, без «жена»; дети по союзам; свои дети — не братья дочерям', () => {
    const r = rows('lot');
    expect(text(r.spouses)).toBe('Жена Лота');
    expect([r.coparents.label, text(r.coparents)]).toEqual(['Матери детей', 'Старшая дочь Лота (мать Моава), Младшая дочь Лота (мать Бен-Амми)']);
    expect(text(r.children)).toBe('от жены Лота — Старшая дочь Лота, Младшая дочь Лота; от старшей дочери Лота — Моав; от младшей дочери Лота — Бен-Амми');
    const d = rows('starshaya-doch-lota');
    expect([d.coparents.label, text(d.coparents)]).toEqual(['Отец сына', 'Лот']);
    expect(text(d.siblings)).not.toMatch(/Моав/);
  });
  it('неназванная жена, которую текст упоминает: Каин, Ной, Иов, Пётр; у Сифа текст её не упоминает — строки нет', () => {
    expect([rows('kain').spouses.label, text(rows('kain').spouses)]).toEqual(['Жена', 'имя в Писании не названо, Быт 4:17']);
    expect(text(rows('noy').spouses)).toMatch(/^имя в Писании не названо, Быт 6:18/);
    expect(text(rows('iov').spouses)).toMatch(/^имя в Писании не названо, Иов 2:9–10/);
    expect(text(rows('petr').spouses)).toMatch(/^имя в Писании не названо/);
    expect(rows('sif').spouses).toBeUndefined();
    // вместе с названной: «Жёны: Афара; жена, имя в Писании не названо, 1 Пар 2:26»
    expect([rows('ierakhmeil').spouses.label, text(rows('ierakhmeil').spouses)]).toEqual(['Жёны', 'Афара; жена, имя в Писании не названо, 1 Пар 2:26']);
    // у мужа — «Муж: имя в Писании не названо» (Евника, Деян 16:1)
    expect(rows('evnika').spouses.label).toBe('Муж');
    expect(text(rows('evnika').spouses)).toMatch(/^имя в Писании не названо, Деян 16:1/);
  });
  it('запись «Жена не названа; мать его сына …» — не упоминание жены: у Асы и Иосии строки неназванной жены нет; «Жена Иеровоама» — уже лицо', () => {
    expect(rows('asa').spouses).toBeUndefined();
    expect([rows('asa').coparents.label, text(rows('asa').coparents)]).toEqual(['Мать сына', 'Азува']);
    expect(rows('iosiya').spouses).toBeUndefined();
    expect(text(rows('iosiya').coparents)).toBe('Хамуталь (мать Иоахаза и Седекии), Зебудда (мать Иоакима)');
    expect(text(rows('ieroboam').spouses)).toBe('Жена Иеровоама');
    const note = (text: string) => unnamedSpouseNote('kain', { spousesNote: [{ text, refs: ['Быт 4:17'] }] });
    expect(note('Жена не названа по имени; она родила ему Еноха')?.many).toBe(false);
    expect(note('Имя жены не названо')).not.toBeNull();
    expect(note('Жёны Фарры не названы')?.many).toBe(true);
    expect(note('Мать взяла ему жену из земли Египетской; имя жены не названо')).not.toBeNull();
    expect(note('Жена не названа; мать его сына Иосафата — Азува')).toBeNull();
    expect(note('Жена Азува (умерла); Иериофа (женой прямо не названа)')).toBeNull();
  });
  it('Давид, Иаков, Авраам, Исав: все жёны; все дети — группами по союзам, в каждой по рождению', () => {
    expect(text(rows('david').spouses)).toBe('Мелхола, Ахиноама, Авигея, Мааха, Аггифа, Авитала, Эгла, Вирсавия');
    expect(text(rows('david').children)).toMatch(/^от Ахиноамы — Амнон; от Авигеи — Далуиа; от Маахи — Авессалом; .*; от Вирсавии — Сын Давида и Вирсавии, Самус, Совав, Нафан, Соломон; мать не названа — Евеар/);
    expect(text(rows('iakov').children)).toBe('от Лии — Рувим, Симеон, Левий, Иуда, Иссахар, Завулон, Дина; от Рахили — Иосиф, Вениамин; от Валлы — Дан, Неффалим; от Зелфы — Гад, Асир; Манассия (приёмный), Ефрем (приёмный)');
    // этап 13 (X1, сверка т. 04): сыновья Хеттуры — не раньше чем через 40 лет после Исаака (born.notBefore; Быт 25:1–2,
    // 20); годы у всех шестерых одной опоры, порядок рождения — порядок перечисления Быт 25:2
    expect(text(rows('avraam').children)).toBe('от Сарры — Исаак; от Агари — Измаил; от Хеттуры — Зимран, Иокшан, Медан, Мадиан, Ишбак, Шуах');
    expect(text(rows('isav').children)).toBe('от Ады — Елифаз; от Махалафы — Рагуил; от Оливемы — Иеус, Иеглом, Корей');
  });
  it('со стороны матери: Наама — «Отец сына: Соломон», не «Муж»; Фамарь — «Мужья: Ир, Онан», «Отец сыновей: Иуда»', () => {
    expect(rows('naama').spouses).toBeUndefined();
    expect([rows('naama').coparents.label, text(rows('naama').coparents)]).toEqual(['Отец сына', 'Соломон']);
    expect([rows('famar').spouses.label, text(rows('famar').spouses)]).toEqual(['Мужья', 'Ир, Онан']);
    expect([rows('famar').coparents.label, text(rows('famar').coparents)]).toEqual(['Отец сыновей', 'Иуда']);
  });
  it('все 17 пар «отец + мать ребёнка», где мать не записана супругой: мать — в строке матерей отца (§ 9 — «мать …»), не в «Жёнах»', () => {
    const pairs = persons.flatMap((p) => unionsOf(p.id).filter((u) => u.a === p.id && u.b && u.kind === 'parents' && !isClaimUnion(u) && u.kids.length).map((u) => [p.id, u.b!] as const));
    expect(pairs.length).toBeGreaterThanOrEqual(17);
    for (const [father, mother] of pairs) {
      const r = rows(father);
      expect(r.coparents?.parts.some((q) => q.t === 'name' && q.id === mother), `${father} — ${mother}`).toBe(true);
      expect(r.spouses?.parts.some((q) => q.t === 'name' && q.id === mother) ?? false, `${father}: ${mother} в «Жёнах»`).toBe(false);
      const c = coparents(father).find((x) => x.other === mother)!;
      expect(c.refs.length, `${father} — ${mother}: стихи`).toBeGreaterThan(0);
      if (!byId.get(mother)!.name.startsWith('Мать ')) expect(c.role, `${father} — ${mother}`).toMatch(/^мать /);
    }
  });
  it('ни у одного лица атласа не выпадает ни супруг, ни второй родитель, ни ребёнок (ничего не обрезается молча)', () => {
    const missing: string[] = [];
    for (const p of persons) {
      const rs = kinRows(p.id, null);
      const named = new Set(rs.flatMap((r) => r.parts.flatMap((q) => (q.t === 'name' ? [`${r.kind}:${q.id}`] : []))));
      for (const u of unionsOf(p.id)) {
        const other = partnerIn(u, p.id);
        if (other && !isClaimUnion(u) && !named.has(`spouses:${other}`) && !named.has(`coparents:${other}`)) missing.push(`${p.id}: ${other}`);
        if (u.claim === 'ancestor') continue;
        for (const k of u.kids) if (k !== p.id && !named.has(`children:${k}`)) missing.push(`${p.id}: ребёнок ${k}`);
      }
    }
    expect(missing.slice(0, 10)).toEqual([]);
  });
  it('родительный падеж — только надёжный (ru.ts) и два случая сверх него: «старшей дочери Лота», «Бен-Амми»', () => {
    expect(genName('naama')).toBe('Наамы');
    expect(genName('starshaya-doch-lota')).toBe('старшей дочери Лота');
    expect(genName(persons.find((p) => p.name === 'Бен-Амми')!.id)).toBe('Бен-Амми');
    expect(genName(persons.find((p) => p.name === 'Наложница-Арамеянка')?.id ?? 'x')).toBeNull();
  });
});

describe('слова связи пары, которую текст называет только родителями (решение 92)', () => {
  it('«Соломон и Наама: Ровоам»; концы — «отец» и «мать»; пояснение без слов брака', () => {
    for (const key of [{ kind: 'spouse', union: 'u:solomon+naama', person: 'solomon' }, { kind: 'union', union: 'u:solomon+naama' }] as const) {
      const i = linkInfo(key)!;
      expect(flat(i.title)).toBe('Соломон и Наама: Ровоам');
      expect(i.ends.map((e) => e.role).sort()).toEqual(['мать', 'отец']);
      expect(`${i.title} ${i.ends.map((e) => e.role).join(' ')}`).not.toMatch(/(^|\s)(муж|жена)(\s|$)/);
      expect(i.note).toBe('Супругами Писание их не называет: они названы отцом и матерью ребёнка');
    }
    // обычный брак — по-прежнему «муж» и «жена»
    expect(linkInfo({ kind: 'spouse', union: 'u:iakov+rakhil', person: 'iakov' })!.ends.map((e) => e.role)).toEqual(['муж', 'жена']);
  });
});
