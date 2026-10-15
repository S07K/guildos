import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { chatWithWorker, generateWithWorker } from './generation.ts';

type JsonRecord = Record<string, any>;
type AppMessage = JsonRecord & { id?: number; method?: string; params?: JsonRecord };
type PendingRequest = { resolve: (value: any) => void; reject: (error: Error) => void };
type DatabaseOptions = { method?: string; body?: unknown; prefer?: string };
type LoginState = { userCode: string; verificationUrl: string };

for (const name of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'STUDIO_VAULT_KEY', 'CODEX_BRIDGE_TOKEN']) {
 if (!process.env[name]) throw new Error(`Missing ${name}`);
}
const supabaseSecret = process.env.SUPABASE_SECRET_KEY!;
const bridgeToken = process.env.CODEX_BRIDGE_TOKEN!;
const vaultKey = process.env.STUDIO_VAULT_KEY!;
if (!/^[a-f0-9]{64}$/i.test(vaultKey)) throw new Error('STUDIO_VAULT_KEY must be 32 bytes encoded as 64 hexadecimal characters.');
const dbUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const workers = new Map<string, CodexWorker>();

function seal(value: string, workspace: string): string {
 const iv = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm', Buffer.from(vaultKey, 'hex'), iv);
 cipher.setAAD(Buffer.from(workspace));
 const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
 return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

function open(ciphertext: string, workspace: string): string {
 const [version, iv, tag, payload, ...extra] = ciphertext.split('.');
 if (version !== 'v1' || !iv || !tag || !payload || extra.length) throw new Error('Invalid encrypted session.');
 const decipher = createDecipheriv('aes-256-gcm', Buffer.from(vaultKey, 'hex'), Buffer.from(iv, 'base64'));
 decipher.setAAD(Buffer.from(workspace));
 decipher.setAuthTag(Buffer.from(tag, 'base64'));
 return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
}

function respond(response: ServerResponse, status: number, value: JsonRecord): void {
 response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
 response.end(JSON.stringify(value));
}

async function database<T = any>(path: string, options: DatabaseOptions = {}): Promise<T> {
 const response = await fetch(`${dbUrl}/rest/v1/${path}`, {
  method: options.method || 'GET',
  headers: {
   apikey: supabaseSecret,
   ...(!supabaseSecret.startsWith('sb_secret_') ? { Authorization: `Bearer ${supabaseSecret}` } : {}),
   'Content-Type': 'application/json',
   Accept: 'application/json',
   ...(options.prefer ? { Prefer: options.prefer } : {}),
  },
  ...(options.body ? { body: JSON.stringify(options.body) } : {}),
 });
 if (!response.ok) throw new Error('Supabase storage request failed.');
 const text = await response.text();
 return (text ? JSON.parse(text) : null) as T;
}

function authorized(request: IncomingMessage): boolean {
 const raw = request.headers.authorization;
 const token = Buffer.from((Array.isArray(raw) ? raw[0] : raw || '').replace(/^Bearer\s+/i, ''));
 const expected = Buffer.from(bridgeToken);
 return token.length === expected.length && timingSafeEqual(token, expected);
}

async function readBody(request: IncomingMessage): Promise<JsonRecord> {
 let size = 0;
 const chunks: Buffer[] = [];
 for await (const chunk of request) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  size += buffer.length;
  if (size > 65536) throw new Error('too_large');
  chunks.push(buffer);
 }
 return JSON.parse(Buffer.concat(chunks).toString() || '{}') as JsonRecord;
}

class CodexWorker {
 readonly workspace: string;
 readonly home: string;
 readonly child: ChildProcessWithoutNullStreams;
 readonly lines: ReadlineInterface;
 readonly pending = new Map<number, PendingRequest>();
 readonly listeners = new Set<(message: AppMessage) => void | Promise<void>>();
 nextId = 1;
 closed = false;
 connected = false;
 planType: string | null = null;
 deviceCode: LoginState | null = null;
 loginError: string | null = null;

