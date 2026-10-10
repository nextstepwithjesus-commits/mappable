/** Сборка данных для приложения (docs/app/02-ДАННЫЕ.md, § 8): индекс поиска и указателя — в бюджете. */
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildCards, buildIndex, BUDGET_INDEX_GZ } from '../tools/base/bundle.ts';
import { buildBase } from '../tools/base/migrate.ts';

describe('сборка для приложения', () => {
  it('выпуск: тождество «предположительно» — у ребра; у ребёнка без родителя — строка со стихом; толкования без авторов нет (Р5-1, Р5-2)', () => {
    const base = buildBase();
    const ix = buildIndex(base, 'probe');
    const { cards } = buildCards(base, 'probe');
    const possible = ix.origins.filter((o: any) => o.id?.d === 'possible');
    expect(possible.length).toBe(base.origins.filter((o) => o.identity?.degree === 'possible').length);
    expect(possible.length).toBeGreaterThanOrEqual(48);
    for (const o of possible) expect([o.c, !!o.id.n, o.id.r.length > 0]).toEqual([o.c, true, true]);
    const card = (id: string) => Object.values(cards).map((v: any) => v.cards[id]).find(Boolean) as any;
    // дети, у которых рёбра к родителю сняты (C46) и в выпуске родителя нет, — строка «… текст не уточняет» со стихом
    const children = new Set(ix.origins.map((o: any) => o.c));
    const orphans = ['maresha-otets-khevrona', 'garum', 'shimey-1par23-9', 'kimgam', 'efan-ezrakhityanin', 'eman-syn-makhola', 'iisus-rod-pakhaf-moava', 'ioav-rod', 'shilon', 'khabayya', 'molekhef'];
    for (const id of orphans) {
      expect([id, children.has(id)]).toEqual([id, false]);
      const line = card(id).f.find((f: any) => f.f === 'parentsNote');
      expect([id, line?.v.refs.length > 0]).toEqual([id, true]);
    }
    // у Ионафана отец по словам текста — Гирсон, сын Манассии (Р5-3)
    expect(ix.origins.find((o: any) => o.c === 'ionafan-syn-girsama')?.p).toBe('girson-syn-manassii');
    // примечания снятых рёбер (толкование без авторов) в карточки не идут — ни в пробе, ни в выпуске
    for (const lvl of ['probe', 'release'] as const) {
      const s = JSON.stringify(buildCards(base, lvl).cards);
      expect(s).not.toContain('Прежнее ребро');
    }
  }, 120_000);
  it('индекс — не больше 200 КБ в gzip', () => {
    const s = JSON.stringify(buildIndex(buildBase(), 'probe'));
    expect(gzipSync(s, { level: 9 }).length).toBeLessThanOrEqual(BUDGET_INDEX_GZ);
  }, 60_000);
  it('пометка «по словам …» и авторы толкований идут в индекс (02 § 3.6, § 3.4)', () => {
    const ix = buildIndex(buildBase(), 'probe');
    const said = { a: 'avraam', r: 'Быт 20:12', l: 'по словам Авраама' };
    expect(ix.kin.find((k: any) => k.f === 'sarra' && k.t === 'avraam' && k.r === 'сестра')?.sb).toEqual(said);
    expect(ix.origins.find((o: any) => o.c === 'sarra' && o.p === 'farra')?.sb).toEqual(said);
    const r = ix.readings.find((x: any) => x.id === 'r-lk3-23')!.r;
    for (const x of r.filter((y: any) => y.ce === 'interpretation')) expect([x.id, (x.au ?? []).length > 0]).toEqual([x.id, true]);
    expect(r.filter((y: any) => y.ce === 'scripture').map((y: any) => y.au)).toEqual([undefined, undefined]);
  }, 60_000);
});
