"""Числа документа 06 «Связи».

Запуск из корня: python3 -I docs/app/data/06-числа.py
Читает: base/actors/*.json, base/origins.json, base/unions.json, base/kin.json,
docs/app/data/пробы/*.jsonl и сведения сторон, tools/bible/synodal.tsv.
Ничего не пишет. Вывод — приложение А документа 06.

Части:
  1. база лиц: виды, значимость;
  2. прежние записи о встречах (поле met, раздел 14 прежних томов);
  3. проба П2: связи по видам, сторонам, главам; эго-сети Давида, Саула, Илии, Ахава;
  4. каппа — тем же способом, что tools/base/kappa.ts (единица — пара в главе);
  5. пары с несколькими видами; лента «Саул — Давид»;
  6. пределы эго-карты на живых данных пробы;
  7. Синодальный текст: стихи со словами-признаками, главы повествовательных книг.
"""
import collections, glob, json, re, statistics

P = 'docs/app/data/пробы/'


def load_actors():
    acts = {}
    for f in sorted(glob.glob('base/actors/*.json')):
        for a in json.load(open(f, encoding='utf-8'))['items']:
            acts[a['id']] = a
    return acts


def expand(r):
    m = re.match(r'^(.*?)(\d+):(\d+)(?:-(\d+))?$', r.strip())
    if not m:
        return [r]
    b, c, v1, v2 = m.group(1), m.group(2), int(m.group(3)), int(m.group(4) or m.group(3))
    if v2 < v1:
        return [r]
    return [f'{b}{c}:{v}' for v in range(v1, v2 + 1)]


def nverses(r):
    # диапазон через главу («1Цар 9:14-10:1») считается приблизительно
    m = re.match(r'^(.*?)(\d+):(\d+)-(\d+):(\d+)$', r.strip())
    if m:
        return 30 * (int(m.group(4)) - int(m.group(2))) + int(m.group(5))
    return len(expand(r))


acts = load_actors()
print('== 1. База лиц')
kinds = collections.Counter(a.get('kind') for a in acts.values())
print('лиц всего', len(acts), '; по видам:', ', '.join(f'{k} {v}' for k, v in kinds.most_common()))
prom = collections.Counter(a.get('prominence') or 0 for a in acts.values())
print('значимость:', ', '.join(f'{k}: {prom[k]}' for k in sorted(prom)), '; значимость 3–5:', sum(prom[k] for k in (3, 4, 5)))

# ---------------------------------------------------------------- 2. met
print('\n== 2. Прежние записи о встречах (met)')
met = []
for i, a in acts.items():
    for f in a.get('facts', []):
        if f.get('field') == 'met':
            met.append((i, f['value']))
print('записей', len(met), '; лиц с записями', len({i for i, _ in met}))
pairs = {tuple(sorted((i, v['id']))) for i, v in met}
print('неупорядоченных пар', len(pairs))
dirs = {(i, v['id']) for i, v in met}
print('направленных пар с обратной записью', sum(1 for (x, y) in dirs if (y, x) in dirs))
print('с текстом', sum(1 for _, v in met if v.get('text')), '; без текста', sum(1 for _, v in met if not v.get('text')))
nv = [sum(nverses(r) for r in v.get('refs', [])) for _, v in met]
print('стихов на запись: медиана', statistics.median(nv), '; 17 и больше —', sum(1 for x in nv if x >= 17),
      f'({100 * sum(1 for x in nv if x >= 17) / len(nv):.0f} %)')
missing = sum(1 for _, v in met if v['id'] not in acts)
print('цель не найдена в базе', missing)

# родство пары: родитель — ребёнок, общие родители, супруги, слово родства; свойство на один шаг
O = json.load(open('base/origins.json', encoding='utf-8'))['items']
U = json.load(open('base/unions.json', encoding='utf-8'))['items']
K = json.load(open('base/kin.json', encoding='utf-8'))['items']
parents = collections.defaultdict(set)
children = collections.defaultdict(set)
for o in O:
    if o.get('parent'):
        parents[o['child']].add(o['parent'])
        children[o['parent']].add(o['child'])
spouse = collections.defaultdict(set)
for u in U:
    spouse[u['husband']].add(u['wife'])
    spouse[u['wife']].add(u['husband'])
