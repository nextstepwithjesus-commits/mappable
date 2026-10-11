/**
 * Задачи данных 02 § 3.18, первая партия: Д-5 (родство и союзы без «толкования»), Д-7 (год в записи → ссылка calc),
 * Д-2 (степень у вида «предок»). Шаги — tools/base/corrections-d.ts и вторая очередь по второму ключу —
 * tools/base/corrections-d-2.ts; отчёт — docs/app/reviews/Д-партия-1-отчёт.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate, yearIn } from '../tools/base/validate.ts';
import { buildIndex } from '../tools/base/bundle.ts';
import { admission } from '../tools/base/admit.ts';
import type { CheckEntry } from '../tools/base/types.ts';

let base: Base;
/**
 * Снимок журнала подписей на время партии: только подписи названных партий (по полю `by`, у контрольного набора — и по
 * дате). Если запись позже переподписала другая партия, берётся последняя подпись своей партии из `history`. Так проверка
 * не зависит от будущих подписей (истории пакета 1 и дальше).
 */
const CONTROL = (c: { by: string; at: string }) => c.by === 'сверщик-агент' && c.at <= '2026-10-10';
const D1 = (c: { by: string }) => /Д-партия-1-второй-ключ/.test(c.by);
const snapshot = (b: Base, ...parties: ((c: { by: string; at: string }) => boolean)[]): Base => ({
  ...b,
  checks: (b.checks ?? []).flatMap((c) => {
    const ok = (x: { by: string; at: string }) => parties.some((p) => p(x));
    if (ok(c)) return [c];
    const h = [...(c.history ?? [])].reverse().find(ok);
    return h ? [{ ...h, key: c.key } as CheckEntry] : [];
  }),
});
const copy = () => structuredClone(base);
const errs = (b: Base, check?: string) => validate(b).filter((i) => i.level === 'error' && (!check || i.check === check));
const facts = (b: Base) => b.volumes.flatMap((v) => v.actors.flatMap((a) => a.facts.map((f) => ({ a, f }))));

beforeAll(() => {
  base = loadBase();
});

