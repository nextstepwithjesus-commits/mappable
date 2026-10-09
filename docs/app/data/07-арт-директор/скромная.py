"""Рецензия арт-директора на 07: что увидит читатель на скромной и средней карточке.

Запуск из корня: python3 -I docs/app/data/07-арт-директор/скромная.py
Размер карточки — по правилу 07 § 3 (как docs/app/data/07-числа.py).
Считает: число стихов шапки и их длину в знаках и строках; сколько разделов
и записей покажет простой слой; сколько раз адрес из шапки повторится в разделах;
сколько стихов шапки — перечни имён (грубо, по списку глав-перечней);
есть ли у лица родство, места, тёзки. Это оценка облика, а не данные.
"""
import collections, glob, json, re, statistics as st

acts = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        acts[a['id']] = a

text = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t')[:4]
    text[f'{b}{c}:{v}'] = t


def norm_ref(r):
    return r.replace(' ', '')


def expand(r):
    r = norm_ref(r)
    m = re.match(r'^(.*?)(\d+):(\d+)(?:-(\d+))?$', r.strip())
    if not m:
        return [r]
    b, c, v1, v2 = m.group(1), m.group(2), int(m.group(3)), int(m.group(4) or m.group(3))
    return [f'{b}{c}:{v}' for v in range(v1, v2 + 1)]


