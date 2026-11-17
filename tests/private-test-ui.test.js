import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
test('private helpers reject executable URLs and label actual response provenance',async()=>{
 const url=new URL('../public/private-test.mjs',import.meta.url);
 assert.ok(existsSync(url),'private client module exists');
 const {safeSourceUrl,sourceBadge,costLabel}=await import(url);
 assert.equal(safeSourceUrl('javascript:alert(1)'),null);
 assert.equal(safeSourceUrl('/relative'),null);
 assert.equal(safeSourceUrl('https://example.org/source'),'https://example.org/source');
 assert.equal(sourceBadge('rules'),'Moteur local');
 assert.equal(sourceBadge('documentation'),'Base documentaire locale');
 assert.equal(sourceBadge('simulation'),'Simulation — pas OpenAI');
 assert.equal(sourceBadge('unexpected'),'Provenance non indiquée');
 assert.match(costLabel({estimateUsd:0,sessionEstimateUsd:0,dailyLimitUsd:1,monthlyLimitUsd:2}),/message : 0 USD.*session : 0 USD.*1.*2/);
});
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('documentary dossier is collapsed, complete and inert while uncertainty stays visible',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 const data={...auth,source:'documentation',reply:'Préparez votre démarche. À confirmer.',documentaryDetails:'DOSSIER <script>evil()</script> À confirmer.',sources:[{title:'<img onerror=evil()>',url:'javascript:evil()',consulted_on:'2026-11-12',published_on:'2025-03-02',reserves:['Applicabilité à confirmer']}],warnings:['Réserve documentaire']};
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:data));await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');
 const answer=doc.getElementById('private-log').children[1],details=answer.children.find(el=>el.tagName==='DETAILS');
 assert.ok(details,'collapsed sources disclosure exists');assert.notEqual(details.open,true);assert.equal(details.children[0].textContent,'Voir les sources');assert.equal(answer.children[1].textContent,data.reply);
 const flat=el=>[el,...el.children.flatMap(flat)],all=flat(details);
 for(const text of [data.documentaryDetails,'2026-11-12','2025-03-02','Applicabilité à confirmer','Réserve documentaire'])assert.ok(all.some(el=>el.textContent?.includes(text)),text);
 assert.ok(!all.some(el=>el.href?.startsWith('javascript:')||el.tagName==='SCRIPT'||el.tagName==='IMG'));
});

test('documentary uncertainty cannot disappear from the concise visible answer',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:{...auth,source:'documentation',reply:'Voici la prochaine étape.',documentaryDetails:'Tarifs : À confirmer auprès du service.'}));
 await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');assert.match(doc.getElementById('private-log').children[1].children[1].textContent,/À confirmer/);
});

test('client isolates private APIs, avoids persistent storage, and confirms calls in existing dialog',()=>{
 const client=readFileSync(new URL('../public/private-test.mjs',import.meta.url),'utf8');
 assert.match(client,/mountPrivateTest/);
 assert.match(client,/credentials:'same-origin'/);
 assert.match(client,/cache:'no-store'/);
 assert.match(client,/'x-private-test':'1'/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|innerHTML|console\.|Bearer/);
 assert.match(client,/call-dialog/);
 assert.match(client,/AbortController/);
 assert.match(client,/generation/);
});

