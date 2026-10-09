"""Карта проекта «Библия наглядно»: собирает docs/app/КАРТА.md и docs/app/УКАЗАТЕЛЬ.md.

Запуск из корня: npm run -s map   (или python3 -I tools/docs/map.py)
Флаг --check: ничего не пишет, выходит с кодом 1, если карта или указатель устарели.

КАРТА.md: ручная часть (до строки-маркера AUTO) сохраняется как есть; всё после
маркера пересобирается из файлов. УКАЗАТЕЛЬ.md пересобирается целиком: все
заголовки документов приложения с файлом и строкой.
"""
import glob, json, os, re, sys

ROOT = os.getcwd()
APP = 'docs/app'
MAP = f'{APP}/КАРТА.md'
IDX = f'{APP}/УКАЗАТЕЛЬ.md'
AUTO = '<!-- карта:авто — всё ниже собирает tools/docs/map.py; правки вручную пропадут -->'


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def title(text, fallback):
    m = re.search(r'^#\s+(.+)$', text, re.M)
    return m.group(1).strip() if m else fallback


def status(text):
    m = re.search(r'^\*\*Статус:\*\*\s*(.+)$', text, re.M)
    if not m:
        return '—'
    s = re.sub(r'\s+', ' ', m.group(1)).strip()
    s = re.split(r'(?<=[.;])\s', s)[0]
    return (s[:140] + '…') if len(s) > 140 else s


def lines(text):
    return text.count('\n') + 1


def cell(s):
    return s.replace('|', '\\|')


def docs_table():
    rows = []
    for p in sorted(glob.glob(f'{APP}/[0-9][0-9]-*.md')):
        t = read(p)
        num = os.path.basename(p)[:2]
        revs = sorted(glob.glob(f'{APP}/reviews/{num}-*.md'))
        rv = ', '.join(f'[{os.path.basename(r)[3:-3]}](reviews/{os.path.basename(r)})' for r in revs) or '—'
        rows.append(f'| [{num}]({os.path.basename(p)}) | {cell(title(t, p))} | {cell(status(t))} | {lines(t)} | {rv} |')
    return ['| № | Документ | Статус (первая фраза) | Строк | Рецензии |', '|---|---|---|---|---|'] + rows


def research_table():
    rows = []
    def key(p):
        m = re.match(r'R(\d+)', os.path.basename(p))
        return (int(m.group(1)) if m else 999, p)
    for p in sorted(glob.glob(f'{APP}/research/R*.md'), key=key):
        t = read(p)
        rows.append(f'| [{os.path.basename(p)[:-3]}](research/{os.path.basename(p)}) | {cell(title(t, p))} | {lines(t)} |')
    return ['| Файл | Тема | Строк |', '|---|---|---|'] + rows


def reviews_list():
    out = []
    for p in sorted(glob.glob(f'{APP}/reviews/*.md')):
        t = read(p)
        out.append(f'- [{os.path.basename(p)[:-3]}](reviews/{os.path.basename(p)}) — {title(t, "")}')
    return out


def decisions():
    t = read(f'{APP}/00-РЕГЛАМЕНТ.md')
    out = ['| № | Дата | Решение | Строка |', '|---|---|---|---|']
    for i, line in enumerate(t.split('\n'), 1):
        m = re.match(r'^\*\*(В-\d+)(?:\s*\(([^)]*)\))?\.\s*(.+?)\*\*', line)
        if m:
            out.append(f'| {m.group(1)} | {m.group(2) or "—"} | {cell(m.group(3).rstrip("."))} | `00-РЕГЛАМЕНТ.md:{i}` |')
    if len(out) == 2:
        out.append('| — | — | решения записаны не в формате «**В-N (дата). …**» | — |')
    return out


def queue():
    p = f'{APP}/reviews/очередь-спорных-мест.md'
    if not os.path.exists(p):
        return ['- очереди нет']
    t = read(p)
    out = []
    sec, total, done = None, 0, 0
    def flush():
        if sec and total:
            out.append(f'- {sec}: задач {total}, сделано {done}, осталось {total - done}')
    for line in t.split('\n'):
        if line.startswith('## '):
            flush()
            sec, total, done = line[3:].strip(), 0, 0
        elif re.match(r'^\|\s*[^|\-\s][^|]*\|', line) and not re.match(r'^\|\s*(№|Место|#)\s*\|', line) and not set(line) <= set('|- '):
            total += 1
            if 'сделано' in line.lower():
                done += 1
    flush()
    return out or ['- задач нет']


def data_counts():
    out = []
    try:
        n = sum(len(json.load(open(p, encoding='utf-8'))['items']) for p in glob.glob('base/actors/*.json'))
        out.append(f'- лиц в базе: {n} (`base/actors/*.json`, по томам)')
        for name in ('origins', 'unions', 'kin', 'readings', 'memberships', 'nodata', 'areas', 'chrono', 'redirects', 'corrections'):
            p = f'base/{name}.json'
            if os.path.exists(p):
                d = json.load(open(p, encoding='utf-8'))
                k = len(d['items']) if isinstance(d, dict) and 'items' in d else len(d)
                out.append(f'- `{p}`: {k} записей')
    except Exception as e:  # база может пересобираться
        out.append(f'- база не прочитана: {e}')
    return out


