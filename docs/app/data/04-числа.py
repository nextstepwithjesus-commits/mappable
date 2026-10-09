"""Числа документа 04 «Время»: модели хронологии, напряжения текста, данные.

Запуск из корня: python3 -I docs/app/data/04-числа.py

Правило: каждое число текста берётся из стиха. Для каждого входа записаны стих
и слова числа, как они стоят в стихе. Скрипт проверяет, что слова есть в стихе
ВНЕ скобок, и сам переводит их в число. Числа в квадратных скобках читаются
только для модели «Числа в скобках» и проверяются отдельно.

Годы — исторические (−1446 = 1446 г. до Р. Х.). «N-й год» — прошёл N − 1 год.
Файлы проекта скрипт не меняет.
"""
import collections, glob, json, re, sys

TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[f'{b} {c}:{v}'] = t

CARD = {
    'один': 1, 'одного': 1, 'два': 2, 'двух': 2, 'три': 3, 'трех': 3, 'четыре': 4, 'четырех': 4,
    'пять': 5, 'пяти': 5, 'шесть': 6, 'шести': 6, 'семь': 7, 'семи': 7, 'восемь': 8, 'восьми': 8,
    'девять': 9, 'девяти': 9, 'десять': 10, 'десяти': 10,
    'шестнадцать': 16, 'восемнадцать': 18, 'девятнадцать': 19,
    'двадцать': 20, 'двадцати': 20, 'тридцать': 30, 'тридцати': 30, 'сорок': 40, 'сорока': 40,
    'пятьдесят': 50, 'пятидесяти': 50, 'шестьдесят': 60, 'шестидесяти': 60,
    'семьдесят': 70, 'семидесяти': 70, 'восемьдесят': 80, 'восьмидесяти': 80,
    'девяносто': 90, 'девяноста': 90, 'сто': 100, 'ста': 100, 'двести': 200, 'двухсот': 200,
    'триста': 300, 'трехсот': 300, 'четыреста': 400, 'четырехсот': 400, 'пятьсот': 500,
    'пятисот': 500, 'шестьсот': 600, 'шестисот': 600, 'семьсот': 700, 'восемьсот': 800,
    'девятьсот': 900,
}
ORD = [('четырнадцат', 14), ('двенадцат', 12), ('восьмидесят', 80), ('сороков', 40), ('двадцат', 20),
       ('третий', 3), ('четверт', 4), ('шест', 6), ('девят', 9), ('седьм', 7)]


def unbr(t):
    return re.sub(r'\[[^\]]*\]', ' ', t)


def num(words):
    total = 0
    for w in words.lower().replace('ё', 'е').split():
        if w in CARD:
            total += CARD[w]
            continue
        for stem, val in ORD:
            if w.startswith(stem):
                total += val
                break
        else:
            sys.exit(f'не число: {w!r} в «{words}»')
    return total


def n(ref, words):
    """Число из стиха: слова должны стоять в стихе вне скобок."""
    t = unbr(TEXT[ref]).lower().replace('ё', 'е')
    if not re.search(r'(?<!\w)' + re.escape(words.lower()) + r'(?!\w)', t):
        sys.exit(f'НЕТ В СТИХЕ вне скобок: «{words}» — {ref}')
    return num(words)


def bracket_digits(ref):
    m = re.search(r'\[(\d+)\]', TEXT[ref])
    return int(m.group(1)) if m else None


print('== 1. Модель «Основной текст»: цепь чисел Быт 5; 11 и далее ==')
G5 = [('Быт 5:3', 'сто тридцать', 'Адам'), ('Быт 5:6', 'сто пять', 'Сиф'),
      ('Быт 5:9', 'девяносто', 'Енос'), ('Быт 5:12', 'семьдесят', 'Каинан'),
      ('Быт 5:15', 'шестьдесят пять', 'Малелеил'), ('Быт 5:18', 'сто шестьдесят два', 'Иаред'),
      ('Быт 5:21', 'шестьдесят пять', 'Енох'), ('Быт 5:25', 'сто восемьдесят семь', 'Мафусал'),
      ('Быт 5:28', 'сто восемьдесят два', 'Ламех')]
