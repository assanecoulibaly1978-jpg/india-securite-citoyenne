import test from 'node:test';
import assert from 'node:assert/strict';
import {chat} from '../lib/assistant.js';
const data={records:[],sources:[],coverage:{},limitations:[]};
const clock=()=>new Date('2026-11-11T14:00:00Z');
for(const message of ['Il y a finalement un blessé','Personne n’est blessé, mais une autre personne est blessée'])test('injury report overrides a material route: '+message,()=>{const r=chat({message,state:{accident:{version:1,route:'material',step:'description',fields:{location:'Cocody'}}}},data,clock);assert.equal(r.intent,'emergency');assert.ok(r.actions.some(a=>a.number==='180'));assert.equal(r.state.accident.route,'injury');});
test('failed material-damage contact retries police and gendarmerie, not a fabricated medical case',()=>{const r=chat({message:'Non, l’appel ne passe pas',state:{accident:{version:1,route:'material',step:'call_check',fields:{}}}},data,clock);assert.ok(r.actions.some(a=>a.number==='100'));assert.ok(r.actions.some(a=>a.number==='145'));assert.ok(!r.actions.some(a=>a.number==='185'));});
test('bare accident asks injury question while already exposing the protective 180 contact',()=>{const r=chat({message:'J’ai eu un accident'},data,clock);assert.ok(r.reply.startsWith('180'));assert.equal(r.state.accident.step,'check');assert.equal((r.reply.match(/\?/g)||[]).length,1);const next=chat({message:'Je ne sais pas',state:r.state},data,clock);assert.equal(next.state.accident.step,'location');assert.match(next.report.fields.victims,/inconnu/);assert.doesNotMatch(next.reply,/Y a-t-il des blessés/);assert.ok(next.actions.some(a=>a.number==='180'));});
test('explicit no injuries follows material route with contacts even when local directory has no result',()=>{let r=chat({message:'Accident'},data,clock);r=chat({message:'Non, personne n’est blessé',state:r.state},data,clock);assert.equal(r.intent,'constat');assert.equal(r.state.accident.route,'material');r=chat({message:'Une commune non répertoriée',state:r.state},data,clock);assert.match(r.reply,/passé/);r=chat({message:'Deux voitures, carrosserie abîmée',state:r.state},data,clock);assert.ok(r.actions.some(a=>a.number==='100'));assert.ok(r.actions.some(a=>a.number==='145'));assert.match(r.reply,/compétence|territorial/);assert.doesNotMatch(r.reply,/aucun numéro|ne déplacez pas les véhicules/i);});
test('a new life-threatening sign overrides final call-check and never asks a question first',()=>{const r=chat({message:'Il ne respire pas',state:{accident:{version:1,route:'injury',step:'call_check',fields:{}}}},data,clock);assert.equal(r.intent,'emergency');assert.ok(r.actions.some(a=>a.number==='180'));assert.ok(r.actions.some(a=>a.number==='185'));assert.doesNotMatch(r.reply,/\?/);});
test('failed 180 has verified SAMU fallback even without an existing session',()=>{const r=chat({message:'Le 180 ne passe pas'},data,clock);assert.ok(r.actions.some(a=>a.number==='+2250749960324'));assert.doesNotMatch(r.reply,/21 21 756620/);});
test('sensitive recall phones are not retained in prepared fields and successful contact clears the state',()=>{const state={accident:{version:1,route:'injury',step:'location',fields:{}}};let r=chat({message:'Cocody, rappelez au 0700000000',state},data,clock);assert.ok(!JSON.stringify(r.state).includes('0700000000'));r=chat({message:'Oui, j’ai joint les secours',state:{accident:{version:1,route:'injury',step:'call_check',fields:{location:'Cocody'}}}},data,clock);assert.deepEqual(r.state,{});assert.doesNotMatch(r.reply,/arrivent|envoyé|transmis/);});
test('accident with injured people gives 180 and verified long line before one optional useful question',()=>{
 const r=chat({message:'Accident avec des blessés',location:{lat:'bad'}},data,clock);
 assert.equal(r.intent,'emergency');
 assert.ok(r.reply.startsWith('180'));
 assert.ok(r.actions.some(a=>a.number==='+2250101801328'));
 assert.equal(r.state.accident.step,'location');
 assert.equal((r.reply.match(/\?/g)||[]).length,0); // Malformed GPS must never delay urgent orientation.
 assert.doesNotMatch(r.reply,/votre numéro|votre nom/i);
});
test('opt-in preparation asks one short question at a time and produces an honest read-aloud brief',()=>{
 let r=chat({message:'Accident avec des blessés'},data,clock);
 const send=message=>(r=chat({message,state:r.state},data,clock));
 send('Préparer les informations');assert.match(r.reply,/commune|quartier/);assert.equal(r.state.accident.step,'location');
 send('Cocody, carrefour de la pharmacie A');assert.match(r.reply,/véhicules|usagers/);assert.equal((r.reply.match(/\?/g)||[]).length,1);
 send('Deux voitures se sont heurtées');assert.match(r.reply,/bless/);
 send('Deux personnes, conscientes et respirant normalement');assert.match(r.reply,/danger|feu|fumée/);
 send('Pas de feu ni de fuite, nous sommes à l’abri');assert.match(r.reply,/Lieu : Cocody/);assert.match(r.reply,/Accident : Deux voitures/);assert.match(r.reply,/Signalement préparé — non transmis/);assert.equal(r.report.transmitted,false);assert.doesNotMatch(r.reply,/Quel est votre numéro|nom d.un proche|\?/i);assert.equal(r.state.accident.step,'call_check');
 send('Non, le 180 ne passe pas');assert.ok(r.actions.some(a=>a.number==='+2250749960324'));assert.ok(r.actions.some(a=>a.number==='185'));assert.match(r.reply,/aucun opérateur/i);assert.doesNotMatch(r.reply,/21 21 756620|(?:INDIA a|a été) transmis|arriveront/);
});
