import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createAIService} from '../lib/ai/service.js';
import {readAIConfig} from '../lib/ai/config.js';
const data={records:[],sources:[],limitations:[],coverage:{}};
const answer={reply:'Bonjour',contactIds:[],toolCalls:[],outputItems:[],usage:{inputTokens:50,outputTokens:10}};
const tool=(args={service:'police',commune:'Cocody'},name='rechercher_contact')=>({...answer,reply:null,toolCalls:[{id:'fixture-call',name,arguments:JSON.stringify(args)}],outputItems:[{type:'function_call',call_id:'fixture-call',name,arguments:JSON.stringify(args)}]});
async function setup(t,provider,extra={}){
 const root=await mkdtemp(path.join(process.env.TMPDIR,'ai-regressions-'));await writeFile(path.join(root,'soul.md'),'Instructions locales de test.');
 const events=[];
 const ledgerFactory=()=>({reserve(){events.push('reserve');if(extra.refuseBudget)throw Error('Budget épuisé');return {fail(){events.push('fail');},settle(usage){events.push(['settle',usage]);}};},close(){}});
 const config={...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY',...extra.config};
 const service=createAIService({config,provider,ledgerFactory,clock:extra.clock||(()=>new Date('2026-11-12T08:00:00Z'))});
 t.after(async()=>{service.close();await rm(root,{recursive:true,force:true});});return {service,events,root};
}
test('AI_ENABLED false blocks both provider and budget even if payment switch is true',async t=>{
 let calls=0;const {service,events}=await setup(t,async()=>{calls++;return answer;},{config:{enabled:false}});
 assert.equal((await service.reply({message:'Bonjour'},data)).mode,'rules+directory');assert.equal(calls,0);assert.deepEqual(events,[]);
});
test('unsupported inherited model name cannot bypass the service allowlist',async t=>{
 let calls=0;const {service,events}=await setup(t,async()=>{calls++;return answer;},{config:{model:'toString'}});
 assert.equal((await service.reply({message:'Bonjour'},data)).fallback,'configuration');assert.equal(calls,0);assert.deepEqual(events,[]);
});
test('reservation refusal prevents even the first provider call',async t=>{
 let calls=0;const {service}=await setup(t,async()=>{calls++;return answer;},{refuseBudget:true});
 assert.equal((await service.reply({message:'Bonjour'},data)).mode,'rules+directory');assert.equal(calls,0);
});
for(const [name,result] of [
 ['unknown contact ids',{...answer,contactIds:['invented']}],
 ['missing usage',{...answer,usage:undefined}],
 ['oversized usage',{...answer,usage:{inputTokens:1000000,outputTokens:10}}],
 ['unauthorized tool',tool({},'run_shell')],
 ['extra tool arguments',tool({service:'police',commune:'Cocody',secret:'forbidden'})],
 ['invalid tool category',tool({service:'unknown',commune:'Cocody'})],
 ['malformed JSON tool arguments',{...tool(),toolCalls:[{id:'x',name:'rechercher_contact',arguments:'{'}]}]
])test('conservative fallback: '+name,async t=>{
 const {service,events}=await setup(t,async()=>result);const r=await service.reply({message:'Bonjour'},data);
 assert.equal(r.mode,'rules+directory');assert.ok(events.includes('fail'));assert.ok(!events.some(e=>Array.isArray(e)&&e[0]==='settle'));
});
test('provider/tool loop exhaustion remains bounded and retains the full provision',async t=>{
 let calls=0;const {service,events}=await setup(t,async()=>{calls++;return tool();});
 assert.equal((await service.reply({message:'Bonjour'},data)).mode,'rules+directory');assert.equal(calls,3);assert.ok(events.includes('fail'));
});
test('tool-round usage is settled as a complete aggregate and warnings are preserved',async t=>{
 let calls=0;const {service,events}=await setup(t,async()=>++calls===1?tool():answer);
 const r=await service.reply({message:'Bonjour'}, {...data,limitations:['Couverture de test partielle.']});
 assert.equal(r.mode,'ai');assert.ok(r.warnings.includes('Couverture de test partielle.'));
 assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='settle')[1],{inputTokens:100,outputTokens:20,calls:2});
});
for(const cause of ['erase','TTL'])test(cause+' during pending generation aborts and never restores the deleted session',async t=>{
 let notifyStart,resolveProvider,signal,calls=0,now=new Date('2026-11-12T08:00:00Z');const ready=new Promise(resolve=>{notifyStart=resolve;});
 const {service,events}=await setup(t,async request=>{
  if(++calls===1)return answer;signal=request.signal;notifyStart();return new Promise(resolve=>{resolveProvider=resolve;});
 },{clock:()=>now});
 const first=await service.reply({message:'Bonjour'},data);
 const pending=service.reply({message:'Merci',conversationId:first.conversationId},data);const rejected=assert.rejects(pending,e=>e.status===409);
 await ready;
 if(cause==='erase')service.erase(first.conversationId);
 else {now=new Date('2026-11-12T09:00:00Z');await assert.rejects(service.reply({message:'Merci',conversationId:first.conversationId},data),e=>e.status===404);}
 await rejected;assert.equal(signal.aborted,true);resolveProvider(answer);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(service.stats().sessions,0);assert.ok(events.includes('fail'));
});
test('missing instructions falls back before budget reservation or generation',async t=>{
 let calls=0;const {service,events,root}=await setup(t,async()=>{calls++;return answer;});await rm(path.join(root,'soul.md'));
 assert.equal((await service.reply({message:'Bonjour'},data)).mode,'rules+directory');assert.equal(calls,0);assert.deepEqual(events,[]);
});