describe('Д-5: «толкование» у родства и союзов', () => {
  it('ни одного «толкования» у родства и союза; снятые номера — с переадресацией на карточку', () => {
    expect(base.kin.filter((k) => k.cert === 'interpretation')).toEqual([]);
    expect(base.unions.flatMap((u) => u.terms).filter((t) => t.cert === 'interpretation')).toEqual([]);
    for (const [id, to] of [['k-57', 'p-iuda-brat-gospoden'], ['k-66', 'p-ioann-deyan4-6'], ['k-67', 'p-aleksandr-deyan4-6'], ['u-kleopa--mariya-kleopova', 'p-mariya-kleopova']]) {
      expect(base.redirects.find((r) => r.from === id)?.to).toEqual([to]);
    }
    // примечания шага D5 — без пометки «толкование» и без истории правок (второй ключ; решение координатора, п. 4)
    const n = base.volumes.flatMap((v) => v.actors).flatMap((a) => a.facts).filter((f) => /исправление D5/.test(f.prov?.by ?? '') && f.field === 'notes' && /D5-2/.test(f.prov?.by ?? ''));
    expect(n.length).toBeGreaterThanOrEqual(4);
    const d5 = new Set(['p-maaseya-syn-akhaza', 'p-ierameil-syn-tsarya', 'p-malkhiya-syn-tsarya', 'p-toviya-ammonityanin', 'p-maakha-zhena-makhira', 'p-shupim-syn-ira', 'p-khupim-syn-ira',
      'p-andronik', 'p-irodion', 'p-luciy-srodnik', 'p-iason-srodnik', 'p-sosipatr-srodnik', 'p-mariya-kleopova', 'p-iuda-brat-gospoden', 'p-ioann-deyan4-6', 'p-aleksandr-deyan4-6']);
    for (const f of base.volumes.flatMap((v) => v.actors).filter((a) => d5.has(a.id)).flatMap((a) => a.facts).filter((f) => f.field === 'notes')) {
      expect((f.value as any)?.text ?? '').not.toMatch(/Прежн(ий|яя) .* снят|дана как толкование|помечено как толкование/);
    }
  });
  it('один возможный тёзка — своя карточка, родство «Писание» к ней и «возможно, то же лицо» к известному (02 § 3.3.4 [4.2])', () => {
    const k = (from: string, to: string) => base.kin.find((x) => x.from === from && x.to === to);
    const rel = (a: string, b: string) => base.relations.find((r) => r.a === a && r.b === b && r.kind === 'possibly-same');
    for (const [from, card, known] of [
      ['p-toviya-ammonityanin', 'p-eliashiv-neem13-4', 'p-eliashiv-pervosvyashchennik'], ['p-ioil-brat-nafana', 'p-nafan-1par11-38', 'p-nafan-otets-igala'],
      ['p-maakha-zhena-makhira', 'p-shupim-1par7-15', 'p-shupim-syn-ira'], ['p-maakha-zhena-makhira', 'p-khupim-1par7-15', 'p-khupim-syn-ira'],
    ]) {
      expect([from, k(from, card)?.cert, k(from, card)?.identity, k(from, known)]).toEqual([from, 'scripture', undefined, undefined]);
      // уровень «толкование» с пометкой needsSources: трудов пока нет (второй ключ, П-1; решение координатора, Д-р8)
      expect([card, rel(card, known)?.cert, rel(card, known)?.needsSources, rel(card, known)?.works, rel(card, known)!.refs.length >= 2]).toEqual([card, 'interpretation', true, undefined, true]);
    }
    // безымянные цари — по-прежнему «вывод»: царь назван в том же рассказе
    for (const [from, card, known] of [['p-maaseya-syn-akhaza', 'p-tsar-2par28-7', 'p-akhaz'], ['p-malkhiya-syn-tsarya', 'p-tsar-ier38-6', 'p-sedekiya']]) {
      expect([from, k(from, card)?.cert, k(from, card)?.identity, k(from, known)]).toEqual([from, 'scripture', undefined, undefined]);
      expect([card, rel(card, known)?.cert, rel(card, known)?.needsSources, rel(card, known)!.refs.length >= 2]).toEqual([card, 'inference', undefined, true]);
    }
    expect(base.kin.find((x) => x.from === 'p-yuniya')!.rel).toBe('сродник');
  });
  it('подложенные ошибки отношений ловятся: толкование без трудов и без пометки; пометка не у толкования', () => {
    const b = copy();
    const r = b.relations.find((x) => x.a === 'p-shupim-1par7-15')!;
    delete r.needsSources;
    const k = b.relations.find((x) => x.a === 'p-tsar-2par28-7')!;
    k.needsSources = true;
    expect(errs(b, 'отношение').map((i) => i.msg).join()).toMatch(/с трудами works или пометкой needsSources/);
    expect(errs(b, 'толкование').map((i) => i.where).join()).toMatch(/p-tsar-2par28-7/);
  });
  it('«сын царя» — вывод, где царь назван в том же рассказе; тождество — когда сомнение в самой записи', () => {
    const k = (from: string) => base.kin.find((x) => x.from === from)!;
    expect([k('p-ierameil-syn-tsarya').cert, k('p-ierameil-syn-tsarya').refs]).toEqual(['inference', ['Иер 36:26', 'Иер 36:28']]);
    expect(k('p-mariya-kleopova').identity).toMatchObject({ of: 'from', degree: 'possible' });
    expect(base.unions.find((u) => u.id === 'u-mered--iudiya')!.terms[0]).toMatchObject({ cert: 'scripture', word: 'жена', identity: { of: 'husband', degree: 'possible' } });
  });
  it('родство и союз «предположительно» в выпуск не идут, как ребро «предположительно» (К-6)', () => {
    const b = copy();
    // проба: все записи считаем допущенными
    const ix = buildIndex(b, 'probe');
    expect(ix.kin.some((x: any) => x.f === 'mariya-kleopova' && x.t === 'mariya')).toBe(false);
    expect(ix.kin.find((x: any) => x.f === 'ierameil-syn-tsarya')).toMatchObject({ r: 'сын царя', ce: 'inference' });
    // родство к своей карточке тёзки идёт; к известному лицу — нет
    expect(ix.kin.some((x: any) => x.f === 'ioil-brat-nafana' && x.t === 'nafan-otets-igala')).toBe(false);
    expect(ix.unions.some((x: any) => x.h === 'mered' && x.w === 'iudiya')).toBe(false);
  }, 60_000);
  it('подложенные ошибки тождества ловятся', () => {
    const b = copy();
    const k = b.kin.find((x) => x.from === 'p-mariya-kleopova')!;
    k.identity = { ...k.identity!, of: 'parent' as any, refs: [] };
    const e = errs(b, 'тождество').map((i) => i.msg).join('\n');
    expect(e).toMatch(/тождество: of «parent»/);
    expect(e).toMatch(/с примечанием и стихами/);
    const b2 = copy();
    const t = b2.unions.find((u) => u.id === 'u-mered--iudiya')!.terms[0];
    t.cert = 'interpretation';
    expect(errs(b2, 'тождество').map((i) => i.msg).join()).toMatch(/у слова, сказанного текстом/);
  });
});

