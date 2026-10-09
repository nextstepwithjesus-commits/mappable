import math
P={'Haran':(39.032778,36.864444),'Shechem':(35.281944,32.213611),'Bethel':(35.241389,31.922778),'Ai':(35.261111,31.916944),'Mamre':(35.105336,31.556536),'Hebron':(35.10222,31.525087),'Beersheba':(34.840833,31.244722),'Gerar':(34.6065,31.3821),'Egypt':(31.3075,30.129444),'Moriah':(35.235556,31.777778),'Dan':(35.652,33.249),'Ur':(46.104444,30.962222)}
def merc(lon,lat):
    x=math.radians(lon); y=math.log(math.tan(math.pi/4+math.radians(lat)/2)); return x,y
def fit(names,W,H,pad=24):
    xs=[merc(*P[n])[0] for n in names]; ys=[merc(*P[n])[1] for n in names]
    s=min((W-2*pad)/(max(xs)-min(xs)),(H-2*pad)/(max(ys)-min(ys)))
    return s
def d(a,b,s):
    xa,ya=merc(*P[a]); xb,yb=merc(*P[b]); return s*math.hypot(xa-xb,ya-yb)
pairs=[('Bethel','Ai'),('Mamre','Hebron'),('Bethel','Moriah'),('Moriah','Hebron'),('Shechem','Bethel'),('Hebron','Beersheba'),('Beersheba','Gerar'),('Mamre','Beersheba')]
for label,names,W,H in [
 ('phone, Haran..Egypt (sketch 11.6), map 360x384',['Haran','Egypt','Beersheba','Shechem'],360,384),
 ('phone, Canaan only Dan..Beersheba+Gerar, 360x384',['Dan','Beersheba','Gerar','Shechem'],360,384),
 ('laptop 11.1 Ur..Haran..Egypt, map ~900x620',['Haran','Egypt','Ur','Beersheba'],900,620),
]:
    s=fit(names,W,H)
    km_per_px = 6371*1/s/ math.cos(math.radians(32))  # approx at 32N
    print(label, 'km/px ~%.2f'%km_per_px)
    for a,b in pairs: print('   %-9s-%-9s %5.1f px'%(a,b,d(a,b,s)))
print('---- bbox of Canaan stops (Shechem..Gerar..Beersheba) at the fit-all scales')
can=['Shechem','Bethel','Ai','Mamre','Hebron','Beersheba','Gerar','Moriah']
for label,names,W,H in [('phone fit Haran..Egypt',['Haran','Egypt','Beersheba','Shechem'],360,384),('laptop fit all',['Haran','Egypt','Ur','Beersheba'],900,620),('laptop 1280 map ~ 880x560 fit all',['Haran','Egypt','Ur','Beersheba'],880,560)]:
    s=fit(names,W,H)
    xs=[merc(*P[n])[0]*s for n in can]; ys=[merc(*P[n])[1]*s for n in can]
    print(label,'box %.0f x %.0f px'%(max(xs)-min(xs),max(ys)-min(ys)))
# phone canaan-only: is Haran on screen?
s=fit(['Dan','Beersheba','Gerar','Shechem'],360,384)
print('phone Canaan fit: Haran is %.0f px north of Shechem'%(s*(merc(*P['Haran'])[1]-merc(*P['Shechem'])[1])))
