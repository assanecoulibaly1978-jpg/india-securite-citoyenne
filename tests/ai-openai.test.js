import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => (await import('../lib/ai/openai.js')).createOpenAITransport;
const usage = () => ({ input_tokens: 12, output_tokens: 8, input_tokens_details: { cached_tokens: 3 } });
const wire = (value = { reply: 'Bonjour', contact_ids: ['contact-1'] }) => ({
  status: 'completed', output: [{ type: 'message', status: 'completed', role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: usage(),
});
const response = (raw) => new Response(JSON.stringify(raw), { status: 200 });
const call = (overrides = {}) => ({ type: 'function_call', status: 'completed', call_id: 'call_1', name: 'lookup', arguments: '{"query":"help"}', ...overrides });
const args = { instructions: 'Fake instructions', input: 'Fake input' };
const generic = (error) => {
  assert.equal(error.constructor, Error);
  assert.equal(error.message, 'IA indisponible');
  assert.equal(error.cause, undefined);
  assert.ok(!JSON.stringify(error).includes('FAKE_SECRET'));
  return true;
};

test('posts strict structured request to fixed endpoint and parses final reply', async () => {
  const create = await load();
  const raw = wire();
  const controller = new AbortController();
  let calls = 0;
  const transport = create({ apiKey: 'FAKE_SECRET', fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, controller.signal);
    assert.deepEqual(init.headers, { Authorization: 'Bearer FAKE_SECRET', 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(init.body), {
      model: 'gpt-6.1-terra', service_tier: 'default', store: false, reasoning: { effort: 'none' }, max_output_tokens: 400,
      ...args, text: { format: { type: 'json_schema', name: 'secours_reply', strict: true,
        schema: { type: 'object', properties: { reply: { type: 'string', maxLength: 2000 },
          contact_ids: { type: 'array', items: { type: 'string' }, maxItems: 5 } },
        required: ['reply', 'contact_ids'], additionalProperties: false } } },
    });
    return response(raw);
  } });
  assert.deepEqual(await transport({ ...args, signal: controller.signal }), {
    reply: 'Bonjour', contactIds: ['contact-1'], toolCalls: [], outputItems: raw.output,
    usage: { inputTokens: 12, outputTokens: 8, cachedInputTokens: 3 },
  });
  assert.equal(calls, 1);
});

test('tool-only output preserves call IDs and argument strings with tool controls', async () => {
  const create = await load();
  const tools = [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }];
  const raw = { ...wire(), output: [call()] };
  const transport = create({ apiKey: 'fake', fetchImpl: async (_, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body.tools, tools);
    assert.equal(body.tool_choice, 'auto');
    assert.equal(body.parallel_tool_calls, false);
    return response(raw);
  } });
  assert.deepEqual(await transport({ ...args, tools }), {
    reply: null, contactIds: [], toolCalls: [{ id: 'call_1', name: 'lookup', arguments: '{"query":"help"}' }],
    outputItems: raw.output, usage: { inputTokens: 12, outputTokens: 8, cachedInputTokens: 3 },
  });
});

test('concatenates output_text segments and permits mixed calls and structured reply', async () => {
  const create = await load();
  const raw = wire();
  raw.output[0].content = [{ type: 'output_text', text: '{"reply":"Hi",' }, { type: 'output_text', text: '"contact_ids":[]}' }];
  raw.output.unshift(call());
  const result = await create({ apiKey: 'fake', fetchImpl: async () => response(raw) })(args);
  assert.equal(result.reply, 'Hi');
  assert.equal(result.toolCalls.length, 1);
});

test('sanitizes HTTP, network and malformed response JSON errors', async () => {
  const create = await load();
  for (const fetchImpl of [
    async () => new Response('FAKE_SECRET upstream prompt', { status: 401 }),
    async () => { throw new Error('FAKE_SECRET upstream prompt'); },
    async () => new Response('{FAKE_SECRET'),
  ]) {
    await assert.rejects(create({ apiKey: 'FAKE_SECRET', fetchImpl })(args), generic);
  }
});

