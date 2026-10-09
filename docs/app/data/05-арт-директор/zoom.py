import math,sys
sys.path.insert(0,'.')
exec(open('seg.py').read().split("land=json.load")[0])
def merc(x,y): return x, math.degrees(math.log(math.tan(math.pi/4+math.radians(y)/2)))
def zoom_for(names,W,H,fill=0.85):
    P=[pt(n) for n in names]
    xs=[p[0] for p in P]; ys=[merc(*p[:2])[1] for p in P]
    dx=(max(xs)-min(xs)) or 0.01; dy=(max(ys)-min(ys)) or 0.01
    # world px at z: 256*2^z per 360 deg
    zx=math.log2(W*fill*360/(256*dx)); zy=math.log2(H*fill*360/(256*dy))
    return min(zx,zy)
etopo_z=math.log2(156543.03*math.cos(math.radians(32))/463)
cop_z=math.log2(156543.03*math.cos(math.radians(32))/30)
print(f'родной уровень ETOPO 15": z{etopo_z:.1f}; Copernicus 30 м: z{cop_z:.1f}; пакет по § 9: до z8')
views={
 '11.1 весь путь Авраама':['Ur 1','Haran','Shechem','Bethel 1','Egypt','Hebron','Gerar','Beersheba 1'],
 '11.6/врезка Ханаан (Дан–Вирсавия)':['Dan','Shechem','Bethel 1','Hebron','Gerar','Beersheba 1'],
 '11.3 земля Рувима':['Aroer 1','Medeba','Heshbon','Dibon 1','Baal-meon','Kiriathaim 1','Beth-jeshimoth','Bezer'],
 '11.4 Вефиль (Вефиль и Гай)':['Bethel 1','Ai 1'],
 '11.5 Павел Деян 13–14':['Antioch 1','Seleucia','Salamis','Paphos','Perga','Antioch 2','Iconium','Lystra','Derbe','Attalia'],
 '11.2 Исход Чис 33:5–15':['Rameses','Elim','Marah','Dophkah','Rephidim','Mount Sinai'],
}
for k,v in views.items():
    zl=zoom_for(v,900,680); zp=zoom_for(v,360,480)
    print(f'{k}: ноутбук z{zl:.1f} (перебор {max(0,zl-8):.1f} ур., в {2**max(0,zl-8):.0f} раз); телефон z{zp:.1f} (перебор {max(0,zp-8):.1f})')
