/** Recognize saved feedback, including messages sent before review IDs were attached. */
export function reviewHasRevision(task: {instruction:string;created_at:string;updated_at?:string}, notes: readonly {author_role:string;body:string;created_at:string}[]) {
 const prefix=`Revise the completed work for: ${task.instruction.slice(0,500)}\nRequested changes: `;
 const reviewedAt=Date.parse(task.updated_at||task.created_at);
 return notes.some(note=>note.author_role==='human'&&note.body.startsWith(prefix)&&Date.parse(note.created_at)>=reviewedAt&&note.body.slice(prefix.length).trim().length>0);
}

/** One display state for the task API, conversation, modal, and Kanban board. */
export function taskReviewStatuses<T extends {id:string;parent_task_id:string|null;project_id:string;instruction:string;status:string;created_at:string;updated_at?:string}>(tasks:readonly T[]):T[] {
 return tasks.map(task=>{
  if(task.parent_task_id||task.status!=='review')return task;
  const revisions=tasks.filter(candidate=>!candidate.parent_task_id&&candidate.project_id===task.project_id&&candidate.id!==task.id)
   .map(candidate=>({author_role:'human',body:candidate.instruction,created_at:candidate.created_at}));
  return reviewHasRevision(task,revisions)?{...task,status:'changes_requested'}:task;
 });
}
