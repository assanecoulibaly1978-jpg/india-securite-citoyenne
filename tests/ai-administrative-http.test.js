import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
import {readAIConfig} from '../lib/ai/config.js';
import {chat} from '../lib/assistant.js';
import {loadData} from '../lib/directory.js';
const root=new URL('..',import.meta.url).pathname;
const token='LOCAL-FICTITIOUS-DOCUMENTARY-TEST-'.repeat(2);
async function fixture(t){
 let calls=0,reservations=0;
 const aiConfig={...readAIConfig({},root),pilotToken:token,requestsPerMinute:100};
 const clock=()=>new Date('2026-11-12T18:00:00Z');
 const server=createServer({aiConfig,clock,aiProvider:async()=>{calls++;throw Error('OpenAI forbidden in local test');},aiLedgerFactory:()=>{reservations++;throw Error('No budget reservation');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(body,{authorized=true,url='/api/assistant'}={})=>{
  const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 return {base,post,clock,counts:()=>({calls,reservations}),config:aiConfig};
}
test('HTTP: all five documentary procedures are private, dated, non-generative and never exposed by public chat',async t=>{
 const {base,post,clock,counts,config}=await fixture(t);
 assert.equal(config.enabled,false);assert.equal(config.allowPaid,false);
 assert.equal(config.dailyBudgetNano,1_000_000_000);assert.equal(config.monthlyBudgetNano,2_000_000_000);
 for(const message of ['Comment obtenir ma CNI ?','Extrait de naissance','Casier judiciaire','Passeport ivoirien','Permis de conduire']){
  assert.equal((await post({message},{authorized:false})).status,403);
  const answer=await post({message});assert.equal(answer.status,200);
  assert.equal(answer.body.answerType,'official_information');assert.ok(answer.body.sources.length>0);
  assert.equal(answer.body.knowledge.readOnly,true);assert.equal(answer.body.knowledge.generativeUse,false);
  assert.ok(answer.body.knowledge.facts.length>0);
  for(const fact of answer.body.knowledge.facts){assert.equal(fact.confirmationRequired,true);assert.ok(fact.sources.length>0);assert.ok(answer.body.reply.includes(fact.text));}
  assert.match(answer.body.reply,/à confirmer/i);
  for(const source of answer.body.sources){assert.ok(answer.body.reply.includes(source.url));assert.ok(answer.body.reply.includes(source.consulted_on));}
  const publicAnswer=await post({message},{authorized:false,url:'/api/chat'});
  assert.equal(publicAnswer.status,200);
  assert.deepEqual(publicAnswer.body,chat({message},await loadData(root+'data'),clock));
  assert.equal(publicAnswer.body.knowledge,undefined);
 }
 for(const target of ['/knowledge/base-administrative.json','/knowledge/manifest.json','/knowledge/base.schema.json','/lib/ai/knowledge.js','/api/knowledge','/.env'])assert.equal((await fetch(base+target)).status,404);
 const catalog=await (await fetch(base+'/api/sources')).json();assert.equal(catalog.knowledge,undefined);
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
test('HTTP: body cannot select a corpus, override citations, activate AI or write administrative data',async t=>{
 const {base,post,counts}=await fixture(t);
 for(const field of ['knowledgeDir','source_ids','reply','generativeUse','AI_ENABLED','procedureId','confirmationRequired']){
  const r=await post({message:'CNI',[field]:field==='knowledgeDir'?'/etc':true});assert.equal(r.status,400);
 }
 for(const method of ['PUT','PATCH','DELETE'])assert.equal((await fetch(base+'/api/assistant',{method,headers:{authorization:'Bearer '+token}})).status,405);
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
test('HTTP: an administrative conversation still yields immediately to danger and its emergency actions',async t=>{
 const {post,counts}=await fixture(t);const first=await post({message:'CNI'});
 for(const message of ['Accidan avec des blesés','Il ne resprire pa','Il saigne bcp']){
  const result=await post({message,conversationId:first.body.conversationId});assert.equal(result.status,200);
  assert.equal(result.body.answerType,'protected_protocol');assert.equal(result.body.knowledge,undefined);
  assert.ok(result.body.actions.some(a=>['180','185'].includes(a.number)));
 }
 assert.deepEqual(counts(),{calls:0,reservations:0});
});
