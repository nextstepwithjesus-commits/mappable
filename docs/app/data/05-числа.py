"""Числа документа 05 «География» (редакция 2).

Запуск из корня репозитория:
    python3 -I docs/app/data/05-числа.py
    python3 -I docs/app/data/05-числа.py --openbible ПУТЬ/data/ancient.jsonl [--ne ПУТЬ/ne_10m_land.geojson]

Части:
  А — только репозиторий: base/, tools/bible/synodal.tsv, tools/bible/brackets.tsv;
  Б — копия OpenBible Bible Geocoding Data (github.com/openbibleinfo/Bible-Geocoding-Data,
      коммит 7eb18a5; файлы data/ancient.jsonl и data/modern.jsonl рядом);
  В — геометрия эскизов: окна, масштаб, соседи, рельеф, направления; морские отрезки —
      если задан файл суши Natural Earth (ne_10m_land.geojson);
  Г — цвет карты: ступени высот, отмывка, контраст подписей, знаков и линий (WCAG 2.x);
      считается всегда, внешних файлов не нужно.
Копий OpenBible и Natural Earth в репозитории нет (02, § 5); без пути части Б и В не считаются.

Скобки: основание факта — слова вне скобок и слова мест вида «б» (gloss) и «г» (damage),
сверенных с подлинником по tools/bible/brackets.tsv (02, § 3.8; tools/base/brackets.ts).
Файлы проекта скрипт не меняет.
"""
import collections
import glob
import json
import math
import re
import sys

ARGS = sys.argv[1:]


def arg(name):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else None


# ---------------------------------------------------------------- текст и скобки
TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t

NT_BOOKS = {'Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Иак', '1Пет', '2Пет', '1Ин', '2Ин', '3Ин', 'Иуд',
            'Рим', '1Кор', '2Кор', 'Гал', 'Еф', 'Флп', 'Кол', '1Фес', '2Фес', '1Тим', '2Тим',
            'Тит', 'Флм', 'Евр', 'Откр'}
BR = collections.defaultdict(list)     # (книга, глава, стих) -> [(текст, вид, основание)]
_head = None
for line in open('tools/bible/brackets.tsv', encoding='utf-8'):
    x = line.rstrip('\n').split('\t')
    if _head is None:
        _head = {n: i for i, n in enumerate(x)}
        continue
    book, ch, fr, to = x[_head['книга']], int(x[_head['глава']]), int(x[_head['стих']]), int(x[_head['по стих']])
    kind, by = x[_head['вид']], x[_head['чем проверено']]
    original = re.search(r'\bTR\b' if book in NT_BOOKS else r'\bWLC\b', by) is not None
    basis = kind in ('gloss', 'damage') and original
    parts = [p.strip() for p in x[_head['текст']].split('¦')]
    for i, v in enumerate(range(fr, to + 1)):
        BR[(book, ch, v)].append((parts[i] if i < len(parts) else '', kind, basis))

KIND_RU = {'gloss': 'б', 'damage': 'г', 'lxx': 'а', 'added': 'в', 'slav': 'г-нз'}


def bracket_info(key, inner):
    """Вид скобки по таблице и признак «основание факта»."""
    for txt, kind, basis in BR.get(key, []):
        if txt.strip(' ,.;:') == inner.strip(' ,.;:'):
            return kind, basis
    return 'unknown', False


def basis_text(key):
    """Слова стиха, на которые можно опираться: вне скобок и в скобках вида б/г по таблице."""
    t = TEXT.get(key, '')

    def repl(m):
        inner = m.group(0)[1:-1] if m.group(0)[-1] in '])' else m.group(0)[1:]
        kind, basis = bracket_info(key, inner)
        return ' ' + inner + ' ' if basis else ' '
    t = re.sub(r'\[[^\]]*\]?', repl, t)
    return re.sub(r'\([^)]*\)?', repl, t)


def inside(t):
    return re.findall(r'\[([^\]]*)\]?', t) + re.findall(r'\(([^)]*)\)?', t)


def ref(s):
    """«3Цар 12:29» или «3 Цар 12:29» -> ключ стиха."""
    m = re.fullmatch(r'(\d?)\s?(\S+)\s+(\d+):(\d+)', s.strip())
    return (m.group(1) + m.group(2), int(m.group(3)), int(m.group(4)))


def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'\s*[—–-]\s*', '-', s)
    return ' '.join(s.split())


