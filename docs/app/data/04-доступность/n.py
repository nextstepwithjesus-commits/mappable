# Числа для рецензии доступности на 04: размер дерева меток, шаги, высоты эпох на телефоне
import json, collections, glob, sys
R = sys.argv[1]
EP = json.load(open(R + '/base/epochs.json', encoding='utf-8'))['items']
CH = json.load(open(R + '/base/chrono.json', encoding='utf-8'))['items']
names = {}
for f in glob.glob(R + '/base/actors/*.json'):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        names[a['id']] = a.get('name') or a.get('names', [''])[0] if isinstance(a.get('names'), list) else a.get('name')
by = collections.Counter(x['chrono']['epoch'] for x in CH if 'epoch' in x['chrono'])
print('лиц в базе (actors):', len(names))
print('эпоха | лиц со строкой эпохи | keyPersons | лет | est')
tot = 0
for i, e in enumerate(EP, 1):
    n = by.get(e['id'], 0); tot += n
    print(i, e['name'], '|', n, '|', len(e.get('keyPersons', [])), '|', e['end'] - e['start'], '|', bool(e.get('startEst') or e.get('endEst')))
print('всего лиц в уровне 2 по строке эпохи:', tot)
print('наибольшая эпоха:', max(by.items(), key=lambda t: t[1]))
# моисей и давид
for pid in ('p-moisey', 'p-david'):
    c = [x for x in CH if x['actor'] == pid]
    print(pid, json.dumps(c, ensure_ascii=False)[:300])
# порядок эпох до 5 и 8 в дереве
ids = [e['id'] for e in EP]
print('индексы эпох: Исход', [i for i,e in enumerate(EP,1) if e['short'].startswith('Исход')], 'Царство', [i for i,e in enumerate(EP,1) if e['short']=='Царство'])
# лица эпох 5 и 8 по алфавиту: где Моисей и Давид
for eid in ('exodus', 'united'):
    pass
# высоты эпох на вертикальной шкале телефона: доступная высота 640 - шапка 56 - вкладки 48 - лист 120 = 416
work = [e for e in EP if e['end'] <= 200]
span = work[-1]['end'] - work[0]['start']
for H in (416, 256):
    small = [(e['short'], round((e['end'] - e['start']) / span * H, 1)) for e in work]
    print('H', H, 'эпох ниже 48 px:', sum(1 for s in small if s[1] < 48), 'ниже 24 px:', sum(1 for s in small if s[1] < 24), small)
