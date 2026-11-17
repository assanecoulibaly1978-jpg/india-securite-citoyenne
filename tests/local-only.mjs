// Tests only. Loaded by npm test before all workers; never imported by server.js.
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
const flag=Symbol.for('secours.localOnlyTests');
if(!globalThis[flag]){
 globalThis[flag]=true;
 const assertHost=host=>{if(!['127.0.0.1','localhost','::1','[::1]'].includes(String(host)))throw Error('Tests : réseau externe interdit.');};
 const check=args=>{
  const first=args[0];
  if(typeof first==='string'||first instanceof URL)assertHost(new URL(first).hostname);
  else if(first&&typeof first==='object')assertHost(first.hostname||first.host||'localhost');
  else throw Error('Tests : réseau externe interdit.');
  if(args[1]&&typeof args[1]==='object'&&(args[1].hostname||args[1].host))assertHost(args[1].hostname||args[1].host);
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,options)=>{assertHost(new URL(input instanceof Request?input.url:input).hostname);return originalFetch(input,options);};
 for(const module of [http,https])for(const name of ['request','get']){
  const original=module[name];module[name]=function(...args){check(args);return original.apply(this,args);};
 }
 syncBuiltinESMExports();
}
