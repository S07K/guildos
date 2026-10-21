import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { sealKey, openKey } from './vault.mjs';
import { ProviderFailure } from './agents/provider-request.ts';

/** Codex client authentication is local-development only, never a hosted-service credential. */
export function localCodexEnabled(env: NodeJS.ProcessEnv = process.env) {
 if (env.NODE_ENV === 'production' || env.STUDIO_CHATGPT_AUTH !== 'codex') return false;
 try { return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.STUDIO_APP_URL || 'http://localhost:3000').hostname); }
 catch { return false; }
}
type Account = { email?: string | null; planType?: string };
type Stored = { auth: string; account: Account };
type State = { status: 'idle'|'pending'|'connected'|'error'; transport: 'codex'; configured: true; userCode?: string; verificationUrl?: string; expiresAt?: string; identity?: {email?: string|null}; planType?: string; error?: string };
const connected = (account: Account): State => ({status:'connected',transport:'codex',configured:true,identity:{email:account.email},planType:account.planType});
const disabled = () => new Error('Codex device sign-in is available only in local development.');
const missing = () => new Error('Install the Codex CLI and ensure codex is on PATH, then retry.');
const failed = () => new ProviderFailure('ChatGPT could not complete this Codex action. Reconnect or retry with another provider.',true,true);
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cleanupGlobal = globalThis as typeof globalThis & { guildosCodexCleanup?: {
 homes: Set<{home:string;lock:string}>; children: Set<ChildProcessWithoutNullStreams>;
} };
const cleanup = cleanupGlobal.guildosCodexCleanup ||= (()=>{
 const value={homes:new Set<{home:string;lock:string}>(),children:new Set<ChildProcessWithoutNullStreams>()};
 process.once('exit',()=>{
  for(const child of value.children)try{child.kill('SIGKILL');}catch{}
  for(const {home,lock} of value.homes){try{rmSync(home,{recursive:true,force:true});rmSync(lock,{recursive:true,force:true});}catch{}}
 });
 return value;
})();


