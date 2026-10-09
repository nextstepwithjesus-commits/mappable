import json,sys,math
anc={}; mod={}
for l in open(sys.argv[1]):
    r=json.loads(l); anc[r['friendly_id']]=r
for l in open(sys.argv[2]):
    r=json.loads(l); mod[r['id']]=r
def best(fid):
    r=anc[fid]; ma=r['modern_associations']
    k=max(ma,key=lambda k:ma[k]['score'])
    m=mod.get(k)
    ll=m.get('lonlat') if m else None
    return k, ma[k]['score'], ll
for fid in sys.argv[3:]:
    try:
        print(fid, best(fid))
    except Exception as e: print(fid,'ERR',e)
