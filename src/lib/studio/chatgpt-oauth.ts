import { localCodex, localCodexEnabled } from './codex-local.ts';

const capability = 'chatgpt.tokens.use.direct';

function config() {
 const base = process.env.AI_SIGNIN_SERVICE_URL?.replace(/\/$/, '');
 const token = process.env.AI_SIGNIN_SERVICE_TOKEN;
 return base && token ? { base, token } : null;
}

export async function hasChatGPTPlan(workspaceId: string, request: typeof fetch = fetch) {
 if (localCodexEnabled()) {
  try { return (await localCodex.status(workspaceId)).status === 'connected'; } catch { return false; }
 }
 const service = config();
 if (!service) return false;
 try {
  const response = await request(`${service.base}/api/v1/connections/openai?workspaceId=${encodeURIComponent(workspaceId)}`, {
   headers: { Authorization: `Bearer ${service.token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  const result = await response.json() as { connected?: boolean; scopes?: unknown };
  return response.ok && result.connected === true && Array.isArray(result.scopes) && result.scopes.includes(capability);
 } catch { return false; }
}

export async function chatGPTPlanToken(workspaceId: string, request: typeof fetch = fetch) {
 const service = config();
 if (!service) throw new Error('GuildOS AI sign-in service is not configured.');
 const response = await request(`${service.base}/api/v1/connections/openai/credential`, {
  method: 'POST', headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ workspaceId }), cache: 'no-store', signal: AbortSignal.timeout(15000),
 });
 const result = await response.json() as { accessToken?: unknown; scopes?: unknown; error?: unknown };
 if (!response.ok || typeof result.accessToken !== 'string') throw new Error(typeof result.error === 'string' ? result.error : 'ChatGPT connection could not be loaded. Reconnect the account.');
 if (!Array.isArray(result.scopes) || !result.scopes.includes(capability)) throw new Error('This ChatGPT connection does not have permission to use plan models.');
 return result.accessToken;
}

export async function chatGPTPlanModel(token: string, request: typeof fetch = fetch) {
 const configuredModel = process.env.STUDIO_CHATGPT_MODEL?.trim();
 if (configuredModel) return configuredModel;
 const response = await request('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
 if (!response.ok) throw new Error('Could not load models for this ChatGPT account. Reconnect it or use an OpenAI API key.');
 const result = await response.json() as { data?: Array<{ id?: unknown; visibility?: unknown }> };
 const model = result.data?.find(item => typeof item.id === 'string' && item.visibility === 'list')?.id;
 if (typeof model !== 'string') throw new Error('This ChatGPT account has no available models for GuildOS. Connect an OpenAI API key instead.');
 return model;
}

export function isPlanCapacityFailure(status: number, body: unknown) {
 const message = typeof body === 'object' && body && 'error' in body ? String((body as { error?: { code?: unknown; message?: unknown } }).error?.code || (body as { error?: { message?: unknown } }).error?.message || '') : '';
 return status === 429 || /subscription_sharing_usage_limit_exceeded|usage.?limit|quota|rate.?limit|exhaust/i.test(message);
}

/** Select an execution transport, keeping Codex credentials inside the local runner. */
export async function chatGPTConnection(workspaceId: string, request: typeof fetch = fetch) {
 if (localCodexEnabled()) return { key: '', model: process.env.STUDIO_CODEX_MODEL?.trim() || 'codex-default', request: localCodex.requestFor(workspaceId) };
 const key = await chatGPTPlanToken(workspaceId, request);
 return { key, model: await chatGPTPlanModel(key, request), request };
}
