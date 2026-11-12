import Anthropic from '@anthropic-ai/sdk';
import { claudeCodeLocalKey, claudeCodeResponse, ClaudeCodeError } from '../claude-code-local.ts';

export type AgentProvider = 'openai'|'openrouter'|'groq'|'anthropic';
export class ProviderFailure extends Error {
 readonly retryable:boolean;
 readonly fallbackable:boolean;
 readonly httpStatus?:number;
 readonly providerCode?:string;
 constructor(message:string,retryable:boolean,fallbackable=retryable,details:{httpStatus?:number;providerCode?:string}={}) {
  super(message);this.retryable=retryable;this.fallbackable=fallbackable;
  this.httpStatus=details.httpStatus;this.providerCode=details.providerCode;
 }
}
/** The model cannot read the attached reference images; callers retry from the text alone. */
export class ImageInputUnsupported extends ProviderFailure {
 constructor(){super('This model cannot read images.',false,true);}
}
const hasImages=(body:unknown)=>typeof body==='string'&&body.includes('"input_image"');
const name=(provider:AgentProvider)=>provider==='openrouter'?'OpenRouter':provider==='groq'?'Groq':provider==='anthropic'?'Claude':'OpenAI';
const endpoint=(provider:AgentProvider)=>provider==='openrouter'?'https://openrouter.ai/api/v1/responses':provider==='groq'?'https://api.groq.com/openai/v1/responses':'https://api.openai.com/v1/responses';
const knownCodes=new Set(['invalid_request_error','invalid_json_schema','schema_validation_error','unsupported_parameter','unsupported_value','json_validate_failed','tool_use_failed','model_output_invalid','model_not_found','model_decommissioned','context_length_exceeded','prompt_too_long','rate_limit_exceeded','insufficient_quota','billing_error','usage_limit_exceeded','content_filter','content_policy_violation','safety_violation','authentication_error','permission_error','server_error']);
type FailureDetails={code:string;message:string;publicCode?:string};
async function failureDetails(response:Response):Promise<FailureDetails> {
 try{
  const body=await response.clone().json();
  const code=typeof body?.error?.code==='string'?body.error.code.toLowerCase():'';
  const type=typeof body?.error?.type==='string'?body.error.type.toLowerCase():'';
  return {code:code||type,message:typeof body?.error?.message==='string'?body.error.message:'',publicCode:knownCodes.has(code)?code:knownCodes.has(type)?type:undefined};
 }catch{return {code:'',message:''};}
}
function providerFailure(response:Response,provider:AgentProvider,details:FailureDetails) {
 const providerName=name(provider),{code,message,publicCode}=details;
 const metadata={httpStatus:response.status,providerCode:publicCode};
 const status=`HTTP ${response.status}${publicCode?`; ${publicCode}`:''}`;
 const failure=(message:string,retryable:boolean,fallbackable=retryable)=>new ProviderFailure(message,retryable,fallbackable,metadata);
 // Never echo raw provider messages or failed generations: they may contain project data or keys.
 if(/content_filter|content_policy_violation|safety_violation/.test(code))return failure(`${providerName} stopped this request because of its content policy (${status}). Revise the request before retrying.`,false,false);
 if(response.status===429){
  if(/insufficient_quota|billing|usage_limit|subscription/.test(code))return failure(`${providerName} quota is exhausted (${status}). Check billing and project limits, then retry.`,false,true);
  return failure(`${providerName} rate limit reached (${status}). Retry after the limit resets, or check billing and project limits.`,true);
 }
 if(response.status===413)return failure(`${providerName} cannot fit this canvas request within its request or token-per-minute limit (${status}). Reduce the action scope or use another connected provider.`,false,true);
 if([401,403].includes(response.status))return failure(`${providerName} rejected this connection (${status}). Reconnect it in Connections.`,false,true);
 if(response.status===404||/model_not_found|model_decommissioned/.test(code))return failure(`${providerName} could not access the configured model or endpoint (${status}). GuildOS will try another connected provider; update the connection if the error persists.`,false,true);
 if(/context_length_exceeded|prompt_too_long/.test(code))return failure(`${providerName} cannot fit the current project context (${status}). Use a smaller action or a model with a larger context window.`,false,true);
 if(/json_validate_failed|tool_use_failed|model_output_invalid/.test(code)||response.status===422)return failure(`${providerName} could not generate valid structured output (${status}). No canvas changes were saved.`,true,true);
 if([400,415].includes(response.status)){
  const schema=/schema|structured.output|response_format|text\.format/i.test(code+' '+message);
  return failure(`${providerName} rejected the ${schema?'structured-output format':'generation request'} (${status}). No canvas changes were saved.`,false,true);
 }
 return failure(`${providerName} could not complete this request (${status}). Please retry.`,response.status>=500||[408,409,424,498].includes(response.status),true);
}
// Some structured-output implementations accept structure but reject optional schema bounds.
// Backend parsing remains authoritative for bounds, patterns and the six-upsert cap.
const constraintKeys=new Set(['minLength','maxLength','pattern','format','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minItems','maxItems']);
function structuralSchema(value:unknown):unknown {
 if(Array.isArray(value))return value.map(structuralSchema);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!constraintKeys.has(key)).map(([key,value])=>[key,structuralSchema(value)]));
}
export const defaultAnthropicModel='claude-opus-5-5';
/** Responses input: a string, or one user message mixing text and images (data URLs). */
export type ResponsesInput=string|{role:'user';content:({type:'input_text';text:string}|{type:'input_image';image_url:string;detail?:'auto'|'low'|'high'})[]}[];
type ResponsesBody={model:string;max_output_tokens?:number;instructions?:string;input:ResponsesInput;text?:{format?:{type?:string;schema?:unknown}}};
/** The same input as Claude content blocks (base64 images first, as Anthropic recommends). */
function anthropicContent(input:ResponsesInput){
 if(typeof input==='string')return input;
 const parts=input.flatMap(message=>message.content);
 const images=parts.flatMap(part=>{
  if(part.type!=='input_image')return [];
  const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(part.image_url);
  return match?[{type:'image' as const,source:{type:'base64' as const,media_type:match[1] as 'image/png',data:match[2]}}]:[];
 });
 return [...images,...parts.flatMap(part=>part.type==='input_text'?[{type:'text' as const,text:part.text}]:[])];
}
/**
 * Claude adapter: callers build OpenAI Responses-shaped requests, so translate one
 * into a Messages API call and return a Responses-shaped result. Structured output
 * uses output_config.format; bounds are stripped because GuildOS validates them anyway.
 */
