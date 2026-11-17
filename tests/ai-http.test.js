import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
import {readAIConfig} from '../lib/ai/config.js';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const token='local-pilot-test-token-'.repeat(2);
async function setup(t,overrides={}){
 const root=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'ai-http-'));
 let calls=0;
 const aiProvider=async()=>{calls++;throw Error('Never call provider in these tests');};
 const aiConfig={...readAIConfig({},root),...overrides};
 const server=createServer({aiConfig,aiProvider});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const request=async(url,body,headers={})=>{const response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 return {base,request,calls:()=>calls};
}

test('new endpoint is inaccessible without private authorization; old route and health are unchanged',async t=>{
 const app=await setup(t);
 const response=await app.request('/api/assistant',{message:'Bonjour'});
 assert.equal(response.status,403);
 const old=await app.request('/api/chat',{message:'Il y a un accident avec des blessés'});
 assert.equal(old.status,200);assert.match(old.body.reply,/180/);assert.equal(old.body.mode,undefined);
 assert.deepEqual((await app.request('/api/health')).body,{ok:true});assert.equal(app.calls(),0);
});

test('pilot requires Bearer auth, enforces input/origin boundaries, and erases server history',async t=>{
 const app=await setup(t,{pilotToken:token});
 for(const authorization of ['',token,'Bearer wrong','Basic '+token])assert.equal((await app.request('/api/assistant',{message:'Bonjour'},{authorization})).status,403);
 const auth={authorization:'Bearer '+token};
 const first=await app.request('/api/assistant',{message:'Bonjour'},auth);
 assert.equal(first.status,200);assert.equal(first.body.mode,'rules+directory');assert.equal(first.body.fallback,'disabled');
 assert.equal((await app.request('/api/assistant',{message:'x'.repeat(1001)},auth)).status,400);
 assert.equal((await app.request('/api/assistant',{message:'Bonjour'},{...auth,Origin:'https://evil.test'})).status,403);
 const erased=await fetch(app.base+'/api/assistant/conversation/'+first.body.conversationId,{method:'DELETE',headers:auth});assert.equal(erased.status,200);
 assert.equal((await app.request('/api/assistant',{message:'Bonjour',conversationId:first.body.conversationId},auth)).status,404);
 for(const target of ['/.env','/soul.md','/lib/ai/config.js'])assert.equal((await fetch(app.base+target)).status,404);
 assert.equal(app.calls(),0);
});

test('pilot quota cannot be bypassed with new conversation ids and never blocks the legacy route',async t=>{
 const app=await setup(t,{pilotToken:token,requestsPerMinute:2});const auth={authorization:'Bearer '+token};
 assert.equal((await app.request('/api/assistant',{message:'Bonjour'},auth)).status,200);
 assert.equal((await app.request('/api/assistant',{message:'Bonjour'},auth)).status,200);
 assert.equal((await app.request('/api/assistant',{message:'Bonjour'},auth)).status,429);
 const emergency=await app.request('/api/chat',{message:'Il y a un accident avec des blessés'});assert.equal(emergency.status,200);assert.match(emergency.body.reply,/180/);
 assert.equal(app.calls(),0);
});
