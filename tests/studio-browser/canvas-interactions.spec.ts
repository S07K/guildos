import { test, expect, type Page, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createCanvasNode } from '../../src/lib/studio/canvas-position.ts';
import type { CanvasNode } from '../../src/lib/studio/canvas.ts';

async function project(page:Page,nodes:CanvasNode[]=[]) {
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/signin');
 await page.getByLabel('Email address').fill('studio-test@example.com');
 await page.getByRole('button',{name:'Send sign-in code'}).click();
 await page.getByLabel('Email code').fill('123456');
 await page.getByRole('button',{name:'Enter your studio'}).click();
 await page.getByRole('link',{name:'New project',exact:true}).click();
 await page.getByLabel('Project name').fill('Pointer regression '+randomUUID().slice(0,5));
 await page.getByLabel('Your creative brief').fill('Verify manual shapes alongside generated Auto Layout.');
 await page.getByRole('button',{name:'Create project',exact:true}).click();
 await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
 const id=page.url().split('/').at(-1)!;
 if(nodes.length){
  const response=await page.request.post('/api/studio/canvas/commands',{headers:{origin:'https://127.0.0.1:3105'},data:{projectId:id,requestId:randomUUID(),expectedVersionId:null,commands:nodes.map(node=>({type:'create',node}))}});
  expect(response.status(),await response.text()).toBe(201);
  await page.reload();
 }
 return id;
}
async function save(page:Page){
 await page.getByRole('button',{name:'Project actions'}).click();
 const response=page.waitForResponse(response=>response.url().endsWith('/api/studio/versions')&&response.request().method()==='POST');
 await page.getByRole('menuitem',{name:'Save changes'}).click();
 const result=await response;expect(result.status(),await result.text()).toBe(201);
 return (await result.json()).version.document;
}
async function origin(node:Locator){
 return node.evaluate(element=>{const rect=element.getBoundingClientRect(),root=element.closest('[data-testid="manual-canvas"]')!,scale=root.getBoundingClientRect().width/80000;return {x:rect.left+(element as HTMLElement).clientLeft*scale,y:rect.top+(element as HTMLElement).clientTop*scale,scale};});
}
async function draw(page:Page,parent:Locator,tool:string,start:{x:number;y:number},end:{x:number;y:number}){
 await page.getByRole('button',{name:tool+' tool',exact:true}).click();
 const o=await origin(parent);
 await page.mouse.move(o.x+start.x*o.scale,o.y+start.y*o.scale);await page.mouse.down();
 await page.mouse.move(o.x+end.x*o.scale,o.y+end.y*o.scale,{steps:6});await page.mouse.up();
 await expect(page.getByRole('button',{name:'Select tool',exact:true})).toHaveAttribute('aria-pressed','true');
}

test('draws parent-local shapes in all directions, cancels previews and persists exact geometry',async({page})=>{
 await project(page,[createCanvasNode('frame','parent',{positionMode:'absolute',x:-150,y:-220,width:440,height:440})]);
 const canvas=page.getByTestId('manual-canvas'),parent=canvas.locator('[data-node-id="parent"]');
 const cases=[{tool:'Rectangle',start:{x:30,y:30},end:{x:110,y:80}},{tool:'Ellipse',start:{x:220,y:30},end:{x:140,y:80}},{tool:'Rectangle',start:{x:30,y:190},end:{x:110,y:140}},{tool:'Frame',start:{x:220,y:190},end:{x:140,y:140}}];
 for(const [index,item] of cases.entries()){
  await draw(page,parent,item.tool,item.start,item.end);
  await page.getByLabel('Layer name').fill('Shape '+index);
  await expect(page.getByLabel('X position')).toHaveValue(String(Math.min(item.start.x,item.end.x)));
  await expect(page.getByLabel('Y position')).toHaveValue(String(Math.min(item.start.y,item.end.y)));
  await expect(page.getByLabel('Width',{exact:true})).toHaveValue('80');
  await expect(page.getByLabel('Height',{exact:true})).toHaveValue('50');
 }
 await page.getByRole('button',{name:'Rectangle tool',exact:true}).click();
 const o=await origin(parent);
 await page.mouse.move(o.x+280*o.scale,o.y+250*o.scale);await page.mouse.down();
 await page.mouse.move(o.x+350*o.scale,o.y+300*o.scale);await page.keyboard.press('Escape');await page.mouse.up();
 await expect(parent.locator(':scope > [data-node-id]')).toHaveCount(4);
 const doc=await save(page);
 expect(doc.nodes).toHaveLength(5);
 for(const node of doc.nodes.filter((node:CanvasNode)=>node.id!=='parent')){expect(node.parentId).toBe('parent');expect(node.positionMode).toBe('absolute');expect(node.width).toBeCloseTo(80,1);expect(node.height).toBeCloseTo(50,1);}
 await page.reload();await expect(parent.locator(':scope > [data-node-id]')).toHaveCount(4);
});

