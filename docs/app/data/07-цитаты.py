"""Проверка цитат документа 07: слова в «» должны быть в тексте указанных стихов.

Запуск из корня: python3 -I docs/app/data/07-цитаты.py [путь к документу]
Цитата проверяется, если сразу за ней (не дальше 60 знаков, до следующей «)
стоит адрес стиха. Несколько цитат подряд перед одним адресом (между ними не
больше 25 знаков без адреса) проверяются вместе.

Правила сравнения:
- без регистра, ё, знаков препинания и квадратных скобок; по целым словам;
- многоточие делит цитату на части; части ищутся по порядку;
- адрес делится на единицы: отдельный стих или непрерывный диапазон;
- одна цитата должна найтись в КАЖДОЙ единице своего адреса;
- в цепочке цитат каждая цитата должна найтись хотя бы в одной единице,
  и в каждой единице — хотя бы одна цитата.

Не проверяются: цитаты с адресом перед ними, адрес без названия книги,
адрес дальше 60 знаков; форма имени в строке без кавычек.
"""
import re, sys

DOC = sys.argv[1] if len(sys.argv) > 1 else 'docs/app/07-КАРТОЧКА.md'
TEXT = {}
for line in open('tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t
BOOKS = sorted({k[0] for k in TEXT}, key=len, reverse=True)
BOOK_RE = '|'.join(re.escape(b[0] + ' ' + b[1:]) if b[0].isdigit() else re.escape(b) for b in BOOKS)
BOOK_RE += '|' + '|'.join(re.escape(b) for b in BOOKS if b[0].isdigit())
REF_RE = re.compile(r'(?:(?<![\w])(' + BOOK_RE + r')\s+)?(\d+):(\d+(?:[–-]\d+)?(?:,\s*\d+(?:[–-]\d+)?(?!:))*)')


def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'[\[\]]', '', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return ' '.join(s.split())


def parse_units(s):
    """Адреса подряд, начиная с первого; книга наследуется. Список единиц."""
    out, book = [], None
    pos = 0
    for m in REF_RE.finditer(s):
        gap = s[pos:m.start()]
        if out and not re.fullmatch(r'[\s;,]*', gap):
            break
        if m.group(1):
            book = m.group(1).replace(' ', '')
        if not book:
            break
        ch = int(m.group(2))
        for part in re.split(r',\s*', m.group(3)):
            a, _, z = part.replace('–', '-').partition('-')
            out.append([(book, ch, v) for v in range(int(a), int(z or a) + 1)])
        pos = m.end()
    return out


# Слова атласа и интерфейса, названия трудов, примеры фраз «Кратко» и записей
# данных: это не цитаты Писания, хотя рядом стоит адрес стиха.
ATLAS = {
    'в рассказе Иисуса', 'в видении', 'в притче', 'Взят Богом', 'Бог Отец',
    'так следует из сравнения стихов', 'по надписанию электронного текста, не сверено',
    'сын Ваасы', 'Писание говорит:',
    'Толкование на Евангелие от Луки', 'An Exposition of the Old and New Testament',
    'Толковая Библия', 'The Birth of the Messiah', "The Messiah's Royal Lineage",
    'Где сказано, что Давиду было тридцать лет при воцарении?',
    'Был с апостолами в горнице (Деян 1:13).', 'С её ведома муж утаил часть цены (Деян 5:2).',
    'После вознесения пребывал с Апостолами в горнице', 'после вознесения',
    'приложил печать к завету', 'Деян 1:9–13',
    'Пребывал в горнице с Петром, Иаковом, Иоанном и другими (Деян 1:13).',
    'притча', 'Писание', 'Кратко', 'пророчество', 'Luke', 'толк.', 'Кто Он', 'Род',
    'Смерть, воскресение, вознесение', 'Откуда',
    'Богородица', 'Иоанн Богослов', 'Иосиф Обручник', 'Предтеча',
}

src = open(DOC, encoding='utf-8').read()
flat = re.sub(r'\s+', ' ', src)


def found(q, unit):
    text = ' ' + norm(' '.join(TEXT.get(x, '') for x in unit)) + ' '
    pos = 0
    for p in [norm(x) for x in re.split(r'…|\.\.\.', q) if norm(x)]:
        i = text.find(' ' + p + ' ', pos)
        if i < 0:
            return False
        pos = i + len(p)
    return True


quotes = [(m.start(), m.end(), m.group(1)) for m in re.finditer(r'«([^«»]{3,}?)»', flat)]
checked = failed = 0
chain = []
for k, (a, z, q) in enumerate(quotes):
    nxt = quotes[k + 1][0] if k + 1 < len(quotes) else len(flat)
    tail = flat[z:min(nxt, z + 160)]
    r = REF_RE.search(tail)
    if q not in ATLAS:
        chain.append(q)
    if not r or r.start() > 60 or not r.group(1):
        if nxt - z <= 25 and not r:
            continue                      # цепочка: следующая цитата даст адрес
        chain = []
        continue
    units = parse_units(tail[r.start():])
    qs, chain = chain, []
    if not units or not qs:
        continue
    missing = [x for u in units for x in u if x not in TEXT]
    where = '; '.join(', '.join(f'{b} {c}:{v}' for b, c, v in u) for u in units[:6])
    checked += len(qs)
    if missing:
        failed += 1
        print(f'НЕТ СТИХА  {missing}  ← «{qs[0][:60]}»')
        continue
    if len(qs) == 1:
        bad = [u for u in units if not found(qs[0], u)]
        if bad:
            failed += 1
            print(f'НЕ НАЙДЕНО  «{qs[0][:90]}»  ← {where}' + ('' if len(bad) == len(units) else '  (не во всех стихах)'))
    else:
        bad_q = [x for x in qs if not any(found(x, u) for u in units)]
        bad_u = [u for u in units if not any(found(x, u) for x in qs)]
        if bad_q or bad_u:
            failed += 1
            print(f'ЦЕПОЧКА НЕ СХОДИТСЯ  {["«"+x[:40]+"»" for x in bad_q]}  ← {where}')
print(f'Проверено цитат: {checked}; не найдено: {failed}')
