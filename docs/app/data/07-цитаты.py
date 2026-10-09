"""Проверка цитат документа 07: слова в «» должны быть в тексте указанных стихов.

Запуск из корня: python3 -I docs/app/data/07-цитаты.py [путь к документу]
Цитата проверяется, если сразу за ней (не дальше 60 знаков, до следующей «)
стоит адрес стиха. Сравнение без регистра, ё, знаков препинания и квадратных
скобок; многоточие делит цитату на части, каждая часть ищется отдельно.
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


def parse_refs(s):
    """Адреса подряд, начиная с первого; книга наследуется."""
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
            for v in range(int(a), int(z or a) + 1):
                out.append((book, ch, v))
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
}

src = open(DOC, encoding='utf-8').read()
flat = re.sub(r'\s+', ' ', src)
checked = failed = 0
for m in re.finditer(r'«([^«»]{8,}?)»', flat):
    q = m.group(1)
    if q in ATLAS:
        continue
    tail = flat[m.end():m.end() + 160]
    nxt = tail.find('«')
    if nxt != -1:
        tail = tail[:nxt]
    r = REF_RE.search(tail)
    if not r or r.start() > 60 or not r.group(1):
        continue
    refs = parse_refs(tail[r.start():])
    if not refs:
        continue
    missing = [x for x in refs if x not in TEXT]
    body = norm(' '.join(TEXT.get(x, '') for x in refs))
    parts = [norm(p) for p in re.split(r'…|\.\.\.', q) if len(norm(p).split()) >= 2]
    if not parts:
        continue
    checked += 1
    bad = [p for p in parts if p not in body]
    if missing or bad:
        failed += 1
        where = ', '.join(f'{b} {c}:{v}' for b, c, v in refs[:6])
        print(f'НЕ НАЙДЕНО  «{q[:90]}»  ← {where}' + (f'  (нет стиха: {missing})' if missing else ''))
print(f'Проверено цитат: {checked}; не найдено: {failed}')
