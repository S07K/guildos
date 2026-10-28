import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { compileNodeToCode } from '../src/lib/exporters/codeCompiler.ts';
import { createCanvasNode } from '../src/lib/studio/canvas-position.ts';
const node=(id,type,extra={})=>createCanvasNode(type,id,extra);
const fixture=[node('screen','frame',{layout:{direction:'column',gap:16,padding:24,alignItems:'start',justifyContent:'start'},width:375,height:812}),node('row','container',{parentId:'screen',layout:{direction:'row',gap:8,padding:0,alignItems:'center',justifyContent:'start'}}),node('search','icon',{parentId:'row',iconName:'Search'}),node('label','text',{parentId:'row',text:'A "quote" <script>{hello}</script>\n\\(danger)',fontSize:24}),node('cta','button',{parentId:'screen',iconName:'MapPin',text:'Go',positionMode:'absolute',x:16,y:40}),node('photo','image',{parentId:'screen',imageUrl:'https://images.unsplash.com/photo-123?x=1&y=2'}),node('hidden','text',{parentId:'screen',text:'secret',hidden:true}),node('unrelated','icon',{iconName:'Heart'})];
for(const target of ['react','react-native','swiftui'])test(`${target}: deterministic subtree, layout, literal text and hidden layer exclusion`,()=>{
 const before=JSON.stringify(fixture),code=compileNodeToCode('screen',fixture,target);
 assert.equal(code,compileNodeToCode('screen',fixture,target));assert.equal(JSON.stringify(fixture),before);
 assert.doesNotMatch(code,/secret|IconHeart/);
 assert.match(code,/Search|magnifyingglass/);assert.match(code,/MapPin|mappin.and.ellipse/);
 if(target==='swiftui'){assert.match(code,/VStack/);assert.match(code,/HStack/);assert.match(code,/ZStack/);assert.match(code,/\.offset\(x: CGFloat\(16\), y: CGFloat\(40\)\)/);assert.match(code,/\\\\\(danger\)/);assert.match(code,/private extension Color/);}
 else{const result=ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:'export.tsx'});assert.deepEqual(result.diagnostics,[]);assert.match(code,/\\u003cscript\\u003e/);}
 if(target==='react'){assert.match(code,/flex flex-col/);assert.match(code,/flex flex-row/);assert.match(code,/gap-\[16px\]/);assert.match(code,/left-\[16px\]/);assert.match(code,/<h2/);}
 if(target==='react-native'){assert.match(code,/StyleSheet.create/);assert.match(code,/"position": "absolute"/);assert.match(code,/TouchableOpacity/);assert.match(code,/"flexDirection": "row"/);}
});
test('root is detached from its parent position; legacy children normalize to local coordinates',()=>{
 const legacy=[node('frame','frame',{flow:false,positionMode:undefined,x:100,y:100,width:400,height:400}),node('child','rectangle',{flow:false,positionMode:undefined,x:120,y:130,width:50,height:50})];
 const screen=compileNodeToCode('frame',legacy,'react');assert.match(screen,/left-\[20px\] top-\[30px\]/);assert.doesNotMatch(screen,/left-\[100px\]/);
 const layer=compileNodeToCode('child',legacy,'react');assert.doesNotMatch(layer,/absolute|left-\[/);
});
test('invalid graph fails explicitly and IDs cannot collide in native styles',()=>{
 assert.throws(()=>compileNodeToCode('missing',fixture,'react'),/no longer exists/);
 assert.throws(()=>compileNodeToCode('a',[node('a','container',{parentId:'b'}),node('b','container',{parentId:'a'})],'react'),/cyclic/);
 assert.throws(()=>compileNodeToCode('a',[node('a','text'),node('a','text')],'react'),/Duplicate/);
 const code=compileNodeToCode('a',[node('a','container'),node('b-c','text',{parentId:'a'}),node('b_c','text',{parentId:'a'})],'react-native');assert.match(code,/node_b_c_1/);assert.match(code,/node_b_c_2/);
});
test('uploaded assets require resolution and embedded Swift image uses native decoding',()=>{
 assert.throws(()=>compileNodeToCode('image',[node('image','image',{assetId:'private'})],'react'),/Resolve uploaded/);
 const code=compileNodeToCode('image',[node('image','image',{imageUrl:'data:image/png;base64,YQ=='})],'swiftui');assert.match(code,/EmbeddedExportImage\(base64: "YQ=="\)/);assert.match(code,/UIImage\(data: data\)/);
});
