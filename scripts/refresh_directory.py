#!/usr/bin/env python3
"""Collect public service facts, preserving snapshots and geographic provenance.

Default: replay the fetched evidence. --live refreshes HTML pages; --refresh-osm
also downloads the national OSM extract (about 86 MB). Never upgrades old phones.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
from urllib.parse import unquote, urlparse, parse_qs
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup
from shapely.geometry import Point, shape

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'data/evidence/directory'
UA='SecoursCitoyenDirectory/1.0 (public-service directory; no emergency calls)'

def iso(ts=None):
    return datetime.fromtimestamp(ts,timezone.utc).isoformat().replace('+00:00','Z') if ts else datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def norm(s):
    return re.sub(r'[^a-z0-9]+',' ',''.join(c for c in unicodedata.normalize('NFKD',str(s)) if not unicodedata.combining(c)).lower()).strip()

def clean(s):
    return re.sub(r'\s+',' ',s).strip()

def callable_phones(phones):
    values=[]
    for raw in phones:
        if not isinstance(raw,str) or re.search(r'[^0-9\s+().-]',raw):
            continue
        digits=re.sub(r'\D','',raw)
        if digits.startswith('225') and len(digits)==13:
            digits=digits[3:]
        if re.fullmatch(r'(?:01|05|07|21|25|27)\d{8}',digits):
            number='+225'+digits
            if number not in values: values.append(number)
    return values

def phones_in(text):
    # Preserve each published token; splitting does not repair digits.
    return list(dict.fromkeys(clean(x) for x in re.split(r'\s*[/;\n]\s*',text) if re.search(r'\d',x)))

class Collector:
    def __init__(self):
        self.sources={};self.records=[];self.excluded=Counter();self.manifest={}
    def source(self,url,label,kind,file):
        path=EVIDENCE/file
        value={'url':url,'label':label,'kind':kind,'retrieved_at':iso(path.stat().st_mtime),'evidence_file':str(path.relative_to(ROOT))}
        self.sources[url]=value
        self.manifest[file]={'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'retrieved_at':value['retrieved_at']}
        return value
    def add(self,name,category,city,address,phones,source,lat=None,lon=None,location_url=None,updated=None,notes=None,ident=None):
        if not name: return
        valid_point=isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and 4<lat<11 and -9<lon<-2
        lat,lon=(lat,lon) if valid_point else (None,None)
        r={'id':ident or 'dir-'+hashlib.sha256((category+'|'+norm(name)+'|'+norm(city)+'|'+source['url']).encode()).hexdigest()[:18],
           'category':category,'name':name,'city':city,'address':address,'lat':lat,'lon':lon,'phones':list(dict.fromkeys(phones)),
           'callable_phones':callable_phones(phones),'source_url':source['url'],'source_label':source['label'],'source_kind':source['kind'],
           'retrieved_at':source['retrieved_at'],'source_updated_at':updated,'duty_periods':[],
           'location_precision':'point' if lat is not None else 'address' if address else 'city' if city else 'unknown',
           'location_source_url':location_url if lat is not None else None,'notes':list(notes or []),'sources':[dict(source)]}
        if lat is not None and location_url!=source['url']:
            r['sources'].append({**source,'url':location_url,'label':'OpenStreetMap — géométrie publiée'})
        if phones and not r['callable_phones']:r['notes'].append('Numéro publié ancien, incomplet ou de format non reconnu : non activé pour les appels.')
        self.records.append(r)
        return r

def parse_official(c):
    known=['Yopougon','Attécoubé','Abobo','Adjamé','Cocody','Treichville','Koumassi','Marcory','Port-Bouët','Bingerville','Anyama','Plateau','Grand-Bassam','Bouaké','Bonoua','Vavoua','Yamoussoukro','Daloa','Bondoukou','Abengourou','Gagnoa','Divo','San-Pédro','Korhogo','Man','Toumodi','Dabou','Agboville','Adzopé','Afféry']
    for file in [*sorted(EVIDENCE.glob('police-*.html')),EVIDENCE/'pompiers.html']:
        if file.name=='pompiers.html':url='https://annuaire.gouv.ci/accueil/liste_institution/pompiers'
        else:url='https://annuaire.gouv.ci/accueil/liste_institution/commissariats-de-police/'+re.search(r'(\d+)',file.name)[1]
        source=c.source(url,'Annuaire des services publics de Côte d’Ivoire','official',file.name)
        soup=BeautifulSoup(file.read_bytes().decode('utf-8','replace'),'html.parser')
        for h in soup.select('h5'):
            parent=h.parent
            if not parent.select_one('span.detail_institution'):continue
            name=h.get_text(' ',strip=True);n=norm(name)
            if not re.search(r'commissariat|police|gendarmerie|pompiers?',n):
                c.excluded['official_ambiguous_name']+=1;continue
            if n in ['pompiers','police','police secours']:
                c.excluded['national_phone_not_station']+=1;continue
            category='fire' if 'pompier' in n else 'gendarmerie' if 'gendar' in n else 'police'
            address='';phone=[]
            for span in parent.select('span.detail_institution'):
                text=span.get_text(' ',strip=True)
                if span.select_one('i'):
                    icon=span.select_one('i').get_text(strip=True);text=clean(text.removeprefix(icon))
                    if icon=='my_location':address=text
                    elif icon=='call':phone=phones_in(text)
            city=next((x for x in known if (' '+norm(x)+' ') in (' '+norm(address+' '+name)+' ')), '')
            if not city and 'arrondissement' in n: city='Abidjan'
            c.add(name,category,city,address,phone,source,notes=['L’annuaire officiel peut contenir des contacts historiques ; source consultable avant usage.'])
    source=c.source('https://onpc-ci.org/cpc','ONPC — Centres de protection civile','official','cpc.html')
    soup=BeautifulSoup((EVIDENCE/'cpc.html').read_bytes().decode('utf-8','replace'),'html.parser')
    for row in soup.select('table tr')[1:]:
        cells=row.find_all(['td','th'])
        if len(cells)<5:continue
        name=clean(cells[1].get_text(' ',strip=True));address=clean(cells[2].get_text(' ',strip=True))
        raw=cells[4].get_text('\n',strip=True);phone=phones_in(raw)
        # Some cells use spaces between full, ten-digit groups, without br.
        if not callable_phones(phone):
            matches=list(re.finditer(r'(?<!\d)(?:0[157]|2[157])(?:[ .-]*\d){8}(?!\d)',raw))
            if matches:phone=[m.group(0) for m in matches]
        c.add(name,'fire',re.sub(r'^CPC\s+','',name,flags=re.I),address,phone,source)
    source=c.source('https://lepompierenvous.com/annuaire-secours','Le Pompier en Vous — casernes GSPM','directory','1.html')
    soup=BeautifulSoup((EVIDENCE/'1.html').read_bytes().decode('utf-8','replace'),'html.parser')
    for row in soup.select('table')[1].select('tr')[1:]:
        cells=[x.get_text(' ',strip=True) for x in row.find_all(['td','th'])]
        if len(cells)<3:continue
        name=cells[0];city=re.sub(r'^Caserne\s+','',name)
        c.add(name,'fire',city,'',phones_in(cells[2]),source,updated='2026-08-25',notes=['Annuaire tiers : coordonnées à confirmer ; aucune entrée de caserne exacte publiée dans cette fiche.'])

def parse_go(c):
    listing=BeautifulSoup((EVIDENCE/'3.html').read_bytes().decode('utf-8','replace'),'html.parser')
    links={re.search(r'/ci/(\d+)-',a['href'])[1]:a['href'] for a in listing.select('h2 a[href]') if re.search(r'/ci/(\d+)-',a['href'])}
    for ident,url in links.items():
        file=EVIDENCE/f'go-{ident}.html'
        if not file.exists():continue
        source=c.source(url,'Go Africa Online — fiche publique','directory',file.name)
        s=BeautifulSoup(file.read_bytes().decode('utf-8','replace'),'html.parser');h=s.select_one('h1');address=s.select_one('address')
        if not h:continue
        name=h.get_text(' ',strip=True);n=norm(name)
        if 'crs' in n: c.excluded['not_public_station']+=1;continue
        category='gendarmerie' if 'gendar' in n else 'police'
        lines=list(address.stripped_strings) if address else []
        city=re.split(r'\s*-\s*C[oô]te d[’\']Ivoire',lines[-1],flags=re.I)[0].strip() if lines else ''
        if norm(city)=='abidjan' and len(lines)>1:
            suburbs={'attecoube','adjame','abobo','cocody','treichville','marcory','koumassi','yopougon','port bouet','plateau'}
            if norm(lines[-2]) in suburbs:city=lines[-2]
        if len(city)>50:city=''
        rawphones=list(dict.fromkeys(a.get_text(' ',strip=True) for a in s.select('a[href^="tel:"]') if re.search(r'\d',a.get_text())))
        lat=lon=None
        for a in s.select('a[href]'):
            if 'google.com/maps/dir/' not in a['href']:continue
            destination=parse_qs(urlparse(a['href']).query).get('destination',[''])[0]
            if re.fullmatch(r'-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?',destination):
                lat,lon=map(float,destination.split(','));break
        c.add(name,category,city,clean(' '.join(lines)),rawphones,source,lat,lon,url)

def parse_osm(c):
    metadata=json.loads((EVIDENCE/'ivory-coast-latest.osm.meta.json').read_text())
    source=c.source(metadata['url'],'OpenStreetMap / Geofabrik — extrait national','community','osm-candidates.json')
    source['retrieved_at']=metadata['retrieved_at'].replace('+00:00','Z')
    areas=json.loads((EVIDENCE/'osm-administrative-areas.json').read_text())
    boundaries=[(x,shape(x['geometry'])) for x in areas]
    country=next(g for x,g in boundaries if x['tags'].get('ISO3166-1')=='CI')
    local=sorted([(x,g) for x,g in boundaries if x['tags'].get('admin_level') in ['7','8']],key=lambda pair:pair[1].area)
    for x in json.loads((EVIDENCE/'osm-candidates.json').read_text()):
        tags=x['tags'];lat=x.get('lat');lon=x.get('lon')
        if lat is None or lon is None or not country.covers(Point(lon,lat)):
            c.excluded['outside_country_or_no_point']+=1;continue
        name=tags.get('name') or tags.get('name:fr') or ''
        category='fire' if tags.get('amenity')=='fire_station' else 'gendarmerie' if 'gendar' in norm(name+' '+tags.get('operator','')) else 'police'
        if category!='fire' and re.search(r'\b(camp|ecole|etat major|caserne|escadron)\b',norm(name)) and not re.search(r'brigade|commissariat|poste',norm(name)):
            c.excluded['military_or_training_not_public_station']+=1;continue
        if not name:
            c.excluded['unnamed_osm_point']+=1;continue
        point=Point(lon,lat)
        area=next((a for a,g in local if g.covers(point)),None)
        city=tags.get('addr:city') or (area['tags'].get('name','') if area else '')
        address=clean(', '.join(dict.fromkeys(tags.get(k,'') for k in ['addr:housenumber','addr:street','addr:suburb','addr:city'] if tags.get(k))))
        phone=[]
        for k in ['phone','contact:phone']:
            if tags.get(k):phone.extend(phones_in(tags[k]))
        url=f'https://www.openstreetmap.org/{x["type"]}/{x["id"]}'
        notes=['Données communautaires OpenStreetMap, non validées par les services de secours.']
        if x['type']=='way':notes.append('Point représentatif calculé sur la géométrie du bâtiment OSM ; ce n’est pas une entrée confirmée.')
        if not tags.get('addr:city') and area:notes.append('Commune par inclusion dans une limite administrative OSM, sans implication de compétence territoriale.')
        r=c.add(name,category,city,address,phone,source,lat,lon,url,x.get('timestamp'),notes,'osm-'+x['type']+'-'+str(x['id']))
        if r:r['osm_type']=x['type'];r['osm_id']=x['id'];r['city_source_url']=f'https://www.openstreetmap.org/relation/{area["id"]}' if area else None

def haversine(a,b):
    if a['lat'] is None or b['lat'] is None:return math.inf
    x=math.radians(a['lat']-b['lat']);y=math.radians(a['lon']-b['lon'])
    return 6371000*2*math.asin(math.sqrt(math.sin(x/2)**2+math.cos(math.radians(a['lat']))*math.cos(math.radians(b['lat']))*math.sin(y/2)**2))

def arrkey(r):
    n=norm(r['name']);m=re.search(r'\b(\d+)\s*(?:er|e|eme)?\s*arrondissement',n)
    if not m:return None
    city=norm(r['city']+' '+r['address']+' '+r['name'])
    metro='bouake' if 'bouake' in city else 'abidjan' if any(s in city for s in ['abidjan','cocody','yopougon','abobo','adjame','attecoube','plateau','marcory','treichville','koumassi','port bouet']) else None
    return (r['category'],int(m[1]),metro) if metro else None

def dedupe(rows):
    result=[];merged=0
    for row in rows:
        match=None
        for old in result:
            if old['category']!=row['category']:continue
            equal_name=norm(old['name'])==norm(row['name'])
            same_city=norm(old['city'])==norm(row['city']) and bool(row['city'])
            same_phone=bool(set(old['callable_phones'])&set(row['callable_phones']))
            if (arrkey(old) and arrkey(old)==arrkey(row)) or (same_phone and (equal_name or haversine(old,row)<400)) or (equal_name and (same_city or haversine(old,row)<100)):
                match=old;break
        if match is None:result.append(row);continue
        merged+=1
        for key in ['phones','notes','sources']:
            for value in row[key]:
                if value not in match[key]:match[key].append(value)
        match['callable_phones']=callable_phones(match['phones'])
        if not match['city'] and row['city']:match['city']=row['city']
        if not match['address'] and row['address']:match['address']=row['address']
        if match['lat'] is None and row['lat'] is not None:
            for key in ['lat','lon','location_precision','location_source_url']:match[key]=row[key]
        elif match['lat'] is not None and row['lat'] is not None and haversine(match,row)>500:
            match['notes'].append('Des sources localisent cette même dénomination à plus de 500 m : vérifiez l’adresse avant déplacement.')
        if match['lat'] is None:match['location_precision']='address' if match['address'] else 'city' if match['city'] else 'unknown'
    return result,merged

def refresh_html():
    jobs=[(f'police-{i}.html',f'https://annuaire.gouv.ci/accueil/liste_institution/commissariats-de-police/{i}') for i in range(1,9)]
    jobs.extend([('pompiers.html','https://annuaire.gouv.ci/accueil/liste_institution/pompiers'),('cpc.html','https://onpc-ci.org/cpc'),('1.html','https://lepompierenvous.com/annuaire-secours'),('3.html','https://www.goafricaonline.com/ci/annuaire/commissariats-police')])
    listing=EVIDENCE/'3.html'
    if not listing.exists():
        with urlopen(Request('https://www.goafricaonline.com/ci/annuaire/commissariats-police',headers={'User-Agent':UA}),timeout=30) as response:listing.write_bytes(response.read())
    first=BeautifulSoup(listing.read_bytes().decode('utf-8'),'html.parser')
    for a in first.select('h2 a[href]'):
        m=re.search(r'/ci/(\d+)-',a['href'])
        if m:jobs.append((f'go-{m[1]}.html',a['href']))
    failures=[]
    for name,url in jobs:
        try:
            with urlopen(Request(url,headers={'User-Agent':UA}),timeout=30) as response:body=response.read()
            if len(body)<500 or b'<html' not in body.lower():raise ValueError('HTML invalid')
            (EVIDENCE/name).write_bytes(body)
        except Exception as exc:failures.append({'url':url,'error':str(exc)[:200]})
    return failures

def refresh_osm():
    import osmium
    url='https://download.geofabrik.de/africa/ivory-coast-latest.osm.pbf'
    with urlopen(Request(url,headers={'User-Agent':UA}),timeout=180) as response:body=response.read();headers=dict(response.headers)
    file=EVIDENCE/'ivory-coast-latest.osm.pbf';file.write_bytes(body)
    meta={'url':url,'retrieved_at':iso(),'status':200,'headers':headers,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body)}
    (EVIDENCE/'ivory-coast-latest.osm.meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    rows=[]
    processor=osmium.FileProcessor(str(file)).with_locations().with_filter(osmium.filter.TagFilter(('amenity','police'),('amenity','fire_station')))
    for obj in processor:
        if isinstance(obj,osmium.osm.Node):lat,lon=obj.location.lat,obj.location.lon;kind='node'
        elif isinstance(obj,osmium.osm.Way):
            coords=[(n.lat,n.lon) for n in obj.nodes if n.location.valid()]
            if not coords:continue
            lat=sum(p[0] for p in coords)/len(coords);lon=sum(p[1] for p in coords)/len(coords);kind='way'
        else:continue
        rows.append({'type':kind,'id':obj.id,'tags':dict(obj.tags),'lat':lat,'lon':lon,'timestamp':str(obj.timestamp)})
    (EVIDENCE/'osm-candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true');parser.add_argument('--refresh-osm',action='store_true');args=parser.parse_args()
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    failures=refresh_html() if args.live else []
    if args.refresh_osm:refresh_osm()
    c=Collector();parse_official(c);parse_go(c);parse_osm(c)
    rows,merged=dedupe(c.records)
    if len(rows)<150:raise RuntimeError('Extraction unexpectedly small; refusing publication')
    counts={k:sum(r['category']==k for r in rows) for k in ['police','gendarmerie','fire']}
    coverage={'exhaustive':False,'total':len(rows),'counts':counts,'with_coordinates':sum(r['lat'] is not None for r in rows),'with_callable_phone':sum(bool(r['callable_phones']) for r in rows),'merged_records':merged,'excluded':dict(c.excluded),'rebuild_at':iso(),'refresh_failures':failures,'notice':'Sources officielles, annuaires tiers et OpenStreetMap. Certaines coordonnées OSM sont anciennes. Proximité sans présomption de compétence territoriale. Pas de garantie de recensement exhaustif.'}
    payload={'records':rows,'sources':list(c.sources.values()),'coverage':coverage}
    temporary=ROOT/'data/directory.pending.json';temporary.write_text(json.dumps(payload,ensure_ascii=False,indent=2));temporary.replace(ROOT/'data/directory.json')
    (EVIDENCE/'manifest.json').write_text(json.dumps(c.manifest,ensure_ascii=False,indent=2))
    print(json.dumps(coverage,ensure_ascii=False,indent=2))
    if failures:print('WARNING: failed sources kept with original timestamps, not falsely refreshed')

if __name__=='__main__':main()
