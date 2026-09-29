/**
 * Ключ связи (этап 11, решения 78 и 83): запись для адреса «~c» туда и обратно, концы связи, отказ на битых записях.
 */
import { describe, expect, it } from 'vitest';
import { graph } from '../src/data/atlas.ts';
import { buildUnions } from '../src/engine/unions.ts';
import { linkEnds, linkKeyString, parseLinkKey, sameLink, unionParts, type LinkKey } from '../src/engine/linkkey.ts';

const U = buildUnions(graph);

describe('ключ связи', () => {
  it('туда и обратно для всех союзов и всех детей данных; запись — только [a-z0-9._-]', () => {
    let n = 0;
    for (const u of U.byId.values()) {
      const keys: LinkKey[] = [{ kind: 'union', union: u.id }, ...u.kids.map((c) => ({ kind: 'child' as const, union: u.id, child: c }))];
      for (const p of [u.a, u.b]) if (p) keys.push({ kind: 'spouse', union: u.id, person: p });
      for (const k of keys) {
        const s = linkKeyString(k);
        expect(s, JSON.stringify(k)).not.toBeNull();
        expect(s!).toMatch(/^[a-z0-9._-]+$/);
        expect(parseLinkKey(s!), s!).toEqual(k);
        n++;
      }
    }
    expect(n).toBeGreaterThan(2000);
  });
  it('союз с иным утверждением (по Луке, по закону) и неназванное место', () => {
    const u = [...U.byId.values()].find((x) => x.claim && x.id.includes('~'));
    expect(u).toBeDefined();
    const k: LinkKey = { kind: 'child', union: u!.id, child: u!.kids[0] };
    expect(parseLinkKey(linkKeyString(k)!)).toEqual(k);
    expect(unionParts('u:set+')).toEqual({ a: 'set', b: null, claim: null });
    expect(linkKeyString({ kind: 'union', union: 'u:set+' })).toBe('u.set._._');
    expect(parseLinkKey('u.set._._')).toEqual({ kind: 'union', union: 'u:set+' });
  });
  it('шаг линии и родство словами Писания', () => {
    expect(linkKeyString({ kind: 'step', line: 'joseph', child: 'solomon' })).toBe('r.j.solomon');
    expect(parseLinkKey('r.m.nafan-syn-davida')).toEqual({ kind: 'step', line: 'mary', child: 'nafan-syn-davida' });
    expect(parseLinkKey('n.david.saruiya')).toEqual({ kind: 'kin', a: 'david', b: 'saruiya' });
  });
  it('битые записи не разбираются', () => {
    for (const s of ['', 'x.a.b', 'k.a.b._', 'k._._._.iosif', 'u.A.b._', 'r.x.iosif', 'r.j.', 'n.a', 'k.a.b.c.d.e', 'u.a.b.Legal', 'k.a.b._.Иосиф'])
      expect(parseLinkKey(s), s).toBeNull();
  });
  it('концы связи и равенство ключей', () => {
    const k: LinkKey = { kind: 'child', union: 'u:iakov+rakhil', child: 'iosif' };
    expect(linkEnds(k)).toEqual({ from: ['iakov', 'rakhil'], to: ['iosif'] });
    expect(linkEnds({ kind: 'spouse', union: 'u:iakov+rakhil', person: 'rakhil' })).toEqual({ from: ['rakhil'], to: ['iakov'] });
    expect(linkEnds({ kind: 'step', line: 'joseph', child: 'solomon' }, () => 'david')).toEqual({ from: ['david'], to: ['solomon'] });
    expect(sameLink(k, { kind: 'child', union: 'u:iakov+rakhil', child: 'iosif' })).toBe(true);
    expect(sameLink(k, { kind: 'union', union: 'u:iakov+rakhil' })).toBe(false);
    expect(sameLink(k, null)).toBe(false);
  });
});
