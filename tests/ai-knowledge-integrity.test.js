import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createAdministrativeKnowledge} from '../lib/ai/administration.js';
import {createAIService} from '../lib/ai/service.js';
import {readAIConfig} from '../lib/ai/config.js';
const root=new URL('..',import.meta.url).pathname;
const digest=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const scratch=path.join(os.homedir(),'.hermes','cache','scratch');mkdirSync(scratch,{recursive:true});
 const dir=mkdtempSync(path.join(scratch,'knowledge-fixture-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const name of ['base-administrative.json','manifest.json','review.json']){copyFileSync(root+'knowledge/'+name,path.join(dir,name));chmodSync(path.join(dir,name),0o600);}
 const read=name=>JSON.parse(readFileSync(path.join(dir,name),'utf8'));
 const write=(name,value)=>writeFileSync(path.join(dir,name),JSON.stringify(value));
 function update({base=read('base-administrative.json'),review=read('review.json'),manifest=read('manifest.json')}={}){
  write('base-administrative.json',base);manifest.dataset_sha256=digest(readFileSync(path.join(dir,'base-administrative.json')));review.base_sha256=manifest.dataset_sha256;
  write('review.json',review);manifest.review_sha256=digest(readFileSync(path.join(dir,'review.json')));write('manifest.json',manifest);
 }
 return {dir,read,write,update,reader:createAdministrativeKnowledge({dir})};
}
test('a changed corpus fails closed before any facts are returned',t=>{
 const {reader,read,write}=fixture(t);const base=read('base-administrative.json');base.procedures[0].documents[0].text='Invented document';write('base-administrative.json',base);
 assert.equal(reader.reply('CNI'),null);
});
for(const field of ['public_enabled','generative_use','automatic_requirements_allowed'])test('manifest cannot authorize '+field,t=>{
 const {reader,read,write}=fixture(t);const manifest=read('manifest.json');manifest[field]=true;write('manifest.json',manifest);assert.equal(reader.reply('CNI'),null);
});
for(const mutation of ['missing_source','dangling_reference','wrong_review_association','missing_claim','remove_quarantine','bad_alternative','unsafe_url','write_eligible','altered_audit'])test('invalid documentary input fails closed: '+mutation,t=>{
 const {reader,read,update,write}=fixture(t);const base=read('base-administrative.json'),review=read('review.json'),manifest=read('manifest.json');
 if(mutation==='missing_source')base.sources.pop();
 if(mutation==='dangling_reference')base.procedures[0].documents[0].source_ids=[999999];
 if(mutation==='wrong_review_association')review.claim_checks[0].source_ids=[1];
 if(mutation==='missing_claim')review.claim_checks.pop();
 if(mutation==='remove_quarantine')manifest.quarantined_fact_paths=[];
 if(mutation==='bad_alternative')review.source_checks.find(s=>s.verified_same_document_alternative_url).verified_same_document_alternative_url='https://invented.invalid/';
 if(mutation==='unsafe_url')base.sources[0].url='javascript:alert(1)';
 if(mutation==='write_eligible')base.procedures[0].documents[0].auto_answer_eligible=true;
 update({base,review,manifest});
 if(mutation==='altered_audit'){review.claim_checks[0].status='contradicted';write('review.json',review);}
 assert.equal(reader.reply('CNI'),null);
});
test('corrupt private data produces a safe administrative limit and never falls through to the model',async t=>{
 const {dir,read,write}=fixture(t);const manifest=read('manifest.json');manifest.dataset_sha256='0'.repeat(64);write('manifest.json',manifest);
 let calls=0;const service=createAIService({config:{...readAIConfig({},root),knowledgeDir:dir,enabled:true,allowPaid:true,apiKey:'FICTITIOUS-ONLY'},provider:async()=>{calls++;throw Error('Must never run');}});t.after(()=>service.close());
 const answer=await service.reply({message:'CNI'},{records:[],sources:[],limitations:[],coverage:{}});
 assert.equal(answer.answerType,'official_information');assert.equal(answer.knowledge,undefined);assert.deepEqual(answer.sources,[]);assert.match(answer.reply,/pas de référence officielle actualisée/);assert.equal(calls,0);
});
test('responses are detached values: a caller cannot mutate the stored knowledge through returned objects',t=>{
 const {reader}=fixture(t);const first=reader.reply('CNI');first.administration.facts[0].text='CORRUPTED-BY-CALLER';first.sources[0].url='https://invented.invalid';
 const next=reader.reply('CNI');assert.ok(!next.reply.includes('CORRUPTED-BY-CALLER'));assert.ok(!next.sources.some(s=>s.url.includes('invented.invalid')));
});
