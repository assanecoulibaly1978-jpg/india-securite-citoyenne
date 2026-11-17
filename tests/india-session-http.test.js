import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,unlink,symlink} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import http from 'node:http';
import {createServer} from '../server.js';import {createPrivateTestGateway} from '../lib/private-test.js';import {readAIConfig} from '../lib/ai/config.js';
const project=path.resolve(import.meta.dirname,'..');
async function fixture(t){
 const root=await mkdtemp('/Users/assane/.hermes/cache/scratch/india-session-http-');let now=new Date('2026-11-13T10:00:00.000Z'),calls=0;
 const gateway=await createPrivateTestGateway({root,clock:()=>now,knowledgeDir:path.join(project,'knowledge'),realConfig:{...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-session-http-only',soulPath:path.join(project,'soul.md')},realPermit:{version:1,id:randomUUID(),approved:true,model:'gpt-6.1-terra',expiresAt:'2026-11-13T11:00:00.000Z',maxRequests:3,durationSeconds:300,sessionCapNano:150000000},indiaProvider:async()=>{calls++;return {reply:'Voici une idée simple pour organiser votre journée.',contactIds:[],toolCalls:[],usage:{inputTokens:1000,outputTokens:25}};}});
 const server=createServer({privateTestGateway:gateway,clock:()=>now,aiConfig:readAIConfig({},project)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;const access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 const login=await fetch(base+'/api/private-test/login',{method:'POST',headers:{Origin:base,'x-private-test':'1','Content-Type':'application/json'},body:JSON.stringify(access)});const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,method='GET',body)=>{const r=await fetch(base+'/api/private-test/'+route,{method,headers:{Origin:base,'x-private-test':'1',cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const message=text=>request('message','POST',{message:text,simulation:true});return {root,base,request,message,cookie,server,calls:()=>calls,setTime:value=>now=new Date(value)};
}
test('expired general turn is a session notice, not a silently substituted rules/simulation answer',async t=>{
 const f=await fixture(t);await f.request('real-session','POST',{acknowledgeCost:true});await f.message('Bonjour');const second=await f.message('Développe cette idée');
 f.setTime('2026-11-13T10:05:01.000Z');const third=await f.message('Résume notre échange');
 assert.equal(third.body.source,'session');assert.equal(third.body.answerType,'session_ended');assert.equal(third.body.blocked,true);assert.equal(third.body.real.endReason,'expired');assert.equal(third.body.real.usedRequests,2);assert.equal(third.body.real.remainingRequests,1);assert.equal(third.body.cost.estimateUsd,0);assert.equal(third.body.cost.sessionEstimateUsd,second.body.cost.sessionEstimateUsd);assert.doesNotMatch(third.body.reply,/assistant automatique à règles/);assert.equal(f.calls(),2);
 const again=await f.message('Un autre sujet général');assert.equal(again.body.source,'session');assert.equal(again.body.real.endReason,'expired');
 const bad=await f.request('local-mode','POST',{enabled:true,model:'untrusted'});assert.equal(bad.status,400);
 const selected=await f.request('local-mode','POST',{enabled:true});assert.equal(selected.status,200);assert.equal(selected.body.localGeneralAllowed,true);assert.equal(f.calls(),2);
 const local=await f.message('Un autre sujet général');assert.equal(local.body.source,'rules');assert.equal(local.body.cost.estimateUsd,0);assert.equal(local.body.cost.sessionEstimateUsd,second.body.cost.sessionEstimateUsd);assert.equal(local.body.real.endReason,'expired');assert.equal(f.calls(),2);
});
test('urgent and documentary routes remain free and immediate after real expiry without choosing local mode',async t=>{
 const f=await fixture(t);await f.request('real-session','POST',{acknowledgeCost:true});await f.message('Bonjour');f.setTime('2026-11-13T10:05:01.000Z');
 const doc=await f.message('CNI');assert.equal(doc.body.source,'documentation');assert.equal(doc.body.cost.estimateUsd,0);assert.ok(doc.body.sources.length);
 const urgent=await f.message('Accident avec des blessés');assert.equal(urgent.body.source,'rules');assert.ok(urgent.body.actions.some(a=>a.number==='180'));assert.equal(urgent.body.cost.estimateUsd,0);assert.equal(f.calls(),1);
});
test('third response retains real provenance while quota closure blocks the fourth general question',async t=>{
 const f=await fixture(t);await f.request('real-session','POST',{acknowledgeCost:true});let third;for(let i=0;i<3;i++)third=await f.message('Une idée pour ma journée');
 assert.equal(third.body.source,'openai');assert.equal(third.body.openaiEnabled,true);assert.equal(third.body.real.available,false);assert.equal(third.body.real.authorized,false);assert.equal(third.body.real.state,'ended');assert.equal(third.body.real.endReason,'quota_exhausted');assert.equal(third.body.real.usedRequests,3);
 const fourth=await f.message('Encore');assert.equal(fourth.body.source,'session');assert.equal(fourth.body.real.endReason,'quota_exhausted');assert.equal(fourth.body.cost.estimateUsd,0);assert.equal(f.calls(),3);
});

test('an explicit local choice invalidates a delayed real-cost confirmation without dispatch',async t=>{
 const f=await fixture(t);let entered;const started=new Promise(r=>entered=r);f.server.once('request',()=>entered());let request;
 const delayed=new Promise((resolve,reject)=>{request=http.request(f.base+'/api/private-test/real-session',{method:'POST',headers:{Origin:f.base,'x-private-test':'1','Content-Type':'application/json',cookie:f.cookie}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);request.write('{"acknowledgeCost":');});
 await started;assert.equal((await f.request('local-mode','POST',{enabled:true})).status,200);request.end('true}');
 assert.equal(await delayed,409);assert.equal((await f.request('status')).body.real.authorized,false);assert.equal(f.calls(),0);
});

test('an unavailable audit never blocks urgent routing or writes through a hostile link',async t=>{
 const f=await fixture(t);await f.request('real-session','POST',{acknowledgeCost:true});await f.message('Bonjour');
 const file=path.join(f.root,'var/india-session-events.jsonl'),outside=path.join(f.root,'external-sentinel');await writeFile(outside,'unchanged',{mode:0o600});await unlink(file);await symlink(outside,file);
 const urgent=await f.message('Accident avec des blessés');assert.equal(urgent.status,200);assert.equal(urgent.body.source,'rules');assert.ok(urgent.body.actions.some(a=>a.number==='180'));assert.equal(urgent.body.real.authorized,false);assert.equal(urgent.body.real.auditAvailable,false);assert.equal(f.calls(),1);assert.equal(await readFile(outside,'utf8'),'unchanged');
});
