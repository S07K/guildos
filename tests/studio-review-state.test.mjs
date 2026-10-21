import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewHasRevision, taskReviewStatuses } from '../src/lib/studio/review-state.ts';
const task={instruction:'Improve home',created_at:'2026-10-18T10:00:00Z',updated_at:'2026-10-18T11:00:00Z'};
const note={author_role:'human',body:'Revise the completed work for: Improve home\nRequested changes: Align the buttons.',created_at:'2026-10-18T11:01:00Z'};
test('saved revision feedback dismisses only the matching completed review and survives reload',()=>{
 assert.equal(reviewHasRevision(task,[note]),true);
 assert.equal(reviewHasRevision(task,JSON.parse(JSON.stringify([note]))),true);
 assert.equal(reviewHasRevision({...task,instruction:'Improve menu'},[note]),false);
 assert.equal(reviewHasRevision({...task,updated_at:'2026-10-18T12:00:00Z'},[note]),false);
 for(const changed of [{...note,author_role:'creative_director'},{...note,body:'I have a question.'},{...note,body:'Revise the completed work for: Improve home\nRequested changes: '}])assert.equal(reviewHasRevision(task,[changed]),false);
 assert.equal(reviewHasRevision(task,[]),false);
});


test('task responses mark revised reviews consistently and isolate projects and later review cycles',()=>{
 const original={...task,id:'original',parent_task_id:null,project_id:'project-a',status:'review'};
 const revision={...original,id:'revision',instruction:note.body,status:'queued',created_at:note.created_at,updated_at:note.created_at};
 assert.equal(taskReviewStatuses([original,revision])[0].status,'changes_requested');
 assert.equal(original.status,'review');
 assert.equal(taskReviewStatuses([original,{...revision,project_id:'project-b'}])[0].status,'review');
 assert.equal(taskReviewStatuses([{...original,updated_at:'2026-10-18T12:00:00Z'},revision])[0].status,'review');
 assert.equal(taskReviewStatuses([{...original,status:'done'},revision])[0].status,'done');
});
