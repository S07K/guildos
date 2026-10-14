import { designSchema, validateDesign } from './design.mjs';
export async function generateChatGPT({ workspace, brief, previous, feedback }: { workspace: string; brief: string; previous: unknown; feedback: string }, request: typeof fetch = fetch) {
 if (!process.env.CODEX_BRIDGE_URL || !process.env.CODEX_BRIDGE_TOKEN) throw new Error('ChatGPT connection service is not configured.');
 const response = await request(`${process.env.CODEX_BRIDGE_URL.replace(/\/$/,'')}/v1/generate?workspace_id=${encodeURIComponent(workspace)}`, { method:'POST',headers:{Authorization:`Bearer ${process.env.CODEX_BRIDGE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({brief,previous,feedback,schema:designSchema}),signal:AbortSignal.timeout(100000) });
 const result = await response.json();
 if (!response.ok) throw new Error(typeof result.error==='string' && result.error.startsWith('ChatGPT') ? result.error : 'ChatGPT generation failed. Reconnect or try again.');
 if (!Number.isSafeInteger(result.input_tokens) || result.input_tokens<0 || !Number.isSafeInteger(result.output_tokens) || result.output_tokens<0 || typeof result.model!=='string' || !result.model.startsWith('chatgpt/')) throw new Error('ChatGPT returned an invalid generation result.');
 return {document:validateDesign(result.document),model:result.model,input_tokens:result.input_tokens,output_tokens:result.output_tokens};
}
