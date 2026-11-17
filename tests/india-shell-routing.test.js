import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeForHash,routeForLegacyTab,sessionSummary} from '../public/india-shell.mjs';
import * as shell from '../public/india-shell.mjs';
test('public pending signal blocks adapter dispatch even when original controls remain enabled',()=>{
 assert.equal(typeof shell.composerIsBusy,'function','existing public pending signal must be honored');
 const status={textContent:'Recherche en cours…'},privateInput={disabled:false};
 const doc={getElementById(id){return id==='chat-status'?status:id==='private-input'?privateInput:id.endsWith('-input')?{disabled:false}:id.endsWith('-form')?{querySelector:()=>({disabled:false})}:null;}};
 assert.equal(shell.composerIsBusy(doc,false),true);assert.equal(shell.composerIsBusy(doc,true),false);
 status.textContent='';assert.equal(shell.composerIsBusy(doc,false),false);
 privateInput.disabled=true;assert.equal(shell.composerIsBusy(doc,true),true);
});
test('legacy Assistant listener preserves the private hash before the original hash handler finishes',()=>{
 const route=routeForLegacyTab('assistant','#mode-test-prive');assert.equal(route.view,'converser');assert.equal(route.private,true);
 assert.equal(routeForLegacyTab('assistant','#accueil').private,false);
 assert.equal(routeForLegacyTab('sources','#accueil').legacy,'sources');
});
test('new destinations retain legacy links and the authenticated private entry',()=>{
 for(const [hash,view] of [['#accueil','accueil'],['#converser','converser'],['#assistant','converser'],['#mode-test-prive','converser'],['#services','services'],['#sources','services'],['#annuaire','services'],['#urgences','services'],['#historique','historique'],['#mon-compte','compte']])assert.equal(routeForHash(hash).view,view,hash);
 assert.equal(routeForHash('#mode-test-prive').private,true);assert.equal(routeForHash('#sources').legacy,'sources');assert.equal(routeForHash('#urgences').emergency,true);assert.equal(routeForHash('#untrusted').view,'accueil');
});
test('history exposes only real session counts, never copies message contents',()=>{
 const doc={getElementById(id){return id==='private-session'?{hidden:false}:id==='chat-log'?{querySelectorAll:()=>[{},{}]}:id==='private-log'?{querySelectorAll:()=>[{textContent:'Vous · essai privé'},{textContent:'Base documentaire locale'}]}:null;}};
 assert.deepEqual(sessionSummary(doc),{publicMessages:2,privateMessages:1,privateOpen:true});
});
test('navigation uses existing controls, not new storage, transport, accounts or authorization',()=>{
 const source=readFileSync(new URL('../public/india-shell.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|innerHTML|\.authorize\s*\(/);
 for(const id of ['private-form','chat-form','private-clear','reset-chat','private-open'])assert.ok(source.includes(id),id);
});