test('rejects malformed structured values, incomplete output, tool calls and usage', async (t) => {
  const create = await load();
  const cases = {
    'missing usage': r => { delete r.usage; },
    'missing cache usage': r => { delete r.usage.input_tokens_details; },
    'missing cache count': r => { delete r.usage.input_tokens_details.cached_tokens; },
    'string usage': r => { r.usage.input_tokens = '12'; },
    'negative usage': r => { r.usage.output_tokens = -1; },
    'fractional usage': r => { r.usage.output_tokens = 1.5; },
    'unsafe usage': r => { r.usage.input_tokens = Number.MAX_SAFE_INTEGER + 1; },
    'impossible cache usage': r => { r.usage.input_tokens_details.cached_tokens = 13; },
    'incomplete response': r => { r.status = 'incomplete'; },
    'missing status': r => { delete r.status; },
    'failed response': r => { r.status = 'failed'; },
    'incomplete details': r => { r.incomplete_details = { reason: 'max_output_tokens' }; },
    'error envelope': r => { r.error = { message: 'FAKE_SECRET' }; },
    'incomplete message': r => { r.output[0].status = 'incomplete'; },
    'empty output': r => { r.output = []; },
    'nonarray output': r => { r.output = {}; },
    'null item': r => { r.output = [null]; },
    'bad content': r => { r.output[0].content = {}; },
    'bad text type': r => { r.output[0].content[0].text = 42; },
    'refusal': r => { r.output[0].content = [{ type: 'refusal', refusal: 'FAKE_SECRET' }]; },
    'malformed structured JSON': r => { r.output[0].content[0].text = '{FAKE_SECRET'; },
    'missing reply': r => { r.output = wire({ contact_ids: [] }).output; },
    'null reply': r => { r.output = wire({ reply: null, contact_ids: [] }).output; },
    'long reply': r => { r.output = wire({ reply: 'a'.repeat(2001), contact_ids: [] }).output; },
    'wrong contacts': r => { r.output = wire({ reply: '', contact_ids: [7] }).output; },
    'too many contacts': r => { r.output = wire({ reply: '', contact_ids: Array(6).fill('x') }).output; },
    'extra key': r => { r.output = wire({ reply: '', contact_ids: [], extra: true }).output; },
    'null structured JSON': r => { r.output = wire(null).output; },
    'array structured JSON': r => { r.output = wire([]).output; },
    'malformed arguments': r => { r.output = [call({ arguments: '{FAKE_SECRET' })]; },
    'object arguments': r => { r.output = [call({ arguments: {} })]; },
    'array arguments': r => { r.output = [call({ arguments: '[]' })]; },
    'null arguments': r => { r.output = [call({ arguments: 'null' })]; },
    'missing call id': r => { r.output = [call({ call_id: undefined })]; },
    'empty name': r => { r.output = [call({ name: '' })]; },
    'incomplete reasoning': r => { r.output.unshift({ type: 'reasoning', status: 'incomplete' }); },
    'incomplete call': r => { r.output = [call({ status: 'incomplete' })]; },
    'too many calls': r => { r.output = [call(), call({ call_id: '2' }), call({ call_id: '3' })]; },
    'duplicate call id': r => { r.output = [call(), call()]; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async () => {
      const raw = wire(); mutate(raw);
      await assert.rejects(create({ apiKey: 'FAKE_SECRET', fetchImpl: async () => response(raw) })(args), generic);
    });
  }
});

test('bounds response bytes even without or with misleading Content-Length', async (t) => {
  const create = await load();
  for (const [name, make] of [
    ['large body', () => new Response(JSON.stringify({ ...wire(), padding: 'x'.repeat(262145) }))],
    ['multibyte body', () => new Response(JSON.stringify({ ...wire(), padding: 'é'.repeat(140000) }))],
    ['oversize declared length', () => new Response(JSON.stringify(wire()), { headers: { 'Content-Length': '262145' } })],
    ['false small length', () => new Response(JSON.stringify({ ...wire(), padding: 'x'.repeat(262145) }), { headers: { 'Content-Length': '1' } })],
    ['truncated JSON', () => new Response(JSON.stringify(wire()).slice(0, -1))],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(create({ apiKey: 'fake', fetchImpl: async () => make() })(args), generic);
    });
  }
});

test('cancels oversized chunked streams without consuming remainder', { timeout: 1000 }, async () => {
  const create = await load();
  let cancelled = false;
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(150000));
    controller.enqueue(new Uint8Array(150000));
  }, cancel() { cancelled = true; } });
  await assert.rejects(create({ apiKey: 'fake', fetchImpl: async () => new Response(body) })(args), generic);
  assert.equal(cancelled, true);
});

test('pre-aborted signal avoids fetch', async () => {
  const create = await load();
  let calls = 0;
  const controller = new AbortController(); controller.abort('FAKE_SECRET');
  await assert.rejects(create({ apiKey: 'fake', fetchImpl: async () => { calls++; return response(wire()); } })({ ...args, signal: controller.signal }), generic);
  assert.equal(calls, 0);
});

test('abort interrupts pending fetch even if injected fetch ignores signal', { timeout: 1000 }, async () => {
  const create = await load();
  const controller = new AbortController();
  const pending = create({ apiKey: 'fake', fetchImpl: () => new Promise(() => {}) })({ ...args, signal: controller.signal });
  controller.abort('FAKE_SECRET');
  await assert.rejects(pending, generic);
});

test('abort interrupts stalled body and cancels reader', { timeout: 1000 }, async () => {
  const create = await load();
  const controller = new AbortController();
  let cancelled = false;
  const pending = create({ apiKey: 'fake', fetchImpl: async () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; },
  })) })({ ...args, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort('FAKE_SECRET');
  await assert.rejects(pending, generic);
  assert.equal(cancelled, true);
});

test('caps requested output tokens and preserves smaller positive budgets', async () => {
  const create = await load();
  for (const [requested, expected] of [[9999, 400], [1, 1], [80, 80], [0, 1], [-5, 1], [2.8, 2], [NaN, 400], [Infinity, 400]]) {
    await create({ apiKey: 'fake', model: 'test-model', maxOutputTokens: requested, fetchImpl: async (_, init) => {
      assert.equal(JSON.parse(init.body).max_output_tokens, expected);
      assert.equal(JSON.parse(init.body).model, 'test-model');
      return response(wire());
    } })(args);
  }
});