noah_flood = n('Быт 7:6', 'шестисот')
g5 = sum(n(r, w) for r, w, _ in G5)
flood_am = g5 + noah_flood
print(f'Быт 5: сумма возрастов отцов {g5} + Ною при Потопе {noah_flood} = Потоп в {flood_am} г. от сотворения')
G11 = [('Быт 11:12', 'тридцать пять', 'Арфаксад'), ('Быт 11:14', 'тридцать', 'Сала'),
       ('Быт 11:16', 'тридцать четыре', 'Евер'), ('Быт 11:18', 'тридцать', 'Фалек'),
       ('Быт 11:20', 'тридцать два', 'Рагав'), ('Быт 11:22', 'тридцать', 'Серух'),
       ('Быт 11:24', 'двадцать девять', 'Нахор')]
after_flood = n('Быт 11:10', 'два')            # «чрез два года после потопа»
g11 = sum(n(r, w) for r, w, _ in G11)
terah_death = n('Быт 11:32', 'двести пять')
abram_exit = n('Быт 12:4', 'семидесяти пяти')
terah_min = terah_death - abram_exit           # Деян 7:4: «по смерти отца его»
terah_lit = n('Быт 11:26', 'семьдесят')
isaac = n('Быт 21:5', 'ста')
jacob = n('Быт 25:26', 'шестидесяти')
egypt_age = n('Быт 47:9', 'сто тридцать')
sojourn = n('Исх 12:40', 'четыреста тридцать')
temple_ord = n('3Цар 6:1', 'четыреста восьмидесятом')
sol_year = n('3Цар 6:1', 'четвертый')
ANCHOR = -967                                  # base/anchors.json, solomon-4
anch = {a['id']: a for a in json.load(open('base/anchors.json', encoding='utf-8'))['anchors']}
assert anch['solomon-4']['value'] == ANCHOR
print(f'Фарра: умер {terah_death}, Аврам вышел {abram_exit} → Фарре при рождении Аврама не меньше {terah_min} (выв.); по букве Быт 11:26 — {terah_lit}')
print(f'Исход → 4-й год Соломона: {temple_ord}-й год → прошло {temple_ord - 1} лет')


def model(terah, egypt_years=None, g5x=None, g11x=None):
    fl = (g5x if g5x is not None else g5) + noah_flood
    arph = fl + after_flood
    abram = arph + (g11x if g11x is not None else g11) + terah
    exit_h = abram + abram_exit
    isaac_b = abram + isaac
    jacob_b = isaac_b + jacob
    egypt = jacob_b + egypt_age
    exodus = egypt + sojourn if egypt_years is None else egypt + egypt_years
    temple = exodus + temple_ord - 1
    creation_bc = -ANCHOR + temple          # г. до Р. Х.
    bc = lambda am: creation_bc - am
    return dict(creation=creation_bc, flood=bc(fl), abram=bc(abram), exit=bc(exit_h),
                isaac=bc(isaac_b), jacob=bc(jacob_b), egypt=bc(egypt), exodus=bc(exodus),
                flood_am=fl, abram_am=abram, egypt_years=exodus - egypt)


base = model(terah_min)
# «Краткое пребывание»: 430 лет считаются от прихода Аврама в Ханаан (Быт 12:4–5)
# до Исхода — понимание Гал 3:17 (толк.). Опора 967 и 479 лет — те же.
abram_to_egypt = isaac + jacob + egypt_age - abram_exit       # от выхода Аврама до входа Иакова
short = model(terah_min, egypt_years=sojourn - abram_to_egypt)
t70 = model(terah_lit)
# «Числа в скобках»: где в стихе есть число в квадратных скобках — берётся оно.
g5b = sum(bracket_digits(r) or n(r, w) for r, w, _ in G5)
cainan = num(re.search(r'Каинан жил ([а-я ]+?) лет', TEXT['Быт 11:12']).group(1))
assert TEXT['Быт 11:12'].index('[Каинана') < TEXT['Быт 11:12'].index('Каинан жил')   # звено — в скобках
g11b = sum(bracket_digits(r) or n(r, w) for r, w, _ in G11) + cainan
lxx = model(terah_min, g5x=g5b, g11x=g11b)
print(f'Быт 5 по числам в скобках: {g5b} (основной текст {g5}); Быт 11 в скобках, с Каинаном {cainan}: {g11b} (основной текст {g11})')
rows = [('сотворение', 'creation'), ('Потоп', 'flood'), ('рождение Аврама', 'abram'),
        ('выход из Харрана', 'exit'), ('рождение Исаака', 'isaac'), ('рождение Иакова', 'jacob'),
        ('приход Иакова в Египет', 'egypt'), ('Исход', 'exodus')]
print('\nгоды до Р. Х.        | Основной текст | Краткое пребывание | Фарре 70 | Числа в скобках')
for name, k in rows:
    print(f'{name:22}| {base[k]:>14} | {short[k]:>18} | {t70[k]:>8} | {lxx[k]:>15}')