kinword = collections.defaultdict(set)
for k in K:
    kinword[k['from']].add(k['to'])
    kinword[k['to']].add(k['from'])


def siblings(x):
    return {c for p in parents[x] for c in children[p]} - {x}


def near(x):
    """Родня до одного шага свойства: родители, дети, братья и сёстры, супруги, слово родства;
    родители и братья супруга; супруги детей и братьев; внуки и деды."""
    s = parents[x] | children[x] | siblings(x) | spouse[x] | kinword[x]
    s |= {g for p in parents[x] for g in parents[p]} | {g for c in children[x] for g in children[c]}
    for w in spouse[x]:
        s |= parents[w] | siblings(w)
    for c in children[x] | siblings(x):
        s |= spouse[c]
    return s - {x}


def kin_kind(x, y):
    if y in parents[x] or x in parents[y]:
        return 'родитель — ребёнок'
    if y in spouse[x]:
        return 'супруги'
    if y in siblings(x):
        return 'братья и сёстры'
    if y in kinword[x]:
        return 'слово родства'
    if y in near(x):
        return 'дед, внук или свойство на шаг'
    return None


kp = collections.Counter(kin_kind(x, y) for x, y in pairs)
print('пары met, которые и родня:', sum(v for k, v in kp.items() if k), 'из', len(pairs), ';',
      ', '.join(f'{k} {v}' for k, v in kp.items() if k))
deg = collections.Counter()
for x, y in pairs:
    deg[x] += 1
    deg[y] += 1
name = lambda i: acts[i]['names'][0]['form'] if i in acts else i
print('больше всего соседей по met:', ', '.join(f'{name(i)} {n}' for i, n in deg.most_common(12)))
print('у Давида', deg['p-david'], '; у Илии', deg['p-iliya'], '; у Павла', deg['p-pavel'], '; у Варнавы', deg['p-varnava'])
for x, y in [('p-david', 'p-saul'), ('p-david', 'p-ionafan'), ('p-akhav', 'p-iosafat'), ('p-pavel', 'p-varnava')]:
    print(f'  родство {name(x)} — {name(y)}:', kin_kind(x, y) or 'нет в базе')

# ---------------------------------------------------------------- 3. пробы
print('\n== 3. Проба П2')


def rows(fn):
    out = [json.loads(l) for l in open(P + fn, encoding='utf-8') if l.strip()]
    return [r for r in out if not r.get('summary')]


FILES = {'A': 'П2-связи-A.jsonl', 'B': 'П2-связи-B.jsonl', 'C': 'П2б-связи-C.jsonl', 'D': 'П2б-связи-D.jsonl'}
R = {k: rows(v) for k, v in FILES.items()}
for k, rs in R.items():
    t = collections.Counter(r['type'] for r in rs)
    cert = collections.Counter(r['cert'] for r in rs)
    god = sum(1 for r in rs if 'god' in (r['a'], r['b']))
    new = sum(1 for r in rs if r['a'].startswith('new:') or r['b'].startswith('new:'))
    base = sum(1 for r in rs if r['a'].startswith('p-') and r['b'].startswith('p-'))
    chs = {(r.get('book', '1Цар'), r['ch']) for r in rs}
    print(f'{k}: связей {len(rs)}; глав {len(chs)}; на главу {len(rs) / len(chs):.1f}; '
          f'между лицами базы {base} ({100 * base / len(rs):.0f} %); с new: {new}; с Богом {god}')
    print('   по видам:', ', '.join(f'{x}: {t[x]}' for x in sorted(t)), '; достоверность:', dict(cert))
for part, (x, y) in (('часть 1', ('A', 'B')), ('часть 2', ('C', 'D'))):
    t = collections.Counter(r['type'] for r in R[x] + R[y])
    n = len(R[x]) + len(R[y])
    print(f'{part}, {x}+{y}: доля видов 11 и 12 (особые строки) {100 * (t[11] + t[12]) / n:.0f} %; '
          f'вид 5 (вражда) {100 * t[5] / n:.0f} %; вид 10 (группа) {100 * t[10] / n:.0f} %')


