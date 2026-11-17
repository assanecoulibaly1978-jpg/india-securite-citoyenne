import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,unlink,symlink} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createServer} from '../server.js';import {createPrivateTestGateway} from '../lib/private-test.js';import {readAIConfig} from '../lib/ai/config.js';
import {createCniReference} from '../lib/ai/cni-reference.js';
const project=path.resolve(import.meta.dirname,'..');
async function fixture(t,options={}){
 const root=await mkdtemp('/Users/assane/.hermes/cache/scratch/india-cni-reference-');let calls=0;
 const gateway=await createPrivateTestGateway({root,knowledgeDir:path.join(project,'knowledge'),indiaProvider:async()=>{calls++;throw Error('No provider call expected');},...(typeof options==='function'?options(root):options)});
 const server=createServer({privateTestGateway:gateway,aiConfig:readAIConfig({},project)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,access=JSON.parse(await readFile(path.join(root,'var/private-test-access.json'),'utf8'));
 const headers={Origin:base,'x-private-test':'1','Content-Type':'application/json'};
 const login=await fetch(base+'/api/private-test/login',{method:'POST',headers,body:JSON.stringify(access)}),cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,method='GET',body)=>{const r=await fetch(base+'/api/private-test/'+route,{method,headers:{...headers,cookie},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 return {root,request,message:async message=>(await request('message','POST',{message,simulation:false})).body,calls:()=>calls};
}
for(const [question,word] of [['Quel est le tarif ?','tarif'],['Et le délai ?','délai']])test('CNI does not fabricate the unconfirmed '+word,async t=>{
 const f=await fixture(t);await f.message('CNI renouvellement');await f.message('Elle est expirée.');const r=await f.message(question);assert.deepEqual(r.knowledge.facts,[]);assert.match(r.reply,/aucun.*confirmé/i);assert.doesNotMatch(r.reply,/5\s?000|45 jours|gratuit/i);assert.equal(r.knowledge.cniReference.feesConfirmed,false);assert.equal(r.knowledge.cniReference.timelinesConfirmed,false);
});
for(const attack of ['corrupt','symlink'])test('CNI source reader refuses '+attack+' reference without weakening the pin',async t=>{
 const dir=await mkdtemp('/Users/assane/.hermes/cache/scratch/cni-pin-');t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'cni-reference.json'),original=await readFile(path.join(project,'knowledge/cni-reference.json'));await writeFile(file,original);
 const reader=createCniReference({dir});assert.ok(reader.reply({variant:'renewal'}));
 if(attack==='corrupt')await writeFile(file,original.toString().replace('nationalité','autre exigence'));
 else{const target=path.join(dir,'target.json');await writeFile(target,original);await unlink(file);await symlink(target,file);}
 assert.equal(reader.reply({variant:'renewal'}),null);assert.equal(createCniReference({dir:path.join(dir,'absent')}).reply({variant:'renewal'}),null);
});
test('CNI references and urgency remain free even with a synthetic paid lease explicitly authorized',async t=>{
 const f=await fixture(t,root=>({realConfig:{...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-cni-only',soulPath:path.join(project,'soul.md')},realPermit:{version:1,id:randomUUID(),approved:true,model:'gpt-6.1-terra',expiresAt:new Date(Date.now()+600000).toISOString(),maxRequests:3,durationSeconds:300,sessionCapNano:150000000}}));
 assert.equal((await f.request('real-session','POST',{acknowledgeCost:true})).status,200);await f.message('CNI renouvellement');const doc=await f.message('Quelles pièces ?');assert.equal(doc.source,'documentation');assert.equal(doc.real.usedRequests,0);assert.equal(doc.cost.estimateUsd,0);
 const urgent=await f.message('Accident avec des blessés');assert.equal(urgent.source,'rules');assert.ok(urgent.actions.some(a=>a.number==='180'));assert.equal(urgent.knowledge,undefined);assert.equal(urgent.dialogue.procedureId,undefined);assert.equal(f.calls(),0);
});

test('an acknowledgment cannot turn an explicitly naturalized first application into the ordinary profile',async t=>{
 const f=await fixture(t);await f.message('Première demande de CNI pour un adulte naturalisé.');await f.message('Oui');const r=await f.message('Les pièces ?');assert.deepEqual(r.knowledge.facts,[]);assert.deepEqual(r.displayedFactPaths,[]);assert.match(r.reply,/situation particulière|couvre pas/i);
});

test('renewal for an explicitly underage or naturalized applicant never receives the ordinary reference list',async t=>{
 for(const message of ['Renouvellement de CNI pour ma fille de 12 ans : quelles pièces ?','Renouvellement de ma CNI, je suis naturalisé : quelles pièces ?']){
  const f=await fixture(t);const r=await f.message(message);assert.deepEqual(r.knowledge.facts,[]);assert.deepEqual(r.displayedFactPaths,[]);assert.match(r.reply,/situation particulière|couvre pas/i);
 }
});

test('loss abroad cannot inherit the domestic biometrical duplicata list through a short follow-up',async t=>{
 const f=await fixture(t);await f.message('J’ai perdu ma CNI à l’étranger.');const r=await f.message('Elle était biométrique.');assert.deepEqual(r.knowledge.facts,[]);assert.deepEqual(r.displayedFactPaths,[]);assert.match(r.reply,/situation particulière|couvre pas/i);
});

test('renewal nationality disagreement is shown as a disagreement, never a waiver or universal requirement',async t=>{
 const f=await fixture(t);const r=await f.message('Le certificat de nationalité est-il obligatoire pour le renouvellement de ma CNI ?');
 assert.equal(r.knowledge.facts[0].id,'renew-nationality-dispute');assert.equal(r.knowledge.facts[0].sourceStatus,'divergent');assert.match(r.reply,/omission ne prouve pas une dispense/i);assert.deepEqual(r.knowledge.facts[0].source_ids,[14,5,15]);
});

test('first CNI asks the covered profile, then serves dated partial facts and preserves the parental-document divergence',async t=>{
 const f=await fixture(t);const initial=await f.message('Première demande de CNI pour un adulte.');assert.equal(initial.dialogue.awaiting,'first_scope');assert.deepEqual(initial.displayedFactPaths,[]);assert.match(initial.reply,/né.*Côte d’Ivoire/i);
 const yes=await f.message('Oui, je suis ivoirien d’origine né en Côte d’Ivoire.');assert.equal(yes.knowledge.cniReference.variant,'first');assert.equal(yes.knowledge.facts[0].id,'first-birth');assert.equal(yes.knowledge.facts[0].sources[0].consulted_on,'2026-11-16');
 const next=await f.message('Continue');assert.equal(next.knowledge.facts[0].id,'first-nationality');
 const parent=await f.message('Et la CNI d’un parent est-elle obligatoire ?');assert.equal(parent.knowledge.facts[0].id,'first-parent-dispute');assert.equal(parent.knowledge.facts[0].sourceStatus,'divergent');assert.match(parent.reply,/pas établi|diverg|réserve/i);assert.equal(parent.knowledge.confirmationRequired,true);
});

test('loss is distinguished from a first application and asks the card format before duplicata references',async t=>{
 const f=await fixture(t);const initial=await f.message('J’ai perdu ma CNI.');assert.equal(initial.dialogue.cniVariant,'loss');assert.equal(initial.dialogue.awaiting,'card_format');assert.match(initial.reply,/biométrique|modèle/i);assert.deepEqual(initial.displayedFactPaths,[]);
 const card=await f.message('C’était une carte biométrique.');assert.equal(card.knowledge.cniReference.variant,'loss');assert.equal(card.knowledge.facts[0].id,'loss-declaration');assert.doesNotMatch(card.reply,/première demande/i);
 const next=await f.message('Continue');assert.equal(next.knowledge.facts[0].id,'loss-identity');assert.match(next.reply,/Ne transmettez ni numéro/i);assert.equal(f.calls(),0);
});

test('expired CNI retrieves one scoped renewal reference with original sources, verification dates and uncertainty',async t=>{
 const f=await fixture(t);await f.message('Je voudrais renouveler ma CNI.');await f.message('Elle est expirée.');
 const r=await f.message('Quelles pièces ?');assert.equal(r.source,'documentation');assert.equal(r.knowledge.cniReference.variant,'expiration');assert.equal(r.knowledge.facts.length,1);assert.equal(r.knowledge.facts[0].id,'renew-birth','the title point was already displayed with the expiry answer');
 assert.deepEqual(r.knowledge.facts[0].source_ids,[14,5,15]);assert.ok(r.knowledge.facts[0].sources.every(s=>s.consulted_on==='2026-11-16'&&s.published_or_updated_at===null));assert.match(r.reply,/confirmer/i);assert.match(r.reply,/renouvellement|renouveler/i);assert.equal(r.knowledge.generativeUse,false);assert.equal(r.knowledge.cniReference.completeChecklist,false);assert.equal(r.cost.estimateUsd,0);assert.equal(f.calls(),0);
});