print(f'лет в Египте          | {base["egypt_years"]:>14} | {short["egypt_years"]:>18} | {t70["egypt_years"]:>8} | {lxx["egypt_years"]:>15}')
print(f'Потоп, лет от сотворения: {base["flood_am"]}; Аврам, лет от сотворения: {base["abram_am"]} (Фарре 70: {t70["abram_am"]}; числа в скобках: {lxx["abram_am"]})')
print(f'сдвиг Краткого пребывания для лиц до входа в Египет: {short["egypt"] - base["egypt"]} лет')
print(f'Фарре 70: Аврам в годах до Р. Х. сдвигается на {t70["abram"] - base["abram"]}, сотворение — на {t70["creation"] - base["creation"]}')

print('\n== 2. Современники по расчёту (модель по умолчанию) ==')
noah_after = n('Быт 9:28', 'триста пятьдесят')
noah_death_am = flood_am + noah_after
shem_after = n('Быт 11:11', 'пятьсот')
shem_death_am = flood_am + after_flood + shem_after
abr_death = n('Быт 25:7', 'сто семьдесят пять')
print(f'Ной умер в {noah_death_am} г. от сотв.; Аврам родился в {base["abram_am"]} → разница {base["abram_am"] - noah_death_am} (Фарре 70: {t70["abram_am"] - noah_death_am})')
print(f'Сим умер в {shem_death_am} г. от сотв.; Аврааму тогда {shem_death_am - base["abram_am"]} (умер в {abr_death})')

print('\n== 3. Напряжения текста ==')
kohath = n('Исх 6:18', 'сто тридцать три')
amram = n('Исх 6:20', 'сто тридцать семь')
moses80 = n('Исх 7:7', 'восьмидесяти')
print(f'Кааф {kohath} + Амрам {amram} + Моисей при Исходе {moses80} = не больше {kohath + amram + moses80} лет от входа Каафа в Египет (Быт 46:11) до Исхода; Исх 12:40 — {sojourn}; краткое пребывание — {short["egypt_years"]}')
ahaz_age, ahaz_reign = n('4Цар 16:2', 'Двадцати'), n('4Цар 16:2', 'шестнадцать')
hez_age = n('4Цар 18:2', 'Двадцати пяти')
print(f'Ахаз: {ahaz_age} при воцарении + {ahaz_reign} лет царствования; Езекия {hez_age} при воцарении → Ахазу при рождении Езекии {ahaz_age + ahaz_reign - hez_age} (если царствования шли подряд)')
sam_hez = n('4Цар 18:10', 'шестой')
sam_hosh = n('4Цар 18:10', 'девятый')
sen_hez = n('4Цар 18:13', 'четырнадцатый')
samaria, senn = anch['samaria']['value'], anch['sennacherib']['value']
y1_from_sam = samaria - (sam_hez - 1)
y1_from_sen = senn - (sen_hez - 1)
print(f'Езекия: {sam_hez}-й год = падение Самарии ({-samaria}) → 1-й год = {-y1_from_sam}; {sen_hez}-й год = Сеннахирим ({-senn}) → 1-й год = {-y1_from_sen}; расхождение {abs(y1_from_sam - y1_from_sen)} лет')
h3 = n('4Цар 18:1', 'третий')
h4, o7 = n('4Цар 18:9', 'четвертый'), n('4Цар 18:9', 'седьмой')
a12 = n('4Цар 17:1', 'двенадцатый')
print(f'4 Цар 17:1: Осия воцарился в {a12}-й год Ахаза → Езекия (3-й год Осии) — в {a12 + h3 - 1}-й год Ахаза, а Ахаз царствовал {ahaz_reign} лет')
print(f'синхронизмы 4 Цар 18: Осия {h3} ↔ Езекия 1; Езекия {h4} ↔ Осия {o7}; Езекия {sam_hez} ↔ Осия {sam_hosh} (сдвиг {o7 - h4} и {sam_hosh - sam_hez})')
JUD = [('Суд 3:8', 'восемь'), ('Суд 3:11', 'сорок'), ('Суд 3:14', 'восемнадцать'),
       ('Суд 3:30', 'восемьдесят'), ('Суд 4:3', 'двадцать'), ('Суд 5:31', 'сорок'),
       ('Суд 6:1', 'семь'), ('Суд 8:28', 'сорок'), ('Суд 9:22', 'три'),
       ('Суд 10:2', 'двадцать три'), ('Суд 10:3', 'двадцать два'), ('Суд 10:8', 'восемнадцать'),
       ('Суд 12:7', 'шесть'), ('Суд 12:9', 'семь'), ('Суд 12:11', 'десять'),
       ('Суд 12:14', 'восемь'), ('Суд 13:1', 'сорок'), ('Суд 15:20', 'двадцать')]
