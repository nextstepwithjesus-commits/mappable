"""Числа документа 07: размеры карточек (§ 3) и неполные карточки (§ 8.3).

Запуск из корня: python3 -I docs/app/data/07-числа.py
Стих о предмете — ссылка записи о самом предмете: имя, утверждение (кроме
прежних § 23 «Места Писания» и § 24 «Примечания»), ребро, союз. Карантин не
учитывается. Диапазоны раскрываются.
"""
import collections, glob, json, re

acts = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        acts[a['id']] = a


def expand(r):
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


refs = collections.defaultdict(set)
for i, a in acts.items():
    for fct in a.get('facts', []):
        if fct.get('prov', {}).get('status') == 'quarantine' or fct.get('sec') in (23, 24):
            continue
        walk(fct['value'], refs[i])
    walk(a.get('names', []), refs[i])
for fn, keys in (('origins', ('child', 'parent')), ('unions', ('husband', 'wife'))):
    for x in json.load(open(f'base/{fn}.json', encoding='utf-8'))['items']:
        s = set()
        walk(x, s)
        for k in keys:
            if x.get(k) in acts:
                refs[x[k]] |= s


def size(i):
    if (acts[i].get('prominence') or 0) >= 3:
        return 'богатая'
    return 'скромная' if len(refs[i]) <= 3 else 'средняя'


sz = {i: size(i) for i in acts}
print('Лиц:', len(acts))
print('Размеры:', dict(collections.Counter(sz.values())))
print('Значимость не задана:', [i for i in acts if acts[i].get('prominence') is None])
print('Ила, сын Ваасы — стихов:', len(refs['p-ila-syn-vaasy']))

# § 8.3: у человека раздел 4 (родители) составлен, если есть ребро родителя
# (названного или неназванного) или «нет сведений» о родителях со стихами.
org = json.load(open('base/origins.json', encoding='utf-8'))['items']
has_parent = {o['child'] for o in org if o.get('parent') or o.get('unnamedParent')}
nod = json.load(open('base/nodata.json', encoding='utf-8'))['items']
nd_parents = {n['actor'] for n in nod if n['sec'] == 6 and n.get('refs')}
humans = [i for i, a in acts.items() if a['kind'] in ('human', 'unnamed')]
inc = [i for i in humans if i not in has_parent and i not in nd_parents]
print('Людей:', len(humans), '; неполных (раздел 4 не составлен):', len(inc),
      dict(collections.Counter(sz[i] for i in inc)))
print('Записей «silent» без стихов:', sum(1 for n in nod if n['kind'] == 'silent' and not n.get('refs')))

# --- Редакция 4 ---
# § 2: строка вида у человека — роль есть или нет (арт-директор, № 15).
role = collections.Counter(bool(acts[i].get('roles')) for i in humans)
print('Людей с ролью:', role[True], '; без роли:', role[False])
# § 5.1: заголовки простого слоя согласуются по полю пола; без пола — заголовок второго слоя.
sex = collections.Counter(acts[i].get('sex') or 'нет' for i in humans)
print('Пол у людей:', dict(sex))


