import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIService} from '../lib/ai/service.js';
import {readAIConfig} from '../lib/ai/config.js';
const root=new URL('..',import.meta.url).pathname;
const data={records:[],sources:[],limitations:[],coverage:{}};
function setup(t){
 let calls=0,reservations=0;
 const config={...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'FICTITIOUS-LOCAL-ONLY'};
 const service=createAIService({config,provider:async()=>{calls++;return {reply:'Bonjour',contactIds:[],toolCalls:[],outputItems:[],usage:{inputTokens:10,outputTokens:5}};},ledgerFactory:()=>({reserve(){reservations++;return {settle(){},fail(){}};},close(){}})});
 t.after(()=>service.close());return {service,counts:()=>({calls,reservations})};
}
for(const message of ['Passeport pour ma fille de 12 ans','CNI pour mon fils de 15 ans','Passeport pour un garçon de 10 ans'])test('review L1: explicit child age never receives an adult checklist: '+message,async t=>{
 const {service,counts}=setup(t);const r=await service.reply({message},data);
 assert.equal(r.knowledge?.status,'insufficient_scope');assert.ok(!r.knowledge.facts.some(f=>['documents','conditions','fees'].includes(f.section)));
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
test('review L1 control: the age of a birth document is not the age of the applicant',async t=>{
 const {service}=setup(t);const r=await service.reply({message:'CNI : mon document a 2 ans'},data);
 assert.notEqual(r.knowledge?.status,'insufficient_scope');assert.ok(r.knowledge.facts.length>0);
});
for(const acknowledgment of ['Merci','Merci beaucoup','D’accord','OK'])test('review L2: acknowledgments retain the scoped limitation without a provider request: '+acknowledgment,async t=>{
 const {service,counts}=setup(t);const first=await service.reply({message:'Passeport pour un mineur de 14 ans'},data);
 await service.reply({message:acknowledgment,conversationId:first.conversationId},data);
 const r=await service.reply({message:'Quelles pièces pour ce passeport ?',conversationId:first.conversationId},data);
 assert.equal(r.knowledge?.status,'insufficient_scope');assert.ok(!r.knowledge.facts.some(f=>['documents','conditions','fees'].includes(f.section)));
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
for(const message of ['Et pour un divorce, quelles pièces ?','Quelles pièces pour un divorce ?','Et pour un certificat de résidence, quels documents ?'])test('review L3: an explicit unsupported topic cannot inherit the previous record: '+message,async t=>{
 const {service,counts}=setup(t);const first=await service.reply({message:'CNI'},data);
 const r=await service.reply({message,conversationId:first.conversationId},data);
 assert.equal(r.answerType,'official_information');assert.equal(r.knowledge?.procedureId,undefined);assert.deepEqual(r.sources,[]);
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
for(const message of ['CNI et visa','Quels documents pour le bulletin n°3 et le permis B ?','Carte d’identité et permis B'])test('review L3/L4: mixed or ambiguous administrative aliases never select a single record or invoke the provider: '+message,async t=>{
 const {service,counts}=setup(t);const r=await service.reply({message},data);
 assert.equal(r.answerType,'official_information');assert.equal(r.knowledge?.procedureId,undefined);assert.deepEqual(r.sources,[]);
 assert.match(r.reply,/préciser|une seule|plusieurs|non couverte|pas de référence/);
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
