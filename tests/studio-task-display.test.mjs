import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDisplay } from '../src/lib/studio/task-display.ts';
test('task previews have bounded titles and descriptions while keeping full instructions unchanged',()=>{
 const task={instruction:'Align home screen. '+('Keep every action and align its container. '.repeat(15)),summary:'The search controls and category buttons now use consistent spacing. '+('All content is preserved. '.repeat(15))};
 const preview=taskDisplay(task);
 assert.equal(preview.title,'Align home screen');assert.ok(preview.title.length<=64);assert.ok(preview.description.length<=160);
 assert.ok(task.instruction.length>500);assert.match(preview.description,/search controls/);
 const revision=taskDisplay({instruction:`Revise the completed work for: ${task.instruction.slice(0,500)}\nRequested changes: Make search easier to find. Keep the rest of the page unchanged.`});
 assert.equal(revision.title,'Revise: Make search easier to find');assert.match(revision.description,/Keep the rest/);
 assert.equal(taskDisplay({instruction:'@Noor review the checkout flow.'}).title,'Review the checkout flow');
 assert.equal(taskDisplay({instruction:"Hey @Ari let's build this app"}).title,'Build this app');
});
test('task detail titles preserve long titles and revision labels without ellipsis',()=>{
 const instruction='Build an accessible checkout experience with clear delivery options, payment details, order summaries, and confirmation states';
 assert.match(taskDisplay({instruction}).title,/…$/);
 assert.equal(taskDisplay({instruction},{truncateTitle:false}).title,instruction);
 assert.equal(taskDisplay({instruction:`Revise the completed work for: Checkout\nRequested changes: ${instruction}`},{truncateTitle:false}).title,`Revise: ${instruction}`);
});
