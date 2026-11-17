import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createIndiaConversation} from '../lib/ai/india.js';
import {readAIConfig} from '../lib/ai/config.js';

const owner = () => randomUUID();
const data = {records:[]};
const scratch = '/Users/assane/.hermes/cache/scratch';
function fixture(t, options={}) {
 mkdirSync(scratch,{recursive:true});
 const root=mkdtempSync(path.join(scratch,'india-test-'));
 writeFileSync(path.join(root,'soul.md'),'INDIA : assistant automatique indépendant, français simple.');
 const config={...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'synthetic-not-a-key'};
 let now=new Date('2026-11-12T10:00:00.000Z');
 const permit={version:1,id:randomUUID(),approved:true,model:config.model,expiresAt:'2026-11-12T10:05:00.000Z',maxRequests:3,durationSeconds:300,sessionCapNano:150000000};
 const calls=[];
 const provider=async req=>{calls.push(req);return {reply:'Bonjour, quel sujet souhaitez-vous explorer ?',contactIds:[],toolCalls:[],usage:{inputTokens:100,outputTokens:20,cachedInputTokens:0}};};
 const service=createIndiaConversation({root,config,permit,provider,clock:()=>now,...options});
 t.after(()=>{service.close();rmSync(root,{recursive:true,force:true});});
 return {root,config,permit,service,calls,setNow:value=>{now=new Date(value);}};
}

test('input, ownership, config and soul gates stop before any paid dependency',async t=>{
 const f=fixture(t),id=owner();
 await assert.rejects(f.service.reply(id,'Bonjour',{data}));f.service.authorize(id,{acknowledgeCost:true});
 for(const message of ['', ' ', 'a'.repeat(1001),null,{}])await assert.rejects(f.service.reply(id,message,{data}));
 await assert.rejects(f.service.reply(owner(),'Bonjour',{data}));
 await assert.rejects(f.service.reply(id,'Bonjour',{data,signal:AbortSignal.abort()}));
 writeFileSync(path.join(f.root,'soul.md'),'é'.repeat(8001));await assert.rejects(f.service.reply(id,'Bonjour',{data}));
 writeFileSync(path.join(f.root,'soul.md'),' ');await assert.rejects(f.service.reply(id,'Bonjour',{data}));
 rmSync(path.join(f.root,'soul.md'));await assert.rejects(f.service.reply(id,'Bonjour',{data}));
 assert.equal(f.calls.length,0);assert.equal(f.service.status(id).remainingRequests,3);
 assert.equal(f.service.cost(owner()).sessionEstimateUsd,0);
 for(const override of [{enabled:false},{allowPaid:false},{provider:'different'}]){
  const s=createIndiaConversation({root:f.root,config:{...f.config,...override},permit:f.permit});assert.equal(s.status(id).available,false);s.close();
 }
});

test('full application soul fits the conservative envelope with a bounded UTF-8 message',async t=>{
 const f=fixture(t),id=owner();
 const soul=readFileSync(new URL('../soul.md',import.meta.url));assert.ok(soul.length<=16000);
 writeFileSync(path.join(f.root,'soul.md'),soul);f.service.authorize(id,{acknowledgeCost:true});
 await f.service.reply(id,'Bonjour '+ 'é'.repeat(900),{data});
 assert.ok(f.calls[0].instructions.startsWith(soul.toString('utf8')));
 assert.ok(Buffer.byteLength(JSON.stringify({instructions:f.calls[0].instructions,input:f.calls[0].input,tools:[]}))<=20000);
});

test('three-request ceiling remains spent after end and session cap can stop earlier',async t=>{
 const f=fixture(t),id=owner();f.service.authorize(id,{acknowledgeCost:true});
 for(let i=0;i<3;i++)await f.service.reply(id,'Bonjour',{data});
 await assert.rejects(f.service.reply(id,'Bonjour',{data}));assert.equal(f.calls.length,3);
 const before=f.service.cost(id);f.service.end(id);assert.deepEqual(f.service.cost(id),before);
 assert.throws(()=>f.service.authorize(id,{acknowledgeCost:true}));
 let calls=0;const g=fixture(t,{provider:async()=>{calls++;throw Error('PRIVATE raw secret must not escape');}}),who=owner();g.service.authorize(who,{acknowledgeCost:true});
 for(let i=0;i<3;i++)await assert.rejects(g.service.reply(who,'Bonjour',{data}),/^Error: INDIA indisponible\.$/);
 assert.equal(calls,1);assert.equal(g.service.status(who).endReason,'provider_error');assert.equal(g.service.cost(who).sessionEstimateUsd,g.service.cost(who).provisionUsd);
 assert.ok(g.service.cost(who).sessionEstimateUsd<=0.15);
});

