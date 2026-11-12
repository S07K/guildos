import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { studioDatabase } from './fixtures/studio-db.mjs';

test('board notes are readable only by their workspace owner, written only by the server, and validated', async t => {
 const db = await studioDatabase(); t.after(() => db.close());
 const alice = randomUUID(), bob = randomUUID();
 await db.query('insert into auth.users values($1),($2)', [alice, bob]);
 const workspace = (await db.query('insert into studio_workspaces(owner_id) values($1) returning id', [alice])).rows[0].id;
 await db.query('insert into studio_workspaces(owner_id) values($1)', [bob]);
 const project = (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Shop','A mobile app for a small clothing shop selling linen and wool basics','https://example.com') returning id", [workspace])).rows[0].id;
 await db.query("insert into studio_board_notes(project_id,workspace_id,body,x,y,created_by) values($1,$2,'Check the hero copy',10,20,$3)", [project, workspace, alice]);
 const as = async (user, sql, params = []) => { await db.exec('RESET ROLE'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('SET ROLE authenticated'); try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); } };
 assert.deepEqual((await as(alice, 'select body,color,width from studio_board_notes')).rows, [{ body: 'Check the hero copy', color: 'yellow', width: 240 }]);
 assert.equal((await as(bob, 'select id from studio_board_notes')).rows.length, 0, 'another workspace sees nothing');
 await assert.rejects(as(alice, "update studio_board_notes set body='x'"), /permission denied/);
 await assert.rejects(db.query("insert into studio_board_notes(project_id,workspace_id,color,created_by) values($1,$2,'purple',$3)", [project, workspace, alice]), /color/);
 await assert.rejects(db.query("insert into studio_board_notes(project_id,workspace_id,body,created_by) values($1,$2,repeat('a',2001),$3)", [project, workspace, alice]), /body/);
});