 constructor(workspace: string, home: string) {
  this.workspace = workspace;
  this.home = home;
  const env = { NODE_ENV: 'production' as const, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: home, CODEX_HOME: home, LANG: 'C.UTF-8', TERM: 'dumb' };
  this.child = spawn(process.env.CODEX_BINARY || 'codex', ['app-server', '--listen', 'stdio://'], { cwd: home, env, stdio: ['pipe', 'pipe', 'pipe'] });
  this.lines = createInterface({ input: this.child.stdout });
  this.lines.on('line', line => this.onLine(line));
  this.child.stderr.on('data', () => {});
  this.child.on('error', () => { this.closed = true; for (const pending of this.pending.values()) pending.reject(new Error('Codex executable is unavailable.')); this.pending.clear(); });
  this.child.on('exit', () => {
   this.closed = true;
   for (const pending of this.pending.values()) pending.reject(new Error('Codex app-server stopped.'));
   this.pending.clear();
  });
 }

 private onLine(line: string): void {
  let message: AppMessage;
  try { message = JSON.parse(line) as AppMessage; } catch { return; }
  if (Number.isInteger(message.id) && this.pending.has(message.id!)) {
   const pending = this.pending.get(message.id!)!;
   this.pending.delete(message.id!);
   if (message.error) pending.reject(new Error(String(message.error.message || 'App-server request failed.')));
   else pending.resolve(message.result);
   return;
  }
  if (message.id !== undefined && message.method) { this.child.stdin.write(`${JSON.stringify({id:message.id,result:{decision:'decline'}})}\n`); return; }
  for (const listener of this.listeners) void listener(message);
 }

 send<T = JsonRecord>(method: string, params: JsonRecord = {}, timeout = 20_000): Promise<T> {
  if (this.closed) return Promise.reject(new Error('App-server unavailable.'));
  const id = this.nextId++;
  return new Promise<T>((resolve, reject) => {
   const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('App-server request timed out.')); }, timeout);
   this.pending.set(id, {
    resolve: value => { clearTimeout(timer); resolve(value as T); },
    reject: error => { clearTimeout(timer); reject(error); },
   });
   this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
 }

 notify(method: string, params: JsonRecord = {}): void {
  if (!this.closed) this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
 }

 async initialize(): Promise<void> {
  await this.send('initialize', { clientInfo: { name: 'guildos', title: 'GuildOS', version: '0.1.0' } });
  this.notify('initialized', {});
 }

 async persist(): Promise<void> {
  const auth = await readFile(join(this.home, 'auth.json'), 'utf8');
  const ciphertext = seal(auth, this.workspace);
  await database('studio_chatgpt_sessions?on_conflict=workspace_id', {
   method: 'POST',
   body: { workspace_id: this.workspace, ciphertext, plan_type: this.planType, updated_at: new Date().toISOString() },
   prefer: 'resolution=merge-duplicates,return=minimal',
  });
 }

 async close(): Promise<void> {
  this.closed = true;
  this.child.kill('SIGTERM');
  await rm(this.home, { recursive: true, force: true });
 }
}

async function workerFor(workspace: string): Promise<CodexWorker> {
 const existing = workers.get(workspace);
 if (existing && !existing.closed) return existing;
 const rows = await database<Array<{ ciphertext: string; plan_type: string | null }>>(`studio_chatgpt_sessions?select=ciphertext,plan_type&workspace_id=eq.${workspace}`);
 const saved = rows?.[0] || null;
 const home = await mkdtemp(join(tmpdir(), 'guildos-codex-'));
 await chmod(home, 0o700);
 if (saved?.ciphertext) await writeFile(join(home, 'auth.json'), open(saved.ciphertext, workspace), { mode: 0o600 });
 const worker = new CodexWorker(workspace, home);
 worker.planType = saved?.plan_type || null;
 worker.listeners.add(async message => {
  if (message.method === 'account/login/completed' && !message.params?.success) worker.loginError = 'ChatGPT could not verify this connection. Start again.';
  if (message.method === 'account/updated' && message.params?.authMode === 'chatgpt') {
   worker.planType = message.params.planType || null;
   worker.deviceCode = null;
   try {
    await worker.persist();
    worker.connected = true;
    worker.loginError = null;
   } catch {
    worker.connected = false;
    worker.loginError = 'The ChatGPT session could not be saved securely. Please reconnect.';
   }
  }
 });
 await worker.initialize();
 const account = await worker.send<{ account?: { type?: string } }>('account/read', { refreshToken: false }).catch(() => null);
 worker.connected = account?.account?.type === 'chatgpt';
 workers.set(workspace, worker);
 return worker;
}

