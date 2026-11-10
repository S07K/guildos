// Standard text-token rates, USD per million, checked 2026-10-12.
// https://developers.openai.com/api/docs/models/gpt-4.1-mini
export function estimateCost(version) {
 if (version.model === 'manual-edit' && version.input_tokens === 0 && version.output_tokens === 0) return 0;
 if (version.model === 'openrouter/free' || version.model === 'openrouter/openrouter/free' || /^openrouter\/.+:free$/.test(version.model)) return 0;
 // Claude API rates (https://platform.claude.com/docs/en/about-claude/pricing), checked 2026-11-09.
 const claude = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] }[String(version.model).replace(/^anthropic\//, '')];
 if (claude) return (version.input_tokens * claude[0] + version.output_tokens * claude[1]) / 1_000_000;
 if (version.model === 'groq/openai/gpt-oss-120b' || version.model === 'openai/gpt-oss-120b') return (version.input_tokens * 0.15 + version.output_tokens * 0.60) / 1_000_000;
 if (!/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(version.model)) return null;
 return (version.input_tokens * 0.4 + version.output_tokens * 1.6) / 1_000_000;
}
/** @param {import('../../components/studio/dashboard').Version[]} versions */
export function summarizeUsage(versions, days = 30, now = new Date(), messages = []) {
 const end = new Date(now); end.setUTCHours(0, 0, 0, 0);
 const buckets = Array.from({ length: days }, (_, index) => {
  const day = new Date(end); day.setUTCDate(day.getUTCDate() - days + index + 1);
  return { date: day.toISOString().slice(0, 10), input: 0, output: 0, count: 0 };
 });
 const selected = versions.filter(v => buckets.some(b => b.date === v.created_at.slice(0, 10)));
 const selectedMessages = messages.filter(v => buckets.some(b => b.date === v.created_at.slice(0, 10)));
 let input = 0, output = 0, cost = 0, unpriced = 0;
 for (const v of [...selected, ...selectedMessages]) {
  const bucket = buckets.find(b => b.date === v.created_at.slice(0, 10));
  bucket.input += v.input_tokens; bucket.output += v.output_tokens; bucket.count++;
  input += v.input_tokens; output += v.output_tokens;
  const estimate = estimateCost(v); if (estimate === null) unpriced++; else cost += estimate;
 }
 return { input, output, cost, unpriced, count: selected.length, requests: selected.length + selectedMessages.length, buckets, versions: selected, messages: selectedMessages };
}
