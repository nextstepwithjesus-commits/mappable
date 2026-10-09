import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
S=sys.argv[1]
f=instancer.instantiateVariableFont(TTFont(f'{S}/r8/ttf/literata.ttf'),{'opsz':18,'wght':400})
cm=f.getBestCmap(); hm=f['hmtx']; upm=f['head'].unitsPerEm
txt=open('/home/user/mappable/tools/bible/synodal.tsv',encoding='utf-8').read().split('\n')
sample=' '.join(l.split('\t')[3] for l in txt if l.startswith('Быт\t6\t') or l.startswith('Быт\t7\t'))
w=sum(hm[cm[ord(c)]][0] if ord(c) in cm else hm['space'][0] for c in sample)/upm
avg=w/len(sample)
for size,width in [(20,662),(17,662),(18,328),(20,564)]:
    print(f'Literata opsz18 400 {size}px, колонка {width}px: в среднем {width/(avg*size):.0f} знаков в строке')
