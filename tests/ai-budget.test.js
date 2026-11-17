import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync, mkdirSync, symlinkSync} from 'node:fs';
import path from 'node:path';

const {createBudgetLedger} = await import('../lib/ai/budget.js').catch(error => {
 if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
 return {createBudgetLedger: () => {throw new Error('budget ledger implementation missing');}};
});
function fixture(t, overrides={}) {
 assert.ok(process.env.TMPDIR, 'tests require TMPDIR');
 const root=mkdtempSync(path.join(process.env.TMPDIR,'ai-budget-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const config={model:'gpt-6.1-terra',dailyBudgetNano:1_000_000_000,monthlyBudgetNano:10_000_000_000,maxInputBytes:32_000,maxOutputTokens:400,maxRequests:3,ledgerPath:path.join(root,'private','ledger.json'),...overrides};
 return {root,config};
}
const worst=3*(32_000+2048)*3000+3*400*6000;

test('failed reload after locking never permits a later stale-state reservation',t=>{
 const {config}=fixture(t);const ledger=createBudgetLedger(config);
 mkdirSync(path.dirname(config.ledgerPath));
 writeFileSync(config.ledgerPath,'corrupt');
 assert.throws(()=>ledger.reserve(),/corrupt/i);
 assert.throws(()=>ledger.reserve(),/corrupt|unavailable/i);
 assert.equal(readFileSync(config.ledgerPath,'utf8'),'corrupt');
 assert.equal(ledger.stats().daily.attemptedRequests,0);
 ledger.close();
});

test('safe-integer counter limits fail without mutating or refunding the ledger',t=>{
 for(const field of ['attemptedRequests','providerCalls']){
  const {config}=fixture(t);const bucket={attemptedRequests:0,providerCalls:0,costNano:0};
  bucket[field]=Number.MAX_SAFE_INTEGER;
  mkdirSync(path.dirname(config.ledgerPath));
  writeFileSync(config.ledgerPath,JSON.stringify({version:1,days:{'2026-11-12':bucket},months:{'2026-11':bucket}}));
  const ledger=createBudgetLedger(config,{clock:()=>new Date('2026-11-12T00:00:00Z')});
  if(field==='attemptedRequests')assert.throws(()=>ledger.reserve(),/counter|arithmetic/i);
  else {
   const ticket=ledger.reserve();
   assert.throws(()=>ticket.settle({inputTokens:0,outputTokens:0,calls:1}),/counter|arithmetic/i);
   assert.throws(()=>ticket.fail());
   assert.equal(ledger.stats().daily.costNano,worst);
  }
  const saved=JSON.parse(readFileSync(config.ledgerPath));
  assert.equal(saved.days['2026-11-12'][field],Number.MAX_SAFE_INTEGER);
  assert.equal(ledger.stats().daily[field],Number.MAX_SAFE_INTEGER);
  ledger.close();
  const reopened=createBudgetLedger(config);reopened.close();
 }
});

test('settlement refunds provision, records calls and survives reopen',t=>{
 const {config}=fixture(t);let ledger=createBudgetLedger(config);
 const ticket=ledger.reserve();ticket.settle({inputTokens:100,outputTokens:20,calls:2});
 assert.equal(ledger.stats().daily.costNano,420000);
 assert.equal(ledger.stats().daily.providerCalls,2);
 assert.throws(()=>ticket.fail());assert.throws(()=>ticket.settle({inputTokens:0,outputTokens:0,calls:0}));
 ledger.close();ledger=createBudgetLedger(config);
 assert.equal(ledger.stats().monthly.costNano,420000);
 ledger.reserve().fail();ledger.close();ledger=createBudgetLedger(config);
 assert.equal(ledger.stats().daily.costNano,420000+worst);
 assert.equal(ledger.stats().daily.attemptedRequests,2);
 ledger.close();
});

test('concurrent open reservations cannot exceed daily or monthly cap',t=>{
 for(const key of ['dailyBudgetNano','monthlyBudgetNano']){
  const {config}=fixture(t,{[key]:worst});const ledger=createBudgetLedger(config);
  const ticket=ledger.reserve();assert.throws(()=>ledger.reserve(),/budget/i);
  assert.equal(ledger.stats().daily.attemptedRequests,1);
  ticket.fail();assert.throws(()=>ticket.fail());ledger.close();
 }
});

test('unsafe configuration fails without creating files',t=>{
 for(const override of [{model:'toString'},{model:'unsupported'},{dailyBudgetNano:0},{monthlyBudgetNano:0},{maxInputBytes:Infinity},{maxOutputTokens:-1},{maxRequests:1.1},{dailyBudgetNano:NaN},{monthlyBudgetNano:Number.MAX_SAFE_INTEGER+1},{maxRequests:Number.MAX_SAFE_INTEGER},{ledgerPath:''}]){
  const {config,root}=fixture(t,override);
  assert.throws(()=>{const ledger=createBudgetLedger(config);try{ledger.reserve();}finally{ledger.close();}});
  assert.equal(existsSync(path.join(root,'private')),false);
 }
});

test('invalid or overreported settlement retains full provision and consumes ticket',t=>{
 const invalid=[undefined,null,{}, {inputTokens:-1,outputTokens:0,calls:1}, {inputTokens:NaN,outputTokens:0,calls:1}, {inputTokens:1.5,outputTokens:0,calls:1}, {inputTokens:0,outputTokens:Infinity,calls:1}, {inputTokens:3*(32000+2048)+1,outputTokens:0,calls:1}, {inputTokens:0,outputTokens:1201,calls:1}, {inputTokens:0,outputTokens:0,calls:4}, {inputTokens:0,outputTokens:0,calls:-1}, {inputTokens:0,outputTokens:0,calls:Number.MAX_SAFE_INTEGER+1}];
 for(const usage of invalid){
  const {config}=fixture(t);const ledger=createBudgetLedger(config);const ticket=ledger.reserve();
  assert.throws(()=>ticket.settle(usage));
  assert.equal(ledger.stats().daily.costNano,worst);
  assert.equal(ledger.stats().daily.providerCalls,0);
  assert.throws(()=>ticket.settle({inputTokens:0,outputTokens:0,calls:0}));
  ledger.close();assert.equal(createBudgetLedger(config).stats().daily.costNano,worst);
 }
});

test('corrupt or unsafe persisted counters fail closed',t=>{
 const invalid=['not json','null','{}',JSON.stringify({version:2,days:{},months:{}}),JSON.stringify({version:1,days:{'2026-11-12':{attemptedRequests:1,providerCalls:0,costNano:-1}},months:{}}),JSON.stringify({version:1,days:{},months:{'2026-11':{attemptedRequests:1,providerCalls:0,costNano:1}}}),JSON.stringify({version:1,days:{},months:{},prompt:'must reject extra fields'})];
 for(const content of invalid){
  const {config}=fixture(t);const ledger=createBudgetLedger(config);ledger.reserve().fail();ledger.close();
  writeFileSync(config.ledgerPath,content);
  assert.throws(()=>createBudgetLedger(config),/corrupt/i);
  assert.equal(readFileSync(config.ledgerPath,'utf8'),content);
 }
});

test('independent instances and processes cannot spend through the same held lock',t=>{
 const {config}=fixture(t,{dailyBudgetNano:worst});const first=createBudgetLedger(config),second=createBudgetLedger(config);
 first.reserve().fail();assert.throws(()=>second.reserve());
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import {createBudgetLedger} from ${JSON.stringify(new URL('../lib/ai/budget.js',import.meta.url).href)}; const ledger=createBudgetLedger(${JSON.stringify(config)});try{ledger.reserve();process.exitCode=2;}catch{console.log('LOCKED');}finally{ledger.close();}`],{encoding:'utf8'});
 assert.equal(child.status,0);assert.match(child.stdout,/LOCKED/);
 first.close();assert.throws(()=>second.reserve(),/budget/i);second.close();
});

test('UTC rollover keeps open tickets in their original day and month',t=>{
 const {config}=fixture(t);let now=new Date('2026-11-30T23:59:59Z');const ledger=createBudgetLedger(config,{clock:()=>now});
 const oldTicket=ledger.reserve();now=new Date('2026-12-01T00:00:00Z');const newTicket=ledger.reserve();
 oldTicket.settle({inputTokens:2,outputTokens:1,calls:1});assert.equal(ledger.stats().daily.costNano,worst);
 const saved=JSON.parse(readFileSync(config.ledgerPath));assert.equal(saved.months['2026-11'].costNano,2*3000+6000);assert.equal(saved.months['2026-12'].costNano,worst);
 newTicket.fail();ledger.close();const reopened=createBudgetLedger(config,{clock:()=>new Date('2026-11-30T23:59:59Z')});
 assert.equal(reopened.stats().daily.costNano,2*3000+6000);reopened.close();
});

test('a new day does not reset the monthly spending ceiling',t=>{
 const {config}=fixture(t,{monthlyBudgetNano:worst});let now=new Date('2026-11-12T23:59:59Z');const ledger=createBudgetLedger(config,{clock:()=>now});
 ledger.reserve().fail();now=new Date('2026-11-13T00:00:00Z');assert.equal(ledger.stats().daily.costNano,0);assert.throws(()=>ledger.reserve(),/budget/i);ledger.close();
});

test('lazy reservation persists worst case privately and counts attempts',t=>{
 const {config}=fixture(t); const ledger=createBudgetLedger(config);
 assert.equal(existsSync(path.dirname(config.ledgerPath)),false);
 assert.equal(ledger.stats().daily.costNano,0);
 assert.equal(existsSync(path.dirname(config.ledgerPath)),false);
 ledger.reserve();
 assert.equal(ledger.stats().daily.costNano,worst);
 assert.equal(ledger.stats().daily.attemptedRequests,1);
 assert.equal(ledger.stats().daily.providerCalls,0);
 assert.equal(JSON.parse(readFileSync(config.ledgerPath)).version,1);
 assert.equal(statSync(config.ledgerPath).mode&0o777,0o600);
 assert.equal(statSync(path.dirname(config.ledgerPath)).mode&0o777,0o700);
 ledger.close();
});
