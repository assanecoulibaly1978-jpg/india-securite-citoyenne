import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import mutableFs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const moduleUrl = new URL('../lib/ai/session-audit.js', import.meta.url);
const event = (overrides = {}) => ({session: randomUUID(), event: 'authorized', reason: 'none', usedRequests: 0, remainingRequests: 3, sessionCostNano: 0, requestCostNano: 0, ...overrides});
const fixture = t => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'session-audit-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, dir: path.join(root, 'var'), file: path.join(root, 'var/india-session-events.jsonl')};
};
const load = async () => (await import(moduleUrl)).createSessionAudit;
const events = ['authorized', 'request_started', 'request_settled', 'request_failed', 'ended', 'general_blocked', 'local_routed', 'local_selected'];
const reasons = ['none', 'expired', 'quota_exhausted', 'budget_exhausted', 'safety_boundary', 'local_boundary', 'sensitive_boundary', 'administrative_boundary', 'cleared', 'logout', 'provider_error', 'output_rejected', 'invalid_usage', 'timeout', 'cancelled', 'ledger_unavailable', 'audit_unavailable', 'server_closed', 'manual_local'];

test('schema rejects all extra fields, non-data objects, identifiers and out-of-bounds values before writing', async t => {
  const createSessionAudit = await load();
  const {root, dir} = fixture(t);
  const audit = createSessionAudit({root});
  const secret = 'SECRET-CONTENT-DO-NOT-LOG';
  const invalid = [null, [], secret, {}, Object.assign(Object.create({}), event())];
  for (const key of Object.keys(event())) { const value = event(); delete value[key]; invalid.push(value); }
  for (const key of ['message', 'reply', 'model', 'key', 'cookie', 'permitID', 'version', 'at']) invalid.push(event({[key]: secret}));
  invalid.push(event({[Symbol('secret')]: secret}));
  for (const session of [secret, '12345678-1234-1234-1234-123456789012', '', null]) invalid.push(event({session}));
  for (const key of ['event', 'reason']) for (const value of [secret, '', null, 1]) invalid.push(event({[key]: value}));
  for (const key of ['usedRequests', 'remainingRequests']) for (const value of [-1, 4, 0.5, NaN, Infinity, '1', null]) invalid.push(event({[key]: value}));
  for (const key of ['sessionCostNano', 'requestCostNano']) for (const value of [-1, 150000001, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null]) invalid.push(event({[key]: value}));
  let getterCalls = 0;
  invalid.push(Object.defineProperty(event(), 'session', {get() { getterCalls++; throw Error(secret); }}));
  invalid.push(event({toJSON() { return {message: secret}; }}));
  for (const input of invalid) assert.throws(() => audit.record(input));
  assert.equal(getterCalls, 0);
  assert.equal(fs.existsSync(dir), false);
});

test('every allowed event and reason is accepted, including numeric upper bounds', async t => {
  const createSessionAudit = await load();
  const {root, file} = fixture(t);
  const audit = createSessionAudit({root});
  for (const value of events) audit.record(event({event: value}));
  for (const value of reasons) audit.record(event({reason: value, usedRequests: 3, remainingRequests: 0, sessionCostNano: 150000000, requestCostNano: 150000000}));
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, events.length + reasons.length);
  assert.deepEqual(rows.slice(0, events.length).map(row => row.event), events);
  assert.deepEqual(rows.slice(events.length).map(row => row.reason), reasons);
});

