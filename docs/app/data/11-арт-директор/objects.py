"""Есть ли в стихах историй пробы R12 предмет, который можно нарисовать знаком.

Словарь — около 80 основ предметов, животных и мест-предметов (не лиц).
Слово ищется в тексте стиха ВНЕ скобок (любых). Грубая оценка охвата.
Запуск из корня проекта: python3 -I <путь>/objects.py
"""
import re, collections
TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t
def outside(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t); t = re.sub(r'\([^)]*\)', ' ', t)
    return t.lower().replace('ё', 'е')
def verses(b, ref):
    out = []
    for seg in ref.split(';'):
        seg = seg.strip().replace('–', '-')
        m = re.match(r'(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?', seg)
        c1, v1 = int(m[1]), int(m[2]); c2 = int(m[3]) if m[3] else c1; v2 = int(m[4]) if m[4] else v1
        c, v = c1, v1
        while (c, v) <= (c2, v2):
            if (b, c, v) in TEXT: out.append(TEXT[(b, c, v)]); v += 1
            else: c, v = c + 1, 1
    return ' '.join(outside(x) for x in out)
OBJ = ['лодк', 'корабл', 'сет', 'постел', 'одр', 'кровл', 'меч', 'копь', 'копье', 'пращ', 'камн', 'камен', 'гусл',
       'стрел', 'лук', 'пещер', 'гумн', 'колос', 'кувшин', 'хлеб', 'рыб', 'вод', 'гор', 'мор', 'колод', 'источник',
       'ячмен', 'пшениц', 'сосуд', 'щит', 'шлем', 'брон', 'жертвенник', 'ковчег', 'скини', 'шатр', 'шатер', 'дерев',
       'смоковниц', 'виноград', 'вин', 'масл', 'светильник', 'светил', 'огон', 'огн', 'облак', 'ветр', 'голуб',
       'овц', 'овец', 'агн', 'осл', 'верблюд', 'кон', 'льв', 'лев', 'медвед', 'змe', 'змей', 'свин', 'плащ',
       'одежд', 'ризы', 'сандал', 'обув', 'посох', 'жезл', 'сум', 'венец', 'престол', 'дверь', 'двер', 'ворот',
       'стен', 'башн', 'храм', 'дом', 'город', 'поле', 'пустын', 'река', 'реки', 'рек', 'иордан', 'кост',
       'свиток', 'книг', 'печат', 'трубы', 'труб', 'рог', 'кедр', 'пальм', 'маслин', 'серебр', 'золот', 'сундук',
       'ящик', 'ложе', 'стол', 'чаш', 'ефод', 'терафим', 'подушк', 'кувшин']
PROBE = {}
book = None
BOOKS = {'**Руфь**': 'Руф', '**1 Царств 16–31**': '1Цар', '**Марк 1–3**': 'Мк', '**Деяния 1–5**': 'Деян'}
lines = open('docs/app/research/R12-истории-каталог.md', encoding='utf-8').read().split('\n')
start = lines.index('## Приложение А. Разметка пробы')
rows = []
for l in lines[start:start + 100]:
    for k, b in BOOKS.items():
        if l.startswith(k): book = b
    p = [x.strip() for x in l.split('|')]
    if book and len(p) > 4 and re.match(r'^[\d:–; ]+$', p[1]):
        rows.append((book, p[1], p[2], p[3]))
hit = 0; cnt = collections.Counter(); none = []
for b, ref, title, kind in rows:
    t = verses(b, ref)
    words = set(re.findall(r'[а-я]+', t))
    found = sorted({o for o in OBJ for w in words if w.startswith(o)})
    if found: hit += 1; cnt.update(found)
    else: none.append((title, kind))
OBJ_STRICT = None
print(f'историй пробы: {len(rows)}; с хотя бы одним предметом словаря в стихах вне скобок: {hit}')
print('без предмета:', none)
print('частые предметы:', cnt.most_common(25))

# строгий вариант: без двусмысленных основ (гор, дом, город, вин, кон, поле, мор, вод, рек, стен, кост, рог, книг, огн/огон, лук, сум, стол, сет)
AMB = {'гор', 'дом', 'город', 'вин', 'кон', 'поле', 'мор', 'вод', 'рек', 'реки', 'река', 'стен', 'кост', 'рог', 'книг',
       'огн', 'огон', 'лук', 'сум', 'стол', 'сет', 'одежд', 'ворот', 'дерев', 'светил', 'двер', 'дверь', 'облак', 'ветр'}
strict = [o for o in OBJ if o not in AMB]
hit2 = 0; none2 = []
for b, ref, title, kind in rows:
    words = set(re.findall(r'[а-я]+', verses(b, ref)))
    if any(w.startswith(o) for o in strict for w in words): hit2 += 1
    else: none2.append(title)
print(f'строгий словарь ({len(strict)} основ): с предметом {hit2} из {len(rows)}; без предмета: {none2}')
