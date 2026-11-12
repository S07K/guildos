import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Local-development only: a workspace can connect the developer's signed-in Claude Code CLI
 * (`claude -p`), so a Claude subscription drives the agents without an API key.
 * Unavailable in production or on a non-localhost app URL; it is not a hosted-service credential.
 */
export function localClaudeCodeEnabled(env: NodeJS.ProcessEnv = process.env) {
 if (env.NODE_ENV === 'production' || env.STUDIO_CLAUDE_AUTH !== 'claude-code') return false;
 try { return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.STUDIO_APP_URL || 'http://localhost:3000').hostname); }
 catch { return false; }
}

/** Placeholder credential marking a Claude connection that uses the local CLI sign-in. */
export const claudeCodeLocalKey = 'claude-code-local';
export const claudeCodeDefaultModel = 'claude-code-default';
export const localClaudeCodeModel = (env: NodeJS.ProcessEnv = process.env) => env.STUDIO_CLAUDE_CODE_MODEL?.trim() || claudeCodeDefaultModel;

export class ClaudeCodeError extends Error {
 readonly kind: 'missing'|'auth'|'capacity'|'timeout'|'failed';
 constructor(kind: ClaudeCodeError['kind'], message: string) { super(message); this.kind = kind; }
}

type Launch = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
// Only what the CLI needs to find its binary and stored sign-in. Vault keys, database secrets and
// ANTHROPIC_API_KEY are withheld so the subscription login is used and secrets never reach the child.
const passthroughEnv = ['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','TMPDIR','TERM','CLAUDE_CONFIG_DIR','XDG_CONFIG_HOME'];
const missing = () => new ClaudeCodeError('missing', 'Install Claude Code and ensure claude is on PATH (or set STUDIO_CLAUDE_CODE_BIN), then retry.');

/** Runs the CLI in an empty directory so project CLAUDE.md files and local settings stay out of agent context. */
async function runCli(args: string[], options: { env: NodeJS.ProcessEnv; launch: Launch; stdin?: string; signal?: AbortSignal|null; timeoutMs: number }) {
 const childEnv = Object.fromEntries(passthroughEnv.flatMap(key => options.env[key] ? [[key, options.env[key] as string]] : [])) as NodeJS.ProcessEnv;
 const cwd = await mkdtemp(join(tmpdir(), 'guildos-claude-'));
 try {
  return await new Promise<string>((resolve, reject) => {
   const child = options.launch(options.env.STUDIO_CLAUDE_CODE_BIN?.trim() || 'claude', args, { cwd, env: childEnv });
   let stdout = '', settled = false;
   const signal = options.signal;
   const done = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(); };
   const timer = setTimeout(() => { child.kill('SIGKILL'); done(() => reject(new ClaudeCodeError('timeout', 'Claude Code request timed out. Retry a smaller action.'))); }, options.timeoutMs);
   const abort = () => { child.kill('SIGKILL'); done(() => reject(signal?.reason || new Error('Action cancelled.'))); };
   signal?.addEventListener('abort', abort, { once: true });
   child.once('error', error => done(() => reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? missing() : new ClaudeCodeError('failed', 'Claude Code could not be started.'))));
   child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 5_000_000) child.kill('SIGKILL'); });
   child.stderr.resume();
   child.once('close', () => done(() => resolve(stdout)));
   child.stdin.on('error', () => {});
   if (signal?.aborted) { abort(); return; }
   child.stdin.end(options.stdin || '');
  });
 } finally {
  await rm(cwd, { recursive:true, force:true });
 }
}

// ---- Workspace connection (explicit, like the ChatGPT connection) ----

type Account = { email?: string|null; plan?: string|null };
export type ClaudeCodeState = { status: 'idle'|'connected'|'error'|'unconfigured'; transport: 'claude-code'; identity?: { email?: string|null }; planType?: string|null; error?: string };
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const root = (env: NodeJS.ProcessEnv) => resolve(env.STUDIO_CLAUDE_CODE_DIR || '.data/claude-code');
function entry(workspace: string, env: NodeJS.ProcessEnv) {
 if (!idPattern.test(workspace)) throw new Error('Invalid workspace.');
 return join(root(env), `${workspace}.json`);
}

/** Reads the CLI's own sign-in; only a Claude subscription login (not a Console API login) qualifies. */
export async function claudeCodeAccount(env: NodeJS.ProcessEnv = process.env, launch: Launch = spawn): Promise<Account> {
 const output = await runCli(['auth','status','--json'], { env, launch, timeoutMs: 20000 });
 let status: { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string; planTier?: string };
 try { status = JSON.parse(output); } catch { throw new ClaudeCodeError('failed', 'Could not read the Claude Code sign-in status. Update Claude Code and retry.'); }
 if (!status.loggedIn) throw new ClaudeCodeError('auth', 'Claude Code is not signed in. Run `claude` in a terminal, use /login with your Claude account, then connect again.');
 if (status.authMethod !== 'claude.ai') throw new ClaudeCodeError('auth', 'Claude Code is signed in with an API key, not a Claude subscription. Run /login in Claude Code with your Claude account, then connect again.');
 return { email: status.email || null, plan: status.planTier || status.subscriptionType || null };
}

