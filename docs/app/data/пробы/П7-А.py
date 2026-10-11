"""Проба П7, вариант А (11 § 12.2; В-32): наши истории против внешних делений и лиц.

    python3 -I docs/app/data/пробы/П7-А.py            отчёт в stdout
    python3 -I docs/app/data/пробы/П7-А.py --json     числа в JSON (docs/app/data/пробы/П7-А-числа.json)
    … --base <папка>    stories.json и actors/ из выгрузки коммита (git archive <коммит> base | tar -x -C <папка>)
    … --p7 [--json]     главы жребия, размеченные вслепую (data/stories/06-p7-zhrebiy.json), лица по протоколу v2 (П7-2);
                        JSON — П7-А-жребий-числа.json
    … --rows            расхождения лиц по эпизодам; --suggest — предложить сопоставление новых лиц

Входы (скачаны с разрешения владельца, только для сверки, в продукт не идут; реестр base/sources.json):
    inputs/eusebius/adamb924/data/{MAT,MRK,LUK,JHN}-sections-aligned.txt   разделы Аммония — Евсевия
    inputs/oshb/repo/wlc/*.xml                                             פ / ס (seg x-pe, x-samekh), OSHB
    inputs/theographic/repo/CSV/{Events,People}.csv                        события и лица Theographic
Наши данные: base/stories.json, base/actors/*.json, base/versification/synodal-kjv.json, tools/bible/synodal.tsv.

Правила, записанные до замера (отчёт docs/app/reviews/П7-вариант-А-отчёт.md, § 2):
  1. Главы-примеры — все главы, на которые ссылается docs/app/11-ИСТОРИИ.md (весь документ с приложением Е,
     то есть и протокол И0). Ссылка «Кн 5:3» исключает главу 5; «Кн 1–4» — главы 1–4; «Кн 2:1 – 3:6» — главы 2–3.
  2. Жребий — random.Random(ЗЕРНО) внутри каждого вида; виды и их книги — POOLS ниже; глава отрывка не должна
     быть главой-примером.
  3. Начало истории — первый стих каждого рассказа (`accounts[].refs[0]`) истории уровня story.
     Начало «на границе» — если в пределах ±1 стиха (в порядке стихов книги) есть начало раздела Евсевия
     (Евангелия) или начало абзаца פ / ס (Ветхий Завет; начало книги — тоже начало абзаца).
  4. Лица: эпизод — наша история, у которой начало одного из рассказов совпадает (±1 стих) с началом отрезка
     события Theographic в той же книге. Пары «эпизод — лицо»: у нас — лица-одиночки (без kind group, people,
     animal), у Theographic — `participants`. Сопоставление лица — по таблице П7-А-имена.json (имя базы → personLookup),
     которую скрипт предлагает по стихам и форме имени, а человек проверяет; главная мера — F1 пар.
"""
import csv
import glob
import json
import os
import random
import re
import sys
import unicodedata
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
# --base <папка>: взять stories.json и actors/ из другой копии base/ (например, выгрузки коммита: git archive)
BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else P('base')
ЗЕРНО = 20261011

# ---------------------------------------------------------------- текст и книги
TEXT = []  # (книга, глава, стих)
for line in open(P('tools/bible/synodal.tsv'), encoding='utf-8'):
    b, c, v, *_ = line.rstrip('\n').split('\t')
    TEXT.append((b, int(c), int(v)))
ORDER = []
for b, _, _ in TEXT:
    if not ORDER or ORDER[-1] != b:
        ORDER.append(b)
CHLEN = defaultdict(int)
for b, c, v in TEXT:
    CHLEN[(b, c)] = max(CHLEN[(b, c)], v)
POS = {t: i for i, t in enumerate(TEXT)}  # сквозной номер стиха

OSIS_OT = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra',
           'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad',
           'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal']
