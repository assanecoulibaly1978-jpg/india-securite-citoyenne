import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,copyFile,symlink,readFile,rm,stat,chmod,writeFile} from 'node:fs/promises';
import {createPrivateTestGateway} from '../lib/private-test.js';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'..');
const scratch='/Users/assane/.hermes/cache/scratch';
async function cliRoot(t){
 const root=await mkdtemp(path.join(scratch,'private-startup-regression-'));
 await copyFile(path.join(project,'server.js'),path.join(root,'server.mjs'));
 for(const dir of ['lib','public','knowledge','data'])await symlink(path.join(project,dir),path.join(root,dir));
 t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
function launch(t,root,port){
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',AI_ENABLED:'false',AI_ALLOW_PAID:'false'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}});
 return child;
}
function ready(child){return new Promise((resolve,reject)=>{
 let text='';const timer=setTimeout(()=>reject(Error('CLI startup timed out')),5000);
 child.once('exit',()=>{clearTimeout(timer);reject(Error('CLI exited before ready'));});
 child.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
});}
test('a failed duplicate CLI launch preserves the working instance access file and login',async t=>{
 const root=await cliRoot(t),first=launch(t,root,0),base=await ready(first);
 const accessPath=path.join(root,'var/private-test-access.json');
 const before=await readFile(accessPath);
 const second=launch(t,root,new URL(base).port);
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('duplicate CLI did not exit')),5000);second.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 assert.equal(code,1);
 const after=await readFile(accessPath);
 assert.ok(before.equals(after),'A failed second bind must not replace the live access credential');
 const response=await fetch(base+'/api/private-test/login',{method:'POST',headers:{Origin:base,'x-private-test':'1','Content-Type':'application/json'},body:after});
 assert.equal(response.status,200,'The currently documented file must still authenticate to the first server');
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/private-test/status',{headers:{cookie}})).status,200);
 assert.equal((await fetch(base+'/api/private-test/session',{method:'DELETE',headers:{Origin:base,'x-private-test':'1',cookie}})).status,200);
});

test('an existing var directory symlink is rejected without changing its target',async t=>{
 const root=await mkdtemp(path.join(scratch,'private-parent-regression-'));
 const outside=await mkdtemp(path.join(scratch,'private-outside-regression-'));
 t.after(async()=>{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
 await chmod(outside,0o755);await writeFile(path.join(outside,'sentinel'),'unchanged');
 await symlink(outside,path.join(root,'var'));
 const mode=(await stat(outside)).mode&0o777;
 await assert.rejects(async()=>{let gateway;try{gateway=await createPrivateTestGateway({root});}finally{gateway?.close();}},'A symbolic-link parent must never be followed');
 assert.equal((await stat(outside)).mode&0o777,mode);
 assert.equal(await readFile(path.join(outside,'sentinel'),'utf8'),'unchanged');
 await assert.rejects(stat(path.join(outside,'private-test-access.json')),{code:'ENOENT'});
});
