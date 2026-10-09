"""Повторная проверка 05 (географ): близкие соперники и правило «ближе 3 км — один знак».
Запуск: python3 -I docs/app/data/05-географ/соперники.py ПУТЬ/data/ancient.jsonl"""
import json, math, sys
p = sys.argv[1]
rows = [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()]
mod = {}
for l in open(p.replace('ancient.jsonl', 'modern.jsonl'), encoding='utf-8'):
    r = json.loads(l); mod[r['id']] = r
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    return 2*6371*math.asin(math.sqrt(math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
def score(r):
    ma = r.get('modern_associations') or {}
    return max([v['score'] for v in ma.values()] or [0])
def pts(r):
    out = []
    for k, v in (r.get('modern_associations') or {}).items():
        m = mod.get(k)
        if m and m.get('lonlat'):
            out.append((v['score'], tuple(map(float, m['lonlat'].split(','))), v['name']))
    return sorted(out, reverse=True)
def ids(r):
    return sorted(r.get('identifications', []), key=lambda i: -i['score'].get('time_total', 0))
tie = []
for r in rows:
    s = score(r)
    if not (300 <= s < 800):
        continue
    pos = [i for i in ids(r) if i['score'].get('time_total', 0) > 0]
    if len(pos) >= 2 and pos[1]['score']['time_total'] >= .75*pos[0]['score']['time_total'] and pos[1].get('id_source') != 'special':
        P = pts(r)
        d = hav(P[0][1], P[1][1]) if len(P) > 1 else None
        tie.append((r['friendly_id'], pos[0]['score']['time_total'], pos[1]['score']['time_total'],
                    P[0][2] if P else '-', P[1][2] if len(P) > 1 else '-', d))
for t in tie:
    print(f'{t[0]}: {t[1]}/{t[2]}; лучшие точки: {t[3]} | {t[4]}; между ними {t[5]:.1f} км' if t[5] is not None else t)
print('ближе 3 км:', sum(1 for t in tie if t[5] is not None and t[5] < 3), 'из', len(tie))
# Красное море: одна точка у Red Sea 1 и Red Sea 3
by = {r['friendly_id']: r for r in rows}
for n in ('Red Sea 1', 'Red Sea 3', 'Mount Sinai', 'Wilderness of Sinai', 'Mount Nebo', 'Pisgah'):
    print(n, score(by[n]), [(s, nm, round(c[0], 3), round(c[1], 3)) for s, c, nm in pts(by[n])[:3]])
