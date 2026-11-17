import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm,copyFile,symlink,mkdir,writeFile,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import {createServer} from '../server.js';
const project=path.resolve(import.meta.dirname,'..');
const scratch='/Users/assane/.hermes/cache/scratch';
async function fixture(t,options={}){
 const root=await mkdtemp(path.join(scratch,'private-gateway-'));
 const {createPrivateTestGateway}=await import('../lib/private-test.js');
 const gateway=await createPrivateTestGateway({root,knowledgeDir:path.join(project,'knowledge'),...options});
 const privateTestGateway=options.wrapGateway?options.wrapGateway(gateway):gateway;
 const server=createServer({privateTestGateway});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 const request=async(route,{method='GET',body,cookie,headers={}}={})=>new Promise((resolve,reject)=>{
  const req=http.request(base+'/api/private-test/'+route,{method,headers:{...(method!=='GET'?{'Origin':base,'x-private-test':'1','Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v])),body:JSON.parse(text)}));
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const login=async()=>{const r=await request('login',{method:'POST',body:access});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 return {root,server,gateway,base,access,request,login};
}
test('gateway rejects rebinding hosts, wrong ports and cross-origin writes',async t=>{
 const f=await fixture(t);
 for(const headers of [{Host:'attacker.example'},{Host:'127.0.0.1:1234'},{Origin:'http://evil.example'},{Origin:''},{'x-private-test':''},{'sec-fetch-site':'cross-site'}]){
  assert.equal((await f.request('login',{method:'POST',body:f.access,headers})).status,403,JSON.stringify(headers));
 }
 const cookie=await f.login();
 assert.equal((await f.request('status',{cookie,headers:{Host:'evil.example'}})).status,403);
 assert.equal((await f.request('status',{cookie})).headers.get('access-control-allow-origin'),null);
});

test('login is rate limited and sessions have bounded count, idle and absolute expiry',async t=>{
 let time=Date.now();const f=await fixture(t,{clock:()=>new Date(time),maxSessions:2});
 const a=await f.login(),b=await f.login();assert.notEqual(a,b);
 assert.equal((await f.request('login',{method:'POST',body:f.access})).status,503);
 time+=29*60*1000;assert.equal((await f.request('status',{cookie:a})).status,200);
 time+=2*60*1000;assert.equal((await f.request('status',{cookie:b})).status,403);
 // Absolute expiry remains 30 minutes even when the session was touched.
 assert.equal((await f.request('status',{cookie:a})).status,403);
 for(let i=0;i<10;i++)await f.request('login',{method:'POST',body:{accessKey:'wrong'}});
 assert.equal((await f.request('login',{method:'POST',body:f.access})).status,429);
});

test('messages remain free deterministic replies and reject browser activation or identity fields',async t=>{
 const f=await fixture(t),cookie=await f.login();
 const r=await f.request('message',{method:'POST',cookie,body:{message:'Bonjour',simulation:false}});
 assert.equal(r.status,200);assert.equal(r.body.mode,'rules+directory');assert.equal(r.body.source,'rules');assert.equal(r.body.openaiEnabled,false);
 assert.deepEqual(r.body.cost,{estimateUsd:0,sessionEstimateUsd:0,dailyLimitUsd:1,monthlyLimitUsd:2});
 assert.equal(r.body.conversationId,undefined);
 for(const body of [{message:'Bonjour',simulation:false,enabled:true},{message:'Bonjour',simulation:false,conversationId:'foreign'},{message:'Bonjour',simulation:false,cost:{estimateUsd:100}},{message:'Bonjour',simulation:'true'},{message:'x'.repeat(1001),simulation:false}])assert.equal((await f.request('message',{method:'POST',cookie,body})).status,400);
 assert.equal((await f.request('message',{method:'POST',cookie,body:{message:'x'.repeat(9000),simulation:false}})).status,413);
});

test('five genuine documentary procedures are sourced and simulation cannot override routing',async t=>{
 const f=await fixture(t);
 for(const [message,id] of [['CNI','cni'],['Extrait de naissance','extrait_naissance'],['Casier judiciaire','casier_judiciaire'],['Passeport ivoirien','passeport'],['Permis de conduire','permis_conduire']]){
  const cookie=await f.login(),r=await f.request('message',{method:'POST',cookie,body:{message,simulation:true}});
  assert.equal(r.status,200);assert.equal(r.body.source,'documentation');assert.equal(r.body.knowledge.procedureId,id);assert.ok(r.body.knowledge.facts.length);assert.ok(r.body.sources.length);
 }
 const cookie=await f.login();
 for(const [message,type] of [['Une personne ne respire plus après un accident','protected_protocol'],['Quel commissariat à Cocody ?','local_search'],['Quel dosage de médicament pour mon bébé ?','safety_orientation']]){
  const isolated=await f.login();const r=await f.request('message',{method:'POST',cookie:isolated,body:{message,simulation:true}});assert.equal(r.body.answerType,type);assert.equal(r.body.source,'rules');
 }
 const unknown=await f.request('message',{method:'POST',cookie,body:{message:'Quels documents pour mon visa Canada ?',simulation:true}});assert.equal(unknown.body.source,'rules');
});

test('only general disabled baseline can show a clearly labelled fixed demonstration',async t=>{
 const f=await fixture(t),cookie=await f.login();
 const r=await f.request('message',{method:'POST',cookie,body:{message:'Explique comment organiser mes idées',simulation:true}});
 assert.equal(r.status,200);assert.equal(r.body.source,'simulation');assert.equal(r.body.mode,'rules+directory');assert.equal(r.body.openaiEnabled,false);
 assert.match(r.body.warnings.join(' '),/démonstration/i);assert.match(r.body.warnings.join(' '),/aucun appel.*OpenAI/i);assert.deepEqual(r.body.sources,[]);
 const normal=await f.request('message',{method:'POST',cookie,body:{message:'Explique comment organiser mes idées',simulation:false}});assert.equal(normal.body.source,'rules');assert.doesNotMatch(normal.body.reply,/démonstration/i);
});

test('conversation deletion resets minor profile without affecting another browser and logout revokes cookie',async t=>{
 const f=await fixture(t),a=await f.login(),b=await f.login();
 const msg=(cookie,message)=>f.request('message',{method:'POST',cookie,body:{message,simulation:false}});
 assert.equal((await msg(a,'Passeport pour un mineur de 14 ans')).body.knowledge.status,'insufficient_scope');
 assert.notEqual((await msg(b,'Passeport ivoirien')).body.knowledge.status,'insufficient_scope');
 assert.equal((await msg(a,'Quelles pièces pour ce passeport ?')).body.knowledge.status,'insufficient_scope');
 assert.equal((await f.request('conversation',{method:'DELETE',cookie:a})).status,200);
 assert.equal((await f.request('status',{cookie:a})).status,200);
 assert.notEqual((await msg(a,'Passeport ivoirien')).body.knowledge.status,'insufficient_scope');
 const logout=await f.request('session',{method:'DELETE',cookie:a});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await f.request('status',{cookie:a})).status,403);assert.equal((await f.request('status',{cookie:b})).status,200);
});

test('deletion cancels a message whose JSON is still arriving and cannot restore erased profile',async t=>{
 const f=await fixture(t),cookie=await f.login();
 let started;const seen=new Promise(resolve=>started=resolve);
 f.server.once('request',()=>started());
 let req;
 const pending=new Promise((resolve,reject)=>{
  req=http.request(f.base+'/api/private-test/message',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie}},res=>{let s='';res.on('data',v=>s+=v);res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);
  req.write('{"message":');
 });
 await seen;
 assert.equal((await f.request('conversation',{method:'DELETE',cookie})).status,200);
 req.end('"Passeport pour un mineur de 14 ans","simulation":false}');
 assert.equal(await pending,409);
 const result=await f.request('message',{method:'POST',cookie,body:{message:'Passeport ivoirien',simulation:false}});
 assert.notEqual(result.body.knowledge.status,'insufficient_scope');
});

test('CLI ignores wildcard HOST and prepares private access before listening',async t=>{
 const root=await mkdtemp(path.join(scratch,'private-cli-'));
 await copyFile(path.join(project,'server.js'),path.join(root,'server.mjs'));
 for(const directory of ['lib','public','knowledge','data'])await symlink(path.join(project,directory),path.join(root,directory));
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'0.0.0.0',PORT:'0',AI_ENABLED:'false',AI_ALLOW_PAID:'false'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill();await new Promise(resolve=>child.exitCode!==null||child.signalCode?resolve():child.once('exit',resolve));await rm(root,{recursive:true,force:true});});
 let output='';const ready=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('CLI startup timeout')),5000);
  child.once('exit',()=>{clearTimeout(timer);reject(Error('CLI exited before listen'));});
  child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
 });
 assert.match(ready,/^http:\/\/127\.0\.0\.1:\d+$/);
 assert.equal((await fetch(ready+'/api/private-test/status')).status,403);
 const access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 assert.ok(access.accessKey);assert.ok(!output.includes(access.accessKey));
 assert.equal((await fetch(ready+'/var/private-test-access.json')).status,404);
});

