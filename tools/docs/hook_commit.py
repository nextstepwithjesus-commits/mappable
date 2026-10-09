"""Хук Claude Code перед `git commit` (.claude/settings.json, PreToolUse → Bash).

Перед любым коммитом пересобирает карту и указатель, добавляет их в коммит
и запускает проверку документации. Ошибка проверки останавливает коммит
(код 2: Claude Code не выполняет команду и показывает причину агенту).
"""
import json, os, re, subprocess, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
cmd = (data.get('tool_input') or {}).get('command') or ''
if not re.search(r'\bgit\b[^;&|]*\bcommit\b', cmd):
    sys.exit(0)

os.chdir(os.environ.get('CLAUDE_PROJECT_DIR') or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
m = subprocess.run([sys.executable, '-I', 'tools/docs/map.py'], capture_output=True, text=True)
if m.returncode != 0:
    print('Карта не собралась (npm run -s map):\n' + m.stdout + m.stderr, file=sys.stderr)
    sys.exit(2)
subprocess.run(['git', 'add', 'docs/app/КАРТА.md', 'docs/app/УКАЗАТЕЛЬ.md'], capture_output=True)
c = subprocess.run([sys.executable, '-I', 'tools/docs/check.py'], capture_output=True, text=True)
if c.returncode != 0:
    errs = [l for l in c.stdout.splitlines() if l.startswith('ошибка')]
    print('Коммит остановлен: npm run -s docs:check нашёл ошибки. Исправьте и повторите.\n' + '\n'.join(errs[:20]), file=sys.stderr)
    sys.exit(2)
sys.exit(0)
