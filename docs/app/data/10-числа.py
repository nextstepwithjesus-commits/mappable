"""Числа документа 10 «План разработки».

Запуск из корня: python3 -I docs/app/data/10-числа.py
Читает базу base/ и журнал подписей base/checks.json. Ничего не пишет.
Ключи записей — как в tools/base/admit.ts (actor:, fact:, origin:, union:, kin:, nodata:, chrono:, membership:, line:, epoch:).
Считает, сколько записей нужно подписать вторым ключом, чтобы сцены показа владельцу (08 § 10.2) шли на уровне «выпуск».
"""
import glob, json, os, re, collections

ROOT = os.getcwd()
B = lambda *p: os.path.join(ROOT, 'base', *p)
load = lambda p: json.load(open(p, encoding='utf-8'))


def part(t):
    print(f'\n== {t}')


# ---------- записи и ключи ----------
recs = []  # (key, coll, actors, refs)
seen = collections.Counter()


def add(coll, key, actors, refs):
    seen[key] += 1
    k = key if seen[key] == 1 else f'{key}#{seen[key]}'
    recs.append((k, coll, set(a for a in actors if a), list(refs or [])))


def frefs(v):
    if isinstance(v, dict):
        out = list(v.get('refs', []) or [])
        for x in v.values():
            if isinstance(x, (dict, list)):
                out += frefs(x)
        return out
    if isinstance(v, list):
        out = []
        for x in v:
            out += frefs(x)
        return out
    return []


actors = {}
for f in sorted(glob.glob(B('actors', '*.json'))):
    for a in load(f)['items']:
        actors[a['id']] = a
        add('actor', f"actor:{a['id']}", [a['id']], [r for n in a.get('names', []) for r in n.get('refs', [])])
        for fa in a.get('facts', []):
            add('fact', f"fact:{a['id']}|{fa['sec']}|{fa['field']}", [a['id']], frefs(fa.get('value')))
for o in load(B('origins.json'))['items']:
    add('origin', f"origin:{o['child']}|{o.get('parent') or '?'}|{o['role']}|{'p' if o.get('primary') else 'o'}",
        [o['child'], o.get('parent')], o.get('refs'))
for u in load(B('unions.json'))['items']:
    add('union', f"union:{u['id']}", [u.get('husband'), u.get('wife')], frefs(u.get('terms')))
for k in load(B('kin.json'))['items']:
    add('kin', f"kin:{k['from']}|{k['to']}|{k['rel']}", [k['from'], k['to']], k.get('refs'))
for n in load(B('nodata.json'))['items']:
    add('nodata', f"nodata:{n['actor']}|{n['sec']}|{n['kind']}", [n['actor']], n.get('refs'))
for c in load(B('chrono.json'))['items']:
    add('chrono', f"chrono:{c['actor']}", [c['actor']], frefs(c.get('chrono')))
for m in load(B('memberships.json'))['items']:
    add('membership', f"membership:{m['actor']}|{m['area']}", [m['actor']], m.get('refs'))
lines = {os.path.basename(f)[:-5]: load(f) for f in glob.glob(B('lines', '*.json'))}
for k, l in lines.items():
    add('line', f'line:{k}', [p['id'] for p in l.get('persons', [])], l.get('refs'))
epochs = load(B('epochs.json'))['items']
for e in epochs:
    add('epoch', f"epoch:{e['id']}", [(e.get('startRule') or {}).get('person'), (e.get('endRule') or {}).get('person')], e.get('refs'))

signed = {c['key'] for c in load(B('checks.json'))['items']}

part('1. База и подписи')
cnt = collections.Counter(c for _, c, _, _ in recs)
sig = collections.Counter(c for k, c, _, _ in recs if k in signed)
print('записей всего (ключей допуска, без областей, прочтений, переадресаций):', len(recs))
for c in cnt:
    print(f'  {c}: {cnt[c]}; подписано {sig[c]}')
print('подписей в журнале:', len(signed))

# ---------- сцены ----------
origins = load(B('origins.json'))['items']


def children(pid):
    return {o['child'] for o in origins if o.get('parent') == pid}