def walk(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ('prov', 'key'):
                continue
            if k == 'refs' and isinstance(v, list):
                for r in v:
                    acc.update(expand(r))
            else:
                walk(v, acc)
    elif isinstance(o, list):
        for v in o:
            walk(v, acc)


# прежний раздел -> новый (07 § 5.3); 3 -> 1 (упрощённо), 23 и 24 не считаются
OLD2NEW = {1: 1, 4: 1, 2: 2, 3: 1, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 7, 11: 8, 12: 9,
           13: 10, 14: 11, 15: 12, 16: 13, 17: 14, 18: 15, 19: 16, 20: 17, 21: 18, 22: 19}

refs = collections.defaultdict(set)
recs = collections.defaultdict(list)   # (новый раздел, множество стихов)
for i, a in acts.items():
    for fct in a.get('facts', []):
        if fct.get('prov', {}).get('status') == 'quarantine' or fct.get('sec') in (23, 24):
            continue
        s = set()
        walk(fct['value'], s)
        refs[i] |= s
        recs[i].append((OLD2NEW.get(fct.get('sec')), s))
    walk(a.get('names', []), refs[i])

children = collections.defaultdict(int)
parents = collections.defaultdict(int)
for fn, keys in (('origins', ('child', 'parent')), ('unions', ('husband', 'wife'))):
    for x in json.load(open(f'base/{fn}.json', encoding='utf-8'))['items']:
        s = set()
        walk(x, s)
        for k in keys:
            if x.get(k) in acts:
                refs[x[k]] |= s
        if fn == 'origins':
            if x.get('child') in acts:
                recs[x['child']].append((4, s)); parents[x['child']] += 1
            if x.get('parent') in acts:
                recs[x['parent']].append((7, s)); children[x['parent']] += 1
        else:
            for k in keys:
                if x.get(k) in acts:
                    recs[x[k]].append((7, s))


def size(i):
    if (acts[i].get('prominence') or 0) >= 3:
        return 'богатая'
    return 'скромная' if len(refs[i]) <= 3 else 'средняя'


sz = {i: size(i) for i in acts}
print('Размеры:', dict(collections.Counter(sz.values())))

LISTS = {  # главы-перечни имён, грубо
    'Быт': {5, 10, 11, 25, 36, 46}, 'Исх': {6}, 'Чис': {1, 2, 3, 7, 10, 13, 26, 34},
    '1Пар': set(range(1, 10)) | {11, 12, 15, 23, 24, 25, 26, 27}, 'Езд': {2, 8, 10},
    'Неем': {3, 7, 10, 11, 12}, 'Мф': {1}, 'Лк': {3}, 'Нав': {15, 19, 21},
}


def is_list(v):
    m = re.match(r'^(.*?)(\d+):', v)
    return bool(m) and int(m.group(2)) in LISTS.get(m.group(1), set())


def report(kind):
    ids = [i for i in acts if sz[i] == kind]
    n = len(ids)
    print(f'\n== {kind}: {n}')
    vc = collections.Counter(len(refs[i]) for i in ids)
    print('стихов о предмете:', dict(sorted(vc.items())))
    if kind != 'скромная':
        return
    chars = [sum(len(text.get(v, '')) for v in refs[i]) for i in ids]
    print('знаков в стихах шапки: медиана', st.median(chars), '; 90-й процентиль',
          sorted(chars)[int(n * .9)], '; максимум', max(chars))
    # строки: 66 знаков (ноутбук, R13 § 5.2) и 34 знака (телефон, 18 px в 328 px)
    for w, nm in ((66, 'ноутбук'), (34, 'телефон')):
        ln = sorted(sum(-(-len(text.get(v, '')) // w) for v in refs[i]) for i in ids)
        print(f'строк стихов шапки ({nm}, {w} зн.): медиана', st.median(ln), '; 90-й', ln[int(n * .9)])
    allist = sum(1 for i in ids if refs[i] and all(is_list(v) for v in refs[i]))
    print('все стихи шапки — из глав-перечней (грубо):', allist, f'({allist / n:.0%})')
    secs = []
    reps = []
    for i in ids:
        s = {sec for sec, _ in recs[i] if sec and sec not in (1, 2)}
        s.add(20)
        secs.append(len(s))
        reps.append(sum(1 for sec, r in recs[i] if sec and sec != 2 and r) + 1)  # + раздел 20
    print('разделов простого слоя (без 1, 2, 21): ', dict(sorted(collections.Counter(secs).items())))
    print('строк с адресом в разделах (каждый адрес уже показан в шапке целиком): медиана',
          st.median(reps), '; 90-й', sorted(reps)[int(n * .9)])
    one = [i for i in ids if len(refs[i]) == 1]
    print('назван в одном стихе:', len(one))
    hp = sum(1 for i in ids if parents[i])
    hc = sum(1 for i in ids if children[i])
    print('есть ребро родителя:', hp, f'({hp / n:.0%})', '; есть дети:', hc, f'({hc / n:.0%})',
          '; нет ни родителей, ни детей:', sum(1 for i in ids if not parents[i] and not children[i]))
    pl = sum(1 for i in ids if any(sec == 12 for sec, _ in recs[i]))
    print('есть места (раздел 12):', pl, f'({pl / n:.0%}) -> «География: мест не найдено» у', n - pl)
    dz = sum(1 for i in ids if acts[i].get('disambig'))
    print('есть уточнение тёзки (disambig):', dz, f'({dz / n:.0%})')
    print('пример одного стиха:', [(acts[i]['names'][0]['form'], sorted(refs[i])) for i in one[:6]])


for k in ('скромная', 'средняя', 'богатая'):
    report(k)

# тёзки: одна основная форма имени у нескольких лиц
main = {i: next((n['form'] for n in a.get('names', []) if n.get('type') == 'main'), None) for i, a in acts.items()}
cnt = collections.Counter(main.values())
mod = [i for i in acts if sz[i] == 'скромная']
tz = [i for i in mod if main[i] and cnt[main[i]] > 1]
print('\nскромных с тёзками (уточнение в шапке):', len(tz), f'({len(tz) / len(mod):.0%})')
dl = sorted(len(acts[i].get('disambig') or '') for i in tz)
print('длина поля disambig у них, знаков: медиана', st.median(dl), '; 90-й', dl[int(len(dl) * .9)], '; максимум', dl[-1])
print('примеры:', [(main[i], acts[i].get('disambig')) for i in tz[:5]])

# соседи по стиху: сколько других лиц базы названо в стихах шапки скромной карточки
byverse = collections.defaultdict(set)
for i in acts:
    for v in refs[i]:
        byverse[v].add(i)
nb = sorted(len(set().union(*(byverse[v] for v in refs[i])) - {i}) if refs[i] else 0 for i in mod)
print('\nсоседей по стихам шапки у скромной: медиана', st.median(nb), '; без соседей',
      sum(1 for x in nb if x == 0), '; 90-й', nb[int(len(nb) * .9)])

# скобки в стихах шапки скромной карточки
br = sum(1 for i in mod if any(('[' in text.get(v, '') or '(' in text.get(v, '')) for v in refs[i]))
print('скромных, у которых в стихах шапки есть скобки:', br, f'({br / len(mod):.0%})')
