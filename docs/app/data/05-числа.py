"""Числа документа 05 «География».

Запуск из корня репозитория:
    python3 -I docs/app/data/05-числа.py
    python3 -I docs/app/data/05-числа.py --openbible ПУТЬ/data/ancient.jsonl

Часть А читает только репозиторий: base/ и tools/bible/synodal.tsv.
Часть Б (по желанию) читает копию OpenBible Bible Geocoding Data
(github.com/openbibleinfo/Bible-Geocoding-Data, файл data/ancient.jsonl).
Копии в репозитории нет (02, § 5); без пути часть Б не считается.

Файлы проекта скрипт не меняет.
"""
import collections
import glob
import json
import re
import sys

# ---------------------------------------------------------------- текст
TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t


def ref(s):
    """«3Цар 12:29» или «3 Цар 12:29» -> ключ стиха."""
    m = re.fullmatch(r'(\d?)\s?(\S+)\s+(\d+):(\d+)', s.strip())
    return (m.group(1) + m.group(2), int(m.group(3)), int(m.group(4)))


def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'\s*[—–-]\s*', '-', s)          # «Кириаф—Арбе», «Хор— Агидгаде»
    return ' '.join(s.split())


def outside(t):
    """Текст стиха без слов в квадратных и круглых скобках."""
    t = re.sub(r'\[[^\]]*\]?', ' ', t)
    return re.sub(r'\([^)]*\)?', ' ', t)


def inside(t):
    return ' '.join(re.findall(r'\[([^\]]*)\]?', t) + re.findall(r'\(([^)]*)\)?', t))


# ---------------------------------------------------------------- часть А
print('=== Часть А. База и текст ===')
actors = [a for f in sorted(glob.glob('base/actors/*.json'))
          for a in json.load(open(f, encoding='utf-8'))['items']]
places, births, deaths, burials = [], 0, 0, 0
with_place = set()
all_names = set()
for a in actors:
    for fa in a['facts']:
        v = fa['value']
        if fa['field'] == 'places':
            places.append(v)
            with_place.add(a['id'])
            all_names.add(v['name'].strip())
        elif fa['field'] == 'birth' and v.get('place'):
            births += 1
            with_place.add(a['id'])
            all_names.add(v['place'].strip())
        elif fa['field'] == 'death':
            if v.get('place'):
                deaths += 1
                with_place.add(a['id'])
                all_names.add(v['place'].strip())
            if v.get('burial'):
                burials += 1
                with_place.add(a['id'])
roles = collections.Counter(p.get('role') for p in places)
names = {p['name'].strip() for p in places}
composite = {n for n in names if re.search(r';|,| и |между| от | до ', n)}
print(f'лиц всего: {len(actors)}')
print(f'записей мест (прежний § 15): {len(places)}; по ролям: {dict(roles.most_common())}')
print(f'разных строк места: {len(names)}; из них составных или описательных '
      f'(есть ";", ",", " и ", "между", " от ", " до "): {len(composite)}')
print(f'рождение с местом: {births}; смерть с местом: {deaths}; погребение (текстом): {burials}')
print(f'вместе с местами рождения и смерти: записей {len(places) + births + deaths}, '
      f'разных строк {len(all_names)}')
print(f'лиц хотя бы с одним местом (§ 15, рождение, смерть, погребение): {len(with_place)}')

ev = [fa['value'] for a in actors for fa in a['facts'] if fa['field'] == 'events']
ev_place = sum(1 for e in ev if any(k in e for k in ('place', 'places', 'where')))
print(f'записей событий (прежний § 17): {len(ev)}; с полем места: {ev_place}')

areas = json.load(open('base/areas.json', encoding='utf-8'))['items']
kinds = collections.Counter(a['kind'] for a in areas)
geo_keys = {'geometry', 'border', 'borders', 'territory', 'cities', 'places', 'boundary'}
with_geo = sum(1 for a in areas if geo_keys & set(a))
print(f'областей: {len(areas)}; по видам: {dict(kinds.most_common())}; '
      f'с полями земли или границ: {with_geo}')