for (const target of ['var', 'live', 'rotation']) {
  for (const kind of ['symlink', 'dangling', 'hardlink', 'public', 'special-mode', 'wrong-type']) {
    if (target === 'var' && kind === 'hardlink') continue;
    test(`rejects unsafe ${target} ${kind} without modifying its target or permissions`, async t => {
      const createSessionAudit = await load();
      const {root, dir, file} = fixture(t);
      const sentinel = path.join(root, 'sentinel');
      fs.writeFileSync(sentinel, 'PRIVATE-LEDGER-UNTOUCHED', {mode: 0o600});
      if (target !== 'var') fs.mkdirSync(dir, {mode: 0o700});
      const destination = target === 'var' ? dir : target === 'live' ? file : file + '.1';
      if (kind === 'symlink') fs.symlinkSync(target === 'var' ? root : sentinel, destination);
      if (kind === 'dangling') fs.symlinkSync(path.join(root, 'missing'), destination);
      if (kind === 'hardlink') fs.linkSync(sentinel, destination);
      if (kind === 'wrong-type') {
        if (target === 'var') fs.writeFileSync(destination, 'not-directory', {mode: 0o600});
        else fs.mkdirSync(destination, {mode: 0o700});
      }
      if (kind === 'public' || kind === 'special-mode') {
        if (target === 'var') fs.mkdirSync(destination, {mode: 0o700});
        else fs.writeFileSync(destination, '', {mode: 0o600});
        fs.chmodSync(destination, kind === 'public' ? 0o755 : (target === 'var' ? 0o1700 : 0o4600));
      }
      const before = fs.lstatSync(destination);
      const audit = createSessionAudit({root});
      assert.throws(() => audit.record(event()));
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'PRIVATE-LEDGER-UNTOUCHED');
      assert.equal(fs.lstatSync(destination).mode, before.mode);
      assert.equal(fs.lstatSync(destination).ino, before.ino);
    });
  }
}

test('rechecks directory and live file on every record, even after successful creation', async t => {
  const createSessionAudit = await load();
  const {root, dir, file} = fixture(t);
  const audit = createSessionAudit({root});
  audit.record(event());
  const before = fs.readFileSync(file, 'utf8');
  fs.chmodSync(file, 0o644);
  assert.throws(() => audit.record(event()));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.chmodSync(file, 0o600);
  fs.chmodSync(dir, 0o755);
  assert.throws(() => audit.record(event()));
  assert.equal(fs.statSync(dir).mode & 0o777, 0o755);
});

test('bounded rotation keeps whole records in live plus one private segment and leaves the ledger untouched', async t => {
  const createSessionAudit = await load();
  const {root, dir, file} = fixture(t);
  const input = event();
  const at = '2026-11-13T14:00:00.000Z';
  const line = JSON.stringify({version: 1, at, ...input}) + '\n';
  const maxBytes = Buffer.byteLength(line) * 2;
  fs.mkdirSync(dir, {mode: 0o700});
  const ledger = path.join(dir, 'billing-ledger.json');
  fs.writeFileSync(ledger, 'BILLING-KEEP', {mode: 0o600});
  const audit = createSessionAudit({root, clock: () => new Date(at), maxBytes});
  audit.record(input);
  audit.record(input);
  assert.equal(fs.statSync(file).size, maxBytes);
  assert.equal(fs.existsSync(file + '.1'), false);
  audit.record(input);
  assert.equal(fs.readFileSync(file + '.1', 'utf8'), line.repeat(2));
  assert.equal(fs.readFileSync(file, 'utf8'), line);
  for (let i = 0; i < 20; i++) {
    audit.record(input);
    for (const segment of [file, file + '.1']) {
      assert.ok(fs.statSync(segment).size <= maxBytes);
      assert.equal(fs.statSync(segment).mode & 0o7777, 0o600);
      for (const row of fs.readFileSync(segment, 'utf8').trim().split('\n')) assert.deepEqual(JSON.parse(row), {version: 1, at, ...input});
    }
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['billing-ledger.json', 'india-session-events.jsonl', 'india-session-events.jsonl.1']);
  assert.equal(fs.readFileSync(ledger, 'utf8'), 'BILLING-KEEP');
});

for (const segment of ['live', 'rotation']) test(`refuses an existing oversized ${segment} without truncating`, async t => {
  const createSessionAudit = await load();
  const {root, dir, file} = fixture(t);
  fs.mkdirSync(dir, {mode: 0o700});
  const destination = segment === 'live' ? file : file + '.1';
  fs.writeFileSync(destination, 'X'.repeat(1025), {mode: 0o600});
  assert.throws(() => createSessionAudit({root, maxBytes: 1024}).record(event()));
  assert.equal(fs.readFileSync(destination, 'utf8'), 'X'.repeat(1025));
});

test('an individual oversized record is rejected before filesystem creation', async t => {
  const createSessionAudit = await load();
  const {root, dir} = fixture(t);
  assert.throws(() => createSessionAudit({root, maxBytes: 1}).record(event()));
  assert.equal(fs.existsSync(dir), false);
});