def scripts():
    pk = json.load(open('package.json', encoding='utf-8'))['scripts']
    out = ['| Команда | Что запускает |', '|---|---|']
    for k, v in pk.items():
        out.append(f'| `npm run -s {k}` | `{cell(v)}` |')
    for p in sorted(glob.glob(f'{APP}/data/*.py')):
        t = read(p)
        m = re.search(r'"""(.+?)(?:\n|""")', t, re.S)
        out.append(f'| `python3 -I {p}` | {cell(m.group(1).strip()) if m else "—"} |')
    return out


def agents():
    out = []
    for p in sorted(glob.glob('.claude/agents/*.md')):
        t = read(p)
        n = re.search(r'^name:\s*(.+)$', t, re.M)
        d = re.search(r'^description:\s*(.+)$', t, re.M)
        out.append(f'- `{n.group(1).strip() if n else os.path.basename(p)}` — {d.group(1).strip() if d else ""}')
    for p in sorted(glob.glob('.claude/skills/*/SKILL.md')):
        t = read(p)
        n = re.search(r'^name:\s*(.+)$', t, re.M)
        d = re.search(r'^description:\s*(.+)$', t, re.M)
        out.append(f'- навык `{n.group(1).strip() if n else p}` — {d.group(1).strip() if d else ""}')
    for p in sorted(glob.glob('.claude/rules/*.md')):
        t = read(p)
        pa = re.search(r'^paths:\s*\n((?:\s*-.+\n)+)', t, re.M)
        out.append(f'- правило `{p}`' + (f' — для {", ".join(x.strip()[2:].strip() for x in pa.group(1).strip().split(chr(10)))}' if pa else ''))
    return out or ['- нет']


def prototypes():
    out = []
    for d in sorted(glob.glob('prototypes/*/')):
        files = [os.path.basename(x) for x in sorted(glob.glob(d + '*.md'))]
        out.append(f'- `{d}` — ' + (', '.join(f'`{f}`' for f in files) or 'без описания'))
    return out or ['- нет']


def legacy():
    out = []
    for p in ('docs/PLAN.md', 'docs/PROMPT.md', 'docs/UI-PROMPT.md', 'docs/DESIGN.md', 'docs/progress.md', 'docs/ui-review/README.md', 'docs/ui-review/STATUS.md', 'data/AUTHORING.md'):
        if os.path.exists(p):
            out.append(f'- `{p}` — {title(read(p), p)}')
    return out


def build_map():
    manual = read(MAP).split(AUTO)[0].rstrip() + '\n\n' if os.path.exists(MAP) else '# Карта проекта\n\n'
    parts = [AUTO, '',
             '## Документы приложения', '', *docs_table(), '',
             '## Решения владельца (реестр — `00-РЕГЛАМЕНТ.md`)', '', *decisions(), '',
             '## Исследования', '', *research_table(), '',
             '## Рецензии и решения совета', '', *reviews_list(), '',
             '## Очередь задач и спорных мест (`reviews/очередь-спорных-мест.md`)', '', *queue(), '',
             '## Данные новой базы (`base/`)', '', *data_counts(), '',
             '## Команды и скрипты', '', *scripts(), '',
             '## Агенты, навыки, правила (`.claude/`)', '', *agents(), '',
             '## Прототипы', '', *prototypes(), '',
             '## Прежний атлас «Толедот» (справочно; новое приложение строится с нуля)', '', *legacy(), '',
             'Заголовки всех документов с номерами строк — [УКАЗАТЕЛЬ.md](УКАЗАТЕЛЬ.md). Поиск — `npm run -s find -- "слово"`.', '']
    return manual + '\n'.join(parts)


def build_index():
    out = ['# Указатель заголовков', '',
           'Собирает `tools/docs/map.py`; правки вручную пропадут. Каждый заголовок — с файлом и строкой. Поиск по всему тексту — `npm run -s find -- "слово"`.', '']
    files = sorted(glob.glob(f'{APP}/*.md')) + sorted(glob.glob(f'{APP}/research/*.md')) + sorted(glob.glob(f'{APP}/reviews/*.md')) + sorted(glob.glob(f'{APP}/data/*.md'))
    for p in files:
        if p in (MAP, IDX):
            continue
        rel = p
        out.append(f'## {rel}')
        out.append('')
        fence = False
        for i, line in enumerate(read(p).split('\n'), 1):
            if line.startswith('```'):
                fence = not fence
            if fence:
                continue
            m = re.match(r'^(#{2,4})\s+(.+)$', line)
            if m:
                ind = '  ' * (len(m.group(1)) - 2)
                out.append(f'{ind}- {m.group(2).strip()} — `{rel}:{i}`')
        out.append('')
    return '\n'.join(out)


if __name__ == '__main__':
    new_map, new_idx = build_map(), build_index()
    if '--check' in sys.argv:
        stale = [p for p, new in ((MAP, new_map), (IDX, new_idx)) if not os.path.exists(p) or read(p) != new]
        if stale:
            print('Устарели:', ', '.join(stale), '— запустите npm run -s map')
            sys.exit(1)
        print('Карта и указатель свежие')
    else:
        open(MAP, 'w', encoding='utf-8').write(new_map)
        open(IDX, 'w', encoding='utf-8').write(new_idx)
        print(f'Записано: {MAP}, {IDX}')
