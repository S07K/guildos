import { type AgentRole, type AgentAnchor } from './agent-roles.ts';
import { blankCanvas, isCanvas, validateCanvas } from './canvas.ts';
import { proposeCanvasWork, auditPipeline, ProviderFailure } from './agents/proposal.ts';
import { initialPipeline, pipelineRoles, advanceDraft, rejectOrApprove } from './agents/pipeline.ts';
import { ProviderCapacityError } from './provider-fallback.ts';

export type AgentNote = { author_role: AgentRole; mentioned_role: AgentRole | null; anchor: AgentAnchor; body: string };
type Input = { key:string;brief:string;previous?:unknown;feedback?:string;discussion?:{author_role:string;mentioned_role:string|null;anchor:string;body:string}[];model?:string;provider?:'api'|'openrouter'|'groq' };

/** Compatibility generation uses the same state machine and publishes only its final result. */
export async function runGuild({key,brief,previous=null,feedback='',discussion=[],model=process.env.STUDIO_OPENAI_MODEL||'gpt-4.1-mini',provider='api'}:Input,request:typeof fetch=fetch) {
 const connection={key,model,provider:provider==='api'?'openai' as const:provider};
 const usage={input_tokens:0,output_tokens:0};
 const notes:AgentNote[]=[];
 const instruction=feedback||`Create an editable UI for this brief: ${brief}`;
 let state=initialPipeline(isCanvas(previous)?validateCanvas(previous):blankCanvas(),instruction,null);
 try {
  while(state.stage<5){
   const role=pipelineRoles[state.stage];
   const result=state.stage===4
    ?await auditPipeline({...connection,brief,instruction,state},request)
    :await proposeCanvasWork({...connection,role,targetScreenId:state.targetScreenId,instruction,brief,document:state.document,notes:[...discussion,...notes].slice(-30),pipeline:state},request);
   usage.input_tokens+=result.input_tokens;usage.output_tokens+=result.output_tokens;
   notes.push({author_role:role,mentioned_role:null,anchor:'page',body:result.summary});
   state='issues' in result?rejectOrApprove(state,result.issues):advanceDraft(state,result);
  }
  return {document:state.document,model:provider==='api'?model:`${provider}/${model}`,...usage,notes};
 }catch(error){
  if(error instanceof ProviderFailure&&error.fallbackable)throw new ProviderCapacityError(provider,error.message);
  throw error;
 }
}