test('existing persistent ledger enforces global daily and monthly caps without resets',async t=>{
 for(const period of ['day','month']){
  const f=fixture(t),id=owner();mkdirSync(path.dirname(f.config.ledgerPath),{recursive:true,mode:0o700});
  const bucket=costNano=>({attemptedRequests:1,providerCalls:0,costNano});
  const days=period==='day'?{'2026-11-12':bucket(990000000)}:{'2026-11-01':bucket(975000000),'2026-11-02':bucket(975000000)};
  const months={'2026-11':{attemptedRequests:Object.keys(days).length,providerCalls:0,costNano:Object.values(days).reduce((sum,b)=>sum+b.costNano,0)}};
  const raw=JSON.stringify({version:1,days,months});writeFileSync(f.config.ledgerPath,raw,{mode:0o600});
  f.service.authorize(id,{acknowledgeCost:true});await assert.rejects(f.service.reply(id,'Bonjour',{data}));
  assert.equal(f.calls.length,0);assert.equal(readFileSync(f.config.ledgerPath,'utf8'),raw);assert.equal(f.service.cost(id).sessionEstimateUsd,0);
 }
});

test('concurrent general requests cannot dispatch twice, protected input cancels pending work',async t=>{
 let finish;let calls=0,observed;
 const f=fixture(t,{provider:request=>{calls++;observed=request;return new Promise(resolve=>{finish=resolve;});}}),id=owner();f.service.authorize(id,{acknowledgeCost:true});
 const pending=f.service.reply(id,'Bonjour',{data}).then(()=> 'accepted',()=> 'rejected');
 await assert.rejects(f.service.reply(id,'Encore une question générale',{data}));assert.equal(calls,1);
 await assert.rejects(f.service.reply(id,'Une personne ne respire plus',{data}));assert.equal(await pending,'rejected');assert.equal(observed.signal.aborted,true);
 finish({reply:'Bonjour',contactIds:[],toolCalls:[],usage:{inputTokens:1,outputTokens:1}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.service.cost(id).sessionEstimateUsd,f.service.cost(id).provisionUsd);
});

test('short configured timeout and close both cancel an uncooperative provider',async t=>{
 for(const stop of ['timeout','close']){
  const f=fixture(t),id=owner();f.service.close();
  let observed;
  const s=createIndiaConversation({root:f.root,config:{...f.config,timeoutMs:5},permit:f.permit,clock:()=>new Date('2026-11-12T10:00:00.000Z'),provider:request=>{observed=request;return new Promise(()=>{});}});
  s.authorize(id,{acknowledgeCost:true});const pending=s.reply(id,'Bonjour',{data});
  if(stop==='close')s.close();
  await assert.rejects(pending,/^Error: INDIA indisponible\.$/);assert.equal(observed.signal.aborted,true);
  assert.equal(s.cost(id).sessionEstimateUsd,s.cost(id).provisionUsd);s.close();
 }
});

test('fractional model rates retain integer-nano accounting identical to the existing ledger',async t=>{
 const f=fixture(t);f.service.close();
 const s=createIndiaConversation({root:f.root,config:{...f.config,model:'gpt-6-luna'},permit:{...f.permit,model:'gpt-6-luna'},clock:()=>new Date('2026-11-12T10:00:00.000Z'),provider:async()=>({reply:'Bonjour',contactIds:[],toolCalls:[],usage:{inputTokens:3,outputTokens:1}})});
 const id=owner();s.authorize(id,{acknowledgeCost:true});await s.reply(id,'Bonjour',{data});
 const nano=JSON.parse(readFileSync(f.config.ledgerPath,'utf8')).days['2026-11-12'].costNano;
 const cost=s.cost(id);s.close();assert.equal(cost.sessionEstimateUsd,nano/1e9);
});

test('missing server key without an injected provider cannot authorize or reserve',async t=>{
 const f=fixture(t);let touched=0;
 const s=createIndiaConversation({root:f.root,config:{...f.config,apiKey:''},permit:f.permit,clock:()=>new Date('2026-11-12T10:00:00.000Z'),ledgerFactory:()=>{touched++;throw Error('unexpected');}});
 assert.equal(s.status(owner()).available,false);assert.throws(()=>s.authorize(owner(),{acknowledgeCost:true}));
 await assert.rejects(s.reply(owner(),'Bonjour',{data}));assert.equal(touched,0);s.close();
});

test('expiry permanently revokes the lease even if injected wall clock moves backward',async t=>{
 const f=fixture(t),id=owner();f.service.authorize(id,{acknowledgeCost:true});
 f.setNow('2026-11-12T10:05:00.000Z');assert.equal(f.service.status(id).authorized,false);
 f.setNow('2026-11-12T10:00:01.000Z');assert.equal(f.service.status(id).authorized,false);
 await assert.rejects(f.service.reply(id,'Bonjour',{data}));assert.equal(f.calls.length,0);
 assert.throws(()=>f.service.authorize(id,{acknowledgeCost:true}));
});

test('permit calendar dates and unknown fields are rejected, smaller trusted ceilings work',async t=>{
 const f=fixture(t);
 for(const patch of [{expiresAt:'2026-11-31T10:05:00.000Z'},{extra:true}]){
  const s=createIndiaConversation({root:f.root,config:f.config,permit:{...f.permit,...patch},clock:()=>new Date('2026-11-12T10:00:00.000Z')});
  assert.equal(s.status(owner()).available,false);s.close();
 }
 const s=createIndiaConversation({root:f.root,config:f.config,permit:{...f.permit,maxRequests:1,durationSeconds:1},provider:async()=>({reply:'Bonjour',contactIds:[],toolCalls:[],usage:{inputTokens:0,outputTokens:0}}),clock:()=>new Date('2026-11-12T10:00:00.000Z')});
 const id=owner();assert.equal(s.authorize(id,{acknowledgeCost:true}).remainingRequests,1);
 assert.equal(s.status(id).expiresAt,'2026-11-12T10:00:01.000Z');await s.reply(id,'Bonjour',{data});
 await assert.rejects(s.reply(id,'Encore',{data}));s.close();
});

test('unsafe free prose is rejected after known usage is settled, without cost loss',async t=>{
 for(const text of ['<b>Bonjour</b>','Consultez exemple.fr','5.123, -4.456','Latitude cinq degrés nord, longitude quatre degrés ouest.','Une équipe se dirige vers vous.','Votre demande est prise en charge.','Nous intervenons immédiatement.','Le contact est le zéro sept huit neuf un deux trois quatre.']){
  const f=fixture(t,{provider:async()=>({reply:text,contactIds:[],toolCalls:[],usage:{inputTokens:100,outputTokens:20,cachedInputTokens:0}})}),id=owner();
  f.service.authorize(id,{acknowledgeCost:true});
  await assert.rejects(f.service.reply(id,'Bonjour',{data}),/^Error: INDIA indisponible\.$/,text);
  assert.equal(f.service.cost(id).sessionEstimateUsd,0.00042,text);
  assert.equal(JSON.parse(readFileSync(f.config.ledgerPath,'utf8')).days['2026-11-12'].costNano,420000);
 }
});

test('unknown or invalid usage retains full reservation and does not leak raw errors',async t=>{
 for(const usage of [null,{inputTokens:NaN,outputTokens:1},{inputTokens:1.1,outputTokens:1},{inputTokens:22049,outputTokens:1},{inputTokens:1,outputTokens:201},{inputTokens:1,outputTokens:1,cachedInputTokens:2},{inputTokens:1,outputTokens:1,cachedInputTokens:-1}]){
  const f=fixture(t,{provider:async()=>({reply:'Bonjour',contactIds:[],toolCalls:[],usage})}),id=owner();f.service.authorize(id,{acknowledgeCost:true});
  await assert.rejects(f.service.reply(id,'Bonjour',{data}),/^Error: INDIA indisponible\.$/);
  assert.equal(f.service.cost(id).sessionEstimateUsd,f.service.cost(id).provisionUsd);
 }
});

test('caller abort rejects promptly, retains provision and ignores late provider history',async t=>{
 let finish;const seen=[];
 const response={reply:'Un échange tardif.',contactIds:[],toolCalls:[],usage:{inputTokens:100,outputTokens:20}};
 const f=fixture(t,{provider:request=>{seen.push(request);return seen.length===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve(response);}}),id=owner();
 f.service.authorize(id,{acknowledgeCost:true});const controller=new AbortController();
 const pending=f.service.reply(id,'Bonjour',{data,signal:controller.signal});
 const result=pending.then(()=> 'accepted',()=> 'rejected');controller.abort();
 assert.equal(await Promise.race([result,new Promise(resolve=>setTimeout(()=>resolve('waiting'),100))]),'rejected');
 assert.equal(seen[0].signal.aborted,true);
 const retained=f.service.cost(id).provisionUsd;assert.equal(f.service.cost(id).sessionEstimateUsd,retained);
 finish(response);await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(f.service.reply(id,'Parlons de lecture',{data}));assert.equal(seen.length,1);assert.equal(f.service.status(id).endReason,'cancelled');
 assert.ok(f.service.cost(id).sessionEstimateUsd>=retained);
});

test('end revokes immediately during pending generation and cannot be reauthorized',async t=>{
 let finish,observed;
 const f=fixture(t,{provider:request=>{observed=request;return new Promise(resolve=>{finish=resolve;});}}),id=owner();
 f.service.authorize(id,{acknowledgeCost:true});
 const pending=f.service.reply(id,'Bonjour',{data}).then(()=> 'accepted',()=> 'rejected');
 f.service.end(id);
 assert.equal(f.service.status(id).authorized,false);assert.equal(observed.signal.aborted,true);
 assert.equal(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('waiting'),100))]),'rejected');
 finish({reply:'Bonjour',contactIds:[],toolCalls:[],usage:{inputTokens:1,outputTokens:1}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.throws(()=>f.service.authorize(id,{acknowledgeCost:true}));
 assert.equal(f.service.cost(id).sessionEstimateUsd,f.service.cost(id).provisionUsd);
});