test('reset during a pending data load cancels work and a fresh adult context survives',async t=>{
 let entered,release;const waiting=new Promise(resolve=>entered=resolve),pause=new Promise(resolve=>release=resolve);let block=true;
 const f=await fixture(t,{wrapGateway:gateway=>({close:()=>gateway.close(),handle:(req,res,url,context)=>gateway.handle(req,res,url,{...context,loadData:async()=>{if(block){block=false;entered();await pause;}return context.loadData();}})})});
 const cookie=await f.login();const pending=f.request('message',{method:'POST',cookie,body:{message:'Passeport pour un mineur de 14 ans',simulation:false}});
 await waiting;
 assert.equal((await f.request('conversation',{method:'DELETE',cookie})).status,200);
 const fresh=await f.request('message',{method:'POST',cookie,body:{message:'Passeport ivoirien',simulation:false}});assert.notEqual(fresh.body.knowledge.status,'insufficient_scope');
 release();assert.equal((await pending).status,409);
 const follow=await f.request('message',{method:'POST',cookie,body:{message:'Quelles pièces pour ce passeport ?',simulation:false}});assert.notEqual(follow.body.knowledge.status,'insufficient_scope');
 for(const [route,method,body] of [['message','POST',{message:'Bonjour',simulation:false}],['conversation','DELETE'],['session','DELETE']]){
  for(const headers of [{Origin:''},{Origin:'http://attacker.example'},{'x-private-test':''}])assert.equal((await f.request(route,{method,body,cookie,headers})).status,403);
 }
 assert.equal((await f.request('status',{cookie})).status,200);
});

