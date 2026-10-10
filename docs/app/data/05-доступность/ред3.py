"""Рецензия доступности на 05 ред. 3: длинный список общей карты, порядок стрелок на карте.
Запуск из корня: python3 -I docs/app/data/05-доступность/ред3.py
Берёт функции части Б и Д из docs/app/data/05-числа.py (выполняет его до морских отрезков, вывод скрыт)."""
import io, contextlib, collections, math, json, sys
src = open('docs/app/data/05-числа.py', encoding='utf-8').read()
src = src.split('# Морские отрезки')[0]
G = {'__name__': 'n05'}
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(src, '05-числа.py', 'exec'), G)
rows, degree, rival, best_point, merc, kind_all = (G[k] for k in ('rows', 'degree', 'rival', 'best_point', 'merc', 'kind_all'))
OSIS = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer '
        'Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal '
        'Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()
BI = {b: i for i, b in enumerate(OSIS)}

def first(r):
    ex = json.loads(r['extra']) if isinstance(r.get('extra'), str) else (r.get('extra') or {})
    best = None
    for o in ex.get('osises', []):
        p = o.split('.')
        if p[0] not in BI: continue
        k = (BI[p[0]], int(p[1]), int(p[2]) if len(p) > 2 else 0)
        best = k if best is None or k < best else best
    return best or (999, 0, 0)

order = sorted(rows, key=first)
pos = {r['friendly_id']: i + 1 for i, r in enumerate(order)}
print(f'1. Список общей карты: строк {len(rows)}; порядок по умолчанию — по первому упоминанию')
for n in ('Jerusalem', 'Bethel 1', 'Shechem', 'Hebron', 'Capernaum', 'Nazareth', 'Rome', 'Antioch 1', 'Ephesus'):
    if n in pos: print(f'   {n}: строка {pos[n]} — в Listbox столько же смахиваний VoiceOver/TalkBack от начала списка')
byb = collections.Counter(OSIS[first(r)[0]] if first(r)[0] < 999 else 'нет' for r in rows)
print('   группы «по книге первого упоминания», самые большие:', byb.most_common(6))
print(f'   групп больше 200 строк: {sum(1 for v in byb.values() if v > 200)}; больше 100: {sum(1 for v in byb.values() if v > 100)}')
ws = list(byb.values())
# средняя позиция внутри группы (смахиваний после заголовка группы)
print(f'   среднее смахиваний внутри группы книги (до случайной строки): {sum(v*(v+1)/2 for v in ws)/sum(ws):.0f}')

# 2. Стрелки на общей карте по порядку двойника: окно ядра, 912x612, порог 24 и 44
signed = []
for r in rows:
    if kind_all(r) == 'point' and degree(r)[0] != 'не установлено' and not rival(r):
        signed.append(r)
core = [r for r in signed if best_point(r) and 34.0 <= best_point(r)[0] <= 36.6 and 30.5 <= best_point(r)[1] <= 33.4]
PAD = G.get('PAD', 40)
xs = [merc(34.0, 30.5), merc(36.6, 33.4)]
W, H = 912, 612
s = min((W - 2*PAD)/abs(xs[1][0]-xs[0][0]), (H - 2*PAD)/abs(xs[1][1]-xs[0][1]))
def nv(r):
    ex = json.loads(r['extra']) if isinstance(r.get('extra'), str) else (r.get('extra') or {})
    return len(ex.get('osises', []))
xy = {r['friendly_id']: (merc(*best_point(r)[:2])[0]*s, -merc(*best_point(r)[:2])[1]*s) for r in core}
for gap in (24, 44):
    ordr = sorted(core, key=lambda r: -nv(r))
    leader, members = {}, collections.defaultdict(list)
    for r in ordr:
        n = r['friendly_id']
        if n in leader: continue
        leader[n] = n; members[n].append(n)
        for m in ordr:
            mm = m['friendly_id']
            if mm not in leader and math.dist(xy[n], xy[mm]) < gap:
                leader[mm] = n; members[n].append(mm)
    stops = sorted(core, key=first)
    focus = []  # что получает фокус по стрелке: сам знак или кнопка группы
    for r in stops:
        L = leader[r['friendly_id']]
        tgt = r['friendly_id'] if len(members[L]) == 1 else 'G:' + L
        if not focus or focus[-1] != tgt: focus.append(tgt)
    ingroup = sum(1 for r in core if len(members[leader[r['friendly_id']]]) > 1)
    def pt(t):
        return xy[t[2:]] if t.startswith('G:') else xy[t]
    jumps = [math.dist(pt(a), pt(b)) for a, b in zip(focus, focus[1:])]
    jumps.sort()
    revisit = len(focus) - len(set(focus))
    print(f'2. Окно ядра 912×612, порог {gap} px: знаков {len(core)}, кнопок (знаков и групп) {len(members)}; '
          f'в группах {ingroup} знаков ({100*ingroup/len(core):.0f} %) — до них стрелкой не дойти, только группой')
    print(f'   стрелка по порядку двойника: остановок {len(focus)}, из них повторных заходов в ту же кнопку {revisit}; '
          f'скачок между соседними остановками — медиана {jumps[len(jumps)//2]:.0f} px, '
          f'90-й процентиль {jumps[int(len(jumps)*0.9)]:.0f} px (окно {W}×{H})')
    # обход по стороне света: ближайший сосед — средний скачок
    nn = []
    for a in members:
        d = min(math.dist(xy[a], xy[b]) for b in members if b != a)
        nn.append(d)
    nn.sort()
    print(f'   для сравнения: ближайший сосед кнопки — медиана {nn[len(nn)//2]:.0f} px')

# 3. Предварительный счёт Г8 на телефоне 360×560 (VoiceOver iOS / TalkBack, смахивание вправо = 1 жест),
#    по эскизу 11.6 и двойнику 11.1. Начало — фокус на h1 «Путь Аврама».
before = ['h2 «Карта»', 'абзац описания', 'ссылка «К списку»']
rows_to5 = ['1 Ур', '2 Харран', '— земля Ханаанская', '3 Сихем', '4 Вефиль и Гай', '— направление', '5 Египет']
a = len(before) + 1 + len(rows_to5) - 1 + 1   # смахивания до ссылки + двойное касание + строки до 5-й (фокус на 1-й)
print(f'3. Г8 телефон, модель «Listbox, ссылка „К списку“ раскрывает лист и ставит фокус на строку 1»: {a} жестов')
for cols in (3, 5):
    b = len(before) + 1 + cols + cols * (len(rows_to5) - 1) + 1  # шапка таблицы + ячейки строк
    print(f'   модель «таблица, {cols} столбца(ов), смахивание по ячейкам»: {b} жестов (порог Г8 — 10)')
map_btns = ['элемент карты', 'указатель Харран', 'группа Ханаана (8 мест)', 'указатель Ур', 'Египет (5)',
            'Крупнее', 'Мельче', 'линейка', 'берег — современный', 'Источники', 'ручка листа']
print(f'   без ссылки «К списку» (смахивать через карту и ручку листа до шапки листа): {len(before) + len(map_btns)} жестов '
      'только до листа; затем раскрыть лист и строки')
