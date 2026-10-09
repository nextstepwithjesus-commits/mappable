#!/usr/bin/env python3
"""Сборка кликабельного эскиза главного экрана «Библия наглядно» (R11 § 8).

Запуск из корня репозитория:
    python3 -I prototypes/main-screen/build.py

Берёт настоящие данные из base/ (лица, семьи, линии, эпохи) и тексты стихов
из tools/bible/synodal.tsv (файл не меняется). Собирает ОДИН самодостаточный
файл prototypes/main-screen/index.html: без сети, шрифтов и библиотек.

Сборка падает, если:
- адрес стиха не существует;
- цитата в «» не найдена в своих стихах;
- имя узла схемы не стоит в стихе, на который узел ссылается;
- числа линий Мессии разошлись с base/lines/*.json.

Код эскиза — не продукт: в src/ ничего не переносится (регламент, § 1).
"""
import glob
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'index.html'
E = html.escape
NB = ' '

# ───────────────────────── Синодальный текст ─────────────────────────
TEXT = {}
ORDER = []
for line in open(ROOT / 'tools/bible/synodal.tsv', encoding='utf-8'):
    b, c, v, t = line.rstrip('\n').split('\t', 3)
    TEXT[(b, int(c), int(v))] = t
    if not ORDER or ORDER[-1] != b:
        ORDER.append(b)
BOOKS = set(ORDER)
CHAPTER_LEN = {}
for (b, c, v) in TEXT:
    CHAPTER_LEN[(b, c)] = max(CHAPTER_LEN.get((b, c), 0), v)

BOOK_FULL = {
    'Быт': 'Бытие', 'Исх': 'Исход', 'Лев': 'Левит', 'Чис': 'Числа', 'Втор': 'Второзаконие',
    'Нав': 'Иисус Навин', 'Суд': 'Судьи', 'Руф': 'Руфь', '1Цар': '1 Царств', '2Цар': '2 Царств',
    '3Цар': '3 Царств', '4Цар': '4 Царств', '1Пар': '1 Паралипоменон', '2Пар': '2 Паралипоменон',
    'Езд': 'Ездра', 'Неем': 'Неемия', 'Есф': 'Есфирь', 'Иов': 'Иов', 'Пс': 'Псалтирь',
    'Притч': 'Притчи', 'Еккл': 'Екклесиаст', 'Песн': 'Песнь песней', 'Ис': 'Исаия',
    'Иер': 'Иеремия', 'Плач': 'Плач Иеремии', 'Иез': 'Иезекииль', 'Дан': 'Даниил', 'Ос': 'Осия',
    'Иоил': 'Иоиль', 'Ам': 'Амос', 'Авд': 'Авдий', 'Ион': 'Иона', 'Мих': 'Михей', 'Наум': 'Наум',
    'Авв': 'Аввакум', 'Соф': 'Софония', 'Агг': 'Аггей', 'Зах': 'Захария', 'Мал': 'Малахия',
    'Мф': 'От Матфея', 'Мк': 'От Марка', 'Лк': 'От Луки', 'Ин': 'От Иоанна', 'Деян': 'Деяния',
    'Иак': 'Иакова', '1Пет': '1 Петра', '2Пет': '2 Петра', '1Ин': '1 Иоанна', '2Ин': '2 Иоанна',
    '3Ин': '3 Иоанна', 'Иуд': 'Иуды', 'Рим': 'Римлянам', '1Кор': '1 Коринфянам',
    '2Кор': '2 Коринфянам', 'Гал': 'Галатам', 'Еф': 'Ефесянам', 'Флп': 'Филиппийцам',
    'Кол': 'Колоссянам', '1Фес': '1 Фессалоникийцам', '2Фес': '2 Фессалоникийцам',
    '1Тим': '1 Тимофею', '2Тим': '2 Тимофею', 'Тит': 'Титу', 'Флм': 'Филимону', 'Евр': 'Евреям',
    'Откр': 'Откровение',
}
assert set(BOOK_FULL) == BOOKS, BOOKS ^ set(BOOK_FULL)

PART_RE = re.compile(r'^(?:(\d?)\s*([А-ЯЁ][а-яё]+)\s+)?(\d+)(?::([\d,\-–\s]+))?$')


def units(ref):
    """'Быт 11:31; 12:4-5' → [[ключи], [ключи]]; запятая и «;» делят единицы."""
    out, book = [], None
    for part in re.split(r';\s*', ref.strip()):
        m = PART_RE.match(part.strip())
        if not m:
            raise ValueError(f'неверный адрес: {ref}')
        if m.group(2):
            book = (m.group(1) or '') + m.group(2)
        if book not in BOOKS:
            raise ValueError(f'нет книги: {ref}')
        ch = int(m.group(3))
        if (book, ch) not in CHAPTER_LEN:
            raise ValueError(f'нет главы: {ref}')
        if m.group(4) is None:
            out.append([(book, ch, v) for v in range(1, CHAPTER_LEN[(book, ch)] + 1)])
            continue
        for piece in m.group(4).split(','):
            a, _, z = piece.strip().replace('–', '-').partition('-')
            keys = [(book, ch, v) for v in range(int(a), int(z or a) + 1)]
            for k in keys:
                if k not in TEXT:
                    raise ValueError(f'нет стиха {k} в {ref}')
            out.append(keys)
    return out


def key(k):
    return f'{k[0]} {k[1]}:{k[2]}'


def disp(ref):
    """Адрес для показа: «1 Пар 3:5», тире в диапазоне, неразрывные пробелы."""
    s = re.sub(r'(?<![\w])(\d)([А-ЯЁ])', r'\1' + NB + r'\2', ref)
    s = s.replace('-', '–')
    s = re.sub(r'([а-яё]) (\d)', r'\1' + NB + r'\2', s)
    return s


def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'[\[\]]', '', s)
    s = re.sub(r'[^\w\s]', ' ', s)
    return ' '.join(s.split())


def verses_text(ref):
    return ' '.join(TEXT[k] for u in units(ref) for k in u)


USED = set()          # стихи, которые попадут во вклейки
QUOTES = []           # (цитата, адрес) — для отчёта


def check_quote(q, ref):
    raw = verses_text(ref)
    nobr = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', raw)
    for label, src in (('', raw), (' (без слов в скобках)', nobr)):
        if label and re.search(r'[\[\(]', q):
            continue          # цитата сама показывает скобки
        text = ' ' + norm(src) + ' '
        pos = 0
        for p in [norm(x) for x in re.split(r'…|\.\.\.', q) if norm(x)]:
            i = text.find(' ' + p + ' ', pos)
            if i < 0:
                raise SystemExit(f'ЦИТАТА НЕ НАЙДЕНА{label}: «{q}» ← {ref}')
            pos = i + len(p)
    QUOTES.append((q, ref))


def check_name(form, ref):
    """Имя (или каждое слово имени) стоит в стихе адреса — по основе слова."""
    words = norm(verses_text(ref)).split()
    for w in norm(form).split():
        if len(w) <= 3:
            ok = any(x.startswith(w[:-1]) and len(w) <= len(x) <= len(w) + 2 for x in words)
        else:
            ok = any(x.startswith(w[:-1]) for x in words)
        if not ok:
            raise SystemExit(f'ИМЯ НЕ НАЙДЕНО В СТИХЕ: {form} ← {ref}')


# ───────────────────────── Разметка ─────────────────────────
def ref(r):
    for u in units(r):
        for k in u:
            USED.add(k)
    return (f'<button type="button" class="ref" data-ref="{E(r)}" aria-expanded="false">'
            f'{disp(r)}</button>')


def refs(*rs):
    return '<span class="refs">' + '<span class="sep">; </span>'.join(ref(r) for r in rs) + '</span>'


def q(text, r):
    """Цитата в «» с адресом сразу после неё."""
    check_quote(text, r)
    t = E(text).replace('"', '„', 1).replace('"', '“', 1)
    return f'<q class="cit">«{t}»</q> {ref(r)}'


def qq(text, r):
    """Цитата без кнопки адреса (адрес стоит рядом отдельно)."""
    check_quote(text, r)
    return f'<q class="cit">«{E(text)}»</q>'


CERT = {
    'inference': ('так следует из сравнения стихов', 'выв.', 'вывод: следует из сравнения стихов'),
    'calc': ('год примерный, расчёт атласа', 'расч.', 'расчёт по модели атласа'),
    'interpretation': ('есть разные понимания', 'толк.', 'толкование'),
    'reference': ('сведения учёных, не из Библии', 'справочно', 'справочные сведения'),
    'sketch': ('эскиз', 'эскиз', 'пометка эскиза'),
}


def cert(kind):
    if not kind or kind == 'scripture':
        return ''
    s, short, full = CERT[kind]
    return (f'<span class="cert simple">{s}</span>'
            f'<abbr class="cert study" title="{full}">{short}</abbr>')


def fact(text_html, *rs, kind=None, cls=''):
    r = ('<span class="sr">стихи:</span>' + refs(*rs)) if rs else ''
    c = cert(kind)
    return f'<li class="fact {cls}"><span class="ft">{text_html}</span> {c}{r}</li>'


def sketch_note(text):
    return f'<p class="sketch-note"><span class="tag">эскиз</span> {text}</p>'


# ───────────────────────── Данные base/ ─────────────────────────
A = {}
for f in sorted(glob.glob(str(ROOT / 'base/actors/*.json'))):
    for it in json.load(open(f, encoding='utf-8'))['items']:
        A[it['id']] = it
ORIG = json.load(open(ROOT / 'base/origins.json', encoding='utf-8'))['items']
UNIONS = json.load(open(ROOT / 'base/unions.json', encoding='utf-8'))['items']
KIN = json.load(open(ROOT / 'base/kin.json', encoding='utf-8'))['items']
AREAS = json.load(open(ROOT / 'base/areas.json', encoding='utf-8'))['items']
EPOCHS_DATA = {e['id']: e for e in json.load(open(ROOT / 'base/epochs.json', encoding='utf-8'))['items']}
LINE_J = json.load(open(ROOT / 'base/lines/joseph.json', encoding='utf-8'))
LINE_L = json.load(open(ROOT / 'base/lines/luke.json', encoding='utf-8'))


def name(pid):
    a = A[pid]
    return a['names'][0]['form'] if a.get('names') else pid


def disamb(pid):
    return A[pid].get('disambig') or ''


def children(pid):
    return [o for o in ORIG if o['parent'] == pid]


def facts(pid, sec):
    return [f for f in A[pid].get('facts', []) if f['sec'] == sec]


# ───────────────────────── Что нарисовано в эскизе ─────────────────────────
# Для каждого лица — экраны инструментов, которые есть в эскизе.
DRAWN = {
    'p-noy': {'gen': '#/gen/p-noy', 'time': '#/time/p-noy'},
    'p-avraam': {'gen': '#/gen/p-avraam', 'time': '#/time/p-avraam', 'geo': '#/geo/p-avraam',
                 'card': '#/card/p-avraam'},
    'p-iakov': {'gen': '#/gen/p-iakov', 'time': '#/time/p-iakov'},
    'p-david': {'time': '#/time/p-david', 'card': '#/card/p-david'},
    'p-ruf': {'time': '#/time/p-ruf', 'card': '#/card/p-ruf'},
}

