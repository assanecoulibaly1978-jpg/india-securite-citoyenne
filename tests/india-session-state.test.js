import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createIndiaConversation} from '../lib/ai/india.js';
import {readAIConfig} from '../lib/ai/config.js';
function fixture(t,options={}){
 const root=mkdtempSync('/Users/assane/.hermes/cache/scratch/india-state-');writeFileSync(path.join(root,'soul.md'),'INDIA, français simple.');
 let stamp=new Date('2026-11-13T10:00:00.000Z'),calls=0;
 const config={...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-state-test'};
 const permit={version:1,id:randomUUID(),approved:true,model:config.model,expiresAt:'2026-11-13T11:00:00.000Z',maxRequests:3,durationSeconds:300,sessionCapNano:150000000};
 const service=createIndiaConversation({root,config,permit,clock:()=>stamp,provider:async()=>{calls++;return {reply:'Voici une idée simple.',toolCalls:[],contactIds:[],usage:{inputTokens:1000,outputTokens:25}};},...options});
 t.after(()=>{service.close();rmSync(root,{recursive:true,force:true});});
 return {root,config,permit,service,id:randomUUID(),setTime:value=>stamp=new Date(value),calls:()=>calls};
}
test('expiry retains the deadline, unused quota and reason without allowing reactivation',async t=>{
 const f=fixture(t);const ready=f.service.status(f.id);assert.equal(ready.state,'ready');assert.equal(ready.usedRequests,0);
 f.service.authorize(f.id,{acknowledgeCost:true});assert.equal(f.service.status(f.id).remainingSeconds,300);
 await f.service.reply(f.id,'Une idée pour ma journée',{data:{records:[]}});await f.service.reply(f.id,'Développe cette idée',{data:{records:[]}});
 f.setTime('2026-11-13T10:05:01.000Z');const ended=f.service.status(f.id);
 assert.equal(ended.state,'ended');assert.equal(ended.endReason,'expired');assert.equal(ended.usedRequests,2);assert.equal(ended.remainingRequests,1);assert.equal(ended.remainingSeconds,0);assert.equal(ended.expiresAt,'2026-11-13T10:05:00.000Z');assert.equal(ended.authorized,false);
 f.service.end(f.id,'cleared');assert.equal(f.service.status(f.id).endReason,'expired');assert.throws(()=>f.service.authorize(f.id,{acknowledgeCost:true}));assert.equal(f.calls(),2);
});
test('successful third answer closes quota but keeps truthful OpenAI provenance and settled costs',async t=>{
 const f=fixture(t);f.service.authorize(f.id,{acknowledgeCost:true});let last;
 for(let i=0;i<3;i++)last=await f.service.reply(f.id,'Parlons de lecture',{data:{records:[]}});
 assert.equal(last.source,'openai');assert.equal(last.openaiEnabled,true);assert.equal(last.real.state,'ended');assert.equal(last.real.endReason,'quota_exhausted');assert.equal(last.real.authorized,false);assert.equal(last.real.usedRequests,3);assert.equal(last.real.remainingRequests,0);
 const before=f.service.cost(f.id);await assert.rejects(f.service.reply(f.id,'Encore',{data:{records:[]}}));assert.equal(f.calls(),3);assert.deepEqual(f.service.cost(f.id),before);
});
test('provider failure closes the session and retains the reservation without retries',async t=>{
 const f=fixture(t,{provider:async()=>{throw Error('secret diagnostic body must not escape');}});f.service.authorize(f.id,{acknowledgeCost:true});
 await assert.rejects(f.service.reply(f.id,'Bonjour',{data:{records:[]}}),/^Error: INDIA indisponible\.$/);
 const state=f.service.status(f.id);assert.equal(state.state,'ended');assert.equal(state.endReason,'provider_error');assert.equal(state.usedRequests,1);assert.equal(f.service.cost(f.id).sessionEstimateUsd,f.service.cost(f.id).provisionUsd);
});
test('global budget refusal is explicit before any provider dispatch',async t=>{
 const f=fixture(t);mkdirSync(path.join(f.root,'var'),{mode:0o700});const bucket={attemptedRequests:1,providerCalls:1,costNano:990000000};
 writeFileSync(f.config.ledgerPath,JSON.stringify({version:1,days:{'2026-11-13':bucket},months:{'2026-11':bucket}}),{mode:0o600});
 f.service.authorize(f.id,{acknowledgeCost:true});await assert.rejects(f.service.reply(f.id,'Bonjour',{data:{records:[]}}));assert.equal(f.service.status(f.id).endReason,'budget_exhausted');assert.equal(f.service.status(f.id).usedRequests,0);assert.equal(f.calls(),0);
});
test('audit records metadata only, without prompts, replies, owner tokens or permit IDs',async t=>{
 const f=fixture(t);f.service.authorize(f.id,{acknowledgeCost:true});await f.service.reply(f.id,'EXEMPLE-CONTENU-PRIVE',{data:{records:[]}});f.service.end(f.id,'cleared');
 const raw=readFileSync(path.join(f.root,'var/india-session-events.jsonl'),'utf8');for(const forbidden of ['EXEMPLE-CONTENU-PRIVE','Voici une idée simple.',f.id,f.permit.id,'fictional-state-test'])assert.ok(!raw.includes(forbidden));
 const events=raw.trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.event==='authorized'));assert.ok(events.some(e=>e.event==='request_settled'));assert.ok(events.some(e=>e.event==='ended'&&e.reason==='cleared'));
});