# ================================================================ часть А
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
basis_c = collections.Counter(m['basis'] for m in mem)
mem_places = sum(1 for m in mem if not m['actor'].startswith('p-'))
print(f'записей членства: {len(mem)}; основания: {dict(basis_c)}; '
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
ple = [s for s in src if s['id'] == 'src-pleiades']
if ple:
    print(f'  Pleiades в реестре: лицензия «{ple[0].get("license", "—")}»')

camps = [(v, basis_text(('Чис', 33, v))) for v in range(5, 50)]
n_vs = sum(1 for _, t in camps if 'станом' in t)
first_camp = re.search(r'станом в (\w+)', camps[0][1]).group(1)
print(f'Чис 33:5–49: стихов со словом "станом" (основание по таблице скобок) — {n_vs}; '
      f'первый стан — {first_camp} (Чис 33:5); из Раамсеса только "отправились"')
vef = [k for k in TEXT if re.search(r'вефил', basis_text(k).lower())]
print(f'стихов с основой "Вефил" (основание): {len(vef)}; книг: {len({k[0] for k in vef})}')
bav = sorted({f'{k[0]} {k[1]}:{k[2]}' for k in TEXT if re.search(r'беф-?\s?авен', norm(basis_text(k)))})
print(f'стихи с "Беф-Авен" / "Бефавен": {len(bav)} — {", ".join(bav)}')
hesh = sorted({k for k in TEXT if re.search(r'есевон', basis_text(k).lower())},
              key=lambda k: list(TEXT).index(k))
print(f'стихи со словом "Есевон" (основание): {len(hesh)} — '
      + ', '.join(f'{k[0]} {k[1]}:{k[2]}' for k in hesh))
dib = sorted({k for k in TEXT if re.search(r'дивон', basis_text(k).lower())}, key=lambda k: list(TEXT).index(k))
print(f'стихи со словом "Дивон" (основание): {len(dib)} — ' + ', '.join(f'{k[0]} {k[1]}:{k[2]}' for k in dib))
mertv = sum(1 for k, t in TEXT.items() if 'мертвое море' in norm(t) or 'мертвого моря' in norm(t))
solen = sorted({f'{k[0]} {k[1]}:{k[2]}' for k, t in TEXT.items() if re.search(r'море соленое|соленого моря|соленое море|соленому морю', norm(t))},
               key=lambda s: list(TEXT).index(ref(s)))
print(f'"Мертвое море" в тексте: {mertv}; "море Соленое" и формы: {len(solen)} стихов — {", ".join(solen)}')

# Формы названий: в своём стихе среди слов-оснований (вне скобок или в скобке вида б/г)
FORMS = [
    # 11.1 Авраам
    ('Быт 11:31', 'Ура Халдейского'), ('Быт 11:31', 'Харрана'), ('Быт 12:4', 'Харрана'),
    ('Быт 12:5', 'землю Ханаанскую'), ('Быт 12:6', 'Сихема'), ('Быт 12:6', 'дубравы Море'),
    ('Быт 12:8', 'Вефиль'), ('Быт 12:8', 'Гай'), ('Быт 12:9', 'к югу'), ('Быт 12:10', 'Египет'),
    ('Быт 13:1', 'из Египта'), ('Быт 13:1', 'на юг'), ('Быт 13:3', 'от юга до Вефиля'),
    ('Быт 13:3', 'между Вефилем и между Гаем'), ('Быт 13:18', 'дубравы Мамре, что в Хевроне'),
    ('Быт 14:14', 'Дана'), ('Быт 14:15', 'Ховы'), ('Быт 14:15', 'Дамаска'),
    ('Быт 20:1', 'Кадесом'), ('Быт 20:1', 'Суром'), ('Быт 20:1', 'Гераре'),
    ('Быт 21:31', 'Вирсавия'), ('Быт 22:2', 'землю Мориа'), ('Быт 22:19', 'Вирсавию'),
    ('Быт 23:2', 'Кириаф-Арбе'), ('Быт 23:2', 'ныне Хеврон'), ('Быт 25:9', 'пещере Махпеле'),
    ('Деян 7:2', 'Месопотамии'), ('Деян 7:4', 'земли Халдейской'),
    # 11.2 Исход
    ('Чис 33:5', 'Раамсеса'), ('Чис 33:5', 'Сокхофе'), ('Чис 33:6', 'Ефаме'),
    ('Чис 33:7', 'Пи-Гахирофу'), ('Чис 33:7', 'Ваал-Цефоном'), ('Чис 33:7', 'пред Мигдолом'),
    ('Чис 33:8', 'от Гахирофа'), ('Чис 33:8', 'прошли среди моря'), ('Чис 33:8', 'пустынею Ефам'),
    ('Чис 33:8', 'Мерре'), ('Чис 33:9', 'Елим'), ('Чис 33:10', 'Чермного моря'),
    ('Чис 33:11', 'пустыне Син'), ('Чис 33:12', 'Дофке'), ('Чис 33:13', 'Алуше'),
    ('Чис 33:14', 'Рефидиме'), ('Чис 33:15', 'пустыне Синайской'), ('Исх 19:2', 'против горы'),
    ('Чис 33:36', 'она же Кадес'), ('Чис 33:37', 'горе Ор'), ('Чис 33:38', 'гору Ор'),
    ('Чис 33:48', 'равнинах Моавитских'), ('Втор 10:6', 'Мозер'), ('Чис 33:30', 'Мосерофе'),
    ('Втор 10:7', 'из Гудгода в Иотвафу'), ('Исх 13:18', 'Чермному морю'),
    ('Исх 14:2', 'Пи-Гахирофом'), ('Исх 19:2', 'пустыню Синайскую'), ('Исх 15:22', 'пустыню Сур'),
    # 11.7 история
    ('Исх 14:2', 'Мигдолом'), ('Исх 14:2', 'Ваал-Цефоном'), ('Исх 14:22', 'среди моря по суше'),
    # Заиорданье: Чис 21 и Чис 33
    ('Чис 21:10', 'Овофе'), ('Чис 21:11', 'Ийе-Авариме'), ('Чис 21:12', 'долине Заред'),
    ('Чис 21:13', 'Арнона'), ('Чис 21:16', 'к Беэр'), ('Чис 21:18', 'в Матанну'),
    ('Чис 21:19', 'из Матанны в Нагалиил'), ('Чис 21:19', 'Вамоф'), ('Чис 21:20', 'горы Фасги'),
    ('Чис 33:41', 'Салмоне'), ('Чис 33:42', 'Пуноне'), ('Чис 33:43', 'Овофе'),
    ('Чис 33:44', 'Ийм-Авариме'), ('Чис 33:45', 'Дивон-Гаде'), ('Чис 33:46', 'Алмон-Дивлафаиме'),
    ('Чис 33:47', 'горах Аваримских'), ('Втор 2:8', 'путем равнины'),
    # 11.3 Рувим
    ('Нав 13:16', 'Ароер'), ('Нав 13:16', 'потока Арнона'), ('Нав 13:16', 'Медеве'),
    ('Нав 13:17', 'Есевон'), ('Нав 13:17', 'Дивон'), ('Нав 13:17', 'Беф-Ваал-Меон'),
    ('Нав 13:19', 'Кириафаим'), ('Нав 13:19', 'Сивма'), ('Нав 13:20', 'Беф-Иешимоф'),
    ('Нав 13:23', 'Иордан'), ('Нав 20:8', 'Бецер'), ('Чис 32:34', 'Дивон'),
    ('Чис 32:34', 'Ароер'), ('Чис 32:37', 'Есевон'), ('Нав 21:39', 'Есевон'),
    ('Нав 13:26', 'от Есевона до Рамаф-Мицфы'), ('Чис 21:26', 'Есевон был город Сигона'),
    ('Иер 49:3', 'Рыдай, Есевон'), ('Ис 15:2', 'Дивону'), ('Ис 15:4', 'Есевон'),
    ('Иер 48:2', 'в Есевоне замышляют'), ('Иер 48:18', 'Дивона'), ('Нав 13:25', 'Ароера, что пред Раввою'),
    ('4Цар 10:33', 'от Ароера, который при потоке Арноне'), ('Нав 3:16', 'море Соленое'),
    ('Чис 33:49', 'от Беф-Иешимофа'),
    # 11.4 Вефиль
    ('Быт 28:19', 'Вефиль'), ('Быт 28:19', 'Луз'), ('Быт 35:6', 'Луз'), ('Быт 35:6', 'Вефиль'),
    ('Быт 35:7', 'Эл-Вефиль'), ('Быт 35:8', 'ниже Вефиля'), ('Нав 16:2', 'от Вефиля'),
    ('Нав 16:2', 'к Лузу'), ('Нав 18:13', 'Луза, иначе Вефиля'), ('Нав 18:22', 'Вефиль'),
    ('Суд 1:23', 'прежде Луз'), ('Нав 7:2', 'Беф-Авена'), ('Нав 7:2', 'с восточной стороны Вефиля'),
    ('Нав 18:12', 'Бефавен'), ('Ос 4:15', 'Беф-Авен'), ('Ос 10:5', 'тельца Беф-Авена'),
    ('3Цар 12:29', 'Вефиле'), ('Суд 1:26', 'Луз'), ('1Пар 7:28', 'Вефиль'), ('4Цар 23:15', 'Вефиле'),
    ('Ам 5:5', 'Вефиль'), ('Езд 2:28', 'Вефиля и Гая'), ('Неем 7:32', 'Вефиля и Гая'),
    # 11.5 Павел
    ('Деян 13:1', 'Антиохии'), ('Деян 13:4', 'Селевкию'), ('Деян 13:4', 'Кипр'),
    ('Деян 13:5', 'Саламине'), ('Деян 13:6', 'Пафа'), ('Деян 13:13', 'Пергию, в Памфилии'),
    ('Деян 13:14', 'Антиохию Писидийскую'), ('Деян 13:51', 'Иконию'),
    ('Деян 14:6', 'Листру и Дервию'), ('Деян 14:20', 'Дервию'),
    ('Деян 14:21', 'Листру, Иконию и Антиохию'), ('Деян 14:24', 'Писидию'),
    ('Деян 14:24', 'Памфилию'), ('Деян 14:25', 'Пергии'), ('Деян 14:25', 'Атталию'),
    ('Деян 14:26', 'Антиохию'),
    # § 4
    ('3Цар 9:26', 'Ецион-Гавере'), ('3Цар 9:26', 'Чермного моря'), ('3Цар 9:28', 'Офир'),
    ('Быт 10:29', 'Офира'), ('Ин 2:1', 'Кане Галилейской'), ('Нав 19:28', 'Кана'),
    ('Нав 16:8', 'потоку Кане'), ('Лк 24:13', 'стадий на шестьдесят'), ('Лк 24:13', 'Эммаус'),
    ('Ин 19:17', 'Голгофа'), ('Ин 19:20', 'недалеко от города'), ('Евр 13:12', 'вне врат'),
    ('Быт 2:14', 'Хиддекель'), ('Быт 2:14', 'протекает пред Ассириею'), ('Быт 2:13', 'землю Куш'),
    ('Быт 2:11', 'землю Хавила'), ('Дан 10:4', 'Тигра'), ('Быт 8:4', 'горах Араратских'),
    ('Ион 1:3', 'Фарсис'), ('Исх 3:1', 'Хориву'), ('Исх 17:6', 'Хориве'), ('Втор 5:2', 'Хориве'),
    ('Втор 1:2', 'одиннадцати дней пути от Хорива'), ('Деян 7:30', 'горы Синая'),
    ('Гал 4:25', 'гору Синай в Аравии'), ('Исх 19:20', 'гору Синай'), ('Суд 18:29', 'Лаис'),
    ('Нав 19:47', 'Ласем'), ('Быт 35:19', 'Ефрафу, то есть Вифлеем'), ('Нав 14:15', 'Кириаф-Арбы'),
    ('Суд 1:10', 'прежде Кириаф-Арбы'), ('Нав 15:15', 'прежде было Кириаф-Сефер'),
    ('Мф 4:18', 'моря Галилейского'), ('Лк 5:1', 'озера Геннисаретского'),
    ('Чис 34:11', 'моря Киннереф'), ('Ин 21:1', 'море Тивериадском'), ('Исх 16:1', 'пустыню Син'),
    ('Исх 16:1', 'между Елимом и между Синаем'), ('Чис 20:1', 'пустыню Син'), ('Чис 20:1', 'Кадесе'),
    ('Чис 27:14', 'при Кадесе в пустыне Син'), ('Нав 15:3', 'Цин'), ('Чис 13:27', 'в Кадес'),
    ('Втор 1:46', 'в Кадесе'), ('2Пар 3:1', 'горе Мориа'), ('Ис 15:2', 'Медевою'),
    ('Мф 8:28', 'страну Гергесинскую'), ('Мк 5:1', 'страну Гадаринскую'), ('Лк 8:26', 'страну Гадаринскую'),
    ('Лк 9:10', 'близ города, называемого Вифсаидою'), ('Ин 6:1', 'на ту сторону моря Галилейского'),
    ('Деян 27:12', 'Финика'), ('Деян 28:1', 'Мелит'), ('Деян 27:27', 'Адриатическом море'),
    ('Мф 17:1', 'на гору высокую'), ('Мф 5:1', 'взошел на гору'), ('1Цар 30:28', 'Ароере'),
    ('Суд 20:1', 'от Дана до Вирсавии'), ('4Цар 23:8', 'от Гевы до Вирсавии'),
    ('4Цар 14:25', 'от входа в Емаф до моря пустыни'), ('3Цар 4:21', 'от реки Евфрата до земли Филистимской'),
    ('Быт 15:18', 'от реки Египетской до великой реки'), ('Нав 19:1', 'среди удела сынов Иудиных'),
    ('Нав 13:33', 'колену Левиину Моисей не дал удела'), ('Исх 13:17', 'по дороге земли Филистимской'),
    ('Исх 13:18', 'дорогою пустынною'), ('Чис 20:17', 'дорогою царскою'), ('Чис 21:22', 'путем царским'),
    ('Чис 21:4', 'путем Чермного моря'), ('Деян 8:26', 'на дорогу, идущую из Иерусалима в Газу'),
    ('Лк 3:1', 'Трахонитской области'), ('Лк 3:1', 'Авилинее'),
]
bad = [(r, f) for r, f in FORMS if norm(f) not in norm(basis_text(ref(r)))]
print(f'форм названий эскизов и таблицы трудных случаев: {len(FORMS)}; '
      f'не найдено среди слов-оснований: {len(bad)}' + ('' if not bad else f' — {bad}'))

# Слова о местах в скобках: вид по таблице и основание (02, § 3.8)
IN_BRACKETS = [('Быт 2:14', 'Тигр'), ('Быт 2:13', 'Геон'), ('Чис 33:36', 'пустыне Фаран'),
               ('Быт 11:32', 'в Харранской земле'), ('Нав 15:59', 'Ефрафа, иначе Вифлеем'),
               ('Чис 21:16', 'отправились'), ('Чис 21:18', 'отправились'),
               ('Суд 1:23', 'прежде Луз'), ('Суд 1:10', 'прежде Кириаф-Арбы'),
               ('Нав 15:15', 'прежде было Кириаф-Сефер'), ('Нав 11:10', 'Асор же прежде'),
               ('Чис 27:14', 'воды Меривы при Кадесе'), ('Втор 3:13', 'землею Рефаимов'),
               ('Быт 28:19', 'Иаков')]
rows_b = []
for r, f in IN_BRACKETS:
    k = ref(r)
    hit = [i for i in inside(TEXT[k]) if norm(f) in norm(i)]
    kind, basis = bracket_info(k, hit[0]) if hit else ('нет в скобках', False)
    rows_b.append(f'{r}: «{f}» — вид {KIND_RU.get(kind, kind)}, {"основание" if basis else "не основание"}')
print(f'слова о местах в скобках (проверено {len(IN_BRACKETS)}): ' + '; '.join(rows_b))

# Слова перехода: отрезок пути — только если они есть среди слов-оснований стиха
CUE = re.compile(r'отправ|двину|пошел|пошли|пришел|пришли|вышел|вышли|поднял|сошел|сошли|сошел|'
                 r'прошел|прошли|пройдя|отплы|приплы|прибыл|возвратил|обратил|переход|вступили|'
                 r'оттуда|отсюда|\bиз \w+ в \w+')
PATH_CUES = [  # (стих, откуда, куда)
    ('Быт 11:31', 'Ур', 'Харран'), ('Быт 12:5', 'Харран', 'Ханаан'), ('Быт 12:6', '—', 'Сихем'),
    ('Быт 12:8', 'Сихем', 'Вефиль/Гай'), ('Быт 12:9', 'Вефиль/Гай', 'к югу'),
    ('Быт 12:10', 'юг', 'Египет'), ('Быт 13:1', 'Египет', 'юг'), ('Быт 13:3', 'юг', 'Вефиль/Гай'),
    ('Быт 13:18', 'Вефиль/Гай', 'Мамре'), ('Быт 20:1', 'Мамре', 'Герар'), ('Быт 22:19', 'Мориа', 'Вирсавия'),
    ('Чис 33:5', 'Раамсес', 'Сокхоф'), ('Чис 33:8', 'Гахироф', 'Мерра'), ('Чис 33:15', 'Рефидим', 'пустыня Синайская'),
    ('Втор 10:6', 'Беероф-Бене-Яакан', 'Мозер'), ('Втор 10:7', 'Гудгод', 'Иотвафа'),
    ('Чис 21:16', 'Арнон', 'Беэр'), ('Чис 21:18', 'пустыня', 'Матанна'), ('Чис 21:19', 'Матанна', 'Нагалиил'),
    ('Деян 13:4', 'Селевкия', 'Кипр'), ('Деян 13:13', 'Паф', 'Пергия'), ('Деян 14:24', 'Писидия', 'Памфилия'),
    ('Деян 14:25', 'Пергия', 'Атталия'), ('Деян 14:26', 'Атталия', 'Антиохия'),
    ('Ион 1:3', 'Иоппия', 'Фарсис (намерение)'), ('Быт 23:2', '—', 'Кириаф-Арба'),
]
no_cue = [f'{r} ({a} → {b})' for r, a, b in PATH_CUES if not CUE.search(basis_text(ref(r)).lower())]
print(f'переходов эскизов и § 4: {len(PATH_CUES)}; без слов перехода среди слов-оснований: {len(no_cue)} — '
      + ', '.join(no_cue))

# ================================================================ часть Г (цвет) — считается всегда


def lum(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lch(L, C, H):
    """CIE LCh(ab), D65 -> sRGB hex."""
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    finv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = 0.95047 * finv(fx), 1.0 * finv(fy), 1.08883 * finv(fz)
    rl = 3.2406 * X - 1.5372 * Y - 0.4986 * Z
    gl = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
    bl = 0.0557 * X - 0.2040 * Y + 1.0570 * Z
    g = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return '#' + ''.join('%02X' % round(max(0, min(1, g(c))) * 255) for c in (rl, gl, bl))


def shade(h, k):
    """Отмывка умножением: каждый канал sRGB × k."""
    h = h.lstrip('#')
    return '#' + ''.join('%02X' % round(int(h[i:i + 2], 16) * k) for i in (0, 2, 4))


# Ступени высот (предложение для образца 08; направление А, R13 § 5.5): «выше — светлее»,
# низины без зелени (Паттерсон — Дженни), насыщенность C* ≤ 10; своя ступень ниже уровня моря.
STEPS = [('ниже уровня моря', 82, 6, 115), ('0–200 м', 86, 9, 105), ('200–500 м', 88, 10, 95),
         ('500–1000 м', 90, 10, 85), ('1000–2000 м', 92, 8, 78), ('2000–3000 м', 94, 5, 72),
         ('выше 3000 м', 96, 3, 70)]
STEPS_DARK = [('ниже уровня моря', 15, 4, 115), ('0–200 м', 17, 5, 105), ('200–500 м', 18, 5, 95),
              ('500–1000 м', 19, 5, 85), ('1000–2000 м', 20, 4, 78), ('2000–3000 м', 21, 3, 72),
              ('выше 3000 м', 22, 2, 70)]
SHADE_LIGHT = (0.80, 1.00)   # тень склона — до −20 % (полоса светлоты, доступность № 5)
SHADE_DARK = (0.60, 1.00)    # тёмная тема: отмывка умножением до −40 % (арт-директор № 12)
T = {   # токены: светлая, тёмная
    'фон': ('#F4F6F9', '#161D27'), 'чернила': ('#18202C', '#E8ECF1'), 'чернила-2': ('#4A5463', '#A9B3C1'),
    'вода': ('#D6E2EC', '#121A24'), 'подпись воды': ('#365670', '#9DBAD3'), 'берег': ('#7C93A8', '#3A4555'),
    'река': ('#4D7798', '#6F98BA'), 'выбор': ('#FFD43B', '#F0D04A'), 'ореол': ('#F4F6F9', '#161D27'),
    'путь по морю': ('#365670', '#9DBAD3'), 'дорога (справочно)': ('#7A6E60', '#9C907F'),
}
print('\n=== Часть Г. Цвет карты (WCAG 2.x; предложение для образца 08) ===')
for theme, steps, sh, ti in (('светлая', STEPS, SHADE_LIGHT, 0), ('тёмная', STEPS_DARK, SHADE_DARK, 1)):
    tints = [(n, lch(L, C, H)) for n, L, C, H in steps]
    print(f'[{theme}] ступени высот: ' + '; '.join(f'{n} {h}' for n, h in tints))
    darkest = min((shade(h, sh[0]) for _, h in tints), key=lum)
    lightest = max((h for _, h in tints), key=lum)
    print(f'[{theme}] полоса суши с отмывкой: самый тёмный {darkest} (L={lum(darkest):.3f}), '
          f'самый светлый {lightest} (L={lum(lightest):.3f}); вода {T["вода"][ti]}')
    ink, ink2, halo = T['чернила'][ti], T['чернила-2'][ti], T['ореол'][ti]
    checks = [
        ('чернила (подпись) на ореоле', ink, halo, 4.5),
        ('чернила (подпись) без ореола, на самой тёмной суше', ink, darkest, 4.5),
        ('чернила (подпись) без ореола, на самой светлой суше', ink, lightest, 4.5),
        ('чернила-2 (вторая строка) на ореоле', ink2, halo, 4.5),
        ('чернила-2 без ореола, на самой тёмной суше', ink2, darkest, 4.5),
        ('подпись воды на воде', T['подпись воды'][ti], T['вода'][ti], 4.5),
        ('знак и путь (чернила) на самой тёмной суше', ink, darkest, 3),
        ('знак и путь (чернила) на воде', ink, T['вода'][ti], 3),
        ('пределы (чернила-2) на самой тёмной суше', ink2, darkest, 3),
        ('река на самой светлой суше', T['река'][ti], lightest, 3),
        ('река на самой тёмной суше', T['река'][ti], darkest, 3),
        ('путь по морю на воде', T['путь по морю'][ti], T['вода'][ti], 3),
        ('дорога (справочно) на самой светлой суше', T['дорога (справочно)'][ti], lightest, 3),
        ('дорога (справочно) на самой тёмной суше', T['дорога (справочно)'][ti], darkest, 3),
        ('берег: суша (низины) к воде', tints[1][1], T['вода'][ti], 1.0),
        ('берег (линия) на воде', T['берег'][ti], T['вода'][ti], 1.0),
        ('жёлтый выбор на самой светлой суше — без кольца', T['выбор'][ti], lightest, 3),
        ('кольцо выбора: чернила на жёлтом', ink if ti == 0 else '#161D27', T['выбор'][ti], 3),
        ('подпись на плашке выбора', '#18202C' if ti == 0 else '#161D27', T['выбор'][ti], 4.5),
    ]
    for name, a, b, need in checks:
        c = cr(a, b)
        mark = '' if need <= 1 else (' ✓' if c >= need else f' — НИЖЕ {need}')
        print(f'  [{theme}] {name}: {a} / {b} = {c:.2f} : 1{mark}')

# ================================================================ часть Б
ob_path = arg('--openbible')
if not ob_path:
    print('\n=== Часть Б. OpenBible: путь не задан — части Б и В не считаются ===')
    sys.exit(0)
rows = [json.loads(l) for l in open(ob_path, encoding='utf-8') if l.strip()]
mod = {}
for l in open(ob_path.replace('ancient.jsonl', 'modern.jsonl'), encoding='utf-8'):
    r = json.loads(l)
    mod[r['id']] = r
print(f'\n=== Часть Б. OpenBible ({ob_path.split("/")[-1]}) ===')
print(f'мест: {len(rows)}')


def clean(s):
    return re.sub(r'<[^>]+>', '', s or '')


def ids_of(r):
    return sorted(r.get('identifications', []), key=lambda i: -i['score'].get('time_total', 0))


def degree(r):
    """Степень по правилу § 3.3: лучший итог с учётом цепочки (modern_associations.score)."""
    ids = ids_of(r)
    if ids and ids[0].get('id_source') == 'special' and clean(ids[0]['description']).startswith(('unknown', 'not a')):
        return 'не установлено', 0, len(ids)
    ma = r.get('modern_associations') or {}
    s = max([v['score'] for v in ma.values()] or [0])
    d = 'уверенно' if s >= 800 else 'вероятно' if s >= 500 else 'предположительно' if s >= 300 else 'не установлено'
    return d, s, len(ids)


def positive(r):
    """Предложения, которые сводка не отвергает: оценка > 0."""
    return [i for i in ids_of(r) if i['score'].get('time_total', 0) > 0]


DEG = ('уверенно', 'вероятно', 'предположительно', 'не установлено')
dist = collections.Counter(degree(r)[0] for r in rows)
print('по степеням (пороги 800 / 500 / 300):', {k: dist[k] for k in DEG})
nid = collections.Counter(min(len(r.get('identifications', [])), 3) for r in rows)
print(f'число предложенных отождествлений (все): одно — {nid[1]}, два — {nid[2]}, '
      f'три и больше — {nid[3]}, ни одного — {nid[0]}')
pos = collections.Counter((degree(r)[0], min(len(positive(r)), 2)) for r in rows)
print('предложений с оценкой > 0 по степеням (1 / 2 и больше): '
      + '; '.join(f'{d}: {pos[(d, 1)]} / {pos[(d, 2)]}' for d in DEG))
neg = collections.Counter(degree(r)[0] for r in rows
                          if any(i['score'].get('time_total', 0) <= 0 for i in ids_of(r)))
print(f'мест, где среди предложений есть отвергнутые (оценка ≤ 0): {sum(neg.values())} — '
      + ', '.join(f'{d} {neg[d]}' for d in DEG))
one_vote = collections.Counter()
for r in rows:
    d = degree(r)[0]
    ids = ids_of(r)
    if d == 'уверенно' and ids:
        one_vote['один голос' if ids[0]['score'].get('vote_count', 0) == 1 else 'больше'] += 1
print(f'«уверенно»: лучшее предложение держится на одном голосе — {one_vote["один голос"]} из '
      f'{sum(one_vote.values())}')
tie = []
for r in rows:
    d = degree(r)[0]
    p = positive(r)
    if d in ('вероятно', 'предположительно') and len(p) >= 2:
        a, b = p[0]['score']['time_total'], p[1]['score']['time_total']
        if b >= 0.75 * a and p[1].get('id_source') != 'special':
            tie.append(f"{r['friendly_id']} ({a}/{b})")
print(f'близкие соперники (второе предложение ≥ 0,75 первого): {len(tie)} — {", ".join(tie)}')
appr = collections.Counter()
for r in rows:
    d = degree(r)[0]
    ids = ids_of(r)
    if d != 'не установлено' and ids:
        b = ids[0]
        res = (b.get('resolutions') or [{}])[0]
        if b.get('modifier') in ('near', 'along', '>') or res.get('geometry_radius_meters') or b.get('geometry_radius_meters'):
            appr[d] += 1
print(f'лучшее предложение приблизительное («near», «along», «>», радиус): {sum(appr.values())} — '
      + ', '.join(f'{d} {appr[d]}' for d in DEG[:3]))


def best_point(r):
    ma = r.get('modern_associations') or {}
    if not ma:
        return None
    k = max(ma, key=lambda k: ma[k]['score'])
    m = mod.get(k)
    if not m or not m.get('lonlat'):
        return None
    lon, lat = map(float, m['lonlat'].split(','))
    return lon, lat, ma[k]['name']


def hav(a, b):
    R = 6371
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    return 2 * R * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2
                                       + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))


