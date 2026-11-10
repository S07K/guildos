import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAgentResponse, ProviderFailure } from '../src/lib/studio/agents/provider-request.ts';
import { estimateCost } from '../src/lib/studio/usage.mjs';

const sse = events => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
function streamed(text, stopReason = 'end_turn') {
 return sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 45 } }],
  ['message_stop', { type: 'message_stop' }],
 ]);
}
const responsesRequest = { method: 'POST', headers: { Authorization: 'Bearer sk-ant-test-key', 'Content-Type': 'application/json' }, body: JSON.stringify({
 model: 'claude-opus-5-5', store: false, max_output_tokens: 4000, instructions: 'You are the UX architect.', input: '{"brief":"A bakery"}',
 text: { format: { type: 'json_schema', name: 'canvas_proposal', strict: true, schema: { type: 'object', additionalProperties: false, properties: { summary: { type: 'string', maxLength: 300 } }, required: ['summary'] } } },
}) };

test('Claude requests are translated to the Messages API and answered in the Responses shape', async () => {
 let sent;
 const transport = async (url, init) => { sent = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) }; return new Response(streamed('{"summary":"Layout ready"}'), { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
 const result = await (await requestAgentResponse('anthropic', transport, responsesRequest)).json();
 assert.match(sent.url, /api\.anthropic\.com\/v1\/messages/);
 assert.equal(sent.headers.get('authorization'), 'Bearer sk-ant-test-key');
 assert.match(sent.headers.get('anthropic-beta') || '', /server-side-fallback-2026-07-01/);
 assert.equal(sent.body.model, 'claude-opus-5-5');
 assert.equal(sent.body.system, 'You are the UX architect.');
 assert.deepEqual(sent.body.messages, [{ role: 'user', content: '{"brief":"A bakery"}' }]);
 assert.equal(sent.body.fallbacks, 'default');
 assert.equal(sent.body.output_config.effort, 'medium');
 assert.equal(sent.body.output_config.format.type, 'json_schema');
 assert.equal(sent.body.output_config.format.schema.properties.summary.maxLength, undefined, 'bounds are stripped; GuildOS validates them');
 assert.ok(sent.body.max_tokens >= 16000);
 assert.equal(sent.body.thinking, undefined, 'thinking stays at the model default');
 assert.equal(result.status, 'completed');
 assert.equal(result.output[0].content[0].text, '{"summary":"Layout ready"}');
 assert.deepEqual(result.usage, { input_tokens: 120, output_tokens: 45 });
 assert.equal(result.model, 'anthropic/claude-opus-5-5');
});

test('Claude truncation, refusals and HTTP errors map to the shared failure handling', async () => {
 const truncated = await (await requestAgentResponse('anthropic', async () => new Response(streamed('{"summ', 'max_tokens'), { headers: { 'content-type': 'text/event-stream' } }), responsesRequest)).json();
 assert.equal(truncated.status, 'incomplete');
 assert.equal(truncated.incomplete_details.reason, 'max_output_tokens');
 await assert.rejects(requestAgentResponse('anthropic', async () => new Response(streamed('', 'refusal'), { headers: { 'content-type': 'text/event-stream' } }), responsesRequest), error => error instanceof ProviderFailure && /declined/.test(error.message) && error.fallbackable);
 const failing = status => async () => new Response(JSON.stringify({ type: 'error', error: { type: status === 429 ? 'rate_limit_error' : 'authentication_error', message: 'secret detail sk-ant-test-key' } }), { status, headers: { 'content-type': 'application/json' } });
 await assert.rejects(requestAgentResponse('anthropic', failing(401), responsesRequest), error => error instanceof ProviderFailure && /^Claude rejected this connection/.test(error.message) && !error.message.includes('sk-ant'));
 await assert.rejects(requestAgentResponse('anthropic', failing(429), responsesRequest), error => error instanceof ProviderFailure && error.retryable && error.httpStatus === 429);
});

test('Claude usage is priced', () => {
 assert.equal(estimateCost({ model: 'anthropic/claude-opus-5-5', input_tokens: 1_000_000, output_tokens: 1_000_000 }), 24);
 assert.equal(estimateCost({ model: 'claude-sonnet-5-5', input_tokens: 1_000_000, output_tokens: 0 }), 2);
});
