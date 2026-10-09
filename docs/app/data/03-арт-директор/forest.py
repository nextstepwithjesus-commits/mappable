"""Пропорции леса Адама: глубина, число листьев, ширина при шаге 72 px. Запуск из корня: python3 -I docs/app/data/03-арт-директор/forest.py"""
import json,glob,collections,sys
B='base/'
A={a['id']:a for f in glob.glob(B+'actors/*.json') for a in json.load(open(f))['items']}
O=json.load(open(B+'origins.json'))['items']
R={r['id']:r['default'] for r in json.load(open(B+'readings.json'))['items']}
act=lambda o:(not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
lp={}
for o in O:
    if not o.get('parent') or not act(o): continue
    if o['kind']=='natural' and o['cert'] in('scripture','inference'):
        if o['role']=='father' or o['child'] not in lp: lp[o['child']]=o['parent']
for o in O:
    if o.get('parent') and o['kind']=='ancestor' and o['child'] not in lp: lp[o['child']]=o['parent']
ch=collections.defaultdict(list)
for c,p in lp.items(): ch[p].append(c)
def walk(r):
    st=[(r,0)]; n=0; leaves=0; md=0; rows=collections.Counter()
    while st:
        x,d=st.pop(); n+=1; md=max(md,d); rows[d]+=1
        if not ch[x]: leaves+=1
        st+=[(c,d+1) for c in ch[x]]
    return n,leaves,md,rows
n,lv,md,rows=walk('p-adam')
print('дерево от Адама по родителю раскладки: лиц',n,'листьев',lv,'рядов',md+1,'самый широкий ряд',rows.most_common(3))
print('ширина при шаге 72 px:',lv*72,'px; высота при шаге ряда 96 px:',(md+1)*96,'px; отношение',round(lv*72/((md+1)*96),1))