test('invalid clocks cannot inject timestamps or leak raw error details and do not create files', async t => {
  const createSessionAudit = await load();
  const {root, dir} = fixture(t);
  const clocks = [() => new Date(NaN), () => '2026-11-13', () => null, () => 123, () => ({toISOString: () => 'SECRET-CLOCK'}), () => { throw Error('SECRET-CLOCK'); }];
  for (const clock of clocks) {
    const audit = createSessionAudit({root, clock});
    assert.throws(() => audit.record(event()), error => error.message === 'Session audit unavailable.' && error.cause === undefined);
    assert.equal(fs.existsSync(dir), false);
  }
});

test('configuration is validated without touching disk', async t => {
  const createSessionAudit = await load();
  const {root, dir} = fixture(t);
  for (const maxBytes of [0, -1, NaN, Infinity, 0.5, '1024', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createSessionAudit({root, maxBytes}));
  for (const invalidRoot of [undefined, null, '', 7, {}, 'relative/root']) assert.throws(() => createSessionAudit({root: invalidRoot}));
  assert.throws(() => createSessionAudit({root, clock: null}));
  assert.equal(fs.existsSync(dir), false);
});

test('filesystem failures throw sanitized errors without path details', async t => {
  const createSessionAudit = await load();
  const {root} = fixture(t);
  const audit = createSessionAudit({root: path.join(root, 'SECRET-PATH', 'missing')});
  assert.throws(() => audit.record(event()), error => error.message === 'Session audit unavailable.' && error.cause === undefined && !Object.hasOwn(error, 'path'));
});

for (const target of ['var', 'live', 'rotation']) test(`rejects a wrong-owner ${target} without changing it`, async t => {
  const createSessionAudit = await load();
  const {root, dir, file} = fixture(t);
  fs.mkdirSync(dir, {mode: 0o700});
  fs.writeFileSync(file, '', {mode: 0o600});
  fs.writeFileSync(file + '.1', '', {mode: 0o600});
  const destination = target === 'var' ? dir : target === 'live' ? file : file + '.1';
  const original = mutableFs.lstatSync;
  const mock = t.mock.method(mutableFs, 'lstatSync', function(name, ...args) {
    const info = original.call(this, name, ...args);
    if (name === destination) Object.defineProperty(info, 'uid', {value: process.getuid() + 1});
    return info;
  });
  syncBuiltinESMExports();
  try { assert.throws(() => createSessionAudit({root}).record(event())); }
  finally { mock.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(fs.readFileSync(file, 'utf8'), '');
  assert.equal(fs.readFileSync(file + '.1', 'utf8'), '');
});

for (const operation of ['writeSync', 'fsyncSync']) test(`throws sanitized errors on ${operation} failure`, async t => {
  const createSessionAudit = await load();
  const {root} = fixture(t);
  const mock = t.mock.method(mutableFs, operation, () => { throw Error('SECRET-IO-ERROR'); });
  syncBuiltinESMExports();
  try { assert.throws(() => createSessionAudit({root}).record(event()), error => error.message === 'Session audit unavailable.' && error.cause === undefined); }
  finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test('rechecks descriptor link count immediately before writing', async t => {
  const createSessionAudit = await load();
  const {root, file} = fixture(t);
  const original = mutableFs.fstatSync;
  let fileChecks = 0;
  const mock = t.mock.method(mutableFs, 'fstatSync', function(...args) {
    const info = original.apply(this, args);
    if (info.isFile() && ++fileChecks === 2) fs.linkSync(file, file + '.alias');
    return info;
  });
  syncBuiltinESMExports();
  try { assert.throws(() => createSessionAudit({root}).record(event())); }
  finally { mock.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(fs.readFileSync(file, 'utf8'), '');
});

test('lazy construction; first record writes only the allowlisted versioned UTC event privately', async t => {
  const createSessionAudit = await load();
  const {root, dir, file} = fixture(t);
  const audit = createSessionAudit({root, clock: () => new Date('2026-11-13T15:00:00+01:00')});
  assert.equal(fs.existsSync(dir), false);
  const input = event();
  audit.record(input);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {version: 1, at: '2026-11-13T14:00:00.000Z', ...input});
  assert.equal(fs.statSync(dir).mode & 0o7777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o7777, 0o600);
  assert.equal(fs.statSync(file).nlink, 1);
  if (process.getuid) assert.equal(fs.statSync(file).uid, process.getuid());
});
