import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
test('approved mockup mascot is available as a true transparent drawing without a frame',()=>{
 const file=new URL('../public/assets/india-drawing.png',import.meta.url);assert.ok(existsSync(file),'Transparent mockup drawing is required');
 const png=readFileSync(file);assert.equal(png.readUInt32BE(16),330);assert.equal(png.readUInt32BE(20),287);assert.equal(png[25],6,'PNG must retain an alpha channel');
});

test('approved INDIA landing contains the centered drawing, conversation form, six services and five destinations',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<title>INDIA — Votre assistant IA citoyen<\/title>/);
 for(const id of ['india-home-view','india-home-form','india-home-input','india-conversation-view','india-services-view','india-history-view','india-account-view'])assert.ok(html.includes(`id="${id}"`),id);
 for(const key of ['urgences','administration','autour','securite','infos','assistance'])assert.ok(html.includes(`data-india-service="${key}"`));
 for(const key of ['accueil','converser','services','historique','compte'])assert.ok(html.includes(`data-india-view="${key}"`));
 assert.match(html,/Bonjour, je suis/);assert.match(html,/india-hero-mascot/);assert.match(html,/india-drawing\.png/);
 assert.doesNotMatch(html,/INDIA Plus|Secours Citoyen/);
 for(const id of ['search-form','chat-form','private-form','sources-content','call-dialog','geo-dialog','private-file'])assert.ok(html.includes(`id="${id}"`),id);
});

test('home and Converser headings receive keyboard focus after menu navigation',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const assistant=html.match(/<h1([^>]*)>Converser avec INDIA<\/h1>/),home=html.match(/<h1([^>]*id="india-home-title"[^>]*)>/);
 assert.ok(assistant&&home);for(const heading of [assistant,home])assert.match(heading[1],/tabindex="-1"/);
});
