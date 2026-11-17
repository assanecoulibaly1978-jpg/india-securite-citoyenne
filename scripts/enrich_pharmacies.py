#!/usr/bin/env python3
"""Add separately attributed OSM points, never modify primary duty data.
Requires the preserved Geofabrik extract or the derived pharmacy evidence.
No fuzzy name-only matching; unknown/ambiguous cases stay without GPS.
"""
import json
import math
from pathlib import Path
from collections import Counter
from shapely.geometry import Point,shape
from refresh_directory import norm,callable_phones,phones_in
ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'data/evidence/directory'

def namekey(name):
    words=norm(name).split();words=[{'phcie':'pharmacie','ste':'sainte','st':'saint','nlle':'nouvelle','gde':'grande'}.get(w,w) for w in words]
    return ' '.join(w for w in words if w not in {'pharmacie','nouvelle','grande','de','du','des','la','le','l','d','les'})

def candidates():
    cached=E/'osm-pharmacies.json'
    if cached.exists():return json.loads(cached.read_text())
    import osmium
    rows=[]
    p=osmium.FileProcessor(str(E/'ivory-coast-latest.osm.pbf')).with_locations().with_filter(osmium.filter.TagFilter(('amenity','pharmacy')))
    for obj in p:
        if isinstance(obj,osmium.osm.Node):lat,lon=obj.location.lat,obj.location.lon;kind='node'
        elif isinstance(obj,osmium.osm.Way):
            coords=[(n.lat,n.lon) for n in obj.nodes if n.location.valid()]
            if not coords:continue
            lat=sum(x[0] for x in coords)/len(coords);lon=sum(x[1] for x in coords)/len(coords);kind='way'
        else:continue
        rows.append({'type':kind,'id':obj.id,'tags':dict(obj.tags),'lat':lat,'lon':lon,'timestamp':str(obj.timestamp)})
    cached.write_text(json.dumps(rows,ensure_ascii=False,indent=2));return rows

def main():
    base=json.loads((ROOT/'data/pharmacies.json').read_text());meta=json.loads((E/'ivory-coast-latest.osm.meta.json').read_text());areas=json.loads((E/'osm-administrative-areas.json').read_text())
    country=next(shape(x['geometry']) for x in areas if x['tags'].get('ISO3166-1')=='CI')
    local=sorted([(x,shape(x['geometry'])) for x in areas if x['tags'].get('admin_level') in ['7','8']],key=lambda p:p[1].area)
    data=[]
    for r in candidates():
        if not r['tags'].get('name'):continue
        if not country.covers(Point(r['lon'],r['lat'])):continue
        area=next((a for a,g in local if g.covers(Point(r['lon'],r['lat']))),None)
        t=r['tags'];r['cities']={norm(t.get('addr:city','')),norm(t.get('addr:suburb',''))}
        if area:r['cities'].add(norm(area['tags'].get('name','')))
        r['phones']=set(callable_phones(phones_in(t.get('phone',''))+phones_in(t.get('contact:phone',''))));r['key']=namekey(t['name']);data.append(r)
    locations=[];ambiguous=0
    for pharmacy in base['records']:
        primary_phones=set(pharmacy.get('callable_phones',[]));city=norm(pharmacy['city']);key=namekey(pharmacy['name'])
        exact_phone=[r for r in data if primary_phones & r['phones']]
        named=[r for r in data if r['key']==key and key and city in r['cities']]
        matches=exact_phone or named;method='exact_published_phone' if exact_phone else 'exact_name_and_locality'
        if not matches:continue
        # Even exact phones are not enough when mapped points disagree materially.
        if any(math.hypot((r['lat']-matches[0]['lat'])*111000,(r['lon']-matches[0]['lon'])*110000)>120 for r in matches):
            ambiguous+=1;continue
        chosen=sorted(matches,key=lambda r:r['type']!='node')[0];url=f'https://www.openstreetmap.org/{chosen["type"]}/{chosen["id"]}'
        locations.append({'record_id':pharmacy['id'],'lat':chosen['lat'],'lon':chosen['lon'],'source_url':url,'source_label':'OpenStreetMap — point communautaire de pharmacie','retrieved_at':meta['retrieved_at'],'source_updated_at':chosen['timestamp'],'match_method':method,'osm_type':chosen['type'],'osm_id':chosen['id'],'notes':['Position communautaire rapprochée du planning primaire par '+('numéro publié exact.' if exact_phone else 'nom normalisé et localité concordante.'),'Point non validé par la pharmacie ; confirmer l’adresse avant déplacement.']+(['Point représentatif du bâtiment OSM, pas une entrée confirmée.'] if chosen['type']=='way' else [])})
    payload={'locations':locations,'sources':[{'url':meta['url'],'label':'OpenStreetMap / Geofabrik — localisation complémentaire des pharmacies','kind':'community','retrieved_at':meta['retrieved_at'],'evidence_file':'data/evidence/directory/osm-pharmacies.json','notes':'Garde fournie par UNPPCI ; OSM fournit uniquement des points de localisation.'}],'coverage':{'matched':len(locations),'unmatched':len(base['records'])-len(locations),'ambiguous_rejected':ambiguous,'methods':dict(Counter(x['match_method'] for x in locations)),'exhaustive':False}}
    (ROOT/'data/pharmacy_locations.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2));print(json.dumps(payload['coverage'],ensure_ascii=False))
if __name__=='__main__':main()
