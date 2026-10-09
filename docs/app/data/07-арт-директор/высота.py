"""Рецензия арт-директора на 07: высота карточки Давида на ноутбуке 1280 x 800.

Запуск из корня: python3 -I docs/app/data/07-арт-директор/высота.py
Грубая модель вёрстки простого слоя, а не замер. Записи — утверждения базы
(без карантина, без прежних § 2, 23, 24) и рёбра (родители, дети, союзы),
разложенные по новым разделам 07 § 5.3. Строка записи — текст записи;
адрес — отдельной строкой под записью (07 § 6, § 9). Два набора размеров:
  А — как в 07 § 13.4: 16/24, 60 знаков, без отступов между разделами;
  Б — по R13 § 5.1–5.2: запись Golos 16/24 (~75 знаков в 7 колонках),
      цитата Literata 20/30 (66 знаков), адрес 15/20, h2 26/32,
      между разделами 48 px.
Состояния: «по умолчанию» (до 8 записей в разделе, остаток — «ещё N»;
раздел 14 свёрнут в оглавление периодов) и «всё раскрыто».
Экран — 800 минус 96 px шапки приложения = 704 px.
"""
import collections, glob, json

acts = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        acts[a['id']] = a
OLD2NEW = {1: 1, 4: 1, 3: 1, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 7, 11: 8, 12: 9,
           13: 10, 14: 11, 15: 12, 16: 13, 17: 14, 18: 15, 19: 16, 20: 17, 21: 18, 22: 19}
QUOTE_SECS = {15, 16, 19}


def text_of(v):
    if isinstance(v, dict):
        t = v.get('text') or v.get('name') or v.get('quote') or ''
        return t if isinstance(t, str) else ''
    return v if isinstance(v, str) else ''


def records(pid):
    sec = collections.defaultdict(list)
    for f in acts[pid].get('facts', []):
        if f.get('prov', {}).get('status') == 'quarantine' or f.get('sec') in (2, 23, 24):
            continue
        n = OLD2NEW.get(f.get('sec'))
        if n:
            sec[n].append(len(text_of(f['value'])) or 20)
    for x in json.load(open('base/origins.json', encoding='utf-8'))['items']:
        if x.get('child') == pid:
            sec[4].append(25)
        if x.get('parent') == pid:
            sec[7].append(25)
    for x in json.load(open('base/unions.json', encoding='utf-8'))['items']:
        if pid in (x.get('husband'), x.get('wife')):
            sec[7].append(40)
    sec[20].append(40)
    return sec


def height(sec, s, default):
    h = 700  # шапка карточки: имя, Кратко, кнопки, главный стих, паспорт
    for n, lens in sorted(sec.items()):
        if default and n == 14:
            lens = lens[:6]  # оглавление периодов: около 6 строк
        if default and len(lens) > 10:
            lens = lens[:8] + [10]  # «ещё N»
        h += s['h2'] + s['between']
        for L in lens:
            if n in QUOTE_SECS:
                lines = -(-L // s['qchars']); h += lines * s['qlh']
            else:
                lines = -(-L // s['chars']); h += lines * s['lh']
            h += s['addr'] + s['gap']
    return h


S = {
    'А (07 § 13.4)': dict(chars=60, lh=24, qchars=60, qlh=24, addr=24, gap=0, h2=24, between=0),
    'Б (R13)': dict(chars=75, lh=24, qchars=66, qlh=30, addr=20, gap=12, h2=32, between=48),
}
for pid in ('p-david', 'p-avraam', 'p-ila-syn-vaasy'):
    if pid not in acts:
        continue
    sec = records(pid)
    nrec = sum(len(v) for v in sec.values())
    print(f'{pid}: разделов {len(sec)}, записей {nrec}')
    for k, s in S.items():
        for default in (True, False):
            h = height(sec, s, default)
            print(f'   {k:14} {"по умолчанию" if default else "всё раскрыто"}: {h} px = {h / 704:.1f} экрана')
