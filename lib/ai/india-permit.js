import {lstatSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {MODEL_BUDGET_RATES} from './config.js';
// This is an operator-owned approval record, never created by an HTTP request.
// Loading it does not authorize a browser, send a prompt, or contact a provider.
// Preparation may wait one hour on its reviewed UTC day. The independent
// browser-confirmed conversation lease remains limited to 300 seconds.
export function loadIndiaPermit(root,config,{clock=()=>new Date()}={}){
 try{
  const dir=path.join(root,'var'),file=path.join(dir,'india-real-permit.json');
  const owned=info=>typeof process.getuid!=='function'||info.uid===process.getuid();
  const parent=lstatSync(dir),info=lstatSync(file);
  if(parent.isSymbolicLink()||!parent.isDirectory()||!owned(parent)||(parent.mode&0o077)!==0||info.isSymbolicLink()||!info.isFile()||!owned(info)||(info.mode&0o077)!==0||info.size>4096)return null;
  const p=JSON.parse(readFileSync(file,'utf8')),now=clock(),expiry=Date.parse(p.expiresAt);
  const fields=['version','id','approved','model','expiresAt','maxRequests','durationSeconds','sessionCapNano','pricingReviewedOn','pricingSource'];
  if(!p||Array.isArray(p)||Object.keys(p).length!==fields.length||fields.some(k=>!Object.hasOwn(p,k))||p.version!==1||p.approved!==true||typeof p.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.id)||p.model!==config.model||!Object.hasOwn(MODEL_BUDGET_RATES,p.model)||!Number.isFinite(expiry)||expiry<=now.getTime()||expiry>now.getTime()+3600000||!Number.isSafeInteger(p.maxRequests)||p.maxRequests<1||p.maxRequests>3||!Number.isSafeInteger(p.durationSeconds)||p.durationSeconds<1||p.durationSeconds>300||!Number.isSafeInteger(p.sessionCapNano)||p.sessionCapNano<1||p.sessionCapNano>150000000||p.pricingReviewedOn!==now.toISOString().slice(0,10))return null;
  if(new Date(expiry).toISOString().slice(0,10)!==p.pricingReviewedOn)return null;
  const source=new URL(p.pricingSource);
  if(source.protocol!=='https:'||source.username||source.password||!['openai.com','developers.openai.com','platform.openai.com'].includes(source.hostname))return null;
  if(existsSync(path.join(dir,`india-permit-${p.id}.used`)))return null;
  return Object.fromEntries(fields.filter(k=>!['pricingReviewedOn','pricingSource'].includes(k)).map(k=>[k,p[k]]));
 }catch{return null;}
}
