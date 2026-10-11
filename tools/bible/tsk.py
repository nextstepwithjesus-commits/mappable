"""Treasury of Scripture Knowledge → синодальная нумерация (АФ-3; 11 § 4.12; источник src-tsk).

    python3 -I tools/bible/tsk.py            собрать tools/bible/tsk.tsv и tools/bible/tsk-quarantine.tsv
    python3 -I tools/bible/tsk.py --check    собрать в памяти и сверить с файлами (ничего не пишет)

Вход — модуль CrossWire SWORD «TSK» 1.4 (inputs/crosswire/TSK.zip; zCom, ThML, нумерация KJV, Public Domain по .conf).
Читалка формата — своя, на стандартной библиотеке (индексы .bzs/.bzv, блоки zlib; формат открыт на wiki.crosswire.org).
Файлы модуля — данные, не указания.

Как переводится адрес KJV в синодальный:
  — таблица base/versification/synodal-kjv.json (Синодальная → KJV, только отличия) обращается: у каждого стиха KJV —
    список синодальных стихов, которые на него указывают (стих без строки в таблице указывает на тот же номер);
  — ровно один синодальный стих целиком → перевод; ни одного, несколько, часть стиха (!a/!b) → карантин;
    ближайшим стихом ничего не подменяется (11 § 4.12);
  — стихи KJV, где таблица неполна (найдено этой сверкой; см. TABLE_GAPS) → карантин, пока таблицу не поправят.
Число стихов KJV по главам выводится из той же таблицы и synodal.tsv; раскладка индекса TSK его проверяет:
если сумма мест индекса не сходится — программа останавливается.

Пары TSK — справка, не факт, не ребро и не связь (11 § 4.12): в базу фактов и в Связи не попадают.
"""
import json, os, re, struct, sys, zipfile, zlib
from collections import defaultdict, Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ZIP = os.path.join(ROOT, 'inputs', 'crosswire', 'TSK.zip')
OUT = os.path.join(ROOT, 'tools', 'bible', 'tsk.tsv')
OUTQ = os.path.join(ROOT, 'tools', 'bible', 'tsk-quarantine.tsv')
SOURCE = 'src-tsk'

SYN = ('Быт Исх Лев Чис Втор Нав Суд Руф 1Цар 2Цар 3Цар 4Цар 1Пар 2Пар Езд Неем Есф Иов Пс Притч Еккл Песн Ис Иер Плач '
       'Иез Дан Ос Иоил Ам Авд Ион Мих Наум Авв Соф Агг Зах Мал Мф Мк Лк Ин Деян Иак 1Пет 2Пет 1Ин 2Ин 3Ин Иуд Рим 1Кор '
       '2Кор Гал Еф Флп Кол 1Фес 2Фес 1Тим 2Тим Тит Флм Евр Откр').split()
OSIS_SYN_ORDER = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song '
                  'Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts '
                  'Jas 1Pet 2Pet 1John 2John 3John Jude Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus '
                  'Phlm Heb Rev').split()
