export type AgentProvider = 'openai'|'openrouter'|'groq';
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
const name=(provider:AgentProvider)=>provider==='openrouter'?'OpenRouter':provider==='groq'?'Groq':'OpenAI';
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
 if(response.status===404||/model_not_found|model_decommissioned/.test(code))return failure(`${providerName} could not access the configured model or endpoint (${status}). Update the connection or use another provider.`,false,true);
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
/** A bounded transport retry only for explicitly unsupported schema constraints. */
export async function requestAgentResponse(provider:AgentProvider,request:typeof fetch,options:RequestInit,onProgress?:(message:string)=>Promise<void>) {
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
