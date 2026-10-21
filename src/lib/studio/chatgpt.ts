import { chatGPTConnection } from './chatgpt-oauth.ts';
import { runGuild } from './guild.ts';
import { ProviderCapacityError } from './provider-fallback.ts';

export async function generateChatGPT(input:{workspace:string;brief:string;previous:unknown;feedback:string},request:typeof fetch=fetch) {
 const {key,model,request:transport}=await chatGPTConnection(input.workspace,request);
 try {
  const result=await runGuild({...input,key,model,provider:'api'},transport);
  return {...result,model:`chatgpt/${model}`};
 }catch(error){
  if(error instanceof ProviderCapacityError)throw new ProviderCapacityError('chatgpt',error.message);
  throw error;
 }
}
