import json,sys,math
ob='/tmp/claude-0/-home-user-mappable/363662e0-5ad0-5c06-8af9-3b281ad3b8ff/scratchpad/dl/obgd/data/'
anc={}
for l in open(ob+'ancient.jsonl'):
    r=json.loads(l); anc[r['friendly_id']]=r
mod={}
for l in open(ob+'modern.jsonl'):
    r=json.loads(l); mod[r['id']]=r
def pt(name):
    r=anc[name]; ma=r['modern_associations']
    mid=max(ma,key=lambda k:ma[k]['score'])
    ll=mod[mid]['lonlat']
    x,y=map(float,ll.split(',')) if isinstance(ll,str) else ll
    return x,y,ma[mid]['name']
land=json.load(open('ne/ne_10m_land.geojson'))
polys=[]
for f in land['features']:
    g=f['geometry']; cs=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    for poly in cs:
        xs=[p[0] for p in poly[0]]; ys=[p[1] for p in poly[0]]
        if max(xs)<25 or min(xs)>50 or max(ys)<25 or min(ys)>42: continue
        polys.append(((min(xs),min(ys),max(xs),max(ys)),poly))
def inring(x,y,R):
    c=False
    for i in range(len(R)-1):
        x1,y1=R[i];x2,y2=R[i+1]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
def onland(x,y):
    for b,poly in polys:
        if b[0]<=x<=b[2] and b[1]<=y<=b[3] and inring(x,y,poly[0]) and not any(inring(x,y,h) for h in poly[1:]): return True
    return False
def km(a,b):
    R=6371; la1,la2=map(math.radians,(a[1],b[1])); dl=math.radians(b[0]-a[0])
    return R*math.acos(min(1,math.sin(la1)*math.sin(la2)+math.cos(la1)*math.cos(la2)*math.cos(dl)))
segs=[('Seleucia','Salamis'),('Paphos','Perga'),('Attalia','Antioch 1')]
for a,b in segs:
    A=pt(a);B=pt(b); n=400; runs=[];cur=None
    landpts=0
    for i in range(n+1):
        t=i/n; x=A[0]+(B[0]-A[0])*t; y=A[1]+(B[1]-A[1])*t
        L=onland(x,y); landpts+=L
        if L and cur is None: cur=t
        if not L and cur is not None: runs.append((cur,t)); cur=None
    if cur is not None: runs.append((cur,1))
    d=km(A,B)
    print(f'{a} {A[:2]} -> {b} {B[:2]}: {d:.0f} km; on land {landpts/(n+1)*100:.0f}% ; land runs (km):',[(round(s*d),round(e*d)) for s,e in runs])