# ───────────────────────── Эпохи (порядок, а не шкала) ─────────────────────────
# (id в base/epochs.json, название атласа, знак, [(лицо, адрес, цитата)])
EPOCHS = [
    ('antediluvian', 'До Потопа', 'wave', [
        ('p-adam', 'Быт 5:5', 'Всех же дней жизни Адамовой было девятьсот тридцать лет'),
        ('p-noy', 'Быт 7:6', 'Ной же был шестисот лет, как потоп водный пришел на землю')]),
    ('postdiluvian', 'После Потопа', 'arc', [
        ('p-sim', 'Быт 11:10', 'Сим был ста лет и родил Арфаксада, чрез два года после потопа')]),
    ('patriarchs', 'Патриархи', 'tent', [
        ('p-avraam', 'Быт 12:4', 'Аврам был семидесяти пяти лет, когда вышел из Харрана'),
        ('p-isaak', 'Быт 21:5', 'Авраам был ста лет, когда родился у него Исаак, сын его'),
        ('p-iakov', 'Быт 25:26', 'Исаак же был шестидесяти лет, когда они родились')]),
    ('egypt', 'Израиль в Египте', 'grain', [
        ('p-iosif', 'Быт 41:46', 'Иосифу было тридцать лет от рождения, когда он предстал пред лице фараона, царя Египетского')]),
    ('exodus', 'Исход и пустыня', 'pillar', [
        ('p-moisey', 'Втор 34:7', 'Моисею было сто двадцать лет, когда он умер'),
        ('p-aaron', 'Исх 12:50', 'как повелел Господь Моисею и Аарону, так и сделали')]),
    ('conquest', 'Завоевание', 'stones', [
        ('p-iisus-navin', 'Нав 1:1-2', 'перейди через Иордан сей, ты и весь народ сей')]),
    ('judges', 'Судьи', 'jug', [
        ('p-gedeon', 'Суд 6:11', 'сын его Гедеон выколачивал тогда пшеницу в точиле'),
        ('p-ruf', 'Руф 1:1', 'В те дни, когда управляли судьи'),
        ('p-samuil', 'Деян 13:20', 'давал им судей до пророка Самуила')]),
    ('united', 'Единое царство', 'crown', [
        ('p-saul', 'Деян 13:21', 'Бог дал им Саула, сына Кисова'),
        ('p-david', 'Деян 13:22', 'поставил им царем Давида'),
        ('p-solomon', '3Цар 6:1', 'в четвертый год царствования Соломонова над Израилем')]),
    ('divided', 'Разделённое царство', 'crown2', [
        ('p-iliya', '3Цар 17:1', 'И сказал Илия')]),
    ('judah-alone', 'Иудея одна', 'gate', [
        ('p-ezekiya', '4Цар 18:10', 'в шестой год Езекии, то есть в девятый год Осии, царя Израильского, взята Самария')]),
    ('exile', 'Вавилонский плен', 'river', [
        ('p-daniil', 'Дан 1:1-6', 'Между ними были из сынов Иудиных Даниил')]),
    ('return', 'Возвращение', 'wall', [
        ('p-zorovavel', 'Езд 2:1-2', 'пришедшие с Зоровавелем'),
        ('p-ezdra', 'Езд 7:6', 'сей Ездра вышел из Вавилона')]),
    ('intertestamental', 'Между Заветами', 'dash', []),
    ('christ', 'Евангельская история', 'star', [
        ('p-iisus', 'Мф 2:1', 'Когда же Иисус родился в Вифлееме Иудейском во дни царя Ирода'),
        ('p-ioann-krestitel', 'Мф 3:1', 'В те дни приходит Иоанн Креститель')]),
    ('apostolic', 'Апостольское время', 'scroll', [
        ('p-petr', 'Деян 2:14', 'Петр же, став с одиннадцатью'),
        ('p-pavel', 'Деян 13:9', 'Савл, он же и Павел')]),
    ('church', 'После завершения канона', 'book', []),
]
assert len(EPOCHS) == 16
for eid, *_ in EPOCHS:
    assert eid in EPOCHS_DATA, eid
EPOCH_OF = {}
for eid, ename, _, ps in EPOCHS:
    for pid, r, qt in ps:
        assert pid in A, pid
        EPOCH_OF[pid] = (eid, ename, r, qt)
        DRAWN.setdefault(pid, {})['time'] = f'#/time/{pid}'

TIME_PERSONS = [pid for _, _, _, ps in EPOCHS for pid, _, _ in ps]


def year(y):
    return f'{-y} г. до Р.{NB}Х.' if y < 0 else f'{y} г. по Р.{NB}Х.'


def years(a, b):
    if a < 0 and b < 0:
        return f'{-a}–{-b} гг. до Р.{NB}Х.'
    if a < 0 <= b:
        return f'{-a} г. до Р.{NB}Х. — {b} г. по Р.{NB}Х.'
    return f'{a}–{b} гг. по Р.{NB}Х.'


# ───────────────────────── Знаки (простые, свои) ─────────────────────────
def svg(body, size=48, cls='sign'):
    return (f'<svg class="{cls}" viewBox="0 0 48 48" width="{size}" height="{size}" aria-hidden="true" '
            f'focusable="false" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round">{body}</svg>')


SIGN = {
    # маршруты
    'ark': '<path d="M6 30h36l-5 8H11z"/><rect x="11" y="17" width="26" height="13"/><path d="M11 23.5h26M8 17l16-7 16 7"/>',
    'path': '<path d="M3 42l13-24 13 24z"/><path d="M16 18v24"/><path d="M30 36c6-3 7-12 13-16" stroke-dasharray="3 4"/><circle cx="43" cy="17" r="3"/>',
    'twelve': ''.join(f'<rect x="{7 + 9.5 * (i % 4)}" y="{11 + 9.5 * (i // 4)}" width="6" height="6"/>' for i in range(12)),
    'pillar': '<path d="M17 4h14c-4 5 4 7 0 12s4 7 0 12 4 7 0 12 2 4 0 6H17c-2-2 0-4 0-6s-4-7 0-12-4-7 0-12-4-7 0-12z"/><path d="M8 44h32"/>',
    'horn': '<path d="M5 41c15 0 28-9 34-33l6 2c-5 26-21 37-40 37z"/><path d="M42 3c0 2-1 3-1 4"/><path d="M12 41c2-1 4-3 5-5"/>',
    'boat': '<path d="M5 28h38l-6 9H11z"/><path d="M24 7v21M24 9l11 16H24"/><path d="M8 42c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0"/>',
    'scrolls': '<rect x="7" y="9" width="14" height="30" rx="2"/><rect x="27" y="9" width="14" height="30" rx="2"/><path d="M11 16h6M11 21h6M11 26h6M31 16h6M31 21h6M31 26h6M31 31h6"/>',
    'epochs': '<path d="M4 34h40"/><path d="M8 28v12M16 28v12M24 28v12M32 28v12M40 28v12"/><path d="M8 14l4 6M16 12v8M24 12l-3 8M32 14l3 6"/>',
    # эпохи
    'wave': '<path d="M5 20c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/><path d="M5 30c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>',
    'arc': '<path d="M6 36a18 18 0 0 1 36 0"/><path d="M12 36a12 12 0 0 1 24 0"/>',
    'tent': '<path d="M6 38L24 10l18 28z"/><path d="M24 10v28M18 38l6-10 6 10"/>',
    'grain': '<path d="M24 42V10"/><path d="M24 16c-6-1-8-5-8-8 4 0 8 3 8 8zM24 16c6-1 8-5 8-8-4 0-8 3-8 8zM24 26c-6-1-8-5-8-8 4 0 8 3 8 8zM24 26c6-1 8-5 8-8-4 0-8 3-8 8z"/>',
    'stones': '<circle cx="14" cy="34" r="5"/><circle cx="26" cy="34" r="5"/><circle cx="38" cy="34" r="5"/><circle cx="20" cy="24" r="5"/><circle cx="32" cy="24" r="5"/><circle cx="26" cy="14" r="5"/>',
    'jug': '<path d="M17 10h14l-2 6c6 3 8 9 8 14 0 7-6 10-13 10s-13-3-13-10c0-5 2-11 8-14z"/><path d="M24 4v6"/>',
    'crown': '<path d="M8 34l-2-20 10 9 8-13 8 13 10-9-2 20z"/><path d="M8 40h32"/>',
    'crown2': '<path d="M5 34l-1-16 7 7 5-9v18z"/><path d="M27 34l1-16 7 7 5-9 4 18z"/><path d="M5 40h14M29 40h14"/>',
    'gate': '<path d="M8 40V16l16-8 16 8v24"/><path d="M18 40V28a6 6 0 0 1 12 0v12"/>',
    'river': '<path d="M4 16c6 3 12-3 20 0s14 3 20 0"/><path d="M4 26c6 3 12-3 20 0s14 3 20 0"/><path d="M4 36c6 3 12-3 20 0s14 3 20 0"/>',
    'wall': '<rect x="6" y="14" width="36" height="24"/><path d="M6 22h36M6 30h36M16 14v8M30 14v8M22 22v8M36 22v8M14 30v8M28 30v8"/>',
    'dash': '<circle cx="24" cy="24" r="15" stroke-dasharray="3 5"/>',
    'star': '<path d="M24 6l4.5 12.5L42 19l-10.5 8 4 13L24 32.5 12.5 40l4-13L6 19l13.5-.5z"/>',
    'scroll': '<path d="M12 8h22a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H14"/><path d="M12 8a4 4 0 0 0-4 4v2h8v-2a4 4 0 0 0-4-4zM14 42a4 4 0 0 1-4-4v-2h8v2a4 4 0 0 1-4 4z"/><path d="M20 17h12M20 23h12M20 29h8"/>',
    'book': '<path d="M24 12c-5-3-12-3-18-1v27c6-2 13-2 18 1 5-3 12-3 18-1V11c-6-2-13-2-18 1z"/><path d="M24 12v27"/>',
    # интерфейс
    'search': '<circle cx="21" cy="21" r="12"/><path d="M30 30l11 11"/>',
    'home': '<path d="M7 22L24 8l17 14"/><path d="M12 19v21h24V19"/><path d="M20 40V29h8v11"/>',
    'back': '<path d="M28 10L14 24l14 14"/>',
}


# ───────────────────────── Узлы схемы ─────────────────────────
def gen_href(pid):
    return DRAWN.get(pid, {}).get('gen')


