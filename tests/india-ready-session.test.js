import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {loadIndiaPermit} from '../lib/ai/india-permit.js';
import {createIndiaConversation} from '../lib/ai/india.js';
import {readAIConfig} from '../lib/ai/config.js';
import {createOpenAITransport} from '../lib/ai/openai.js';

function fixture(t){
 const root=mkdtempSync('/Users/assane/.hermes/cache/scratch/india-prepared-');mkdirSync(path.join(root,'var'),{mode:0o700});
 writeFileSync(path.join(root,'soul.md'),readFileSync(new URL('../soul.md',import.meta.url)));
 let now=new Date('2026-11-13T10:00:00.000Z');
 const config={...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'fictional-local-transport-test'};
 const record={version:1,id:randomUUID(),approved:true,model:config.model,expiresAt:'2026-11-13T11:00:00.000Z',maxRequests:3,durationSeconds:300,sessionCapNano:150000000,pricingReviewedOn:'2026-11-13',pricingSource:'https://developers.openai.com/api/docs/models/gpt-6.1-terra.md'};
 const file=path.join(root,'var/india-real-permit.json');writeFileSync(file,JSON.stringify(record),{mode:0o600});
 const services=[];t.after(()=>{for(const service of services)service.close();rmSync(root,{recursive:true,force:true});});
 return {root,config,record,file,clock:()=>now,setNow:value=>now=new Date(value),track:service=>{services.push(service);return service;}};
}

test('pending owner preparation lasts at most one hour but never authorizes a browser or generation',async t=>{
 const f=fixture(t);const permit=loadIndiaPermit(f.root,f.config,{clock:f.clock});assert.ok(permit,'A prepared test must not expire before the owner reads the Safari instructions');
 let calls=0;const service=f.track(createIndiaConversation({root:f.root,config:f.config,permit,clock:f.clock,provider:async()=>{calls++;throw Error('must not generate');}}));
 const id=randomUUID();assert.equal(service.status(id).available,true);assert.equal(service.status(id).authorized,false);
 await assert.rejects(service.reply(id,'Bonjour',{data:{records:[]}}));assert.equal(calls,0);assert.equal(existsSync(f.config.ledgerPath),false);
 f.setNow('2026-11-13T10:12:00.000Z');const state=service.authorize(id,{acknowledgeCost:true});
 assert.equal(state.expiresAt,'2026-11-13T10:17:00.000Z','Five-minute conversation starts only at explicit cost confirmation');assert.equal(calls,0);
 f.setNow('2026-11-13T10:17:00.000Z');assert.equal(service.status(id).authorized,false);assert.throws(()=>service.authorize(id,{acknowledgeCost:true}));
});

test('pending preparation beyond one hour and after its reviewed UTC day is rejected',t=>{
 const f=fixture(t);
 writeFileSync(f.file,JSON.stringify({...f.record,expiresAt:'2026-11-13T11:00:00.001Z'}));assert.equal(loadIndiaPermit(f.root,f.config,{clock:f.clock}),null);
 f.setNow('2026-11-13T23:40:00.000Z');writeFileSync(f.file,JSON.stringify({...f.record,expiresAt:'2026-11-14T00:10:00.000Z'}));assert.equal(loadIndiaPermit(f.root,f.config,{clock:f.clock}),null);
});

test('three general French turns use the OpenAI wire format and retain the original context without an external request',async t=>{
 const f=fixture(t);const wire=[];
 const replies=['Voici un plan : présenter le problème, proposer une action simple, puis expliquer les bénéfices pour le quartier.','Pour la deuxième partie, proposez une action collective simple, par exemple une séance de nettoyage.','Nous avons préparé une présentation sur la propreté du quartier. Son plan comporte trois parties. Nous avons développé une action collective concrète.'];
 const transport=createOpenAITransport({apiKey:f.config.apiKey,model:f.config.model,maxOutputTokens:200,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);wire.push(body);assert.equal(body.store,false);assert.equal(body.service_tier,'default');assert.equal(body.model,'gpt-6.1-terra');assert.deepEqual(body.reasoning,{effort:'none'});
  return new Response(JSON.stringify({status:'completed',incomplete_details:null,error:null,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({reply:replies[wire.length-1],contact_ids:[]})}]}],usage:{input_tokens:5000,output_tokens:120,input_tokens_details:{cached_tokens:0}}}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const permit=loadIndiaPermit(f.root,f.config,{clock:f.clock});assert.ok(permit);
 const service=f.track(createIndiaConversation({root:f.root,config:f.config,permit,clock:f.clock,provider:transport}));const id=randomUUID();
 await assert.rejects(service.reply(id,'Bonjour',{data:{records:[]}}));assert.equal(wire.length,0);service.authorize(id,{acknowledgeCost:true});assert.equal(wire.length,0);
 const prompts=['Je veux préparer une présentation de cinq minutes sur la propreté de mon quartier. Propose un plan en trois parties.','Dans ce plan, développe seulement la deuxième partie, avec un exemple simple.','Résume maintenant notre échange en trois phrases, en conservant le même sujet.'];
 for(let i=0;i<prompts.length;i++){
  const answer=await service.reply(id,prompts[i],{data:{records:[]}});assert.equal(answer.source,'openai');assert.equal(answer.openaiEnabled,true);assert.equal(wire[i].input.length,1+2*i);assert.equal(wire[i].input[0].content,prompts[0]);assert.ok(wire[i].instructions.startsWith(readFileSync(path.join(f.root,'soul.md'),'utf8')));assert.equal(answer.real.remainingRequests,2-i);
 }
 assert.equal(wire.length,3);assert.ok(service.cost(id).sessionEstimateUsd<=0.15);await assert.rejects(service.reply(id,'Une quatrième question',{data:{records:[]}}));assert.equal(wire.length,3);
 service.end(id);assert.throws(()=>service.authorize(id,{acknowledgeCost:true}));
});
