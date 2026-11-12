import { unboxedVariant } from './visual-hierarchy.ts';
import { normalizeUiIconName, semanticIconIssue } from './ui-icons.ts';
import { containingFrame, type CanvasDocument, type CanvasNode } from './canvas.ts';

export type CanvasIssue = { key:string; message:string; severity?:'warning' };

function textBounds(node:CanvasNode) {
 const size=node.fontSize;
 const lineHeight=node.lineHeight??1.2;
 const charsPerLine=Math.max(1,Math.floor(node.width/(size*0.55)));
 const lines=node.text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/charsPerLine)),0);
 const occupiedHeight=Math.min(node.height,lines*size*lineHeight);
 const y=node.y+(node.verticalAlign==='bottom'?node.height-occupiedHeight:node.verticalAlign==='middle'?(node.height-occupiedHeight)/2:0);
 return {x:node.x,y,width:node.width,height:occupiedHeight,neededHeight:lines*size*lineHeight};
}

function scope(node:CanvasNode,document:CanvasDocument) {
 return node.parentId||containingFrame(node,document.nodes)?.id||null;
}

function overlaps(a:CanvasNode,b:CanvasNode) {
 const aa=textBounds(a),bb=textBounds(b);
 const overlapX=Math.min(aa.x+aa.width,bb.x+bb.width)-Math.max(aa.x,bb.x);
 const overlapY=Math.min(aa.y+aa.height,bb.y+bb.height)-Math.max(aa.y,bb.y);
 return overlapX>Math.min(aa.width,bb.width)*.25&&overlapY>Math.min(aa.height,bb.height)*.35;
}

/** Conservative geometry checks. Issues are compared before and after agent edits. */
export function canvasQualityIssues(document:CanvasDocument):CanvasIssue[] {
 const texts=document.nodes.filter(node=>node.type==='text'&&!node.flow&&!node.hidden&&node.text.trim());
 const result:CanvasIssue[]=componentQualityIssues(document);
 for(const node of texts) {
  const bounds=textBounds(node);
  if(bounds.neededHeight>node.height+Math.max(8,node.fontSize*.4)) result.push({key:`overflow:${node.id}`,message:`“${node.name}” needs a taller text box.`});
 }
 for(let i=0;i<texts.length;i++) for(let j=i+1;j<texts.length;j++) {
  const a=texts[i],b=texts[j];
  if(scope(a,document)===scope(b,document)&&overlaps(a,b)) {
   const ids=[a.id,b.id].sort();
   result.push({key:`overlap:${ids.join(':')}`,message:`Text layers “${a.name}” and “${b.name}” overlap.`});
  }
 }
 return result;
}


