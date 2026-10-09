import json,glob,collections
A={a['id']:a for f in glob.glob('base/actors/*.json') for a in json.load(open(f))['items']}
O=json.load(open('base/origins.json'))['items']; U=json.load(open('base/unions.json'))['items']; K=json.load(open('base/kin.json'))['items']
R={r['id']:r['default'] for r in json.load(open('base/readings.json'))['items']}
act=lambda o: (not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
inG=set()
for o in O:
  if o.get('parent'): inG|={o['child'],o['parent']}
for u in U: inG|={u['husband'],u['wife']}
kinonly={k['from'] for k in K}|{k['to'] for k in K}
print('origin/union',len(inG),'with kin',len(inG|kinonly),'kin-only',len(kinonly-inG))
# layout parent: natural primary, cert scripture/inference, active by default; else ancestor
lp={}
for o in O:
  if not o.get('parent') or not act(o): continue
  if o['kind']=='natural' and o['cert'] in('scripture','inference'):
    if o['role']=='father' or o['child'] not in lp: lp[o['child']]=(o['parent'],o['role'])
anc_only=set()
for o in O:
  if o.get('parent') and o['kind']=='ancestor' and o['child'] not in lp: anc_only.add(o['child'])
print('layout parent natural',len(lp),'ancestor-only children',len(anc_only))
print('jesus lp',lp.get('p-iisus'))
# islands: components over lp + ancestor + unions
par=collections.defaultdict(set)
for c,(p,_) in lp.items(): par[c].add(p); par[p].add(c)
for o in O:
  if o.get('parent') and o['kind']=='ancestor': par[o['child']].add(o['parent']); par[o['parent']].add(o['child'])
for u in U: par[u['husband']].add(u['wife']); par[u['wife']].add(u['husband'])
seen=set(); comps=[]
for n in inG:
  if n in seen: continue
  st=[n]; c=[]
  while st:
    x=st.pop()
    if x in seen: continue
    seen.add(x); c.append(x); st+=list(par[x])
  comps.append(c)
comps.sort(key=len,reverse=True)
print('components',len(comps),'largest',[len(c) for c in comps[:6]],'singletons/pairs',sum(1 for c in comps if len(c)<=2))
print('adam comp size', next(len(c) for c in comps if 'p-adam' in c))
# children without named mother, natural father, human/unnamed
kids=collections.defaultdict(dict)
for o in O:
  if o['primary'] and o.get('parent') and act(o): kids[o['child']][o['role']]=o
nm=[c for c,x in kids.items() if 'father' in x and 'mother' not in x and x['father']['kind']=='natural' and A[c]['kind'] in('human','unnamed')]
print('children no mother',len(nm),'fathers',len({kids[c]['father']['parent'] for c in nm}))
# --- редакция 2.1 (повторные рецензии) ---
RS=json.load(open('base/readings.json'))['items']
print('reading sets',len(RS),'two-fathers sets',sum(1 for r in RS if r['id'].startswith('r-father-') and r['id']!='r-father-sala'))
nm=lambda i: A[i]['names'][0]['form']
lpa=dict(lp)
for o in O:
  if o.get('parent') and o['kind']=='ancestor' and o['child'] not in lpa: lpa[o['child']]=(o['parent'],'ancestor')
def row(x):
  d=0; s=set()
  while x in lpa and x not in s: s.add(x); x=lpa[x][0]; d+=1
  return d,x
for p in ['p-iliy-syn-matfata','p-iosif-muzh-marii','p-niriy','p-salafiil','p-kainan-syn-arfaksada']:
  print('row',nm(p),row(p))
# edges of another place (alternative, by-luke; not interpretation): line only if parent is exactly one row above in the same island
line=[];ref=[]
for o in O:
  if o.get('parent') and not o['primary'] and o['kind'] in('alternative','by-luke') and o['cert']!='interpretation':
    (dc,rc),(dp,rp)=row(o['child']),row(o['parent'])
    (line if rc==rp and dc-dp==1 else ref).append(nm(o['parent'])+'->'+nm(o['child']))
print('other-place edges',len(line)+len(ref),'as line',line,'as reference',len(ref))
anc=collections.Counter(lpa[c][0] for c in anc_only)
kids_n=collections.Counter(p for p,_ in lp.values())
for p in ['p-aaron','p-leviy']: print('row under',nm(p),'children',kids_n[p],'from-sons',anc[p])
AR={a['id']:a for a in json.load(open('base/areas.json'))['items']}
M=json.load(open('base/memberships.json'))['items']; mem={m['actor']:m['area'] for m in M}
contour=lambda g: g in AR and AR[g]['kind'] in('tribe','house','nation') and AR[g].get('founder')
print('areas with contour',sum(1 for g in AR if contour(g)),'houses without founder',[AR[g]['name'] for g in AR if AR[g]['kind']=='house' and not AR[g].get('founder')])
cl=collections.Counter(); cp=collections.Counter()
for c in comps[1:]:
  top=collections.Counter(mem[x] for x in c if x in mem).most_common(1)
  k='contour' if top and contour(top[0][0]) else 'no-contour'
  cl[k]+=1; cp[k]+=len(c)
print('islands by area of most members',dict(cl),'persons',dict(cp))
G=inG|kinonly
print('members of contour areas without kinship',sum(1 for x,g in mem.items() if contour(g) and x not in G))
nb=collections.defaultdict(set)
for k in K: nb[k['from']].add(k['to']); nb[k['to']].add(k['from'])
seen=set(); free=0; groups=0
for x in kinonly-inG:
  if x in seen: continue
  st=[x]; c=set()
  while st:
    y=st.pop()
    if y in c: continue
    c.add(y); st+=list(nb[y])
  seen|=c; groups+=1; free+= not (c&inG)
print('word-of-scripture groups',groups,'without anchor in forest',free)
ch=collections.defaultdict(set)
for o in O:
  if o.get('parent') and act(o) and o['kind'] in('natural','ancestor') and o['cert']!='interpretation': ch[o['parent']].add(o['child'])
def desc(p):
  s=set(); st=[p]
  while st:
    for c in ch[st.pop()]:
      if c not in s: s.add(c); st.append(c)
  return s
print('descendants by kinship: Esau',len(desc('p-isav')),'Reuben',len(desc('p-ruvim')))
own=collections.Counter(mem.values())
for g in ['g-judah','g-levi','g-reuben']:
  sub=[h for h in AR if AR[h].get('parent')==g]
  print('members',AR[g]['name'],own[g],'with nested',own[g]+sum(own[h] for h in sub),[(AR[h]['name'],own[h]) for h in sub])
# --- редакция 3 (рецензии арт-директора, педагога, доступности) ---
# Запуск: python3 -I docs/app/data/03-числа.py [папка со шрифтами golos.ttf и literata.ttf]
# Часть «ширины» считается, только если передана папка со шрифтами (google/fonts: Golos Text, Literata; в репозитории их нет).
import sys
print('== редакция 3')
print('persons in Genealogy',len(G))
L1=json.load(open('base/lines/joseph.json'))['persons']; L2=json.load(open('base/lines/luke.json'))['persons']
print('base commit for numbers: see `git log -1 -- base/`')
# 1. тёзки
cnt=collections.Counter(nm(i) for i in G)
nz={n for n,c in cnt.items() if c>1}
tz=[i for i in G if nm(i) in nz]
print('namesakes persons',len(tz),'share of G %',round(len(tz)/len(G)*100),'names',len(nz),'top',cnt.most_common(3))
print('namesakes without disambig',sorted(nm(i) for i in tz if not A[i].get('disambig')))
dl=sorted(len(nm(i)+', '+A[i]['disambig']) for i in tz if A[i].get('disambig'))
print('name+disambig chars: median',dl[len(dl)//2],'over 24',sum(1 for x in dl if x>24),'max',dl[-1])
kidsof=collections.defaultdict(list)
for o in O:
  if o.get('parent') and o['primary'] and act(o) and o['kind']=='natural': kidsof[o['parent']].append(o['child'])
same=[(nm(p),n) for p,cs in kidsof.items() for n,c in collections.Counter(nm(x) for x in cs).items() if c>1]
print('same-name siblings under one parent',same)
print('second names',sum(1 for i in G if any(n.get('type')!='main' for n in A[i]['names'])))
# 2. союзы
kinds=collections.Counter((t['kind'],t.get('word')) for u in U for t in u['terms'])
print('unions',len(U),'terms',dict(kinds))
ns=[u for u in U if any(t['kind']=='not-stated' for t in u['terms'])]
HARD={'Лот':('Старшая дочь Лота','Младшая дочь Лота'),'Иуда':('Фамарь',),'Галаад':('Мать Иеффая',),'Давид':('Вирсавия',)}
hard=[u for u in U if nm(u['wife']) in HARD.get(nm(u['husband']),())]
print('not-stated unions',len(ns),'of them hard',sum(1 for u in ns if u in hard),'others (mothers of kings)',len(ns)-sum(1 for u in ns if u in hard))
print('hard unions',[(nm(u['husband']),nm(u['wife']),u['terms'][0]['refs']) for u in hard])
wv=collections.defaultdict(list)
for u in U: wv[u['husband']].append(u['wife'])
print('husbands with 2+ unions',sum(1 for v in wv.values() if len(v)>1),'concubine unions',sum(1 for u in U if any(t['kind']=='concubine' for t in u['terms'])))
mo=set(c for c,x in kids.items() if 'mother' in x)
fw=collections.defaultdict(list)
for p,cs in kidsof.items():
  if p in wv:
    for c in cs:
      if c not in mo and A[c]['kind'] in('human','unnamed') and kids[c].get('father',{}).get('parent')==p: fw[p].append(c)
print('fathers with a named wife and children without named mother',len(fw),'children',sum(map(len,fw.values())),'of them with one union',sum(1 for p in fw if len(wv[p])==1))
print('special edges',[(o['kind'],nm(o['parent']),nm(o['child'])) for o in O if o.get('parent') and o['kind'] in('adoptive','legal')])
big=sorted(kidsof.items(),key=lambda kv:-len(kv[1]))[:7]
print('largest families (natural, primary)',[(nm(p),len(cs)) for p,cs in big],'most unions',[(nm(h),len(v)) for h,v in sorted(wv.items(),key=lambda kv:-len(kv[1]))[:2]])
# 3. линии Мессии
mt={p['id']:p for p in L1 if p.get('mt')}; lk={p['id']:p for p in L2 if p.get('lk')}
com=[i for i in lk if i in mt]
def lkno(i): return lk[i]['lk']
def mtno(i): return mt[i]['mt']
print('Mt numbered',len(mt),'Lk numbered',len(lk),'common',len(com))
print('between David and Salathiel: Mt',mtno('p-salafiil')-mtno('p-david')-1,'Lk',lkno('p-david')-lkno('p-salafiil')-1)
print('between Zerubbabel and Joseph: Mt',mtno('p-iosif-muzh-marii')-mtno('p-zorovavel')-1,'Lk',lkno('p-zorovavel')-lkno('p-iosif-muzh-marii')-1)
print('Lk before Abraham',lkno('p-adam')-lkno('p-avraam'),'omitted by Mt',[nm(p['id']) for p in L1 if p.get('flag')=='omitted-by-mt'])
print('repeated names in Lk column',{n:c for n,c in collections.Counter(nm(i) for i in lk).items() if c>1})
# 4. «Где я» и лес
for p in ['p-noy','p-avraam','p-iakov','p-david','p-iosif-muzh-marii','p-iisus']:
  d,root=row(p); print('where-am-I links',nm(p),d+1,'root',nm(root))
ch=collections.defaultdict(list)
for c,(p,_) in lpa.items(): ch[p].append(c)
st=[('p-adam',0)]; n=lv=md=0
while st:
  x,d=st.pop(); n+=1; md=max(md,d); lv+= not ch[x]; st+=[(c,d+1) for c in ch[x]]
print('Adam tree by layout parent: persons',n,'leaves',lv,'rows',md+1)
# 5. первые экраны маршрутов (простой слой)
def unions_of(h): return [u for u in U if u['husband']==h]
def kids_by_union(u):
  return [c for c,x in kids.items() if x.get('father',{}).get('parent')==u['husband'] and x.get('mother',{}).get('parent')==u['wife']]
for h in ['p-adam','p-avraam','p-isaak','p-iakov']:
  print('route screen',nm(h),[(nm(u['wife']),[nm(c) for c in kids_by_union(u)]) for u in unions_of(h)])
print('route screen Ной: unions',len(unions_of('p-noy')),'children',[nm(c) for c in kidsof['p-noy']])
print('Noah sons children',[(nm(s),len(kidsof[s])) for s in kidsof['p-noy']])
# 6. контраст по токенам R8 § 4.2
T={'светлая':dict(фон='#F4F6F9',лист='#FFFFFF',подложка='#E8ECF1',чернила='#18202C',чернила2='#4A5463',линия='#6E7888',сетка='#C9D0DA',выбор='#FFD43B',область='#FFF1BF',мф='#17599A',лк='#CC5596'),
   'тёмная':dict(фон='#161D27',лист='#1E2733',подложка='#2A3442',чернила='#E8ECF1',чернила2='#A9B3C1',линия='#7A8596',сетка='#3A4555',выбор='#F0D04A',область='#4A4426',мф='#9AD1F7',лк='#E4579C')}
def rgb(h): return [int(h[i:i+2],16)/255 for i in (1,3,5)]
def lum(c):
  c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]; return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
  la=lum(rgb(a) if isinstance(a,str) else a); lb=lum(rgb(b) if isinstance(b,str) else b)
  return round((max(la,lb)+0.05)/(min(la,lb)+0.05),2)
def mix(f,b,a): return [a*x+(1-a)*y for x,y in zip(rgb(f),rgb(b))]
PAIRS=[('чернила','лист'),('чернила','фон'),('чернила2','лист'),('чернила2','фон'),('линия','лист'),('линия','фон'),('линия','подложка'),
       ('мф','лист'),('мф','фон'),('лк','лист'),('лк','фон'),('чернила','выбор'),('лист','выбор'),('фон','выбор'),('чернила','мф'),('лист','мф'),('чернила','лк'),('лист','лк'),
       ('линия','область'),('лк','область'),('сетка','фон'),('мф','линия'),('лк','линия')]
for th,t in T.items():
  print('contrast',th,' '.join(f'{a}/{b}={cr(t[a],t[b])}' for a,b in PAIRS))
  mins={}
  for fg,need in (('линия',3.0),('чернила2',4.5),('чернила',4.5)):
    mins[fg]=max(next(a/100 for a in range(10,101) if cr(mix(t[fg],t[bg],a/100),t[bg])>=need) for bg in ('фон','лист','подложка'))
  print('muted min opacity',th,mins)
# 7. ширины (нужна папка со шрифтами)
if len(sys.argv)>1:
  from fontTools.ttLib import TTFont
  from fontTools.varLib import instancer
  def inst(p,**ax):
    f=TTFont(p)
    if 'fvar' in f: f=instancer.instantiateVariableFont(f,{k:v for k,v in ax.items() if k in {a.axisTag for a in f['fvar'].axes}})
    cm=f.getBestCmap(); h=f['hmtx']; u=f['head'].unitsPerEm
    return (lambda s,px,tr=0: sum(h[cm[ord(c)]][0] if ord(c) in cm else h['space'][0] for c in s)*px/u+tr*px*(len(s)-1)), cm
  F=sys.argv[1]
  g45,gcm=inst(F+'/golos.ttf',wght=450); g5,_=inst(F+'/golos.ttf',wght=500); l5,lcm=inst(F+'/literata.ttf',opsz=14,wght=500)
  W=sorted(l5(nm(i),14) for i in G)
  print('name width Literata 500 14px: median',round(W[len(W)//2]),'90%',round(W[int(len(W)*.9)]),'max',round(W[-1]))
  for s in ['мать не названа','мать не названа; одна или несколько — текст не говорит','Кто их мама, Библия не говорит','из сыновей Аарона — 80','Ламех из семьи Каина','Ламех, папа Ноя']:
    print('label Golos 450 12px',round(g45(s,12)),'| 16px',round(g45(s,16)),'|',s)
  print('area label КОЛЕНО РУВИМОВО Golos 500 13px tracking 0.12',round(g5('КОЛЕНО РУВИМОВО',13,0.12)))
  for p,cs in big: print('row of children Literata 14 + 24px gap',nm(p),len(cs),round(sum(l5(nm(c),14) for c in cs)+24*(len(cs)-1)))
  print('glyphs missing: Golos',''.join(s for s in '◇⇄↗⋯⊕═■●□○◆' if ord(s) not in gcm),'Literata',''.join(s for s in '◇⇄↗⋯⊕═■●□○◆' if ord(s) not in lcm))
# 8. рёбра после Д2 (шаги C19–C24)
print('ancestor edges',sum(1 for o in O if o.get('parent') and o['kind']=='ancestor'),'ancestor-only persons',len(anc_only),'their ancestors',len({lpa[c][0] for c in anc_only}))
print('gapSuspected edges',sum(1 for o in O if o.get('gapSuspected')),'gap edges with skipped list',[(nm(o['parent']),nm(o['child']),len(o['skipped']['actors'])) for o in O if o.get('skipped')])
print('outside lists',[(nm(o['parent']),nm(o['child'])) for o in O if o.get('outsideLists')])
