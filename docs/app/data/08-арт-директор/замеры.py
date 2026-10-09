"""Замеры арт-директора к рецензии на 08 «Дизайн-система».

Запуск из корня: python3 -I docs/app/data/08-арт-директор/замеры.py --fonts ПАПКА
ПАПКА — файлы google/fonts из 08 § 3.3.1 (Literata[opsz,wght].ttf, GolosText[wght].ttf).
Части: 1 — длинные имена и названия против колонок; 2 — строки h1 и диакритика;
3 — волосные линии Literata при opsz 72 и opsz = кегль; 4 — печать A4;
5 — колонка на планшете; 6 — цвет: ΔE2000 тонов и серых; 7 — линии Мессии с кантом.
"""
import glob, json, math, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

A = sys.argv[1:]
FD = A[A.index('--fonts') + 1]
_cache = {}


def inst(name, axes):
    k = (name, tuple(sorted(axes.items())))
    if k not in _cache:
        f = TTFont(glob.glob(f'{FD}/{name}*.ttf')[0])
        tags = {a.axisTag for a in f['fvar'].axes}
        _cache[k] = instancer.instantiateVariableFont(f, {t: v for t, v in axes.items() if t in tags})
    return _cache[k]


def width(name, axes, size, text):
    f = inst(name, axes)
    cm, hm, upm = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
    w = sum(hm[cm[ord(c)]][0] for c in text if ord(c) in cm)
    return w * size / upm


def bbox(name, axes, ch):
    f = inst(name, axes)
    gs = f.getGlyphSet()
    g = f.getBestCmap()[ord(ch)]
    p = BoundsPen(gs)
    gs[g].draw(p)
    return p.bounds, f['head'].unitsPerEm


def head(t):
    print('\n' + '=' * 78 + '\n' + t + '\n' + '=' * 78)


# ---------------------------------------------------------------- 1
head('1. Длинные имена (base/actors, items, names.form) и колонки 08')
names = set()
for fn in glob.glob('base/actors/*.json'):
    for it in json.load(open(fn, encoding='utf-8'))['items']:
        for n in it.get('names', []):
            names.add(n['form'])
hy = sorted([n for n in names if '-' in n], key=lambda s: -len(s))
longest = sorted(names, key=lambda s: -width('Literata', {'opsz': 72, 'wght': 600}, 34, s))[:8]
print(f'имён всего: {len(names)}; составных через дефис: {len(hy)}')
print('самые широкие в h1 телефона (Literata 600 opsz 72, 34 px; колонка 328 при 360, 288 при 320):')
for n in longest:
    w = width('Literata', {'opsz': 72, 'wght': 600}, 34, n)
    print(f'  {n:32} {w:6.0f} px {"— шире 288" if w > 288 else ""}{" и шире 328" if w > 328 else ""}')
print('составные (через дефис), ширина одним куском:')
for n in hy[:10]:
    w34 = width('Literata', {'opsz': 72, 'wght': 600}, 34, n)
    w20 = width('Literata', {'opsz': 24, 'wght': 600}, 20, n)
    print(f'  {n:32} h1 телефона 34 px: {w34:5.0f}; имя малой карточки 20 px: {w20:5.0f}')
over = [n for n in hy if width('Literata', {'opsz': 72, 'wght': 600}, 34, n) > 288]
print(f'составных шире 288 px в h1 телефона: {len(over)}; с nowrap — горизонтальная прокрутка при 320 px / 400 %')
# ширина при 400 %: окно 320, поля 16 → 288; h1 тот же кегль в rem
for s in ('Магер-шелал-хаш-баз',):
    print(f'  пример из 08 § 3.3.3 «{s}»: h1 34 px — {width("Literata", {"opsz": 72, "wght": 600}, 34, s):.0f} px; '
          f'подпись под обложкой 18 px — {width("Literata", {"opsz": 24, "wght": 600}, 18, s):.0f} px при поле 156')

