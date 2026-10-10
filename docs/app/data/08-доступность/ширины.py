"""Рецензия доступности на 08: помещаются ли длинные имена и подписи при 320 CSS px (WCAG 1.4.10) и при 200 % (1.4.4).

Запуск из корня: python3 -I docs/app/data/08-доступность/ширины.py --fonts ПАПКА
ПАПКА — те же файлы google/fonts, что у 08-числа.py: GolosText[wght].ttf, Literata[opsz,wght].ttf
(любые имена файлов: скрипт берёт файлы, в имени которых есть «Golos» и «Literata»).
Ширина слова — сумма продвижений глифов экземпляра шрифта (fontTools.varLib.instancer), без кернинга:
кернинг сужает строку на 1–3 %, на вывод не влияет.
Имена — поле names[type=main] в base/actors/*.json. Файлы проекта скрипт не меняет.
"""
import glob
import hashlib
import json
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

A = sys.argv[1:]
D = A[A.index('--fonts') + 1] if '--fonts' in A else None
if not D:
    print('нужен --fonts ПАПКА')
    sys.exit(1)
files = os.listdir(D)
LIT = os.path.join(D, [f for f in files if 'Literata' in f and 'Italic' not in f][0])
GOL = os.path.join(D, [f for f in files if 'Golos' in f][0])
for p in (LIT, GOL):
    print(os.path.basename(p), 'sha256', hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16])

_cache = {}


def face(path, loc):
    key = (path, tuple(sorted(loc.items())))
    if key not in _cache:
        f = TTFont(path)
        inst = instancer.instantiateVariableFont(f, loc)
        _cache[key] = (inst.getBestCmap(), inst['hmtx'].metrics, inst['head'].unitsPerEm)
    return _cache[key]


def width(text, path, loc, px):
    cmap, hm, upm = face(path, loc)
    return sum(hm[cmap[ord(ch)]][0] for ch in text if ord(ch) in cmap) * px / upm


ROOT = __import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', '..', '..')) + '/'
names = set()
for f in glob.glob(ROOT + 'base/actors/*.json'):
    for it in json.load(open(f, encoding='utf-8'))['items']:
        for n in it.get('names', []):
            if n.get('type') == 'main':
                names.add(n['form'])
words = sorted({w for n in names for w in n.split()}, key=len, reverse=True)
print(f'Имён (main): {len(names)}; разных слов в них: {len(words)}')

# Места из 08: ширины по сетке (08 § 3.4; приложение А, ч. 6)
CASES = [
    # (что, шрифт, оси, кегль, доступная ширина при 320, при 360)
    ('h1 имени в Карточке, телефон: Literata 600 opsz 72, 34 px; колонка', LIT, {'wght': 600, 'opsz': 72}, 34, 288, 328),
    ('имя на малой карточке, телефон: Literata 600 opsz 24, 18 px; 2 колонки − знак 32 − промежуток 8', LIT,
     {'wght': 600, 'opsz': 24}, 18, 136 - 40, 156 - 40),
    ('имя в тексте Писания, телефон: Literata 400 opsz 18, 18 px; колонка', LIT, {'wght': 400, 'opsz': 18}, 18, 288, 328),
]
for what, path, loc, px, w320, w360 in CASES:
    print()
    print(what)
    over320 = [(w, width(w, path, loc, px)) for w in words]
    o320 = sorted([x for x in over320 if x[1] > w320], key=lambda x: -x[1])
    o360 = [x for x in over320 if x[1] > w360]
    print(f'  слов шире места: при 320 px ({w320} px) — {len(o320)}; при 360 px ({w360} px) — {len(o360)}')
    for w, x in o320[:8]:
        print(f'    {w}: {x:.0f} px')
    # при 200 % текста (размер шрифта браузера 32 px, окно то же) — кегль вдвое, место то же
    o200 = [w for w, x in over320 if 2 * x > w360]
    print(f'  при тексте 200 % (окно 360, место {w360} px): шире места — {len(o200)} слов')

print()
print('Подписи кнопок инструментов, сетка 2 × 2 (08 § 7.8): Golos 600 16 px + значок 24 + промежуток 8 + поля 2 × 12')
for lab in ('Генеалогия', 'География', 'Время', 'Связи'):
    w = width(lab, GOL, {'wght': 600}, 16) + 24 + 8 + 24
    print(f'  {lab}: {w:.0f} px; кнопка при 320 — 136 px, при 360 — 156 px; при тексте 200 %: {width(lab, GOL, {"wght": 600}, 32) + 24 + 8 + 24:.0f} px')

print()
print('Слова названий историй под обложкой (Literata 600 opsz 24, 18 px; обложка 136 px при 320, 156 при 360):')
for w in ('Расслабленного', 'Преображение', 'Воскрешение', 'Навуходоносора', 'Валтасаров'):
    x = width(w, LIT, {'wght': 600, 'opsz': 24}, 18)
    print(f'  {w}: {x:.0f} px — {"не помещается" if x > 136 else "помещается"} при 320; при тексте 200 %: {2 * x:.0f} px')