// Exported factory keeps protocol tests isolated from real accounts and the developer's CODEX_HOME.
export function createLocalCodex(options: {root?: string; env?: NodeJS.ProcessEnv; launch?: typeof spawn} = {}) {
 const env = options.env || process.env;
 const root = resolve(options.root || '.data/codex');
 const launch = options.launch || spawn;
 const sessions = new Map<string, {state: State; stop: () => Promise<void>}>();
 function check(workspace: string) {
  if (!localCodexEnabled(env)) throw disabled();
  if (!idPattern.test(workspace)) throw new Error('Invalid workspace.');
 }
 const entry = (workspace: string) => join(root, `${workspace}.enc`);
 async function stored(workspace: string): Promise<Stored|null> {
  check(workspace);
  try { return JSON.parse(openKey(await readFile(entry(workspace),'utf8'),workspace,env.STUDIO_VAULT_KEY)); }
  catch(error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return null; throw new ProviderFailure('This workspace’s Codex connection could not be opened. Reconnect it.',false,true); }
 }
 async function save(workspace: string, value: Stored) {
  const path = entry(workspace), temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary,sealKey(JSON.stringify(value),workspace,env.STUDIO_VAULT_KEY),{mode:0o600});
  await rename(temporary,path);
 }
 async function acquire(workspace: string) {
  check(workspace);
  // Validate the vault before creating a CLI home or receiving credentials.
  sealKey('check',workspace,env.STUDIO_VAULT_KEY);
  await mkdir(root,{recursive:true,mode:0o700});
  await chmod(root,0o700);
  const lock = join(root,`${workspace}.lock`);
  for(let attempt=0;attempt<2;attempt++) {
   try { await mkdir(lock,{mode:0o700}); await writeFile(join(lock,'pid'),String(process.pid),{mode:0o600}); break; }
   catch(error) {
    if ((error as NodeJS.ErrnoException).code!=='EEXIST') throw error;
    try {
     const pid = Number(await readFile(join(lock,'pid'),'utf8'));
     if (Number.isSafeInteger(pid)&&pid>0) process.kill(pid,0);
    } catch(stale) {
     if ((stale as NodeJS.ErrnoException).code==='ESRCH'&&attempt===0) {await rm(lock,{recursive:true,force:true});continue;}
    }
    throw new ProviderFailure('This workspace has a Codex sign-in or action in progress. Retry shortly.',true,true);
   }
  }
  let home: string;
  try { home=await mkdtemp(join(tmpdir(),`guildos-codex-${workspace}-`)); await chmod(home,0o700); }
  catch(error) { await rm(lock,{recursive:true,force:true});throw error; }
  const paths={home,lock};cleanup.homes.add(paths);
  return {home,release:async()=>{await rm(home,{recursive:true,force:true});await rm(lock,{recursive:true,force:true});cleanup.homes.delete(paths);}};
 }
 function child(home: string, args: string[]) {
  // No inherited API keys, service-role keys, global Codex config, plugins, or user login cache.
  const process = launch(env.STUDIO_CODEX_BIN || 'codex',args,{
   cwd:home,env:{NODE_ENV:env.NODE_ENV,PATH:env.PATH,HOME:home,CODEX_HOME:home,TMPDIR:home,LANG:'en_US.UTF-8'},stdio:['pipe','pipe','pipe'],
  }) as ChildProcessWithoutNullStreams;
  cleanup.children.add(process);process.once('close',()=>cleanup.children.delete(process));
  return process;
 }
 async function rpc(home: string, notify: (method: string, params: Record<string,unknown>)=>void) {
  const process = child(home,['app-server','--listen','stdio://','-c','cli_auth_credentials_store="file"']);
  let next=0,buffer='',closed=false;
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const rejectAll=(error:Error)=>{closed=true;for(const value of pending.values()){clearTimeout(value.timer);value.reject(error);}pending.clear();};
  process.once('error',()=>rejectAll(missing()));
  process.once('exit',()=>{rejectAll(new Error('Codex sign-in stopped. Start a new connection.'));notify('guildos/exit',{});});
  process.stderr.resume(); // Never log CLI stderr: it can contain account or project details.
  process.stdin.on('error',()=>rejectAll(new Error('Codex sign-in stopped. Start a new connection.')));
  process.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   if(buffer.length>2_000_000){process.kill();return;}
   let end:number;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    try {
     const message=JSON.parse(line);
     if(typeof message.id==='number'&&pending.has(message.id)){
      const value=pending.get(message.id)!;pending.delete(message.id);clearTimeout(value.timer);
      message.error?value.reject(new Error('Codex rejected the sign-in request. Update the CLI and retry.')):value.resolve(message.result);
     } else if(message.id!==undefined) {
      // No server-initiated tool or credential requests are permitted.
      process.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Unsupported request'}})+'\n');
     } else if(typeof message.method==='string')notify(message.method,message.params||{});
    } catch { /* Ignore non-protocol stdout. */ }
   }
  });
  const call=(method:string,params:object={})=>new Promise<any>((resolve,reject)=>{
   if(closed){reject(new Error('Codex is not running.'));return;}
   const id=++next;
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Codex sign-in timed out. Retry the connection.'));},20000);
   pending.set(id,{resolve,reject,timer});process.stdin.write(JSON.stringify({id,method,params})+'\n');
  });
  try { await call('initialize',{clientInfo:{name:'guildos_local',title:'GuildOS Local',version:'0.1.0'}});process.stdin.write('{"method":"initialized"}\n'); }
  catch(error){process.kill();throw error;}
  return {call,close:async()=>{if(process.exitCode===null){await new Promise<void>(done=>{process.once('close',()=>done());process.kill('SIGKILL');});}}};
 }
 async function status(workspace: string): Promise<State> {
  check(workspace);
  const session=sessions.get(workspace);if(session)return session.state;
  const value=await stored(workspace);return value?connected(value.account):{status:'idle',transport:'codex',configured:true};
 }
 async function start(workspace: string): Promise<State> {
  check(workspace);
  const current=sessions.get(workspace);if(current?.state.status==='pending')return current.state;
  const lease=await acquire(workspace);
  let server: Awaited<ReturnType<typeof rpc>>|undefined,timer:ReturnType<typeof setTimeout>|undefined,settling=false,finishing:Promise<void>|undefined;
  const session={state:{status:'pending',transport:'codex',configured:true} as State,stop:async()=>finish(false)};
  const finish=(success:boolean):Promise<void>=>{
   if(finishing)return finishing;settling=true;clearTimeout(timer);
   finishing=(async()=>{
   let finalState: State;
   try {
    if(success&&server){
     const result=await server.call('account/read',{refreshToken:false});
     if(result.account?.type!=='chatgpt')throw new Error('Unexpected account.');
     const auth=await readFile(join(lease.home,'auth.json'),'utf8');
     await save(workspace,{auth,account:result.account});finalState=connected(result.account);
    }else finalState={status:'error',transport:'codex',configured:true,error:'ChatGPT sign-in was cancelled or expired. Start a new connection.'};
   }catch{finalState={status:'error',transport:'codex',configured:true,error:'Could not save this ChatGPT connection. Start sign-in again.'};}
   finally {await server?.close();await lease.release();}
   session.state=finalState;
   if(finalState.status==='connected')sessions.delete(workspace);
   })();
   return finishing;
  };
  sessions.set(workspace,session);
  try {
   server=await rpc(lease.home,(method,params)=>{
    if(method==='account/login/completed')void finish(params.success===true);
    if(method==='guildos/exit'&&!settling)void finish(false);
   });
   const result=await server.call('account/login/start',{type:'chatgptDeviceCode'});
   if(typeof result.userCode!=='string'||typeof result.verificationUrl!=='string'||new URL(result.verificationUrl).origin!=='https://auth.openai.com')throw new Error('Codex returned an invalid verification link.');
   if(!settling){session.state={status:'pending',transport:'codex',configured:true,userCode:result.userCode,verificationUrl:result.verificationUrl,expiresAt:new Date(Date.now()+900000).toISOString()};timer=setTimeout(()=>void finish(false),900000);timer.unref();}
   return session.state;
  } catch(error) {await finish(false);sessions.delete(workspace);throw error;}
 }
 async function disconnect(workspace: string) {
  check(workspace);
  await sessions.get(workspace)?.stop();sessions.delete(workspace);
  const lease=await acquire(workspace);
  try {await rm(entry(workspace),{force:true});}finally{await lease.release();}
 }
 async function respond(workspace: string, options: RequestInit) {
  check(workspace);
  const lease=await acquire(workspace);
  let process:ChildProcessWithoutNullStreams|undefined;
  let account:Account|undefined;
  try {
   const value=await stored(workspace);if(!value)throw new ProviderFailure('Connect ChatGPT in Connections before running this task.',false,true);
   account=value.account;
   await writeFile(join(lease.home,'auth.json'),value.auth,{mode:0o600});
   const body=JSON.parse(String(options.body));
   const structured=body.text?.format?.schema;
   const schema=structured||{type:'object',additionalProperties:false,properties:{reply:{type:'string'}},required:['reply']};
   await writeFile(join(lease.home,'schema.json'),JSON.stringify(schema),{mode:0o600});
   const args=['exec','--skip-git-repo-check','--ephemeral','--ignore-user-config','--ignore-rules','-s','read-only','--json','--color','never','-c','cli_auth_credentials_store="file"','-c','web_search="disabled"','-c','mcp_servers={}', '-c','model_reasoning_effort="low"'];
   for(const feature of ['shell_tool','unified_exec','browser_use','computer_use','apps','plugins'])args.push('--disable',feature);
   if(body.model&&body.model!=='codex-default')args.push('-m',body.model);
   args.push('--output-schema',join(lease.home,'schema.json'),'-o',join(lease.home,'output.json'),'-');
   process=child(lease.home,args);
   let buffer='',usage:{input_tokens:number;output_tokens:number}|undefined,complete=false,policyViolation=false;
   const code=await new Promise<number|null>((resolve,reject)=>{
    const timer=setTimeout(()=>{process!.kill('SIGKILL');reject(new ProviderFailure('ChatGPT Codex action timed out. Retry a smaller action.',true,true));},180000);
    const abort=()=>{process!.kill('SIGKILL');reject(options.signal?.reason||new Error('Action cancelled.'));};
    options.signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
    process!.once('error',()=>{cleanup();reject(new ProviderFailure(missing().message,false,true));});
    process!.once('close',exit=>{cleanup();resolve(exit);});
    process!.stderr.resume();process!.stdin.on('error',()=>{});
    process!.stdout.on('data',chunk=>{
     buffer+=chunk.toString();if(buffer.length>2_000_000){process!.kill('SIGKILL');return;}
     let end:number;while((end=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      try{
       const event=JSON.parse(line);
       if(event.type==='turn.completed'){usage=event.usage;complete=true;}
       if(event.item&&!['agent_message','reasoning'].includes(event.item.type)){policyViolation=true;process!.kill('SIGKILL');}
      }catch{}
     }
    });
    if(options.signal?.aborted){abort();return;}
    process!.stdin.end(`${body.instructions}\nReturn only the requested JSON. Do not use tools or inspect files. Keep this action concise.\nProject data:\n${typeof body.input==='string'?body.input:JSON.stringify(body.input)}`);
   });
   if(code!==0||!complete||policyViolation||!Number.isSafeInteger(usage?.input_tokens)||!Number.isSafeInteger(usage?.output_tokens)||usage!.input_tokens<0||usage!.output_tokens<0)throw failed();
   const text=await readFile(join(lease.home,'output.json'),'utf8');
   if(text.length>100000)throw failed();
   const parsed=JSON.parse(text);
   return Response.json({status:'completed',model:body.model||'codex-default',usage,output:[{type:'message',content:[{type:'output_text',text:structured?text:parsed.reply}]}]});
  } catch(error) {
   if(error instanceof ProviderFailure||options.signal?.aborted)throw error;
   throw failed();
  } finally {
   // Wait for the process to exit before persisting rotated credentials or deleting its home.
   if(process&&process.exitCode===null&&process.signalCode===null)await new Promise<void>(done=>{process!.once('close',()=>done());process!.kill('SIGKILL');});
   try {if(account)await save(workspace,{auth:await readFile(join(lease.home,'auth.json'),'utf8'),account});}
   finally {await lease.release();}
  }
 }
 const requestFor=(workspace:string):typeof fetch=>async(_url,options={})=>respond(workspace,options);
 return {status,start,disconnect,requestFor};
}
const globalCodex=globalThis as typeof globalThis & {guildosLocalCodex?:ReturnType<typeof createLocalCodex>};
export const localCodex=globalCodex.guildosLocalCodex ||= createLocalCodex();