const luminance=(hex:string)=>{
 const channels=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4);
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
};
export function contrastRatio(foreground:string,background:string) {
 const a=luminance(foreground),b=luminance(background);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
/** Checks actual resolved colors and axis relationships, independent of model claims. */
export function componentQualityIssues(document:CanvasDocument):CanvasIssue[] {
 const issues:CanvasIssue[]=[];
 const byId=new Map(document.nodes.map(node=>[node.id,node]));
 for(const node of document.nodes.filter(node=>node.flow&&node.positionMode!=='absolute'&&!node.hidden)) {
  const ancestors:CanvasNode[]=[];let parent=byId.get(node.parentId||'');
  while(parent&&!ancestors.includes(parent)&&ancestors.length<32){ancestors.push(parent);parent=byId.get(parent.parentId||'');}
  if(ancestors.some(item=>item.hidden))continue;
  if(!node.variant&&(node.radius%8||(node.contentPadding??0)%8||node.layout&&(node.layout.gap%8||node.layout.padding%8)))issues.push({key:`grid:${node.id}`,message:`“${node.name}” must use multiples of 8 for spacing and radius.`});
  for(const axis of ['width','height'] as const)if(node.sizing?.[axis]==='fill-container'&&ancestors[0]?.sizing?.[axis]==='hug-contents')issues.push({key:`axis:${node.id}:${axis}`,message:`“${node.name}” cannot FILL ${axis} inside a parent that HUGs ${axis}; use HUG or size the parent.`});
  if(node.type==='text'&&node.sizing?.height!=='hug-contents')issues.push({key:`text-sizing:${node.id}`,message:`“${node.name}” text height must HUG content.`});
  if(node.iconName&&!normalizeUiIconName(node.iconName))issues.push({key:`icon-dictionary:${node.id}`,message:`“${node.name}” must use a semantic Lucide UI dictionary key.`});
  // Label keywords are hints, not a reliable contract for an icon's intent.
  // Keep them visible for review without rejecting otherwise valid edits.
  if(node.iconName){const labels=node.type==='icon'?document.nodes.filter(sibling=>sibling.parentId===node.parentId&&sibling.type==='text'&&!sibling.hidden).map(sibling=>sibling.text).join(' '):'';const problem=semanticIconIssue(normalizeUiIconName(node.iconName)||node.iconName,`${node.name} ${node.text} ${labels}`.replace(/[-_]/g,' '));if(problem)issues.push({key:`icon-meaning:${node.id}`,severity:'warning',message:`“${node.name}” (${node.id}, ${node.iconName}): ${problem}`});}
  if(node.type==='icon'){
   const row=ancestors[0];
   if(!['nav-tab','nav-back-row'].includes(row?.variant||'')&&(!row?.layout||row.layout.direction!=='row'||row.layout.alignItems!=='center'||row.layout.gap!==8))issues.push({key:`icon-row:${node.id}`,message:`“${node.name}” needs a HORIZONTAL center-aligned icon/text row with itemSpacing 8.`});
   if(![16,20,...(row?.variant==='nav-back-row'?[18]:[])].includes(node.width)||node.width!==node.height||node.sizing?.width!=='fixed'||node.sizing?.height!=='fixed')issues.push({key:`icon-size:${node.id}`,message:`“${node.name}” needs a fixed 16x16 or 20x20 inline-flex icon wrapper.`});
   if(node.text.trim())issues.push({key:`icon-text:${node.id}`,message:`“${node.name}” must use iconName, never raw text or slash symbols.`});
   const label=document.nodes.find(sibling=>sibling.parentId===node.parentId&&sibling.type==='text'&&!sibling.hidden);
   if(label){
    if(label.contentPadding)issues.push({key:`icon-label-padding:${node.id}`,message:`“${label.name}” needs padding 0 so the icon/text gap stays exactly 8px.`});
    if(!['nav-tab','nav-back-row'].includes(row?.variant||'')&&node.width!==(label.fontSize>16?20:16))issues.push({key:`icon-typography:${node.id}`,message:`“${node.name}” icon size must match adjacent label typography (16px or 20px).`});
   }

  }
  if(!node.variant&&node.iconName&&['button','input'].includes(node.type)&&(!node.layout||node.layout.direction!=='row'||node.layout.alignItems!=='center'||node.layout.gap!==8))issues.push({key:`icon-control:${node.id}`,message:`“${node.name}” needs HORIZONTAL layout, center alignment and itemSpacing 8.`});
  if(!['text','button','input'].includes(node.type)||!node.text.trim())continue;
  const foreground=node.type==='text'?node.fill:node.textColor||'#202b38';
  const surface=(item:CanvasNode)=>item.type==='text'?item.backgroundColor:!['image','icon','line','path'].includes(item.type)?item.fill:undefined;
  let background=node.type==='text'||unboxedVariant(node.variant)||node.fill==='transparent'?node.backgroundColor:node.fill;
  if(!background)background=ancestors.map(surface).find(value=>value&&value!=='transparent')||document.background;
  const ratio=contrastRatio(foreground,background);
  const required=node.fontSize>=24||node.fontSize>=18.66&&node.fontWeight>=700?3:4.5;
  if(ratio<required)issues.push({key:`contrast:${node.id}`,message:`“${node.name}” contrast is ${ratio.toFixed(2)}:1; needs ${required}:1.`});
 }
 return issues;
}

/** Correct common, harmless sizing drift before the draft reaches QA. */
export function sanitizeCanvasLayout(document:CanvasDocument,scopeRootId?:string):CanvasDocument {
 const nodes=document.nodes.map(node=>({...node, ...(node.layout?{layout:{...node.layout}}:{ }), ...(node.sizing?{sizing:{...node.sizing}}:{})}));
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const rootId=(id:string)=>{let node=byId.get(id);const seen=new Set<string>();while(node?.parentId){if(seen.has(node.id))return undefined;seen.add(node.id);node=byId.get(node.parentId);}return node?.id;};
 for(const node of nodes){
  if(scopeRootId&&rootId(node.id)!==scopeRootId)continue;
  if(!node.flow||!node.sizing||node.positionMode==='absolute')continue;
  if(node.type==='text')node.sizing.height='hug-contents';
  const parent=byId.get(node.parentId||'');
  for(const axis of ['width','height'] as const)if(node.sizing[axis]==='fill-container'&&parent?.sizing?.[axis]==='hug-contents')node.sizing[axis]='hug-contents';
  if(node.layout&&!node.variant){node.layout.padding=Math.min(496,Math.round(node.layout.padding/8)*8);node.layout.gap=Math.min(496,Math.round(node.layout.gap/8)*8);}
  if(!node.variant)node.radius=Math.min(1000,Math.round(node.radius/8)*8);
  if(node.contentPadding!==undefined)node.contentPadding=Math.min(496,Math.round(node.contentPadding/8)*8);
 }
 const root=nodes.find(node=>node.screen&&!node.parentId&&node.positionMode!=='absolute'&&(!scopeRootId||node.id===scopeRootId));
 if(root){root.width=375;root.height=Math.max(812,root.height);root.sizing={...root.sizing,width:'fixed',height:root.sizing?.height??'hug-contents'};}
 return {...document,nodes};
}


/** Final review gate: incremental empty frames are allowed while specialists are building. */
export function screenCompositionIssues(document:CanvasDocument):CanvasIssue[] {
 const issues:CanvasIssue[]=[];
 for(const card of document.nodes.filter(node=>node.variant==='menu-item-card')){
  const descendants=document.nodes.filter(node=>{let parent=node.parentId;for(let depth=0;parent&&depth<32;depth++){if(parent===card.id)return true;parent=document.nodes.find(item=>item.id===parent)?.parentId;}return false;});
  const labels=descendants.filter(node=>node.type==='text'&&node.text.trim());
  if(labels.length<3||!labels.some(node=>/[$€£₹]|\bUSD\b/.test(node.text)))issues.push({key:`menu-copy:${card.id}`,message:`Menu card ${card.name} requires a dish title, description and price in its left column.`});
  if(!descendants.some(node=>node.type==='image'))issues.push({key:`menu-image:${card.id}`,message:`Menu card ${card.name} requires a verified food thumbnail from search_unsplash in its right column.`});
 }
 const roots=document.nodes.filter(node=>node.flow&&!node.parentId&&!node.hidden);
 if(roots.length!==1)issues.push({key:'single-screen',message:'Review exactly one cohesive mobile screen; multiple screen roots and empty canvases cannot be approved.'});
 for(const root of roots){
  if(!root.screen){issues.push({key:`screen:${root.id}`,message:`“${root.name}” must be a Screen Frame, with its content nested inside.`});continue;}
  if(root.width!==375||root.height<640||root.sizing?.width!=='fixed'||root.layout?.direction!=='column')issues.push({key:`mobile-screen:${root.id}`,message:'The active screen needs one vertical mobile viewport at least 375×640 with flexible height.'});
  const descendants=document.nodes.filter(node=>{
   if(node.hidden)return false;
   let parent=node.parentId;for(let depth=0;parent&&depth<32;depth++){const ancestor=document.nodes.find(item=>item.id===parent);if(ancestor?.hidden)return false;if(parent===root.id)return true;parent=ancestor?.parentId;}return false;
  });
  if(!descendants.some(node=>node.type==='text'&&node.text.trim())||!descendants.some(node=>['button','input'].includes(node.type)&&node.text.trim()))issues.push({key:`screen-content:${root.id}`,message:`“${root.name}” needs readable screen content and a labeled primary action or input; isolated widgets do not complete a screen.`});
 }
 return issues;
}
