import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('INDIA identity stays concise, independent, safe and disabled by default',()=>{
 const soul=readFileSync(new URL('../soul.md',import.meta.url),'utf8');
 assert.match(soul,/Je suis INDIA/);assert.match(soul,/Secours Citoyen/);assert.match(soul,/polyvalent/);
 assert.ok(Buffer.byteLength(soul)<=15500);assert.match(soul,/une question à la fois/);
 for(const phrase of ['aucun accès public','ne pose pas de diagnostic','ne demande jamais de mot de passe','ne déclenche pas de nouvelle dépense','registre des contacts du serveur'])assert.ok(soul.includes(phrase),phrase);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<h2 id="private-heading">INDIA/);assert.match(html,/placeholder="[^"\n]*INDIA/);assert.match(html,/id="chat-form"/);
});
