import math
# Harran (Harran, Turkey) and Tell Balatah (Shechem) — approximate published coordinates
a=(36.865,39.030); b=(32.2134,35.2817)
R=6371
la1,lo1,la2,lo2=map(math.radians,(a[0],a[1],b[0],b[1]))
d=2*R*math.asin(math.sqrt(math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
y=math.sin(lo2-lo1)*math.cos(la2); x=math.cos(la1)*math.sin(la2)-math.sin(la1)*math.cos(la2)*math.cos(lo2-lo1)
print(round(d), round((math.degrees(math.atan2(y,x))+360)%360))
