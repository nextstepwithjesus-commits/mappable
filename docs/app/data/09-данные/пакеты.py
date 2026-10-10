"""Рецензия данных на 09 § 5.3, § 6.1, § 7.2. Запуск из корня:
  npm run -s base:bundle && python3 -I docs/app/data/09-данные/пакеты.py
Считает: полный текст по книгам; сколько полного текста уже лежит в пакете «стихи»;
сколько займёт на устройстве (Cache Storage хранит тело ответа без сжатия передачи);
время передачи на «медленной 4G» Lighthouse (150 мс RTT, 1,6 Мбит/с); число записей по коллекциям.
"""
import glob, gzip, json, os, subprocess

ROOT = os.getcwd()
DIST = os.path.join(ROOT, 'dist-data')
KB = 1024
gz = lambda b: len(gzip.compress(b, 9))


def br(b):
    try:
        return len(subprocess.run(['brotli', '-c', '-q', '11'], input=b, capture_output=True, check=True).stdout)
    except Exception:
        return None


print('== 1. Полный текст по книгам (как пакет «полный текст по книгам»)')
books = {}
order = []
for line in open(os.path.join(ROOT, 'tools/bible/synodal.tsv'), encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) < 4:
        continue
    if p[0] not in books:
        books[p[0]] = {}
        order.append(p[0])
    books[p[0]][f'{p[1]}:{p[2]}'] = p[3]
sizes = []
for b in order:
    s = json.dumps({'book': b, 'verses': books[b]}, ensure_ascii=False, separators=(',', ':')).encode()
    sizes.append((gz(s), b, len(s)))
tot_gz = sum(x[0] for x in sizes)
tot_raw = sum(x[2] for x in sizes)
sizes.sort(reverse=True)
print(f'  книг {len(sizes)}; всего gzip {tot_gz / KB:.0f} КБ, без сжатия {tot_raw / KB / KB:.2f} МБ')
print('  наибольшие:', ', '.join(f'{b} {g / KB:.0f} КБ' for g, b, _ in sizes[:5]))
print(f'  сверх 80 КБ (бюджет пакета «стихи» на книгу): {sum(1 for g, *_ in sizes if g > 80 * KB)}')
alltext = json.dumps(books, ensure_ascii=False, separators=(',', ':')).encode()
b11 = br(alltext)
print(f'  одним пакетом JSON: gzip {gz(alltext) / KB / KB:.2f} МБ' + (f', brotli-11 {b11 / KB / KB:.2f} МБ' if b11 else ''))

print('\n== 2. Пакет «стихи» (процитированные) против полного текста')
cited = 0
cited_gz = 0
total_verses = sum(len(v) for v in books.values())
for f in glob.glob(os.path.join(DIST, 'verses', '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    cited += len(d['verses'])
    cited_gz += gz(open(f, 'rb').read())
print(f'  процитировано стихов {cited} из {total_verses} ({100 * cited / total_verses:.0f} %); пакет «стихи» {cited_gz / KB:.0f} КБ gzip — '
      f'{100 * cited_gz / tot_gz:.0f} % от полного текста по книгам; если полный текст всё равно скачивается фоном, это дубль')

print('\n== 3. Фоновая загрузка (09 § 6.1) и место на устройстве')
man = json.load(open(os.path.join(DIST, 'manifest.json'), encoding='utf-8'))
raw = {k: 0 for k in ('index', 'cards', 'verses')}
gzs = dict(man['sizesGzip'])
for rel, s in man['files'].items():
    key = 'index' if rel == 'index.json' else rel.split('/')[0]
    raw[key] = raw.get(key, 0) + s['raw']
raw['полный текст'] = tot_raw
gzs['полный текст'] = tot_gz
for k in raw:
    print(f'  {k}: передача gzip {gzs[k] / KB:.0f} КБ; на устройстве {raw[k] / KB:.0f} КБ')
print(f'  итого: передача {sum(gzs.values()) / KB / KB:.2f} МБ; на устройстве {sum(raw.values()) / KB / KB:.2f} МБ (без оболочки, страниц и карты)')
bps = 1.6e6 / 8
for name, n in (('критический путь 300 КБ', 300 * KB), ('фоновая загрузка данных', sum(gzs.values())), ('полный текст', tot_gz), ('карта 25 МБ', 25 * KB * KB)):
    print(f'  {name}: на «медленной 4G» Lighthouse {n / bps:.1f} с только передача (без RTT и разбора)')
print('  первый показ: DNS + TCP + TLS + запрос HTML ≈ 4 RTT = 0,6 с до первого байта; 2,5 с − 0,6 с = 1,9 с ≈ '
      f'{1.9 * bps / KB:.0f} КБ, которые успеют прийти до LCP при идеальной загрузке канала')

print('\n== 4. Записи базы по коллекциям (знаменатель допуска § 5.2)')
for f in sorted(glob.glob(os.path.join(ROOT, 'base', '*.json')) + glob.glob(os.path.join(ROOT, 'base', 'actors', '*.json')) + glob.glob(os.path.join(ROOT, 'base', 'lines', '*.json'))):
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    if isinstance(d, dict) and isinstance(d.get('items'), list):
        n = len(d['items'])
        nested = sum(len(x.get('facts', [])) for x in d['items'] if isinstance(x, dict))
        st = (d.get('prov') or {}).get('status')
        print(f'  {os.path.relpath(f, ROOT)}: записей {n}' + (f', утверждений внутри {nested}' if nested else '') + f'; статус файла {st}')
    else:
        print(f'  {os.path.relpath(f, ROOT)}: без items (не входит в счёт 09-числа.py)')
