"""Сверка tools/bible/synodal.tsv и brackets.tsv с модулем CrossWire RusSynodal (АФ-2; ничего не пишет).

    python3 -I tools/bible/crosswire-rus.py [--list]

Вход — inputs/crosswire/RusSynodal.zip (zText, OSIS, нумерация Synodal, Public Domain по .conf). Читалка — своя, на
стандартной библиотеке. Строение модуля (книга, глава, стих) — по меткам <div type="book"> и <chapter sID> в записях.
Печатает: сколько стихов совпадает дословно, классы расхождений, курсив <transChange type="added"> внутри и вне скобок,
сверку строк вида added из brackets.tsv, Пс 116:2 и 117:2–4.
"""
import os, re, struct, sys, zipfile, zlib
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SYN = ('Быт Исх Лев Чис Втор Нав Суд Руф 1Цар 2Цар 3Цар 4Цар 1Пар 2Пар Езд Неем Есф Иов Пс Притч Еккл Песн Ис Иер Плач '
       'Иез Дан Ос Иоил Ам Авд Ион Мих Наум Авв Соф Агг Зах Мал Мф Мк Лк Ин Деян Иак 1Пет 2Пет 1Ин 2Ин 3Ин Иуд Рим 1Кор '
       '2Кор Гал Еф Флп Кол 1Фес 2Фес 1Тим 2Тим Тит Флм Евр Откр').split()
OSIS = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer '
        'Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Jas 1Pet 2Pet '
        '1John 2John 3John Jude Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Rev').split()
O2S = dict(zip(OSIS, SYN))
ws = lambda s: re.sub(r'\s+', ' ', s).strip()


def plain(s):
    s = re.sub(r'<note\b.*?</note>', '', s, flags=re.S)
    s = re.sub(r'<title\b.*?</title>', '', s, flags=re.S)
    return ws(re.sub(r'<[^>]+>', '', s))


def read_module():
    z = zipfile.ZipFile(os.path.join(ROOT, 'inputs', 'crosswire', 'RusSynodal.zip'))
    base = 'modules/texts/ztext/russynodal/'
    out = {}
    for t in ('ot', 'nt'):
        bzs, bzv, bzz = (z.read(f'{base}{t}.{x}') for x in ('bzs', 'bzv', 'bzz'))
        blocks = []
        for i in range(0, len(bzs), 12):
            off, size, usize = struct.unpack('<III', bzs[i:i + 12])
            raw = zlib.decompress(bzz[off:off + size])
            assert len(raw) == usize
            blocks.append(raw)
        book = ch = v = None
        for i in range(0, len(bzv), 10):
            b, off, size = struct.unpack('<IIH', bzv[i:i + 10])
            s = blocks[b][off:off + size].decode('utf-8') if size else ''
            mb = re.search(r'<div[^>]*osisID="([^"]+)"[^>]*type="book"', s)
            mc = re.search(r'<chapter[^>]*osisID="([^".]+)\.(\d+)"[^>]*sID', s)
            if mc and not plain(s[:mc.start()]):
                book, ch, v = mc[1], int(mc[2]), 0
                if plain(s) or '<title' in s:
                    out[(book, ch, 0)] = s
                continue
            if mb and not plain(re.sub(r'<title.*?</title>', '', s)):
                book, ch, v = mb[1], 0, None
                continue
            if v is None:
                continue
            v += 1
            out[(book, ch, v)] = s
    return z, out


