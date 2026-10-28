import type { CanvasNode } from '../studio/canvas';
import { isUnsplashImageUrl } from '../studio/image-source';

export const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'layer';
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function imageDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:image/')) return source;
  const url = new URL(source, window.location.origin);
  const local = url.origin === window.location.origin;
  if (!local && !isUnsplashImageUrl(url.href)) throw new Error('This image host is not supported for export.');
  const response = await fetch(local ? url.href : `/api/studio/image-proxy?url=${encodeURIComponent(url.href)}`, {credentials:'same-origin',signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Image export failed (${response.status}). Please retry or sign in again.`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size > 12*1024*1024) throw new Error('The image is invalid or exceeds the 12 MB export limit.');
  return new Promise((resolve,reject) => {const reader = new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read image.'));reader.readAsDataURL(blob);});
}

/** Copy computed styles before detaching so inherited styles and flex measurements survive. */
async function exportClone(source: HTMLElement): Promise<HTMLElement> {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source,...source.querySelectorAll<HTMLElement>('*')];
  const copies = [clone,...clone.querySelectorAll<HTMLElement>('*')];
  for (let i=0;i<originals.length;i++) {
    const original = originals[i], copy = copies[i], computed = getComputedStyle(original);
    for (const property of computed) copy.style.setProperty(property, computed.getPropertyValue(property));
    copy.style.animation = 'none'; copy.style.transition = 'none'; copy.style.caretColor = 'transparent';
    copy.removeAttribute('contenteditable');
    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) copy.setAttribute('value',original.value);
  }
  clone.querySelectorAll('[data-export-ignore="true"]').forEach(element=>element.remove());
  const cache = new Map<string,Promise<string>>();
  await Promise.all(Array.from(clone.querySelectorAll('img')).map(async img => {
    const src = img.src;
    if (!cache.has(src)) cache.set(src,imageDataUrl(src));
    img.removeAttribute('srcset'); img.crossOrigin='anonymous'; img.src=await cache.get(src)!;
    await img.decode();
  }));
  Object.assign(clone.style,{transform:'none',left:'0px',top:'0px',margin:'0px',position:'relative',maxWidth:'none',maxHeight:'none',width:getComputedStyle(source).width,height:getComputedStyle(source).height});
  return clone;
}

export async function rasterizeNode(scope: ParentNode, nodeId: string, scale: 1|2|3): Promise<Blob> {
  const element = scope.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
  if (!element) throw new Error('The layer is not rendered. Select a visible layer and retry.');
  await document.fonts.ready;
  const computed = getComputedStyle(element);
  const width = Math.ceil(parseFloat(computed.width)), height = Math.ceil(parseFloat(computed.height));
  if (!width || !height || width*scale > 16384 || height*scale > 16384 || width*height*scale*scale > 32000000) throw new Error('This export is too large. Choose a smaller layer or scale (maximum 32 megapixels).');
  const clone = await exportClone(element);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden','true'); host.dataset.exportIgnore='true';
  Object.assign(host.style,{position:'fixed',left:'-100000px',top:'0px',pointerEvents:'none'});
  host.append(clone); document.body.append(host);
  try {
    const {toBlob} = await import('html-to-image');
    const blob = await toBlob(clone,{width,height,pixelRatio:scale,skipAutoScale:true,filter:node=>!(node instanceof Element && node.getAttribute('data-export-ignore')==='true'),style:{transform:'none',left:'0px',top:'0px',margin:'0px'}});
    if (!blob) throw new Error('The browser could not create this PNG. Try a smaller scale.');
    return blob;
  } finally {host.remove();}
}

/** Embed only uploaded assets: downloaded source never depends on a private studio session. */
export async function resolveCodeAssets(nodes: CanvasNode[], projectId: string): Promise<CanvasNode[]> {
  return Promise.all(nodes.map(async node => node.type === 'image' && node.assetId ? {...node,imageUrl:await imageDataUrl(`/api/studio/assets/${encodeURIComponent(node.assetId)}?projectId=${encodeURIComponent(projectId)}`)} : node));
}