jud_sum = sum(n(r, w) for r, w in JUD)
wild = n('Чис 14:33', 'сорок')
saul = n('Деян 13:21', 'сорок')
david = n('3Цар 2:11', 'сорок')
eli = n('1Цар 4:18', 'сорок')
acts450 = n('Деян 13:20', 'четырехсот пятидесяти')
frame = (temple_ord - 1) - wild - saul - david - (sol_year - 1)
print(f'книга Судей: {len(JUD)} чисел, сумма {jud_sum} лет; Деян 13:20 — около {acts450}')
print(f'рамка 3 Цар 6:1: {temple_ord - 1} − пустыня {wild} − Саул {saul} (Деян 13:21) − Давид {david} − Соломон до 4-го года {sol_year - 1} = {frame} лет на Иисуса Навина, судей, Илия и Самуила; без Илия ({eli}) — {frame - eli}')
EP = {e['id']: e for e in json.load(open('base/epochs.json', encoding='utf-8'))['items']}
CH = {x['actor']: x['chrono'] for x in json.load(open('base/chrono.json', encoding='utf-8'))['items']}
conq = EP['conquest']['start']
david_b = CH['p-david']['born']['year']
span = david_b - conq
print(f'Раав: взятие Иерихона ок. {-conq} (расч.) → рождение Давида {-david_b} (расч.): {span} лет; после Вооза три рождения (Руф 4:21–22) → в среднем до {span // 3} лет на поколение; если Вооз родился через 30 лет — {(span - 30) // 3}')
exo = base['exodus']
print(f'Моисей и Давид: Исход {exo} (расч.); 4-й год Соломона, сына Давида (3 Цар 2:12), — через {temple_ord - 1} лет (3 Цар 6:1)')

print('\n== 4. Данные: хронологические входы (base/chrono.json) ==')
acts = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        acts[a['id']] = a
print('действующих лиц в базе:', len(acts), dict(collections.Counter(a['kind'] for a in acts.values())))
print('записей chrono:', len(CH), '; лиц без записи chrono:', len(set(acts) - set(CH)))
keys = collections.Counter(k for c in CH.values() for k in c)
print('ключи:', dict(keys))
TEXTNUM = lambda c: (any(k in c.get('born', {}) for k in ('fatherAge', 'motherAge', 'offset'))
                     or 'age' in c.get('died', {}) or any('years' in r or 'ageAtStart' in r for r in c.get('reign', [])))
READY = lambda c: ('active' in c or 'year' in c.get('born', {}) or 'year' in c.get('died', {})
                   or any('start' in r for r in c.get('reign', [])))
only_epoch = [a for a, c in CH.items() if set(c) == {'epoch'}]
print('лиц с числами текста (возраст отца или матери, смещение, возраст при смерти, годы правления):', sum(TEXTNUM(c) for c in CH.values()))
print('лиц с готовыми годами в данных (active, год рождения или смерти, начало царствования):', sum(READY(c) for c in CH.values()))
print('эпоха строкой без стиха:', keys['epoch'], '; только эпоха и ничего больше:', len(only_epoch))
print('границы «не раньше / не позже»: рождение', sum('notBefore' in c.get('born', {}) or 'notAfter' in c.get('born', {}) for c in CH.values()),
      '; промежуток range: рождение', sum('range' in c.get('born', {}) for c in CH.values()), ', смерть', sum('range' in c.get('died', {}) for c in CH.values()))
print('числа в скобках отдельным полем: возраст отца', sum('fatherAgeBracket' in c.get('born', {}) for c in CH.values()),
      ', возраст при смерти', sum('ageBracket' in c.get('died', {}) for c in CH.values()))
print('царствований (записей reign):', sum(len(c.get('reign', [])) for c in CH.values()), 'у', sum('reign' in c for c in CH.values()), 'лиц')
print('синхронизмов при царствованиях (sync):', sum(len(r.get('sync', [])) for c in CH.values() for r in c.get('reign', [])))
prom = collections.Counter(a.get('prominence') for a in acts.values())
print('значимость (prominence):', dict(sorted(prom.items(), key=lambda x: (x[0] is None, x[0] or 0))), '; ≥ 3:', sum(v for k, v in prom.items() if k and k >= 3))

