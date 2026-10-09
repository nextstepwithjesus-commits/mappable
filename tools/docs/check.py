"""Проверка документации «Библии наглядно»: npm run -s docs:check

Ошибки (код выхода 1):
- карта или указатель устарели (npm run -s map);
- у документа приложения нет строки «**Статус:**»;
- номер и название документа перепутаны («04 «География»» при 05-ГЕОГРАФИЯ.md);
- решения владельца В-N идут не подряд или повторяются;
- путь в обратных кавычках (`docs/…`, `tools/…`, `base/…`, `prototypes/…`, `.claude/…`) не существует.
- «Сейчас» в карте старше последней записи журнала;
- реестр вопросов (ВОПРОСЫ.md): неверное состояние, ссылка на несуществующее решение, номер повторяется;
- строка «**Статус:**» не в первых 10 строках документа;
- правило `.claude/rules/*.md`: сломан заголовок или шаблон `paths` не совпадает ни с одним файлом;
- в CLAUDE.md названы несуществующие агент, навык или команда npm.
Предупреждения:
- журнал (ЖУРНАЛ.md) старше последнего коммита в docs/app, длиннее 300 строк, у вехи нет итога проверки вехи;
- раздел «Вопросы владельцу» в документе или исследовании, которого нет в реестре вопросов;
- путь в обратных кавычках в исследованиях и рецензиях не существует.
"""
import glob, os, re, subprocess, sys

APP = 'docs/app'
errors, warns = [], []


def read(p):
    return open(p, encoding='utf-8').read()


# 1. карта
r = subprocess.run([sys.executable, '-I', 'tools/docs/map.py', '--check'], capture_output=True, text=True)
if r.returncode:
    errors.append(r.stdout.strip())

# 2. статус
for p in sorted(glob.glob(f'{APP}/[0-9][0-9]-*.md')):
    if os.path.basename(p).startswith('00-'):
        continue  # регламент — живой реестр, без статуса
    head = read(p).split('\n')[:10]
    if not any(l.startswith('**Статус:**') for l in head):
        errors.append(f'{p}: нет строки «**Статус:**» в первых 10 строках')

# 3. номера документов: по файлам и по таблице регламента
names = {}
for p in glob.glob(f'{APP}/[0-9][0-9]-*.md'):
    b = os.path.basename(p)[:-3]
    names[b[:2]] = b[3:].lower()
reg = read(f'{APP}/00-РЕГЛАМЕНТ.md')
for m in re.finditer(r'^\|\s*(\d\d)\s+([А-ЯЁа-яё\- ]+?)(?:\s*\(В-\d+\))?\s*\|', reg, re.M):
    names.setdefault(m.group(1), m.group(2).strip().lower())
ALIASES = {'карточка': 'карточка', 'концепция': 'концепция', 'данные': 'данные'}
docs = glob.glob(f'{APP}/**/*.md', recursive=True) + ['CLAUDE.md']
for p in docs:
    if p.endswith(('КАРТА.md', 'УКАЗАТЕЛЬ.md')):
        continue
    for i, line in enumerate(read(p).split('\n'), 1):
        line = re.sub(r'`[^`]*`', '', line)
        for m in re.finditer(r'(?<![\d.§])(\d\d)\s+«([А-ЯЁа-яё\-]+)»', line):
            num, word = m.group(1), m.group(2).lower()
            before = line[max(0, m.start() - 14):m.start()].lower()
            if 'раздел' in before or '§' in before or word not in names.values():
                continue  # «раздел 10 «Время»» и прочее — не номер документа
            if num in names and names[num] != word:
                other = [k for k, v in names.items() if v == word]
                if other:
                    errors.append(f'{p}:{i}: «{num} «{m.group(2)}»» — у документа «{m.group(2)}» номер {other[0]}')

# 4. решения подряд
nums = [int(x) for x in re.findall(r'^\*\*В-(\d+)', reg, re.M)]
if nums != list(range(1, len(nums) + 1)):
    errors.append(f'решения В-N не подряд: {nums}')

