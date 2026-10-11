"""Пробный справочник мест пакета 2 (10 § 4.2.0, § 4.2.3; 05 § 12; 02 § 3.13).

Запуск из корня репозитория:
    python3 -I tools/places/pilot.py            # пишет base/places.json, base/place-mentions.json, base/routes.json
    python3 -I tools/places/pilot.py --check    # только считает и сверяет с файлами на диске

Вход:
  inputs/openbible/ancient.jsonl, modern.jsonl — OpenBible Bible Geocoding Data, коммит 7eb18a5 (src-openbible-geo,
      CC BY 4.0); записи мест, чьи стихи стоят в главах пробного справочника: Быт 11–25; Исх 12–15; Чис 21; 33;
      Нав 13; 15; Деян 13–14 (как в docs/app/data/10-числа.py);
  data/places/pilot-places.tsv — запись сводки → номер места, синодальное имя, вид, образец формы в стихе, пометки;
  data/places/pilot-name-rules.tsv — какие формы стиха — какое имя места и вид имени;
  data/places/pilot-routes.json — пути Аврама и Исхода (05 § 3.5): стоянки со стихами и словами перехода;
  tools/bible/synodal.tsv, tools/bible/brackets.tsv — текст и скобки: форма ищется только среди слов-оснований
      (вне скобок и в скобках вида «б», «г», сверенных с подлинником; 02 § 3.8).

Правила (05 § 3.3; 02 § 3.13): степень — только вычисление по порогам 800 / 500 / 300 из оценки сводки по цепочке;
источник координат — у каждой точки свой, номер реестра (Р-10); не-имя — не место (правило 0а); тождество — только
словами стиха («иначе», «который есть», «что ныне», «прежде было»): такие записи сводки сливаются в место как имена;
мнение сводки «another name for X» — указатель match.otherNameOf, «in X» — связь part-of, «within N km» — near.
Подписи (второй ключ) скрипт не ставит.
"""
import collections
import json
import math
import re
import sys

ROOT = '.'
AT = '2026-10-12'
BY = 'составитель мест (пакет 2)'
CHECK = '--check' in sys.argv
BK = {'Gen': 'Быт', 'Exod': 'Исх', 'Num': 'Чис', 'Josh': 'Нав', 'Acts': 'Деян'}
BOOK_ORDER = ['Быт', 'Исх', 'Чис', 'Втор', 'Нав', '4Цар', '1Пар', '2Пар', 'Иез', 'Деян']
ch = lambda a, b: ((a, 1), (b, 999))
TRIAL = {'Gen': [ch(11, 25)], 'Exod': [ch(12, 15)], 'Num': [ch(21, 21), ch(33, 33)], 'Josh': [ch(13, 13), ch(15, 15)], 'Acts': [ch(13, 14)]}

