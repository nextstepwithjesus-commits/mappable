"""Проверка цитат эскиза: каждая цитата в «» должна найтись в своих стихах.

Запуск из корня: python3 -I prototypes/main-screen/check_quotes.py
Берёт текст экранов (шаблоны) из index.html, убирает разметку и прогоняет
правила docs/app/data/07-цитаты.py (тот же разбор адресов и сравнение).
Слова атласа в «» (названия эпох, вид «12 колен») перечислены в ATLAS ниже.
Дополнительно: цитата со скобками [ ] или ( ) должна стоять рядом с подписью
«в скобках Синодального издания».
"""
import html
import re
import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
src = (HERE / 'index.html').read_text(encoding='utf-8')
tpl = ' '.join(re.findall(r'<template id="t-[^"]+">(.*?)</template>', src, re.S))
tpl = re.sub(r'<svg.*?</svg>', ' ', tpl, flags=re.S)
text = html.unescape(re.sub(r'<[^>]+>', ' ', tpl))
text = text.replace(' ', ' ')
tmp = HERE / 'shots' / '_screens.txt'
tmp.parent.mkdir(exist_ok=True)
tmp.write_text(text, encoding='utf-8')

# слова атласа и интерфейса в «» — не цитаты Писания
EXTRA_ATLAS = {
    'Патриархи', 'Судьи', 'Исход и пустыня', '12 колен', 'Линии Мессии', 'масоретская, длинное пребывание',
    'наложница', '[трех сынов]', 'жена', 'Дома и народы', 'Чтение главы', 'Синопсис родословий',
}
sys.argv = ['07-цитаты.py', str(tmp)]
g = runpy.run_path(str(ROOT / 'docs/app/data/07-цитаты.py'), init_globals={}, run_name='not_main') if False else None
code = (ROOT / 'docs/app/data/07-цитаты.py').read_text(encoding='utf-8')
code = code.replace("ATLAS = {", "ATLAS = EXTRA_ATLAS | {", 1)
import os
os.chdir(ROOT)
exec(compile(code, '07-цитаты.py', 'exec'), {'EXTRA_ATLAS': EXTRA_ATLAS, '__name__': '__main__'})

bad = 0
for m in re.finditer(r'«([^«»]*[\[\(][^«»]*)»', text):
    around = text[m.end():m.end() + 260]
    near = text[max(0, m.start() - 200):m.end() + 260]
    if 'в скобках Синодального издания' not in near and 'в квадратных скобках' not in near:
        bad += 1
        print(f'СКОБКИ БЕЗ ПОДПИСИ: «{m.group(1)[:60]}»')
print(f'Цитат со скобками без подписи: {bad}')
