import test from 'node:test';
import assert from 'node:assert/strict';

test('private administrative reader exposes five source-bound documentary records without generation',async()=>{
 const {createAdministrativeKnowledge}=await import('../lib/ai/administration.js');
 const reader=createAdministrativeKnowledge();
 for(const [message,id] of [['Comment obtenir ma CNI ?','cni'],['Extrait de naissance','extrait_naissance'],['Casier judiciaire','casier_judiciaire'],['Passeport ivoirien','passeport'],['Permis de conduire','permis_conduire']]){
  const r=await reader.reply(message);
  assert.equal(r.administration.procedureId,id);assert.equal(r.verification,'documentary_reference_requires_confirmation');
  assert.ok(r.sources.length>0);assert.match(r.reply,/À CONFIRMER/);assert.match(r.reply,/2026-11-12/);
  assert.ok(r.sources.every(s=>s.url.startsWith('https://')&&s.consulted_on==='2026-11-12'));
 }
});