def node(pid=None, label=None, sex='m', sub='', r=None, selected=False, check=True, href=None, ref_below=False):
    lab = label or name(pid)
    if r and check:
        check_name(lab, r)
    mark = f'<span class="mk mk-{sex}" aria-hidden="true"></span>'
    subh = f'<span class="nsub">{sub}</span>' if sub else ''
    inner = f'{mark}<span class="nname">{E(lab)}</span>{subh}'
    cls = 'node' + (' sel' if selected else '')
    if selected:
        body = f'<span class="{cls}" aria-current="true">{inner}</span>'
    elif pid:
        h = href or gen_href(pid) or stub_href(f'Генеалогия — {lab}')
        body = f'<a class="{cls}" href="{h}">{inner}</a>'
    else:
        body = f'<span class="{cls}">{inner}</span>'
    return f'<span class="nwrap">{body}{ref(r) if r else ""}</span>'


def stub_href(label):
    from urllib.parse import quote
    return '#/stub/' + quote(label, safe='')


# ───────────────────────── Экраны ─────────────────────────
TEMPLATES = {}


def screen(tid, title, body, subject='', cont='', tool='', h1=None, cls=''):
    """title — заглавие окна; cont — подпись для «Продолжить»."""
    h = h1 if h1 is not None else title
    attrs = f'data-title="{E(title)}"'
    if subject:
        attrs += f' data-subject="{subject}"'
    if cont:
        attrs += f' data-continue="{E(cont)}"'
    if tool:
        attrs += f' data-tool="{tool}"'
    tools = (f'<nav class="toolbar" aria-label="Инструменты" data-pid="{subject}" data-current="{tool}"></nav>'
             if tool else '')
    TEMPLATES[tid] = (f'<div class="screen {cls}" {attrs}>{tools}'
                      f'<h1 class="scr-h" tabindex="-1">{h}</h1>{body}</div>')


# ── Главный экран: общие нижние строки
def home_bottom():
    tools = [('Генеалогия', stub_href('Генеалогия — вход: маршруты и поиск')),
             ('Время', '#/time'),
             ('География', stub_href('География — общая карта')),
             ('Связи', stub_href('Связи — вход «Чьи связи?»')),
             ('Карточка', stub_href('Карточка — вход «Чья карточка?»'))]
    index = [('По алфавиту', stub_href('Указатель по алфавиту')),
             ('По видам', stub_href('Указатель по видам')),
             ('По книгам Библии', '#/index')]
    t = ''.join(f'<li><a class="btn" href="{h}">{n}</a></li>' for n, h in tools)
    i = ''.join(f'<li><a class="btn" href="{h}">{n}</a></li>' for n, h in index)
    return f'''
<section class="continue" aria-labelledby="h-cont" hidden>
  <h2 id="h-cont">Продолжить, где остановились</h2>
  <p><a class="btn wide" data-continue-link href="#/">—</a></p>
</section>
<section class="rowsec" aria-labelledby="h-tools">
  <h2 id="h-tools">Инструменты</h2>
  <ul class="btnrow">{t}</ul>
</section>
<section class="rowsec" aria-labelledby="h-index">
  <h2 id="h-index">Указатель</h2>
  <ul class="btnrow">{i}</ul>
  <p class="study hint">Во втором слое здесь же будут «Дома и народы», «Чтение главы» и «Синопсис родословий».</p>
</section>'''


ROUTES_AB = [
    ('ark', 'Ной и его сыновья', 'Генеалогия', '#/gen/p-noy', 'Быт 6:10; 7:7',
     'семья Ноя: жена и три сына'),
    ('path', 'Путь Авраама', 'География', '#/geo/p-avraam', 'Быт 11:31; 12:4',
     'места Авраама по порядку текста, затем Время и Карточка'),
    ('twelve', '12 колен Израиля', 'Генеалогия', '#/gen/p-iakov', 'Быт 35:23-26; 49:28',
     'вид «12 колен»: Иаков, четыре матери, двенадцать сыновей'),
    ('pillar', 'Исход из Египта', 'Время', '#/time/e-exodus', 'Исх 12:41',
     'эпоха «Исход и пустыня» среди других эпох'),
    ('horn', 'Давид', 'Карточка', '#/card/p-david', '1Цар 16:13',
     'карточка: всё, что Библия говорит о Давиде'),
    ('boat', 'Ученики Иисуса Христа', 'Связи', stub_href('Связи — двенадцать апостолов'), 'Мф 10:2',
     'двенадцать апостолов и их связи'),
    ('scrolls', 'Родословие Иисуса Христа', 'Генеалогия', '#/gen/messiah', 'Мф 1:1; Лк 3:23',
     'показ «Линии Мессии»: номера у Матфея и у Луки, 14/14/14'),
    ('epochs', 'Вся Библия по эпохам', 'Время', '#/time', '',
     'шестнадцать эпох по порядку; название — слово атласа'),
]


def home_ab():
    tiles = []
    for sign, title, tool, href, adr, study in ROUTES_AB:
        if adr:
            for part in adr.split('; '):
                pass
            units(adr)
            a = f'<span class="t-adr">{disp(adr)}</span>'
        else:
            a = '<span class="t-adr">без адреса: название атласа</span>'
        tiles.append(f'''<li><a class="tile" href="{href}">
  {svg(SIGN[sign], 48)}
  <span class="t-title">{title}</span>
  <span class="t-tool">{tool}</span>
  {a}
  <span class="t-study study">{study}</span>
</a></li>''')
    body = f'''
<section aria-labelledby="h-start" class="start">
  <h2 id="h-start">С чего начнём?</h2>
  <ul class="tiles">{''.join(tiles)}</ul>
  <p class="note">Знаки на плитках — простые обозначения эскиза, а не рисунки по стихам. Подпись плитки — название пути атласа и адрес главы, а не слова Библии.</p>
</section>
{home_bottom()}'''
    TEMPLATES['home-ab'] = f'<div class="screen home" data-title="Библия наглядно — главная">{body}</div>'


def pick(pid, label=None):
    lab = label or name(pid)
    return (f'<button type="button" class="pick" data-pid="{pid}" data-name="{E(lab)}" '
            f'aria-expanded="false">{E(lab)}</button>')


def home_v():
    cells, panels = [], []
    for eid, ename, sign, ps in EPOCHS:
        who = ', '.join(name(p) for p, _, _ in ps[:2]) if ps else '—'
        cells.append(f'''<li><button type="button" class="ecell" data-epoch="{eid}" aria-expanded="false" aria-controls="ep-panel">
  {svg(SIGN[sign], 32)}<span class="e-name">{ename}</span><span class="e-who">{E(who)}</span></button></li>''')
        rows = ''.join(f'<li class="pp">{pick(p)} {qq(qt, r)} {ref(r)}</li>' for p, r, qt in ps)
        if not ps:
            rows = '<li class="pp muted">Лиц этой эпохи в эскизе нет.</li>'
        ed = EPOCHS_DATA[eid]
        panels.append(f'''<div class="ep-body" data-epoch="{eid}" hidden>
  <h3>{ename}</h3>
  <p class="study yrs">{years(ed['start'], ed['end'])} — {cert('calc')} модель «масоретская, длинное пребывание»</p>
  <ul class="plist">{rows}</ul>
  <p><a class="btn" href="#/time/e-{eid}">Эта эпоха во Времени</a></p>
</div>''')
    body = f'''
<section aria-labelledby="h-order" class="epochs-home">
  <h2 id="h-order">Библия по порядку</h2>
  <p class="note">Ширина клетки не означает длительность. Названия эпох — слова атласа; к какой эпохе относится человек — так следует из сравнения стихов.</p>
  <ul class="ecells">{''.join(cells)}</ul>
  <div id="ep-panel" class="ep-panel" role="region" aria-label="Выбранная эпоха" hidden>{''.join(panels)}</div>
</section>
{home_bottom()}'''
    TEMPLATES['home-v'] = f'<div class="screen home" data-title="Библия наглядно — главная">{body}</div>'


# ── линии Мессии
def line_rows():
    jp = LINE_J['persons']
    lp = LINE_L['persons']
    mt = [p for p in jp if p.get('mt')]
    lk = sorted([p for p in lp if p.get('lk')], key=lambda p: -p['lk']) + [p for p in lp if not p.get('lk')]
    return jp, lp, mt, lk


def check_counts():
    jp, lp, mt, lk = line_rows()
    lkid = [p['id'] for p in lk]
    mtid = [p['id'] for p in mt]
    assert len(mt) == 42 and mtid[0] == 'p-avraam' and mtid[-1] == 'p-iisus', len(mt)
    assert sum(1 for p in lp if p.get('lk')) == 75
    seg = lambda a, b, lst: lst[lst.index(a) + 1:lst.index(b)]
    jall = [p['id'] for p in jp]
    return {
        'adam-noy': seg('p-adam', 'p-noy', lkid),
        'noy-avraam-gen': seg('p-noy', 'p-avraam', jall),
        'noy-avraam-lk': seg('p-noy', 'p-avraam', lkid),
        'avraam-david': seg('p-avraam', 'p-david', mtid),
        'david-iakov-mt': seg('p-david', 'p-iakov-otets-iosifa', mtid),
        'david-iliy-lk': seg('p-david', 'p-iliy-syn-matfata', lkid),
    }


