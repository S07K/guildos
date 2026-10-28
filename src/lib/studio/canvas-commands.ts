import { componentToCanvas, canvasToComponent } from './design-system.ts';
import { normalizeFlowFields } from './canvas-layout.ts';
import { validateCanvas, type CanvasDocument, type CanvasNode } from './canvas.ts';

export type CanvasCommand =
 | { type: 'create'; node: CanvasNode }
 | { type: 'update'; id: string; patch: Partial<Omit<CanvasNode, 'id' | 'type' | 'parentId'>> & { parentId?: string | null } }
 | { type: 'delete'; id: string }
 | { type: 'reorder'; ids: string[] }
 | { type: 'document'; patch: Partial<Pick<CanvasDocument, 'width' | 'height' | 'background'>> };
const nodeKeys = ['variant','positionMode','screen','imageUrl','imageSource','designSystem','contentPadding','textColor','backgroundColor','name','x','y','width','height','fill','stroke','strokeWidth','radius','opacity','text','fontSize','fontWeight','textAlign','verticalAlign','lineHeight','letterSpacing','assetId','imageFit','iconName','points','hidden','parentId','flow','layout','sizing','layoutMode','primaryAxisSizingMode','counterAxisSizingMode','itemSpacing','properties','direction','gap','padding','alignItems','justifyContent'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string, unknown>, allowed: string[]) {
 if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown canvas command field.');
}
/** Atomic, deterministic reducer shared by HTTP tools and the future MCP adapter. */
export function applyCanvasCommands(document: CanvasDocument, commands: unknown): CanvasDocument {
 validateCanvas(document);
 if (!Array.isArray(commands) || commands.length < 1 || commands.length > 400) throw new Error('Send between 1 and 400 canvas commands.');
 const next = structuredClone(document);
 for (const command of commands) {
  if (!object(command)) throw new Error('Invalid canvas command.');
  switch (command.type) {
   case 'create': {
    keys(command, ['type','node']);
    if (!object(command.node)) throw new Error('Invalid canvas layer.');
    keys(command.node, ['id','type',...nodeKeys]);
    const nodeId = command.node.id;
    if(typeof nodeId==='string'&&next.deletedIds?.includes(nodeId))throw new Error('This layer was manually deleted and cannot be restored by a generation command.');
    if (next.nodes.some(node => node.id === nodeId)) throw new Error('Layer already exists.');
    const component='properties' in command.node||'layoutMode' in command.node||'primaryAxisSizingMode' in command.node||!('width' in command.node)&&!('x' in command.node);
    next.nodes.push(component?componentToCanvas(command.node):normalizeFlowFields(structuredClone(command.node)) as CanvasNode);
    break;
   }
   case 'update': {
    keys(command, ['type','id','patch']);
    const node = next.nodes.find(node => node.id === command.id);
    if (!node) throw new Error('Layer not found.');
    if (!object(command.patch) || !Object.keys(command.patch).length) throw new Error('Invalid layer patch.');
    keys(command.patch, nodeKeys);
    const component='properties' in command.patch||'layoutMode' in command.patch||'primaryAxisSizingMode' in command.patch||'counterAxisSizingMode' in command.patch||'itemSpacing' in command.patch;
    if(component){
     const previous=canvasToComponent(node);
     const updated=componentToCanvas({...previous,...command.patch,properties:{...previous.properties,...(command.patch.properties as object||{})}});
     if(node.positionMode==='absolute'&&!('positionMode' in command.patch))Object.assign(updated,{positionMode:'absolute',x:node.x,y:node.y,width:node.width,height:node.height});
     if(updated.imageUrl===node.imageUrl&&node.imageSource)updated.imageSource=node.imageSource;
     if(!updated.screen)delete node.screen;
     const properties=command.patch.properties as Record<string,unknown>|undefined;
     if(updated.type==='text'||updated.type==='icon'||properties&&'backgroundColor' in properties&&(properties.backgroundColor===null||properties.backgroundColor===''))delete node.backgroundColor;
     if(!updated.imageUrl){delete node.imageUrl;delete node.imageSource;}
     if(!updated.assetId)delete node.assetId;
     if(!updated.iconName)delete node.iconName;
     Object.assign(node,updated);
    } else Object.assign(node, normalizeFlowFields(structuredClone(command.patch),node));
    // null is an explicit detach operation over JSON; undefined cannot be sent.
    if(command.patch.parentId&&node.screen)delete node.screen;
    if('imageUrl' in command.patch&&command.patch.imageUrl===undefined){delete node.imageUrl;delete node.imageSource;}
    if('iconName' in command.patch&&!command.patch.iconName)delete node.iconName;
    if (command.patch.parentId === null) delete node.parentId;
    break;
   }
   case 'delete': {
    keys(command, ['type','id']);
    if (!next.nodes.some(node => node.id === command.id)) throw new Error('Layer not found.');
    next.nodes = next.nodes.filter(node => node.id !== command.id);
    // Removing a frame preserves its content, detached at the same coordinates.
    for (const node of next.nodes) if (node.parentId === command.id) delete node.parentId;
    break;
   }
   case 'reorder': {
    keys(command, ['type','ids']);
    const ids = command.ids;
    if (!Array.isArray(ids) || ids.length !== next.nodes.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !next.nodes.some(node => node.id === id))) throw new Error('Reorder must include every layer exactly once.');
    const byId = new Map(next.nodes.map(node => [node.id, node]));
    next.nodes = ids.map(id => byId.get(id)!);
    break;
   }
   case 'document':
    keys(command, ['type','patch']);
    if (!object(command.patch) || !Object.keys(command.patch).length) throw new Error('Invalid document patch.');
    keys(command.patch, ['width','height','background']);
    Object.assign(next, command.patch);
    break;
   default: throw new Error('Unknown canvas command.');
  }
 }
 for(const node of next.nodes)if(['button','container'].includes(node.type)&&next.nodes.some(child=>child.parentId===node.id&&child.type==='icon'))delete node.iconName;
 // Resolve a FILL/HUG cycle deterministically rather than depending on browser guesses.
 for(let pass=0;pass<32;pass++){
  let changed=false;
  for(const node of next.nodes)if(node.flow&&node.sizing){
   const parent=next.nodes.find(item=>item.id===node.parentId);
   for(const axis of ['width','height'] as const)if(node.sizing[axis]==='fill-container'&&parent?.sizing?.[axis]==='hug-contents'){node.sizing[axis]='hug-contents';changed=true;}
  }
  if(!changed)break;
 }
 next.width=Math.max(next.width,...next.nodes.filter(node=>node.screen&&!node.parentId).map(node=>node.width));
 return validateCanvas(next);
}