NT_SYN = ['Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Иак', '1Пет', '2Пет', '1Ин', '2Ин', '3Ин', 'Иуд', 'Рим', '1Кор', '2Кор', 'Гал', 'Еф',
          'Флп', 'Кол', '1Фес', '2Фес', '1Тим', '2Тим', 'Тит', 'Флм', 'Евр', 'Откр']
NT_OSIS = ['Matt', 'Mark', 'Luke', 'John', 'Acts', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rom', '1Cor', '2Cor',
           'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Rev']
SYN2OSIS = dict(zip(ORDER[:39], OSIS_OT)) | dict(zip(NT_SYN, NT_OSIS))
OSIS2SYN = {o: s for s, o in SYN2OSIS.items()}

VMAP = json.load(open(P('base/versification/synodal-kjv.json'), encoding='utf-8'))['map']
KJV2SYN = defaultdict(list)
for syn, ks in VMAP.items():
    for k in ks:
        KJV2SYN[k.split('!')[0]].append(syn)


def syn_str(t):
    return f'{t[0]} {t[1]}:{t[2]}'


def parse_v(s):
    m = re.match(r'^(\S+) (\d+):(\d+)', s)
    return (m[1], int(m[2]), int(m[3])) if m else None


def syn2kjv(t):
    s = syn_str(t)
    if s in VMAP:
        return [k.split('!')[0] for k in VMAP[s] if k != 'NONE']
    return [f'{SYN2OSIS[t[0]]}.{t[1]}.{t[2]}']


def kjv2syn(osis):
    """KJV/английская нумерация (Gen.1.1) → синодальные стихи."""
    if osis in KJV2SYN:
        return [parse_v(s) for s in KJV2SYN[osis]]
    b, c, v = osis.split('.')
    if b not in OSIS2SYN:
        return []
    t = (OSIS2SYN[b], int(c), int(v))
    # стих, у которого синодальный номер занят другим отображением, — не тождествен
    if syn_str(t) in VMAP and osis not in VMAP[syn_str(t)]:
        return []
    return [t] if t in POS else []


# ---------------------------------------------------------------- 1. главы-примеры документа 11
BOOKRX = '|'.join(sorted({re.escape(b) for b in ORDER} | {re.escape(b[0] + ' ' + b[1:]) for b in ORDER if b[0].isdigit()},
                         key=len, reverse=True))
REF = re.compile(rf'(?<![А-Яа-яЁё])({BOOKRX})\.?\s+(\d+)(?::(\d+))?((?:\s*[–—-]\s*\d+(?::\d+)?)?)')
CONT = re.compile(r'^\s*[;,]\s*(\d+):(\d+)((?:\s*[–—-]\s*\d+(?::\d+)?)?)')


def chapters_in(text):
    out = set()
    for m in REF.finditer(text):
        book = m[1].replace(' ', '')
        if book not in ORDER:
            continue
        c1 = int(m[2])
        has_v = m[3] is not None
        rng = m[4]
        chs = {c1}
        if rng:
            r = re.search(r'(\d+)(?::(\d+))?', rng)
            c2 = int(r[1])
            if r[2] is not None:  # «2:1 – 3:6»
                chs |= set(range(c1, c2 + 1))
            elif not has_v:  # «1–4» — главы
                chs |= set(range(c1, c2 + 1))
        # продолжение «; 3:5» без названия книги
        rest = text[m.end():]
        while True:
            k = CONT.match(rest)
            if not k:
                break
            chs.add(int(k[1]))
            if k[3]:
                r = re.search(r'(\d+)(?::(\d+))?', k[3])
                if r[2] is not None:
                    chs |= set(range(int(k[1]), int(r[1]) + 1))
            rest = rest[k.end():]
        for c in chs:
            if (book, c) in CHLEN:
                out.add((book, c))
    return out


DOC11 = open(P('docs/app/11-ИСТОРИИ.md'), encoding='utf-8').read()
EXAMPLES = chapters_in(DOC11)

