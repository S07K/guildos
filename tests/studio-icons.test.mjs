import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { blankCanvas, renderCanvas, validateCanvas } from '../src/lib/studio/canvas.ts';
import { isKnownIcon, renderIconSvg, searchIcons } from '../src/lib/studio/icon-library.ts';
import { validateProposal } from '../src/lib/studio/agents/proposal.ts';

test('free Lucide icons render as editable canvas layers', () => {
 assert.ok(searchIcons('shopping cart').includes('ShoppingCart'));
 assert.ok(isKnownIcon('ShoppingCart'));
 assert.match(renderIconSvg('ShoppingCart', '#123456', 1.5), /stroke="#123456"/);
 assert.throws(() => renderIconSvg('UnknownIcon'));
 const icon={id:'cart',type:'icon',name:'Cart icon',x:30,y:40,width:48,height:48,fill:'#123456',stroke:'#123456',strokeWidth:1.5,radius:0,opacity:1,text:'',fontSize:16,fontWeight:400,iconName:'ShoppingCart'};
 const document={...blankCanvas(),nodes:[icon]};
 assert.equal(validateCanvas(document),document);
 assert.match(renderCanvas(document,'Icon preview'),/\/api\/studio\/icons\/ShoppingCart\?color=%23123456&amp;strokeWidth=1.5/);
 const component={id:'cart',parentId:'icon-row',type:'icon',primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'FIXED',properties:{iconName:'ShoppingCart',color:'#123456',borderWidth:1.5}};
 assert.equal(validateProposal({mode:'edit',summary:'Added cart icon',upsert_nodes:[{id:'screen',parentId:null,type:'container',properties:{}},{id:'icon-row',parentId:'screen',type:'container',layoutMode:'HORIZONTAL',itemSpacing:8,properties:{alignItems:'center'}},component],delete_ids:[]},blankCanvas()).document.nodes[2].iconName,'ShoppingCart');
 assert.throws(()=>validateProposal({mode:'edit',summary:'Added icon',upsert_nodes:[{...component,properties:{iconName:'UnknownIcon'}}],delete_ids:[]},blankCanvas()),/Lucide catalog/);
});

test('icon MCP server exposes searchable SVGs and rejects unknown names', async () => {
 const transport=new StdioClientTransport({command:process.execPath,args:['scripts/icon-mcp.ts']});
 const client=new Client({name:'guildos-icon-test',version:'1.0.0'});
 try {
  await client.connect(transport);
  const listed=await client.listTools();
  assert.deepEqual(listed.tools.map(tool=>tool.name).sort(),['get_icon','search_icons','search_unsplash']);
  const found=await client.callTool({name:'search_icons',arguments:{query:'shopping cart'}});
  assert.ok(JSON.parse(found.content[0].text).icons.includes('ShoppingCart'));
  const icon=await client.callTool({name:'get_icon',arguments:{name:'ShoppingCart',color:'#123456',strokeWidth:1.5}});
  const payload=JSON.parse(icon.content[0].text);
  assert.equal(payload.canvas.properties.iconName,'ShoppingCart');
  assert.match(payload.svg,/stroke="#123456"/);
  const missing=await client.callTool({name:'get_icon',arguments:{name:'UnknownIcon'}});
  assert.equal(missing.isError,true);
 } finally {await client.close();}
});