mem = json.load(open('base/memberships.json', encoding='utf-8'))['items']
basis = collections.Counter(m['basis'] for m in mem)
mem_places = sum(1 for m in mem if not m['actor'].startswith('p-'))
print(f'записей членства: {len(mem)}; основания: {dict(basis)}; '
      f'членство места (город → колено): {mem_places}')
place_ids = sum(1 for f in glob.glob('base/*.json')
                for _ in re.finditer(r'"l-[a-z0-9-]+"', open(f, encoding='utf-8').read()))
print(f'номеров мест «l-…» в base/*.json: {place_ids}')

src = json.load(open('base/sources.json', encoding='utf-8'))['items']
geo_src = [s['id'] for s in src if s['id'] in
           ('src-openbible-geo', 'src-awmc', 'src-natural-earth', 'src-pleiades')]
print(f'источники мест и карт в реестре: {geo_src}')
for want in ('etopo', 'copernicus', 'openstreetmap'):
    hit = [s['id'] for s in src if want in json.dumps(s, ensure_ascii=False).lower()]
    print(f'  упоминание "{want}" в реестре: {hit or "нет"}')

# Чис 33: станы
camps = [(v, TEXT[('Чис', 33, v)]) for v in range(5, 50)]
n_vs = sum(1 for _, t in camps if 'станом' in outside(t))
n_occ = sum(outside(t).count('станом') for _, t in camps)
print(f'Чис 33:5–49: стихов со словом "станом" вне скобок — {n_vs}; раз — {n_occ}')

# Вефиль и Беф-Авен
vef = [k for k, t in TEXT.items() if re.search(r'вефил', outside(t).lower())]
vef_books = collections.Counter(k[0] for k in vef)
print(f'стихов с основой "Вефил" вне скобок: {len(vef)}; книг: {len(vef_books)}')
bav = sorted({f'{k[0]} {k[1]}:{k[2]}' for k, t in TEXT.items()
              if re.search(r'беф-?\s?авен', norm(outside(t)))})
print(f'стихи с "Беф-Авен" / "Бефавен": {len(bav)} — {", ".join(bav)}')

