import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from '../server.js';
import {createPrivateTestGateway} from '../lib/private-test.js';
import {readAIConfig} from '../lib/ai/config.js';
const project=path.resolve(import.meta.dirname,'..');
async function fixture(t,options={}){
 const root=await mkdtemp('/Users/assane/.hermes/cache/scratch/india-citizen-http-');
 const gateway=await createPrivateTestGateway({root,knowledgeDir:path.join(project,'knowledge'),...(typeof options==='function'?options(root):options)});
 const server=createServer({privateTestGateway:gateway,aiConfig:readAIConfig({},project)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 const login=await fetch(base+'/api/private-test/login',{method:'POST',headers:{Origin:base,'x-private-test':'1','Content-Type':'application/json'},body:JSON.stringify(access)});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api/private-test/'+route,{method,headers:{Origin:base,'x-private-test':'1','Content-Type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 return {root,base,request,message:async message=>(await request('message','POST',{message,simulation:false})).body};
}
test('dialogue memory is owner-isolated, cannot be supplied by HTTP and is erased with the conversation',async t=>{
 const f=await fixture(t);await f.message('CNI renouvellement');await f.message('Elle est expirée.');
 const key=JSON.parse(await readFile(path.join(f.root,'var/private-test-access.json'),'utf8'));const headers={Origin:f.base,'x-private-test':'1','Content-Type':'application/json'};
 const login=await fetch(f.base+'/api/private-test/login',{method:'POST',headers,body:JSON.stringify(key)});const cookie=login.headers.get('set-cookie').split(';')[0];
 const isolated=await fetch(f.base+'/api/private-test/message',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({message:'Elle est expirée.',simulation:false})});assert.equal((await isolated.json()).dialogue.procedureId,undefined);
 for(const field of ['citizenContext','citizenState','mission'])assert.equal((await f.request('message','POST',{message:'Bonjour',simulation:false,[field]:{procedureId:'cni'}})).status,400);
 assert.equal((await f.request('conversation','DELETE')).status,200);assert.equal((await f.message('Et le délai ?')).dialogue.procedureId,undefined);
});

test('a new unsupported administrative topic never inherits the former CNI identity',async t=>{
 const f=await fixture(t);await f.message('CNI renouvellement');await f.message('Elle est expirée.');
 const visa=await f.message('Quelles pièces pour obtenir un visa ?');assert.equal(visa.answerType,'official_information');assert.equal(visa.dialogue.procedureId,undefined);assert.equal(visa.dialogue.reason,undefined);assert.doesNotMatch(visa.reply,/CNI/i);assert.deepEqual(visa.sources,[]);
 await f.request('conversation','DELETE');const cleared=await f.message('Elle est expirée.');assert.equal(cleared.dialogue.procedureId,undefined);
});

test('a missing documentary corpus does not erase the known CNI request or fabricate references',async t=>{
 const f=await fixture(t,root=>({knowledgeDir:path.join(root,'absent-knowledge')}));
 const first=await f.message('Je veux renouveler ma CNI.');assert.equal(first.dialogue.procedureId,'cni');assert.equal(first.dialogue.application,'renewal');assert.doesNotMatch(first.reply,/autre démarche/i);
 const next=await f.message('Elle est expirée.');assert.equal(next.dialogue.reason,'expired');assert.equal(next.source,'rules');assert.deepEqual(next.sources,[]);assert.equal(next.knowledge,undefined);assert.match(next.reply,/CNI expirée/i);
});

test('a normalized emergency clears administrative context before any conversational continuation',async t=>{
 const f=await fixture(t);await f.message('CNI renouvellement');await f.message('Elle est expirée.');
 const urgent=await f.message('Accidan avec des blesés');assert.equal(urgent.source,'rules');assert.ok(urgent.actions.some(a=>a.number==='180'));assert.equal(urgent.dialogue.mission,'urgences');assert.equal(urgent.dialogue.procedureId,undefined);assert.equal(urgent.dialogue.reason,undefined);assert.equal(urgent.cost.estimateUsd,0);
});

test('the existing paid gate receives only a bounded citizen context, never an administrative generation',async t=>{
 const captured=[];const f=await fixture(t,root=>({realConfig:{...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-citizen-test-only',soulPath:path.join(project,'soul.md')},realPermit:{version:1,id:randomUUID(),approved:true,model:'gpt-6.1-terra',expiresAt:new Date(Date.now()+600000).toISOString(),maxRequests:3,durationSeconds:300,sessionCapNano:150000000},indiaProvider:async q=>{captured.push(q);return {reply:'Quel point de prévention citoyenne souhaitez-vous clarifier ?',contactIds:[],toolCalls:[],usage:{inputTokens:1000,outputTokens:25}};}}));
 assert.equal((await f.request('real-session','POST',{acknowledgeCost:true})).status,200);assert.equal(captured.length,0);
 assert.equal((await f.message('Donne une recette de riz.')).answerType,'scope_orientation');assert.equal(captured.length,0);
 const prevention=await f.message('Comment sensibiliser mon quartier à la prévention ?');assert.equal(prevention.source,'openai');assert.equal(captured.length,1);assert.match(captured[0].instructions,/Contexte citoyen borné/);assert.match(captured[0].instructions,/"mission":"prevention"/);assert.match(captured[0].instructions,/quatre missions/i);assert.equal(prevention.real.maxRequests,3);
 const doc=await f.message('Je voudrais renouveler ma CNI.');assert.equal(doc.source,'documentation');assert.equal(doc.real.authorized,false);assert.equal(captured.length,1);assert.equal(doc.cost.estimateUsd,0);assert.equal(doc.real.endReason,'administrative_boundary');
});

test('mission follow-ups are connected to the private HTTP path and out-of-scope requests are redirected locally',async t=>{
 const f=await fixture(t);await f.message('CNI');
 const first=await f.message('Nouveau sujet : comment prévenir les arnaques en ligne ?');assert.equal(first.dialogue.mission,'prevention');assert.equal(first.dialogue.topic,'online_safety');assert.equal(first.dialogue.procedureId,undefined);assert.doesNotMatch(first.reply,/CNI|première demande/i);
 const next=await f.message('Et pour les enfants ?');assert.equal(next.dialogue.topic,'online_safety');assert.equal(next.dialogue.audience,'children');assert.match(next.reply,/enfants/i);
 const alert=await f.message('Je veux vérifier une alerte dans mon quartier.');assert.equal(alert.dialogue.mission,'alertes');assert.match(alert.reply,/ne.*(?:vérifier|vérifiée|temps réel)|pas.*(?:temps réel|vérifiée)/i);
 const outside=await f.message('Donne une recette de riz.');assert.equal(outside.answerType,'scope_orientation');assert.equal(outside.source,'rules');assert.match(outside.reply,/citoyenne.*prévention.*urgences.*alertes/i);assert.equal(outside.cost.estimateUsd,0);
});

test('CNI renewal keeps its subject and expiry reason through natural follow-ups without inventing facts',async t=>{
 const f=await fixture(t);const first=await f.message('Je voudrais renouveler ma CNI.');
 assert.equal(first.source,'documentation');assert.doesNotMatch(first.reply,/autre démarche/i);assert.match(first.reply,/expirée|perdue|détériorée/i);
 const next=await f.message('Elle est expirée depuis quelques semaines.');
 assert.equal(next.source,'documentation');assert.equal(next.dialogue.procedureId,'cni');assert.equal(next.dialogue.application,'renewal');assert.equal(next.dialogue.reason,'expired');assert.match(next.reply,/CNI expirée/i);
 const yes=await f.message('Oui, je veux préparer ma question.');assert.equal(yes.dialogue.reason,'expired');assert.doesNotMatch(yes.reply,/première demande|autre démarche/i);
 const delay=await f.message('Et le délai ?');assert.equal(delay.source,'documentation');assert.equal(delay.dialogue.reason,'expired');assert.match(delay.reply,/délai.*confirm|confirm.*délai/i);assert.ok(delay.knowledge.facts.every(f=>f.section==='uncertainties'));assert.deepEqual(delay.displayedFactPaths,[]);assert.ok(delay.sources.length);assert.equal(delay.cost.estimateUsd,0);assert.equal(delay.real.authorized,false);
});
