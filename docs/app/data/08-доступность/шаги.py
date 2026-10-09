"""Рецензия доступности на 08: сколько остановок VoiceOver на iPhone добавят скрытые метки скобок (08 § 4).

Запуск из корня: python3 -I docs/app/data/08-доступность/шаги.py
Допущение (проверить на устройстве): VoiceOver на iOS делит абзац на отдельные остановки смахивания
на границах строчных элементов со скрытым текстом (визуально скрытый span). Тогда одна скобка с метками
«в скобках Синодального издания: … конец скобок» даёт не меньше 3 новых остановок: метка, слова в скобках
вместе с меткой конца, продолжение строки. Без деления (одна остановка на абзац) — 0.
Скобки видов «б» (gloss) и «г» (damage) по tools/bible/brackets.tsv меток не получают (08 § 4).
Части *Ной и потоп* — как в 11 (Быт 6:9–22; 7:1–16; 7:17–24; 8:1–14; 8:15–22; 9:1–17).
Файлы проекта скрипт не меняет.
"""
ROOT = '/home/user/mappable/'
rows = [l.rstrip('\n').split('\t') for l in open(ROOT + 'tools/bible/brackets.tsv', encoding='utf-8')][1:]
parts = [((6, 9), (6, 22)), ((7, 1), (7, 16)), ((7, 17), (7, 24)), ((8, 1), (8, 14)), ((8, 15), (8, 22)), ((9, 1), (9, 17))]
verses = [l.split('\t') for l in open(ROOT + 'tools/bible/synodal.tsv', encoding='utf-8')]
nverses = [0] * 6
for b, c, v, t in verses:
    if b != 'Быт':
        continue
    cv = (int(c), int(v))
    for i, (a, z) in enumerate(parts):
        if a <= cv <= z:
            nverses[i] += 1
tot = {}
kinds = {}
for r in rows:
    if r[0] != 'Быт':
        continue
    cv = (int(r[1]), int(r[2]))
    for i, (a, z) in enumerate(parts):
        if a <= cv <= z:
            k = r[6]
            kinds[k] = kinds.get(k, 0) + 1
            if k not in ('gloss', 'damage'):
                tot[i] = tot.get(i, 0) + 1
print('Ной и потоп: виды скобок —', kinds)
s = 0
for i in range(6):
    n = tot.get(i, 0)
    s += n
    print(f'  часть {i + 1}: стихов {nverses[i]}, скобок с метками {n}, лишних остановок VoiceOver ≥ {3 * n}')
print(f'Всего: стихов {sum(nverses)}, скобок с метками {s}; лишних остановок ≥ {3 * s} '
      f'(при одной остановке на стих — {sum(nverses)} остановок без меток)')
