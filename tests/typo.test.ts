/**
 * Русская типографика в одном месте (B5) и ссылки в тексте (B4): одна функция typo() для строк интерфейса, годов
 * и текстов стихов при сборке; ссылки неотрывны от своих разделителей, больше трёх — «ещё N ссылок».
 * Перед тестами нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { h, type ComponentChildren, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { typo, typoTree, num, withPeriod, NBSP, WJ } from '../src/ui/text/typo.ts';
import { formatYear, formatSpan, lifeSpanText, shortYear, yearsWord, toAstro } from '../src/engine/years.ts';
import { Refs } from '../src/ui/common.tsx';
import { buildSections } from '../src/ui/Folio.tsx';
import { Masthead } from '../src/ui/card/Masthead.tsx';
import { persons, byId, models, loadCard } from '../src/data/atlas.ts';

const ROOT = join(__dirname, '..');
const W = '[А-Яа-яЁё]';

describe('typo: правила', () => {
  it('неразрывный пробел после «ок.», «см.», «§», «род.», порядкового «1-я»', () => {
    expect(typo('ок. 1040 г.')).toBe(`ок.${NBSP}1040${NBSP}г.`);
    expect(typo('(см. § 24)')).toBe(`(см.${NBSP}§${NBSP}24)`);
    expect(typo('род. ок. 1335 г. до Р. Х.')).toBe(`род.${NBSP}ок.${NBSP}1335${NBSP}г.${NBSP}до${NBSP}Р.${NBSP}Х.`);
    // внутри порядкового после дефиса — U+2060 (CARD-68, UX-12): «10-» и «м» не расходятся по строкам
    expect(typo('1-я Паралипоменон')).toBe(`1-\u2060я${NBSP}Паралипоменон`);
    expect(typo('предок в 10-м поколении')).toBe(`предок в${NBSP}10-\u2060м${NBSP}поколении`);
    // слово, которое лишь кончается на «ок»: не сокращение
    expect(typo('порок. Да')).toBe('порок. Да');
  });

  it('«г.» и «гг.» неотрывны от года, «до Р. Х.» — одним куском', () => {
    expect(typo('1050–931 гг. до Р. Х.')).toBe(`1050–${WJ}931${NBSP}гг.${NBSP}до${NBSP}Р.${NBSP}Х.`);
    expect(typo('2166 до Р. Х.')).toBe(`2166${NBSP}до${NBSP}Р.${NBSP}Х.`);
    expect(typo('30 г. по Р. Х.')).toBe(`30${NBSP}г.${NBSP}по${NBSP}Р.${NBSP}Х.`);
  });

  it('книга неотрывна от главы: «Мф 1», «1 Пар 3:5»', () => {
    expect(typo('Мф 1 и Лк 3')).toBe(`Мф${NBSP}1${NBSP}и${NBSP}Лк${NBSP}3`);
    expect(typo('по 1 Пар 3:5')).toBe(`по${NBSP}1${NBSP}Пар${NBSP}3:5`);
    expect(typo('Иоил 2:28; Откр 22:16')).toBe(`Иоил${NBSP}2:28; Откр${NBSP}22:16`);
  });

  it('в диапазоне — «–» и U+2060 после него; дефис между цифрами становится «–»', () => {
    expect(typo('Быт 5:3-5')).toBe(`Быт${NBSP}5:3–${WJ}5`);
    expect(typo('(1876–1446)')).toBe(`(1876–${WJ}1446)`);
    expect(typo(`1876–${WJ}1446`)).toBe(`1876–${WJ}1446`);
  });

  it('разряды: num() — с тысячи, typo() — с пяти цифр (четырёхзначное число может быть годом)', () => {
    expect(num(2660)).toBe(`2${NBSP}660`);
    expect(num(999)).toBe('999');
    expect(num(1012345)).toBe(`1${NBSP}012${NBSP}345`);
    expect(typo('всего 12000 человек')).toBe(`всего 12${NBSP}000${NBSP}человек`);
    expect(typo('в 1446 году')).toBe(`в${NBSP}1446${NBSP}году`);
  });

  it('короткие слова, частицы, тире, кавычки, многоточие', () => {
    expect(typo('шесть сыновей от шести матерей')).toBe(`шесть сыновей от${NBSP}шести матерей`);
    expect(typo('знаешь ли ты')).toBe(`знаешь${NBSP}ли${NBSP}ты`);
    expect(typo('Я - Господь')).toBe(`Я${NBSP}— Господь`);
    expect(typo('Мария — сестра')).toBe(`Мария${NBSP}— сестра`);
    expect(typo('сказал: "Илия здесь".')).toBe('сказал: «Илия здесь».');
    expect(typo('"внутри "вложенных" слов"')).toBe('«внутри „вложенных“ слов»');
    expect(typo('и ушел...')).toBe(`и${NBSP}ушел…`);
  });

  it('идемпотентна: повторный проход ничего не меняет', () => {
    for (const s of ['ок. 1040–970 гг. до Р. Х.', 'Я - Господь', 'сказал: "Илия здесь"...', 'по 1 Пар 3:5-8 и 14:4-7', 'всего 12000', '1-я Паралипоменон']) {
      expect(typo(typo(s))).toBe(typo(s));
    }
  });

  it('withPeriod: после точки сокращения вторую точку не ставит', () => {
    expect(withPeriod(`ок.${NBSP}6${NBSP}г.${NBSP}до${NBSP}Р.${NBSP}Х.`)).toBe(`ок.${NBSP}6${NBSP}г.${NBSP}до${NBSP}Р.${NBSP}Х.`);
    expect(withPeriod(`30${NBSP}лет`)).toBe(`30${NBSP}лет.`);
  });

  it('typoTree: строки дерева, абзац не начинается с «;», подлинник имени (bdi) не трогается', () => {
    const tree = h('li', null, '; и в доме', h('bdi', null, 'и в'), h('span', null, 'ок. 5 г.'));
    const html = renderToString(typoTree(tree) as VNode);
    expect(html).toBe(`<li>и${NBSP}в${NBSP}доме<bdi>и в</bdi><span>ок.${NBSP}5${NBSP}г.</span></li>`);
  });
});

describe('одни правила для годов, интерфейса и сборки', () => {
  it('строки годов из years.ts уже в типографике typo(): typo их не меняет', () => {
    const years = [-4174, -2166, -1446, -1040, -970, -6, -1, 1, 30, 95];
    for (const a of years)
      for (const b of years) {
        if (b < a) continue;
        for (const approx of [false, true]) {
          const s = formatSpan(toAstro(a), toAstro(b), approx);
          expect(typo(s), s).toBe(s);
        }
      }
    for (const y of years) {
      const s = formatYear(toAstro(y), { approx: true });
      expect(typo(s)).toBe(s);
      expect(typo(shortYear(toAstro(y), true, true))).toBe(shortYear(toAstro(y), true, true));
    }
    for (const n of [1, 2, 5, 11, 21, 33, 100]) expect(typo(yearsWord(n))).toBe(yearsWord(n));
    expect(formatSpan(toAstro(-1040), toAstro(-970), true)).toContain(`–${WJ}`);
    for (const p of persons.slice(0, 400)) {
      const c = models[0].chrono.get(p.id);
      const s = c ? lifeSpanText(c) : '';
      expect(typo(s)).toBe(s);
    }
  });

  it('стихи и главы в сборке прошли тот же typo(): повторный проход их не меняет', () => {
    const dir = join(ROOT, 'src/generated/verses');
    let n = 0;
    for (const f of readdirSync(dir)) {
      const { verses } = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { verses: Record<string, string> };
      for (const [k, t] of Object.entries(verses)) {
        expect(typo(t), k).toBe(t);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10000);
    const chapters = JSON.parse(readFileSync(join(ROOT, 'src/generated/chapters.json'), 'utf8')) as Record<string, { n: number; t: string }[]>;
    for (const [ch, vs] of Object.entries(chapters)) for (const v of vs) expect(typo(v.t), `${ch}:${v.n}`).toBe(v.t);
  });

  it('typo меняет только пробелы, кавычки, тире и многоточие — ни слова, ни запятые Синодального текста', async () => {
    const { loadBible } = await import('../tools/bible.ts');
    const flat = (s: string) => s.replace(/[«»„“"]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...').replace(new RegExp(`[\\s${WJ}]+`, 'g'), ' ').trim();
    const bad: string[] = [];
    for (const [k, t] of loadBible().verses) if (flat(typo(t)) !== flat(t)) bad.push(k);
    expect(bad.slice(0, 10), `${bad.length} стихов`).toEqual([]);
  });
});

describe('ссылки в тексте (B4)', () => {
  const html = (refs: string[], tail?: string) => renderToString(h(Refs, { refs, owner: 't', tail }) as VNode);
  const five = ['Руф 4:17', 'Руф 4:22', '1Пар 2:13-15', 'Мф 1:5', 'Лк 3:32'];

  it('ссылки одной книги сгруппированы: «Руф 4:17; 4:22»', () => {
    const t = html(['Руф 4:17', 'Руф 4:22']).replace(/<[^>]+>/g, '');
    expect(t).toBe(`Руф${NBSP}4:17; 4:22`);
  });

  it('каждая ссылка со своим «;» — в неразрывном блоке: перенос не ставит «;» в начало строки', () => {
    const s = html(five.slice(0, 3));
    expect(s.match(/<span class="nobr"><button class="ref"[^>]*>[^<]*<\/button><span class="refsep">;<\/span><\/span>/g)).toHaveLength(2);
    // разделитель — только внутри .nobr
    expect(s.replace(/<span class="nobr">.*?<\/span><\/span>/g, '')).not.toContain(';');
  });

  it('больше трёх ссылок — первые три и команда «ещё N ссылок» со склонением (CARD-67: «места» — места § 15)', () => {
    const s = html(five);
    expect((s.match(/class="ref"/g) ?? []).length).toBe(3);
    expect(s).toMatch(/<button class="more">ещё\u00a02\u00a0ссылки<\/button>/);
    expect(html(five.slice(0, 4))).toContain(`ещё${NBSP}1${NBSP}ссылка`);
    expect(html([...five, 'Быт 1:1', 'Быт 1:2', 'Быт 1:3'])).toContain(`ещё${NBSP}5${NBSP}ссылок`);
    expect(html(five.slice(0, 3))).not.toContain('ещё');
  });

  it('tail — знак после ссылок держится за последнюю ссылку или за «ещё N ссылок»', () => {
    expect(html(['2Цар 5:4-5', '2Цар 2:11'], ';')).toMatch(/2:11<\/button><span class="refsep">;<\/span><\/span><\/span>$/);
    expect(html(five, ';')).toMatch(/ссылки<\/button><span class="refsep">;<\/span><\/span><\/span>$/);
    expect(renderToString(h(Refs, { refs: [], owner: 't', tail: ';' }) as VNode)).toBe(';');
  });
});

describe('карточки всех лиц: типографика (B5)', () => {
  /** HTML разделов карточки и паспорта: [лицо, раздел, html]. */
  const pages: [string, string, string][] = [];
  beforeAll(async () => {
    const m = models[0];
    for (const p of persons) {
      const data = await loadCard(p.id);
      const secs = buildSections(p.id, p, data?.card ?? null, m, m.chrono.get(p.id), '', data?.chrono ?? null);
      for (const [n, v] of secs) pages.push([p.id, `§ ${n}`, renderToString(h('div', null, v as ComponentChildren) as VNode)]);
      pages.push([p.id, 'шапка', renderToString(h(Masthead, { id: p.id }) as VNode)]);
    }
  }, 300_000);
  const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  it('нет «ок.», «см.», «§» с обычным пробелом; нет обычного пробела перед «г.» и «гг.»', () => {
    const bad: string[] = [];
    for (const [id, n, html] of pages) {
      const t = text(html);
      if (new RegExp(`(^|[^${W.slice(1, -1)}])(ок|см)\\. `).test(t)) bad.push(`${id} ${n}: «ок./см.» + пробел`);
      if (/§ /.test(t)) bad.push(`${id} ${n}: «§» + пробел`);
      if (/\d гг?\./.test(t)) bad.push(`${id} ${n}: пробел перед «г.»`);
      if (/\d–\d/.test(t)) bad.push(`${id} ${n}: диапазон без U+2060`);
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  it('ни одна строка не начинается с «;», «,» или «.»: ни абзац, ни пункт, ни перенос после ссылки', () => {
    const bad: string[] = [];
    for (const [id, n, html] of pages) {
      // начало каждого блока — текст до следующего тега блока
      for (const m of html.matchAll(/<(p|li|div|dd)\b[^>]*>(.*?)(?=<\/?(?:p|li|div|dd|ul)\b|$)/g))
        if (/^[\s\u00a0]*[;,]/.test(text(m[2]))) bad.push(`${id} ${n}: «${text(m[2]).slice(0, 30)}»`);
      // знак сразу после кнопки (ссылка на стих или на лицо) — только внутри .nobr, иначе перенос ставит его в начало строки
      const loose = html.replace(/<span class="nobr">(?:[^<]|<(?!\/?span)[^>]*>|<span[^>]*>[^<]*<\/span>)*<\/span>/g, '');
      const hit = /<\/button>(?:<[^>]+>)*[;,.:)]/.exec(loose);
      if (hit) bad.push(`${id} ${n}: знак после кнопки вне .nobr: ${text(loose.slice(Math.max(0, hit.index - 60), hit.index + 8))}`);
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  it('двойной точки нет (кроме многоточия «…»)', () => {
    // пробел на месте тега («Х.</span> .») не прячет двойную точку
    const bad = pages.filter(([, , html]) => /\.\./.test(text(html).replace(/\s+(?=\.)/g, ''))).map(([id, n]) => `${id} ${n}`);
    expect(bad.slice(0, 10), `${bad.length} разделов`).toEqual([]);
  });
});

describe('§ 6: у отца и у матери свои ссылки (CARD-32)', () => {
  it('Иисус Христос: у Иосифа нет Лк 1:31, у Марии — есть', async () => {
    const data = await loadCard('iisus');
    const by = (data!.card as { parentRefsBy?: { father: string[]; mother: string[] } }).parentRefsBy!;
    expect(by.father).not.toContain('Лк 1:31');
    expect(by.mother).toContain('Лк 1:31');
    expect(by.father).toContain('Лк 3:23');
    expect(by.mother).not.toContain('Лк 3:23');
  });
  it('каждая ссылка из общего списка досталась отцу или матери, и никто не остался без ссылок', async () => {
    for (const p of persons) {
      if (!p.father || !p.mother) continue;
      const by = ((await loadCard(p.id))?.card as { parentRefsBy?: { father: string[]; mother: string[] } } | undefined)?.parentRefsBy;
      if (!by) continue;
      expect(by.father.length, p.id).toBeGreaterThan(0);
      expect(by.mother.length, p.id).toBeGreaterThan(0);
      expect(new Set([...by.father, ...by.mother]), p.id).toEqual(new Set(p.parentRefs));
    }
  });
});

describe('сверка имён с текстом стиха', () => {
  it('каждое имя атласа находит само себя', async () => {
    const { nameMatcher, norm } = await import('../src/engine/text.ts');
    const bad = persons.filter((p) => !p.unnamed && !nameMatcher(p.name).test(` ${norm(p.name).split(/\s+/)[0]} `)).map((p) => p.id);
    expect(bad).toEqual([]);
    expect(byId.get('ruf')).toBeTruthy();
  });
});