const server = http.createServer(async (request, response) => {
 try {
  if (!authorized(request)) return respond(response, 401, { error: 'Unauthorized.' });
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/health' && request.method === 'GET') return respond(response, 200, { ok: true });
  if (!['/v1/device/session','/v1/generate','/v1/agent-chat'].includes(url.pathname)) return respond(response, 404, { error: 'Not found.' });
  const workspace = url.searchParams.get('workspace_id');
  if (!workspace || !UUID.test(workspace)) return respond(response, 400, { error: 'Invalid workspace.' });
  if (url.pathname === '/v1/generate') {
   if (request.method !== 'POST') return respond(response,405,{error:'Method not allowed.'});
   const body = await readBody(request);
   if (typeof body.brief !== 'string' || body.brief.length > 12000 || typeof body.feedback !== 'string' || body.feedback.length > 4000 || !body.schema || typeof body.schema !== 'object') return respond(response,400,{error:'Invalid generation request.'});
   const worker = await workerFor(workspace);
   return respond(response,200,await generateWithWorker(worker,{brief:body.brief,previous:body.previous,feedback:body.feedback,schema:body.schema}));
  }
  if (url.pathname === '/v1/agent-chat') {
   if (request.method !== 'POST') return respond(response,405,{error:'Method not allowed.'});
   const body = await readBody(request);
   if (!['creative_director','ux_architect','copywriter','ui_designer','qa_critic'].includes(body.role) || typeof body.brief !== 'string' || body.brief.length > 12000 || !Array.isArray(body.messages) || body.messages.length > 17 || !Array.isArray(body.notes) || body.notes.length > 20) return respond(response,400,{error:'Invalid agent chat request.'});
   if (body.messages.some((item: any) => !item || !['human','agent'].includes(item.author_kind) || typeof item.body !== 'string' || item.body.length > 4000)) return respond(response,400,{error:'Invalid agent chat messages.'});
   const worker = await workerFor(workspace);
   return respond(response,200,await chatWithWorker(worker,{role:body.role,brief:body.brief,document:body.document,notes:body.notes,messages:body.messages}));
  }
  if (request.method === 'GET') {
   const worker = await workerFor(workspace);
   if (worker.loginError) return respond(response, 200, { status: 'error', error: worker.loginError });
   if (worker.connected) return respond(response, 200, { status: 'connected', planType: worker.planType });
   if (worker.deviceCode) return respond(response, 200, { status: 'pending', ...worker.deviceCode });
   return respond(response, 200, { status: 'idle' });
  }
  if (request.method === 'POST') {
   const body = await readBody(request);
   if (body.action !== 'start') return respond(response, 400, { error: 'Invalid action.' });
   const worker = await workerFor(workspace);
   if (worker.connected) return respond(response, 409, { error: 'A ChatGPT account is already connected.' });
   const login = await worker.send<{ userCode?: string; verificationUrl?: string }>('account/login/start', { type: 'chatgptDeviceCode' });
   if (!login?.userCode || !/^https:\/\/auth\.openai\.com\//.test(login.verificationUrl || '')) throw new Error('Invalid device-code response.');
   worker.deviceCode = { userCode: login.userCode, verificationUrl: login.verificationUrl! };
   worker.loginError = null;
   return respond(response, 200, { status: 'pending', ...worker.deviceCode });
  }
  if (request.method === 'DELETE') {
   const worker = workers.get(workspace);
   if (worker) {
    await worker.send('account/logout').catch(() => {});
    await worker.close();
    workers.delete(workspace);
   }
   await database(`studio_chatgpt_sessions?workspace_id=eq.${workspace}`, { method: 'DELETE', prefer: 'return=minimal' });
   return respond(response, 200, { status: 'idle' });
  }
  return respond(response, 405, { error: 'Method not allowed.' });
 } catch (error) {
  if (error instanceof Error && error.message === 'too_large') return respond(response, 413, { error: 'Request too large.' });
  console.error('Codex bridge request failed', error instanceof Error ? error.message : 'Unknown error');
  const message = error instanceof Error ? error.message : '';
  return respond(response, 502, { error: message.startsWith('ChatGPT') ? message : 'ChatGPT connection service could not complete that request.' });
 }
});

server.listen(Number(process.env.PORT || 8787), process.env.HOST || '0.0.0.0');
process.on('SIGTERM', async () => { await Promise.all([...workers.values()].map(worker => worker.close())); server.close(); });
