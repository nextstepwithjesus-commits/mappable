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