# Кандидаты в 5 км: сколько мест сменили бы степень, если сложить соседние кандидаты
changes = collections.Counter()
for r in rows:
    if degree(r)[0] == 'не установлено' and degree(r)[1] == 0:
        continue
    ma = r.get('modern_associations') or {}
    items = []
    for k, v in ma.items():
        m = mod.get(k)
        if m and m.get('lonlat'):
            items.append((tuple(map(float, m['lonlat'].split(','))), v['score']))
    if not items:
        continue
    bp, s0 = max(items, key=lambda x: x[1])
    s = min(1000, sum(max(0, sc) for p, sc in items if hav(p, bp) <= 5))
    d0 = degree(r)[0]
    d1 = 'уверенно' if s >= 800 else 'вероятно' if s >= 500 else 'предположительно' if s >= 300 else 'не установлено'
    if d1 != d0:
        changes[(d0, d1)] += 1
print(f'кандидаты в пределах 5 км сложены: меняют степень {sum(changes.values())} мест '
      f'({100 * sum(changes.values()) / len(rows):.0f} %) — '
      + '; '.join(f'{a} → {b}: {n}' for (a, b), n in changes.most_common()))

byname = {r['friendly_id']: r for r in rows}
SKETCH = {
    '11.1 Авраам': ['Ur 1', 'Haran', 'Canaan', 'Shechem', 'Bethel 1', 'Ai 1', 'Egypt', 'Mamre', 'Hebron',
                    'Gerar', 'Kadesh-barnea', 'Shur', 'Beersheba 1', 'Moriah', 'Machpelah', 'Dan', 'Hobah'],
    '11.2 Исход': ['Rameses', 'Succoth 2', 'Etham', 'Pi-hahiroth', 'Migdol 1', 'Baal-zephon',
                   'Red Sea 1', 'Marah', 'Elim', 'Red Sea 3', 'Sin', 'Dophkah', 'Alush',
                   'Rephidim', 'Wilderness of Sinai', 'Mount Sinai', 'Shur', 'Kadesh-barnea', 'Zin 1',
                   'Mount Hor 1', 'Moseroth', 'Beeroth Bene-jaakan', 'Bene-jaakan', 'Hor-haggidgad', 'Jotbathah'],
    'Заиорданье': ['Oboth', 'Iye-abarim', 'Zered', 'Arnon', 'Beer 1', 'Mattanah', 'Nahaliel', 'Bamoth',
                   'Pisgah', 'Zalmonah', 'Punon', 'Dibon 1', 'Almon-diblathaim', 'Abarim', 'Mount Nebo',
                   'Beth-jeshimoth', 'Shittim'],
    '11.3 Рувим': ['Aroer 1', 'Medeba', 'Heshbon', 'Dibon 1', 'Baal-meon', 'Kiriathaim 1',
                   'Sibmah', 'Beth-jeshimoth', 'Bezer', 'Aroer 2', 'Aroer 3', 'Salt Sea'],
    '11.4 Вефиль': ['Bethel 1', 'Luz 1', 'Luz 2', 'Ai 1', 'Beth-aven 1', 'Beth-aven 2'],
    '11.5 Павел': ['Antioch 1', 'Seleucia', 'Cyprus', 'Salamis', 'Paphos', 'Perga', 'Pamphylia', 'Antioch 2',
                   'Pisidia', 'Iconium', 'Lystra', 'Derbe', 'Attalia'],
    '§ 4': ['Ophir', 'Cana', 'Kanah 1', 'Kanah 2', 'Emmaus', 'Golgotha', 'Tarshish 1', 'Eden 1',
            'Ararat', 'Red Sea 2', 'Mount Horeb', 'Tigris', 'Moriah', 'Mount Moriah', 'Gadara', 'Gerasa',
            'Gergesa', 'Bethsaida 1', 'Bethsaida 2', 'Phoenix', 'Malta', 'Mount Tabor', 'Ezion-geber', 'Elath'],
}
for title, nm in SKETCH.items():
    out = []
    for n in nm:
        r = byname.get(n)
        if not r:
            out.append(f'{n}: нет записи')
            continue
        d, s, k = degree(r)
        p = positive(r)
        bp = best_point(r)
        ids = ids_of(r)
        votes = ids[0]['score'].get('vote_count', 0) if ids else 0
        out.append(f'{n}: {d} ({s}; {bp[2] if bp else "—"}; предложений {k}, из них с оценкой > 0 — {len(p)}; '
                   f'голосов у лучшего {votes})')
    print(f'[{title}] ' + '; '.join(out))

