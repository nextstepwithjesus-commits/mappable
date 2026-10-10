"""Числа документа 09 «Техническая основа».

Запуск из корня: npm run -s base:bundle -- --probe && python3 -I docs/app/data/09-числа.py
Читает сборку уровня «проба» dist-data-probe/ (её делает tools/base/bundle.ts; сборка «выпуск» пуста, пока нет проверенных записей), базу base/ и текст tools/bible/synodal.tsv.
Ничего не пишет.
"""
import glob, gzip, json, os, sys

ROOT = os.getcwd()
DIST = os.path.join(ROOT, 'dist-data-probe')
KB = 1024


def gz(path):
    with open(path, 'rb') as f:
        return len(gzip.compress(f.read(), 9))


def part(title):
    print(f'\n== {title}')


if not os.path.exists(os.path.join(DIST, 'manifest.json')):
    sys.exit('нет dist-data-probe/manifest.json: сначала npm run -s base:bundle -- --probe')

m = json.load(open(os.path.join(DIST, 'manifest.json'), encoding='utf-8'))

part('1. Сборка сейчас (опись выпуска)')
print('коммит сборки:', m.get('commit'), '; уровень допуска:', m.get('admit'))
for k, v in m['counts'].items():
    print(f'  {k}: {v}')
for k, v in m['sizesGzip'].items():
    print(f'  {k}: {v / KB:.1f} КБ gzip')

part('2. Части сборки против бюджетов 08 § 9.3 (карточки тома ≤ 64 КБ, стихи книги ≤ 80 КБ)')
for sub, lim in (('cards', 64), ('verses', 80)):
    files = sorted(glob.glob(os.path.join(DIST, sub, '*.json')))
    sizes = sorted(((gz(f) / KB, os.path.basename(f)) for f in files), reverse=True)
    if not sizes:
        print(f'  {sub}: частей нет'); continue
    over = [s for s in sizes if s[0] > lim]
    print(f'  {sub}: частей {len(sizes)}; наибольшая {sizes[0][1]} {sizes[0][0]:.1f} КБ; '
          f'сверх {lim} КБ: {len(over)}' + (f' ({", ".join(f"{n} {s:.1f}" for s, n in over)})' if over else ''))

part('3. Полный Синодальный текст')
syn = os.path.join(ROOT, 'tools', 'bible', 'synodal.tsv')
print(f'  synodal.tsv: {os.path.getsize(syn) / KB / KB:.2f} МБ; gzip {gz(syn) / KB / KB:.2f} МБ')

part('4. Статусы записей базы по допуску (tools/base/admit.ts, подписи — base/checks.json)')
import subprocess, re
out = subprocess.run(['npm', 'run', '-s', 'base:validate'], capture_output=True, text=True, cwd=ROOT).stdout
line = next((l for l in out.splitlines() if l.startswith('записей:')), 'нет строки «записей:» в выводе base:validate')
print(' ', line)
nums = [int(x) for x in re.findall(r'(\d+)', line)[:3]]
if len(nums) == 3:
    print(f'  всего записей допуска: {sum(nums)}')
checks = json.load(open(os.path.join(ROOT, 'base', 'checks.json'), encoding='utf-8'))
print(f'  подписей в base/checks.json: {len(checks.get("items", []))}')

part('5. Критический путь до LCP (08 § 9.3 и приложение А, ч. 22 — читается из 08)')
t08 = open(os.path.join(ROOT, 'docs', 'app', '08-ДИЗАЙН-СИСТЕМА.md'), encoding='utf-8').read()
m8 = re.search(r'HTML, CSS, код \((\d+)\) \+ Literata прямой \((\d+)\) \+ Golos \((\d+)\): (\d+) КБ', t08)
if m8:
    code, lit, golos, total = map(int, m8.groups())
    print(f'  08: HTML, CSS и код {code} + Literata {lit} + Golos {golos} = {total} КБ; бюджет 300; запас {300 - total} КБ')
    print(f'  бюджет 09 для HTML, CSS и кода вместе: {code} КБ (одно число с 08)')
else:
    print('  строка ч. 22 в 08 не найдена')

part('6. Пакет полного текста по книгам (gzip-9)')
from collections import OrderedDict
books = OrderedDict()
for l in open(syn, encoding='utf-8'):
    r = l.rstrip('\n').split('\t')
    if len(r) > 3:
        books.setdefault(r[0], []).append(l)
bs = sorted(((len(gzip.compress(''.join(v).encode(), 9)) / KB, k) for k, v in books.items()), reverse=True)
print(f'  книг {len(bs)}; всего {sum(b for b, _ in bs) / KB:.2f} МБ; наибольшие: ' + ', '.join(f'{k} {b:.1f} КБ' for b, k in bs[:3]))
print(f'  сверх 96 КБ: {sum(1 for b, _ in bs if b > 96)}; сверх 80 КБ: {sum(1 for b, _ in bs if b > 80)}')
