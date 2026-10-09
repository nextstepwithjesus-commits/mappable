# Рецензия доступности на 03: тёзки и доступное имя.
# Запуск из корня: python3 -I "docs/app/data/03-доступность/тёзки.py"
# Состав Генеалогии — по определению 03, приложение А (как docs/app/data/03-числа.py).
import json, glob, collections

A = {a['id']: a for f in glob.glob('base/actors/*.json') for a in json.load(open(f))['items']}
O = json.load(open('base/origins.json'))['items']
U = json.load(open('base/unions.json'))['items']
K = json.load(open('base/kin.json'))['items']
R = {r['id']: r['default'] for r in json.load(open('base/readings.json'))['items']}
act = lambda o: (not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']

G = set()
for o in O:
    if o.get('parent'):
        G |= {o['child'], o['parent']}
for u in U:
    G |= {u['husband'], u['wife']}
G |= {k['from'] for k in K} | {k['to'] for k in K}
nm = lambda i: A[i]['names'][0]['form']
dis = lambda i: (A[i].get('disambig') or '').strip()

print('1. Лиц в Генеалогии:', len(G))
c = collections.Counter(nm(i) for i in G)
ns = [i for i in G if c[nm(i)] > 1]
print('2. Тёзки (главное имя есть ещё у одного лица Генеалогии):', len(ns),
      f'({100*len(ns)/len(G):.0f} %), имён:', sum(1 for v in c.values() if v > 1))
print('   больше всех:', c.most_common(6))
nod = [i for i in ns if not dis(i)]
print('3. Тёзки без уточнения в данных (disambig пусто):', len(nod), [nm(i) + '/' + i for i in nod[:8]])
pair = collections.Counter((nm(i), dis(i)) for i in ns)
dup = {k: v for k, v in pair.items() if v > 1}
print('4. Пары «имя, уточнение», которые всё равно совпадают:', len(dup), list(dup.items())[:6])
L = sorted(len(nm(i) + ', ' + dis(i)) for i in ns if dis(i))
med = L[len(L)//2]
print('5. Длина «имя, уточнение» у тёзок, знаков: медиана', med, '; 90-й процентиль', L[int(len(L)*.9)],
      '; больше 60 знаков:', sum(1 for x in L if x > 60), '; наибольшая', L[-1])

# Семейная страница (03 § 6.5): лицо, родители, супруги, дети, братья и сёстры.
par = collections.defaultdict(set); kids = collections.defaultdict(set); sp = collections.defaultdict(set)
for o in O:
    if o.get('parent') and act(o):
        par[o['child']].add(o['parent']); kids[o['parent']].add(o['child'])
for u in U:
    sp[u['husband']].add(u['wife']); sp[u['wife']].add(u['husband'])
def fam(x):
    s = {x} | par[x] | sp[x] | kids[x]
    for p in par[x]:
        s |= kids[p]
    return s
clash = []
for x in G:
    f = fam(x)
    cc = collections.Counter(nm(i) for i in f)
    d = [n for n, v in cc.items() if v > 1]
    if d:
        clash.append((nm(x), x, d))
print('6. Семейных страниц, где два разных лица носят одно имя:', len(clash))
for row in sorted(clash)[:12]:
    print('   ', row)
sib = 0
for p, ks in kids.items():
    cc = collections.Counter(nm(i) for i in ks)
    sib += sum(1 for v in cc.values() if v > 1)
print('7. Родителей, у которых двое детей с одним именем:', sib)

# Линии Мессии: повторы имён внутри столбца
for fn in ('joseph', 'luke'):
    P = json.load(open(f'base/lines/{fn}.json'))['persons']
    cc = collections.Counter(nm(p['id']) for p in P)
    print(f'8. Линия {fn}: лиц {len(P)}; повторяются в столбце:', {k: v for k, v in cc.items() if v > 1})

# 7а. Только кровные дети (без групп «из сыновей такого-то»)
kn = collections.defaultdict(set); ka = collections.defaultdict(set)
for o in O:
    if o.get('parent') and act(o):
        (kn if o['kind'] != 'ancestor' else ka)[o['parent']].add(o['child'])
ex = []
for p, ks in kn.items():
    cc = collections.Counter(nm(i) for i in ks)
    for n, v in cc.items():
        if v > 1: ex.append((nm(p), n, v))
print('7а. Кровные дети одного родителя с одним именем:', len(ex), ex[:8])
gr = []
for p, ks in ka.items():
    cc = collections.Counter(nm(i) for i in ks)
    r = sum(v for v in cc.values() if v > 1)
    if r: gr.append((nm(p), len(ks), r))
print('7б. Группы «из сыновей»: где внутри повторяются имена (предок, размер, лиц с повтором):', sorted(gr, key=lambda x: -x[2])[:6])
print('9. Пример: семья Авессалома —', sorted(nm(i) + ' (' + dis(i) + ')' for i in fam('p-avessalom') if nm(i) in ('Фамарь', 'Мааха')))
