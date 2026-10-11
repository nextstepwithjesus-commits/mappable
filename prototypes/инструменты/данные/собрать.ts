/**
 * Данные рабочего прототипа пакета 1 «Истории и Время» (10 § 4.2.2; 09 § 10.1: пакеты уровня «проба» с плашкой, свой адрес).
 *
 *   npx tsx prototypes/инструменты/данные/собрать.ts
 *
 * 1. Копирует пакеты пробы `dist-pack-probe/` (сборка `tools/pack/build.ts --probe`: опись, ядро индекса, указатель, карточки,
 *    тексты книг) в `prototypes/инструменты/public/data/pack/` — их читает загрузчик ядра `core/loader.ts`.
 * 2. Пишет добавочный пакет прототипа `public/data/proto.json`: истории, эпохи, опоры, хронологию лиц сцен, параллельные
 *    тексты и классы стихов — из записей base/, допущенных уровнем «проба» (одна функция допуска `tools/base/admit.ts`).
 *    Ядро индекса пока несёт `stories: []` (сборка пакетов историй не кладёт) — это находка прототипа для `tools/pack/`.
 *    У каждой записи — ключ допуска и статус: экраны пишут ключ в `data-key`, опись сцен (10 § 3.3) собирается из них.
 * Карантин в пакет не идёт. Уровень пакета — «проба», плашку убрать нельзя (09 § 5.2 п. 7).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBase } from '../../../tools/base/validate.ts';
import { admission } from '../../../tools/base/admit.ts';
import { baseFingerprint } from '../../../tools/base/bundle.ts';
import { PROBE_BANNER } from '../../../core/types.ts';
import { compareRefs } from '../../../core/books.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const OUT = join(import.meta.dirname, '..', 'public', 'data');
const PACK = join(ROOT, 'dist-pack-probe');

if (!existsSync(join(PACK, 'manifest.json'))) throw new Error('нет dist-pack-probe/: сначала npx tsx tools/pack/build.ts --probe');
const man = JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8')) as { admit: string };
if (man.admit !== 'probe') throw new Error('dist-pack-probe/ — не проба');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(PACK, join(OUT, 'pack'), { recursive: true });

const base = loadBase();
const A = admission(base, 'probe');
const R = admission(base, 'release');
type Rec = Record<string, unknown>;
const status = (key: string): string => A.status.get(key)?.status ?? 'нет';

/** Ключи, которые экраны выводят, и их статус: «checked» — подписано вторым ключом (допущено «выпуском»). */
const keys: Record<string, string> = {};
const take = (key: string): boolean => {
  if (!A.okKey(key)) return false;
  keys[key] = R.okKey(key) ? 'checked' : status(key);
  return true;
};

// ---------- истории ----------
interface StoryLike { id: string; level: string; accounts: { refs: string[] }[]; actors: { actor: string }[]; links: { refs: string[]; kind: string; action?: boolean; sameBook?: boolean }[]; partOf?: string }
const stories = (base.stories as unknown as (StoryLike & Rec)[]).filter((s) => take(`story:${s.id}`));
for (const s of stories) for (const a of s.actors) if (a.actor.startsWith('p-')) take(`actor:${a.actor}`);

// ---------- эпохи, опоры, хронология лиц сцен ----------
const epochs = (base.epochs as unknown as ({ id: string } & Rec)[]).filter((e) => take(`epoch:${e.id}`));
const anchorsAll = ((base.anchors as { anchors?: ({ id: string } & Rec)[] }).anchors ?? []);
const anchors = anchorsAll.filter((a) => take(`anchor:${a.id}`));
/** Лица сцен Времени: родословия Быт 5 и 11 (Адам — Аврам), Исход (главные лица эпохи), цари 4 Цар 15–18 и все с царствованием. */
const LINE = ['p-adam', 'p-sif', 'p-enos', 'p-kainan', 'p-maleleil', 'p-iared', 'p-enokh', 'p-mafusal', 'p-lamekh', 'p-noy', 'p-sim', 'p-kham', 'p-iafet', 'p-arfaksad', 'p-kainan-syn-arfaksada', 'p-sala', 'p-ever', 'p-falek', 'p-ragav', 'p-serukh', 'p-nakhor', 'p-farra', 'p-avraam'];
const exodus = epochs.find((e) => e.id === 'era-exodus') as { keyPersons?: string[] } | undefined;
const chronoAll = base.chrono as unknown as ({ actor: string; chrono: Rec } & Rec)[];
const want = new Set([...LINE, ...(exodus?.keyPersons ?? []), ...epochs.flatMap((e) => (e as { keyPersons?: string[] }).keyPersons ?? [])]);
const правит = (c: { chrono: Rec }) => 'reign' in c.chrono || ((c.chrono.inputs as { kind: string }[] | undefined) ?? []).some((i) => i.kind === 'reign');
const chrono = chronoAll.filter((c) => (want.has(c.actor) || правит(c)) && take(`chrono:${c.actor}`));
for (const c of chrono) take(`actor:${c.actor}`);
for (const p of want) take(`actor:${p}`);

