import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';
import {createServer} from '../server.js';import {createPrivateTestGateway} from '../lib/private-test.js';import {readAIConfig} from '../lib/ai/config.js';
const project=path.resolve(import.meta.dirname,'..');
async function fixture(t,options={}){
 const root=await mkdtemp('/Users/assane/.hermes/cache/scratch/india-fluidity-');let calls=0;
 const gateway=await createPrivateTestGateway({root,knowledgeDir:path.join(project,'knowledge'),indiaProvider:async()=>{calls++;throw Error('Unexpected provider');},...options});
 const server=createServer({privateTestGateway:gateway,aiConfig:readAIConfig({},project)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8')),headers={Origin:base,'x-private-test':'1','Content-Type':'application/json'};
 const login=await fetch(base+'/api/private-test/login',{method:'POST',headers,body:JSON.stringify(access)}),cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api/private-test/'+route,{method,headers:{...headers,cookie},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 return {root,request,calls:()=>calls,message:async message=>(await request('message','POST',{message,simulation:false})).body};
}
test('a correction keeps the request but cannot reuse loss-specific facts for an expired card',async t=>{
 const f=await fixture(t);await f.message('J’ai perdu ma CNI.');assert.equal((await f.message('Elle était biométrique.')).knowledge.facts[0].id,'loss-declaration');await f.message('Continue');
 const corrected=await f.message('Non, elle n’est pas perdue, elle est expirée.');assert.equal(corrected.dialogue.reason,'expired');assert.equal(corrected.dialogue.cniVariant,'expiration');assert.equal(corrected.knowledge.facts[0].id,'renew-title');assert.doesNotMatch(corrected.reply,/CNI perdue/);
 assert.equal((await f.message('Quelles pièces ?')).knowledge.facts[0].id,'renew-birth');assert.equal(f.calls(),0);
});

test('an explicit new mission resets documentary progress; urgent help remains first and erasure resets memory',async t=>{
 const f=await fixture(t);await f.message('Ma CNI est expirée.');await f.message('Oui');
 const prevention=await f.message('Nouveau sujet : comment sensibiliser à la prévention routière ?');assert.equal(prevention.dialogue.mission,'prevention');assert.equal(prevention.dialogue.procedureId,undefined);
 assert.equal((await f.message('Ma CNI est expirée.')).knowledge.facts[0].id,'renew-title');
 const urgent=await f.message('Accident avec des blessés');assert.equal(urgent.source,'rules');assert.ok(urgent.actions.some(a=>a.number==='180'));assert.equal(urgent.knowledge,undefined);assert.equal(urgent.dialogue.procedureId,undefined);
 assert.equal((await f.request('conversation','DELETE')).status,200);assert.equal((await f.message('Ma CNI est expirée.')).knowledge.facts[0].id,'renew-title');assert.equal(f.calls(),0);
});

test('a targeted question already covered asks for clarification instead of duplicating its fact',async t=>{
 const f=await fixture(t);await f.message('Le certificat de nationalité est-il obligatoire pour le renouvellement de ma CNI ?');
 const repeated=await f.message('Le certificat de nationalité est-il obligatoire pour le renouvellement de ma CNI ?');assert.deepEqual(repeated.knowledge.facts,[]);assert.match(repeated.reply,/déjà vu.*point|précision/i);assert.ok(repeated.sources.length);
 assert.equal((await f.message('Continue')).knowledge.facts[0].id,'renew-title');
});

test('progress identifiers stay server-side and HTTP cannot mark unseen source points as read',async t=>{
 const f=await fixture(t),first=await f.message('Ma CNI est expirée.');assert.equal(first.seenFactIds,undefined);assert.equal(first.dialogue.cniSeen,undefined);
 assert.equal((await f.request('message','POST',{message:'Oui',simulation:false,cniSeen:['renew-birth']})).status,400);
 const next=await f.message('Oui');assert.equal(next.knowledge.facts[0].id,'renew-birth');assert.equal(next.cost.estimateUsd,0);
});

test('thanks do not consume a fact and a bare yes after an unknown answer requests clarification',async t=>{
 const f=await fixture(t);await f.message('Ma CNI est expirée.');const thanks=await f.message('Merci beaucoup');assert.deepEqual(thanks.knowledge.facts,[]);assert.match(thanks.reply,/en prie|garde votre démarche/i);
 const next=await f.message('Oui');assert.equal(next.knowledge.facts[0].id,'renew-birth');
 const fees=await f.message('Quel est le tarif ?');assert.match(fees.reply,/\?/);assert.deepEqual(fees.knowledge.facts,[]);
 const yes=await f.message('Oui');assert.deepEqual(yes.knowledge.facts,[]);assert.match(yes.reply,/question précise|préciser/i);assert.equal(yes.dialogue.reason,'expired');
 assert.equal((await f.message('Continue')).knowledge.facts[0].id,'renew-nationality-dispute');assert.equal(f.calls(),0);
});

test('repeated section questions and an unknown fee never restart already presented CNI facts',async t=>{
 const f=await fixture(t),ids=[];ids.push((await f.message('Ma CNI est expirée.')).knowledge.facts[0].id);
 ids.push((await f.message('Quelles pièces ?')).knowledge.facts[0].id);assert.equal(ids[1],'renew-birth');
 const unknown=await f.message('Quel est le tarif ?');assert.deepEqual(unknown.knowledge.facts,[]);assert.match(unknown.reply,/aucun tarif actuel/i);
 ids.push((await f.message('Continue')).knowledge.facts[0].id);ids.push((await f.message('Les pièces')).knowledge.facts[0].id);
 assert.deepEqual(ids,['renew-title','renew-birth','renew-nationality-dispute','receipt']);assert.equal(new Set(ids).size,ids.length);
 const ended=await f.message('Continue');assert.deepEqual(ended.knowledge.facts,[]);assert.match(ended.reply,/pas d’autre|parcouru|précis/i);assert.equal(ended.dialogue.reason,'expired');
});

test('private CNI transitions name the next useful topic and finish the available selection without a continue loop',async t=>{
 const f=await fixture(t),first=await f.message('Ma CNI est expirée.');assert.equal(first.knowledge.facts[0].id,'renew-title');assert.doesNotMatch(first.reply,/Souhaitez-vous continuer/i);assert.match(first.reply,/naissance.*\?/i);
 const second=await f.message('Oui');assert.equal(second.knowledge.facts[0].id,'renew-birth');assert.match(second.reply,/nationalité.*\?/i);
 const third=await f.message('Continue');assert.equal(third.knowledge.facts[0].id,'renew-nationality-dispute');assert.match(third.reply,/enrôlement.*\?/i);
 const last=await f.message('La suite');assert.equal(last.knowledge.facts[0].id,'receipt');assert.match(last.reply,/points disponibles|points de cette sélection/i);assert.doesNotMatch(last.reply,/Souhaitez-vous continuer/i);assert.equal(f.calls(),0);
});