# § 6.3.9: контраст WCAG 2.x по токенам 08 § 3.2.1 (они же R8 § 4.2; «чернила-3» — 08).
def lum(h):
    c = [int(h[k:k + 2], 16) / 255 for k in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


T = {
    'лист': ('#FFFFFF', '#1E2733'), 'подложка': ('#E8ECF1', '#2A3442'),
    'чернила': ('#18202C', '#E8ECF1'), 'чернила-2': ('#4A5463', '#A9B3C1'),
    'чернила-3': ('#5B6574', '#97A2B2'),
    'сетка': ('#C9D0DA', '#3A4555'), 'выбор': ('#FFD43B', '#F0D04A'),
    'текст на выборе': ('#18202C', '#161D27'),
    'Мф 1': ('#17599A', '#9AD1F7'), 'Лк 3': ('#CC5596', '#E4579C'),
}
for a, b in (('чернила', 'лист'), ('чернила-2', 'лист'), ('чернила', 'подложка'),
             ('чернила-2', 'подложка'), ('чернила-3', 'лист'), ('чернила-3', 'подложка'),
             ('текст на выборе', 'выбор'),
             ('Мф 1', 'лист'), ('Лк 3', 'лист'), ('сетка', 'лист')):
    print(f'контраст {a} — {b}: светлая {ratio(T[a][0], T[b][0]):.2f}; тёмная {ratio(T[a][1], T[b][1]):.2f}')

# --- Редакция 5 ---
print('--- редакция 5 ---')
OLD2NEW = {1: 1, 4: 1, 3: 1, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 7, 11: 8, 12: 9,
           13: 10, 14: 11, 15: 12, 16: 13, 17: 14, 18: 15, 19: 16, 20: 17, 21: 18, 22: 19}

# § 21: утверждения по модели «свойство — значение — уточнители — стихи — уровень».
facts = [f for a in acts.values() for f in a.get('facts', [])]
print('Утверждений лиц:', len(facts), '; в карантине:',
      sum(1 for f in facts if f.get('prov', {}).get('status') == 'quarantine'))
print('Уровень утверждений (поле cert; без поля — «сказано»):',
      dict(collections.Counter(f.get('cert', 'сказано') for f in facts)))
print('Свойств (поле field):', len({f['field'] for f in facts}))
def has_ref(o):
    if isinstance(o, dict):
        return any((k in ('refs', 'ref', 'first', 'key') and v) or has_ref(v) for k, v in o.items())
    if isinstance(o, list):
        return any(has_ref(v) for v in o)
    return False


bare = sum(1 for f in facts if f.get('prov', {}).get('status') != 'quarantine' and not has_ref(f['value']))
print('Утверждений вне карантина без стиха в значении:', bare)


def find_key(o, key, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key:
                acc.append(v)
            find_key(v, key, acc)
    elif isinstance(o, list):
        for v in o:
            find_key(v, key, acc)


said = []
for fn in ('kin', 'origins', 'unions'):
    find_key(json.load(open(f'base/{fn}.json', encoding='utf-8'))['items'], 'saidBy', said)
print('Записей с пометкой «по словам» (saidBy):', len(said), [s['label'] for s in said])
uni = json.load(open('base/unions.json', encoding='utf-8'))['items']
print('Обозначения союзов по виду:', dict(collections.Counter(t['kind'] for u in uni for t in u['terms'])))
print('«Писание молчит» со списком read:', sum(1 for n in nod if n.get('read')),
      '; с пометкой «нужно чтение»:', sum(1 for n in nod if n.get('needsReading')),
      '; «Писание говорит»:', sum(1 for n in nod if n['kind'] == 'scripture-says'))
chk = json.load(open('base/checks.json', encoding='utf-8'))['items']
print('Подписей второго ключа:', len(chk), dict(collections.Counter(c['key'].split(':')[0] for c in chk)),
      '; кто:', dict(collections.Counter(c['by'] for c in chk)))
print('Лиц с подписью:', sum(1 for c in chk if c['key'].startswith('actor:')), 'из', len(acts))

# § 22: тёзки — одна основная форма у нескольких лиц; и все формы (основная, варианты, прозвания).
main = collections.defaultdict(list)
allf = collections.defaultdict(set)
for i, a in acts.items():
    for n in a['names']:
        allf[n['form']].add(i)
        if n['type'] == 'main':
            main[n['form']].append(i)
g = {k: v for k, v in main.items() if len(v) > 1}
print('Имён с тёзками (основная форма):', len(g), '; лиц в них:', sum(len(v) for v in g.values()),
      f'({100 * sum(len(v) for v in g.values()) / len(acts):.0f} %)')
print('Самые частые:', [(k, len(v)) for k, v in sorted(g.items(), key=lambda x: (-len(x[1]), x[0]))[:6]])
print('Форм, общих для нескольких лиц (все виды имени):', sum(1 for v in allf.values() if len(v) > 1),
      '; Захария по всем формам:', len(allf['Захария']))
print('Уточнение (disambig) есть у', sum(1 for a in acts.values() if a.get('disambig')), 'лиц')

# § 23: что ссылается сюда — записи базы, где стоит номер лица.
others = {}
for fn in ('origins', 'unions', 'kin', 'memberships', 'chrono', 'readings', 'areas'):
    others[fn] = json.load(open(f'base/{fn}.json', encoding='utf-8'))['items']
for pid in ('p-david', 'p-avraam', 'p-ila-syn-vaasy', 'p-irad'):
    q = f'"{pid}"'
    row = {fn: sum(1 for x in it if q in json.dumps(x, ensure_ascii=False)) for fn, it in others.items()}
    row['записи других лиц'] = sum(1 for i, a in acts.items() if i != pid and q in json.dumps(a, ensure_ascii=False))
    print('Ссылается сюда', pid, row, 'всего', sum(row.values()))

# § 6.3.3: высота карточки — модель по шкале 08 ред. 3.2 (ноутбук 1280 x 720, видно 656 px под шапкой 64).
# Запись Golos 16/24, около 75 знаков в 7 колонках (662 px); адрес в строке (+12 знаков);
# цитата Literata 18/28, 69 знаков; заголовок блока раздела 22/28 и поля 8 + 8 = 44 px;
# между записями 12. Шапка карточки — как в § 6.3.3 (ниже). Блоки: «по умолчанию» —
# открыт блок, если в нём не больше 3 записей (простой слой) или 8 (второй слой);
# «всё раскрыто» — до 8 записей и „Показать ещё N“; раздел 14 — заголовки периодов.
QUOTE = {15, 16, 19}


def recs(pid):
    sec = collections.defaultdict(list)
    for f in acts[pid].get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 23, 24):
            continue
        n = OLD2NEW.get(f.get('sec'))
        if n:
            v = f['value']
            t = (v.get('text') or v.get('name') or v.get('title') or '') if isinstance(v, dict) else str(v)
            sec[n].append(len(t if isinstance(t, str) else '') or 20)
    for x in org:
        if x.get('child') == pid:
            sec[4].append(25)
        if x.get('parent') == pid:
            sec[7].append(25)
    for x in uni:
        if pid in (x.get('husband'), x.get('wife')):
            sec[7].append(40)
    sec[20].append(40)
    return sec


def height(sec, open_limit):
    h = 0
    for n, lens in sorted(sec.items()):
        h += 44
        if open_limit is not None and len(lens) > open_limit:
            continue
        if n == 14:
            lens = lens[:6]
        if len(lens) > 10:
            lens = lens[:8] + [10]
        for L in lens:
            if n in QUOTE:
                h += -(-L // 69) * 28 + 20
            else:
                h += -(-(L + 12) // 75) * 24
            h += 12
    return h


HEAD = 64 + 16 + 36 + 8 + 20 + 8 + 36 + 16 + 20 + 3 * 24 + 16 + 16 + 2 * 28 + 24
print('Шапка Давида до первого блока (ноутбук):', HEAD, 'px; высота окна под шапкой приложения 656')
for pid in ('p-david', 'p-avraam', 'p-ila-syn-vaasy', 'p-irad'):
    sec = recs(pid)
    base = HEAD - 64
    print(f'Высота {pid}: блоков {len(sec)}, записей {sum(len(v) for v in sec.values())};',
          f'простой по умолчанию {(base + height(sec, 3)) / 656:.1f} экрана;',
          f'второй по умолчанию {(base + height(sec, 8)) / 656:.1f};',
          f'всё раскрыто {(base + height(sec, None)) / 656:.1f}')

# § 13.3: первый экран телефона 360 x 560 (08 § 3.4): шапка 56; поле 16; h1 22/28; роль 20 (Golos 14/20);
# 8; ряд действий 44 (цели касания); 8; подпись „Коротко, нашими словами“ 16; три строки прозы 16/24 (72);
# „по стихам …“ 16; 16. Дальше — заголовки блоков: h2 телефона 18/24 и поля 10 + 10 = 44 (цель касания).
PH = 56 + 16 + 28 + 20 + 8 + 44 + 8 + 16 + 72 + 16 + 16
print('Телефон 360 x 560: шапка карточки', PH, 'px; заголовков блоков на первом экране:', (560 - PH) // 44)
LH = 64 + 16 + 36 + 20 + 8 + 36 + 16 + 20 + 3 * 24 + 16 + 16
print('Ноутбук 1280 x 720 без стихов шапки:', LH, 'px; заголовков блоков слева до края:', (720 - LH) // 44)