def home_d():
    S = check_counts()
    assert len(S['adam-noy']) == 8 and len(S['noy-avraam-gen']) == 9 and len(S['noy-avraam-lk']) == 10
    assert len(S['avraam-david']) == 12 and len(S['david-iakov-mt']) == 25 and len(S['david-iliy-lk']) == 39

    def gap(ids, n_text, adr, extra='', gid=''):
        names = ', '.join(pick(p) for p in ids)
        return f'''<li class="gap">
  <div class="gaprow"><button type="button" class="gapbtn" aria-expanded="false" aria-controls="{gid}">ещё {n_text}</button> {ref(adr)}</div>{extra}
  <div class="gap-names" id="{gid}" hidden>{names}</div>
</li>'''

    def anchor(pid, label=None, sub=''):
        return f'<li class="anc">{pick(pid, label)}{sub}</li>'

    kain = f'<span class="gap-x">у Луки на одно имя больше — Каинан {ref("Лк 3:36")}</span>'
    body = f'''
<section aria-labelledby="h-line" class="dline">
  <h2 id="h-line">Родословие от Адама до Иисуса Христа</h2>
  <p class="note">Касание имени — что можно открыть об этом человеке. Кнопки с числом раскрывают пропущенные здесь имена.</p>
  <ol class="trunk">
    {anchor('p-adam')}
    {gap(S['adam-noy'], '8', 'Быт 5:3-29', gid='g1')}
    {anchor('p-noy')}
    {gap(S['noy-avraam-gen'], '9', 'Быт 11:10-26', kain, gid='g2')}
    {anchor('p-avraam')}
    {gap(S['avraam-david'], '12', 'Мф 1:2-6', gid='g3')}
    {anchor('p-david')}
  </ol>
  <div class="branches">
    <section class="dbranch mt" aria-labelledby="h-bmt">
      <h3 id="h-bmt">Матфей пишет</h3>
      <p class="bsub">через Соломона {ref('Мф 1:6')}</p>
      <ol class="trunk">
        {gap(S['david-iakov-mt'], '25', 'Мф 1:6-15', gid='g4')}
        {anchor('p-iakov-otets-iosifa', 'Иаков')}
      </ol>
      <p class="bq">{q('Иаков родил Иосифа, мужа Марии, от Которой родился Иисус, называемый Христос', 'Мф 1:16')}</p>
    </section>
    <section class="dbranch lk" aria-labelledby="h-blk">
      <h3 id="h-blk">Лука пишет</h3>
      <p class="bsub">через Нафана {ref('Лк 3:31')}</p>
      <ol class="trunk">
        {gap(S['david-iliy-lk'], '39', 'Лк 3:24-31', gid='g5')}
        {anchor('p-iliy-syn-matfata', 'Илий')}
      </ol>
      <p class="bq">{q('и был, как думали, Сын Иосифов, Илиев', 'Лк 3:23')}</p>
    </section>
  </div>
  <ol class="trunk end">
    {anchor('p-iosif-muzh-marii', 'Иосиф, муж Марии')}
    {anchor('p-iisus')}
  </ol>
  <p class="note">Лука перечисляет от Иисуса вверх до Адама; здесь имена стоят сверху вниз. Выше Авраама — по Быт 5 и 11 и по Лк 3:34–38: Матфей начинает с Авраама.</p>
  <ul class="btnrow under">
    <li><a class="btn" href="{stub_href('Генеалогия — Дома и народы')}">Другие роды и народы</a></li>
    <li><a class="btn" href="#/gen/p-iakov">12 колен</a></li>
    <li><a class="btn" href="#/gen/messiah">Два родословия рядом</a></li>
  </ul>
</section>
{home_bottom()}'''
    TEMPLATES['home-d'] = f'<div class="screen home" data-title="Библия наглядно — главная">{body}</div>'


# ── Генеалогия: Ной
def gen_noy():
    sons = [o['child'] for o in children('p-noy')]
    assert sons == ['p-sim', 'p-kham', 'p-iafet'], sons
    grand = {'p-sim': ('5', 'Быт 10:22'), 'p-kham': ('4', 'Быт 10:6'), 'p-iafet': ('7', 'Быт 10:2')}
    kids = ''.join(
        f'<li>{node(s, sex="m", r="Быт 6:10", ref_below=True)}<span class="more">сыновей — {grand[s][0]} {ref(grand[s][1])}</span></li>'
        for s in sons)
    body = f'''
<div class="tree">
  <div class="tparent">{node('p-lamekh', sex='m', r='Быт 5:28-29')}<span class="nomother"><span class="mk mk-x" aria-hidden="true"></span>мать Ноя текст не называет</span></div>
  <ul class="branch"><li>
    <div class="couple">{node('p-noy', sex='m', selected=True)}<span class="uw" aria-label="и его жена">жена</span>{node(None, 'жена Ноя', 'f', sub='имени текст не называет')}{ref('Быт 7:7')}</div>
    <p class="edge">сыновья; мать текст не называет<br>{q('Ной родил трех сынов: Сима, Хама и Иафета', 'Быт 6:10')}</p>
    <ul class="branch">{kids}</ul>
  </li></ul>
</div>
<p class="kq">Жёны сыновей — три, по имени не названы {ref('Быт 7:13')}</p>
{sketch_note('Жены Ноя ещё нет в базе данных (03, § 10.1): здесь она нарисована по Быт 7:7.')}
<p class="study hint">В Быт 5:32 слова «[трех сынов]» стоят в квадратных скобках Синодального издания, поэтому основание числа — Быт 6:10.</p>'''
    screen('gen-p-noy', 'Ной — Генеалогия', body, subject='p-noy', cont='Ной — Генеалогия', tool='gen',
           h1='Ной и его сыновья')


def gen_avraam():
    kids = {o['child']: o for o in children('p-avraam')}
    assert set(kids) == {'p-izmail', 'p-isaak', 'p-zimran', 'p-iokshan', 'p-medan', 'p-madian', 'p-ishbak', 'p-shuakh'}
    ket = ['p-zimran', 'p-iokshan', 'p-medan', 'p-madian', 'p-ishbak', 'p-shuakh']
    ketk = ''.join(f'<li>{node(k, sex="m")}</li>' for k in ket)
    check_quote('Она родила ему Зимрана, Иокшана, Медана, Мадиана, Ишбака и Шуаха', 'Быт 25:2')
    for k in ket:
        check_name(name(k), 'Быт 25:2')
    unions = f'''<ul class="branch unions">
      <li><div class="union">
        <div class="uhead">{node('p-sarra', 'Сарра', 'f', r='Быт 23:19')}<span class="uw">жена</span></div>
        <p class="unote">По словам Авраама, она {qq('дочь отца моего, только не дочь матери моей', 'Быт 20:12')} {ref('Быт 20:12')}</p>
        <ul class="ukids"><li>{node("p-isaak", sex="m", r="Быт 21:3")}</li></ul>
      </div></li>
      <li><div class="union">
        <div class="uhead">{node('p-agar', 'Агарь', 'f', r='Быт 16:3')}<span class="uw">служанка, которую дали в жену</span></div>
        <ul class="ukids"><li>{node('p-izmail', sex='m', r='Быт 16:15')}</li></ul>
      </div></li>
      <li><div class="union">
        <div class="uhead">{node('p-khettura', 'Хеттура', 'f', r='Быт 25:1')}<span class="uw">жена</span></div>
        <p class="unote">В другом месте названа наложницей {ref('1Пар 1:32')}</p>
        <details class="explain"><summary>Что значит «наложница»?</summary><p>Жена, но не главная. {cert('reference')} Пояснение атласа, а не слова Библии; ср. {ref('Быт 35:22')}</p></details>
        <p class="unote">Сыновья {ref('Быт 25:2')}</p>
        <ul class="ukids">{ketk}</ul>
      </div></li>
    </ul>'''
    body = f'''
<p class="kq">{q('Фарра родил Аврама, Нахора и Арана', 'Быт 11:27')}</p>
<div class="tree">
  <div class="tparent">{node('p-farra', sex='m', r='Быт 11:26-27')}<span class="nomother"><span class="mk mk-x" aria-hidden="true"></span>мать текст не называет</span></div>
  <ul class="branch">
    <li>{node('p-avraam', sex='m', selected=True, sub='прежде — Аврам')} {ref('Быт 17:5')}
      {unions}
    </li>
    <li>{node('p-nakhor-syn-farry', 'Нахор', 'm')}</li>
    <li>{node('p-aran', 'Аран', 'm')}</li>
  </ul>
</div>
<p class="kq">Ещё наложницы Авраама — по имени не названы {ref('Быт 25:6')}</p>'''
    screen('gen-p-avraam', 'Авраам — Генеалогия', body, subject='p-avraam', cont='Авраам — Генеалогия',
           tool='gen', h1='Авраам: родители, жёны и дети')


def gen_tribes():
    groups = [
        ('p-liya', 'Лия', 'жена', 'Быт 29:21-25', 'Быт 35:23',
         ['p-ruvim', 'p-simeon', 'p-leviy', 'p-iuda', 'p-issakhar', 'p-zavulon']),
        ('p-rakhil', 'Рахиль', 'жена', 'Быт 46:19', 'Быт 35:24', ['p-iosif', 'p-veniamin']),
        ('p-valla', 'Валла', 'служанка Рахили, которую дали в жену', 'Быт 30:4', 'Быт 35:25',
         ['p-dan', 'p-neffalim']),
        ('p-zelfa', 'Зелфа', 'служанка Лии, которую дали в жену', 'Быт 30:9', 'Быт 35:26',
         ['p-gad', 'p-asir']),
    ]
    kidset = {o['child'] for o in children('p-iakov')}
    cols = []
    for mid, mname, word, wref, kref, ks in groups:
        assert set(ks) <= kidset
        items = []
        for k in ks:
            check_name(name(k), kref)
            extra = ''
            if k == 'p-leviy':
                extra = f'<span class="more">левиты {qq("не были исчислены между ними", "Чис 1:47")} {ref("Чис 1:47")}</span>'
            if k == 'p-iosif':
                extra = (f'<span class="more">о Ефреме и Манассии Иаков сказал: {qq("мои они", "Быт 48:5")} '
                         f'{ref("Быт 48:5")}</span>')
            items.append(f'<li>{node(k, name(k), "m")}{extra}</li>')
        if mid == 'p-liya':
            items.append(f'<li>{node("p-dina", "Дина", "f", sub="дочь; колена нет")} {ref("Быт 30:21")}</li>')
        cols.append(f'''<li><div class="union">
  <div class="uhead">{node(mid, mname, 'f', r=wref)}<span class="uw">{word}</span></div>
  <p class="unote">Сыновья {ref(kref)}</p>
  <ul class="ukids">{''.join(items)}</ul></div></li>''')
    body = f'''
<p class="lead">{q('Вот все двенадцать колен Израилевых', 'Быт 49:28')}</p>
<p class="note">Сыновья Иакова по матерям — в том порядке, как их перечисляет Быт 35:23–26.</p>
<div class="tree">
  <div class="tparent">{node('p-iakov', 'Иаков', 'm', selected=True, sub='он же Израиль')} {ref('Быт 35:22')}</div>
  <ul class="branch unions four">{''.join(cols)}</ul>
</div>
<p class="study hint">Во втором слое — переключатель перечней колен: Быт 49; Чис 1; Чис 26; Втор 33; Откр 7 (в эскизе не нарисован).</p>'''
    units('Быт 35:23-26')
    screen('gen-p-iakov', '12 колен Израиля — Генеалогия', body, subject='p-iakov',
           cont='12 колен Израиля — Генеалогия', tool='gen', h1='12 колен Израиля')


