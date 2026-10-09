"""Ширина подписи области из эскиза 10.5. Запуск из корня: python3 -I docs/app/data/03-арт-директор/label.py <папка со шрифтами>"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
S=sys.argv[1]
def inst(**ax):
    f=TTFont(S+'/golos.ttf'); f=instancer.instantiateVariableFont(f,ax)
    cm=f.getBestCmap(); h=f['hmtx']; u=f['head'].unitsPerEm
    return lambda t,s,tr=0: sum(h[cm[ord(c)]][0] for c in t)*s/u+tr*s*(len(t)-1)
g5=inst(wght=500); g4=inst(wght=450)
a=g5('КОЛЕНО РУВИМОВО',13,0.12); b=g4(' — в данных 30 (по прежнему списку); потомки Рувима по родству — 9',12)
print('эскиз 10.5, одной строкой:',round(a+b),'px (имя',round(a),'+ счётчики',round(b),')')
print('вторая строка счётчиков «потомки по родству — 9 · в данных — 30»:',round(g4('потомки по родству — 9 · в данных — 30',12)),'px')
print('«из сыновей Аарона — 80 (по стихам)» Golos 12:',round(g4('из сыновей Аарона — 80 (по стихам)',12)))
print('«мать не названа; одна или несколько — текст не говорит» Golos 12:',round(g4('мать не названа; одна или несколько — текст не говорит',12)))
