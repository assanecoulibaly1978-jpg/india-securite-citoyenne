import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIService} from '../lib/ai/service.js';
import {readAIConfig} from '../lib/ai/config.js';
const data={records:[],sources:[],limitations:[],coverage:{}};
const response=reply=>({reply,contactIds:[],toolCalls:[],outputItems:[],usage:{inputTokens:70,outputTokens:25}});
function setup(t,reply){
 const seen=[];const ledger={reserve:()=>({settle(){},fail(){}}),close(){}};
 // These historical cases intentionally exercise the absence of a corpus.
 const config={...readAIConfig({},new URL('..',import.meta.url).pathname),knowledgeDir:null,enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY',generalProseSimulation:true};
 const service=createAIService({config,provider:async req=>{seen.push(req);return response(reply);},ledgerFactory:()=>ledger});
 t.after(()=>service.close());return {service,seen};
}
test('private general conversation accepts useful natural explanations beyond canned greetings',async t=>{
 const text='Pour organiser votre semaine, notez vos priorités, puis gardez du temps pour les imprévus.';
 const {service,seen}=setup(t,text);const r=await service.reply({message:'Comment organiser ma semaine ?'},data);
 assert.equal(r.mode,'ai');assert.equal(r.reply,text);assert.equal(r.answerType,'general');assert.equal(seen.length,1);
 assert.match(seen[0].instructions,/assistant numérique citoyen indépendant/);
 assert.doesNotMatch(seen[0].instructions,/exactement une des formulations serveur/);
});
for(const message of ['Comment obtenir ma CNI ?','Quels documents pour un passeport ?','Quel est le tarif officiel ?','Comment obtenir un permis de conduire ?'])test('official information without official corpus never generates invented requirements: '+message,async t=>{
 const {service,seen}=setup(t,'Le tarif officiel est de 9999 francs.');
 const r=await service.reply({message},data);
 assert.equal(r.mode,'rules+directory');assert.equal(r.answerType,'official_information');assert.equal(r.verification,'required');
 assert.match(r.reply,/pas de référence officielle actualisée/);assert.equal(seen.length,0);assert.deepEqual(r.sources,[]);
});
test('educational police question is distinct from contact lookup',async t=>{
 const {service,seen}=setup(t,'La police contribue à la sécurité publique.');
 const r=await service.reply({message:'Explique le rôle de la police'},data);
 assert.equal(r.mode,'ai');assert.equal(r.answerType,'general');assert.equal(seen.length,1);
});
test('local contact request outside catalog never triggers general model prose',async t=>{
 const {service,seen}=setup(t,'Contactez le Bureau Bleu.');
 const r=await service.reply({message:'Téléphone de la mairie de Cocody ?'},data);
 assert.equal(r.answerType,'local_search');assert.equal(r.verification,'directory_only');assert.equal(seen.length,0);
 assert.match(r.reply,/annuaire/);assert.deepEqual(r.results,[]);
});
for(const message of ['Quelle dose de paracétamol pour un enfant ?','Voici mon mot de passe secret123','Comment pirater un compte ?'])test('sensitive questions are handled locally without forwarding private details: '+message,async t=>{
 const {service,seen}=setup(t,'Prenez deux comprimés.');const r=await service.reply({message},data);
 assert.equal(r.mode,'rules+directory');assert.equal(r.answerType,'safety_orientation');assert.equal(seen.length,0);
});
for(const [message,number] of [['Un accidan avec des blesés','180'],['Il respire pa','185'],['Il saigne bcp','185']])test('typo danger preempts general model: '+message,async t=>{
 const {service,seen}=setup(t,'Bonjour');const r=await service.reply({message},data);
 assert.equal(r.mode,'rules+directory');assert.equal(r.answerType,'protected_protocol');assert.ok(r.actions.some(a=>a.number===number));assert.equal(seen.length,0);
});
test('injury negations survive conservative spelling normalization',async t=>{
 const {service,seen}=setup(t,'Bonjour');const r=await service.reply({message:'Accidan sans blese'},data);
 assert.equal(r.intent,'constat');assert.equal(r.answerType,'protected_protocol');assert.equal(seen.length,0);
 assert.match(r.reply,/matériel|matériels|blessé/);assert.ok(!r.actions.some(a=>a.number==='185'));
});
test('new danger interrupts an existing general conversation',async t=>{
 const {service,seen}=setup(t,'Bonjour, comment puis-je vous aider ?');const first=await service.reply({message:'Bonjour'},data);
 const r=await service.reply({message:'Il respire pa',conversationId:first.conversationId},data);
 assert.equal(r.answerType,'protected_protocol');assert.ok(r.actions.some(a=>a.number==='185'));assert.equal(seen.length,1);
});
test('contact data are masked both in the current prompt and later history',async t=>{
 const {service,seen}=setup(t,'Bonjour');const r=await service.reply({message:'Bonjour citoyen@example.test +225 01 02 03 04 05'},data);
 await service.reply({message:'Merci',conversationId:r.conversationId},data);
 assert.equal(seen.length,2);for(const request of seen)assert.doesNotMatch(JSON.stringify(request.input),/citoyen@example|01 02 03 04 05/);
});
test('administrative follow-up remains non-generative without an official corpus',async t=>{
 const {service,seen}=setup(t,'Apportez une photo et un acte de naissance.');
 const first=await service.reply({message:'Comment obtenir ma CNI ?'},data);
 const second=await service.reply({message:'Bonjour, quelles pièces faut-il apporter pour cette première demande ?',conversationId:first.conversationId},data);
 assert.equal(second.answerType,'official_information');assert.equal(second.verification,'required');assert.equal(seen.length,0);
});
test('sensitive material is not recycled into subsequent model conversation history',async t=>{
 const {service,seen}=setup(t,'Bonjour');const first=await service.reply({message:'Quelle dose de paracétamol pour mon enfant FICTIFCONFIDENTIEL ?'},data);
 await service.reply({message:'Bonjour',conversationId:first.conversationId},data);
 assert.equal(seen.length,1);assert.doesNotMatch(JSON.stringify(seen[0].input),/FICTIFCONFIDENTIEL/);
});
test('opening general prose is restricted to an explicit injected simulation, not the default real transport path',async t=>{
 const config={...readAIConfig({},new URL('..',import.meta.url).pathname),enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY'};
 const service=createAIService({config,provider:async()=>response('Pour organiser votre semaine, notez vos priorités.'),ledgerFactory:()=>({reserve:()=>({settle(){},fail(){}}),close(){}})});
 t.after(()=>service.close());const r=await service.reply({message:'Comment organiser ma semaine ?'},data);
 assert.equal(r.mode,'rules+directory');assert.equal(r.fallback,'ai_unavailable');
});
test('uncovered diplomatic service contact never becomes a general answer',async t=>{
 const {service,seen}=setup(t,'Consulat du Mali : douze impasse des Acacias.');
 const r=await service.reply({message:'Comment joindre le consulat du Mali à Abidjan ?'},data);
 assert.equal(r.answerType,'local_search');assert.equal(seen.length,0);assert.deepEqual(r.results,[]);
});
test('health disclosure is not sent now or reused later',async t=>{
 const {service,seen}=setup(t,'Bonjour');
 const first=await service.reply({message:'Je suis séropositif, dossier FICTIFCONFIDENTIEL, aide-moi à organiser mes rendez-vous.'},data);
 assert.equal(first.answerType,'safety_orientation');assert.equal(seen.length,0);
 await service.reply({message:'Merci',conversationId:first.conversationId},data);
 assert.equal(seen.length,1);assert.doesNotMatch(JSON.stringify(seen[0].input),/FICTIFCONFIDENTIEL|séropositif/);
});
test('combined spelling corrections are stable before deterministic triage',async t=>{
 const {service,seen}=setup(t,'Bonjour');const r=await service.reply({message:'Il ne resprire pa'},data);
 assert.equal(r.answerType,'protected_protocol');assert.ok(r.actions.some(a=>a.number==='185'));assert.equal(seen.length,0);
});
test('resprire typo aborts an in-flight provider before returning urgent contact',async t=>{
 let signal,started,release;const ready=new Promise(resolve=>{started=resolve;});
 const config={...readAIConfig({},new URL('..',import.meta.url).pathname),enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY',generalProseSimulation:true};
 const service=createAIService({config,provider:async req=>{signal=req.signal;started();await new Promise(resolve=>{release=resolve;});return response('Bonjour');},ledgerFactory:()=>({reserve:()=>({settle(){},fail(){}}),close(){}})});
 t.after(()=>service.close());const first=await service.reply({message:'Comment obtenir ma CNI ?'},data);
 const pending=service.reply({message:'Bonjour',conversationId:first.conversationId},data);
 const stale=assert.rejects(pending,e=>e.status===409);await ready;
 try{
  const urgent=await service.reply({message:'Il ne resprire plus',conversationId:first.conversationId},data);
  assert.equal(urgent.answerType,'protected_protocol');assert.ok(urgent.actions.some(a=>a.number==='185'));assert.equal(signal.aborted,true);
 }finally{release();service.close();await stale;}
});
