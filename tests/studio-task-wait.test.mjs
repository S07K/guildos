import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLimitWait, resetCountdown } from '../src/lib/studio/task-wait.ts';
test('daily wait reports the next UTC boundary only when the current allowance is exhausted',()=>{
 const now=new Date('2026-10-18T11:30:00Z');
 const wait=dailyLimitWait({day:'2026-10-18',attempts:30},now);
 assert.equal(wait.resetsAt,'2026-10-19T00:00:00.000Z');
 assert.equal(wait.serverNow,now.toISOString());
 assert.equal(resetCountdown(wait.resetsAt,now.getTime()),'12h 30m');
 assert.equal(dailyLimitWait({day:'2026-10-18',attempts:29},now),null);
 assert.equal(dailyLimitWait({day:'2026-10-17',attempts:30},now),null);
 assert.equal(dailyLimitWait({day:'2026-10-18',attempts:30},new Date(wait.resetsAt)),null);
 assert.equal(dailyLimitWait(null,now),null);
 assert.equal(dailyLimitWait({day:'2026-12-31',attempts:30},new Date('2026-12-31T23:59:00Z')).resetsAt,'2027-01-01T00:00:00.000Z');
});
test('countdown rounds up and handles reset without negative time',()=>{
 const reset='2026-10-19T00:00:00Z',time=Date.parse(reset);
 assert.equal(resetCountdown(reset,time-1),'1m');
 assert.equal(resetCountdown(reset,time-3600000),'1h');
 assert.equal(resetCountdown(reset,time),'now');
 assert.equal(resetCountdown(reset,time+60000),'now');
 assert.equal(resetCountdown('invalid',time),'');
});
