/**
 * Добавочный пакет Генеалогии для шага 2.0 «Генеалогия — механика» (10 § 4.2.1): номера и стихи рёбер, союзов и родства.
 *
 *   npx tsx prototypes/инструменты/данные/генеалогия.ts
 *
 * Указатель инструментов (`tools-index`) несёт рёбра без номера и без стихов (только вид, роль, прочтение, уровень). Листу
 * ребра, «Копировать источник», CSV и GEDCOM (03 § 21, § 22.3) нужны номер записи (`o-…`, `u-…`, `k-…`; В1) и стихи — их
 * этот файл берёт из записей base/, допущенных уровнем «проба» (одна функция допуска `tools/base/admit.ts`), и кладёт
 * по ключу ребра указателя: `ребёнок|родитель|роль|вид|набор`. Находка для `tools/pack/`: номер и стихи ребра нужны в
 * пакете Генеалогии (03 § 9 п. 1, п. 9). Карантин не идёт; уровень — «проба».
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBase } from '../../../tools/base/validate.ts';
import { admission } from '../../../tools/base/admit.ts';
import { baseFingerprint } from '../../../tools/base/bundle.ts';
import { PROBE_BANNER } from '../../../core/types.ts';

const OUT = join(import.meta.dirname, '..', 'public', 'data');
mkdirSync(OUT, { recursive: true });

const base = loadBase();
const A = admission(base, 'probe');
const R = admission(base, 'release');
const s = (id?: string) => (id ? id.replace(/^[a-z]-/, '') : '');
const signed = (key: string) => (R.okKey(key) ? 1 : 0);

type Rec = Record<string, unknown>;
interface Word { text: string; ref: string; saidBy?: { label: string } }

const origins: Record<string, Rec> = {};
for (const o of base.origins as unknown as (Rec & { id: string; child: string; parent: string; role: string; kind: string; refs: string[]; reading?: { set: string }; words?: Word[]; note?: string; refsShared?: boolean; candidates?: unknown[]; identity?: { degree: string } })[]) {
  if (!A.ok(o)) continue;
  const key = `${s(o.child)}|${s(o.parent)}|${o.role === 'father' ? 'f' : 'm'}|${o.kind}|${o.reading?.set ?? ''}`;
  origins[key] = {
    id: o.id,
    r: o.refs,
    ...(o.words?.length && { w: o.words.map((w) => ({ t: w.text, r: w.ref, ...(w.saidBy && { sb: w.saidBy.label }) })) }),
    ...(o.note && { n: o.note }),
    ...(o.refsShared && { sh: 1 }),
    ...(signed(`origin:${o.id}`) && { ok: 1 }),
  };
}

const unions: Record<string, Rec> = {};
for (const u of base.unions as unknown as (Rec & { id: string; husband: string; wife: string; terms: (Rec & { kind: string; word?: string; refs: string[]; cert?: string; note?: string; notMarriage?: { cert: string; refs: string[]; note?: string }; saidBy?: { label: string }; identity?: { degree: string } })[] })[]) {
  if (!A.ok(u)) continue;
  const terms = u.terms.filter((t) => A.part(t as { prov?: never }) && t.identity?.degree !== 'possible');
  if (!terms.length) continue;
  unions[`${s(u.husband)}|${s(u.wife)}`] = {
    id: u.id,
    t: terms.map((t) => ({
      k: t.kind,
      ...(t.word && { w: t.word }),
      r: t.refs,
      ...(t.cert && t.cert !== 'scripture' && { ce: t.cert }),
      ...(t.notMarriage && { nm: { ce: t.notMarriage.cert, r: t.notMarriage.refs } }),
      ...(t.saidBy && { sb: t.saidBy.label }),
    })),
    ...(signed(`union:${u.id}`) && { ok: 1 }),
  };
}

const kin: Record<string, Rec> = {};
for (const k of base.kin as unknown as (Rec & { id: string; from: string; to: string; rel: string; refs: string[] })[]) {
  if (!A.ok(k)) continue;
  kin[`${s(k.from)}|${s(k.to)}|${k.rel}`] = { id: k.id, r: k.refs, ...(signed(`kin:${k.id}`) && { ok: 1 }) };
}

const out = { schema: 1, admit: 'probe', banner: PROBE_BANNER, base: baseFingerprint().slice(0, 12), origins, unions, kin };
writeFileSync(join(OUT, 'genealogy-proto.json'), JSON.stringify(out));
const n = (x: object) => Object.keys(x).length;
console.log(`генеалогия: рёбер ${n(origins)}, союзов ${n(unions)}, родства словами ${n(kin)}; подписано рёбер ${Object.values(origins).filter((x) => x.ok).length}`);
