# Рецензия доступности на 03: длина путей для клавиатуры и программ чтения.
# Запуск из корня: python3 -I "docs/app/data/03-доступность/шаги.py"
# Родитель раскладки и ряд — по 03 § 3.3 и приложению А (как docs/app/data/03-числа.py).
import json, glob, collections

A = {a['id']: a for f in glob.glob('base/actors/*.json') for a in json.load(open(f))['items']}
O = json.load(open('base/origins.json'))['items']
U = json.load(open('base/unions.json'))['items']
R = {r['id']: r['default'] for r in json.load(open('base/readings.json'))['items']}
act = lambda o: (not o.get('reading')) or R[o['reading']['set']] in o['reading']['in']
nm = lambda i: A[i]['names'][0]['form']

lp = {}
for o in O:
    if not o.get('parent') or not act(o):
        continue
    if o['kind'] == 'natural' and o['cert'] in ('scripture', 'inference'):
        if o['role'] == 'father' or o['child'] not in lp:
            lp[o['child']] = o['parent']
for o in O:
    if o.get('parent') and act(o) and o['kind'] == 'ancestor' and o['child'] not in lp:
        lp[o['child']] = o['parent']

def chain(x):
    c = [x]; s = set()
    while c[-1] in lp and c[-1] not in s:
        s.add(c[-1]); c.append(lp[c[-1]])
    return c[::-1]

print('1. «Где я» — цепь от корня острова (ссылок в цепи):')
for p in ['p-noy', 'p-avraam', 'p-iakov', 'p-david', 'p-iosiya', 'p-iosif-muzh-marii', 'p-iisus', 'p-ezdra']:
    if p in A:
        c = chain(p)
        print(f'   {nm(p)}: {len(c)} (корень — {nm(c[0])})')
depth = {x: len(chain(x)) - 1 for x in lp}
mx = max(depth.values())
print('   наибольший ряд:', mx, [nm(x) for x, d in depth.items() if d == mx][:3])

# Дети союзов и группы
kids = collections.defaultdict(list); anc = collections.Counter()
kids_lp = {o['child'] for o in O if o.get('parent') and act(o) and o['kind'] == 'natural' and o['cert'] in ('scripture', 'inference')}
for o in O:
    if o.get('parent') and act(o):
        if o['kind'] == 'ancestor':
            if o['child'] not in kids_lp:
                anc[o['parent']] += 1
        elif o['primary']:
            kids[o['parent']].append(o['child'])
top = sorted(((len(v), nm(k)) for k, v in kids.items()), reverse=True)[:6]
print('2. Больше всего детей у одного лица (кровные и особые рёбра):', top)
print('3. Группы «из сыновей такого-то»: больше всех', [(nm(k), v) for k, v in anc.most_common(5)],
      '; нажатий «ещё» при порциях по 12 у Аарона:', -(-anc['p-aaron'] // 12) - 1)
uc = collections.Counter()
for u in U:
    uc[u['husband']] += 1; uc[u['wife']] += 1
print('4. Больше всего союзов:', [(nm(k), v) for k, v in uc.most_common(4)])

# Дерево «Предки» по шаблону APG: от лица к корню — → раскрыть, → к первому вложенному
for p in ['p-iosif-muzh-marii', 'p-david']:
    d = len(chain(p)) - 1
    print(f'5. Дерево «Предки» от {nm(p)} до {nm(chain(p)[0])}: уровней {d + 1}; нажатий → не меньше {2 * d}'
          ' (каждый уровень: раскрыть и войти; при матери — ещё ↓)')
J = json.load(open('base/lines/joseph.json'))['persons']
L = json.load(open('base/lines/luke.json'))['persons']
rows = list(dict.fromkeys([p['id'] for p in J] + [p['id'] for p in L]))
both = {p['id'] for p in J} & {p['id'] for p in L}
print(f'6. «Линии Мессии»: у Мф {len(J)} лиц (с лицами до Авраама и опущенными), у Лк {len(L)}; общих {len(both)};'
      f' строк при выравнивании по лицам {len(rows)}; клеток при четырёх столбцах {4 * len(rows)}')

# Семейная страница Иакова (03 § 6.5) — оценка смахиваний VoiceOver на iPhone до сына Иуды.
# Допущения: каждая ссылка и каждый отдельный текст — один элемент; знаки «›» скрыты; адрес стиха — ссылка.
c = chain('p-iakov')
head = 1 + 1 + 2          # h1, уточнение, область со счётчиком (ссылка и текст)
where = 1 + len(c)        # заголовок «Где я» и ссылки цепи
parents = 1 + 2 * 3       # заголовок; у каждого родителя: имя, слово текста, стих
union1 = 1 + 1 + 2        # h3 «Союз с Лией», супруг, вид словом и стих
judah = 4                 # Рувим, Симеон, Левий, Иуда
print(f'7. Семейная страница Иакова: до «Иуда» смахиваний около {head + where + parents + union1 + judah}'
      f' (из них «Где я» — {where}); если «Где я» свёрнута в одну кнопку — около {head + 1 + parents + union1 + judah}')
mt = {p['id'] for p in J if 'mt' in p}; lk = {p['id'] for p in L if 'lk' in p}
print(f'6а. С номером текста: у Мф {len(mt)}, у Лк {len(lk)}, общих {len(mt & lk)};'
      f' до Авраама (только Лк, «before-matthew»): {sum(1 for p in J if p.get("flag") == "before-matthew")};'
      f' опущенных Мф 1:8: {sum(1 for p in J if p.get("flag") == "omitted-by-mt")}')
