import json,sys
f=sys.argv[1]
for line in open(f):
    r=json.loads(line)
    if r['friendly_id']=='Bethel 1':
        print(list(r.keys()))
        for k,v in r.items():
            if k not in('extra','identifications'): print(k, str(v)[:300])
        ma=r.get('modern_associations')
        print(type(ma))
        break
