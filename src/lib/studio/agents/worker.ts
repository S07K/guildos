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
import { initialPipeline, PipelineGateError, pipelineRoles, advanceDraft, rejectOrApprove, type PipelineState } from './pipeline.ts';
import { proposeCanvasWork, auditPipeline, ProviderFailure } from './proposal.ts';
import { trialConfig, claimTrialRun, releaseTrialRun, trialExhaustedMessage,noModelMessage } from '../trial.ts';
import { isHtmlScreen, parseDeviceVersion, parseScreenScope, parseScreenTarget, parseVariation, stripScreenScope, type HtmlScreenDocument } from '../html-screen.ts';
import { applyPlan, applyVariationLook, completeSection, deviceVersionState, variationState, failSection, initialSectionState, nextBatch, scopedSectionState, settle, usesSectionPipeline, type SectionPipelineState } from './section-pipeline.ts';
import { buildSection, planScreen, SectionFailure, type SectionConnection } from './section-agents.ts';
import { defaultImageModel, generateScreenImages, type ImageConnection } from './screen-images.ts';
import { assetUrl, storeProjectImage } from '../project-assets.ts';

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
  const loaded=await client.from('studio_pipeline_drafts').select('state').eq('task_id',task.id).eq('workspace_id',task.workspace_id).maybeSingle();
  if(loaded.error)throw new Error('Could not load the private pipeline draft. Apply the sequential pipeline migration.');
  const sectionPipeline=usesSectionPipeline(version?.document,loaded.data?.state);
  if(!sectionPipeline&&version&&!isCanvas(version.document)) {await blocked('This project uses a legacy landing-page document. Save a canvas before assigning canvas work.');return true;}
  const document=isCanvas(version?.document)?version.document:blankCanvas();
  if(!sectionPipeline&&JSON.stringify(document).length>120000) {await blocked('This canvas is too large for one agent task. Split the work into smaller tasks.');return true;}
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
  if(sectionPipeline){
   // Photos use the workspace's own OpenAI or OpenRouter key; the shared trial falls back to stock photos.
   const imageConnection:ImageConnection|null=keyResult.data?{provider:'openai',key:openKey(keyResult.data.ciphertext,task.workspace_id),model:defaultImageModel('openai')}
    :routerResult.data?{provider:'openrouter',key:openKey(routerResult.data.ciphertext,task.workspace_id),model:defaultImageModel('openrouter')}:null;
   await runSectionStep({client,task,token,abort,event,finish,blocked,withProviderFallback,imageConnection,recordedModel:value=>recordedModel(value),activeModel:()=>active.model,setRole:next=>{role=next;},
    brief:projectResult.data!.brief,notes:[...(notesResult.data||[])].reverse(),saved:loaded.data?.state as SectionPipelineState|undefined});
   return true;
  }
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

type SectionStepContext={
 client:SupabaseClient;task:{id:string;workspace_id:string;project_id:string;instruction:string};imageConnection:ImageConnection|null;token:string;abort:AbortController;
 event:(kind:'status'|'handoff'|'result'|'error',body:string)=>Promise<void>;finish:(result:object)=>Promise<{status?:string}|null>;blocked:(summary:string)=>Promise<unknown>;
 withProviderFallback:<T>(run:(connection:SectionConnection)=>Promise<T>)=>Promise<T>;recordedModel:(value:string)=>string;activeModel:()=>string;setRole:(role:AgentRole)=>void;
 brief:string;notes:unknown[];saved?:SectionPipelineState;
};
type BoardScreen={id:string;name:string;device:string;x:number;y:number;head_version_id:string|null;updated_at:string};

/** The project's live screens, newest first. */
async function boardScreens(ctx:SectionStepContext):Promise<BoardScreen[]>{
 const result=await ctx.client.from('studio_screens').select('id,name,device,x,y,head_version_id,updated_at,deleted_at').eq('project_id',ctx.task.project_id).eq('workspace_id',ctx.task.workspace_id);
 if(result.error)throw new Error('Could not load the board. Apply the screens migration.');
 return (result.data as (BoardScreen&{deleted_at:string|null})[]).filter(screen=>!screen.deleted_at).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
}
async function loadScreenDocument(ctx:SectionStepContext,versionId:string|null):Promise<HtmlScreenDocument|null>{
 if(!versionId)return null;
 const result=await ctx.client.from('studio_screen_versions').select('id,document').eq('id',versionId).eq('workspace_id',ctx.task.workspace_id).maybeSingle();
 if(result.error)throw new Error('Could not load the screen.');
 return isHtmlScreen(result.data?.document)?result.data!.document as HtmlScreenDocument:null;
}

