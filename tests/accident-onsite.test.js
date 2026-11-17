import test from 'node:test';import assert from 'node:assert/strict';import {chat} from '../lib/assistant.js';
const data={records:[],sources:[],coverage:{},limitations:[]};
const opening='Accident entre une voiture et une moto à Yopougon, carrefour Siporex. Trois blessés, fuite de carburant.';
const send=(message,state)=>chat({message,...(state?{state}:{})},data);
for(const message of ['Les pompiers sont maintenant sur place et prennent en charge les trois blessés.','Les pompiers sont actuellement sur place et prennent en charge les trois blessés.','Les pompiers sont déjà sur place.'])test('explicit responder presence is retained without a redundant call: '+message,()=>{
 const before=send(opening),r=send(message,before.state);
 assert.equal(r.report.situation,'onsite');assert.equal(r.report.incidentStatus,'ongoing');assert.equal(r.report.rescueStatus,'onsite');assert.deepEqual(r.report.fields,before.report.fields);
 assert.match(r.reply,/Secours sur place, selon le témoin/);assert.match(r.reply,/instructions des pompiers/);assert.match(r.reply,/distance du carburant/);assert.doesNotMatch(r.reply,/Appelez immédiatement|appel au 180|\?/);assert.ok(r.actions.some(a=>a.number==='180'));assert.equal(r.report.transmitted,false);
 const next=send('L’accident est toujours en cours.',r.state);assert.equal(next.report.incidentStatus,'ongoing');assert.equal(next.report.rescueStatus,'onsite');assert.deepEqual(next.report.fields,before.report.fields);
});
test('a direct place answer retains both the commune and its comma-separated landmark',()=>{
 let r=send('Accident entre une voiture et une moto. Trois blessés, fuite de carburant.');assert.equal(r.state.accident.step,'location');r=send('Yopougon, carrefour Siporex',r.state);assert.match(r.report.fields.location,/Yopougon.*carrefour Siporex/);
});

for(const landmark of ['carrefour Siporex','au carrefour Siporex','près du carrefour Siporex'])test('first message keeps the precise landmark: '+landmark,()=>{
 const r=send('Accident entre une voiture et une moto à Yopougon, '+landmark+'. Trois blessés, fuite de carburant.');assert.match(r.report.fields.location,/Yopougon.*carrefour Siporex/);
});
test('a later landmark completes, rather than replaces, the known commune even after responder arrival',()=>{
 let r=send('Accident entre une voiture et une moto à Yopougon. Trois blessés, fuite de carburant.');r=send('Les pompiers sont maintenant sur place et prennent en charge les trois blessés.',r.state);
 r=send('Le repère précis est le carrefour Siporex.',r.state);assert.match(r.report.fields.location,/Yopougon.*carrefour Siporex/);assert.equal(r.report.rescueStatus,'onsite');assert.match(r.report.fields.victims,/3/);assert.match(r.report.fields.hazards,/carburant/);
 const before=r.report.fields;r=send('C’est au carrefour Siporex.',r.state);assert.deepEqual(r.report.fields,before);
});

test('emergency answers are concise and do not turn an unreported fire or smoke into an observed danger',()=>{
 const first=send(opening);assert.ok(first.reply.split(/\s+/).length<=110);assert.doesNotMatch(first.reply,/feu|fumée|incendie/i);
 const r=send('Les pompiers sont maintenant sur place et prennent en charge les trois blessés.',first.state);assert.ok(r.reply.split(/\s+/).length<=100);assert.doesNotMatch(r.reply,/feu|fumée|incendie/i);assert.deepEqual(r.report.reportedHazards,['fuel']);assert.deepEqual(r.report.possibleRisks,[]);
});
test('a merely possible fire is separate from the fuel leak, and a later observed fire updates that distinction',()=>{
 let r=send(opening);r=send('Il y a un risque d’incendie.',r.state);assert.deepEqual(r.report.reportedHazards,['fuel']);assert.deepEqual(r.report.possibleRisks,['fire']);assert.match(r.reply,/Risques possibles.*non constatés/);assert.doesNotMatch(r.reply,/Feu signalé/);
 r=send('Les pompiers sont maintenant sur place.',r.state);assert.deepEqual(r.report.possibleRisks,['fire']);assert.equal(r.report.rescueStatus,'onsite');
 r=send('Maintenant il y a du feu.',r.state);assert.ok(r.report.reportedHazards.includes('fire'));assert.deepEqual(r.report.possibleRisks,[]);assert.match(r.reply,/distance du feu/);assert.doesNotMatch(r.reply,/Appelez immédiatement/);
});
test('an on-site critical deterioration tells the witness to alert the responders, without mechanically asking for another 180 call',()=>{
 let r=send('Les pompiers sont maintenant sur place.',send(opening).state);r=send('Une personne n’arrive plus à respirer.',r.state);assert.match(r.reply,/immédiatement.*secours présents/);assert.doesNotMatch(r.reply,/Appelez immédiatement|appel au 180/);assert.ok(r.actions.some(a=>a.number==='185'));assert.match(r.report.fields.location,/Yopougon.*Siporex/);assert.doesNotMatch(r.reply,/\?/);
});

test('reported responder presence is not cancelled by a failed phone attempt in the same update',()=>{
 const r=send('Le 180 ne passe pas, mais les pompiers sont maintenant sur place.',send(opening).state);assert.equal(r.report.rescueStatus,'onsite');assert.equal(r.report.incidentStatus,'ongoing');assert.doesNotMatch(r.reply,/Appelez immédiatement|essayez l’autre ligne/);assert.match(r.reply,/instructions des pompiers/);assert.ok(r.actions.some(a=>a.number==='180'));
});

for(const message of ['Les pompiers ne sont pas encore sur place.','Les pompiers sont en route.','Les pompiers seront bientôt sur place.'])test('absence or future arrival is not on-site presence: '+message,()=>{const r=send(message,send(opening).state);assert.notEqual(r.report.situation,'onsite');assert.ok(r.reply.startsWith('180'));});
