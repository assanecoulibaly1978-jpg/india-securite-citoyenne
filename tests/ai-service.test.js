import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readAIConfig} from '../lib/ai/config.js';
const token='pilot-test-only-'.repeat(3);
const clock=()=>new Date('2026-11-12T08:00:00Z');
const data={records:[],sources:[],limitations:[],coverage:{}};
async function setup(t,extra={}){
 const file=new URL('../lib/ai/service.js',import.meta.url);
 assert.ok(existsSync(file),'Le service IA privé doit être créé');
 const {createAIService}=await import(file);
 const root=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'ai-service-'));
 await writeFile(path.join(root,'soul.md'),'Identité test : indépendant, sans promesse.');
 const config={...readAIConfig({},root),...extra.config};
 const service=createAIService({config,clock,provider:extra.provider,ledgerFactory:extra.ledgerFactory});
 t.after(async()=>{service.close();await rm(root,{recursive:true,force:true});});
 return {service,root,config};
}

test('private service rejects anonymous and remote callers; disabled mode never invokes provider',async t=>{
 let calls=0;const {service}=await setup(t,{provider:async()=>{calls++;throw Error('must not run');}});
 assert.throws(()=>service.authorize({socket:{remoteAddress:'127.0.0.1'},headers:{}}),e=>e.status===403);
 const result=await service.reply({message:'Bonjour'},data);
 assert.equal(result.mode,'rules+directory');assert.equal(result.subscribed,false);assert.equal(calls,0);
});

test('server-owned conversations preserve accident context, reject invented ids and can be erased',async t=>{
 const {service}=await setup(t);
 const first=await service.reply({message:'Il y a un accident'},data);
 const next=await service.reply({message:'Oui il y a un blessé',conversationId:first.conversationId},data);
 assert.equal(next.conversationId,first.conversationId);assert.match(next.reply,/180/);
 assert.notEqual(next.intent,'other');assert.equal(next.state,undefined);
 const continued=await service.reply({message:'Je suis à Cocody près de la pharmacie',conversationId:first.conversationId},data);
 assert.notEqual(continued.intent,'pharmacy');
 await assert.rejects(service.reply({message:'Bonjour',conversationId:'00000000-0000-4000-8000-000000000000'},data),e=>e.status===404);
 service.erase(first.conversationId);
 await assert.rejects(service.reply({message:'Bonjour',conversationId:first.conversationId},data),e=>e.status===404);
 await assert.rejects(service.reply({message:'x'.repeat(1001)},data),e=>e.status===400);
 await assert.rejects(service.reply({message:'Bonjour',state:{category:'pharmacy'}},data),e=>e.status===400);
});

const fakeUsage={inputTokens:50,outputTokens:20,cachedInputTokens:0};
const answer=reply=>({reply,contactIds:[],toolCalls:[],outputItems:[],usage:fakeUsage});
function ledgerSpy(){const events=[];return {events,factory:()=>({reserve(){events.push('reserve');return {settle(usage){events.push(['settle',usage]);},fail(){events.push('fail');}};},close(){}})};}
const enabled={enabled:true,allowPaid:true,pilotToken:token,apiKey:'FAKE-TEST-KEY'};

test('private prepared pipeline reads soul live, uses the real contract, and bounds history',async t=>{
 const seen=[],ledger=ledgerSpy();const provider=async request=>{seen.push(request);return answer('Bonjour, comment puis-je vous aider ?');};
 const {service,root}=await setup(t,{config:enabled,provider,ledgerFactory:ledger.factory});
 service.authorize({socket:{remoteAddress:'127.0.0.1'},headers:{authorization:'Bearer '+token}});
 assert.throws(()=>service.authorize({socket:{remoteAddress:'192.168.1.42'},headers:{authorization:'Bearer '+token}}),e=>e.status===403);
 let r=await service.reply({message:'Bonjour'},data);assert.equal(r.mode,'ai');assert.match(seen[0].instructions,/Identité test/);
 await writeFile(path.join(root,'soul.md'),'NOUVELLE IDENTITÉ TEST');
 for(let i=0;i<12;i++)r=await service.reply({message:'Merci',conversationId:r.conversationId},data);
 assert.match(seen.at(-1).instructions,/NOUVELLE IDENTITÉ/);assert.ok(seen.at(-1).input.length<=20);
 assert.deepEqual(service.stats().historyLengths,[20]);assert.ok(ledger.events.some(e=>Array.isArray(e)&&e[0]==='settle'));
});

test('failure returns the original engine and clickable national contacts without exposing errors',async t=>{
 const ledger=ledgerSpy();const {service}=await setup(t,{config:enabled,ledgerFactory:ledger.factory,provider:async()=>{throw Error('UPSTREAM-SECRET must never leak');}});
 const r=await service.reply({message:'Bonjour'},data);
 assert.equal(r.mode,'rules+directory');assert.deepEqual(r.actions.map(a=>a.number),['180','185','100','145']);
 assert.doesNotMatch(JSON.stringify(r),/UPSTREAM-SECRET/);assert.ok(ledger.events.includes('fail'));
});