# 5. пути
PREFIX = ('docs/', 'tools/', 'base/', 'prototypes/', '.claude/', 'data/', 'tests/')
for p in [x for x in glob.glob(f'{APP}/*.md') + ['CLAUDE.md'] + glob.glob('.claude/**/*.md', recursive=True) if not x.endswith(('КАРТА.md', 'УКАЗАТЕЛЬ.md'))]:
    for i, line in enumerate(read(p).split('\n'), 1):
        for m in re.finditer(r'`([^`\s]+)`', line):
            path = m.group(1).rstrip('.,;:)')
            if not path.startswith(PREFIX) or any(c in path for c in '*<>{}$|') or '…' in path or 'NN' in path:
                continue
            path = re.sub(r':\d+$', '', path)
            if not os.path.exists(path):
                errors.append(f'{p}:{i}: нет пути `{path}`')

for p in glob.glob(f'{APP}/research/*.md') + glob.glob(f'{APP}/reviews/*.md'):
    for i, line in enumerate(read(p).split('\n'), 1):
        for m in re.finditer(r'`([^`\s]+)`', line):
            path = re.sub(r':\d+$', '', m.group(1).rstrip('.,;:)'))
            if path.startswith(PREFIX) and not any(c in path for c in '*<>{}$|') and '…' not in path and 'NN' not in path and not os.path.exists(path):
                warns.append(f'{p}:{i}: нет пути `{path}`')

# 7. «Сейчас» не старше журнала
mp, jp = f'{APP}/КАРТА.md', f'{APP}/ЖУРНАЛ.md'
if os.path.exists(mp) and os.path.exists(jp):
    st = re.search(r'Обновлено:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})', read(mp))
    jt = read(jp)
    m = re.search(r'^### (\d{4}-\d{2}-\d{2})\s*\n+- (\d{2}:\d{2})', jt, re.M)
    if not st:
        errors.append('КАРТА.md: нет штампа «Обновлено: ГГГГ-ММ-ДД ЧЧ:ММ» в разделе «Сейчас»')
    elif m and (st.group(1), st.group(2)) < (m.group(1), m.group(2)):
        errors.append(f'КАРТА.md: «Сейчас» обновлено {st.group(1)} {st.group(2)}, а последняя веха в журнале — {m.group(1)} {m.group(2)}')

# 8. реестр вопросов
qp = f'{APP}/ВОПРОСЫ.md'
if os.path.exists(qp):
    qt = read(qp)
    dec = set(re.findall(r'^\*\*(В-\d+)', reg, re.M))
    seen = set()
    for m in re.finditer(r'^\|\s*(ВП-\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|', qt, re.M):
        code, state = m.group(1), m.group(5).strip()
        if code in seen:
            errors.append(f'ВОПРОСЫ.md: {code} повторяется')
        seen.add(code)
        if not re.match(r'^(открыт|ответ: В-\d+|снят: .+|отложен: .+)$', state):
            errors.append(f'ВОПРОСЫ.md: {code} — неверное состояние «{state}»')
        for d in re.findall(r'В-\d+', state):
            if d not in dec:
                errors.append(f'ВОПРОСЫ.md: {code} ссылается на несуществующее решение {d}')
    for p in sorted(glob.glob(f'{APP}/[0-9][0-9]-*.md') + glob.glob(f'{APP}/research/*.md')):
        t = read(p)
        if re.search(r'^#+.*[Вв]опрос\w* владельцу', t, re.M) or re.search(r'^#+\s*\d*\.?\s*Вопросы\s*$', t, re.M):
            b = os.path.basename(p)[:-3]
            short = b[:2] if b[:2].isdigit() else b.split('-')[0]
            if b not in qt and not re.search(r'(?<![\w-])' + re.escape(short) + r'(?![\w])', qt):
                warns.append(f'{p}: есть раздел вопросов владельцу, но нет строки в ВОПРОСЫ.md')
