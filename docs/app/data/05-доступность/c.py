def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
def gray(L):
    # sRGB gray with relative luminance L
    c = 12.92*L if L<=0.0031308 else 1.055*L**(1/2.4)-0.055
    v=round(c*255); return '#%02X%02X%02X'%(v,v,v)
tok={'чернила св':'#18202C','линия св':'#6E7888','чернила-2 св':'#4A5463','чернила тём':'#E8ECF1','линия тём':'#7A8596','выбор св':'#FFD43B','выбор тём':'#F0D04A'}
for n,h in tok.items():
    L=lum(h); lo=max(0,(L+0.05)/3-0.05); hi=min(1,3*(L+0.05)-0.05)
    print(f"{n} {h} L={L:.3f}: фон с яркостью от {lo:.3f} ({gray(lo)}) до {hi:.3f} ({gray(hi)}) даёт < 3:1")
# text 4.5
for n,h in [('чернила св','#18202C'),('чернила тём','#E8ECF1')]:
    L=lum(h); lo=max(0,(L+0.05)/4.5-0.05); hi=min(1,4.5*(L+0.05)-0.05)
    print(f"текст {n}: фон от {gray(lo)} до {gray(hi)} даёт < 4.5:1")
# sample relief tones (typical hillshade greys / water)
for bg in ['#F4F6F9','#C9D0DA','#9AA3AF','#7D8794','#5C6470','#AFC8DC','#2A3442','#161D27']:
    print(bg, {n:round(cr(h,bg),2) for n,h in tok.items()})
