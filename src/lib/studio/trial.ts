import type { SupabaseClient } from '@supabase/supabase-js';
import { hasClaudeCodeConnection } from './claude-code-local.ts';

/**
 * Free trial on a platform-owned key, so a new workspace can see a real result
 * before it connects its own provider. The key never leaves the server/worker.
 */
export type TrialConfig = { provider: 'groq' | 'openrouter'; key: string; model: string; runs: number };

const defaultRuns = 3;

export function trialConfig(env: NodeJS.ProcessEnv = process.env): TrialConfig | null {
 const runs = Number.parseInt(env.STUDIO_TRIAL_RUNS || '', 10);
 const limit = Number.isSafeInteger(runs) && runs >= 0 ? Math.min(runs, 50) : defaultRuns;
 if (!limit) return null;
 const groq = env.STUDIO_TRIAL_GROQ_KEY?.trim();
 if (groq) return { provider: 'groq', key: groq, model: env.STUDIO_TRIAL_MODEL?.trim() || 'openai/gpt-oss-120b', runs: limit };
 const router = env.STUDIO_TRIAL_OPENROUTER_KEY?.trim();
 if (router) return { provider: 'openrouter', key: router, model: env.STUDIO_TRIAL_MODEL?.trim() || 'nvidia/nemotron-3-super-120b-a12b:free', runs: limit };
 return null;
}

export type TrialStatus = { enabled: boolean; limit: number; used: number; remaining: number };

/** Read-only status for the UI. Admin client: the trial table has no public policies. */
export async function trialStatus(admin: SupabaseClient, workspaceId: string, config = trialConfig()): Promise<TrialStatus> {
 if (!config) return { enabled: false, limit: 0, used: 0, remaining: 0 };
 const { count, error } = await admin.from('studio_trial_runs').select('run_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
 // Missing migration: report the trial as unavailable rather than over-promising.
 if (error) return { enabled: false, limit: config.runs, used: 0, remaining: 0 };
 const used = count || 0;
 return { enabled: true, limit: config.runs, used, remaining: Math.max(config.runs - used, 0) };
}

/** Atomically admits a run (idempotent for the same run id). */
export async function claimTrialRun(admin: SupabaseClient, workspaceId: string, runId: string, config: TrialConfig): Promise<boolean> {
 const { data, error } = await admin.rpc('claim_studio_trial_run', { p_workspace: workspaceId, p_run: runId, p_limit: config.runs });
 if (error) throw new Error('Could not check the free trial allowance.');
 return data === true;
}

export async function releaseTrialRun(admin: SupabaseClient, workspaceId: string, runId: string) {
 try { await admin.rpc('release_studio_trial_run', { p_workspace: workspaceId, p_run: runId }); } catch { /* best effort */ }
}

export const noModelMessage = 'Connect Claude, Groq, OpenRouter, an OpenAI API key, or a supported ChatGPT connection, then retry this task.';

export const trialExhaustedMessage = 'Your free GuildOS runs are used up. Connect Claude, Groq or OpenRouter (both have free tiers), an OpenAI API key, or ChatGPT in Connections to keep going.';

export type WorkspaceConnections = { api: boolean; chatgpt: boolean; anthropic: boolean; openrouter: boolean; groq: boolean };

/** Which of the workspace's own model connections exist (no secrets are read). */
export async function workspaceConnections(admin: SupabaseClient, workspaceId: string, chatgpt: (workspaceId: string) => Promise<boolean>): Promise<WorkspaceConnections> {
 const [{ data: key }, { data: router }, { data: groq }, { data: claude }, plan, claudeCode] = await Promise.all([
  admin.from('studio_keys').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle(),
  admin.from('studio_openrouter_keys').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle(),
  admin.from('studio_groq_keys').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle(),
  admin.from('studio_anthropic_keys').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle(),
  chatgpt(workspaceId),
  hasClaudeCodeConnection(workspaceId),
 ]);
 return { api: !!key, chatgpt: plan, anthropic: !!claude || claudeCode, openrouter: !!router, groq: !!groq };
}

/** Briefs parked because no model was available; they resume once a model is connected. */
export const waitingForModelMessages = [noModelMessage, trialExhaustedMessage];

/** The first chat message for a new project: the user's own brief, within the note size limit. */
export function firstRunDisplay(brief: string) {
 const text = brief.trim();
 return text.length <= 2000 ? text : text.slice(0, 1999).trimEnd() + '…';
}
