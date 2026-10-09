"""Проверка документации «Библии наглядно»: npm run -s docs:check

Ошибки (код выхода 1):
- карта или указатель устарели (npm run -s map);
- у документа приложения нет строки «**Статус:**»;
- номер и название документа перепутаны («04 «География»» при 05-ГЕОГРАФИЯ.md);
- решения владельца В-N идут не подряд или повторяются;
- путь в обратных кавычках (`docs/…`, `tools/…`, `base/…`, `prototypes/…`, `.claude/…`) не существует.
Предупреждения:
- журнал (ЖУРНАЛ.md) старше последнего коммита в docs/app.
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
    if '**Статус:**' not in read(p):
        errors.append(f'{p}: нет строки «**Статус:**»')

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

# 6. журнал
j = f'{APP}/ЖУРНАЛ.md'
if os.path.exists(j):
    dates = re.findall(r'^### (\d{4}-\d{2}-\d{2})', read(j), re.M)
    last = subprocess.run(['git', 'log', '-1', '--format=%ad', '--date=short', '--', APP], capture_output=True, text=True).stdout.strip()
    if dates and last and max(dates) < last:
        warns.append(f'журнал: последняя запись {max(dates)}, последний коммит в docs/app {last}')
else:
    errors.append('нет docs/app/ЖУРНАЛ.md')

for w in warns:
    print('предупреждение:', w)
for e in errors:
    print('ошибка:', e)
print(f'Итог: ошибок {len(errors)}, предупреждений {len(warns)}')
sys.exit(1 if errors else 0)
