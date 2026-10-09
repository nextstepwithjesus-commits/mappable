import json,re,math,collections,sys
rows=[json.loads(l) for l in open(sys.argv[1]) if l.strip()]
def clean(s): return re.sub(r'<[^>]+>','',s or '')
def deg(s): return 'уверенно' if s>=800 else 'вероятно' if s>=500 else 'предположительно' if s>=300 else 'не установлено'
def hav(a,b):
    R=6371; la1,lo1=map(math.radians,(a[1],a[0])); la2,lo2=map(math.radians,(b[1],b[0]))
    return 2*R*math.asin(math.sqrt(math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
changes=collections.Counter(); ex=[]
for r in rows:
    ids=sorted(r.get('identifications',[]),key=lambda i:-i['score'].get('time_total',0))
    if ids and ids[0].get('id_source')=='special' and clean(ids[0]['description']).startswith(('unknown','not a')): continue
    ma=r.get('modern_associations') or {}
    if not ma: continue
    # coordinates of modern ids
    coord={}
    for i in r.get('identifications',[]):
        for res in i.get('resolutions',[]) or []:
            mid=res.get('modern_basis_id'); ll=res.get('lonlat')
            if mid and ll and mid not in coord:
                coord[mid]=tuple(map(float,ll.split(',')))
    items=[(k,v['score'],v['name']) for k,v in ma.items() if k in coord]
    if not items: continue
    best=max(items,key=lambda x:x[1])
    s0=best[1]
    for R in (5,):
        s=sum(max(0,sc) for k,sc,n in items if hav(coord[k],coord[best[0]])<=R)
        s=min(s,1000)
        if deg(s)!=deg(s0):
            changes[(deg(s0),deg(s))]+=1
            if len(ex)<25: ex.append((r['friendly_id'],s0,s,[n for k,sc,n in items if hav(coord[k],coord[best[0]])<=R]))
print(changes); 
for e in ex: print(e)