def gen_messiah():
    jp, lp, mt, lk = line_rows()
    # Строки: выровнены по общим лицам; между общими лицами — столбцы рядом.
    mt_ids = [p['id'] for p in mt]
    lk_ids = [p['id'] for p in lk]
    mtn = {p['id']: p['mt'] - 14 * (p['mtGroup'] - 1) for p in mt}
    lkn = {p['id']: p.get('lk') for p in lk}
    common = [x for x in lk_ids if x in mt_ids]
    rows = []
    i = j = 0
    for c in common:
        a = mt_ids[i:mt_ids.index(c)]
        b = lk_ids[j:lk_ids.index(c)]
        for k in range(max(len(a), len(b))):
            rows.append((a[k] if k < len(a) else None, b[k] if k < len(b) else None))
        rows.append((c, c))
        i = mt_ids.index(c) + 1
        j = lk_ids.index(c) + 1
    assert i == len(mt_ids) and j == len(lk_ids)

    def cell(pid, side):
        if not pid:
            return '<td class="empty"><span class="sr">нет</span></td>'
        n = name(pid)
        if pid == 'p-iosif-muzh-marii':
            n = 'Иосиф, муж Марии'
        num = mtn.get(pid) if side == 'mt' else lkn.get(pid)
        numh = f'<span class="num study">{num}</span>' if num else ''
        mark = ''
        if side == 'lk' and pid == 'p-kainan-syn-arfaksada':
            mark = '<span class="tagx">только у Луки</span>'
        return f'<td>{numh}{pick(pid, n)}{mark}</td>'

    trs = []
    k0 = rows.index(('p-avraam', 'p-avraam'))
    pre = [b for a, b in rows[:k0]]
    assert all(a is None for a, b in rows[:k0]) and pre[0] == 'p-adam' and pre[-1] == 'p-farra'
    pre_html = ', '.join(pick(p) + ('<span class="tagx-in"> (только у Луки)</span>' if p == 'p-kainan-syn-arfaksada' else '') for p in pre)
    trs.append(f'<tr class="pre"><td><span class="muted">Матфей начинает с Авраама</span> {ref("Мф 1:2")}</td>'
               f'<td><span class="muted">{len(pre)} имён, от Адама:</span> {pre_html}</td></tr>')
    rows = rows[k0:]
    for a, b in rows:
        cls = ' class="same"' if a and a == b else ''
        if a == 'p-iekhoniya' or (a is None and b == 'p-niriy'):
            pass
        trs.append(f'<tr{cls}>{cell(a, "mt")}{cell(b, "lk")}</tr>')
        if a == 'p-david':
            trs.append('<tr class="sep study"><td colspan="2">Мф 1:17: первые четырнадцать родов — от Авраама до Давида</td></tr>')
        if a == 'p-ioakim-tsar':
            trs.append('<tr class="sep study"><td colspan="2">Мф 1:17: «до переселения в Вавилон» — вторые четырнадцать</td></tr>')
    check_quote('до переселения в Вавилон', 'Мф 1:17')
    body = f'''
<p class="lead">Два родословия Иисуса Христа: у Матфея и у Луки. Здесь они стоят рядом; где оба называют одного человека, строка общая.</p>
<div class="two-q">
  <p>{q('Иаков родил Иосифа, мужа Марии, от Которой родился Иисус, называемый Христос', 'Мф 1:16')}</p>
  <p>{q('Иисус, начиная Свое служение, был лет тридцати, и был, как думали, Сын Иосифов, Илиев', 'Лк 3:23')}</p>
</div>
<p class="note">Лука перечисляет от Иисуса вверх до Адама; здесь его имена стоят сверху вниз.</p>
<p class="study hint">Номера: у Матфея — внутри своей четырнадцатки {ref('Мф 1:17')}; у Луки — от Иосифа (1) до Адама (75). Между Иорамом и Озией Матфей не называет Охозию, Иоаса и Амасию {ref('4Цар 8:24')} {ref('1Пар 3:11-12')}</p>
<table class="lines">
  <caption class="sr">Родословие у Матфея и у Луки, строки выровнены по лицам</caption>
  <thead><tr><th scope="col" class="mt">Матфей пишет {ref('Мф 1:1-16')}</th><th scope="col" class="lk">Лука пишет {ref('Лк 3:23-38')}</th></tr></thead>
  <tbody>{''.join(trs)}</tbody>
</table>
<p class="note">Почему у Луки другие имена от Давида до Иосифа — есть разные понимания; они собраны в слое «Для изучающих» и в карточках (в эскизе не нарисованы).</p>'''
    screen('gen-messiah', 'Линии Мессии — Генеалогия', body, cont='Родословие Иисуса Христа — Генеалогия',
           tool='gen', h1='Родословие Иисуса Христа', cls='wide')


# ── Время
def time_screen():
    lis = []
    for eid, ename, sign, ps in EPOCHS:
        ed = EPOCHS_DATA[eid]
        people = ''.join(f'<li><a class="tp" data-pid="{p}" href="#/time/{p}">{E(name(p))}</a></li>' for p, _, _ in ps)
        if not ps:
            people = '<li class="muted">лиц в эскизе нет</li>'
        lis.append(f'''<li class="erow" data-epoch="{eid}">
  <a class="ehead" href="#/time/e-{eid}">{svg(SIGN[sign], 28)}<span>{ename}</span></a>
  <span class="study eyrs">{years(ed['start'], ed['end'])}</span>
  <ul class="tpeople">{people}</ul></li>''')
    panels = []
    calc_years = {'p-avraam': (-2166, -1991), 'p-moisey': (-1526, -1406), 'p-david': (-1040, -970)}
    for eid, ename, sign, ps in EPOCHS:
        for pid, r, qt in ps:
            extra = ''
            if pid == 'p-avraam':
                extra = f'''<ul class="facts">
  {fact(q('Аврам был семидесяти пяти лет, когда вышел из Харрана', 'Быт 12:4'))}
  {fact(q('Авраам был ста лет, когда родился у него Исаак, сын его', 'Быт 21:5'))}
  {fact(q('Дней жизни Авраамовой, которые он прожил, было сто семьдесят пять лет', 'Быт 25:7'))}
</ul>
<p class="kq">Жил после Ноя и Сима и раньше Иосифа и Моисея {cert('inference')}</p>'''
            elif pid == 'p-moisey':
                extra = f'<ul class="facts">{fact(q("Моисей был восьмидесяти", "Исх 7:7") + " — когда говорил к фараону")}</ul>'
            elif pid == 'p-david':
                extra = f'<ul class="facts">{fact(q("Тридцать лет было Давиду, когда он воцарился; царствовал сорок лет", "2Цар 5:4"))}</ul>'
            yrs = ''
            if pid in calc_years:
                a, b = calc_years[pid]
                yrs = (f'<p class="study yrs">Около {years(a, b)} {cert("calc")} '
                       f'модель «масоретская, длинное пребывание»</p>')
            panels.append(f'''<section class="tpanel" data-panel="{pid}" hidden aria-label="{E(name(pid))}">
  <h2>{E(name(pid))}</h2>
  <p class="epoch-of">Эпоха «{ename}» {cert('inference')}</p>
  {'' if pid == 'p-avraam' else '<p>' + q(qt, r) + '</p>'}{extra}{yrs}
</section>''')
    for eid, ename, sign, ps in EPOCHS:
        ed = EPOCHS_DATA[eid]
        extra = ''
        if eid == 'exodus':
            extra = f'''<ul class="facts">
  {fact(q('вышло все ополчение Господне из земли Египетской ночью', 'Исх 12:41'))}
  {fact(q('Господь же шел пред ними днем в столпе облачном', 'Исх 13:21'))}
  {fact('Около сорока лет в пустыне — так говорит Павел', 'Деян 13:17-18')}
</ul>
<p class="study yrs">Исход — 1446 г. до Р.{NB}Х. {cert('calc')} модель «масоретская, длинное пребывание»: 480-й год от исхода — 4-й год Соломона {ref('3Цар 6:1')}</p>'''
        who = ', '.join(f'<a href="#/time/{p}">{E(name(p))}</a>' for p, _, _ in ps) or 'лиц в эскизе нет'
        panels.append(f'''<section class="tpanel" data-panel="e-{eid}" hidden aria-label="{ename}">
  <h2>{ename}</h2>
  <p class="epoch-of">Эпоха атласа; люди в ней: {who}</p>{extra}
  <p class="study yrs">{years(ed['start'], ed['end'])} {cert('calc')}</p>
</section>''')
    panels.append(f'''<section class="tpanel" data-panel="none" aria-label="Подсказка">
  <h2>Эпохи по порядку</h2>
  <p>Выберите человека или эпоху в списке. Порядок от Египта до Давида рассказывает и сама Библия: Египет, сорок лет в пустыне, земля Ханаанская, судьи, Саул, Давид {ref('Деян 13:17-22')}</p>
</section>''')
    body = f'''
<p class="note">Эпохи стоят по порядку; высота строки не означает длительность. Названия эпох — слова атласа. <span class="simple">Годов в простом виде нет.</span><span class="study">Годы — расчёт по модели «масоретская, длинное пребывание».</span></p>
<div class="time-grid">
  <div class="tside" aria-live="polite">{''.join(panels)}</div>
  <ol class="elist" aria-label="Эпохи по порядку">{''.join(lis)}</ol>
</div>'''
    screen('time', 'Время', body, tool='time', h1='Время: эпохи по порядку', cls='time')


# ── География: Авраам
GEO = [
    # (название, адрес, место-точка, что было)
    ('Ур Халдейский', 'Быт 11:31', 'ur', 'вышел оттуда с Фаррою'),
    ('Харран', 'Быт 11:31; 12:4', 'harran', 'остановились; вышел семидесяти пяти лет'),
    ('Сихем, дубрава Море', 'Быт 12:6', 'sikhem', 'прошёл до этого места'),
    ('Гора между Вефилем и Гаем', 'Быт 12:8', 'vefil', 'шатёр и жертвенник'),
    ('Египет', 'Быт 12:10', 'egypt', 'пожил там во время голода'),
    ('Снова между Вефилем и Гаем', 'Быт 13:3-4', 'vefil', 'вернулся к жертвеннику'),
    ('Дубрава Мамре, что в Хевроне', 'Быт 13:18', 'mamre', 'поселился, жертвенник'),
    ('Дан', 'Быт 14:14', 'dan', 'преследовал неприятелей'),
    ('Герар', 'Быт 20:1', 'gerar', 'был на время'),
    ('Вирсавия', 'Быт 21:33; 22:19', 'virsaviya', 'насадил рощу; жил'),
    ('Земля Мориа', 'Быт 22:2', 'moria', 'пошёл туда с Исааком'),
    ('Пещера Махпела против Мамре', 'Быт 23:19; 25:9', 'mamre', 'похоронил Сарру; там погребён'),
]
GEO_CHECK = ['Ура Халдейского', 'Харрана', 'Сихема', 'Вефиля', 'Египет', 'Вефилем', 'Мамре', 'Дана',
             'Гераре', 'Вирсавии', 'Мориа', 'Махпеле']
# Условные точки схемы (не координаты): x, y, подпись, смещение подписи
GEO_PTS = {
    'harran': (560, 52, 'Харран', 'end', -14, -12),
    'ur': (612, 372, 'Ур Халдейский', 'end', -14, -12),
    'dan': (262, 62, 'Дан', 'start', 14, 5),
    'sikhem': (236, 142, 'Сихем', 'start', 14, 5),
    'vefil': (226, 194, 'Вефиль и Гай', 'start', 14, 5),
    'moria': (236, 234, 'Мориа', 'start', 14, 5),
    'mamre': (218, 276, 'Мамре, Хеврон', 'start', 14, 5),
    'virsaviya': (200, 330, 'Вирсавия', 'start', 14, 5),
    'gerar': (140, 312, 'Герар', 'end', -14, 5),
    'egypt': (64, 386, 'Египет', 'start', 14, 5),
}