# Формы названий эскизов: форма должна стоять в стихе вне скобок
FORMS = [
    # Эскиз 11.1 — стоянки Авраама
    ('Быт 11:31', 'Ура Халдейского'), ('Быт 11:31', 'Харрана'), ('Быт 12:4', 'Харрана'),
    ('Быт 12:6', 'Сихема'), ('Быт 12:6', 'дубравы Море'), ('Быт 12:8', 'Вефиль'),
    ('Быт 12:8', 'Гай'), ('Быт 12:9', 'к югу'), ('Быт 12:10', 'Египет'),
    ('Быт 13:3', 'между Вефилем и между Гаем'), ('Быт 13:18', 'дубравы Мамре, что в Хевроне'),
    ('Быт 14:14', 'Дана'), ('Быт 14:15', 'Ховы'), ('Быт 14:15', 'Дамаска'),
    ('Быт 20:1', 'Кадесом'), ('Быт 20:1', 'Суром'), ('Быт 20:1', 'Гераре'),
    ('Быт 21:31', 'Вирсавия'), ('Быт 22:2', 'землю Мориа'), ('Быт 22:19', 'Вирсавию'),
    ('Быт 23:2', 'Кириаф-Арбе'), ('Быт 23:2', 'ныне Хеврон'), ('Быт 25:9', 'пещере Махпеле'),
    ('Деян 7:2', 'Месопотамии'), ('Деян 7:4', 'земли Халдейской'),
    # Эскиз 11.2 — Исход по Чис 33
    ('Чис 33:5', 'Раамсеса'), ('Чис 33:5', 'Сокхофе'), ('Чис 33:6', 'Ефаме'),
    ('Чис 33:7', 'Пи-Гахирофу'), ('Чис 33:7', 'Ваал-Цефоном'), ('Чис 33:7', 'Мигдолом'),
    ('Чис 33:8', 'прошли среди моря'), ('Чис 33:8', 'Мерре'), ('Чис 33:9', 'Елим'),
    ('Чис 33:10', 'Чермного моря'), ('Чис 33:11', 'пустыне Син'), ('Чис 33:12', 'Дофке'),
    ('Чис 33:13', 'Алуше'), ('Чис 33:14', 'Рефидиме'), ('Чис 33:15', 'пустыне Синайской'),
    ('Чис 33:36', 'она же Кадес'), ('Чис 33:37', 'горе Ор'), ('Чис 33:38', 'гору Ор'),
    ('Чис 33:48', 'равнинах Моавитских'), ('Втор 10:6', 'Мозер'), ('Чис 33:30', 'Мосерофе'),
    ('Исх 13:18', 'Чермному морю'), ('Исх 14:2', 'Пи-Гахирофом'), ('Исх 19:2', 'пустыню Синайскую'),
    # Эскиз 11.7 — история «Переход Чермного моря»
    ('Исх 14:2', 'Пи-Гахирофом'), ('Исх 14:2', 'Мигдолом'), ('Исх 14:2', 'Ваал-Цефоном'),
    ('Исх 14:22', 'среди моря по суше'), ('Исх 15:22', 'пустыню Сур'),
    # Эскиз 11.3 — удел колена Рувима
    ('Нав 13:16', 'Ароер'), ('Нав 13:16', 'потока Арнона'), ('Нав 13:16', 'Медеве'),
    ('Нав 13:17', 'Есевон'), ('Нав 13:17', 'Дивон'), ('Нав 13:17', 'Беф-Ваал-Меон'),
    ('Нав 13:18', 'Иааца'), ('Нав 13:18', 'Кедемоф'), ('Нав 13:18', 'Мефааф'),
    ('Нав 13:19', 'Кириафаим'), ('Нав 13:19', 'Сивма'), ('Нав 13:20', 'Беф-Иешимоф'),
    ('Нав 13:23', 'Иордан'), ('Нав 20:8', 'Бецер'), ('Чис 32:34', 'Дивон'),
    ('Чис 32:34', 'Ароер'), ('Чис 32:37', 'Есевон'), ('Нав 21:39', 'Есевон'),
    ('Ис 15:2', 'Дивону'), ('Ис 15:4', 'Есевон'), ('Иер 48:2', 'Есевоне'),
    ('Нав 13:25', 'Ароера, что пред Раввою'),
    # Эскиз 11.4 — Вефиль
    ('Быт 28:19', 'Вефиль'), ('Быт 28:19', 'Луз'), ('Быт 35:6', 'Луз'), ('Быт 35:6', 'Вефиль'),
    ('Быт 35:7', 'Эл-Вефиль'), ('Быт 35:8', 'ниже Вефиля'), ('Нав 16:2', 'от Вефиля'),
    ('Нав 16:2', 'к Лузу'), ('Нав 18:13', 'Луза, иначе Вефиля'), ('Нав 18:22', 'Вефиль'),
    ('Нав 7:2', 'Беф-Авена'), ('Нав 7:2', 'с восточной стороны Вефиля'), ('Нав 18:12', 'Бефавен'),
    ('Ос 4:15', 'Беф-Авен'), ('Ос 10:5', 'тельца Беф-Авена'), ('3Цар 12:29', 'Вефиле'),
    ('Суд 1:26', 'Луз'), ('1Пар 7:28', 'Вефиль'), ('4Цар 23:15', 'Вефиле'),
    ('Ам 5:5', 'Вефиль'), ('Ос 12:4', 'Вефиле'), ('Езд 2:28', 'Вефиля и Гая'),
    ('Неем 7:32', 'Вефиля и Гая'),
    # Эскиз 11.5 — Павел и Варнава
    ('Деян 13:1', 'Антиохии'), ('Деян 13:4', 'Селевкию'), ('Деян 13:4', 'Кипр'),
    ('Деян 13:5', 'Саламине'), ('Деян 13:6', 'Пафа'), ('Деян 13:13', 'Пергию, в Памфилии'),
    ('Деян 13:14', 'Антиохию Писидийскую'), ('Деян 13:51', 'Иконию'),
    ('Деян 14:6', 'Листру и Дервию'), ('Деян 14:20', 'Дервию'),
    ('Деян 14:21', 'Листру, Иконию и Антиохию'), ('Деян 14:24', 'Писидию'),
    ('Деян 14:24', 'Памфилию'), ('Деян 14:25', 'Пергии'), ('Деян 14:25', 'Атталию'),
    ('Деян 14:26', 'Антиохию'),
    # Трудные случаи § 4
    ('3Цар 9:26', 'Ецион-Гавере'), ('3Цар 9:26', 'Чермного моря'), ('3Цар 9:28', 'Офир'),
    ('Быт 10:29', 'Офира'), ('Ин 2:1', 'Кане Галилейской'), ('Нав 19:28', 'Кана'),
    ('Нав 16:8', 'потоку Кане'), ('Лк 24:13', 'стадий на шестьдесят'), ('Лк 24:13', 'Эммаус'),
    ('Ин 19:17', 'Голгофа'), ('Ин 19:20', 'недалеко от города'), ('Быт 2:14', 'Хиддекель'),
    ('Дан 10:4', 'Тигра'), ('Быт 8:4', 'горах Араратских'), ('Ион 1:3', 'Фарсис'),
    ('Исх 3:1', 'Хориву'), ('Исх 17:6', 'Хориве'), ('Втор 5:2', 'Хориве'),
    ('Деян 7:30', 'горы Синая'), ('Гал 4:25', 'гору Синай в Аравии'), ('Исх 19:20', 'гору Синай'),
    ('Суд 18:29', 'Лаис'), ('Быт 35:19', 'Ефрафу, то есть Вифлеем'), ('Нав 14:15', 'Кириаф-Арбы'),
    ('Мф 4:18', 'моря Галилейского'), ('Лк 5:1', 'озера Геннисаретского'),
    ('Чис 34:11', 'моря Киннереф'), ('Ин 21:1', 'море Тивериадском'), ('Исх 16:1', 'пустыню Син'),
    ('Чис 20:1', 'пустыню Син'), ('Чис 20:1', 'Кадесе'), ('Ин 1:28', 'Вифаваре'),
    ('2Пар 3:1', 'горе Мориа'), ('Ис 15:2', 'Медевою'), ('Чис 20:28', 'на вершине горы'),
]
bad = [(r, f) for r, f in FORMS if norm(f) not in norm(outside(TEXT.get(ref(r), '')))]
print(f'форм названий эскизов и таблицы трудных случаев: {len(FORMS)}; '
      f'не найдено вне скобок: {len(bad)}' + ('' if not bad else f' — {bad}'))

