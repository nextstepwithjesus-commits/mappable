"""Числа рецензии педагога на 07: трудное в карточке, язык записей, скромные карточки.

Запуск из корня: python3 -I docs/app/data/07-педагог/педагог-07.py
Читает base/actors/*.json, base/unions.json, base/origins.json (поле items).
Размер карточки — как в docs/app/data/07-числа.py (§ 3 документа 07).
Словари грубые: совпадение по основе слова в тексте записей атласа (не стихов).
Числа — нижние оценки для порядка величины; примеры проверены командой verse.
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


def texts(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'prov':
                continue
            if k in ('text', 'title', 'place') and isinstance(v, str):
                acc.append(v)
            else:
                texts(v, acc)
    elif isinstance(o, list):
        for v in o:
            texts(v, acc)


refs = collections.defaultdict(set)
for i, a in acts.items():
    for fct in a.get('facts', []):
        if fct.get('prov', {}).get('status') == 'quarantine' or fct.get('sec') in (23, 24):
            continue
        walk(fct['value'], refs[i])
    walk(a.get('names', []), refs[i])
unions = json.load(open('base/unions.json', encoding='utf-8'))['items']
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
print('1. Размеры:', dict(collections.Counter(sz.values())))
one = [i for i in acts if sz[i] == 'скромная' and len(refs[i]) == 1]
print('   скромных с одним стихом:', len(one))

# 2. Смерть в карточке (прежний § 20) и насильственная смерть
VIOLENT = re.compile(r'убит|убил|умертв|поразил|побил|побит|камнями|повеш|повесил|заколол|'
                     r'зарубил|растерза|сожж|сжёг|сжег|мечом|отсек|пронзил|задуш|казн', re.I)
death, violent = collections.Counter(), collections.Counter()
viol_ex = []
for i, a in acts.items():
    d = [f for f in a.get('facts', []) if f.get('sec') == 20 and f.get('prov', {}).get('status') != 'quarantine']
    if not d:
        continue
    death[sz[i]] += 1
    t = []
    for f in d:
        texts(f['value'], t)
    if any(VIOLENT.search(x) for x in t):
        violent[sz[i]] += 1
        if len(viol_ex) < 12:
            viol_ex.append((a['names'][0]['form'], sz[i], t[0][:70]))
print('2. Карточек с разделом «смерть» (прежний § 20):', dict(death), 'всего', sum(death.values()))
print('   из них насильственная смерть по словам записи:', dict(violent), 'всего', sum(violent.values()))
for e in viol_ex:
    print('    ', e)

# 3. Трудные слова в записях атласа (то, что покажет простой слой)
HARD = {
    'наложниц': r'наложниц', 'блуд': r'блуд', 'прелюбод': r'прелюбод', 'нагот': r'нагот',
    'убийство (убил/убит)': r'убил|убит|умертв', 'идол': r'идол', 'грех': r'грех',
    'проклят': r'проклят|проклял', 'жертв': r'жертв',
}
hard_cards = collections.defaultdict(set)
for i, a in acts.items():
    t = []
    for f in a.get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 24):
            continue
        texts(f['value'], t)
    s = ' '.join(t)
    for k, rx in HARD.items():
        if re.search(rx, s, re.I):
            hard_cards[k].add(i)
print('3. Карточек, где в записях простого слоя есть слово темы (грубо):')
for k, v in hard_cards.items():
    print('    %-22s %4d   (богатых %d)' % (k, len(v), sum(1 for i in v if sz[i] == 'богатая')))
conc = {u['husband'] for u in unions for t in u['terms'] if t['kind'] == 'concubine'} | \
       {u['wife'] for u in unions for t in u['terms'] if t['kind'] == 'concubine'}
print('   лиц в союзе вида «наложница» (раздел 7 «Семья»):', len(conc))

# 4. Слова, которых ребёнок 6–7 лет не знает, в записях атласа
WORDS = ['колен', 'почил', 'погреб', 'воцарил', 'первен', 'левит', 'князь', 'удел', 'семени',
         'родоначальник', 'первосвящен', 'начальник', 'жребий', 'военачальник', 'летопис']
wc = collections.Counter()
for i, a in acts.items():
    t = []
    for f in a.get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 24):
            continue
        texts(f['value'], t)
    s = ' '.join(t).lower()
    for w in WORDS:
        if w in s:
            wc[w] += 1
print('4. Карточек, в записях которых встречается слово:', dict(wc.most_common()))
rc = collections.Counter(r for a in acts.values() for r in a.get('roles', []))
print('   роли (звено 1 «Кратко» и строка вида):', dict(rc.most_common(12)))

# 5. Длина уточнения тёзок (видит ребёнок под именем)
dl = [len(a['disambig'].split()) for a in acts.values() if a.get('disambig')]
print('5. Уточнений:', len(dl), '; больше 6 слов:', sum(1 for x in dl if x > 6),
      '; медиана слов:', sorted(dl)[len(dl) // 2])

# 6. Исаак (проба П2): что в его карточке
for i, a in acts.items():
    if i in ('p-isaak', 'p-isaac') or (a['names'][0]['form'] == 'Исаак'):
        t = []
        for f in a.get('facts', []):
            if f.get('prov', {}).get('status') == 'quarantine':
                continue
            texts(f['value'], t)
        print('6. Исаак', i, sz[i], '— записи о жертвеннике:',
              [x[:90] for x in t if re.search(r'жертв|связал|нож|заклан|всесожж', x, re.I)])

# 7. Длина записей атласа в словах (одна строка простого слоя)
L = []
for a in acts.values():
    for f in a.get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 23, 24):
            continue
        t = []
        texts(f['value'], t)
        L += [len(x.split()) for x in t if len(x.split()) > 1]
L.sort()
print('7. Записей-строк:', len(L), '; медиана слов', L[len(L) // 2], '; больше 12 слов:',
      sum(1 for x in L if x > 12), '(%.0f %%)' % (100 * sum(1 for x in L if x > 12) / len(L)),
      '; больше 20:', sum(1 for x in L if x > 20))

# 8. Записи богатых карточек: объём работы для простых строк
R = []
for i, a in acts.items():
    if sz[i] != 'богатая':
        continue
    for f in a.get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 23, 24):
            continue
        t = []
        texts(f['value'], t)
        R += [len(x.split()) for x in t if len(x.split()) > 1]
print('8. Записей-строк у богатых карточек:', len(R), '; больше 12 слов:', sum(1 for x in R if x > 12),
      '(%.0f %%)' % (100 * sum(1 for x in R if x > 12) / len(R)))

# 9. «почил» в Синодальном тексте: о смерти и не о смерти
syn = [l.rstrip('\n').split('\t') for l in open('tools/bible/synodal.tsv', encoding='utf-8')]
poch = [r for r in syn if len(r) > 3 and re.search(r'почил', r[3], re.I)]
dead = [r for r in poch if re.search(r'почил\w*\s+(\S+\s+){0,2}с отцами', r[3], re.I)]
print('9. Стихов с «почил…»:', len(poch), '; из них «почил … с отцами» (смерть):', len(dead),
      '; другие:', ', '.join(f'{r[0]} {r[1]}:{r[2]}' for r in poch if r not in dead))
