import { assertRevisionScope } from '../revision-scope.ts';
import { randomUUID } from 'node:crypto';
import { providerPriority } from '../provider-fallback.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { blankCanvas, isCanvas } from '../canvas.ts';
import { canvasQualityIssues } from '../canvas-quality.ts';
import { screenDocument } from '../screen-scope.ts';
import { openKey } from '../vault.mjs';
import { hasClaudeCodeConnection, claudeCodeLocalKey, localClaudeCodeModel } from '../claude-code-local.ts';
import { hasChatGPTPlan, chatGPTConnection } from '../chatgpt-oauth.ts';
import { agentIdentity, type AgentRole } from '../agent-roles.ts';
import { initialPipeline, PipelineGateError, pipelineRoles, stageInstructions, advanceDraft, rejectOrApprove, type PipelineState } from './pipeline.ts';
import { proposeCanvasWork, auditPipeline, ProviderFailure } from './proposal.ts';
import { trialConfig, claimTrialRun, releaseTrialRun, trialExhaustedMessage,noModelMessage } from '../trial.ts';

function devWorkerLog(event:string,details:Record<string,unknown>={}) {
 if(process.env.NODE_ENV==='development') console.info('[GuildOS worker]',JSON.stringify({time:new Date().toISOString(),event,...details},null,2));
}