# Совпадающие точки разных записей среди мест эскизов (интерфейс, № 11)
pts = collections.defaultdict(list)
for nm in SKETCH.values():
    for n in nm:
        r = byname.get(n)
        bp = r and degree(r)[0] != 'не установлено' and best_point(r)
        if bp:
            pts[(round(bp[0], 3), round(bp[1], 3))].append(n)
same = [sorted(set(v)) for v in pts.values() if len(set(v)) > 1]
print(f'одна точка у разных записей (места эскизов): {len(same)} — '
      + '; '.join(' = '.join(v) for v in same))

# Места Деяний 13–28 по сводке (географ, № 22)
acts = set()
for r in rows:
    ex = json.loads(r['extra']) if isinstance(r.get('extra'), str) else (r.get('extra') or {})
    for o in ex.get('osises', []):
        m = re.fullmatch(r'Acts\.(\d+)\.\d+', o)
        if m and 13 <= int(m.group(1)) <= 28:
            acts.add(r['friendly_id'])
ad = collections.Counter(degree(byname[n])[0] for n in acts)
ple = sum(1 for n in acts if 'pleiades' in json.dumps(byname[n]).lower())
print(f'места Деян 13–28 (стихи сводки, нумерация ESV): {len(acts)}; по степеням с цепочкой: '
      + ', '.join(f'{d} {ad[d]}' for d in DEG) + f'; со ссылкой на Pleiades в сводке: {ple}')
