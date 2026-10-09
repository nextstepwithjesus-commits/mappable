"""Есть ли знаки легенды 03 в шрифтах R13 и сколько места занимают подписи областей.
Запуск из корня: python3 -I docs/app/data/03-арт-директор/glyphs.py <папка со шрифтами>"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
S=sys.argv[1]
G={'golos':S+'/golos.ttf','literata':S+'/literata.ttf'}
signs={'◇':'союз','⇄':'двойное родство','↗':'отсыл','↖':'отсыл','↘':'отсыл','⋯':'пропуск','⊕':'свёрнутый дом','═':'простой брак','■':'мужчина (11)','●':'женщина (11)','▲':'животное (11)','□':'мужчина (R8)','○':'женщина (R8)','◆':'R8 кат.','…':'многоточие','−':'минус','×':'знак умножения','→':'стрелка'}
for name,p in G.items():
    cm=TTFont(p).getBestCmap()
    have=[s for s in signs if ord(s) in cm]; miss=[s for s in signs if ord(s) not in cm]
    print(name,'есть:',' '.join(have),'| нет:',' '.join(f'{s}({signs[s]})' for s in miss))
def inst(path,**axes):
    f=TTFont(path); f=instancer.instantiateVariableFont(f,{k:v for k,v in axes.items() if k in {a.axisTag for a in f['fvar'].axes}})
    cm=f.getBestCmap(); h=f['hmtx']; u=f['head'].unitsPerEm
    return lambda t,s,tr=0: sum(h[cm[ord(c)]][0] for c in t)*s/u + tr*s*(len(t)-1)
g5=inst(G['golos'],wght=500)
for lab in ['КОЛЕНО РУВИМОВО','КОЛЕНО ВЕНИАМИНОВО','КОЛЕНО МАНАССИИНО','ДОМ ДАВИДОВ','СЫНЫ ААРОНОВЫ','ПОТОМКИ ИСАВА (ЕДОМ)']:
    print(lab, 'Golos 500 13 px, разрядка 0,12 em:', round(g5(lab,13,0.12)),'px')