test('both switches are necessary and emergency protocols never invoke AI even when allowed',async t=>{
 let calls=0;const provider=async()=>{calls++;return answer('Bonjour');};const ledger=ledgerSpy();
 const off=await setup(t,{config:{...enabled,allowPaid:false},provider,ledgerFactory:ledger.factory});
 assert.equal((await off.service.reply({message:'Bonjour'},data)).mode,'rules+directory');
 const on=await setup(t,{config:enabled,provider,ledgerFactory:ledger.factory});
 for(const message of ['Il y a un accident avec des blessés','Je veux porter plainte pour un vol','Pharmacie de garde à Yopougon']){
  const r=await on.service.reply({message},data);assert.equal(r.mode,'rules+directory');
 }
 assert.equal(calls,0);
});

test('untrusted free prose never exposes invented phone numbers or addresses',async t=>{
 const ledger=ledgerSpy();const {service}=await setup(t,{config:enabled,ledgerFactory:ledger.factory,provider:async()=>answer('Appelez le 01 02 03 04 05 au 12 allée des Palmiers.')});
 const r=await service.reply({message:'Bonjour'},data);
 assert.equal(r.mode,'rules+directory');assert.doesNotMatch(r.reply,/Palmiers|01 02 03/);assert.ok(ledger.events.includes('fail'));
});

test('caller cancellation aborts generation and never commits a late reply',async t=>{
 let started,resolveProvider,providerSignal;
 const ready=new Promise(resolve=>{started=resolve;});const ledger=ledgerSpy();
 const {service}=await setup(t,{config:{...enabled,timeoutMs:1000},ledgerFactory:ledger.factory,provider:request=>{
  providerSignal=request.signal;started();return new Promise(resolve=>{resolveProvider=resolve;});
 }});
 const cancel=new AbortController();const pending=service.reply({message:'Bonjour'},data,{signal:cancel.signal});
 const rejected=assert.rejects(pending,e=>e.status===409);
 await ready;cancel.abort();assert.equal(providerSignal.aborted,true);await rejected;
 resolveProvider(answer('Bonjour'));await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(service.stats().historyLengths,[0]);assert.ok(ledger.events.includes('fail'));
});

test('global deadline returns fallback even if transport ignores abort',async t=>{
 const ledger=ledgerSpy();const {service}=await setup(t,{config:{...enabled,timeoutMs:35},provider:()=>new Promise(()=>{}),ledgerFactory:ledger.factory});
 const started=Date.now();
 const r=await Promise.race([service.reply({message:'Bonjour'},data),new Promise((_,reject)=>setTimeout(()=>reject(Error('Délai global non respecté')),350))]);
 assert.equal(r.mode,'rules+directory');assert.ok(Date.now()-started<300);assert.ok(ledger.events.includes('fail'));
});

test('a new urgent message interrupts a pending AI reply and prevents stale state updates',async t=>{
 const ledger=ledgerSpy();let calls=0,started;
 const pendingStarted=new Promise(resolve=>{started=resolve;});
 const {service}=await setup(t,{config:{...enabled,timeoutMs:200},ledgerFactory:ledger.factory,provider:async()=>{calls++;if(calls===1)return answer('Bonjour');started();return new Promise(()=>{});}});
 const first=await service.reply({message:'Bonjour'},data);
 const pending=service.reply({message:'Merci',conversationId:first.conversationId},data);
 const rejected=assert.rejects(pending,e=>e.status===409);
 await pendingStarted;
 const urgent=await service.reply({message:'Il y a un accident avec des blessés',conversationId:first.conversationId},data);
 assert.match(urgent.reply,/180/);assert.equal(urgent.mode,'rules+directory');
 await rejected;
 const followup=await service.reply({message:'Je suis à Cocody près de la pharmacie',conversationId:first.conversationId},data);
 assert.notEqual(followup.intent,'pharmacy');
});

test('tool calls search only imported active records and never display invented model coordinates',async t=>{
 let calls=0;const ledger=ledgerSpy();
 const directory={...data,records:[
  {id:'active',category:'pharmacy',name:'Pharmacie fixture',city:'Cocody',address:'Adresse fixture',callable_phones:['+2250100000000'],source_url:'https://example.test/source',source_kind:'professional',duty_periods:[{start:'2026-11-09',end:'2026-11-15'}]},
  {id:'expired',category:'pharmacy',name:'Pharmacie ancienne',city:'Cocody',address:'Ancienne',callable_phones:[],duty_periods:[{start:'2026-10-01',end:'2026-10-07'}]}
 ]};
 const {service}=await setup(t,{config:enabled,ledgerFactory:ledger.factory,provider:async request=>{
  calls++;assert.equal(request.tools[0].name,'rechercher_contact');
  if(calls===1)return {...answer(null),toolCalls:[{id:'call-fixture',name:'rechercher_contact',arguments:JSON.stringify({service:'pharmacy',commune:'Cocody'})}],outputItems:[{type:'function_call',call_id:'call-fixture',name:'rechercher_contact',arguments:'{}'}]};
  const output=request.input.find(item=>item.type==='function_call_output');const found=JSON.parse(output.output);
  assert.deepEqual(found.records.map(r=>r.id),['active']);
  return {...answer('Adresse inventée 999, téléphone +2250999999999'),contactIds:['active']};
 }});
 const r=await service.reply({message:'Quels lieux peuvent m’aider à Cocody ce soir ?'},directory);
 assert.equal(r.mode,'ai');assert.equal(calls,2);assert.deepEqual(r.results.map(x=>x.id),['active']);
 assert.doesNotMatch(r.reply,/inventée|999/);assert.ok(r.actions.some(a=>a.number==='+2250100000000'));
  assert.ok(r.warnings.some(w=>w.includes('Gardes limitées aux périodes publiées')));
});