hr = byname['Heshbon']
hx = json.loads(hr['extra'])
print(f'Есевон в сводке: стихов {len(hx["osises"])} (нумерация ESV)')

# ================================================================ часть В. Геометрия эскизов
print('\n=== Часть В. Геометрия эскизов (Web Mercator; точки — лучшие предложения сводки) ===')


def P(n):
    bp = best_point(byname[n])
    return bp[0], bp[1]


def merc(lon, lat):
    return math.radians(lon), math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


WINDOWS = {'ноутбук 880×680': (880, 680), 'рядом со Временем 600×600': (600, 600),
           'телефон 360×384': (360, 384), 'телефон лёжа 360×244': (360, 244)}
PAD = 32


def fit(names, W, H):
    xs = [merc(*P(n))[0] for n in names]
    ys = [merc(*P(n))[1] for n in names]
    s = min((W - 2 * PAD) / max(1e-9, max(xs) - min(xs)), (H - 2 * PAD) / max(1e-9, max(ys) - min(ys)))
    z = math.log2(s * 2 * math.pi / 256)
    return s, z


def px(a, b, s):
    xa, ya = merc(*P(a))
    xb, yb = merc(*P(b))
    return s * math.hypot(xa - xb, ya - yb)


def groups(names, s, gap=48):
    """Знаки ближе gap px сливаются в группу (одиночная связь)."""
    g = [{n} for n in names]
    merged = True
    while merged:
        merged = False
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                if any(px(a, b, s) < gap for a in g[i] for b in g[j]):
                    g[i] |= g.pop(j)
                    merged = True
                    break
            if merged:
                break
    return g


