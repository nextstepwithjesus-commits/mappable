"""Типографика и плотность Генеалогии по базе (рецензия арт-директора на 03). Запуск из корня: python3 -I docs/app/data/03-арт-директор/gen.py <папка со шрифтами golos.ttf и literata.ttf>"""
import json,glob,collections,sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
S=sys.argv[1]; B='base/'
A={a['id']:a for f in glob.glob(B+'actors/*.json') for a in json.load(open(f))['items']}
O=json.load(open(B+'origins.json'))['items']; U=json.load(open(B+'unions.json'))['items']; K=json.load(open(B+'kin.json'))['items']
R={r['id']:r['default'] for r in json.load(open(B+'readings.json'))['items']}
act=lambda o:(not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
inG=set()
for o in O:
    if o.get('parent'): inG|={o['child'],o['parent']}
for u in U: inG|={u['husband'],u['wife']}
G=inG|{k['from'] for k in K}|{k['to'] for k in K}
print('в Генеалогии',len(G))
def inst(path,**axes):
    f=TTFont(path)
    if 'fvar' in f:
        ax={a.axisTag for a in f['fvar'].axes}
        f=instancer.instantiateVariableFont(f,{k:v for k,v in axes.items() if k in ax})
    cmap=f.getBestCmap(); h=f['hmtx']; upm=f['head'].unitsPerEm
    return lambda t,s: sum(h[cmap[ord(c)]][0] if ord(c) in cmap else h['space'][0] for c in t)*s/upm
gol=inst(S+'/golos.ttf',wght=500); gol4=inst(S+'/golos.ttf',wght=450)
lit=inst(S+'/literata.ttf',opsz=14,wght=500)
nm=lambda i:A[i]['names'][0]['form']
names=[nm(i) for i in G]
L=sorted(len(n) for n in names)
print('длина имени, знаков: медиана',L[len(L)//2],'90%',L[int(len(L)*.9)],'макс',L[-1])
W=sorted(((gol(n,14),n) for n in names),reverse=True)
print('самые широкие имена Golos 500 14px:',[(round(w),n) for w,n in W[:12]])
print('ширина имени Golos 14: медиана',round(sorted(w for w,_ in W)[len(W)//2]),'90%',round(sorted(w for w,_ in W)[int(len(W)*.9)]))
# тёзки
cnt=collections.Counter(nm(i) for i in G)
nz=[n for n,c in cnt.items() if c>1]
print('имён с тёзками в Генеалогии',len(nz),'лиц',sum(cnt[n] for n in nz),'топ',cnt.most_common(8))
# уточнения
dis=[(A[i].get('disambig') or '') for i in G if cnt[nm(i)]>1]
dl=sorted(len(d) for d in dis if d)
print('уточнения у тёзок: есть',len(dl),'медиана знаков',dl[len(dl)//2],'90%',dl[int(len(dl)*.9)],'макс',dl[-1])
lab=sorted(((gol4(nm(i)+', '+(A[i].get('disambig') or ''),12),nm(i)+', '+(A[i].get('disambig') or '')) for i in G if cnt[nm(i)]>1 and A[i].get('disambig')),reverse=True)
print('самые длинные «имя, уточнение» Golos 450 12px:',[(round(w),t) for w,t in lab[:5]])
print('доля «имя, уточнение» шире 160 px при 12 px:',round(sum(1 for w,_ in lab if w>160)/len(lab)*100),'%')
# второе имя
multi=[i for i in G if len([n for n in A[i]['names'] if n.get('type')!='main'])>0]
print('лиц со вторым именем',len(multi))
# пол и вид
print('пол',collections.Counter(A[i].get('sex') for i in G),'вид',collections.Counter(A[i]['kind'] for i in G))
# союзы
uc=collections.Counter()
for u in U: uc[u['husband']]+=1; uc[u['wife']]+=1
print('лиц с 2+ союзами',sum(1 for v in uc.values() if v>1),'макс',[(nm(k),v) for k,v in uc.most_common(5)])
print('виды союзов',collections.Counter(u.get('kind') for u in U))
# дети в одном ряду под отцом (кровные основные)
ch=collections.defaultdict(list)
for o in O:
    if o.get('parent') and o['primary'] and act(o) and o['kind']=='natural' and o['role']=='father': ch[o['parent']].append(o['child'])
big=sorted(ch.items(),key=lambda kv:-len(kv[1]))[:8]
for p,cs in big:
    w=sum(gol(nm(c),14) for c in cs)+24*(len(cs)-1)
    print('ряд детей',nm(p),len(cs),'ширина подписей+24px',round(w))
print('виды рёбер',collections.Counter((o['kind'],o.get('cert')) for o in O if o.get('parent')).most_common(12))
