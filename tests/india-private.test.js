import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.js';
import {createPrivateTestGateway} from '../lib/private-test.js';
import {readAIConfig} from '../lib/ai/config.js';
import http from 'node:http';
const project=path.resolve(import.meta.dirname,'..');
async function fixture(t,options={}){
 const root=await mkdtemp('/Users/assane/.hermes/cache/scratch/india-private-');
 const gateway=await createPrivateTestGateway({root,knowledgeDir:path.join(project,'knowledge'),...(typeof options==='function'?options(root):options)});
 const server=createServer({privateTestGateway:gateway,aiConfig:readAIConfig({},project)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 const login=await fetch(base+'/api/private-test/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','x-private-test':'1'},body:JSON.stringify(access)});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,{method='GET',body}={})=>{const r=await fetch(base+'/api/private-test/'+route,{method,headers:{Origin:base,'Content-Type':'application/json','x-private-test':'1',cookie},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const message=message=>request('message',{method:'POST',body:{message,simulation:true}});
 return {request,message,server,base,cookie};
}
test('INDIA owner approval and browser cost confirmation are distinct gates; no permit means no real calls',async t=>{
 const f=await fixture(t);const s=await f.request('status');
 assert.equal(s.body.assistantName,'INDIA');assert.equal(s.body.real.available,false);assert.equal(s.body.real.authorized,false);
 assert.equal((await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}})).status,403);
 const r=await f.message('Bonjour');assert.equal(r.body.source,'simulation');assert.match(r.body.reply,/INDIA/);assert.equal(r.body.openaiEnabled,false);
 for(const field of ['real','permit','provider','apiKey','authorizeReal'])assert.equal((await f.request('message',{method:'POST',body:{message:'Bonjour',simulation:false,[field]:true}})).status,400);
});

test('all five administrative dialogues are brief, sourced and continue from a profile answer',async t=>{
 const f=await fixture(t);
 for(const message of ['CNI','Extrait de naissance','Casier judiciaire','Passeport ivoirien','Permis de conduire']){
  await f.request('conversation',{method:'DELETE'});
  const r=await f.message(message);assert.equal(r.status,200);assert.equal(r.body.source,'documentation');
  assert.ok(r.body.reply.length<1200);assert.match(r.body.reply,/confirmer/i);assert.ok(r.body.documentaryDetails.length>r.body.reply.length);assert.ok(r.body.sources.length);
  const profile=await f.message('première demande');assert.equal(profile.body.source,'documentation');assert.ok(profile.body.reply.length<1200);
  const adult=await f.message('adulte');assert.equal(adult.body.source,'documentation');assert.ok(adult.body.displayedFactPaths.length<=1);
 }
 await f.request('conversation',{method:'DELETE'});
 await f.message('Passeport pour ma fille de 12 ans');await f.message('Merci');
 const limited=await f.message('continue');assert.equal(limited.body.knowledge.status,'insufficient_scope');assert.deepEqual(limited.body.displayedFactPaths,[]);
});

function realOptions(root,provider){
 const expiry=new Date(Date.now()+299000).toISOString();
 return {realConfig:{...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-injected-provider-only',soulPath:path.join(project,'soul.md')},realPermit:{version:1,id:'fd407a27-fd35-45bf-941e-3308bd18da9f',approved:true,model:'gpt-6.1-terra',expiresAt:expiry,maxRequests:3,durationSeconds:300,sessionCapNano:150000000},indiaProvider:provider};
}
test('a synthetic future grant exercises real controller wiring and preserves estimates after deletion without external calls',async t=>{
 const inputs=[];const provider=async q=>{inputs.push(q);return {reply:inputs.length===1?'Bonjour, je suis INDIA. Quel est votre objectif ?':'Vous souhaitez organiser votre semaine. Quel jour voulez-vous commencer ?',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}};};
 const f=await fixture(t,root=>realOptions(root,provider));
 assert.equal((await f.request('status')).body.real.available,true);assert.equal(inputs.length,0);
 const auth=await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}});assert.equal(auth.status,200);assert.equal(inputs.length,0,'Consent alone must not dispatch a question');
 const first=await f.message('Explique comment organiser ma semaine');assert.equal(first.body.source,'openai');assert.equal(first.body.mode,'ai');assert.equal(first.body.openaiEnabled,true);assert.ok(first.body.cost.sessionEstimateUsd>0);
 const next=await f.message('Je souhaite commencer lundi');assert.equal(next.body.source,'openai');assert.ok(inputs[1].input.some(m=>m.role==='user'&&m.content.includes('organiser ma semaine')));assert.match(inputs[0].instructions,/INDIA/);
 const deleted=await f.request('conversation',{method:'DELETE'});assert.equal(deleted.body.real.authorized,false);assert.equal(deleted.body.cost.sessionEstimateUsd,next.body.cost.sessionEstimateUsd);
 assert.equal((await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}})).status,403);
 assert.equal((await f.message('Bonjour')).body.source,'session');assert.equal(inputs.length,2);
 assert.equal((await f.request('local-mode',{method:'POST',body:{enabled:true}})).status,200);
 const local=await f.message('Bonjour');assert.equal(local.body.source,'rules');assert.equal(local.body.cost.estimateUsd,0);assert.equal(inputs.length,2);
});