else:
    errors.append('нет docs/app/ВОПРОСЫ.md')

# 9. правила .claude/rules
for p in glob.glob('.claude/rules/*.md'):
    t = read(p)
    if t.startswith('---'):
        fm = t.split('---')[1] if t.count('---') >= 2 else None
        if fm is None:
            errors.append(f'{p}: не закрыт заголовок ---')
            continue
        if 'paths:' in fm:
            globs = re.findall(r'^\s*-\s*"?([^"\n]+)"?\s*$', fm, re.M)
            if not globs:
                errors.append(f'{p}: paths без шаблонов')
            for g in globs:
                if not glob.glob(g, recursive=True):
                    errors.append(f'{p}: шаблон paths «{g}» не совпадает ни с одним файлом')

# 10. имена в CLAUDE.md
cm = read('CLAUDE.md')
import json as _json
scripts = _json.load(open('package.json', encoding='utf-8'))['scripts']
for name in re.findall(r'npm run -s ([\w:-]+)', cm):
    if name not in scripts:
        errors.append(f'CLAUDE.md: нет команды npm «{name}»')
agents = {os.path.basename(x)[:-3] for x in glob.glob('.claude/agents/*.md')}
skills = {os.path.basename(os.path.dirname(x)) for x in glob.glob('.claude/skills/*/SKILL.md')}
for name in re.findall(r'агент `([\w-]+)`', cm):
    if name not in agents:
        errors.append(f'CLAUDE.md: нет агента «{name}»')
for name in re.findall(r'навык `?([a-z][\w-]+)`?', cm):
    if name not in skills:
        errors.append(f'CLAUDE.md: нет навыка «{name}»')

# 6. журнал
JOURNAL_CHECK_FROM = '2026-10-09 09:45'  # с этой записи у каждой вехи пишется итог проверки вехи
j = f'{APP}/ЖУРНАЛ.md'
if os.path.exists(j):
    dates = re.findall(r'^### (\d{4}-\d{2}-\d{2})', read(j), re.M)
    last = subprocess.run(['git', 'log', '-1', '--format=%ad', '--date=short', '--', APP], capture_output=True, text=True).stdout.strip()
    if dates and last and max(dates) < last:
        warns.append(f'журнал: последняя запись {max(dates)}, последний коммит в docs/app {last}')
    jl = read(j).split('\n')
    if len(jl) > 300:
        warns.append(f'журнал: {len(jl)} строк — унесите записи старше 30 дней в ЖУРНАЛ-ГГГГ-ММ.md')
    # время записей — не из будущего (время берётся из date -u или коммита, не на глаз)
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')
    day = None
    for i, line in enumerate(jl, 1):
        md = re.match(r'^### (\d{4}-\d{2}-\d{2})\s*$', line)
        if md:
            day = md.group(1)
            continue
        mt = re.match(r'^- (\d{2}:\d{2})', line)
        if day and mt:
            if f'{day} {mt.group(1)}' > now:
                errors.append(f'ЖУРНАЛ.md:{i}: время {day} {mt.group(1)} позже текущего {now} UTC — время вписано на глаз')
            # В-20: у вехи с результатом («Где:») после введения правила — итог проверки вехи или «отложена»
            if f'{day} {mt.group(1)}' >= JOURNAL_CHECK_FROM and 'Где:' in line and not re.search(r'[Пп]роверка вехи', line):
                warns.append(f'ЖУРНАЛ.md:{i}: у вехи нет «Проверка вехи: …» или «Проверка вехи: отложена» (В-20)')
else:
    errors.append('нет docs/app/ЖУРНАЛ.md')

for w in warns:
    print('предупреждение:', w)
for e in errors:
    print('ошибка:', e)
print(f'Итог: ошибок {len(errors)}, предупреждений {len(warns)}')
sys.exit(1 if errors else 0)
