"""Рецензия доступности на 08: полнота таблицы WCAG 2.2 AA (08 § 6.3) и что потеряно против 03, 04, 05, 11.

Запуск из корня: python3 -I docs/app/data/08-доступность/wcag.py
Список критериев — WCAG 2.2 (W3C Recommendation, 12.12.2024): уровни A и AA, без 4.1.1 (снят в 2.2).
Скрипт читает только документы; ничего не меняет.
"""
import re

A = ['1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3', '1.4.1', '1.4.2',
     '2.1.1', '2.1.2', '2.1.4', '2.2.1', '2.2.2', '2.3.1', '2.4.1', '2.4.2', '2.4.3', '2.4.4',
     '2.5.1', '2.5.2', '2.5.3', '2.5.4', '3.1.1', '3.2.1', '3.2.2', '3.2.6', '3.3.1', '3.3.2',
     '3.3.7', '4.1.2']
AA = ['1.2.4', '1.2.5', '1.3.4', '1.3.5', '1.4.3', '1.4.4', '1.4.5', '1.4.10', '1.4.11',
      '1.4.12', '1.4.13', '2.4.5', '2.4.6', '2.4.7', '2.4.11', '2.5.7', '2.5.8', '3.1.2',
      '3.2.3', '3.2.4', '3.3.3', '3.3.4', '3.3.8', '4.1.3']
ALL = A + AA
print(f'WCAG 2.2: уровень A — {len(A)}, AA — {len(AA)}, всего {len(ALL)}')

ROOT = '/home/user/mappable/docs/app/'


def section(path, start, stop):
    t = open(ROOT + path, encoding='utf-8').read()
    i = t.index(start)
    j = t.index(stop, i + len(start))
    return t[i:j]


def named(text):
    # номера критериев в первом столбце строк таблицы; «3.1.1, 3.1.2» и «1.1.1, 1.3.1» — оба
    out = set()
    for line in text.splitlines():
        if not line.startswith('|'):
            continue
        first = line.split('|')[1]
        for m in re.findall(r'\b\d\.\d\.\d{1,2}\b', first):
            out.add(m)
    return out


src = {
    '08 § 6.3': named(section('08-ДИЗАЙН-СИСТЕМА.md', '### 6.3. WCAG', '### 6.4.')),
    '03 § 7.11': named(section('03-ГЕНЕАЛОГИЯ.md', '### 7.11. WCAG', '### 7.12.')),
    '04 § 8.6': named(section('04-ВРЕМЯ.md', '### 8.6. WCAG', '### 8.7.')),
    '05 § 8.2': named(section('05-ГЕОГРАФИЯ.md', '### 8.2. WCAG', '### 8.3.')),
    '11 § 9.1': named(section('11-ИСТОРИИ.md', '### 9.1. WCAG', '### 9.2.')),
}
for k, v in src.items():
    aa = sorted((x for x in v if x in ALL), key=lambda s: [int(p) for p in s.split('.')])
    print(f'{k}: критериев A/AA — {len(aa)}: {", ".join(aa)}')

d08 = src['08 § 6.3']
print()
print('Нет в 08 § 6.3, но есть в таблице инструмента (потеряно при сведении):')
lost = {}
for k, v in src.items():
    if k == '08 § 6.3':
        continue
    for x in v:
        if x in ALL and x not in d08:
            lost.setdefault(x, []).append(k)
for x in sorted(lost, key=lambda s: [int(p) for p in s.split('.')]):
    print(f'  {x} ({"A" if x in A else "AA"}) — в {", ".join(lost[x])}')
if not lost:
    print('  нет')

print()
print('Нет ни в 08, ни в инструментах (не названо вовсе, даже как «не применимо»):')
union = set().union(*src.values())
for x in ALL:
    if x not in union:
        print(f'  {x} ({"A" if x in A else "AA"})')
print()
miss08 = [x for x in ALL if x not in d08]
print(f'08 § 6.3 называет {len([x for x in ALL if x in d08])} из {len(ALL)} критериев A/AA; '
      f'не названо {len(miss08)}: {", ".join(miss08)}')
