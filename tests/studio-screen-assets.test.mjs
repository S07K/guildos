import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, renderCanvas, validateCanvas } from '../src/lib/studio/canvas.ts';
import { componentToCanvas, canvasToComponent } from '../src/lib/studio/design-system.ts';
import { validateProposal, proposeCanvasWork, auditPipeline } from '../src/lib/studio/agents/proposal.ts';
import { initialPipeline,rejectOrApprove } from '../src/lib/studio/agents/pipeline.ts';
import { flowNodeStyle } from '../src/lib/studio/canvas-layout.ts';
import { searchUnsplash, trackUnsplashSelection } from '../src/lib/studio/unsplash.ts';
import { isUnsplashImageUrl } from '../src/lib/studio/image-source.ts';
import { screenCompositionIssues } from '../src/lib/studio/canvas-quality.ts';
import { normalizeIconName } from '../src/lib/studio/icon-names.ts';
const photo={id:'photo_id',imageUrl:'https://images.unsplash.com/photo-123-abc?ixid=preserve-me&w=1080',alt:'Fresh lunch bowl',photographer:'Test Photographer',profileUrl:'https://unsplash.com/@test?utm_source=guildos&utm_medium=referral',photoUrl:'https://unsplash.com/photos/photo_id?utm_source=guildos&utm_medium=referral'};
const rawPhoto={id:photo.id,urls:{regular:photo.imageUrl},alt_description:photo.alt,user:{name:photo.photographer,links:{html:'https://unsplash.com/@test'}},links:{html:'https://unsplash.com/photos/photo_id'}};
const node=(id,type='container',parentId=null,properties={})=>({id,type,parentId,layoutMode:properties.iconName&&['button','input'].includes(type)?'HORIZONTAL':'VERTICAL',primaryAxisSizingMode:type==='icon'?'FIXED':'HUG',counterAxisSizingMode:type==='icon'?'FIXED':'FILL',padding:properties.iconName&&['button','input'].includes(type)?16:0,itemSpacing:properties.iconName&&['button','input'].includes(type)?8:0,properties:{...(id==='screen'&&type==='container'&&parentId===null?{screenPreset:'mobile'}:{}),...properties,...(properties.iconName&&['button','input'].includes(type)?{alignItems:'center'}:{})}});
const proposal=upsert_nodes=>({mode:'edit',summary:'Updated the screen.',upsert_nodes,delete_ids:[]});
const complete=[node('screen'),node('title','text','screen',{text:'Fresh lunch'}),node('order','button','screen',{text:'Order lunch',iconName:'shopping-bag'})];
const modelResult=value=>Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('screen roots use full viewport catalogs and floating agent widgets are rejected',()=>{
 const result=validateProposal(proposal(complete),blankCanvas());
 const screen=result.document.nodes[0];assert.equal(screen.width,375);assert.equal(screen.height,812);assert.equal(screen.screen,true);assert.equal(screen.sizing.width,'fixed');assert.equal(screen.sizing.height,'hug-contents');
 assert.equal(flowNodeStyle(screen).minHeight,812);assert.equal(flowNodeStyle(screen).height,812);assert.equal(flowNodeStyle(screen).width,375);
 const desktop=componentToCanvas(node('desktop','container',null,{screenPreset:'desktop'}));assert.equal(desktop.width,1440);assert.equal(canvasToComponent(desktop).properties.screenPreset,'desktop');
 assert.deepEqual(screenCompositionIssues(result.document),[]);
 for(const type of ['text','button','icon'])assert.throws(()=>validateProposal(proposal([node('floating',type,null,{text:type==='icon'?'':'Floating',iconName:type==='icon'?'search':null})]),blankCanvas()),/Screen Frame/);
 assert.throws(()=>validateProposal(proposal([...complete,...Array.from({length:4},(_,i)=>node(`extra-${i}`,'text','screen',{text:'Label'}))]),blankCanvas()),/Too big/);
 const removed=validateProposal({mode:'edit',summary:'Remove the screen.',upsert_nodes:[],delete_ids:['screen']},result.document);assert.equal(removed.document.nodes.length,0);
});
test('final QA refuses incomplete screens until content and primary controls are present',async()=>{
 const document={...blankCanvas(),nodes:[componentToCanvas(node('screen'))]};
 const state={...initialPipeline(document,'Audit',null),stage:4};
 const review=await auditPipeline({key:'test',model:'test',instruction:'Audit',brief:'Cafe',state},async()=>modelResult({summary:'Audit complete',issues:[]}));
 const rejected=rejectOrApprove(state,review.issues);assert.ok(rejected.stage<4);assert.match(rejected.issues.map(issue=>issue.message).join(' '),/readable screen content/);
});
test('Lucide aliases resolve to catalog keys for icons and button slots',()=>{
 for(const [key,expected] of [['search','Search'],['mic','Mic'],['sliders','Sliders'],['shopping-bag','ShoppingBag'],['map-pin','MapPin'],['heart','Heart'],['chevron-right','ChevronRight']])assert.equal(normalizeIconName(key),expected);
 const document=validateProposal(proposal(complete),blankCanvas()).document;
 assert.equal(document.nodes[2].iconName,'ShoppingBag');assert.match(renderCanvas(document,'Icons'),/icons\/ShoppingBag/);
 for(const key of ['', 'made-up-icon'])assert.throws(()=>validateProposal(proposal([node('screen'),node('bad','icon','screen',{iconName:key})]),blankCanvas()),/Lucide|Too small/);
 assert.throws(()=>validateProposal(proposal([node('screen'),node('bad','button','screen',{text:'Go',iconName:'made-up-icon'})]),blankCanvas()),/Lucide/);
});
test('verified CDN imagery preserves attribution and query parameters across editing and export',()=>{
 const data=proposal([...complete,node('photo','image','screen',{imageUrl:photo.imageUrl})]);
 assert.throws(()=>validateProposal(data,blankCanvas()),/search_unsplash/);
 const result=validateProposal(data,blankCanvas(),[photo]);
 const image=result.document.nodes[3];assert.equal(image.imageSource.photographer,photo.photographer);assert.equal(image.imageUrl,photo.imageUrl);
 assert.equal(canvasToComponent(image).properties.imageUrl,photo.imageUrl);
 const html=renderCanvas(result.document,'Lunch');assert.match(html,/<meta name="guildos:image-attribution" content="Photo by Test Photographer"/);assert.ok(html.includes(`data-photographer-profile="${photo.profileUrl.replaceAll("&", "&amp;")}"`));assert.doesNotMatch(html,/>Photo by Test Photographer</);assert.match(html,/ixid=preserve-me&amp;w=1080/);assert.match(html,/img-src 'self' https:\/\/images.unsplash.com/);
 assert.equal(validateCanvas(result.document),result.document);
 assert.throws(()=>validateCanvas({...result.document,nodes:result.document.nodes.map(node=>node.id==='photo'?{...node,imageSource:undefined}:node)}),/verified Unsplash/);
 for(const url of ['https://evil.test/photo-123','http://images.unsplash.com/photo-123','https://images.unsplash.com.evil.test/photo-123','https://user@images.unsplash.com/photo-123','https://images.unsplash.com:444/photo-123','data:image/svg+xml,x'])assert.equal(isUnsplashImageUrl(url),false);
});
test('Unsplash service authenticates server requests, filters malformed photos and tracks selection',async t=>{
 const previous=process.env.UNSPLASH_ACCESS_KEY;process.env.UNSPLASH_ACCESS_KEY='test-only-unsplash';t.after(()=>{if(previous===undefined)delete process.env.UNSPLASH_ACCESS_KEY;else process.env.UNSPLASH_ACCESS_KEY=previous;});
 const calls=[];const request=async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Client-ID test-only-unsplash');assert.equal(options.redirect,'error');return Response.json(url.includes('/search/')?{results:[rawPhoto,{...rawPhoto,urls:{regular:'https://evil.test/photo-1'}}]}:{url:'unused'});};
 const results=await searchUnsplash('fresh lunch bowls',request);assert.equal(results.length,1);assert.equal(results[0].imageUrl,photo.imageUrl);assert.match(results[0].profileUrl,/utm_source=guildos/);
 await trackUnsplashSelection(results[0],request);assert.equal(new URL(calls[1]).pathname,'/photos/photo_id/download');
 await assert.rejects(searchUnsplash('x',request),/2 and 100/);
 await assert.rejects(searchUnsplash('fresh lunch',async()=>Response.json({},{status:429})),/rate limited/);
 delete process.env.UNSPLASH_ACCESS_KEY;await assert.rejects(searchUnsplash('fresh lunch',request),/UNSPLASH_ACCESS_KEY/);
});
test('agent connector calls are bounded, feed verified URLs into edits, and include all model usage',async t=>{
 const previous=process.env.UNSPLASH_ACCESS_KEY;process.env.UNSPLASH_ACCESS_KEY='test-only-unsplash';t.after(()=>{if(previous===undefined)delete process.env.UNSPLASH_ACCESS_KEY;else process.env.UNSPLASH_ACCESS_KEY=previous;});
 const calls=[],modelCalls=[];
 const imageRequest=async(url)=>{calls.push(url);return Response.json(url.includes('/search/')?{results:[rawPhoto]}:{});};
 const result=await proposeCanvasWork({key:'test',model:'test',role:'ui_designer',instruction:'Create a complete food screen',brief:'Food ordering',document:blankCanvas(),notes:[],imageRequest},async(_url,options)=>{
  const body=JSON.parse(options.body);modelCalls.push(body);
  if(body.text.format.name==='image_connector_calls'){assert.equal(body.max_output_tokens,300);return modelResult({queries:['fresh lunch bowl overhead']});}
  assert.equal(JSON.parse(body.input).image_connector.photos[0].imageUrl,photo.imageUrl);
  return modelResult(proposal([...complete,node('photo','image','screen',{imageUrl:photo.imageUrl})]));
 });
 assert.equal(modelCalls.length,2);assert.equal(calls.length,2);assert.match(calls[0],/search\/photos/);assert.match(calls[1],/download$/);
 assert.equal(result.input_tokens,20);assert.equal(result.output_tokens,40);assert.equal(result.document.nodes[3].imageSource.id,photo.id);
 const unchanged=await proposeCanvasWork({key:'test',model:'test',role:'copywriter',instruction:'Keep photo',brief:'Food',document:result.document,notes:[],imageRequest},async()=>modelResult(proposal([node('photo','image','screen',{imageUrl:photo.imageUrl})])));
 assert.equal(calls.length,2);assert.equal(unchanged.document.nodes[3].imageSource.id,photo.id);
});
