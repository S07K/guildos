// Production Next over loopback HTTPS: browser, API client, and internal redirects use Secure cookies.
import { createServer } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
if (!process.env.GUILD_TEST_TLS_DIR) {
 const dir=mkdtempSync(join(tmpdir(),'guildos-test-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',env:{...process.env,GUILD_TEST_TLS_DIR:dir,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')}});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('exit',code=>{rmSync(dir,{recursive:true,force:true});process.exit(code??0);});
} else {
 const dir=process.env.GUILD_TEST_TLS_DIR;
 const {default:next}=await import('next');
 const app=next({dev:false,hostname:'127.0.0.1',port:3105});
 await app.prepare();
 const server=createServer({key:readFileSync(join(dir,'key.pem')),cert:readFileSync(join(dir,'cert.pem'))},app.getRequestHandler());
 server.listen(3105,'127.0.0.1');
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();process.exit(0);});
}