ETOPO_Z = math.log2(156543.03 * math.cos(math.radians(32)) / 463)
D90_Z = math.log2(156543.03 * math.cos(math.radians(32)) / 90)
print(f'родной уровень рельефа на 32° с. ш.: ETOPO 15″ (≈ 463 м) — z{ETOPO_Z:.1f}; '
      f'отмывка 90 м — z{D90_Z:.1f}')
VIEWS = {
    '11.1 Авраам, весь путь': ['Ur 1', 'Haran', 'Shechem', 'Bethel 1', 'Ai 1', 'Egypt', 'Mamre', 'Hebron',
                              'Gerar', 'Beersheba 1', 'Moriah', 'Dan'],
    '11.1 врезка «Ханаан»': ['Shechem', 'Bethel 1', 'Ai 1', 'Mamre', 'Hebron', 'Gerar', 'Beersheba 1', 'Moriah', 'Dan'],
    '11.2 Исход Чис 33:5–15': ['Rameses', 'Baal-zephon', 'Red Sea 1', 'Marah', 'Elim', 'Red Sea 3', 'Sin',
                               'Dophkah', 'Alush', 'Rephidim', 'Mount Sinai'],
    '11.3 земля Рувима': ['Aroer 1', 'Medeba', 'Heshbon', 'Dibon 1', 'Baal-meon', 'Kiriathaim 1', 'Sibmah',
                          'Beth-jeshimoth', 'Bezer'],
    '11.4 Вефиль и Гай': ['Bethel 1', 'Ai 1'],
    '11.5 Павел, Деян 13–14': ['Antioch 1', 'Seleucia', 'Salamis', 'Paphos', 'Perga', 'Antioch 2', 'Iconium',
                               'Lystra', 'Derbe', 'Attalia'],
}
for title, nm in VIEWS.items():
    for wn, (W, H) in WINDOWS.items():
        s, z = fit(nm, W, H)
        nn = sorted(min(px(a, b, s) for b in nm if b != a) for a in nm)
        close = sum(1 for d in nn if d < 48)
        g = groups(nm, s)
        big = [sorted(x) for x in g if len(x) > 1]
        stretch = z - min(ETOPO_Z, 8.0)
        print(f'[{title} | {wn}] z{z:.1f}; рельеф ETOPO растянут на {max(0, stretch):.1f} ур.; '
              f'отмывка 90 м — на {max(0, z - D90_Z):.1f} ур.; '
              f'ближайший сосед < 48 px у {close} из {len(nm)} (минимум {nn[0]:.0f} px); '
              f'групп при 48 px: {len(g)}' + (f' — слиты: {big}' if big else ''))