test('original classification and baseline prevent all protected routes before ledger access and clear general history',async t=>{
 const f=fixture(t),id=owner();f.service.authorize(id,{acknowledgeCost:true});
 await f.service.reply(id,'Parlons de lecture.',{data});
 for(const message of ['Je veux renouveler mon passeport','Bonjour, quelles pièces pour un visa ?', 'Où est la pharmacie ?', 'Je suis diabétique', 'accidan avec blese', 'Je veux un humain', 'Je veux payer', 'Explique les accidents', 'Mon mot de passe est caché']) {
  await assert.rejects(f.service.reply(id,message,{data}),/^Error: INDIA indisponible\.$/);
 }
 await assert.rejects(f.service.reply(id,'Et les pièces ?',{data}));
 assert.equal(f.calls.length,1);
 await f.service.reply(id,'Nouveau sujet : parlons de lecture.',{data});
 assert.equal(f.calls[1].input.length,1);
 assert.equal(f.service.status(id).remainingRequests,1);
 const g=fixture(t,{ledgerFactory:()=>{throw Error('must not reach ledger');}}),who=owner();g.service.authorize(who,{acknowledgeCost:true});
 await assert.rejects(g.service.reply(who,'Je veux renouveler une carte nationale',{data}));assert.equal(g.calls.length,0);
});

