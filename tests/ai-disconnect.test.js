import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server.js';
import {readAIConfig} from '../lib/ai/config.js';

test('closing the HTTP client cancels pending generation',async t=>{
 const root=await mkdtemp(path.join(process.env.TMPDIR,'ai-disconnect-'));
 await writeFile(path.join(root,'soul.md'),'Instructions de test, sans données réelles.');
 const token='local-disconnect-test-token-'.repeat(2);
 let notifyStart,notifyAbort,providerSignal;
 const started=new Promise(resolve=>{notifyStart=resolve;});
 const aborted=new Promise(resolve=>{notifyAbort=resolve;});
 const server=createServer({
  aiConfig:{...readAIConfig({},root),enabled:true,allowPaid:true,apiKey:'FAKE-LOCAL-ONLY',pilotToken:token,timeoutMs:2000},
  aiProvider:({signal})=>{providerSignal=signal;signal.addEventListener('abort',()=>notifyAbort(true),{once:true});notifyStart();return new Promise(()=>{});},
  aiLedgerFactory:()=>({reserve:()=>({settle(){},fail(){}}),close(){}})
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const request=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/assistant',method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'}});
 request.on('error',()=>{});request.end(JSON.stringify({message:'Bonjour'}));
 await started;request.destroy();
 let timer;
 const cancelled=await Promise.race([aborted,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),300);})]);clearTimeout(timer);
 assert.equal(cancelled,true);assert.equal(providerSignal.aborted,true);
});