# Слова только в скобках: не основание (CLAUDE.md; 02, § 3.8)
BRACKET_ONLY = [('Быт 2:14', 'Тигр'), ('Быт 2:13', 'Геон'), ('Чис 33:36', 'пустыне Фаран'),
                ('Суд 1:23', 'прежде Луз'), ('Быт 11:32', 'в Харранской земле')]
ok = [(r, f) for r, f in BRACKET_ONLY
      if norm(f) in norm(inside(TEXT[ref(r)])) and norm(f) not in norm(outside(TEXT[ref(r)]))]
print(f'слова мест только в скобках (проверено {len(BRACKET_ONLY)}): '
      f'подтверждено {len(ok)} — {", ".join("{}: {}".format(r, f) for r, f in ok)}')

# ---------------------------------------------------------------- часть Б
args = sys.argv[1:]
if '--openbible' not in args:
    print('\n=== Часть Б. OpenBible: путь не задан — числа R3 не пересчитаны ===')
    sys.exit(0)
path = args[args.index('--openbible') + 1]
rows = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
print(f'\n=== Часть Б. OpenBible ({path.split("/")[-1]}) ===')
print(f'мест: {len(rows)}')


def clean(s):
    return re.sub(r'<[^>]+>', '', s or '')


def degree(r):
    """Степень по правилу § 3.3: лучший итог с учётом цепочки (modern_associations.score)."""
    ids = sorted(r.get('identifications', []), key=lambda i: -i['score'].get('time_total', 0))
    if ids and ids[0].get('id_source') == 'special' and clean(ids[0]['description']).startswith(
            ('unknown', 'not a')):
        return 'не установлено', 0, len(ids)
    ma = r.get('modern_associations') or {}
    s = max([v['score'] for v in ma.values()] or [0])
    if s >= 800:
        d = 'уверенно'
    elif s >= 500:
        d = 'вероятно'
    elif s >= 300:
        d = 'предположительно'
    else:
        d = 'не установлено'
    return d, s, len(ids)


