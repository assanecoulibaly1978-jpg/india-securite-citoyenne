import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../public/private-test.mjs';
import {readFileSync} from 'node:fs';

class Element {
 constructor(){this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.children=[];this.handlers={};this.files=[];this.attrs={};}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;} removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){this.handlers[k]=fn;} async fire(type,event={}){await this.handlers[type]?.({preventDefault(){},...event});}
 showModal(){this.open=true;} close(){this.open=false;}
}
function fixture(){
 const nodes=new Map();const win=new Element();win.location={hash:''};
 const doc=new Element();Object.assign(doc,{getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(tag){const el=new Element();el.tagName=tag.toUpperCase();return el;},querySelectorAll(){return [];},querySelector(){return null;}});
 doc.getElementById('private-panel').hidden=true;doc.getElementById('private-session').hidden=true;
 return {doc,win,get:id=>doc.getElementById(id)};
}
const response=data=>({ok:true,status:200,json:async()=>data});
const cost={estimateUsd:0,sessionEstimateUsd:0.04,dailyLimitUsd:1,monthlyLimitUsd:2};
const real={available:false,authorized:false,state:'ended',endReason:'quota_exhausted',expiresAt:'2026-11-13T15:05:00Z',usedRequests:3,remainingRequests:0,maxRequests:3};
const auth={authenticated:true,openaiEnabled:false,real,cost,localGeneralAllowed:false};
async function setup(message=auth,status=auth){
 const f=fixture(),calls=[];
 client.mountPrivateTest(f.doc,f.win,async(url,options)=>{calls.push({url,method:options.method,body:options.body,headers:options.headers});return response(url.endsWith('/status')?status:url.endsWith('/local-mode')?{...auth,localGeneralAllowed:true,real:{...real,endReason:'manual_local'}}:message);});
 await f.get('private-open').fire('click');return {...f,calls};
}
async function send(f,text='Question fictive'){f.get('private-input').value=text;await f.get('private-form').fire('submit');}

test('ended notice survives local replies and generic status, preserves costs and explicit local choice',async()=>{
 const f=await setup({...auth,source:'documentation',reply:'Dossier local',real:{available:false,authorized:false}});
 assert.match(f.get('private-real-status').textContent,/quota|3 appels/i);
 assert.equal(f.get('private-local-continue').hidden,false);
 await send(f);
 assert.match(f.get('private-real-status').textContent,/quota|3 appels/i);
 assert.match(f.get('private-real-status').textContent,/2026-11-13T15:05:00Z/);
 assert.match(f.get('private-cost').textContent,/message : 0 USD.*session : 0.04 USD/);
 assert.equal(f.get('private-input').disabled,false);
 await f.get('private-local-continue').fire('click');
 const local=f.calls.filter(c=>c.url.endsWith('/local-mode'));assert.equal(local.length,1);assert.equal(local[0].method,'POST');assert.deepEqual(JSON.parse(local[0].body),{enabled:true});assert.equal(local[0].headers['x-private-test'],'1');
 assert.equal(f.calls.filter(c=>c.url.endsWith('/message')).length,1,'local choice never resends a question');
 assert.equal(f.get('private-local-continue').hidden,true);assert.match(f.get('private-real-status').textContent,/local.*choisi|choisi.*local/i);
});
test('cost summary distinguishes the free current message, last real call and cumulative estimate',async()=>{
 const f=await setup({...auth,source:'rules',reply:'Réponse locale.',localGeneralAllowed:true,cost:{...cost,lastCallEstimateUsd:0.00617,sessionEstimateUsd:0.01234}});
 await send(f);assert.match(f.get('private-cost').textContent,/message : 0 USD/);assert.match(f.get('private-cost').textContent,/dernier appel OpenAI \(estimé\) : 0.00617 USD/);assert.match(f.get('private-cost').textContent,/session : 0.01234 USD/);assert.match(f.get('private-log').children.at(-1).children[0].textContent,/Moteur local/);await f.win.fire('pagehide');
});