def ego(rs, who):
    nb = collections.defaultdict(list)
    for r in rs:
        if r['a'] == who:
            nb[r['b']].append(r)
        elif r['b'] == who:
            nb[r['a']].append(r)
    return nb


for k, who in [('A', 'p-david'), ('B', 'p-david'), ('A', 'p-saul'), ('B', 'p-saul'),
               ('C', 'p-iliya'), ('D', 'p-iliya'), ('C', 'p-akhav'), ('D', 'p-akhav')]:
    nb = ego(R[k], who)
    named = [p for p in nb if p.startswith('p-')]
    newp = [p for p in nb if p.startswith('new:')]
    multi = sum(1 for p in nb if len({r['type'] for r in nb[p]}) > 1)
    print(f'эго {name(who)} ({k}): соседей {len(nb)} (лица базы {len(named)}, new: {len(newp)}, Бог {int("god" in nb)}); '
          f'связей {sum(len(v) for v in nb.values())}; соседей с двумя видами и больше {multi}')

# ---------------------------------------------------------------- 4. каппа
print('\n== 4. Каппа (как tools/base/kappa.ts)')


def kappa(prs):
    n = len(prs)
    po = sum(1 for x, y in prs if x == y) / n
    fa = collections.Counter(x for x, _ in prs)
    fb = collections.Counter(y for _, y in prs)
    pe = sum(fa[k] / n * fb[k] / n for k in fa)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def compare(A, B, alias):
    idf = lambda s: alias.get(s, s)

    def key(r):
        p, q = sorted((idf(r['a']), idf(r['b'])))
        return f"{r.get('book', '')} {r['ch']}|{p}|{q}"

    def labels(xs):
        m = collections.defaultdict(set)
        for r in xs:
            m[key(r)].add(r['type'])
        return m

    la, lb = labels(A), labels(B)
    units = sorted(set(la) | set(lb))
    lab = lambda s: '+'.join(map(str, sorted(s))) if s else 'нет'
    both = [u for u in units if u in la and u in lb]
    return {
        'units': len(units), 'both': len(both), 'onlyA': sum(1 for u in units if u not in lb), 'onlyB': sum(1 for u in units if u not in la),
        'f1': 2 * len(both) / (len(la) + len(lb)),
        'k_label': kappa([(lab(la.get(u)), lab(lb.get(u))) for u in units]),
        'k_type': kappa([(lab(la[u]), lab(lb[u])) for u in both]),
    }


for part, (x, y, al) in (('часть 1', ('A', 'B', 'П2-связи-сведение.json')), ('часть 2', ('C', 'D', 'П2б-связи-сведение.json'))):
    alias = json.load(open(P + al, encoding='utf-8'))
    c = compare(R[x], R[y], alias)
    print(f"{part}: единиц {c['units']}, у обоих {c['both']}, только {x} {c['onlyA']}, только {y} {c['onlyB']}; "
          f"F1 {c['f1']:.2f}; каппа по виду (где у обоих) {c['k_type']:.2f}; по метке {c['k_label']:.2f}")

# ---------------------------------------------------------------- 5. несколько видов у пары; лента
print('\n== 5. Пары с несколькими видами; лента пары')
for k in R:
    by = collections.defaultdict(set)
    bych = collections.defaultdict(set)
    for r in R[k]:
        p = tuple(sorted((r['a'], r['b'])))
        by[p].add(r['type'])
        bych[(p, r.get('book', ''), r['ch'])].add(r['type'])
    print(f'{k}: пар {len(by)}; с двумя видами и больше за всю пробу {sum(1 for v in by.values() if len(v) > 1)}; '
          f'в одной главе {sum(1 for v in bych.values() if len(v) > 1)}')
lenta = [r for r in R['A'] if {r['a'], r['b']} == {'p-saul', 'p-david'}]
print('лента «Саул — Давид» (A):', len(lenta), 'связей;', ' → '.join(f"{r['ref'].split(' ')[1]} в.{r['type']}" for r in lenta))
print('   видов:', dict(collections.Counter(r['type'] for r in lenta)))
lenta = [r for r in R['C'] if {r['a'], r['b']} == {'p-iliya', 'p-akhav'}]
print('лента «Илия — Ахав» (C):', ' → '.join(f"{r['ref'].split(' ')[1]} в.{r['type']}" for r in lenta))

