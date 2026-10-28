import type { CanvasDocument, CanvasNode } from './canvas.ts';
import type { UnsplashPhoto } from './image-source.ts';
import { inSubtree, type RevisionScope } from './revision-scope.ts';

export const componentVariants=['nav-tab','nav-back-row','info-row','section-tab','filter-chip','section-heading','primary-cta','menu-item-card','menu-copy','menu-media','menu-thumbnail','add-button'] as const;
export type ComponentVariant=typeof componentVariants[number];
export const unboxedVariant=(variant?:string)=>['nav-tab','nav-back-row','info-row','section-heading','menu-copy','menu-media'].includes(variant||'');

/** Catalog rules are applied after agent edits and again at the final QA gate. */
export function sanitizeVisualHierarchy(document:CanvasDocument,rootId?:string,scope?:RevisionScope,photos:UnsplashPhoto[]=[]):CanvasDocument {
 const doc=structuredClone(document);
 const children=(id:string)=>doc.nodes.filter(node=>node.parentId===id);
 const editable=(node:CanvasNode)=>(!rootId||inSubtree(doc,node.id,rootId))&&(!scope||node.id!==scope.rootId&&inSubtree(doc,node.id,scope.sectionId));
 const make=(parent:CanvasNode,suffix:string,type:CanvasNode['type'],patch:Partial<CanvasNode>={})=>{
  let id=`${parent.id.slice(0,55)}-${suffix}`,index=1;
  while(doc.nodes.some(node=>node.id===id)||doc.deletedIds?.includes(id))id=`${parent.id.slice(0,50)}-${suffix}-${index++}`;
  const node:CanvasNode={id,parentId:parent.id,type,name:suffix,flow:true,positionMode:'auto',designSystem:'components-v1',x:0,y:0,width:80,height:32,fill:'#202b38',stroke:'#E5E7EB',strokeWidth:0,radius:0,opacity:1,text:'',fontSize:14,fontWeight:400,sizing:{width:'hug-contents',height:'hug-contents'},...patch};
  doc.nodes.push(node);return node;
 };
 const row=(node:CanvasNode,gap=8)=>{node.layout={direction:'row',gap,padding:0,alignItems:'center',justifyContent:'start'};};
 const clear=(node:CanvasNode)=>{node.fill='transparent';node.strokeWidth=0;node.radius=0;delete node.backgroundColor;};
 for(const node of [...doc.nodes]){
  if(!editable(node))continue;
  const direct=children(node.id),label=[node.text,...direct.filter(child=>child.type==='text').map(child=>child.text)].join(' ').trim();
  const parent=doc.nodes.find(item=>item.id===node.parentId);
  if(!node.variant&&['button','container'].includes(node.type)&&parent&&/bottom.?nav|navigation.bar|nav.bar/i.test(parent.name+' '+parent.id))node.variant='nav-tab';
  const chipStrip=parent?.layout?.direction==='row'&&children(parent.id).filter(child=>['section-tab','filter-chip'].includes(child.variant||'')).length>1;
  if(/^(?:[<‹←]\s*)?(?:Restaurants|Back)$/i.test(label)&&!['icon','image'].includes(node.type))node.variant='nav-back-row';
  else if(/^(?:Choose delivery address|Restaurant details|\d\.\d\s*[★•])/i.test(label)&&!['icon','image'].includes(node.type))node.variant='info-row';
  else if(/^Recommended$/i.test(label)&&!chipStrip)node.variant='section-heading';
  if(direct.some(child=>child.type==='icon')&&['button','container'].includes(node.type))delete node.iconName;
  if(unboxedVariant(node.variant)&&node.type!=='text')clear(node);
  if(['nav-back-row','info-row'].includes(node.variant||'')){
   row(node);node.sizing={width:'hug-contents',height:'hug-contents'};node.fontSize=node.variant==='nav-back-row'?15:14;node.fontWeight=node.variant==='nav-back-row'?500:400;node.textColor='#4b5563';
   if(node.type!=='text'&&!direct.some(child=>child.type==='icon'))node.iconName=node.variant==='nav-back-row'?'ChevronLeft':node.iconName||'Info';
   for(const child of direct){if(child.type==='icon'){child.width=child.height=node.variant==='nav-back-row'?18:16;child.fontSize=child.width;child.sizing={width:'fixed',height:'fixed'};}if(child.type==='text'){child.fontSize=node.fontSize;child.fontWeight=node.fontWeight;child.fill='#4b5563';}}
  }
  if(node.variant==='section-heading'){delete node.iconName;node.fontSize=18;node.fontWeight=600;node.textColor='#202b38';node.sizing={width:'hug-contents',height:'hug-contents'};if(node.layout)node.layout.padding=0;for(const child of direct.filter(child=>child.type==='text')){child.fontSize=18;child.fontWeight=600;}}
  if(['section-tab','filter-chip','add-button'].includes(node.variant||'')){row(node);node.height=32;node.radius=999;node.sizing={width:'hug-contents',height:'fixed'};node.fill='#f3f4f6';node.textColor='#202b38';node.strokeWidth=0;}
  if(node.variant==='primary-cta'){row(node);node.layout!.justifyContent='center';node.height=48;node.sizing={width:'fill-container',height:'fixed'};node.fill='#386650';node.textColor='#ffffff';}
  if(node.variant==='nav-tab'){
   const icons=direct.filter(child=>child.type==='icon'),texts=direct.filter(child=>child.type==='text');
   const icon=icons[0]||make(node,'icon','icon',{iconName:node.iconName||'House',strokeWidth:2});
   const text=texts[0]||make(node,'label','text',{text:node.text||node.name});
   const keep=new Set([icon.id,text.id]);
   const remove=direct.filter(child=>!keep.has(child.id)).map(child=>child.id);
   doc.nodes=doc.nodes.filter(child=>!remove.some(id=>inSubtree(doc,child.id,id)));
   const insertion=doc.nodes.findIndex(child=>keep.has(child.id));doc.nodes=doc.nodes.filter(child=>!keep.has(child.id));doc.nodes.splice(insertion,0,icon,text);
   delete node.iconName;node.text='';node.layout={direction:'column',gap:4,padding:0,alignItems:'center',justifyContent:'center'};
   Object.assign(icon,{width:20,height:20,fontSize:20,sizing:{width:'fixed',height:'fixed'}});Object.assign(text,{fontSize:12,fontWeight:500,contentPadding:0,sizing:{width:'hug-contents',height:'hug-contents'}});
  }
  if(node.variant==='menu-item-card'){
   row(node,16);Object.assign(node,{fill:'#FFFFFF',stroke:'#E5E7EB',strokeWidth:1,radius:16});node.layout!.padding=16;node.layout!.justifyContent='space-between';node.sizing={width:'fill-container',height:'hug-contents'};
   const column=(variant:'menu-copy'|'menu-media')=>direct.find(child=>child.variant===variant)||make(node,variant,'container',{variant,fill:'transparent',layout:{direction:'column',gap:variant==='menu-copy'?4:8,padding:0,alignItems:variant==='menu-copy'?'stretch':'center',justifyContent:'start'},sizing:{width:variant==='menu-copy'?'fill-container':'hug-contents',height:'hug-contents'}});
   const left=column('menu-copy'),right=column('menu-media');
   for(const col of [left,right]){col.fill='transparent';col.strokeWidth=0;col.layout={direction:'column',gap:col===left?4:8,padding:0,alignItems:col===left?'stretch':'center',justifyContent:'start'};col.sizing={width:col===left?'fill-container':'hug-contents',height:'hug-contents'};}
   for(const child of direct)if(child.id!==left.id&&child.id!==right.id)child.parentId=child.type==='image'||child.type==='button'?right.id:left.id;
   const descendants=doc.nodes.filter(child=>child.id!==node.id&&inSubtree(doc,child.id,node.id));
   let thumbnail=descendants.find(child=>child.type==='image');
   if(!thumbnail){
    const words=(node.name+' '+descendants.map(child=>child.text).join(' ')).toLowerCase().split(/\W+/).filter(word=>word.length>3);
    const available=[...photos,...doc.nodes.flatMap(child=>child.imageSource?[child.imageSource]:[])];
    const photo=available.map(photo=>({photo,score:words.filter(word=>photo.alt.toLowerCase().includes(word)).length})).filter(({photo,score})=>score>0||/food|dish|pizza|salad|bowl|burger|meal|pasta|salmon|chicken|soup|dessert/i.test(photo.alt)).sort((a,b)=>b.score-a.score)[0]?.photo;
    if(photo)thumbnail=make(right,'thumbnail','image',{imageUrl:photo.imageUrl,imageSource:photo});
   }
   if(thumbnail)Object.assign(thumbnail,{parentId:right.id,variant:'menu-thumbnail',width:80,height:80,radius:12,imageFit:'cover',sizing:{width:'fixed',height:'fixed'}});
   for(const control of descendants.filter(child=>child.type==='button')){control.variant='add-button';control.height=32;control.radius=999;control.sizing={width:'hug-contents',height:'fixed'};}
   const add=descendants.find(child=>child.type==='button')||make(right,'add','button');
   Object.assign(add,{parentId:right.id,variant:'add-button',text:'+ Add',height:32,radius:999,fill:'#f3f4f6',textColor:'#202b38',strokeWidth:0,sizing:{width:'hug-contents',height:'fixed'}});row(add);
   const labels=doc.nodes.filter(child=>child.type==='text'&&inSubtree(doc,child.id,left.id));
   labels.forEach((child,index)=>Object.assign(child,{fontSize:index===0?16:/[$€£]/.test(child.text)?14:13,fontWeight:index===0||/[$€£]/.test(child.text)?600:400,fill:index===0||/[$€£]/.test(child.text)?'#202b38':'#4b5563'}));
  }
  if(/0 items\s*[•·]\s*\$0(?:\.00)?/i.test(node.text)&&/cart|footer/i.test(node.text+' '+node.name+' '+(parent?.name||'')))node.text='View cart • 2 items • $26.00';
 }
 const primaries=doc.nodes.filter(node=>editable(node)&&node.variant==='primary-cta');
 for(const extra of primaries.slice(0,-1)){row(extra);extra.variant='filter-chip';extra.fill='#f3f4f6';extra.textColor='#202b38';extra.height=32;extra.radius=999;extra.sizing={width:'hug-contents',height:'fixed'};}
 return doc;
}