# ---------------------------------------------------------------- 2. жребий
# Виды § 12.2 и книги, в которых их тянет жребий (запись до замера; отчёт § 2). n — глав подряд.
POOLS = [
    ('рассказ Ветхого Завета', ['Быт', 'Исх', 'Чис', 'Нав', 'Суд', 'Руф', '1Цар', '2Цар', '3Цар', '4Цар', 'Езд', 'Неем', 'Есф'], 3),
    ('шаги-круги', [('Суд', 3, 16), ('Чис', 11, 25), ('4Цар', 1, 8)], 2),
    ('видения', [('Иез', 1, 48), ('Дан', 7, 12), ('Ам', 7, 9), ('Зах', 1, 6), ('Откр', 1, 22)], 2),
    ('родословие', [('1Пар', 1, 9), ('Езд', 2, 2), ('Неем', 7, 7), ('Неем', 11, 12), ('Быт', 36, 36), ('Быт', 46, 46)], 1),
    ('рассказ мудреца', ['Притч', 'Еккл'], 1),
    ('Евангелие', ['Мф', 'Мк', 'Лк', 'Ин'], 2),
    ('Деяния', ['Деян'], 2),
]


def pool_chapters(spec):
    out = []
    for x in spec:
        if isinstance(x, str):
            out += sorted({(b, c) for b, c, _ in TEXT if b == x}, key=lambda t: t[1])
        else:
            b, a, z = x
            out += [(b, c) for c in range(a, z + 1)]
    return out


def draw():
    rnd = random.Random(ЗЕРНО)
    picks = []
    for kind, spec, n in POOLS:
        chs = pool_chapters(spec)
        starts = [i for i in range(len(chs) - n + 1)
                  if all(chs[i + j][0] == chs[i][0] and chs[i + j][1] == chs[i][1] + j and chs[i + j] not in EXAMPLES for j in range(n))]
        i = rnd.choice(starts)
        picks.append((kind, chs[i:i + n], len(starts)))
    return picks


PICKS = draw()

# ---------------------------------------------------------------- наши истории
ST = json.load(open(os.path.join(BASE, 'stories.json'), encoding='utf-8'))['items']
STORIES = [s for s in ST if s['level'] == 'story']
STARTS = []  # (история, стих начала рассказа)
for s in STORIES:
    for a in s.get('accounts', []):
        if a.get('refs'):
            t = parse_v(a['refs'][0])
            if t:
                STARTS.append((s['id'], t))
STORY_CH = {(t[0], t[1]) for _, t in STARTS}


def near(t, S, tol=1):
    """Есть ли в S стих в пределах ±tol (по порядку стихов книги)."""
    i = POS.get(t)
    if i is None:
        return False
    for d in range(-tol, tol + 1):
        j = i + d
        if 0 <= j < len(TEXT) and TEXT[j][0] == t[0] and TEXT[j] in S:
            return True
    return False


# ---------------------------------------------------------------- 3. внешние границы
def eusebius():
    out = set()
    raw = []
    for code, b in (('MAT', 'Мф'), ('MRK', 'Мк'), ('LUK', 'Лк'), ('JHN', 'Ин')):
        for line in open(P(f'inputs/eusebius/adamb924/data/{code}-sections-aligned.txt'), encoding='utf-8'):
            f = line.rstrip('\n').split('\t')
            if len(f) < 4 or not f[0].strip().isdigit():
                continue
            m = re.match(r'\w+ (\d+):(\d+)', f[3])
            k = f'{SYN2OSIS[b]}.{m[1]}.{m[2]}'
            ts = kjv2syn(k)
            raw.append((b, int(f[0]), k, ts))
            out |= set(ts)
    return out, raw


