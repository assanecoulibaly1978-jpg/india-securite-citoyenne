import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

test('test harness blocks external HTTP before any paid request can leave the machine',async()=>{
 const path=new URL('./local-only.mjs',import.meta.url);assert.ok(existsSync(path),'Le verrou réseau local des tests doit exister');
 await import(path);
 await assert.rejects(fetch('https://api.openai.com/v1/responses',{method:'POST',body:'{}'}),/réseau externe interdit/);
 const https=await import('node:https');assert.throws(()=>https.default.request('https://api.openai.com/v1/responses'),/réseau externe interdit/);
});
