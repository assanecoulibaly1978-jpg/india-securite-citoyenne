import test from 'node:test';import assert from 'node:assert/strict';import {chat} from '../lib/assistant.js';
const data={records:[],sources:[],coverage:{},limitations:[]};
const messages=['Il y a un accident.','Il y a un accident à Bingerville, près du Jardin botanique.','Les pompiers sont déjà sur place.',"L'intervention est terminée, mais il y a un gros embouteillage."];
const send=(message,state)=>chat({message,...(state?{state}:{})},data);
test('a new observed danger after closure restores immediate emergency orientation without assuming responders stayed',()=>{
 let r;for(const m of messages)r=send(m,r?.state);
 r=send('Maintenant une voiture prend feu.',r.state);assert.equal(r.report.incidentStatus,'ongoing');assert.equal(r.report.rescueStatus,'not_reported');assert.equal(r.report.previousRescueStatus,'onsite');assert.ok(r.reply.startsWith('180 — Appelez immédiatement'));assert.ok(r.actions.some(a=>a.number==='180'));assert.match(r.report.fields.location,/Bingerville.*Jardin botanique/);
});
test('closure and a new danger in the same message do not suppress urgent help',()=>{
 let r=send('Accident à Bingerville.');r=send('Les pompiers sont déjà sur place.',r.state);r=send('L’intervention est terminée, mais maintenant une voiture prend feu.',r.state);assert.equal(r.report.incidentStatus,'ongoing');assert.ok(r.reply.startsWith('180 — Appelez immédiatement'));
});
for(const message of ['L’intervention n’est pas terminée.','Est-ce que l’intervention est terminée ?','Si l’intervention est terminée, il reste un bouchon.'])test('a negated, interrogative or conditional closure is not a completed intervention: '+message,()=>{
 let r=send('Accident à Bingerville avec trois blessés.');r=send(message,r.state);assert.equal(r.report.incidentStatus,'ongoing');assert.ok(r.actions.some(a=>a.number==='180'));
});
test('a traffic-only statement cannot resolve an active incident with injured people',()=>{let r=send('Accident à Bingerville avec trois blessés.');r=send('Il y a un gros embouteillage.',r.state);assert.equal(r.report.incidentStatus,'ongoing');assert.equal(r.report.trafficStatus,'congested');assert.ok(r.reply.startsWith('180'));});
test('known victims and the location survive closure and a declared traffic recovery without another questionnaire',()=>{
 let r=send('Accident à Bingerville, près du Jardin botanique. Trois blessés.');r=send('Les pompiers sont déjà sur place.',r.state);r=send(messages[3],r.state);assert.match(r.report.fields.victims,/3/);r=send('La circulation est fluide.',r.state);assert.equal(r.report.incidentStatus,'finished');assert.equal(r.report.trafficStatus,'cleared');assert.match(r.report.fields.location,/Bingerville.*Jardin botanique/);assert.match(r.report.fields.victims,/3/);assert.doesNotMatch(r.reply,/\?|Appelez immédiatement/);
});
test('a closure statement is not cancelled by a failed call without any new danger',()=>{
 let r=send('Accident à Bingerville.');r=send('L’intervention est terminée, mais le 180 ne passe pas.',r.state);assert.equal(r.report.incidentStatus,'finished');assert.doesNotMatch(r.reply,/Réessayez|essayez l’autre ligne|Appelez immédiatement/);
});
test('legacy unknown accident context upgrades without requiring an invented injury',()=>{
 let r=send('Les pompiers sont déjà sur place.',{accident:{version:1,route:'unknown',step:'check',fields:{location:'Bingerville, près du Jardin botanique'}}});assert.equal(r.report.rescueStatus,'onsite');assert.match(r.report.fields.victims,/inconnu/);assert.match(r.report.fields.location,/Jardin botanique/);assert.doesNotMatch(r.reply,/Y a-t-il|Appelez immédiatement/);
});

test('the full manual sequence retains place, unknown victims, responder presence and completed intervention with traffic',()=>{
 let r=send(messages[0]);assert.ok(r.actions.some(a=>a.number==='180'));assert.equal((r.reply.match(/\?/g)||[]).length,1);
 r=send(messages[1],r.state);assert.ok(r.report,'a location follow-up must enter a persistent accident report');assert.match(r.report.fields.location,/Bingerville.*Jardin botanique/);assert.doesNotMatch(r.reply,/Y a-t-il des blessés|Combien de personnes semblent blessées/);
 r=send(messages[2],r.state);assert.equal(r.report.rescueStatus,'onsite');assert.equal(r.report.incidentStatus,'ongoing');assert.match(r.report.fields.victims,/inconnu/);assert.doesNotMatch(r.reply,/Appelez immédiatement|Y a-t-il des blessés|Combien de personnes/);
 r=send(messages[3],r.state);assert.equal(r.report.incidentStatus,'finished');assert.equal(r.report.trafficStatus,'congested');assert.equal(r.report.rescueStatus,'onsite');assert.match(r.reply,/circulation|embouteillage/i);assert.match(r.report.fields.location,/Bingerville.*Jardin botanique/);assert.match(r.report.fields.victims,/inconnu/);assert.doesNotMatch(r.reply,/Appelez immédiatement|Y a-t-il des blessés|Combien de personnes/);assert.equal((r.reply.match(/\?/g)||[]).length,1);assert.equal(r.report.transmitted,false);
 r=send('La voie vers Abidjan est bloquée.',r.state);assert.match(r.report.trafficDetail,/voie vers Abidjan/);assert.equal(r.report.incidentStatus,'finished');assert.equal(r.report.trafficStatus,'congested');assert.doesNotMatch(r.reply,/\?|Appelez immédiatement|Y a-t-il des blessés/);
});
