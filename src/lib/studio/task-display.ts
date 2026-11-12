import type { AgentRole } from './agent-roles.ts';
import { stripScreenScope } from './html-screen.ts';
import type { TaskWait } from './task-wait.ts';
export type StudioTask = {id:string;parent_task_id:string|null;project_id:string;project_name?:string;agent_role:AgentRole;instruction:string;summary:string;status:string;error:string;result_version_id:string|null;created_at:string;updated_at?:string;title?:string;description?:string;wait?:TaskWait|null};
export const taskStatusLabels:Record<string,string>={queued:'Queued',running:'Working',delegated:'Working',review:'Needs approval',changes_requested:'Changes requested',done:'Done',blocked:'Needs attention',failed:'Failed',cancelled:'Cancelled'};
export const taskStatusColor=(status:string):'warning'|'success'|'error'|'info'|'default'=>status==='review'?'warning':status==='done'?'success':['blocked','failed'].includes(status)?'error':['running','delegated'].includes(status)?'info':'default';
function shorten(value:string,max:number) {
 const text=value.replace(/\s+/g,' ').trim();
 if(text.length<=max)return text;
 const prefix=text.slice(0,max-1),space=prefix.lastIndexOf(' ');
 return prefix.slice(0,space>max/2?space:prefix.length).replace(/[.,;:]$/,'')+'…';
}
/** Compact labels are deterministic; full saved instructions stay intact for execution and review. */
export function taskDisplay(task:{instruction:string;summary?:string}, {truncateTitle=true}:{truncateTitle?:boolean}={}) {
 const scopedInstruction=stripScreenScope(task.instruction).replace(/^Active screen ID: [a-z0-9-]{1,80}\r?\n/im,'');
 const revision=scopedInstruction.match(/^Revise the completed work for: ([\s\S]*?)\nRequested changes: ([\s\S]*)$/);
 const instruction=revision?revision[2]:scopedInstruction;
 const firstLine=instruction.split('\n')[0].replace(/^Current action:\s*/i,'').replace(/\s*@(?:Ari|Noor|Mira|Pip|Vale)\b/gi,'').replace(/^@\w+\s*/,'').replace(/^(?:hey\s+|please\s+|let['’]s\s+)+/i,'').trim();
 const sentence=firstLine.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/,'');
 const fullTitle=`${revision?'Revise: ':''}${sentence}`;
 const title=truncateTitle?shorten(fullTitle,64):fullTitle;
 return {title:title.charAt(0).toUpperCase()+title.slice(1),description:shorten(task.summary?.trim()||instruction,160)};
}