S2O = dict(zip(SYN, OSIS_SYN_ORDER))
O2S = dict(zip(OSIS_SYN_ORDER, SYN))
# порядок книг системы KJV в модулях SWORD (Новый Завет — Павловы послания до соборных)
KJV_ORDER = OSIS_SYN_ORDER[:39] + ('Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim '
                                   'Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()
# сокращения TSK → OSIS
TSK_BOOKS = {
    'Ge': 'Gen', 'Ex': 'Exod', 'Le': 'Lev', 'Nu': 'Num', 'De': 'Deut', 'Jos': 'Josh', 'Jud': 'Judg', 'Ru': 'Ruth',
    '1Sa': '1Sam', '2Sa': '2Sam', '1Ki': '1Kgs', '2Ki': '2Kgs', '1Ch': '1Chr', '2Ch': '2Chr', 'Ezr': 'Ezra', 'Ne': 'Neh',
    'Es': 'Esth', 'Job': 'Job', 'Ps': 'Ps', 'Pr': 'Prov', 'Ec': 'Eccl', 'So': 'Song', 'Isa': 'Isa', 'Jer': 'Jer',
    'La': 'Lam', 'Eze': 'Ezek', 'Da': 'Dan', 'Ho': 'Hos', 'Joe': 'Joel', 'Am': 'Amos', 'Ob': 'Obad', 'Jon': 'Jonah',
    'Mic': 'Mic', 'Na': 'Nah', 'Hab': 'Hab', 'Zep': 'Zeph', 'Hag': 'Hag', 'Zec': 'Zech', 'Mal': 'Mal',
    'Mt': 'Matt', 'Mr': 'Mark', 'Lu': 'Luke', 'Joh': 'John', 'Ac': 'Acts', 'Ro': 'Rom', '1Co': '1Cor', '2Co': '2Cor',
    'Ga': 'Gal', 'Eph': 'Eph', 'Php': 'Phil', 'Col': 'Col', '1Th': '1Thess', '2Th': '2Thess', '1Ti': '1Tim',
    '2Ti': '2Tim', 'Tit': 'Titus', 'Phm': 'Phlm', 'Heb': 'Heb', 'Jas': 'Jas', '1Pe': '1Pet', '2Pe': '2Pet',
    '1Jo': '1John', '2Jo': '2John', '3Jo': '3John', 'Jude': 'Jude', 'Re': 'Rev',
}
SINGLE_CHAPTER = {'Obad', 'Phlm', '2John', '3John', 'Jude'}

# Неполнота таблицы synodal-kjv.json, найденная сверкой с раскладкой индекса TSK (АФ-3). В нашем тексте в этих главах
# на стих меньше, чем в KJV: два стиха KJV слиты в один синодальный, а таблица этого не знает. До поправки таблицы
# такие стихи KJV — в карантине. Число стихов KJV в главе — для раскладки индекса.
KJV_VERSES_FIX = {('Lev', 14): 57, ('Acts', 19): 41}
TABLE_GAPS = {
    'Lev.14.55': 'таблица неполна: Лев 14:55 = KJV 14:55–56, Лев 14:56 = KJV 14:57 (по тексту); строки в таблице нет',
    'Lev.14.56': 'таблица неполна: KJV 14:56 — вторая часть Лев 14:55, а таблица ведёт его в Лев 14:56',
    'Lev.14.57': 'таблица неполна: KJV 14:57 = Лев 14:56; строки в таблице нет',
    'Acts.19.41': 'таблица неполна: KJV 19:41 — конец Деян 19:40; строки в таблице нет',
}


# ---------- SWORD zCom ----------
def read_testament(z, base, t):
    bzs, bzv, bzz = (z.read(f'{base}{t}.{x}') for x in ('bzs', 'bzv', 'bzz'))
    blocks = []
    for i in range(0, len(bzs), 12):
        off, size, usize = struct.unpack('<III', bzs[i:i + 12])
        raw = zlib.decompress(bzz[off:off + size])
        if len(raw) != usize:
            raise SystemExit(f'{t}: блок {i // 12} — длина {len(raw)} вместо {usize}')
        blocks.append(raw)
    idx = [struct.unpack('<IIH', bzv[i:i + 10]) for i in range(0, len(bzv), 10)]
    return idx, [blocks[b][o:o + s].decode('utf-8', 'replace') if s else None for b, o, s in idx]


# ---------- Синодальный текст и таблица нумерации ----------
EMPTY = set()  # пустые стихи нашего текста (tools/bible/source-issues.tsv, вид empty): ссылка на них — ошибка базы


def load_synodal():
    order = []
    for line in open(os.path.join(ROOT, 'tools', 'bible', 'synodal.tsv'), encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        order.append((p[0], int(p[1]), int(p[2])))
        if len(p) < 4 or not p[3].strip():
            EMPTY.add(order[-1])
    return order


def load_table():
    return json.load(open(os.path.join(ROOT, 'base', 'versification', 'synodal-kjv.json'), encoding='utf-8'))['map']


def kjv_targets(table, syn):
    b, c, v = syn
    return table.get(f'{b} {c}:{v}', [f'{S2O[b]}.{c}.{v}'])


def inverse(order, table):
    """Стих KJV («Gen.1.1») → [(синодальный стих, часть или '')]."""
    inv = defaultdict(list)
    for syn in order:
        for t in kjv_targets(table, syn):
            m = re.match(r'^(\w+)\.(\d+)\.(\d+)(?:!([ab]))?$', t)
            inv[f'{m[1]}.{m[2]}.{m[3]}'].append((syn, m[4] or ''))
    return inv


def kjv_layout(order, table):
    have = defaultdict(set)
    for syn in order:
        for t in kjv_targets(table, syn):
            m = re.match(r'^(\w+)\.(\d+)\.(\d+)', t)
            have[(m[1], int(m[2]))].add(int(m[3]))
    counts = {}
    for o in KJV_ORDER:
        chs = sorted(c for (b, c) in have if b == o)
        if chs != list(range(1, len(chs) + 1)):
            raise SystemExit(f'KJV {o}: главы {chs}')
        counts[o] = [KJV_VERSES_FIX.get((o, c), max(have[(o, c)])) for c in chs]
    return counts


def kjv_map_one(inv, counts, key, allow_empty=False):
    """Стих KJV → (синодальный стих, None) или (None, причина карантина)."""
    b, c, v = key.split('.')
    c, v = int(c), int(v)
    if b not in counts or c < 1 or c > len(counts[b]):
        return None, f'нет главы {b} {c} в KJV'
    if v < 1 or v > counts[b][c - 1]:
        return None, ('надписание псалма (стих 0)' if v == 0 else f'нет стиха {b} {c}:{v} в KJV')
    if key in TABLE_GAPS:
        return None, TABLE_GAPS[key]
    src = inv.get(key, [])
    if not src:
        return None, 'у стиха KJV нет синодальной пары в таблице'
    if len(src) > 1:
        return None, 'один стих KJV — несколько синодальных: ' + ', '.join(f'{s[0][0]} {s[0][1]}:{s[0][2]}' for s in src)
    (syn, part), = src
    if part:
        return None, f'стих KJV — часть синодального {syn[0]} {syn[1]}:{syn[2]} ({part})'
    if syn in EMPTY and not allow_empty:
        return None, f'синодальный стих {addr(syn)} пуст в нашем тексте (tools/bible/source-issues.tsv)'
    return syn, None


# ---------- разбор записей TSK ----------
def strip_label(s):
    """Слово стиха из подписи группы TSK (английское, как в источнике); примечания составителей отбрасываются."""
    s = re.sub(r'<[^>]+>', '', s).replace('\n', ' ')
    s = re.sub(r'^(\s*(A\.M\.|B\.C\.|An\. Ex\. Is\.|A\.D\.)\s*[\d.,\- ]*)+', '', s).strip()
    m = re.match(r'^(.*?)\.(\s|$|[A-Z{(])', s)
    word = (m[1] if m else s).strip()
    return re.sub(r'\s+', ' ', word)[:80]


ITEM = re.compile(r'^(?:(\d+):)?(\d+)(?:-(?:(\d+):)?(\d+))?$')


def parse_entry(text, book, chapter):
    """Запись TSK → группы: [{'word': str, 'refs': [(kind, payload)]}]. kind: 'ref' (b, c1, v1, c2, v2) | 'mark' | 'amb'."""
    groups = []
    cur = None
    prev_ref_ctx = None  # (book, chapter) последней ссылки предыдущего scripRef той же группы
    stats = Counter()
    for seg in re.split(r'<br\s*/>', text):
        seg = seg.strip()
        if not seg:
            continue
        refs = re.findall(r'<scripRef([^>]*)>(.*?)</scripRef>', seg, re.S)
        plain_refs = [body for attrs, body in refs if 'passage=' not in attrs]
        if refs and not plain_refs:
            stats['outline'] += len(refs)  # план главы (passage=…) — не перекрёстные ссылки
            continue
        rest = re.sub(r'<scripRef[^>]*>.*?</scripRef>', '', seg, flags=re.S).strip()
        if not plain_refs:
            cur = {'word': strip_label(seg), 'refs': []}
            groups.append(cur)
            prev_ref_ctx = None
            continue
        if rest:
            stats['mixed'] += 1
        if cur is None:
            cur = {'word': '', 'refs': []}
            groups.append(cur)
        for body in plain_refs:
            continuation = prev_ref_ctx is not None
            bk, ch = (prev_ref_ctx if continuation else (book, chapter))
            ctx_ok_book = (not continuation) or prev_ref_ctx[0] == book
            ctx_ok_chap = (not continuation) or prev_ref_ctx == (book, chapter)
            book_unclear = continuation and not ctx_ok_book  # перенос строки: книга предыдущей строки не та, что у записи
            for pi, part in enumerate([p.strip() for p in body.split(';')]):
                if not part:
                    continue
                if part.startswith('*'):
                    cur['refs'].append(('mark', part))
                    continue
                if re.search(r'-\s*[1-3]?[A-Z]', part):
                    cur['refs'].append(('amb', (part, 'диапазон через несколько книг')))
                    continue
                explicit = False
                for ii, item in enumerate([x.strip() for x in part.split(',')]):
                    if not item:
                        continue  # лишняя запятая источника
                    m = re.match(r'^([1-3]?[A-Z][a-z]*)\s*(.*)$', item)
                    if m:  # название книги — в начале части или после запятой вместо «;»
                        if m[1] not in TSK_BOOKS:
                            cur['refs'].append(('amb', (item, f'неизвестное сокращение книги «{m[1]}»')))
                            bk, ch, explicit, book_unclear = None, None, True, False
                            continue
                        bk, ch, explicit, book_unclear = TSK_BOOKS[m[1]], None, True, False
                        item = m[2]
                    item = item.replace(' ', '')
                    if bk is None:
                        cur['refs'].append(('amb', (item, 'книга не разобрана')))
                        continue
                    if book_unclear:
                        cur['refs'].append(('amb', (item, 'перенос строки в источнике: книга неясна')))
                        continue
                    im = ITEM.match(item)
                    if not im:
                        cur['refs'].append(('amb', (item, 'адрес не разобран')))
                        continue
                    c1, v1, c2, v2 = im[1], int(im[2]), im[3], im[4]
                    if c1 is None:
                        # голый номер стиха
                        if ch is None:
                            if bk in SINGLE_CHAPTER:
                                ch = 1
                            else:
                                cur['refs'].append(('amb', (item, 'номер без главы после названия книги')))
                                continue
                        if ii == 0 and pi > 0 and not explicit:
                            cur['refs'].append(('amb', (item, 'голый номер после «;»: глава неясна')))
                            continue
                        if ii == 0 and pi == 0 and continuation and not ctx_ok_chap:
                            cur['refs'].append(('amb', (item, 'перенос строки в источнике: глава неясна')))
                            continue
                        c1 = ch
                    else:
                        c1 = int(c1)
                    if v2 is None:
                        c2, v2 = c1, v1
                    else:
                        c2 = int(c2) if c2 else c1
                        v2 = int(v2)
                    ch = c2
                    cur['refs'].append(('ref', (bk, c1, v1, c2, v2)))
            prev_ref_ctx = None if bk is None else (bk, ch if ch is not None else chapter)
    return groups, stats


def addr(syn):
    return f'{syn[0]} {syn[1]}:{syn[2]}'


def addr_range(a, b):
    if a == b:
        return addr(a)
    if a[0] == b[0] and a[1] == b[1]:
        return f'{addr(a)}-{b[2]}'
    return f'{addr(a)}-{b[1]}:{b[2]}'


def build():
    order = load_synodal()
    pos = {k: i for i, k in enumerate(order)}
    table = load_table()
    inv = inverse(order, table)
    counts = kjv_layout(order, table)
    z = zipfile.ZipFile(ZIP)
    conf = z.read('mods.d/tsk.conf').decode('utf-8')
    if 'DistributionLicense=Public Domain' not in conf or 'Version=1.4' not in conf:
        raise SystemExit('tsk.conf: ожидались Version=1.4 и DistributionLicense=Public Domain')
    base = 'modules/comments/zcom/tsk/'
    rows, qrows = [], []
    n = Counter()
    stats = Counter()
    for t, books in (('ot', KJV_ORDER[:39]), ('nt', KJV_ORDER[39:])):
        idx, ent = read_testament(z, base, t)
        slots, i = [], 2  # 0 — пусто, 1 — заголовок завета
        for b in books:
            i += 1  # вступление книги
            for c, nv in enumerate(counts[b], 1):
                i += 1  # заголовок главы (в TSK там иногда копия чужой записи — не берётся)
                for v in range(1, nv + 1):
                    slots.append(((b, c, v), i))
                    i += 1
        if i != len(ent):
            raise SystemExit(f'{t}: раскладка KJV ({i}) не сходится с индексом TSK ({len(ent)})')
        for (b, c, v), p in slots:
            text = ent[p]
            if not text:
                n['стихов KJV без записи'] += 1
                continue
            n['стихов KJV с записью'] += 1
            groups, st = parse_entry(text, b, c)
            stats.update(st)
            kjv_key = f'{b}.{c}.{v}'
            home, why_home = kjv_map_one(inv, counts, kjv_key)
            if home and b == 'Ps' and v == 1 and 'Title' in text:
                # TSK кладёт группы к надписанию (KJV стих 0) в запись стиха 1 и границу не размечает.
                # Перевод — только если надписание и стих 1 KJV лежат в одном синодальном стихе (Пс 10:1 = Ps 11:0–1).
                # Если у псалма в KJV надписания нет (стиха 0 нет в таблице), «(Title.)» в TSK — только примечание.
                t0 = inv.get(f'Ps.{c}.0', [])
                if t0 and t0 != [(home, '')]:
                    where = ', '.join(addr(x[0]) for x in t0)
                    home, why_home = None, (f'надписание псалма: группы надписания и стиха 1 в записи TSK не разделены, '
                                            f'а в синодальном тексте это разные стихи (надписание — {where}; стих 1 — {addr(home)})')
            for gi, g in enumerate(groups, 1):
                kept = []
                for ri, (kind, x) in enumerate(g['refs'], 1):
                    if kind == 'mark':
                        kept.append(x)
                        continue
                    n['ссылок'] += 1
                    if kind == 'amb':
                        src_txt, why = x
                    else:
                        rb, c1, v1, c2, v2 = x
                        src_txt = f'{rb}.{c1}.{v1}' + (f'-{rb}.{c2}.{v2}' if (c1, v1) != (c2, v2) else '')
                        why = None
                        if home is None:
                            why = f'исходный стих: {why_home}'
                        else:
                            a, why = kjv_map_one(inv, counts, f'{rb}.{c1}.{v1}')
                            if why is None and (c1, v1) != (c2, v2):
                                # диапазон: каждый стих KJV — однозначно, синодальные стихи — по порядку
                                if (c2, v2) < (c1, v1):
                                    why = 'конец диапазона раньше начала'
                                else:
                                    seq, cc, vv = [], c1, v1
                                    while why is None:
                                        inner = (cc, vv) not in ((c1, v1), (c2, v2))  # пустой стих внутри диапазона не мешает
                                        s, w = kjv_map_one(inv, counts, f'{rb}.{cc}.{vv}', allow_empty=inner)
                                        if w:
                                            why = f'в диапазоне: {w}'
                                            break
                                        seq.append(s)
                                        if (cc, vv) == (c2, v2):
                                            break
                                        vv += 1
                                        if vv > counts[rb][cc - 1]:
                                            cc, vv = cc + 1, 1
                                            if cc > len(counts[rb]):
                                                why = 'диапазон за концом книги'
                                    if why is None:
                                        ps = [pos[s] for s in seq]
                                        if ps != sorted(ps):
                                            why = 'в диапазоне синодальные стихи идут не по порядку'
                                        else:
                                            a2 = seq[-1]
                                    if why is None:
                                        target = addr_range(seq[0], a2)
                            elif why is None:
                                target = addr(a)
                    if why:
                        n['в карантине'] += 1
                        qrows.append([*(map(str, home) if home else ('', '', '')), kjv_key, str(gi), str(ri),
                                      g['word'], src_txt, why, SOURCE])
                    else:
                        n['переведено'] += 1
                        kept.append(target)
                if any(not k.startswith('*') for k in kept) and home:
                    rows.append((pos[home], home, kjv_key, gi, g['word'], kept))
    rows.sort(key=lambda r: (r[0], KJV_ORDER.index(r[2].split('.')[0]), int(r[2].split('.')[1]), int(r[2].split('.')[2]), r[3]))
    out = ['книга\tглава\tстих\tстих KJV\tгруппа\tслово TSK\tместа\tисточник']
    for _, home, kjv_key, gi, word, kept in rows:
        out.append('\t'.join([*map(str, home), kjv_key, str(gi), word, '; '.join(kept), SOURCE]))
    outq = ['книга\tглава\tстих\tстих KJV\tгруппа\tномер в группе\tслово TSK\tадрес TSK\tпричина\tисточник']
    outq += ['\t'.join(r) for r in qrows]
    n['групп в файле'] = len(rows)
    return '\n'.join(out) + '\n', '\n'.join(outq) + '\n', n, stats, Counter(r[8].split(':')[0] for r in qrows)


def main():
    tsv, qtsv, n, stats, reasons = build()
    print('TSK: ' + '; '.join(f'{k} {v}' for k, v in n.items()))
    print('  план главы (passage=…) — пропущено ссылок: %d; смешанных строк: %d' % (stats['outline'], stats['mixed']))
    print('  карантин по причинам: ' + '; '.join(f'{k} — {v}' for k, v in reasons.most_common()))
    if '--check' in sys.argv:
        ok = open(OUT, encoding='utf-8').read() == tsv and open(OUTQ, encoding='utf-8').read() == qtsv
        print('сверка с файлами: ' + ('совпадает' if ok else 'РАСХОДИТСЯ'))
        sys.exit(0 if ok else 1)
    open(OUT, 'w', encoding='utf-8').write(tsv)
    open(OUTQ, 'w', encoding='utf-8').write(qtsv)


if __name__ == '__main__':
    main()