def geo_avraam():
    for (nm, r, pt, what), chk in zip(GEO, GEO_CHECK):
        check_name(chk, r)
    path = ' '.join(f'{GEO_PTS[pt][0]},{GEO_PTS[pt][1]}' for _, _, pt, _ in GEO)
    nums = {}
    for i, (_, _, pt, _) in enumerate(GEO, 1):
        nums.setdefault(pt, []).append(str(i))
    marks = []
    for pt, (x, y, label, anchor, dx, dy) in GEO_PTS.items():
        marks.append(f'<g class="pt"><circle cx="{x}" cy="{y}" r="7"/><text x="{x + dx}" y="{y + dy}" text-anchor="{anchor}">'
                     f'<tspan class="pn">{", ".join(nums[pt])}</tspan> {E(label)}</text></g>')
    svgmap = f'''<svg class="geo" viewBox="0 0 660 420" role="img" aria-labelledby="geo-cap">
  <title id="geo-cap">Схема: места Авраама по порядку текста. Расположение условное; список мест — рядом.</title>
  <rect x="1" y="1" width="658" height="418" rx="4" class="frame"/>
  <polyline points="{path}" class="route"/>
  {''.join(marks)}
</svg>'''
    items = ''.join(
        f'<li><span class="gnum" aria-hidden="true">{i}</span><span class="gtxt"><span class="gname">{E(nm)}</span> '
        f'<span class="gwhat">— {E(what)}</span></span>{ref(r)}</li>'
        for i, (nm, r, pt, what) in enumerate(GEO, 1))
    body = f'''
<p class="lead">{q('И пошел Аврам, как сказал ему Господь', 'Быт 12:4')}</p>
{sketch_note('Места расставлены вручную по стихам. Это схема, а не карта: положение точек условное. Где были эти места, скажет справочник мест (ещё не составлен).')}
<div class="geo-grid">
  <figure class="geo-fig">{svgmap}
    <figcaption>Пунктир — порядок мест в тексте, а не дорога. Число у точки — номер места в списке.</figcaption>
  </figure>
  <section aria-labelledby="h-places" class="geo-list">
    <h2 id="h-places">Места по порядку текста</h2>
    <ol class="places">{items}</ol>
  </section>
</div>'''
    screen('geo-p-avraam', 'Авраам — География', body, subject='p-avraam', cont='Авраам — География',
           tool='geo', h1='Путь Авраама')


# ── Карточки
OLD2NEW = {1: 1, 4: 1, 3: 1, 5: 3, 6: 4, 7: 5, 8: 6, 11: 8, 12: 9, 13: 10, 14: 11, 15: 12, 16: 13,
           17: 14, 18: 15, 19: 16, 20: 17, 21: 18, 22: 19, 23: 20, 24: 21}
TITLES = {1: 'Имена', 2: 'Подлинник', 3: 'Кто это', 4: 'Родители', 5: 'Род и колено', 6: 'Рождение',
          7: 'Семья', 8: 'Братья и сёстры', 9: 'Иное родство', 10: 'Время', 11: 'Встречи и связи',
          12: 'Места', 13: 'Служение', 14: 'По порядку', 15: 'Слова', 16: 'Перед Богом',
          17: 'Смерть и погребение', 18: 'В родословии Иисуса Христа', 19: 'В других книгах',
          20: 'Места Писания', 21: 'Для изучающих'}
LIMIT = 8


DATA_UNQUOTED = []


def quote_in(qt, r):
    try:
        text = ' ' + norm(verses_text(r)) + ' '
    except Exception:
        return False
    pos = 0
    for part in [norm(x) for x in re.split(r'…|\.\.\.', qt) if norm(x)]:
        i = text.find(' ' + part + ' ', pos)
        if i < 0:
            return False
        pos = i + len(part)
    return True


def data_text(t, rs):
    """Текст записи данных: после каждой цитаты — адрес стиха, где она стоит.
    Цитату, которой нет дословно ни в одном стихе записи, эскиз показывает без кавычек."""
    out, pos = [], 0
    for m in re.finditer(r'«([^«»]+)»', t):
        out.append(E(t[pos:m.start()]))
        qt = m.group(1)
        hit = next((r for r in rs if quote_in(qt, r)), None)
        if hit:
            check_quote(qt, hit)
            out.append(f'<q class="cit">«{E(qt)}»</q> {ref(hit)}')
        else:
            DATA_UNQUOTED.append((qt, rs))
            out.append(E(qt))
        pos = m.end()
    out.append(E(t[pos:]))
    return ''.join(out)


def data_items(pid, old_sec):
    """Записи прежнего раздела в виде строк факта."""
    out = []
    for f in facts(pid, old_sec):
        v = f['value']
        kind = f.get('cert')
        if f['field'] in ('places',):
            out.append(fact(E(v['name']), *v['refs'], kind=kind))
        elif f['field'] == 'met':
            out.append(fact(f'{E(name(v["id"]))} — {data_text(v["text"], v["refs"])}', *v['refs'], kind=kind))
        elif f['field'] == 'sayings':
            ctx = f'<span class="ctx">{E(v["context"])}</span>' if v.get('context') else ''
            check_quote(v['quote'], v['ref'])
            out.append(f'<li class="fact"><span class="ft"><q class="cit">«{E(v["quote"])}»</q> {ctx}</span> {refs(v["ref"])}</li>')
        elif f['field'] == 'offices':
            out.append(fact(E(v['title']), *v['refs'], kind=kind))
        elif f['field'] == 'death':
            for x in v.get('facts', []) + v.get('burial', []):
                out.append(fact(data_text(x['text'], x['refs']), *x['refs'], kind=x.get('cert')))
        elif f['field'] == 'birth':
            for x in v.get('facts', []):
                out.append(fact(data_text(x['text'], x['refs']), *x['refs'], kind=x.get('cert')))
        elif 'text' in v and 'refs' in v:
            out.append(fact(data_text(v['text'], v['refs']), *v['refs'], kind=kind))
    return out


def section(num, items_html, study=False, extra='', title=None):
    if not items_html and not extra:
        return ''
    lst = ''
    if items_html:
        head = items_html[:LIMIT] if len(items_html) > LIMIT + 2 else items_html
        rest = items_html[len(head):]
        lst = f'<ul class="facts">{"".join(head)}</ul>'
        if rest:
            lst += (f'<ul class="facts more-list" hidden>{"".join(rest)}</ul>'
                    f'<button type="button" class="morebtn" aria-expanded="false">ещё {len(rest)}</button>')
    cls = 'csec' + (' study' if study else '')
    return (f'<section class="{cls}" aria-labelledby="s{num}">'
            f'<h2 id="s{num}"><span class="snum">{num}</span> {title or TITLES[num]}</h2>{lst}{extra}</section>')


def scripture_count(stems, excl=()):
    books = {}
    for (b, c, v), t in TEXT.items():
        words = norm(t).split()
        if any(w.startswith(s) for w in words for s in stems) and not any(w.startswith(x) for w in words for x in excl):
            books[b] = books.get(b, 0) + 1
    return books


def sec20(pid, stems, first, excl=()):
    books = scripture_count(stems, excl)
    total = sum(books.values())
    top = sorted(books.items(), key=lambda kv: ORDER.index(kv[0]))
    lst = ''.join(f'<li><span class="bk">{BOOK_FULL[b]}</span> <span class="bn">{n}</span></li>' for b, n in top)
    return section(20, [], extra=f'''<p>Имя стоит в {total} стихах — счёт эскиза по форме имени. Впервые — {ref(first)}</p>
<details class="explain"><summary>По книгам: {len(books)}</summary><ul class="booklist">{lst}</ul></details>''')


def tools_row(pid):
    return f'<nav class="cardtools" aria-label="Инструменты для этого лица" data-pid="{pid}"></nav>'


def card_avraam():
    pid = 'p-avraam'
    header = f'''
<p class="kind">человек</p>
<ul class="brief">
  {fact('По слову Господа вышел из Харрана в землю Ханаанскую', 'Быт 12:4-5')}
  {fact('Бог дал ему новое имя: Аврам стал Авраамом', 'Быт 17:5')}
  {fact('С него Матфей начинает родословие Иисуса Христа', 'Мф 1:1-2')}
</ul>
{tools_row(pid)}
<blockquote class="mainverse">{q('Аврам поверил Господу, и Он вменил ему это в праведность', 'Быт 15:6')}</blockquote>
<table class="passport"><caption class="sr">Паспорт</caption>
  <tr><th scope="row">Отец</th><td>Фарра</td><td><a href="#s4">Родители (4)</a></td></tr>
  <tr><th scope="row">Время</th><td>эпоха «Патриархи»</td><td><a href="#s10">Время (10)</a></td></tr>
  <tr><th scope="row">Супруги</th><td>названы по имени 3</td><td><a href="#s7">Семья (7)</a></td></tr>
</table>'''
    s = []
    s.append(section(1, [
        fact('Аврам — прежнее имя; новое дал Бог: ' + q('не будешь ты больше называться Аврамом, но будет тебе имя: Авраам, ибо Я сделаю тебя отцом множества народов', 'Быт 17:5')),
        fact('Аврам Еврей', 'Быт 14:13'),
        fact('Друг Божий: ' + q('семя Авраама, друга Моего', 'Ис 41:8') + '; ' + q('и он наречен другом Божиим', 'Иак 2:23')),
    ]))
    s.append(section(3, data_items(pid, 5)))
    s.append(section(4, [fact(f'Отец — <a href="{person_href("p-farra", "Фарра")}">Фарра</a>', 'Быт 11:26-27'),
                         fact('Мать текст не называет')]))
    s.append(section(5, data_items(pid, 7)))
    s.append(section(6, data_items(pid, 8)))
    fam = [
        fact('Сарра — жена; сын Исаак', 'Быт 23:19', 'Быт 21:2-3'),
        fact('Агарь, служанка Сарры, которую дали в жену; сын Измаил', 'Быт 16:3', 'Быт 16:15'),
        fact('Хеттура — «жена»; в 1 Пар 1:32 — «наложница»; сыновья Зимран, Иокшан, Медан, Мадиан, Ишбак и Шуах', 'Быт 25:1-2', '1Пар 1:32'),
        fact('Ещё наложницы — по имени не названы', 'Быт 25:6'),
    ]
    s.append(section(7, fam, extra='<p><a class="btn" href="#/gen/p-avraam">Открыть семью</a></p>'))
    s.append(section(8, data_items(pid, 11) + [fact('Сарра — по его словам: ' + qq('она дочь отца моего, только не дочь матери моей', 'Быт 20:12'), 'Быт 20:12')]))
    s.append(section(9, data_items(pid, 12)))
    tm = [fact(q('Аврам был семидесяти пяти лет, когда вышел из Харрана', 'Быт 12:4')),
          fact(q('Авраам был ста лет, когда родился у него Исаак, сын его', 'Быт 21:5')),
          fact(q('Дней жизни Авраамовой, которые он прожил, было сто семьдесят пять лет', 'Быт 25:7')),
          fact('Эпоха «Патриархи»', 'Быт 12:4', kind='inference'),
          f'<li class="fact study">Около 2166–1991 гг. до Р.{NB}Х. {cert("calc")} модель «масоретская, длинное пребывание»</li>']
    tm += data_items(pid, 13)
    s.append(section(10, tm, extra='<p><a class="btn" href="#/time/p-avraam">Время</a></p>'))
    s.append(section(11, data_items(pid, 14)))
    s.append(section(12, data_items(pid, 15), extra='<p><a class="btn" href="#/geo/p-avraam">География</a></p>'))
    s.append(section(13, data_items(pid, 16)))
    s.append(section(14, data_items(pid, 17)))
    s.append(section(15, data_items(pid, 18)))
    s.append(section(16, data_items(pid, 19)))
    s.append(section(17, data_items(pid, 20)))
    s.append(section(18, data_items(pid, 21) + [
        f'<li class="fact study">У Матфея — 1-й в первой четырнадцатке, у Луки — 55-й от Иосифа (по счёту атласа) {refs("Мф 1:2", "Лк 3:34")}</li>']))
    s.append(section(19, data_items(pid, 22)))
    s.append(sec20(pid, ['авраам', 'аврам'], 'Быт 11:26'))
    s.append(section(21, data_items(pid, 24), study=True))
    body = f'<div class="card">{header}<div class="sections">{"".join(s)}</div></div>'
    screen('card-p-avraam', 'Авраам — Карточка', body, subject=pid, cont='Авраам — Карточка', tool='card',
           h1='Авраам')