describe('Д-7: год в записи → ссылка на расчёт', () => {
  it('ни одного года в утверждениях; у переработанных — ссылка calc: модель до Соломона, схема — цари, остальное без модели', () => {
    expect(facts(base).filter(({ f }) => yearIn(f.value))).toEqual([]);
    const c = facts(base).filter(({ f }) => f.calc);
    expect(c).toHaveLength(323);
    const n = (p: (x: NonNullable<(typeof c)[number]['f']['calc']>) => boolean) => c.filter(({ f }) => p(f.calc!)).length;
    // Садок при Давиде — модель, как у Авиафара (второй ключ; решение координатора, п. 6)
    expect([n((x) => x.model === 'm-dolgoe'), n((x) => x.scheme === 's-mcfall-young'), n((x) => !x.model && !x.scheme)]).toEqual([98, 92, 133]);
    // событие — ссылка на стих записи: первый стих; где прежде был только конец службы — стих конца (повторная проверка,
    // Д-7 № 2): смерть Ирода — Мф 2:19, конец службы Феликса — Деян 24:27; что это конец, сказано в примечании
    const END: Record<string, string> = { 'p-irod-velikiy': 'Мф 2:19', 'p-feliks': 'Деян 24:27' };
    for (const { a, f } of c) {
      const v = f.value as any;
      expect(v.refs).toContain(f.calc!.event);
      if (a.id in END && f.field === 'offices' && v.refs.includes(END[a.id])) expect([f.calc!.event, v.note]).toEqual([END[a.id], expect.stringMatching(/^конец /)]);
      else expect(f.calc!.event).toBe(v.refs[0]);
    }
  });
  it('подложенные ошибки ссылки на расчёт ловятся', () => {
    const b = copy();
    const [x, y, z] = facts(b).filter(({ f }) => f.calc).map(({ f }) => f);
    x.calc = { ...x.calc!, model: 'm-tiele' };
    y.calc = { event: y.calc!.event, model: 'm-dolgoe', scheme: 's-thiele' };
    (z.value as any).year = -1000;
    const e = errs(b, 'расчёт').map((i) => i.msg).join('\n');
    expect(e).toMatch(/модель «m-tiele» не из 04 § 16.1/);
    expect(e).toMatch(/модель или схема, не обе/);
    expect(e).toMatch(/год в записи остался/);
  });
  it('событие расчёта — стих записи или история e-…; строка вместо ссылки — ошибка (Д-р8)', () => {
    const b = copy();
    const [x, y, z, s, ok] = facts(b).filter(({ f }) => f.calc).map(({ f }) => f);
    x.calc = { ...x.calc!, event: `конец — ${x.calc!.event}` };
    y.calc = { ...y.calc!, event: 'Откр 22:21' };
    z.calc = { ...z.calc!, event: 'e-net-takoy-istorii' };
    s.calc = { ...s.calc!, event: 'Быт 1' };
    ok.calc = { ...ok.calc!, event: b.stories![0].id };
    const e = errs(b, 'расчёт').map((i) => i.msg);
    expect(e.filter((m) => /не стих и не история/.test(m))).toHaveLength(2);
    expect(e.filter((m) => /«Откр 22:21» — не из стихов записи/.test(m))).toHaveLength(1);
    expect(e.filter((m) => /нет такой истории/.test(m))).toHaveLength(1);
    expect(e).toHaveLength(4);
  });
});