async function anthropicResponse(request:typeof fetch,options:RequestInit):Promise<Response> {
 const key=String(new Headers(options.headers).get('authorization')||'').replace(/^Bearer\s+/i,'');
 const body=JSON.parse(String(options.body)) as ResponsesBody;
 if(key===claudeCodeLocalKey){
  // Local development: the developer's Claude Code sign-in (subscription) instead of an API key.
  // The CLI path is text-only, so a request with reference images is retried without them.
  if(typeof body.input!=='string'&&body.input.some(message=>message.content.some(part=>part.type==='input_image')))throw new ImageInputUnsupported();
  try{return await claudeCodeResponse(body,options.signal);}
  catch(error){
   if(!(error instanceof ClaudeCodeError))throw error;
   if(error.kind==='capacity')throw new ProviderFailure(error.message,false,true,{httpStatus:429});
   throw new ProviderFailure(error.message,error.kind==='timeout'||error.kind==='failed',true);
  }
 }
 const client=new Anthropic({apiKey:key,fetch:request,maxRetries:1});
 const schema=body.text?.format?.type==='json_schema'?structuralSchema(body.text.format.schema) as Record<string,unknown>:undefined;
 const small=(body.max_output_tokens||0)<=600;
 try{
  // Thinking is always on for this model; headroom keeps it from consuming the answer budget.
  const message=await client.beta.messages.stream({
   model:body.model||defaultAnthropicModel,max_tokens:Math.max(16000,(body.max_output_tokens||0)+12000),
   betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
   ...(body.instructions?{system:body.instructions}:{}),
   messages:[{role:'user',content:anthropicContent(body.input)}],
   output_config:{effort:small?'low':'medium',...(schema?{format:{type:'json_schema',schema}}:{})},
  },{signal:options.signal||undefined}).finalMessage();
  if(message.stop_reason==='refusal')throw new ProviderFailure('Claude declined this request under its usage policy. Revise the request before retrying.',false,true);
  const text=message.content.flatMap(block=>block.type==='text'?[block.text]:[]).join('');
  const truncated=message.stop_reason==='max_tokens';
  return new Response(JSON.stringify({
   status:truncated?'incomplete':'completed',...(truncated?{incomplete_details:{reason:'max_output_tokens'}}:{}),
   model:`anthropic/${message.model}`,usage:{input_tokens:message.usage.input_tokens,output_tokens:message.usage.output_tokens},
   output:[{type:'message',content:[{type:'output_text',text}]}],
  }),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  if(error instanceof ProviderFailure)throw error;
  if(options.signal?.aborted)throw error;
  if(error instanceof Anthropic.APIConnectionTimeoutError)throw new ProviderFailure('Claude request timed out. Try another connected provider or retry.',true,true);
  if(error instanceof Anthropic.APIConnectionError)throw new ProviderFailure('Claude could not be reached. Try another connected provider or retry.',true,true);
  if(error instanceof Anthropic.APIError&&typeof error.status==='number'){
   // Map onto the shared failure messages; never echo the provider's message text.
   const type=(error.error as {error?:{type?:string}}|undefined)?.error?.type||'';
   const response=new Response(JSON.stringify({error:{type}}),{status:error.status});
   throw providerFailure(response,'anthropic',await failureDetails(response));
  }
  throw error;
 }
}
/** A bounded transport retry only for explicitly unsupported schema constraints. */
export async function requestAgentResponse(provider:AgentProvider,request:typeof fetch,options:RequestInit,onProgress?:(message:string)=>Promise<void>) {
 if(provider==='anthropic')return anthropicResponse(request,options);
 let current=options;
 for(let attempt=0;attempt<2;attempt++){
  let response:Response;
  try{response=await request(endpoint(provider),current);}catch(error){
   if(options.signal?.aborted&&options.signal.reason?.name!=='TimeoutError')throw error;
   if(error instanceof Error&&(error.name==='TimeoutError'||error instanceof TypeError))throw new ProviderFailure(`${name(provider)} ${error.name==='TimeoutError'?'request timed out':'could not be reached'}. Try another connected provider or retry.`,true,true);
   throw error;
  }
  if(response.ok)return response;
  const details=await failureDetails(response);
  if(process.env.NODE_ENV==='development'){
   // Dev-only diagnostics: the provider's own reason and the tail of any rejected generation.
   const body=await response.clone().json().catch(()=>null);
   const generation=typeof body?.error?.failed_generation==='string'?body.error.failed_generation:'';
   console.info('[GuildOS agent]',JSON.stringify({time:new Date().toISOString(),event:'provider_error_detail',provider,status:response.status,code:details.code,message:details.message,failed_generation_chars:generation.length,failed_generation_tail:generation.slice(-600)},null,2));
  }
  if([400,415,422].includes(response.status)&&hasImages(current.body)&&/image|vision|modalit|multimodal/i.test(`${details.message} ${details.code}`))throw new ImageInputUnsupported();
  const unsupportedConstraint=[400,422].includes(response.status)&&/schema|structured.output|response_format|text\.format/i.test(details.message+' '+details.code)&&/unsupported|not supported|not permitted|not allowed|unknown keyword/i.test(details.message)&&/minLength|maxLength|pattern|format|minimum|maximum|multipleOf|minItems|maxItems/i.test(details.message);
  if(attempt===0&&unsupportedConstraint&&typeof current.body==='string'){
   const body=JSON.parse(current.body);
   const schema=body.text?.format?.schema;
   const compatible=structuralSchema(schema);
   if(schema&&JSON.stringify(schema)!==JSON.stringify(compatible)){
    body.text.format.schema=compatible;current={...current,body:JSON.stringify(body)};
    await onProgress?.(`${name(provider)} rejected an optional schema constraint. Retrying with compatible schema structure; GuildOS still validates all component rules.`);
    continue;
   }
  }
  throw providerFailure(response,provider,details);
 }
 throw new ProviderFailure(`${name(provider)} could not accept the structured-output request.`,false,true);
}
