import test from 'node:test';import assert from 'node:assert/strict';import {chat} from '../lib/assistant.js';
const data={records:[],sources:[],coverage:{},limitations:[]};
const exact='Un camion vient de renverser un motocycliste à Cocody. Les pompiers sont arrivés et ont évacué le blessé. Maintenant, la route est complètement bloquée.';
const send=(message,state)=>chat({message,...(state?{state}:{})},data,()=>new Date('2026-11-17T12:00:00Z'));
for(const care of ['Les pompiers n’ont pas encore évacué le blessé.','Les pompiers vont évacuer le blessé.','Les pompiers ont évacué le blessé ?','Si les pompiers ont évacué le blessé, la route reste bloquée.'])test('negated, future, interrogative or conditional evacuation is not completed care: '+care,()=>{
 const r=send('Un camion a renversé un motocycliste à Cocody. Un blessé attend les secours. '+care);assert.ok(r.report);assert.notEqual(r.report.careStatus,'evacuated');assert.ok(r.reply.startsWith('180'));assert.ok(r.actions.some(a=>a.number==='180'));
});
test('one evacuation does not erase a previously reported total of three injured people',()=>{
 let r=send('Accident à Cocody avec trois blessés.');r=send('Les pompiers ont évacué un blessé. La route est bloquée.',r.state);assert.equal(r.report.evacuatedCount,1);assert.equal(r.report.careStatus,'partial');assert.match(r.report.fields.victims,/^3 /);assert.ok(r.reply.startsWith('180'));
});
test('a partial evacuation in the first message is not mistaken for all reported casualties being handled',()=>{
 const r=send('Un camion a renversé deux motocyclistes à Cocody. Deux blessés. Les pompiers ont évacué un blessé. La route est bloquée.');assert.equal(r.report.careStatus,'partial');assert.equal(r.report.evacuatedCount,1);assert.match(r.report.fields.victims,/^2 /);assert.ok(r.reply.startsWith('180'));
});
for(const danger of ['Maintenant il y a du feu.','Maintenant une autre personne n’arrive plus à respirer.'])test('a new current danger overrides prior evacuation: '+danger,()=>{
 let r=send(exact);r=send(danger,r.state);assert.equal(r.report.careStatus,'not_reported');assert.ok(r.reply.startsWith('180'));assert.match(r.report.fields.location,/Cocody/);assert.ok(r.actions.some(a=>a.number==='180'));if(danger.includes('respirer'))assert.ok(r.actions.some(a=>a.number==='185'));
});
test('a current fire in the same multi-fact message is not silenced by the evacuation report',()=>{
 const r=send(exact+' Mais maintenant il y a du feu.');assert.ok(r.reply.startsWith('180'));assert.match(r.reply,/distance du feu/);assert.notEqual(r.report.rescueStatus,'onsite');assert.equal(r.report.sceneSafety,'not_confirmed');
});
test('the sector and direction can be supplied progressively without another medical questionnaire',()=>{
 let r=send(exact);r=send('Au carrefour de la Riviera 2.',r.state);assert.match(r.report.fields.location,/Cocody.*Riviera 2/);assert.match(r.reply,/sens de circulation/);assert.equal((r.reply.match(/\?/g)||[]).length,1);assert.doesNotMatch(r.reply,/Appelez immédiatement|Y a-t-il des blessés/);
 r=send('Vers le Plateau.',r.state);assert.match(r.report.trafficDetail,/Vers le Plateau/);assert.equal(r.report.careStatus,'evacuated');assert.equal(r.report.trafficStatus,'blocked');assert.match(r.report.fields.victims,/^1 /);assert.doesNotMatch(r.reply,/\?|Appelez immédiatement/);
});
test('a non-road metaphor does not enter the accident protocol',()=>{assert.equal(send('Un cuisinier a renversé un verre d’eau.').report,undefined);assert.equal(send('Comment éviter qu’un camion renverse un motocycliste ?').report,undefined);});

test('an unquantified evacuation does not establish that every injured person has been taken care of',()=>{
 const r=send('Un camion a renversé des motocyclistes à Cocody. Des blessés attendent. Les pompiers ont évacué des blessés. La route est bloquée.');assert.equal(r.report.careStatus,'partial');assert.equal(r.report.evacuatedCount,null);assert.ok(r.reply.startsWith('180'));
});

test('explicit current firefighter presence after evacuation remains distinct from historical arrival',()=>{
 const r=send(exact+' Les pompiers sont toujours sur place. Maintenant il y a du feu.');assert.equal(r.report.rescueStatus,'onsite');assert.match(r.reply,/Signalez ces dangers aux secours présents/);assert.doesNotMatch(r.reply,/Appelez immédiatement/);assert.ok(r.actions.some(a=>a.number==='180'));
});

test('new danger preserves an explicitly reconfirmed on-site service across turns',()=>{
 let r=send(exact);r=send('Les pompiers sont maintenant sur place.',r.state);assert.equal(r.report.rescueStatus,'onsite');r=send('Maintenant il y a du feu.',r.state);assert.equal(r.report.rescueStatus,'onsite');assert.match(r.reply,/Signalez ces dangers aux secours présents/);assert.doesNotMatch(r.reply,/Appelez immédiatement/);
});

test('the exact multi-fact manual message is understood without the keyword accident',()=>{
 const r=send(exact);assert.ok(r.report,'the full message must enter the accident report rather than generic emergency fallback');
 assert.match(r.report.fields.description,/camion.*motocycliste/i);assert.match(r.report.fields.location,/Cocody/);assert.match(r.report.fields.victims,/^1 /);assert.equal(r.report.careStatus,'evacuated');assert.equal(r.report.evacuatedCount,1);assert.equal(r.report.trafficStatus,'blocked');assert.equal(r.report.incidentStatus,'ongoing');assert.equal(r.report.sceneSafety,'not_confirmed');assert.equal(r.report.transmitted,false);
 assert.match(r.reply,/évacué/);assert.ok(r.reply.split(/\s+/).length<=100,'the first response should acknowledge the supplied facts without a duplicate full brief');assert.match(r.reply,/bloquée/);assert.match(r.reply,/Cocody/);assert.match(r.reply,/secteur exact/);assert.equal((r.reply.match(/\?/g)||[]).length,1);assert.doesNotMatch(r.reply,/Appelez immédiatement|Contactez maintenant|Situation : Accident en cours|tout danger est écarté|route.*(?:sûre|sécurisée)/i);assert.ok(r.actions.some(a=>a.number==='180'));
});
