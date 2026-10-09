import json,sys,math
anc={}; mod={}
for l in open(sys.argv[1]):
    r=json.loads(l); anc[r['friendly_id']]=r
for l in open(sys.argv[2]):
    r=json.loads(l); mod[r['id']]=r
def ll(fid):
    ma=anc[fid]['modern_associations']; k=max(ma,key=lambda k:ma[k]['score'])
    lon,lat=map(float,mod[k]['lonlat'].split(',')); return lon,lat
def merc(lon,lat): return math.radians(lon), math.log(math.tan(math.pi/4+math.radians(lat)/2))
sets={
 'Рувим 11.3':['Aroer 1','Medeba','Heshbon','Dibon 1','Baal-meon','Kiriathaim 1','Sibmah','Beth-jeshimoth','Bezer'],
 'Павел 11.5':['Antioch 1','Seleucia','Salamis','Paphos','Perga','Antioch 2','Iconium','Lystra','Derbe','Attalia'],
 'Исход 11.2 (со знаком)':['Rameses','Baal-zephon','Red Sea 1','Marah','Elim','Red Sea 3','Sin','Dophkah','Alush','Rephidim','Mount Sinai'],
}
for name,ids in sets.items():
    P={i:ll(i) for i in ids}
    for W,H,dev in [(360,320,'телефон 360x640, карта ~360x320'),(900,620,'ноутбук, карта ~900x620')]:
        xs=[merc(*P[i])[0] for i in ids]; ys=[merc(*P[i])[1] for i in ids]
        pad=24
        s=min((W-2*pad)/(max(xs)-min(xs)),(H-2*pad)/(max(ys)-min(ys)))
        nn=[]
        for i in ids:
            xi,yi=merc(*P[i]); d=min(s*math.hypot(xi-merc(*P[j])[0],yi-merc(*P[j])[1]) for j in ids if j!=i); nn.append((d,i))
        nn.sort()
        close=[f'{i} {d:.0f}' for d,i in nn if d<48]
        print(f'{name} | {dev}: ближайший сосед < 48 px у {len(close)} из {len(ids)}; минимум {nn[0][0]:.0f} px ({nn[0][1]})')
