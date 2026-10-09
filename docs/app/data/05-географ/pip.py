import struct,sys
b=open(sys.argv[1],'rb').read()
pts=[(47.5,30.6),(48.0,30.0),(47.0,31.0),(46.1,30.96),(32.2,31.2),(31.0,31.5),(34.75,32.08),(35.0,32.8),(27.3,37.6)]
names=['Basra-ish','Shatt mouth','Nasiriyah N','Ur (Tell Muqayyar)','Manzala lake','delta coast','Tel Aviv','Haifa','Miletus bay']
pos=100; polys=[]
while pos<len(b):
    num,ln=struct.unpack('>2i',b[pos:pos+8]); rec=b[pos+8:pos+8+ln*2]; pos+=8+ln*2
    st=struct.unpack('<i',rec[:4])[0]
    if st not in (5,15,25): continue
    box=struct.unpack('<4d',rec[4:36]); np_,npt=struct.unpack('<2i',rec[36:44])
    parts=list(struct.unpack('<%di'%np_,rec[44:44+4*np_])); off=44+4*np_
    xy=struct.unpack('<%dd'%(2*npt),rec[off:off+16*npt])
    P=[(xy[2*i],xy[2*i+1]) for i in range(npt)]
    polys.append((box,parts,P))
def inring(x,y,R):
    c=False
    for i in range(len(R)-1):
        x1,y1=R[i];x2,y2=R[i+1]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
for (x,y),n in zip(pts,names):
    w=False
    for box,parts,P in polys:
        if not(box[0]<=x<=box[2] and box[1]<=y<=box[3]): continue
        parts2=parts+[len(P)]; cnt=0
        for i in range(len(parts)):
            if inring(x,y,P[parts2[i]:parts2[i+1]]): cnt+=1
        if cnt%2==1: w=True
    print(n,(x,y),'water' if w else 'land')
print('polys',len(polys))