# ---------------------------------------------------------------- 2
head('2. h1 в две строки: верх Й/Ё и низ у/р/Д/Щ (Literata 600, opsz 72), em')
top = max(bbox('Literata', {'opsz': 72, 'wght': 600}, c)[0][3] for c in 'ЙЁЙ')
topl = max(bbox('Literata', {'opsz': 72, 'wght': 600}, c)[0][3] for c in 'йёбд')
topA = max(bbox('Literata', {'opsz': 72, 'wght': 600}, c)[0][3] for c in 'АБВНТ')
bot = min(bbox('Literata', {'opsz': 72, 'wght': 600}, c)[0][1] for c in 'урДЩЦд')
upm = bbox('Literata', {'opsz': 72, 'wght': 600}, 'А')[1]
print(f'верх прописной {topA / upm:.3f}; верх Й/Ё {top / upm:.3f}; низ выносных {bot / upm:.3f}')
print(f'верх строчных й/ё/б: {topl / upm:.3f}')
print(f'высота знаков от низа выносных до верха Й/Ё: {(top - bot) / upm:.3f} em; до верха й/ё/б: {(topl - bot) / upm:.3f} em')
for size, lh in ((56, 60), (44, 48), (34, 38), (40, 44), (32, 36), (28, 32)):
    gap = lh / size - (top - bot) / upm
    gl = lh / size - (topl - bot) / upm
    print(f'  {size}/{lh} (интерлиньяж {lh / size:.3f}): зазор «у» над «Й» — {gap * size:+.1f} px; «у» над «й/б» — {gl * size:+.1f} px')

# ---------------------------------------------------------------- 3
head('3. Волосная линия Literata 600: «о» — верх кольца (толщина горизонтали)')


def thin(axes):
    f = inst('Literata', axes)
    gs = f.getGlyphSet()
    g = f.getBestCmap()[ord('о')]
    rp = DecomposingRecordingPen(gs)
    gs[g].draw(rp)
    # контуры: внешний и внутренний; горизонталь вверху = yMax внешнего − yMax внутреннего
    conts, cur = [], []
    for op, pts in rp.value:
        if op == 'moveTo':
            cur = [pts[0]]
        elif op in ('lineTo', 'qCurveTo', 'curveTo'):
            cur += list(pts)
        elif op in ('closePath', 'endPath'):
            conts.append(cur)
    ys = sorted([max(p[1] for p in c if p) for c in conts], reverse=True)
    xs = []
    for c in conts:
        xs.append(min(p[0] for p in c if p))
    xs.sort()
    return (ys[0] - ys[1]) / f['head'].unitsPerEm, (xs[1] - xs[0]) / f['head'].unitsPerEm


for size, op in ((24, 72), (24, 24), (34, 72), (34, 34), (20, 72), (20, 20), (56, 72)):
    h, v = thin({'opsz': op, 'wght': 600})
    print(f'  кегль {size} px, opsz {op}: горизонталь {h * size:.2f} px, основной штрих {v * size:.2f} px (контраст {v / h:.1f})')

# ---------------------------------------------------------------- 4
head('4. Печать A4: колонка Literata 11 pt при полях 20 мм')
TEXT = []
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    if b == 'Быт' and ((int(c) == 6 and int(v) >= 9) or int(c) == 7):
        TEXT.append(re.sub(r'\s+', ' ', re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', t)).strip())
S = ' '.join(TEXT)
for pt, opsz in ((11, 11), (12, 12)):
    cw_pt = width('Literata', {'opsz': opsz, 'wght': 400}, pt, S) / len(S)
    cw_mm = cw_pt * 25.4 / 72
    print(f'  {pt} pt: знак {cw_mm:.2f} мм; колонка 170 мм — {170 / cw_mm:.0f} знаков; 70 знаков = {70 * cw_mm:.0f} мм')

# ---------------------------------------------------------------- 5
head('5. Одна колонка на ширине 600–1023 (сетка 8, поля 32): текст 20 px, без ограничения ширины')
cw = width('Literata', {'opsz': 20, 'wght': 400}, 20, S) / len(S)
for vw in (600, 768, 900, 1023):
    print(f'  окно {vw}: колонка {vw - 64} px — {(vw - 64) / cw:.0f} знаков')
print(f'  граница 75 знаков = {75 * cw:.0f} px; 66 знаков = {66 * cw:.0f} px')