/**
 * Where a request goes on the board, from its invisible markers:
 * no screen → a new screen (styled like the board); screen → re-plan that screen;
 * screen + section/add scope → that section; screen + device → a new device version beside it.
 */
async function initialState(ctx:SectionStepContext):Promise<SectionPipelineState>{
 const instruction=ctx.task.instruction,screenId=parseScreenTarget(instruction);
 if(!screenId)return initialSectionState(null,null);
 const target=(await boardScreens(ctx)).find(screen=>screen.id===screenId);
 const document=target?await loadScreenDocument(ctx,target.head_version_id):null;
 if(!target||!document)throw new Error('That screen is no longer on the board. Select it again before sending the request.');
 const device=parseDeviceVersion(instruction),scope=parseScreenScope(instruction),variation=parseVariation(instruction);
 if(device)return deviceVersionState({id:target.id,x:target.x,y:target.y,document},device);
 if(variation)return variationState({id:target.id,headVersionId:target.head_version_id!,document},variation);
 if(scope)return scopedSectionState(target.id,target.head_version_id!,document,scope,stripScreenScope(instruction).trim());
 return initialSectionState(target.id,target.head_version_id);
}

/** One lease of the section pipeline: plan the screen, or build the next batch of sections and publish when none remain. */
async function runSectionStep(ctx:SectionStepContext) {
 const {client,task,token,abort,event}=ctx;
 const request=stripScreenScope(task.instruction).trim();
 let state=ctx.saved;
 if(!state){
  let initial:SectionPipelineState;
  try{initial=await initialState(ctx);}
  catch(error){await ctx.blocked(error instanceof Error?error.message:'The screen could not be found.');return;}
  const initialized=await client.rpc('init_studio_sections',{p_task:task.id,p_token:token,p_state:initial});
  if(initialized.error)throw new Error('Could not initialize the section draft. Apply the screens migration.');
  if(initialized.data?.status==='stale')return;
  state=initialized.data.state as SectionPipelineState;
 }
 // Parallel sections finish in any order; checkpoints are applied one at a time against the latest state.
 let queue=Promise.resolve(true);
 const checkpoint=(change:(current:SectionPipelineState)=>SectionPipelineState,speaker:AgentRole,usage:{summary:string;model:string;input_tokens:number;output_tokens:number},release=false)=>queue=queue.then(async ok=>{
  if(!ok||abort.signal.aborted)return false;
  const next=change(state!);
  const saved=await client.rpc('checkpoint_studio_sections',{p_task:task.id,p_token:token,p_previous:state,p_next:next,p_speaker:speaker,p_summary:usage.summary.slice(0,2000),p_model:ctx.recordedModel(usage.model),p_input:usage.input_tokens,p_output:usage.output_tokens,p_release:release});
  if(saved.error)throw new Error('Could not save the section checkpoint.');
  if(saved.data?.status==='stale'){abort.abort();return false;}
  state=next;return true;
 });
 if(state.phase==='plan'){
  ctx.setRole('creative_director');
  // Re-planning an existing screen keeps its look; a new screen borrows the board's look.
  // A variation plans only a new look for the source screen, which it keeps the sections and photos of.
  const variation=state.edit?.mode==='variation'?state.edit:null;
  const source=variation?await loadScreenDocument(ctx,variation.sourceVersionId):null;
  if(variation&&!source){await ctx.blocked('The screen to vary is no longer available.');return;}
  const previous=state.screenId?await loadScreenDocument(ctx,state.baseVersionId):null;
  const styleReference=state.screenId||source?null:await loadScreenDocument(ctx,(await boardScreens(ctx)).find(screen=>screen.head_version_id)?.head_version_id??null);
  await event('status',source?`Exploring a different look for ${source.name}.`:previous?`Re-planning ${previous.name}.`:'Planning a new screen: theme tokens and sections.');
  const plan=await ctx.withProviderFallback(connection=>planScreen(connection,{brief:ctx.brief,instruction:request,previous,styleReference,variation:source&&variation?{source,index:variation.index}:undefined,notes:ctx.notes,signal:abort.signal}));
  let screen=source&&variation?applyVariationLook(source,plan.screen,variation.index):plan.screen;
  const usage={model:plan.model,input_tokens:plan.input_tokens,output_tokens:plan.output_tokens};
  if(!source&&screen.art?.images.length){
   await event('status',`Generating ${screen.art.images.length} photos: ${screen.art.direction}`);
   const store=async(bytes:Uint8Array)=>assetUrl(task.project_id,(await storeProjectImage(client,{workspaceId:task.workspace_id,projectId:task.project_id},bytes)).id);
   const images=await generateScreenImages(screen.art,{connection:ctx.imageConnection,store,signal:abort.signal,onProgress:message=>event('status',message)});
   screen={...screen,art:images.art};
   for(const spent of images.usage){usage.input_tokens+=spent.input_tokens;usage.output_tokens+=spent.output_tokens;}
  }
  if(await checkpoint(current=>applyPlan(current,screen),'creative_director',{...usage,summary:plan.summary},true))await event('result',`${plan.summary} Sections: ${screen.sections.map(section=>section.id).join(', ')}.`);
  return;
 }
 ctx.setRole('ui_designer');
 const batch=nextBatch(state);
 if(batch.length){
  await event('status',`Building ${batch.map(section=>section.id).join(', ')}.`);
  const screen=state.document!,plan=state.edit;
  await Promise.all(batch.map(async section=>{
   try {
    const edit=plan?.mode==='device'?{sourceHtml:plan.sources[section.id],sourceDevice:plan.sourceDevice}:plan&&'sectionId' in plan&&plan.sectionId===section.id?plan:undefined;
    const built=await ctx.withProviderFallback(connection=>buildSection(connection,{brief:ctx.brief,instruction:request,screen,sectionId:section.id,edit,signal:abort.signal}));
    await checkpoint(current=>completeSection(current,section.id,built.html),'ui_designer',{...built,summary:`${section.id}: ${built.summary}`});
   } catch(error) {
    if(abort.signal.aborted)return;
    const message=error instanceof ProviderFailure?error.message:'The section could not be generated.';
    await event('error',`${section.id}: ${message}`);
    const spent=error instanceof SectionFailure?error.usage:{model:ctx.activeModel(),input_tokens:0,output_tokens:0};
    await checkpoint(current=>failSection(current,section.id,message),'ui_designer',{...spent,summary:`${section.id} failed: ${message}`});
   }
  }));
  if(!await queue)return;
 }
 let finished:SectionPipelineState;
 try{finished=settle(state);}catch(error){await ctx.blocked(error instanceof Error?error.message:'The screen could not be generated.');return;}
 const sections=finished.document!.sections,ready=sections.filter(section=>section.status==='ready').length;
 if(finished.phase!=='done'){
  await checkpoint(current=>current,'ui_designer',{summary:`Built ${ready} of ${sections.length} sections; continuing.`,model:ctx.activeModel(),input_tokens:0,output_tokens:0},true);
  return;
 }
 const edit=finished.edit,name=finished.document!.name;
 const summary=edit?.mode==='device'||edit?.mode==='variation'?`Created ${name}.`:edit?`${edit.mode==='add'?'Added':'Updated'} the ${edit.sectionId} section of ${name}.`:finished.screenId?`${name} was re-planned: ${ready} of ${sections.length} sections built.`:`${name} is ready for review: ${ready} of ${sections.length} sections built.`;
 // A lease that stopped after the final checkpoint resumes straight at publishing.
 if(state.phase!=='done'&&!await checkpoint(()=>finished,'ui_designer',{summary,model:ctx.activeModel(),input_tokens:0,output_tokens:0}))return;
 const saved=await ctx.finish({mode:'edit',summary,document:finished.document,commands:[],expectedVersionId:finished.baseVersionId,model:ctx.recordedModel(ctx.activeModel()),input_tokens:0,output_tokens:0});
 await event(saved?.status==='review'?'result':'error',saved?.status==='review'?'The screen is ready for review.':'The screen changed while it was being built; it was not published.');
}