# ---------------------------------------------------------------- 6. пределы эго-карты
print('\n== 6. Пределы эго-карты на пробе (редакция 2: сосед стоит в каждой своей группе)')
# группы простого слоя (§ 3.5 документа, ред. 2): 1 учение и преемство; 2 служение; 3 слово пророка;
# 4 союз и помощь; 5 вражда; 6 встречи и разговоры; 7, 9 поставление и суд; 8 чудо; 10 группа; 11, 12 — строки
GROUP = {1: 'Учение и преемство', 2: 'Служение', 3: 'Слово пророка', 4: 'Союз и помощь', 5: 'Вражда',
         6: 'Встречи и разговоры', 7: 'Поставление и суд', 9: 'Поставление и суд', 8: 'Чудо',
         10: 'Группы', 11: 'Бог и небесные', 12: 'Божества народов'}
ROWS = ('Бог и небесные', 'Божества народов', 'Группы')
for k, who in (('A', 'p-david'), ('B', 'p-david'), ('C', 'p-iliya'), ('C', 'p-akhav')):
    nb = ego(R[k], who)
    # ред. 1: сосед в одной группе (больше связей); ред. 2: в каждой своей группе
    one = collections.Counter()
    every = collections.Counter()
    multi = 0
    for p, rs in nb.items():
        c = collections.Counter(GROUP[r['type']] for r in rs)
        one[sorted(c, key=lambda x: (-c[x], x))[0]] += 1
        for g in c:
            every[g] += 1
        if len([g for g in c if g not in ROWS]) > 1:
            multi += 1
    extra = sum(every[g] for g in every if g not in ROWS) - sum(one[g] for g in one if g not in ROWS)
    onmap = sum(min(5, v) for g, v in every.items() if g not in ROWS)
    over = sum(max(0, v - 5) for g, v in every.items() if g not in ROWS)
    print(f'{name(who)} ({k}): соседей {len(nb)}; в двух группах и больше {multi}; мест в группах добавилось {extra}')
    print('   по группам (ред. 2):', ', '.join(f'{x} {v}' for x, v in every.most_common()),
          f'; имён на карте при пределе 5 на группу {onmap}, в «ещё N» {over}')

# ---------------------------------------------------------------- 8. первый экран эго-карты (ред. 3)
print('\n== 8. Первый экран эго-карты по компонентам 08 ред. 3.1 (оценка по токенам, не замер)')
# Токены 08 ред. 3.1: шапка 64 (телефон 56); строка инструмента 48 на мыши, 56 на касании;
# заголовок экрана: поле 16 + h1 30/36 + 4 + описание перед рисунком 12/16 + 8 = 80 (телефон: 12 + 28 + 4 + 16 + 8 = 68);
# строка «Бог и небесные» — ступень 5 14/20 + поля 4 + 4 = 28; заголовок группы — 14/20 + поля 4 + 4 = 28;
# строка группы на карте — одна линия: мышь 32 (08 § 3.5: 32–40), касание 44; плотный режим 28.
# Раскладка ред. 3: два столбца по четыре группы, нижнего ряда нет; строки «Божества народов» и «Явления» — в листе-сводке справа.
def ego_height(rows, row_h, scale=1.0, header=64, toolbar=48, title=80, god=28, ghead=28, gap=0):
    groups = 4 * (ghead * scale + rows * row_h + gap)
    over = header + toolbar + title * scale + god * scale
    return over, groups
for name_, rows, row_h, scale, tb in (('мышь, обычная плотность', 3, 32, 1.0, 48), ('мышь, плотная', 3, 28, 1.0, 48),
                                     ('касание (сенсорный ноутбук)', 2, 44, 1.0, 56), ('мышь, «Крупнее» 112,5 %', 3, 36, 1.125, 48),
                                     ('мышь, «Крупнее», 2 строки', 2, 36, 1.125, 48), ('мышь, «Самый крупный» 125 %, 2 строки', 2, 40, 1.25, 48)):
    over, groups = ego_height(rows, row_h, scale, toolbar=tb)
    total = over + groups
    print(f'1280 × 720, {name_}: над картой {over:.0f} px; 4 группы × ({rows} строки по {row_h}) = {groups:.0f}; '
          f'итого {total:.0f} из 720 — {"помещается" if total <= 720 else "НЕ помещается"}')