// ---------- модели хронологии и схемы царей (02 § 3.15.2–3.15.3; 04 § 16.1): файл базы, статус — у файла ----------
const models = (JSON.parse(readFileSync(join(ROOT, 'base', 'models.json'), 'utf8')) as { items: Rec[] }).items;

// ---------- параллельные тексты, классы стихов, отношения ----------
const textParallels = (base.textParallels as unknown as ({ id: string } & Rec)[]).filter((t) => take(`textparallel:${t.id}`));
const vclasses = (base.verseClasses as unknown as ({ book: string; ch: number; from: number; to: number } & Rec)[]).filter((c) => take(`vclass:${c.book} ${c.ch}:${c.from}-${c.to}`));
const relations = (base.relations as unknown as ({ a: string; b: string; kind: string } & Rec)[]).filter((r) => take(`relation:${r.a}|${r.b}|${r.kind}`));

// ---------- каталог по книгам: истории с рассказом в книге, по порядку текста ----------
const book = (ref: string) => /^\s*([1-4]?[А-Яа-яЁё]+)/.exec(ref)?.[1] ?? '';
const catalog: Record<string, { id: string; ref: string }[]> = {};
for (const s of stories) {
  if (s.level !== 'story') continue;
  const seen = new Set<string>();
  for (const acc of s.accounts) {
    const b = book(acc.refs[0] ?? '');
    if (!b || seen.has(b)) continue;
    seen.add(b);
    const refs = s.accounts.filter((x) => book(x.refs[0] ?? '') === b).flatMap((x) => x.refs);
    (catalog[b] ??= []).push({ id: s.id, ref: refs.join('; ') });
  }
}
for (const b of Object.keys(catalog)) catalog[b].sort((x, y) => compareRefs(x.ref, y.ref));
// «Упоминается здесь»: истории других книг, которые эта книга упоминает (виды 2–4, 11 § 4.5)
const mentions: Record<string, { id: string; ref: string; kind: string }[]> = {};
for (const s of stories) for (const l of s.links) {
  if (l.sameBook || !['retelling', 'mention', 'allusion'].includes(l.kind)) continue;
  const b = book(l.refs[0] ?? '');
  (mentions[b] ??= []).push({ id: s.id, ref: l.refs.join('; '), kind: l.kind });
}
for (const b of Object.keys(mentions)) mentions[b].sort((x, y) => compareRefs(x.ref, y.ref));

const proto = {
  schema: 1,
  admit: 'probe',
  banner: PROBE_BANNER,
  base: baseFingerprint().slice(0, 12),
  storyChapters: base.storyChapters,
  catalog,
  mentions,
  stories,
  epochs,
  anchors,
  chrono,
  textParallels,
  vclasses,
  relations,
  models,
  keys,
  counts: { stories: stories.length, signed: Object.values(keys).filter((s) => s === 'checked').length, keys: Object.keys(keys).length },
};
writeFileSync(join(OUT, 'proto.json'), JSON.stringify(proto));
console.log(`данные прототипа: историй ${stories.length}, эпох ${epochs.length}, опор ${anchors.length}, хронология ${chrono.length} лиц; ключей ${proto.counts.keys}, из них подписано ${proto.counts.signed}`);