/** One lease advances one private stage action; only final QA approval publishes. */
export async function runNextTask(client:SupabaseClient, propose=proposeCanvasWork, agentRole?:AgentRole, audit=auditPipeline) {
 const token=randomUUID();
 const claimed=await client.rpc('claim_studio_task',agentRole?{p_token:token,p_agent_role:agentRole}:{p_token:token});
 if(claimed.error) throw new Error('Task queue unavailable. Apply the agent job migration and check worker credentials.');
 const task=claimed.data;
 if(!task) return false;
 const taskStarted=Date.now();
 devWorkerLog('task_claimed',{task:task.id.slice(0,8),role:task.agent_role,attempt:task.attempts});
 let role=task.agent_role as AgentRole;
 const abort=new AbortController();
 let reserved=false;
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 let activityAvailable=true;
 let trialRun:string|null=null;
 const event=async(kind:'status'|'handoff'|'result'|'error',body:string,recipient?:AgentRole)=>{
  if(!activityAvailable) return;
  try {
   const saved=await client.from('studio_task_events').insert({
    task_id:task.id,project_id:task.project_id,workspace_id:task.workspace_id,
    kind,speaker_role:role,recipient_role:recipient||null,body:body.slice(0,1000),
   });
   if(saved.error?.code==='PGRST205') activityAvailable=false;
   else if(saved.error) console.warn('Task activity could not be saved:',saved.error.code);
  } catch {console.warn('Task activity could not be saved.');}
 };
 const finish=async(result:object)=>{
  const saved=await client.rpc('finish_studio_task',{p_task:task.id,p_token:token,p_result:result});
  if(saved.error) throw new Error('Could not record the task result.');
  if(saved.data?.status==='stale') abort.abort();
  return saved.data;
 };
 const blocked=async(summary:string)=>{
  // A root trial run that produced nothing for the user is given back.
  if(trialRun&&trialRun===task.id) await releaseTrialRun(client,task.workspace_id,trialRun);
  await event('error',summary);return finish({mode:'blocked',summary:summary.slice(0,2000),model:'manual-edit',input_tokens:0,output_tokens:0});};
 try {
  await event('status',`${agentIdentity[role].persona} picked up this task · attempt ${task.attempts} of 3.`);
  const budget=await client.rpc('reserve_studio_generation',{workspace:task.workspace_id,token});
  if(budget.error) throw new Error('Could not reserve the workspace model budget.');
  if(!budget.data) {
   const reason=await client.rpc('studio_generation_wait_reason',{p_workspace:task.workspace_id});
   const waitMessage=reason.data==='daily_limit'
    ? 'The workspace has reached its daily GuildOS model request limit. Agent tasks will resume after the daily limit resets; connecting another provider does not bypass this workspace cap.'
    : 'Another model request is using this workspace slot. This task will retry automatically when the slot is free.';
   await event('status',waitMessage);
   const deferred=await client.rpc('defer_studio_task',{p_task:task.id,p_token:token,p_reason:waitMessage,p_budget:true});
   if(deferred.error) throw new Error('Could not defer the task.');
   return true;
  }
  reserved=true;
  let checking=false;
  heartbeat=setInterval(async()=>{
   if(checking) return;checking=true;
   try {const result=await client.rpc('heartbeat_studio_task',{p_task:task.id,p_token:token});if(result.error||!result.data) abort.abort();}
   catch {abort.abort();} finally {checking=false;}
  },5000); // Short interval: a user's Stop takes effect within seconds.
  const [projectResult,versionResult,notesResult,keyResult,routerResult,groqResult,claudeResult]=await Promise.all([
   client.from('studio_projects').select('brief').eq('id',task.project_id).eq('workspace_id',task.workspace_id).single(),
   client.from('studio_versions').select('id,document').eq('project_id',task.project_id).eq('workspace_id',task.workspace_id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle(),
   client.from('studio_agent_notes').select('id,author_role,body').eq('project_id',task.project_id).eq('workspace_id',task.workspace_id).order('created_at',{ascending:false}).limit(30),
   client.from('studio_keys').select('ciphertext').eq('workspace_id',task.workspace_id).maybeSingle(),
   client.from('studio_openrouter_keys').select('ciphertext,model').eq('workspace_id',task.workspace_id).maybeSingle(),
   client.from('studio_groq_keys').select('ciphertext,model').eq('workspace_id',task.workspace_id).maybeSingle(),
   client.from('studio_anthropic_keys').select('ciphertext,model').eq('workspace_id',task.workspace_id).maybeSingle(),
  ]);
  if(projectResult.error||versionResult.error||notesResult.error||keyResult.error||(routerResult.error&&routerResult.error.code!=='PGRST205')||(groqResult.error&&groqResult.error.code!=='PGRST205')||(claudeResult.error&&claudeResult.error.code!=='PGRST205')) throw new Error('Project context could not be loaded.');
  const version=versionResult.data;
  if(version&&!isCanvas(version.document)) {await blocked('This project uses a legacy landing-page document. Save a canvas before assigning canvas work.');return true;}
  const document=version?.document||blankCanvas();

  if(JSON.stringify(document).length>120000) {await blocked('This canvas is too large for one agent task. Split the work into smaller tasks.');return true;}
  type Connection={key:string;model:string;provider:'openai'|'openrouter'|'groq'|'anthropic';chatgptPlan?:boolean;trial?:boolean;request?:typeof fetch};
  const connections:Connection[]=[];
  // Local development: a workspace that connected Claude Code uses the signed-in CLI (subscription) instead of a stored key.
  if(await hasClaudeCodeConnection(task.workspace_id)) connections.push({key:claudeCodeLocalKey,model:localClaudeCodeModel(),provider:'anthropic'});
  else if(claudeResult.data) connections.push({key:openKey(claudeResult.data.ciphertext,task.workspace_id),model:process.env.STUDIO_ANTHROPIC_MODEL||claudeResult.data.model,provider:'anthropic'});
  if(groqResult.data) connections.push({key:openKey(groqResult.data.ciphertext,task.workspace_id),model:groqResult.data.model,provider:'groq'});
  if(routerResult.data) connections.push({key:openKey(routerResult.data.ciphertext,task.workspace_id),model:routerResult.data.model,provider:'openrouter'});
  if(keyResult.data) connections.push({key:openKey(keyResult.data.ciphertext,task.workspace_id),model:process.env.STUDIO_OPENAI_MODEL||'gpt-4.1-mini',provider:'openai'});
  if(await hasChatGPTPlan(task.workspace_id)) {connections.push({...await chatGPTConnection(task.workspace_id),provider:'openai',chatgptPlan:true});}
  connections.sort((a,b)=>providerPriority.indexOf(a.chatgptPlan?'chatgpt':a.provider==='openai'?'api':a.provider)-providerPriority.indexOf(b.chatgptPlan?'chatgpt':b.provider==='openai'?'api':b.provider));
  if(!connections.length) {
   // No workspace connection: fall back to the platform's free-trial key, if configured.
   const trial=trialConfig();
   if(!trial) {await blocked(noModelMessage);return true;}
   const runId=task.parent_task_id||task.id;
   if(!await claimTrialRun(client,task.workspace_id,runId,trial)) {await blocked(trialExhaustedMessage);return true;}
   trialRun=runId;
   connections.push({key:trial.key,model:trial.model,provider:trial.provider,trial:true});
  }
  let active=connections[0];
  const withProviderFallback=async<T>(run:(connection:Connection)=>Promise<T>):Promise<T>=>{
   let lastError:unknown;
   const label=(connection:Connection)=>connection.trial?'the GuildOS trial model':connection.provider==='anthropic'?(connection.key===claudeCodeLocalKey?'Claude Code (local)':'Claude'):connection.provider==='groq'?'Groq':connection.provider==='openrouter'?'OpenRouter':connection.chatgptPlan?'ChatGPT':'OpenAI API';
   for(let index=0;index<connections.length;index++) {
    const connection=connections[index];
    active=connection;
    await event('status',`Using ${label(connection)} for this task.`);
    try {
     return await run(connection);
    } catch(error) {
     lastError=error;
     if(!(error instanceof ProviderFailure)||!error.fallbackable) throw error;
     const next=connections[index+1];
     if(!next)throw error;
     await event('status',`${error.message} Continuing with ${label(next)}.`);
    }
   }
   throw lastError;
  };
  const recordedModel=(value:string)=>active.provider==='openrouter'?(value.startsWith('openrouter/')?value:`openrouter/${value}`):active.provider==='groq'?(value.startsWith('groq/')?value:`groq/${value}`):active.chatgptPlan?`chatgpt/${value}`:value;
  const loaded=await client.from('studio_pipeline_drafts').select('state').eq('task_id',task.id).eq('workspace_id',task.workspace_id).maybeSingle();
  if(loaded.error)throw new Error('Could not load the private pipeline draft. Apply the sequential pipeline migration.');
  const requestedState=initialPipeline(document,task.instruction,version?.id||null);
  let state:PipelineState;
  if(loaded.data){
   state=loaded.data.state;
   if(state.targetScreenId!==requestedState.targetScreenId){
    const reset=await client.rpc('reset_studio_pipeline_scope',{p_task:task.id,p_token:token,p_state:requestedState});
    if(reset.error)throw new Error('Could not reset the stale private screen scope. Apply the screen-scope reset migration.');
    if(reset.data?.status==='stale')return true;
    if(!['reset','unchanged'].includes(reset.data?.status)||!reset.data?.state)throw new Error('Could not reset the stale private screen scope.');
    state=reset.data.state;
   }
  }
  else {
   const initialized=await client.rpc('init_studio_pipeline',{p_task:task.id,p_token:token,p_state:requestedState});
   if(initialized.error)throw new Error('Could not initialize the private pipeline draft.');
   if(initialized.data?.status==='stale')return true;
   state=initialized.data.state;
  }
  if(requestedState.revisionScope&&!state.revisionScope)state={...state,executionMode:requestedState.executionMode,targetLayerId:requestedState.targetLayerId,revisionScope:requestedState.revisionScope,newScreenTransition:false};
  const publish=async()=>{
   if(state.revisionScope)assertRevisionScope(state.revisionScope,state.document);
   const saved=await finish({mode:'edit',summary:'The single-screen design passed all five pipeline stages and is ready for review.',document:state.document,commands:state.commands,expectedVersionId:state.baseVersionId,model:recordedModel(active.model),input_tokens:0,output_tokens:0});
   await event(saved?.status==='review'?'result':'error',saved?.status==='review'?'The complete screen is ready for review.':'The canvas changed while the draft was prepared; the draft was not published.');
  };
  if(state.stage===5){await publish();return true;}
  const stageRole=pipelineRoles[state.stage];role=stageRole;
  const completedStage=state.stage+1;
  const stageStarted=Date.now();
  devWorkerLog('stage_started',{task:task.id.slice(0,8),stage:completedStage,action:state.action+1,role:stageRole,round:state.round+1});
  await event('status',`Working on: ${agentIdentity[stageRole].action}.`);
  let next:PipelineState;
  let usage:{model:string;input_tokens:number;output_tokens:number;summary:string};
  if(state.stage===4){
   // Final deterministic sanitation and snapshot checks run in rejectOrApprove.
   try {
    const auditResult=await withProviderFallback(connection=>audit({...connection,brief:projectResult.data!.brief,instruction:task.instruction,state,signal:abort.signal},connection.request));
    next=rejectOrApprove(state,auditResult.issues);usage=auditResult;
   } catch(error) {
    if(abort.signal.aborted)throw error;
    devWorkerLog('qa_advisory_unavailable',{task:task.id.slice(0,8),message:error instanceof Error?error.message:'QA advisory failed'});
    next=rejectOrApprove(state,[]);usage={model:active.model,input_tokens:0,output_tokens:0,summary:'Backend layout corrections applied; advisory QA was unavailable.'};
   }
  }else{
   const feedbackTickets=canvasQualityIssues(screenDocument(state.document,state.targetScreenId)).map(issue=>issue.message);
   const result=await withProviderFallback(connection=>propose({...connection,role:stageRole,targetScreenId:state.targetScreenId,instruction:task.instruction,brief:projectResult.data!.brief,document:state.document,notes:[...(notesResult.data||[])].reverse(),signal:abort.signal,pipeline:state,feedbackTickets,onProgress:message=>event('status',message)},connection.request));
   next=advanceDraft(state,result);usage=result;
   const focused=result.commands.flatMap(command=>command.type==='create'?[command.node.id]:command.type==='update'||command.type==='delete'?[command.id]:command.type==='reorder'?command.ids:[]);
   next.focusNodeIds=next.stage===state.stage
    ? [...new Set(focused)].filter(id=>next.document.nodes.some(node=>node.id===id)).slice(0,3)
    : [state.targetScreenId].filter(id=>next.document.nodes.some(node=>node.id===id));
  }
  if(abort.signal.aborted)return true;
  const saved=await client.rpc('checkpoint_studio_pipeline',{p_task:task.id,p_token:token,p_previous:state,p_next:next,p_summary:usage.summary.slice(0,2000),p_model:recordedModel(usage.model),p_input:usage.input_tokens,p_output:usage.output_tokens});
  if(saved.error)throw new Error('Could not save the private pipeline checkpoint.');
  if(saved.data?.status==='stale')return true;
  state=next;
  await event('result',usage.summary.slice(0,1000));
  devWorkerLog('orchestrator_decision',{task:task.id.slice(0,8),agent_name:agentIdentity[stageRole].name,agent_persona:agentIdentity[stageRole].persona,completed_stage:completedStage,next_stage:state.stage<5?state.stage+1:'publish',action:state.action,duration_ms:Date.now()-stageStarted,decision_summary:usage.summary,qa_issues:state.issues});
  if(state.stage===5)await publish();
  else await event('status',state.issues.length?'The private draft needs a structural completion fix before review.':'Private draft saved. The next sequential action is queued.');
 } catch(error) {
  if(!abort.signal.aborted) {
   const message=error instanceof Error?error.message:'The task could not finish.';
   devWorkerLog('task_failed',{task:task.id.slice(0,8),role,elapsed_ms:Date.now()-taskStarted,error:error instanceof Error?error.name:'UnknownError',message:message.slice(0,240)});
   const safe=error instanceof PipelineGateError||error instanceof ProviderFailure||/^(The (provider|agent)|Project context|Could not)/.test(message)?message:error instanceof Error&&error.name==='TimeoutError'?'The model request timed out. The task will retry; choose a faster model if it keeps timing out.':'The task could not finish. Check the connection and retry.';
   if(error instanceof PipelineGateError||error instanceof ProviderFailure&&!error.retryable) await blocked(safe);
   else {
    await event('error',safe);
    const deferred=await client.rpc('defer_studio_task',{p_task:task.id,p_token:token,p_reason:safe,p_budget:false});
    if(deferred.error) throw new Error('Task recovery failed; its lease will expire for another worker.');
   }
  }
 } finally {
  if(heartbeat) clearInterval(heartbeat);
  if(reserved) await client.rpc('release_studio_generation',{workspace:task.workspace_id,token});
 }
 return true;
}