def main():
    z, mod = read_module()
    conf = z.read('mods.d/russynodal.conf').decode('utf-8')
    print('conf: ' + '; '.join(l for l in conf.splitlines() if re.match(r'^(Version|SwordVersionDate|Versification|DistributionLicense|TextSource)=', l)))
    syn, order = {}, []
    for line in open(os.path.join(ROOT, 'tools', 'bible', 'synodal.tsv'), encoding='utf-8'):
        p = line.rstrip('\n').split('\t') + ['']
        k = (p[0], int(p[1]), int(p[2]))
        syn[k] = p[3]
        order.append(k)
    M = {(O2S[b], c, v): t for (b, c, v), t in mod.items() if b in O2S}

    def full(k):  # надписание псалма — стих 0 или <title type="psalm"> — вместе со стихом
        raw = M.get(k, '')
        if k[2] == 1 and (k[0], k[1], 0) in M:
            raw = M[(k[0], k[1], 0)] + ' ' + raw
        raw = re.sub(r'<chapter[^>]*/>', '', raw)
        raw = re.sub(r'<title\b[^>]*type="psalm"[^>]*>(.*?)</title>', r'\1', raw)
        return ws(re.sub(r'<[^>]+>', '', raw))

    nsp = lambda s: re.sub(r'\s+([,.;:!?"\)\]])', r'\1', re.sub(r'([\("])\s+', r'\1', s))
    cls, ex = Counter(), {}
    for k in order:
        a = ws(syn[k])
        if k not in M:
            c = 'нет в модуле'
        elif a == plain(M[k]):
            c = 'дословно'
        elif a == full(k):
            c = 'надписание псалма: в модуле — разметкой title или в записи заголовка главы'
        elif a == ws(re.sub(r'&lt;note&gt;.*?&lt;/note&gt;', '', full(k))):
            c = 'в модуле примечание &lt;note&gt; внутри стиха'
        elif a == ws(re.sub(r'&lt;title.*?&lt;/title&gt;', '', full(k))):
            c = 'в модуле надписание следующего псалма в конце стиха'
        elif nsp(a) == nsp(full(k)):
            c = 'пробел у знака препинания'
        elif full(k).startswith(a):
            c = 'в модуле дописка после стиха'
        else:
            c = 'иное'
        cls[c] += 1
        ex.setdefault(c, []).append(f'{k[0]} {k[1]}:{k[2]}')
    print(f'наших стихов {len(order)}')
    for c, n in cls.most_common():
        print(f'  {c}: {n}' + ('' if c == 'дословно' else f' — {"; ".join(ex[c][:12])}{" …" if n > 12 else ""}'))
    extra = Counter((k[0], k[1]) for k in M if k not in syn and k[2] != 0)
    print('в модуле есть, у нас нет (66 книг): ' + '; '.join(f'{b} {c} — {n}' for (b, c), n in sorted(extra.items())))
    # курсив transChange
    tc = Counter()
    tcl = []
    for k in order:
        s = re.sub(r'<transChange[^>]*>', '\x01', M.get(k, '')).replace('</transChange>', '\x02')
        s = re.sub(r'<[^>]+>', '', s)
        sq = rd = 0
        for i, ch in enumerate(s):
            if ch == '[': sq += 1
            elif ch == ']': sq = max(0, sq - 1)
            elif ch == '(': rd += 1
            elif ch == ')': rd = max(0, rd - 1)
            elif ch == '\x01':
                w = s[i + 1:s.index('\x02', i)]
                where = 'внутри [ ]' if sq else ('внутри ( )' if rd else 'вне скобок')
                tc[where] += 1
                tcl.append((k, w, where))
    print(f'курсив <transChange type="added"> в 66 книгах: {len(tcl)} — ' + '; '.join(f'{w} {n}' for w, n in tc.most_common()))
    # строки added
    rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(ROOT, 'tools', 'bible', 'brackets.tsv'), encoding='utf-8')][1:]
    res = Counter()
    for r in rows:
        if r[6] != 'added':
            continue
        bk, c, v1, v2, shape, txt = r[0], int(r[1]), int(r[2]), int(r[3]), r[4], r[5]
        op, cl = ('[', ']') if shape.startswith('[') else ('(', ')')
        raw = ' '.join(M.get((bk, c, v), '') for v in range(v1, v2 + 1))
        s = re.sub(r'<transChange[^>]*>', '\x01', raw).replace('</transChange>', '\x02')
        s = re.sub(r'<[^>]+>', '', s)
        segs = re.findall(re.escape(op) + r'([^' + re.escape(op + cl) + r']*)' + re.escape(cl), s)
        hit = [x for x in segs if ws(x.replace('\x01', '').replace('\x02', '')) == ws(txt)]
        if not hit:
            st = 'в модуле этих скобок нет'
        elif any('\x01' in x for x in hit):
            st = 'в модуле в тех же скобках и с курсивом transChange'
        else:
            st = 'в модуле в тех же скобках, без transChange'
        res[st] += 1
    print(f'строк вида added в brackets.tsv: {sum(res.values())} — ' + '; '.join(f'{k} {v}' for k, v in res.items()))
    for k in [('Пс', 116, 2), ('Пс', 117, 2), ('Пс', 117, 3), ('Пс', 117, 4)]:
        m = re.sub(r'<[^>]+>', '', M[k]).strip()
        print(f'  {k[0]} {k[1]}:{k[2]} | у нас: {syn[k]} | в модуле: {m} | transChange: {"да" if "transChange" in M[k] else "нет"}')
    if '--list' in sys.argv:
        for k, w, where in tcl:
            print(f'{k[0]}\t{k[1]}\t{k[2]}\t{w}\t{where}')


if __name__ == '__main__':
    main()
