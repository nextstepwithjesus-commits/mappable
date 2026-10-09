import json,re,collections,sys
rows=[json.loads(l) for l in open(sys.argv[1]) if l.strip()]
def clean(s): return re.sub(r'<[^>]+>','',s or '')
def degree(r):
    ids=sorted(r.get('identifications',[]),key=lambda i:-i['score'].get('time_total',0))
    if ids and ids[0].get('id_source')=='special' and clean(ids[0]['description']).startswith(('unknown','not a')):
        return 'не установлено',0,ids
    ma=r.get('modern_associations') or {}
    s=max([v['score'] for v in ma.values()] or [0])
    d='уверенно' if s>=800 else 'вероятно' if s>=500 else 'предположительно' if s>=300 else 'не установлено'
    return d,s,ids
one_pred=[];neg=collections.Counter();vc1=0;tie=[];approx=collections.Counter()
for r in rows:
    d,s,ids=degree(r)
    if d=='предположительно' and len(ids)==1: one_pred.append(r['friendly_id'])
    if any(i['score'].get('time_total',0)<=0 for i in ids): neg[d]+=1
    if d=='уверенно' and ids and ids[0]['score'].get('vote_count',0)==1: vc1+=1
    if d in('предположительно','вероятно') and len(ids)>=2:
        a,b=ids[0]['score'].get('time_total',0),ids[1]['score'].get('time_total',0)
        if a>0 and b>=0.75*a and ids[1].get('id_source')!='special': tie.append((r['friendly_id'],a,b))
    if d in ('уверенно','вероятно','предположительно') and ids:
        b=ids[0]
        if b.get('modifier') in ('near','along','>') or b.get('geometry_radius_meters'): approx[d]+=1
print('предположительно с одним предложением:',len(one_pred),one_pred[:12])
print('мест, где среди предложений есть оценка <=0:',dict(neg),sum(neg.values()))
print('уверенно с vote_count==1:',vc1)
print('близкие соперники (второй >= 0.75 первого) среди вероятно/предположительно:',len(tie),tie)
print('лучшее предложение приблизительное (near/along/>/радиус):',dict(approx),sum(approx.values()))
