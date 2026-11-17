const format = {
  type: 'json_schema', name: 'secours_reply', strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', maxLength: 2000 },
      contact_ids: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    },
    required: ['reply', 'contact_ids'], additionalProperties: false,
  },
};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const tokenCount = value => Number.isSafeInteger(value) && value >= 0;
function requireValid(value) {
  if (!value) throw new Error('IA indisponible');
}

// Race against cancellation even when a custom fetch does not implement it.
async function abortable(promise, signal) {
  if (!signal) return await promise;
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('IA indisponible'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function readBoundedJSON(response, signal) {
  const maxBytes = 256 * 1024;
  const reader = response.body.getReader();
  let complete = false;
  try {
    const declared = response.headers.get('content-length');
    requireValid(declared == null || Number(declared) <= maxBytes);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      requireValid(bytes <= maxBytes);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    signal?.throwIfAborted();
    const raw = JSON.parse(text);
    complete = true;
    return raw;
  } finally {
    // Do not wait on an untrusted stream's cancellation hook.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createOpenAITransport({
  apiKey, model = 'gpt-6.1-terra', fetchImpl = globalThis.fetch, maxOutputTokens = 400,
}) {
  const tokenLimit = Number.isFinite(maxOutputTokens)
    ? Math.max(1, Math.min(400, Math.floor(maxOutputTokens))) : 400;
  return async function ({ instructions, input, tools = [], signal }) {
    try {
      signal?.throwIfAborted();
      const result = await abortable(fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, service_tier: 'default', store: false, reasoning: { effort: 'none' }, max_output_tokens: tokenLimit,
          instructions, input, text: { format },
          ...(tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
        }),
      }), signal);
      if (!result.ok) {
        void result.body?.cancel().catch(() => {});
        throw new Error();
      }
      const raw = await readBoundedJSON(result, signal);
      requireValid(isObject(raw) && raw.status === 'completed' && raw.incomplete_details == null && raw.error == null);
      requireValid(Array.isArray(raw.output));
      const counts = raw.usage;
      requireValid(isObject(counts) && tokenCount(counts.input_tokens) && tokenCount(counts.output_tokens)
        && isObject(counts.input_tokens_details) && tokenCount(counts.input_tokens_details.cached_tokens)
        && counts.input_tokens_details.cached_tokens <= counts.input_tokens);
      const toolCalls = [];
      const texts = [];
      for (const item of raw.output) {
        requireValid(isObject(item));
        if (item.type === 'function_call') {
          requireValid(item.status == null || item.status === 'completed');
          requireValid(typeof item.call_id === 'string' && item.call_id.trim().length > 0
            && typeof item.name === 'string' && item.name.trim().length > 0 && typeof item.arguments === 'string');
          requireValid(isObject(JSON.parse(item.arguments)));
          requireValid(toolCalls.length < 2 && !toolCalls.some(call => call.id === item.call_id));
          toolCalls.push({ id: item.call_id, name: item.name, arguments: item.arguments });
        } else if (item.type === 'message') {
          requireValid(item.status === 'completed' && item.role === 'assistant' && Array.isArray(item.content));
          for (const part of item.content) {
            requireValid(isObject(part) && part.type === 'output_text' && typeof part.text === 'string');
            texts.push(part.text);
          }
        } else {
          // Reasoning items may accompany message/function output on Responses.
          requireValid(item.type === 'reasoning' && (item.status == null || item.status === 'completed'));
        }
      }
      const text = texts.join('');
      const parsed = text ? JSON.parse(text) : null;
      requireValid(text.length > 0 || toolCalls.length > 0);
      if (text) {
        requireValid(isObject(parsed) && Object.keys(parsed).length === 2
          && typeof parsed.reply === 'string' && [...parsed.reply].length <= 2000
          && Array.isArray(parsed.contact_ids) && parsed.contact_ids.length <= 5
          && parsed.contact_ids.every(id => typeof id === 'string'));
      }
      return {
        reply: parsed?.reply ?? null, contactIds: parsed?.contact_ids ?? [], toolCalls, outputItems: raw.output,
        usage: {
          inputTokens: counts.input_tokens, outputTokens: counts.output_tokens,
          cachedInputTokens: counts.input_tokens_details.cached_tokens,
        },
      };
    } catch {
      throw new Error('IA indisponible');
    }
  };
}
