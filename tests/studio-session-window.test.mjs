import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { issueSessionWindow, readSessionWindow, validateStudioSession } from '../src/lib/auth/session-window.ts';
import { SESSION_MAX_AGE_SECONDS, authCookieOptions, safeNextUrl, isAuthCookie } from '../src/lib/auth/config.ts';
process.env.AUTH_SESSION_SECRET='test-only-session-secret-that-is-at-least-32-characters';
const token=(id='session-1')=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({session_id:id})).toString('base64url')+'.signed-by-fixture';
const session={access_token:token(),user:{id:'user-1'}};
test('signed session deadline is absolute, inclusive at expiration, and rejects edits and future timestamps',()=>{
 const now=1000000,marker=issueSessionWindow(session,now);
 assert.equal(readSessionWindow(marker,now+SESSION_MAX_AGE_SECONDS-1).issuedAt,now);
 assert.equal(readSessionWindow(marker,now+SESSION_MAX_AGE_SECONDS),null);
 assert.equal(readSessionWindow(marker,now-1),null);
 assert.equal(readSessionWindow(marker+'x',now),null);
 assert.equal(readSessionWindow(marker+'.extra',now),null);
 assert.equal(readSessionWindow(String(now),now),null);
 assert.equal(readSessionWindow(undefined,now),null);
 const [payload,signature]=marker.split('.');const edit=JSON.parse(Buffer.from(payload,'base64url'));edit.issuedAt++;
 assert.equal(readSessionWindow(Buffer.from(JSON.stringify(edit)).toString('base64url')+'.'+signature,now+2),null);
});
test('validation authenticates through Supabase and binds both user and session identities',async()=>{
 let calls=0,current=session;
 const client={auth:{getUser:async()=>{calls++;return {data:{user:current.user},error:null};},getSession:async()=>({data:{session:current}})}};
 const marker=issueSessionWindow(session);
 assert.equal(await validateStudioSession(client),null);assert.equal(calls,0);
 assert.equal((await validateStudioSession(client,marker)).id,'user-1');
 current={...session,access_token:token('other-session')};assert.equal(await validateStudioSession(client,marker),null);
 current={...session,user:{id:'other-user'}};assert.equal(await validateStudioSession(client,marker),null);
 current=session;const expired=issueSessionWindow(session,Math.floor(Date.now()/1000)-SESSION_MAX_AGE_SECONDS);const before=calls;
 assert.equal(await validateStudioSession(client,expired),null);assert.equal(calls,before);
});
test('configuration defaults to 24 hours and validates shorter windows',()=>{
 assert.equal(authCookieOptions.maxAge,SESSION_MAX_AGE_SECONDS);assert.equal(authCookieOptions.sameSite,'lax');assert.equal(authCookieOptions.path,'/');
 const run=value=>execFileSync(process.execPath,['--input-type=module','-e',"import {SESSION_MAX_AGE_SECONDS} from './src/lib/auth/config.ts'; process.stdout.write(String(SESSION_MAX_AGE_SECONDS));"],{env:{...process.env,NEXT_PUBLIC_SESSION_MAX_AGE_SECONDS:value},stdio:['ignore','pipe','pipe']}).toString();
 assert.equal(run(''),'86400');assert.equal(run('43200'),'43200');assert.equal(run('28800'),'28800');
 for(const value of ['0','-1','NaN','1.5','Infinity'])assert.throws(()=>run(value));
});
test('return URLs stay in studio and auth cookie matching includes chunks without matching PKCE verifier',()=>{
 for(const url of ['https://evil.example','//evil.example','/\\evil.example','/signin','/auth/callback','javascript:alert(1)','/studio/../../evil','/studio\n/evil'])assert.equal(safeNextUrl(url),'/studio');
 assert.equal(safeNextUrl('/studio/projects/123?tab=layers'),'/studio/projects/123?tab=layers');
 assert.equal(isAuthCookie('sb-test-auth-token.0'),true);assert.equal(isAuthCookie('sb-test-auth-token'),true);assert.equal(isAuthCookie('sb-test-auth-token-code-verifier'),false);
});