class Element {
 constructor(){this.hidden=false;this.disabled=false;this.value='';this.checked=true;this.children=[];this.handlers={};this.files=[];this.attrs={};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){this.handlers[k]=fn;}
 async fire(type){await this.handlers[type]?.({preventDefault(){}});}
 focus(){} showModal(){this.open=true;} close(){this.open=false;}
}
function fixture(){
 const nodes=new Map();
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(tag){const el=new Element();el.tagName=tag.toUpperCase();return el;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}};
 const win={location:{hash:''},addEventListener(){}};
 for(const id of ['private-panel','private-session'])doc.getElementById(id).hidden=true;
 return {doc,win,nodes};
}
const response=(data={},status=200)=>({ok:status<400,status,json:async()=>data});
const auth={authenticated:true,openaiEnabled:false,simulationAvailable:true,cost:{estimateUsd:0,sessionEstimateUsd:0,dailyLimitUsd:1,monthlyLimitUsd:2}};
const realState={available:true,authorized:false,remainingRequests:0,expiresAt:null,requiresOwnerApproval:true,maxRequests:3,durationSeconds:300,sessionCapUsd:0.15};
test('real authorization requires explicit dialog confirmation, trusts server only and never sends a question',async()=>{
 const {mountPrivateTest,sourceBadge}=await import('../public/private-test.mjs');const {doc,win}=fixture();const calls=[];let denied=true;
 const granted={...realState,authorized:true,remainingRequests:3,expiresAt:new Date(Date.now()+300000).toISOString()};
 mountPrivateTest(doc,win,async(url,options)=>{calls.push([url,options.method,options.body]);if(url.endsWith('/status'))return response({...auth,real:realState});if(url.endsWith('/real-session'))return denied?response({},403):response({...auth,openaiEnabled:true,real:granted});return response({...auth,source:'openai',openaiEnabled:true,real:{...granted,remainingRequests:2},reply:'Bonjour, je suis INDIA.'});});
 await doc.getElementById('private-open').fire('click');const authorize=doc.getElementById('private-real-authorize');assert.equal(authorize.disabled,false);
 await authorize.fire('click');assert.equal(doc.getElementById('private-real-dialog').open,true);assert.equal(calls.length,1);
 await doc.getElementById('private-real-cancel').fire('click');assert.equal(doc.getElementById('private-real-dialog').open,false);assert.equal(calls.length,1);
 await authorize.fire('click');await doc.getElementById('private-real-confirm').fire('click');assert.equal(doc.getElementById('private-session').hidden,false,'denial must not log out');assert.equal(authorize.disabled,false);
 denied=false;await authorize.fire('click');await doc.getElementById('private-real-confirm').fire('click');assert.equal(authorize.disabled,true);assert.equal(calls.filter(([u])=>u.endsWith('/message')).length,0);
 const grantCall=calls.find(([u])=>u.endsWith('/real-session'));assert.deepEqual(JSON.parse(grantCall[2]),{acknowledgeCost:true});
 doc.getElementById('private-input').value='Bonjour';await doc.getElementById('private-form').fire('submit');assert.equal(doc.getElementById('private-log').children[1].children[0].textContent,'INDIA · OpenAI réel');
 assert.notEqual(sourceBadge('openai',false),'INDIA · OpenAI réel');assert.notEqual(sourceBadge('simulation',true),'INDIA · OpenAI réel');
});
test('untrusted paid claims without an authorized server session never render an OpenAI answer',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?{...auth,real:{...realState,available:false}}:{...auth,source:'openai',openaiEnabled:true,reply:'UNAUTHORIZED',real:{...realState,authorized:false}}));
 await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');assert.equal(doc.getElementById('private-log').children.length,1);assert.equal(doc.getElementById('private-real-authorize').disabled,true);
});
test('unavailable real controls stay locked, real expiry is automatic and clear preserves paid estimates',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();let real={...realState,available:false};let cost={...auth.cost,sessionEstimateUsd:0.08};
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?{...auth,cost,real}:{ok:true,openaiEnabled:false,cost,real:{...realState,available:false}}));
 await doc.getElementById('private-open').fire('click');assert.equal(doc.getElementById('private-real-authorize').disabled,true);await doc.getElementById('private-clear').fire('click');assert.match(doc.getElementById('private-cost').textContent,/session : 0.08 USD/);
 real={...realState,authorized:true,remainingRequests:1,expiresAt:new Date(Date.now()+30).toISOString()};await doc.getElementById('private-open').fire('click');await doc.getElementById('private-open').fire('click');await new Promise(resolve=>setTimeout(resolve,60));
 assert.match(doc.getElementById('private-real-status').textContent,/expirée/i);assert.equal(doc.getElementById('private-real-authorize').disabled,true);
});

test('erase waits for server success, preserves failed erase, and ignores late message',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');
 const {doc,win}=fixture();let resolveMessage,resolveErase;const calls=[];
 const fetcher=(url,options)=>{calls.push([url,options]);if(url.endsWith('/status'))return Promise.resolve(response(auth));if(url.endsWith('/message'))return new Promise(resolve=>{resolveMessage=resolve;});return new Promise(resolve=>{resolveErase=resolve;});};
 mountPrivateTest(doc,win,fetcher);
 await doc.getElementById('private-open').fire('click');
 const input=doc.getElementById('private-input');input.value='Question fictive';
 const pending=doc.getElementById('private-form').fire('submit');
 const log=doc.getElementById('private-log');assert.equal(log.children.length,1);
 const erasing=doc.getElementById('private-clear').fire('click');
 assert.equal(log.children.length,1,'not erased before response');
 resolveErase(response({},500));await erasing;
 assert.equal(log.children.length,1,'failed erase keeps log');
 assert.doesNotMatch(doc.getElementById('private-status').textContent,/essai effacé/i);
 resolveMessage(response({...auth,reply:'LATE',source:'rules'}));await pending;
 assert.equal(log.children.length,1,'late answer cannot reappear');
 const eraseOk=doc.getElementById('private-clear').fire('click');resolveErase(response());await eraseOk;
 assert.equal(log.children.length,0);assert.match(doc.getElementById('private-status').textContent,/essai effacé/i);assert.match(doc.getElementById('private-cost').textContent,/session : 0 USD/);
 for(const [,options]of calls){assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');if(options.method!=='GET')assert.equal(options.headers['x-private-test'],'1');}
});

