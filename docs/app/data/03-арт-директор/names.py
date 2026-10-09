import json,glob,collections
R='/home/user/mappable/base/'
keys=collections.Counter(); people={}
for f in glob.glob(R+'actors/*.json'):
    for it in json.load(open(f))['items']:
        keys.update(it.keys()); people[it['id']]=it
print(keys)
# sample qualifier-like keys
for k in keys:
    if k not in ('id','kind','sex','names','prominence','facts'):
        ex=[it[k] for it in people.values() if k in it][:3]; print(k, ex)
sex=collections.Counter(it.get('sex') for it in people.values()); print('sex',sex)
kind=collections.Counter(it.get('kind') for it in people.values()); print('kind',kind)
