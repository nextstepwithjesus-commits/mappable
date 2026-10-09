# Сколько имён-ссылок встретится в тексте истории (по § 4.4 «Имена — ссылки»)
import re,sys
rows=[l.rstrip('\n').split('\t') for l in open('/home/user/mappable/tools/bible/synodal.tsv',encoding='utf-8')]
def seg(book,c1,v1,c2,v2):
    out=[]
    for b,c,v,t in rows:
        if b!=book: continue
        c,v=int(c),int(v)
        if (c,v)>=(c1,v1) and (c,v)<=(c2,v2): out.append((c,v,t))
    return out
def count(name,book,c1,v1,c2,v2,pat,parts=None):
    s=seg(book,c1,v1,c2,v2)
    tot=0; per={}
    for c,v,t in s:
        t2=re.sub(r'\[[^\]]*\]','',t)
        n=len(re.findall(pat,t2))
        tot+=n
        if parts:
            for i,(a,b) in enumerate(parts):
                if a<=(c,v)<=b: per[i+1]=per.get(i+1,0)+n
    words=sum(len(t.split()) for _,_,t in s)
    print(name, 'стихов',len(s),'слов',words,'вхождений имён (вне скобок)',tot, 'по частям',per)
noy_parts=[((6,9),(6,22)),((7,1),(7,16)),((7,17),(7,24)),((8,1),(8,14)),((8,15),(8,22)),((9,1),(9,17))]
count('Ной и потоп','Быт',6,9,9,17,r'\b(Но[йяюе]м?|Сим[ау]?|Хам[ау]?|Иафет[ау]?)\b',noy_parts)
count('1 Цар 17','1Цар',17,1,17,58,r'\b(Давид[аеуо]?м?|Саул[аеу]?м?|Голиаф[аеу]?м?|Иессе[йяюе]м?|Елиав[аеу]?|Авенир[аеу]?)\b')
count('Мк 6:30-44','Мк',6,30,6,44,r'\b(Иисус[аеу]?|Апостол\w*)\b')
