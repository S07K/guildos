import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), true);
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0) {
 if (stopping) return;
 stopping = true;
 for (const child of children) {
  if (!child.pid || child.exitCode !== null) continue;
  try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
 }
 const timeout = setTimeout(() => {
  for (const child of children) if (child.pid && child.exitCode === null) {
   try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
  }
  process.exit(code);
 }, 5000);
 Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise<void>(done => child.once('exit', () => done())))).then(() => { clearTimeout(timeout); process.exit(code); });
}
function launch(file: string, args: string[], env: NodeJS.ProcessEnv, nodeArgs: string[] = []) {
 const child = spawn(process.execPath, [...nodeArgs, resolve(file), ...args], { env, stdio: 'inherit', detached: process.platform !== 'win32' });
 children.push(child);
 child.once('error', error => { console.error(`Could not start ${file}: ${error.message}`); stop(1); });
 child.once('exit', code => { if (!stopping) stop(code || 1); });
 return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

// Bring the local database schema up to date before anything talks to it.
function migrate() {
 return new Promise<void>((done, fail) => {
  const child = spawn(process.execPath, [resolve('scripts/migrate.ts'), '--dev'], { env: process.env, stdio: 'inherit' });
  child.once('error', fail);
  child.once('exit', code => code === 0 ? done() : fail(new Error('Development startup stopped: database migrations did not apply.')));
 });
}

async function start() {
 await migrate();
 if (stopping) return;
 const env = { ...process.env };
 env.NODE_ENV ||= 'development';
 // Codex-managed authentication is confined to the local development runner.
 env.STUDIO_CHATGPT_AUTH ||= env.OPENAI_CLIENT_ID ? 'oauth' : 'codex';
 const serviceUrl = new URL(env.AI_SIGNIN_SERVICE_URL || 'http://127.0.0.1:8787');
 const localService = ['localhost', '127.0.0.1', '[::1]'].includes(serviceUrl.hostname);
 const serviceReady = !!env.SUPABASE_URL && !!env.SUPABASE_SECRET_KEY;
 if (localService && serviceReady) {
  const directory = resolve('.data');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  async function secret(name: string) {
   const path = resolve(directory, name);
   try { return (await readFile(path, 'utf8')).trim(); }
   catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const value = randomBytes(32).toString('hex');
    try { await writeFile(path, value, { flag: 'wx', mode: 0o600 }); return value; }
    catch (race) { if ((race as NodeJS.ErrnoException).code !== 'EEXIST') throw race; return (await readFile(path, 'utf8')).trim(); }
   }
  }
  env.AI_SIGNIN_SERVICE_TOKEN = env.AI_SIGNIN_SERVICE_TOKEN || await secret('ai-signin-service-token');
  env.AI_SIGNIN_VAULT_KEY = env.AI_SIGNIN_VAULT_KEY || await secret('ai-signin-vault-key');
  env.AI_SIGNIN_PUBLIC_URL = serviceUrl.origin;
  env.AI_SIGNIN_SERVICE_URL = serviceUrl.origin;
  env.GUILDOS_APP_URL = env.GUILDOS_APP_URL || env.STUDIO_APP_URL || 'http://localhost:3000';
  const host = serviceUrl.hostname.replace(/^\[|\]$/g, '');
  launch('node_modules/next/dist/bin/next', ['dev', 'apps/ai-signin', '--webpack', '--hostname', host, '--port', serviceUrl.port || '8787'], env);
  let ready = false;
  for (let attempt = 0; attempt < 80 && !stopping; attempt++) {
   try {
    const response = await fetch(`${serviceUrl.origin}/api/health`, { signal: AbortSignal.timeout(500) });
    if (response.ok) { ready = true; break; }
   } catch { /* Wait for the service to bind its port. */ }
   await new Promise(done => setTimeout(done, 250));
  }
  if (stopping) return;
  if (!ready) throw new Error('The local AI sign-in service did not start. Check whether its port is already in use.');
  console.log(`GuildOS AI sign-in service ready at ${serviceUrl.origin}`);
  if (env.STUDIO_CHATGPT_AUTH === 'codex') console.log('Local ChatGPT device sign-in enabled through Codex CLI (no client ID required).');
 } else if (localService) {
  console.log('AI sign-in service disabled: configure SUPABASE_URL and SUPABASE_SECRET_KEY to enable it.');
 } else {
  console.log(`Using AI sign-in service at ${serviceUrl.origin}.`);
 }
 if (!stopping) {
  launch('node_modules/next/dist/bin/next', ['dev', '--webpack', ...process.argv.slice(2)], env);
  if (serviceReady) launch('scripts/agent-worker.ts', [], env, ['--watch']);
 }
}
start().catch(error => { console.error(error instanceof Error ? error.message : 'Development startup failed.'); stop(1); });
