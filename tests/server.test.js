import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function setup(t, options={}) {
 const {createServer}=await import('../server.js');
 const dir=await mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(),'secours-test-'));
 const dataDir=path.join(dir,'data'),publicDir=path.join(dir,'public');
 await mkdir(dataDir);await mkdir(publicDir);await writeFile(path.join(publicDir,'index.html'),'<h1>Test</h1>');
 const server=createServer({dataDir,publicDir,clock:()=>new Date('2026-11-10T12:00:00Z'),...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
 return {server,base,dataDir,publicDir,get:async(route)=>{const r=await fetch(base+route);return {status:r.status,body:await r.json(),headers:r.headers};},post:async(body,headers={})=>{const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),headers:r.headers};}};
}

async function seed(app){
 const source={url:'https://example.test/source',label:'Test fixture',kind:'official',retrieved_at:'2026-11-10'};
 const rec=(id,category,city,extra={})=>({id,category,name:`${category} ${city}`,city,address:city,lat:null,lon:null,phones:[],callable_phones:[],source_url:source.url,source_label:source.label,notes:[],duty_periods:[],...extra});
 await writeFile(path.join(app.dataDir,'directory.json'),JSON.stringify({records:[rec('p1','police','Cocody',{lat:5.35,lon:-4}),rec('p2','police','Bouaké'),rec('g1','gendarmerie','Cocody'),rec('f1','fire','Abidjan')],sources:[source],coverage:{note:'partial'}}));
 await writeFile(path.join(app.dataDir,'pharmacies.json'),JSON.stringify({records:[rec('a1','pharmacy','Cocody',{lat:5.36,lon:-4,duty_periods:[{start:'2026-11-09',end:'2026-11-15',source_url:source.url}]}),rec('a2','pharmacy','Cocody',{duty_periods:[{start:'2026-10-01',end:'2026-10-07'}]})],sources:[source],coverage:{note:'fixture'}}));
}

test('directory searches normalize tokens, filter real duty dates, paginate and expose provenance',async t=>{
 const app=await setup(t);await seed(app);
 let r=await app.get('/api/search?category=pharmacy&q=Pharmacie%20%C3%A0%20COCODY&duty=1');
 assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.results[0].id,'a1');assert.equal(r.body.date,'2026-11-10');
 r=await app.get('/api/search?category=police&q=bouake');assert.equal(r.body.results[0].id,'p2');
 r=await app.get('/api/search?limit=2&offset=2');assert.equal(r.body.total,6);assert.equal(r.body.results.length,2);assert.equal(r.body.has_more,true);
 r=await app.get('/api/search?limit=1000');assert.equal(r.body.limit,100);
 r=await app.get('/api/search?lat=5.35&lon=-4');assert.equal(r.body.results[0].id,'p1');assert.equal(r.body.results[0].distance_km,0);assert.ok(!('distance_km' in r.body.results.at(-1)));
 assert.equal((await app.get('/api/search')).body.results.some(x=>'distance_km' in x),false);
 for(const query of ['date=2026-02-30','category=bogus','lat=5','lat=50&lon=-4','limit=abc','offset=-1'])assert.equal((await app.get('/api/search?'+query)).status,400,query);
 assert.equal((await app.get('/api/record/p1')).body.id,'p1');assert.equal((await app.get('/api/record/nope')).status,404);
 r=await app.get('/api/status');assert.deepEqual(r.body.counts,{police:2,gendarmerie:1,fire:1,pharmacy:2,total:6});assert.equal(r.body.duty.active,1);assert.equal(r.body.week_start,'2026-11-09');assert.equal(r.body.week_end,'2026-11-15');assert.equal(r.body.assistant_mode,'rules+directory');
 r=await app.get('/api/sources');assert.equal(r.body.sources.length,1);assert.ok(r.body.coverage.pharmacies);
});

test('missing data is reported without invented records',async t=>{const app=await setup(t);const r=await app.get('/api/status');assert.equal(r.body.counts.total,0);assert.ok(r.body.limitations.length);assert.equal((await app.get('/api/search')).body.total,0);});

test('chat puts urgency before location and date checks, with real call actions and no promises',async t=>{
 const app=await setup(t);
 for(const [message,number] of [['incendie chez moi','180'],['il ne respire plus','185'],['agression en cours','100']]){const r=await app.post({message,location:{lat:'oops'},date:'bogus'});assert.equal(r.status,200);assert.equal(r.body.intent,'emergency');assert.ok(r.body.actions.some(a=>a.number===number));assert.doesNotMatch(r.body.reply,/appel lancé|service alerté|\?/i);}
 const r=await app.post({message:'urgence danger'});assert.deepEqual(r.body.actions.map(a=>a.number),['180','185','100','145']);
});

