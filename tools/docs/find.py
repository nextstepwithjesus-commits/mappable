"""Поиск по проекту «Библия наглядно» для людей и агентов.

  npm run -s find -- "Каинан"            везде: решения, документы, исследования, рецензии, журнал, база лиц, код
  npm run -s find -- "Каинан" --only docs  только docs/app (также: base, code, all)
  npm run -s find -- "ОБЯЗАТЕЛЬНО" --all    все строки, без сокращения «… ещё N»; запрос прописными — с учётом регистра
  npm run -s find -- --dec В-17          текст решения владельца В-17
  npm run -s find -- --sec 07 8.3        раздел 8.3 документа 07 целиком («§ 8.3» тоже); --sec R12 3 — раздел исследования
  npm run -s find -- --person Давид      лица базы: id, уточнение, том

Без учёта регистра; «ё» и «е» не различаются. Показывает файл:строку.
"""
import glob, json, os, re, sys

APP = 'docs/app'


def norm(s):
    return s.lower().replace('ё', 'е')


def read(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()


GROUPS = [
    ('Решения и вопросы владельца', [f'{APP}/00-РЕГЛАМЕНТ.md', f'{APP}/ВОПРОСЫ.md']),
    ('Журнал и карта', [f'{APP}/ЖУРНАЛ.md', f'{APP}/КАРТА.md']),
    ('Документы', sorted(x for x in glob.glob(f'{APP}/[0-9][0-9]-*.md') if not os.path.basename(x).startswith('00-'))),
    ('Исследования', sorted(glob.glob(f'{APP}/research/*.md'))),
    ('Рецензии и очереди', sorted(glob.glob(f'{APP}/reviews/*.md'))),
    ('Данные: описания и пробы', sorted(glob.glob(f'{APP}/data/**/*.md', recursive=True))),
    ('Правила проекта', ['CLAUDE.md'] + sorted(glob.glob('.claude/**/*.md', recursive=True))),
]
CODE = [('Код базы и инструменты', sorted(glob.glob('tools/base/*.ts') + glob.glob('tools/docs/*.py') + glob.glob(f'{APP}/data/*.py'))),
        ('Прототипы', sorted(glob.glob('prototypes/*/*.md') + glob.glob('prototypes/*/*.py') + glob.glob('prototypes/*/src/*')))]


SHOW = 3


def search(q, only):
    # запрос прописными (ОБЯЗАТЕЛЬНО, ВП) ищется с учётом регистра
    exact = len(q) > 1 and q.isupper()
    nq = q.replace('ё', 'е') if exact else norm(q)
    match = (lambda l: nq in l.replace('ё', 'е')) if exact else (lambda l: nq in norm(l))
    groups = []
    if only in ('all', 'docs'):
        groups += GROUPS
    if only in ('all', 'code'):
        groups += CODE
    total = 0
    for name, files in groups:
        hits = []
        for p in files:
            if not os.path.exists(p) or p.endswith('УКАЗАТЕЛЬ.md'):
                continue
            ls = read(p).split('\n')
            found = [(i, l) for i, l in enumerate(ls, 1) if match(l)]
            if found:
                hits.append((p, found))
        if not hits:
            continue
        n = sum(len(f) for _, f in hits)
        total += n
        print(f'\n=== {name}: {n} ===')
        for p, found in hits:
            print(f'  {p}  ({len(found)})')
            for i, l in found[:SHOW]:
                s = l.strip()
                k = (s.replace('ё', 'е') if exact else norm(s)).find(nq)
                a = max(0, k - 70)
                print(f'    {i}: {"…" if a else ""}{s[a:a + 170]}{"…" if len(s) > a + 170 else ""}')
            if len(found) > SHOW:
                print(f'    … ещё {len(found) - SHOW} (флаг --all покажет всё)')
    if only in ('all', 'base'):
        total += person(q, quiet_header=False)
    if not total:
        print('Ничего не найдено.')


def person(q, quiet_header=True):
    nq = norm(q)
    out = []
    for p in sorted(glob.glob('base/actors/*.json')):
        for a in json.load(open(p, encoding='utf-8'))['items']:
            forms = [n.get('form', '') for n in a.get('names', [])]
            stem = nq[:-2] if len(nq) > 5 else (nq[:-1] if len(nq) > 3 else nq)
            if any(norm(f).startswith(nq) or (norm(f).startswith(stem) and len(norm(f)) <= len(nq) + 1) for f in forms) or nq in norm(a['id']):
                out.append(f'  {a["id"]} — {", ".join(forms)}; {a.get("disambig") or "—"}; вид {a.get("kind")}; значимость {a.get("prominence", "—")}; {os.path.basename(p)}')
    if out:
        print(f'\n=== База лиц: {len(out)} ===')
        print('\n'.join(out[:40]))
        if len(out) > 40:
            print(f'  … ещё {len(out) - 40}')
    elif quiet_header:
        print('Лиц не найдено.')
    return len(out)


def decision(code):
    t = read(f'{APP}/00-РЕГЛАМЕНТ.md').split('\n')
    code = code.strip().upper().replace('B', 'В')
    if code.isdigit():
        code = 'В-' + code
    if not code.startswith('В-'):
        code = 'В-' + code.lstrip('В')
    for i, l in enumerate(t):
        if re.match(rf'^\*\*{re.escape(code)}[\s(.]', l) or re.match(rf'^\|\s*{re.escape(code)}\s*\|', l):
            j = i + 1
            while j < len(t) and not re.match(r'^\*\*В-\d+|^## |^\|\s*В-\d+', t[j]):
                j += 1
            print(f'{APP}/00-РЕГЛАМЕНТ.md:{i + 1}')
            print('\n'.join(t[i:j]).rstrip())
            return
    print(f'Решение {code} не найдено.')


def section(doc, sec):
    sec = sec.replace('§', '').strip()
    files = glob.glob(f'{APP}/{doc}-*.md') or glob.glob(f'{APP}/research/{doc}-*.md') or glob.glob(f'{APP}/research/{doc.upper()}-*.md')
    if not files:
        print(f'Документ {doc} не найден.'); return
    p = files[0]
    t = read(p).split('\n')
    pat = re.compile(rf'^(#+)\s+(§\s*)?\(?{re.escape(sec)}[.)\s]')
    for i, l in enumerate(t):
        m = pat.match(l)
        if m:
            lvl = len(m.group(1))
            j = i + 1
            while j < len(t) and not (re.match(r'^(#+)\s', t[j]) and len(re.match(r'^(#+)', t[j]).group(1)) <= lvl):
                j += 1
            print(f'{p}:{i + 1}')
            print('\n'.join(t[i:j]).rstrip())
            return
    print(f'Раздел {sec} в {p} не найден.')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'):
        print(__doc__); sys.exit(0)
    if '--all' in a:
        SHOW = 10 ** 9
        a = [x for x in a if x != '--all']
    if a[0] == '--dec' and len(a) > 1:
        decision(a[1])
    elif a[0] == '--sec' and len(a) > 2:
        section(a[1], ' '.join(a[2:]))
    elif a[0] == '--person' and len(a) > 1:
        person(' '.join(a[1:]))
    else:
        only = 'all'
        if '--only' in a:
            k = a.index('--only'); only = a[k + 1]; a = a[:k] + a[k + 2:]
        search(' '.join(a), only)
