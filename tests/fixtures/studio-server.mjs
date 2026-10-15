// Local browser-test service only. Never imported by application code or deployed.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'studio-test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url') + '.fixture-signature';
const tables = { studio_workspaces: [], studio_projects: [], studio_keys: [], studio_versions: [], studio_agent_notes: [] };
const server = createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 let raw = ''; for await (const chunk of req) raw += chunk;
 const body = raw ? JSON.parse(raw) : {};
 const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
 if (url.pathname === '/health') return send({ ok: true });
 if (url.pathname === '/auth/v1/otp') return send({});
 if (url.pathname === '/auth/v1/verify') return body.token === '123456' ? send({ access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }) : send({ message: 'Invalid token' }, 400);
 if (url.pathname === '/auth/v1/logout') return send({});
 const authenticated = req.headers.authorization === 'Bearer ' + token;
 const admin = req.headers.apikey === 'sb_secret_test-studio-only';
 if (url.pathname === '/auth/v1/user') return authenticated ? send(user) : send({ message: 'Unauthorized' }, 401);
 if(url.pathname==='/rest/v1/rpc/reserve_studio_generation')return admin?send(true):send({},403);
 if(url.pathname==='/rest/v1/rpc/release_studio_generation')return admin?send(null):send({},403);
 if (url.pathname === '/testing/version' && req.method === 'POST') {
  const project = tables.studio_projects.find(row => row.id === body.project_id);
  if (!project) return send({ message: 'Project not found' }, 404);
  const version = { ...body, workspace_id: project.workspace_id };
  tables.studio_versions.push(version); return send(version);
 }
 if (!authenticated && !admin) return send({ message: 'Unauthorized' }, 401);
 const name = url.pathname.split('/').pop();
 if (!Object.hasOwn(tables, name)) return send({ message: 'Not found' }, 404);
 const matches = row => [...url.searchParams].every(([field, value]) => !value.startsWith('eq.') || String(row[field]) === value.slice(3));
 if (req.method === 'POST') {
  const incoming = Array.isArray(body) ? body[0] : body;
  if (name === 'studio_workspaces' && tables[name].some(row => row.owner_id === incoming.owner_id)) return send({ code: '23505', message: 'Duplicate owner' }, 409);
  if (name === 'studio_keys') {
   if (!admin || !incoming.ciphertext?.startsWith('v1.')) return send({ message: 'Encrypted storage required' }, 403);
   tables[name] = tables[name].filter(row => row.workspace_id !== incoming.workspace_id);
  }
  const inserted = { id: randomUUID(), name: 'My creative studio', created_at: new Date().toISOString(), ...incoming };
  tables[name].push(inserted);
  // PostgREST returns the inserted row, rather than every existing table row.
  return send(req.headers.accept?.includes('vnd.pgrst.object') ? inserted : [inserted]);
 }
 if (req.method === 'DELETE') { tables[name] = tables[name].filter(row => !matches(row)); return send(null); }
 let rows = tables[name].filter(matches);
 if (url.searchParams.get('order')?.includes('desc')) rows = [...rows].reverse();
 const select = url.searchParams.get('select');
 if (select && select !== '*') rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key]])));
 if (req.headers.accept?.includes('vnd.pgrst.object')) return rows.length === 1 ? send(rows[0]) : send({ code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows' }, 406);
 send(rows);
});
server.listen(3199, '127.0.0.1');