test('authorized natural French conversation rereads soul and carries only redacted general context',async t=>{
 const f=fixture(t),id=owner();f.service.authorize(id,{acknowledgeCost:true});
 const first=await f.service.reply(id,'Bonjour, mon courriel est exemple@example.test. Parlons de lecture.',{data});
 assert.equal(first.source,'openai');assert.equal(first.openaiEnabled,true);assert.equal(first.real.authorized,true);
 assert.equal(first.reply,'Bonjour, quel sujet souhaitez-vous explorer ?');
 assert.equal(first.cost.estimateUsd,0.00042);assert.equal(first.cost.sessionEstimateUsd,0.00042);
 writeFileSync(path.join(f.root,'soul.md'),'Identité actualisée : INDIA.');
 await f.service.reply(id,'Oui, développons cette idée.',{data});
 assert.equal(f.calls.length,2);const second=f.calls[1];
 assert.match(second.instructions,/Identité actualisée/);assert.deepEqual(second.tools,[]);
 assert.equal(second.input.length,3);assert.match(second.input[0].content,/courriel masqué/);
 assert.ok(!JSON.stringify(second).includes('exemple@example.test'));
 assert.ok(Buffer.byteLength(JSON.stringify({instructions:second.instructions,input:second.input,tools:[]}))<=20000);
 assert.equal(f.service.cost(id).sessionEstimateUsd,0.00084);
 assert.equal(f.service.status(id).remainingRequests,1);
 const ledger=JSON.parse(readFileSync(f.config.ledgerPath,'utf8'));
 assert.equal(ledger.days['2026-11-12'].providerCalls,2);assert.equal(ledger.days['2026-11-12'].costNano,840000);
 assert.ok(!JSON.stringify(ledger).includes('lecture'));
});