dist = collections.Counter(degree(r)[0] for r in rows)
print('по степеням (пороги 800 / 500 / 300):',
      {k: dist[k] for k in ('уверенно', 'вероятно', 'предположительно', 'не установлено')})
nid = collections.Counter(min(len(r.get('identifications', [])), 3) for r in rows)
print(f'число предложенных отождествлений: одно — {nid[1]}, два — {nid[2]}, '
      f'три и больше — {nid[3]}, ни одного — {nid[0]}')

SKETCH = {
    '11.1 Авраам': ['Ur 1', 'Haran', 'Shechem', 'Bethel 1', 'Ai 1', 'Egypt', 'Mamre', 'Hebron',
                    'Gerar', 'Kadesh-barnea', 'Shur', 'Beersheba 1', 'Moriah', 'Machpelah',
                    'Dan', 'Hobah'],
    '11.2 Исход': ['Rameses', 'Succoth 2', 'Etham', 'Pi-hahiroth', 'Migdol 1', 'Baal-zephon',
                   'Red Sea 1', 'Marah', 'Elim', 'Red Sea 3', 'Sin', 'Dophkah', 'Alush',
                   'Rephidim', 'Wilderness of Sinai', 'Mount Sinai', 'Kadesh-barnea', 'Zin 1',
                   'Mount Hor 1', 'Moseroth'],
    '11.3 Рувим': ['Aroer 1', 'Medeba', 'Heshbon', 'Dibon 1', 'Baal-meon', 'Kiriathaim 1',
                   'Sibmah', 'Beth-jeshimoth', 'Bezer', 'Aroer 2'],
    '11.4 Вефиль': ['Bethel 1', 'Luz 1', 'Luz 2', 'Ai 1', 'Beth-aven 1', 'Beth-aven 2'],
    '11.5 Павел': ['Antioch 1', 'Seleucia', 'Salamis', 'Paphos', 'Perga', 'Antioch 2',
                   'Iconium', 'Lystra', 'Derbe', 'Attalia'],
    '§ 4': ['Ophir', 'Cana', 'Kanah 1', 'Kanah 2', 'Emmaus', 'Golgotha', 'Tarshish 1', 'Eden 1',
            'Ararat', 'Red Sea 2', 'Mount Horeb', 'Tigris', 'Moriah', 'Mount Moriah'],
}
byname = {r['friendly_id']: r for r in rows}
for title, names in SKETCH.items():
    out = []
    for n in names:
        r = byname.get(n)
        if not r:
            out.append(f'{n}: нет записи')
            continue
        d, s, k = degree(r)
        ma = sorted((r.get('modern_associations') or {}).values(), key=lambda v: -v['score'])
        best = ma[0]['name'] if ma else '—'
        out.append(f'{n}: {d} ({s}; {best}; предложений {k})')
    print(f'[{title}] ' + '; '.join(out))
