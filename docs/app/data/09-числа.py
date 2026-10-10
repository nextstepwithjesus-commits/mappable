"""Числа документа 09 «Техническая основа».

Запуск из корня: npm run -s base:bundle && python3 -I docs/app/data/09-числа.py
Читает сборку dist-data/ (её делает tools/base/bundle.ts), базу base/ и текст tools/bible/synodal.tsv.
Ничего не пишет.
"""
import glob, gzip, json, os, sys

ROOT = os.getcwd()
DIST = os.path.join(ROOT, 'dist-data')
KB = 1024


def gz(path):
    with open(path, 'rb') as f:
        return len(gzip.compress(f.read(), 9))


def part(title):
    print(f'\n== {title}')


if not os.path.exists(os.path.join(DIST, 'manifest.json')):
    sys.exit('нет dist-data/manifest.json: сначала npm run -s base:bundle')

m = json.load(open(os.path.join(DIST, 'manifest.json'), encoding='utf-8'))

part('1. Сборка сейчас (опись выпуска)')
print('коммит сборки:', m.get('commit'))
for k, v in m['counts'].items():
    print(f'  {k}: {v}')
for k, v in m['sizesGzip'].items():
    print(f'  {k}: {v / KB:.1f} КБ gzip')

part('2. Части сборки против бюджетов 08 § 9.3 (карточки тома ≤ 64 КБ, стихи книги ≤ 80 КБ)')
for sub, lim in (('cards', 64), ('verses', 80)):
    files = sorted(glob.glob(os.path.join(DIST, sub, '*.json')))
    sizes = sorted(((gz(f) / KB, os.path.basename(f)) for f in files), reverse=True)
    over = [s for s in sizes if s[0] > lim]
    print(f'  {sub}: частей {len(sizes)}; наибольшая {sizes[0][1]} {sizes[0][0]:.1f} КБ; '
          f'сверх {lim} КБ: {len(over)}' + (f' ({", ".join(f"{n} {s:.1f}" for s, n in over)})' if over else ''))

part('3. Полный Синодальный текст')
syn = os.path.join(ROOT, 'tools', 'bible', 'synodal.tsv')
print(f'  synodal.tsv: {os.path.getsize(syn) / KB / KB:.2f} МБ; gzip {gz(syn) / KB / KB:.2f} МБ')

part('4. Статусы записей базы (что пройдёт допуск «проверено», Б-1)')
statuses = {}
checked_sig = 0


def walk(prov_default, items):
    global checked_sig
    for it in items:
        p = it.get('prov') if isinstance(it, dict) else None
        st = (p or {}).get('status') or prov_default or 'нет'
        statuses[st] = statuses.get(st, 0) + 1
        if p and p.get('check'):
            checked_sig += 1
        if isinstance(it, dict):
            for key in ('facts', 'claims'):
                if isinstance(it.get(key), list):
                    walk(st, it[key])


for f in sorted(glob.glob(os.path.join(ROOT, 'base', '*.json')) + glob.glob(os.path.join(ROOT, 'base', 'actors', '*.json'))):
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    if isinstance(d, dict) and isinstance(d.get('items'), list):
        walk((d.get('prov') or {}).get('status'), d['items'])
for k, v in sorted(statuses.items()):
    print(f'  {k}: {v}')
print(f'  записей с подписью проверки (check): {checked_sig}')
print(f'  записей со статусом checked: {statuses.get("checked", 0)}')

part('5. Критический путь: что остаётся коду и стилям из 300 КБ (08 § 9.3)')
fonts_critical = 144  # 08 § 9.3, приложение А, ч. 11 — шрифты в критическом пути
html_css = 30         # оценка: HTML и CSS первого экрана
left = 300 - fonts_critical - html_css
print(f'  300 − шрифты {fonts_critical} − HTML и CSS {html_css} (оценка) = {left} КБ на код и данные первого экрана')