test('authorization consumes a durable exclusive grant without initializing paid dependencies',t=>{
 let touched=0;
 const f=fixture(t,{ledgerFactory:()=>{touched++;throw Error('unexpected');}}),id=owner();
 assert.equal(f.service.status(id).available,true);
 assert.equal(f.service.status(id).authorized,false);
 for(const args of [undefined,{}, {acknowledgeCost:false}]) assert.throws(()=>f.service.authorize(id,args));
 for(const invalid of ['', 'owner', {}, null]) assert.throws(()=>f.service.authorize(invalid,{acknowledgeCost:true}));
 const state=f.service.authorize(id,{acknowledgeCost:true});
 assert.equal(state.authorized,true);assert.equal(state.remainingRequests,3);
 assert.equal(state.expiresAt,f.permit.expiresAt);assert.equal(state.requiresOwnerApproval,false);
 assert.equal(touched,0);
 const marker=path.join(f.root,'var',`india-permit-${f.permit.id}.used`);
 assert.equal(statSync(marker).mode&0o777,0o600);
 assert.ok(!readFileSync(marker,'utf8').includes(id));
 assert.deepEqual(f.service.authorize(id,{acknowledgeCost:true}),state);
 assert.throws(()=>f.service.authorize(owner(),{acknowledgeCost:true}));
 const restarted=createIndiaConversation({root:f.root,config:f.config,permit:f.permit});
 assert.throws(()=>restarted.authorize(id,{acknowledgeCost:true}));restarted.close();
 f.service.end(id);assert.equal(f.service.status(id).authorized,false);
 assert.throws(()=>f.service.authorize(id,{acknowledgeCost:true}));
});

test('invalid grants and unknown models never allow authorization',t=>{
 const changes=[{version:2},{id:'../bad'},{approved:false},{model:'other'},{expiresAt:'bad'}, {expiresAt:'2020-01-01T00:00:00.000Z'}, {maxRequests:4},{maxRequests:0},{durationSeconds:301},{durationSeconds:0},{sessionCapNano:150000001},{sessionCapNano:0}];
 for(const change of changes){
  const f=fixture(t);f.service.close();
  const s=createIndiaConversation({root:f.root,config:f.config,permit:{...f.permit,...change}});
  assert.equal(s.status(owner()).available,false);assert.throws(()=>s.authorize(owner(),{acknowledgeCost:true}));s.close();
 }
 const f=fixture(t);const s=createIndiaConversation({root:f.root,config:{...f.config,model:'unknown'},permit:{...f.permit,model:'unknown'}});
 assert.equal(s.status(owner()).available,false);s.close();
});

test('no permit is disabled despite paid configuration and never initializes dependencies',async t=>{
 let touched=0;
 const f=fixture(t,{permit:null,provider:()=>{touched++;},ledgerFactory:()=>{touched++;throw Error('unexpected');}});
 const id=owner();
 assert.deepEqual(f.service.status(id),{available:false,authorized:false,remainingRequests:0,expiresAt:null,requiresOwnerApproval:true,maxRequests:3,durationSeconds:300,sessionCapUsd:0.15,model:f.config.model,state:'unavailable',endReason:null,startedAt:null,endedAt:null,usedRequests:0,remainingAuthorizedRequests:0,remainingSeconds:0,serverNow:'2026-11-12T10:00:00.000Z',auditAvailable:true});
 assert.equal(f.service.cost(id).sessionEstimateUsd,0);
 assert.throws(()=>f.service.authorize(id,{acknowledgeCost:true}));
 await assert.rejects(f.service.reply(id,'Bonjour',{data}));
 assert.equal(touched,0);
});
