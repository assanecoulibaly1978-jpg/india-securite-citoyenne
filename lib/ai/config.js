import path from 'node:path';

export const MODEL_BUDGET_RATES=Object.freeze({
 // Provisions prudentes (USD / million de tokens), pas les tarifs facturés.
 // Entrées majorées pour tenir compte du cache ; contexte borné bien sous 272K.
 'gpt-6.1-terra':Object.freeze({input:3,output:6}),
 'gpt-6-luna':Object.freeze({input:0.3,output:0.6})
});

const budget=(value,fallback,ceiling)=>{
 const raw=String(value??fallback);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw))return 0;
 return Math.min(ceiling,Math.round(Number(raw)*1_000_000_000));
};

export function loadServerEnvironment(file,{loader=p=>process.loadEnvFile(p),env=process.env}={}){
 try{loader(file);return true;}catch{env.AI_ENABLED='false';env.AI_ALLOW_PAID='false';return false;}
}

export function readAIConfig(env={},root=process.cwd()){
 return Object.freeze({
  enabled:env.AI_ENABLED==='true',allowPaid:env.AI_ALLOW_PAID==='true',
  provider:env.AI_PROVIDER||'openai',model:env.OPENAI_MODEL||'gpt-6.1-terra',
  apiKey:env.OPENAI_API_KEY||'',pilotToken:env.AI_PILOT_TOKEN||'',
  timeoutMs:9000,maxOutputTokens:400,maxInputBytes:32000,maxRequests:3,maxToolCalls:2,
  requestsPerMinute:10,sessionTtlMs:30*60*1000,maxSessions:500,
  dailyBudgetNano:budget(env.AI_DAILY_BUDGET_USD,'1',1_000_000_000),
  monthlyBudgetNano:budget(env.AI_MONTHLY_BUDGET_USD,'2',2_000_000_000),
  soulPath:path.join(root,'soul.md'),ledgerPath:path.join(root,'var','ai-usage.json'),
  knowledgeDir:path.join(root,'knowledge')
 });
}