test('default server keeps private routes disabled and public endpoints unchanged',async t=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const method of ['GET','POST','DELETE'])assert.equal((await fetch(base+'/api/private-test/status',{method})).status,404);
 assert.deepEqual(await (await fetch(base+'/api/health')).json(),{ok:true});
 assert.equal((await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"message":"Bonjour"}'})).status,403);
 const publicReply=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"message":"Bonjour"}'});assert.equal(publicReply.status,200);assert.ok((await publicReply.json()).reply);
});

test('access-file rotation never follows an existing symbolic link',async t=>{
 const root=await mkdtemp(path.join(scratch,'private-file-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'var'));const victim=path.join(root,'untouched.json');await writeFile(victim,'unchanged');
 await symlink(victim,path.join(root,'var/private-test-access.json'));
 const {createPrivateTestGateway}=await import('../lib/private-test.js');const gateway=await createPrivateTestGateway({root});t.after(()=>gateway.close());
 assert.ok((await readFile(victim,'utf8'))==='unchanged','Existing target must remain unchanged');assert.equal((await lstat(path.join(root,'var/private-test-access.json'))).isSymbolicLink(),false);
});

test('private login creates a restricted file and isolated host-only cookie',async t=>{
 const f=await fixture(t);
 assert.equal((await stat(path.join(f.root,'var'))).mode&0o777,0o700);
 assert.equal((await stat(path.join(f.root,'var/private-test-access.json'))).mode&0o777,0o600);
 assert.ok(Buffer.from(f.access.accessKey,'hex').length>=32);
 assert.equal((await f.request('status')).status,403);
 assert.equal((await f.request('login',{method:'POST',body:{}})).status,400);
 assert.equal((await f.request('login',{method:'POST',body:{accessKey:'incorrect'}})).status,403);
 const r=await f.request('login',{method:'POST',body:f.access});
 assert.equal(r.status,200);assert.equal(r.body.openaiEnabled,false);
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
 assert.match(r.headers.get('set-cookie'),/Path=\/api\/private-test/);assert.match(r.headers.get('set-cookie'),/Max-Age=1800/);
 assert.doesNotMatch(r.headers.get('set-cookie'),/Domain=/i);
 const cookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.request('status',{cookie})).body.authenticated,true);
 assert.equal((await f.request('status',{cookie:'private_test_session=forged'})).status,403);
});
