import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
import {readAIConfig} from '../lib/ai/config.js';
const token='SIMULATION-LOCAL-ONLY-'.repeat(3);
test('HTTP private simulated conversation preserves source boundaries, auth, erasure and the public engine',async t=>{
 let calls=0;
 const aiConfig={...readAIConfig({},new URL('..',import.meta.url).pathname),enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY',generalProseSimulation:true,pilotToken:token,requestsPerMinute:30};
 const server=createServer({aiConfig,clock:()=>new Date('2026-11-12T12:00:00Z'),aiProvider:async()=>{
  calls++;return {reply:'Pour organiser votre semaine, notez vos priorités et gardez du temps pour les imprévus.',contactIds:[],toolCalls:[],outputItems:[],usage:{inputTokens:100,outputTokens:30}};
 },aiLedgerFactory:()=>({reserve:()=>({settle(){},fail(){}}),close(){}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(message,conversationId,authorized=true,url='/api/assistant')=>{
  const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{authorization:'Bearer '+token}:{})},body:JSON.stringify({message,...(conversationId?{conversationId}:{})})});
  return {status:r.status,body:await r.json()};
 };
 assert.equal((await post('Bonjour',undefined,false)).status,403);
 const spoof=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({message:'Bonjour',answerType:'general',generalProseSimulation:true})});assert.equal(spoof.status,400);assert.equal(calls,0);
 assert.equal(readAIConfig({AI_GENERAL_PROSE_SIMULATION:'true'},new URL('..',import.meta.url).pathname).generalProseSimulation,undefined);
 const general=await post('Comment organiser ma semaine ?');assert.equal(general.status,200);assert.equal(general.body.mode,'ai');assert.equal(general.body.answerType,'general');assert.equal(calls,1);
 const id=general.body.conversationId;
 const official=await post('Comment obtenir ma CNI ?',id);assert.equal(official.body.answerType,'official_information');assert.equal(official.body.verification,'required');
 assert.equal((await post('Première demande',id)).body.answerType,'official_information');assert.equal(calls,1);
 const local=await post('Quelle farmacie de garde à Cocody ?',id);assert.equal(local.body.answerType,'local_search');assert.ok(local.body.results.length>0);assert.equal(local.body.mode,'rules+directory');assert.equal(calls,1);
 const danger=await post('Il respire pa',id);assert.equal(danger.body.answerType,'protected_protocol');assert.ok(danger.body.actions.some(a=>a.number==='185'));assert.equal(calls,1);
 const erase=await fetch(base+'/api/assistant/conversation/'+id,{method:'DELETE',headers:{authorization:'Bearer '+token}});assert.equal(erase.status,200);
 assert.equal((await post('Merci',id)).status,404);
 const legacy=await post('Comment organiser ma semaine ?',undefined,false,'/api/chat');assert.equal(legacy.status,200);assert.equal(legacy.body.mode,undefined);assert.match(legacy.body.reply,/à règles/);assert.equal(calls,1);
 for(const target of ['/.env','/soul.md','/lib/ai/policy.js'])assert.equal((await fetch(base+target)).status,404);
});
