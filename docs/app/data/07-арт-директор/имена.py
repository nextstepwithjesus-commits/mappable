"""Рецензия арт-директора на 07: помещается ли имя в h1 карточки.

Запуск из корня: python3 -I docs/app/data/07-арт-директор/имена.py <literata-cyrillic-opsz.woff2>
Шрифт — Literata (кириллица, переменный, оси opsz и wght), подмножество
fontsource; экземпляр собирается fontTools.varLib.instancer. Ширина — сумма
продвижений глифов без кернинга (оценка; кернинг сужает строку на 1–3 %).
Размеры h1 — предложение рецензии по R13 § 5.1: ноутбук 44 px (opsz 48),
телефон 34 px (opsz 36), насыщенность 600. Поле: ноутбук — 7 колонок R13
(около 664 px), телефон — 328 px.
"""
import glob, json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

path = sys.argv[1]
acts = [a for f in sorted(glob.glob('base/actors/*.json')) for a in json.load(open(f, encoding='utf-8'))['items']]
names = sorted({n['form'] for a in acts for n in a.get('names', []) if n.get('type') == 'main'}, key=len)


def width_fn(opsz, wght, size):
    f = TTFont(path)
    axes = {a.axisTag for a in f['fvar'].axes}
    loc = {k: v for k, v in (('opsz', opsz), ('wght', wght)) if k in axes}
    inst = instancer.instantiateVariableFont(f, loc)
    cmap, hmtx, upm = inst.getBestCmap(), inst['hmtx'], inst['head'].unitsPerEm
    def w(s):
        return sum(hmtx[cmap[ord(c)]][0] if ord(c) in cmap else upm * .5 for c in s) * size / upm
    return w


for label, opsz, size, field in (('ноутбук', 48, 44, 664), ('телефон', 36, 34, 328)):
    w = width_fn(opsz, 600, size)
    ws = sorted(((w(n), n) for n in names), reverse=True)
    over = [n for x, n in ws if x > field]
    word_over = [n for n in names if max(w(p) for p in n.replace('-', '- ').split()) > field]
    print(f'{label}: h1 {size} px; имён {len(names)}; шире поля {field} px в одну строку: {len(over)};'
          f' слово шире поля (нужен перенос внутри слова): {len(word_over)}')
    print('   самые широкие:', [(n, round(x)) for x, n in ws[:6]])