test('only the terminal successful third OpenAI answer accepts revoked authorization',async()=>{
 const f=await setup({...auth,source:'openai',openaiEnabled:true,reply:'Troisième réponse réelle'});await send(f);
 assert.equal(f.get('private-log').children[1]?.children[0].textContent,'INDIA · OpenAI réel');
 assert.match(f.get('private-real-status').textContent,/quota|3 appels/i);
 for(const changed of [{endReason:'provider_error'},{usedRequests:2},{remainingRequests:1},{state:'active'},{available:true},{maxRequests:4}]){
  const bad=await setup({...auth,source:'openai',openaiEnabled:true,reply:'UNTRUSTED',real:{...real,...changed}});await send(bad);assert.equal(bad.get('private-log').children.length,1);
 }
});
test('session blocked answer retains question and has no false local-engine identity',async()=>{
 const f=await setup({...auth,source:'session',answerType:'session_ended',blocked:true,reply:'Session terminée. Choisissez explicitement le mode local.'});await send(f);
 assert.equal(f.get('private-log').children[1].children[0].textContent,'Session OpenAI terminée');assert.equal(f.get('private-input').value,'Question fictive');
 assert.doesNotMatch(f.get('private-status').textContent,/aucun appel|moteur local/i);
});
test('countdown updates locally with server skew, and pagehide cleans up without generation',async()=>{
 const now=Date.now(),serverNow=new Date(now+3600000).toISOString();
 const f=await setup(auth,{...auth,serverNow,real:{...real,state:'active',endReason:null,authorized:true,startedAt:serverNow,expiresAt:new Date(now+3600000+2200).toISOString(),usedRequests:1,remainingRequests:2,remainingSeconds:3}});
 assert.match(f.get('private-real-timer').textContent,/00:03/);assert.match(f.get('private-real-count').textContent,/1.*3.*2/);
 await new Promise(resolve=>setTimeout(resolve,1100));assert.match(f.get('private-real-timer').textContent,/00:02/);assert.equal(f.calls.length,1);
 await new Promise(resolve=>setTimeout(resolve,2100));assert.match(f.get('private-real-status').textContent,/expirée/i);assert.match(f.get('private-real-status').textContent,/horloge|confirmation/i);
 await f.win.fire('pagehide');assert.equal(f.get('private-session').hidden,true);
});
test('only authenticated idle visibility rechecks status, never a model request',async()=>{
 const f=await setup();f.doc.visibilityState='visible';await f.doc.fire('visibilitychange');assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.method==='GET'));
 await f.win.fire('pagehide');await f.doc.fire('visibilitychange');assert.equal(f.calls.length,2);
});
test('every terminal reason persists with its original expiry, without disabling local requests',async()=>{
 const cases={expired:/expirée/,quota_exhausted:/Quota/,budget_exhausted:/Budget/,safety_boundary:/sécurité/,local_boundary:/localement/,sensitive_boundary:/sensible/,administrative_boundary:/administrative/,cleared:/effacement/,logout:/déconnexion/,provider_error:/fournisseur/,output_rejected:/rejetée/,invalid_usage:/usage/,timeout:/délai/,cancelled:/annulée/,ledger_unavailable:/registre/,audit_unavailable:/audit/,server_closed:/serveur fermé/,manual_local:/mode local/};
 for(const [endReason,label] of Object.entries(cases)){
  const ended={...real,endReason,usedRequests:1,remainingRequests:2};
  const f=await setup({...auth,source:'rules',reply:'Urgence locale',real:{available:false,authorized:false}}, {...auth,real:ended});
  await send(f);assert.match(f.get('private-real-status').textContent,label,endReason);assert.match(f.get('private-real-status').textContent,/2026-11-13T15:05:00Z/);assert.match(f.get('private-real-count').textContent,/1.*3.*2.*non autorisés/);assert.equal(f.get('private-send').disabled,false);
 }
});
test('visibility cannot interrupt a busy message and rejected local-mode does not claim consent',async()=>{
 const f=fixture();let finish;const calls=[];
 client.mountPrivateTest(f.doc,f.win,(url,options)=>{calls.push(url);if(url.endsWith('/message'))return new Promise(resolve=>{finish=resolve;});return Promise.resolve(response(auth));});
 await f.get('private-open').fire('click');f.get('private-input').value='Fictif';const pending=f.get('private-form').fire('submit');
 f.doc.visibilityState='visible';await f.doc.fire('visibilitychange');await f.win.fire('pageshow');assert.equal(calls.length,2);
 finish(response({...auth,source:'session',answerType:'session_ended',blocked:true,reply:'Choisissez le mode local.'}));await pending;
 await f.get('private-local-continue').fire('click');assert.equal(f.get('private-local-continue').hidden,false);assert.doesNotMatch(f.get('private-status').textContent,/mode local choisi/i);assert.equal(calls.filter(u=>u.endsWith('/message')).length,1);
});
test('private session summary exists without storage or executable DOM rendering',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['private-real-timer','private-real-count','private-local-continue'])assert.match(html,new RegExp(`id="${id}"`));
 const text=readFileSync(new URL('../public/private-test.mjs',import.meta.url),'utf8');assert.doesNotMatch(text,/localStorage|sessionStorage|innerHTML/);
});

test('ready legacy status shows no used calls; server remaining seconds limits display',()=>{
 assert.equal(client.sessionView({available:true,authorized:false,remainingRequests:0}).usedRequests,0);
 const now=Date.parse('2026-11-13T15:00:00Z');
 const r={state:'active',authorized:true,expiresAt:'2026-11-13T15:05:00Z',remainingSeconds:12,observedAt:now};
 assert.equal(client.sessionView(r,now).remainingSeconds,12);
 assert.equal(client.sessionView(r,now+1000).remainingSeconds,11);
 assert.equal(client.sessionView(r,now+12000).state,'ended');
});

test('session clock is server-aligned, capped at five minutes and marks inferred expiry honestly',()=>{
 const real={state:'active',authorized:true,expiresAt:'2026-11-13T15:05:00Z',startedAt:'2026-11-13T15:00:00Z',remainingSeconds:300,usedRequests:1,remainingRequests:2,maxRequests:3};
 const now=Date.parse('2026-11-13T15:00:00Z');
 assert.equal(client.sessionView(real,now).remainingSeconds,300);
 assert.equal(client.sessionView(real,now+1000).remainingSeconds,299);
 assert.equal(client.sessionView({...real,expiresAt:'2026-11-13T16:00:00Z'},now).remainingSeconds,300);
 const ended=client.sessionView(real,now+300000);
 assert.equal(ended.state,'ended');assert.equal(ended.endReason,'expired');assert.equal(ended.inferred,true);
 assert.equal(ended.usedRequests,1);assert.equal(ended.remainingRequests,2);
});
