import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
const scratch='/Users/assane/.hermes/cache/scratch';
test('only an owned, private, dated approval file can prepare a bounded real INDIA session',async t=>{
 const mod=await import('../lib/ai/india-permit.js').catch(()=>null);assert.ok(mod,'Trusted permit loader must exist');
 const root=await mkdtemp(path.join(scratch,'india-permit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'var');await mkdir(dir,{mode:0o700});
 const file=path.join(dir,'india-real-permit.json');const time=new Date('2026-11-12T23:20:00Z');
 const config={model:'gpt-6.1-terra'};
 assert.equal(mod.loadIndiaPermit(root,config,{clock:()=>time}),null);
 const grant={version:1,id:'281ccf2c-227b-4345-8fad-25fcfae09412',approved:true,model:config.model,expiresAt:'2026-11-12T23:25:00Z',maxRequests:3,durationSeconds:300,sessionCapNano:150000000,pricingReviewedOn:'2026-11-12',pricingSource:'https://developers.openai.com/api/docs/pricing'};
 await writeFile(file,JSON.stringify(grant),{mode:0o600});
 const permit=mod.loadIndiaPermit(root,config,{clock:()=>time});assert.equal(permit.id,grant.id);assert.equal(permit.maxRequests,3);assert.equal(permit.sessionCapNano,150000000);
 assert.equal(permit.pricingSource,undefined,'Only allowlisted controller fields are returned');
 await chmod(file,0o644);assert.equal(mod.loadIndiaPermit(root,config,{clock:()=>time}),null);await chmod(file,0o600);
 for(const change of [{approved:false},{maxRequests:4},{durationSeconds:301},{sessionCapNano:150000001},{expiresAt:'2026-11-12T23:19:00Z'},{model:'invented-model'},{pricingReviewedOn:'2026-11-11'},{pricingSource:'https://example.invalid/prices'}]){
  await writeFile(file,JSON.stringify({...grant,...change}));assert.equal(mod.loadIndiaPermit(root,config,{clock:()=>time}),null);
 }
 await writeFile(file,JSON.stringify(grant));await writeFile(path.join(dir,'india-permit-'+grant.id+'.used'),'used',{mode:0o600});
 assert.equal(mod.loadIndiaPermit(root,config,{clock:()=>time}),null);
 await rm(path.join(dir,'india-permit-'+grant.id+'.used'));await rm(file);const external=path.join(root,'external.json');await writeFile(external,JSON.stringify(grant),{mode:0o600});await symlink(external,file);
 assert.equal(mod.loadIndiaPermit(root,config,{clock:()=>time}),null);
});
