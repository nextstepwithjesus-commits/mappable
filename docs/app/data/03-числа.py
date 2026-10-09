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