print('\n== 5. Эпохи, опоры, прочтения ==')
print('эпох:', len(EP), '; с оценочной границей:', sum(1 for e in EP.values() if e.get('startEst') or e.get('endEst')),
      '; событий в эпохах:', sum(len(e.get('events', [])) for e in EP.values()))
kp = [len(e.get('keyPersons', [])) for e in EP.values()]
print('главных лиц эпохи (keyPersons): от', min(kp), 'до', max(kp), '; всего разных:', len({p for e in EP.values() for p in e.get('keyPersons', [])}))
print('граница «После Потопа / Патриархи» в данных:', EP['postdiluvian']['end'], EP['postdiluvian']['endRule'], '; конец последней эпохи:', EP['church']['end'])
print('опор:', len(anch), '; с альтернативами:', sum(1 for a in anch.values() if a['alternatives']), '; справочным слоем:', sum(1 for a in anch.values() if a.get('layer') == 'reference'))
print('15-й год Тиверия в данных:', anch['tiberius-15']['value'], anch['tiberius-15']['alternatives'])
RS = json.load(open('base/readings.json', encoding='utf-8'))['items']
print('наборов прочтений:', len(RS))

print('\n== 6. Сырьё событий (историй): записи прежнего § 17 ==')
ev = [(a['id'], f['value']) for a in acts.values() for f in a.get('facts', []) if f['sec'] == 17]
print('записей:', len(ev), '; у лиц:', len({x for x, _ in ev}), '; с годом:', sum('year' in v for _, v in ev),
      '; с возрастом:', sum('age' in v for _, v in ev), '; с периодом:', sum('period' in v for _, v in ev))
for p in ['p-david', 'p-saul', 'p-gedeon', 'p-samson', 'p-avraam', 'p-moisey']:
    mine = [v for x, v in ev if x == p]
    print(f'  {acts[p]["names"][0]["form"]}: событий {len(mine)}, с годом {sum("year" in v for v in mine)}')


def expand(r):
    m = re.match(r'^(.*?)(\d+):(\d+)(?:-(\d+))?$', r.strip())
    if not m:
        return []
    b, c, v1, v2 = m.group(1).strip(), m.group(2), int(m.group(3)), int(m.group(4) or m.group(3))
    return [f'{b}{c}:{v}' for v in range(v1, v2 + 1)]


par = list(range(len(ev)))


def find(i):
    while par[i] != i:
        par[i] = par[par[i]]
        i = par[i]
    return i


seen = {}
for i, (_, v) in enumerate(ev):
    for r in v['refs']:
        for x in expand(r):
            if x in seen:
                par[find(i)] = find(seen[x])
            else:
                seen[x] = i
groups = collections.defaultdict(set)
for i, (a, _) in enumerate(ev):
    groups[find(i)].add(a)
print('эпизодов после склейки записей с общими стихами:', len(groups), '; с двумя лицами и больше:', sum(1 for g in groups.values() if len(g) >= 2))
print('встреч (прежний § 14 met):', sum(1 for a in acts.values() for f in a.get('facts', []) if f['sec'] == 14 and f.get('field') == 'met'),
      '; хронологических заметок (§ 13 chronoNote):', sum(1 for a in acts.values() for f in a.get('facts', []) if f['sec'] == 13 and f.get('field') == 'chronoNote'))

print('\n== 7. Годы эскизов (модель по умолчанию; цари — данные, схема Тиле — Янга) ==')
print(f'Аврам: род. {base["abram"]}, вышел из Харрана {base["exit"]}, умер {base["abram"] - abr_death} до Р. Х.')
for p in ['p-akhaz', 'p-osiya-syn-ily', 'p-ezekiya']:
    r = CH[p]['reign'][0]
    print(f'  {acts[p]["names"][0]["form"]} ({acts[p].get("disambig")}): {-r["start"]}–{-r["end"]} до Р. Х., лет {r["years"]}')
ia = CH['p-isaiya']['active']
print(f'  Исаия: засвидетельствован {-ia["from"]}–{-ia["to"]} до Р. Х.')
mb = CH['p-moisey']['born']['year']
md = n('Втор 34:7', 'сто двадцать')
print(f'Моисей: род. {-mb}, умер {-mb - md} до Р. Х. (120 лет — Втор 34:7); Давид: род. {-CH["p-david"]["born"]["year"]}, умер {-CH["p-david"]["died"]["year"]} до Р. Х.')
