import { createClient } from '@supabase/supabase-js';
import nextEnv from '@next/env';
import { setTimeout as delay } from 'node:timers/promises';
import { runNextTask } from '../src/lib/studio/agents/worker.ts';

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('Configure Supabase URL and service credentials before starting the worker.');
const client=createClient(url,key,{global:{headers:{Prefer:'timezone=UTC'}},auth:{persistSession:false,autoRefreshToken:false}});
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
console.log('GuildOS sequential pipeline worker started. Checking the queue every 10 seconds.');
let lastError='';
while(!stopping) {
 try {
  const worked=await runNextTask(client);
  if(lastError){console.log('Pipeline worker reconnected.');lastError='';}
  if(!worked&&!stopping)await delay(10000);
 } catch(error) {
  const message=error instanceof Error?error.message:'Worker iteration failed.';
  if(message!==lastError)console.error(message);
  lastError=message;
  if(!stopping)await delay(10000);
 }
}
console.log('GuildOS pipeline worker stopped.');
