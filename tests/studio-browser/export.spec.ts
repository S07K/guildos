import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { blankCanvas } from '../../src/lib/studio/canvas';
import { createCanvasNode } from '../../src/lib/studio/canvas-position';

test('export inspector, scoped code downloads, live preview and zoom-independent Retina PNG', async ({page,request,context})=>{
  await page.setViewportSize({width:1440,height:1000});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  expect((await request.get('/api/studio/image-proxy?url=https://images.unsplash.com/photo-123')).status()).toBe(401);
  await page.goto('/signin');
  await page.getByLabel('Email address').fill('studio-test@example.com');
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await page.getByLabel('Email code').fill('123456');
  await page.getByRole('button',{name:'Enter your studio'}).click();
  await page.getByRole('link',{name:'New project',exact:true}).click();
  await page.getByLabel('Project name').fill('Extraction browser test');
  await page.getByLabel('Your creative brief').fill('Test selected-layer and full-screen exports.');
  await page.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
  const projectId=new URL(page.url()).pathname.split('/').at(-1)!;
  const photo={id:'test-photo',imageUrl:'https://images.unsplash.com/photo-123-abc?ixid=test',alt:'Export photo',photographer:'Test Photographer',profileUrl:'https://unsplash.com/@test',photoUrl:'https://unsplash.com/photos/test-photo'};
  const png=await sharp({create:{width:80,height:40,channels:4,background:'#ff0000'}}).png().toBuffer();
  await page.route('https://images.unsplash.com/**',route=>route.fulfill({contentType:'image/png',body:png,headers:{'access-control-allow-origin':'*'}}));
  let proxied=0;
  await page.route('**/api/studio/image-proxy?**',route=>{proxied++;return route.fulfill({contentType:'image/png',body:png});});
  const document={...blankCanvas(),nodes:[
    createCanvasNode('frame','screen',{name:'Export screen',positionMode:'absolute',x:120,y:80,width:375,height:812,fill:'#ffffff',strokeWidth:0}),
    createCanvasNode('rectangle','box',{name:'Blue tile',parentId:'screen',positionMode:'absolute',x:32,y:40,width:120,height:64,fill:'#1234ff',strokeWidth:0}),
    createCanvasNode('image','photo',{name:'Photo tile',parentId:'screen',positionMode:'absolute',x:32,y:130,width:80,height:40,imageUrl:photo.imageUrl,imageSource:photo}),
    createCanvasNode('text','text',{name:'Export heading',parentId:'screen',positionMode:'absolute',x:32,y:200,width:250,height:80,text:'Hello export',fontSize:24})
  ]};
  await request.post('http://127.0.0.1:3199/testing/version',{data:{id:randomUUID(),project_id:projectId,document,created_at:new Date().toISOString(),feedback:'Export fixture',model:'test',input_tokens:0,output_tokens:0}});
  await page.reload();
  // Select from the layers panel even when an artboard is offscreen.
  await page.getByText('Blue tile',{exact:true}).first().click();
  const panel=page.getByRole('region',{name:'Export Layer'});
  await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'Inspect / Export Code'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Generated source code')).toContainText('ExportedView');
  await expect(dialog.getByLabel('Generated source code')).not.toContainText('Hello export');
  await dialog.getByRole('button',{name:'Entire Active Screen'}).click();
  await expect(dialog.getByLabel('Generated source code')).toContainText('Hello export');
  await dialog.getByRole('button',{name:'Copy to Clipboard'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('Hello export');
  for(const [target,extension] of [['React','.tsx'],['React Native','.native.tsx'],['SwiftUI','.swift']]) {
    await dialog.getByRole('button',{name:target,exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Download File'})).toBeEnabled();
    const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download File'}).click();
    const download=await downloading;expect(download.suggestedFilename()).toBe(`export-screen${extension}`);
  }
  await dialog.getByLabel('Generated source code').focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('auto-layout-root').locator('[data-node-id=box]')).toHaveCount(1);
  await page.screenshot({path:'test-results/studio/export-inspector.png'});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  for(const scale of [1,2,3]) {
    await panel.getByLabel('Scale').click();await page.getByRole('option',{name:`${scale}x`}).click();
    // The editor uses CSS zoom; additionally exercise a transformed ancestor.
    await page.getByTestId('auto-layout-root').evaluate((el,scale)=>{el.style.transform=`scale(${scale/2})`;el.style.transformOrigin='top left';},scale);
    const downloading=page.waitForEvent('download');await panel.getByRole('button',{name:'Export PNG'}).click();
    const download=await downloading;expect(download.suggestedFilename()).toBe(`blue-tile@${scale}x.png`);
    const image=sharp((await download.path())!);const metadata=await image.metadata();
    expect(metadata.width).toBe(120*scale);expect(metadata.height).toBe(64*scale);
    const {data}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect([...data.subarray(0,4)]).toEqual([18,52,255,255]);
  }
  await panel.getByLabel('Live thumbnail preview').check();
  await expect(panel.getByRole('img',{name:'Export preview of Blue tile'})).toBeVisible();
  await page.getByText('Photo tile',{exact:true}).first().click();
  const downloading=page.waitForEvent('download');await panel.getByRole('button',{name:'Export PNG'}).click();
  const download=await downloading;const {data}=await sharp((await download.path())!).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect([...data.subarray(0,4)]).toEqual([255,0,0,255]);expect(proxied).toBeGreaterThan(0);
  await expect(panel.getByRole('img',{name:'Export preview of Photo tile'})).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/studio/export-properties.png'});
  await page.locator('.canvas-scroll').click({position:{x:50,y:50}});
  await expect(panel).toContainText('Export screen · Active screen');
  await panel.getByRole('button',{name:'Inspect / Export Code'}).click();
  await expect(dialog.getByLabel('Generated source code')).toContainText('Hello export');
  await expect(dialog.getByRole('button',{name:'Selected Layer Only'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  // Proxy URL validation occurs before any upstream fetch.
  const invalid=await page.request.get('/api/studio/image-proxy?url=http://127.0.0.1/private');expect(invalid.status()).toBe(400);
});
