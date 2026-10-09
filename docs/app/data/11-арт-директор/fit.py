"""Помещаются ли названия историй на типографскую обложку и в подпись.

Шрифты: Literata (opsz, wght) и Golos Text из r8/ttf; ширины — по таблице hmtx
экземпляра шрифта. Перенос — по словам (без переносов внутри слова).
Запуск: python3 -I fit.py <scratchpad>
"""
import sys, collections
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

S = sys.argv[1]


def inst(path, **axes):
    f = TTFont(path)
    if 'fvar' in f:
        ax = {a.axisTag: a for a in f['fvar'].axes}
        loc = {k: v for k, v in axes.items() if k in ax}
        f = instancer.instantiateVariableFont(f, loc)
    cmap = f.getBestCmap()
    hmtx = f['hmtx']
    upm = f['head'].unitsPerEm
    def w(text, size):
        return sum(hmtx[cmap[ord(c)]][0] if ord(c) in cmap else hmtx['space'][0] for c in text) * size / upm
    return w


lit24 = inst(f'{S}/r8/ttf/literata.ttf', opsz=24, wght=600)
lit72 = inst(f'{S}/r8/ttf/literata.ttf', opsz=72, wght=600)
gol = inst(f'{S}/r8/ttf/golos.ttf', wght=450)


def lines(w, text, size, width):
    out, cur = [], ''
    for word in text.split():
        t = (cur + ' ' + word).strip()
        if w(t, size) <= width or not cur:
            cur = t
        else:
            out.append(cur); cur = word
    out.append(cur)
    over = [x for x in out if w(x, size) > width]
    return len(out), over


titles = [l.split('\t') for l in open(f'{S}/ad11/titles.tsv', encoding='utf-8').read().splitlines()]
titles += [['Ной и потоп', 'событие'], ['Поединок Давида с Голиафом в долине дуба', 'событие'],
           ['Ной насаждает виноградник', 'событие'], ['Насыщение пяти тысяч', 'событие'],
           ['Обращение Савла', 'событие'], ['Иуда и Фамарь', 'событие'], ['Исцеления вечером', 'сводка']]

# типографская обложка: ноутбук 272×204, телефон 156×117 (R13 § 3.3); поля 16 и 12 px
CASES = [('ноутбук, обложка 272, поле 16, Literata 600 opsz24 20/26', lit24, 20, 26, 272 - 32, 204 - 32),
         ('телефон, обложка 156, поле 12, Literata 600 opsz24 18/24', lit24, 18, 24, 156 - 24, 117 - 24)]
for name, w, size, lh, width, height in CASES:
    cnt = collections.Counter(); over = []
    for t, k in titles:
        n, o = lines(w, t, size, width)
        cnt[n] += 1
        if o:
            over.append((t, o))
    # место под название: высота минус знак вида 24 + отступ 8 + адрес 20
    room = (height - 24 - 8 - 20) // lh
    print(f'{name}: строк у названий {dict(sorted(cnt.items()))}; помещается строк под название: {room};'
          f' не помещаются: {sum(v for n, v in cnt.items() if n > room)} из {len(titles)}')
    for t, o in over:
        print('   слово шире обложки:', t, o)

# самое длинное слово в названиях
longw = sorted({x.strip(',;') for t, _ in titles for x in t.split()}, key=lambda x: -lit24(x, 18))[:6]
print('самые широкие слова (Literata 18 px):', [(x, round(lit24(x, 18))) for x in longw])
for x in ['Жертвоприношение', 'Преображение', 'Воскресение', 'Благословение', 'Навуходоносор']:
    print(f'   {x}: {lit24(x, 18):.0f} px при 18; {lit24(x, 20):.0f} px при 20')

# h1 на странице истории: 6 колонок сетки R13 (6·74 + 5·24 = 564 px), Literata opsz72 600 56/60
for t in ['Ной и потоп', 'Давид побеждает Голиафа', 'Исцеление бесноватого в синагоге Капернаума',
          'Давид берёт копьё и сосуд у спящего Саула', 'Поединок Давида с Голиафом в долине дуба']:
    n, _ = lines(lit72, t, 56, 564)
    n2, _ = lines(lit72, t, 34, 360 - 32)
    print(f'h1 «{t}»: ноутбук {n} стр. ({n*60} px); телефон 34/38 — {n2} стр. ({n2*38} px)')

# виды в Мк 1–3: сколько соседних обложек одного вида и одного тона
mk = [k for t, k in titles[32:52]]
print('проверка: первое и последнее в Мк:', titles[32][0], '/', titles[51][0])
print('Мк 1–3 по видам:', collections.Counter(mk))
rows = [mk[i:i + 4] for i in range(0, len(mk), 4)]
print('ряды по 4 на ноутбуке:', rows)

# варианты для телефона
for label, size, lh, h in [('16/22, 4:3', 16, 22, 117), ('16/22, 3:4 (156×208)', 16, 22, 208), ('18/24, 3:4', 18, 24, 208)]:
    import collections as C
    cnt = C.Counter(); wide = 0
    for t, k in titles:
        n, o = lines(lit24, t, size, 132)
        cnt[n] += 1; wide += bool(o)
    room = (h - 24 - 24 - 8 - 20) // lh
    print(f'телефон {label}: строк {dict(sorted(cnt.items()))}; место под название {room} стр.; не помещаются {sum(v for n, v in cnt.items() if n > room)}; слово шире обложки — в {wide}')
