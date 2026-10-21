import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLocalCodex, localCodexEnabled } from '../src/lib/studio/codex-local.ts';
import { openKey } from '../src/lib/studio/vault.mjs';
import { proposeCanvasWork } from '../src/lib/studio/agents/proposal.ts';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
const workspace='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const fixture=resolve('tests/fixtures/codex-local.mjs');
const env={NODE_ENV:'development',STUDIO_CHATGPT_AUTH:'codex',STUDIO_APP_URL:'http://localhost:3000',STUDIO_VAULT_KEY:'a'.repeat(64),PATH:process.env.PATH,OPENAI_API_KEY:'must-not-inherit',SUPABASE_SECRET_KEY:'must-not-inherit'};
async function setup(t){
 const root=await mkdtemp(join(tmpdir(),'guildos-codex-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const invocations=[];
 const options={root,env,launch:(file,args,options)=>{invocations.push({file,args,options});return spawn(process.execPath,[fixture,...args],options);}};
 const runner=createLocalCodex(options);
 return {runner,options,root,invocations};
}
async function signIn(runner){
 const result=await runner.start(workspace);assert.equal(result.status,'pending');assert.equal(result.userCode,'TEST-1234');
 for(let i=0;i<100;i++){
  const state=await runner.status(workspace);if(state.status==='connected')return state;
  await new Promise(done=>setTimeout(done,20));
 }
 assert.fail('login did not finish');
}
test('Codex sign-in is explicitly local and disabled for production and hosted URLs',()=>{
 assert.equal(localCodexEnabled(env),true);
 for(const value of [{...env,NODE_ENV:'production'},{...env,STUDIO_CHATGPT_AUTH:'oauth'},{...env,STUDIO_APP_URL:'https://guildos.design'},{...env,STUDIO_APP_URL:'bad-url'}])assert.equal(localCodexEnabled(value),false);
});
test('device login saves encrypted workspace credentials and another process can read status',async t=>{
 const {runner,options,root,invocations}=await setup(t);
 assert.equal((await runner.status(workspace)).status,'idle');
 const state=await signIn(runner);assert.equal(state.identity.email,'local@example.test');assert.equal(state.transport,'codex');
 const disk=await readFile(join(root,`${workspace}.enc`),'utf8');assert.doesNotMatch(disk,/fake-login-secret|local@example/);
 const decoded=JSON.parse(openKey(disk,workspace,env.STUDIO_VAULT_KEY));assert.match(decoded.auth,/fake-login-secret/);
 assert.throws(()=>openKey(disk,other,env.STUDIO_VAULT_KEY));
 assert.equal((await createLocalCodex(options).status(workspace)).status,'connected');
 assert.equal((await runner.status(other)).status,'idle');
 assert.ok(invocations.every(({options})=>options.env.HOME===options.env.CODEX_HOME&&options.env.HOME!==process.env.HOME&&!options.env.SUPABASE_SECRET_KEY));
 await assert.rejects(runner.start('../../outside'),/Invalid workspace/);
 // Wait for the final auth subprocess cleanup before checking the directory.
 await new Promise(done=>setTimeout(done,50));
 assert.deepEqual(await readdir(root),[`${workspace}.enc`]);
});
test('all agent actions use structured Codex output, retain local validation and exact token usage',async t=>{
 const {runner,root,invocations}=await setup(t);await signIn(runner);await new Promise(done=>setTimeout(done,50));
 const input={key:'',model:'codex-default',instruction:'Create a screen',brief:'Cafe',document:blankCanvas(),role:'ux_architect',notes:[]};
 const first=await proposeCanvasWork(input,runner.requestFor(workspace));assert.equal(first.commands.length,1);assert.equal(first.input_tokens,120);
 const edit=await proposeCanvasWork({...input,requireEdits:true},runner.requestFor(workspace));assert.equal(edit.document.nodes.length,1);assert.equal(edit.output_tokens,40);
 const invocation=invocations.find(({args})=>args[0]==='exec');
 for(const feature of ['shell_tool','unified_exec','browser_use','computer_use','apps','plugins'])assert.ok(invocation.args.includes(feature));
 assert.ok(invocation.args.includes('--ignore-user-config'));assert.ok(invocation.args.includes('read-only'));
 const disk=JSON.parse(openKey(await readFile(join(root,`${workspace}.enc`),'utf8'),workspace,env.STUDIO_VAULT_KEY));
 assert.equal(JSON.parse(disk.auth).refresh,3);
 assert.deepEqual(await readdir(root),[`${workspace}.enc`]);
 await runner.disconnect(workspace);assert.equal((await runner.status(workspace)).status,'idle');assert.deepEqual(await readdir(root),[]);
});
test('failed output, cancellation and concurrent actions cannot save partial edits or leak credentials',async t=>{
 const {runner,options,root}=await setup(t);await signIn(runner);await new Promise(done=>setTimeout(done,50));
 const input={model:'codex-default',instructions:'FAIL',input:'data'};
 await assert.rejects(runner.requestFor(workspace)('',{body:JSON.stringify(input)}),/could not complete/);
 assert.deepEqual(await readdir(root),[`${workspace}.enc`]);
 const abort=new AbortController();
 const running=runner.requestFor(workspace)('',{body:JSON.stringify({...input,instructions:'HANG'}),signal:abort.signal});
 const cancelled=assert.rejects(running,error=>error.name==='AbortError');
 await new Promise(done=>setTimeout(done,60));
 await assert.rejects(createLocalCodex(options).disconnect(workspace),/in progress/);
 abort.abort();await cancelled;
 assert.deepEqual(await readdir(root),[`${workspace}.enc`]);
 await runner.disconnect(workspace);
});

test('pending device sign-in is idempotent and can be cancelled without storing credentials',async t=>{
 const {runner,root}=await setup(t);
 const first=await runner.start(workspace);
 assert.equal((await runner.start(workspace)).userCode,first.userCode);
 await runner.disconnect(workspace);
 assert.equal((await runner.status(workspace)).status,'idle');
 assert.deepEqual(await readdir(root),[]);
});
