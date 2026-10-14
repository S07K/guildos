import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUsage, estimateCost } from '../src/lib/studio/usage.mjs';
test('usage filters UTC dates and reports unknown model costs separately', () => {
 const base = { model: 'gpt-4.1-mini-2025-04-14', input_tokens: 1000, output_tokens: 500 };
 const summary = summarizeUsage([
  { ...base, created_at: '2026-10-12T12:00:00Z' },
  { ...base, model: 'unknown-model', created_at: '2026-10-11T12:00:00Z' },
  { ...base, created_at: '2026-09-30T12:00:00Z' },
 ], 7, new Date('2026-10-12T23:00:00Z'));
 assert.equal(summary.count, 2); assert.equal(summary.input, 2000); assert.equal(summary.output, 1000);
 assert.equal(summary.unpriced, 1); assert.ok(Math.abs(summary.cost - .0012) < 1e-10);
 assert.equal(summary.buckets.length, 7); assert.equal(summary.buckets[0].date, '2026-10-06');
 assert.equal(estimateCost({ ...base, model: 'gpt-4.1-mini-unrecognized' }), null);
 assert.equal(summarizeUsage([], 30).cost, 0);
 const manual = summarizeUsage([{ model: 'manual-edit', input_tokens: 0, output_tokens: 0, created_at: '2026-10-12T12:00:00Z' }], 7, new Date('2026-10-12T23:00:00Z'));
 assert.equal(manual.count, 1); assert.equal(manual.unpriced, 0); assert.equal(manual.cost, 0);
});