test('a reported emergency interrupts an in-flight synthetic model reply rather than returning busy',async t=>{
 let entered,release;const started=new Promise(r=>entered=r);
 const provider=async()=>{entered();return await new Promise(r=>release=()=>r({reply:'Réponse tardive.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}}));};
 const f=await fixture(t,root=>realOptions(root,provider));
 assert.equal((await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}})).status,200);
 const pending=f.message('Explique comment organiser ma semaine');await started;
 const danger=await f.message('Accident avec des blessés');assert.equal(danger.status,200);assert.equal(danger.body.answerType,'protected_protocol');assert.equal(danger.body.source,'rules');assert.equal(danger.body.real.authorized,false);assert.ok(danger.body.actions.some(a=>a.number==='180'));
 release();assert.equal((await pending).status,409);
});

test('birth-copy and criminal-record questions do not invent a renewal procedure',async t=>{
 const f=await fixture(t);
 const criminal=await f.message('Casier judiciaire');assert.match(criminal.body.reply,/adulte.*mineur/i);assert.doesNotMatch(criminal.body.reply,/renouvellement/i);
 await f.request('conversation',{method:'DELETE'});
 const birth=await f.message('Extrait de naissance');assert.match(birth.body.reply,/déjà enregistré/i);assert.doesNotMatch(birth.body.reply,/renouvellement/i);
 const yes=await f.message('oui');assert.equal(yes.body.source,'documentation');assert.equal(yes.body.displayedFactPaths.length,1);
 await f.request('conversation',{method:'DELETE'});await f.message('Extrait de naissance');
 const no=await f.message('non');assert.equal(no.body.knowledge.status,'insufficient_scope');assert.deepEqual(no.body.displayedFactPaths,[]);
});

test('a delayed cost confirmation cannot rearm a real lease after erasure has acknowledged success',async t=>{
 const f=await fixture(t,root=>realOptions(root,async()=>{throw Error('provider must not run');}));
 let entered;const started=new Promise(r=>entered=r);f.server.once('request',()=>entered());let req;
 const pending=new Promise((resolve,reject)=>{req=http.request(f.base+'/api/private-test/real-session',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie:f.cookie}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"acknowledgeCost":');});
 await started;assert.equal((await f.request('conversation',{method:'DELETE'})).status,200);req.end('true}');
 assert.equal(await pending,409);assert.equal((await f.request('status')).body.real.authorized,false);
});

test('confirming a real lease never converts an already arriving free message into a paid request',async t=>{
 let calls=0;const f=await fixture(t,root=>realOptions(root,async()=>{calls++;return {reply:'Bonjour.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}};}));
 let entered;const started=new Promise(r=>entered=r);f.server.once('request',()=>entered());let req;
 const pending=new Promise((resolve,reject)=>{req=http.request(f.base+'/api/private-test/message',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie:f.cookie}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"message":');});
 await started;assert.equal((await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}})).status,200);req.end('"Explique comment organiser ma semaine","simulation":true}');
 assert.equal(await pending,409);assert.equal(calls,0);
});

test('an emergency still interrupts the model when a second incomplete message occupies the other slot',async t=>{
 let entered,release;const started=new Promise(r=>entered=r);
 const f=await fixture(t,root=>realOptions(root,async()=>{entered();return await new Promise(r=>release=()=>r({reply:'Tardif.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}}));}));
 await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}});const model=f.message('Explique comment organiser ma semaine');await started;
 let uploadStarted;const uploading=new Promise(r=>uploadStarted=r);f.server.once('request',()=>uploadStarted());let req;
 const partial=new Promise(resolve=>{req=http.request(f.base+'/api/private-test/message',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie:f.cookie}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));res.on('error',()=>resolve('reset'));});req.on('error',()=>resolve('reset'));req.write('{"message":');});
 await uploading;
 try{const danger=await f.message('Accident avec des blessés');assert.equal(danger.status,200);assert.equal(danger.body.answerType,'protected_protocol');assert.ok(danger.body.actions.some(a=>a.number==='180'));}
 finally{release();if(!req.destroyed)req.end('"Bonjour","simulation":false}');}
 await partial;assert.equal((await model).status,409);
});

test('a sensitive boundary cancels a pending model and revokes its general context',async t=>{
 let entered,release;const started=new Promise(r=>entered=r);
 const f=await fixture(t,root=>realOptions(root,async()=>{entered();return await new Promise(r=>release=()=>r({reply:'Tardif.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}}));}));
 await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}});const pending=f.message('Explique comment organiser ma semaine');await started;
 try{const boundary=await f.message('Quelle dose de paracétamol ?');assert.equal(boundary.status,200);assert.equal(boundary.body.answerType,'safety_orientation');assert.equal(boundary.body.real.authorized,false);}
 finally{release();}
 assert.equal((await pending).status,409);
});

for(const failure of ['throw','unsafe','timeout'])test('a '+failure+' provider attempt cannot retain a false simulation no-call warning',async t=>{
 let calls=0;
 const f=await fixture(t,root=>{const o=realOptions(root,async()=>{calls++;if(failure==='throw')throw Error('synthetic');if(failure==='timeout')return await new Promise(()=>{});return {reply:'https://invented.invalid/',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}};});o.realConfig.timeoutMs=20;return o;});
 await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}});const r=await f.message('Explique comment organiser ma semaine');
 assert.equal(calls,1);assert.equal(r.body.source,'session');assert.equal(r.body.blocked,true);assert.ok(r.body.cost.estimateUsd>0);assert.ok(r.body.cost.sessionEstimateUsd>0);assert.doesNotMatch(r.body.warnings.join(' '),/aucun appel.*OpenAI/i);
});

test('a completed general exchange is not resumed across a deterministic sensitive boundary',async t=>{
 let calls=0;const f=await fixture(t,root=>realOptions(root,async()=>{calls++;return {reply:'Bonjour, je suis INDIA.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}};}));
 await f.request('real-session',{method:'POST',body:{acknowledgeCost:true}});assert.equal((await f.message('Parlons de lecture')).body.source,'openai');
 const boundary=await f.message('Quelle dose de paracétamol ?');assert.equal(boundary.body.answerType,'safety_orientation');assert.equal(boundary.body.real.authorized,false);
 assert.notEqual((await f.message('Explique comment organiser ma semaine')).body.source,'openai');assert.equal(calls,1);
});

for(const boundary of ['Accident avec des blessés','Quelle dose de paracétamol ?','Où trouver un commissariat à Cocody ?','CNI','première demande'])test('a delayed unused confirmation is invalidated by boundary: '+boundary,async t=>{
 let calls=0;const f=await fixture(t,root=>realOptions(root,async()=>{calls++;throw Error('No call allowed');}));
 if(boundary==='première demande')await f.message('CNI');
 let entered;const started=new Promise(r=>entered=r);f.server.once('request',()=>entered());let req;
 const pending=new Promise((resolve,reject)=>{req=http.request(f.base+'/api/private-test/real-session',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie:f.cookie}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"acknowledgeCost":');});
 await started;assert.equal((await f.message(boundary)).status,200);req.end('true}');
 assert.equal(await pending,409);assert.equal((await f.request('status')).body.real.authorized,false);assert.equal(calls,0);
});
