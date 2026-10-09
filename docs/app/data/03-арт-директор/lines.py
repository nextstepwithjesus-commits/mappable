"""Общие и разные части линий Мф и Лк по base/lines (рецензия арт-директора на 03, № 7).
Запуск из корня: python3 -I docs/app/data/03-арт-директор/lines.py"""
import json, glob
R = 'base/'
j = json.load(open(R + 'lines/joseph.json')); l = json.load(open(R + 'lines/luke.json'))
names = {a['id']: a['names'][0]['form'] for f in glob.glob(R + 'actors/*.json') for a in json.load(open(f))['items']}
nm = lambda i: names.get(i, i)
mt = [p for p in j['persons'] if p.get('mt')]
lk = sorted([p for p in l['persons'] if p.get('lk')], key=lambda p: -p['lk'])
print('у Мф с номером:', len(mt), '; у Лк с номером:', len(lk))
setj = {p['id'] for p in mt}; setl = {p['id'] for p in lk}
common = [p['id'] for p in lk if p['id'] in setj]
print('общие лица:', len(common), [nm(i) for i in common])
print('только у Мф:', [nm(p['id']) for p in mt if p['id'] not in setl])
ab = next(i for i, p in enumerate(lk) if p['id'] == 'p-avraam')
print('до Авраама только у Лк:', ab, [nm(p['id']) for p in lk[:ab]])
print('после Авраама только у Лк:', [nm(p['id']) for p in lk[ab:] if p['id'] not in setj])
print('опущены у Мф (Мф 1:8):', [nm(p['id']) for p in j['persons'] if p.get('flag') == 'omitted-by-mt'])
