import {constants as C, mkdirSync, lstatSync, openSync, closeSync, fstatSync, writeSync, fsyncSync, renameSync} from 'node:fs';
import path from 'node:path';

const fields = ['session', 'event', 'reason', 'usedRequests', 'remainingRequests', 'sessionCostNano', 'requestCostNano'];
const events = new Set(['authorized', 'request_started', 'request_settled', 'request_failed', 'ended', 'general_blocked', 'local_routed', 'local_selected']);
const reasons = new Set(['none', 'expired', 'quota_exhausted', 'budget_exhausted', 'safety_boundary', 'local_boundary', 'sensitive_boundary', 'administrative_boundary', 'cleared', 'logout', 'provider_error', 'output_rejected', 'invalid_usage', 'timeout', 'cancelled', 'ledger_unavailable', 'audit_unavailable', 'server_closed', 'manual_local']);
const failure = () => new Error('Session audit unavailable.');

function allowlisted(input) {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== fields.length || fields.some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))) throw failure();
  const value = Object.fromEntries(fields.map(key => [key, descriptors[key].value]));
  // UUID shape cannot establish provenance: the controller must mint a distinct
  // random audit UUID, never reuse a cookie, permit ID or request-supplied ID.
  if (typeof value.session !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.session) || !events.has(value.event) || !reasons.has(value.reason)) throw failure();
  for (const key of ['usedRequests', 'remainingRequests', 'sessionCostNano', 'requestCostNano']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > (key.endsWith('Requests') ? 3 : 150000000)) throw failure();
  }
  return value;
}

const nofollow = C.O_NOFOLLOW || 0;
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function check(info, directory = false) {
  if (typeof process.getuid !== 'function' || info.uid !== process.getuid() || info.isSymbolicLink() ||
      (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
      (info.mode & 0o7777) !== (directory ? 0o700 : 0o600)) throw failure();
  return info;
}
function inspect(file) {
  try { return check(lstatSync(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function openChecked(file, flags, before) {
  const fd = openSync(file, flags | nofollow | (C.O_NONBLOCK || 0), 0o600);
  try {
    const current = check(fstatSync(fd));
    if ((before && !same(before, current)) || !same(current, check(lstatSync(file)))) throw failure();
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
function openDirectory(directory) {
  try { mkdirSync(directory, {mode: 0o700}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const before = check(lstatSync(directory), true);
  const fd = openSync(directory, C.O_RDONLY | nofollow | (C.O_DIRECTORY || 0));
  try {
    if (!same(before, check(fstatSync(fd), true))) throw failure();
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

// Synchronous for the controller's single-process writer; no provider/network
// access, console logging, permission repair, or billing-ledger manipulation.
export function createSessionAudit({root, clock = () => new Date(), maxBytes = 262144} = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || typeof clock !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw failure();
  return {record(event) {
    try {
      const value = allowlisted(event);
      const line = JSON.stringify({version: 1, at: Date.prototype.toISOString.call(clock()), ...value}) + '\n';
      const bytes = Buffer.from(line);
      if (bytes.length > maxBytes) throw failure();
      const directory = path.join(root, 'var');
      const dirfd = openDirectory(directory);
      try {
        const file = path.join(directory, 'india-session-events.jsonl');
        const previous = inspect(file + '.1');
        if (previous) {
          const fd = openChecked(file + '.1', C.O_RDONLY, previous);
          try { if (fstatSync(fd).size > maxBytes) throw failure(); }
          finally { closeSync(fd); }
        }
        const before = inspect(file);
        if (before && before.size > maxBytes) throw failure();
        let fd = openChecked(file, C.O_WRONLY | C.O_APPEND | (before ? 0 : C.O_CREAT | C.O_EXCL), before);
        try {
          const current = check(fstatSync(fd));
          if (current.size > maxBytes) throw failure();
          if (current.size + bytes.length > maxBytes) {
            // No temporary files or truncation: move the validated complete segment.
            if (!same(check(lstatSync(directory), true), check(fstatSync(dirfd), true)) || !same(current, inspect(file))) throw failure();
            const destination = inspect(file + '.1');
            if (previous ? !destination || !same(previous, destination) : destination) throw failure();
            renameSync(file, file + '.1');
            closeSync(fd);
            fd = null;
            const rotated = inspect(file + '.1');
            if (!rotated || !same(current, rotated)) throw failure();
            fd = openChecked(file, C.O_WRONLY | C.O_APPEND | C.O_CREAT | C.O_EXCL, null);
          }
          const writable = check(fstatSync(fd));
          if (!same(writable, inspect(file)) || !same(check(lstatSync(directory), true), check(fstatSync(dirfd), true)) || writable.size + bytes.length > maxBytes) throw failure();
          let offset = 0;
          while (offset < bytes.length) {
            const written = writeSync(fd, bytes, offset, bytes.length - offset);
            if (written <= 0) throw failure();
            offset += written;
          }
          fsyncSync(fd);
          fsyncSync(dirfd);
        } finally { if (fd !== null) closeSync(fd); }
      } finally { closeSync(dirfd); }
    } catch { throw failure(); }
  }};
}