describe('Д-2: степень у вида «предок»', () => {
  it('у каждого «предка» степень; «выведена» — уровень «вывод» и не меньше двух стихов', () => {
    const anc = base.origins.filter((o) => o.kind === 'ancestor');
    expect(anc.filter((o) => !o.degree)).toEqual([]);
    const inf = anc.filter((o) => o.degree === 'inferred');
    expect(inf.map((o) => o.child).sort()).toEqual(['p-azariya-1par6-10', 'p-gofoliya', 'p-iiuy', 'p-ierokham-syn-pashkhura', 'p-lavan', 'p-oziya', 'p-zakhariya-syn-varakhii'].sort());
    for (const o of inf) expect([o.child, o.cert, o.refs.length >= 2]).toEqual([o.child, 'inference', true]);
    expect(anc.filter((o) => o.degree === 'unstated')).toHaveLength(360);
    // пропущенных, которых называет другое место, — перечнем (02 § 3.4): Иерохам (Неем 11:12), Ииуй (4Цар 9:2, 14)
    const e = (c: string) => inf.find((o) => o.child === c)!;
    expect([e('p-ierokham-syn-pashkhura').gap, e('p-ierokham-syn-pashkhura').skipped?.actors]).toEqual([true, ['p-zakhariya-syn-pashkhura', 'p-amtsiy-syn-zakharii', 'p-felaliya']]);
    expect(e('p-iiuy').skipped?.actors).toEqual(['p-iosafat-syn-namessii']);
    expect(e('p-lavan').skipped?.actors).toEqual(['p-vafuil']);
    expect(e('p-zakhariya-syn-varakhii').skipped?.actors).toEqual(['p-varakhiya-otets-zakharii']);
    expect(e('p-gofoliya').note).not.toMatch(/по 4Цар 8:18 она/);
    // примечания рёбер без «понимания» и «по деду»
    expect(anc.filter((o) => /пониман|по деду|в значении/.test(o.note ?? '')).map((o) => o.child)).toEqual([]);
  });
});

describe('подписи второго ключа (Д-партия-1-второй-ключ.md)', () => {
  it('подписаны Д-5 (23), Д-2 (368), Д-7 (323); отношения ar- и новые карточки — нет; допущено в выпуск 94', () => {
    const d1 = (base.checks ?? []).filter((c) => /Д-партия-1/.test(c.by));
    const n = (re: RegExp) => d1.filter((c) => re.test(c.key)).length;
    // было 323 и 714; Д-15 (D15-1): a-12965 («пребывал с Апостолами в горнице», Деян 1:13) получил idCert — подпись снята до второго ключа
    expect([n(/^(kin|union|redirect):/), n(/^origin:/), n(/^fact:/), d1.length]).toEqual([23, 368, 322, 713]);
    expect(d1.filter((c) => /^relation:|^actor:/.test(c.key))).toEqual([]);
    expect(d1.every((c) => c.kind === 'agent')).toBe(true);
    // снимок на время подписи: контрольный набор (103) + Д-партия 1; подписи следующих партий не считаются
    // было 118; Д-р11: подписи контрольного набора actor:p-avraam, actor:p-sarra, actor:p-irod-antipa сняты — у форм имён исправлены ссылки (−24 записи: лица и их утверждения)
    expect(admission(snapshot(base, CONTROL, D1), 'release').counts.all.admitted).toBe(94);
  });
});
