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
function launch(file: string, args: string[], env: NodeJS.ProcessEnv) {
 const child = spawn(process.execPath, [resolve(file), ...args], { env, stdio: 'inherit', detached: process.platform !== 'win32' });
 children.push(child);
 child.once('error', error => { console.error(`Could not start ${file}: ${error.message}`); stop(1); });
 child.once('exit', code => { if (!stopping) stop(code || 1); });
 return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

async function start() {
 const env = { ...process.env };
 const url = new URL(env.CODEX_BRIDGE_URL || 'http://127.0.0.1:8787');
 const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 const ready = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'STUDIO_VAULT_KEY'].every(key => !!env[key]);
 if (local && ready) {
  if (!env.CODEX_BRIDGE_TOKEN) {
   const directory = resolve('.data');
   const tokenFile = resolve(directory, 'codex-bridge-token');
   await mkdir(directory, { recursive: true, mode: 0o700 });
   try { env.CODEX_BRIDGE_TOKEN = (await readFile(tokenFile, 'utf8')).trim(); }
   catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const token = randomBytes(32).toString('hex');
    try { await writeFile(tokenFile, token, { flag: 'wx', mode: 0o600 }); env.CODEX_BRIDGE_TOKEN = token; }
    catch (race) { if ((race as NodeJS.ErrnoException).code !== 'EEXIST') throw race; env.CODEX_BRIDGE_TOKEN = (await readFile(tokenFile, 'utf8')).trim(); }
   }
  }
  if (!env.CODEX_BRIDGE_TOKEN) throw new Error('The local bridge token file is empty.');
  env.CODEX_BRIDGE_URL = url.origin;
  launch('services/codex-bridge/src/server.ts', [], { ...env, PORT: url.port || '8787', HOST: url.hostname.replace(/^\[|\]$/g, '') });
  let connected = false;
  for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
   try {
    const response = await fetch(`${url.origin}/health`, { headers: { Authorization: `Bearer ${env.CODEX_BRIDGE_TOKEN}` }, signal: AbortSignal.timeout(500) });
    if (response.ok) { connected = true; break; }
   } catch { /* Wait for the bridge to bind its port. */ }
   await new Promise(done => setTimeout(done, 100));
  }
  if (stopping) return;
  if (!connected) throw new Error('The local ChatGPT bridge did not start. Check whether its port is already in use.');
  console.log(`ChatGPT bridge ready at ${url.origin}`);
 } else if (local) {
  console.log('ChatGPT bridge disabled: configure SUPABASE_URL, SUPABASE_SECRET_KEY, and STUDIO_VAULT_KEY to enable it.');
 } else {
  console.log('Using the configured remote ChatGPT bridge.');
 }
 if (!stopping) launch('node_modules/next/dist/bin/next', ['dev', '--webpack', ...process.argv.slice(2)], env);
}
start().catch(error => { console.error(error instanceof Error ? error.message : 'Development startup failed.'); stop(1); });