def masoretic():
    """Начала абзацев פ / ס: стих после стиха с маркой; марка внутри стиха — сам стих. Нумерация OSHB (еврейская)."""
    starts = {}  # OSIS-книга → множество (глава, стих) в нумерации OSHB
    lens = {}
    for b in OSIS_OT:
        x = open(P(f'inputs/oshb/repo/wlc/{b}.xml'), encoding='utf-8').read()
        vs = list(re.finditer(r'<verse osisID="[^.]+\.(\d+)\.(\d+)"[^>]*>(.*?)</verse>', x, re.S))
        S = {(int(vs[0][1]), int(vs[0][2]))}
        for i, m in enumerate(vs):
            c, v, body = int(m[1]), int(m[2]), m[3]
            lens[(b, c)] = max(lens.get((b, c), 0), v)
            for mk in re.finditer(r'<seg type="x-(pe|samekh)">', body):
                tail = re.sub(r'<[^>]+>|\s', '', body[mk.end():])
                tail = re.sub(r'[פס׃]', '', tail)
                if tail:  # марка посреди стиха
                    S.add((c, v))
                elif i + 1 < len(vs):
                    S.add((int(vs[i + 1][1]), int(vs[i + 1][2])))
        starts[b] = S
    return starts, lens


# ---------------------------------------------------------------- 4. Theographic
def theographic():
    ev = list(csv.DictReader(open(P('inputs/theographic/repo/CSV/Events.csv'), encoding='utf-8-sig')))
    pe = {p['personLookup']: p for p in csv.DictReader(open(P('inputs/theographic/repo/CSV/People.csv'), encoding='utf-8-sig'))}
    return ev, pe


def segments(osis_list):
    """Отрезки события по книгам: [(книга, [синодальные стихи по порядку])]; стихи подряд — один отрезок."""
    syn = []
    for k in osis_list:
        syn += kjv2syn(k)
    syn = sorted(set(syn), key=lambda t: POS[t])
    segs = []
    for t in syn:
        if segs and segs[-1][-1][0] == t[0] and POS[t] - POS[segs[-1][-1]] <= 1:
            segs[-1].append(t)
        else:
            segs.append([t])
    return segs


# ---------------------------------------------------------------- лица базы
ACT = {}
for f in sorted(glob.glob(os.path.join(BASE, 'actors', '*.json'))):
    for it in json.load(open(f, encoding='utf-8'))['items']:
        ACT.setdefault(it['id'], it)

TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
              ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts',
               'ch', 'sh', 'shch', '', 'y', '', 'e', 'iu', 'ia']))


def translit(s):
    return ''.join(TR.get(ch, ch) for ch in s.lower())


def skel(s):
    """Скелет имени для сравнения русской и английской формы: без гласных и удвоений."""
    s = unicodedata.normalize('NFD', s.lower())
    s = re.sub(r'[^a-z]', '', s)
    s = s.replace('kh', 'h').replace('ph', 'f').replace('th', 't').replace('ch', 'h').replace('sh', 's').replace('zh', 'z')
    s = s.replace('j', 'i').replace('y', 'i').replace('w', 'v').replace('c', 'k').replace('q', 'k').replace('x', 'ks')
    s = re.sub(r'[aeiouh]', '', s)
    return re.sub(r'(.)\1+', r'\1', s)


def forms(actor_id, label=None):
    it = ACT.get(actor_id)
    out = [n['form'] for n in it.get('names', [])] if it else []
    if label:
        out.append(label)
    return out


def all_refs(it):
    """Все стихи записи базы (имена, факты) — синодальные."""
    out = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == 'refs' and isinstance(v, list):
                    for r in v:
                        m = re.match(r'^(\S+) (\d+):(\d+)(?:-(\d+))?$', r)
                        if m:
                            for vv in range(int(m[3]), int(m[4] or m[3]) + 1):
                                out.add((m[1], int(m[2]), vv))
                else:
                    walk(v)
        elif isinstance(x, list):
            for y in x:
                walk(y)
    walk(it)
    return out