for a, b in (('Bethel 1', 'Ai 1'), ('Mamre', 'Hebron'), ('Shechem', 'Bethel 1'), ('Hebron', 'Beersheba 1'),
             ('Perga', 'Attalia'), ('Gerar', 'Beersheba 1')):
    print(f'  расстояние {a} — {b}: {hav(P(a), P(b)):.1f} км')
# Наименьшее окно, где пары 11.1 расходятся на 48 px (масштаб «Следующей стоянки»)
for a, b in (('Bethel 1', 'Ai 1'), ('Mamre', 'Hebron'), ('Gerar', 'Beersheba 1'), ('Shechem', 'Bethel 1')):
    d = math.hypot(merc(*P(a))[0] - merc(*P(b))[0], merc(*P(a))[1] - merc(*P(b))[1])
    print(f'  {a} — {b}: 48 px между знаками с уровня z{math.log2(48 / d * 2 * math.pi / 256):.1f}')

# Направление и расстояние между соседними стоянками (доступность, № 2)
RUMB = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад']


def bearing(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def rnd(km):
    return int(round(km, -1)) if km >= 100 else int(round(km / 5) * 5) if km >= 10 else round(km)


LEGS = {'11.1 Авраам': [('Ur 1', 'Haran'), ('Haran', 'Shechem'), ('Shechem', 'Bethel 1'), ('Bethel 1', 'Mamre'),
                        ('Mamre', 'Gerar'), ('Gerar', 'Beersheba 1'), ('Beersheba 1', 'Hebron')],
        '11.5 Павел': [('Antioch 1', 'Seleucia'), ('Seleucia', 'Salamis'), ('Salamis', 'Paphos'), ('Paphos', 'Perga'),
                       ('Perga', 'Antioch 2'), ('Antioch 2', 'Iconium'), ('Iconium', 'Lystra'), ('Lystra', 'Derbe'),
                       ('Perga', 'Attalia'), ('Attalia', 'Antioch 1')]}
for t, legs in LEGS.items():
    print(f'[{t}] ' + '; '.join(f'{a} → {b}: около {rnd(hav(P(a), P(b)))} км на {RUMB[int((bearing(P(a), P(b)) + 22.5) // 45) % 8]}'
                                for a, b in legs))

# Морские отрезки (арт-директор, № 10): прямая по суше и путь по воде в обход суши
ne = arg('--ne')
if not ne:
    print('морские отрезки: файл суши Natural Earth не задан — не считались')
    sys.exit(0)
BOX = (24.0, 30.5, 38.0, 38.5)   # долгота, широта: от Крита до Антиохии
STEP = 0.02
land_json = json.load(open(ne, encoding='utf-8'))
rings = []
for f in land_json['features']:
    g = f['geometry']
    cs = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in cs:
        for ring in poly:
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            if max(xs) < BOX[0] or min(xs) > BOX[2] or max(ys) < BOX[1] or min(ys) > BOX[3]:
                continue
            rings.append(ring)
NX = int((BOX[2] - BOX[0]) / STEP)
NY = int((BOX[3] - BOX[1]) / STEP)
edges_by_row = collections.defaultdict(list)
for ring in rings:
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if y1 == y2:
            continue
        lo, hi = min(y1, y2), max(y1, y2)
        r0 = max(0, int((lo - BOX[1]) / STEP))
        r1 = min(NY - 1, int((hi - BOX[1]) / STEP) + 1)
        for row in range(r0, r1 + 1):
            edges_by_row[row].append((x1, y1, x2, y2))
LAND = [[False] * NX for _ in range(NY)]
for row in range(NY):
    y = BOX[1] + (row + 0.5) * STEP
    xs = sorted(x1 + (y - y1) * (x2 - x1) / (y2 - y1) for x1, y1, x2, y2 in edges_by_row[row]
                if (y1 > y) != (y2 > y))
    for i in range(0, len(xs) - 1, 2):
        c0 = max(0, int((xs[i] - BOX[0]) / STEP))
        c1 = min(NX - 1, int((xs[i + 1] - BOX[0]) / STEP))
        for c in range(c0, c1 + 1):
            LAND[row][c] = True


def cell(lon, lat):
    return int((lat - BOX[1]) / STEP), int((lon - BOX[0]) / STEP)


def onland(lon, lat):
    r, c = cell(lon, lat)
    return 0 <= r < NY and 0 <= c < NX and LAND[r][c]


BUF = 3   # клетки ≈ 5 км запаса от берега
SEA = [[not any(LAND[rr][cc] for rr in range(max(0, r - BUF), min(NY, r + BUF + 1))
                for cc in range(max(0, c - BUF), min(NX, c + BUF + 1)))
        for c in range(NX)] for r in range(NY)]


def km_cells(r1, c1, r2, c2):
    return hav((BOX[0] + (c1 + .5) * STEP, BOX[1] + (r1 + .5) * STEP), (BOX[0] + (c2 + .5) * STEP, BOX[1] + (r2 + .5) * STEP))


def nearest_sea(lon, lat):
    r0, c0 = cell(lon, lat)
    best = None
    for rad in range(1, 200):
        for r in range(r0 - rad, r0 + rad + 1):
            for c in (c0 - rad, c0 + rad) if abs(r - r0) != rad else range(c0 - rad, c0 + rad + 1):
                if 0 <= r < NY and 0 <= c < NX and SEA[r][c]:
                    d = km_cells(r0, c0, r, c)
                    if best is None or d < best[0]:
                        best = (d, r, c)
        if best:
            return best


import heapq


def sea_route(a, b):
    da, ra, ca = nearest_sea(*a)
    db, rb, cb = nearest_sea(*b)
    dist_ = {(ra, ca): 0.0}
    pq = [(0.0, ra, ca)]
    while pq:
        d, r, c = heapq.heappop(pq)
        if (r, c) == (rb, cb):
            return d, da, db
        if d > dist_.get((r, c), 1e18):
            continue
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if (dr or dc) and 0 <= rr < NY and 0 <= cc < NX and SEA[rr][cc]:
                    nd = d + km_cells(r, c, rr, cc)
                    if nd < dist_.get((rr, cc), 1e18):
                        dist_[(rr, cc)] = nd
                        heapq.heappush(pq, (nd, rr, cc))
    return None, da, db


for a, b, verse in (('Seleucia', 'Salamis', 'Деян 13:4'), ('Paphos', 'Perga', 'Деян 13:13'),
                    ('Attalia', 'Antioch 1', 'Деян 14:26')):
    A, B = P(a), P(b)
    n = 400
    total = hav(A, B)
    land_km, runs, cur = 0, [], None
    for i in range(n + 1):
        t = i / n
        L = onland(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t)
        if L and cur is None:
            cur = t
        if not L and cur is not None:
            runs.append((cur, t))
            cur = None
    if cur is not None:
        runs.append((cur, 1))
    longest = max([(e - s) * total for s, e in runs] or [0])
    route, da, db = sea_route(A, B)
    print(f'[{verse}] {a} → {b}: прямая {total:.0f} км, по суше {sum((e - s) * total for s, e in runs):.0f} км '
          f'(самый длинный участок {longest:.0f} км); путь по воде с запасом ≈ 5 км от берега — '
          f'{route:.0f} км; от {a} до воды {da:.0f} км, от воды до {b} {db:.0f} км')
