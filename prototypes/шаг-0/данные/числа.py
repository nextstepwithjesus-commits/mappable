"""Числа и проверки данных шага 0 (prototypes/шаг-0/данные).

Запуск из корня проекта:
    python3 -I prototypes/шаг-0/данные/числа.py            — только проверка и вывод
    python3 -I prototypes/шаг-0/данные/числа.py --запись   — то же и запись чисел в JSON

Текст — tools/bible/synodal.tsv, скобки — tools/bible/brackets.tsv, лица — base/actors.
«Вне скобок» здесь строже правила 02 § 3.8: убираются слова в любых скобках
(и виды «б», «г», которые правило признаёт текстом) — так программа не засчитает
слово, которого нет вне скобок. Программа проверяет слова, а не смысл: границы
историй, виды и знаки — разметка составителя.
"""
import collections, glob, json, os, re, sys

ROOT = os.getcwd()
D = os.path.join(ROOT, 'prototypes', 'шаг-0', 'данные')
WRITE = '--запись' in sys.argv

TEXT, ORDER = {}, []
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t
    if not ORDER or ORDER[-1] != b:
        ORDER.append(b)
BR = collections.defaultdict(list)
for line in open('tools/bible/brackets.tsv', encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if p[0] == 'книга':
        continue
    for v in range(int(p[2]), int(p[3]) + 1):
        BR[(p[0], int(p[1]), v)].append((p[5], p[6]))

ERR = []


def err(msg):
    ERR.append(msg)
    print('  ОШИБКА:', msg)


def parse(ref):
    m = re.match(r'^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$', ref)
    if not m:
        raise ValueError(ref)
    b, c1, v1 = m[1], int(m[2]), int(m[3])
    c2 = int(m[4]) if m[4] else c1
    v2 = int(m[5]) if m[5] else v1
    return b, (c1, v1), (c2, v2)


def verses(ref):
    b, s, e = parse(ref)
    out = [k for k in TEXT if k[0] == b and s <= (k[1], k[2]) <= e]
    if not out:
        err(f'нет стихов: {ref}')
    return sorted(out, key=lambda k: (k[1], k[2]))


def vs(refs):
    return [k for r in refs for k in verses(r)]


def low(t):
    return ' '.join(t.lower().replace('ё', 'е').split())


def outside(k):
    t = re.sub(r'\[[^\]]*\]', ' ', TEXT[k])
    t = re.sub(r'\([^)]*\)', ' ', t)
    return t


def find_stem(keys, stem):
    rx = re.compile(r'(?<!\w)' + stem)
    return [k for k in keys if rx.search(low(outside(k)))]


def words(keys):
    return sum(len(re.findall(r'\w+', TEXT[k])) for k in keys)


def adr(k):
    return f'{k[0]} {k[1]}:{k[2]}'


def pretty(ref):
    b, s, e = parse(ref)
    if s == e:
        return f'{b} {s[0]}:{s[1]}'
    if s[0] == e[0]:
        return f'{b} {s[0]}:{s[1]}–{e[1]}'
    return f'{b} {s[0]}:{s[1]} – {e[0]}:{e[1]}'


def norm_q(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t)
    t = re.sub(r'\([^)]*\)', ' ', t)
    t = t.replace('—', '-').replace('ё', 'е').replace('Ё', 'Е')
    return ' '.join(t.split())


def check_quote(q, ref):
    """Цитата дословно в стихе (вне скобок); «…» — пропуск слов в скобках или вне цитаты."""
    keys = vs([ref])
    hay = norm_q(' '.join(TEXT[k] for k in keys))
    pos = 0
    for frag in [norm_q(f).strip(' ,;:') for f in q.split('…')]:
        if not frag:
            continue
        i = hay.find(frag, pos)
        if i < 0:
            return False
        pos = i + len(frag)
    return True


def walk_quotes(obj, path=''):
    n = 0
    if isinstance(obj, dict):
        if 'цитата' in obj and 'стих' in obj and isinstance(obj['цитата'], str):
            n += 1
            if not check_quote(obj['цитата'], obj['стих']):
                err(f'цитата не найдена дословно: «{obj["цитата"]}» ({obj["стих"]}) в {path}')
        for k, v in obj.items():
            n += walk_quotes(v, f'{path}/{k}')
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            n += walk_quotes(v, f'{path}[{i}]')
    return n


def load(name):
    return json.load(open(os.path.join(D, name), encoding='utf-8'))


def save(name, data):
    if WRITE:
        with open(os.path.join(D, name), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write('\n')


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


# ------------------------------------------------------------------ каталоги
def catalogue(name, span):
    print(f'\n== Каталог {name} ==')
    data = load(name)
    S = data['истории']
    book = data['книга']
    span_keys = [k for k in TEXT if k[0] == book and span[0] <= k[1] <= span[1]]
    byref = {s['стихи'][0]: s for s in S}
    S.sort(key=lambda s: (verses(s['стихи'][0])[0][1], verses(s['стихи'][0])[0][2], 0 if s.get('как') != 'nested' and s.get('как') != 'gap' else 1))
    for i, s in enumerate(S, 1):
        s['номер'] = i
        keys = vs(s['стихи'])
        s['стихов'] = len(keys)
        s['адрес'] = '; '.join(pretty(r) for r in s['стихи'])
        f = keys[0]
        if s['id'] != f'e-{book.lower()}-{f[1]}-{f[2]}':
            err(f'id {s["id"]} не по первому стиху')
        # название: стебли в стихах истории вне скобок
        miss = [st for st in s['проверка_названия'] if not find_stem(keys, st)]
        s['название_найдено'] = 'все слова найдены в стихах вне скобок' if not miss else 'ручная проверка: не найдено ' + ', '.join(miss)
        if len(s['название']) > 40:
            err(f'название длиннее 40 знаков: {s["название"]}')
        # знак
        for o in (s['обложка']['знак'] or []):
            k = verses(o['стих'])[0]
            if k not in keys:
                err(f'знак {o["основа"]} — стих {o["стих"]} вне истории {s["название"]}')
            if not find_stem([k], o['основа']):
                err(f'знак «{o["основа"]}» не найден вне скобок в {o["стих"]} ({s["название"]})')
        for h in (s['трудная'] or []):
            for r in h['стихи']:
                if not set(verses(r)) <= set(keys):
                    err(f'стих трудного {r} вне истории {s["название"]}')
        # части
        if 'части' in s:
            pk = [k for r, _ in s['части'] for k in verses(r)]
            if pk != keys:
                err(f'части не покрывают историю ровно: {s["название"]}')
            s['части_числа'] = [{'стихи': pretty(r), 'название': t, 'стихов': len(verses(r)), 'слов': words(verses(r))} for r, t in s['части']]
            for p in s['части_числа']:
                if p['слов'] > 500:
                    err(f'часть длиннее 500 слов: {s["название"]} {p["стихи"]} ({p["слов"]})')
        elif s['стихов'] > 20:
            print(f'  история длиннее 20 стихов без частей: {s["название"]} ({s["стихов"]} стихов, {words(keys)} слов)')
        for a in s.get('также', []):
            if not find_stem(verses(a['стихи']), a['опора']):
                err(f'«также» {a["стихи"]}: нет слова-опоры «{a["опора"]}»')
        if 'отклики' in s:
            books = sorted({parse(r)[0] for r in s['отклики']}, key=ORDER.index)
            for r in s['отклики']:
                vs([r])
            s['отклики_книг'] = len(books)
    # вложенные и разрывы
    for s in S:
        if 'вложена_в' in s:
            par = byref[s['вложена_в']]
            s['вложена_в_id'] = par['id']
            if s['как'] == 'nested' and not set(vs(s['стихи'])) <= set(vs(par['стихи'])):
                err(f'вложенная {s["название"]} не внутри {par["название"]}')
            if s['как'] == 'gap' and par.get('разрыв') != s['стихи'][0]:
                err(f'разрыв {par["название"]} не совпадает с {s["название"]}')
    # покрытие
    top = [s for s in S if s.get('как') != 'nested']
    cnt = collections.Counter(k for s in top for k in vs(s['стихи']))
    holes = [adr(k) for k in sorted(span_keys, key=lambda k: (k[1], k[2])) if cnt[k] == 0]
    twice = [adr(k) for k, n in cnt.items() if n > 1]
    print(f'  стихов в охвате: {len(span_keys)}; без записи: {holes or "нет"}; в двух записях: {twice or "нет"}')
    if holes or twice:
        err('покрытие стихов нарушено')
    kinds = collections.Counter(s['вид'] for s in S)
    stages = collections.Counter(s['обложка']['ступень'] for s in S)
    shows = collections.Counter(s['показ'] for s in S)
    first = [s['название'] for s in S if s['первый_ряд']]
    hard = [s['название'] for s in S if s['трудная']]
    manual = [(s['номер'], s['название'], s['название_найдено']) for s in S if s['название_найдено'].startswith('ручная')]
    nars = collections.Counter(s['повествование'] for s in S)
    num = {
        'историй': len(S), 'стихов_в_охвате': len(span_keys),
        'по_видам': dict(kinds), 'по_ступеням_обложки': {str(k): v for k, v in sorted(stages.items())},
        'обложкой': shows['обложка'], 'строкой': shows['строка'],
        'вложенных_и_в_разрыве': sum(1 for s in S if s.get('как') in ('nested', 'gap')),
        'первый_ряд': first, 'трудных': len(hard),
        'названий_на_ручную_проверку': len(manual),
        'историй_в_повествованиях': {n['название']: nars[n['id']] for n in data['повествования']},
        'медиана_длины_названия': sorted(len(s['название']) for s in S)[len(S) // 2],
        'шапка_строка': f'{data["название_книги"]} — {len(S)} {plural(len(S), "история", "истории", "историй")}',
    }
    if len(first) > 4:
        err('в первом ряду больше 4 историй')
    for k, v in num.items():
        print(f'  {k}: {v}')
    for m in manual:
        print('  название:', m)
    print('  трудные:', ', '.join(hard))
    for n in data['повествования']:
        n['истории'] = [s['номер'] for s in S if s['повествование'] == n['id']]
    data['числа'] = num
    data['числа_посчитаны'] = 'python3 -I prototypes/шаг-0/данные/числа.py --запись'
    q = walk_quotes(data)
    save(name, data)
    return data


byt = catalogue('бытие.json', (1, 50))
mk = catalogue('марк-1-3.json', (1, 3))

# ------------------------------------------------------------------ Ной и потоп
print('\n== Ной и потоп ==')
noah = load('ной-и-потоп.json')
NOAH = 'Быт 6:9-9:17'
NK = vs([NOAH])
parts = noah['история']['части']
pk = [k for p in parts for k in verses(p['стихи'])]
if pk != NK:
    err('части Ноя не покрывают историю')
for p in parts:
    ks = verses(p['стихи'])
    p['адрес'] = pretty(p['стихи'])
    p['стихов'] = len(ks)
    p['слов'] = words(ks)
    p['минут_вслух'] = round(p['слов'] / 120, 1)
    p['первые_слова'] = ' '.join(TEXT[ks[0]].split()[:6])
print('  части:', [(p['адрес'], p['стихов'], p['слов']) for p in parts])
kc = collections.Counter(kd for k in NK for _, kd in BR.get(k, []))
noah['история']['скобки'] = {'мест': sum(kc.values()), 'по_видам': dict(kc), 'правило': 'слова видов «а», «в» — тем же цветом, знаки скобок видны, скрытые метки начала и конца (11 § 4.4)'}
noah['для_изучающих']['скобки_второй_слой'] = noah['история']['скобки']
print('  скобок:', dict(kc))
hw = noah['история']['трудные_слова_части_1']
p1 = verses(parts[0]['стихи'])
miss = [w for w in hw if not find_stem(p1, w.lower())]
if miss:
    err(f'трудные слова не найдены в части 1: {miss}')

# имена: формы
FORMS = {   # с заглавной буквы: «сим» со строчной — местоимение («сим», «сими»)
    'p-noy': r'Но(й|я|ю|ем|е|ев|ева|еву|евой|евы|евых|евом)\b',
    'p-sim': r'Сим(а|у|ом|е|ов|ова|ову)?\b',
    'p-kham': r'Хам(а|у|ом|е|ов|ова|овой|овых|овым)?\b',
    'p-iafet': r'Иафет(а|у|ом|е|ов|ова)?\b',
}
NOT_NAME = {'Евр 9:8'}   # «Сим Дух Святый показывает» — местоимение в начале предложения
links = noah['где_об_этом']
story_places = set()
for grp in ('рассказ', 'пересказ', 'намёк'):
    for m in links[grp]:
        story_places |= set(verses(m['стихи']))
for m in links['упоминания']['места']:
    story_places |= set(verses(m['стихи']))
for m in links['спорное_только_второй_слой']:
    story_places |= set(verses(m['стихи']))
named = {}
for pid, rx in FORMS.items():
    R = re.compile(r'(?<!\w)' + rx)
    in_story = [k for k in NK if R.search(outside(k))]
    everywhere = [k for k in TEXT if R.search(outside(k)) and adr(k) not in NOT_NAME]
    gen_other = [k for k in everywhere if k[0] == 'Быт' and k not in NK]
    other_books = [k for k in everywhere if k[0] != 'Быт']
    only_name = [k for k in other_books if k not in story_places]
    named[pid] = {'в_истории_стихов': len(in_story), 'вне_Бытия_стихов': len(other_books),
                  'из_них_места_истории': len(other_books) - len(only_name),
                  'назван_ещё': len(only_name), 'стихи': [adr(k) for k in only_name],
                  'в_Бытии_вне_истории': [adr(k) for k in gen_other]}
    print(f'  {pid}: в истории {len(in_story)} стихов; вне Бытия {len(other_books)}: место истории {len(other_books) - len(only_name)}, только имя {len(only_name)} {named[pid]["стихи"]}')
    print(f'      в Бытии вне истории: {named[pid]["в_Бытии_вне_истории"]}')
cards = noah['кто_в_истории']['карточки']
def nline(name, pid):
    n = named[pid]['назван_ещё']
    return {'строка': f'{name} {"назван" } ещё в {n} {plural(n, "стихе", "стихах", "стихах")} — Карточка: {name}' if n else None,
            'число': n, 'стихи': named[pid]['стихи'],
            'как_считали': 'стихи вне Бытия, где стоит форма имени вне скобок, без стихов, которые стоят в блоке «Где об этом в Библии» (В-21; 11 § 4.5); стихи Бытия вне истории идут в другие истории Бытия',
            'стихов_в_истории': named[pid]['в_истории_стихов']}
cards[0]['назван_ещё'] = nline('Ной', 'p-noy')
cards[0]['назван_ещё']['строка'] = f'Ной назван ещё в {named["p-noy"]["назван_ещё"]} стихах — Карточка Ноя'
for L in cards[2]['лица']:
    L['назван_ещё'] = nline(L['имя'], L['id'])
links['только_имя']['стихи'] = named['p-noy']['стихи']
links['только_имя']['строка'] = cards[0]['назван_ещё']['строка']
# „потоп“ во всех книгах: что нашла программа
WHY = {**{a: 'глагол „потопить“ о Египтянах в Чермном море — другое событие' for a in ('Исх 14:27', 'Втор 11:4')},
       **{a: 'глагол „потопить“ в другом смысле, не о потопе' for a in ('Пс 123:4', 'Ис 28:17', 'Ис 43:2', 'Иер 47:2', 'Дан 11:22', 'Мф 18:6')},
       **{a: 'слово „потоптано“ — другое слово' for a in ('Иез 34:19', 'Лк 8:5')}}
pot = [k for k in TEXT if k[0] != 'Быт' and re.search(r'(?<!\w)потоп', low(outside(k)))]
classified = story_places
print('  „потоп“ вне Бытия:', [adr(k) for k in pot])
print('     не разобраны в блоке 6:', [adr(k) for k in pot if k not in classified])
links['программа_нашла_слово_потоп_вне_Бытия'] = {'стихи': [adr(k) for k in pot],
    'не_вошли': [{'стих': adr(k), 'почему': WHY.get(adr(k), 'НЕ РАЗОБРАНО')} for k in pot if k not in classified]}
for x in links['программа_нашла_слово_потоп_вне_Бытия']['не_вошли']:
    if x['почему'] == 'НЕ РАЗОБРАНО':
        err(f'„потоп“ не разобран: {x["стих"]}')
ment = links['упоминания']['места']
mbooks = sorted({parse(m['стихи'])[0] for m in ment}, key=ORDER.index)
links['упоминания']['строка'] = f'Вспоминают ещё {len(mbooks)} {plural(len(mbooks), "книга", "книги", "книг")} ({len(ment)} {plural(len(ment), "место", "места", "мест")})'
allb = {parse(m['стихи'])[0] for g in ('пересказ', 'намёк') for m in links[g]} | set(mbooks)
links['таблица_двойник_полосы'] = [{'книга': b, 'как': ', '.join(sorted({g for g in ('рассказ', 'пересказ', 'намёк') for m in links[g] if parse(m['стихи'])[0] == b} | ({'упоминание'} if b in mbooks else set())))}
                                   for b in sorted(allb | {'Быт'}, key=ORDER.index)]
noah['шапка']['второй_слой']['номер_в_книге'] = next(s['номер'] for s in byt['истории'] if s['id'] == 'e-быт-6-9')
noah['шапка']['второй_слой']['частей'] = len(parts)
noah['числа'] = {'стихов': len(NK), 'слов': words(NK), 'минут_вслух': round(words(NK) / 120, 1),
                 'частей': len(parts), 'скобок': sum(kc.values()),
                 'мест_вне_книги': len(ment) + len(links['пересказ']) + len(links['намёк']),
                 'книг_вне_Бытия': len(allb), 'упоминаний': len(ment),
                 'отклики_по_04': 'книги, где история пересказана или вспомянута (без намёков): ' + str(len({parse(m['стихи'])[0] for m in ment} | {parse(m['стихи'])[0] for m in links['пересказ']})),
                 'имена': named}
print('  ', {k: v for k, v in noah['числа'].items() if k != 'имена'})
walk_quotes(noah)

# ------------------------------------------------------------------ Расслабленный
print('\n== Расслабленный ==')
par = load('расслабленный.json')
acc = {}
for a in par['рассказы']:
    ks = verses(a['стихи'])
    a['стихов'] = len(ks)
    a['слов'] = words(ks)
    a['скобок'] = sum(len(BR.get(k, [])) for k in ks)
    acc[a['книга']] = ks
    print(f'  {a["стихи"]}: стихов {a["стихов"]}, слов {a["слов"]}, скобок {a["скобок"]}')
DET = [('кровл', 'кровля'), ('постел', 'постель'), ('четвер', 'четверо'), ('капернаум', 'Капернаум'), ('чадо', 'чадо'),
       ('книжник', 'книжники'), ('фарисе', 'фарисеи'), ('законоучител', 'законоучители'), ('лодк', 'лодка'),
       ('прокопав', 'прокопав'), ('влезли', 'влезли на верх дома'), ('власть на земле прощать грехи', 'власть прощать грехи'),
       ('веру их', 'видя веру их'), ('дерзай', 'дерзай')]
table = []
for st, nm in DET:
    row = {'подробность': nm}
    for b, ks in acc.items():
        h = find_stem(ks, st)
        row[b] = ', '.join(f'{k[1]}:{k[2]}' for k in h) or 'нет'
    table.append(row)
    print('  ', row)
par['подробности_программа'] = table
rx = re.compile(r'(?<!\w)(расслабл|кровл)')
hits = [k for k in TEXT if rx.search(low(outside(k)))]
own = set(k for ks in acc.values() for k in ks)
other = [adr(k) for k in hits if k not in own]
print('  «расслабл/кровл» вне трёх рассказов:', other)
par['где_об_этом']['программа_нашла'] = other
mk2 = next(s for s in mk['истории'] if s['id'] == 'e-мк-2-1')
par['шапка']['второй_слой']['номер_в_книге_Мк'] = mk2['номер']
par['числа'] = {'рассказов': 3, 'стихов_по_рассказам': {a['книга']: a['стихов'] for a in par['рассказы']},
                'слов_по_рассказам': {a['книга']: a['слов'] for a in par['рассказы']}, 'номер_в_каталоге_Мк': mk2['номер']}
walk_quotes(par)

save('ной-и-потоп.json', noah)
save('расслабленный.json', par)

print('\n== Итог ==')
print('Бытие:', byt['числа']['историй'], 'записей каталога; Мк 1–3:', mk['числа']['историй'])


# ------------------------------------------------------------------ сверка с каталогом другой команды
# Запуск: ... числа.py --сверка "<путь к genesis-units.json>" "<путь к 39-genesis-catalogue-preparation.md>"
# Их файлы — данные для сверки, не правила. Адреса — те же стихи synodal.tsv (байт в байт, по словам координатора).
if '--сверка' in sys.argv:
    i = sys.argv.index('--сверка')
    UJ, MD = sys.argv[i + 1], sys.argv[i + 2]
    print('\n== Сверка с каталогом другой команды (Бытие) ==')
    u = json.load(open(UJ, encoding='utf-8'))
    def rr(ranges):
        return [f'Быт {c}:{a}-{b}' for c, a, b in ranges]
    theirs = []                                   # (стихи, что это)
    for s in u['storyCandidates']:
        if 'kind' in s:
            theirs.append((rr(s['evidence']['ranges']), 'история ' + s['key']))
    rows = [l.split('|') for l in open(MD, encoding='utf-8') if l.startswith('| G')]
    for r in rows:
        key, ref, dest = r[1].strip(), r[2].strip(), r[4].strip()
        if dest.startswith('reuse') or dest.startswith('без своей страницы'):
            refs = []
            for part in ref.split(';'):
                part = part.strip().replace('–', '-')
                if ':' in part:
                    c, vv = part.split(':')
                    a, _, b = vv.partition('-')
                    refs.append(f'Быт {c}:{a}-{b or a}')
            theirs.append((refs, ('прежняя запись ' if dest.startswith('reuse') else 'блок без страницы ') + key))
    def span(refs):
        ks = vs(refs)
        return ks[0], ks[-1], frozenset(ks)
    mine = [(s['стихи'], s['название'], s['номер']) for s in byt['истории']]
    T = [(span(r), w, r) for r, w in theirs]
    M = [(span(r), w, n, r) for r, w, n in mine]
    exact = [(m, t) for m in M for t in T if m[0][2] == t[0][2]]
    starts_m = {m[0][0] for m in M}
    starts_t = {t[0][0] for t in T}
    ends_m = {m[0][1] for m in M}
    ends_t = {t[0][1] for t in T}
    print(f'  наших записей: {len(M)}; их записей (истории с кандидатом, прежние записи, блоки без страницы): {len(T)}')
    print(f'  совпали целиком (те же стихи): {len(exact)}')
    print(f'  начала: общих {len(starts_m & starts_t)}, только у нас {len(starts_m - starts_t)}, только у них {len(starts_t - starts_m)}')
    print(f'  концы: общих {len(ends_m & ends_t)}, только у нас {len(ends_m - ends_t)}, только у них {len(ends_t - ends_m)}')
    matched_m = {id(m) for m, _ in exact}
    matched_t = {id(t) for _, t in exact}
    print('  наши записи без точной пары:')
    for m in M:
        if id(m) not in matched_m:
            over = [f'{"; ".join(pretty(x) for x in t[2])} ({t[1]})' for t in T if t[0][2] & m[0][2]]
            print(f'    №{m[2]} {"; ".join(pretty(x) for x in m[3])} «{m[1]}» ⇄ ' + ' | '.join(over))
    print('  их записи без точной пары:')
    for t in T:
        if id(t) not in matched_t:
            print(f'    {"; ".join(pretty(x) for x in t[2])} ({t[1]})')
    sver = {'наших_записей': len(M), 'их_записей': len(T), 'совпали_целиком': len(exact),
            'начала': {'общих': len(starts_m & starts_t), 'только_у_нас': len(starts_m - starts_t), 'только_у_них': len(starts_t - starts_m)},
            'концы': {'общих': len(ends_m & ends_t), 'только_у_нас': len(ends_m - ends_t), 'только_у_них': len(ends_t - ends_m)}}
    print('  ', sver)

print('ошибок:', len(ERR))
sys.exit(1 if ERR else 0)
