import json,glob,collections
A={a['id']:a for f in glob.glob('base/actors/*.json') for a in json.load(open(f))['items']}
O=json.load(open('base/origins.json'))['items']; U=json.load(open('base/unions.json'))['items']; K=json.load(open('base/kin.json'))['items']
R={r['id']:r['default'] for r in json.load(open('base/readings.json'))['items']}
act=lambda o: (not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
# ред. 5 (решение координатора по 02 § 3.3, после Д3-11): ребро с тождеством «предположительно» в лесу не рисуется и в отчётах не считается;
# лица Генеалогии считаются по всем рёбрам (O_ALL), раскладка и отчёты — по рисуемым (O)
O_ALL=O; O=[o for o in O_ALL if (o.get('identity') or {}).get('degree')!='possible']
print('edges all',sum(1 for o in O_ALL if o.get('parent')),'with identity',dict(collections.Counter((o['identity']['of'],o['identity']['degree']) for o in O_ALL if o.get('identity'))),'drawn',sum(1 for o in O if o.get('parent')))
inG=set()
for o in O_ALL:
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
  top=sorted(collections.Counter(mem[x] for x in c if x in mem).items(),key=lambda kv:(-kv[1],kv[0]))[:1]  # ред. 5: ничья — по номеру области, без случайности
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
print('special edges',[(o['kind'],nm(o['parent']),nm(o['child'])) for o in O if o.get('parent') and o['kind'] in('adoptive','legal','parents-word')])
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
# --- редакция 4 (В-25, В-26: отчёты, песочные часы, обзор, фильтр, источник ребра, выгрузка) ---
print('== редакция 4')
# 9. союзы «не назван» и «союз без брака» по видам
kindsU=collections.Counter(t['kind'] for u in U for t in u['terms'])
print('union term kinds',dict(kindsU))
ns4=[u for u in U if any(t['kind']=='not-stated' for t in u['terms'])]
nm4=[u for u in U if any(t['kind']=='non-marital' for t in u['terms'])]
KINGS_MOTHERS={u['id'] for u in ns4 if 'king' in (A[u['husband']].get('roles') or [])}
print('not-stated',len(ns4),'non-marital',len(nm4),[ (nm(u['husband']),nm(u['wife'])) for u in nm4])
print('not-stated: husband is king',len(KINGS_MOTHERS),'others',[(nm(u['husband']),nm(u['wife']),u['terms'][0].get('cert')) for u in ns4 if u['id'] not in KINGS_MOTHERS])
print('not-stated by cert',dict(collections.Counter(t.get('cert') for u in ns4 for t in u['terms'] if t['kind']=='not-stated')))
# 10. источник у каждого ребра; уровни; «по словам»
E=[o for o in O if o.get('parent')]
print('edges',len(E),'with refs',sum(1 for o in E if o['refs']),'refs per edge',dict(sorted(collections.Counter(len(o['refs']) for o in E).items())),'refsShared',sum(1 for o in E if o.get('refsShared')))
print('edge cert',dict(collections.Counter(o['cert'] for o in E)),'edge kinds',dict(collections.Counter(o['kind'] for o in E)))
print('saidBy edges',[(nm(o['parent']),nm(o['child']),o['saidBy']['label'],o['saidBy']['ref']) for o in E if o.get('saidBy')],'saidBy union terms',[(nm(u['husband']),nm(u['wife']),t['saidBy']['label'],t['saidBy']['ref']) for u in U for t in u['terms'] if t.get('saidBy')])
ie=[o for o in E if o['cert']=='interpretation']
print('interpretation edges',len(ie),'kinds',dict(collections.Counter(o['kind'] for o in ie)),'children whose only parent edge is interpretation',len({o['child'] for o in ie}-{o['child'] for o in E if o['cert']!='interpretation'}))
RS4={r['id']:r for r in RS}
print('Lk 3:23 readings',[(r['id'],r['cert'],len(r.get('authors',[]))) for r in RS4['r-lk3-23']['readings']],'edge Илий->Мария exists',any(o['parent']=='p-iliy-syn-matfata' and o['child']=='p-mariya' for o in E))
# 11. отчёты предков и потомков (прочтения по умолчанию; кровные «сказано» и «вывод», без «из сыновей» для предков)
par4=collections.defaultdict(dict)
for o in E:
  if act(o) and o['primary'] and o['kind']=='natural' and o['cert'] in('scripture','inference'): par4[o['child']][o['role']]=o['parent']
def ancestors(p):
  gen={p:0}; st=[p]; out=collections.Counter()
  while st:
    x=st.pop()
    for r,q in par4[x].items():
      if q not in gen: gen[q]=gen[x]+1; st.append(q); out[gen[q]]+=1
  return len(gen)-1,max(gen.values()),out
for p in ['p-david','p-iosif-muzh-marii','p-iisus','p-mariya','p-ezdra','p-saul']:
  n,g,out=ancestors(p); print('ancestors',nm(p),'persons',n,'generations',g)
# предки Давида: сколько матерей названо
def anc_set(p):
  s=set(); st=[p]
  while st:
    x=st.pop()
    for r,q in par4[x].items():
      if q not in s: s.add(q); st.append(q)
  return s
sd=anc_set('p-david'); print('David ancestors women',sum(1 for x in sd if A[x].get('sex')=='f'),[nm(x) for x in sd if A[x].get('sex')=='f'])
chd=collections.defaultdict(set)
for o in E:
  if act(o) and o['kind'] in('natural','ancestor') and o['cert'] in('scripture','inference'): chd[o['parent']].add(o['child'])
def descendants(p):
  gen={p:0}; st=[p]
  while st:
    x=st.pop()
    for c in chd[x]:
      if c not in gen or gen[c]>gen[x]+1: gen[c]=gen[x]+1; st.append(c)
  return len(gen)-1,max(gen.values())
for p in ['p-adam','p-noy','p-avraam','p-iakov','p-iuda','p-david','p-aaron']:
  print('descendants',nm(p),descendants(p))
# 12. песочные часы: Давид, 4 поколения вверх и 3 вниз
def hour(p,up,down):
  a={p}; fr={p}
  for _ in range(up): fr={q for x in fr for q in par4[x].values()}; a|=fr
  d=set(); fr={p}
  for _ in range(down): fr={c for x in fr for c in chd[x]}; d|=fr
  return len(a)-1,len(d)
for p in ['p-david','p-avraam','p-iakov']: print('hourglass 4 up / 3 down',nm(p),hour(p,4,3))
# 13. фильтр лиц
print('filter: women in G',sum(1 for i in G if A[i].get('sex')=='f'),'named women (human)',sum(1 for i in G if A[i].get('sex')=='f' and A[i]['kind']=='human'),'unnamed',sum(1 for i in G if A[i]['kind']=='unnamed'),'peoples/clans/groups',sum(1 for i in G if A[i]['kind'] in('people','clan','group')))
rc=collections.Counter(r for i in G for r in (A[i].get('roles') or []))
print('filter: roles in G',dict(rc.most_common(12)))
def refs_of(i):
  s=[r for n in A[i]['names'] for r in n.get('refs',[])]
  s+=[r for o in E if i in(o['child'],o['parent']) for r in o['refs']]
  return s
import re
def chron19(r):
  m=re.match(r'1Пар (\d+)',r); return bool(m and 1<=int(m.group(1))<=9)
only19=[i for i in G if refs_of(i) and all(chron19(r) for r in refs_of(i))]
print('filter: persons named only in 1 Chr 1-9',len(only19),'with any ref in 1 Chr 1-9',sum(1 for i in G if any(chron19(r) for r in refs_of(i))))
print('filter: persons whose all parent edges are scripture',sum(1 for i in G if [o for o in E if o['child']==i] and all(o['cert']=='scripture' for o in E if o['child']==i)))
print('prominence in G',dict(sorted(collections.Counter(A[i].get('prominence') for i in G).items(),key=lambda kv:str(kv[0]))))
# 14. обзор всего леса: области с контуром — число лиц по родству и поколений
for g in sorted(AR,key=lambda g:AR[g]['name']):
  if contour(g):
    f=AR[g]['founder']; f=f if isinstance(f,str) else (f[0] if f else None)
    if f in A: n,d=descendants(f); print('overview area',AR[g]['name'],'founder',nm(f),'descendants by kinship',n,'generations',d,'members',own[g])
# 15. GEDCOM: записи
fam_father_only=len({kids[c]['father']['parent'] for c,x in kids.items() if 'father' in x and 'mother' not in x and x['father']['kind']=='natural'})
fam_mother_only=len({x['mother']['parent'] for c,x in kids.items() if 'mother' in x and 'father' not in x})
print('GEDCOM: INDI',len(G),'FAM from unions',len(U),'father-only families',fam_father_only,'mother-only families',fam_mother_only,'kin-only persons (ASSO)',len(kinonly-inG),'non-parent edges as NOTE/ASSO (ancestor, alternative, by-luke, legal, adoptive)',sum(1 for o in E if o['kind']!='natural'))
# 16. ширины подписей редакции 4 (шкала 08 ред. 3.2: имя 14, подписи 12)
if len(sys.argv)>1:
  for s4 in ['В этих стихах мать не названа','мать не названа','браком не назван','союз без брака','по словам Авраама','Лука: «Илиев»','Показать ещё 6 детей','Ещё 6','у Матфея не названы','из потомков Каина']:
    print('label r4 Golos 450 12px',round(g45(s4,12)),'| 14px',round(g45(s4,14)),'|',s4)
  print('area label r4 КОЛЕНО РУВИМОВО Golos 500 12px tracking 0.12',round(g5('КОЛЕНО РУВИМОВО',12,0.12)))
# 17. входы: число лиц на первом экране (из данных)
def kids_all(p): return [c for c in kidsof[p]]
adam=['p-adam','p-eva']+kids_all('p-adam')
x='p-sif'
while x!='p-noy':
  nx=[c for c in kidsof[x] if c in lpa and lpa[c][0]==x]; x=[c for c in nx if row(c)[0]<=row('p-noy')[0] and 'p-noy' in (lambda s:s)(set([c]))|desc(c)][0]; adam.append(x)
y='p-kain'; cain=[]
for u in U:
  if u['husband']=='p-kain': cain.append(u['wife'])
while nm(y)!='Ламех':
  y=kidsof[y][0]; cain.append(y)
lam=y; cain+=[u['wife'] for u in U if u['husband']==lam]
print('route Адам—Ной persons',len(set(adam+cain)),'Cain line',[nm(c) for c in cain],'Cain line end children',[nm(c) for c in kidsof[lam]])
cain+=kidsof[lam]; print('route Адам—Ной with Lamech children',len(set(adam+cain)))
noah=['p-noy']+[lpa['p-noy'][0]]+kidsof['p-noy']+[c for s in kidsof['p-noy'] for c in kidsof[s]]
print('route Ной persons',len(set(noah)))
tribes=['p-iakov']+[u['wife'] for u in U if u['husband']=='p-iakov']+kidsof['p-iakov']+kidsof.get('p-iosif',[])
print('route 12 колен persons',len(set(tribes)),[nm(c) for c in kidsof.get('p-iosif',[])])
ab=['p-farra']+kidsof['p-farra']+[u['wife'] for u in U if u['husband']=='p-avraam']+kidsof['p-avraam']+['p-revekka']+kidsof['p-isaak']+[u['wife'] for u in U if u['husband']=='p-iakov']+kidsof['p-iakov']
print('route Авраам—Иаков persons',len(set(ab)))
LJ=json.load(open('base/lines/joseph.json'))['persons']; LL=json.load(open('base/lines/luke.json'))['persons']
ids=set(p['id'] for p in LJ)|set(p['id'] for p in LL)
print('braid persons in both lines files',len(ids),'Mary in lines',('p-mariya' in ids),'Jesus in lines',('p-iisus' in ids),'omitted',sum(1 for p in LJ if p.get('flag')=='omitted-by-mt'))
# 18. плотность первого экрана схемы (08 § 3.4, строка 77 § 15): шапка 64, строка инструмента 48 (мышь), описание перед схемой 64; поля 24; лист выбранного 368; шаг рядов 72; имя — медиана 52 px + промежуток 24
for w,h in [(1280,800),(1280,720),(1024,768)]:
  H=h-64-48-64; W=w-48
  print('first screen',w,'x',h,': rows',H//72,'names per row',W//(52+24),'with side sheet',(W-368)//(52+24))
# 19. образцы отчётов для эскизов § 10 (прочтения по умолчанию)
def ahnen(p,maxn=12):
  rows=[(1,0,p)]; q=[(1,0,p)]
  while q:
    n,g,x=q.pop(0)
    for r,par_ in sorted(par4[x].items(),key=lambda kv: kv[0]!='father'):
      m=2*n+(0 if r=='father' else 1); rows.append((m,g+1,par_)); q.append((m,g+1,par_))
  rows.sort(key=lambda t:(t[1],t[0]))
  return rows
R19=ahnen('p-david')
refs_of_edge=lambda c,p_: next((o['refs'] for o in E if o['child']==c and o['parent']==p_ and act(o)),[])
child_of={}
for m,g,x in R19:
  pass
print('ancestors report David first rows',[(m,g,nm(x)) for m,g,x in R19[:14]])
def daboville(p,depth=2):
  out=[('1',0,p)]
  def rec(x,lab,d):
    if d==depth: return
    i=0
    for o in sorted([o for o in E if o['parent']==x and act(o) and o['primary'] and o['kind']=='natural'],key=lambda o:o.get('order',99)):
      i+=1; l=lab+'.'+str(i); out.append((l,d+1,o['child'])); rec(o['child'],l,d+1)
  rec(p,'1',0); return out
print('descendants report Aaron',[(l,nm(x)) for l,g,x in daboville('p-aaron',2)])
print('Aaron unions',[(nm(u['wife']),[(t['kind'],t.get('word'),t['refs']) for t in u['terms']]) for u in U if u['husband']=='p-aaron'])
print('Aaron children refs',[(nm(o['child']),o['refs'],o['cert']) for o in E if o['parent']=='p-aaron' and o['kind']=='natural'])
print('David parents',[(r,nm(q),refs_of_edge('p-david',q)) for r,q in par4['p-david'].items()],'Jesse',[(r,nm(q),refs_of_edge('p-iessey',q)) for r,q in par4.get('p-iessey',{}).items()])
# 20. потеря предков (одно лицо под двумя номерами Аненталь) и высота отчётов
from collections import Counter as _C
cD=_C(x for m,g,x in R19)
print('ahnentafel rows David',len(R19)-1,'unique',len(cD)-1,'repeated persons',[(nm(x),c) for x,c in cD.items() if c>1][:10])
RJ=ahnen('p-iosif-muzh-marii'); cJ=_C(x for m,g,x in RJ)
print('ahnentafel rows Joseph (Mt)',len(RJ)-1,'unique',len(cJ)-1,'repeated',len([x for x,c in cJ.items() if c>1]))
print('prominence 5 in G',sum(1 for i in G if A[i].get('prominence')==5),'prominence >=4',sum(1 for i in G if (A[i].get('prominence') or 0)>=4))
# --- редакция 5 (панель на ред. 4) ---
print('== редакция 5')
# 21. союзы по видам (число союзов, не слов)
print('unions by kind',dict(collections.Counter(sorted({t['kind'] for t in u['terms']}).__str__() for u in U)))
only_conc=[(nm(u['husband']),nm(u['wife'])) for u in U if {t['kind'] for t in u['terms']}=={'concubine'}]
print('unions with only «наложница»',len(only_conc),only_conc)
# 22. обзор: честный счётчик каждой области (потомки основателя до границы другой области; Сыны Хеттуры — от союза) и размах рядов
founders={}
for g in AR:
  if contour(g):
    f=AR[g]['founder']; founders[g]=f if isinstance(f,str) else (f[0] if f else None)
stopset={f for f in founders.values() if f}
def desc_stop(roots,own):
  s=set(); st=list(roots)
  while st:
    x=st.pop()
    for c in ch.get(x,[]) if isinstance(ch,dict) else []:
      pass
  return s
chs=collections.defaultdict(set)
for o in E:
  if act(o) and o['kind'] in('natural','ancestor') and o['cert'] in('scripture','inference'): chs[o['parent']].add(o['child'])
def dstop(roots,own):
  s=set(); st=list(roots)
  while st:
    x=st.pop()
    for c in chs[x]:
      if c in s: continue
      if c in stopset and c!=own: continue
      s.add(c); st.append(c)
  return s
nested={g:[h for h in AR if AR[h].get('parent')==g] for g in AR}
rows_area={}
for g in sorted(founders,key=lambda g:AR[g]['name']):
  f=founders[g]
  if AR[g]['name']=='Сыны Хеттуры':
    roots=[c for c in kidsof['p-avraam'] if kids.get(c,{}).get('mother',{}).get('parent')=='p-khettura']; base_=set(roots)|dstop(roots,None)
  else:
    base_=dstop([f],f) if f else set()
  # вложенные области с контуром считаются внутри
  for h in nested[g]:
    if h in founders and founders[h]: base_|={founders[h]}|dstop([founders[h]],founders[h])
  mem_rows=[row(x)[0] for x in base_ if row(x)[1]=='p-adam']  # размах рядов — по потомкам основателя
  frow=row(f)[0] if f and row(f)[1]=='p-adam' else None
  print('area r5',AR[g]['name'],'| founder',nm(f) if f else '-','| kin count',len(base_),'| members',own[g]+sum(own[h] for h in nested[g]),'| founder row',frow,'| rows',(min(mem_rows),max(mem_rows)) if mem_rows else None)
# 23. отбор «только отобранные»: доля изолированных (нет другого отобранного в той же семье-острове по рёбрам родитель — ребёнок обоих родителей, «из сыновей» и союзам)
adj=collections.defaultdict(set)
for o in E:
  if act(o) and o['kind'] in('natural','ancestor','adoptive') and o['cert'] in('scripture','inference'): adj[o['parent']].add(o['child']); adj[o['child']].add(o['parent'])
for u in U: adj[u['husband']].add(u['wife']); adj[u['wife']].add(u['husband'])
compid={}
for n in G:
  if n in compid: continue
  st=[n]; cid=n
  while st:
    x=st.pop()
    if x in compid: continue
    compid[x]=cid; st+=list(adj[x])
groups={'названные женщины':[i for i in G if A[i].get('sex')=='f' and A[i]['kind']=='human'],
        'цари':[i for i in G if 'king' in (A[i].get('roles') or [])],
        'пророки':[i for i in G if 'prophet' in (A[i].get('roles') or [])],
        'священники':[i for i in G if 'priest' in (A[i].get('roles') or [])]}
for k,v in groups.items():
  cc=collections.Counter(compid[i] for i in v); iso=sum(1 for i in v if cc[compid[i]]==1)
  print('induced tree',k,'selected',len(v),'isolated',iso,'share %',round(iso/len(v)*100))
# 24. песочные часы по поколениям (вниз — все кровные дети; вверх — оба родителя)
def gens_down(p,m):
  fr={p}; out=[]
  for _ in range(m): fr={c for x in fr for c in chs[x]}; out.append(len(fr))
  return out
for p in ['p-david','p-avraam','p-iakov']: print('hourglass per generation down',nm(p),gens_down(p,3))
# 25. Аненталь без пути «по словам» (ребро Фарра → Сарра снято)
par_ns={k:dict(v) for k,v in par4.items()}
par_ns.get('p-sarra',{}).pop('father',None)
def ahnen2(p,P):
  rows=[(1,0,p)]; q=[(1,0,p)]
  while q:
    n,g,x=q.pop(0)
    for r,pp in sorted(P.get(x,{}).items(),key=lambda kv: kv[0]!='father'):
      m=2*n+(0 if r=='father' else 1); rows.append((m,g+1,pp)); q.append((m,g+1,pp))
  return rows
r2=ahnen2('p-david',par_ns); print('ahnentafel David without saidBy path: rows',len(r2)-1,'unique',len({x for m,g,x in r2})-1)
gap_on_path=lambda p:[ (nm(o['parent']),nm(o['child'])) for o in E if o.get('gapSuspected') and o['child'] in ({x for m,g,x in ahnen('p-ezdra')}|{'p-ezdra'}) and o['parent'] in {x for m,g,x in ahnen(p)} ]
print('gapSuspected on ancestor path: Ezra',len(gap_on_path('p-ezdra')),'David',len([1 for o in E if o.get('gapSuspected') and o['child'] in {x for m,g,x in ahnen('p-david')} and o['parent'] in {x for m,g,x in ahnen('p-david')}]))
print('max ahnentafel generation David / Joseph / Ezra',max(g for m,g,x in ahnen('p-david')),max(g for m,g,x in ahnen('p-iosif-muzh-marii')),max(g for m,g,x in ahnen('p-ezdra')))
# 26. GEDCOM по правилу ред. 5: FAM на союз + FAM на каждого ребёнка без названной матери + FAM только с матерью
kids_nomother=[c for c,x in kids.items() if 'father' in x and 'mother' not in x and x['father']['kind']=='natural']
print('GEDCOM r5: FAM unions',len(U),'children without named mother (one FAM each)',len(kids_nomother),'mother-only FAM',fam_mother_only,'total',len(U)+len(kids_nomother)+fam_mother_only)
long_ids=sum(1 for i in G if len(i)>20); print('person ids longer than 20 in Genealogy',long_ids,'max',max(len(i) for i in G))
# 27. обзор-диаграмма: полосы областей по оси «ряд» (ред. 5); подпись строчными + число, Golos 450 12 px
if len(sys.argv)>1:
  labs=[]
  for g in founders:
    nmg=AR[g]['name']; labs.append(nmg[0]+nmg[1:])
  wl=max(round(g45(l+' · 442',12)) for l in labs)
  for w,h in [(1280,800),(1280,720),(1024,768)]:
    other=160; bar=w-48-wl-16-other; per=bar/71
    H=h-64-48-64; need=48+28*20
    print('overview bars',w,'x',h,': label column',wl,'px, bar area',round(bar),'px,',round(per,1),'px per row; height need',need,'of',H)