test('authentication loss removes private DOM and composer content',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:{},url.endsWith('/status')?200:403));
 await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');
 assert.equal(doc.getElementById('private-log').children.length,0);assert.equal(doc.getElementById('private-input').value,'');assert.equal(doc.getElementById('private-session').hidden,true);assert.equal(doc.getElementById('private-login').hidden,false);
});
test('access file is cleared before login and serialized credential reference is dropped promptly',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();let suppliedOptions,capturedBody,finish;
 mountPrivateTest(doc,win,(url,options)=>{suppliedOptions=options;capturedBody=options.body;return new Promise(resolve=>{finish=resolve;});});
 const input=doc.getElementById('private-file');input.value='selected';input.files=[{name:'access.json',size:64,text:async()=>JSON.stringify({accessKey:'fictional-test-key'})}];
 const pending=input.fire('change');await Promise.resolve();await Promise.resolve();
 assert.equal(input.value,'');assert.equal(JSON.parse(capturedBody).accessKey,'fictional-test-key');assert.equal(suppliedOptions.body,undefined,'drop caller-side serialized key before awaiting server');
 finish(response(auth));await pending;assert.equal(doc.getElementById('private-session').hidden,false);
});
test('logout failures keep recovery buttons usable and do not claim disconnection',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();let code=500;
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:{},url.endsWith('/status')?200:code));
 await doc.getElementById('private-open').fire('click');await doc.getElementById('private-logout').fire('click');
 assert.equal(doc.getElementById('private-session').hidden,false);assert.equal(doc.getElementById('private-clear').disabled,false);assert.doesNotMatch(doc.getElementById('private-status').textContent,/déconnexion confirmée/i);
 code=200;await doc.getElementById('private-logout').fire('click');assert.equal(doc.getElementById('private-session').hidden,true);assert.match(doc.getElementById('private-status').textContent,/déconnexion confirmée/i);
});
test('source badges never accept inherited object properties',async()=>{const {sourceBadge}=await import('../public/private-test.mjs');assert.equal(sourceBadge('constructor'),'Provenance non indiquée');assert.equal(sourceBadge('toString'),'Provenance non indiquée');});
test('private rendered sources and calls stay inert until explicit confirmation',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 const data={...auth,source:'documentation',reply:'<img src=x onerror=alert(1)>',sources:[{title:'Source réelle',url:'https://example.org/doc',consulted_on:'2026-11-12'},{title:'Unsafe',url:'javascript:alert(1)'}],actions:[{type:'call',number:'180',label:'Pompiers'}],results:[{name:'Service importé',address:'Adresse publiée',source_url:'https://example.org/annuaire',retrieved_at:'2026-11-12',callable_phones:['+2250102030405']}]};
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:data));await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');
 const answer=doc.getElementById('private-log').children[1];assert.equal(answer.children[0].textContent,'Base documentaire locale');assert.equal(answer.children[1].textContent,data.reply);assert.equal(doc.getElementById('call-dialog').open,undefined);
 const flat=el=>[el,...el.children.flatMap(flat)];const all=flat(answer);assert.ok(all.some(el=>el.href==='https://example.org/doc'));assert.ok(all.some(el=>el.textContent?.includes('2026-11-12')));assert.ok(all.some(el=>el.textContent==='Adresse publiée'));assert.ok(!all.some(el=>el.href?.startsWith('javascript:')));
 await answer.children[2].children[0].fire('click');assert.equal(doc.getElementById('call-dialog').open,true);assert.equal(doc.getElementById('confirm-call').href,'tel:180');
 await doc.getElementById('call-dialog').fire('close');
 doc.getElementById('call-dialog').open=true;
 await doc.getElementById('private-logout').fire('click');assert.equal(doc.getElementById('call-dialog').open,true,'private logout does not close a later public dialog');
});
test('private styles use existing palette, wrap content and adapt to narrow screens',()=>{
 const url=new URL('../public/private-test.css',import.meta.url);assert.ok(existsSync(url),'private stylesheet exists');const css=readFileSync(url,'utf8');assert.match(css,/var\(--navy\)/);assert.match(css,/overflow-wrap:\s*anywhere/);assert.match(css,/@media/);assert.match(css,/min-width:\s*0/);
});
test('private entry lives inside existing Assistant and keeps public composer',()=>{
 const assistant=html.slice(html.indexOf('<section id="assistant"'),html.indexOf('<section id="sources"'));
 assert.match(assistant,/id="private-open"/);
 assert.match(assistant,/Mon fichier d’accès/);
 assert.match(assistant,/id="chat-form"/);
 assert.match(assistant,/Mode habituel/);
 assert.match(html,/<script type="module" src="\/private-test.mjs"><\/script>/);
 assert.match(html,/<link rel="stylesheet" href="\/private-test.css">/);
});

test('a fallback with retained cost never announces that no OpenAI call occurred',async()=>{
 const {mountPrivateTest}=await import('../public/private-test.mjs');const {doc,win}=fixture();
 mountPrivateTest(doc,win,async url=>response(url.endsWith('/status')?auth:{...auth,source:'rules',reply:'Réponse de repli.',cost:{...auth.cost,estimateUsd:0.02,sessionEstimateUsd:0.02}}));
 await doc.getElementById('private-open').fire('click');doc.getElementById('private-input').value='Fictif';await doc.getElementById('private-form').fire('submit');
 assert.match(doc.getElementById('private-status').textContent,/provision|engagé/i);
 assert.doesNotMatch(doc.getElementById('private-status').textContent,/aucun appel/i);
});
