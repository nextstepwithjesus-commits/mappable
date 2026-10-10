# Рецензия доступности на 03 ред. 4: шаги клавиатуры по графу, отчёты, обзор, цвет лент.
# Запуск из корня: python3 -I "docs/app/data/03-доступность/ред4.py"
import json, glob, collections

A = {a['id']: a for f in glob.glob('base/actors/*.json') for a in json.load(open(f))['items']}
O = json.load(open('base/origins.json'))['items']
U = json.load(open('base/unions.json'))['items']
R = {r['id']: r['default'] for r in json.load(open('base/readings.json'))['items']}
act = lambda o: (not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
nm = lambda i: A[i]['names'][0]['form']
blood = [o for o in O if o.get('parent') and act(o) and o['kind'] == 'natural' and o['cert'] in ('scripture', 'inference')]

# родитель раскладки (как 03 § 3.3)
lp = {}
for o in blood:
    if o['role'] == 'father' or o['child'] not in lp:
        lp[o['child']] = o['parent']
for o in O:
    if o.get('parent') and act(o) and o['kind'] == 'ancestor' and o['child'] not in lp:
        lp[o['child']] = o['parent']
par = collections.defaultdict(dict)
for o in blood:
    par[o['child']][o['role']] = o['parent']
order = {(o['child'], o['parent']): o.get('order', 99) for o in blood}

def chain(x):
    c = [x]; s = set()
    while c[-1] in lp and c[-1] not in s:
        s.add(c[-1]); c.append(lp[c[-1]])
    return c[::-1]

unions_of = collections.defaultdict(list)
for u in U:
    unions_of[u['husband']].append(u); unions_of[u['wife']].append(u)

def kids_of(p):
    return sorted({o['child'] for o in blood if o['parent'] == p}, key=lambda c: order.get((c, p), 99))

print('1. «Шаги»: нажатий только стрелками (↓ к союзу/ребёнку, → по союзам и детям) от Адама:')
for target in ['p-noy', 'p-avraam', 'p-david', 'p-iosif-muzh-marii', 'p-ezdra']:
    if target not in A: continue
    c = chain(target); n = 0; letters = 0
    for p, ch in zip(c, c[1:]):
        us = unions_of.get(p, [])
        mother = par[ch].get('mother')
        if us:
            n += 1  # ↓ к первому союзу
            idx = next((i for i, u in enumerate(us) if mother in (u['husband'], u['wife'])), None)
            if idx is None:  # группа «мать не названа» — после союзов
                idx = len(us)
            n += idx + 1  # → к нужному союзу и ↓ к первому ребёнку
            sib = [k for k in kids_of(p) if (par[k].get('mother') == mother)]
        else:
            n += 1
            sib = kids_of(p)
        if ch in sib:
            n += sib.index(ch)
        letters += 2  # ↓ и одна буква
    print(f'   {nm(target)}: поколений {len(c)-1}, нажатий ≈ {n}; с поиском по буквам ≈ {letters + (len(c)-1)}')

# 2. Отчёт «Потомки Адама»: строки, поколения, одинаковые имена
def desc(p):
    seen = {p: 0}; q = [p]
    ch = collections.defaultdict(list)
    for o in O:
        if o.get('parent') and act(o) and o['cert'] in ('scripture', 'inference') and o['kind'] in ('natural', 'ancestor'):
            ch[o['parent']].append(o['child'])
    while q:
        x = q.pop(0)
        for k in ch[x]:
            if k not in seen:
                seen[k] = seen[x] + 1; q.append(k)
    del seen[p]; return seen
for p in ['p-adam', 'p-iakov', 'p-aaron', 'p-david']:
    d = desc(p)
    names = collections.Counter(nm(x) for x in d)
    dup = sum(v for v in names.values() if v > 1)
    gens = max(d.values())
    print(f'2. Потомки {nm(p)}: строк {len(d)}, поколений {gens}, строк с неуникальным именем {dup}'
          f' ({len([1 for v in names.values() if v>1])} имён); самое частое {names.most_common(1)}')

# 3. Обзор: агрегаты
areas = json.load(open('base/areas.json'))['items']
print('3. Области в base/areas.json:', len(areas), collections.Counter(a['kind'] for a in areas))

# 4. Цвета лент: различие Мф/Лк при цветовой слепоте (Machado 2009, сила 1.0) и в оттенках серого
def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def L(rgb): r, g, b = map(lin, rgb); return 0.2126*r + 0.7152*g + 0.0722*b
def hx(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def cr(a, b):
    la, lb = sorted((L(a), L(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
M = {'протанопия': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
     'дейтеранопия': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
     'тританопия': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}
def sim(rgb, m):
    l = [lin(v) for v in rgb]
    o = [max(0, min(1, sum(m[i][j]*l[j] for j in range(3)))) for i in range(3)]
    return tuple(round(255*(x*12.92 if x <= 0.0031308 else 1.055*x**(1/2.4)-0.055)) for x in o)
def de(a, b):  # простое евклидово расстояние в sRGB, 0–441
    return sum((x-y)**2 for x, y in zip(a, b)) ** 0.5
for theme, mt, lk in [('светлая, лента', '#7FB8E6', '#EE9CC4'), ('светлая, кант', '#17599A', '#B0306F'), ('тёмная, лента без канта', '#9AD1F7', '#F08BBF')]:
    a, b = hx(mt), hx(lk)
    s = [f'серое {cr(a,b):.2f}:1']
    for k, m in M.items():
        sa, sb = sim(a, m), sim(b, m)
        s.append(f'{k} Δ{de(sa,sb):.0f}, {cr(sa,sb):.2f}:1')
    print(f'4. Мф/Лк, {theme}: обычное Δ{de(a,b):.0f}; ' + '; '.join(s))
