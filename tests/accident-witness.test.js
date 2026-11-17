import test from 'node:test';import assert from 'node:assert/strict';
import {chat} from '../lib/assistant.js';
const data={records:[{city:'Cocody'}],sources:[],coverage:{},limitations:[]};
const clock=()=>new Date('2026-11-16T12:00:00Z');
for(const [situation,message,urgent] of [
 ['ongoing','Accident en cours avec deux blessés à Cocody.',true],
 ['called','Accident avec deux blessés à Cocody. J’ai appelé les pompiers, ils ne sont pas encore sur place.',false],
 ['onsite','Accident avec deux blessés à Cocody. Les pompiers sont sur place.',false],
 ['finished','Hier, un accident avec deux blessés à Cocody ; les secours sont intervenus et tout est terminé.',false],
 ['traffic','Je signale un accident matériel sans blessés, déjà dégagé ; il reste un embouteillage.',false]
])test('reported situation is distinguished: '+situation,()=>{
 const r=chat({message},data,clock);assert.equal(r.state.accident.situation,situation);assert.equal(r.reply.startsWith('180 — Appelez immédiatement'),urgent);assert.ok((r.reply.match(/\?/g)||[]).length<=1);assert.ok(r.actions.some(a=>a.type==='call'&&a.number==='180'));assert.doesNotMatch(r.reply,/INDIA a (?:contacté|alerté|transmis)|alerte diffusée/i);
 if(situation==='finished')assert.doesNotMatch(r.reply,/\?/);
 if(situation==='traffic'){assert.equal((r.reply.match(/\?/g)||[]).length,1);assert.match(r.reply,/voie|sens de circulation/);assert.doesNotMatch(r.reply,/Y a-t-il des blessés|Combien de personnes/);}
});

test('new danger after a completed incident reopens urgency, while a historical danger does not',()=>{
 let r=chat({message:'Hier, accident avec des blessés et une fuite de carburant. Tout est terminé.'},data,clock);assert.equal(r.state.accident.situation,'finished');
 r=chat({message:'Maintenant une voiture prend feu sur les lieux.',state:r.state},data,clock);assert.equal(r.state.accident.situation,'ongoing');assert.ok(r.reply.startsWith('180'));assert.match(r.reply,/carburant|fumées|feu/);
});

test('one missing fact at a time is requested, and corrections do not erase the other declared facts',()=>{
 let r=chat({message:'Accident entre une voiture et une moto, trois blessés.'},data,clock);assert.equal(r.state.accident.step,'location');assert.equal((r.reply.match(/\?/g)||[]).length,1);
 r=chat({message:'Cocody près de la pharmacie A',state:r.state},data,clock);assert.equal(r.state.accident.step,'hazards');assert.match(r.state.accident.fields.location,/Cocody/);assert.equal((r.reply.match(/\?/g)||[]).length,1);
 r=chat({message:'Correction : c’est à Yopougon, carrefour Siporex.',state:r.state},data,clock);assert.match(r.state.accident.fields.location,/Yopougon/);assert.match(r.state.accident.fields.victims,/3/);assert.match(r.state.accident.fields.description,/moto/);
 r=chat({message:'Pas de feu ni de fuite, nous sommes à l’abri.',state:r.state},data,clock);assert.match(r.reply,/Signalement préparé — non transmis/);assert.match(r.report.fields.location,/Yopougon/);assert.match(r.report.fields.hazards,/Pas de feu/);assert.doesNotMatch(r.reply,/\?/);
});

test('critical signs and a failed call preserve the existing medical fallback and never delay it with a question',()=>{
 const opened=chat({message:'Accident avec trois blessés à Cocody.'},data,clock);
 for(const message of ['Il ne respire plus','Non, le 180 ne passe pas']){
  const r=chat({message,state:opened.state},data,clock);assert.ok(r.reply.startsWith('180'));assert.ok(r.actions.some(a=>a.number==='185'));assert.doesNotMatch(r.reply,/\?/);assert.match(r.state.accident.fields.location,/Cocody/);
 }
});

test('unknown observations are explicit, acknowledgments are not locations and a new topic can exit the flow',()=>{
 let r=chat({message:'Accident avec des blessés.'},data,clock);r=chat({message:'Merci',state:r.state},data,clock);assert.equal(r.state.accident.fields.location,undefined);
 r=chat({message:'Je ne sais pas',state:r.state},data,clock);assert.match(r.state.accident.fields.location,/inconnu/);assert.equal(r.state.accident.step,'description');
 const cleared=chat({message:'Effacer',state:r.state},data,clock);assert.deepEqual(cleared.state,{});
 r=chat({message:'Nouveau sujet : renouvellement CNI',state:r.state},data,clock);assert.equal(r.state?.accident,undefined);
});

test('explicit negated corrections replace only the affirmed location or count',()=>{
 let r=chat({message:'Accident entre une voiture et une moto à Cocody, trois blessés, fuite de carburant.'},data,clock);
 r=chat({message:'Non, ce n’est pas Cocody mais Yopougon.',state:r.state},data,clock);assert.equal(r.report.fields.location,'Yopougon');assert.match(r.report.fields.description,/moto/);
 r=chat({message:'Pas trois blessés mais deux blessés.',state:r.state},data,clock);assert.match(r.report.fields.victims,/^2 /);assert.match(r.report.fields.hazards,/carburant/);
});

test('a complete first witness report retains declared facts and exposes 180 before any question',()=>{
 const r=chat({message:'Je suis témoin d’un accident entre une voiture et une moto à Cocody, près du marché. Trois blessés. Une fuite de carburant persiste.'},data,clock);
 assert.ok(r.reply.startsWith('180'));assert.ok(r.actions.some(a=>a.type==='call'&&a.number==='180'));assert.equal(r.state.accident.version,2);
 assert.match(r.state.accident.fields.location,/Cocody/);assert.match(r.state.accident.fields.description,/voiture.*moto/i);assert.match(r.state.accident.fields.victims,/3|trois/i);assert.match(r.state.accident.fields.hazards,/carburant/i);
 assert.match(r.reply,/abri|éloign/i);assert.equal(r.report.title,'Signalement préparé — non transmis');assert.equal(r.report.transmitted,false);assert.doesNotMatch(r.reply,/\?/);
 assert.match(r.reply,/Situation : Accident en cours/);assert.match(r.reply,/Lieu : Cocody, près du marché\nAccident :/);
});
