import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const modulePath=new URL('../public/utils.mjs',import.meta.url);
test('only validated emergency or Ivorian ten-digit numbers can open phone',async()=>{
 assert.ok(fs.existsSync(modulePath),'phone safety helpers must exist');
 const {phoneHref}=await import(modulePath);
 assert.equal(phoneHref('180'),'tel:180');
 assert.equal(phoneHref('+2250757485389'),'tel:+2250757485389');
 for(const input of ['javascript:alert(1)','2121756620','+22521301119','tel:100','123','100;123'])assert.equal(phoneHref(input),null);
});
test('maps use exact sourced points or an explicit text search, never guessed coordinates',async()=>{
 const {mapLinks}=await import(modulePath);
 assert.equal(typeof mapLinks,'function');
 const p=mapLinks({name:'Centre',city:'Abidjan',address:'Rue A',lat:5.35,lon:-4.01,location_precision:'point'});
 assert.ok(p.map.includes('mlat=5.35')&&p.map.includes('mlon=-4.01'));
 assert.equal(p.precise,true);
 const unknown=mapLinks({name:'Pharmacie <Test>',city:'Cocody',address:'Carrefour A',lat:null,lon:null});
 assert.equal(unknown.precise,false);
 assert.ok(unknown.map.startsWith('https://www.google.com/maps/search/'));
 assert.ok(!unknown.map.includes('mlat='));
 const invalid=mapLinks({name:'X',lat:999,lon:999});
 assert.equal(invalid.precise,false);
});