# ширина: от 1280 место листа 368 px держится всегда; рисунку 1152 - 368 - 24 = 760; центр — столбец 200; два столбца групп
col = (760 - 200 - 2 * 24) / 2
print(f'ширина столбца группы при листе рядом: {col:.0f} px')
# строка карты: имя (Literata 500, средний знак 0,524 em) + пробел + глагол роли (Golos 450, 0,55 em), 16 px
VERB = {'Учение и преемство': 'учил его', 'Служение': 'служил ему', 'Слово пророка': 'послан к нему',
        'Союз и помощь': 'помогал ему', 'Вражда': 'гнал его', 'Встречи и разговоры': 'пришёл к нему',
        'Поставление и суд': 'помазал его', 'Чудо': 'чудо над ним'}
def label(i, rows_):
    if i in acts:
        return acts[i]['names'][0]['form']
    w = [r.get('who', '') for r in rows_ if r.get('who')]
    return (w[0].split('(')[0].strip() if w else i.replace('new:', '').replace('-', ' '))
for k, who in (('A', 'p-david'), ('C', 'p-iliya')):
    nb = ego(R[k], who)
    widths = []
    for p_, rs in nb.items():
        if p_ == 'god':
            continue
        nm = label(p_, rs)
        for g in {GROUP[r['type']] for r in rs} - set(ROWS):
            w = len(nm) * 0.524 * 16 + 4 + len(VERB[g]) * 0.55 * 16
            widths.append((w, nm, g))
    widths.sort(reverse=True)
    over = [x for x in widths if x[0] > col]
    named = [x for x in widths if not x[1][0].islower()]
    named_over = [x for x in named if x[0] > col]
    print(f'{name(who)} ({k}): строк карты {len(widths)}, из них лиц с именем {len(named)}; шире столбца {col:.0f} px — '
          f'все {len(over)}, лиц с именем {len(named_over)}: ' + '; '.join(f'{x[1]} — {x[2].lower()} ({x[0]:.0f} px)' for x in named_over))
# телефон 360 × 560: список по группам, строка в два яруса 48 (фраза 16/20 и адрес текстом 12/16, поля 6 + 6)
over_ph = 56 + 56 + 68 + 28
rows_ph = (560 - over_ph - 28) // 48
print(f'телефон 360 × 560: над списком {over_ph} px; заголовок первой группы 28; строк соседей на первом экране — {rows_ph}')

# ---------------------------------------------------------------- 7. Синодальный текст
print('\n== 7. Синодальный текст')
TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = re.sub(r'\[[^\]]*\]', ' ', t)  # без слов в квадратных скобках внутри стиха
WORDS = {
    'ученик/ученики': r'\bученик', 'друг (о человеке)': r'\bдру(г|га|гу|гом|зья|зей|зьям)\b', 'враг': r'\bвраг',
    'союз': r'\bсоюз', 'завет': r'\bзавет', 'помазал': r'\bпомазал', 'благословил': r'\bблагослови(л|ла|ли)\b',
    'слуга/служитель': r'\b(слуг|служител)', 'Ангел': r'\bАнгел',
}
for lab, rx in WORDS.items():
    n = sum(1 for t in TEXT.values() if re.search(rx, t, re.I if lab != 'Ангел' else 0))
    print(f'стихов со словом «{lab}»: {n}')
NARR = ['Быт', 'Исх', 'Чис', 'Нав', 'Суд', 'Руф', '1Цар', '2Цар', '3Цар', '4Цар', '1Пар', '2Пар', 'Езд', 'Неем', 'Есф',
        'Дан', 'Ион', 'Мф', 'Мк', 'Лк', 'Ин', 'Деян']
chap = {(b, c) for (b, c, _) in TEXT if b in NARR}
print('глав в повествовательных книгах (список R5 § 3.3):', len(chap))
allch = {(b, c) for (b, c, _) in TEXT}
print('глав во всех 66 книгах:', len(allch))