def main():
    as_json = '--json' in sys.argv
    R = {}
    print('== 1. Главы-примеры документа 11 ==')
    print('глав, на которые ссылается документ 11 (с приложением Е):', len(EXAMPLES))
    pkg = sorted(STORY_CH, key=lambda t: (ORDER.index(t[0]), t[1]))
    pkg_ex = [t for t in pkg if t in EXAMPLES]
    print('глав, где у нас начинается рассказ истории:', len(pkg), '; из них главы-примеры:', len(pkg_ex))
    print('  вне примеров:', ', '.join(f'{b} {c}' for b, c in pkg if (b, c) not in EXAMPLES))
    R['examples'] = len(EXAMPLES)

    print('\n== 2. Жребий (зерно', ЗЕРНО, ') ==')
    picked = []
    for kind, chs, n in PICKS:
        ours = [s for s in STARTS if (s[1][0], s[1][1]) in set(chs)]
        print(f'  {kind}: {chs[0][0]} {chs[0][1]}' + (f'–{chs[-1][1]}' if len(chs) > 1 else '') +
              f'  (вариантов {n}; наших начал историй: {len(ours)})')
        picked.append({'kind': kind, 'chapters': [f'{b} {c}' for b, c in chs], 'options': n, 'ourStarts': len(ours)})
    R['lottery'] = picked

    # ---- выборки начал
    out_ex = [(sid, t) for sid, t in STARTS if (t[0], t[1]) not in EXAMPLES]
    print('\nначал рассказов всего:', len(STARTS), '; в главах-примерах:', len(STARTS) - len(out_ex), '; вне примеров:', len(out_ex))

    # ---- 3. границы
    print('\n== 3. Границы ==')
    eus, eus_raw = eusebius()
    mas, hlen = masoretic()
    # синодальная ↔ еврейская нумерация глав, где стоят наши начала: сверка числа стихов
    diff = []
    for b, c in sorted({(t[0], t[1]) for _, t in STARTS if ORDER.index(t[0]) < 39}, key=lambda t: (ORDER.index(t[0]), t[1])):
        o = SYN2OSIS[b]
        if hlen.get((o, c)) != CHLEN[(b, c)]:
            diff.append(f'{b} {c}: синод. {CHLEN[(b, c)]}, OSHB {hlen.get((o, c))}')
    print('главы ВЗ с нашими началами, где число стихов в OSHB иное:', diff or 'нет')
    MAS = set()
    for o, S in mas.items():
        b = OSIS2SYN[o]
        for c, v in S:
            if (b, c, v) in POS:
                MAS.add((b, c, v))
    print('разделов Евсевия (стихов начала):', len(eus), '; у Марка:', len([t for t in eus if t[0] == 'Мк']),
          '; начал абзацев פ / ס в ВЗ:', len(MAS))

    def measure(starts, label):
        rows = []
        for sid, t in starts:
            if t[0] in ('Мф', 'Мк', 'Лк', 'Ин'):
                rows.append((sid, t, 'Евсевий', near(t, eus), near(t, eus, 0)))
            elif ORDER.index(t[0]) < 39:
                rows.append((sid, t, 'פ/ס', near(t, MAS), near(t, MAS, 0)))
            else:
                rows.append((sid, t, 'нет меры', None, None))
        res = {}
        for what in ('Евсевий', 'פ/ס'):
            xs = [r for r in rows if r[2] == what]
            hit = sum(1 for r in xs if r[3])
            ex = sum(1 for r in xs if r[4])
            res[what] = {'n': len(xs), 'hit': hit, 'exact': ex, 'share': round(hit / len(xs), 3) if xs else None}
            print(f'  [{label}] {what}: начал {len(xs)}, на границе ±1 — {hit}' + (f' ({hit / len(xs):.2f})' if xs else '') +
                  f', точно — {ex}')
        nm = [r for r in rows if r[2] == 'нет меры']
        print(f'  [{label}] без внешней меры (Деян, послания): {len(nm)}')
        res['none'] = len(nm)
        res['misses'] = [f'{syn_str(r[1])} {r[0]} ({r[2]})' for r in rows if r[3] is False]
        return res

    R['bounds_all'] = measure(STARTS, 'все начала, справочно')
    R['bounds_out'] = measure(out_ex, 'вне примеров — мера')
    print('  несовпадения вне примеров:')
    for x in R['bounds_out']['misses']:
        print('    ', x)
    print('  несовпадения в главах-примерах (справочно):')
    for x in R['bounds_all']['misses']:
        if x not in R['bounds_out']['misses']:
            print('    ', x)

    # ---- 4. лица
    print('\n== 4. Лица (Theographic) ==')
    ev, pe = theographic()
    print('событий Theographic:', len(ev), '; лиц:', len(pe))
    evseg = []
    for e in ev:
        for seg in segments([x for x in e['verses'].split(',') if x]):
            evseg.append((e, seg[0]))
    names_tab = json.load(open(P('docs/app/data/пробы/П7-А-имена.json'), encoding='utf-8')) if os.path.exists(
        P('docs/app/data/пробы/П7-А-имена.json')) else {'map': {}}
    NAMEMAP = names_tab['map']
    SKIP = {'group', 'people', 'animal'}
    by_story = {s['id']: s for s in STORIES}
    episodes = []
    for sid in dict.fromkeys(x[0] for x in STARTS):
        s = by_story[sid]
        my_starts = [t for i, t in STARTS if i == sid]
        evs = {}
        for e, t0 in evseg:
            if any(near(t, {t0}) for t in my_starts):
                evs[e['eventID']] = e
        if not evs:
            continue
        ours = {}
        ment = set()
        v2 = {}
        for a in s.get('actors', []):
            if a.get('kind') in SKIP:
                continue
            ours[a['actor']] = a.get('label') or (forms(a['actor']) or [a['actor']])[0]
            rs = {a.get('role')} | {x.get('role') for x in a.get('roles', []) if isinstance(x, dict)}
            if rs - {None} == {'mentioned'}:
                ment.add(a['actor'])
            # протокол v2 (очередь спорных мест, П7-2): только «действует» и «с ним происходит», без Бога и групп
            if a['actor'] != 'god' and a.get('kind') not in ('group', 'people') and rs & {'agent', 'undergoer'}:
                v2[a['actor']] = a.get('label') or (forms(a['actor']) or [a['actor']])[0]
        theirs = set()
        for e in evs.values():
            theirs |= {x for x in e['participants'].split(',') if x}
        inex = all((t[0], t[1]) in EXAMPLES for t in my_starts)
        episodes.append({'story': sid, 'events': [f"{e['eventID']} {e['title']}" for e in evs.values()], 'ours': ours,
                         'theirs': sorted(theirs), 'examplesOnly': inex, 'mentionedOnly': sorted(ment), 'v2': v2})
    # предложение сопоставления: по всем стихам Theographic (не только участникам эпизода) и скелету имени
    vidx = defaultdict(set)
    for pid, p in pe.items():
        for k in p['verses'].split(','):
            if k:
                vidx[k].add(pid)
    sugg = {}
    for ep in episodes:
        s = by_story[ep['story']]
        for a in s.get('actors', []):
            aid = a['actor']
            if (aid not in ep['ours'] and aid not in ep['v2']) or aid in NAMEMAP or aid in sugg:
                continue
            lab = ep['ours'].get(aid) or ep['v2'][aid]
            it = ACT.get(aid)
            mine = set()
            for t in (all_refs(it) if it else set()) | all_refs({'refs': a.get('refs', [])}):
                mine |= set(syn2kjv(t))
            cnt = defaultdict(int)
            for k in mine:
                for pid in vidx.get(k, ()):
                    cnt[pid] += 1
            sk = {skel(translit(f)) for f in forms(aid, lab)}
            best = None
            for pid, ov in cnt.items():
                p = pe[pid]
                ns = 1 if any(skel(n) in sk for n in [p['name']] + p['alsoCalled'].split(',') if n) else 0
                sc = ns * 1000 + ov
                if best is None or sc > best[0]:
                    best = (sc, pid, ov, ns)
            sugg[aid] = {'label': lab, 'suggest': best[1] if best else '-', 'verses': best[2] if best else 0,
                         'name': best[3] if best else 0, 'of': len(mine)}
    print('эпизодов с общим началом (±1):', len(episodes), '; из них только в главах-примерах:',
          sum(1 for e in episodes if e['examplesOnly']))
    if sugg:
        print('  предложено сопоставлений (нет в таблице имён):', len(sugg))
        for k, v in sugg.items():
            print('    ', k, v)
        if '--suggest' in sys.argv:
            json.dump({k: v['suggest'] for k, v in sugg.items()}, open(P('docs/app/data/пробы/П7-А-имена-предложение.json'), 'w',
                      encoding='utf-8'), ensure_ascii=False, indent=1)

    def f1(eps, label):
        tp = fp = fn = 0
        rows = []
        for ep in eps:
            # «-» — у Theographic такого лица нет: пара остаётся нашей (ложноположительной для Theographic)
            mine = {(a if NAMEMAP.get(a, a) == '-' else NAMEMAP.get(a, a)) for a in ep['ours']}
            th = set(ep['theirs'])
            tp += len(mine & th)
            fp += len(mine - th)
            fn += len(th - mine)
            rows.append((ep['story'], sorted(mine - th), sorted(th - mine)))
        p = tp / (tp + fp) if tp + fp else float('nan')
        r = tp / (tp + fn) if tp + fn else float('nan')
        f = 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else float('nan')
        print(f'  [{label}] эпизодов {len(eps)}; пар: общих {tp}, только у нас {fp}, только у Theographic {fn}; '
              f'точность {p:.2f}, полнота {r:.2f}, F1 {f:.2f}')
        return {'episodes': len(eps), 'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(p, 3), 'recall': round(r, 3),
                'f1': round(f, 3), 'rows': rows}

    R['persons_all'] = f1(episodes, 'все эпизоды, справочно')
    R['persons_out'] = f1([e for e in episodes if not e['examplesOnly']], 'вне примеров — мера')
    noment = [dict(e, ours={k: v for k, v in e['ours'].items() if k not in e['mentionedOnly']}) for e in episodes]
    R['persons_out_nomention'] = f1([e for e in noment if not e['examplesOnly']], 'вне примеров, без лиц только с ролью «упомянут», справочно')
    R['episodes'] = episodes
    if '--rows' in sys.argv:
        for st, a, b in R['persons_all']['rows']:
            print('    ', st, '| только у нас:', a, '| только у Theographic:', b)

    if '--p7' in sys.argv:
        # ---- 5. главы жребия, размеченные вслепую (data/stories/06-p7-zhrebiy.json; протокол v2 — П7-2)
        V = {}
        ids = {x['id'] for x in json.load(open(P('data/stories/06-p7-zhrebiy.json'), encoding='utf-8'))['stories']}
        print('\n== 5. Главы жребия (v2) ==')
        sel = [(i, t) for i, t in STARTS if i in ids]
        print('историй жребия:', len(ids), '; уровня story в базе:', len({i for i in ids if i in by_story}), '; начал рассказов:', len(sel))
        V['bounds'] = measure(sel, 'жребий — мера')
        print('  несовпадения:')
        for x in V['bounds']['misses']:
            print('    ', x)
        eps = [e for e in episodes if e['story'] in ids]
        print('эпизодов с общим началом (±1):', len(eps), 'из', len({i for i, _ in sel}), 'историй с началом')
        V['persons_v2'] = f1([dict(e, ours=e['v2']) for e in eps], 'жребий, лица по v2 — мера')
        V['persons_v1'] = f1(eps, 'жребий, лица по v1 — справочно')
        V['episodes'] = [{k: e[k] for k in ('story', 'events', 'theirs', 'v2', 'ours')} for e in eps]
        for (st, a, b), (_, a1, b1) in zip(V['persons_v2']['rows'], V['persons_v1']['rows']):
            print('    ', st, '| v2 только у нас:', a, '| только у Theographic:', b, '| v1 только у нас:', a1)
        if as_json:
            json.dump(V, open(P('docs/app/data/пробы/П7-А-жребий-числа.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    elif as_json:
        json.dump(R, open(P('docs/app/data/пробы/П7-А-числа.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