async function storedAccount(workspace: string, env: NodeJS.ProcessEnv): Promise<Account|null> {
 try { return JSON.parse(await readFile(entry(workspace, env), 'utf8')); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** True only after the workspace explicitly connected Claude Code (cheap: no CLI call). */
export async function hasClaudeCodeConnection(workspace: string, env: NodeJS.ProcessEnv = process.env) {
 if (!localClaudeCodeEnabled(env)) return false;
 try { return !!await storedAccount(workspace, env); } catch { return false; }
}

const connected = (account: Account): ClaudeCodeState => ({ status:'connected', transport:'claude-code', identity:{ email:account.email }, planType:account.plan });

export async function claudeCodeStatus(workspace: string, env: NodeJS.ProcessEnv = process.env, launch: Launch = spawn): Promise<ClaudeCodeState> {
 if (!localClaudeCodeEnabled(env)) return { status:'unconfigured', transport:'claude-code', error:'Claude Code sign-in is available only in local development.' };
 const stored = await storedAccount(workspace, env);
 if (!stored) return { status:'idle', transport:'claude-code' };
 // Confirm the CLI is still signed in, so a logout shows here rather than as a failed task.
 try { return connected(await claudeCodeAccount(env, launch)); }
 catch (error) { return { status:'error', transport:'claude-code', error: error instanceof ClaudeCodeError ? error.message : 'Could not check the Claude Code sign-in.' }; }
}

export async function connectClaudeCode(workspace: string, env: NodeJS.ProcessEnv = process.env, launch: Launch = spawn): Promise<ClaudeCodeState> {
 if (!localClaudeCodeEnabled(env)) throw new ClaudeCodeError('failed', 'Claude Code sign-in is available only in local development.');
 const path = entry(workspace, env);
 const account = await claudeCodeAccount(env, launch);
 await mkdir(root(env), { recursive:true, mode:0o700 });
 const temporary = `${path}.${process.pid}.tmp`;
 await writeFile(temporary, JSON.stringify({ ...account, connectedAt: new Date().toISOString() }), { mode:0o600 });
 await rename(temporary, path);
 return connected(account);
}

/** Removes the workspace connection only; the developer's Claude Code sign-in is left untouched. */
export async function disconnectClaudeCode(workspace: string, env: NodeJS.ProcessEnv = process.env) {
 await rm(entry(workspace, env), { force:true });
}

// ---- Model requests ----

type ResponsesBody = { model?: string; max_output_tokens?: number; instructions?: string; input: unknown; text?: { format?: { type?: string; schema?: unknown } } };
type CliResult = { is_error?: boolean; subtype?: string; result?: string; structured_output?: unknown; api_error_status?: number|null;
 usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }; modelUsage?: Record<string, unknown> };

const replySchema = { type:'object', additionalProperties:false, properties:{ reply:{ type:'string' } }, required:['reply'] };

/** Accepts an OpenAI Responses-shaped body and returns a Responses-shaped result, like the API adapters. */
export async function claudeCodeResponse(body: ResponsesBody, signal?: AbortSignal|null, env: NodeJS.ProcessEnv = process.env, launch: Launch = spawn): Promise<Response> {
 if (!localClaudeCodeEnabled(env)) throw new ClaudeCodeError('failed', 'Claude Code sign-in is available only in local development.');
 const structured = body.text?.format?.type === 'json_schema' ? body.text.format.schema : undefined;
 const small = (body.max_output_tokens || 0) <= 600;
 const args = ['-p','--output-format','json','--json-schema',JSON.stringify(structured || replySchema),
  '--tools','','--strict-mcp-config','--setting-sources','','--no-session-persistence',
  '--effort', env.STUDIO_CLAUDE_CODE_EFFORT?.trim() || (small ? 'low' : 'medium'),
  '--system-prompt', `${body.instructions || ''}\nReturn only the requested JSON. Do not use tools.`];
 if (body.model && body.model !== claudeCodeDefaultModel) args.push('--model', body.model);
 const output = await runCli(args, { env, launch, signal, timeoutMs: 300000,
  stdin: `Project data:\n${typeof body.input === 'string' ? body.input : JSON.stringify(body.input)}` });
 let result: CliResult;
 try { result = JSON.parse(output); } catch { throw new ClaudeCodeError('failed', 'Claude Code returned an unreadable response. Retry the action.'); }
 if (result.is_error || result.subtype !== 'success') {
  // Classify without echoing the CLI's text, which may include project data.
  const detail = String(result.result || '');
  if (/log ?in|logged in|authenticat|oauth|credential/i.test(detail)) throw new ClaudeCodeError('auth', 'Claude Code is not signed in. Run `claude` in a terminal and use /login, then retry.');
  if (result.api_error_status === 429 || /usage limit|rate limit|limit reached|quota/i.test(detail)) throw new ClaudeCodeError('capacity', 'Claude subscription usage limit reached.');
  throw new ClaudeCodeError('failed', 'Claude Code could not complete this request. Retry the action.');
 }
 if (result.structured_output === undefined) throw new ClaudeCodeError('failed', 'Claude Code did not return structured output. Retry the action.');
 const usage = result.usage || {};
 const inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
 const model = Object.keys(result.modelUsage || {})[0] || body.model || claudeCodeDefaultModel;
 const text = structured ? JSON.stringify(result.structured_output) : String((result.structured_output as { reply?: unknown })?.reply ?? '');
 return Response.json({ status:'completed', model:`claude-code/${model}`, usage:{ input_tokens:inputTokens, output_tokens:usage.output_tokens || 0 },
  output:[{ type:'message', content:[{ type:'output_text', text }] }] });
}
