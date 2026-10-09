import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
def coords(g):
    if g['type']=='LineString': yield from g['coordinates']
    else:
        for l in g['coordinates']: yield from l
for f in d['features']:
    p=f['properties']; g=f['geometry']
    if not g: continue
    c=list(coords(g))
    if any(29<=y<=34.5 and 33.5<=x<=37.5 for x,y in c):
        print(p.get('name'), p.get('name_en'), p.get('featurecla'), p.get('scalerank'), len(c))
