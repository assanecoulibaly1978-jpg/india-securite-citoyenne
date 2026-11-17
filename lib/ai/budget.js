import {mkdirSync, openSync, closeSync, chmodSync, writeFileSync, fsyncSync, renameSync, unlinkSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {MODEL_BUDGET_RATES} from './config.js';

const empty = () => ({attemptedRequests:0,providerCalls:0,costNano:0});
const fields=['attemptedRequests','providerCalls','costNano'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function validateState(state) {
 const corrupt=()=>{throw new Error('Corrupt AI budget ledger');};
 if(!exact(state,['version','days','months'])||state.version!==1||!record(state.days)||!record(state.months))corrupt();
 const sums={};
 for(const [collection,pattern] of [[state.days,/^\d{4}-\d{2}-\d{2}$/],[state.months,/^\d{4}-\d{2}$/]]){
  for(const [key,bucket] of Object.entries(collection)){
   if(!pattern.test(key)||!exact(bucket,fields)||!fields.every(field=>Number.isSafeInteger(bucket[field])&&bucket[field]>=0))corrupt();
   const date=new Date(`${key.length===7?`${key}-01`:key}T00:00:00.000Z`);
   if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,key.length)!==key)corrupt();
  }
 }
 for(const [day,bucket] of Object.entries(state.days)){
  const sum=sums[day.slice(0,7)]??=empty();
  for(const field of fields){sum[field]+=bucket[field];if(!Number.isSafeInteger(sum[field]))corrupt();}
 }
 if(Object.keys(sums).length!==Object.keys(state.months).length)corrupt();
 for(const [month,sum] of Object.entries(sums))if(!state.months[month]||!fields.every(field=>sum[field]===state.months[month][field]))corrupt();
 return state;
}

export function createBudgetLedger(config,{clock=()=>new Date()}={}) {
 config={...config};
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 if(!Object.hasOwn(MODEL_BUDGET_RATES,config.model)||
  !['dailyBudgetNano','monthlyBudgetNano','maxInputBytes','maxOutputTokens','maxRequests'].every(key=>positive(config[key]))||
  typeof config.ledgerPath!=='string'||!path.isAbsolute(config.ledgerPath)||typeof clock!=='function')throw new Error('Unsafe budget configuration');
 const rates=MODEL_BUDGET_RATES[config.model];
 const inputBound=(config.maxInputBytes+2048)*config.maxRequests;
 const outputBound=config.maxOutputTokens*config.maxRequests;
 const provision=inputBound*(rates.input*1000)+outputBound*(rates.output*1000);
 if(![inputBound,outputBound,provision].every(positive))throw new Error('Unsafe budget arithmetic');
 let state={version:1,days:{},months:{}}, locked=false, closed=false, unavailable=false;
 const load=()=>{
  let raw;
  try {raw=readFileSync(config.ledgerPath,'utf8');}catch(error){if(error.code==='ENOENT')return;throw new Error('Unreadable AI budget ledger');}
  try{state=validateState(JSON.parse(raw));}catch{throw new Error('Corrupt AI budget ledger');}
 };
 load();
 const buckets=()=>{const date=clock().toISOString();return [date.slice(0,10),date.slice(0,7)];};
 const save=()=>{
  const temporary=`${config.ledgerPath}.tmp`;
  const fd=openSync(temporary,'wx',0o600);
  try {writeFileSync(fd,JSON.stringify(state));fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temporary,config.ledgerPath);
 };
 return {
  reserve(){
   if(closed)throw new Error('Ledger closed');
   if(unavailable)throw new Error('AI budget ledger unavailable');
   if(!locked){
    mkdirSync(path.dirname(config.ledgerPath),{recursive:true,mode:0o700});
    chmodSync(path.dirname(config.ledgerPath),0o700);
    const fd=openSync(`${config.ledgerPath}.lock`,'wx',0o600);closeSync(fd);locked=true;
    try{load();}catch(error){unavailable=true;throw error;}
   }
   const [day,month]=buckets();
   if((state.days[day]?.costNano??0)>config.dailyBudgetNano-provision ||
      (state.months[month]?.costNano??0)>config.monthlyBudgetNano-provision)throw new Error('AI budget exceeded');
   for(const bucket of [state.days[day],state.months[month]]){
    if(!Number.isSafeInteger((bucket?.attemptedRequests??0)+1))throw new Error('Unsafe budget counter arithmetic');
   }
   for(const [collection,key] of [[state.days,day],[state.months,month]]){
    collection[key]??=empty(); collection[key].attemptedRequests++;collection[key].costNano+=provision;
   }
   save();
   let done=false;
   const consume=()=>{if(done||closed)throw new Error('Ticket already consumed or ledger closed');done=true;};
   return {fail(){consume();},settle(usage){
    consume();
    const {inputTokens,outputTokens,calls}=usage??{};
    if(![inputTokens,outputTokens,calls].every(value=>Number.isSafeInteger(value)&&value>=0)||
      inputTokens>inputBound||outputTokens>outputBound||calls>config.maxRequests)throw new Error('Invalid aggregate usage');
    const cost=inputTokens*(rates.input*1000)+outputTokens*(rates.output*1000);
    for(const bucket of [state.days[day],state.months[month]]){
     if(!Number.isSafeInteger(bucket.providerCalls+calls))throw new Error('Unsafe budget counter arithmetic');
    }
    for(const bucket of [state.days[day],state.months[month]]){bucket.costNano-=provision-cost;bucket.providerCalls+=calls;}
    save();
   }};
  },
  stats(){const [day,month]=buckets();return {day,month,daily:{...(state.days[day]??empty())},monthly:{...(state.months[month]??empty())}};},
  close(){if(locked){unlinkSync(`${config.ledgerPath}.lock`);locked=false;}closed=true;}
 };
}
