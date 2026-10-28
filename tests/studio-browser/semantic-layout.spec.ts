import {test,expect} from '@playwright/test';
import {blankCanvas} from '../../src/lib/studio/canvas';
import {componentToCanvas} from '../../src/lib/studio/design-system';
import {sanitizeVisualHierarchy} from '../../src/lib/studio/visual-hierarchy';
import {renderAutoLayoutHtml} from '../../src/lib/studio/canvas-layout';

test('semantic menu anatomy and bottom navigation fit the viewport',async({page})=>{
 const node=(id:string,type:string,parentId:string|null,properties:Record<string,unknown>={})=>componentToCanvas({id,type,parentId,properties});
 const doc=sanitizeVisualHierarchy({...blankCanvas(),nodes:[
  node('screen','container',null),node('header','button','screen',{text:'< Restaurants'}),
  node('content','container','screen'),node('dish','container','content',{variant:'menu-item-card',name:'Pizza'}),
  node('title','text','dish',{text:'Margherita pizza'}),node('description','text','dish',{text:'Fresh tomato and basil'}),node('price','text','dish',{text:'$13.00'}),
  node('bottom-nav','container','screen'),node('tab','button','bottom-nav',{text:'Home',variant:'nav-tab'}),
 ]},'screen',undefined,[{id:'fixture',imageUrl:'https://images.unsplash.com/photo-fixture',alt:'Pizza',photographer:'Fixture',profileUrl:'https://unsplash.com/@fixture',photoUrl:'https://unsplash.com/photos/fixture'}]);
 doc.nodes.find(node=>node.id==='screen')!.layout!.padding=16;
 await page.route('**/*',route=>route.abort());
 await page.setContent(renderAutoLayoutHtml(doc));
 const box=async(id:string)=>(await page.locator(`[data-node-id="${id}"]`).boundingBox())!;
 const screen=await box('screen'),footer=await box('bottom-nav');
 expect(Math.abs(screen.y+screen.height-footer.y-footer.height)).toBeLessThanOrEqual(1);
 const thumbnail=doc.nodes.find(node=>node.variant==='menu-thumbnail')!;
 const image=await box(thumbnail.id);expect(image.width).toBe(80);expect(image.height).toBe(80);
 const title=await box('title');expect(title.x+title.width).toBeLessThanOrEqual(image.x);
 const icon=doc.nodes.find(node=>node.parentId==='tab'&&node.type==='icon')!;
 const label=doc.nodes.find(node=>node.parentId==='tab'&&node.type==='text')!;
 const glyph=await box(icon.id),text=await box(label.id);expect(text.y-glyph.y-glyph.height).toBe(4);
 const back=page.locator('[data-node-id="header"]');await expect(back).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 expect((await box('header')).width).toBeLessThan(screen.width);
});
