"""Числа документа 07: размеры карточек (§ 3) и неполные карточки (§ 8.3).

Запуск из корня: python3 -I docs/app/data/07-числа.py
Стих о предмете — ссылка записи о самом предмете: имя, утверждение (кроме
прежних § 23 «Места Писания» и § 24 «Примечания»), ребро, союз. Карантин не
учитывается. Диапазоны раскрываются.
"""
import collections, glob, json, re

acts = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        acts[a['id']] = a


def expand(r):
    m = re.match(r'^(.*?)(\d+):(\d+)(?:-(\d+))?$', r.strip())
    if not m:
        return [r]
    b, c, v1, v2 = m.group(1), m.group(2), int(m.group(3)), int(m.group(4) or m.group(3))
    return [f'{b}{c}:{v}' for v in range(v1, v2 + 1)]


def walk(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ('prov', 'key'):
                continue
            if k == 'refs' and isinstance(v, list):
                for r in v:
                    acc.update(expand(r))
            else:
                walk(v, acc)
    elif isinstance(o, list):
        for v in o:
            walk(v, acc)


refs = collections.defaultdict(set)
for i, a in acts.items():
    for fct in a.get('facts', []):
        if fct.get('prov', {}).get('status') == 'quarantine' or fct.get('sec') in (23, 24):
            continue
        walk(fct['value'], refs[i])
    walk(a.get('names', []), refs[i])
for fn, keys in (('origins', ('child', 'parent')), ('unions', ('husband', 'wife'))):
    for x in json.load(open(f'base/{fn}.json', encoding='utf-8'))['items']:
        s = set()
        walk(x, s)
        for k in keys:
            if x.get(k) in acts:
                refs[x[k]] |= s


def size(i):
    if (acts[i].get('prominence') or 0) >= 3:
        return 'богатая'
    return 'скромная' if len(refs[i]) <= 3 else 'средняя'


sz = {i: size(i) for i in acts}
print('Лиц:', len(acts))
print('Размеры:', dict(collections.Counter(sz.values())))
print('Значимость не задана:', [i for i in acts if acts[i].get('prominence') is None])
print('Ила, сын Ваасы — стихов:', len(refs['p-ila-syn-vaasy']))

# § 8.3: у человека раздел 4 (родители) составлен, если есть ребро родителя
# (названного или неназванного) или «нет сведений» о родителях со стихами.
org = json.load(open('base/origins.json', encoding='utf-8'))['items']
has_parent = {o['child'] for o in org if o.get('parent') or o.get('unnamedParent')}
nod = json.load(open('base/nodata.json', encoding='utf-8'))['items']
nd_parents = {n['actor'] for n in nod if n['sec'] == 6 and n.get('refs')}
humans = [i for i, a in acts.items() if a['kind'] in ('human', 'unnamed')]
inc = [i for i in humans if i not in has_parent and i not in nd_parents]
print('Людей:', len(humans), '; неполных (раздел 4 не составлен):', len(inc),
      dict(collections.Counter(sz[i] for i in inc)))
print('Записей «silent» без стихов:', sum(1 for n in nod if n['kind'] == 'silent' and not n.get('refs')))
