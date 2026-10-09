# Позиция Давида и Моисея в уровне 2 дерева меток при разных порядках; тёзки в эпохе (одинаковые имена в одном списке)
import json, glob, sys, collections
R = sys.argv[1]
EP = json.load(open(R + '/base/epochs.json', encoding='utf-8'))['items']
CH = {x['actor']: x['chrono'] for x in json.load(open(R + '/base/chrono.json', encoding='utf-8'))['items']}
A = {}
for f in glob.glob(R + '/base/actors/*.json'):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        A[a['id']] = a
def nm(i):
    a = A[i]; m = [n['form'] for n in a.get('names', []) if n.get('type') == 'main']
    return (m or [a.get('names', [{}])[0].get('form', i)])[0]
def ep_of(c):
    if 'epoch' in c: return [c['epoch']]
    ys = []
    for k in ('born', 'died'):
        if isinstance(c.get(k), dict) and 'year' in c[k]: ys.append(c[k]['year'])
    if isinstance(c.get('active'), dict):
        for k in ('from', 'to', 'start', 'end'):
            if k in c['active'] and isinstance(c['active'][k], int): ys.append(c['active'][k])
    if isinstance(c.get('reign'), dict):
        for k in ('from','to','start','end'):
            if k in c['reign'] and isinstance(c['reign'][k], int): ys.append(c['reign'][k])
    if not ys: return []
    lo, hi = min(ys), max(ys)
    return [e['id'] for e in EP if e['start'] <= hi and e['end'] >= lo]
members = collections.defaultdict(list)
multi = 0
for i, c in CH.items():
    es = ep_of(c)
    if len(es) > 1: multi += 1
    for e in es: members[e].append(i)
print('лиц хотя бы в одной эпохе:', len({i for v in members.values() for i in v}), '; в двух и больше эпохах:', multi)
for e in EP:
    m = members[e['id']]
    names = sorted(nm(i) for i in m)
    dup = sum(v for v in collections.Counter(names).values() if v > 1)
    print(e['short'], 'лиц:', len(m), '; с одинаковым именем в списке эпохи:', dup)
for pid in ('p-moisey', 'p-david'):
    for e in EP:
        m = members[e['id']]
        if pid in m:
            names = sorted(nm(i) for i in m)
            print(pid, e['short'], 'по алфавиту — позиция', names.index(nm(pid)) + 1, 'из', len(m))
# sample of active structure
ex = next(c for c in CH.values() if 'active' in c); print(json.dumps(ex, ensure_ascii=False)[:200])
ex = next(c for c in CH.values() if 'reign' in c); print(json.dumps(ex, ensure_ascii=False)[:200])
