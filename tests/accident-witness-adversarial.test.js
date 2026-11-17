import test from 'node:test';import assert from 'node:assert/strict';import {chat} from '../lib/assistant.js';
const data={records:[],sources:[],coverage:{},limitations:[]},clock=()=>new Date('2026-11-16T12:00:00Z');
const opening='Accident voiture et moto à Cocody, deux blessés, pas de feu.';
const start=()=>chat({message:opening},data,clock);
test('the existing Accident shortcut transitions to the witness flow when injuries are then reported',()=>{
 let r=chat({message:'Accident'},data,clock);
 r=chat({message:'Une voiture a heurté une moto à Cocody. Deux blessés, fuite de carburant.',state:r.state},data,clock);
 assert.equal(r.state.accident.version,2);assert.match(r.report.fields.location,/Cocody/);assert.match(r.report.fields.victims,/2/);assert.match(r.report.fields.description,/voiture.*moto/i);assert.match(r.report.fields.hazards,/carburant/);assert.doesNotMatch(r.reply,/\?/);assert.ok(r.reply.startsWith('180'));
});
test('a partial hazard denial does not erase another danger, and a targeted resolution keeps the remaining smoke',()=>{
 let r=chat({message:'Accident voiture à Cocody, deux blessés, fuite de carburant.'},data,clock);
 r=chat({message:'Pas de feu.',state:r.state},data,clock);assert.match(r.report.fields.hazards,/carburant/);assert.match(r.report.fields.hazards,/Pas de feu/);
 r=chat({message:'Il y a aussi de la fumée.',state:r.state},data,clock);
 r=chat({message:'La fuite est colmatée.',state:r.state},data,clock);assert.match(r.report.fields.hazards,/fumée/i);assert.match(r.report.fields.hazards,/Pas de fuite/);
});

test('an explicit vehicle correction preserves the location and count without retaining the negated vehicle',()=>{
 let r=start();r=chat({message:'Correction : c’est un camion et une moto, pas une voiture.',state:r.state},data,clock);assert.match(r.report.fields.description,/camion.*moto/i);assert.doesNotMatch(r.report.fields.description,/voiture/);assert.match(r.report.fields.location,/Cocody/);assert.match(r.report.fields.victims,/2/);
});
test('an ambiguous total asks for that missing information, and an unknown answer is accepted',()=>{
 let r=chat({message:'Accident entre une voiture et une moto à Cocody. Deux blessés dans la voiture et trois blessés sur la moto. Pas de feu.'},data,clock);assert.equal(r.state.accident.step,'victims');assert.equal((r.reply.match(/\?/g)||[]).length,1);
 r=chat({message:'Je ne sais pas',state:r.state},data,clock);assert.match(r.report.fields.victims,/inconnu/);assert.doesNotMatch(r.reply,/\?/);
});
test('unaccented first-message places are retained using the existing directory vocabulary',()=>{
 const r=chat({message:'Accident entre une voiture et une moto a cocody. Deux blessés. Pas de feu.'},{...data,records:[{city:'Cocody'}]},clock);assert.match(r.report.fields.location,/^cocody$/i);assert.doesNotMatch(r.reply,/\?/);
});

test('a retracted rescue-call claim restores immediate orientation, and absent responders are not kept as present',()=>{
 let r=start();r=chat({message:'Les secours ont été appelés.',state:r.state},data,clock);assert.equal(r.report.situation,'called');
 r=chat({message:'Correction : aucun secours n’a été appelé.',state:r.state},data,clock);assert.equal(r.report.situation,'ongoing');assert.ok(r.reply.startsWith('180'));
 r=chat({message:'Les pompiers sont sur place.',state:r.state},data,clock);
 r=chat({message:'Correction : les pompiers ne sont pas encore sur place.',state:r.state},data,clock);assert.notEqual(r.report.situation,'onsite');assert.match(r.report.fields.location,/Cocody/);
});

test('a historical mention never masks explicitly current injured people and fire in the same sentence',()=>{const r=chat({message:'Accident hier à Cocody, maintenant deux blessés saignent et il y a du feu.'},data,clock);assert.equal(r.report.situation,'ongoing');assert.ok(r.reply.startsWith('180'));assert.match(r.reply,/abri|distance/);});
test('breathing difficulty does not become a location and alerts the responders already on site',()=>{let r=chat({message:'Accident à Cocody avec deux blessés, secours sur place.'},data,clock);r=chat({message:'Une personne a une douleur thoracique et n’arrive plus à respirer.',state:r.state},data,clock);assert.match(r.report.fields.location,/^Cocody/);assert.doesNotMatch(r.report.fields.location,/respirer/);assert.ok(r.actions.some(a=>a.number==='185'));assert.match(r.reply,/secours.*présents/);assert.doesNotMatch(r.reply,/\?/);assert.match(JSON.stringify(r.report),/respir/i);});
test('reported unconsciousness remains in the briefing and medical contacts survive the next turn',()=>{let r=chat({message:'Accident voiture à Cocody, deux blessés dont un inconscient, pas de feu.'},data,clock);r=chat({message:'Résumé',state:r.state},data,clock);assert.match(r.reply,/inconscien/i);assert.ok(r.actions.some(a=>a.number==='185'));});
test('the affirmed replacement location does not contain the negated former place',()=>{let r=start();r=chat({message:'Correction : ce n’est pas à Cocody mais à Yopougon.',state:r.state},data,clock);assert.equal(r.report.fields.location,'Yopougon');assert.match(r.report.fields.victims,/2/);});
test('a negated previous count is replaced, not reused',()=>{let r=start();r=chat({message:'Correction : pas deux blessés mais trois blessés.',state:r.state},data,clock);assert.match(r.report.fields.victims,/^3 /);});
test('explicit correction to no injured people is acknowledged without retaining the old count as current fact',()=>{let r=start();r=chat({message:'Correction : finalement aucun blessé, seulement des dégâts matériels.',state:r.state},data,clock);assert.match(r.report.fields.victims,/aucun|0/i);assert.doesNotMatch(r.report.fields.victims,/^2 /);assert.ok(r.actions.some(a=>a.number==='180'));});
test('an additional hazard does not erase a previously reported fuel leak',()=>{let r=chat({message:'Accident voiture à Cocody, deux blessés, fuite de carburant.'},data,clock);r=chat({message:'Il y a aussi de la fumée.',state:r.state},data,clock);assert.match(r.report.fields.hazards,/carburant/);assert.match(r.report.fields.hazards,/fumée/i);});
test('negated critical signs are not asserted as an aggravation',()=>{const r=chat({message:'Accident voiture à Cocody avec deux blessés, personne n’est inconscient et personne ne saigne beaucoup.'},data,clock);assert.doesNotMatch(r.reply,/aggravation/);assert.ok(!r.actions.some(a=>a.service==='medical'));assert.equal((r.reply.match(/\?/g)||[]).length,1);});
test('existing material version-one context is not upgraded to an injured-person route by responder presence',()=>{const r=chat({message:'Les secours sont sur place.',state:{accident:{version:1,route:'material',step:'description',fields:{location:'Cocody'}}}},data,clock);assert.equal(r.state.accident.route,'material');assert.ok(r.actions.some(a=>a.number==='100'));});
test('a traffic-only phrase does not silently resolve previously reported injured people and fuel danger',()=>{let r=chat({message:'Accident voiture à Cocody, deux blessés, fuite de carburant.'},data,clock);r=chat({message:'Il reste seulement un problème de circulation.',state:r.state},data,clock);assert.equal(r.report.situation,'ongoing');assert.ok(r.reply.startsWith('180'));});