def card_david():
    pid = 'p-david'
    periods = []
    for f in facts(pid, 17):
        if f['value'].get('period'):
            periods.append([f['value']['period'], 0])
        if periods:
            periods[-1][1] += 1
    per = ''.join(f'<li class="fact"><span class="ft">{E(p)}</span> <span class="cnt">записей — {n}</span></li>' for p, n in periods)
    header = f'''
<p class="kind">человек, царь</p>
<ul class="brief">
  {fact('Младший сын Иессея Вифлеемлянина, пас овец', '1Цар 16:1', '1Цар 16:11')}
  {fact('Царствовал над Иудою и над всем Израилем', '2Цар 5:5')}
  {fact('Из его семени — Иисус Христос', 'Рим 1:3')}
</ul>
{tools_row(pid)}
<blockquote class="mainverse">{q('и почивал Дух Господень на Давиде с того дня и после', '1Цар 16:13')}</blockquote>
<table class="passport"><caption class="sr">Паспорт</caption>
  <tr><th scope="row">Правил</th><td>сорок лет</td><td><a href="#s10">Время (10)</a></td></tr>
  <tr><th scope="row">Предшественник</th><td>Саул</td><td><a href="#s11">Встречи и связи (11)</a></td></tr>
  <tr><th scope="row">Преемник</th><td>Соломон</td><td><a href="#s11">Встречи и связи (11)</a></td></tr>
</table>
{sketch_note('Карточка сокращена, как в 07, § 15.1. Пропущены разделы 1, 5, 6, 8, 9, 13, 19; в разделах 7, 11, 12 показано начало.')}'''
    s = [
        section(3, [fact('Царь над Иудою в Хевроне; в Иерусалиме — над всем Израилем и Иудою', '2Цар 5:5')]),
        section(4, [fact('Отец — Иессей', 'Руф 4:22', '1Цар 16:19', '1Цар 17:12'), fact('Мать текст не называет')]),
        section(7, [
            fact('Ахиноама Изреелитянка — Амнон, первенец', '1Пар 3:1'),
            fact('Авигея Кармилитянка — Далуия', '1Пар 3:1'),
            fact('Вирсавия — Шима, Шовав, Нафан, Соломон; во 2 Цар 5:14 — Самус, Совав', '1Пар 3:5', '2Цар 5:14'),
            fact('Сыновья, рождённые в Иерусалиме: Ивхар, Елишама, Елифелет и другие — мать текст не называет', '1Пар 3:6-8'),
            fact('Сыновья от наложниц — по имени не названы', '1Пар 3:9'),
            fact('Ещё жёны и наложницы — не названы', '2Цар 5:13'),
        ], extra=f'<p class="muted">ещё 5 союзов — в эскизе не показаны</p><p><a class="btn" href="{stub_href("Генеалогия — Давид")}">Открыть семью</a></p>'),
        section(10, [
            fact('Воцарился: ' + q('Тридцать лет было Давиду, когда он воцарился', '2Цар 5:4')),
            fact('Царствовал сорок лет', '2Цар 5:4'),
            fact('в Хевроне — семь лет и шесть месяцев; в Иерусалиме — тридцать три года', '2Цар 5:5'),
            fact('При смерти — около семидесяти лет', '2Цар 5:4-5', '3Цар 2:10-11', kind='inference'),
            f'<li class="fact study">Около 1040–970 гг. до Р.{NB}Х. {cert("calc")} модель «масоретская, длинное пребывание»</li>',
        ], extra='<p><a class="btn" href="#/time/p-david">Время</a></p>'),
        section(11, [fact('Саул — называл его ' + qq('сын Иессеев', '1Цар 20:27'), '1Цар 20:27')]),
        section(12, [fact('Вифлеем — ' + qq('в свой город Вифлеем', '1Цар 20:6'), '1Цар 20:6'),
                     fact(qq('откуда был Давид', 'Ин 7:42'), 'Ин 7:42'),
                     fact('Хеврон; Иерусалим', '2Цар 5:5')]),
        section(14, [per]),
        section(15, [fact(q('ты идешь против меня с мечом и копьем и щитом, а я иду против тебя во имя Господа Саваофа', '1Цар 17:45')
                          + ' — отвечал Филистимлянину; Филистимлянин — Голиаф', '1Цар 17:23')]),
        section(16, [fact(q('нашел Я мужа по сердцу Моему, Давида, сына Иессеева', 'Деян 13:22') + ' — слова Бога в речи Павла')]),
        section(17, [fact(q('И почил Давид с отцами своими и погребен был в городе Давидовом', '3Цар 2:10'))]),
        section(18, [fact('Матфей: Давидом кончаются первые четырнадцать родов от Авраама', 'Мф 1:6', 'Мф 1:17'),
                     fact('Лука: ' + qq('Нафанов, Давидов', 'Лк 3:31') + ' — его ветвь идёт через Нафана', 'Лк 3:31'),
                     f'<li class="fact study">Мф — 14-й от Авраама; Лк — 42-й от Иосифа (по счёту атласа)</li>']),
        sec20(pid, ['давид'], 'Руф 4:17'),
    ]
    body = f'<div class="card">{header}<div class="sections">{"".join(s)}</div></div>'
    screen('card-p-david', 'Давид — Карточка', body, subject=pid, cont='Давид — Карточка', tool='card', h1='Давид')


def card_ruf():
    pid = 'p-ruf'
    key = ''.join(f'<li><blockquote class="kv">{q(t, r)}</blockquote></li>' for t, r in [
        ('Они взяли себе жен из Моавитянок, имя одной Орфа, а имя другой Руфь', 'Руф 1:4'),
        ('куда ты пойдешь, туда и я пойду, и где ты жить будешь, там и я буду жить; народ твой будет моим народом, и твой Бог — моим Богом', 'Руф 1:16'),
        ('И взял Вооз Руфь, и она сделалась его женою', 'Руф 4:13'),
    ])
    header = f'''
<p class="kind">человек</p>
{tools_row(pid)}
<ul class="keyverses" aria-label="Ключевые стихи">{key}</ul>
<table class="passport"><caption class="sr">Паспорт</caption>
  <tr><th scope="row">Родители</th><td>текст не называет</td><td><a href="#s4">Родители (4)</a></td></tr>
  <tr><th scope="row">Народ</th><td>Моавитянка</td><td><a href="#s5">Род и колено (5)</a></td></tr>
  <tr><th scope="row">Время</th><td>когда управляли судьи</td><td><a href="#s10">Время (10)</a></td></tr>
  <tr><th scope="row">Супруги</th><td>названы по имени 2</td><td><a href="#s7">Семья (7)</a></td></tr>
</table>'''
    s = [
        section(3, [fact(qq('Руфь Моавитянка', 'Руф 1:22') + ', сноха Ноемини', 'Руф 1:22')]),
        section(4, [fact('Отца и мать текст не называет; Вооз говорит: ' + qq('ты оставила твоего отца и твою мать и твою родину', 'Руф 2:11'), 'Руф 2:11')]),
        section(5, [fact('Моавитянка', 'Руф 1:4', 'Руф 1:22')]),
        section(7, [
            fact('Махлон — муж: ' + qq('Руфь Моавитянку, жену Махлонову', 'Руф 4:10') + '; детей от него текст не называет', 'Руф 4:10'),
            fact('Вооз — муж; сын Овид', 'Руф 4:13', 'Руф 4:17'),
            fact('Об Овиде: ' + qq('Он отец Иессея, отца Давидова', 'Руф 4:17'), 'Руф 4:17'),
        ]),
        section(9, [fact('Ноеминь — ' + qq('сноха ее Руфь Моавитянка', 'Руф 1:22'), 'Руф 1:22')]),
        section(10, [fact(q('В те дни, когда управляли судьи', 'Руф 1:1')),
                     fact('Эпоха «Судьи»', 'Руф 1:1', kind='inference')],
                extra='<p><a class="btn" href="#/time/p-ruf">Время</a></p>'),
        section(11, data_items(pid, 14)),
        section(12, data_items(pid, 15), extra=f'<p class="muted">География: для Руфи в эскизе не нарисована</p>'),
        section(14, data_items(pid, 17)),
        section(15, data_items(pid, 18)),
        section(16, data_items(pid, 19)),
        section(18, data_items(pid, 21)),
        section(19, data_items(pid, 22)),
        sec20(pid, ['руф'], 'Руф 1:4', excl=()),
        section(21, data_items(pid, 24), study=True),
    ]
    body = f'<div class="card">{header}<div class="sections">{"".join(s)}</div></div>'
    screen('card-p-ruf', 'Руфь — Карточка', body, subject=pid, cont='Руфь — Карточка', tool='card', h1='Руфь')