def scope(name, people, colls=None, edges_between=False, touch=False):
    people = set(people)
    sel = []
    for k, c, acts, _ in recs:
        if colls and c not in colls:
            continue
        if not acts:
            continue
        if c in ('origin', 'union', 'kin') and edges_between:
            ok = acts <= people
        elif c == 'line':
            ok = False
        else:
            ok = bool(acts & people) if (touch or c not in ('origin', 'union', 'kin')) else acts <= people
        if ok:
            sel.append((k, c))
    n = len(sel)
    s = sum(1 for k, _ in sel if k in signed)
    by = collections.Counter(c for _, c in sel)
    print(f'  {name}: лиц {len(people)}; записей {n}; подписано {s}; осталось {n - s}  ({", ".join(f"{c} {by[c]}" for c in by)})')
    return n - s


part('2. Генеалогия — сцены пакета 2 (08 § 10.2): лица, рёбра и союзы между ними, без утверждений карточек')
G = {'actor', 'origin', 'union', 'kin'}
avr = {'p-avraam', 'p-sarra', 'p-agar', 'p-khettura'} | children('p-avraam')
scope('Авраам и три союза', avr, G)
iak = {'p-iakov'} | children('p-iakov')
for o in origins:
    if o['child'] in children('p-iakov') and o.get('role') == 'mother':
        iak.add(o['parent'])
scope('Иаков и его дети, их матери', iak, G)
lp = set()
for l in lines.values():
    lp |= {p['id'] for p in l['persons']}
scope('Линии Мессии (лица обеих линий)', lp, G)
noy = {'p-noy'} | children('p-noy')
scope('семья Ноя (проба Т1)', noy, G)
allg = {a for a in actors if actors[a].get('kind') in ('human', None)}
scope('весь лес (все люди базы)', allg, G)

part('3. Карточка — сцены пакета 3 и проб 07 § 16: все записи лица (утверждения, «нет сведений», время, рёбра, союзы)')
for pid in ('p-david', 'p-noy', 'p-sarra', 'p-iliy-syn-matfata', 'p-ila-syn-vaasy', 'p-irad', 'p-uts-syn-nakhora'):
    if pid in actors:
        scope(pid, {pid}, None, touch=True)
    else:
        print(f'  {pid}: нет в базе')
zak = [a for a in actors if a.startswith('p-zakhariya')]
print('  тёзок «Захария» (номера p-zakhariya…):', len(zak))

part('4. Время — пакет 1: Быт 5 и Быт 11 (Адам — Аврам), Ной и сыновья; эпохи; опоры')
seq = ['p-adam', 'p-sif', 'p-enos', 'p-kainan', 'p-maleleil', 'p-iared', 'p-enokh', 'p-mafusail', 'p-lamekh', 'p-noy']
jl = [p['id'] for p in lines['joseph']['persons']]
i = jl.index('p-avraam') if 'p-avraam' in jl else 20
chain = set(jl[:i + 1]) | children('p-noy')
scope('Адам — Аврам и сыновья Ноя: лица и время', chain, {'actor', 'chrono'})
print('  эпох:', len(epochs), '; с подписью:', sum(1 for e in epochs if f"epoch:{e['id']}" in signed))
anc = load(B('anchors.json'))['anchors']
print('  опор:', len(anc), '; со страницей источника:', sum(1 for a in anc if a.get('page')))
chrono = load(B('chrono.json'))['items']
syn = sum(len((c.get('chrono') or {}).get('synchronisms', []) or []) for c in chrono)
print('  записей времени:', len(chrono))

part('5. Истории — книги прототипа 11 § 7.4: лица, названные в главах')
pr = {'Руф': range(1, 5), '1Цар': range(16, 32), 'Мк': range(1, 4), 'Деян': range(1, 6), 'Быт': range(1, 12)}
chap = sum(len(r) for r in pr.values())
rx = re.compile(r'^(\S+) (\d+)')
hit = set()
for k, c, acts, refs in recs:
    if c != 'actor':
        continue
    for r in refs:
        m = rx.match(r)
        if m and m.group(1) in pr and int(m.group(2)) in pr[m.group(1)]:
            hit |= acts
            break
print(f'  глав: {chap}; лиц базы, у которых стих основного или другого имени в этих главах: {len(hit)}')
scope('эти лица: лица и рёбра между ними', hit, G)

part('6. Связи и География — записей нет')
print('  связей в базе: 0 (06 § 9.1); мест в базе: 0 (05 § 10); историй в базе: 0 (11 § 11.4)')
