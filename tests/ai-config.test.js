import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

test('AI configuration is disabled and non-public by default, even when a key exists',async()=>{
 const file=new URL('../lib/ai/config.js',import.meta.url);
 assert.ok(existsSync(file),'La configuration IA sécurisée doit être créée');
 const {readAIConfig}=await import(file);
 const cfg=readAIConfig({OPENAI_API_KEY:'fake-key-never-used'},'/project');
 assert.equal(cfg.enabled,false);assert.equal(cfg.allowPaid,false);assert.equal(cfg.pilotToken,'');
 assert.equal(cfg.model,'gpt-6.1-terra');assert.equal(cfg.soulPath,'/project/soul.md');
 assert.ok(cfg.timeoutMs<10000);assert.equal(cfg.maxOutputTokens,400);
});

test('budget configuration may lower but never exceed pilot ceilings; malformed values fail closed',async()=>{
 const {readAIConfig}=await import('../lib/ai/config.js');
 const small=readAIConfig({AI_DAILY_BUDGET_USD:'0.25',AI_MONTHLY_BUDGET_USD:'2'});
 assert.equal(small.dailyBudgetNano,250_000_000);assert.equal(small.monthlyBudgetNano,2_000_000_000);
 for(const value of ['garbage','-1','Infinity'])assert.equal(readAIConfig({AI_DAILY_BUDGET_USD:value}).dailyBudgetNano,0);
 assert.equal(readAIConfig({}).monthlyBudgetNano,2_000_000_000);
 assert.equal(readAIConfig({AI_MONTHLY_BUDGET_USD:'10'}).monthlyBudgetNano,2_000_000_000);
 assert.equal(readAIConfig({AI_DAILY_BUDGET_USD:'9000'}).dailyBudgetNano,1_000_000_000);
});

test('server-only environment loader fails closed without exposing parser errors',async()=>{
 const module=await import('../lib/ai/config.js');assert.equal(typeof module.loadServerEnvironment,'function');
 const env={AI_ENABLED:'true',AI_ALLOW_PAID:'true'};let seen;
 assert.equal(module.loadServerEnvironment('/private/.env',{env,loader:file=>{seen=file;}}),true);assert.equal(seen,'/private/.env');
 assert.equal(module.loadServerEnvironment('/private/.env',{env,loader:()=>{throw Error('NEVER-EXPOSE-THIS');}}),false);
 assert.equal(env.AI_ENABLED,'false');assert.equal(env.AI_ALLOW_PAID,'false');
});