# ── Указатель
RUTH_INDEX = [
    ('p-elimelekh', 'Елимелех', 'Руф 1:2'), ('p-noemin', 'Ноеминь', 'Руф 1:2'),
    ('p-makhlon', 'Махлон', 'Руф 1:2'), ('p-khileon', 'Хилеон', 'Руф 1:2'),
    ('p-orfa', 'Орфа', 'Руф 1:4'), ('p-ruf', 'Руфь', 'Руф 1:4'), ('p-vooz', 'Вооз', 'Руф 2:1'),
    ('p-rakhil', 'Рахиль', 'Руф 4:11'), ('p-liya', 'Лия', 'Руф 4:11'), ('p-fares', 'Фарес', 'Руф 4:12'),
    ('p-famar', 'Фамарь', 'Руф 4:12'), ('p-iuda', 'Иуда', 'Руф 4:12'), ('p-ovid', 'Овид', 'Руф 4:17'),
    ('p-iessey', 'Иессей', 'Руф 4:17'), ('p-david', 'Давид', 'Руф 4:17'), ('p-esrom', 'Есром', 'Руф 4:18'),
    ('p-aram', 'Арам', 'Руф 4:19'), ('p-aminadav', 'Аминадав', 'Руф 4:19'),
    ('p-naasson', 'Наассон', 'Руф 4:20'), ('p-salmon', 'Салмон', 'Руф 4:20'),
]


def person_href(pid, label):
    d = DRAWN.get(pid, {})
    return d.get('card') or d.get('gen') or d.get('time') or stub_href(f'Карточка — {label}')


def index_screens():
    ot = ORDER[:ORDER.index('Мф')]
    nt = ORDER[ORDER.index('Мф'):]

    def books(lst):
        return ''.join(
            f'<li><a href="{"#/index/ruf" if b == "Руф" else stub_href("Указатель — книга " + BOOK_FULL[b])}">{BOOK_FULL[b]}</a></li>'
            for b in lst)
    tabs = (f'<ul class="tabs" role="list"><li><a href="{stub_href("Указатель по алфавиту")}">По алфавиту</a></li>'
            f'<li><a href="{stub_href("Указатель по видам")}">По видам</a></li>'
            f'<li><a aria-current="page" href="#/index">По книгам Библии</a></li></ul>')
    body = f'''{tabs}
<section aria-labelledby="h-ot"><h2 id="h-ot">Ветхий Завет — {len(ot)} книг</h2><ul class="books">{books(ot)}</ul></section>
<section aria-labelledby="h-nt"><h2 id="h-nt">Новый Завет — {len(nt)} книг</h2><ul class="books">{books(nt)}</ul></section>
<p class="note">Книги — в порядке Синодального издания. В эскизе нарисована только книга Руфь.</p>'''
    screen('index', 'Указатель', body, cont='Указатель — по книгам', h1='Указатель: по книгам Библии')
    seen = set()
    rows = []
    for pid, nm, r in RUTH_INDEX:
        assert pid in A and pid not in seen, pid
        seen.add(pid)
        check_name(nm, r)
        sub = disamb(pid)
        rows.append(f'<li><a class="iname" href="{person_href(pid, nm)}">{E(nm)}</a>'
                    f'<span class="isub">{E(sub)}</span>{ref(r)}</li>')
    body = f'''{tabs}
<p class="lead">Все, кого книга называет по имени, — {len(rows)}. В порядке, в каком книга их называет; адрес — первое место в книге.</p>
<ol class="ilist">{''.join(rows)}</ol>
{sketch_note('Список составлен для эскиза вручную по тексту книги; для каждого имени проверено, что оно стоит в указанном стихе.')}'''
    screen('index-ruf', 'Указатель — Руфь', body, cont='Указатель — книга Руфь', h1='Книга Руфь: кто назван')


def stub():
    TEMPLATES['stub'] = '''<div class="screen stubscr" data-title="Не нарисовано">
<h1 class="scr-h" tabindex="-1">Этот экран в эскизе не нарисован</h1>
<p class="lead" data-stub-what></p>
<p class="btnrow"><button type="button" class="btn" data-back>Вернуться</button> <a class="btn" href="#/">Главная</a></p>
</div>'''


def search_tpl():
    TEMPLATES['search'] = '''<div class="screen searchscr" data-title="Поиск">
<h1 class="scr-h" tabindex="-1">Поиск</h1>
<div data-results aria-live="polite"></div>
</div>'''


# ───────────────────────── Индекс поиска ─────────────────────────
KIND = {'human': 'человек', 'unnamed': 'безымянное лицо', 'people': 'народ', 'clan': 'род',
        'angel': 'ангел', 'group': 'группа'}


def first_ref(a):
    for f in a.get('facts', []):
        if f['sec'] == 23 and f['value'].get('first'):
            return f['value']['first']
    rs = [r for n in a.get('names', []) for r in (n.get('refs') or [])]

    def order(r):
        try:
            k = units(r)[0][0]
        except Exception:
            return (999, 0, 0)
        return (ORDER.index(k[0]), k[1], k[2])
    return min(rs, key=order) if rs else ''


def search_index():
    persons = []
    for pid, a in A.items():
        forms = []
        for n in a.get('names', []):
            if n['form'] not in forms:
                forms.append(n['form'])
        if not forms:
            continue
        fr = first_ref(a)
        try:
            units(fr)
        except Exception:
            fr = ''
        persons.append([pid, forms, a.get('disambig') or '', KIND.get(a['kind'], ''),
                        a.get('prominence') or 0, disp(fr) if fr else ''])
    areas = [[x['id'], x['name'], x['kind']] for x in AREAS if x['kind'] in ('tribe', 'nation', 'house')]
    return persons, areas


def verse_persons(keys):
    """Кто назван в стихе. Сильные ссылки — имена, родство, браки, линии; слабые — ссылки записей
    карточки. Лицо по слабой ссылке берётся, только если в стихе нет его тёзки по сильной.
    И в любом случае имя лица должно стоять в стихе."""
    def collect(pairs):
        cover = {}
        for pid, rs in pairs:
            for r in rs or []:
                try:
                    us = units(r)
                except Exception:
                    continue
                for u in us:
                    for k in u:
                        if k in keys:
                            cover.setdefault(k, set()).add(pid)
        return cover
    strong_pairs = []
    for pid, a in A.items():
        for n in a.get('names', []):
            strong_pairs.append((pid, n.get('refs')))
    for o in ORIG:
        strong_pairs += [(o['child'], o['refs']), (o['parent'], o['refs'])]
    for u in UNIONS:
        rr = [r for t in u['terms'] for r in t['refs']]
        strong_pairs += [(u.get('husband'), rr), (u.get('wife'), rr)]
    for k in KIN:
        strong_pairs += [(k['from'], k['refs']), (k['to'], k['refs'])]
    for ln in (LINE_J, LINE_L):
        strong_pairs += [(p['id'], p['refs']) for p in ln['persons']]
    weak_pairs = []

    def walk(pid, o):
        if isinstance(o, dict):
            for kk, vv in o.items():
                if kk in ('refs', 'ref'):
                    weak_pairs.append((pid, vv if isinstance(vv, list) else [vv]))
                else:
                    walk(pid, vv)
        elif isinstance(o, list):
            for vv in o:
                walk(pid, vv)
    for pid, a in A.items():
        walk(pid, a.get('facts'))
    strong = collect(strong_pairs)
    weak = collect(weak_pairs)
    out = {}
    for k in set(strong) | set(weak):
        words = norm(TEXT[k]).split()

        def pos_of(pid):
            pos = None
            for n in A[pid].get('names', []):
                if not n['form'][:1].isupper() or n.get('type') not in ('main', 'variant', 'renamed', 'foreign'):
                    continue
                w0 = norm(n['form']).split()
                if not w0:
                    continue
                f0 = w0[0]
                st = f0[:-1] if len(f0) >= 3 else f0
                lim = 4 if len(f0) > 3 else 1
                for i, w in enumerate(words):
                    if w.startswith(st) and (len(w) - len(f0)) <= lim and len(w) >= len(f0) - (1 if len(f0) > 3 else 0):
                        pos = i if pos is None else min(pos, i)
                        break
            return pos
        found = {}
        for pid in strong.get(k, ()):
            if pid in A:
                p = pos_of(pid)
                if p is not None:
                    found[pid] = p
        strong_names = {name(p) for p in found}
        for pid in weak.get(k, set()) - set(found):
            if pid in A and name(pid) not in strong_names:
                p = pos_of(pid)
                if p is not None:
                    found[pid] = p
        if found:
            out[key(k)] = [p for p, _ in sorted(found.items(), key=lambda kv: (kv[1], kv[0]))]
    return out


def typo_verse(t):
    # прямые кавычки текста → «»
    n = [0]

    def rep(m):
        n[0] += 1
        return '«' if n[0] % 2 else '»'
    return re.sub(r'"', rep, t)


def main():
    home_ab()
    home_v()
    home_d()
    gen_noy()
    gen_avraam()
    gen_tribes()
    gen_messiah()
    time_screen()
    geo_avraam()
    card_avraam()
    card_david()
    card_ruf()
    index_screens()
    stub()
    search_tpl()

    # Целые главы для поиска по адресу (С1, С2) и вклеек.
    for ch in ['Быт 5', 'Быт 6', 'Быт 7', 'Быт 11', 'Быт 12', 'Быт 25', 'Руф 1', 'Руф 2', 'Руф 3', 'Руф 4',
               'Мф 1', 'Лк 3', 'Исх 12']:
        for u in units(ch):
            for k in u:
                USED.add(k)
    used_sorted = sorted(USED, key=lambda k: (ORDER.index(k[0]), k[1], k[2]))
    verses = {key(k): typo_verse(TEXT[k]) for k in used_sorted}
    persons, areas = search_index()
    vp = verse_persons(set(USED))
    pnames = {pid: name(pid) for pid in A}
    pnames['p-iosif-muzh-marii'] = 'Иосиф, муж Марии'
    data = {
        'verses': verses,
        'persons': persons,
        'areas': areas,
        'books': [[b, BOOK_FULL[b]] for b in ORDER],
        'drawn': DRAWN,
        'versePersons': vp,
        'timePersons': TIME_PERSONS,
    }
    css = (HERE / 'src/style.css').read_text(encoding='utf-8')
    js = (HERE / 'src/app.js').read_text(encoding='utf-8')
    shell = (HERE / 'src/shell.html').read_text(encoding='utf-8')
    tpls = '\n'.join(f'<template id="t-{k}">{v}</template>' for k, v in TEMPLATES.items())
    djson = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    out = (shell.replace('/*CSS*/', css)
           .replace('<!--TEMPLATES-->', tpls)
           .replace('/*DATA*/', djson)
           .replace('/*JS*/', js)
           .replace('<!--SIGN-SEARCH-->', svg(SIGN['search'], 24, 'ico'))
           .replace('<!--SIGN-HOME-->', svg(SIGN['home'], 24, 'ico'))
           .replace('<!--SIGN-BACK-->', svg(SIGN['back'], 24, 'ico')))
    OUT.write_text(out, encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(out.encode()) / 1024:.0f} КБ; экранов {len(TEMPLATES)}; '
          f'стихов {len(verses)}; лиц в поиске {len(persons)}; цитат сверено {len(QUOTES)}')
    for qt, rs in DATA_UNQUOTED:
        print(f'  цитата данных без дословного стиха — показана без кавычек: «{qt[:70]}» ← {"; ".join(rs)}')


if __name__ == '__main__':
    main()
