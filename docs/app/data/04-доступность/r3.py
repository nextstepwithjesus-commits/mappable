# Рецензия доступности на 04 ред. 3: строки «Правителей», группы строк, указатель эпох при 200 % текста
import json, glob, sys, collections
R = sys.argv[1]
CH = json.load(open(R + '/base/chrono.json', encoding='utf-8'))['items']
A = {}
for f in glob.glob(R + '/base/actors/*.json'):
    for a in json.load(open(f, encoding='utf-8'))['items']:
        A[a['id']] = a
print('== 1. «Правители»: строки таблицы ==')
reigns = [(x['actor'], r) for x in CH for r in x['chrono'].get('reign', [])]
print('записей царствования:', len(reigns))
ys = [r.get(k) for _, r in reigns for k in ('start', 'end') if isinstance(r.get(k), int)]
lo, hi = min(ys), max(ys)
print('годы царствований в данных: от', lo, 'до', hi, '— «Каждый год»:', hi - lo, 'строк')
named = set()
for _, r in reigns:
    for k in ('start', 'end'):
        if isinstance(r.get(k), int): named.add(r[k])
print('годов начала и конца царствований (нижняя граница строк по умолчанию):', len(named))
# переходы по умолчанию: строки + свёрнутые строки «Ещё N лет»
s = sorted(named); gaps = sum(1 for a, b in zip(s, s[1:]) if b - a > 1)
print('свёрнутых строк «Ещё N лет» между ними:', gaps, '; всего строк по умолчанию не меньше', len(s) + gaps)
for over in ('Иудея', 'Израиль'):
    n = sum(1 for _, r in reigns if r.get('over') == over)
    print('  столбец', over, '— царствований', n)
print('== 2. Группы строк по ролям (поле roles) ==')
rc = collections.Counter(r for a in A.values() for r in set(a.get('roles', [])))
for r in ('king', 'judge', 'prophet', 'priest', 'high_priest', 'apostle'):
    print(' ', r, rc.get(r, 0))
print('  всего ролей:', len(rc), '; частые:', rc.most_common(12))
print('== 3. Смахивания VoiceOver/TalkBack по группе строк ==')
# в строке: имя (заголовок строки) + полоса + знаки событий; самый бедный случай — 2 элемента на строку
for name, n in (('Цари Иудеи + Цари Израиля', 42), ('Пророки', rc.get('prophet', 0))):
    print(' ', name, n, 'строк: не меньше', 2 * n, 'смахиваний насквозь; с заголовками групп', 2 * n + 2)
print('== 4. Указатель эпох при тексте 200 % (ширины имён удвоены) ==')
W = {'До Потопа': 62, 'После Потопа': 83, 'Патриархи': 65, 'В Египте': 51, 'Исход': 37, 'Завоевание': 71, 'Судьи': 36, 'Царство': 50, 'Два царства': 73, 'Иудея одна': 69, 'Плен': 30, 'Возвращение': 81, 'Между Заветами': 101, 'Евангелия': 62, 'Апостолы': 58, 'После канона': 82}
for k in (1, 2):
    w = {n: v * k + 6 for n, v in W.items()}
    tot = sum(w.values()) + 12
    top3 = sorted(w.values())[-3:]
    for C in (1152, 944, 760):
        rest = (C - 12 - sum(top3)) / 13
        print('  текст %d%%: все имена %.0f px; содержимое %d: все помещаются — %s; худший случай (3 длинных эпохи в окне) остальные клетки %.1f px%s' % (k * 100, tot, C, 'да' if tot <= C else 'нет', rest, ' < 24 (2.5.8)' if rest < 24 else ''))
    print('  высота клетки: строка текста %d px + поля 8 + 8 = %d px (в документе — 32 px)' % (16 * k, 16 * k + 16))
