import json,re,collections,sys
path=sys.argv[1]
rows=[json.loads(l) for l in open(path) if l.strip()]
def clean(s): return re.sub(r'<[^>]+>','',s or '')
def degree(r):
    ids=sorted(r.get('identifications',[]),key=lambda i:-i['score'].get('time_total',0))
    if ids and ids[0].get('id_source')=='special' and clean(ids[0]['description']).startswith(('unknown','not a')):
        return 'не установлено',0,ids
    ma=r.get('modern_associations') or {}
    s=max([v['score'] for v in ma.values()] or [0])
    d='уверенно' if s>=800 else 'вероятно' if s>=500 else 'предположительно' if s>=300 else 'не установлено'
    return d,s,ids
c=collections.Counter(); one=collections.Counter(); votes=collections.defaultdict(list); srcs=collections.defaultdict(list)
modlist=collections.Counter()
for r in rows:
    d,s,ids=degree(r)
    c[d]+=1
    if len(ids)==1: one[d]+=1
    if ids:
        b=ids[0]
        votes[d].append(b['score'].get('vote_count',0))
        srcs[d].append(len(b.get('sources',[])) if isinstance(b.get('sources'),list) else -1)
        modlist[(d,b.get('modifier'))]+=1
print('total',c)
print('single identification by degree',one)
import statistics
for d in votes:
    v=votes[d]; print(d,'best-id vote_count median',statistics.median(v),'<=2 votes:',sum(1 for x in v if x<=2),'of',len(v))
# key sample
for n in ['Dophkah','Alush','Wilderness of Sinai','Mount Horeb','Moseroth','Moserah','Mount Hor 1','Mount Hor 2','Heshbon','Ur 1','Kadesh-barnea','Kadesh 1','Zin 1','Sin','Aroer 1','Aroer 2','Aroer 3','Cana','Kanah 1','Kanah 2','Red Sea 1','Red Sea 2','Red Sea 3','Golgotha','Emmaus','Hobah','Luz 1','Luz 2','Bethel 1','Beth-aven 1','Beth-aven 2','Egypt','Ararat','Eden 1','Mamre','Shur','Moriah','Mount Moriah','Rameses','Dan','Dan 1','Tigris','Hiddekel','Elim','Marah','Derbe','Haran','Pi-hahiroth']:
    r=next((x for x in rows if x['friendly_id']==n),None)
    if not r: print(n,'— нет'); continue
    d,s,ids=degree(r)
    print(n,d,s,'ids',len(ids),[ (clean(i['description'])[:40], i['score'].get('time_total'), i['score'].get('vote_count')) for i in ids[:4]], 'types',r.get('types'))