test('dragging flow containers retains children, tracks zoom, and leaves rounded borders unchanged',async({page},testInfo)=>{
 const frame=createCanvasNode('frame','parent',{positionMode:'absolute',x:-180,y:-220,width:500,height:500});
 const row=createCanvasNode('container','row',{parentId:'parent',width:220,height:120,radius:24,fill:'#ffffff',strokeWidth:2,stroke:'#386650',layout:{direction:'column',padding:16,gap:8,alignItems:'start',justifyContent:'start'}});
 const button=createCanvasNode('button','guest',{parentId:'row',width:180,height:48,text:'Continue as guest',fontSize:16,radius:16,fill:'#ffffff',stroke:'#d1d5db',strokeWidth:1});
 await project(page,[frame,row,button]);
 const canvas=page.getByTestId('manual-canvas'),container=canvas.locator('[data-node-id="row"]'),guest=canvas.locator('[data-node-id="guest"]');
 await guest.click();
 await expect(guest).toHaveCSS('border-radius','16px');
 await expect(guest).toHaveCSS('outline-style','none');
 await expect(guest.locator('[data-resize]')).toHaveCount(0);
 await expect(canvas.locator('[data-selection-overlay] [data-resize]')).toHaveCount(1);
 const guestBox=await guest.boundingBox();
 await page.screenshot({path:testInfo.outputPath('rounded-selection.png'),clip:{x:guestBox!.x-15,y:guestBox!.y-15,width:guestBox!.width+30,height:guestBox!.height+30}});
 const o=await origin(container),box=await container.boundingBox();
 const start={x:box!.x+box!.width-10,y:box!.y+box!.height-12};
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(start.x+60*o.scale,start.y+100*o.scale,{steps:10});
 await expect(container).toHaveCSS('position','absolute');
 // A second move after the node changes positioning must retain pointer capture.
 await page.mouse.move(start.x+90*o.scale,start.y+125*o.scale,{steps:5});await page.mouse.up();
 await expect(page.getByLabel('X position')).toHaveValue('90');
 await expect(page.getByLabel('Y position')).toHaveValue('125');
 await expect(container.locator('[data-node-id="guest"]')).toHaveCount(1);
 await expect(container).toHaveCSS('display','flex');
 await expect(container).toHaveCSS('border-radius','24px');
 await page.keyboard.press('Meta+z');await expect(container).toHaveCSS('position','relative');
 await page.keyboard.press('Meta+Shift+z');await expect(container).toHaveCSS('position','absolute');
 // Zoom around the selected node, then drag again using the actual viewport scale.
 const zoomBox=await container.boundingBox();await page.mouse.move(zoomBox!.x+zoomBox!.width/2,zoomBox!.y+zoomBox!.height/2);await page.mouse.wheel(0,-100);
 await expect.poll(async()=> (await origin(container)).scale).toBeGreaterThan(o.scale+0.2);
 const z=await origin(container),b=await container.boundingBox();
 await page.mouse.move(b!.x+b!.width-15,b!.y+b!.height-15);await page.mouse.down();
 await page.mouse.move(b!.x+b!.width-15+35*z.scale,b!.y+b!.height-15+30*z.scale,{steps:8});await page.mouse.up();
 await expect(page.getByLabel('X position')).toHaveValue('125');await expect(page.getByLabel('Y position')).toHaveValue('155');
 await page.getByLabel('Border radius',{exact:true}).fill('19');await expect(container).toHaveCSS('border-radius','19px');
 await page.getByLabel('Width',{exact:true}).fill('250');await expect(container).toHaveCSS('width','250px');
 // Pan the zoomed node fully into view before grabbing its external handle.
 await page.getByRole('button',{name:'Hand tool',exact:true}).click();
 const viewport=await page.getByRole('region',{name:'Design canvas'}).boundingBox();
 await page.mouse.move(viewport!.x+300,viewport!.y+250);await page.mouse.down();
 await page.mouse.move(viewport!.x+100,viewport!.y+250,{steps:5});await page.mouse.up();
 await page.getByRole('button',{name:'Select tool',exact:true}).click();
 const handle=await canvas.locator('[data-resize]').boundingBox();
 const hit=await page.evaluate(point=>document.elementFromPoint(point.x,point.y)?.outerHTML,{x:handle!.x+handle!.width/2,y:handle!.y+handle!.height/2});
 expect(hit).toContain('data-resize=');
 await page.mouse.move(handle!.x+handle!.width/2,handle!.y+handle!.height/2);await page.mouse.down();
 await page.mouse.move(handle!.x+handle!.width/2+40*z.scale,handle!.y+handle!.height/2+25*z.scale,{steps:6});await page.mouse.up();
 await expect(container).toHaveCSS('width','290px');await expect(container).toHaveCSS('height','145px');
 const doc=await save(page),saved=doc.nodes.find((node:CanvasNode)=>node.id==='row');
 expect(saved.positionMode).toBe('absolute');expect(saved.parentId).toBe('parent');expect(saved.radius).toBe(19);expect(saved.layout.direction).toBe('column');
 await page.reload();await expect(container).toHaveCSS('position','absolute');await expect(container).toHaveCSS('border-radius','19px');await expect(container.locator('[data-node-id="guest"]')).toHaveCount(1);
});
