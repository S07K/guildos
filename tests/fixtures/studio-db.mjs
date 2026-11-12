// Real SQL behind a Supabase-shaped client, for worker and RPC integration tests.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// A narrow Supabase-shaped adapter executes actual SQL for worker integration.
export function adapter(db){
 return {
  async rpc(name,args){try{const keys=Object.keys(args);const result=await db.query(`select ${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) as data`,keys.map(key=>typeof args[key]==='object'&&args[key]!==null?JSON.stringify(args[key]):args[key]));return {data:result.rows[0].data,error:null};}catch(error){return {data:null,error};}},
  from(table){let fields='*',conditions=[],values=[],orders=[],count,one=false;
   const query={select(v){fields=v;return query;},insert(row){const keys=Object.keys(row);return db.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(key=>row[key])).then(()=>({data:null,error:null}),error=>({data:null,error}));},eq(k,v){values.push(v);conditions.push(`${k}=$${values.length}`);return query;},lte(k,v){values.push(v);conditions.push(`${k}<=$${values.length}`);return query;},order(k,{ascending=true}={}){orders.push(`${k} ${ascending?'asc':'desc'}`);return query;},limit(v){count=v;return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},async then(resolve,reject){try{const result=await db.query(`select ${fields} from ${table}${conditions.length?' where '+conditions.join(' and '):''}${orders.length?' order by '+orders.join(','):''}${count?' limit '+count:''}`,values);return resolve({data:one?result.rows[0]||null:result.rows,error:null});}catch(error){return resolve({data:null,error});}}};return query;
  },
 };
}

/** A PGlite database with the studio schema the worker needs, before switching to service_role. */
export async function studioDatabase() {
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
 for(const file of ['202610110001_studio.sql','202610140001_studio_agent_notes.sql','202610140002_studio_agent_messages.sql','202610160002_studio_canvas_commits.sql','202610160003_studio_agent_tasks.sql','202610160004_studio_task_activity.sql','202610160005_studio_openrouter.sql','202610160006_studio_openrouter_free_default.sql','202610160007_studio_agent_subtasks.sql','202610160008_studio_agent_job_queue.sql','202610160009_studio_groq.sql','202611090002_studio_anthropic_keys.sql','202610160010_studio_generation_wait_reason.sql','202610180001_studio_small_actions.sql','202610180002_studio_component_actions.sql','202610190001_studio_agent_handoffs.sql','202610190002_studio_handoff_action_limits.sql','202610200001_studio_sequential_pipeline.sql','202610290001_separate_note_display.sql','202611100003_studio_section_pipeline.sql','202611110001_studio_section_edits.sql','202611110002_studio_screens.sql','202611120001_studio_share_links.sql','202611120002_studio_board_notes.sql']){const sql=await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8');await db.exec(sql);}
 return db;
}
