// Protocol double: no network or real login credentials.
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const args=process.argv.slice(2);
const auth=join(process.env.CODEX_HOME,'auth.json');
if(args[0]==='app-server'){
 const lines=createInterface({input:process.stdin});
 lines.on('line',async line=>{
  const message=JSON.parse(line);
  const reply=result=>process.stdout.write(JSON.stringify({id:message.id,result})+'\n');
  if(message.method==='initialize')reply({});
  if(message.method==='account/read')reply({account:{type:'chatgpt',email:'local@example.test',planType:'plus'}});
  if(message.method==='account/login/start'){
   reply({userCode:'TEST-1234',verificationUrl:'https://auth.openai.com/codex/device'});
   setTimeout(async()=>{
    await writeFile(auth,JSON.stringify({token:'fake-login-secret',refresh:1}),{mode:0o600});
    process.stdout.write(JSON.stringify({method:'account/login/completed',params:{success:true}})+'\n');
   },80);
  }
 });
}else{
 let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
 if(prompt.includes('HANG')){setInterval(()=>{},1000);}
 else if(prompt.includes('FAIL')){process.stdout.write('{"type":"turn.failed"}\n');process.exitCode=1;}
 else{
  const schema=JSON.parse(await readFile(args[args.indexOf('--output-schema')+1],'utf8'));
  const value=schema.properties.assignments?{mode:'edit',summary:'Create a screen.',assignments:[{assignee_role:'ux_architect',assignment:'Create the screen container.'}]}:schema.properties.upsert_nodes?{mode:'edit',summary:'Added a screen.',upsert_nodes:[{id:'screen',parentId:null,type:'container',layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FIXED',padding:16,itemSpacing:8,properties:{}}],delete_ids:[]}:{reply:'A concise reply.'};
  const before=JSON.parse(await readFile(auth,'utf8'));
  if(before.token!=='fake-login-secret')throw new Error('Wrong workspace credential');
  if(process.env.SUPABASE_SECRET_KEY||process.env.OPENAI_API_KEY)throw new Error('Inherited secret');
  await writeFile(auth,JSON.stringify({...before,refresh:before.refresh+1}));
  await writeFile(args[args.indexOf('-o')+1],JSON.stringify(value));
  process.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n');
  process.stdout.write('{"type":"turn.completed","usage":{"input_tokens":120,"output_tokens":40}}\n');
 }
}
