import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashShareToken, isShareToken, newShareToken, shareImageUrls } from '../src/lib/studio/share-links.ts';
import { sealKey } from '../src/lib/studio/vault.mjs';
import { studioDatabase } from './fixtures/studio-db.mjs';

test('share tokens are 192-bit URL-safe secrets, stored only as their hash', () => {
 const token = newShareToken();
 assert.ok(isShareToken(token));
 assert.notEqual(newShareToken(), token);
 assert.match(hashShareToken(token), /^[a-f0-9]{64}$/);
 assert.ok(!isShareToken('../../etc/passwd') && !isShareToken(`${token}x`));
});

test('shared screens load project images through the link, never the signed-in asset route', () => {
 const project = randomUUID(), image = randomUUID(), other = randomUUID();
 const html = `<img src="/api/studio/assets/${image}?projectId=${project}"><img src="/api/studio/assets/${image}?projectId=${other}">`;
 assert.equal(shareImageUrls(html, project, 'T'.repeat(32)), `<img src="/share/${'T'.repeat(32)}/images/${image}"><img src="/api/studio/assets/${image}?projectId=${other}">`);
});

test('share links are readable only by their workspace owner and written only by the server', async t => {
 const db = await studioDatabase(); t.after(() => db.close());
 const alice = randomUUID(), bob = randomUUID();
 await db.query('insert into auth.users values($1),($2)', [alice, bob]);
 const workspace = (await db.query('insert into studio_workspaces(owner_id) values($1) returning id', [alice])).rows[0].id;
 await db.query('insert into studio_workspaces(owner_id) values($1)', [bob]);
 const project = (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Shop','A mobile app for a small clothing shop selling linen and wool basics','https://example.com') returning id", [workspace])).rows[0].id;
 const token = newShareToken();
 await db.query('insert into studio_share_links(project_id,workspace_id,token_hash,token_ciphertext,created_by) values($1,$2,$3,$4,$5)', [project, workspace, hashShareToken(token), sealKey(token, workspace, 'b'.repeat(64)), alice]);
 const as = async (user, sql, params = []) => { await db.exec('RESET ROLE'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('SET ROLE authenticated'); try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); } };
 assert.equal((await as(alice, 'select id from studio_share_links')).rows.length, 1);
 assert.equal((await as(bob, 'select id from studio_share_links')).rows.length, 0, 'another workspace sees nothing');
 await assert.rejects(as(alice, 'update studio_share_links set revoked_at=null'), /permission denied/);
 await assert.rejects(as(alice, 'insert into studio_share_links(project_id,workspace_id,token_hash,token_ciphertext,created_by) values($1,$2,$3,$4,$5)', [project, workspace, 'a'.repeat(64), 'v1.x', alice]), /permission denied/);
 await assert.rejects(db.query('insert into studio_share_links(project_id,workspace_id,token_hash,token_ciphertext,created_by) values($1,$2,$3,$4,$5)', [project, workspace, token, 'v1.x', alice]), /token_hash/, 'the raw token is never accepted as a hash');
});