test('chat follows client state, searches catalog, supports explicit dates and asks GPS fallback',async t=>{
 const app=await setup(t);await seed(app);
 let r=await app.post({message:'pharmacie de garde'});assert.equal(r.body.intent,'pharmacy');assert.equal(r.body.state.category,'pharmacy');assert.equal(r.body.results.length,0);assert.match(r.body.reply,/commune|localité/);
 r=await app.post({message:'Cocody',state:r.body.state});assert.equal(r.body.results[0].id,'a1');assert.equal(r.body.results.length,1);
 r=await app.post({message:'pharmacie de garde à Cocody',date:'2026-10-02'});assert.equal(r.body.results[0].id,'a2');assert.equal(r.body.date,'2026-10-02');
 r=await app.post({message:'pharmacie près de moi'});assert.match(r.body.reply,/position|commune/);
 r=await app.post({message:'police près de moi',location:{lat:5.35,lon:-4}});assert.equal(r.body.results[0].id,'p1');
 r=await app.post({message:'accident sans blessé constat à Cocody'});assert.equal(r.body.intent,'constat');assert.equal(r.body.results[0].id,'p1');assert.equal(r.body.actions.length,0);
 r=await app.post({message:'plainte à Cocody'});assert.equal(r.body.intent,'plainte');assert.equal(r.body.state.complaint.step,'safety');assert.equal(r.body.results.length,0);
 r=await app.post({message:'gendarmerie à Cocody'});assert.equal(r.body.results[0].id,'g1');
 r=await app.post({message:'pompiers à Abidjan'});assert.equal(r.body.results[0].id,'f1');
 r=await app.post({message:'parler à un humain'});assert.deepEqual(r.body.actions,[{type:'human'}]);assert.match(r.body.reply,/aucun opérateur|pas de transfert/i);
 r=await app.post({message:'service payant partenaire'});assert.match(r.body.reply,/aucun.*partenaire/i);
 assert.equal((await app.post({message:'police',location:{lat:0,lon:0}})).status,400);
 assert.equal((await app.post({message:'police',state:[]})).status,400);
 assert.equal((await app.post({message:'x'.repeat(2001)})).status,400);
});

test('HTTP boundaries reject unsafe bodies, methods and origins; static files stay public',async t=>{
 const app=await setup(t);let r=await fetch(app.base+'/');assert.equal(r.status,200);assert.match(await r.text(),/<h1>Test/);assert.match(r.headers.get('content-security-policy'),/default-src 'self'/);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 for(const route of ['/server.js','/data/directory.json','/%2e%2e%2fpackage.json','/%00','/api/nope'])assert.notEqual((await fetch(app.base+route)).status,200,route);
 for(const [headers,body,status] of [[{'Content-Type':'text/plain'},'{}',415],[{'Content-Type':'application/json'},'{',400],[{'Content-Type':'application/json'},JSON.stringify({message:'x'.repeat(9000)}),413],[{'Content-Type':'application/json',Origin:'https://evil.test'},'{"message":"hello"}',403],[{'Content-Type':'application/json','Sec-Fetch-Site':'cross-site'},'{"message":"hello"}',403]]){r=await fetch(app.base+'/api/chat',{method:'POST',headers,body});assert.equal(r.status,status);assert.equal(r.headers.get('access-control-allow-origin'),null);}
 assert.equal((await fetch(app.base+'/api/health',{method:'POST'})).status,405);
 assert.equal((await fetch(app.base+'/api/chat')).status,405);
 const good=await app.post({message:'bonjour'},{Origin:app.base});assert.equal(good.status,200);
});

test('rate limiter is injectable and limits clients without recording conversation',async t=>{
 const app=await setup(t,{rateLimit:{max:2,windowMs:60000}});assert.equal((await app.post({message:'hello'})).status,200);assert.equal((await app.post({message:'hello'})).status,200);assert.equal((await app.post({message:'hello'})).status,429);
});

test('chat searches previously unknown locality tokens and does not leak client state',async t=>{
 const app=await setup(t);await seed(app);
 const first=await app.post({message:'police'});
 const answer=await app.post({message:'Yopougon',state:first.body.state});assert.equal(answer.body.state.locality,'Yopougon');assert.match(answer.body.reply,/Aucun résultat/);
 const direct=await app.post({message:'pharmacie à Bingerville'});assert.equal(direct.body.state.locality,'Bingerville');assert.match(direct.body.reply,/Aucun résultat/);
 const next=await app.post({message:'Cocody'});assert.equal(next.body.intent,'other');
});

test('chat rejects empty GPS objects, never trusts invented state categories',async t=>{
 const app=await setup(t);assert.equal((await app.post({message:'police',location:{}})).status,400);
 assert.equal((await app.post({message:'Cocody',state:{category:'medical',history:'secret'}})).body.intent,'other');
});

test('complaint HTTP route keeps state through the minimal flow and waits for confirmation before source lookup',async t=>{const app=await setup(t);await seed(app);let r=await app.post({message:'Je veux porter plainte'});for(const message of ['Je suis en sécurité','Non, pas de blessure','Un téléphone volé hier','Hier vers 18 heures','Cocody','Victime','Non','Un reçu','Pas de blessés, téléphone perdu']){r=await app.post({message,state:r.body.state});assert.equal(r.status,200);}assert.equal(r.body.state.complaint.step,'confirm');assert.equal(r.body.results.length,0);r=await app.post({message:'Oui, c’est correct',state:r.body.state});assert.deepEqual(new Set(r.body.results.map(x=>x.id)),new Set(['p1','g1']));assert.deepEqual(r.body.state,{});});

test('health is an actual HTTP JSON route with safety headers',async t=>{
 const app=await setup(t);const r=await app.get('/api/health');
 assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true});assert.equal(r.headers.get('x-content-type-options'),'nosniff');
});