# ---------------------------------------------------------------- текст и слова-основания
TEXT = {}
for line in open(f'{ROOT}/tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t
NT = {'Мф', 'Мк', 'Лк', 'Ин', 'Деян'}
BR = collections.defaultdict(list)
_head = None
for line in open(f'{ROOT}/tools/bible/brackets.tsv', encoding='utf-8'):
    x = line.rstrip('\n').split('\t')
    if _head is None:
        _head = {n: i for i, n in enumerate(x)}
        continue
    book, chn, fr, to = x[_head['книга']], int(x[_head['глава']]), int(x[_head['стих']]), int(x[_head['по стих']])
    kind, by = x[_head['вид']], x[_head['чем проверено']]
    original = re.search(r'\bTR\b' if book in NT else r'\bWLC\b', by) is not None
    parts = [p.strip() for p in x[_head['текст']].split('¦')]
    for i, v in enumerate(range(fr, to + 1)):
        BR[(book, chn, v)].append((parts[i] if i < len(parts) else '', kind in ('gloss', 'damage') and original))


def basis(key):
    """Слова стиха, на которые можно опираться: вне скобок и в скобках вида «б»/«г» по таблице."""
    t = TEXT.get(key, '')

    def repl(m):
        g = m.group(0)
        inner = g[1:-1] if g[-1] in '])' else g[1:]
        ok = any(txt.strip(' ,.;:') == inner.strip(' ,.;:') and b for txt, b in BR.get(key, []))
        return ' ' + inner + ' ' if ok else ' '
    t = re.sub(r'\[[^\]]*\]?', repl, t)
    t = re.sub(r'\([^)]*\)?', repl, t)
    return re.sub(r'\s+', ' ', t)


def rkey(ref):
    b, cv = ref.rsplit(' ', 1)
    c, v = cv.split(':')
    return (b, int(c), int(v))


def rstr(key):
    return f'{key[0]} {key[1]}:{key[2]}'


def order(key):
    return (BOOK_ORDER.index(key[0]), key[1], key[2])


def pat(p, full=False):
    p = p.replace('-', '(?:-|—)\\s?')
    if full:
        return re.compile(r'^(?:' + p + r')$')
    return re.compile(r'(?<![\w—-])(?:' + p + r')(?![\w—-])')


# ---------------------------------------------------------------- таблицы составителя
DICT = {}
for line in open(f'{ROOT}/data/places/pilot-places.tsv', encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    f = line.rstrip('\n').split('\t')
    flags = f[5] if len(f) > 5 else ''
    DICT[f[0]] = {'id': f[1], 'lemma': f[2], 'kind': f[3], 'pat': pat(f[4]), 'flags': flags,
                  'notname': flags.startswith('не имя'),
                  'merge': next((x.split(':')[1:] for x in flags.split(';') if x.strip().startswith('слить:')), None),
                  'extra': [x.strip()[4:] for x in flags.split(';') if x.strip().startswith('доп:')],
                  'target': [x.strip()[5:] for x in flags.split(';') if x.strip().startswith('цель:')],
                  'note': flags}
RULES = collections.defaultdict(list)
for line in open(f'{ROOT}/data/places/pilot-name-rules.tsv', encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    f = line.rstrip('\n').split('\t')
    tb = dict(x.split('=') for x in f[4].split(';')) if len(f) > 4 and f[4] else {}
    RULES[f[0]].append((pat(f[1], True), f[2], f[3], tb))

# ---------------------------------------------------------------- OpenBible
rows = []
for line in open(f'{ROOT}/inputs/openbible/ancient.jsonl', encoding='utf-8'):
    d = json.loads(line)
    ex = json.loads(d.get('extra') or '{}')
    hits = []
    for o in ex.get('osises', []):
        p = o.split('.')
        if len(p) >= 3 and p[0] in TRIAL and p[1].isdigit() and p[2].isdigit():
            c, v = int(p[1]), int(p[2])
            if any(lo <= (c, v) <= hi for lo, hi in TRIAL[p[0]]):
                hits.append((BK[p[0]], c, v))
    if hits:
        d['_hits'] = hits
        rows.append(d)
MOD = {}
for line in open(f'{ROOT}/inputs/openbible/modern.jsonl', encoding='utf-8'):
    r = json.loads(line)
    MOD[r['id']] = r
BYID = {}
for line in open(f'{ROOT}/inputs/openbible/ancient.jsonl', encoding='utf-8'):
    d = json.loads(line)
    BYID[d['id']] = d
assert len(rows) == 344, len(rows)
PILOT = len(rows)
# цели связей сводки вне глав справочника: свои стихи из таблицы составителя
for name, d in DICT.items():
    if d['target']:
        r = next(x for x in BYID.values() if x['friendly_id'] == name)
        r['_hits'] = [rkey(x) for x in d['target']]
        rows.append(r)
# свои места составителя (строка «+имя» с пометкой «своё:стих»): места, которых нет в сводке (рецензия географа, Г-6)
for name, d in DICT.items():
    own = [x.strip()[5:] for x in d['flags'].split(';') if x.strip().startswith('своё:')]
    if name.startswith('+'):
        r = {'id': 'own:' + name[1:], 'friendly_id': name, 'identifications': [], 'modern_associations': {}, '_hits': [rkey(x) for x in own], '_own': True}
        BYID[r['id']] = r
        rows.append(r)
missing = [r['friendly_id'] for r in rows if r['friendly_id'] not in DICT]
assert not missing, missing


def clean(s):
    return re.sub(r'<[^>]+>', '', s or '')


def ids_of(r):
    return sorted(r.get('identifications', []), key=lambda i: -i['score'].get('time_total', 0))


DEG = {'уверенно': 'certain', 'вероятно': 'probable', 'предположительно': 'possible', 'не установлено': 'unknown'}


def degree(r):
    """05 § 3.3: лучший итог с учётом цепочки (modern_associations.score); «место неизвестно» — не установлено."""
    ids = ids_of(r)
    if ids and ids[0].get('id_source') == 'special' and clean(ids[0]['description']).startswith(('unknown', 'not a')):
        return 'не установлено', 0
    ma = r.get('modern_associations') or {}
    s = max([v['score'] for v in ma.values()] or [0])
    d = 'уверенно' if s >= 800 else 'вероятно' if s >= 500 else 'предположительно' if s >= 300 else 'не установлено'
    return d, s


# точки — только у источников координат, которые в реестре и разрешают распространение (рецензия географа, § 5; М2-1)
REG = {x['id'] for x in json.load(open(f'{ROOT}/base/sources.json', encoding='utf-8'))['items'] if x.get('redistribute') is True}
held = collections.Counter()      # точки, не внесённые в base: источник координат не в реестре
best_all = collections.Counter()  # источник координат лучшей точки места — до допуска по реестру
all_pos = collections.Counter()
COORD = {'wikidata': 'src-wikidata', 'daahl': 'src-daahl', 'megajordan': 'src-mega-jordan', 'geonames': 'src-geonames',
         'iaa': 'src-iaa', 'osm': 'src-osm', 'palopenmaps': 'src-palopenmaps', 'pleiades': 'src-pleiades'}


def coord_source(m):
    cs = m.get('coordinates_source') or {}
    t = cs.get('type')
    if not t:
        return {'source': 'src-coord-unspecified'}
    src = COORD.get(t, 'src-coord-' + t.replace('_', '-'))
    out = {'source': src}
    if cs.get('id'):
        out['id'] = str(cs['id'])
    elif cs.get('url'):
        out['id'] = cs['url']
    return out


def precision(m):
    p = m.get('precision') or {}
    if not p.get('type'):
        return None
    out = {'kind': p['type']}
    if p.get('meters'):
        out['radiusM'] = p['meters']
    return out


# ---------------------------------------------------------------- упоминания по стихам
NOSHIFT = {'Egypt'}
# слово о людях («Содомляне», «Египтяне», «Киринеянин») — не имя места (рецензия географа, Г-1)
PEOPLE = re.compile(r'ян(е|ин|ина|ину|ам|ами|ах)?$', re.I)
people = []
found = collections.defaultdict(list)     # запись → [(ключ, начало, форма, стих сводки)]
unmatched, shifted = [], []
for r in rows:
    name = r['friendly_id']
    d = DICT[name]
    seen = set()
    for (b, c, v) in r['_hits']:
        hit = None
        for dv in ((0,) if name in NOSHIFT else (0, 1, -1)):
            key = (b, c, v + dv)
            if key in TEXT:
                ms = list(d['pat'].finditer(basis(key)))
                if ms:
                    hit = (key, ms, dv)
                    break
        if not hit:
            unmatched.append((name, rstr((b, c, v))))
            continue
        key, ms, dv = hit
        if key in seen:
            continue
        seen.add(key)
        if dv:
            shifted.append((name, rstr((b, c, v)), rstr(key)))
        for m in ms:
            if PEOPLE.search(m.group(0)):
                people.append((name, rstr(key), m.group(0)))
                continue
            found[name].append((key, m.start(), m.group(0), rstr((b, c, v)), None))
    for ex in d['extra']:
        ref, phrase, *how = ex.split('=')
        key = rkey(ref)
        t = basis(key)
        assert phrase in t, (name, ref, phrase)
        form = phrase.split(' ')[-1]
        found[name].append((key, t.index(phrase) + len(phrase) - len(form), form, ref, how[0] if how else None))
        unmatched[:] = [u for u in unmatched if u != (name, ref)]

MOTION = re.compile(r'\b(отправил\w*|отправившись|двинул\w*|двинувшись|пош[её]л|пошли|пришл?и?|пришел|пришедши|вышел|вышли|вывел\w*|поднял\w*|сош[её]л|сошли|сошедши|прош[её]л|прошли|проходили|проходя|пройдя|удалились|отплыли|отплыв|приплыли|прибыли|прибыв|возвратил\w*|возвратились|обратились|поворотили|вступили|шли|идти|бежал\w*|повел|обвел)\b', re.I)
STAY = re.compile(r'\b(расположил\w*|остановил\w*|жил\w*|поселил\w*|был\w*|умер\w*|похорон\w*|погребл\w*|станом|живущ\w*|царствовал)\b', re.I)


def role(text, start, form):
    before = text[:start].rstrip().split(' ')
    prev = before[-1].lower() if before and before[-1] else ''
    prev = prev.strip(',;:')
    if prev in ('же',) and len(before) > 1:
        prev = before[-2].lower()
    motion = bool(MOTION.search(text))
    if prev in ('из', 'от') and motion:
        return 'from'
    if prev in ('через', 'чрез', 'мимо') and motion:
        return 'via'
    loc = re.search(r'(е|и|ом|ем)$', form.split(' ')[0]) is not None
    if prev in ('в', 'во', 'на', 'при', 'у') and STAY.search(text) and (loc or prev in ('при', 'у')):
        return 'where'
    if prev in ('в', 'во', 'к', 'ко', 'до', 'на') and motion and not loc:
        return 'to'
    return 'mentioned'


# ---------------------------------------------------------------- места
target_of = {}          # запись сводки → номер места (с учётом слияния)
for r in rows:
    d = DICT[r['friendly_id']]
    if d['notname']:
        continue
    target_of[r['id']] = DICT[d['merge'][0]]['id'] if d['merge'] else d['id']
by_name = {r['friendly_id']: r for r in rows}

places = {}
notes = collections.defaultdict(list)
mentions_raw = []
for r in rows:
    name = r['friendly_id']
    d = DICT[name]
    if d['notname']:
        continue
    pid = target_of[r['id']]
    host = DICT[d['merge'][0]] if d['merge'] else d
    p = places.setdefault(pid, {'id': pid, 'kind': host['kind'], 'names': [], '_names': {}})
    if d['merge']:
        notes[pid].append(f'слита запись сводки {name} ({r["id"]}): тождество словами стиха — имя вида «{d["merge"][1]}»')
    for key, start, form, ob, how in found.get(name, []):
        rule = next(((lem, typ, tb) for rx, lem, typ, tb in RULES.get(name, []) if rx.match(form)), None)
        lem, typ, tb = rule if rule else (d['lemma'], d['merge'][1] if d['merge'] else 'main', {})
        if d['pat'].fullmatch(form) or rule:   # общее слово («среди моря») — упоминание без имени
            nm = p['_names'].setdefault(lem, {'form': lem, 'type': typ, 'refs': {}})
            nm['refs'].setdefault(rstr(key), tb.get(rstr(key), 'story'))
        mentions_raw.append({'key': key, 'start': start, 'form': form, 'place': pid, 'rec': name, 'ob': ob, 'how': how})

# положения, степень, связи — от записи-хозяина места
links_missing = []
for r in rows:
    d = DICT[r['friendly_id']]
    if d['notname'] or d['merge']:
        continue
    p = places[d['id']]
    if r.get('_own'):
        continue
    ma = r.get('modern_associations') or {}
    idents = r.get('identifications') or []
    pos = []
    for mid, a in sorted(ma.items(), key=lambda kv: -kv[1]['score']):
        m = MOD.get(mid)
        if not m or not m.get('lonlat'):
            continue
        lon, lat = map(float, m['lonlat'].split(','))
        i, _ = a['identification_ids'][0]
        ident = idents[i]
        label = clean(ident['description']) if ident.get('id_source') == 'modern' else a['name']
        x = {'id': f'{p["id"]}#pos{len(pos) + 1}', 'label': label, 'modernId': mid, 'lat': round(lat, 6), 'lon': round(lon, 6),
             'score': a['score'], 'votes': ident['score'].get('vote_count', 0)}
        if a['score'] <= 0:
            x['rejected'] = True
        x['coordSource'] = coord_source(m)
        pr = precision(m)
        if pr:
            x['precision'] = pr
        x['source'] = 'src-openbible-geo'
        all_pos[x['coordSource']['source']] += 1
        if not best_all.get('_' + p['id']):
            best_all['_' + p['id']] = 1
            if a['score'] > 0:
                best_all[x['coordSource']['source']] += 1
        if x['coordSource']['source'] not in REG:
            held[x['coordSource']['source']] += 1
            continue
        x['id'] = f'{p["id"]}#pos{len(pos) + 1}'
        pos.append(x)
    if pos:
        p['positions'] = pos
    dg, sc = degree(r)
    p['degree'] = DEG[dg]
    best = (ids_of(r) or [None])[0]
    match = {'modernId': r['id'], 'method': 'auto', 'by': BY, 'at': AT, 'source': 'src-openbible-geo'}
    if best and best.get('id_source') == 'ancient' and sc >= 300:
        desc = clean(best['description'])
        tgt = target_of.get(best['id'])
        tname = BYID.get(best['id'], {}).get('friendly_id', best['id'])
        if desc.startswith('another name for'):
            if tgt and tgt != p['id']:
                match['otherNameOf'] = tgt
            elif not tgt:
                links_missing.append((r['friendly_id'], 'другое имя', tname))
                notes[p['id']].append(f'по сводке лучшее предложение — «{desc}»; записи {tname} в справочнике нет: своего знака у места нет (05 § 3.3, правило 0)')
        else:
            kind = 'part-of' if re.match(r'(in|on) ', desc) else 'near'
            if tgt:
                lk = {'id': f'{p["id"]}#link{len(p.get("links", [])) + 1}', 'kind': kind, 'to': tgt, 'cert': 'reference', 'refs': [],
                      'note': f'по сводке: {desc}'}
                km = re.search(r'(\d+(?:\.\d+)?) km', desc)
                if km and kind == 'near':
                    lk['km'] = float(km.group(1))
                p.setdefault('links', []).append(lk)
            else:
                links_missing.append((r['friendly_id'], kind, tname))
                notes[p['id']].append(f'по сводке лучшее предложение — «{desc}»; записи {tname} в справочнике нет')
    p['match'] = match
    # тождество по сравнению стихов (02 § 3.13.4, «выв.»): решение координатора М2-1 — Вирсавия Быт 21 и Нав 15:28
    for fl in d['flags'].split(';'):
        fl = fl.strip()
        if fl.startswith('выв:'):
            to, refs = fl[4:].split(':', 1)
            match.pop('otherNameOf', None)
            p.setdefault('links', []).append({'id': f'{p["id"]}#link{len(p.get("links", [])) + 1}', 'kind': 'inferred-same', 'to': to,
                                              'cert': 'inference', 'refs': refs.split(','),
                                              'note': 'то же, что — так выходит, если сравнить места Библии; решение координатора М2-1, нужен второй ключ библеиста'})
    # точка подписи у земли и воды — только своя точка сводки, не город и не чужая запись (05 § 3.3, правило 1а)
    AREAL = {'river', 'stream', 'sea', 'lake', 'land', 'region', 'desert', 'valley', 'field', 'mountain-range', 'road'}
    if p['kind'] in AREAL and best and best.get('id_source') == 'modern' and dg != 'не установлено':
        m = MOD.get(best['id'])
        if m and m.get('lonlat') and m.get('type') not in ('settlement', 'archaeological site'):
            want = 'water' if p['kind'] in ('river', 'stream', 'sea', 'lake') else 'land'
            if m.get('land_or_water') == want:
                lon, lat = map(float, m['lonlat'].split(','))
                if coord_source(m)['source'] in REG:
                    p['labelPoint'] = {'lat': round(lat, 6), 'lon': round(lon, 6), 'by': BY, 'source': coord_source(m)['source']}
                else:
                    held['точка подписи: ' + coord_source(m)['source']] += 1

OWN = {DICT[r['friendly_id']]['id'] for r in rows if r.get('_own')}
out_places = []
for pid in sorted(places):
    p = places[pid]
    names = []
    for i, (lem, nm) in enumerate(sorted(p['_names'].items(), key=lambda kv: (kv[1]['type'] != 'main', min(order(rkey(x)) for x in kv[1]['refs'])))):
        refs = sorted(nm['refs'].items(), key=lambda kv: order(rkey(kv[0])))
        names.append({'id': f'{pid}#n{i + 1}', 'form': nm['form'], 'refs': [{'ref': a, 'timeBasis': b} for a, b in refs], 'type': nm['type'], 'cert': 'scripture'})
    rec = {'id': pid, 'kind': p['kind'], 'names': names}
    for k in ('positions', 'degree', 'links', 'labelPoint', 'match'):
        if k in p:
            rec[k] = p[k]
    rec['sources'] = ['src-synodal'] + ([] if pid in OWN else ['src-openbible-geo'])
    rec['prov'] = {'by': BY, 'at': AT, 'status': 'draft'}
    if notes.get(pid):
        rec['prov']['note'] = '; '.join(notes[pid])
    out_places.append(rec)

# номера упоминаний — по порядку стихов и места в стихе; одно место в одном положении стиха — одно упоминание
_seen = set()
mentions_raw = [m for m in mentions_raw if not ((m['place'], m['key'], m['start']) in _seen or _seen.add((m['place'], m['key'], m['start'])))]
mentions_raw.sort(key=lambda m: (order(m['key']), m['start']))
out_mentions = []
# номер упоминания устойчив (подпись второго ключа держится за номер): прежний номер — по стиху, форме и вхождению;
# новое упоминание получает следующий свободный номер; снятые номера не возвращаются
try:
    OLD = {(x['ref'], x['form'], x['n']): x['id'] for x in json.load(open(f'{ROOT}/base/place-mentions.json', encoding='utf-8'))['items']}
except FileNotFoundError:
    OLD = {}
next_id = max([int(v[3:]) for v in OLD.values()] + [0])
USED = set()
# роли — таблица составителя, пересмотр по смыслу стиха (М2-1; Г-9); правило по предлогу больше не ставит роль
ROLES = {}
for line in open(f'{ROOT}/data/places/pilot-roles.tsv', encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    f = line.rstrip('\n').split('\t')
    ROLES[(f[0], f[1], int(f[2]))] = f[3]
for i, m in enumerate(mentions_raw):
    t = basis(m['key'])
    n = len(re.findall(r'(?<![\w—-])' + re.escape(m['form']) + r'(?![\w—-])', t[:m['start'] + len(m['form'])]))
    lid = OLD.get((rstr(m['key']), m['form'], n))
    if not lid:   # форма уточнена («Ефам» → «пустынею Ефам», Г-6): номер сохраняется по последнему слову формы
        cand = OLD.get((rstr(m['key']), m['form'].split(' ')[-1], n))
        if cand and cand not in USED:
            lid = cand
    USED.add(lid)
    if not lid:
        next_id += 1
        lid = f'lm-{next_id}'
    x = {'id': lid, 'ref': rstr(m['key']), 'n': n, 'form': m['form'], 'place': m['place'],
         'cert': 'reference', 'role': ROLES.get((rstr(m['key']), m['form'], n), '?'), 'status': 'linked'}
    assert x['role'] != '?', ('нет роли в data/places/pilot-roles.tsv', x)
    if m['how']:
        cert, refs = m['how'].split(':', 1)
        x['cert'] = cert
        x['refs'] = refs.split(',')
        x['note'] = f'место названо в {refs}; связь по соседнему стиху (05 § 3.2, уровень «выв.»)'
    elif m['ob'] != rstr(m['key']) and m['ob'] != x['ref']:
        x['note'] = f'у сводки стих {m["ob"]}: в синодальном делении форма в соседнем стихе'
    out_mentions.append(x)

# ---------------------------------------------------------------- пути (05 § 3.5; 02 § 3.13.8)
routes = json.load(open(f'{ROOT}/data/places/pilot-routes.json', encoding='utf-8'))
pids = {p['id'] for p in out_places}
for rt in routes['items']:
    for var in rt['variants']:
        for s in var['stops']:
            for k in ('place', 'land'):
                if k in s:
                    assert s[k] in pids, (rt['id'], s)
            t = basis(rkey(s['ref']))
            assert s['words'] in t, (rt['id'], s['ref'], s['words'])
            for x in s.get('between', []):
                assert x in pids, (rt['id'], s)
            for pl in [s.get('place') or s.get('land')] + s.get('between', []):
                if not pl:
                    continue
                ms = [m for m in out_mentions if m['place'] == pl and m['ref'] == s['ref']]
                assert ms, ('у стоянки нет упоминания места в её стихе', rt['id'], s)
        for g in var['segments']:
            t = basis(rkey(g['ref']))
            assert g['words'] in t, (rt['id'], g['ref'], g['words'])

# ---------------------------------------------------------------- запись
prov = {'by': BY, 'at': AT, 'status': 'draft', 'from': {'vol': 'tools/places/pilot.py; data/places; inputs/openbible (коммит 7eb18a5)'}}
files = {
    'places.json': {'schema': 1, 'title': 'Места (02 § 3.13): пробный справочник пакета 2 (10 § 4.2.3; 05 § 12)', 'prov': prov,
                    'sources': ['src-synodal'], 'items': out_places},
    'place-mentions.json': {'schema': 1, 'title': 'Упоминания мест (02 § 3.13.5): главы пробного справочника', 'prov': prov,
                            'sources': ['src-synodal'], 'items': out_mentions},
    'routes.json': {'schema': 1, 'title': 'Пути (02 § 3.13.8; 05 § 3.5): Аврам и Исход до Чермного моря', 'prov': prov,
                    'sources': ['src-synodal'], 'items': routes['items']},
}
stale = []
for rel, v in files.items():
    s = json.dumps(v, ensure_ascii=False, indent=1) + '\n'
    path = f'{ROOT}/base/{rel}'
    try:
        cur = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        cur = None
    if cur != s:
        stale.append(rel)
        if not CHECK:
            open(path, 'w', encoding='utf-8').write(s)

# ---------------------------------------------------------------- отчёт
deg = collections.Counter(p.get('degree') for p in out_places)
srcs = collections.Counter(x['coordSource']['source'] for p in out_places for x in p.get('positions', []))
best_src = collections.Counter({k: v for k, v in best_all.items() if not k.startswith('_')})
print(f'записей сводки в главах: {PILOT}; стихов-упоминаний по сводке: {sum(len(r["_hits"]) for r in rows[:PILOT])}; целей связей вне глав: {len(rows) - PILOT}')
print(f'не имя (правило 0а): {sum(1 for r in rows if DICT[r["friendly_id"]]["notname"])} — '
      + ', '.join(r['friendly_id'] for r in rows if DICT[r['friendly_id']]['notname']))
print(f'слито по словам стиха: {sum(1 for r in rows if DICT[r["friendly_id"]]["merge"])} — '
      + ', '.join(f"{r['friendly_id']} → {DICT[r['friendly_id']]['merge'][0]}" for r in rows if DICT[r['friendly_id']]['merge']))
print(f'мест: {len(out_places)}; имён: {sum(len(p["names"]) for p in out_places)}; упоминаний: {len(out_mentions)} '
      f'в {len({(m["place"], m["ref"]) for m in out_mentions})} парах «место — стих»')
print('степени: ' + ', '.join(f'{k} {deg[k]}' for k in ('certain', 'probable', 'possible', 'unknown')))
print(f'кандидатов с точкой у сводки: {sum(all_pos.values())}; по источнику координат: ' + ', '.join(f'{k} {v}' for k, v in all_pos.most_common()))
print(f'положений внесено в base: {sum(srcs.values())}; по источнику координат: ' + ', '.join(f'{k} {v}' for k, v in srcs.most_common()))
print(f'точек не внесено — источник координат не в реестре или без права распространять ({sum(v for k, v in held.items() if not k.startswith("точка"))}): ' + ', '.join(f'{k} {v}' for k, v in held.most_common()))
print('источник координат лучшей точки места (оценка > 0), до допуска: ' + ', '.join(f'{k} {v}' for k, v in best_src.most_common()))
print(f'otherNameOf: {sum(1 for p in out_places if p.get("match", {}).get("otherNameOf"))}; связей part-of/near: {sum(len(p.get("links", [])) for p in out_places)}; '
      f'точек подписи: {sum(1 for p in out_places if p.get("labelPoint"))}')
print(f'цель связи вне справочника ({len(links_missing)}): ' + '; '.join(f'{a} — {b} {c}' for a, b, c in links_missing))
print(f'формы не найдены в стихе сводки ({len(unmatched)}): ' + '; '.join(f'{a} {b}' for a, b in unmatched))
print(f'форма в соседнем стихе ({len(shifted)}): ' + '; '.join(f'{a} {b}→{c}' for a, b, c in shifted))
print(f'слово о людях — не упоминание ({len(people)}): ' + '; '.join(f'{a} {b} «{c}»' for a, b, c in people))
print('роли: ' + ', '.join(f'{k} {v}' for k, v in collections.Counter(m['role'] for m in out_mentions).most_common()))
print(f'путей: {len(routes["items"])}; стоянок: {sum(len(v["stops"]) for rt in routes["items"] for v in rt["variants"])}')
if CHECK and stale:
    print('!! расходятся с диском:', ', '.join(stale))
    sys.exit(1)
print(('проверено' if CHECK else 'записано') + ': ' + ', '.join(files))

# ---------------------------------------------------------------- выборка ко второму ключу (02 § 3.17 [4.1]; 10 § 4.2.3)
if '--sample' in sys.argv:
    import random
    def in_range(r, book, lo, hi):
        return any(b == book and lo <= (c, v) <= hi for (b, c, v) in r['_hits'])
    scene = {'путь Аврама (Быт 11:27–25:10)': ('Быт', (11, 27), (25, 10)), 'переход Чермного моря (Исх 13:17–15:21)': ('Исх', (13, 17), (15, 21))}
    P = {p['id']: p for p in out_places}
    M = collections.defaultdict(list)
    for m in out_mentions:
        M[m['place']].append(m)
    L = ['# Места пакета 2: выборка ко второму ключу', '',
         '**Статус:** выборка составителя мест к проверке вторым ключом (географ или библеист), 12 октября 2026. Собрана скриптом `python3 -I tools/places/pilot.py --sample`; зерно случайной выборки 20261012. Пересобрана после правки по рецензии (М2-1); подписи второго ключа — в `base/checks.json`. Отчёт — [места-пакет-2-отчёт.md](места-пакет-2-отчёт.md).', '',
         'Что проверять (02 § 3.17 [4.1]; 05 § 3.3, § 13 п. 2–3, 16):',
         '- **часть 1 — каждая запись** мест сцен показа: имя и форма в стихе среди слов-оснований, вид имени, вид места, слияние по словам стиха, не-имя;',
         f'- **часть 2 — подпись партии** для `positions`, `degree`, автоматического `match`: 150 мест из {len(out_places)} (не меньше 5 % и 150), по степеням поровну, где хватает; ошибок не больше 2 % (3 из 150) — иначе срез проверяется целиком;',
         '- **часть 3 — упоминания:** 150 из всех; роль пересмотрена по смыслу стиха (таблица `data/places/pilot-roles.tsv`).', '']
    for title, (bk, lo, hi) in scene.items():
        ids = sorted({target_of[r['id']] for r in rows[:PILOT] if r['id'] in target_of and in_range(r, bk, lo, hi)})
        nn = sorted(r['friendly_id'] for r in rows[:PILOT] if in_range(r, bk, lo, hi) and r['id'] not in target_of)
        L += [f'## Часть 1. {title}: мест {len(ids)}' + (f'; не-имён {len(nn)} ({", ".join(nn)})' if nn else ''), '',
              '| место | вид | имена (вид имени: стихи) | степень | лучшее предложение сводки | связь |', '|---|---|---|---|---|---|']
        for pid in ids:
            p = P[pid]
            nm = '; '.join(f'{n["form"]} ({n["type"]}: {", ".join(x["ref"] for x in n["refs"])})' for n in p['names'])
            bp = (p.get('positions') or [None])[0]
            rec = BYID[p['match']['modernId']]
            b0 = (ids_of(rec) or [None])[0]
            best = clean(b0['description']) + f' — {b0["score"].get("time_total")}' if b0 else '—'
            link = p['match'].get('otherNameOf') or ', '.join(f'{x["kind"]} {x["to"]}' for x in p.get('links', [])) or '—'
            L.append(f'| `{pid}` ({rec["friendly_id"]}) | {p["kind"]} | {nm} | {p.get("degree")} | {best} | {link} |')
        L.append('')
    rnd = random.Random(20261012)
    by_deg = collections.defaultdict(list)
    for p in out_places:
        by_deg[p.get('degree')].append(p['id'])
    pick = []
    for dgr in ('certain', 'probable', 'possible', 'unknown'):
        pick += rnd.sample(sorted(by_deg[dgr]), min(38 if dgr != 'unknown' else 36, len(by_deg[dgr])))
    L += [f'## Часть 2. Подпись партии: {len(pick)} мест (по степеням: ' + ', '.join(f'{d} {sum(1 for x in pick if P[x].get("degree") == d)}' for d in ('certain', 'probable', 'possible', 'unknown')) + ')', '',
          'Сверить с `inputs/openbible/ancient.jsonl` (коммит 7eb18a5): итог по цепочке → степень по порогам 800 / 500 / 300; число предложений; отвергнутые (≤ 0); вид связи у лучшего предложения «another name / in / within»; точки — только с источником координат из реестра.', '',
          '| место | запись сводки | степень | итог | предложений (> 0) | лучшее предложение | точек в base |', '|---|---|---|---|---|---|---|']
    for pid in sorted(pick):
        p = P[pid]
        rec = BYID[p['match']['modernId']]
        dg, sc = degree(rec)
        idl = ids_of(rec)
        L.append(f'| `{pid}` | {rec["friendly_id"]} ({rec["id"]}) | {p.get("degree")} | {sc} | {len(idl)} ({sum(1 for i in idl if i["score"].get("time_total", 0) > 0)}) | '
                 f'{clean(idl[0]["description"]) if idl else "—"} | {len(p.get("positions", []))} |')
    L.append('')
    ms = rnd.sample(out_mentions, 150)
    L += ['## Часть 3. Упоминания: 150 из ' + str(len(out_mentions)), '',
          'Сверить: форма стоит в стихе среди слов-оснований; место выбрано верно (тёзки: Ароер, Давир, Сохо, Фимна, Зиф, Заноах, Ливна, Ашна, Вирсавия, Месопотамия, пустыня Син); роль.', '',
          '| № | стих | форма | место | уровень | роль |', '|---|---|---|---|---|---|']
    for m in sorted(ms, key=lambda m: int(m['id'][3:])):
        L.append(f'| {m["id"]} | {m["ref"]} | {m["form"]} | `{m["place"]}` | {m["cert"]} | {m["role"]} |')
    open(f'{ROOT}/docs/app/reviews/места-пакет-2-выборка.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print('выборка: docs/app/reviews/места-пакет-2-выборка.md')
