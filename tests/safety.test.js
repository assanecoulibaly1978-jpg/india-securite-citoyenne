import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
import {chat} from '../lib/assistant.js';
const clock=()=>new Date('2026-11-11T00:40:00Z');
const data={records:[],sources:[],limitations:[],coverage:{}};
test('browser can load actual ES modules with JavaScript MIME',async t=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;for(const p of ['/app.mjs','/utils.mjs']){const r=await fetch(base+p);assert.equal(r.status,200,p);assert.match(r.headers.get('content-type'),/javascript/);}});
for(const [message,number] of [['Il ne respire pas','185'],['Elle fait un malaise','185'],['Il est inconscient','185'],['Je saigne beaucoup','185'],['Je veux me tuer','185'],['Un accident avec des blessés','180'],['La maison brûle','180'],['Incendie dans le bâtiment','180'],['Cambriolage en cours','100'],['Je subis une agression','100'],['Mon mari me menace maintenant','100'],['Violences en cours chez moi','100']])test('urgent orientation before state/location validation: '+message,()=>{const r=chat({message,state:{category:'pharmacy'},location:{lat:'oops'},date:'bad'},data,clock);assert.equal(r.intent,'emergency');assert.ok(r.actions.some(a=>a.number===number));assert.doesNotMatch(r.reply,/\?|secours arrivent|appel lancé/i);});
for(const message of ['Accident sans blessé','Accident pas de blessés','Accident, personne n’est blessé','Accident aucun blessé','Accident matériel'])test('material accident never invokes emergency due to negated injuries: '+message,()=>{const r=chat({message},data,clock);assert.equal(r.intent,'constat');assert.equal(r.actions.length,0);});
