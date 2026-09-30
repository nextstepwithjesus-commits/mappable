/**
 * «Писание молчит» только там, где молчит (этап 13, решение 128; TOL 001): ни один раздел из card.silent не противоречит
 * данным — занятию в § 5 или в ролях, супругам, детям, числам и местам рождения и смерти (tools/silent-check.ts).
 * Правило ловит сам случай аналитика: Иаков, § 16 — «пас стада Лавана».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Volume } from '../src/data/types.ts';
import { silentConflicts, OCCUPATION } from '../tools/silent-check.ts';

const ROOT = join(__dirname, '..');
const persons: Person[] = [];
{
  const seen = new Set<string>();
  const dir = join(ROOT, 'data/persons');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort())
    for (const p of (JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume).persons) if (!seen.has(p.id)) (seen.add(p.id), persons.push(p));
}
const byId = new Map(persons.map((p) => [p.id, p]));
const clone = (p: Person): Person => JSON.parse(JSON.stringify(p));

describe('card.silent против данных (решение 128)', () => {
  it('по всем лицам: 0 противоречий', () => {
    expect(silentConflicts(persons).map((x) => `${x.id} § ${x.section}: ${x.why}`)).toEqual([]);
  });
  it('Иаков: § 16 не «молчит» — «пас овец и коз Лавана» в § 16 со стихами Быт 31:38–41', () => {
    const j = byId.get('iakov')!;
    expect(j.card!.silent ?? []).not.toContain(16);
    expect(j.card!.offices!.some((o) => /пас/.test(o.title) && o.refs.includes('Быт 31:38-41'))).toBe(true);
    // правило ловит прежние данные: занятие в § 5 при § 16 в silent
    const old = clone(j);
    delete old.card!.offices;
    old.card!.status = [...(old.card!.status ?? []), { text: 'Двадцать лет пас стада Лавана', refs: ['Быт 31:38-41'] }];
    old.card!.silent = [16];
    expect(silentConflicts([old])).toEqual([expect.objectContaining({ id: 'iakov', section: 16 })]);
  });
  it('Рахиль и Исаак: занятие — в § 16', () => {
    expect(byId.get('rakhil')!.card!.offices!.map((o) => o.title)).toContain('Пасла мелкий скот отца');
    expect(byId.get('isaak')!.card!.offices!.some((o) => /сеял/.test(o.title))).toBe(true);
    for (const id of ['rakhil', 'isaak', 'agar', 'valla', 'zelfa', 'raav', 'lot', 'lavan']) expect(byId.get(id)!.card!.silent ?? [], id).not.toContain(16);
  });
  it('правило: супруги (§ 9), дети (§ 10), числа рождения (§ 8), место погребения (§ 20), роль-служение (§ 16)', () => {
    const a = { id: 'a', name: 'А', sex: 'm', group: 'g', prominence: 1, roles: ['priest'], chrono: { born: { fatherAge: 30, refs: ['Быт 5:3'] }, died: { age: 90, refs: ['Быт 5:5'] } }, spouses: [{ id: 'b', refs: ['Быт 4:1'] }], card: { silent: [8, 9, 10, 16, 20] } } as unknown as Person;
    const b = { id: 'b', name: 'Б', sex: 'f', group: 'g', prominence: 1, card: { silent: [9, 20], places: [{ name: 'Махпела', role: 'burial', refs: ['Быт 23:19'] }] } } as unknown as Person;
    const c = { id: 'c', name: 'В', sex: 'm', group: 'g', prominence: 1, father: 'a', card: { silent: [16] } } as unknown as Person;
    const got = silentConflicts([a, b, c]).map((x) => `${x.id}${x.section}`).sort();
    expect(got).toEqual(['a10', 'a16', 'a20', 'a8', 'a9', 'b20', 'b9']);
  });
  it('занятие в § 5 — слово о труде самого лица, не «родоначальник», «правителя», «сын рабыни»', () => {
    for (const t of ['Двадцать лет пас стада Лавана', 'Пасла мелкий скот отца', 'Служанка, рабыня Сарры', 'Блудница в Иерихоне', 'Раб первосвященника']) expect(OCCUPATION.test(t), t).toBe(true);
    for (const t of ['Родоначальник рода', 'Отец Зоровавеля, правителя Иудеи', 'Сын рабыни, рождённый «по плоти»', 'Госпожа служанки-Египтянки Агари']) expect(OCCUPATION.test(t), t).toBe(false);
  });
});
