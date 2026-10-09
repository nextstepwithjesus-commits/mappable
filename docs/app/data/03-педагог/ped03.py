# Рецензия педагога на 03: числа по base/ (запуск: python3 -I ped03.py)
import json,glob,collections
B='/home/user/mappable/base/'
nm={};kind={}
for f in glob.glob(B+'actors/*.json'):
    for p in json.load(open(f))['items']:
        nm[p['id']]=p['names'][0]['form'] if p.get('names') else p['id']; kind[p['id']]=p.get('kind')
u=json.load(open(B+'unions.json'))['items']
c=collections.Counter((t['kind'],t.get('word')) for x in u for t in x['terms'])
print('союзов:',len(u)); [print(' ',v,k) for k,v in c.most_common()]
print('союзы вида not-stated:')
for x in u:
    if any(t['kind']=='not-stated' for t in x['terms']): print('  ',nm.get(x['husband']),'+',nm.get(x['wife']),x['terms'][0]['refs'][:2])
wives=collections.defaultdict(list); hus=collections.defaultdict(list)
for x in u: wives[x['husband']].append(x['wife']); hus[x['wife']].append(x['husband'])
print('мужей с 2+ союзами:',sum(len(v)>1 for v in wives.values()),'; жён с 2+ союзами:',sum(len(v)>1 for v in hus.values()))
o=json.load(open(B+'origins.json'))['items']
fa=collections.defaultdict(set); mo=collections.defaultdict(set)
for e in o:
    if e['kind']=='natural' and e.get('primary'): (fa if e['role']=='father' else mo)[e['child']].add(e['parent'])
res=collections.defaultdict(list)
for ch,fs in fa.items():
    if ch in mo or kind.get(ch) in ('people','clan','group'): continue
    for f in fs:
        if f in wives: res[f].append(ch)
one={f:cs for f,cs in res.items() if len(wives[f])==1}
print('отцов с союзом, у которых есть дети без названной матери:',len(res),'детей:',sum(map(len,res.values())))
print('из них с одним союзом:',len(one),'детей:',sum(map(len,one.values())),sorted(nm[f] for f in one))
print('особые рёбра:',[(e['kind'],nm[e['parent']],nm[e['child']]) for e in o if e['kind'] in('adoptive','legal')])
